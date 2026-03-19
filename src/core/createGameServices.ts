// Factory function that constructs all game subsystems in the correct order.
// Replaces the 80-line construction sequence formerly inline in GameLoop's constructor.
// Returns a plain object — no DI container, no lazy resolution.

import type { ArcRotateCamera } from "@babylonjs/core";
import type { GameServices } from "./GameServices.js";

import type { Engine, Scene } from "@babylonjs/core";
import type { AssetLoader } from "./AssetLoader.js";

import { CharacterRegistry } from "./CharacterRegistry.js";
import { CHARACTER_ROSTER } from "../data/CharacterRoster.js";
import { MovementController } from "./MovementController.js";
import { CombatSystem } from "./CombatSystem.js";
import { ZoneManager } from "./ZoneManager.js";
import { SessionManager } from "./SessionManager.js";
import { InputManager } from "./InputManager.js";
import { HUD } from "./HUD.js";
import { AudioManager } from "./AudioManager.js";
import { AnimationController } from "./AnimationController.js";
import { PostProcessing } from "./PostProcessing.js";
import { AuraSystem } from "./AuraSystem.js";
import { VFXManager } from "./VFXManager.js";
import { AnimeEffects } from "./vfx/AnimeEffects.js";
import { ImpactFX } from "./ImpactFX.js";
import { EnemyAIController } from "../ai/EnemyAIController.js";
import { SinglePlayerManager } from "./SinglePlayerManager.js";
import { TrainingDummyManager } from "../ai/TrainingDummy.js";
import { TrainingHUD } from "../ui/TrainingHUD.js";
import { GameOverlayUI } from "./runtime/GameOverlayUI.js";
import { CombatPresentationRouter } from "./runtime/CombatPresentationRouter.js";
import { RuntimeCameraController } from "./runtime/RuntimeCameraController.js";
import { OpenWorldDirector } from "./open-world/OpenWorldDirector.js";


// ─── Core Services (constructed once, shared by all runtime modules) ─────────

export interface CoreServices extends GameServices {
  readonly camera: ArcRotateCamera;
}

 
type GameLoopRef = any;

/**
 * Construct all game subsystems in dependency order.
 * The `gameLoopRef` is the GameLoop instance — needed for callbacks that
 * subsystems fire back into the loop (pause, autosave, quality).
 * This coupling will shrink as subsystems are individually converted to TS.
 */
export function createGameServices(
  gameLoopRef: GameLoopRef,
  context: { engine: Engine; scene: Scene; assetLoader: AssetLoader; camera: ArcRotateCamera; dayNightCycle: any }
): CoreServices {
  const { engine, scene, assetLoader, camera, dayNightCycle } = context;


  // Core subsystems (order matters — each depends on previous)
  const sessionManager = new SessionManager();
  const registry = new CharacterRegistry(scene);
  const movement = new MovementController(scene, registry);
  const combat = new CombatSystem(scene, registry, movement);
  const zoneManager = new ZoneManager(scene);
  const inputManager = new InputManager(scene, sessionManager, camera);
  const hud = new HUD(scene, registry, sessionManager);
  hud.setInputManager(inputManager);
  const postProcessing = new PostProcessing(scene, camera);
  const audioManager = new AudioManager(scene, assetLoader);
  const animationController = new AnimationController(scene, registry, assetLoader);
  const enemyAI = new EnemyAIController({ registry, movement, combat, zoneManager });

  const singlePlayer = new SinglePlayerManager({
    gameLoop: gameLoopRef,
    zoneManager,
    registry,
    combat,
    movement,
    hud,
    enemyAI,
  });

  const openWorld = new OpenWorldDirector({
    scene,
    zoneManager,
    registry,
    movement,
    singlePlayer,
    hud,
    gameLoop: gameLoopRef,
    getLocalSlot: () => gameLoopRef.localSlot,
  });
  hud.setOpenWorldDirector(openWorld);
  singlePlayer.on("onProfileLoaded", ({ profile }: { profile: unknown }) => {
    openWorld.bindProfile(profile);
  });

  const auraSystem = new AuraSystem(scene, registry, assetLoader);
  const vfx = new VFXManager(scene);
  const animeEffects = new AnimeEffects(scene, hud.guiTexture, postProcessing);
  const impactFX = new ImpactFX(scene, camera, assetLoader);
  const dummyManager = new TrainingDummyManager(scene);
  const trainingHUD = new TrainingHUD(scene, registry, dummyManager);
  trainingHUD.hide();

  const combatPresentation = new CombatPresentationRouter({
    registry,
    audioManager,
    vfx,
    animationController,
  });

  const overlayUi = new GameOverlayUI({
    audioManager,
    postProcessing,
    singlePlayer,
    registry,
    zoneManager,
    openWorld,
    getLocalSlot: () => gameLoopRef.localSlot,
    getCamera: () => gameLoopRef.camera,
    onTogglePause: (force: boolean | undefined) => gameLoopRef.togglePause(force),
    onShowOverlay: (mode: string, visible: boolean) => gameLoopRef._showOverlay(mode, visible),
    onAdvanceFrame: () => gameLoopRef.requestFrameAdvance(),
    onAutosave: (force: boolean) => gameLoopRef._autosave(force),
    onSetQualityMode: (mode: string) => gameLoopRef._setQualityMode(mode),
    getQualityMode: () => gameLoopRef._qualityMode,
    getEffectiveQualityPreset: () => gameLoopRef._effectiveQualityPreset,
  });

  const cameraController = new RuntimeCameraController(camera, registry, inputManager);

  return {
    engine,
    scene,
    assetLoader,
    camera,
    dayNightCycle,
    registry,
    movement,
    combat,
    zoneManager,
    sessionManager,
    inputManager,
    hud,
    audioManager,
    animationController,
    enemyAI,
    singlePlayer,
    openWorld,
    auraSystem,
    vfx,
    animeEffects,
    impactFX,
    postProcessing,
    dummyManager,
    trainingHUD,
    combatPresentation,
    overlayUi,
    cameraController,
  };
}

export { CHARACTER_ROSTER };
