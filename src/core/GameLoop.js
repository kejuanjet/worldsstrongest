import { Vector3 } from "@babylonjs/core";
import { CONFIG } from "../config/index.js";
import { createGameServices } from "./createGameServices.js";
import {
  hostSessionRuntime,
  joinSessionRuntime,
  startOneFightRuntime,
  startSinglePlayerRuntime,
  startTrainingModeRuntime,
} from "./runtime/SessionFlow.js";
import { autosaveRuntime, toggleMuteRuntime } from "./runtime/LoopRuntimeHelpers.js";
import { updateHudVisibilityRuntime } from "./runtime/OverlayRuntime.js";
import { updateFpsCounterRuntime } from "./runtime/QoLFeatures.js";
import { stepSimulationRuntime } from "./runtime/GameplayRuntime.js";
import { wireGameLoopEvents } from "./runtime/GameEventBindings.js";
import { bindHotkeys } from "./runtime/HotkeyBindings.js";
import { dumpEntityState, publishAutomationStatus } from "./runtime/DebugRuntime.js";
import {
  initPerformanceState,
  setQualityMode,
  applyPerformanceTier,
  samplePerformance,
  getPerformanceStats,
} from "./runtime/PerformanceRuntime.js";

const MODE = {
  MENU: "MENU",
  SINGLE_PLAYER: "SINGLE_PLAYER",
  TRAINING: "TRAINING",
  MULTIPLAYER_HOST: "MULTIPLAYER_HOST",
  MULTIPLAYER_CLIENT: "MULTIPLAYER_CLIENT",
};

const IDLE_INPUT = Object.freeze({
  moveX: 0,
  moveZ: 0,
  flyY: 0,
  btnAttack: false,
  btnHeavy: false,
  btnBlast: false,
  btnUltimate: false,
  btnRush: false,
  btnGrab: false,
  btnTransform: false,
  btnTransformDown: false,
  btnDodge: false,
  btnKi: false,
  btnBlock: false,
  btnStance: false,
  btnHeal: false,
  btnMagicAttack: false,
  lockedSlot: null,
  mashCount: 0,
});

export class GameLoop {
  constructor({ engine, scene, assetLoader, camera, dayNightCycle }, config = CONFIG) {
    this.config = config;
    // Session / mode state
    this.mode = MODE.MENU;
    this.currentZoneId = null;
    this.currentMissionId = null;
    this.currentProfileId = "default";
    this.localSlot = 0;
    this.isPaused = false;
    this.hudVisible = true;
    this._started = false;
    this._fixedAccumulator = 0;
    this._lastFrameAt = performance.now();
    this._remoteInputs = new Map();
    this._queuedAiInputs = new Map();
    this._prevInputs = new Map();
    this._respawnTimers = new Map();
    this._autosaveElapsed = 0;
    this._lastCombatFxAt = 0;
    this._overlayMode = "pause";
    this._overlayVisible = false;
    this._countdownIntroActive = false;
    this._countdownIntroPrime = null;
    this._lastNonZeroMaster = CONFIG.audio.masterVolume;
    this._scenarioId = null;
    this._autotestEnabled = false;
    this._oneFightConfig = null;
    this._oneFightEnemySlot = null;
    this._frameAdvanceCount = 0;

    // Hitstop state (ms counter; pauses fixed ticks to create "freeze-frame" feel)
    this._hitstopMs = 0;
    this._hitReactStates = new Map();
    this._recentHitsByAttacker = new Map();
    this._finisherCamera = null;
    this._speedLineOverrideUntil = 0;
    this._bloomOverrideUntil = 0;

    // Performance state (managed by PerformanceRuntime)
    initPerformanceState(this);

    // ── Construct all subsystems via factory (replaces 80 lines of manual wiring) ──
    const services = createGameServices(this, { engine, scene, assetLoader, camera, dayNightCycle });
    this.engine            = services.engine;
    this.scene             = services.scene;
    this.assetLoader       = services.assetLoader;
    this.camera            = services.camera;
    this.dayNightCycle     = services.dayNightCycle;
    this.registry          = services.registry;
    this.movement          = services.movement;
    this.combat            = services.combat;
    this.zoneManager       = services.zoneManager;
    this.sessionManager    = services.sessionManager;
    this.inputManager      = services.inputManager;
    this.hud               = services.hud;
    this.audioManager      = services.audioManager;
    this.animationController = services.animationController;
    this.enemyAI           = services.enemyAI;
    this.singlePlayer      = services.singlePlayer;
    this.openWorld         = services.openWorld;
    this.auraSystem        = services.auraSystem;
    this.vfx               = services.vfx;
    this.animeEffects      = services.animeEffects;
    this.impactFX          = services.impactFX;
    this.postProcessing    = services.postProcessing;
    this.dummyManager      = services.dummyManager;
    this.trainingHUD       = services.trainingHUD;
    this.combatPresentation = services.combatPresentation;
    this.overlayUi         = services.overlayUi;
    this.cameraController  = services.cameraController;

    applyPerformanceTier(this, this._performanceTier, { reason: "startup", preset: this._effectiveQualityPreset });
    this._setQualityMode(this._qualityMode, { persist: false });

    // Wire subsystem events
    this.enemyAI.setInputQueueSink((slot, input) => this._queuedAiInputs.set(slot, input));
    this.audioManager.wireEvents(this.combat, this.zoneManager, this.registry);
    this.hud.setLocalSlot(this.localSlot);
    this._handleResize = () => this.engine.resize();
    this._handleBeforeUnload = () => this._autosave(true);

    wireGameLoopEvents(this);
    this._hotkeyHandler = bindHotkeys(this);
    this._updateHudVisibility();
    this._updateOverlay();

    this.engine.runRenderLoop(() => this._frame());
    if (typeof window !== "undefined") {
      window.addEventListener("resize", this._handleResize);
      window.addEventListener("beforeunload", this._handleBeforeUnload);
    }
  }

  // ─── Delegates to extracted runtime modules ─────────────────────────────────

  _toggleMute() { toggleMuteRuntime(this); }
  _autosave(force) { autosaveRuntime(this, force); }
  _setQualityMode(mode, opts) { setQualityMode(this, mode, opts); }
  _getPerformanceStats() { return getPerformanceStats(this); }
  dumpEntityState(slot) { dumpEntityState(this, slot); }

  _setRuntimeBadge(label) {
    this.overlayUi?.setRuntimeBadge(label);
  }

  // ─── Pause / overlay ────────────────────────────────────────────────────────

  togglePause(force) {
    if (!this._started) return false;
    if (force !== undefined) {
      this.isPaused = force;
    } else {
      this.isPaused = !this.isPaused;
    }
    if (!this.isPaused) {
      this._frameAdvanceCount = 0;
    }
    this._showOverlay("pause", this.isPaused);
    return this.isPaused;
  }

  requestFrameAdvance(frames = 1) {
    if (!this._started) return 0;

    const nextFrames = Math.max(1, Math.floor(frames));
    this.isPaused = true;
    this._frameAdvanceCount = Math.min(120, this._frameAdvanceCount + nextFrames);
    this._showOverlay(this._overlayMode, true);
    this.overlayUi?.setRuntimeBadge(`Frame Step x${this._frameAdvanceCount}`);
    return this._frameAdvanceCount;
  }

  _showOverlay(mode = "pause", visible = true) {
    if (this._overlayMode === mode && this._overlayVisible === visible) return;
    this._overlayMode = mode;
    this._overlayVisible = visible;
    this.overlayUi?.show(mode, visible);
  }

  _updateOverlay() {
    if (this._countdownIntroActive) {
      this._showOverlay(this._overlayMode, false);
      return;
    }
    if (this.isPaused) {
      this._showOverlay(this._overlayMode, true);
      return;
    }
    this.overlayUi?.show(this._overlayMode, false);
    this.overlayUi?.updateRuntimeBadge({ isPaused: false });
    if (!this._started && this.mode === MODE.MENU) {
      this._setRuntimeBadge("Menu");
    }
  }

  _updateHudVisibility() {
    updateHudVisibilityRuntime(this);
    if (this.trainingHUD) {
      if (this.mode === MODE.TRAINING && this.hudVisible) this.trainingHUD.show();
      else this.trainingHUD.hide();
    }
  }

  // ─── Network helper ─────────────────────────────────────────────────────────

  async _ensureNetworkPlayer(slot, playerId, characterId = "RAYNE") {
    const existing = this.registry.getState(slot);
    if (existing) return existing;
    const spawn = this.zoneManager.getSpawnPoint(slot);
    return this.registry.spawnPlayer(playerId, slot, spawn, characterId);
  }

  // ─── Mode starters ─────────────────────────────────────────────────────────

  async startTrainingMode(characterId) {
    await startTrainingModeRuntime(this, characterId);
    this._updateHudVisibility();
  }

  async startSinglePlayer(options) {
    await startSinglePlayerRuntime(this, options);
    this._updateHudVisibility();
  }

  async startOneFight(options) {
    await startOneFightRuntime(this, options);
    this._updateHudVisibility();
  }

  async hostSession(zoneId, characterId) {
    await hostSessionRuntime(this, zoneId, characterId);
    this._updateHudVisibility();
  }

  async joinSession(address, characterId) {
    await joinSessionRuntime(this, address, characterId);
    this._updateHudVisibility();
  }

  // ─── Main frame loop ───────────────────────────────────────────────────────

  _frame() {
    try {
      const now = performance.now();
      const delta = Math.min((now - this._lastFrameAt) / 1000, CONFIG.maxDeltaCap);
      const deltaMs = (now - this._lastFrameAt);
      this._lastFrameAt = now;
      const shouldAdvanceFrame = this.isPaused
        && this._frameAdvanceCount > 0
        && this._started
        && !this._countdownIntroActive;
      const simulationDelta = this.isPaused
        ? (shouldAdvanceFrame ? CONFIG.fixedStep : 0)
        : delta;

      // Per-frame subsystem updates
      this.inputManager.update(delta);
      this.animationController.update(simulationDelta);
      this.auraSystem.update(simulationDelta);
      this.postProcessing.update(simulationDelta);
      this.impactFX.update(simulationDelta);
      this.hud.update(delta);
      this.trainingHUD?.update(delta);
      this.dayNightCycle?.update(simulationDelta);
      this._finisherCamera = this.cameraController.update(delta, {
        localSlot: this.localSlot,
        finisherCamera: this._finisherCamera,
      });
      samplePerformance(this, delta);
      updateFpsCounterRuntime(this, deltaMs);
      this._updateOverlay();

      // Speed lines based on player movement speed
      let localState = this.registry.getState(this.localSlot);
      if (this._speedLineOverrideUntil && now >= this._speedLineOverrideUntil) {
        this._speedLineOverrideUntil = 0;
        this.postProcessing.setSpeedLines(0);
      } else if (localState && !this._speedLineOverrideUntil) {
        const speed = Math.sqrt(localState.velocity.x ** 2 + localState.velocity.z ** 2);
        this.postProcessing.setSpeedLines(Math.max(0, (speed - 16) / 12));
      }

      if (this._bloomOverrideUntil && now >= this._bloomOverrideUntil) {
        this._bloomOverrideUntil = 0;
        this.postProcessing.setBloom(1.0);
      }

      // Fixed-step simulation
      if (shouldAdvanceFrame) {
        this._frameAdvanceCount -= 1;
        stepSimulationRuntime(this, CONFIG.fixedStep, IDLE_INPUT);
      } else if (!this.isPaused && this._started && !this._countdownIntroActive) {
        this._autosaveElapsed += delta;
        this._fixedAccumulator += delta;
        while (this._fixedAccumulator >= CONFIG.fixedStep) {
          this._fixedAccumulator -= CONFIG.fixedStep;
          stepSimulationRuntime(this, CONFIG.fixedStep, IDLE_INPUT);
        }
      }

      localState = this.registry.getState(this.localSlot);
      this.audioManager.update(delta, localState?.position ?? Vector3.Zero(), this.mode !== MODE.MENU);
      publishAutomationStatus(this);
      this.scene.render();
    } catch (err) {
      this._frameErrorCount = (this._frameErrorCount ?? 0) + 1;
      console.error("[GameLoop] Frame error:", err);

      // After 10 consecutive errors, stop the loop to prevent log flooding
      if (this._frameErrorCount >= 10) {
        console.error("[GameLoop] Too many consecutive frame errors — halting render loop.");
        this.engine.stopRenderLoop();
        return;
      }

      // Still render the scene so the screen doesn't freeze on transient errors
      try { this.scene.render(); } catch { /* last-resort fallback */ }
      return;
    }

    // Reset error counter on successful frame
    this._frameErrorCount = 0;
  }
}
