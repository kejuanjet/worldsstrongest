// src/vfx/AuraSystem.js
// The most visually critical system in a DBZ game.
// Handles per-character ki auras: base idle shimmer, transformation halos,
// SSJ/SSB/form-specific particle bursts, and supporting glow/particle layers.

import {
  ParticleSystem,
  SphereParticleEmitter,
  CylinderParticleEmitter,
  Color4,
  Color3,
  Vector3,
  GlowLayer,
} from "@babylonjs/core";
import { CONFIG } from "../config/index.js";

// ─── Aura Profiles ────────────────────────────────────────────────────────────
// Each transformation has a unique aura profile.

export const AURA_PROFILES = {
  BASE: {
    id:              "BASE",
    innerColor:      new Color4(0.2, 0.4, 1.0, 0.25),
    outerColor:      new Color4(0.4, 0.6, 1.0, 0.05),
    particleCount:   80,
    emitRate:        40,
    particleSize:    [0.04, 0.18],
    particleLife:    [0.3, 0.7],
    emitPower:       [0.5, 1.5],
    shellOpacity:    0.06,
    shellScale:      1.08,
    glowIntensity:   0.3,
    glowColor:       new Color3(0.2, 0.4, 1.0),
    lightningEnabled: false,
    groundRingEnabled: false,
  },

  SSJ1: {
    id:              "SSJ1",
    innerColor:      new Color4(1.0, 0.92, 0.1, 0.9),
    outerColor:      new Color4(1.0, 0.75, 0.0, 0.0),
    particleCount:   500,
    emitRate:        280,
    particleSize:    [0.10, 0.45], // Larger flames
    particleLife:    [0.3, 0.9],
    emitPower:       [2.0, 5.0],
    shellOpacity:    0.22,
    shellScale:      1.18,
    glowIntensity:   1.2,
    glowColor:       new Color3(1.0, 0.9, 0.1),
    lightningEnabled: true,
    lightningColor:   new Color3(1.0, 1.0, 0.4),
    groundRingEnabled: true,
    groundRingColor:  new Color4(1.0, 0.85, 0.0, 0.6),
    windDebrisEnabled: true,
  },

  SSJ2: {
    id:              "SSJ2",
    innerColor:      new Color4(1.0, 0.97, 0.4, 1.0),
    outerColor:      new Color4(0.8, 0.9, 1.0, 0.0),
    particleCount:   600,
    emitRate:        350,
    particleSize:    [0.08, 0.40],
    particleLife:    [0.2, 0.7],
    emitPower:       [3.0, 7.0],
    shellOpacity:    0.28,
    shellScale:      1.22,
    glowIntensity:   1.6,
    glowColor:       new Color3(1.0, 1.0, 0.5),
    lightningEnabled: true,
    lightningColor:   new Color3(0.8, 0.9, 1.0),   // electric blue-white for SSJ2
    lightningFrequency: 0.08,
    groundRingEnabled: true,
    groundRingColor:  new Color4(0.9, 1.0, 0.6, 0.8),
    windDebrisEnabled: true,
  },

  SSJ3: {
    id:              "SSJ3",
    innerColor:      new Color4(1.0, 1.0, 0.6, 1.0),
    outerColor:      new Color4(1.0, 0.9, 0.2, 0.0),
    particleCount:   900,
    emitRate:        500,
    particleSize:    [0.15, 0.60], // Roaring aura
    particleLife:    [0.4, 1.2],
    emitPower:       [5.0, 12.0],
    shellOpacity:    0.35,
    shellScale:      1.35,
    glowIntensity:   2.2,
    glowColor:       new Color3(1.0, 1.0, 0.6),
    lightningEnabled: true,
    lightningColor:   new Color3(1.0, 1.0, 1.0),
    lightningFrequency: 0.04,
    groundRingEnabled: true,
    groundRingColor:  new Color4(1.0, 1.0, 0.5, 1.0),
    windDebrisEnabled: true,
    screenDistortEnabled: true,
  },

  SSB: {
    id:              "SSB",
    innerColor:      new Color4(0.1, 0.5, 1.0, 1.0),
    outerColor:      new Color4(0.0, 0.2, 0.8, 0.0),
    particleCount:   550,
    emitRate:        300,
    particleSize:    [0.10, 0.45],
    particleLife:    [0.3, 0.8],
    emitPower:       [3.0, 8.0],
    shellOpacity:    0.30,
    shellScale:      1.25,
    glowIntensity:   1.8,
    glowColor:       new Color3(0.2, 0.6, 1.0),
    lightningEnabled: true,
    lightningColor:   new Color3(0.4, 0.7, 1.0),
    groundRingEnabled: true,
    groundRingColor:  new Color4(0.3, 0.6, 1.0, 0.7),
    windDebrisEnabled: false,
    screenDistortEnabled: true,
  },

  SSBE: {
    id:              "SSBE",
    innerColor:      new Color4(0.0, 0.3, 0.95, 1.0),
    outerColor:      new Color4(0.0, 0.1, 0.6, 0.0),
    particleCount:   700,
    emitRate:        400,
    particleSize:    [0.12, 0.50],
    particleLife:    [0.3, 1.0],
    emitPower:       [4.0, 10.0],
    shellOpacity:    0.38,
    shellScale:      1.30,
    glowIntensity:   2.0,
    glowColor:       new Color3(0.1, 0.5, 1.0),
    lightningEnabled: true,
    lightningColor:   new Color3(0.2, 0.5, 1.0),
    groundRingEnabled: true,
    groundRingColor:  new Color4(0.1, 0.4, 1.0, 0.9),
    windDebrisEnabled: false,
    screenDistortEnabled: true,
  },

  MYSTIC: {
    id:              "MYSTIC",
    innerColor:      new Color4(0.9, 0.9, 1.0, 0.7),
    outerColor:      new Color4(0.7, 0.8, 1.0, 0.0),
    particleCount:   200,
    emitRate:        100,
    particleSize:    [0.04, 0.22],
    particleLife:    [0.4, 1.0],
    emitPower:       [1.5, 4.0],
    shellOpacity:    0.15,
    shellScale:      1.15,
    glowIntensity:   0.9,
    glowColor:       new Color3(0.8, 0.85, 1.0),
    lightningEnabled: false,
    groundRingEnabled: false,
  },

  ORANGE: {
    id:              "ORANGE",
    innerColor:      new Color4(1.0, 0.45, 0.05, 1.0),
    outerColor:      new Color4(1.0, 0.2, 0.0, 0.0),
    particleCount:   300,
    emitRate:        150,
    particleSize:    [0.06, 0.28],
    particleLife:    [0.3, 0.8],
    emitPower:       [2.5, 6.0],
    shellOpacity:    0.25,
    shellScale:      1.20,
    glowIntensity:   1.5,
    glowColor:       new Color3(1.0, 0.45, 0.1),
    lightningEnabled: false,
    groundRingEnabled: true,
    groundRingColor:  new Color4(1.0, 0.4, 0.0, 0.7),
    windDebrisEnabled: true,
  },
};

function getAuraBudget(tier = "MED") {
  return CONFIG.performance?.auraBudgets?.[tier]
    ?? CONFIG.performance?.auraBudgets?.MED
    ?? {
      particleScale: 0.72,
      emitScale: 0.75,
      combatScale: 0.7,
      allowLightning: true,
      allowGroundRing: true,
      allowWindDebris: false,
      allowCombatRing: true,
    };
}

// ─── Aura Instance ────────────────────────────────────────────────────────────
// One per character slot. Manages all VFX layers for a single character.

class AuraInstance {
  constructor(slot, scene, assetLoader, registry) {
    this.slot         = slot;
    this.scene        = scene;
    this.assetLoader  = assetLoader;
    this.registry     = registry;
    this.profile      = AURA_PROFILES.BASE;
    this.active       = true;

    /** @type {ParticleSystem | null} main body aura particles */
    this.mainPS       = null;

    /** @type {ParticleSystem | null} ground ring particles */
    this.groundPS     = null;

    /** @type {ParticleSystem | null} lightning sparks */
    this.lightningPS  = null;

    /** @type {ParticleSystem | null} wind debris */
    this.debrisPS     = null;

    /** @type {GlowLayer | null} */
    this.glowLayer    = null;

    /** Intensity pulse animation */
    this._pulseT      = 0;
    this._pulsing     = false;

    /** Reference to character root node */
    this.parentNode   = null;

    /** Lightning timer */
    this._lightningTimer = 0;
    this._lightningNextAt = 0;

    // ── Combat aura (Saiyan-style flare that activates only during combat) ──
    /** @type {ParticleSystem | null} fiery combat flame aura */
    this.combatFlamePS    = null;
    /** @type {ParticleSystem | null} combat spark crackles */
    this.combatSparksPS   = null;
    /** @type {ParticleSystem | null} combat shockwave ring */
    this.combatRingPS     = null;
    /** Whether the combat aura layers are currently emitting */
    this._combatAuraActive = false;
    /** Intensity ramp (0→1 on engage, 1→0 on disengage) for smooth fade */
    this._combatIntensity  = 0;
    this.performanceTier = "MED";
  }

  // ─── Attach to a character ─────────────────────────────────────────────

  attach(rootNode) {
    this.parentNode = rootNode;
    this._buildAll();
  }

  // ─── Profile Switch ────────────────────────────────────────────────────

  setProfile(profileId) {
    const prof = AURA_PROFILES[profileId] ?? AURA_PROFILES.BASE;
    if (prof.id === this.profile.id) return;

    this.profile = prof;
    this._destroyAll();
    this._buildAll();
  }

  setPerformanceTier(tier) {
    const normalizedTier = tier === "LOW" ? "LOW" : tier === "HIGH" ? "HIGH" : "MED";
    if (this.performanceTier === normalizedTier) return;
    this.performanceTier = normalizedTier;
    if (!this.parentNode) return;
    this._destroyAll();
    this._buildAll();
  }

  // ─── Per-Frame Update ──────────────────────────────────────────────────

  update(delta) {
    if (!this.active || !this.parentNode) return;

    // Intensity pulse — gentle sinusoidal breath
    this._pulseT += delta * 1.8;

    // Lightning: fire at semi-random intervals based on profile
    if (this.profile.lightningEnabled && this.lightningPS) {
      this._lightningTimer += delta;
      if (this._lightningTimer >= this._lightningNextAt) {
        this._fireLightningBurst();
        this._lightningTimer   = 0;
        const freq = this.profile.lightningFrequency ?? 0.12;
        this._lightningNextAt = freq + Math.random() * freq;
      }
    }

    // Combat aura intensity ramp
    this._updateCombatAura(delta);
  }

  // ─── Transformation Burst ──────────────────────────────────────────────

  /**
   * Plays an explosive burst of particles when transforming.
   * @param {string} targetProfileId
   * @param {Function} onPeak  called at the visual peak of the burst
   */
  playTransformBurst(targetProfileId, onPeak) {
    if (!this.parentNode) return;

    const targetProf = AURA_PROFILES[targetProfileId] ?? AURA_PROFILES.BASE;
    const budget = getAuraBudget(this.performanceTier);
    const burstCount = Math.max(240, Math.round(700 * budget.particleScale));

    // Burst particle spray outward
    const burst = new ParticleSystem(`aura_burst_${this.slot}`, burstCount, this.scene);
    burst.emitter    = this.parentNode;
    burst.particleTexture = this.assetLoader?.getOrFallback("fx_aura") ?? null;

    const emitter = new SphereParticleEmitter(0.5, 0, 1);
    burst.particleEmitterType = emitter;

    burst.color1     = toColor4(targetProf.innerColor, 1);
    burst.color2     = new Color4(1, 1, 1, 0.9);
    burst.colorDead  = new Color4(0, 0, 0, 0);
    burst.minSize    = 0.15;
    burst.maxSize    = 0.8;
    burst.minLifeTime = 0.4;
    burst.maxLifeTime = 1.2;
    burst.emitRate   = 0;   // manual burst
    burst.minEmitPower = 8;
    burst.maxEmitPower = 20;
    burst.updateSpeed = 0.015;
    burst.blendMode  = ParticleSystem.BLENDMODE_ADD;

    burst.manualEmitCount = burstCount;
    burst.start();

    // Screen flash overlay
    this._flashScreen(targetProf.glowColor);

    // After 600ms, switch profile and call onPeak
    setTimeout(() => {
      onPeak?.();
      this.setProfile(targetProfileId);
      burst.dispose();
    }, 600);
  }

  // ─── Build / Destroy ────────────────────────────────────────────────────

  _buildAll() {
    if (!this.parentNode) return;
    const budget = getAuraBudget(this.performanceTier);
    this._buildMainAura();
    this._buildGlowLayer();
    if (budget.allowGroundRing && this.profile.groundRingEnabled) this._buildGroundRing();
    if (budget.allowLightning && this.profile.lightningEnabled) this._buildLightning();
    if (budget.allowWindDebris && this.profile.windDebrisEnabled) this._buildWindDebris();
    this._buildCombatAura();
  }

  _destroyAll() {
    this.mainPS?.dispose();
    this.groundPS?.dispose();
    this.lightningPS?.dispose();
    this.debrisPS?.dispose();
    this._destroyCombatAura();
    // Note: don't dispose glowLayer — it's scene-level, just update intensity
    this.mainPS    = null;
    this.groundPS  = null;
    this.lightningPS = null;
    this.debrisPS  = null;
  }

  _buildMainAura() {
    const p = this.profile;
    const budget = getAuraBudget(this.performanceTier);
    const ps = new ParticleSystem(
      `aura_main_${this.slot}`,
      Math.max(24, Math.round(p.particleCount * budget.particleScale)),
      this.scene,
    );

    ps.emitter = this.parentNode;
    ps.particleTexture = this.assetLoader?.getOrFallback("fx_aura") ?? null;

    const emitter = new CylinderParticleEmitter(0.5, 1.8, 0.3, 1);
    ps.particleEmitterType = emitter;

    ps.color1     = toColor4(p.innerColor, 1);
    ps.color2     = toColor4(p.outerColor, 1);
    ps.colorDead  = new Color4(0, 0, 0, 0);
    ps.minSize    = p.particleSize[0];
    ps.maxSize    = p.particleSize[1];
    ps.minLifeTime = p.particleLife[0];
    ps.maxLifeTime = p.particleLife[1];
    ps.emitRate   = Math.max(8, Math.round(p.emitRate * budget.emitScale));
    ps.minEmitPower = p.emitPower[0];
    ps.maxEmitPower = p.emitPower[1];
    ps.direction1 = new Vector3(-0.3, 3, -0.3);
    ps.direction2 = new Vector3( 0.3, 6,  0.3);
    ps.updateSpeed = 0.018;
    ps.blendMode  = ParticleSystem.BLENDMODE_ADD;
    ps.gravity    = new Vector3(0, -1, 0);

    ps.start();
    this.mainPS = ps;
  }

  _buildGlowLayer() {
    // Reuse scene-level glow layer if it exists
    const existing = this.scene.effectLayers?.find(l => l.name === "characterGlow");
    if (existing) {
      this.glowLayer = existing;
    } else {
      this.glowLayer = new GlowLayer("characterGlow", this.scene);
      this.glowLayer.blurKernelSize = 32;
    }
    this.glowLayer.intensity = this.profile.glowIntensity;
  }

  _buildGroundRing() {
    const budget = getAuraBudget(this.performanceTier);
    const ps = new ParticleSystem(
      `aura_ground_${this.slot}`,
      Math.max(24, Math.round(120 * budget.particleScale)),
      this.scene,
    );
    ps.emitter = this.parentNode;
    ps.particleTexture = this.assetLoader?.getOrFallback("fx_aura") ?? null;

    const emitter = new SphereParticleEmitter(1.5, 0.3, 0);
    ps.particleEmitterType = emitter;

    const rc = this.profile.groundRingColor ?? new Color4(1, 1, 0, 0.6);
    ps.color1     = rc;
    ps.color2     = new Color4(rc.r, rc.g, rc.b, 0);
    ps.colorDead  = new Color4(0, 0, 0, 0);
    ps.minSize    = 0.1;
    ps.maxSize    = 0.5;
    ps.minLifeTime = 0.4;
    ps.maxLifeTime = 0.9;
    ps.emitRate   = Math.max(12, Math.round(60 * budget.emitScale));
    ps.direction1 = new Vector3(-1.5, 0.2, -1.5);
    ps.direction2 = new Vector3( 1.5, 0.8,  1.5);
    ps.minEmitPower = 1;
    ps.maxEmitPower = 3;
    ps.updateSpeed = 0.02;
    ps.blendMode  = ParticleSystem.BLENDMODE_ADD;
    ps.gravity    = new Vector3(0, -6, 0);
    ps.start();

    this.groundPS = ps;
  }

  _buildLightning() {
    // Lightning is handled as a burst-based particle system with very short life
    const budget = getAuraBudget(this.performanceTier);
    const ps = new ParticleSystem(
      `aura_lightning_${this.slot}`,
      Math.max(12, Math.round(60 * budget.particleScale)),
      this.scene,
    );
    ps.emitter = this.parentNode;
    ps.particleTexture = this.assetLoader?.getOrFallback("fx_sparks") ?? null;

    const lc = this.profile.lightningColor ?? new Color3(1, 1, 0.5);
    ps.color1    = new Color4(lc.r, lc.g, lc.b, 1.0);
    ps.color2    = new Color4(1, 1, 1, 0.8);
    ps.colorDead = new Color4(0, 0, 0, 0);
    ps.minSize   = 0.02;
    ps.maxSize   = 0.12;
    ps.minLifeTime = 0.04;
    ps.maxLifeTime = 0.12;
    ps.emitRate  = 0;    // manual burst
    ps.minEmitPower = 4;
    ps.maxEmitPower = 10;
    ps.direction1 = new Vector3(-3, 2, -3);
    ps.direction2 = new Vector3( 3, 6,  3);
    ps.updateSpeed = 0.01;
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.start();

    this.lightningPS = ps;
    this._lightningNextAt = 0.05 + Math.random() * 0.1;
  }

  _buildWindDebris() {
    const budget = getAuraBudget(this.performanceTier);
    const ps = new ParticleSystem(
      `aura_debris_${this.slot}`,
      Math.max(12, Math.round(40 * budget.particleScale)),
      this.scene,
    );
    ps.emitter = this.parentNode;

    ps.color1    = new Color4(0.6, 0.55, 0.45, 0.7);
    ps.color2    = new Color4(0.4, 0.38, 0.3, 0.3);
    ps.colorDead = new Color4(0, 0, 0, 0);
    ps.minSize   = 0.05;
    ps.maxSize   = 0.18;
    ps.minLifeTime = 0.8;
    ps.maxLifeTime = 2.0;
    ps.emitRate  = Math.max(4, Math.round(18 * budget.emitScale));
    ps.direction1 = new Vector3(-4, 1, -4);
    ps.direction2 = new Vector3( 4, 5,  4);
    ps.minEmitPower = 3;
    ps.maxEmitPower = 8;
    ps.updateSpeed = 0.02;
    ps.gravity = new Vector3(0, -3, 0);
    ps.start();

    this.debrisPS = ps;
  }

  _fireLightningBurst() {
    if (!this.lightningPS) return;
    const budget = getAuraBudget(this.performanceTier);
    const burstMin = Math.max(4, Math.round(12 * budget.particleScale));
    const burstJitter = Math.max(4, Math.round(20 * budget.particleScale));
    this.lightningPS.manualEmitCount = burstMin + Math.floor(Math.random() * burstJitter);
  }

  // ─── Combat Aura ─────────────────────────────────────────────────────────
  // Saiyan-style flame aura with crackling sparks that flares up only
  // while the character is actively in combat (attacking, blocking,
  // charging, taking damage, dodging).

  /**
   * Build the combat-only particle layers. Called once from _buildAll;
   * emission stays at 0 until setCombatAura(true) is called.
   */
  _buildCombatAura() {
    if (!this.parentNode) return;

    const p = this.profile;
    const budget = getAuraBudget(this.performanceTier);
    const combatScale = budget.combatScale ?? 1;

    // ── 1. Flame aura — fierce upward flame columns hugging the body ──
    const flame = new ParticleSystem(`combat_flame_${this.slot}`, Math.max(40, Math.round(400 * combatScale)), this.scene);
    flame.emitter = this.parentNode;
    flame.particleTexture = this.assetLoader?.getOrFallback("fx_aura") ?? null;

    const flameEmitter = new CylinderParticleEmitter(0.45, 2.0, 0.25, 1);
    flame.particleEmitterType = flameEmitter;

    // Tint to match current aura profile — brighter, more saturated
    flame.color1    = new Color4(
      Math.min(1, p.innerColor.r * 1.3),
      Math.min(1, p.innerColor.g * 1.1),
      Math.min(1, p.innerColor.b * 0.9),
      0.85
    );
    flame.color2    = new Color4(1.0, 0.95, 0.8, 0.15);
    flame.colorDead = new Color4(0, 0, 0, 0);
    flame.minSize    = 0.12;
    flame.maxSize    = 0.55;
    flame.minLifeTime = 0.15;
    flame.maxLifeTime = 0.5;
    flame.emitRate   = 0;  // starts silent
    flame.minEmitPower = 4.0;
    flame.maxEmitPower = 10.0;
    flame.direction1 = new Vector3(-0.5, 4, -0.5);
    flame.direction2 = new Vector3( 0.5, 9,  0.5);
    flame.updateSpeed = 0.016;
    flame.blendMode  = ParticleSystem.BLENDMODE_ADD;
    flame.gravity    = new Vector3(0, 2, 0); // upward pull — flames rise
    flame.start();
    this.combatFlamePS = flame;

    // ── 2. Sparks — short-lived electric crackles around the body ──
    const sparks = new ParticleSystem(`combat_sparks_${this.slot}`, Math.max(12, Math.round(80 * combatScale)), this.scene);
    sparks.emitter = this.parentNode;
    sparks.particleTexture = this.assetLoader?.getOrFallback("fx_sparks") ?? null;

    sparks.color1    = new Color4(1.0, 1.0, 1.0, 1.0);
    sparks.color2    = new Color4(
      Math.min(1, p.innerColor.r * 1.4),
      Math.min(1, p.innerColor.g * 1.2),
      Math.min(1, p.innerColor.b * 1.2),
      0.9
    );
    sparks.colorDead = new Color4(0, 0, 0, 0);
    sparks.minSize    = 0.01;
    sparks.maxSize    = 0.08;
    sparks.minLifeTime = 0.03;
    sparks.maxLifeTime = 0.1;
    sparks.emitRate   = 0; // starts silent
    sparks.minEmitPower = 6;
    sparks.maxEmitPower = 14;
    sparks.direction1 = new Vector3(-3, 1, -3);
    sparks.direction2 = new Vector3( 3, 5,  3);
    sparks.updateSpeed = 0.01;
    sparks.blendMode = ParticleSystem.BLENDMODE_ADD;
    sparks.start();
    this.combatSparksPS = sparks;

    // ── 3. Ground pressure ring — expanding ring at feet during combat ──
    if (budget.allowCombatRing) {
      const ring = new ParticleSystem(`combat_ring_${this.slot}`, Math.max(10, Math.round(60 * combatScale)), this.scene);
      ring.emitter = this.parentNode;
      ring.particleTexture = this.assetLoader?.getOrFallback("fx_aura") ?? null;

      const ringEmitter = new SphereParticleEmitter(1.8, 0.2, 0);
      ring.particleEmitterType = ringEmitter;

      ring.color1    = new Color4(
        Math.min(1, p.innerColor.r * 1.2),
        Math.min(1, p.innerColor.g * 1.1),
        Math.min(1, p.innerColor.b),
        0.5
      );
      ring.color2    = new Color4(1.0, 1.0, 1.0, 0.0);
      ring.colorDead = new Color4(0, 0, 0, 0);
      ring.minSize    = 0.08;
      ring.maxSize    = 0.35;
      ring.minLifeTime = 0.3;
      ring.maxLifeTime = 0.7;
      ring.emitRate   = 0;
      ring.direction1 = new Vector3(-2, 0.1, -2);
      ring.direction2 = new Vector3( 2, 0.5,  2);
      ring.minEmitPower = 2;
      ring.maxEmitPower = 5;
      ring.updateSpeed = 0.018;
      ring.blendMode  = ParticleSystem.BLENDMODE_ADD;
      ring.gravity    = new Vector3(0, -8, 0);
      ring.start();
      this.combatRingPS = ring;
    }
  }

  /**
   * Smoothly engage or disengage the combat aura.
   * @param {boolean} active
   */
  setCombatAura(active) {
    this._combatAuraActive = active;
  }

  /**
   * Per-frame ramp for combat aura intensity.
   * @param {number} delta   seconds
   */
  _updateCombatAura(delta) {
    const combatScale = getAuraBudget(this.performanceTier).combatScale ?? 1;
    // Ramp toward target intensity
    const target = this._combatAuraActive ? 1 : 0;
    const rampSpeed = this._combatAuraActive ? 4.0 : 2.0; // engage faster, disengage slower
    this._combatIntensity += (target - this._combatIntensity) * Math.min(1, rampSpeed * delta);

    // Snap to 0 when very close to avoid lingering single particles
    if (this._combatIntensity < 0.01) this._combatIntensity = 0;

    const t = this._combatIntensity;

    if (this.combatFlamePS) {
      this.combatFlamePS.emitRate = Math.round(220 * combatScale * t);
      // Pulse the flame size with combat intensity
      this.combatFlamePS.maxSize = 0.35 + 0.2 * t;
    }
    if (this.combatSparksPS) {
      this.combatSparksPS.emitRate = Math.round(45 * combatScale * t);
    }
    if (this.combatRingPS) {
      this.combatRingPS.emitRate = Math.round(35 * combatScale * t);
    }
  }

  _destroyCombatAura() {
    this.combatFlamePS?.dispose();
    this.combatSparksPS?.dispose();
    this.combatRingPS?.dispose();
    this.combatFlamePS  = null;
    this.combatSparksPS = null;
    this.combatRingPS   = null;
    this._combatAuraActive = false;
    this._combatIntensity  = 0;
  }

  _flashScreen(color) {
    if (this.registry && typeof this.registry.requestScreenFlash === "function") {
      this.registry.requestScreenFlash(color, 120, 0.6);
    }
  }

  dispose() {
    this._destroyAll();
    this.active = false;
  }
}

// ─── AuraSystem ───────────────────────────────────────────────────────────────
// Manages one AuraInstance per active slot.

/** How long combat aura lingers after the last combat activity (seconds) */
const COMBAT_AURA_LINGER = 1.8;

export class AuraSystem {
  /**
   * @param {import("@babylonjs/core").Scene} scene
   * @param {import("./CharacterRegistry").CharacterRegistry} registry
   * @param {import("../core/AssetLoader").AssetLoader} assetLoader
   */
  constructor(scene, registry, assetLoader) {
    this.scene       = scene;
    this.registry    = registry;
    this.assetLoader = assetLoader;

    /** @type {Map<number, AuraInstance>} slot → instance */
    this._instances = new Map();

    /** Per-slot timestamp of last combat activity (performance.now ms) */
    this._lastCombatActivity = new Map();
    this._performanceTier = "MED";

    this._wireEvents();
  }

  // ─── Per-Frame Update ─────────────────────────────────────────────────────

  update(delta) {
    const now = performance.now();
    let maxGlow = 0;

    for (const [slot, instance] of this._instances) {
      // ── Drive combat aura from character state ──
      const state = this.registry.getState(slot);
      if (state) {
        const isInCombat = !!(
          state.isActionLocked ||
          state.isBlocking ||
          state.isChargingKi ||
          (state.lastDamageTime && (now - state.lastDamageTime) < COMBAT_AURA_LINGER * 1000)
        );

        if (isInCombat) {
          this._lastCombatActivity.set(slot, now);
        }

        const lastActivity = this._lastCombatActivity.get(slot) ?? 0;
        const elapsed = (now - lastActivity) / 1000;
        instance.setCombatAura(elapsed < COMBAT_AURA_LINGER);
      }

      instance.update(delta);
      const pulse = 0.85 + 0.15 * Math.sin(instance._pulseT);
      const targetGlow = instance.profile.glowIntensity * pulse;
      if (targetGlow > maxGlow) maxGlow = targetGlow;
    }

    const glowLayer = this.scene.effectLayers?.find(l => l.name === "characterGlow");
    if (glowLayer && maxGlow > 0) {
      glowLayer.intensity = maxGlow;
    }
  }

  // ─── External API ─────────────────────────────────────────────────────────

  /**
   * Register a newly spawned character. Call after rootNode exists.
   * @param {number} slot
   * @param {import("@babylonjs/core").TransformNode} rootNode
   */
  attachToSlot(slot, rootNode) {
    if (this._instances.has(slot)) this._instances.get(slot).dispose();

    const instance = new AuraInstance(slot, this.scene, this.assetLoader, this.registry);
    instance.setPerformanceTier(this._performanceTier);
    instance.attach(rootNode);
    this._instances.set(slot, instance);
  }

  /**
   * Switch aura profile for a slot (call on transformation).
   * @param {number} slot
   * @param {string | null} transformId   null = base form
   * @param {boolean} playBurst           play transformation burst VFX
   * @param {Function} [onBurst]          called at burst peak
   */
  setTransform(slot, transformId, playBurst = false, onBurst) {
    const instance = this._instances.get(slot);
    if (!instance) return;

    const profileId = transformId ?? "BASE";

    if (playBurst) {
      instance.playTransformBurst(profileId, onBurst);
    } else {
      instance.setProfile(profileId);
    }
  }

  /**
   * Temporarily boost aura intensity (ki charge, ultimate charge).
   * @param {number} slot
   * @param {number} multiplier   e.g. 2.0 = double intensity
   * @param {number} duration     seconds
   */
  boostAura(slot, multiplier = 2.0, duration = 0.5) {
    const instance = this._instances.get(slot);
    if (!instance?.mainPS) return;

    const orig = instance.mainPS.emitRate;
    instance.mainPS.emitRate = orig * multiplier;

    setTimeout(() => {
      if (instance.mainPS) instance.mainPS.emitRate = orig;
    }, duration * 1000);
  }

  removeSlot(slot) {
    this._instances.get(slot)?.dispose();
    this._instances.delete(slot);
    this._lastCombatActivity.delete(slot);
  }

  // ─── Event Wiring ─────────────────────────────────────────────────────────

  _wireEvents() {
    this.registry.on("onPlayerSpawned", ({ slot }) => {
      const state = this.registry.getState(slot);
      if (state?.rootNode) this.attachToSlot(slot, state.fxNode ?? state.rootNode);
    });

    this.registry.on("onTransformChanged", (payload) => {
      const slot = payload?.slot;
      const transformId = payload?.transformId ?? payload?.currentTransform?.id ?? null;
      this.setTransform(slot, transformId, true, () => {
        console.log(`[AuraSystem] Slot ${slot} burst peak: ${transformId ?? "BASE"}`);
      });
    });

    this.registry.on("onPlayerDied", ({ slot }) => {
      // Fade out aura on death
      const instance = this._instances.get(slot);
      if (instance?.mainPS) {
        instance.mainPS.emitRate  = 0;
        instance.groundPS && (instance.groundPS.emitRate = 0);
        instance.lightningPS && (instance.lightningPS.emitRate = 0);
      }
    });

    this.registry.on("onDamageTaken", (payload) => {
      const slot = payload?.slot;
      const amount = payload?.amount ?? 0;
      if (amount > 800) this.boostAura(slot, 2.5, 0.3);
      // Immediately stamp combat activity so the combat aura engages on hit
      this._lastCombatActivity.set(slot, performance.now());
    });
  }

  setPerformanceTier(tier = "MED") {
    this._performanceTier = tier === "LOW" ? "LOW" : tier === "HIGH" ? "HIGH" : "MED";
    for (const instance of this._instances.values()) {
      instance.setPerformanceTier(this._performanceTier);
    }
  }

  dispose() {
    for (const [, inst] of this._instances) inst.dispose();
    this._instances.clear();
  }
}
function toColor4(color, fallbackAlpha = 1) {
  return new Color4(
    color?.r ?? 0,
    color?.g ?? 0,
    color?.b ?? 0,
    color?.a ?? fallbackAlpha,
  );
}
