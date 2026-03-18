// src/core/runtime/QoLFeatures.js
// Quality of Life features: FPS counter, training reset, damage number toggle

import { CONFIG } from "../index.js";

// ─── Helper: Format bytes to human readable ──────────────────────────────────

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined || bytes === 0) return "--";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

// ─── FPS & Memory Counter ────────────────────────────────────────────────────

export class FpsCounter {
  constructor(engine = null) {
    this._fps = 0;
    this._frameTime = 0;
    this._lastTime = performance.now();
    this._frameCount = 0;
    this._accumulatedTime = 0;
    this._updateInterval = 500; // Update every 500ms
    this._element = null;
    this._enabled = false;
    this._engine = engine;
    
    // Memory tracking
    this._ramUsed = null;
    this._ramTotal = null;
    this._vramUsed = null;
    this._vramTotal = null;
    this._hasMemoryApi = !!(performance && "memory" in performance);
    this._stats = null;
  }

  get isEnabled() {
    return this._enabled;
  }

  toggle() {
    this._enabled = !this._enabled;
    if (this._enabled) {
      this._createElement();
      this._updateMemoryInfo();
    } else {
      this._destroyElement();
    }
    return this._enabled;
  }

  update(deltaMs, stats = null) {
    if (!this._enabled) return;
    this._stats = stats;

    this._frameCount++;
    this._accumulatedTime += deltaMs;

    if (this._accumulatedTime >= this._updateInterval) {
      this._fps = Math.round((this._frameCount * 1000) / this._accumulatedTime);
      this._frameTime = Math.round((this._accumulatedTime / this._frameCount) * 10) / 10;
      this._frameCount = 0;
      this._accumulatedTime = 0;
      this._updateMemoryInfo();
      this._render();
    }
  }

  _updateMemoryInfo() {
    // RAM via Chrome's performance.memory
    if (this._hasMemoryApi) {
      const mem = performance.memory;
      if (mem) {
        this._ramUsed = mem.usedJSHeapSize;
        this._ramTotal = mem.totalJSHeapSize;
      }
    }

    // VRAM via WebGL extensions
    if (this._engine) {
      try {
        const gl = this._engine._gl || this._engine.getRenderingCanvas()?.getContext("webgl2");
        if (gl) {
          // Try to get GPU memory info
          const ext = gl.getExtension("GMAN_webgl_memory");
          if (ext) {
            this._vramUsed = ext.getMemoryInfo()?.texture?.size || null;
          }
          
          // Alternative: Try WebGL debug renderer info (doesn't give usage but useful)
          const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
          if (debugInfo) {
            // This gives vendor/renderer strings, not memory usage
          }
        }
      } catch {
        // Ignore errors from VRAM probing
      }
    }

    // If we couldn't get VRAM from extensions, estimate from engine
    if (!this._vramUsed && this._engine) {
      // Babylon.js engine has some internal stats we can use
      const stats = this._engine.getRenderingStats?.();
      if (stats) {
        // Rough estimate: textures count * average texture size
        this._vramUsed = null; // Will show as "--"
      }
    }
  }

  _createElement() {
    if (this._element) return;

    const el = document.createElement("div");
    el.id = "fps-counter";
    Object.assign(el.style, {
      position: "fixed",
      top: "10px",
      right: "10px",
      background: "rgba(0, 0, 0, 0.75)",
      color: "#2fcfff",
      padding: "10px 14px",
      borderRadius: "8px",
      fontFamily: "monospace",
      fontSize: "13px",
      fontWeight: "bold",
      pointerEvents: "none",
      zIndex: "10000",
      border: "1px solid #2fcfff55",
      textAlign: "right",
      minWidth: "140px",
      lineHeight: "1.4",
    });

    document.body.appendChild(el);
    this._element = el;
    this._render();
  }

  _destroyElement() {
    if (this._element) {
      this._element.remove();
      this._element = null;
    }
  }

  _render() {
    if (!this._element) return;

    const fpsColor = this._fps >= 55 ? "#4ade80" : this._fps >= 30 ? "#fbbf24" : "#ef4444";
    const ramColor = this._hasMemoryApi ? "#a78bfa" : "#6b7280";
    const vramColor = "#f472b6";
    const stats = this._stats ?? {};
    
    const ramText = this._hasMemoryApi 
      ? `${formatBytes(this._ramUsed)} / ${formatBytes(this._ramTotal)}`
      : "-- (N/A)";
    const scalingText = Number.isFinite(stats.hardwareScalingLevel)
      ? `${stats.hardwareScalingLevel.toFixed(2)}x`
      : "--";

    this._element.innerHTML = `
      <div style="color: ${fpsColor}; font-size: 16px; margin-bottom: 4px;">${this._fps} FPS</div>
      <div style="font-size: 11px; color: #9ca3af; margin-bottom: 6px;">${this._frameTime}ms frame time</div>
      <div style="font-size: 11px; color: #93c5fd; margin-bottom: 2px;">
        <span style="color: #6b7280;">Quality:</span> ${stats.qualityMode ?? "--"} / ${stats.effectiveQualityPreset ?? "--"}
      </div>
      <div style="font-size: 11px; color: #c4b5fd; margin-bottom: 2px;">
        <span style="color: #6b7280;">Tier:</span> ${stats.performanceTier ?? "--"} <span style="color: #6b7280;">Scale:</span> ${scalingText}
      </div>
      <div style="font-size: 11px; color: #fca5a5; margin-bottom: 2px;">
        <span style="color: #6b7280;">Meshes:</span> ${stats.activeMeshes ?? "--"} <span style="color: #6b7280;">Draws:</span> ${stats.drawCalls ?? "--"}
      </div>
      <div style="border-top: 1px solid #374151; padding-top: 6px; margin-top: 6px;">
        <div style="color: ${ramColor}; font-size: 11px;">
          <span style="color: #6b7280;">RAM:</span> ${ramText}
        </div>
        <div style="color: ${vramColor}; font-size: 11px; margin-top: 2px;">
          <span style="color: #6b7280;">VRAM:</span> ${formatBytes(this._vramUsed)}
        </div>
        <div style="color: #67e8f9; font-size: 11px; margin-top: 2px;">
          <span style="color: #6b7280;">ImpactFX:</span> ${stats.impactFxMs != null ? `${stats.impactFxMs.toFixed(2)}ms` : "--"}
        </div>
        <div style="color: #fde68a; font-size: 11px; margin-top: 2px;">
          <span style="color: #6b7280;">Retarget:</span> ${stats.retargetMs != null ? `${stats.retargetMs.toFixed(2)}ms` : "--"}
        </div>
      </div>
    `;
  }
}

// ─── Damage Numbers Toggle ───────────────────────────────────────────────────

export class DamageNumbersToggle {
  constructor() {
    this._enabled = true;
    this._element = null;
  }

  get isEnabled() {
    return this._enabled;
  }

  toggle() {
    this._enabled = !this._enabled;
    return this._enabled;
  }

  shouldShow() {
    return this._enabled;
  }
}

// ─── Training Mode QoL ───────────────────────────────────────────────────────

export class TrainingQoL {
  constructor(gameLoop) {
    this._gameLoop = gameLoop;
    this._savedPosition = null;
    this._savedRotation = null;
  }

  /**
   * Reset training mode: restore player and dummy to initial positions
   */
  resetTraining() {
    const game = this._gameLoop;
    if (game.mode !== "TRAINING") return false;

    // Reset player position
    const playerState = game.registry.getState(game.localSlot);
    if (playerState) {
      const spawnPoint = game.zoneManager?.getSpawnPoint?.(game.localSlot) ?? { x: 0, y: 1, z: 0 };
      playerState.position.copyFrom(spawnPoint);
      playerState.velocity.copyFromFloats(0, 0, 0);
      playerState.hp = playerState.maxHP;
      playerState.ki = playerState.maxKi;
      playerState.stamina = playerState.maxStamina;
      playerState.isDead = false;
      playerState.rootNode?.setEnabled(true);
    }

    // Reset dummy position
    const dummyState = game.registry.slots.get(1); // Dummy is usually slot 1
    if (dummyState?.isTrainingDummy) {
      const dummySpawn = game.zoneManager?.getSpawnPoint?.(1) ?? { x: 5, y: 1, z: 5 };
      dummyState.position.copyFrom(dummySpawn);
      dummyState.velocity.copyFromFloats(0, 0, 0);
      dummyState.hp = dummyState.maxHP;
      dummyState.isDead = false;
      dummyState.rootNode?.setEnabled(true);
    }

    // Reset camera
    if (game.camera) {
      game.camera.alpha = CONFIG.camera?.defaultAlpha ?? -Math.PI / 2;
      game.camera.beta = CONFIG.camera?.defaultBeta ?? Math.PI / 2.5;
      game.camera.radius = CONFIG.camera?.defaultRadius ?? 12;
    }

    game._setRuntimeBadge?.("Training Reset");
    return true;
  }

  /**
   * Save current player position and state
   */
  savePosition() {
    const game = this._gameLoop;
    const playerState = game.registry?.getState?.(game.localSlot);
    if (!playerState) return false;

    this._savedPosition = playerState.position.clone();
    this._savedRotation = playerState.rootNode?.rotation?.y ?? 0;
    game._setRuntimeBadge?.("Position Saved");
    return true;
  }

  /**
   * Load saved player position and state
   */
  loadPosition() {
    const game = this._gameLoop;
    if (!this._savedPosition) {
      game._setRuntimeBadge?.("No Saved Position");
      return false;
    }

    const playerState = game.registry?.getState?.(game.localSlot);
    if (!playerState) return false;

    playerState.position.copyFrom(this._savedPosition);
    if (playerState.rootNode) {
      playerState.rootNode.rotation.y = this._savedRotation ?? 0;
    }
    playerState.velocity.copyFromFloats(0, 0, 0);

    game._setRuntimeBadge?.("Position Loaded");
    return true;
  }
}

// ─── Runtime Helpers ─────────────────────────────────────────────────────────

export function toggleFpsCounterRuntime(game) {
  if (!game._fpsCounter) {
    // Pass the Babylon.js engine for VRAM tracking
    game._fpsCounter = new FpsCounter(game.engine);
  }
  const enabled = game._fpsCounter.toggle();
  game._setRuntimeBadge?.(enabled ? "FPS Counter ON" : "FPS Counter OFF");
}

export function toggleDamageNumbersRuntime(game) {
  if (!game._damageToggle) {
    game._damageToggle = new DamageNumbersToggle();
  }
  const enabled = game._damageToggle.toggle();
  game._setRuntimeBadge?.(enabled ? "Damage Numbers ON" : "Damage Numbers OFF");
}

export function resetTrainingRuntime(game) {
  if (!game._trainingQoL) {
    game._trainingQoL = new TrainingQoL(game);
  }
  return game._trainingQoL.resetTraining();
}

export function savePositionRuntime(game) {
  if (!game._trainingQoL) {
    game._trainingQoL = new TrainingQoL(game);
  }
  return game._trainingQoL.savePosition();
}

export function loadPositionRuntime(game) {
  if (!game._trainingQoL) {
    game._trainingQoL = new TrainingQoL(game);
  }
  return game._trainingQoL.loadPosition();
}

export function updateFpsCounterRuntime(game, deltaMs) {
  if (game._fpsCounter?.isEnabled) {
    game._fpsCounter.update(deltaMs, game._getPerformanceStats?.() ?? null);
  }
}

export function shouldShowDamageNumbers(game) {
  return game._damageToggle?.shouldShow?.() ?? true;
}
