import {
  createHitFlash,
  createHitSparks,
  createShockwave,
  createWeaponTrail,
} from "./WorldEffectFactory.js";
import { CONFIG } from "../index.js";

export class WorldEffectPool {
  constructor(scene) {
    this.scene = scene;
    this._shockwaves = [];
    this._sparkSystems = [];
    this._weaponTrails = [];
    this._hitFlashBursts = [];
  }

  spawnShockwave(worldPos, colorHex, maxScale, duration) {
    this._trimArray(this._shockwaves, CONFIG.performance?.maxShockwaves ?? 10, (effect) => effect.mesh.dispose());
    this._shockwaves.push(createShockwave(this.scene, worldPos, colorHex, maxScale, duration, false));
  }

  spawnCrossShockwave(worldPos, colorHex, maxScale, duration) {
    this._trimArray(this._shockwaves, CONFIG.performance?.maxShockwaves ?? 10, (effect) => effect.mesh.dispose());
    this._shockwaves.push(createShockwave(this.scene, worldPos, colorHex, maxScale, duration, true));
  }

  spawnHitSparks(worldPos, impactClass, count) {
    this._trimArray(this._sparkSystems, CONFIG.performance?.maxSparkBursts ?? 12, (effect) => {
      try { effect.ps.stop(); effect.ps.dispose(); } catch {}
      try { effect.emitter.dispose(); } catch {}
    });
    this._sparkSystems.push(createHitSparks(this.scene, worldPos, impactClass, count));
  }

  spawnWeaponTrail(worldPos, direction, opts) {
    this._trimArray(this._weaponTrails, CONFIG.performance?.maxWeaponTrails ?? 10, (effect) => effect.mesh.dispose());
    this._weaponTrails.push(createWeaponTrail(this.scene, worldPos, direction, opts));
  }

  spawnHitFlash(worldPos, colorHex, maxScale, duration) {
    this._trimArray(this._hitFlashBursts, CONFIG.performance?.maxHitFlashes ?? 12, (effect) => effect.mesh.dispose());
    this._hitFlashBursts.push(createHitFlash(this.scene, worldPos, colorHex, maxScale, duration));
  }

  update(delta) {
    for (let i = this._shockwaves.length - 1; i >= 0; i--) {
      const shockwave = this._shockwaves[i];
      shockwave.timer += delta;
      const t = shockwave.timer / shockwave.duration;
      if (t >= 1) {
        shockwave.mesh.dispose();
        this._shockwaves.splice(i, 1);
        continue;
      }

      const eased = 1 - (1 - t) * (1 - t);
      shockwave.mesh.scaling.setAll(1 + eased * (shockwave.maxScale - 1));
      shockwave.mesh.visibility = 1 - t;
    }

    for (let i = this._sparkSystems.length - 1; i >= 0; i--) {
      const spark = this._sparkSystems[i];
      spark.timer += delta;
      if (spark.timer < spark.duration) continue;
      try { spark.ps.stop(); spark.ps.dispose(); } catch {}
      try { spark.emitter.dispose(); } catch {}
      this._sparkSystems.splice(i, 1);
    }

    for (let i = this._weaponTrails.length - 1; i >= 0; i--) {
      const trail = this._weaponTrails[i];
      trail.timer += delta;
      const t = trail.timer / trail.duration;
      if (t >= 1) {
        trail.mesh.dispose();
        this._weaponTrails.splice(i, 1);
        continue;
      }

      const eased = 1 - (1 - t) * (1 - t);
      trail.mesh.scaling.x = trail.baseScale.x + (trail.endScale.x - trail.baseScale.x) * eased;
      trail.mesh.scaling.y = trail.baseScale.y + (trail.endScale.y - trail.baseScale.y) * eased;
      trail.mesh.visibility = 1 - t;
      trail.mat.alpha = Math.max(0, 0.72 * (1 - t));
    }

    for (let i = this._hitFlashBursts.length - 1; i >= 0; i--) {
      const burst = this._hitFlashBursts[i];
      burst.timer += delta;
      const t = burst.timer / burst.duration;
      if (t >= 1) {
        burst.mesh.dispose();
        this._hitFlashBursts.splice(i, 1);
        continue;
      }

      const eased = 1 - (1 - t) * (1 - t);
      burst.mesh.scaling.setAll(0.35 + eased * burst.maxScale);
      burst.mesh.visibility = 1 - t;
      burst.mat.alpha = Math.max(0, 0.85 * (1 - t));
    }
  }

  dispose() {
    this._shockwaves.forEach((effect) => { try { effect.mesh.dispose(); } catch {} });
    this._sparkSystems.forEach((effect) => {
      try { effect.ps.dispose(); effect.emitter.dispose(); } catch {}
    });
    this._weaponTrails.forEach((effect) => { try { effect.mesh.dispose(); } catch {} });
    this._hitFlashBursts.forEach((effect) => { try { effect.mesh.dispose(); } catch {} });

    this._shockwaves = [];
    this._sparkSystems = [];
    this._weaponTrails = [];
    this._hitFlashBursts = [];
  }

  _trimArray(list, maxItems, dispose) {
    while (list.length >= maxItems) {
      const oldest = list.shift();
      try { dispose(oldest); } catch {}
    }
  }
}
