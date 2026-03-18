// src/core/CombatSystem.ts
// Authoritative combat logic — runs on HOST only.
// Handles melee combos, ki blasts, ultimate attacks, beam clashes, and hit detection.
// Sub-modules live in ./combat/; this file re-exports public API for backward compat.

import { Vector3 } from "@babylonjs/core";
import type { Scene } from "@babylonjs/core";

import { ATTACK_TYPE, ATTACK_CATALOG } from "./combat/AttackCatalog.js";
import type { AttackDefinition, AttackTypeId } from "./combat/AttackCatalog.js";
import { ComboTracker } from "./combat/ComboTracker.js";
import { Projectile } from "./combat/Projectile.js";
import { BeamEntity } from "./combat/BeamEntity.js";
import { BeamClash } from "./combat/BeamClash.js";

export { ATTACK_TYPE, ATTACK_CATALOG };

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface RootNode {
  position: Vector3;
  rotation: { y: number };
}

interface CharacterState {
  slot: number;
  playerId: string;
  isDead: boolean;
  isInvincible?: boolean;
  isBlocking?: boolean;
  isFlying?: boolean;
  isChargingKi?: boolean;
  isGrounded?: boolean;
  ki: number;
  stamina: number;
  powerLevel: number;
  position: Vector3;
  velocity: Vector3;
  rootNode?: RootNode | null;
  teamId?: string;
  entityType?: string;
  enemyDefId?: string;
  xpReward?: number;
  isBoss?: boolean;
  lastDodgeTime?: number;
  lastMeleeTime?: number;
}

interface CombatRegistry {
  getState(slot: number): CharacterState | null;
  getStateByPlayerId(playerId: string): CharacterState | null;
  slots: Map<number, CharacterState>;
  applyDamage(slot: number, damage: number, sourcePlayerId?: string | null): number;
  applyHeal(slot: number, amount: number): number;
}

interface MovementController {
  applyKnockback(slot: number, impulse: Vector3, duration: number): void;
}

interface InputData {
  targetSlot?: number;
  direction?: { x: number; y?: number; z: number };
  chargeFactor?: number;
}

interface ChargeState {
  attackId: string;
  startedAt: number;
}

// ─── Event Types ──────────────────────────────────────────────────────────────

type CombatEventName =
  | "onHit"
  | "onKill"
  | "onCombo"
  | "onBeamFired"
  | "onBeamClash"
  | "onUltimate"
  | "onEnemyDefeated"
  | "onBossDefeated"
  | "onDamageTakenByPlayer"
  | "onZVanish"
  | "onMeleeClash"
  | "onProjectileDeflected";

type CombatListener = (data: unknown) => void;

// ─── CombatSystem ─────────────────────────────────────────────────────────────

export class CombatSystem {
  readonly scene: Scene;
  readonly registry: CombatRegistry;
  movement: MovementController | null;

  readonly projectiles = new Map<string, Projectile>();
  readonly beams = new Map<string, BeamEntity>();
  readonly comboTrackers = new Map<number, ComboTracker>();
  readonly chargingSlots = new Map<number, ChargeState>();
  readonly cooldowns = new Map<number, number>();
  readonly activeClashes = new Map<string, BeamClash>();

  private _projectileCounter = 0;
  private _beamCounter = 0;
  private _clashedSlotsThisFrame = new Set<number>();

  private _listeners: Record<string, CombatListener[]> = {
    onHit: [],
    onKill: [],
    onCombo: [],
    onBeamFired: [],
    onBeamClash: [],
    onUltimate: [],
    onEnemyDefeated: [],
    onBossDefeated: [],
    onDamageTakenByPlayer: [],
    onZVanish: [],
    onMeleeClash: [],
    onProjectileDeflected: [],
  };

  constructor(scene: Scene, registry: CombatRegistry, movement: MovementController | null = null) {
    this.scene = scene;
    this.registry = registry;
    this.movement = movement;
  }

  // ─── Main Update ─────────────────────────────────────────────────────────

  update(delta: number): void {
    this._clashedSlotsThisFrame.clear();
    const deltaMs = delta * 1000;

    // Advance game time on all combo trackers so they pause correctly
    for (const [, tracker] of this.comboTrackers) {
      tracker.gameTimeMs += deltaMs;
    }

    if (!this.projectiles.size && !this.beams.size && !this.activeClashes.size) return;

    for (const [id, proj] of this.projectiles) {
      proj.update(delta);
      if (!proj.alive) { this.projectiles.delete(id); continue; }
      this._checkProjectileHits(proj);
    }

    for (const [id, beam] of this.beams) {
      beam.update(deltaMs);
      if (!beam.alive) { this.beams.delete(id); continue; }
      this._checkBeamHits(beam);
    }

    for (const [id, clash] of this.activeClashes) {
      clash.update(deltaMs);
      if (clash.resolved) this.activeClashes.delete(id);
    }
  }

  // ─── Attack Entry Point ─────────────────────────────────────────────────

  processAttack(playerId: string, attackId: string, inputData: InputData = {}): unknown {
    const state = this.registry.getStateByPlayerId(playerId);
    if (this._clashedSlotsThisFrame.has(state?.slot ?? -1)) {
      return { type: "CLASHED", attackId, ownerSlot: state?.slot };
    }

    if (!state || state.isDead) return null;

    const attackDef = ATTACK_CATALOG[attackId];
    if (!attackDef) { console.warn(`[Combat] Unknown attack: ${attackId}`); return null; }

    const lastAttack = this.cooldowns.get(state.slot) ?? 0;
    const minGap = attackDef.castTime ?? 100;
    if (performance.now() - lastAttack < minGap) return null;

    if (state.ki < attackDef.kiCost) return null;
    if (state.stamina < (attackDef.staminaCost ?? 0)) return null;

    state.ki -= attackDef.kiCost;
    state.stamina -= attackDef.staminaCost ?? 0;
    this.cooldowns.set(state.slot, performance.now());

    if (attackDef.type !== ATTACK_TYPE.HEAL_PULSE) {
      this._prepareAttackFacing(state, inputData);
    }

    if (
      attackDef.type === ATTACK_TYPE.MELEE_LIGHT ||
      attackDef.type === ATTACK_TYPE.MELEE_HEAVY ||
      attackDef.type === ATTACK_TYPE.SWORD_LIGHT ||
      attackDef.type === ATTACK_TYPE.SWORD_HEAVY ||
      attackDef.type === ATTACK_TYPE.RUSH_COMBO ||
      attackDef.type === ATTACK_TYPE.GRAB
    ) {
      state.lastMeleeTime = performance.now();
    }

    switch (attackDef.type) {
      case ATTACK_TYPE.MELEE_LIGHT:
      case ATTACK_TYPE.MELEE_HEAVY:
      case ATTACK_TYPE.SWORD_LIGHT:
      case ATTACK_TYPE.SWORD_HEAVY:
        return this._processMelee(state, attackId, attackDef, inputData);

      case ATTACK_TYPE.KI_BLAST:
      case ATTACK_TYPE.SWORD_RANGED:
      case ATTACK_TYPE.MAGIC_ATTACK:
        return this._spawnProjectile(state, attackId, attackDef, inputData);

      case ATTACK_TYPE.KI_BEAM:
      case ATTACK_TYPE.SWORD_BEAM:
        return this._processBeam(state, attackId, attackDef, inputData);

      case ATTACK_TYPE.HEAL_PULSE:
        return this._processSupport(state, attackId, attackDef);

      case ATTACK_TYPE.ULTIMATE:
        return this._processUltimate(state, attackId, attackDef, inputData);

      case ATTACK_TYPE.RUSH_COMBO:
        return this._processRushCombo(state, attackDef, inputData);

      case ATTACK_TYPE.GRAB:
        return this._processGrab(state, attackDef, inputData);

      default:
        return null;
    }
  }

  // ─── Start / Cancel Charging ────────────────────────────────────────────

  startCharge(playerId: string, attackId: string): void {
    const state = this.registry.getStateByPlayerId(playerId);
    if (!state || state.isDead) return;

    const def = ATTACK_CATALOG[attackId];
    if (!def?.chargeTime) return;

    this.chargingSlots.set(state.slot, { attackId, startedAt: performance.now() });
    state.isChargingKi = true;
  }

  releaseCharge(playerId: string, attackId: string): unknown {
    const state = this.registry.getStateByPlayerId(playerId);
    if (!state) return null;

    const charge = this.chargingSlots.get(state.slot);
    if (!charge || charge.attackId !== attackId) return null;

    const elapsed = performance.now() - charge.startedAt;
    this.chargingSlots.delete(state.slot);
    state.isChargingKi = false;

    const def = ATTACK_CATALOG[attackId];
    if (!def) return null;
    const chargeFactor = Math.min(1.0, elapsed / (def.chargeTime ?? 1));

    return this.processAttack(playerId, attackId, { chargeFactor });
  }

  // ─── Melee Logic ────────────────────────────────────────────────────────

  private _processMelee(
    state: CharacterState,
    attackId: string,
    attackDef: AttackDefinition,
    inputData: InputData = {},
  ): unknown {
    const attackDirection = this._resolveAttackDirection(state, inputData);
    const { targetSlot } = inputData;

    this._applyAttackLunge(state, attackDef, attackDirection, targetSlot);

    const hits = this._meleeScan(state, attackDef.range ?? 3.5, attackDef, attackDirection, targetSlot);

    if (hits.length === 0) {
      return { type: "MISS", attackId, ownerSlot: state.slot };
    }

    const events: unknown[] = [];
    const combo = this._getCombo(state.slot);
    const comboSeed = combo.isActive ? combo.hits : 0;
    const comboMultiplier =
      1 +
      Math.min(comboSeed, 8) * 0.12 +
      (attackDef.breaksGuard && comboSeed >= 2 ? 0.1 : 0);

    for (const tSlot of hits) {
      const target = this.registry.getState(tSlot);
      if (!target || target.isDead) continue;
      if (target.isInvincible) continue;
      if (!this._canDamage(state, target)) continue;

      const now = performance.now();

      // 1. Z-Vanish (Perfect Dodge) Check
      if (target.lastDodgeTime && now - target.lastDodgeTime < 200 && target.stamina >= 20) {
        this._executeZVanish(target, state);
        continue;
      }

      // 2. Melee Clash Check
      if (target.lastMeleeTime && now - target.lastMeleeTime < 150) {
        this._executeMeleeClash(state, target);
        // The attack is fully negated by the clash.
        return { type: "CLASH", attackId, ownerSlot: state.slot, opponentSlot: tSlot };
      }

      const blocked = target.isBlocking ?? false;
      const rawDamage = this._scaleDamage(
        (attackDef.baseDamage ?? 0) * comboMultiplier,
        state.powerLevel,
        target.powerLevel,
      );
      const finalDamage = blocked ? Math.round(rawDamage * 0.3) : rawDamage;
      const actualDamage = this.registry.applyDamage(tSlot, finalDamage, state.playerId);

      const comboCount = combo.register(actualDamage, attackDef.comboWindow ?? 400);
      const impactType =
        blocked
          ? "BLOCK"
          : attackDef.breaksGuard || comboCount >= 5 || (attackDef.knockback ?? 0) >= 10
            ? "HEAVY"
            : "LIGHT";

      if (!blocked) {
        const isLauncher = comboCount === 5 || comboCount === 9;
        const comboKnockback = (attackDef.knockback ?? 0) * (1 + Math.min(comboCount - 1, 6) * 0.1);
        this._applyKnockback(target, state.position, comboKnockback, isLauncher);
      } else {
        this._applyKnockback(target, state.position, Math.max(2.0, (attackDef.knockback ?? 0) * 0.22));
      }

      if (comboCount >= 3) {
        this._emit("onCombo", {
          attackerSlot: state.slot,
          comboCount,
          totalDamage: combo.damageAccum,
        });
      }

      const evt = {
        type: "HIT",
        attackId,
        attackerSlot: state.slot,
        targetSlot: tSlot,
        damage: actualDamage,
        blocked,
        comboCount,
        knockback: attackDef.knockback,
        hitstun: attackDef.hitstun ?? 0,
        impactType,
      };
      events.push(evt);

      this._emit("onHit", evt);
      this._emitDamageEvents(state, target, actualDamage, attackId);

      if (target.isDead) {
        this._emit("onKill", { killerSlot: state.slot, targetSlot: tSlot });
        this._emitDeathEvents(state, target);
      }
    }

    return events.length > 0
      ? { type: "MELEE_ATTACK", attackId, ownerSlot: state.slot, events }
      : { type: "MISS", attackId, ownerSlot: state.slot };
  }

  // ─── Projectile Logic ──────────────────────────────────────────────────

  private _spawnProjectile(
    state: CharacterState,
    attackId: string,
    attackDef: AttackDefinition,
    inputData: InputData = {},
  ): unknown {
    let dir = this._resolveAttackDirection(state, inputData);
    
    // Apply aim assist if we have a locked target
    if (inputData.targetSlot != null && attackDef.projectileSpeed) {
      const target = this.registry.getState(inputData.targetSlot);
      if (target && !target.isDead) {
        const toTarget = target.position.subtract(state.position);
        const distance = toTarget.length();
        const timeToHit = distance / attackDef.projectileSpeed;
        
        // Predict target position
        const predictedPos = target.position.add(target.velocity.scale(timeToHit));
        const predictedDir = predictedPos.subtract(state.position).normalize();
        
        // Blend between input direction and predicted direction (aim assist)
        const assistStrength = 0.4; // 40% aim assist
        dir = Vector3.Lerp(dir, predictedDir, assistStrength).normalize();
      }
    }
    
    const id = `proj_${++this._projectileCounter}`;

    const proj = new Projectile({
      id,
      ownerId: state.playerId,
      ownerSlot: state.slot,
      attackId,
      origin: state.position.add(new Vector3(0, 1, 0)),
      direction: dir,
      speed: attackDef.projectileSpeed ?? 40,
      maxRange: attackDef.range ?? 80,
      attackDef,
      scene: this.scene,
    });

    this.projectiles.set(id, proj);

    return {
      type: "PROJECTILE_SPAWNED",
      id,
      attackId,
      ownerSlot: state.slot,
      origin: { x: proj.position.x, y: proj.position.y, z: proj.position.z },
      direction: { x: dir.x, y: dir.y, z: dir.z },
    };
  }

  private _checkProjectileHits(proj: Projectile): void {
    const hitRadiusSq = 1.5 * 1.5;
    const owner = this.registry.getState(proj.ownerSlot);
    for (const [slot, target] of this.registry.slots) {
      if (slot === proj.ownerSlot || target.isDead) continue;
      if (target.isInvincible) continue;
      if (owner && !this._canDamage(owner, target)) continue;

      const distSq = Vector3.DistanceSquared(proj.position, target.position);
      if (distSq < hitRadiusSq) {
        const now = performance.now();

        // 1. Z-Vanish Check
        if (target.lastDodgeTime && now - target.lastDodgeTime < 200 && target.stamina >= 20) {
          this._executeZVanish(target, owner);
          continue;
        }

        // 2. Projectile Deflection Check
        if (target.lastMeleeTime && now - target.lastMeleeTime < 150) {
          this._deflectProjectile(proj, target, owner);
          continue;
        }

        const rawDmg = this._scaleDamage(
          proj.attackDef.baseDamage ?? 0,
          owner?.powerLevel ?? 1,
          target.powerLevel,
        );
        const dmg = this.registry.applyDamage(slot, rawDmg, proj.ownerId);

        this._emit("onHit", {
          type: "HIT",
          attackId: proj.attackId,
          attackerSlot: proj.ownerSlot,
          targetSlot: slot,
          damage: dmg,
          projectile: true,
        });
        this._emitDamageEvents(owner, target, dmg, proj.attackId);

        if (!proj.attackDef.piercing) proj.destroy();
        if (target.isDead) {
          this._emit("onKill", { killerSlot: proj.ownerSlot, targetSlot: slot });
          this._emitDeathEvents(owner, target);
        }
        break;
      }
    }
  }

  // ─── Beam Logic ─────────────────────────────────────────────────────────

  private _processBeam(
    state: CharacterState,
    attackId: string,
    attackDef: AttackDefinition,
    inputData: InputData = {},
  ): unknown {
    const dir = this._resolveAttackDirection(state, inputData);
    const id = `beam_${++this._beamCounter}`;

    const beam = new BeamEntity({
      id,
      ownerId: state.playerId,
      ownerSlot: state.slot,
      attackDef,
      origin: state.position.add(new Vector3(0, 1.2, 0)),
      direction: dir,
      scene: this.scene,
    });

    beam.chargeFactor = inputData.chargeFactor ?? 1.0;

    this._checkForBeamClash(beam);
    this.beams.set(id, beam);
    this._emit("onBeamFired", { id, attackId, ownerSlot: state.slot, chargeFactor: beam.chargeFactor });

    return {
      type: "BEAM_FIRED",
      id,
      attackId,
      label: attackDef.label,
      ownerSlot: state.slot,
      chargeFactor: beam.chargeFactor,
      origin: { x: beam.origin.x, y: beam.origin.y, z: beam.origin.z },
      direction: { x: dir.x, y: dir.y, z: dir.z },
    };
  }

  private _checkBeamHits(beam: BeamEntity): void {
    const owner = this.registry.getState(beam.ownerSlot);
    const range = beam.attackDef.range ?? 150;
    const rangeSq = range * range;
    const hitRadiusSq = (beam.attackDef.hitRadius ?? 2.6) ** 2;

    for (const [slot, target] of this.registry.slots) {
      if (slot === beam.ownerSlot || target.isDead) continue;
      if (target.isInvincible) continue;
      if (owner && !this._canDamage(owner, target)) continue;
      if (beam.hitSlots.has(slot)) continue;

      const toTarget = target.position.subtract(beam.origin);
      const distSq = toTarget.lengthSquared();
      if (distSq > rangeSq) continue;

      const along = Vector3.Dot(beam.direction, toTarget);
      if (along <= 0 || along > range) continue;

      const perpSq = Math.max(0, distSq - along * along);
      if (perpSq > hitRadiusSq) continue;

      const now = performance.now();
      // Z-Vanish Check (Warps cleanly through the beam!)
      if (target.lastDodgeTime && now - target.lastDodgeTime < 200 && target.stamina >= 20) {
        this._executeZVanish(target, owner);
        continue;
      }

      const dmg = this._scaleDamage(
        (beam.attackDef.baseDamage ?? 0) * (beam.chargeFactor ?? 1.0),
        owner?.powerLevel ?? 1,
        target.powerLevel,
      );
      this.registry.applyDamage(slot, dmg, beam.ownerId);
      this._emit("onHit", {
        type: "HIT",
        attackId: beam.attackDef?.label ?? beam.id,
        attackerSlot: beam.ownerSlot,
        targetSlot: slot,
        damage: dmg,
        beam: true,
        impactType: "HEAVY",
      });
      this._emitDamageEvents(owner, target, dmg, beam.attackDef?.label ?? beam.id);
      if (target.isDead) {
        this._emit("onKill", { killerSlot: beam.ownerSlot, targetSlot: slot });
        this._emitDeathEvents(owner, target);
      }
      if (beam.attackDef.piercing) {
        beam.hitSlots.add(slot);
        continue;
      }
      beam.destroy();
      break;
    }
  }

  // ─── Beam Clash ─────────────────────────────────────────────────────────

  private _checkForBeamClash(newBeam: BeamEntity): void {
    for (const [, existing] of this.beams) {
      if (existing.ownerSlot === newBeam.ownerSlot) continue;
      const dot = Vector3.Dot(newBeam.direction, existing.direction);
      if (dot < -0.7) {
        const clash = new BeamClash({
          beamA: existing,
          beamB: newBeam,
          registry: this.registry,
          scene: this.scene,
          onResolve: (winner: BeamEntity, loser: BeamEntity) => {
            this._emit("onBeamClash", { winnerSlot: winner.ownerSlot, loserSlot: loser.ownerSlot });
            const loserState = this.registry.getState(loser.ownerSlot);
            if (loserState) {
              const clashDmg = this._scaleDamage(
                (winner.attackDef.baseDamage ?? 0) * 0.7,
                this.registry.getState(winner.ownerSlot)?.powerLevel ?? 1,
                loserState.powerLevel,
              );
              this.registry.applyDamage(loser.ownerSlot, clashDmg, winner.ownerId);
            }
            loser.destroy();
          },
        });
        this.activeClashes.set(`${existing.id}_${newBeam.id}`, clash);
        break;
      }
    }
  }

  // ─── Ultimate ───────────────────────────────────────────────────────────

  private _processUltimate(
    state: CharacterState,
    attackId: string,
    attackDef: AttackDefinition,
    inputData: InputData = {},
  ): unknown {
    if (attackDef.aoe) {
      const hits: { slot: number; damage: number }[] = [];
      const radiusSq = (attackDef.radius ?? 8) ** 2;
      for (const [slot, target] of this.registry.slots) {
        if (slot === state.slot || target.isDead) continue;
        if (!this._canDamage(state, target)) continue;
        const distSq = Vector3.DistanceSquared(state.position, target.position);
        if (distSq < radiusSq) {
          const dmg = this._scaleDamage(
            (attackDef.baseDamage ?? 0) * (inputData.chargeFactor ?? 1.0),
            state.powerLevel,
            target.powerLevel,
          );
          const actual = this.registry.applyDamage(slot, dmg, state.playerId);
          hits.push({ slot, damage: actual });
          this._emitDamageEvents(state, target, actual, attackId);
          this._applyKnockback(target, state.position, attackDef.knockback ?? 0);
          if (target.isDead) {
            this._emit("onKill", { killerSlot: state.slot, targetSlot: slot });
            this._emitDeathEvents(state, target);
          }
        }
      }
      this._emit("onUltimate", { slot: state.slot, attackId, hits });
      return { type: "ULTIMATE", attackId, label: attackDef.label, ownerSlot: state.slot, hits };
    }
    return this._processBeam(state, attackId, attackDef, inputData);
  }

  private _processSupport(
    state: CharacterState,
    attackId: string,
    attackDef: AttackDefinition,
  ): unknown {
    const healed: { slot: number; amount: number }[] = [];
    const sameTeam = [...this.registry.slots.entries()].filter(
      ([, target]) => target && !target.isDead && target.teamId === state.teamId,
    );
    const range = attackDef.range ?? 0;
    const rangeSq = range * range;

    for (const [slot, target] of sameTeam) {
      const inRange =
        range <= 0
          ? slot === state.slot
          : Vector3.DistanceSquared(state.position, target.position) <= rangeSq;
      if (!inRange) continue;

      const amount =
        slot === state.slot
          ? (attackDef.selfHeal ?? attackDef.healAmount ?? 0)
          : (attackDef.healAmount ?? 0);
      const actual = this.registry.applyHeal(slot, amount);
      if (actual > 0) healed.push({ slot, amount: actual });
    }

    return { type: "SUPPORT_CAST", attackId, label: attackDef.label, ownerSlot: state.slot, healed };
  }

  // ─── Rush Combo ─────────────────────────────────────────────────────────

  private _processRushCombo(
    state: CharacterState,
    attackDef: AttackDefinition,
    inputData: InputData = {},
  ): unknown {
    let { targetSlot } = inputData;
    let target = targetSlot != null ? this.registry.getState(targetSlot) : null;

    if (!target || target.isDead || target.isInvincible || !this._canDamage(state, target)) {
      const hits = this._meleeScan(state, attackDef.range ?? 3.0, attackDef, inputData.direction);
      if (hits.length > 0) {
        targetSlot = hits[0];
        target = this.registry.getState(targetSlot!);
      }
    }

    if (!target || target.isDead || target.isInvincible) {
      return { type: "MISS", attackId: "RUSH_COMBO", ownerSlot: state.slot };
    }

    const RUSH_HITS = 8;
    let totalDamage = 0;
    const hitLog: number[] = [];

    this._applyAttackLunge(
      state,
      attackDef,
      target.position.subtract(state.position).normalize(),
      targetSlot,
    );

    for (let i = 0; i < RUSH_HITS; i++) {
      const dmg = this._scaleDamage(
        (attackDef.baseDamage ?? 120) * 0.6,
        state.powerLevel,
        target.powerLevel,
      );
      const actual = this.registry.applyDamage(targetSlot!, dmg, state.playerId);
      totalDamage += actual;
      hitLog.push(actual);
    }

    this._applyKnockback(target, state.position, 20);
    this._emit("onCombo", { attackerSlot: state.slot, comboCount: RUSH_HITS, totalDamage });

    return { type: "RUSH_COMBO", attackId: "RUSH_COMBO", ownerSlot: state.slot, targetSlot, hitLog, totalDamage };
  }

  // ─── Grab ───────────────────────────────────────────────────────────────

  private _processGrab(
    state: CharacterState,
    attackDef: AttackDefinition,
    inputData: InputData = {},
  ): unknown {
    let { targetSlot } = inputData;
    let target = targetSlot != null ? this.registry.getState(targetSlot) : null;

    if (!target || target.isDead || target.isInvincible || !this._canDamage(state, target)) {
      const hits = this._meleeScan(state, attackDef.range ?? 2.5, attackDef, inputData.direction);
      if (hits.length > 0) {
        targetSlot = hits[0];
        target = this.registry.getState(targetSlot!);
      }
    }

    if (!target || target.isDead || target.isInvincible) {
      return { type: "MISS", attackId: "GRAB", ownerSlot: state.slot };
    }

    const dist = Vector3.Distance(state.position, target.position);
    if (dist > (attackDef.range ?? 2.5)) {
      return { type: "MISS", attackId: "GRAB", ownerSlot: state.slot };
    }

    this._applyAttackLunge(
      state,
      attackDef,
      target.position.subtract(state.position).normalize(),
      targetSlot,
    );

    const dmg = this._scaleDamage(attackDef.baseDamage ?? 500, state.powerLevel, target.powerLevel);
    const actual = this.registry.applyDamage(targetSlot!, dmg, state.playerId);
    this._applyKnockback(target, state.position, attackDef.knockback ?? 15, true);

    return { type: "GRAB", attackId: "GRAB", ownerSlot: state.slot, targetSlot, damage: actual };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private _scaleDamage(base: number, attackerPL: number, defenderPL: number): number {
    const ratio = Math.max(0.05, attackerPL / Math.max(1, defenderPL));
    const scaled = base * Math.pow(ratio, 0.4);
    return Math.round(Math.max(50, scaled));
  }

  private _meleeScan(
    state: CharacterState,
    range: number,
    _attackDef: AttackDefinition,
    directionOverride?: Vector3 | InputData["direction"] | null,
    preferredSlot?: number,
  ): number[] {
    const preferredHits: number[] = [];
    const hits: number[] = [];
    const rawDir =
      directionOverride instanceof Vector3
        ? directionOverride
        : directionOverride && typeof directionOverride === "object" && "x" in directionOverride
          ? new Vector3(directionOverride.x, directionOverride.y ?? 0, directionOverride.z)
          : null;
    const facing = (rawDir ?? this._getFacingDirection(state)).clone().normalize();

    for (const [slot, target] of this.registry.slots) {
      if (slot === state.slot || target.isDead) continue;
      if (!this._canDamage(state, target)) continue;
      const toTarget = target.position.subtract(state.position);
      const maxRange = slot === preferredSlot ? range + 1.75 : range;
      const maxRangeSq = maxRange * maxRange;
      const distSq = toTarget.lengthSquared();
      if (distSq > maxRangeSq) continue;

      const invLen = distSq > 0.0001 ? 1 / Math.sqrt(distSq) : 0;
      const dot = invLen > 0 ? Vector3.Dot(facing, toTarget.scale(invLen)) : -1;
      const requiredDot = slot === preferredSlot ? 0.1 : 0.35;
      if (dot <= requiredDot) continue;

      if (slot === preferredSlot) preferredHits.push(slot);
      else hits.push(slot);
    }
    return [...preferredHits, ...hits];
  }

  private _applyKnockback(
    targetState: CharacterState,
    sourcePos: Vector3,
    force: number,
    upward = false,
  ): void {
    const dir = targetState.position.subtract(sourcePos);
    if (dir.lengthSquared() < 0.0001) dir.copyFromFloats(0, 0, 1);
    dir.normalize();
    if (upward) dir.y += 0.5;
    const impulse = dir.normalize().scale(force);
    const duration = Math.max(0.18, Math.min(0.45, 0.16 + force * 0.018));
    if (this.movement?.applyKnockback) {
      this.movement.applyKnockback(targetState.slot, impulse, duration);
    }
    targetState.isGrounded = false;
  }

  private _getFacingDirection(state: CharacterState): Vector3 {
    if (state.velocity.length() > 0.1) return state.velocity.clone().normalize();
    if (state.rootNode?.rotation) {
      const yaw = state.rootNode.rotation.y ?? 0;
      return new Vector3(Math.sin(yaw), 0, Math.cos(yaw)).normalize();
    }
    return Vector3.Forward();
  }

  private _resolveAttackDirection(state: CharacterState, inputData: InputData = {}): Vector3 {
    const rawDir = inputData?.direction;
    if (rawDir && typeof rawDir.x === "number" && typeof rawDir.z === "number") {
      const dir = new Vector3(rawDir.x, rawDir.y ?? 0, rawDir.z);
      if (dir.lengthSquared() > 0.0001) return dir.normalize();
    }

    const target = inputData?.targetSlot != null ? this.registry.getState(inputData.targetSlot) : null;
    if (target?.position) {
      const toTarget = target.position.subtract(state.position);
      if (toTarget.lengthSquared() > 0.0001) return toTarget.normalize();
    }

    return this._getFacingDirection(state);
  }

  private _prepareAttackFacing(
    state: CharacterState,
    inputData: InputData = {},
    resolvedDirection?: Vector3 | null,
  ): void {
    const dir = resolvedDirection ?? this._resolveAttackDirection(state, inputData);
    if (!state.rootNode || dir.lengthSquared() < 0.0001) return;
    state.rootNode.rotation.y = Math.atan2(dir.x, dir.z);
  }

  private _applyAttackLunge(
    state: CharacterState,
    attackDef: AttackDefinition,
    direction: Vector3,
    targetSlot?: number,
  ): void {
    if (!direction || direction.lengthSquared() < 0.0001) return;
    const target = targetSlot != null ? this.registry.getState(targetSlot) : null;
    const lungeDir = direction.clone();
    if (!(state.isFlying || target?.isFlying)) lungeDir.y = 0;
    if (lungeDir.lengthSquared() < 0.0001) return;
    lungeDir.normalize();
    const baseLunge = attackDef.breaksGuard ? 1.35 : 0.85;
    let lungeDistance = baseLunge;

    if (target?.position) {
      const assistReach = (attackDef.range ?? 3) + 1.5;
      const distSq = Vector3.DistanceSquared(state.position, target.position);
      if (distSq > assistReach * assistReach) return;
      const dist = Math.sqrt(distSq);
      lungeDistance = Math.min(baseLunge + 0.8, Math.max(0.2, dist - (attackDef.range ?? 3) * 0.75));
    }

    state.position.addInPlace(lungeDir.scale(lungeDistance));
    state.rootNode?.position.copyFrom(state.position);
  }

  private _getCombo(slot: number): ComboTracker {
    if (!this.comboTrackers.has(slot)) this.comboTrackers.set(slot, new ComboTracker());
    return this.comboTrackers.get(slot)!;
  }

  private _canDamage(attacker: CharacterState | null, target: CharacterState | null): boolean {
    if (!attacker || !target) return false;
    if (attacker.teamId && target.teamId && attacker.teamId === target.teamId) return false;
    return true;
  }

  private _emitDamageEvents(
    attacker: CharacterState | null,
    target: CharacterState | null,
    damage: number,
    attackId: string,
  ): void {
    if (!target) return;
    if (target.teamId === "HERO") {
      this._emit("onDamageTakenByPlayer", {
        attackerSlot: attacker?.slot,
        targetSlot: target.slot,
        damage,
        attackId,
      });
    }
  }

  private _emitDeathEvents(attacker: CharacterState | null, target: CharacterState | null): void {
    if (!target) return;
    if (target.entityType === "ENEMY") {
      this._emit("onEnemyDefeated", {
        slot: target.slot,
        enemyDefId: target.enemyDefId,
        killerSlot: attacker?.slot,
        xpReward: target.xpReward ?? 0,
        isBoss: !!target.isBoss,
      });
      if (target.isBoss) {
        this._emit("onBossDefeated", {
          slot: target.slot,
          enemyDefId: target.enemyDefId,
          killerSlot: attacker?.slot,
        });
      }
    }
  }

  // ─── Advanced Defensive Mechanics ─────────────────────────────────────────

  private _executeZVanish(evader: CharacterState, attacker: CharacterState | null): void {
    evader.stamina = Math.max(0, evader.stamina - 20);
    evader.lastDodgeTime = 0; // Consume the dodge

    if (attacker && attacker.position) {
      const attackerFacing = this._getFacingDirection(attacker);
      const vanishPos = attacker.position.subtract(attackerFacing.scale(2.5));
      vanishPos.y = attacker.position.y;

      evader.position.copyFrom(vanishPos);
      evader.velocity.setAll(0);

      if (evader.rootNode) {
        evader.rootNode.position.copyFrom(vanishPos);
        const toAttacker = attacker.position.subtract(evader.position);
        if (toAttacker.lengthSquared() > 0.001) {
          evader.rootNode.rotation.y = Math.atan2(toAttacker.x, toAttacker.z);
        }
      }
    }
    this._emit("onZVanish", { evaderSlot: evader.slot, attackerSlot: attacker?.slot });
  }

  private _executeMeleeClash(fighterA: CharacterState, fighterB: CharacterState): void {
    this._clashedSlotsThisFrame.add(fighterA.slot);
    this._clashedSlotsThisFrame.add(fighterB.slot);
    fighterA.lastMeleeTime = 0;
    fighterB.lastMeleeTime = 0;
    const midpoint = fighterA.position.add(fighterB.position).scale(0.5);
    this._emit("onMeleeClash", { slotA: fighterA.slot, slotB: fighterB.slot, position: midpoint });
    this._applyKnockback(fighterA, fighterB.position, 12.0);
    this._applyKnockback(fighterB, fighterA.position, 12.0);
  }

  private _deflectProjectile(proj: Projectile, deflector: CharacterState, originalOwner: CharacterState | null): void {
    deflector.lastMeleeTime = 0;
    this._emit("onProjectileDeflected", { deflectorSlot: deflector.slot, projId: proj.id });
    proj.direction.scaleInPlace(-1);
    if (originalOwner && originalOwner.position) {
      const toOwner = originalOwner.position.subtract(proj.position).normalize();
      proj.direction = Vector3.Lerp(proj.direction, toOwner, 0.8).normalize();
    }
    proj.ownerSlot = deflector.slot;
    proj.ownerId = deflector.playerId;
    proj.speed *= 1.5; // Accelerate it back!
  }

  // ─── Event System ───────────────────────────────────────────────────────

  on(event: CombatEventName, fn: CombatListener): () => void {
    (this._listeners[event] = this._listeners[event] || []).push(fn);
    return () => this.off(event, fn);
  }

  off(event: CombatEventName, fn: CombatListener): void {
    this._listeners[event] = (this._listeners[event] || []).filter((f) => f !== fn);
  }

  private _emit(event: CombatEventName, data: unknown): void {
    (this._listeners[event] || []).forEach((fn) => fn(data));
  }

  getAttackDef(attackId: string): AttackDefinition | null {
    return ATTACK_CATALOG[attackId] ?? null;
  }
}
