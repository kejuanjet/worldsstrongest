// src/core/combat/BeamClash.ts
// Progress-based beam clash resolution with PL tilt, mash input, and random drift.

import { Scalar } from "@babylonjs/core";
import type { BeamEntity } from "./BeamEntity.js";

export interface BeamClashParams {
  beamA: BeamEntity;
  beamB: BeamEntity;
  registry: { getState(slot: number): { powerLevel: number } | null };
  scene: unknown;
  onResolve: (winner: BeamEntity, loser: BeamEntity) => void;
}

export class BeamClash {
  readonly beamA: BeamEntity;
  readonly beamB: BeamEntity;
  private registry: BeamClashParams["registry"];
  private onResolve: BeamClashParams["onResolve"];

  /** 0 = beamA winning, 1 = beamB winning, 0.5 = tied */
  progress = 0.5;
  elapsed = 0;
  resolved = false;
  maxDuration = 8000;

  private _mashRates: Record<number, number>;

  constructor(params: BeamClashParams) {
    this.beamA = params.beamA;
    this.beamB = params.beamB;
    this.registry = params.registry;
    this.onResolve = params.onResolve;
    this._mashRates = {
      [params.beamA.ownerSlot]: 0,
      [params.beamB.ownerSlot]: 0,
    };
  }

  registerMash(slot: number): void {
    if (this._mashRates[slot] !== undefined) this._mashRates[slot]++;
  }

  update(deltaMs: number): void {
    if (this.resolved) return;
    this.elapsed += deltaMs;

    const slotA = this.beamA.ownerSlot;
    const slotB = this.beamB.ownerSlot;
    const plA = this.registry.getState(slotA)?.powerLevel ?? 1;
    const plB = this.registry.getState(slotB)?.powerLevel ?? 1;

    const plDelta = ((plB - plA) / Math.max(plA, plB)) * 0.002;
    const mashDelta = ((this._mashRates[slotB] ?? 0) - (this._mashRates[slotA] ?? 0)) * 0.001;
    const driftDelta = (Math.random() - 0.5) * 0.0004;
    this._mashRates[slotA] = 0;
    this._mashRates[slotB] = 0;

    this.progress = Scalar.Clamp(this.progress + plDelta + mashDelta + driftDelta, 0, 1);

    if (this.progress <= 0) {
      this.resolved = true;
      this.onResolve(this.beamA, this.beamB);
    } else if (this.progress >= 1) {
      this.resolved = true;
      this.onResolve(this.beamB, this.beamA);
    } else if (this.elapsed >= this.maxDuration) {
      this.resolved = true;
      if (plA >= plB) this.onResolve(this.beamA, this.beamB);
      else this.onResolve(this.beamB, this.beamA);
    }
  }
}
