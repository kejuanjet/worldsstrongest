// src/core/combat/CombatHelpers.ts
// Shared helpers used across combat subsystems: direction resolution,
// attack lunge, knockback application, and melee scanning.

import { Vector3 } from "@babylonjs/core";
import { CONFIG } from "../index.js";
import type { CombatState, CombatRegistry, KnockbackController } from "../types/CharacterViews.js";
import type { AttackDefinition } from "./AttackCatalog.js";
import { getFacingDirection } from "./DefenseMechanics.js";
import { canDamage } from "./DamageCalculator.js";

export interface InputData {
  targetSlot?: number;
  direction?: { x: number; y?: number; z: number };
  chargeFactor?: number;
}

// ─── Direction Resolution ────────────────────────────────────────────────────

export function resolveAttackDirection(
  registry: CombatRegistry,
  state: CombatState,
  inputData: InputData = {},
): Vector3 {
  const rawDir = inputData.direction;
  if (rawDir && typeof rawDir.x === "number" && typeof rawDir.z === "number") {
    const dir = new Vector3(rawDir.x, rawDir.y ?? 0, rawDir.z);
    if (dir.lengthSquared() > 0.0001) return dir.normalize();
  }

  const target = inputData.targetSlot != null ? registry.getState(inputData.targetSlot) : null;
  if (target?.position) {
    const toTarget = target.position.subtract(state.position);
    if (toTarget.lengthSquared() > 0.0001) return toTarget.normalize();
  }

  return getFacingDirection(state);
}

export function prepareAttackFacing(
  registry: CombatRegistry,
  state: CombatState,
  inputData: InputData = {},
  resolvedDirection?: Vector3 | null,
): void {
  const dir = resolvedDirection ?? resolveAttackDirection(registry, state, inputData);
  if (!state.rootNode || dir.lengthSquared() < 0.0001) return;
  state.rootNode.rotation.y = Math.atan2(dir.x, dir.z);
}

// ─── Attack Lunge ────────────────────────────────────────────────────────────

export function applyAttackLunge(
  registry: CombatRegistry,
  state: CombatState,
  attackDef: AttackDefinition,
  direction: Vector3,
  targetSlot?: number,
): void {
  if (direction.lengthSquared() < 0.0001) return;
  const target = targetSlot != null ? registry.getState(targetSlot) : null;
  const lungeDir = direction.clone();
  if (!(state.isFlying || target?.isFlying)) lungeDir.y = 0;
  if (lungeDir.lengthSquared() < 0.0001) return;
  lungeDir.normalize();
  const baseLunge = attackDef.breaksGuard ? CONFIG.combat.lungeDistanceGuardBreak : CONFIG.combat.lungeDistanceNormal;
  let lungeDistance = baseLunge;

  if (target?.position) {
    const assistReach = (attackDef.range ?? 3) + CONFIG.combat.lungeAssistRangeExtra;
    const distSq = Vector3.DistanceSquared(state.position, target.position);
    if (distSq > assistReach * assistReach) return;
    const dist = Math.sqrt(distSq);
    lungeDistance = Math.min(
      baseLunge + CONFIG.combat.lungeAssistExtra,
      Math.max(CONFIG.combat.lungeMinDistance, dist - (attackDef.range ?? 3) * 0.75),
    );
  }

  state.position.addInPlace(lungeDir.scale(lungeDistance));
  state.rootNode?.position.copyFrom(state.position);
}

// ─── Knockback ───────────────────────────────────────────────────────────────

export function applyKnockback(
  movement: KnockbackController | null,
  targetState: CombatState,
  sourcePos: Vector3,
  force: number,
  upward = false,
): void {
  const dir = targetState.position.subtract(sourcePos);
  if (dir.lengthSquared() < 0.0001) dir.copyFromFloats(0, 0, 1);
  dir.normalize();
  if (upward) dir.y += CONFIG.combat.knockbackUpwardBias;
  const impulse = dir.normalize().scale(force);
  const duration = Math.max(
    CONFIG.combat.knockbackMinDuration,
    Math.min(CONFIG.combat.knockbackMaxDuration, CONFIG.combat.knockbackDurationBase + force * CONFIG.combat.knockbackDurationScale),
  );
  if (movement?.applyKnockback) {
    movement.applyKnockback(targetState.slot, impulse, duration);
  }
  if (targetState.isGrounded !== undefined) targetState.isGrounded = false;
}

// ─── Melee Scan ──────────────────────────────────────────────────────────────

export function meleeScan(
  registry: CombatRegistry,
  state: CombatState,
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
  const facing = (rawDir ?? getFacingDirection(state)).clone().normalize();

  for (const [slot, target] of registry.slots) {
    if (slot === state.slot || target.isDead) continue;
    if (!canDamage(state, target)) continue;
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
