// src/core/CombatSystem.ts
// Authoritative combat logic — runs on HOST only.
// Thin facade that delegates to focused subsystems under ./combat/.
// Maintains backward-compatible public API.

import { type Scene } from "@babylonjs/core";

import { Logger } from "./Logger.js";
import { ATTACK_TYPE, ATTACK_CATALOG, type AttackDefinition } from "./combat/AttackCatalog.js";
import { ComboTracker } from "./combat/ComboTracker.js";

// ─── Subsystems ──────────────────────────────────────────────────────────────

import { CombatEventBus, type CombatEventName, type CombatListener } from "./combat/CombatEventBus.js";
import { MeleeSystem } from "./combat/MeleeSystem.js";
import { ProjectileSystem } from "./combat/ProjectileSystem.js";
import { BeamSystem } from "./combat/BeamSystem.js";
import { UltimateSystem } from "./combat/UltimateSystem.js";
import { RushGrabSystem } from "./combat/RushGrabSystem.js";
import { prepareAttackFacing, type InputData } from "./combat/CombatHelpers.js";

const log = Logger.scoped("Combat");

export { ATTACK_TYPE, ATTACK_CATALOG };

// ─── Interfaces (imported from shared types) ─────────────────────────────────

import type {
  CombatState,
  CombatRegistry,
  KnockbackController,
} from "./types/CharacterViews";

export type { CombatState, CombatRegistry, KnockbackController };

// ─── Charge State ────────────────────────────────────────────────────────────

interface ChargeState {
  attackId: string;
  startedAt: number;
}

// ─── CombatSystem (Facade) ───────────────────────────────────────────────────

export class CombatSystem {
  readonly scene: Scene;
  readonly registry: CombatRegistry;
  movement: KnockbackController | null;

  // Subsystems
  private readonly _bus: CombatEventBus;
  private readonly _melee: MeleeSystem;
  private readonly _projectiles: ProjectileSystem;
  private readonly _beams: BeamSystem;
  private readonly _ultimates: UltimateSystem;
  private readonly _rushGrab: RushGrabSystem;

  // Shared state
  readonly comboTrackers = new Map<number, ComboTracker>();
  readonly chargingSlots = new Map<number, ChargeState>();
  readonly cooldowns = new Map<number, number>();
  private _clashedSlotsThisFrame = new Set<number>();

  // Expose projectile/beam maps for external consumers (HUD, VFX, etc.)
  get projectiles() { return this._projectiles.projectiles; }
  get beams() { return this._beams.beams; }
  get activeClashes() { return this._beams.activeClashes; }

  constructor(scene: Scene, registry: CombatRegistry, movement: KnockbackController | null = null) {
    this.scene = scene;
    this.registry = registry;
    this.movement = movement;

    this._bus = new CombatEventBus();
    this._melee = new MeleeSystem(registry, movement, this.comboTrackers, this._bus, this._clashedSlotsThisFrame);
    this._projectiles = new ProjectileSystem(scene, registry, movement, this._bus);
    this._beams = new BeamSystem(scene, registry, this._bus);
    this._ultimates = new UltimateSystem(registry, movement, this._bus, this._beams);
    this._rushGrab = new RushGrabSystem(registry, movement, this._bus);
  }

  // ─── Main Update ─────────────────────────────────────────────────────────

  update(delta: number): void {
    this._clashedSlotsThisFrame.clear();
    const deltaMs = delta * 1000;

    for (const [, tracker] of this.comboTrackers) {
      tracker.gameTimeMs += deltaMs;
    }

    if (!this.projectiles.size && !this.beams.size && !this.activeClashes.size) return;

    this._projectiles.update(delta);
    this._beams.update(deltaMs);
  }

  // ─── Attack Entry Point ─────────────────────────────────────────────────

  processAttack(playerId: string, attackId: string, inputData: InputData = {}): unknown {
    const state = this.registry.getStateByPlayerId(playerId);
    if (this._clashedSlotsThisFrame.has(state?.slot ?? -1)) {
      return { type: "CLASHED", attackId, ownerSlot: state?.slot };
    }

    if (!state || state.isDead) return null;

    const attackDef = ATTACK_CATALOG[attackId];
    if (!attackDef) { log.warn(`Unknown attack: ${attackId}`); return null; }

    const lastAttack = this.cooldowns.get(state.slot) ?? 0;
    const minGap = attackDef.castTime ?? 100;
    if (performance.now() - lastAttack < minGap) return null;

    if (state.ki < attackDef.kiCost) return null;
    if (state.stamina < attackDef.staminaCost) return null;

    state.ki -= attackDef.kiCost;
    state.stamina -= attackDef.staminaCost;
    this.cooldowns.set(state.slot, performance.now());

    if (attackDef.type !== ATTACK_TYPE.HEAL_PULSE) {
      prepareAttackFacing(this.registry, state, inputData);
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
        return this._melee.processMelee(state, attackId, attackDef, inputData);

      case ATTACK_TYPE.KI_BLAST:
      case ATTACK_TYPE.SWORD_RANGED:
      case ATTACK_TYPE.MAGIC_ATTACK:
        return this._projectiles.spawn(state, attackId, attackDef, inputData);

      case ATTACK_TYPE.KI_BEAM:
      case ATTACK_TYPE.SWORD_BEAM:
        return this._beams.fire(state, attackId, attackDef, inputData);

      case ATTACK_TYPE.HEAL_PULSE:
        return this._ultimates.processSupport(state, attackId, attackDef);

      case ATTACK_TYPE.ULTIMATE:
        return this._ultimates.processUltimate(state, attackId, attackDef, inputData);

      case ATTACK_TYPE.RUSH_COMBO:
        return this._rushGrab.processRushCombo(state, attackDef, inputData);

      case ATTACK_TYPE.GRAB:
        return this._rushGrab.processGrab(state, attackDef, inputData);

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

  // ─── Event System (delegates to bus) ───────────────────────────────────

  on(event: CombatEventName, fn: CombatListener): () => void {
    return this._bus.on(event, fn);
  }

  off(event: CombatEventName, fn: CombatListener): void {
    this._bus.off(event, fn);
  }

  getAttackDef(attackId: string): AttackDefinition | null {
    return ATTACK_CATALOG[attackId] ?? null;
  }
}
