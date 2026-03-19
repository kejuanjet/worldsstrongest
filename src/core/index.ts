import { CAMERA_CONFIG } from "../config/camera.js";

type PersistedConfigSection = "audio" | "vfx" | "ui" | "movement" | "combat" | "camera" | "debug";

const PERSISTED_CONFIG_SECTIONS: readonly PersistedConfigSection[] = [
  "audio",
  "vfx",
  "ui",
  "movement",
  "combat",
  "camera",
  "debug",
];

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getStorage(): Storage | null {
  if (typeof localStorage === "undefined") {
    return null;
  }
  return localStorage;
}

function readStoredConfig(): Partial<Record<PersistedConfigSection, Record<string, unknown>>> {
  const storage = getStorage();
  if (!storage) {
    return {};
  }

  try {
    const raw = storage.getItem("ws_config") ?? storage.getItem("dbz_config") ?? "{}";
    const parsed = JSON.parse(raw) as unknown;
    if (!isObjectRecord(parsed)) {
      return {};
    }

    const result: Partial<Record<PersistedConfigSection, Record<string, unknown>>> = {};
    for (const section of PERSISTED_CONFIG_SECTIONS) {
      const sectionValue = parsed[section];
      if (isObjectRecord(sectionValue)) {
        result[section] = sectionValue;
      }
    }
    return result;
  } catch {
    return {};
  }
}

export const CONFIG = {
  fixedStep: 1 / 60,
  maxDeltaCap: 0.1,
  remoteInterpSpeed: 12,

  network: {
    defaultPort: 7777,
    snapshotHz: 20,
    inputHz: 20,
    maxPlayers: 4,
    reconnectAttempts: 3,
    reconnectDelayMs: 2000,
  },

  camera: {
    minRadius: 2.0,
    maxRadius: 8.5,
    minBeta: 0.42,
    maxBeta: 1.45,
    followSpeed: 16,
    rotationLerpSpeed: 10,
    lockOnSpeed: 24,
    defaultAlpha: -Math.PI / 2,
    defaultBeta: 1.08,
    defaultRadius: 3.8,
    zoomLerpSpeed: 11,
    mouseSensitivity: 0.0021,
    gamepadSensitivity: 2.4,
    zoomSensitivity: 0.04,
    inputAccel: 15,
    inputDeadzone: 0.15,
    verticalOffset: 1.45,
    shoulderOffset: 1.1,
    lockOnShoulderOffset: 0.45,
    groundLookAhead: 0.65,
    flightLookAhead: 1.5,
    speedZoomRange: 0.7,
    lockOnOffsetY: 1.6,
    lockOnRadiusPadding: 2.2,
    lockOnRadiusScale: 0.16,
    lockOnBeta: 0.88,
    lockOnBreakDistance: 40,
    lockOnVerticalClamp: 4.5,
    fov: 0.85,
    fovMin: 0.82,
    fovMax: 0.94,
    fovSpeedRamp: 0.028,
    collisionMargin: 0.45,
    bobFreqGround: 4.4,
    bobFreqFlight: 2.8,
    swayFreq: 2.6,
    bobAmp: 0.035,
  },

  lighting: {
    ambientIntensity: 0.55,
    shadowBias: 0.001,
    dayNightCycleSeconds: 360,
    startTimeOfDay: 0.3,
  },

  movement: {
    groundSpeed: 14,
    groundAccel: 12,
    groundFriction: 18,
    airFriction: 3,
    flightSpeed: 28,
    flightAccel: 6,
    flightDrag: 2.5,
    flyingKiDrain: 2.0,
    flightKiCost: 5,
    transformSpeedBonus: 0.4,
    jumpImpulse: 8,
    defaultGravity: -18,
    terminalVelocity: -60,
    landingLockout: 0.12,
    dodgeSpeed: 22,
    dodgeDuration: 0.22,
    dodgeStaminaCost: 25,
    dodgeInvincibilityMs: 180,
    dodgeCooldown: 0.8,
    knockbackDecay: 6,
    rotationSpeed: 10,
  },

  combat: {
    plScaleExponent: 0.4,
    minDamage: 50,
    baseDamageMultiplier: 1,
    blockDamageReduction: 0.7,
    counterWindowMs: 250,
    perfectDodgeWindowMs: 150,
    zVanishWindowMs: 200,
    zVanishStaminaCost: 20,
    zVanishTeleportDist: 2.5,
    meleeClashWindowMs: 150,
    meleeClashKnockback: 12,
    projectileHitRadius: 1.5,
    aimAssistStrength: 0.4,
    deflectSpeedBoost: 1.5,
    deflectRetargetBlend: 0.8,
    beamClashDotThreshold: -0.7,
    beamClashDamageFactor: 0.7,
    chaseWindowMs: 1000,
    chaseKiCost: 10,
    clashMaxDuration: 8000,
    clashMashWeight: 0.001,
    clashPlWeight: 0.002,
    baseKiRegen: 4,
    transformKiRegen: 0.3,
    kiChargeRate: 20,
    baseHPRegen: 5,
    hitGracePeriod: 3,
    comboWindow: 400,
    comboFadeMs: 2500,
    comboScaleCap: 8,
    comboScalePerHit: 0.12,
    comboGuardBreakBonus: 0.1,
    comboLauncherCounts: [5, 9],
    comboKnockbackScale: 0.1,
    comboKnockbackCap: 6,
    comboEventThreshold: 3,
    rushHitCount: 8,
    rushDamageFactor: 0.6,
    rushFinisherKnockback: 20,
    lungeDistanceNormal: 0.85,
    lungeDistanceGuardBreak: 1.35,
    lungeAssistExtra: 0.8,
    lungeMinDistance: 0.2,
    lungeAssistRangeExtra: 1.5,
    knockbackMinDuration: 0.18,
    knockbackMaxDuration: 0.45,
    knockbackDurationBase: 0.16,
    knockbackDurationScale: 0.018,
    knockbackUpwardBias: 0.5,
    blockKnockbackMin: 2,
    blockKnockbackScale: 0.22,
  },

  characters: {
    maxHP: 10000,
    maxKi: 100,
    baseStamina: 100,
    staminaRegen: 15,
    staminaRegenDelay: 1.5,
  },

  respawnDelay: 4,

  zones: {
    portalCheckInterval: 200,
    transitionFadeDuration: 0.5,
    streamRadius: 300,
  },

  audio: {
    masterVolume: 0.8,
    musicVolume: 0.45,
    sfxVolume: 0.9,
    voiceVolume: 0.75,
    spatialBlend: 1,
    maxAudibleRange: 120,
  },

  vfx: {
    auraParticleCount: 200,
    auraParticleCountHigh: 500,
    beamParticleCount: 300,
    explosionParticleCount: 800,
    impactParticleCount: 120,
    bloomThreshold: 0.8,
    bloomKernel: 64,
    bloomWeight: 0.35,
    vlsCoefficients: 0.2,
    vlsDensity: 0.926,
    vlsWeight: 0.58,
    vlsDecay: 0.985,
    vlsSamples: 100,
  },

  performance: {
    hudUpdateHz: 15,
    adaptiveQuality: true,
    fpsSampleWindow: 0.75,
    mediumFpsThreshold: 52,
    lowFpsThreshold: 42,
    highFpsThreshold: 58,
    promoteWindowCount: 3,
    demoteWindowCount: 2,
    highScalingLevel: 1,
    mediumScalingLevel: 1.25,
    lowScalingLevel: 1.5,
    candidateMarkerLimit: 4,
    cameraCollisionHz: 18,
    maxShockwaves: 10,
    maxSparkBursts: 12,
    maxWeaponTrails: 10,
    maxHitFlashes: 12,
    lightSparkCount: 14,
    heavySparkCount: 24,
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
        particleScale: 1,
        emitScale: 1,
        combatScale: 1,
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

  ui: {
    hudUpdateHz: 15,
    qualityMode: "AUTO",
    killFeedMaxItems: 5,
    killFeedDuration: 5,
    comboDuration: 2.5,
    damageFlashMs: 180,
    zoneTransitionMs: 3000,
  },

  debug: {
    enabled: false,
    showHitboxes: false,
    showNavmesh: false,
    showNetworkStats: true,
    logCombatEvents: false,
    godMode: false,
    freeCamera: false,
  },
};

Object.assign(CONFIG.camera, CAMERA_CONFIG);

const storedConfig = readStoredConfig();
for (const section of PERSISTED_CONFIG_SECTIONS) {
  const savedSection = storedConfig[section];
  if (!savedSection) {
    continue;
  }
  Object.assign(CONFIG[section], savedSection);
}

export function saveConfigSection(section: PersistedConfigSection): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    const saved = readStoredConfig();
    saved[section] = { ...CONFIG[section] };
    storage.setItem("ws_config", JSON.stringify(saved));
  } catch (error) {
    console.warn("[Config] Failed to save config section:", section, error);
  }
}

export function applyConfig<TSection extends PersistedConfigSection>(
  section: TSection,
  overrides: Partial<(typeof CONFIG)[TSection]>,
): void {
  Object.assign(CONFIG[section], overrides);
  saveConfigSection(section);
}

export const DERIVED = {
  get snapshotIntervalMs(): number { return 1000 / CONFIG.network.snapshotHz; },
  get inputIntervalMs(): number { return 1000 / CONFIG.network.inputHz; },
  get fixedStepMs(): number { return CONFIG.fixedStep * 1000; },
  get flightKiDrainPerStep(): number { return CONFIG.movement.flyingKiDrain * CONFIG.fixedStep; },
  get staminaRegenPerStep(): number { return CONFIG.characters.staminaRegen * CONFIG.fixedStep; },
  get baseKiRegenPerStep(): number { return CONFIG.combat.baseKiRegen * CONFIG.fixedStep; },
  get kiChargePerStep(): number { return CONFIG.combat.kiChargeRate * CONFIG.fixedStep; },
  get baseHPRegenPerStep(): number { return CONFIG.combat.baseHPRegen * CONFIG.fixedStep; },
};