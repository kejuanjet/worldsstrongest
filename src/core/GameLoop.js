import {
  ArcRotateCamera,
  Color3,
  DirectionalLight,
  HemisphericLight,
  Vector3,
} from "@babylonjs/core";
import {
  engine,
  scene,
  assetLoader,
  applyHardwareScalingLevel,
  getHardwareScalingLevel,
  getScalingLevelForPerformanceTier,
} from "./engine.js";
import { CONFIG, applyConfig } from "../config/index.js";
import { CharacterRegistry, CHARACTER_ROSTER } from "./CharacterRegistry.js";
import { MovementController } from "./MovementController.js";
import { CombatSystem } from "./CombatSystem.js";
import { ZoneManager } from "./ZoneManager.js";
import { SessionManager } from "./SessionManager.js";
import { InputManager } from "./InputManager.js";
import { HUD } from "./HUD.js";
import { SinglePlayerManager } from "./SinglePlayerManager.js";
import { AudioManager } from "./AudioManager.js";
import { AnimationController } from "./AnimationController.js";
import { PostProcessing } from "./PostProcessing.js";
import { AuraSystem } from "./AuraSystem.js";
import { VFXManager } from "./VFXManager.js";
import { AnimeEffects } from "./vfx/AnimeEffects.js";
import { ImpactFX } from "./ImpactFX.js";
import { EnemyAIController } from "../ai/EnemyAIController.js";
import { TrainingDummyManager } from "../ai/TrainingDummy.js";
import { TrainingHUD } from "../ui/TrainingHUD.js";
import { GameOverlayUI } from "./runtime/GameOverlayUI.js";
import { CombatPresentationRouter } from "./runtime/CombatPresentationRouter.js";
import {
  hostSessionRuntime,
  joinSessionRuntime,
  startOneFightRuntime,
  startSinglePlayerRuntime,
  startTrainingModeRuntime,
} from "./runtime/SessionFlow.js";
import {
  autosaveRuntime,
  toggleMuteRuntime,
} from "./runtime/LoopRuntimeHelpers.js";
import { updateHudVisibilityRuntime } from "./runtime/OverlayRuntime.js";
import { toggleFpsCounterRuntime, updateFpsCounterRuntime } from "./runtime/QoLFeatures.js";
import {
  stepSimulationRuntime,
} from "./runtime/GameplayRuntime.js";
import { wireGameLoopEvents } from "./runtime/GameEventBindings.js";
import { RuntimeCameraController } from "./runtime/RuntimeCameraController.js";
import { OpenWorldDirector } from "./open-world/OpenWorldDirector.js";
import { DayNightCycleController } from "./environment/DayNightCycle.js";

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
  constructor() {
    this.engine = engine;
    this.scene = scene;
    this.assetLoader = assetLoader;

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
    this._fpsSampleElapsed = 0;
    this._fpsSampleFrames = 0;
    this._performanceTier = "MED";
    this._qualityMode = CONFIG.ui.qualityMode ?? "AUTO";
    this._effectiveQualityPreset = "MED";
    this._hardwareScalingLevel = getHardwareScalingLevel();
    this._adaptiveLowWindows = 0;
    this._adaptiveHighWindows = 0;
    this._lastFpsSample = 60;
    this._overlayMode = "pause";
    this._overlayVisible = false;
    this._countdownIntroActive = false;
    this._countdownIntroPrime = null;
    this._lastNonZeroMaster = CONFIG.audio.masterVolume;
    this._scenarioId = null;
    this._autotestEnabled = false;
    this._oneFightConfig = null;
    this._oneFightEnemySlot = null;

    // Hitstop state (ms counter; pauses fixed ticks to create "freeze-frame" feel)
    this._hitstopMs = 0;
    this._hitReactStates = new Map();
    this._recentHitsByAttacker = new Map();
    this._finisherCamera = null;
    this._speedLineOverrideUntil = 0;
    this._bloomOverrideUntil = 0;
    this.dayNightCycle = null;

    this._setupScene();

    this.sessionManager = new SessionManager();
    this.registry = new CharacterRegistry(this.scene, this.assetLoader, CHARACTER_ROSTER);
    this.movement = new MovementController(this.scene, this.registry);
    this.combat = new CombatSystem(this.scene, this.registry, this.movement);
    this.zoneManager = new ZoneManager(this.scene);
    this.inputManager = new InputManager(this.scene, this.sessionManager, this.camera);
    this.hud = new HUD(this.scene, this.registry, this.sessionManager);
    this.hud.setInputManager(this.inputManager);
    this.postProcessing = new PostProcessing(this.scene, this.camera);
    this.audioManager = new AudioManager(this.scene, this.assetLoader);
    this.animationController = new AnimationController(this.scene, this.registry, this.assetLoader);
    this.enemyAI = new EnemyAIController({
      registry: this.registry,
      movement: this.movement,
      combat: this.combat,
      zoneManager: this.zoneManager,
    });
    this.singlePlayer = new SinglePlayerManager({
      gameLoop: this,
      zoneManager: this.zoneManager,
      registry: this.registry,
      combat: this.combat,
      movement: this.movement,
      hud: this.hud,
      enemyAI: this.enemyAI,
    });
    this.openWorld = new OpenWorldDirector({
      scene: this.scene,
      zoneManager: this.zoneManager,
      registry: this.registry,
      movement: this.movement,
      singlePlayer: this.singlePlayer,
      hud: this.hud,
      gameLoop: this,
      getLocalSlot: () => this.localSlot,
    });
    this.hud.setOpenWorldDirector(this.openWorld);
    this.singlePlayer.on("onProfileLoaded", ({ profile }) => {
      this.openWorld.bindProfile(profile);
    });

    this.auraSystem = new AuraSystem(this.scene, this.registry, this.assetLoader);
    this.vfx        = new VFXManager(this.scene);
    this.animeEffects = new AnimeEffects(this.scene, this.hud.guiTexture, this.postProcessing);
    this.impactFX = new ImpactFX(this.scene, this.camera, this.assetLoader);
    this.dummyManager = new TrainingDummyManager(this.scene);
    this.trainingHUD = new TrainingHUD(this.scene, this.registry, this.dummyManager);
    this.trainingHUD.hide();
    this.combatPresentation = new CombatPresentationRouter({
      registry: this.registry,
      audioManager: this.audioManager,
      vfx: this.vfx,
      animationController: this.animationController,
    });
    this.overlayUi = new GameOverlayUI({
      audioManager: this.audioManager,
      postProcessing: this.postProcessing,
      singlePlayer: this.singlePlayer,
      registry: this.registry,
      zoneManager: this.zoneManager,
      openWorld: this.openWorld,
      getLocalSlot: () => this.localSlot,
      onTogglePause: (force) => this.togglePause(force),
      onAutosave: (force) => this._autosave(force),
      onSetQualityMode: (mode) => this._setQualityMode(mode),
      getQualityMode: () => this._qualityMode,
      getEffectiveQualityPreset: () => this._effectiveQualityPreset,
    });

    this.cameraController = new RuntimeCameraController(this.camera, this.registry, this.inputManager);
    this._applyPerformanceTier(this._performanceTier, { reason: "startup", preset: this._effectiveQualityPreset });
    this._setQualityMode(this._qualityMode, { persist: false });

    this.enemyAI.setInputQueueSink((slot, input) => this._queuedAiInputs.set(slot, input));
    this.audioManager.wireEvents(this.combat, this.zoneManager, this.registry);
    this.hud.setLocalSlot(this.localSlot);
    this._handleResize = () => this.engine.resize();
    this._handleBeforeUnload = () => this._autosave(true);

    wireGameLoopEvents(this);
    this._bindHotkeys();
    this._updateHudVisibility();
    this._updateOverlay();

    this.engine.runRenderLoop(() => this._frame());
    window.addEventListener("resize", this._handleResize);
    window.addEventListener("beforeunload", this._handleBeforeUnload);
  }

  _setupScene() {
    this.scene.clearColor.set(0.18, 0.28, 0.52, 1);

    // Enhanced ArcRotateCamera with GTA-style settings
    this.camera = new ArcRotateCamera(
      "mainCamera",
      CONFIG.camera.defaultAlpha,
      CONFIG.camera.defaultBeta,
      CONFIG.camera.defaultRadius,
      new Vector3(0, CONFIG.camera.verticalOffset, 0),
      this.scene
    );
    this.camera.lowerRadiusLimit = CONFIG.camera.minRadius;
    this.camera.upperRadiusLimit = CONFIG.camera.maxRadius;
    this.camera.lowerBetaLimit   = CONFIG.camera.minBeta;
    this.camera.upperBetaLimit   = CONFIG.camera.maxBeta;
    this.camera.wheelPrecision   = 18;
    this.camera.fov              = CONFIG.camera.fov;
    this.camera.minZ             = 0.1;
    // NEW: GTA polish
    this.camera.inertia = 0.85; // Smooth momentum
    this.camera.angularSensibilityX = 1000;
    this.camera.angularSensibilityY = 1000;
    this.camera.pinchPrecision = 2000;
    this.camera.inputs.clear(); // All camera input handled by InputManager + RuntimeCameraController
    this.scene.activeCamera = this.camera;

    // Anime-style lighting: High ambient (flatter shadows) + strong directional highlight
    const hemi = new HemisphericLight("hemiLight", new Vector3(0, 1, 0), this.scene);
    hemi.intensity = 1.1;
    hemi.diffuse = new Color3(0.88, 0.93, 1.0);
    hemi.groundColor = new Color3(0.25, 0.3, 0.45); // Cool blue bounce light

    const sun = new DirectionalLight("sunLight", new Vector3(-0.4, -1, -0.2), this.scene);
    sun.position = new Vector3(40, 80, 20);
    sun.intensity = 1.8; // Stronger sun for high contrast highlights
    sun.diffuse = new Color3(1.0, 0.97, 0.92); // Slightly warm sun

    this.dayNightCycle = new DayNightCycleController(this.scene, hemi, sun, {
      cycleDurationSeconds: CONFIG.lighting.dayNightCycleSeconds,
      startTimeOfDay: CONFIG.lighting.startTimeOfDay,
    });
  }

  _bindHotkeys() {
    this._hotkeyHandler = (e) => {
      if (e.key === "Escape") {
        this.togglePause();
      } else if (e.key === "h" || e.key === "H") {
        this._showControlsHelp();
      } else if (e.key === "m" || e.key === "M") {
        this._toggleMute();
      } else if (e.key === "j" || e.key === "J") {
        this._toggleTravelNetwork();
      } else if (e.key === "F1") {
        this._toggleHUD();
      }
      // QoL hotkeys (also handled via InputManager actions)
      else if (e.key === "F2") {
        toggleFpsCounterRuntime(this);
      }
      // Debug: dump full entity state to console (F3 = local slot, Shift+F3 = all AI)
      else if (e.key === "F3") {
        if (e.shiftKey) {
          for (const [slot] of this.registry.slots) {
            const s = this.registry.getState(slot);
            if (s?.isAiControlled) this.dumpEntityState(slot);
          }
        } else {
          this.dumpEntityState(this.localSlot);
        }
      }
    };
    window.addEventListener("keydown", this._hotkeyHandler);
  }

  _showControlsHelp() {
    if (!this._started) return;
    this.isPaused = true;
    this._showOverlay("help", true);
  }

  _toggleMute() {
    toggleMuteRuntime(this);
  }

  _toggleHUD() {
    this.hudVisible = !this.hudVisible;
    this._updateHudVisibility();
  }

  _toggleTravelNetwork() {
    if (!this._started) return;
    if (this._overlayVisible && this._overlayMode === "world") {
      this.togglePause(false);
      return;
    }
    this.isPaused = true;
    this._showOverlay("world", true);
  }

  togglePause(force) {
    if (!this._started) return false;
    if (force !== undefined) {
      this.isPaused = force;
    } else {
      this.isPaused = !this.isPaused;
    }
    this._showOverlay("pause", this.isPaused);
    return this.isPaused;
  }

  _autosave(force) {
    autosaveRuntime(this, force);
  }

  _frame() {
    const now = performance.now();
    const delta = Math.min((now - this._lastFrameAt) / 1000, CONFIG.maxDeltaCap);
    const deltaMs = (now - this._lastFrameAt);
    this._lastFrameAt = now;

    this.inputManager.update(delta);
    this.animationController.update(delta);
    this.auraSystem.update(delta);
    this.postProcessing.update(delta);
    this.impactFX.update(delta);
    this.hud.update(delta);
    this.trainingHUD?.update(delta);
    this.dayNightCycle?.update(this.isPaused ? 0 : delta);
    this._finisherCamera = this.cameraController.update(delta, {
      localSlot: this.localSlot,
      finisherCamera: this._finisherCamera,
    });
    this._samplePerformance(delta);
    updateFpsCounterRuntime(this, deltaMs);
    this._updateOverlay();

    // Trigger Speed Lines dynamically based on player movement speed
    // Skip if a combo/impact override is active (set by _wireEvents handlers)
    let localState = this.registry.getState(this.localSlot);
    if (this._speedLineOverrideUntil && now >= this._speedLineOverrideUntil) {
      this._speedLineOverrideUntil = 0;
      this.postProcessing.setSpeedLines(0);
    } else if (localState && !this._speedLineOverrideUntil) {
      const speed = Math.sqrt(localState.velocity.x ** 2 + localState.velocity.z ** 2);
      this.postProcessing.setSpeedLines(Math.max(0, (speed - 16) / 12)); // Ramp up intensity past 16m/s
    }

    if (this._bloomOverrideUntil && now >= this._bloomOverrideUntil) {
      this._bloomOverrideUntil = 0;
      this.postProcessing.setBloom(1.0);
    }

    if (!this.isPaused && this._started && !this._countdownIntroActive) {
      this._autosaveElapsed += delta;
      this._fixedAccumulator += delta;
      while (this._fixedAccumulator >= CONFIG.fixedStep) {
        this._fixedAccumulator -= CONFIG.fixedStep;
        stepSimulationRuntime(this, CONFIG.fixedStep, IDLE_INPUT);
      }
    }

    localState = this.registry.getState(this.localSlot);
    this.audioManager.update(delta, localState?.position ?? Vector3.Zero(), this.mode !== MODE.MENU);
    this._publishAutomationStatus();
    this.scene.render();
  }

  _publishAutomationStatus() {
    if (typeof window === "undefined") return;
    const activeMeshes = this.scene?.getActiveMeshes?.();
    const enemySlot = this._oneFightEnemySlot
      ?? [...this.registry.slots.entries()].find(([, state]) => state?.teamId === "ENEMY" && !state?.isDead)?.[0]
      ?? null;
    const serializeState = (slot) => {
      const state = this.registry.getState(slot);
      if (!state) return null;
      const visibleMeshCount = (state.characterMeshes ?? []).filter((mesh) => {
        const enabled = typeof mesh?.isEnabled === "function" ? mesh.isEnabled() : true;
        return enabled && (mesh?.isVisible ?? true) && ((mesh?.visibility ?? 1) > 0.01);
      }).length;
      return {
        slot,
        characterId: state.characterId ?? null,
        entityType: state.entityType ?? null,
        teamId: state.teamId ?? null,
        isDead: !!state.isDead,
        isActionLocked: !!state.isActionLocked,
        isBlocking: !!state.isBlocking,
        isChargingKi: !!state.isChargingKi,
        currentStance: state.currentStance ?? null,
        animationState: this.animationController.getAnimator(slot)?.currentState ?? null,
        position: state.position ? {
          x: +state.position.x.toFixed(2),
          y: +state.position.y.toFixed(2),
          z: +state.position.z.toFixed(2),
        } : null,
        velocity: state.velocity ? {
          x: +state.velocity.x.toFixed(2),
          y: +state.velocity.y.toFixed(2),
          z: +state.velocity.z.toFixed(2),
        } : null,
        rootEnabled: state.rootNode ? state.rootNode.isEnabled?.() ?? true : false,
        visibleMeshCount,
      };
    };

    const state = {
      ts: Date.now(),
      started: !!this._started,
      mode: this.mode,
      scenarioId: this._scenarioId ?? null,
      autotestEnabled: !!this._autotestEnabled,
      countdownActive: !!this._countdownIntroActive,
      inputEnabled: !!this.inputManager?.enabled && !this._countdownIntroActive,
      localSlot: this.localSlot ?? 0,
      opponentSlot: enemySlot,
      currentZoneId: this.currentZoneId ?? null,
      loadingHidden: !document.getElementById("loadingScreen") || document.getElementById("loadingScreen")?.classList.contains("hidden"),
      mainMenuVisible: !!document.getElementById("mainMenu"),
      scene: {
        activeMeshCount: activeMeshes?.length ?? null,
        totalMeshCount: this.scene?.meshes?.length ?? null,
        qualityMode: this._qualityMode,
        qualityPreset: this._effectiveQualityPreset,
        performanceTier: this._performanceTier,
        hardwareScalingLevel: this._hardwareScalingLevel,
      },
      entities: {
        local: serializeState(this.localSlot ?? 0),
        opponent: enemySlot != null ? serializeState(enemySlot) : null,
      },
    };

    window.__WS_AUTOTEST__ = state;
  }

  _setRuntimeBadge(label) {
    this.overlayUi?.setRuntimeBadge(label);
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

  /**
   * Dumps a full snapshot of one entity's state across all subsystems to the
   * browser console.  Press F3 in-game to call this on the local player, or
   * Shift+F3 to dump all AI-controlled entities.
   *
   * Copy the JSON output and paste it to the AI to get a pinpoint fix:
   * "The enemy is stuck. Here is the exact state at the moment it got stuck."
   */
  dumpEntityState(slot) {
    const char = this.registry.getState(slot);
    const anim = this.animationController.getAnimator(slot);
    const brain = this.enemyAI.getBrainState(slot);
    const v = char?.velocity;

    const dump = {
      slot,
      characterId:    char?.characterId ?? null,
      hp:             char?.hp ?? null,
      maxHP:          char?.maxHP ?? null,
      ki:             char?.ki ?? null,
      stamina:        char?.stamina ?? null,
      isActionLocked: char?.isActionLocked ?? null,
      isBlocking:     char?.isBlocking ?? null,
      isInvincible:   char?.isInvincible ?? null,
      isDead:         char?.isDead ?? null,
      isGrounded:     char?.isGrounded ?? null,
      isFlying:       char?.isFlying ?? null,
      currentStance:  char?.currentStance ?? null,
      animationState: anim?.currentState ?? null,
      velocity:       v ? { x: +v.x.toFixed(3), y: +v.y.toFixed(3), z: +v.z.toFixed(3) } : null,
      position:       char?.position ? {
        x: +char.position.x.toFixed(2),
        y: +char.position.y.toFixed(2),
        z: +char.position.z.toFixed(2),
      } : null,
      aiRole:         brain?.role ?? null,
      aiNextDecisionAt: brain?.nextDecisionAt ?? null,
      aiCurrentTimeMs:  this.enemyAI._timeMs ?? null,
      aiCounterWindow:  brain?.counterWindowEnd ?? null,
      aiLastHp:         brain?.lastHpAtDecision ?? null,
    };

    console.group(`[DEBUG] dumpEntityState — slot ${slot}`);
    console.log(JSON.stringify(dump, null, 2));
    console.groupEnd();
  }

  async _ensureNetworkPlayer(slot, playerId, characterId = "RAYNE") {
    const existing = this.registry.getState(slot);
    if (existing) return existing;

    const spawn = this.zoneManager.getSpawnPoint(slot);
    return this.registry.spawnPlayer(playerId, slot, spawn, characterId);
  }

  // Mode starters
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

  _setQualityMode(mode, { persist = true } = {}) {
    const normalizedMode = ["AUTO", "LOW", "MED", "HIGH", "ULTRA"].includes(mode) ? mode : "AUTO";
    this._qualityMode = normalizedMode;
    this._fpsSampleElapsed = 0;
    this._fpsSampleFrames = 0;
    this._adaptiveLowWindows = 0;
    this._adaptiveHighWindows = 0;

    if (persist) {
      applyConfig("ui", { qualityMode: normalizedMode });
    }

    if (normalizedMode === "AUTO") {
      this._applyPerformanceTier(this._performanceTier, { reason: "auto-resume" });
    } else {
      const manualTier = normalizedMode === "LOW"
        ? "LOW"
        : normalizedMode === "MED"
          ? "MED"
          : "HIGH";
      this._applyPerformanceTier(manualTier, {
        reason: "manual",
        preset: normalizedMode,
      });
    }

    this.overlayUi?.updateRuntimeBadge();
  }

  _samplePerformance(delta) {
    if (!CONFIG.performance.adaptiveQuality || this._qualityMode !== "AUTO") return;

    this._fpsSampleElapsed += delta;
    this._fpsSampleFrames += 1;

    if (this._fpsSampleElapsed < (CONFIG.performance.fpsSampleWindow ?? 0.75)) return;

    const fps = this._fpsSampleFrames / Math.max(this._fpsSampleElapsed, 0.001);
    this._lastFpsSample = fps;
    this._fpsSampleElapsed = 0;
    this._fpsSampleFrames = 0;

    const lowThreshold = CONFIG.performance.lowFpsThreshold ?? 42;
    const mediumThreshold = CONFIG.performance.mediumFpsThreshold ?? 52;
    const highThreshold = CONFIG.performance.highFpsThreshold ?? (mediumThreshold + 6);
    const promoteWindows = CONFIG.performance.promoteWindowCount ?? 3;
    const demoteWindows = CONFIG.performance.demoteWindowCount ?? 2;

    let nextTier = this._performanceTier;

    if (fps < lowThreshold) {
      this._adaptiveLowWindows += 1;
      this._adaptiveHighWindows = 0;
      if (this._adaptiveLowWindows >= demoteWindows) {
        nextTier = this._performanceTier === "HIGH" ? "MED" : "LOW";
      }
    } else if (fps < mediumThreshold) {
      this._adaptiveLowWindows += 1;
      this._adaptiveHighWindows = 0;
      if (this._adaptiveLowWindows >= demoteWindows) {
        nextTier = this._performanceTier === "HIGH" ? "MED" : this._performanceTier;
      }
    } else if (fps >= highThreshold) {
      this._adaptiveHighWindows += 1;
      this._adaptiveLowWindows = 0;
      if (this._adaptiveHighWindows >= promoteWindows) {
        nextTier = this._performanceTier === "LOW" ? "MED" : "HIGH";
      }
    } else {
      this._adaptiveLowWindows = 0;
      this._adaptiveHighWindows = 0;
    }

    if (nextTier !== this._performanceTier) {
      this._adaptiveLowWindows = 0;
      this._adaptiveHighWindows = 0;
      this._applyPerformanceTier(nextTier, {
        reason: `adaptive-${fps.toFixed(1)}fps`,
      });
      this.overlayUi?.updateRuntimeBadge();
    }
  }

  _applyPerformanceTier(tier, { reason = "runtime", preset = null } = {}) {
    const normalizedTier = tier === "LOW" ? "LOW" : tier === "HIGH" ? "HIGH" : "MED";
    const effectivePreset = preset ?? this._getQualityPresetForTier(normalizedTier);
    const scalingLevel = preset === "ULTRA"
      ? getScalingLevelForPerformanceTier("ULTRA")
      : getScalingLevelForPerformanceTier(normalizedTier);

    this._performanceTier = normalizedTier;
    this._effectiveQualityPreset = effectivePreset;
    this._hardwareScalingLevel = applyHardwareScalingLevel(scalingLevel);

    this.postProcessing?.setQuality?.(effectivePreset);
    this.impactFX?.setPerformanceTier?.(normalizedTier);
    this.auraSystem?.setPerformanceTier?.(normalizedTier);

    this.scene.metadata = {
      ...(this.scene.metadata ?? {}),
      performance: {
        tier: normalizedTier,
        preset: effectivePreset,
        scalingLevel: this._hardwareScalingLevel,
        mode: this._qualityMode,
        reason,
      },
    };
  }

  _getQualityPresetForTier(tier) {
    if (tier === "LOW") return "LOW";
    if (tier === "HIGH") return "HIGH";
    return "MED";
  }

  _getPerformanceStats() {
    const activeMeshes = this.scene?.getActiveMeshes?.();
    const drawCalls =
      this.engine?._drawCalls?.current
      ?? this.engine?._drawCalls?.fetchNewFrame?.()
      ?? this.scene?._activeIndices?.length
      ?? null;
    return {
      qualityMode: this._qualityMode,
      effectiveQualityPreset: this._effectiveQualityPreset,
      performanceTier: this._performanceTier,
      hardwareScalingLevel: this._hardwareScalingLevel,
      activeMeshes: activeMeshes?.length ?? null,
      drawCalls,
      sampledFps: this._lastFpsSample,
      impactFxMs: this.impactFX?.getAverageCreationMs?.() ?? null,
      retargetMs: this.animationController?.getAverageRetargetMs?.() ?? null,
    };
  }
}
