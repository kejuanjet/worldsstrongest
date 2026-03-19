// src/core/combat/DamageCalculator.ts
// Pure functions for damage scaling, team checks, and damage event routing.

import { CONFIG } from "../index.js";
import type { CombatEventBus } from "./CombatEventBus.js";
import type { CombatState } from "../types/CharacterViews.js";

/** Scale raw damage by power-level ratio. */
export function scaleDamage(base: number, attackerPL: number, defenderPL: number): number {
  const ratio = Math.max(0.05, attackerPL / Math.max(1, defenderPL));
  const scaled = base * Math.pow(ratio, CONFIG.combat.plScaleExponent);
  return Math.round(Math.max(CONFIG.combat.minDamage, scaled));
}

/** Returns true if attacker is allowed to damage target (different teams). */
export function canDamage(attacker: CombatState | null, target: CombatState | null): boolean {
  if (!attacker || !target) return false;
  if (attacker.teamId && target.teamId && attacker.teamId === target.teamId) return false;
  return true;
}

/** Emit onDamageTakenByPlayer when the HERO team is hit. */
export function emitDamageEvents(
  bus: CombatEventBus,
  attacker: CombatState | null,
  target: CombatState | null,
  damage: number,
  attackId: string,
): void {
  if (!target) return;
  if (target.teamId === "HERO") {
    bus.emit("onDamageTakenByPlayer", {
      attackerSlot: attacker?.slot,
      targetSlot: target.slot,
      damage,
      attackId,
    });
  }
}
