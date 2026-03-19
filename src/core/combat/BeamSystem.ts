// src/core/combat/BeamSystem.ts
// Beam spawning, hit detection, and beam clash initiation.

import { Vector3, type Scene } from "@babylonjs/core";
import { CONFIG } from "../index.js";
import type { CombatState, CombatRegistry } from "../types/CharacterViews.js";
import type { AttackDefinition } from "./AttackCatalog.js";
import type { CombatEventBus } from "./CombatEventBus.js";
import type { InputData } from "./CombatHelpers.js";
import { BeamEntity } from "./BeamEntity.js";
import { BeamClash } from "./BeamClash.js";
import { scaleDamage, canDamage, emitDamageEvents } from "./DamageCalculator.js";
import { canZVanish, executeZVanish } from "./DefenseMechanics.js";
import { resolveAttackDirection } from "./CombatHelpers.js";

export class BeamSystem {
  readonly beams = new Map<string, BeamEntity>();
  readonly activeClashes = new Map<string, BeamClash>();
  private _counter = 0;

  constructor(
    private readonly scene: Scene,
    private readonly registry: CombatRegistry,
    private readonly bus: CombatEventBus,
  ) {}

  update(deltaMs: number): void {
    for (const [id, beam] of this.beams) {
      beam.update(deltaMs);
      if (!beam.alive) { this.beams.delete(id); continue; }
      this._checkHits(beam);
    }

    for (const [id, clash] of this.activeClashes) {
      clash.update(deltaMs);
      if (clash.resolved) this.activeClashes.delete(id);
    }
  }

  fire(
    state: CombatState,
    attackId: string,
    attackDef: AttackDefinition,
    inputData: InputData = {},
  ): unknown {
    const dir = resolveAttackDirection(this.registry, state, inputData);
    const id = `beam_${++this._counter}`;

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

    this._checkForClash(beam);
    this.beams.set(id, beam);
    this.bus.emit("onBeamFired", { id, attackId, ownerSlot: state.slot, chargeFactor: beam.chargeFactor });

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

  private _checkHits(beam: BeamEntity): void {
    const owner = this.registry.getState(beam.ownerSlot);
    const range = beam.attackDef.range ?? 150;
    const rangeSq = range * range;
    const hitRadiusSq = (beam.attackDef.hitRadius ?? 2.6) ** 2;

    for (const [slot, target] of this.registry.slots) {
      if (slot === beam.ownerSlot || target.isDead) continue;
      if (target.isInvincible) continue;
      if (owner && !canDamage(owner, target)) continue;
      if (beam.hitSlots.has(slot)) continue;

      const toTarget = target.position.subtract(beam.origin);
      const distSq = toTarget.lengthSquared();
      if (distSq > rangeSq) continue;

      const along = Vector3.Dot(beam.direction, toTarget);
      if (along <= 0 || along > range) continue;

      const perpSq = Math.max(0, distSq - along * along);
      if (perpSq > hitRadiusSq) continue;

      // Z-Vanish Check
      if (canZVanish(target)) {
        executeZVanish(this.bus, target, owner);
        continue;
      }

      const dmg = scaleDamage(
        (beam.attackDef.baseDamage ?? 0) * beam.chargeFactor,
        owner?.powerLevel ?? 1,
        target.powerLevel,
      );
      this.registry.applyDamage(slot, dmg, beam.ownerId);
      this.bus.emit("onHit", {
        type: "HIT",
        attackId: beam.attackDef.label ?? beam.id,
        attackerSlot: beam.ownerSlot,
        targetSlot: slot,
        damage: dmg,
        beam: true,
        impactType: "HEAVY",
      });
      emitDamageEvents(this.bus, owner, target, dmg, beam.attackDef.label ?? beam.id);
      if (beam.attackDef.piercing) {
        beam.hitSlots.add(slot);
        continue;
      }
      beam.destroy();
      break;
    }
  }

  private _checkForClash(newBeam: BeamEntity): void {
    for (const [, existing] of this.beams) {
      if (existing.ownerSlot === newBeam.ownerSlot) continue;
      const dot = Vector3.Dot(newBeam.direction, existing.direction);
      if (dot < CONFIG.combat.beamClashDotThreshold) {
        const clash = new BeamClash({
          beamA: existing,
          beamB: newBeam,
          registry: this.registry,
          scene: this.scene,
          onResolve: (winner: BeamEntity, loser: BeamEntity) => {
            this.bus.emit("onBeamClash", { winnerSlot: winner.ownerSlot, loserSlot: loser.ownerSlot });
            const loserState = this.registry.getState(loser.ownerSlot);
            if (loserState) {
              const clashDmg = scaleDamage(
                (winner.attackDef.baseDamage ?? 0) * CONFIG.combat.beamClashDamageFactor,
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
}
