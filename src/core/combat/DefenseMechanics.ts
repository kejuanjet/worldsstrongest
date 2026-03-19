// src/core/combat/DefenseMechanics.ts
// Z-Vanish, Melee Clash, and Projectile Deflection logic.

import { Vector3 } from "@babylonjs/core";
import { CONFIG } from "../index.js";
import type { CombatEventBus } from "./CombatEventBus.js";
import type { CombatState } from "../types/CharacterViews.js";
import type { Projectile } from "./Projectile.js";

// ─── Facing Helpers (shared by multiple subsystems) ──────────────────────────

export function getFacingDirection(state: CombatState): Vector3 {
  if (state.velocity.length() > 0.1) return state.velocity.clone().normalize();
  if (state.rootNode?.rotation) {
    const yaw = state.rootNode.rotation.y;
    return new Vector3(Math.sin(yaw), 0, Math.cos(yaw)).normalize();
  }
  return Vector3.Forward();
}

// ─── Z-Vanish ────────────────────────────────────────────────────────────────

export function executeZVanish(
  bus: CombatEventBus,
  evader: CombatState,
  attacker: CombatState | null,
): void {
  evader.stamina = Math.max(0, evader.stamina - CONFIG.combat.zVanishStaminaCost);
  evader.lastDodgeTime = 0;

  if (attacker) {
    const attackerFacing = getFacingDirection(attacker);
    const vanishPos = attacker.position.subtract(attackerFacing.scale(CONFIG.combat.zVanishTeleportDist));
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
  bus.emit("onZVanish", { evaderSlot: evader.slot, attackerSlot: attacker?.slot });
}

/** Returns true if the target can Z-Vanish right now. */
export function canZVanish(target: CombatState): boolean {
  const now = performance.now();
  return !!(
    target.lastDodgeTime &&
    now - target.lastDodgeTime < CONFIG.combat.zVanishWindowMs &&
    target.stamina >= CONFIG.combat.zVanishStaminaCost
  );
}

// ─── Melee Clash ─────────────────────────────────────────────────────────────

export function canMeleeClash(target: CombatState): boolean {
  const now = performance.now();
  return !!(target.lastMeleeTime && now - target.lastMeleeTime < CONFIG.combat.meleeClashWindowMs);
}

export function executeMeleeClash(
  bus: CombatEventBus,
  clashedSlots: Set<number>,
  fighterA: CombatState,
  fighterB: CombatState,
  applyKnockback: (target: CombatState, sourcePos: Vector3, force: number, upward?: boolean) => void,
): void {
  clashedSlots.add(fighterA.slot);
  clashedSlots.add(fighterB.slot);
  fighterA.lastMeleeTime = 0;
  fighterB.lastMeleeTime = 0;
  const midpoint = fighterA.position.add(fighterB.position).scale(0.5);
  bus.emit("onMeleeClash", { slotA: fighterA.slot, slotB: fighterB.slot, position: midpoint });
  applyKnockback(fighterA, fighterB.position, CONFIG.combat.meleeClashKnockback);
  applyKnockback(fighterB, fighterA.position, CONFIG.combat.meleeClashKnockback);
}

// ─── Projectile Deflection ───────────────────────────────────────────────────

export function deflectProjectile(
  bus: CombatEventBus,
  proj: Projectile,
  deflector: CombatState,
  originalOwner: CombatState | null,
): void {
  deflector.lastMeleeTime = 0;
  bus.emit("onProjectileDeflected", { deflectorSlot: deflector.slot, projId: proj.id });
  proj.direction.scaleInPlace(-1);
  if (originalOwner) {
    const toOwner = originalOwner.position.subtract(proj.position).normalize();
    proj.direction = Vector3.Lerp(proj.direction, toOwner, CONFIG.combat.deflectRetargetBlend).normalize();
  }
  proj.ownerSlot = deflector.slot;
  proj.ownerId = deflector.playerId;
  proj.speed *= CONFIG.combat.deflectSpeedBoost;
}
