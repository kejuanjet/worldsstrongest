// src/core/MovementController.ts
// Handles all character locomotion: ground movement, flight, dodging,
// knockback physics, and landing. Runs on both host (authoritative) and
// client (predictive). Results are reconciled via snapshot.

import { CONFIG } from "../config/index.js";
import { Vector3, Scalar, Ray, type Scene } from "@babylonjs/core";
import { Logger } from "./Logger.js";

const log = Logger.scoped("Movement");

// ─── Type Definitions ─────────────────────────────────────────────────────────

import type { MovementState } from "./types/CharacterViews";

/** Input snapshot for movement processing */
export interface InputSnapshot {
  moveX: number;
  moveZ: number;
  flyY: number;
  btnDodge: boolean;
  btnAttack?: boolean;
  btnHeavy?: boolean;
  btnKi?: boolean;
  btnBlast?: boolean;
  btnTransform?: boolean;
  btnTransformDown?: boolean;
  btnUltimate?: boolean;
  btnRush?: boolean;
  btnGrab?: boolean;
  lockedSlot?: number | null;
  mashCount?: number;
}

/** Interface for the character registry dependency */
export interface CharacterRegistryLike {
  slots: Map<number, MovementState>;
  getState(slot: number): MovementState | null | undefined;
}

// ─── Movement State (per slot) ────────────────────────────────────────────────

class MoveState {
  /** Current velocity m/s */
  velocity = Vector3.Zero();
  isGrounded = true;
  /** True when player has left ground intentionally */
  isFlying = false;
  isDodging = false;
  /** Seconds remaining in dodge */
  dodgeTimer = 0;
  /** Seconds before dodge can be used again */
  dodgeCooldownTimer = 0;
  dodgeDirection = Vector3.Zero();
  /** Brief lockout on land */
  landingTimer = 0;
  /** Grace frames after walking off a ledge */
  coyoteTimer = 0;
  /** Buffer for jump input before landing */
  jumpBufferTimer = 0;
  /** Seconds of knockback override */
  knockbackTimer = 0;
  /** Seconds of dodge invincibility remaining */
  invincibilityTimer = 0;
  /** Prevents repeated jump/flight while key is held */
  jumpTriggered = false;
  /** Slot index for registry lookups */
  _slot = -1;
  /** Track ground elevation for height checks */
  lastGroundY = 0;
}

// ─── MovementController ───────────────────────────────────────────────────────

export class MovementController {
  public readonly scene: Scene;
  public readonly registry: CharacterRegistryLike;

  private readonly _states = new Map<number, MoveState>();

  /** Ground level sampler (simple flat-world version; swap with heightmap query in prod) */
  private _groundY = 0;

  /**
   * Creates a MovementController instance.
   * @param scene - The Babylon.js scene
   * @param registry - Character registry for slot management
   */
  constructor(scene: Scene, registry: CharacterRegistryLike) {
    this.scene = scene;
    this.registry = registry;
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Full authoritative update — runs on host for all slots,
   * and also on client for the local slot (client prediction).
   *
   * @param step - Fixed timestep (seconds)
   * @param input - Input manager for live input
   * @param localSlot - Slot to read live input for; others use queued input
   */
   
  update(step: number, input: any, localSlot: number | null): void {
    for (const [slot, state] of this.registry.slots) {
      if (state.isDead) continue;

      const mv = this._getOrCreate(slot);

      // Build a transient input snapshot for this slot
      const inp = (slot === localSlot && input)
        ? this._readLiveInput(input)
        : null;   // host uses queued input applied separately via applyInput()

      if (inp) this._simulate(slot, state, mv, inp, step);
      else this._simulatePhysicsOnly(slot, state, mv, step);
    }
  }

  /**
   * Apply a network input snapshot to a slot (host path for remote clients).
   * @param slot - The character slot
   * @param input - InputState-shaped object
   */
  applyInput(slot: number, input: InputSnapshot): void {
    const state = this.registry.getState(slot);
    if (!state || state.isDead) return;
    const mv = this._getOrCreate(slot);
    this._simulate(slot, state, mv, input, CONFIG.fixedStep);
  }

  /**
   * Gets the ground Y level at a position.
   * @param position - The position to sample
   * @returns Ground Y level
   */
  getGroundY(position?: Vector3): number {
    if (!position) return this._groundY;
    return this._sampleGround(position);
  }

  /**
   * Snaps a character state to the ground.
   * @param slotOrState - Slot number or character state object
   * @returns The ground Y level
   */
  snapStateToGround(slotOrState: number | MovementState): number {
    const state = typeof slotOrState === "number"
      ? this.registry.getState(slotOrState)
      : slotOrState;
    if (!state) return this._groundY;

    const groundY = this.getGroundY(state.position);
    state.position.y = groundY;
    state.velocity.y = 0;
    state.isGrounded = true;
    state.isFlying = false;
    if (state.rootNode) {
      state.rootNode.position.copyFrom(state.position);
    }
    if (state.lastSafePosition?.copyFrom) {
      state.lastSafePosition.copyFrom(state.position);
    }

    const mv = this._states.get(state.slot);
    if (mv) {
      mv.velocity.y = 0;
      mv.isGrounded = true;
      mv.isFlying = false;
      mv.lastGroundY = groundY;
      mv.landingTimer = 0;
    }

    return groundY;
  }

  /**
   * Sets the ground level.
   * @param y - Ground Y level
   */
  setGroundLevel(y: number): void {
    this._groundY = y;
  }

  /**
   * Removes a slot from the movement controller.
   * @param slot - The slot to remove
   */
  removeSlot(slot: number): void {
    this._states.delete(slot);
  }

  // ─── Core Simulation ─────────────────────────────────────────────────────

  private _simulate(
    slot: number,
    charState: MovementState,
    mv: MoveState,
    input: InputSnapshot,
    step: number
  ): void {
    // 1. Timers
    this._tickTimers(mv, step);

    // 2. Decide movement intent
    const wishDir = new Vector3(input.moveX, input.flyY, input.moveZ);
    charState.lastMoveInput?.copyFromFloats(input.moveX, input.flyY, input.moveZ);

    // 3. Flight toggle
    this._handleFlight(charState, mv, input, step);

    // 4. Dodge - check cooldown first, then stamina (fail fast pattern)
    if (input.btnDodge && !mv.isDodging) {
      if (mv.dodgeCooldownTimer <= 0 && mv.dodgeTimer <= 0) {
        this._startDodge(charState, mv, wishDir);
      }
    }

    // 5. Velocity build
    if (mv.isDodging) {
      this._updateDodge(mv, step);
    } else if (mv.knockbackTimer > 0) {
      this._updateKnockback(mv, step);
    } else if (mv.isFlying) {
      this._updateFlight(charState, mv, wishDir, step);
    } else {
      this._updateGroundMovement(charState, mv, wishDir, step);
    }

    // 6. Gravity (skip when flying or dodging)
    if (!mv.isFlying && !mv.isDodging) {
      this._applyGravity(mv, step);
    }

    // 7. Integrate position
    const displacement = mv.velocity.scale(step);
    charState.position.addInPlace(displacement);

    // 8. Ground collision
    this._resolveGround(charState, mv);

    // 9. Sync root node
    if (charState.rootNode) {
      charState.rootNode.position.copyFrom(charState.position);
      this._orientToVelocity(charState, mv, step);
    }

    // 10. Copy back to charState for network sync
    charState.velocity.copyFrom(mv.velocity);
    charState.isFlying = mv.isFlying;
    charState.isGrounded = mv.isGrounded;
  }

  /** Physics-only pass for remote slots on client (no input, just extrapolate) */
  private _simulatePhysicsOnly(
    slot: number,
    charState: MovementState,
    mv: MoveState,
    step: number
  ): void {
    this._tickTimers(mv, step);
    if (!mv.isFlying && !mv.isDodging) this._applyGravity(mv, step);
    charState.position.addInPlace(mv.velocity.scale(step));
    this._resolveGround(charState, mv);
    mv.velocity.scaleInPlace(mv.isGrounded ? 0.85 : 0.99);  // light friction
    charState.velocity.copyFrom(mv.velocity);
  }

  // ─── Flight ──────────────────────────────────────────────────────────────

  private _handleFlight(
    charState: MovementState,
    mv: MoveState,
    input: InputSnapshot,
    step = 0.016
  ): void {
    const flyPressed = input.flyY > 0.1;
    const flyDown = input.flyY < -0.1;

    // Reset trigger when button released so next press activates
    if (!flyPressed) {
      mv.jumpTriggered = false;
    }

    // Grounded + press = normal jump (free, no flight mode)
    if (flyPressed && mv.isGrounded && !mv.jumpTriggered) {
      mv.velocity.y = CONFIG.movement.jumpImpulse;
      mv.isGrounded = false;
      mv.jumpTriggered = true;
      mv.coyoteTimer = 0;
      return;
    }

    // Airborne + press = enter flight mode (costs ki)
    if (flyPressed && !mv.isGrounded && !mv.isFlying && !mv.jumpTriggered) {
      if (charState.ki >= CONFIG.movement.flightKiCost) {
        mv.isFlying = true;
        charState.ki -= CONFIG.movement.flightKiCost;
        mv.jumpTriggered = true;
      }
    }

    if (flyDown && mv.isFlying && charState.position.y <= mv.lastGroundY + 0.6) {
      // Land intentionally
      mv.isFlying = false;
      mv.landingTimer = CONFIG.movement.landingLockout;
    }

    // Drain ki while flying
    if (mv.isFlying) {
      charState.ki -= CONFIG.movement.flyingKiDrain * step;
      if (charState.ki <= 0) {
        charState.ki = 0;
        mv.isFlying = false;
      }
    }
  }

  // ─── Ground Movement ─────────────────────────────────────────────────────

  private _updateGroundMovement(
    charState: MovementState,
    mv: MoveState,
    wishDir: Vector3,
    step: number
  ): void {
    if (mv.landingTimer > 0) {
      // Slow deceleration on landing
      mv.velocity.x *= 0.7;
      mv.velocity.z *= 0.7;
      return;
    }

    const speed = CONFIG.movement.groundSpeed * (charState.characterDef?.baseSpeed ?? 10) / 10;
    const accel = CONFIG.movement.groundAccel;
    const friction = mv.isGrounded ? CONFIG.movement.groundFriction : CONFIG.movement.airFriction;

    // Project wishDir onto XZ
    const flatWish = new Vector3(wishDir.x, 0, wishDir.z);

    if (flatWish.lengthSquared() > 0.01) {
      const inputMag = Math.min(1, flatWish.length());
      const targetVel = flatWish.normalize().scale(speed * inputMag);
      mv.velocity.x = Scalar.Lerp(mv.velocity.x, targetVel.x, accel * step);
      mv.velocity.z = Scalar.Lerp(mv.velocity.z, targetVel.z, accel * step);
    } else {
      mv.velocity.x = Scalar.Lerp(mv.velocity.x, 0, friction * step);
      mv.velocity.z = Scalar.Lerp(mv.velocity.z, 0, friction * step);
    }
  }

  // ─── Flight Movement ─────────────────────────────────────────────────────

  private _updateFlight(
    charState: MovementState,
    mv: MoveState,
    wishDir: Vector3,
    step: number
  ): void {
    const speed = CONFIG.movement.flightSpeed * (charState.characterDef?.baseSpeed ?? 10) / 10;
    const accel = CONFIG.movement.flightAccel;
    const drag = CONFIG.movement.flightDrag;

    // Full 3D movement while flying
    const boost = charState.currentTransform
      ? 1 + (charState.currentTransform.plMultiplier / 1000) * CONFIG.movement.transformSpeedBonus
      : 1.0;

    if (wishDir.lengthSquared() > 0.01) {
      const target = wishDir.normalize().scale(speed * boost);
      mv.velocity.x = Scalar.Lerp(mv.velocity.x, target.x, accel * step);
      mv.velocity.y = Scalar.Lerp(mv.velocity.y, target.y, accel * step);
      mv.velocity.z = Scalar.Lerp(mv.velocity.z, target.z, accel * step);
    } else {
      // Float — decay all axes gently
      mv.velocity.scaleInPlace(1 - drag * step);
    }

    // Speed cap (velocity clamping behavior)
    const hspeed = Math.sqrt(mv.velocity.x ** 2 + mv.velocity.z ** 2);
    if (hspeed > speed * boost * 1.2) {
      const scale = (speed * boost * 1.2) / hspeed;
      mv.velocity.x *= scale;
      mv.velocity.z *= scale;
    }
  }

  // ─── Dodge ───────────────────────────────────────────────────────────────

  private _startDodge(
    charState: MovementState,
    mv: MoveState,
    wishDir: Vector3
  ): void {
    // Check stamina first
    if (charState.stamina < CONFIG.movement.dodgeStaminaCost) return;

    const dir = wishDir.lengthSquared() > 0.01
      ? wishDir.normalize()
      : this._getForwardDirection(charState); // forward if no direction
    
    // Bug fix: Use mv.isFlying as source of truth for flying, not charState.isFlying
    if (!mv.isFlying) dir.y = 0;
    if (dir.lengthSquared() <= 0.0001) dir.copyFromFloats(0, 0, 1);
    dir.normalize();

    charState.stamina -= CONFIG.movement.dodgeStaminaCost;
    charState.lastDodgeTime = performance.now();
    mv.isDodging = true;
    mv.dodgeTimer = CONFIG.movement.dodgeDuration;
    mv.dodgeCooldownTimer = CONFIG.movement.dodgeCooldown;
    mv.dodgeDirection = dir.clone();

    // Burst of speed in dodge direction
    mv.velocity = dir.scale(CONFIG.movement.dodgeSpeed);

    // Brief invincibility flag on charState (frame-based, not setTimeout)
    charState.isInvincible = true;
    mv.invincibilityTimer = CONFIG.movement.dodgeInvincibilityMs / 1000;
  }

  private _updateDodge(mv: MoveState, _step: number): void {
    // Maintain dodge velocity with light decay
    mv.velocity = mv.dodgeDirection.scale(
      CONFIG.movement.dodgeSpeed * Math.max(0, mv.dodgeTimer / CONFIG.movement.dodgeDuration)
    );
  }

  // ─── Knockback ────────────────────────────────────────────────────────────

  /**
   * Apply an external knockback to a slot (called by CombatSystem).
   * @param slot - The character slot
   * @param force - Knockback force vector
   * @param duration - Duration in seconds
   */
  applyKnockback(slot: number, force: Vector3, duration = 0.3): void {
    const mv = this._getOrCreate(slot);
    mv.velocity.copyFrom(force);
    mv.knockbackTimer = duration;
    mv.isGrounded = false;

    const charState = this.registry.getState(slot);
    if (charState) charState.isGrounded = false;
  }

  private _updateKnockback(mv: MoveState, step: number): void {
    // Let the velocity ride out — just decay it a bit
    mv.velocity.scaleInPlace(1 - CONFIG.movement.knockbackDecay * step);
  }

  // ─── Gravity & Ground ────────────────────────────────────────────────────

  private _applyGravity(mv: MoveState, step: number): void {
    if (mv.isGrounded) return;
    const zone = this._currentZoneGravity();
    mv.velocity.y += zone * step;
    mv.velocity.y = Math.max(mv.velocity.y, CONFIG.movement.terminalVelocity);
  }

  private _resolveGround(charState: MovementState, mv: MoveState): void {
    if (!this._isFiniteVector3(charState.position)) {
      this._recoverToSafePosition(charState, mv, "non-finite world position");
      return;
    }

    const safeFloorY = (charState.lastSafePosition?.y ?? charState.spawnPosition?.y ?? this._groundY) - 8;
    if (charState.position.y < safeFloorY) {
      this._recoverToSafePosition(charState, mv, "fell below safe floor");
      return;
    }

    const groundY = this._sampleGround(charState.position);
    const groundSnapMargin = 0.05;

    if (charState.position.y <= groundY + groundSnapMargin) {
      charState.position.y = groundY;
      mv.velocity.y = Math.max(0, mv.velocity.y);
      mv.isGrounded = true;
      mv.isFlying = false;
      mv.jumpTriggered = false;
      mv.landingTimer = mv.velocity.length() > 8 ? CONFIG.movement.landingLockout : 0;
      mv.lastGroundY = groundY;
      if (charState.lastSafePosition?.copyFrom) {
        charState.lastSafePosition.copyFrom(charState.position);
      }
    } else {
      mv.isGrounded = false;
    }
  }

  /** Ground raycast distance: 8.0 units */
  private _sampleGround(position: Vector3): number {
    // Raycast downward from slightly above the character's feet
    const origin = new Vector3(position.x, position.y + 0.5, position.z);
    const ray = new Ray(origin, Vector3.Down(), 8.0);
    const hit = this.scene.pickWithRay(ray, (mesh) => mesh.isPickable && !(mesh as { isCharacter?: boolean }).isCharacter);
    if (hit?.hit && hit.pickedPoint) {
      return hit.pickedPoint.y;
    }
    return this._groundY;
  }

  private _currentZoneGravity(): number {
    // This would be pulled from ZoneManager — using a cached value here
    return CONFIG.movement.defaultGravity;
  }

  // ─── Character Orientation ───────────────────────────────────────────────

  private _orientToVelocity(charState: MovementState, mv: MoveState, step: number): void {
    const flat = new Vector3(mv.velocity.x, 0, mv.velocity.z);
    if (flat.lengthSquared() < 0.5) return;   // don't rotate when barely moving

    const targetAngle = Math.atan2(flat.x, flat.z);

    // Bug fix: Add null check for charState.rootNode before accessing rotation
    if (!charState.rootNode) return;

    const cur = charState.rootNode.rotation.y;
    const delta = this._angleDiff(targetAngle, cur);
    charState.rootNode.rotation.y = cur + delta * Math.min(1, CONFIG.movement.rotationSpeed * step);
  }

  private _angleDiff(a: number, b: number): number {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  // ─── Timer Ticks ─────────────────────────────────────────────────────────

  private _tickTimers(mv: MoveState, step: number): void {
    if (mv.dodgeTimer > 0) {
      mv.dodgeTimer -= step;
      if (mv.dodgeTimer <= 0) { mv.isDodging = false; mv.dodgeTimer = 0; }
    }
    if (mv.invincibilityTimer > 0) {
      mv.invincibilityTimer -= step;
      if (mv.invincibilityTimer <= 0) {
        mv.invincibilityTimer = 0;
        const charState = this.registry.getState(mv._slot);
        if (charState) charState.isInvincible = false;
      }
    }
    if (mv.landingTimer > 0) mv.landingTimer = Math.max(0, mv.landingTimer - step);
    if (mv.dodgeCooldownTimer > 0) mv.dodgeCooldownTimer = Math.max(0, mv.dodgeCooldownTimer - step);
    if (mv.knockbackTimer > 0) mv.knockbackTimer = Math.max(0, mv.knockbackTimer - step);
    if (mv.coyoteTimer > 0) mv.coyoteTimer = Math.max(0, mv.coyoteTimer - step);
  }

  // ─── Live Input Reader ───────────────────────────────────────────────────

   
  private _readLiveInput(input: any): InputSnapshot {
    const move = input.getMovementVector?.() ?? Vector3.Zero();
    return {
      moveX: move.x,
      moveZ: move.z,
      flyY: input.getFlyAxis?.() ?? 0,
      btnDodge: input.isJustPressed?.("DODGE") ?? false,
      btnAttack: input.isHeld?.("ATTACK_LIGHT") ?? false,
      btnHeavy: input.isHeld?.("ATTACK_HEAVY") ?? false,
      btnKi: input.isHeld?.("KI_CHARGE") ?? false,
      btnBlast: input.isHeld?.("KI_BLAST") ?? false,
      btnTransform: input.isJustPressed?.("TRANSFORM") ?? false,
      btnTransformDown: input.isJustPressed?.("TRANSFORM_DOWN") ?? false,
      btnUltimate: input.isJustPressed?.("ULTIMATE") ?? false,
      btnRush: input.isJustPressed?.("RUSH_COMBO") ?? false,
      btnGrab: input.isJustPressed?.("GRAB") ?? false,
      lockedSlot: input.lockedTargetSlot ?? null,
      mashCount: input.getMashCount?.() ?? 0,
    };
  }

  private _getForwardDirection(charState: MovementState): Vector3 {
    if (!charState.rootNode) return new Vector3(0, 0, 1);
    const yaw = charState.rootNode.rotation.y;
    return new Vector3(Math.sin(yaw), 0, Math.cos(yaw)).normalize();
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private _getOrCreate(slot: number): MoveState {
    if (!this._states.has(slot)) {
      const mv = new MoveState();
      mv._slot = slot;
      this._states.set(slot, mv);
    }
    return this._states.get(slot)!;
  }

  private _isFiniteVector3(vec: Vector3): boolean {
    return Number.isFinite(vec.x)
      && Number.isFinite(vec.y)
      && Number.isFinite(vec.z);
  }

  private _recoverToSafePosition(
    charState: MovementState,
    mv: MoveState,
    reason = "invalid movement state"
  ): void {
    const fallback = charState.lastSafePosition ?? charState.spawnPosition ?? new Vector3(0, this._groundY, 0);
    const safeX = Number.isFinite(fallback.x) ? fallback.x : 0;
    const safeY = Number.isFinite(fallback.y) ? fallback.y : this._groundY;
    const safeZ = Number.isFinite(fallback.z) ? fallback.z : 0;

    charState.position.copyFromFloats(safeX, safeY, safeZ);
    charState.velocity.setAll(0);
    charState.isGrounded = true;
    charState.isFlying = false;
    charState.isInvincible = false;
    if (charState.rootNode) {
      charState.rootNode.position.copyFrom(charState.position);
    }

    mv.velocity.setAll(0);
    mv.isGrounded = true;
    mv.isFlying = false;
    mv.isDodging = false;
    mv.dodgeTimer = 0;
    mv.knockbackTimer = 0;
    mv.invincibilityTimer = 0;
    mv.lastGroundY = safeY;

    if (charState.lastSafePosition?.copyFrom) {
      charState.lastSafePosition.copyFrom(charState.position);
    }
    log.warn(`Recovered slot ${charState.slot} from ${reason}.`);
  }
}
