import type { Scene, Vector3 } from "@babylonjs/core";
// @ts-ignore – JS modules pending TS migration
import { ScreenOverlays } from "./vfx/ScreenOverlays.js";
// @ts-ignore
import { WorldEffectPool } from "./vfx/WorldEffectPool.js";
// @ts-ignore
import { CONFIG } from "./index.js";

export interface WeaponTrailOptions {
  colorHex?: string;
  length?: number;
  height?: number;
  duration?: number;
  heightOffset?: number;
}

export class VFXManager {
  private readonly _overlays: ScreenOverlays;
  private readonly _effects: WorldEffectPool;
  private _disposed = false;

  public constructor(scene: Scene) {
    this._overlays = new ScreenOverlays();
    this._effects = new WorldEffectPool(scene);
  }

  public spawnShockwave(worldPos: Vector3, colorHex = "#ffffff", maxScale = 7, duration = 0.35): void {
    if (this._disposed) return;
    this._effects.spawnShockwave(worldPos, colorHex, maxScale, duration);
  }

  public spawnCrossShockwave(worldPos: Vector3, colorHex = "#ffffff", maxScale = 5, duration = 0.28): void {
    if (this._disposed) return;
    this._effects.spawnCrossShockwave(worldPos, colorHex, maxScale, duration);
  }

  public spawnHitSparks(worldPos: Vector3, impactClass: "LIGHT" | "HEAVY" | string = "LIGHT", count = 24): void {
    if (this._disposed) return;
    const capped = Math.min(
      count,
      impactClass === "HEAVY"
        ? (CONFIG.performance?.heavySparkCount ?? 24)
        : (CONFIG.performance?.lightSparkCount ?? 14),
    );
    this._effects.spawnHitSparks(worldPos, impactClass, capped);
  }

  public spawnWeaponTrail(worldPos: Vector3, direction: Vector3, opts: WeaponTrailOptions = {}): void {
    if (this._disposed || !worldPos || !direction) return;
    this._effects.spawnWeaponTrail(worldPos, direction, opts);
  }

  public spawnHitFlash(worldPos: Vector3, colorHex = "#ffffff", maxScale = 1.8, duration = 0.12): void {
    if (this._disposed) return;
    this._effects.spawnHitFlash(worldPos, colorHex, maxScale, duration);
  }

  public triggerSpeedLines(intensity = 0.5, duration = 0.14): void {
    if (this._disposed) return;
    this._overlays.triggerSpeedLines(intensity, duration);
  }

  public triggerColorWash(color = "white", peak = 0.45, duration = 0.4): void {
    if (this._disposed) return;
    this._overlays.triggerColorWash(color, peak, duration);
  }

  public update(delta: number): void {
    if (this._disposed) return;
    this._effects.update(delta);
  }

  public dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._effects.dispose();
    this._overlays.dispose();
  }
}
