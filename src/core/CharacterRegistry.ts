// Authoritative registry for all four player slots.
// Handles spawn, despawn, power level, transformation state, and per-frame updates.

import {
  Vector3,
  Color3,
  Color4,
  TransformNode,
  type AbstractMesh,
  type AnimationGroup,
  type Skeleton,
  type Scene,
} from "@babylonjs/core";
import { getEnemyDef } from "../ai/EnemyRegistry.js";
import { CHARACTER_ROSTER } from "../data/CharacterRoster.js";
import { CharacterMeshBuilder } from "./CharacterMeshBuilder.js";
import {
  configureCharacterMesh,
  selectPrimaryRenderableMesh,
  toTargetPropertyPath,
} from "./utils/animationUtils.js";
import type { CharacterDefinition, EntityTeam, TransformationDefinition } from "../data/gameData";
import type { StatusEffect } from "./types/StatusEffect.js";
import type { AuraSystemRef } from "./types/AuraSystemRef.js";
import type { TrainingDummyRef } from "./types/TrainingDummyRef.js";
import { CONFIG } from "./index.js";

// ─── Type Exports ─────────────────────────────────────────────────────────────

export interface SpawnParams {
  teamId?: EntityTeam;
  entityType?: "PLAYER" | "ENEMY" | "COMPANION";
  playerId?: string;
  followTargetSlot?: number | null;
  powerLevel?: number;
  maxHP?: number;
  maxKi?: number;
  maxStamina?: number;
  isBoss?: boolean;
}

export interface CharacterState {
  slot: number;
  playerId: string;
  characterId: string;
  characterDef: CharacterDefinition;
  entityType: "PLAYER" | "ENEMY" | "COMPANION";
  teamId: EntityTeam;
  level: number;
  powerLevel: number;
  maxHP: number;
  hp: number;
  maxKi: number;
  ki: number;
  stamina: number;
  maxStamina: number;
  currentTransform: TransformationDefinition | null;
  transformIndex: number;
  currentStance: string;
  position: Vector3;
  spawnPosition: Vector3;
  velocity: Vector3;
  lastMoveInput: Vector3;
  isFlying: boolean;
  isGrounded: boolean;
  isDead: boolean;
  isInvincible: boolean;
  isBlocking: boolean;
  isActionLocked: boolean;
  isAiControlled: boolean;
  isChargingKi: boolean;
  followTargetSlot: number | null;
  isBoss: boolean;
  lastDodgeTime: number;
  lastMeleeTime: number;
  lastDamageTime: number;
  rootNode: TransformNode | null;
  mesh: AbstractMesh | null;
  renderMeshes: AbstractMesh[];
  skeletons: Skeleton[];
  animationGroups: AnimationGroup[];
  weaponNode: TransformNode | null;
  auraColor: Color4;
  isTrainingDummy?: boolean;
   
  dummyRef?: TrainingDummyRef;
  requestedHairTransform?: string;
  characterMeshes?: AbstractMesh[];
  _correctScaling?: Vector3;
   
  auraSystem?: AuraSystemRef | null;
  fxNode?: TransformNode | null;
  chaseTargetSlot?: number | null;
  chaseWindowEnd?: number;
  lastSafePosition: Vector3;
  aiProfileId?: string | null;
  enemyDefId?: string | null;
  xpReward: number;
  lootTableId?: string | null;
  aggroTargetSlot?: number | null;
   
  statusEffects: StatusEffect[];
  _visibilityDirty?: boolean;
}

export type RegistryEventMap = {
  onPlayerSpawned: CharacterState;
  onPlayerDied: CharacterState;
  onTransformChanged: {
    slot: number;
    transformId: string | null;
    powerLevel: number;
    state: CharacterState;
  };
  onPowerLevelChanged: {
    slot: number;
    powerLevel: number;
    state: CharacterState;
  };
  onStanceChanged: {
    slot: number;
    stance: string;
    state: CharacterState;
    wasActionLocked: boolean;
  };
  onScreenFlashRequested: {
    color: Color3;
    durationMs: number;
    opacity: number;
  };
  onDamageTaken: {
    slot: number;
    amount: number;
    remainingHP: number;
    state: CharacterState;
  };
};

 
type RegistryListenerMap = {
   
  onPlayerSpawned: Array<(data: any) => void>;
   
  onPlayerDied: Array<(data: any) => void>;
   
  onTransformChanged: Array<(data: any) => void>;
   
  onPowerLevelChanged: Array<(data: any) => void>;
   
  onDamageTaken: Array<(data: any) => void>;
   
  onStanceChanged: Array<(data: any) => void>;
   
  onZVanish: Array<(data: any) => void>;
   
  onChaseTriggered: Array<(data: any) => void>;
};

type RegistryEventName = keyof RegistryListenerMap;

// ─── Character Roster ─────────────────────────────────────────────────────────
// Roster moved to src/data/CharacterRoster.ts

// ─── Player Slot Constants ─────────────────────────────────────────────────────
export const MAX_PLAYERS = 4;
export const MAX_ENTITIES = 16;

// ─── PlayerState ──────────────────────────────────────────────────────────────
// Mutable runtime state for a single player slot.
class PlayerState implements CharacterState {
  slot: number;
  playerId: string;
  characterId: string;
  characterDef: CharacterDefinition;
  entityType: "PLAYER" | "ENEMY" | "COMPANION";
  teamId: EntityTeam;
  aiProfileId: string | null;
  enemyDefId: string | null;
  level: number;
  xpReward: number;
  lootTableId: string | null;
  aggroTargetSlot: number | null;
   
  statusEffects: StatusEffect[];
  isBoss: boolean;
  powerLevel: number;
  maxHP: number;
  hp: number;
  maxKi: number;
  ki: number;
  stamina: number;
  maxStamina: number;
  currentTransform: TransformationDefinition | null;
  transformIndex: number;
  position: Vector3;
  velocity: Vector3;
  lastMoveInput: Vector3;
  isFlying: boolean;
  isGrounded: boolean;
  rootNode: TransformNode | null;
  mesh: AbstractMesh | null;
  animationGroups: AnimationGroup[];
  skeletons: Skeleton[];
   
  auraSystem: any;
  fxNode: TransformNode | null;
  currentStance: string;
  weaponNode: TransformNode | null;
  isDead: boolean;
  isChargingKi: boolean;
  isBlocking: boolean;
  isInvincible: boolean;
  isActionLocked: boolean;
  isAiControlled: boolean;
  followTargetSlot: number | null;
  lastDamageTime: number;
  lastDodgeTime: number;
  lastMeleeTime: number;
  chaseTargetSlot: number | null;
  chaseWindowEnd: number;
  spawnPosition: Vector3;
  lastSafePosition: Vector3;
  auraColor: Color4;
  renderMeshes: AbstractMesh[];
  isTrainingDummy?: boolean;
   
  dummyRef?: TrainingDummyRef;
  requestedHairTransform?: string;
  characterMeshes?: AbstractMesh[];
  _correctScaling?: Vector3;
  _visibilityDirty: boolean;

  constructor(slot: number, playerId: string, characterId: string, spawnPosition: Vector3) {
    this.slot = slot; // 0-3
    this.playerId = playerId; // session-level UUID
    this.characterId = characterId; // key from CHARACTER_ROSTER
    this.characterDef = CHARACTER_ROSTER[characterId]!;
    this.entityType = "PLAYER";
    this.teamId = "HERO";
    this.aiProfileId = null;
    this.enemyDefId = null;
    this.level = 1;
    this.xpReward = 0;
    this.lootTableId = null;
    this.aggroTargetSlot = null;
    this.statusEffects = [];
    this.isBoss = false;

    // Combat stats (runtime)
    this.powerLevel = this.characterDef.basePowerLevel;
    this.maxHP = 10000;
    this.hp = 10000;
    this.maxKi = 100;
    this.ki = 100;
    this.stamina = this.characterDef.baseStamina;
    this.maxStamina = this.characterDef.baseStamina;

    // Transformation state
    this.currentTransform = null; // null = base form
    this.transformIndex = -1;

    // Physics/world state
    this.position = spawnPosition.clone();
    this.velocity = Vector3.Zero();
    this.lastMoveInput = Vector3.Zero();
    this.isFlying = false;
    this.isGrounded = true;

    // Scene node (set after spawn)
    this.rootNode = null;
    this.mesh = null;
    this.animationGroups = [];
    this.skeletons = [];
    this.auraSystem = null;
    this.fxNode = null;

    // Stance system (Ayo supports MELEE / SWORD; others fixed to MELEE)
    this.currentStance = this.characterDef.defaultStance ?? "MELEE";
    /** Weapon attachment node (sword mesh parented to hand bone) */
    this.weaponNode = null;

    // Flags
    this.isDead = false;
    this.isChargingKi = false;
    this.isBlocking = false;
    this.isInvincible = false;
    this.isActionLocked = false; // true while an attack animation is playing
    this.isAiControlled = false;
    this.followTargetSlot = null;
    this.lastDamageTime = 0;
    this.lastDodgeTime = 0;
    this.lastMeleeTime = 0;
    this.chaseTargetSlot = null;
    this.chaseWindowEnd = 0;
    this.spawnPosition = spawnPosition.clone();
    this.lastSafePosition = spawnPosition.clone();
    this.auraColor = new Color4(0.3, 0.5, 1.0, 0.7);
    this.renderMeshes = [];
    this._visibilityDirty = true;
  }
}

// ─── CharacterRegistry ────────────────────────────────────────────────────────
export class CharacterRegistry {
  scene: Scene;
  slots: Map<number, PlayerState>;
  playerSlotMap: Map<string, number>;
  _listeners: RegistryListenerMap;
  kiRegenRate: number;
  hpRegenRate: number;
  staminaRegenRate: number;
   
  _transformMeshHandler?: (ev: any) => void;

  

  constructor(scene: Scene) {
    this.scene = scene;
    this.slots = new Map();
    this.playerSlotMap = new Map();

    /** Event listeners */
    this._listeners = {
      onPlayerSpawned: [],
      onPlayerDied: [],
      onTransformChanged: [],
      onPowerLevelChanged: [],
      onDamageTaken: [],
      onStanceChanged: [],
      onZVanish: [],
      onChaseTriggered: [],
      onScreenFlashRequested: [],
    };

    // Ki regeneration rate per second (base)
    this.kiRegenRate = 4.0;
    // HP regeneration rate per second (base, very slow)
    this.hpRegenRate = 5.0;
    // Stamina regeneration rate per second
    this.staminaRegenRate = CONFIG.characters.staminaRegen;

    // Listen for VFX-driven requests to swap meshes/materials (best-effort).
    try {
      if (typeof window !== "undefined") {
         
        this._transformMeshHandler = (ev: any) => {
          try {
            const detail = (ev as CustomEvent).detail as { slot?: number; transformId?: string } | undefined;
            const { slot, transformId } = detail ?? {};
            if (slot !== undefined && transformId !== undefined) this.applyTransformMesh(slot, transformId);
          } catch { /* ignore malformed events */ }
        };
        window.addEventListener("dbz:applyTransformMesh", this._transformMeshHandler as EventListener);
      }
    } catch (_e) {
      console.warn("[CharacterRegistry] Setup error:", _e);
    }
  }

  /**
   * Best-effort: apply a visual mesh/material change for a transform.
   * This function intentionally does not throw — VFX should not break game logic.
   */
  applyTransformMesh(slot: number, transformId: string): void {
    const state = this.slots.get(slot);
    if (!state) return;

    // Minimal safe implementation: record the requested hair transform and
    // attempt a visual hint if the mesh exposes metadata. Do not assume
    // any particular skeleton or material API is present.
    try {
      state.requestedHairTransform = transformId;

       
      const meshAny = state.mesh as any;
      // If the mesh has a .materials map or metadata indicating hair mesh, attempt to modify.
      if (meshAny && meshAny.metadata && meshAny.metadata.hairMeshName) {
        const hairName = meshAny.metadata.hairMeshName;
        const hair = meshAny.getChildMeshes?.().find((m: AbstractMesh) => m.name === hairName);
         
        if (hair && (hair as any).material) {
          // Apply a simple tint as a lightweight visual indicator.
           
          const mat = (hair as any).material;
          if (mat.diffuseColor) {
            const charDef = (CHARACTER_ROSTER[state.characterId] || getEnemyDef(state.characterId)) as any;
            const transformDef = charDef?.transformations?.find((t: any) => t.id === transformId);
            if (transformDef?.color) {
              mat.diffuseColor = transformDef.color.clone();
            } else {
              mat.diffuseColor = mat.diffuseColor.clone(); // Fallback
            }
          }
        }
      }
      console.log(`[CharacterRegistry] applyTransformMesh requested for slot ${slot}: ${transformId}`);
    } catch (e) {
      console.warn(`[CharacterRegistry] applyTransformMesh failed for slot ${slot}:`, e);
    }
  }

  /**
   * Request a full screen flash from VFX systems (decoupled from DOM).
   */
  requestScreenFlash(color: Color3, durationMs: number, opacity: number = 0.6): void {
    this._emit("onScreenFlashRequested", { color, durationMs, opacity });
  }

  // ─── Spawn / Despawn ────────────────────────────────────────────────────────

  /**
   * Spawn a player into the world.
   */
  async spawnPlayer(
    playerId: string,
    slot: number,
    spawnPos: Vector3,
    characterId: string | null = null,
  ): Promise<PlayerState> {
    if (slot < 0 || slot >= MAX_PLAYERS) throw new Error(`Invalid slot: ${slot}`);
    if (this.slots.has(slot)) this.despawnEntity(slot);

    // Default character assignment by slot
    const defaultChars = ["AYO", "HANA", "RAYNE", "AYO"];
    const charId = characterId ?? defaultChars[slot]!;
    if (!CHARACTER_ROSTER[charId]) throw new Error(`Unknown character: ${charId}`);

    const state = new PlayerState(slot, playerId, charId, spawnPos);
    this.slots.set(slot, state);
    this.playerSlotMap.set(playerId, slot);

    await CharacterMeshBuilder.buildCharacterMesh(this.scene, state);
    await CharacterMeshBuilder.attachWeaponForState(this.scene, state);
    this.restoreCharacterRenderState(state);

    this._emit("onPlayerSpawned", { slot, playerId, characterId: charId, position: spawnPos });
    console.log(`[CharacterRegistry] Spawned ${charId} (slot ${slot}) for player ${playerId}`);
    return state;
  }

  /**
   * Spawn an enemy entity for single-player PvE.
   */
   
  spawnEnemy(enemyDefId: string, slot: number | null = null, spawnPos: Vector3 | null = null, params: any = {}): PlayerState | null {
    const enemyDef = getEnemyDef(enemyDefId);
    if (!enemyDef) {
      console.warn(`[CharacterRegistry] Unknown enemy def: ${enemyDefId}`);
      return null;
    }

    const resolvedSlot = slot ?? this._assignEntitySlot();
    if (resolvedSlot < 0 || resolvedSlot >= MAX_ENTITIES) {
      throw new Error(`Invalid entity slot: ${resolvedSlot}`);
    }
    if (this.slots.has(resolvedSlot)) this.despawnEntity(resolvedSlot);

    const pos = (spawnPos ?? new Vector3(0, 1, 0)).clone();
    const playerId: string = params.playerId ?? `enemy_${enemyDefId}_${Math.random().toString(36).slice(2, 8)}`;

     
    const state = new PlayerState(resolvedSlot, playerId, (enemyDef as any).characterId ?? enemyDefId ?? "AYO", pos);
    state.entityType = "ENEMY";
    state.teamId = params.teamId ?? "ENEMY";
    state.aiProfileId = params.aiProfileId ?? enemyDefId;
    state.enemyDefId = enemyDefId;
    state.isAiControlled = true;
    state.level = params.level ?? 1;
     
    state.xpReward = params.xpReward ?? (enemyDef as any).xpReward ?? 0;
     
    state.isBoss = !!(params.isBoss || (enemyDef as any).isBoss);
    state.aggroTargetSlot = params.aggroTargetSlot ?? 0;
     
    state.powerLevel = params.powerLevel ?? (enemyDef as any).basePowerLevel ?? state.powerLevel;
     
    state.maxHP = params.maxHP ?? (enemyDef as any).maxHP ?? state.maxHP;
    state.hp = state.maxHP;
     
    state.maxKi = params.maxKi ?? (enemyDef as any).maxKi ?? state.maxKi;
    state.ki = state.maxKi;
     
    state.maxStamina = params.maxStamina ?? (enemyDef as any).maxStamina ?? state.maxStamina;
    state.stamina = state.maxStamina;

    this.slots.set(resolvedSlot, state);
    this.playerSlotMap.set(playerId, resolvedSlot);

    // Build mesh first, then attach weapon (weapon attach needs the skeleton)
    CharacterMeshBuilder.buildCharacterMesh(this.scene, state)
      .then(() => {
        if (this.slots.get(resolvedSlot) !== state) throw new Error("Superseded");
        return CharacterMeshBuilder.attachWeaponForState(this.scene, state);
      })
      .catch((e: Error) => {
        if (e.message !== "Superseded") console.warn(`[CharacterRegistry] Weapon attach failed for slot ${resolvedSlot}:`, e);
      })
      .finally(() => {
        if (this.slots.get(resolvedSlot) !== state) {
          state.weaponNode?.dispose();
          state.rootNode?.dispose();
          state.mesh?.dispose();
          state.skeletons.forEach(s => s.dispose());
          state.animationGroups.forEach(g => g.dispose());
          return;
        }
        this.restoreCharacterRenderState(state);
        this._emit("onPlayerSpawned", {
          slot: resolvedSlot,
          playerId,
          characterId: state.characterId,
          entityType: "ENEMY",
          enemyDefId,
          position: pos,
        });
      });

    return state;
  }

   
  async spawnCompanion(characterId: string, slot: number | null = null, spawnPos: Vector3 | null = null, params: any = {}): Promise<PlayerState> {
    if (!CHARACTER_ROSTER[characterId]) throw new Error(`Unknown companion character: ${characterId}`);

    const resolvedSlot = slot ?? this._assignEntitySlot();
    if (resolvedSlot < 0 || resolvedSlot >= MAX_ENTITIES) {
      throw new Error(`Invalid companion slot: ${resolvedSlot}`);
    }
    if (this.slots.has(resolvedSlot)) this.despawnEntity(resolvedSlot);

    const pos = (spawnPos ?? new Vector3(0, 1, 0)).clone();
    const playerId: string = params.playerId ?? `companion_${characterId}_${Math.random().toString(36).slice(2, 8)}`;

    const state = new PlayerState(resolvedSlot, playerId, characterId, pos);
    state.entityType = "COMPANION";
    state.teamId = "HERO";
    state.isAiControlled = true;
    state.followTargetSlot = params.followTargetSlot ?? 0;
    state.aiProfileId = params.aiProfileId ?? `${characterId}_COMPANION`;
    state.powerLevel = params.powerLevel ?? state.powerLevel;
    state.maxHP = params.maxHP ?? state.maxHP;
    state.hp = state.maxHP;
    state.maxKi = params.maxKi ?? state.maxKi;
    state.ki = state.maxKi;
    state.maxStamina = params.maxStamina ?? state.maxStamina;
    state.stamina = state.maxStamina;

    this.slots.set(resolvedSlot, state);
    this.playerSlotMap.set(playerId, resolvedSlot);

    await CharacterMeshBuilder.buildCharacterMesh(this.scene, state);
    await CharacterMeshBuilder.attachWeaponForState(this.scene, state);
    this.restoreCharacterRenderState(state);

    this._emit("onPlayerSpawned", {
      slot: resolvedSlot,
      playerId,
      characterId: state.characterId,
      entityType: "COMPANION",
      position: pos,
    });
    return state;
  }

  despawnEntity(slot: number): void {
    const state = this.slots.get(slot);
    if (!state) return;

    // Let the dummy know it's being erased
    if (state.isTrainingDummy) {
      state.dummyRef?.dispose();
      this.playerSlotMap.delete(state.playerId);
      this.slots.delete(slot);
      return;
    }

    state.auraSystem?.dispose();

    // Unparent to prevent double-dispose errors if the root node tries to clean children
    if (state.weaponNode) { state.weaponNode.parent = null; state.weaponNode.dispose(); }
    if (state.fxNode) { state.fxNode.parent = null; state.fxNode.dispose(); }

    state.animationGroups.forEach((group) => group.dispose());
    state.skeletons.forEach((skel) => skel.dispose()); // Fix skeleton leak
    state.animationGroups.length = 0;
    state.skeletons.length = 0;

    state.mesh?.dispose();
    state.rootNode?.dispose();

    this.playerSlotMap.delete(state.playerId);
    this.slots.delete(slot);
    console.log(`[CharacterRegistry] Despawned slot ${slot}`);
  }

  despawnSlot(slot: number): void {
    this.despawnEntity(slot);
  }

  despawnEntityByPlayerId(playerId: string): void {
    const slot = this.playerSlotMap.get(playerId);
    if (slot !== undefined) this.despawnEntity(slot);
  }

  despawnAll(): void {
    for (const slot of [...this.slots.keys()]) this.despawnEntity(slot);
  }

  // ─── Combat API ─────────────────────────────────────────────────────────────

  /**
   * Apply damage to a slot.
   */
  applyDamage(slot: number, amount: number, sourcePlayerId: string | null = null): number {
    const state = this.slots.get(slot);
    if (!state || state.isDead) return 0;
    if (state.isInvincible) return 0;

    // ── Z-Vanish Perfect Dodge Check ──
    const now = performance.now();
    if (state.lastDodgeTime && (now - state.lastDodgeTime) < (CONFIG.combat.perfectDodgeWindowMs || 150)) {
      const attackerState = sourcePlayerId ? this.getStateByPlayerId(sourcePlayerId) : null;
      if (attackerState) {
        // Teleport behind attacker
        const forward = attackerState.rootNode
          ? new Vector3(Math.sin(attackerState.rootNode.rotation.y), 0, Math.cos(attackerState.rootNode.rotation.y))
          : new Vector3(0, 0, 1);

        const backPos = attackerState.position.subtract(forward.scale(2.5));
        const oldPosition = state.position.clone();

        state.position.copyFrom(backPos);
        state.isGrounded = false;
        state.isFlying = true;

        if (state.rootNode) {
          const toAttacker = attackerState.position.subtract(state.position);
          state.rootNode.rotation.y = Math.atan2(toAttacker.x, toAttacker.z);
        }
        state.lastDodgeTime = 0; // Consume dodge window
        this._emit("onZVanish", { evaderSlot: slot, attackerSlot: attackerState.slot, oldPosition, newPosition: state.position.clone() });
        return -1; // Flag as negated/vanished
      }
    }

    // Route damage to Training Dummy if applicable
    if (state.isTrainingDummy && state.dummyRef) {
      const res = state.dummyRef.takeDamage(amount, null, null);
      state.hp = state.dummyRef.hp;
      this._emit("onDamageTaken", { slot, amount: res.actual, remainingHP: state.hp, sourcePlayerId });
      return res.actual;
    }

    // Defense factor based on current power level vs attacker's PL
    // Use the attacker's actual power level when known; otherwise skip defense scaling
    // (passing `amount` as a stand-in PL was causing a fixed 50% damage cut for all
    // non-attributed hits, which broke beam clash and projectile damage.)
    const sourcePL = sourcePlayerId
      ? (this.getStateByPlayerId(sourcePlayerId)?.powerLevel ?? state.powerLevel)
      : state.powerLevel;

    // Ensure safe division in case of corrupted or base-0 power levels
    const safeSourcePL = Math.max(1, sourcePL);
    const defFactor = Math.max(0.1, 1 - (state.powerLevel / (safeSourcePL * 2)));
    const effective = Math.round(amount * defFactor);

    state.hp = Math.max(0, state.hp - effective);
    state.lastDamageTime = performance.now();

    this._emit("onDamageTaken", { slot, amount: effective, remainingHP: state.hp, sourcePlayerId });

    if (state.hp === 0) {
      state.isDead = true;

      // Fade-out logic only. AnimationController handles playing the actual death clip.
      setTimeout(() => {
        if (state.rootNode) {
          state.rootNode.setEnabled(false);
        }
      }, 2200);

      this._emit("onPlayerDied", {
        slot,
        playerId: state.playerId,
        entityType: state.entityType,
        teamId: state.teamId,
        isBoss: state.isBoss,
      });
    }

    return effective;
  }

  /**
   * Restore HP to a slot without exceeding max HP.
   */
  applyHeal(slot: number, amount: number): number {
    const state = this.slots.get(slot);
    if (!state || state.isDead) return 0;
    const before = state.hp;
    state.hp = Math.min(state.maxHP, state.hp + Math.max(0, amount));
    return state.hp - before;
  }

  /**
   * Trigger a transformation for a slot.
   */
  transform(slot: number, transformId: string): boolean {
    const state = this.slots.get(slot);
    if (!state || state.isDead) return false;

    const transforms = state.characterDef.transformations;
    const idx = transforms.findIndex(t => t.id === transformId);
    if (idx === -1) return false;

    const tf = transforms[idx]!;

    // Check ki cost
    if (state.ki < tf.kiCost) {
      console.log(`[CharacterRegistry] Not enough Ki to transform (need ${tf.kiCost}, have ${state.ki})`);
      return false;
    }

    // Revert from current transform first, then apply new one
    const basePL = state.characterDef.basePowerLevel;
    state.ki -= tf.kiCost;
    state.currentTransform = tf;
    state.transformIndex = idx;
    state.powerLevel = Math.round(basePL * tf.plMultiplier);
    state._visibilityDirty = true; // Trigger the recursive node walk once to update meshes

    // Update aura color
    this._updateAuraColor(state, tf.color);

    this._emit("onTransformChanged", { slot, transformId, powerLevel: state.powerLevel });
    this._emit("onPowerLevelChanged", { slot, powerLevel: state.powerLevel });
    console.log(`[CharacterRegistry] Slot ${slot} → ${tf.label} | PL: ${state.powerLevel.toLocaleString()}`);
    return true;
  }

  /** Revert to base form */
  revertTransform(slot: number): void {
    const state = this.slots.get(slot);
    if (!state) return;

    state.currentTransform = null;
    state.transformIndex = -1;
    state.powerLevel = state.characterDef.basePowerLevel;
    state._visibilityDirty = true; // Trigger the recursive node walk once to update meshes

    this._updateAuraColor(state, new Color3(0.3, 0.5, 1.0));

    this._emit("onTransformChanged", { slot, transformId: null, powerLevel: state.powerLevel });
    this._emit("onPowerLevelChanged", { slot, powerLevel: state.powerLevel });
  }

  // ─── Per-Frame Update ────────────────────────────────────────────────────────
  update(delta: number): void {
    for (const [, state] of this.slots) {
      if (state.isDead) continue;
      if (state.isTrainingDummy) continue; // Training dummies managed by dummyManager

      // Stamina regen (paused for 1.5s after a stance switch is handled
      // naturally since stamina only drains on toggle, not continuously)
      state.stamina = Math.min(state.maxStamina, state.stamina + this.staminaRegenRate * delta);

      // Ki regen (slower while transformed)
      const kiRegen = state.currentTransform ? this.kiRegenRate * 0.3 : this.kiRegenRate;
      state.ki = Math.min(state.maxKi, state.ki + kiRegen * delta);

      // HP regen (only when not recently hit — 3s grace period)
      const timeSinceHit = (performance.now() - state.lastDamageTime) / 1000;
      if (timeSinceHit > 3.0) {
        state.hp = Math.min(state.maxHP, state.hp + this.hpRegenRate * delta);
      }

      // Gain ki while charging (player is powering up)
      if (state.isChargingKi) {
        state.ki = Math.min(state.maxKi, state.ki + CONFIG.combat.kiChargeRate * delta);
      }

      // Sync mesh position (in a full impl, physics drives this — this is a fallback)
      if (state.rootNode) {
        state.rootNode.position.copyFrom(state.position);
      }

      // Optimisation: skip visibility walk if already recently sync'd and not dirty.
      // We manually dirty this flag on major events (spawn, retarget, transform).
      if (state._visibilityDirty) {
        this.restoreCharacterRenderState(state);
      } else {
        // Just sync scaling and position if root exists to keep it from drifting.
        if (state._correctScaling && state.rootNode) {
          state.rootNode.scaling.copyFrom(state._correctScaling);
        }
        if (state.rootNode) {
           state.rootNode.position.copyFrom(state.position);
        }
      }
    }
  }

  // ─── Getters ─────────────────────────────────────────────────────────────────
  getState(slot: number): PlayerState | null {
    return this.slots.get(slot) ?? null;
  }

  getStateByPlayerId(playerId: string): PlayerState | null {
    const slot = this.playerSlotMap.get(playerId);
    return slot !== undefined ? this.slots.get(slot) ?? null : null;
  }

  getEntitiesByTeam(teamId: EntityTeam): PlayerState[] {
    return [...this.slots.values()].filter((s) => s.teamId === teamId);
  }

  restoreCharacterRenderState(slotOrState: number | PlayerState): boolean {
    const state = typeof slotOrState === "number" ? this.slots.get(slotOrState) : slotOrState;
    if (!state) return false;

    // Prevent restoring visibility for dead characters that have already faded out
    if (state.isDead && state.rootNode && !state.rootNode.isEnabled()) {
      return false;
    }

    // ── Restore correct scaling if animation retargeting corrupted it ──
    if (state._correctScaling && state.rootNode) {
      state.rootNode.scaling.copyFrom(state._correctScaling);
    }

    // ── Sync rootNode position from authoritative state.position ──
    if (state.rootNode) {
      state.rootNode.position.copyFrom(state.position);
    }

    // ── CRITICAL: Ensure root node and all children are visible ──
    if (state.rootNode) {
      state.rootNode.setEnabled(true);
      // Force visibility on all descendants recursively
      this._forceNodeVisibility(state.rootNode);
    }

    // Also ensure individual mesh visibility
    for (const mesh of state.characterMeshes ?? []) {
      if (mesh.isDisposed()) continue;
      configureCharacterMesh(mesh, { forceActiveSelection: true });
      // Force parent to be enabled
      if (mesh.parent) {
         
        (mesh.parent as any).setEnabled?.(true);
      }
    }

    if (state.mesh && !state.mesh.isDisposed()) {
      configureCharacterMesh(state.mesh, { forceActiveSelection: true });
      // Force parent to be enabled
      if (state.mesh.parent) {
         
        (state.mesh.parent as any).setEnabled?.(true);
      }
    }

    if (state.weaponNode && !state.weaponNode.isDisposed()) {
      state.weaponNode.setEnabled(state.currentStance === "SWORD");
    }

    state.rootNode?.computeWorldMatrix(true);
    state._visibilityDirty = false; // Visibility is now up to date
    return true;
  }

  /**
   * Recursively force visibility on a node and all its children
   * @private
   */
   
  private _forceNodeVisibility(node: any): void {
    if (!node) return;

    // Enable this node
    node.setEnabled?.(true);

    // If it's a mesh, ensure visibility properties
    if (node.isVisible !== undefined) {
      node.isVisible = true;
      node.visibility = 1;
    }

    // Process children recursively ONCE using getChildren()
    if (node.getChildren) {
      for (const child of node.getChildren(null, false)) {
        this._forceNodeVisibility(child);
      }
    }
  }

  /** Returns a snapshot of all slot states (safe to serialize for network sync) */
   
  getSnapshot(): Record<number, any> {
     
    const snap: Record<number, any> = {};
    for (const [slot, state] of this.slots) {
      snap[slot] = {
        playerId: state.playerId,
        characterId: state.characterId,
        hp: state.hp,
        maxHP: state.maxHP,
        ki: state.ki,
        maxKi: state.maxKi,
        stamina: state.stamina,
        maxStamina: state.maxStamina,
        powerLevel: state.powerLevel,
        transformId: state.currentTransform?.id ?? null,
        position: { x: state.position.x, y: state.position.y, z: state.position.z },
        velocity: { x: state.velocity.x, y: state.velocity.y, z: state.velocity.z },
        isFlying: state.isFlying,
        isGrounded: state.isGrounded,
        isChargingKi: state.isChargingKi,
        isBlocking: state.isBlocking,
        currentStance: state.currentStance,
        isDead: state.isDead,
      };
    }
    return snap;
  }

  /** Apply a snapshot received from the host (client-side reconciliation) */
   
  applySnapshot(snapshot: Record<string, any>): void {
    for (const [slotStr, data] of Object.entries(snapshot)) {
      const slot = parseInt(slotStr, 10);
      const state = this.slots.get(slot);
      if (!state) continue;

      state.hp = data.hp;
      state.ki = data.ki;
      state.stamina = data.stamina ?? state.stamina;
      state.powerLevel = data.powerLevel;
      state.isFlying = data.isFlying ?? state.isFlying;
      state.isGrounded = data.isGrounded ?? state.isGrounded;
      state.isChargingKi = data.isChargingKi ?? state.isChargingKi;
      state.isBlocking = data.isBlocking ?? state.isBlocking;

      const prevStance = state.currentStance;
      state.currentStance = data.currentStance ?? state.currentStance;
      state.isDead = data.isDead;

      state.position.set(data.position.x, data.position.y, data.position.z);
      if (data.velocity) {
        state.velocity.set(data.velocity.x, data.velocity.y, data.velocity.z);
      }

      if (prevStance !== state.currentStance) {
        this._emit("onStanceChanged", { slot, stance: state.currentStance });
      }
    }
  }

  // ─── Event System ────────────────────────────────────────────────────────────
   
  on(event: RegistryEventName, fn: (data: any) => void): () => void {
    this._listeners[event].push(fn);
    return () => this.off(event, fn);
  }


  off(event: RegistryEventName, fn: (data: any) => void): void {
    this._listeners[event] = this._listeners[event].filter(f => f !== fn);
  }


  private _emit(event: RegistryEventName, data: any): void {
    this._listeners[event].forEach(fn => fn(data));
  }

   
  private _toTargetPropertyPath(rawPath: any): string[] {
    if (Array.isArray(rawPath)) return rawPath.map((part) => String(part));
    if (typeof rawPath !== "string") return [];
    return rawPath
      .split(".")
      .map((part: string) => part.trim())
      .filter(Boolean);
  }

  

  private _selectPrimaryRenderableMesh(meshes: AbstractMesh[] = []): AbstractMesh | null {
    return selectPrimaryRenderableMesh(meshes);
  }

   
  private _configureCharacterMesh(mesh: any, { forceActiveSelection = false } = {}): void {
    configureCharacterMesh(mesh, { forceActiveSelection });
  }

  // ─── Internals ────────────────────────────────────────────────────────────────
  



  private _updateAuraColor(state: PlayerState, color: Color3): void {
    if (!state.auraSystem) return;
    state.auraSystem.color1 = new Color4(color.r, color.g, color.b, 0.7);
    state.auraSystem.color2 = new Color4(color.r * 0.5, color.g * 0.5, color.b * 0.5, 0.2);
    state.auraSystem.emitRate = state.currentTransform ? 200 : 60;
  }

  private _assignEntitySlot(): number {
    for (let i = 1; i < MAX_ENTITIES; i++) {
      if (!this.slots.has(i)) return i;
    }
    throw new Error("CharacterRegistry: no free entity slots");
  }

  // ─── Stance Toggle ────────────────────────────────────────────────────────
  /**
   * Toggle Ayo's combat stance between MELEE <-> SWORD.
   * Costs stamina. No-op for characters that only support one stance.
   */
  toggleStance(slot: number): boolean {
    const state = this.slots.get(slot);
    if (!state || state.isDead) return false;

    const def = state.characterDef;
    const stances = def.stances ?? ["MELEE"];
    if (stances.length < 2) return false;

    const cost = def.stanceSwitchCost ?? 10;
    if (state.stamina < cost) {
      console.log(`[CharacterRegistry] Not enough stamina to switch stance (need ${cost})`);
      return false;
    }

    const wasActionLocked = !!state.isActionLocked;
    if (wasActionLocked) {
      state.isActionLocked = false;
    }
    state.stamina = Math.max(0, state.stamina - cost);
    const next = state.currentStance === "MELEE" ? "SWORD" : "MELEE";
    state.currentStance = next;

    // Show/hide weapon mesh
    if (state.weaponNode) state.weaponNode.setEnabled(next === "SWORD");

    this._emit("onStanceChanged", { slot, stance: next, wasActionLocked });
    console.log(`[CharacterRegistry] Slot ${slot} stance -> ${next}`);
    return true;
  }

  // ─── Enemy Weapon Attachment ──────────────────────────────────────────────

  /**
   * Load a sword and parent it to the character's right-hand bone.
   * Non-blocking — falls back gracefully when bone is not found.
   */
  

  
}
