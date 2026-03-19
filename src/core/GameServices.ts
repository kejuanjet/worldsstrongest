// Typed service bag — constructed once at startup by createGameServices().
// GameLoop and runtime modules consume this instead of wiring subsystems ad-hoc.
// No runtime DI container — just a plain frozen object.

import type { Engine, Scene, ArcRotateCamera, Vector3 } from "@babylonjs/core";
import type { CharacterState, RegistryEventMap } from "./CharacterRegistry";
import type { ReadonlyRegistry, RegistryEventSource } from "./types/CharacterViews";
import type { AssetLoader } from "./AssetLoader.js";
import type { CharacterRegistry } from "./CharacterRegistry.js";
import type { CombatSystem } from "./CombatSystem.js";
import type { ZoneManager } from "./ZoneManager.js";
import type { SessionManager } from "./SessionManager.js";
import type { InputManager } from "./InputManager.js";
import type { HUD } from "./HUD.js";
import type { AudioManager } from "./AudioManager.js";
import type { AnimationController } from "./AnimationController.js";
import type { EnemyAIController } from "../ai/EnemyAIController.js";
import type { PostProcessing } from "./PostProcessing.js";
import type { AuraSystem } from "./AuraSystem.js";
import type { VFXManager } from "./VFXManager.js";
import type { AnimeEffects } from "./vfx/AnimeEffects.js";
import type { ImpactFX } from "./ImpactFX.js";
import type { SinglePlayerManager } from "./SinglePlayerManager.js";
import type { OpenWorldDirector } from "./open-world/OpenWorldDirector.js";
import type { CombatPresentationRouter } from "./runtime/CombatPresentationRouter.js";
import type { GameOverlayUI } from "./runtime/GameOverlayUI.js";
import type { RuntimeCameraController } from "./runtime/RuntimeCameraController.js";
import type { TrainingDummyManager } from "../ai/TrainingDummy.js";
import type { TrainingHUD } from "../ui/TrainingHUD.js";
import type { DayNightCycleController } from "./environment/DayNightCycle.js";

// ─── Subsystem type stubs ────────────────────────────────────────────────────
// These will be replaced with proper imports as subsystems convert to TS.
// Using interface declarations avoids circular-import issues during migration.

/** @see src/core/MovementController.ts */
import type { MovementController } from "./MovementController";
export type { MovementController };

// For JS modules not yet converted, we declare minimal shapes:
 
export interface AssetLoaderLike {
  loadEssentials(): Promise<void>;
  resolveAssetUrl(path: string): string;
  loadModel(id: string): Promise<any>;
}

export interface ZoneManagerLike {
  loadZone(zoneId: string, opts?: any): Promise<void>;
  unloadZone(): void;
  getCurrentZoneId(): string | null;
}

export interface SessionManagerLike {
  isHost(): boolean;
  getRole(): string;
  getPlayerId(): string;
}

export interface InputManagerLike {
  poll(slot: number): any;
  setScene(scene: Scene): void;
}

export interface HUDLike {
  update(delta: number): void;
  show(): void;
  hide(): void;
  setLocalSlot(slot: number): void;
  setInputManager(im: InputManagerLike): void;
  readonly guiTexture: any;
}

export interface AudioManagerLike {
  wireEvents(combat: any, zoneManager: any, registry: any): void;
  update(delta: number): void;
  playOneShot(id: string, position?: any): void;
}

export interface AnimationControllerLike {
  update(delta: number): void;
  buildAnimator(state: CharacterState): void;
}

export interface CombatSystemLike {
  update(step: number, inputs: Map<number, any>): void;
  processAttack(slot: number, attackId: string, input?: any): boolean;
  on<K extends string>(event: K, handler: (...args: any[]) => void): () => void;
}

export interface EnemyAIControllerLike {
  update(step: number): void;
  registerAI(slot: number, defId: string): void;
  setInputQueueSink(sink: (slot: number, input: any) => void): void;
}

export interface PostProcessingLike {
  setBloomEnabled(enabled: boolean): void;
}

export interface AuraSystemLike {
  update(delta: number): void;
}

export interface VFXManagerLike {
  update(delta: number): void;
}

export interface AnimeEffectsLike {
  screenFlash(impactType?: string, duration?: number): void;
  speedLines(intensity?: number): void;
  chargeGlow(intensity?: number): void;
  dispose(): void;
}

export interface ImpactFXLike {
  playMeleeImpact(position: Vector3, normal: Vector3, type?: string): void;
  playKiBlastImpact(position: Vector3): void;
  playBeamImpact(position: Vector3, beamColor?: unknown): void;
  playUltimateImpact(position: Vector3, color?: unknown): void;
  playDodgeFlash(position: Vector3): void;
  playLandingImpact(position: Vector3, speed?: number): void;
  update(delta: number): void;
  dispose(): void;
}

export interface SinglePlayerManagerLike {
  on(event: string, fn: (data: any) => void): void;
  update(step: number): void;
  getProfile(): unknown;
  getActiveMissionState(): unknown;
  clearEnemies(): void;
}

export interface OpenWorldDirectorLike {
  on(event: string, fn: (data: any) => void): void;
  bindProfile(profile: unknown): void;
  reset(): void;
  update(delta: number): void;
  getHudState(): unknown;
  getTravelMenuState(): unknown;
  dispose(): void;
}

export interface CombatPresentationRouterLike {
  playAttackPresentation(slot: number, attackId: string, direction: Vector3, event?: unknown): void;
  playAttackPresentationFromEvent(event: unknown): void;
}

export interface GameOverlayUILike {
  show(mode: string, visible: boolean): void;
  setRuntimeBadge(text: string): void;
  updateRuntimeBadge(opts?: { isPaused?: boolean }): void;
  dispose(): void;
}

export interface RuntimeCameraControllerLike {
  markInitialized(): void;
  update(delta: number, opts: { localSlot: number; finisherCamera?: unknown }): void;
}

export interface TrainingDummyManagerLike {
  spawnDummy(type: string, position: Vector3, slot?: number): unknown;
  removeDummy(id: string): void;
  clearAll(): void;
  resetAll(): void;
  getBySlot(slot: number): unknown;
  getTotalStats(): unknown;
  update(delta: number): void;
  dispose(): void;
}

export interface TrainingHUDLike {
  show(): void;
  hide(): void;
  toggle(): void;
  update(delta: number): void;
}

export interface DayNightCycleLike {
  update(delta: number): void;
}

// ─── CharacterRegistry interface ─────────────────────────────────────────────

export interface CharacterRegistryService
  extends ReadonlyRegistry<CharacterState>,
    RegistryEventSource<{ [K in keyof RegistryEventMap]: RegistryEventMap[K] }> {
  applyDamage(slot: number, damage: number, sourcePlayerId?: string | null): number;
  applyHeal(slot: number, amount: number): number;
  getStateByPlayerId(playerId: string): CharacterState | null;
  getEntitiesByTeam(teamId: string): CharacterState[];
  spawnPlayer(characterId: string, slot: number, params?: Record<string, unknown>): CharacterState;
  despawn(slot: number): void;
  tick(step: number): void;
}

// ─── GameServices ────────────────────────────────────────────────────────────

export interface GameServices {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: ArcRotateCamera;
  readonly assetLoader: AssetLoader | null;
  readonly dayNightCycle: DayNightCycleController;

  // Core gameplay
  readonly registry: CharacterRegistry;
  readonly movement: MovementController;
  readonly combat: CombatSystem;
  readonly enemyAI: EnemyAIController;
  readonly inputManager: InputManager;

  // World
  readonly zoneManager: ZoneManager;
  readonly sessionManager: SessionManager;

  // Presentation
  readonly hud: HUD;
  readonly audioManager: AudioManager;
  readonly animationController: AnimationController;
  readonly auraSystem: AuraSystem;
  readonly postProcessing: PostProcessing;
  readonly vfx: VFXManager;
  readonly animeEffects: AnimeEffects;
  readonly impactFX: ImpactFX;
  readonly singlePlayer: SinglePlayerManager;
  readonly openWorld: OpenWorldDirector;
  readonly combatPresentation: CombatPresentationRouter;
  readonly overlayUi: GameOverlayUI;
  readonly cameraController: RuntimeCameraController;
  readonly dummyManager: TrainingDummyManager;
  readonly trainingHUD: TrainingHUD;
}
