// src/core/combat/RushGrabSystem.ts
// Rush combo and grab attack processing.

import { Vector3 } from "@babylonjs/core";
import { CONFIG } from "../index.js";
import type { CombatState, CombatRegistry, KnockbackController } from "../types/CharacterViews.js";
import type { AttackDefinition } from "./AttackCatalog.js";
import type { CombatEventBus } from "./CombatEventBus.js";
import type { InputData } from "./CombatHelpers.js";
import { scaleDamage, canDamage } from "./DamageCalculator.js";
import { applyAttackLunge, applyKnockback, meleeScan } from "./CombatHelpers.js";

export class RushGrabSystem {
  constructor(
    private readonly registry: CombatRegistry,
    private readonly movement: KnockbackController | null,
    private readonly bus: CombatEventBus,
  ) {}

  processRushCombo(
    state: CombatState,
    attackDef: AttackDefinition,
    inputData: InputData = {},
  ): unknown {
    let { targetSlot } = inputData;
    let target = targetSlot != null ? this.registry.getState(targetSlot) : null;

    if (!target || target.isDead || target.isInvincible || !canDamage(state, target)) {
      const hits = meleeScan(this.registry, state, attackDef.range ?? 3.0, attackDef, inputData.direction);
      if (hits.length > 0) {
        targetSlot = hits[0];
        target = this.registry.getState(targetSlot!);
      }
    }

    if (!target || target.isDead || target.isInvincible) {
      return { type: "MISS", attackId: "RUSH_COMBO", ownerSlot: state.slot };
    }

    const RUSH_HITS = CONFIG.combat.rushHitCount;
    let totalDamage = 0;
    const hitLog: number[] = [];

    applyAttackLunge(
      this.registry,
      state,
      attackDef,
      target.position.subtract(state.position).normalize(),
      targetSlot,
    );

    for (let i = 0; i < RUSH_HITS; i++) {
      const dmg = scaleDamage(
        (attackDef.baseDamage ?? 120) * CONFIG.combat.rushDamageFactor,
        state.powerLevel,
        target.powerLevel,
      );
      const actual = this.registry.applyDamage(targetSlot!, dmg, state.playerId);
      totalDamage += actual;
      hitLog.push(actual);
    }

    applyKnockback(this.movement, target, state.position, CONFIG.combat.rushFinisherKnockback);
    this.bus.emit("onCombo", { attackerSlot: state.slot, comboCount: RUSH_HITS, totalDamage });

    return { type: "RUSH_COMBO", attackId: "RUSH_COMBO", ownerSlot: state.slot, targetSlot, hitLog, totalDamage };
  }

  processGrab(
    state: CombatState,
    attackDef: AttackDefinition,
    inputData: InputData = {},
  ): unknown {
    let { targetSlot } = inputData;
    let target = targetSlot != null ? this.registry.getState(targetSlot) : null;

    if (!target || target.isDead || target.isInvincible || !canDamage(state, target)) {
      const hits = meleeScan(this.registry, state, attackDef.range ?? 2.5, attackDef, inputData.direction);
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

    applyAttackLunge(
      this.registry,
      state,
      attackDef,
      target.position.subtract(state.position).normalize(),
      targetSlot,
    );

    const dmg = scaleDamage(attackDef.baseDamage ?? 500, state.powerLevel, target.powerLevel);
    const actual = this.registry.applyDamage(targetSlot!, dmg, state.playerId);
    applyKnockback(this.movement, target, state.position, attackDef.knockback ?? 15, true);

    return { type: "GRAB", attackId: "GRAB", ownerSlot: state.slot, targetSlot, damage: actual };
  }
}
