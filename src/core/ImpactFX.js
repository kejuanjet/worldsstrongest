// src/vfx/ImpactFX.js
// Every hit in the game routes through here.
// Handles: hit sparks, shockwave rings, ground craters, debris bursts,
// screen shake, hitstop (freeze frames), blood-less impact flashes,
// ki explosion clouds, and beam impact eruptions.

import {
  ParticleSystem,
  SphereParticleEmitter,
  Color4,
  Color3,
  Vector3,
  MeshBuilder,
  StandardMaterial,
  Scalar,
} from "@babylonjs/core";
import { CONFIG } from "../config/index.js";
import { WorldEffectPool } from "./vfx/WorldEffectPool.js";

// ─── Impact Profiles ──────────────────────────────────────────────────────────

const FX_SETTINGS = {
  hitstopCooldownMs: 120,
  maxCraters: 20,
  smokeLifeMs: 3000,
  debrisLifeMs: 2500,
  flashHoldMs: 60,
  ultimateRingDelayMs: 120
};

const IMPACT_PROFILE = {
  LIGHT: {
    sparkCount:     100,
    sparkSize:      [0.04, 0.16],
    sparkLife:      [0.10, 0.28],
    sparkPower:     [5, 12],
    sparkColor1:    new Color4(1.0, 0.92, 0.35, 1.0),
    sparkColor2:    new Color4(1.0, 0.55, 0.0, 0.7),
    shockwaveScale: 3.5, // Much larger for visibility
    shockwaveFade:  0.20,
    shakeMagnitude: 0.12,
    shakeDuration:  0.10,
    hitstopMs:      45,  // Fast visceral freeze frame
    flashColor:     new Color3(1.0, 0.95, 0.6),
    craterRadius:   0,
    soundId:        "sfx_punch_light",
  },
  HEAVY: {
    sparkCount:     400, // Massive spark burst
    sparkSize:      [0.10, 0.45],
    sparkLife:      [0.18, 0.55],
    sparkPower:     [15, 35],
    sparkColor1:    new Color4(1.0, 0.75, 0.15, 1.0),
    sparkColor2:    new Color4(1.0, 0.35, 0.0, 0.5),
    shockwaveScale: 8.0, // Huge heavy impact ring
    shockwaveFade:  0.40,
    shakeMagnitude: 0.45,
    shakeDuration:  0.25,
    hitstopMs:      90, // Punchy but fast freeze
    flashColor:     new Color3(1.0, 0.85, 0.25),
    craterRadius:   1.2,
    soundId:        "sfx_punch_heavy",
  },
  KI_BLAST: {
    sparkCount:     250,
    sparkSize:      [0.06, 0.28],
    sparkLife:      [0.22, 0.55],
    sparkPower:     [7, 18],
    sparkColor1:    new Color4(0.5, 0.85, 1.0, 1.0),
    sparkColor2:    new Color4(0.3, 0.5, 1.0, 0.5),
    shockwaveScale: 5.5,
    shockwaveFade:  0.26,
    shakeMagnitude: 0.22,
    shakeDuration:  0.14,
    hitstopMs:      35,
    flashColor:     new Color3(0.5, 0.85, 1.0),
    craterRadius:   0.6,
    soundId:        "sfx_ki_blast",
    smokeEnabled:   true,
  },
  BEAM: {
    sparkCount:     1200,
    sparkSize:      [0.15, 0.8],
    sparkLife:      [0.35, 1.2],
    sparkPower:     [14, 45],
    sparkColor1:    new Color4(1.0, 1.0, 1.0, 1.0),
    sparkColor2:    new Color4(0.5, 0.75, 1.0, 0.7),
    shockwaveScale: 22.0, // Beam impacts should swallow the screen
    shockwaveFade:  0.50,
    shakeMagnitude: 0.7,
    shakeDuration:  0.40,
    hitstopMs:      0,
    flashColor:     new Color3(1.0, 1.0, 1.0),
    craterRadius:   4.5,
    soundId:        "sfx_beam_impact",
    smokeEnabled:   true,
    smokeCount:     350,
    debrisEnabled:  true,
  },
  ULTIMATE: {
    sparkCount:     3000,
    sparkSize:      [0.2, 1.2],
    sparkLife:      [0.6, 2.2],
    sparkPower:     [22, 65],
    sparkColor1:    new Color4(1.0, 1.0, 0.85, 1.0),
    sparkColor2:    new Color4(0.7, 0.92, 1.0, 0.6),
    shockwaveScale: 45.0, // Over-the-top shockwaves
    shockwaveFade:  0.8,
    shakeMagnitude: 1.4,
    shakeDuration:  0.7,
    hitstopMs:      120, // Snappy freeze right before the explosion drops
    flashColor:     new Color3(1.0, 1.0, 1.0),
    craterRadius:   9.0,
    soundId:        "sfx_beam_impact",
    smokeEnabled:   true,
    smokeCount:     900,
    debrisEnabled:  true,
    shockwaveCount: 4,       // more staggered rings for epic feel
  },
};

// ─── ImpactFX ─────────────────────────────────────────────────────────────────

export class ImpactFX {
  /**
   * @param {import("@babylonjs/core").Scene} scene
   * @param {import("@babylonjs/core").ArcRotateCamera} camera
   * @param {import("../core/AssetLoader").AssetLoader} assetLoader
   * @param {object} config Defaults to global CONFIG
   */
  constructor(scene, camera, assetLoader, config = CONFIG) {
    this.scene       = scene;
    this.camera      = camera;
    this.assetLoader = assetLoader;
    this.config      = config;

    /** Active screen shake state */
    this._shake = { active: false, magnitude: 0, duration: 0, elapsed: 0, origin: Vector3.Zero() };

    /** Hitstop state — freezes scene update for N ms */
    this._hitstop = { active: false, remaining: 0 };
    this._hitstopCooldownMs = FX_SETTINGS.hitstopCooldownMs;
    this._lastHitstopAt = Number.NEGATIVE_INFINITY;
    this._animationsWereEnabledBeforeHitstop = true;

    /** Pool of reusable shockwave meshes */
    this._shockwavePool = [];
    this._POOL_SIZE = 12;

    /** Active craters (persistent scene decals) */
    this._craters = [];
    this._MAX_CRATERS = FX_SETTINGS.maxCraters;
    this._performanceTier = "MED";
    this._pooledEffects = new WorldEffectPool(scene);
    this._avgCreationMs = 0;
    this._creationCount = 0;

    /** Safe lifecycle trackers mapped to game delta time */
    this._scheduledTasks = [];
    this._activeAnimations = [];

    this._buildShockwavePool();
  }

  setPerformanceTier(tier = "MED") {
    this._performanceTier = tier === "LOW" ? "LOW" : tier === "HIGH" ? "HIGH" : "MED";
  }

  getAverageCreationMs() {
    return this._avgCreationMs;
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Play a melee hit impact.
   * @param {Vector3} position     world position of the hit
   * @param {Vector3} normal       surface normal (direction sparks fly)
   * @param {"LIGHT"|"HEAVY"} type
   */
  playMeleeImpact(position, normal, type = "LIGHT") {
    const profile = IMPACT_PROFILE[type];
    const budget = this._getImpactBudget(type);
    this._measureCreation(() => {
      this._pooledEffects.spawnHitSparks(position, type, budget.sparkCount);
      this._pooledEffects.spawnShockwave(
        position,
        this._colorToHex(profile.flashColor),
        type === "HEAVY" ? 7.2 : 3.4,
        type === "HEAVY" ? 0.24 : 0.15,
      );
      this._pooledEffects.spawnHitFlash(
        position,
        this._colorToHex(profile.flashColor),
        type === "HEAVY" ? 2.2 : 1.35,
        type === "HEAVY" ? 0.14 : 0.1,
      );
    });
    this._triggerScreenShake(profile.shakeMagnitude, profile.shakeDuration);
    this._triggerHitstop(profile.hitstopMs);
    this._flashHitOverlay(profile.flashColor, type === "HEAVY" ? 0.28 : 0.15);
  }

  /**
   * Play a ki blast explosion.
   * @param {Vector3} position
   */
  playKiBlastImpact(position) {
    const profile = IMPACT_PROFILE.KI_BLAST;
    const budget = this._getImpactBudget("KI_BLAST");
    this._measureCreation(() => {
      this._pooledEffects.spawnHitSparks(position, "KI_BLAST", budget.sparkCount);
      this._pooledEffects.spawnShockwave(position, this._colorToHex(profile.flashColor), 4.8, 0.18);
      this._pooledEffects.spawnHitFlash(position, this._colorToHex(profile.flashColor), 1.6, 0.12);
      if (profile.smokeEnabled) this._spawnSmoke(position, budget.smokeCount);
    });
    this._triggerScreenShake(profile.shakeMagnitude, profile.shakeDuration);
    this._triggerHitstop(profile.hitstopMs);
    this._flashHitOverlay(profile.flashColor, 0.20);
    if (profile.craterRadius > 0) this._spawnCrater(position, profile.craterRadius);
  }

  /**
   * Play a full beam impact eruption.
   * @param {Vector3} position
   * @param {Color3} beamColor   tints the explosion to match beam color
   */
  playBeamImpact(position, beamColor = null) {
    const profile = { ...IMPACT_PROFILE.BEAM };
    if (beamColor) {
      profile.sparkColor1 = new Color4(beamColor.r, beamColor.g, beamColor.b, 1.0);
      profile.sparkColor2 = new Color4(beamColor.r * 0.5, beamColor.g * 0.5, beamColor.b * 0.5, 0.4);
    }

    const budget = this._getImpactBudget("BEAM");
    this._measureCreation(() => {
      this._pooledEffects.spawnHitSparks(position, "BEAM", budget.sparkCount);
      this._pooledEffects.spawnShockwave(position, this._colorToHex(beamColor ?? profile.flashColor), 12.5, 0.28);
      this._pooledEffects.spawnHitFlash(position, "#ffffff", 2.8, 0.18);
      this._spawnSmoke(position, budget.smokeCount);
      if (profile.debrisEnabled) this._spawnDebris(position, budget.debrisCount);
    });
    this._triggerScreenShake(profile.shakeMagnitude, profile.shakeDuration);
    this._flashHitOverlay(new Color3(1, 1, 1), 0.55);
    this._spawnCrater(position, profile.craterRadius);
  }

  /**
   * Play an ultimate ability explosion — the biggest possible impact.
   * @param {Vector3} position
   * @param {Color3} [color]
   */
  playUltimateImpact(position, color = null) {
    const profile = { ...IMPACT_PROFILE.ULTIMATE };
    if (color) {
      profile.sparkColor1 = new Color4(color.r, color.g, color.b, 1.0);
    }

    // Staggered multi-ring shockwaves
    const count = profile.shockwaveCount ?? 3;
    const budget = this._getImpactBudget("ULTIMATE");
    this._measureCreation(() => {
      for (let i = 0; i < count; i++) {
        this._schedule(i * FX_SETTINGS.ultimateRingDelayMs, () => {
          this._pooledEffects.spawnShockwave(
            position,
            this._colorToHex(color ?? profile.flashColor),
            7 + i * 4.5,
            0.24 + i * 0.04,
          );
        });
      }

      this._pooledEffects.spawnHitSparks(position, "ULTIMATE", budget.sparkCount);
      this._pooledEffects.spawnHitFlash(position, "#ffffff", 4.1, 0.22);
      this._spawnSmoke(position, budget.smokeCount);
      this._spawnDebris(position, budget.debrisCount);
    });
    this._triggerScreenShake(profile.shakeMagnitude, profile.shakeDuration);
    this._flashHitOverlay(new Color3(1, 1, 1), 0.75);
    this._spawnCrater(position, profile.craterRadius);
  }

  /**
   * Play a dodge/vanish flash (attacker side).
   * @param {Vector3} position
   */
  playDodgeFlash(position) {
    this._spawnFlash(position, new Color3(0.8, 0.9, 1.0), 0.5);
  }

  /**
   * Play a landing impact (character hits ground from high altitude).
   * @param {Vector3} position
   * @param {number} speed   landing speed m/s — scales effect size
   */
  playLandingImpact(position, speed = 10) {
    if (speed < 5) return;
    const scale = Math.min(1, (speed - 5) / 30);
    const profile = {
      ...IMPACT_PROFILE.HEAVY,
      shockwaveScale: 3 + scale * 8,
      sparkCount:     Math.round(50 + scale * 250),
      shakeMagnitude: 0.1 + scale * 0.4,
      shakeDuration:  0.12 + scale * 0.2,
    };
    const sparkCount = Math.round(18 + scale * (this._getImpactBudget("HEAVY").sparkCount - 18));
    this._measureCreation(() => {
      this._pooledEffects.spawnHitSparks(position, "HEAVY", sparkCount);
      this._pooledEffects.spawnShockwave(position, this._colorToHex(profile.flashColor), 3 + scale * 5.5, 0.2 + scale * 0.08);
    });
    if (scale > 0.4) this._spawnCrater(position, scale * 3);
    this._triggerScreenShake(profile.shakeMagnitude, profile.shakeDuration);
  }

  // ─── Per-Frame Update ─────────────────────────────────────────────────────

  _schedule(delayMs, cb) {
    this._scheduledTasks.push({ remaining: delayMs, cb });
  }

  _animate(durationMs, onTick, onComplete) {
    this._activeAnimations.push({ elapsed: 0, duration: durationMs, onTick, onComplete });
  }

  update(delta) {
    this._pooledEffects.update(delta);
    // Hitstop — don't update anything else while frozen
    if (this._hitstop.active) {
      this._hitstop.remaining -= delta * 1000;
      if (this._hitstop.remaining <= 0) {
        this._hitstop.active = false;
        if (this._animationsWereEnabledBeforeHitstop) {
          this.scene.animationsEnabled = true;
        }
      }
      return;
    }

    // Screen shake
    if (this._shake.active) {
      this._updateShake(delta);
    }

    // Process game-time animations
    const deltaMs = delta * 1000;
    for (let i = this._activeAnimations.length - 1; i >= 0; i--) {
      const anim = this._activeAnimations[i];
      anim.elapsed += deltaMs;
      const t = Math.min(1, anim.elapsed / anim.duration);
      anim.onTick(t);
      if (t >= 1) {
        anim.onComplete?.();
        this._activeAnimations.splice(i, 1);
      }
    }

    // Process scheduled tasks
    for (let i = this._scheduledTasks.length - 1; i >= 0; i--) {
      const task = this._scheduledTasks[i];
      task.remaining -= deltaMs;
      if (task.remaining <= 0) {
        task.cb();
        this._scheduledTasks.splice(i, 1);
      }
    }
  }

  // ─── Sparks ──────────────────────────────────────────────────────────────

  _spawnSparks(position, normal, profile) {
    const ps = new ParticleSystem(`sparks_${Date.now()}`, profile.sparkCount, this.scene);
    ps.emitter = position.clone();
    ps.particleTexture = this.assetLoader?.getOrFallback("fx_sparks") ?? null;
    if (!ps.particleTexture) {
      ps.dispose?.();
      return;
    }

    const emitter = new SphereParticleEmitter(0.1, 0, 1);
    ps.particleEmitterType = emitter;

    ps.color1    = profile.sparkColor1;
    ps.color2    = profile.sparkColor2;
    ps.colorDead = new Color4(0, 0, 0, 0);

    ps.minSize    = profile.sparkSize[0];
    ps.maxSize    = profile.sparkSize[1];
    ps.minLifeTime = profile.sparkLife[0];
    ps.maxLifeTime = profile.sparkLife[1];

    // Bias direction away from hit normal
    const bias = normal.scale(3);
    ps.direction1 = new Vector3(-4, 2, -4).add(bias);
    ps.direction2 = new Vector3( 4, 8,  4).add(bias);

    ps.minEmitPower = profile.sparkPower[0];
    ps.maxEmitPower = profile.sparkPower[1];
    ps.updateSpeed  = 0.01;
    ps.gravity      = new Vector3(0, -18, 0);
    ps.blendMode    = ParticleSystem.BLENDMODE_ADD;

    // One-shot burst
    ps.emitRate          = 0;
    ps.manualEmitCount   = profile.sparkCount;
    ps.disposeOnStop     = true;
    ps.start();

    // Auto-dispose after longest possible particle life
    this._schedule((profile.sparkLife[1] + 0.1) * 1000, () => ps.dispose?.());
  }

  // ─── Shockwave Ring ───────────────────────────────────────────────────────

  _buildShockwavePool() {
    for (let i = 0; i < this._POOL_SIZE; i++) {
      // Solid glowing torus ring instead of wireframe disc
      const ring = MeshBuilder.CreateTorus(`shockwave_${i}`, {
        diameter: 2,
        thickness: 0.12,
        tessellation: 36,
      }, this.scene);
      ring.rotation.x = Math.PI / 2;
      ring.isPickable = false;
      ring.isVisible  = false;
      ring.renderingGroupId = 1;

      const mat = new StandardMaterial(`sw_mat_${i}`, this.scene);
      mat.emissiveColor    = new Color3(1, 0.9, 0.4);
      mat.disableLighting  = true;
      mat.backFaceCulling  = false;
      mat.alpha            = 0;
      ring.material        = mat;

      this._shockwavePool.push({ mesh: ring, mat, inUse: false });
    }
  }

  _spawnShockwave(position, profile) {
    const slot = this._shockwavePool.find(s => !s.inUse);
    if (!slot) return;

    slot.inUse          = true;
    slot.mesh.position  = position.clone();
    slot.mesh.position.y += 0.08;
    slot.mesh.scaling   = Vector3.One();

    // Tint shockwave to match the impact color if available
    const fc = profile.flashColor;
    if (fc) {
      slot.mat.emissiveColor = new Color3(
        Math.min(1, fc.r + 0.15),
        Math.min(1, fc.g + 0.15),
        Math.min(1, fc.b + 0.15)
      );
    }
    slot.mat.alpha      = 0.9;
    slot.mesh.isVisible = true;

    const targetScale = profile.shockwaveScale;
    const duration    = profile.shockwaveFade * 1.15; // slightly longer for dramatic read

    this._animate(duration * 1000, (t) => {
      // Fast start, slow finish — classic anime shockwave timing
      const eased   = 1 - Math.pow(1 - t, 3);   // ease-out cubic

      slot.mesh.scaling.x = eased * targetScale;
      slot.mesh.scaling.y = eased * targetScale;
      // Ring thins as it expands (energy dissipating outward)
      slot.mesh.scaling.z = Math.max(0.3, 1 - t * 0.7);

      // Sharp alpha falloff in last 40%
      slot.mat.alpha = t < 0.6 ? 0.9 : 0.9 * (1 - ((t - 0.6) / 0.4));
    }, () => {
      slot.mesh.isVisible = false;
      slot.inUse          = false;
    });
  }

  // ─── Smoke ────────────────────────────────────────────────────────────────

  _spawnSmoke(position, count = 120) {
    const ps = new ParticleSystem(`smoke_${Date.now()}`, count, this.scene);
    ps.emitter = position.clone();
    ps.particleTexture = this.assetLoader?.getOrFallback("fx_smoke") ?? null;
    if (!ps.particleTexture) {
      ps.dispose?.();
      return;
    }

    ps.color1    = new Color4(0.4, 0.4, 0.4, 0.6);
    ps.color2    = new Color4(0.2, 0.2, 0.2, 0.3);
    ps.colorDead = new Color4(0.1, 0.1, 0.1, 0);

    ps.minSize    = 0.5;
    ps.maxSize    = 2.5;
    ps.minLifeTime = 0.8;
    ps.maxLifeTime = 2.5;
    ps.emitRate   = 0;
    ps.manualEmitCount = count;
    ps.direction1 = new Vector3(-2, 1, -2);
    ps.direction2 = new Vector3( 2, 5,  2);
    ps.minEmitPower = 1;
    ps.maxEmitPower = 4;
    ps.updateSpeed  = 0.02;
    ps.gravity      = new Vector3(0, -1, 0);
    ps.disposeOnStop = true;
    ps.start();

    this._schedule(FX_SETTINGS.smokeLifeMs, () => ps.dispose?.());
  }

  // ─── Debris ───────────────────────────────────────────────────────────────

  _spawnDebris(position, count = 80) {
    const ps = new ParticleSystem(`debris_${Date.now()}`, count, this.scene);
    ps.emitter = position.clone();

    ps.color1    = new Color4(0.55, 0.5, 0.42, 1.0);
    ps.color2    = new Color4(0.35, 0.3, 0.25, 0.8);
    ps.colorDead = new Color4(0, 0, 0, 0);
    ps.minSize   = 0.08;
    ps.maxSize   = 0.4;
    ps.minLifeTime = 0.6;
    ps.maxLifeTime = 2.0;
    ps.emitRate   = 0;
    ps.manualEmitCount = count;
    ps.direction1 = new Vector3(-5, 4, -5);
    ps.direction2 = new Vector3( 5, 14, 5);
    ps.minEmitPower = 5;
    ps.maxEmitPower = 18;
    ps.updateSpeed = 0.02;
    ps.gravity    = new Vector3(0, -20, 0);
    ps.disposeOnStop = true;
    ps.start();

    this._schedule(FX_SETTINGS.debrisLifeMs, () => ps.dispose?.());
  }

  // ─── Crater ───────────────────────────────────────────────────────────────

  _spawnCrater(position, radius) {
    if (radius <= 0) return;

    // Simple dark disc decal on the ground
    const crater = MeshBuilder.CreateDisc(
      `crater_${Date.now()}`,
      { radius, tessellation: 24 },
      this.scene
    );
    crater.position    = new Vector3(position.x, position.y + 0.05, position.z);
    crater.rotation.x  = Math.PI / 2;
    crater.isPickable  = false;

    const mat = new StandardMaterial(`craterMat_${Date.now()}`, this.scene);
    mat.diffuseColor   = new Color3(0.12, 0.10, 0.08);
    mat.emissiveColor  = new Color3(0.04, 0.03, 0.02);
    mat.backFaceCulling = false;
    crater.material    = mat;

    this._craters.push(crater);

    // Evict oldest crater if over limit
    if (this._craters.length > this._MAX_CRATERS) {
      const old = this._craters.shift();
      old.dispose();
    }
  }

  // ─── Screen Shake ─────────────────────────────────────────────────────────

  _triggerScreenShake(magnitude, duration) {
    // Compound — add to existing shake rather than reset it
    this._shake.magnitude = Math.max(this._shake.magnitude, magnitude);
    this._shake.duration  = Math.max(this._shake.duration, duration);
    this._shake.elapsed   = 0;
    this._shake.active    = true;
    this._shake.origin    = this.camera?.target?.clone() ?? Vector3.Zero();
  }

  _updateShake(delta) {
    const s = this._shake;
    s.elapsed += delta;

    const t       = s.elapsed / s.duration;
    const falloff = 1 - Scalar.Clamp(t, 0, 1);
    const intensity = s.magnitude * falloff;

    if (this.camera) {
      const ox = (Math.random() * 2 - 1) * intensity;
      const oy = (Math.random() * 2 - 1) * intensity * 0.6;
      this.camera.target.x = s.origin.x + ox;
      this.camera.target.y = s.origin.y + oy;
    }

    if (t >= 1) {
      s.active    = false;
      s.magnitude = 0;
      if (this.camera) this.camera.target.copyFrom(s.origin);
    }
  }

  // ─── Hitstop ──────────────────────────────────────────────────────────────

  _triggerHitstop(ms) {
    if (ms <= 0) return;
    const now = performance.now();
    if (this._hitstop.active || (now - this._lastHitstopAt) < this._hitstopCooldownMs) {
      return;
    }

    this._lastHitstopAt = now;
    this._hitstop.active    = true;
    this._hitstop.remaining = ms;
    this._animationsWereEnabledBeforeHitstop = this.scene.animationsEnabled !== false;
    // Freeze Babylon animations — movement still runs on our fixed tick
    if (this._animationsWereEnabledBeforeHitstop) {
      this.scene.animationsEnabled = false;
    }
  }

  // ─── Flash Overlay ────────────────────────────────────────────────────────

  _flashHitOverlay(color, opacity = 0.2) {
    if (this.registry && typeof this.registry.requestScreenFlash === "function") {
      this.registry.requestScreenFlash(color, FX_SETTINGS.flashHoldMs + 160, Math.min(1, opacity * 1.3));
    }
  }

  _spawnFlash(position, color, radius = 1) {
    const sphere = MeshBuilder.CreateSphere(`flash_${Date.now()}`, { diameter: radius * 2, segments: 10 }, this.scene);
    sphere.position.copyFrom(position);
    sphere.position.y += 1.0;
    sphere.isPickable = false;

    const mat = new StandardMaterial(`flashMat_${Date.now()}`, this.scene);
    // White-hot center tinted by impact color
    mat.emissiveColor = new Color3(
      Math.min(1, color.r + 0.4),
      Math.min(1, color.g + 0.4),
      Math.min(1, color.b + 0.4)
    );
    mat.backFaceCulling  = false;
    mat.disableLighting  = true;
    mat.alpha            = 0.9;
    sphere.material      = mat;
    sphere.renderingGroupId = 1;

    const dur   = 280;    // slightly longer flash for dramatic read
    this._animate(dur, (t) => {
      // Quick bright peak then smooth falloff
      const easedAlpha = t < 0.15 ? 0.9 : 0.9 * Math.pow(1 - ((t - 0.15) / 0.85), 2);
      mat.alpha = Math.max(0, easedAlpha);
      sphere.scaling.setAll(1 + t * 2.8);
    }, () => {
      sphere.dispose();
    });
  }

  // ─── Wiring (called by GameLoop) ─────────────────────────────────────────

  /**
   * Wire to CombatSystem events.
   * @param {import("../combat/CombatSystem").CombatSystem} combat
   * @param {import("../core/CharacterRegistry").CharacterRegistry} registry
   */
  wireCombat(combat, registry) {
    this.registry = registry;
    combat.on("onHit", (ev) => {
      const targetState = ev.targetSlot !== undefined
        ? registry.getState(ev.targetSlot)
        : null;
      const pos = targetState?.position ?? new Vector3(0, 1, 0);

      if (ev.beam) {
        this.playBeamImpact(pos);
      } else if (ev.projectile) {
        this.playKiBlastImpact(pos);
      } else {
        const type = ev.impactType === "HEAVY" || ev.attackId?.includes("HEAVY") ? "HEAVY" : "LIGHT";
        this.playMeleeImpact(pos, Vector3.Up(), type);
      }
    });

    combat.on("onBeamFired", (_ev) => {
      // Handled at beam terminus — see _checkBeamHits in CombatSystem
    });

    combat.on("onUltimate", (ev) => {
      const ownerSlot = ev.ownerSlot ?? ev.slot;
      const ownerState = registry.getState(ownerSlot);
      if (ownerState) this.playUltimateImpact(ownerState.position);
    });
  }

  _getImpactBudget(type) {
    const tierBudget = this.config.performance?.impactBudgets?.[this._performanceTier]
      ?? this.config.performance?.impactBudgets?.MED
      ?? {};

    if (type === "LIGHT") {
      return { sparkCount: tierBudget.lightSparkCount ?? 24, smokeCount: 0, debrisCount: 0 };
    }
    if (type === "HEAVY") {
      return { sparkCount: tierBudget.heavySparkCount ?? 44, smokeCount: 0, debrisCount: 0 };
    }
    if (type === "KI_BLAST") {
      return {
        sparkCount: tierBudget.kiSparkCount ?? 36,
        smokeCount: Math.max(24, Math.round((tierBudget.kiSparkCount ?? 36) * 1.5)),
        debrisCount: 0,
      };
    }
    if (type === "BEAM") {
      return {
        sparkCount: tierBudget.beamSparkCount ?? 120,
        smokeCount: tierBudget.beamSmokeCount ?? 84,
        debrisCount: tierBudget.beamDebrisCount ?? 28,
      };
    }
    return {
      sparkCount: tierBudget.ultimateSparkCount ?? 220,
      smokeCount: tierBudget.ultimateSmokeCount ?? 150,
      debrisCount: tierBudget.ultimateDebrisCount ?? 48,
    };
  }

  _measureCreation(work) {
    const start = performance.now();
    work();
    const elapsed = performance.now() - start;
    this._creationCount += 1;
    this._avgCreationMs += (elapsed - this._avgCreationMs) / this._creationCount;
  }

  _colorToHex(color) {
    const source = color ?? Color3.White();
    const r = Math.round(Math.min(1, Math.max(0, source.r ?? 1)) * 255).toString(16).padStart(2, "0");
    const g = Math.round(Math.min(1, Math.max(0, source.g ?? 1)) * 255).toString(16).padStart(2, "0");
    const b = Math.round(Math.min(1, Math.max(0, source.b ?? 1)) * 255).toString(16).padStart(2, "0");
    return `#${r}${g}${b}`;
  }

  dispose() {
    this._pooledEffects.dispose();
    this._shockwavePool.forEach(s => s.mesh.dispose());
    this._craters.forEach(c => c.dispose());
    this._craters.length = 0;
    this._scheduledTasks = [];
    this._activeAnimations = [];
  }
}
