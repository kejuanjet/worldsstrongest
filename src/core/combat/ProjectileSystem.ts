// src/core/combat/ProjectileSystem.ts
// Projectile spawning, flight, and hit detection.

import { Vector3, type Scene } from "@babylonjs/core";
import { CONFIG } from "../index.js";
import type { CombatState, CombatRegistry, KnockbackController } from "../types/CharacterViews.js";
import type { AttackDefinition } from "./AttackCatalog.js";
import type { CombatEventBus } from "./CombatEventBus.js";
import type { InputData } from "./CombatHelpers.js";
import { Projectile } from "./Projectile.js";
import { scaleDamage, canDamage, emitDamageEvents } from "./DamageCalculator.js";
import { canZVanish, executeZVanish, canMeleeClash, deflectProjectile } from "./DefenseMechanics.js";
import { resolveAttackDirection } from "./CombatHelpers.js";

export class ProjectileSystem {
  readonly projectiles = new Map<string, Projectile>();
  private _counter = 0;

  constructor(
    private readonly scene: Scene,
    private readonly registry: CombatRegistry,
    private readonly movement: KnockbackController | null,
    private readonly bus: CombatEventBus,
  ) {}

  update(delta: number): void {
    for (const [id, proj] of this.projectiles) {
      proj.update(delta);
      if (!proj.alive) { this.projectiles.delete(id); continue; }
      this._checkHits(proj);
    }
  }

  spawn(
    state: CombatState,
    attackId: string,
    attackDef: AttackDefinition,
    inputData: InputData = {},
  ): unknown {
    let dir = resolveAttackDirection(this.registry, state, inputData);

    // Aim assist for locked targets
    if (inputData.targetSlot != null && attackDef.projectileSpeed) {
      const target = this.registry.getState(inputData.targetSlot);
      if (target && !target.isDead) {
        const toTarget = target.position.subtract(state.position);
        const distance = toTarget.length();
        const timeToHit = distance / attackDef.projectileSpeed;
        const predictedPos = target.position.add(target.velocity.scale(timeToHit));
        const predictedDir = predictedPos.subtract(state.position).normalize();
        dir = Vector3.Lerp(dir, predictedDir, CONFIG.combat.aimAssistStrength).normalize();
      }
    }

    const id = `proj_${++this._counter}`;

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

  private _checkHits(proj: Projectile): void {
    const hitRadiusSq = CONFIG.combat.projectileHitRadius * CONFIG.combat.projectileHitRadius;
    const owner = this.registry.getState(proj.ownerSlot);
    for (const [slot, target] of this.registry.slots) {
      if (slot === proj.ownerSlot || target.isDead) continue;
      if (target.isInvincible) continue;
      if (owner && !canDamage(owner, target)) continue;

      const distSq = Vector3.DistanceSquared(proj.position, target.position);
      if (distSq < hitRadiusSq) {
        // 1. Z-Vanish Check
        if (canZVanish(target)) {
          executeZVanish(this.bus, target, owner);
          continue;
        }

        // 2. Projectile Deflection Check
        if (canMeleeClash(target)) {
          deflectProjectile(this.bus, proj, target, owner);
          continue;
        }

        const rawDmg = scaleDamage(
          proj.attackDef.baseDamage ?? 0,
          owner?.powerLevel ?? 1,
          target.powerLevel,
        );
        const dmg = this.registry.applyDamage(slot, rawDmg, proj.ownerId);

        this.bus.emit("onHit", {
          type: "HIT",
          attackId: proj.attackId,
          attackerSlot: proj.ownerSlot,
          targetSlot: slot,
          damage: dmg,
          projectile: true,
        });
        emitDamageEvents(this.bus, owner, target, dmg, proj.attackId);

        if (!proj.attackDef.piercing) proj.destroy();
        break;
      }
    }
  }
}
