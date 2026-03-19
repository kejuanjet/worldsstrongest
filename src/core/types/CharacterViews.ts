// Narrowed view interfaces for CharacterState.
// Each subsystem imports only the slice it needs — compile-time enforcement,
// zero runtime cost (structural typing means the real CharacterRegistry satisfies all).

import type {
  Vector3,
  AbstractMesh,
  AnimationGroup,
  Skeleton,
  TransformNode,
  Color4,
} from "@babylonjs/core";
import type { CharacterDefinition, TransformationDefinition, EntityTeam } from "../../data/gameData";

// ─── Generic Registry Interface ──────────────────────────────────────────────

/** Read-only registry view — subsystems that only query state use this. */
export interface ReadonlyRegistry<T> {
  getState(slot: number): T | null;
  readonly slots: ReadonlyMap<number, T>;
}

/** Registry that also supports team-based queries. */
export interface QueryableRegistry<T> extends ReadonlyRegistry<T> {
  getEntitiesByTeam(teamId: EntityTeam): T[];
}

// ─── Event Emitter Interface ─────────────────────────────────────────────────

/** Minimal event subscription interface for subsystems that listen to registry events. */
export interface RegistryEventSource<TEvents extends Record<string, unknown>> {
  on<K extends keyof TEvents>(
    eventName: K,
    handler: (payload: TEvents[K]) => void,
  ): () => void;
  off<K extends keyof TEvents>(
    eventName: K,
    handler: (payload: TEvents[K]) => void,
  ): void;
}

// ─── Shared Root Node Shape ──────────────────────────────────────────────────

export interface RootNodeLike {
  position: Vector3;
  rotation: { y: number };
  getChildMeshes?: (directDescendantsOnly?: boolean) => AbstractMesh[];
}

// ─── Narrowed State Views ────────────────────────────────────────────────────

/** MovementController: physics simulation (read/write). */
export interface MovementState {
  slot: number;
  position: Vector3;
  velocity: Vector3;
  isGrounded: boolean;
  isFlying: boolean;
  isDead: boolean;
  isInvincible?: boolean;
  ki: number;
  stamina: number;
  characterDef?: CharacterDefinition;
  currentTransform?: TransformationDefinition | null;
  rootNode?: RootNodeLike | null;
  lastSafePosition?: Vector3;
  spawnPosition?: Vector3;
  lastMoveInput?: Vector3;
  lastDodgeTime?: number;
}

/** CombatSystem: attack logic, damage, resource checks. */
export interface CombatState {
  slot: number;
  playerId: string;
  isDead: boolean;
  isInvincible?: boolean;
  isBlocking?: boolean;
  isFlying?: boolean;
  isChargingKi?: boolean;
  isGrounded?: boolean;
  ki: number;
  stamina: number;
  powerLevel: number;
  position: Vector3;
  velocity: Vector3;
  rootNode?: RootNodeLike | null;
  teamId?: EntityTeam;
  entityType?: string;
  enemyDefId?: string | null;
  xpReward?: number;
  isBoss?: boolean;
  lastDodgeTime?: number;
  lastMeleeTime?: number;
}

/** EnemyAIController: decision-making reads. */
export interface AIReadState {
  slot: number;
  position: Vector3;
  velocity: Vector3;
  hp: number;
  maxHP: number;
  ki: number;
  isDead: boolean;
  isActionLocked: boolean;
  isBlocking?: boolean;
  isGrounded?: boolean;
  isFlying?: boolean;
  currentStance: string;
  teamId: EntityTeam;
  characterDef?: CharacterDefinition;
  rootNode?: RootNodeLike | null;
}

/** AuraSystem: transformation visuals and state-driven VFX. */
export interface AuraState {
  slot: number;
  isActionLocked: boolean;
  isBlocking: boolean;
  isChargingKi?: boolean;
  lastDamageTime?: number;
  rootNode: TransformNode | null;
  fxNode?: TransformNode | null;
}

/** AudioManager: spatial audio positioning. */
export interface AudioCharacterState {
  slot: number;
  position: Vector3;
  characterId: string;
}

/** AnimationController: animation blending and state-driven playback. */
export interface AnimationCharacterState {
  slot: number;
  isDead: boolean;
  velocity: Vector3;
  isFlying: boolean;
  isChargingKi?: boolean;
  isBlocking: boolean;
  isActionLocked: boolean;
  currentStance: string;
  lastMoveInput: Vector3;
  characterDef: CharacterDefinition;
  rootNode: TransformNode | null;
  animationGroups: AnimationGroup[];
  skeletons: Skeleton[];
}

/** HUD sub-components: health/ki/stamina bars. */
export interface HUDCharacterState {
  slot: number;
  hp: number;
  maxHP: number;
  ki: number;
  maxKi: number;
  stamina: number;
  maxStamina: number;
  characterId: string;
  characterDef: CharacterDefinition;
  isDead: boolean;
  currentTransform: TransformationDefinition | null;
  teamId: EntityTeam;
  powerLevel: number;
  isChargingKi?: boolean;
}

/** Render-level state for systems that need mesh/scene-graph access. */
export interface RenderState {
  slot: number;
  position: Vector3;
  rootNode: TransformNode | null;
  mesh: AbstractMesh | null;
  renderMeshes: AbstractMesh[];
  auraColor: Color4;
  currentTransform: TransformationDefinition | null;
  characterDef: CharacterDefinition;
}

// ─── Combat Registry (used by CombatSystem) ──────────────────────────────────

/** Registry interface for CombatSystem — includes mutation methods. */
export interface CombatRegistry extends ReadonlyRegistry<CombatState> {
  getStateByPlayerId(playerId: string): CombatState | null;
  applyDamage(slot: number, damage: number, sourcePlayerId?: string | null): number;
  applyHeal(slot: number, amount: number): number;
}

/** MovementController interface for CombatSystem knockback. */
export interface KnockbackController {
  applyKnockback(slot: number, impulse: Vector3, duration: number): void;
}
