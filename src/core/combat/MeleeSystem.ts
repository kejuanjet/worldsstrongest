// src/core/combat/MeleeSystem.ts
// Melee attack processing: hit detection, combo scaling, blocking, and knockback.

import { CONFIG } from "../index.js";
import type { CombatState, CombatRegistry, KnockbackController } from "../types/CharacterViews.js";
import type { AttackDefinition } from "./AttackCatalog.js";
import { ComboTracker } from "./ComboTracker.js";
import type { CombatEventBus } from "./CombatEventBus.js";
import type { InputData } from "./CombatHelpers.js";
import { scaleDamage, canDamage, emitDamageEvents } from "./DamageCalculator.js";
import { canZVanish, executeZVanish, canMeleeClash, executeMeleeClash } from "./DefenseMechanics.js";
import { resolveAttackDirection, applyAttackLunge, applyKnockback, meleeScan } from "./CombatHelpers.js";

export class MeleeSystem {
  constructor(
    private readonly registry: CombatRegistry,
    private readonly movement: KnockbackController | null,
    private readonly comboTrackers: Map<number, ComboTracker>,
    private readonly bus: CombatEventBus,
    private readonly clashedSlotsThisFrame: Set<number>,
  ) {}

  processMelee(
    state: CombatState,
    attackId: string,
    attackDef: AttackDefinition,
    inputData: InputData = {},
  ): unknown {
    const attackDirection = resolveAttackDirection(this.registry, state, inputData);
    const { targetSlot } = inputData;

    applyAttackLunge(this.registry, state, attackDef, attackDirection, targetSlot);

    const hits = meleeScan(this.registry, state, attackDef.range ?? 3.5, attackDef, attackDirection, targetSlot);

    if (hits.length === 0) {
      return { type: "MISS", attackId, ownerSlot: state.slot };
    }

    const events: unknown[] = [];
    const combo = this._getCombo(state.slot);
    const comboSeed = combo.isActive ? combo.hits : 0;
    const comboMultiplier =
      1 +
      Math.min(comboSeed, CONFIG.combat.comboScaleCap) * CONFIG.combat.comboScalePerHit +
      (attackDef.breaksGuard && comboSeed >= 2 ? CONFIG.combat.comboGuardBreakBonus : 0);

    for (const tSlot of hits) {
      const target = this.registry.getState(tSlot);
      if (!target || target.isDead) continue;
      if (target.isInvincible) continue;
      if (!canDamage(state, target)) continue;

      // 1. Z-Vanish (Perfect Dodge) Check
      if (canZVanish(target)) {
        executeZVanish(this.bus, target, state);
        continue;
      }

      // 2. Melee Clash Check
      if (canMeleeClash(target)) {
        const kb = (t: CombatState, src: import("@babylonjs/core").Vector3, f: number, up?: boolean) =>
          applyKnockback(this.movement, t, src, f, up);
        executeMeleeClash(this.bus, this.clashedSlotsThisFrame, state, target, kb);
        return { type: "CLASH", attackId, ownerSlot: state.slot, opponentSlot: tSlot };
      }

      const blocked = target.isBlocking ?? false;
      const rawDamage = scaleDamage(
        (attackDef.baseDamage ?? 0) * comboMultiplier,
        state.powerLevel,
        target.powerLevel,
      );
      const finalDamage = blocked ? Math.round(rawDamage * (1 - CONFIG.combat.blockDamageReduction)) : rawDamage;
      const actualDamage = this.registry.applyDamage(tSlot, finalDamage, state.playerId);

      const comboCount = combo.register(actualDamage, attackDef.comboWindow ?? 400);
      const impactType =
        blocked
          ? "BLOCK"
          : attackDef.breaksGuard || comboCount >= 5 || (attackDef.knockback ?? 0) >= 10
            ? "HEAVY"
            : "LIGHT";

      if (!blocked) {
        const isLauncher = (CONFIG.combat.comboLauncherCounts as number[]).includes(comboCount);
        const comboKnockback = (attackDef.knockback ?? 0) * (1 + Math.min(comboCount - 1, CONFIG.combat.comboKnockbackCap) * CONFIG.combat.comboKnockbackScale);
        applyKnockback(this.movement, target, state.position, comboKnockback, isLauncher);
      } else {
        applyKnockback(this.movement, target, state.position, Math.max(CONFIG.combat.blockKnockbackMin, (attackDef.knockback ?? 0) * CONFIG.combat.blockKnockbackScale));
      }

      if (comboCount >= CONFIG.combat.comboEventThreshold) {
        this.bus.emit("onCombo", {
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

      this.bus.emit("onHit", evt);
      emitDamageEvents(this.bus, state, target, actualDamage, attackId);
    }

    return events.length > 0
      ? { type: "MELEE_ATTACK", attackId, ownerSlot: state.slot, events }
      : { type: "MISS", attackId, ownerSlot: state.slot };
  }

  private _getCombo(slot: number): ComboTracker {
    if (!this.comboTrackers.has(slot)) {
      this.comboTrackers.set(slot, new ComboTracker());
    }
    return this.comboTrackers.get(slot)!;
  }
}
