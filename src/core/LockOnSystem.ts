// src/core/LockOnSystem.ts
// Enhanced lock-on system with smart targeting, soft lock, and visual feedback

import { Vector3 } from "@babylonjs/core";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LockOnTarget {
  slot: number;
  position: Vector3;
  velocity: Vector3;
  isDead: boolean;
  isInvincible?: boolean;
  teamId?: string;
  characterDef?: { label?: string };
  health?: number;
  maxHealth?: number;
}

export interface LockOnCandidate {
  slot: number;
  score: number;
  distance: number;
  angle: number;
  isInFront: boolean;
  screenX?: number;
  screenY?: number;
}

export interface LockOnConfig {
  maxLockDistance: number;
  breakDistance: number;
  maxAngle: number;
  softLockAngle: number;
  softLockDistance: number;
  targetMemoryDuration: number;
  switchCooldown: number;
  predictionTime: number;
}

export const DEFAULT_LOCKON_CONFIG: LockOnConfig = {
  maxLockDistance: 30,
  breakDistance: 40,
  maxAngle: 75, // degrees
  softLockAngle: 25, // degrees - auto-target cone
  softLockDistance: 20,
  targetMemoryDuration: 2.0, // seconds to remember last target
  switchCooldown: 0.3, // seconds between switches
  predictionTime: 0.15, // seconds to predict target position
};

// ─── LockOnSystem ─────────────────────────────────────────────────────────────

export class LockOnSystem {
  private _config: LockOnConfig;
  private _lockedSlot: number | null = null;
  private _softLockSlot: number | null = null;
  private _lastLockedSlot: number | null = null;
  private _lastLockTime: number = 0;
  private _lastSwitchTime: number = 0;
  private _candidates: LockOnCandidate[] = [];
  private _lastPlayerPos: Vector3 = Vector3.Zero();
  private _lastPlayerFacing: Vector3 = Vector3.Forward();
  private _lastTargets: LockOnTarget[] = [];

  // Scratch vectors to avoid per-frame allocations
  private static _scratchToTarget: Vector3 = Vector3.Zero();
  private static _scratchToPlayer: Vector3 = Vector3.Zero();

  // Callbacks
  public onLockChanged: ((slot: number | null, prevSlot: number | null) => void) | null = null;
  public onSoftLockChanged: ((slot: number | null) => void) | null = null;

  constructor(config: Partial<LockOnConfig> = {}) {
    this._config = { ...DEFAULT_LOCKON_CONFIG, ...config };
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Update the lock-on system. Call every frame.
   */
  update(
    delta: number,
    playerPos: Vector3,
    playerFacing: Vector3,
    getTargets: () => LockOnTarget[],
    ownSlot: number
  ): void {
    this._lastPlayerPos.copyFrom(playerPos);
    this._lastPlayerFacing.copyFrom(playerFacing);

    const targets = getTargets().filter(t =>
      t.slot !== ownSlot &&
      !t.isDead &&
      t.teamId !== "HERO" // Don't target allies
    );

    // Store targets so getPredictedPosition / getAimAssist can look them up
    this._lastTargets = targets;

    // Update candidates with scoring
    this._candidates = this._scoreCandidates(targets, playerPos, playerFacing);

    // Update soft lock (auto-target)
    this._updateSoftLock();

    // Validate current hard lock
    this._validateHardLock(targets);

    // Auto-break if target too far
    if (this._lockedSlot !== null) {
      const locked = targets.find(t => t.slot === this._lockedSlot);
      if (locked) {
        const dist = Vector3.Distance(playerPos, locked.position);
        if (dist > this._config.breakDistance) {
          this._clearLock("distance");
        }
      }
    }
  }

  /**
   * Cycle to next target (hard lock)
   */
  cycleLock(forward: boolean = true): number | null {
    const now = performance.now() / 1000;
    if (now - this._lastSwitchTime < this._config.switchCooldown) {
      return this._lockedSlot;
    }

    if (this._candidates.length === 0) {
      this._setLock(null);
      this._lastSwitchTime = now;
      return null;
    }

    // Sort by score (highest first)
    const sorted = [...this._candidates].sort((a, b) => b.score - a.score);

    if (this._lockedSlot === null) {
      // Lock onto best target
      this._setLock(sorted[0]?.slot ?? null);
    } else {
      // Find current index and cycle
      const currentIdx = sorted.findIndex(c => c.slot === this._lockedSlot);
      if (currentIdx === -1) {
        // Current target no longer valid, pick best
        this._setLock(sorted[0]?.slot ?? null);
      } else if (sorted.length === 1) {
        // Only one candidate — toggle off
        this._setLock(null);
      } else {
        const nextIdx = forward
          ? (currentIdx + 1) % sorted.length
          : (currentIdx - 1 + sorted.length) % sorted.length;
        this._setLock(sorted[nextIdx]?.slot ?? null);
      }
    }

    this._lastSwitchTime = now;
    return this._lockedSlot;
  }

  /**
   * Quick switch to nearest threat
   */
  switchToNearest(): number | null {
    const now = performance.now() / 1000;
    if (now - this._lastSwitchTime < this._config.switchCooldown) {
      return this._lockedSlot;
    }

    // Find nearest candidate
    const nearest = this._candidates
      .filter(c => c.isInFront)
      .sort((a, b) => a.distance - b.distance)[0];

    if (nearest && nearest.slot !== this._lockedSlot) {
      this._setLock(nearest.slot);
      this._lastSwitchTime = now;
    }

    return this._lockedSlot;
  }

  /**
   * Switch to target that's attacking player — bypasses cooldown for responsiveness
   */
  switchToThreat(attackingSlot: number): number | null {
    if (this._lockedSlot === attackingSlot) return this._lockedSlot;

    const threat = this._candidates.find(c => c.slot === attackingSlot);
    if (threat) {
      this._setLock(attackingSlot);
      this._lastSwitchTime = performance.now() / 1000;
    }

    return this._lockedSlot;
  }

  /**
   * Clear hard lock
   */
  clearLock(): void {
    this._setLock(null);
  }

  /**
   * Get predicted position for projectile aiming
   */
  getPredictedPosition(targetSlot: number, projectileSpeed: number): Vector3 | null {
    const target = this._getTarget(targetSlot);
    if (!target) return null;

    const toTarget = target.position.subtract(this._lastPlayerPos);
    const distance = toTarget.length();
    const timeToHit = distance / Math.max(projectileSpeed, 1);
    
    // Predict target position
    const predicted = target.position.add(target.velocity.scale(timeToHit));
    
    // Add some smoothing for erratic movement
    const velocitySmooth = target.velocity.length();
    if (velocitySmooth > 10) {
      // High speed target - lead more
      predicted.addInPlace(target.velocity.scale(this._config.predictionTime));
    }

    return predicted;
  }

  /**
   * Get aim assist direction (blends toward target)
   */
  getAimAssist(inputDir: Vector3, assistStrength: number = 0.3): Vector3 {
    const targetSlot = this._lockedSlot ?? this._softLockSlot;
    if (targetSlot == null) return inputDir;

    const target = this._getTarget(targetSlot);
    if (!target) return inputDir;

    const toTarget = target.position.subtract(this._lastPlayerPos).normalize();
    const angle = Vector3.GetAngleBetweenVectors(inputDir, toTarget, Vector3.Up());
    
    // Only assist if input is somewhat toward target
    if (angle > this._config.maxAngle * (Math.PI / 180)) {
      return inputDir;
    }

    // Blend input toward target based on assist strength
    const blend = Math.min(1, assistStrength * (1 - angle / (this._config.maxAngle * Math.PI / 180)));
    return Vector3.Lerp(inputDir, toTarget, blend).normalize();
  }

  // ─── Getters ───────────────────────────────────────────────────────────────

  get lockedSlot(): number | null {
    return this._lockedSlot;
  }

  get softLockSlot(): number | null {
    return this._softLockSlot;
  }

  get candidates(): readonly LockOnCandidate[] {
    return this._candidates;
  }

  get hasLock(): boolean {
    return this._lockedSlot !== null;
  }

  get hasSoftLock(): boolean {
    return this._softLockSlot !== null;
  }

  // ─── Private Methods ───────────────────────────────────────────────────────

  private _scoreCandidates(
    targets: LockOnTarget[],
    playerPos: Vector3,
    playerFacing: Vector3
  ): LockOnCandidate[] {
    const candidates: LockOnCandidate[] = [];
    const toTarget = LockOnSystem._scratchToTarget;
    const toPlayer = LockOnSystem._scratchToPlayer;

    for (const target of targets) {
      target.position.subtractToRef(playerPos, toTarget);
      const distance = toTarget.length();

      if (distance > this._config.maxLockDistance) continue;

      toTarget.scaleInPlace(1 / distance); // normalize in-place
      const angleRad = Vector3.GetAngleBetweenVectors(playerFacing, toTarget, Vector3.Up());
      const angle = angleRad * (180 / Math.PI);
      const isInFront = angle < this._config.maxAngle;

      // Score calculation (higher is better)
      let score = 0;

      // Distance factor (closer is better)
      const distScore = Math.max(0, 1 - distance / this._config.maxLockDistance);
      score += distScore * 30;

      // Angle factor (in front is better)
      const angleScore = Math.max(0, 1 - angle / this._config.maxAngle);
      score += angleScore * 40;

      // Threat factor (low health targets are priority)
      if (target.health != null && target.maxHealth != null && target.maxHealth > 0) {
        const healthRatio = target.health / target.maxHealth;
        score += (1 - healthRatio) * 15;
      }

      // Velocity factor (moving toward player is more threatening)
      playerPos.subtractToRef(target.position, toPlayer);
      const toPlayerLen = toPlayer.length();
      if (toPlayerLen > 0.01) toPlayer.scaleInPlace(1 / toPlayerLen);
      const velLen = target.velocity.length();
      if (velLen > 0.01) {
        const threatDot = Vector3.Dot(toPlayer, target.velocity) / velLen;
        if (threatDot > 0.5) score += 10;
      }

      // Memory bonus for last locked target (stickiness)
      if (target.slot === this._lastLockedSlot) {
        const timeSinceLock = (performance.now() / 1000) - this._lastLockTime;
        if (timeSinceLock < this._config.targetMemoryDuration) {
          score += 20 * (1 - timeSinceLock / this._config.targetMemoryDuration);
        }
      }

      candidates.push({
        slot: target.slot,
        score,
        distance,
        angle,
        isInFront,
      });
    }

    return candidates;
  }

  private _updateSoftLock(): void {
    const prevSoft = this._softLockSlot;

    // Find best candidate in soft lock cone
    const best = this._candidates
      .filter(c => c.angle < this._config.softLockAngle && c.distance < this._config.softLockDistance)
      .sort((a, b) => b.score - a.score)[0];

    this._softLockSlot = best?.slot ?? null;

    if (this._softLockSlot !== prevSoft) {
      this.onSoftLockChanged?.(this._softLockSlot);
    }
  }

  private _validateHardLock(targets: LockOnTarget[]): void {
    if (this._lockedSlot === null) return;

    const locked = targets.find(t => t.slot === this._lockedSlot);
    if (!locked || locked.isDead) {
      // Target gone or dead — try auto-switching to next best candidate
      const next = this._candidates
        .filter(c => c.slot !== this._lockedSlot)
        .sort((a, b) => b.score - a.score)[0];
      this._setLock(next?.slot ?? null);
    }
    // Keep lock on invincible targets (e.g. during transformations) —
    // breaking lock mid-fight is disruptive
  }

  private _setLock(slot: number | null): void {
    if (this._lockedSlot === slot) return;

    const prevSlot = this._lockedSlot;
    this._lockedSlot = slot;

    if (slot !== null) {
      this._lastLockedSlot = slot;
      this._lastLockTime = performance.now() / 1000;
    }

    this.onLockChanged?.(slot, prevSlot);
  }

  private _clearLock(_reason: string): void {
    this._setLock(null);
  }

  private _getTarget(slot: number): LockOnTarget | null {
    return this._lastTargets.find(t => t.slot === slot) ?? null;
  }

  // ─── Configuration ─────────────────────────────────────────────────────────

  updateConfig(config: Partial<LockOnConfig>): void {
    this._config = { ...this._config, ...config };
  }

  getConfig(): LockOnConfig {
    return { ...this._config };
  }
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Calculate lead position for projectile aiming
 */
export function calculateLeadPosition(
  shooterPos: Vector3,
  targetPos: Vector3,
  targetVel: Vector3,
  projectileSpeed: number
): Vector3 {
  const toTarget = targetPos.subtract(shooterPos);
  const distance = toTarget.length();
  const timeToHit = distance / Math.max(projectileSpeed, 1);
  
  return targetPos.add(targetVel.scale(timeToHit));
}

/**
 * Check if target is within view cone
 */
export function isInViewCone(
  playerPos: Vector3,
  playerFacing: Vector3,
  targetPos: Vector3,
  maxAngle: number,
  maxDistance: number
): boolean {
  const toTarget = targetPos.subtract(playerPos);
  const distance = toTarget.length();
  
  if (distance > maxDistance) return false;
  
  toTarget.normalize();
  const angle = Vector3.GetAngleBetweenVectors(playerFacing, toTarget, Vector3.Up()) * (180 / Math.PI);
  
  return angle <= maxAngle;
}

/**
 * Get best target for auto-aim
 */
export function getBestTarget(
  playerPos: Vector3,
  playerFacing: Vector3,
  targets: LockOnTarget[],
  maxAngle: number = 45,
  maxDistance: number = 30
): LockOnTarget | null {
  let bestTarget: LockOnTarget | null = null;
  let bestScore = -Infinity;

  for (const target of targets) {
    if (target.isDead) continue;

    const toTarget = target.position.subtract(playerPos);
    const distance = toTarget.length();
    
    if (distance > maxDistance) continue;
    
    toTarget.normalize();
    const angle = Vector3.GetAngleBetweenVectors(playerFacing, toTarget, Vector3.Up()) * (180 / Math.PI);
    
    if (angle > maxAngle) continue;

    // Score: prefer closer and more centered targets
    const score = (1 - distance / maxDistance) * 50 + (1 - angle / maxAngle) * 50;
    
    if (score > bestScore) {
      bestScore = score;
      bestTarget = target;
    }
  }

  return bestTarget;
}
