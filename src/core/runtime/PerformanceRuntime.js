// Performance sampling, quality-tier management, and adaptive scaling.
// Extracted from GameLoop to keep the main orchestrator thin.

import { CONFIG, applyConfig } from "../index.js";

export function getScalingLevelForPerformanceTier(tier) {
  if (tier === "LOW") return CONFIG.performance?.lowScalingLevel ?? 1.5;
  if (tier === "MED") return CONFIG.performance?.mediumScalingLevel ?? 1.25;
  return CONFIG.performance?.highScalingLevel ?? 1;
}

export function applyHardwareScalingLevel(game, level) {
  const nextLevel = Math.max(1, Number.isFinite(level) ? level : 1);
  game.engine.setHardwareScalingLevel(nextLevel);
  return nextLevel;
}


/**
 * Initialise the performance-related state fields on a GameLoop instance.
 * Called once from the GameLoop constructor.
 */
export function initPerformanceState(game) {
  game._fpsSampleElapsed = 0;
  game._fpsSampleFrames = 0;
  game._performanceTier = "MED";
  game._qualityMode = CONFIG.ui.qualityMode ?? "AUTO";
  game._effectiveQualityPreset = "MED";
  game._hardwareScalingLevel = applyHardwareScalingLevel(game, getScalingLevelForPerformanceTier("MED"));
  game._adaptiveLowWindows = 0;
  game._adaptiveHighWindows = 0;
  game._lastFpsSample = 60;
}

/**
 * Set the quality mode ("AUTO" | "LOW" | "MED" | "HIGH" | "ULTRA").
 */
export function setQualityMode(game, mode, { persist = true } = {}) {
  const normalizedMode = ["AUTO", "LOW", "MED", "HIGH", "ULTRA"].includes(mode) ? mode : "AUTO";
  game._qualityMode = normalizedMode;
  game._fpsSampleElapsed = 0;
  game._fpsSampleFrames = 0;
  game._adaptiveLowWindows = 0;
  game._adaptiveHighWindows = 0;

  if (persist) {
    applyConfig("ui", { qualityMode: normalizedMode });
  }

  if (normalizedMode === "AUTO") {
    applyPerformanceTier(game, game._performanceTier, { reason: "auto-resume" });
  } else {
    const manualTier = normalizedMode === "LOW"
      ? "LOW"
      : normalizedMode === "MED"
        ? "MED"
        : "HIGH";
    applyPerformanceTier(game, manualTier, {
      reason: "manual",
      preset: normalizedMode,
    });
  }

  game.overlayUi?.updateRuntimeBadge();
}

/**
 * Apply a performance tier and update engine scaling + subsystem quality.
 */
export function applyPerformanceTier(game, tier, { reason = "runtime", preset = null } = {}) {
  const normalizedTier = tier === "LOW" ? "LOW" : tier === "HIGH" ? "HIGH" : "MED";
  const effectivePreset = preset ?? getQualityPresetForTier(normalizedTier);
  const scalingLevel = preset === "ULTRA"
    ? getScalingLevelForPerformanceTier("ULTRA")
    : getScalingLevelForPerformanceTier(normalizedTier);

  game._performanceTier = normalizedTier;
  game._effectiveQualityPreset = effectivePreset;
  game._hardwareScalingLevel = applyHardwareScalingLevel(game, scalingLevel);

  game.postProcessing?.setQuality?.(effectivePreset);
  game.impactFX?.setPerformanceTier?.(normalizedTier);
  game.auraSystem?.setPerformanceTier?.(normalizedTier);

  game.scene.metadata = {
    ...(game.scene.metadata ?? {}),
    performance: {
      tier: normalizedTier,
      preset: effectivePreset,
      scalingLevel: game._hardwareScalingLevel,
      mode: game._qualityMode,
      reason,
    },
  };
}

/**
 * Sample FPS and adaptively adjust the performance tier when in AUTO mode.
 */
export function samplePerformance(game, delta) {
  if (!CONFIG.performance.adaptiveQuality || game._qualityMode !== "AUTO") return;

  game._fpsSampleElapsed += delta;
  game._fpsSampleFrames += 1;

  if (game._fpsSampleElapsed < (CONFIG.performance.fpsSampleWindow ?? 0.75)) return;

  const fps = game._fpsSampleFrames / Math.max(game._fpsSampleElapsed, 0.001);
  game._lastFpsSample = fps;
  game._fpsSampleElapsed = 0;
  game._fpsSampleFrames = 0;

  const lowThreshold = CONFIG.performance.lowFpsThreshold ?? 42;
  const mediumThreshold = CONFIG.performance.mediumFpsThreshold ?? 52;
  const highThreshold = CONFIG.performance.highFpsThreshold ?? (mediumThreshold + 6);
  const promoteWindows = CONFIG.performance.promoteWindowCount ?? 3;
  const demoteWindows = CONFIG.performance.demoteWindowCount ?? 2;

  let nextTier = game._performanceTier;

  if (fps < lowThreshold) {
    game._adaptiveLowWindows += 1;
    game._adaptiveHighWindows = 0;
    if (game._adaptiveLowWindows >= demoteWindows) {
      nextTier = game._performanceTier === "HIGH" ? "MED" : "LOW";
    }
  } else if (fps < mediumThreshold) {
    game._adaptiveLowWindows += 1;
    game._adaptiveHighWindows = 0;
    if (game._adaptiveLowWindows >= demoteWindows) {
      nextTier = game._performanceTier === "HIGH" ? "MED" : game._performanceTier;
    }
  } else if (fps >= highThreshold) {
    game._adaptiveHighWindows += 1;
    game._adaptiveLowWindows = 0;
    if (game._adaptiveHighWindows >= promoteWindows) {
      nextTier = game._performanceTier === "LOW" ? "MED" : "HIGH";
    }
  } else {
    game._adaptiveLowWindows = 0;
    game._adaptiveHighWindows = 0;
  }

  if (nextTier !== game._performanceTier) {
    game._adaptiveLowWindows = 0;
    game._adaptiveHighWindows = 0;
    applyPerformanceTier(game, nextTier, {
      reason: `adaptive-${fps.toFixed(1)}fps`,
    });
    game.overlayUi?.updateRuntimeBadge();
  }
}

/**
 * Gather current performance stats for the FPS counter overlay.
 */
export function getPerformanceStats(game) {
  const activeMeshes = game.scene?.getActiveMeshes?.();
  const drawCalls =
    game.engine?._drawCalls?.current
    ?? game.engine?._drawCalls?.fetchNewFrame?.()
    ?? game.scene?._activeIndices?.length
    ?? null;
  return {
    qualityMode: game._qualityMode,
    effectiveQualityPreset: game._effectiveQualityPreset,
    performanceTier: game._performanceTier,
    hardwareScalingLevel: game._hardwareScalingLevel,
    activeMeshes: activeMeshes?.length ?? null,
    drawCalls,
    sampledFps: game._lastFpsSample,
    impactFxMs: game.impactFX?.getAverageCreationMs?.() ?? null,
    retargetMs: game.animationController?.getAverageRetargetMs?.() ?? null,
  };
}

function getQualityPresetForTier(tier) {
  if (tier === "LOW") return "LOW";
  if (tier === "HIGH") return "HIGH";
  return "MED";
}
