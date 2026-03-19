// src/core/animation/CharacterAnimator.ts
// Per-character animation state machine.  Owns blend-driven transitions,
// locomotion speed sync, combo cycling, stance switching, and one-shot playback.

import { Quaternion, Scalar, type AnimationGroup } from "@babylonjs/core";
import {
  ANIM_STATE,
  BLEND_TIMES,
  ATTACK_DURATIONS,
  NON_LOOPING_STATES,
  COMBAT_STATES,
  TRANSFORM_STATES,
  INTERRUPT_STATES,
  STATE_FALLBACKS,
  buildAnimationNameMap,
  type StanceType,
} from "./AnimationData.js";
import {
  normalizeTargetName,
  toTargetPropertyPath,
} from "../utils/animationUtils.js";

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface TransitionOptions {
  loop?: boolean;
  speed?: number;
  blendTime?: number;
  forceRestart?: boolean;
  onComplete?: () => void;
  duration?: number;
  preserveOneShot?: boolean;
}

export interface LocomotionContext {
  speed: number;
  isFlying: boolean;
  isGrounded: boolean;
  verticalSpeed?: number;
  inputX?: number;
  inputZ?: number;
  facingYaw?: number;
}

export interface ModelAsset {
  animGroups: AnimationGroup[];
  skeletons: { bones: { name: string; getTransformNode?: () => unknown }[] }[];
}

export interface AnimatorRuntimeSnapshot {
  currentState: string;
  previousState: string | null;
  requestedState: string;
  currentStance: StanceType;
  blendTimer: number;
  blendDuration: number;
  comboIndex: number;
  lastHitTime: number;
  gameTimeMs: number;
  heavyAttackIndex: number;
  throwAttackIndex: number;
  lastFacingYaw: number | null;
  lastLocomotionState: string;
  lastSpeedBucket: number;
  oneShotTimer: number;
}



function isRootLikeTarget(target: Record<string, unknown> | null | undefined): boolean {
  if (!target) return false;
  const normalizedName = normalizeTargetName(
    String(target.name ?? target.id ?? ""),
  );
  if (
    normalizedName === "root" ||
    normalizedName === "armature" ||
    normalizedName.endsWith("root")
  ) {
    return true;
  }
  return target.parent == null;
}

function isUnsafeTargetTrack(
  target: Record<string, unknown> | null | undefined,
  path: string[],
): boolean {
  if (!path.length) return true;
  const normalizedPath = path.map((part) => String(part).toLowerCase());
  if (
    normalizedPath.includes("visibility") ||
    normalizedPath.includes("isvisible")
  ) {
    return true;
  }
  if (
    isRootLikeTarget(target) &&
    (
      normalizedPath.includes("position") ||
      normalizedPath.includes("scaling") ||
      normalizedPath.includes("rotation") ||
      normalizedPath.includes("rotationquaternion")
    )
  ) {
    return true;
  }
  return false;
}

function prepareAnimationGroupTargets(group: AnimationGroup): void {
  const targetedAnimations = group.targetedAnimations;
  if (!Array.isArray(targetedAnimations) || !targetedAnimations.length) return;

  const validTargets = [];
  for (const targeted of targetedAnimations) {
    const target = targeted.target as Record<string, unknown> | undefined;
    const path = toTargetPropertyPath(targeted.animation.targetPropertyPath);
    if (!target || !path.length) continue;
    if (isUnsafeTargetTrack(target, path)) continue;

    let parent: Record<string, unknown> | null = target;
    let valid = true;
    for (let i = 0; i < path.length - 1; i += 1) {
      parent = (parent[path[i]!] as Record<string, unknown> | null) ?? null;
      if (parent == null) {
        valid = false;
        break;
      }
    }
    if (!valid || parent == null) continue;

    const finalProperty = path[path.length - 1]!;
    if (parent[finalProperty] == null && finalProperty === "rotationQuaternion") {
      parent[finalProperty] = Quaternion.Identity();
    }
    if (parent[finalProperty] === undefined || parent[finalProperty] === null) {
      continue;
    }
    validTargets.push(targeted);
  }

  if (validTargets.length !== targetedAnimations.length) {
    targetedAnimations.splice(0, targetedAnimations.length, ...validTargets);
  }
}

// ─── CharacterAnimator ───────────────────────────────────────────────────────

export class CharacterAnimator {
  readonly characterId: string;

  /** Direct state-id → AnimationGroup */
  groups = new Map<string, AnimationGroup>();
  /** clipName.toLowerCase() → AnimationGroup (for clip-name matching) */
  clipGroups = new Map<string, AnimationGroup>();

  currentState: string = ANIM_STATE.IDLE;
  previousState: string | null = null;
  blendTimer = 0;
  blendDuration = 0;

  oneShotCallback: (() => void) | null = null;
  oneShotTimer = -1;

  comboIndex = 0;
  lastHitTime = 0;
  /** Accumulated game time in ms — used for combo timing instead of performance.now() */
  _gameTimeMs = 0;

  lightAttackPool: string[] = [
    ANIM_STATE.ATTACK_LIGHT_1,
    ANIM_STATE.ATTACK_LIGHT_2,
    ANIM_STATE.ATTACK_LIGHT_3,
  ];
  heavyAttackPool: string[] = [ANIM_STATE.ATTACK_HEAVY];
  heavyAttackIndex = 0;
  throwAttackPool: string[] = [
    ANIM_STATE.ATTACK_THROW_1,
    ANIM_STATE.ATTACK_THROW_2,
    ANIM_STATE.ATTACK_THROW_3,
  ];
  throwAttackIndex = 0;

  currentStance: StanceType = "MELEE";

  private _outgoingGroup: AnimationGroup | null = null;
  private _incomingGroup: AnimationGroup | null = null;
  private _lastFacingYaw: number | null = null;
  private _lastLocomotionState: string = ANIM_STATE.IDLE;
  private _lastSpeedBucket = -1;
  private _requestedState: string = ANIM_STATE.IDLE;
  private _stateGroupCache = new Map<string, AnimationGroup | null>();
  private _allGroups: AnimationGroup[] = [];
  private _animNames: Record<string, string>;
  private _swordAnimNames: Record<string, string>;

  constructor(characterId: string, modelAsset: ModelAsset | null) {
    this.characterId = characterId;
    this._animNames = buildAnimationNameMap(characterId, "MELEE");
    this._swordAnimNames = buildAnimationNameMap(characterId, "SWORD");
    this._buildGroupMap(modelAsset);
  }

  // ─── Group Lookup ───────────────────────────────────────────────────────

  private _lookupGroup(stateId: string): AnimationGroup | null {
    const cached = this._stateGroupCache.get(stateId);
    if (cached !== undefined) return cached;

    let resolved: AnimationGroup | null = null;

    // Check current stance first, then alternate stance (for cross-stance lookups)
    const clipName = this._animNames[stateId] ?? this._swordAnimNames[stateId];
    if (clipName) {
      const clipLower = clipName.toLowerCase();
      resolved = this.clipGroups.get(clipLower) ?? null;
      if (!resolved) {
        const normalizedLower = this._normalizeClipName(clipName).toLowerCase();
        if (normalizedLower && normalizedLower !== clipLower) {
          resolved = this.clipGroups.get(normalizedLower) ?? null;
        }
      }
    }
    if (!resolved) resolved = this.groups.get(stateId) ?? null;

    this._stateGroupCache.set(stateId, resolved);
    return resolved;
  }

  private _invalidateGroupCache(): void {
    this._stateGroupCache.clear();
  }

  private _normalizeClipName(raw: string): string {
    if (!raw) return "";
    const pipeIdx = raw.lastIndexOf("|");
    return (pipeIdx >= 0 ? raw.slice(pipeIdx + 1) : raw).trim();
  }

  // ─── Group Map Build ────────────────────────────────────────────────────

  private _buildGroupMap(modelAsset: ModelAsset | null, preservePlayback = false): void {
    if (!modelAsset?.animGroups) {
      if (this._allGroups.length) {
        const staleGroups = [...this._allGroups];
        this.groups.clear();
        this.clipGroups.clear();
        this._stateGroupCache.clear();
        this._allGroups = [];
        this._incomingGroup = null;
        this._outgoingGroup = null;
        for (const group of staleGroups) {
          try {
            group.stop();
            group.dispose();
          } catch {
            // Ignore stale group disposal errors during hot-swaps.
          }
        }
      }
      console.warn(`[CharacterAnimator] No animation groups in asset for ${this.characterId}`);
      return;
    }

    if (this._allGroups.length) {
      const staleGroups = [...this._allGroups];
      this.groups.clear();
      this.clipGroups.clear();
      this._stateGroupCache.clear();
      this._allGroups = [];
      this._incomingGroup = null;
      this._outgoingGroup = null;
      for (const group of staleGroups) {
        try {
          group.stop();
          group.dispose();
        } catch {
          // Ignore stale group disposal errors during hot-swaps.
        }
      }
    }

    console.log(
      `[CharacterAnimator] Building animation group map for ${this.characterId}:`,
      modelAsset.animGroups.map((g) => g.name),
    );

    // Reverse index: clipNameLower → stateId[]
    const stateClipEntries = [
      ...Object.entries(this._animNames),
      ...Object.entries(this._swordAnimNames),
    ];
    const clipToStates = new Map<string, string[]>();
    for (const [stateId, clipName] of stateClipEntries) {
      if (!clipName) continue;
      const clipLower = clipName.toLowerCase();
      const clipNormalized = this._normalizeClipName(clipName).toLowerCase();
      if (clipLower) {
        if (!clipToStates.has(clipLower)) clipToStates.set(clipLower, []);
        clipToStates.get(clipLower)!.push(stateId);
      }
      if (clipNormalized && clipNormalized !== clipLower) {
        if (!clipToStates.has(clipNormalized)) clipToStates.set(clipNormalized, []);
        clipToStates.get(clipNormalized)!.push(stateId);
      }
    }

    this._allGroups = [];
    for (const group of modelAsset.animGroups) {
      prepareAnimationGroupTargets(group);
      group.stop();
      group.weight = 0;
      this._allGroups.push(group);

      const rawLower = group.name.toLowerCase();
      const normalized = this._normalizeClipName(group.name).toLowerCase();
      if (rawLower) this.clipGroups.set(rawLower, group);
      if (normalized && normalized !== rawLower) this.clipGroups.set(normalized, group);

      const matchedStates = new Set<string>();
      for (const s of clipToStates.get(rawLower) ?? []) matchedStates.add(s);
      for (const s of clipToStates.get(normalized) ?? []) matchedStates.add(s);
      for (const stateId of matchedStates) {
        this.groups.set(stateId, group);
      }
    }

    for (const stateId of Object.keys(this._animNames)) {
      if (this.groups.has(stateId)) continue;

      const stateLower = stateId.toLowerCase();
      if (
        stateLower.includes("attack") ||
        stateLower.includes("sword_slash") ||
        stateLower.includes("sword_heavy") ||
        stateLower.includes("rush_combo")
      ) {
        continue;
      }

      for (const group of modelAsset.animGroups) {
        const groupName = group.name.toLowerCase();
        if (
          (stateLower.includes("idle") && groupName.includes("idle")) ||
          (stateLower.includes("walk") &&
            (groupName.includes("walk") || groupName.includes("walking"))) ||
          (stateLower.includes("run") &&
            (groupName.includes("run") || groupName.includes("running"))) ||
          (stateLower.includes("jump") && groupName.includes("jump")) ||
          (stateLower.includes("hit") &&
            (groupName.includes("hit") || groupName.includes("react"))) ||
          (stateLower.includes("death") && groupName.includes("death")) ||
          (stateLower.includes("victory") && groupName.includes("victory")) ||
          (stateLower.includes("fly") && groupName.includes("fly")) ||
          (stateLower.includes("block") && groupName.includes("block")) ||
          (stateLower.includes("dodge") && groupName.includes("dodge")) ||
          (stateLower.includes("turn") && groupName.includes("turn")) ||
          (stateLower.includes("strafe") && groupName.includes("strafe"))
        ) {
          this.groups.set(stateId, group);
          console.warn(
            `[CharacterAnimator] Fuzzy matched "${group.name}" to ${stateId} for ${this.characterId}`,
          );
          break;
        }
      }
    }

    console.log(
      `[CharacterAnimator] Registered ${this.groups.size} state mappings for ${this.characterId}`,
    );

    const fallbackGroup = modelAsset.animGroups[0] || null;
    if (fallbackGroup && !this.groups.has(ANIM_STATE.IDLE)) {
      const fallbackStates = [
        ANIM_STATE.IDLE, ANIM_STATE.WALK, ANIM_STATE.RUN, ANIM_STATE.SPRINT,
        ANIM_STATE.STRAFE_L, ANIM_STATE.STRAFE_R,
        ANIM_STATE.TURN_L, ANIM_STATE.TURN_R,
        ANIM_STATE.FLY_IDLE, ANIM_STATE.FLY_MOVE, ANIM_STATE.FLY_FAST,
        ANIM_STATE.JUMP, ANIM_STATE.FALL,
      ];
      for (const stateId of fallbackStates) {
        if (!this.groups.has(stateId)) this.groups.set(stateId, fallbackGroup);
      }
    }

    this._invalidateGroupCache();

    if (preservePlayback) {
      return;
    }

    // Start IDLE immediately to prevent T-pose
    const idle = this.groups.get(ANIM_STATE.IDLE);
    if (idle) {
      console.log(`[CharacterAnimator] Starting IDLE for ${this.characterId}`);
      idle.stop();
      idle.weight = 1;
      idle.play(true);
      this._incomingGroup = idle;
    } else {
      console.warn(`[CharacterAnimator] IDLE animation not found for ${this.characterId}`);
      const fallback = modelAsset.animGroups[0];
      if (fallback) {
        fallback.stop();
        fallback.weight = 1;
        fallback.play(true);
        this.groups.set(ANIM_STATE.IDLE, fallback);
        console.warn(
          `[CharacterAnimator] Using fallback animation "${fallback.name}" as IDLE for ${this.characterId}`,
        );
      }
    }
  }

  // ─── Stance ─────────────────────────────────────────────────────────────

  setInitialStance(newStance: StanceType): void {
    this.currentStance = newStance;
    this._animNames = buildAnimationNameMap(this.characterId, newStance);
    this._swordAnimNames = buildAnimationNameMap(this.characterId, "SWORD");
    this._invalidateGroupCache();
    // Only force-restart if the stance-specific clip is actually loaded —
    // avoids falling back to a stale generic entry in this.groups.
    const stanceClipName = this._animNames[this.currentState];
    const stanceClipAvailable = stanceClipName
      ? (this.clipGroups.has(stanceClipName.toLowerCase()) ||
         this.clipGroups.has(this._normalizeClipName(stanceClipName).toLowerCase()))
      : false;
    if (stanceClipAvailable) {
      this.transition(this.currentState, { forceRestart: true });
    }
  }

  setAttackVariants(lightStates?: string[], heavyStates?: string[]): void {
    if (Array.isArray(lightStates) && lightStates.length) {
      this.lightAttackPool = lightStates;
      this.comboIndex = 0;
    }
    if (Array.isArray(heavyStates) && heavyStates.length) {
      this.heavyAttackPool = heavyStates;
      this.heavyAttackIndex = 0;
    }
  }

  // ─── State Transitions ─────────────────────────────────────────────────

  private _getGroup(stateId: string): AnimationGroup | null {
    return this._lookupGroup(stateId);
  }

  private _resolveAvailableState(stateId: string): string | null {
    if (this._lookupGroup(stateId)) return stateId;
    for (const fallbackState of STATE_FALLBACKS[stateId] ?? []) {
      if (this._lookupGroup(fallbackState)) return fallbackState;
    }
    return this._lookupGroup(ANIM_STATE.IDLE) ? ANIM_STATE.IDLE : null;
  }

  captureRuntimeState(): AnimatorRuntimeSnapshot {
    return {
      currentState: this.currentState,
      previousState: this.previousState,
      requestedState: this._requestedState,
      currentStance: this.currentStance,
      blendTimer: this.blendTimer,
      blendDuration: this.blendDuration,
      comboIndex: this.comboIndex,
      lastHitTime: this.lastHitTime,
      gameTimeMs: this._gameTimeMs,
      heavyAttackIndex: this.heavyAttackIndex,
      throwAttackIndex: this.throwAttackIndex,
      lastFacingYaw: this._lastFacingYaw,
      lastLocomotionState: this._lastLocomotionState,
      lastSpeedBucket: this._lastSpeedBucket,
      oneShotTimer: this.oneShotTimer,
    };
  }

  applyRuntimeState(snapshot: AnimatorRuntimeSnapshot): void {
    this.currentState = snapshot.currentState;
    this.previousState = snapshot.previousState;
    this._requestedState = snapshot.requestedState;
    this.currentStance = snapshot.currentStance;
    this.blendTimer = snapshot.blendTimer;
    this.blendDuration = snapshot.blendDuration;
    this.comboIndex = snapshot.comboIndex;
    this.lastHitTime = snapshot.lastHitTime;
    this._gameTimeMs = snapshot.gameTimeMs;
    this.heavyAttackIndex = snapshot.heavyAttackIndex;
    this.throwAttackIndex = snapshot.throwAttackIndex;
    this._lastFacingYaw = snapshot.lastFacingYaw;
    this._lastLocomotionState = snapshot.lastLocomotionState;
    this._lastSpeedBucket = snapshot.lastSpeedBucket;
    this.oneShotTimer = snapshot.oneShotTimer;
  }

  replaceModelAsset(modelAsset: ModelAsset | null): void {
    const runtime = this.captureRuntimeState();
    const preserveOneShot = this.oneShotCallback != null || this.oneShotTimer > 0;

    this._buildGroupMap(modelAsset, true);
    this.applyRuntimeState(runtime);

    const targetState = this._requestedState || this.currentState;
    if (!targetState) return;

    this.transition(targetState, {
      forceRestart: true,
      preserveOneShot,
    });
  }

  cancelPendingOneShot(): void {
    this.oneShotCallback = null;
    this.oneShotTimer = -1;
    this._requestedState = this.currentState;
  }

  transition(newState: string, opts: TransitionOptions = {}): void {
    if (newState === this.currentState && !opts.forceRestart) return;
    this._requestedState = newState;
    const resolvedState = this._resolveAvailableState(newState);
    if (!resolvedState) return;
    if (resolvedState !== newState) {
      console.warn(
        `[CharacterAnimator] Falling back from ${newState} to ${resolvedState} for ${this.characterId}`,
      );
    }
    newState = resolvedState;

    const loop = opts.loop ?? this._isLooping(newState);
    const speed = opts.speed ?? 1.0;
    const blendTime = opts.blendTime ?? (BLEND_TIMES[newState] ?? 0.15);

    this._outgoingGroup = this._incomingGroup;
    this.previousState = this.currentState;
    this.currentState = newState;
    this.blendTimer = 0;
    this.blendDuration = blendTime;
    if (!opts.preserveOneShot) {
      this.oneShotTimer = -1;
    }

    // If an interrupt state (HURT, KNOCKBACK, DEATH) is incoming and there's a pending
    // oneShotCallback, call it now to release any action lock before nulling it.
    // This prevents the character from being permanently locked when interrupted mid-attack.
    if (INTERRUPT_STATES.has(newState) && typeof this.oneShotCallback === "function") {
      const pendingCallback = this.oneShotCallback;
      this.oneShotCallback = null;
      this.oneShotTimer = -1;
      try {
        pendingCallback();
      } catch (e) {
        console.warn(`[CharacterAnimator] Error in interrupted oneShotCallback:`, e);
      }
    }
    if (!opts.preserveOneShot) {
      this.oneShotCallback = null;
    }

    const incoming = this._getGroup(newState);
    this._incomingGroup = incoming;

    if (!incoming) {
      console.warn(
        `[CharacterAnimator] Missing AnimationGroup for ${newState} on ${this.characterId}; falling back to IDLE.`,
      );
      const idle = this._getGroup(ANIM_STATE.IDLE);
      if (idle) {
        idle.speedRatio = 1.0;
        idle.play(true);
        idle.weight = 1;
        this.currentState = ANIM_STATE.IDLE;
        this.previousState = newState;
        this._incomingGroup = idle;
      } else {
        this._incomingGroup = null;
      }
      this._outgoingGroup = null;
      this.blendDuration = 0;
      this.blendTimer = 0;
      if (!loop && typeof opts.onComplete === "function" && !opts.preserveOneShot) {
        this.oneShotTimer = opts.duration ?? ATTACK_DURATIONS[newState] ?? 1.0;
        this.oneShotCallback = opts.onComplete;
      } else if (!loop && typeof opts.onComplete === "function" && this.oneShotCallback == null) {
        this.oneShotTimer = opts.duration ?? ATTACK_DURATIONS[newState] ?? 1.0;
        this.oneShotCallback = opts.onComplete;
      }
      return;
    }

    // Non-looping one-shots must always play from frame 0; stop() resets position.
    if (!loop || opts.forceRestart) incoming.stop();
    incoming.speedRatio = speed;
    incoming.play(loop);
    const outgoing = this._outgoingGroup;
    if (!outgoing || outgoing === incoming || blendTime <= 0) {
      if (outgoing && outgoing !== incoming) {
        outgoing.stop();
        outgoing.weight = 0;
      }
      incoming.weight = 1;
      this._outgoingGroup = null;
      this.blendDuration = 0;
    } else {
      this.blendTimer = 0;
      this.blendDuration = blendTime;
      incoming.weight = 0;
    }

    this._stopInactiveGroups(incoming, this._outgoingGroup);

    if (!loop) {
      if (!opts.preserveOneShot && typeof opts.onComplete === "function") {
        this.oneShotTimer = opts.duration ?? ATTACK_DURATIONS[newState] ?? 1.0;
        this.oneShotCallback = opts.onComplete;
      } else if (this.oneShotCallback == null && typeof opts.onComplete === "function") {
        this.oneShotTimer = opts.duration ?? ATTACK_DURATIONS[newState] ?? 1.0;
        this.oneShotCallback = opts.onComplete;
      }
    }
  }

  private _stopInactiveGroups(
    incoming: AnimationGroup,
    outgoing: AnimationGroup | null,
  ): void {
    for (let i = 0, len = this._allGroups.length; i < len; i++) {
      const g = this._allGroups[i]!;
      if (g !== incoming && g !== outgoing && g.isPlaying) {
        g.stop();
        g.weight = 0;
      }
    }
  }

  // ─── Per-Frame Update ───────────────────────────────────────────────────

  update(delta: number): void {
    this._gameTimeMs += delta * 1000;

    if (this.blendDuration > 0 && this.blendTimer < this.blendDuration) {
      this.blendTimer += delta;
      const t = Math.min(1, this.blendTimer / this.blendDuration);

      const incoming = this._incomingGroup;
      const outgoing = this._outgoingGroup;

      if (incoming) incoming.weight = t;
      if (outgoing && outgoing !== incoming) {
        outgoing.weight = 1 - t;
        if (t >= 1) {
          outgoing.stop();
          outgoing.weight = 0;
          if (incoming) incoming.weight = 1;
          this._outgoingGroup = null;
        }
      }
    } else {
      const incoming = this._incomingGroup;
      if (incoming && incoming.weight <= 0) {
        incoming.weight = 1;
        const outgoing = this._outgoingGroup;
        if (outgoing && outgoing !== incoming) {
          outgoing.stop();
          outgoing.weight = 0;
        }
        this._outgoingGroup = null;
      }
    }

    if (this.oneShotTimer > 0) {
      this.oneShotTimer -= delta;
      if (this.oneShotTimer <= 0) {
        const cb = this.oneShotCallback;
        this.oneShotCallback = null;
        this.oneShotTimer = -1;
        cb?.();
      }
    }
  }

  // ─── Stance Switch ─────────────────────────────────────────────────────

  switchStance(newStance: StanceType): void {
    if (newStance === this.currentStance) return;
    this.cancelPendingOneShot();
    this.currentStance = newStance;
    this._animNames = buildAnimationNameMap(this.characterId, newStance);
    this._swordAnimNames = buildAnimationNameMap(this.characterId, "SWORD");
    this._invalidateGroupCache();

    if (newStance === "SWORD") {
      this.transition(ANIM_STATE.SWORD_WITHDRAW, {
        loop: false,
        onComplete: () => this.transition(this._lastLocomotionState),
      });
    } else {
      this.transition(ANIM_STATE.SWORD_SHEATHE, {
        loop: false,
        onComplete: () => this.transition(this._lastLocomotionState),
      });
    }
  }

  // ─── Locomotion ─────────────────────────────────────────────────────────

  setLocomotion(
    speedOrContext: number | LocomotionContext,
    isFlying?: boolean,
    isGrounded?: boolean,
  ): void {
    const ctx =
      typeof speedOrContext === "object"
        ? speedOrContext
        : {
            speed: speedOrContext,
            isFlying: Boolean(isFlying),
            isGrounded: Boolean(isGrounded),
          };
    const speed = Scalar.Clamp(ctx.speed, 0, 1.5);

    // Still compute targetState to keep _lastLocomotionState fresh during combat
    const facingYaw = Number.isFinite(ctx.facingYaw) ? ctx.facingYaw! : null;
    const inputX = Number.isFinite(ctx.inputX) ? ctx.inputX! : 0;
    const inputZ = Number.isFinite(ctx.inputZ) ? ctx.inputZ! : 0;

    let targetState: string;
    if (ctx.isFlying) {
      if (speed < 0.06) targetState = ANIM_STATE.FLY_IDLE;
      else if (speed < 0.72) targetState = ANIM_STATE.FLY_MOVE;
      else targetState = ANIM_STATE.FLY_FAST;
    } else if (!ctx.isGrounded) {
      targetState = (ctx.verticalSpeed ?? 0) > 1.25 ? ANIM_STATE.JUMP : ANIM_STATE.FALL;
    } else {
      targetState = this._selectGroundLocomotionState(speed, inputX, inputZ, facingYaw);
    }

    // Update _lastLocomotionState even during combat so return-to-locomotion is correct
    this._lastLocomotionState = targetState;

    // Guard: don't interrupt combat/transform states
    if (COMBAT_STATES.has(this.currentState)) return;
    if (TRANSFORM_STATES.has(this.currentState)) return;
    if (this.oneShotCallback != null || this.oneShotTimer > 0) return;

    const speedBucket = (speed * 10) | 0;
    if (
      targetState === this.currentState &&
      speedBucket === this._lastSpeedBucket
    ) {
      return;
    }

    const stateChanged = targetState !== this.currentState;
    this.transition(targetState);

    if (stateChanged || speedBucket !== this._lastSpeedBucket) {
      this._lastSpeedBucket = speedBucket;
      this._syncLocomotionSpeed(speed);
    }
  }

  // ─── Combat Triggers ────────────────────────────────────────────────────

  playLightAttack(onComplete?: () => void): void {
    const now = this._gameTimeMs;
    if (now - this.lastHitTime > 600) this.comboIndex = 0;
    this.lastHitTime = now;

    const state = this.lightAttackPool[this.comboIndex % this.lightAttackPool.length]!;
    this.comboIndex++;

    this.transition(state, {
      loop: false,
      forceRestart: true,
      speed: 1.25,
      blendTime: 0.04,
      duration: (ATTACK_DURATIONS[state] ?? 0.35) / 1.25,
      onComplete: () => {
        this.transition(this._lastLocomotionState, { blendTime: 0.15 });
        onComplete?.();
      },
    });
  }

  playHeavyAttack(onComplete?: () => void): void {
    const state = this.heavyAttackPool[this.heavyAttackIndex % this.heavyAttackPool.length]!;
    this.heavyAttackIndex++;

    this.transition(state, {
      loop: false,
      forceRestart: true,
      speed: 1.15,
      blendTime: 0.08,
      duration: (ATTACK_DURATIONS[state] ?? 0.55) / 1.15,
      onComplete: () => {
        this.transition(this._lastLocomotionState, { blendTime: 0.2 });
        onComplete?.();
      },
    });
  }

  playThrowAttack(onComplete?: () => void): void {
    const state = this.throwAttackPool[this.throwAttackIndex % this.throwAttackPool.length]!;
    this.throwAttackIndex++;

    this.transition(state, {
      loop: false,
      forceRestart: true,
      speed: 1.15,
      blendTime: 0.08,
      duration: (ATTACK_DURATIONS[state] ?? 0.50) / 1.15,
      onComplete: () => {
        this.transition(this._lastLocomotionState, { blendTime: 0.2 });
        onComplete?.();
      },
    });
  }

  playKiBlast(onComplete?: () => void): void {
    this.transition(ANIM_STATE.KI_BLAST, {
      loop: false,
      forceRestart: true,
      speed: 1.25,
      blendTime: 0.05,
      duration: (ATTACK_DURATIONS[ANIM_STATE.KI_BLAST] ?? 0.40) / 1.25,
      onComplete: () => {
        this.transition(this._lastLocomotionState);
        onComplete?.();
      },
    });
  }

  startBeamCharge(): void {
    this.transition(ANIM_STATE.BEAM_CHARGE, { loop: true });
  }

  playBeamFire(onComplete?: () => void): void {
    this.transition(ANIM_STATE.BEAM_FIRE, {
      loop: false,
      forceRestart: true,
      speed: 1.1,
      blendTime: 0.08,
      duration: (ATTACK_DURATIONS[ANIM_STATE.BEAM_FIRE] ?? 0.80) / 1.1,
      onComplete: () => {
        this.transition(this._lastLocomotionState, { blendTime: 0.2 });
        onComplete?.();
      },
    });
  }

  playRushCombo(onComplete?: () => void): void {
    this.transition(ANIM_STATE.RUSH_COMBO, {
      loop: false,
      forceRestart: true,
      speed: 1.2,
      blendTime: 0.05,
      duration: (ATTACK_DURATIONS[ANIM_STATE.RUSH_COMBO] ?? 0.70) / 1.2,
      onComplete: () => {
        this.transition(this._lastLocomotionState, { blendTime: 0.15 });
        onComplete?.();
      },
    });
  }

  startKiCharge(): void {
    this.transition(ANIM_STATE.KI_CHARGE, { loop: true });
  }

  stopKiCharge(): void {
    if (this.currentState === ANIM_STATE.KI_CHARGE) {
      this.transition(this._lastLocomotionState);
    }
  }

  playDodge(onComplete?: () => void): void {
    this.transition(ANIM_STATE.DODGE, {
      loop: false,
      forceRestart: true,
      speed: 1.3,
      blendTime: 0.03,
      duration: (ATTACK_DURATIONS[ANIM_STATE.DODGE] ?? 0.22) / 1.3,
      onComplete: () => {
        this.transition(this._lastLocomotionState);
        onComplete?.();
      },
    });
  }

  startBlock(): void {
    // BLOCK is a non-looping one-shot; transition to BLOCK_IDLE for held pose
    this.transition(ANIM_STATE.BLOCK, {
      loop: false,
      speed: 1.3,
      blendTime: 0.04,
      duration: (ATTACK_DURATIONS[ANIM_STATE.BLOCK] ?? 0.2) / 1.3,
      onComplete: () => {
        if (this.currentState === ANIM_STATE.BLOCK) {
          this.transition(ANIM_STATE.BLOCK_IDLE, { loop: true, blendTime: 0.1 });
        }
      },
    });
  }

  stopBlock(): void {
    // Guard: only transition if still in a block state (not interrupted)
    if (this.currentState === ANIM_STATE.BLOCK || this.currentState === ANIM_STATE.BLOCK_IDLE) {
      this.transition(this._lastLocomotionState);
    }
  }

  playHurt(onComplete?: () => void): void {
    this.transition(ANIM_STATE.HURT, {
      loop: false,
      speed: 1.1,
      blendTime: 0.04,
      duration: (ATTACK_DURATIONS[ANIM_STATE.HURT] ?? 0.25) / 1.1,
      forceRestart: true,
      onComplete: () => {
        this.transition(this._lastLocomotionState);
        onComplete?.();
      },
    });
  }

  playKnockback(onComplete?: () => void): void {
    this.transition(ANIM_STATE.KNOCKBACK, {
      loop: false,
      speed: 1.1,
      blendTime: 0.05,
      duration: (ATTACK_DURATIONS[ANIM_STATE.KNOCKBACK] ?? 0.45) / 1.1,
      forceRestart: true,
      onComplete: () => {
        this.transition(ANIM_STATE.FALL);
        onComplete?.();
      },
    });
  }

  playDeath(): void {
    this.transition(ANIM_STATE.DEATH, { loop: false, forceRestart: true });
  }

  playVictory(onComplete?: () => void): void {
    this.transition(ANIM_STATE.VICTORY, {
      loop: false,
      forceRestart: true,
      duration: ATTACK_DURATIONS[ANIM_STATE.VICTORY] ?? 1.0,
      onComplete: () => {
        this.transition(this._lastLocomotionState);
        onComplete?.();
      },
    });
  }

  // ─── Transformation Sequence ────────────────────────────────────────────

  playTransformation(
    onBuildup?: () => void,
    onBurst?: () => void,
    onLand?: () => void,
  ): void {
    this.transition(ANIM_STATE.TRANSFORM_BUILDUP, {
      loop: false,
      forceRestart: true,
      duration: ATTACK_DURATIONS[ANIM_STATE.TRANSFORM_BUILDUP] ?? 1.80,
      onComplete: () => {
        onBuildup?.();
        this.transition(ANIM_STATE.TRANSFORM_BURST, {
          loop: false,
          forceRestart: true,
          duration: ATTACK_DURATIONS[ANIM_STATE.TRANSFORM_BURST] ?? 0.60,
          onComplete: () => {
            onBurst?.();
            this.transition(ANIM_STATE.TRANSFORM_LAND, {
              loop: false,
              forceRestart: true,
              duration: ATTACK_DURATIONS[ANIM_STATE.TRANSFORM_LAND] ?? 0.50,
              onComplete: () => {
                this.transition(this._lastLocomotionState);
                onLand?.();
              },
            });
          },
        });
      },
    });
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private _isLooping(state: string): boolean {
    return !NON_LOOPING_STATES.has(state);
  }

  private _selectGroundLocomotionState(
    speed: number,
    inputX: number,
    inputZ: number,
    facingYaw: number | null,
  ): string {
    const inputMagnitude = Math.hypot(inputX, inputZ);
    const yawDelta = this._trackFacingYaw(facingYaw);

    if (speed < 0.05 && inputMagnitude < 0.05) {
      if (Math.abs(yawDelta) > 0.035) {
        return yawDelta > 0 ? ANIM_STATE.TURN_R : ANIM_STATE.TURN_L;
      }
      return ANIM_STATE.IDLE;
    }

    const local = this._toLocalVector(inputX, inputZ, facingYaw);
    const absX = Math.abs(local.x);
    const absZ = Math.abs(local.z);

    if (absX > 0.42 && absX > absZ * 1.05) {
      return local.x > 0 ? ANIM_STATE.STRAFE_R : ANIM_STATE.STRAFE_L;
    }

    if (speed < 0.32) return ANIM_STATE.WALK;
    if (speed < 0.9) return ANIM_STATE.RUN;
    return ANIM_STATE.SPRINT;
  }

  private _syncLocomotionSpeed(speed: number): void {
    const currentGroup = this._incomingGroup;
    if (!currentGroup) return;

    let ratio: number;
    switch (this.currentState) {
      case ANIM_STATE.WALK:
      case ANIM_STATE.SWORD_WALK:
        ratio = 0.8 + speed * 0.45;
        break;
      case ANIM_STATE.RUN:
      case ANIM_STATE.SWORD_RUN:
        ratio = 0.82 + speed * 0.65;
        break;
      case ANIM_STATE.SPRINT:
        ratio = 0.95 + speed * 0.85;
        break;
      case ANIM_STATE.STRAFE_L:
      case ANIM_STATE.STRAFE_R:
      case ANIM_STATE.SWORD_STRAFE:
        ratio = 0.82 + speed * 0.55;
        break;
      case ANIM_STATE.FLY_MOVE:
        ratio = 0.9 + speed * 0.45;
        break;
      case ANIM_STATE.FLY_FAST:
        ratio = 1.0 + speed * 0.6;
        break;
      default: return;
    }
    currentGroup.speedRatio = ratio;
  }

  private _trackFacingYaw(facingYaw: number | null): number {
    if (!Number.isFinite(facingYaw)) return 0;
    if (!Number.isFinite(this._lastFacingYaw)) {
      this._lastFacingYaw = facingYaw;
      return 0;
    }
    const delta = this._angleDiff(facingYaw!, this._lastFacingYaw!);
    this._lastFacingYaw = facingYaw;
    return delta;
  }

  private _toLocalVector(
    worldX: number,
    worldZ: number,
    facingYaw: number | null,
  ): { x: number; z: number } {
    if (!Number.isFinite(facingYaw)) return { x: worldX, z: worldZ };
    const sin = Math.sin(facingYaw!);
    const cos = Math.cos(facingYaw!);
    return {
      x:  worldX * cos + worldZ * sin,
      z: -worldX * sin + worldZ * cos,
    };
  }

  private _angleDiff(a: number, b: number): number {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  dispose(): void {
    this.cancelPendingOneShot();
    for (let i = 0, len = this._allGroups.length; i < len; i++) {
      this._allGroups[i]!.stop();
    }
    this.groups.clear();
    this.clipGroups.clear();
    this._stateGroupCache.clear();
    this._allGroups.length = 0;
    this._incomingGroup = null;
    this._outgoingGroup = null;
  }
}
