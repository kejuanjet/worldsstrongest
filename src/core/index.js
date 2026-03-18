// src/config/index.js
// Single source of truth for every tunable constant.
// Organized by subsystem. Tweak here, effects propagate everywhere.

export const CONFIG = {

  // ─── Engine / Loop ─────────────────────────────────────────────────────────
  fixedStep:          1 / 60,          // seconds — physics/game logic tick rate (60Hz)
  maxDeltaCap:        0.1,             // seconds — max delta passed to tick (prevent spiral-of-death)
  remoteInterpSpeed:  12,              // lerp speed for remote player mesh smoothing

  // ─── Network ───────────────────────────────────────────────────────────────
  network: {
    defaultPort:      7777,
    snapshotHz:       20,              // host → clients world state rate
    inputHz:          20,              // client → host input rate
    maxPlayers:       4,
    reconnectAttempts: 3,
    reconnectDelayMs: 2000,
  },

  // ─── Camera ────────────────────────────────────────────────────────────────
  camera: {
    minRadius:        2.0,             // close shoulder camera
    maxRadius:        8.5,
    minBeta:          0.42,
    maxBeta:          1.45,            // Allow lower camera angle to look up
    followSpeed:      16,
    rotationLerpSpeed: 10,
    lockOnSpeed:      24,              // Massive boost for snappy lock-on tracking
    defaultAlpha:    -Math.PI / 2,
    defaultBeta:      1.08,
    defaultRadius:    3.8,
    zoomLerpSpeed:    11,
    mouseSensitivity: 0.0021,
    gamepadSensitivity: 2.4,
    zoomSensitivity:  0.04,
    verticalOffset:   1.45,
    shoulderOffset:   1.1,
    lockOnShoulderOffset: 0.45,
    groundLookAhead:  0.65,
    flightLookAhead:  1.5,
    speedZoomRange:   0.7,
    lockOnOffsetY:    1.6,
    lockOnRadiusPadding: 2.2,
    lockOnRadiusScale:   0.16,
    lockOnBeta:       0.88,
    lockOnBreakDistance: 40,
    lockOnVerticalClamp: 4.5,          // Allow more vertical panning when target flies
    fov:              0.85,
    fovMin:           0.82,
    fovMax:           0.94,
    fovSpeedRamp:     0.028,
    collisionMargin:  0.45,
    bobFreqGround:    4.4,
    bobFreqFlight:    2.8,
    swayFreq:         2.6,
    bobAmp:           0.035,
  },

  // ─── Lighting ──────────────────────────────────────────────────────────────
  lighting: {
    ambientIntensity: 0.55,
    shadowBias:       0.001,
    dayNightCycleSeconds: 360,
    startTimeOfDay:   0.30,
  },

  // ─── Movement ──────────────────────────────────────────────────────────────
  movement: {
    // Ground
    groundSpeed:      14,              // m/s base (scaled by character.baseSpeed)
    groundAccel:      12,              // lerp coefficient toward target speed
    groundFriction:   18,              // lerp coefficient to zero when no input
    airFriction:      3,               // much less friction in air

    // Flight
    flightSpeed:      28,              // m/s base while flying
    flightAccel:      6,
    flightDrag:       2.5,             // natural float deceleration
    flyingKiDrain:    2.0,             // ki/second while sustained flight
    flightKiCost:     5,               // one-time ki cost to take off
    transformSpeedBonus: 0.4,          // fraction of transform multiplier added to speed

    // Jump / gravity
    jumpImpulse:      8,               // m/s initial vertical velocity on takeoff
    defaultGravity:  -18,             // m/s² (negative = downward)
    terminalVelocity:-60,             // m/s max fall speed
    landingLockout:   0.12,            // seconds of reduced control on landing

    // Dodge
    dodgeSpeed:       22,              // m/s during dodge
    dodgeDuration:    0.22,            // seconds
    dodgeStaminaCost: 25,
    dodgeInvincibilityMs: 180,         // ms of i-frames during dodge
    dodgeCooldown:    0.8,             // seconds before next dodge

    // Knockback
    knockbackDecay:   6,               // velocity decay rate during knockback

    // Rotation
    rotationSpeed:    10,              // rad/s character turn speed
  },

  // ─── Combat ────────────────────────────────────────────────────────────────
  combat: {
    // Scaling
    plScaleExponent:  0.4,             // power curve dampener (1.0 = fully linear)
    minDamage:        50,
    blockDamageReduction: 0.70,        // 70% damage reduction while blocking
    counterWindowMs:  250,             // ms after receiving a hit to counter

    // Shonen Mechanics
    perfectDodgeWindowMs: 150,         // ms window to trigger Z-Vanish on hit
    chaseWindowMs:    1000,            // ms window to press Rush after Heavy hit
    chaseKiCost:      10,              // ki cost to teleport dash

    // Beam clash
    clashMaxDuration: 8000,            // ms before auto-resolve
    clashMashWeight:  0.001,           // progress shift per mash
    clashPlWeight:    0.002,           // progress shift per tick from PL differential

    // Ki regen
    baseKiRegen:      4.0,             // ki/second base
    transformKiRegen: 0.30,            // fraction of base regen while transformed
    kiChargeRate:     20.0,            // ki/second gained while holding ki charge

    // HP regen
    baseHPRegen:      5.0,             // hp/second base
    hitGracePeriod:   3.0,             // seconds after last hit before HP regens

    // Combo
    comboWindow:      400,             // ms between hits to continue combo
    comboFadeMs:      2500,            // ms combo counter stays on screen
  },

  // ─── Characters ────────────────────────────────────────────────────────────
  characters: {
    maxHP:            10000,
    maxKi:            100,
    baseStamina:      100,
    staminaRegen:     15,              // stamina/second
    staminaRegenDelay: 1.5,            // seconds after use before regen starts
  },

  // ─── Respawn ───────────────────────────────────────────────────────────────
  respawnDelay:       4.0,             // seconds before dead player respawns

  // ─── Zones ─────────────────────────────────────────────────────────────────
  zones: {
    portalCheckInterval: 200,          // ms between portal proximity checks
    transitionFadeDuration: 0.5,       // seconds for zone fade in/out
    streamRadius:     300,             // units — zone chunk stream radius
  },

  // ─── Audio ─────────────────────────────────────────────────────────────────
  audio: {
    masterVolume:     0.8,
    musicVolume:      0.45,
    sfxVolume:        0.9,
    voiceVolume:      0.75,
    spatialBlend:     1.0,             // 0 = 2D, 1 = full 3D positional
    maxAudibleRange:  120,             // units
  },

  // ─── Visual / Effects ──────────────────────────────────────────────────────
  vfx: {
    auraParticleCount:     200,
    auraParticleCountHigh: 500,        // during transformation
    beamParticleCount:     300,
    explosionParticleCount: 800,
    impactParticleCount:    120,

    // Bloom (post-process)
    bloomThreshold:   0.8,
    bloomKernel:      64,
    bloomWeight:      0.35,

    // Volumetric light scattering for ki effects
    vlsCoefficients:  0.2,
    vlsDensity:       0.926,
    vlsWeight:        0.58,
    vlsDecay:         0.985,
    vlsSamples:       100,
  },

  performance: {
    hudUpdateHz:           15,
    adaptiveQuality:       true,
    fpsSampleWindow:       0.75,
    mediumFpsThreshold:    52,
    lowFpsThreshold:       42,
    highFpsThreshold:      58,
    promoteWindowCount:    3,
    demoteWindowCount:     2,
    highScalingLevel:      1.0,
    mediumScalingLevel:    1.25,
    lowScalingLevel:       1.5,
    candidateMarkerLimit:  4,
    cameraCollisionHz:     18,
    maxShockwaves:         10,
    maxSparkBursts:        12,
    maxWeaponTrails:       10,
    maxHitFlashes:         12,
    lightSparkCount:       14,
    heavySparkCount:       24,
    impactBudgets: {
      HIGH: {
        lightSparkCount: 32,
        heavySparkCount: 64,
        kiSparkCount: 48,
        beamSparkCount: 180,
        beamSmokeCount: 120,
        beamDebrisCount: 48,
        ultimateSparkCount: 320,
        ultimateSmokeCount: 220,
        ultimateDebrisCount: 72,
      },
      MED: {
        lightSparkCount: 24,
        heavySparkCount: 44,
        kiSparkCount: 36,
        beamSparkCount: 120,
        beamSmokeCount: 84,
        beamDebrisCount: 28,
        ultimateSparkCount: 220,
        ultimateSmokeCount: 150,
        ultimateDebrisCount: 48,
      },
      LOW: {
        lightSparkCount: 16,
        heavySparkCount: 28,
        kiSparkCount: 24,
        beamSparkCount: 80,
        beamSmokeCount: 48,
        beamDebrisCount: 16,
        ultimateSparkCount: 140,
        ultimateSmokeCount: 96,
        ultimateDebrisCount: 24,
      },
    },
    auraBudgets: {
      HIGH: {
        particleScale: 1.0,
        emitScale: 1.0,
        combatScale: 1.0,
        allowLightning: true,
        allowGroundRing: true,
        allowWindDebris: true,
        allowCombatRing: true,
      },
      MED: {
        particleScale: 0.72,
        emitScale: 0.75,
        combatScale: 0.7,
        allowLightning: true,
        allowGroundRing: true,
        allowWindDebris: false,
        allowCombatRing: true,
      },
      LOW: {
        particleScale: 0.45,
        emitScale: 0.5,
        combatScale: 0.42,
        allowLightning: false,
        allowGroundRing: false,
        allowWindDebris: false,
        allowCombatRing: false,
      },
    },
  },

  // ─── UI ────────────────────────────────────────────────────────────────────
  ui: {
    hudUpdateHz:       15,             // HUD doesn't need to update every frame
    qualityMode:       "AUTO",
    killFeedMaxItems:  5,
    killFeedDuration:  5,              // seconds each entry stays
    comboDuration:     2.5,            // seconds combo counter displays
    damageFlashMs:     180,
    zoneTransitionMs:  3000,
  },

  // ─── Debug ─────────────────────────────────────────────────────────────────
  debug: {
    enabled:           false,
    showHitboxes:      false,
    showNavmesh:       false,
    showNetworkStats:  true,
    logCombatEvents:   false,
    godMode:           false,          // infinite HP/Ki
    freeCamera:        false,
  },
};

// ─── Runtime Overrides ────────────────────────────────────────────────────────
// Load saved settings from localStorage and merge over defaults at runtime.
// Only safe scalar values are allowed through (no functions, no objects deeper than 1 level).

try {
  const saved = JSON.parse(localStorage.getItem("ws_config") ?? localStorage.getItem("dbz_config") ?? "{}");
  if (saved.audio) Object.assign(CONFIG.audio, saved.audio);
  if (saved.vfx)   Object.assign(CONFIG.vfx,   saved.vfx);
  if (saved.ui)    Object.assign(CONFIG.ui,     saved.ui);
} catch {
  // Corrupt storage — ignore
}

// ─── Persist Helper ───────────────────────────────────────────────────────────

/**
 * Save a config section to localStorage.
 * @param {"audio" | "vfx" | "ui"} section
 */
export function saveConfigSection(section) {
  try {
    const saved  = JSON.parse(localStorage.getItem("ws_config") ?? localStorage.getItem("dbz_config") ?? "{}");
    saved[section] = CONFIG[section];
    localStorage.setItem("ws_config", JSON.stringify(saved));
  } catch (e) { console.warn("[Config] Failed to save config section:", section, e); }
}

/**
 * Apply a flat override object into a config section (for settings menus).
 * @param {"audio" | "vfx" | "ui" | "debug"} section
 * @param {object} overrides
 */
export function applyConfig(section, overrides) {
  if (!CONFIG[section]) return;
  Object.assign(CONFIG[section], overrides);
  saveConfigSection(section);
}

// ─── Derived / Computed Values ───────────────────────────────────────────────
// These read from CONFIG so they stay in sync if CONFIG is modified at runtime.

export const DERIVED = {
  get snapshotIntervalMs()     { return 1000 / CONFIG.network.snapshotHz;    },
  get inputIntervalMs()        { return 1000 / CONFIG.network.inputHz;       },
  get fixedStepMs()            { return CONFIG.fixedStep * 1000;             },
  get flightKiDrainPerStep()   { return CONFIG.movement.flyingKiDrain * CONFIG.fixedStep; },
  get staminaRegenPerStep()    { return CONFIG.characters.staminaRegen * CONFIG.fixedStep; },
  get baseKiRegenPerStep()     { return CONFIG.combat.baseKiRegen  * CONFIG.fixedStep;   },
  get kiChargePerStep()        { return CONFIG.combat.kiChargeRate * CONFIG.fixedStep;   },
  get baseHPRegenPerStep()     { return CONFIG.combat.baseHPRegen  * CONFIG.fixedStep;   },
};
