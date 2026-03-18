import {
  Color4,
  Vector3,
  type AbstractMesh,
  type AnimationGroup,
  type Bone,
  type Scene,
  type Skeleton,
  type TransformNode,
} from "@babylonjs/core";
import type { AssetDescriptor, CharacterDefinition, CharacterRoster, EntityTeam, TransformationDefinition } from "../data/gameData";
import type { AssetLoader } from "./AssetLoader";
import { Logger } from "./Logger";

export const MAX_PLAYERS = 4;
export const MAX_ENTITIES = 16;

const CHARACTER_MIN_HEIGHT_M = 1.6256;
const CHARACTER_MAX_HEIGHT_M = 2.1336;
const DEFAULT_CHARACTER_HEIGHT_M = 1.82;
const CHARACTER_HEIGHT_OVERRIDES_M = new Map<string, number>([
  ["AYO", 1.905],
]);

const DEFAULT_PLAYER_ORDER = ["GOKU", "VEGETA", "GOHAN", "PICCOLO"];

export interface SpawnParams {
  teamId?: EntityTeam;
  entityType?: "PLAYER" | "ENEMY" | "COMPANION";
  playerId?: string;
  followTargetSlot?: number | null;
  powerLevel?: number;
  maxHP?: number;
  maxKi?: number;
  maxStamina?: number;
  isBoss?: boolean;
}

export interface CharacterState {
  slot: number;
  playerId: string;
  characterId: string;
  characterDef: CharacterDefinition;
  entityType: "PLAYER" | "ENEMY" | "COMPANION";
  teamId: EntityTeam;
  level: number;
  powerLevel: number;
  maxHP: number;
  hp: number;
  maxKi: number;
  ki: number;
  stamina: number;
  maxStamina: number;
  currentTransform: TransformationDefinition | null;
  transformIndex: number;
  currentStance: string;
  position: Vector3;
  spawnPosition: Vector3;
  velocity: Vector3;
  lastMoveInput: Vector3;
  isFlying: boolean;
  isGrounded: boolean;
  isDead: boolean;
  isInvincible: boolean;
  isBlocking: boolean;
  isActionLocked: boolean;
  isAiControlled: boolean;
  followTargetSlot: number | null;
  isBoss: boolean;
  lastDodgeTime: number;
  lastMeleeTime: number;
  rootNode: TransformNode | null;
  mesh: AbstractMesh | null;
  renderMeshes: AbstractMesh[];
  skeletons: Skeleton[];
  animationGroups: AnimationGroup[];
  weaponNode: TransformNode | null;
  auraColor: Color4;
}

type RegistryEventMap = {
  onPlayerSpawned: CharacterState;
  onPlayerDied: CharacterState;
  onTransformChanged: {
    slot: number;
    transformId: string | null;
    powerLevel: number;
    state: CharacterState;
  };
  onPowerLevelChanged: {
    slot: number;
    powerLevel: number;
    state: CharacterState;
  };
  onStanceChanged: {
    slot: number;
    stance: string;
    state: CharacterState;
    wasActionLocked: boolean;
  };
  onDamageTaken: {
    slot: number;
    amount: number;
    remainingHP: number;
    state: CharacterState;
  };
};

export class CharacterRegistry {
  public readonly slots = new Map<number, CharacterState>();
  private readonly _scene: Scene;
  private readonly _assetLoader: AssetLoader;
  private readonly _roster: CharacterRoster;
  private readonly _logger: Logger;
  private readonly _playerSlotMap = new Map<string, number>();
  private readonly _spawnTickets = new Map<number, number>();
  private readonly _listeners: { [K in keyof RegistryEventMap]: Set<(payload: RegistryEventMap[K]) => void> } = {
    onPlayerSpawned: new Set(),
    onPlayerDied: new Set(),
    onTransformChanged: new Set(),
    onPowerLevelChanged: new Set(),
    onStanceChanged: new Set(),
    onDamageTaken: new Set(),
  };
  private readonly _defaultAuraColor = new Color4(0.35, 0.85, 1, 0.9);
  private readonly _fallbackWeaponScale = new Vector3(0.004, 0.004, 0.004);
  private readonly _targetWeaponLength = 1.25;
  private readonly _fallbackWeaponOffset = new Vector3(0.4, 1.0, 0.2);

  public constructor(scene: Scene, assetLoader: AssetLoader, roster: CharacterRoster, logger = Logger.scoped("CharacterRegistry")) {
    this._scene = scene;
    this._assetLoader = assetLoader;
    this._roster = roster;
    this._logger = logger;
  }

  public on<K extends keyof RegistryEventMap>(eventName: K, listener: (payload: RegistryEventMap[K]) => void): () => void {
    this._listeners[eventName].add(listener);
    return () => this._listeners[eventName].delete(listener);
  }

  public getState(slot: number): CharacterState | null {
    return this.slots.get(slot) ?? null;
  }

  public getStateByPlayerId(playerId: string): CharacterState | null {
    const slot = this._playerSlotMap.get(playerId);
    return slot === undefined ? null : this.getState(slot);
  }

  public getEntitiesByTeam(teamId: EntityTeam): CharacterState[] {
    const result: CharacterState[] = [];

    for (const [, state] of this.slots) {
      if (state.teamId === teamId) {
        result.push(state);
      }
    }

    return result;
  }

  public getCharacterDefinition(characterId: string): CharacterDefinition {
    const definition = this._roster[characterId];
    if (!definition) {
      throw new Error(`Unknown character "${characterId}".`);
    }
    return definition;
  }

  public async spawnPlayer(playerId: string, slot: number, spawnPosition: Vector3, characterId?: string): Promise<CharacterState> {
    if (slot < 0 || slot >= MAX_PLAYERS) {
      throw new Error(`Invalid player slot ${slot}.`);
    }

    const resolvedCharacterId = characterId ?? DEFAULT_PLAYER_ORDER[slot] ?? "GOKU";
    return this._spawnCharacter(slot, spawnPosition, resolvedCharacterId, {
      playerId,
      entityType: "PLAYER",
      teamId: "HERO",
    });
  }

  public async spawnCompanion(characterId: string, slot: number | null, spawnPosition: Vector3 | null, params: SpawnParams = {}): Promise<CharacterState> {
    const resolvedSlot = slot ?? this._assignEntitySlot();
    return this._spawnCharacter(resolvedSlot, spawnPosition ?? new Vector3(0, 1, 0), characterId, {
      ...params,
      playerId: params.playerId ?? `companion_${characterId}_${resolvedSlot}`,
      entityType: "COMPANION",
      teamId: "HERO",
    });
  }

  public async spawnEnemy(characterId: string, slot: number | null, spawnPosition: Vector3 | null, params: SpawnParams = {}): Promise<CharacterState> {
    const resolvedSlot = slot ?? this._assignEntitySlot();
    return this._spawnCharacter(resolvedSlot, spawnPosition ?? new Vector3(0, 1, 0), characterId, {
      ...params,
      playerId: params.playerId ?? `enemy_${characterId}_${resolvedSlot}`,
      entityType: "ENEMY",
      teamId: params.teamId ?? "ENEMY",
    });
  }

  public despawnEntity(slot: number): void {
    const state = this.slots.get(slot);
    if (!state) {
      return;
    }
    this._disposeStateResources(state);
    this._playerSlotMap.delete(state.playerId);
    this.slots.delete(slot);
  }

  public despawnAll(): void {
    for (const slot of [...this.slots.keys()]) {
      this.despawnEntity(slot);
    }
  }

  public applyDamage(slot: number, amount: number, _sourcePlayerId?: string | null): number {
    const state = this.getState(slot);
    if (!state || state.isDead || state.isInvincible) {
      return 0;
    }

    const clamped = Math.max(0, amount);
    state.hp = Math.max(0, state.hp - clamped);
    this._emit("onDamageTaken", {
      slot,
      amount: clamped,
      remainingHP: state.hp,
      state,
    });

    if (state.hp === 0) {
      state.isDead = true;
      state.rootNode?.setEnabled(false);
      this._emit("onPlayerDied", state);
    }

    return clamped;
  }

  public applyHeal(slot: number, amount: number): number {
    const state = this.getState(slot);
    if (!state || state.isDead) {
      return 0;
    }

    const before = state.hp;
    state.hp = Math.min(state.maxHP, state.hp + Math.max(0, amount));
    return state.hp - before;
  }

  public transform(slot: number, transformId: string): boolean {
    const state = this.getState(slot);
    if (!state || state.isDead) {
      return false;
    }

    const index = state.characterDef.transformations.findIndex((entry) => entry.id === transformId);
    if (index < 0) {
      return false;
    }

    const transform = state.characterDef.transformations[index]!;
    if (state.ki < transform.kiCost) {
      return false;
    }

    state.ki -= transform.kiCost;
    state.currentTransform = transform;
    state.transformIndex = index;
    state.powerLevel = Math.round(state.characterDef.basePowerLevel * transform.plMultiplier);
    state.auraColor = new Color4(transform.color.r, transform.color.g, transform.color.b, 0.95);
    this._emit("onTransformChanged", {
      slot,
      transformId,
      powerLevel: state.powerLevel,
      state,
    });
    this._emit("onPowerLevelChanged", {
      slot,
      powerLevel: state.powerLevel,
      state,
    });
    return true;
  }

  public revertTransform(slot: number): boolean {
    const state = this.getState(slot);
    if (!state) {
      return false;
    }

    state.currentTransform = null;
    state.transformIndex = -1;
    state.powerLevel = state.characterDef.basePowerLevel;
    state.auraColor = this._defaultAuraColor.clone();
    this._emit("onTransformChanged", {
      slot,
      transformId: null,
      powerLevel: state.powerLevel,
      state,
    });
    this._emit("onPowerLevelChanged", {
      slot,
      powerLevel: state.powerLevel,
      state,
    });
    return true;
  }

  public toggleStance(slot: number): boolean {
    const state = this.getState(slot);
    if (!state || state.isDead) {
      return false;
    }

    const stances = state.characterDef.stances ?? ["MELEE"];
    if (stances.length < 2) {
      return false;
    }

    const cost = state.characterDef.stanceSwitchCost ?? 0;
    if (state.stamina < cost) {
      return false;
    }

    const wasActionLocked = Boolean(state.isActionLocked);
    if (wasActionLocked) {
      state.isActionLocked = false;
    }
    state.stamina -= cost;
    state.currentStance = state.currentStance === "MELEE" ? "SWORD" : "MELEE";
    state.weaponNode?.setEnabled(state.currentStance === "SWORD");
    this._emit("onStanceChanged", {
      slot,
      stance: state.currentStance,
      state,
      wasActionLocked,
    });
    return true;
  }

  public update(deltaSeconds: number): void {
    for (const [, state] of this.slots) {
      if (state.isDead) {
        continue;
      }

      state.ki = Math.min(state.maxKi, state.ki + 4 * deltaSeconds);
      state.stamina = Math.min(state.maxStamina, state.stamina + 12 * deltaSeconds);

      if (state.rootNode) {
        state.rootNode.position.copyFrom(state.position);
      }
    }
  }

  public ensureVisible(slot: number): void {
    const state = this.getState(slot);
    if (!state) {
      return;
    }

    for (const mesh of state.renderMeshes) {
      mesh.setEnabled(true);
      mesh.isVisible = true;
      mesh.visibility = 1;
      mesh.alwaysSelectAsActiveMesh = true;
    }

    state.rootNode?.setEnabled(true);
  }

  private async _spawnCharacter(slot: number, spawnPosition: Vector3, characterId: string, params: SpawnParams): Promise<CharacterState> {
    if (slot < 0 || slot >= MAX_ENTITIES) {
      throw new Error(`Invalid entity slot ${slot}.`);
    }

    if (this.slots.has(slot)) {
      this.despawnEntity(slot);
    }

    const spawnTicket = (this._spawnTickets.get(slot) ?? 0) + 1;
    this._spawnTickets.set(slot, spawnTicket);

    const characterDef = this.getCharacterDefinition(characterId);
    const playerId = params.playerId ?? `${characterId}_${slot}`;
    const state: CharacterState = {
      slot,
      playerId,
      characterId,
      characterDef,
      entityType: params.entityType ?? "PLAYER",
      teamId: params.teamId ?? "HERO",
      level: 1,
      powerLevel: params.powerLevel ?? characterDef.basePowerLevel,
      maxHP: params.maxHP ?? 10000,
      hp: params.maxHP ?? 10000,
      maxKi: params.maxKi ?? 100,
      ki: params.maxKi ?? 100,
      stamina: params.maxStamina ?? characterDef.baseStamina,
      maxStamina: params.maxStamina ?? characterDef.baseStamina,
      currentTransform: null,
      transformIndex: -1,
      currentStance: characterDef.defaultStance ?? characterDef.stances?.[0] ?? "MELEE",
      position: spawnPosition.clone(),
      spawnPosition: spawnPosition.clone(),
      velocity: Vector3.Zero(),
      lastMoveInput: Vector3.Zero(),
      isFlying: false,
      isGrounded: true,
      isDead: false,
      isInvincible: false,
      isBlocking: false,
      isActionLocked: false,
      isAiControlled: params.entityType === "ENEMY" || params.entityType === "COMPANION",
      followTargetSlot: params.followTargetSlot ?? null,
      isBoss: params.isBoss ?? false,
      lastDodgeTime: 0,
      lastMeleeTime: 0,
      rootNode: null,
      mesh: null,
      renderMeshes: [],
      skeletons: [],
      animationGroups: [],
      weaponNode: null,
      auraColor: this._defaultAuraColor.clone(),
    };

    this.slots.set(slot, state);
    this._playerSlotMap.set(playerId, slot);

    try {
      await this._buildCharacterMesh(state);
      await this._attachWeaponForState(state);

      if (!this._isCurrentSpawn(slot, spawnTicket, state)) {
        this._disposeStateResources(state);
        return this.slots.get(slot) ?? state;
      }

      this.ensureVisible(slot);
      this._emit("onPlayerSpawned", state);
      return state;
    } catch (error) {
      if (this.slots.get(slot) === state) {
        this.slots.delete(slot);
      }
      if (this._playerSlotMap.get(playerId) === slot) {
        this._playerSlotMap.delete(playerId);
      }
      this._disposeStateResources(state);
      throw error;
    }
  }

  private async _buildCharacterMesh(state: CharacterState): Promise<void> {
    const descriptor = this._resolveCharacterModelDescriptor(state.characterDef.modelPath);
    const instance = await this._assetLoader.instantiateModel(descriptor, `character_${state.slot}`);

    state.rootNode = instance.root;
    state.rootNode.position.copyFrom(state.position);
    state.renderMeshes = instance.meshes;
    state.skeletons = instance.skeletons;
    state.animationGroups = instance.animationGroups;
    state.mesh = this._selectPrimaryMesh(instance.meshes);

    const currentHeight = this._measureHeight(instance.meshes);
    const desiredHeight = this._resolveDesiredHeight(state);
    const scale = currentHeight > 0 ? desiredHeight / currentHeight : 1;
    state.rootNode.scaling.copyFromFloats(scale, scale, scale);

    for (const mesh of instance.meshes) {
      mesh.parent = state.rootNode;
      mesh.isVisible = true;
      mesh.visibility = 1;
      mesh.setEnabled(true);
      mesh.alwaysSelectAsActiveMesh = true;
      mesh.isPickable = true;
      (mesh as { isCharacter?: boolean }).isCharacter = true;
    }

    for (const group of instance.animationGroups) {
      group.stop();
    }

    // Play the first animation group at weight=1 as a T-pose fallback.
    // The AnimationController will replace this with proper IDLE once its
    // async retargeting pipeline finishes.
    const fallback = instance.animationGroups[0];
    if (fallback) {
      fallback.weight = 1;
      fallback.play(true);
    }

    this._logger.info(`Spawned ${state.characterId} at ${desiredHeight.toFixed(3)}m`);
  }

  private async _attachWeaponForState(state: CharacterState): Promise<void> {
    const supportsSword = (state.characterDef.stances ?? []).includes("SWORD");
    if (!supportsSword) {
      return;
    }

    const descriptor = this._resolveWeaponDescriptor(state.characterId);
    if (!descriptor) {
      return;
    }

    const instance = await this._assetLoader.instantiateModel(descriptor, `weapon_${state.slot}`);
    const weaponRoot = instance.root;
    const handBone = this._findRightHandBone(state.skeletons);

    if (state.mesh && handBone) {
      weaponRoot.parent = state.mesh;
      weaponRoot.attachToBone(handBone, state.mesh);
    } else if (state.rootNode) {
      weaponRoot.parent = state.rootNode;
      weaponRoot.position.copyFrom(this._fallbackWeaponOffset);
    }

    const weaponExtent = this._measureMeshExtent(instance.meshes);
    if (weaponExtent > 0.01) {
      weaponRoot.scaling.setAll(Math.min(3, Math.max(0.01, this._targetWeaponLength / weaponExtent)));
    } else {
      weaponRoot.scaling.copyFrom(this._fallbackWeaponScale);
    }
    weaponRoot.setEnabled(state.currentStance === "SWORD");
    state.weaponNode = weaponRoot;

    for (const mesh of instance.meshes) {
      mesh.isVisible = true;
      mesh.visibility = 1;
      mesh.setEnabled(true);
    }
  }

  private _resolveCharacterModelDescriptor(modelPath: string): AssetDescriptor {
    return this._assetLoader.findModelDescriptorByPath(modelPath) ?? {
      id: `runtime:${modelPath}`,
      path: modelPath,
      priority: 1,
      type: "model",
    };
  }

  private _resolveWeaponDescriptor(characterId: string): AssetDescriptor | undefined {
    const weaponIdByCharacter: Record<string, string> = {
      AYO: "weapon_ayoskatana",
      AKADEMIKS: "weapon_katana",
      OPP: "weapon_night_sword",
      LEBRON: "weapon_neon_blade",
    };

    const weaponId = weaponIdByCharacter[characterId] ?? "weapon_katana";
    return this._assetLoader.getDescriptor(weaponId);
  }

  private _selectPrimaryMesh(meshes: AbstractMesh[]): AbstractMesh | null {
    for (const mesh of meshes) {
      if (mesh.skeleton) {
        return mesh;
      }
    }

    return meshes[0] ?? null;
  }

  private _measureHeight(meshes: AbstractMesh[]): number {
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const mesh of meshes) {
      mesh.computeWorldMatrix(true);
      const bounds = mesh.getBoundingInfo().boundingBox;
      minY = Math.min(minY, bounds.minimumWorld.y);
      maxY = Math.max(maxY, bounds.maximumWorld.y);
    }

    if (!Number.isFinite(minY) || !Number.isFinite(maxY)) {
      return DEFAULT_CHARACTER_HEIGHT_M;
    }

    return Math.max(0.001, maxY - minY);
  }

  private _measureMeshExtent(meshes: AbstractMesh[]): number {
    let min = new Vector3(Infinity, Infinity, Infinity);
    let max = new Vector3(-Infinity, -Infinity, -Infinity);

    for (const mesh of meshes) {
      mesh.computeWorldMatrix(true);
      const bounds = mesh.getBoundingInfo().boundingBox;
      min.minimizeInPlace(bounds.minimumWorld);
      max.maximizeInPlace(bounds.maximumWorld);
    }

    if (!Number.isFinite(min.x) || !Number.isFinite(min.y) || !Number.isFinite(min.z)) {
      return 0;
    }

    const extent = max.subtract(min);
    const span = Math.max(extent.x, extent.y, extent.z);
    return span > 0.01 ? span : 0;
  }

  private _resolveDesiredHeight(state: CharacterState): number {
    const override = CHARACTER_HEIGHT_OVERRIDES_M.get(state.characterId);
    const requested = override ?? state.characterDef.desiredHeightM ?? DEFAULT_CHARACTER_HEIGHT_M;
    return Math.min(CHARACTER_MAX_HEIGHT_M, Math.max(CHARACTER_MIN_HEIGHT_M, requested));
  }

  private _isCurrentSpawn(slot: number, spawnTicket: number, state: CharacterState): boolean {
    return this._spawnTickets.get(slot) === spawnTicket && this.slots.get(slot) === state;
  }

  private _disposeStateResources(state: CharacterState): void {
    for (const group of state.animationGroups) {
      group.stop();
      group.dispose();
    }

    for (const skeleton of state.skeletons) {
      try {
        skeleton.dispose();
      } catch {
        // Ignore partially-disposed skeletons during spawn/despawn cleanup.
      }
    }

    state.weaponNode?.dispose(false, true);
    state.rootNode?.dispose(false, true);
    state.animationGroups = [];
    state.skeletons = [];
    state.renderMeshes = [];
    state.weaponNode = null;
    state.rootNode = null;
    state.mesh = null;
  }

  private _findRightHandBone(skeletons: Skeleton[]): Bone | null {
    const candidates = ["mixamorig:RightHand", "RightHand", "Hand_R", "Bip01_R_Hand"];

    for (const skeleton of skeletons) {
      for (const candidate of candidates) {
        const bone = skeleton.bones.find((entry: Bone) => entry.name === candidate);
        if (bone) {
          return bone;
        }
      }
    }

    return null;
  }

  private _assignEntitySlot(): number {
    for (let slot = 1; slot < MAX_ENTITIES; slot += 1) {
      if (!this.slots.has(slot)) {
        return slot;
      }
    }

    throw new Error("No free entity slots remain.");
  }

  private _emit<K extends keyof RegistryEventMap>(eventName: K, payload: RegistryEventMap[K]): void {
    for (const listener of this._listeners[eventName]) {
      try {
        listener(payload);
      } catch (error) {
        this._logger.warn(`Listener for ${eventName} threw`, error);
      }
    }
  }
}
