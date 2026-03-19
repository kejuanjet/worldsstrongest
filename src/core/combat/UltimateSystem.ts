// src/core/combat/UltimateSystem.ts
// Ultimate attacks (AOE explosions) and support/heal abilities.

import { Vector3 } from "@babylonjs/core";
import type { CombatState, CombatRegistry, KnockbackController } from "../types/CharacterViews.js";
import type { AttackDefinition } from "./AttackCatalog.js";
import type { CombatEventBus } from "./CombatEventBus.js";
import type { InputData } from "./CombatHelpers.js";
import type { BeamSystem } from "./BeamSystem.js";
import { scaleDamage, canDamage, emitDamageEvents } from "./DamageCalculator.js";
import { applyKnockback } from "./CombatHelpers.js";

export class UltimateSystem {
  constructor(
    private readonly registry: CombatRegistry,
    private readonly movement: KnockbackController | null,
    private readonly bus: CombatEventBus,
    private readonly beamSystem: BeamSystem,
  ) {}

  processUltimate(
    state: CombatState,
    attackId: string,
    attackDef: AttackDefinition,
    inputData: InputData = {},
  ): unknown {
    if (attackDef.aoe) {
      const hits: { slot: number; damage: number }[] = [];
      const radiusSq = (attackDef.radius ?? 8) ** 2;
      for (const [slot, target] of this.registry.slots) {
        if (slot === state.slot || target.isDead) continue;
        if (!canDamage(state, target)) continue;
        const distSq = Vector3.DistanceSquared(state.position, target.position);
        if (distSq < radiusSq) {
          const dmg = scaleDamage(
            (attackDef.baseDamage ?? 0) * (inputData.chargeFactor ?? 1.0),
            state.powerLevel,
            target.powerLevel,
          );
          const actual = this.registry.applyDamage(slot, dmg, state.playerId);
          hits.push({ slot, damage: actual });
          emitDamageEvents(this.bus, state, target, actual, attackId);
          applyKnockback(this.movement, target, state.position, attackDef.knockback ?? 0);
        }
      }
      this.bus.emit("onUltimate", { slot: state.slot, attackId, hits });
      return { type: "ULTIMATE", attackId, label: attackDef.label, ownerSlot: state.slot, hits };
    }
    // Non-AOE ultimates fire as beams
    return this.beamSystem.fire(state, attackId, attackDef, inputData);
  }

  processSupport(
    state: CombatState,
    attackId: string,
    attackDef: AttackDefinition,
  ): unknown {
    const healed: { slot: number; amount: number }[] = [];
    const sameTeam = [...this.registry.slots.entries()].filter(
      ([, target]) => !target.isDead && target.teamId === state.teamId,
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
}
