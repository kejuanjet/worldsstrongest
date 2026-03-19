// Authoritative registry for all four player slots.
// Handles spawn, despawn, power level, transformation state, and per-frame updates.

import {
  Vector3,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Color4,
  TransformNode,
  SceneLoader,
} from "@babylonjs/core";
import { getEnemyDef } from "../ai/EnemyRegistry.js";
import { ASSET_MANIFEST, resolveAssetUrl, resolveSceneSource } from "./AssetLoader.js";
import { CONFIG } from "./index.js";

const CHARACTER_MIN_HEIGHT_M = 1.6256; // 5'4"
const CHARACTER_MAX_HEIGHT_M = 2.1336; // 7'0"
const DEFAULT_CHARACTER_HEIGHT_M = 1.82;
const MODEL_HEIGHT_OVERRIDES_M = {
  "/assets/models/ayo.glb": 1.8288, // 6'0"
};

// ─── Character Roster ─────────────────────────────────────────────────────────
// Define all selectable characters with base stats and transformation thresholds.
export const CHARACTER_ROSTER = {
  GOKU: {
    id: "GOKU",
    label: "Atlas",
    modelPath: "/assets/models/ayo.glb",
    desiredHeightM: 1.8,
    basePowerLevel: 3_000_000,
    baseSpeed: 12,
    baseStamina: 100,
    transformations: [
      { id: "SSJ1", label: "Ascendant I", plMultiplier: 50, kiCost: 20, color: new Color3(1.0, 0.95, 0.3) },
      { id: "SSJ2", label: "Ascendant II", plMultiplier: 100, kiCost: 40, color: new Color3(1.0, 1.0, 0.5) },
      { id: "SSJ3", label: "Ascendant III", plMultiplier: 400, kiCost: 80, color: new Color3(1.0, 1.0, 0.7) },
      { id: "SSB", label: "Azure Ascendant", plMultiplier: 1000, kiCost: 100, color: new Color3(0.3, 0.7, 1.0) },
    ],
  },
  VEGETA: {
    id: "VEGETA",
    label: "Nova",
    modelPath: "/assets/models/RAYNEFBX.glb",
    desiredHeightM: 1.73,
    basePowerLevel: 2_800_000,
    baseSpeed: 13,
    baseStamina: 90,
    transformations: [
      { id: "SSJ1", label: "Ascendant I", plMultiplier: 50, kiCost: 20, color: new Color3(1.0, 0.95, 0.3) },
      { id: "SSJ2", label: "Ascendant II", plMultiplier: 100, kiCost: 40, color: new Color3(1.0, 1.0, 0.5) },
      { id: "SSB", label: "Azure Ascendant", plMultiplier: 1000, kiCost: 100, color: new Color3(0.3, 0.7, 1.0) },
      { id: "SSBE", label: "Azure Overdrive", plMultiplier: 1250, kiCost: 120, color: new Color3(0.1, 0.4, 1.0) },
    ],
  },
  GOHAN: {
    id: "GOHAN",
    label: "Kairo",
    modelPath: "/assets/models/ayo.glb",
    desiredHeightM: 1.76,
    basePowerLevel: 2_500_000,
    baseSpeed: 11,
    baseStamina: 95,
    transformations: [
      { id: "SSJ1", label: "Ascendant I", plMultiplier: 50, kiCost: 20, color: new Color3(1.0, 0.95, 0.3) },
      { id: "SSJ2", label: "Ascendant II", plMultiplier: 100, kiCost: 40, color: new Color3(1.0, 1.0, 0.5) },
      { id: "MYSTIC", label: "Awakened Focus", plMultiplier: 850, kiCost: 60, color: new Color3(0.9, 0.9, 1.0) },
    ],
  },
  PICCOLO: {
    id: "PICCOLO",
    label: "Verdant",
    modelPath: "/assets/models/RAYNEFBX.glb",
    desiredHeightM: 2.08,
    basePowerLevel: 1_800_000,
    baseSpeed: 10,
    baseStamina: 110,
    transformations: [
      { id: "SYNC", label: "Resonance Link", plMultiplier: 3, kiCost: 10, color: new Color3(0.2, 0.8, 0.2) },
      { id: "ORANGE", label: "Ember Giant", plMultiplier: 500, kiCost: 70, color: new Color3(1.0, 0.5, 0.1) },
    ],
  },

  // ── New Playable Characters ─────────────────────────────────────────────────
  AYO: {
    id: "AYO",
    label: "Ayo",
    modelPath: "/assets/models/ayo.glb",
    desiredHeightM: 1.8288,
    basePowerLevel: 2_500_000,
    baseSpeed: 13,
    baseStamina: 85,
    // Ayo can switch between melee and sword stance mid-combat (E key)
    stances: ["MELEE", "SWORD"],
    defaultStance: "MELEE",
    stanceSwitchCost: 10, // stamina cost per toggle
    transformations: [
      { id: "RAGE", label: "Combat Rage", plMultiplier: 40, kiCost: 25, color: new Color3(1.0, 0.3, 0.1) },
    ],
    // Ayo can shoot beam spells in BOTH stances
    beamAttacks: ["AYO_MELEE_BEAM", "AYO_SWORD_BEAM"],
  },
  HANA: {
    id: "HANA",
    label: "Hana",
    modelPath: "/assets/models/hana.glb",
    desiredHeightM: 1.67,
    basePowerLevel: 1_200_000,
    baseSpeed: 10,
    baseStamina: 140, // high stamina — healers need sustained casting
    stances: ["MELEE"],
    defaultStance: "MELEE",
    stanceSwitchCost: 0,
    transformations: [
      { id: "ARCANE", label: "Arcane Awakening", plMultiplier: 20, kiCost: 30, color: new Color3(0.7, 0.3, 1.0) },
    ],
    // Hana specialises in healing and buff spells
    spellAttacks: ["HEAL_PULSE", "MAGIC_HEAL", "TWO_HAND_SPELL"],
  },
  RAYNE: {
    id: "RAYNE",
    label: "Rayne",
    modelPath: "/assets/models/RAYNEFBX.glb",
    desiredHeightM: 1.88,
    basePowerLevel: 2_200_000,
    baseSpeed: 11,
    baseStamina: 100,
    stances: ["MELEE"], // melee only — no sword, no beam spells
    defaultStance: "MELEE",
    stanceSwitchCost: 0,
    transformations: [
      { id: "FURY", label: "Berserk Fury", plMultiplier: 60, kiCost: 20, color: new Color3(0.8, 0.1, 0.1) },
    ],
  },

  // ── Enemy character model bindings ────────────────────────────────────────
  // These are used by EnemyRegistry to resolve model paths for enemy spawns.
  AKADEMIKS: {
    id: "AKADEMIKS",
    label: "Akademiks",
    modelPath: "/assets/models/enemies/Akademiks.glb",
    desiredHeightM: 1.75,
    basePowerLevel: 800_000,
    baseSpeed: 9,
    baseStamina: 75,
    stances: ["SWORD"],
    defaultStance: "SWORD",
    stanceSwitchCost: 0,
    transformations: [],
    // Attack profiles: randomly selected on spawn, used whole fight
    attackProfiles: [
      { label: "Sword Rush", attacks: ["MELEE_LIGHT", "MELEE_LIGHT", "MELEE_HEAVY", "KI_BLAST"] },
      { label: "Ranged Sword", attacks: ["KI_BLAST", "MELEE_HEAVY", "KI_BLAST", "MELEE_LIGHT"] },
    ],
    attackAnimVariants: {
      heavy: ["ATTACK_HEAVY_ALT_1", "ATTACK_HEAVY_ALT_4"], // bash + heavy weapon swing
    },
  },
  GRANNY: {
    id: "GRANNY",
    label: "Granny",
    modelPath: "/assets/models/enemies/Granny.glb",
    desiredHeightM: 1.64,
    basePowerLevel: 500_000,
    baseSpeed: 7,
    baseStamina: 60,
    stances: ["MELEE"],
    defaultStance: "MELEE",
    stanceSwitchCost: 0,
    transformations: [],
    attackProfiles: [
      { label: "Scrappy", attacks: ["MELEE_LIGHT", "MELEE_LIGHT", "MELEE_LIGHT", "MELEE_HEAVY"] },
      { label: "Desperate", attacks: ["MELEE_LIGHT", "MELEE_HEAVY", "MELEE_HEAVY", "RUSH_COMBO"] },
    ],
    attackAnimVariants: {
      light: ["ATTACK_LIGHT_1", "ATTACK_LIGHT_2", "ATTACK_LIGHT_ALT_1", "ATTACK_LIGHT_ALT_2"], // leg sweep + side hit
    },
  },
  JELLYROLL: {
    id: "JELLYROLL",
    label: "Jelly Roll",
    modelPath: "/assets/models/enemies/Jelly roll.glb",
    desiredHeightM: 1.96,
    basePowerLevel: 1_500_000,
    baseSpeed: 8,
    baseStamina: 120,
    stances: ["MELEE"],
    defaultStance: "MELEE",
    stanceSwitchCost: 0,
    transformations: [],
    attackProfiles: [
      { label: "Crusher", attacks: ["MELEE_HEAVY", "MELEE_HEAVY", "MELEE_HEAVY", "MELEE_LIGHT"] },
      { label: "Berserker", attacks: ["MELEE_HEAVY", "RUSH_COMBO", "MELEE_HEAVY", "MELEE_HEAVY"] },
      { label: "Spammer", attacks: ["MELEE_LIGHT", "MELEE_HEAVY", "MELEE_LIGHT", "MELEE_HEAVY"] },
    ],
    attackAnimVariants: {
      heavy: ["ATTACK_HEAVY_ALT_2", "ATTACK_HEAVY_ALT_3", "ATTACK_HEAVY_ALT_5"], // hell_slammer A/B + smash
    },
  },
  OPP: {
    id: "OPP",
    label: "Opp",
    modelPath: "/assets/models/enemies/opp.glb",
    desiredHeightM: 1.83,
    basePowerLevel: 700_000,
    baseSpeed: 11,
    baseStamina: 80,
    stances: ["SWORD"],
    defaultStance: "SWORD",
    stanceSwitchCost: 0,
    transformations: [],
    attackProfiles: [
      { label: "Swordsman", attacks: ["MELEE_LIGHT", "MELEE_LIGHT", "MELEE_HEAVY", "KI_BLAST"] },
      { label: "Ki Sniper", attacks: ["KI_BLAST", "KI_BLAST", "MELEE_HEAVY", "MELEE_LIGHT"] },
    ],
    attackAnimVariants: {
      light: ["ATTACK_LIGHT_1", "ATTACK_LIGHT_ALT_3", "ATTACK_LIGHT_ALT_4"], // stomp + stomping
      heavy: ["ATTACK_HEAVY_ALT_4"], // heavy weapon swing
    },
  },
  LEBRON: {
    id: "LEBRON",
    label: "Lebron",
    modelPath: "/assets/models/enemies/Lebron.glb",
    desiredHeightM: 2.06,
    basePowerLevel: 2_000_000,
    baseSpeed: 13,
    baseStamina: 110,
    stances: ["MELEE", "SWORD"],
    defaultStance: "MELEE",
    stanceSwitchCost: 8,
    isBoss: true,
    transformations: [
      { id: "KING_MODE", label: "King Mode", plMultiplier: 30, kiCost: 35, color: new Color3(0.9, 0.7, 0.1) },
    ],
    // Boss has 3 distinct fight styles — randomised each encounter
    attackProfiles: [
      { label: "King", attacks: ["MELEE_LIGHT", "MELEE_HEAVY", "KI_BLAST", "RUSH_COMBO"] },
      { label: "Dominant", attacks: ["MELEE_HEAVY", "MELEE_HEAVY", "KI_BLAST", "MELEE_LIGHT"] },
      { label: "Flashy", attacks: ["RUSH_COMBO", "MELEE_LIGHT", "MELEE_HEAVY", "KI_BLAST"] },
    ],
    attackAnimVariants: {
      light: ["ATTACK_LIGHT_1", "ATTACK_LIGHT_2", "ATTACK_LIGHT_ALT_5", "ATTACK_THROW_1"], // upward thrust + throw
      heavy: ["ATTACK_HEAVY", "ATTACK_HEAVY_ALT_1", "ATTACK_HEAVY_ALT_2", "ATTACK_HEAVY_ALT_3"], // bash + hell slammerA/B
    },
  },
};

// ─── Player Slot Constants ─────────────────────────────────────────────────────
export const MAX_PLAYERS = 4;
export const MAX_ENTITIES = 16;

// ─── PlayerState ──────────────────────────────────────────────────────────────
// Mutable runtime state for a single player slot.
class PlayerState {
  constructor(slot, playerId, characterId, spawnPosition) {
    this.slot = slot; // 0-3
    this.playerId = playerId; // session-level UUID
    this.characterId = characterId; // key from CHARACTER_ROSTER
    this.characterDef = CHARACTER_ROSTER[characterId];
    this.entityType = "PLAYER";
    this.teamId = "HERO";
    this.aiProfileId = null;
    this.enemyDefId = null;
    this.level = 1;
    this.xpReward = 0;
    this.lootTableId = null;
    this.aggroTargetSlot = null;
    this.statusEffects = [];
    this.isBoss = false;

    // Combat stats (runtime)
    this.powerLevel = this.characterDef.basePowerLevel;
    this.maxHP = 10000;
    this.hp = 10000;
    this.maxKi = 100;
    this.ki = 100;
    this.stamina = this.characterDef.baseStamina;
    this.maxStamina = this.characterDef.baseStamina;

    // Transformation state
    this.currentTransform = null; // null = base form
    this.transformIndex = -1;

    // Physics/world state
    this.position = spawnPosition.clone();
    this.velocity = Vector3.Zero();
    this.lastMoveInput = Vector3.Zero();
    this.isFlying = false;
    this.isGrounded = true;

    // Scene node (set after spawn)
    /** @type {TransformNode | null} */
    this.rootNode = null;
    /** @type {any | null} */
    this.mesh = null;
    /** @type {any[]} */
    this.animationGroups = [];
    /** @type {any[]} */
    this.skeletons = [];
    /** @type {any | null} */
    this.auraSystem = null;
    /** @type {TransformNode | null} */
    this.fxNode = null;

    // Stance system (Ayo supports MELEE / SWORD; others fixed to MELEE)
    this.currentStance = this.characterDef.defaultStance ?? "MELEE";
    /** Weapon attachment node (sword mesh parented to hand bone) */
    /** @type {TransformNode | null} */
    this.weaponNode = null;

    // Flags
    this.isDead = false;
    this.isChargingKi = false;
    this.isBlocking = false;
    this.isInvincible = false;
    this.isActionLocked = false; // true while an attack animation is playing
    this.isAiControlled = false;
    this.followTargetSlot = null;
    this.lastDamageTime = 0;
    this.lastDodgeTime = 0;
    this.chaseTargetSlot = null;
    this.chaseWindowEnd = 0;
    this.spawnPosition = spawnPosition.clone();
    this.lastSafePosition = spawnPosition.clone();
  }
}

// ─── CharacterRegistry ────────────────────────────────────────────────────────
export class CharacterRegistry {
  constructor(scene, config = CONFIG) {
    this.scene = scene;
    this.config = config;
    /** @type {Map<number, PlayerState>} slot → state */
    this.slots = new Map();
    /** @type {Map<string, number>} playerId → slot */
    this.playerSlotMap = new Map();

    /** Event listeners */
    this._listeners = {
      onPlayerSpawned: [],
      onPlayerDied: [],
      onTransformChanged: [],
      onPowerLevelChanged: [],
      onDamageTaken: [],
      onStanceChanged: [],
      onZVanish: [],
      onChaseTriggered: [],
    };

    // Ki regeneration rate per second (base)
    this.kiRegenRate = 4.0;
    // HP regeneration rate per second (base, very slow)
    this.hpRegenRate = 5.0;
    // Stamina regeneration rate per second
    this.staminaRegenRate = this.config.characters?.staminaRegen ?? 15;

    // Listen for VFX-driven requests to swap meshes/materials (best-effort).
    try {
      if (typeof window !== "undefined" && window.addEventListener) {
        this._transformMeshHandler = (ev) => {
          try {
            const { slot, transformId } = ev.detail ?? {};
            if (slot !== undefined && transformId !== undefined) this.applyTransformMesh(slot, transformId);
          } catch (e) { /* ignore malformed events */ }
        };
        window.addEventListener("dbz:applyTransformMesh", this._transformMeshHandler);
      }
    } catch (e) {
      console.warn("[CharacterRegistry] Setup error:", e);
    }
  }

  /**
   * Best-effort: apply a visual mesh/material change for a transform.
   * This function intentionally does not throw — VFX should not break game logic.
   * @param {number} slot
   * @param {string} transformId
   */
  applyTransformMesh(slot, transformId) {
    const state = this.slots.get(slot);
    if (!state) return;

    // Minimal safe implementation: record the requested hair transform and
    // attempt a visual hint if the mesh exposes metadata. Do not assume
    // any particular skeleton or material API is present.
    try {
      state.requestedHairTransform = transformId;

      // If the mesh has a .materials map or metadata indicating hair mesh, attempt to modify.
      if (state.mesh && state.mesh.metadata && state.mesh.metadata.hairMeshName) {
        const hairName = state.mesh.metadata.hairMeshName;
        const hair = state.mesh.getChildMeshes?.().find(m => m.name === hairName);
        if (hair && hair.material) {
          // Apply a simple tint as a lightweight visual indicator.
          if (hair.material.diffuseColor) hair.material.diffuseColor = hair.material.diffuseColor.clone();
        }
      }
      console.log(`[CharacterRegistry] applyTransformMesh requested for slot ${slot}: ${transformId}`);
    } catch (e) {
      console.warn(`[CharacterRegistry] applyTransformMesh failed for slot ${slot}:`, e);
    }
  }

  // ─── Spawn / Despawn ────────────────────────────────────────────────────────

  /**
   * Spawn a player into the world.
   * @param {string} playerId
   * @param {number} slot 0-3
   * @param {Vector3} spawnPos
   * @param {string} characterId key from CHARACTER_ROSTER, defaults to GOKU for slot 0
   */
  async spawnPlayer(playerId, slot, spawnPos, characterId = null) {
    if (slot < 0 || slot >= MAX_PLAYERS) throw new Error(`Invalid slot: ${slot}`);
    if (this.slots.has(slot)) this.despawnEntity(slot);

    // Default character assignment by slot
    const defaultChars = ["AYO", "HANA", "RAYNE", "AYO"];
    const charId = characterId ?? defaultChars[slot];
    if (!CHARACTER_ROSTER[charId]) throw new Error(`Unknown character: ${charId}`);

    const state = new PlayerState(slot, playerId, charId, spawnPos);
    this.slots.set(slot, state);
    this.playerSlotMap.set(playerId, slot);

    await this._buildCharacterMesh(state);
    await this._attachWeaponForState(state);
    this.restoreCharacterRenderState(state);

    this._emit("onPlayerSpawned", { slot, playerId, characterId: charId, position: spawnPos });
    console.log(`[CharacterRegistry] Spawned ${charId} (slot ${slot}) for player ${playerId}`);
    return state;
  }

  /**
   * Spawn an enemy entity for single-player PvE.
   * @param {string} enemyDefId
   * @param {number | null} slot
   * @param {Vector3} spawnPos
   * @param {object} params
   */
  spawnEnemy(enemyDefId, slot = null, spawnPos = null, params = {}) {
    const enemyDef = getEnemyDef(enemyDefId);
    if (!enemyDef) {
      console.warn(`[CharacterRegistry] Unknown enemy def: ${enemyDefId}`);
      return null;
    }

    const resolvedSlot = slot ?? this._assignEntitySlot();
    if (resolvedSlot < 0 || resolvedSlot >= MAX_ENTITIES) {
      throw new Error(`Invalid entity slot: ${resolvedSlot}`);
    }
    if (this.slots.has(resolvedSlot)) this.despawnEntity(resolvedSlot);

    const pos = (spawnPos ?? new Vector3(0, 1, 0)).clone();
    const playerId = params.playerId ?? `enemy_${enemyDefId}_${Math.random().toString(36).slice(2, 8)}`;

    const state = new PlayerState(resolvedSlot, playerId, enemyDef.characterId ?? enemyDefId ?? "AYO", pos);
    state.entityType = "ENEMY";
    state.teamId = params.teamId ?? "ENEMY";
    state.aiProfileId = params.aiProfileId ?? enemyDefId;
    state.enemyDefId = enemyDefId;
    state.isAiControlled = true;
    state.level = params.level ?? 1;
    state.xpReward = params.xpReward ?? enemyDef.xpReward ?? 0;
    state.isBoss = !!(params.isBoss || enemyDef.isBoss);
    state.aggroTargetSlot = params.aggroTargetSlot ?? 0;
    state.powerLevel = params.powerLevel ?? enemyDef.basePowerLevel ?? state.powerLevel;
    state.maxHP = params.maxHP ?? enemyDef.maxHP ?? state.maxHP;
    state.hp = state.maxHP;
    state.maxKi = params.maxKi ?? enemyDef.maxKi ?? state.maxKi;
    state.ki = state.maxKi;
    state.maxStamina = params.maxStamina ?? enemyDef.maxStamina ?? state.maxStamina;
    state.stamina = state.maxStamina;

    this.slots.set(resolvedSlot, state);
    this.playerSlotMap.set(playerId, resolvedSlot);

    // Build mesh first, then attach weapon (weapon attach needs the skeleton)
    this._buildCharacterMesh(state)
      .then(() => {
        if (this.slots.get(resolvedSlot) !== state) throw new Error("Superseded");
        return this._attachWeaponForState(state);
      })
      .catch(e => {
        if (e.message !== "Superseded") console.warn(`[CharacterRegistry] Weapon attach failed for slot ${resolvedSlot}:`, e);
      })
      .finally(() => {
        if (this.slots.get(resolvedSlot) !== state) {
          state.weaponNode?.dispose();
          state.rootNode?.dispose();
          state.mesh?.dispose();
          state.skeletons?.forEach(s => s.dispose?.());
          state.animationGroups?.forEach(g => g.dispose?.());
          return;
        }
        this.restoreCharacterRenderState(state);
        this._emit("onPlayerSpawned", {
          slot: resolvedSlot,
          playerId,
          characterId: state.characterId,
          entityType: "ENEMY",
          enemyDefId,
          position: pos,
        });
      });

    return state;
  }

  async spawnCompanion(characterId, slot = null, spawnPos = null, params = {}) {
    if (!CHARACTER_ROSTER[characterId]) throw new Error(`Unknown companion character: ${characterId}`);

    const resolvedSlot = slot ?? this._assignEntitySlot();
    if (resolvedSlot < 0 || resolvedSlot >= MAX_ENTITIES) {
      throw new Error(`Invalid companion slot: ${resolvedSlot}`);
    }
    if (this.slots.has(resolvedSlot)) this.despawnEntity(resolvedSlot);

    const pos = (spawnPos ?? new Vector3(0, 1, 0)).clone();
    const playerId = params.playerId ?? `companion_${characterId}_${Math.random().toString(36).slice(2, 8)}`;

    const state = new PlayerState(resolvedSlot, playerId, characterId, pos);
    state.entityType = "COMPANION";
    state.teamId = "HERO";
    state.isAiControlled = true;
    state.followTargetSlot = params.followTargetSlot ?? 0;
    state.aiProfileId = params.aiProfileId ?? `${characterId}_COMPANION`;
    state.powerLevel = params.powerLevel ?? state.powerLevel;
    state.maxHP = params.maxHP ?? state.maxHP;
    state.hp = state.maxHP;
    state.maxKi = params.maxKi ?? state.maxKi;
    state.ki = state.maxKi;
    state.maxStamina = params.maxStamina ?? state.maxStamina;
    state.stamina = state.maxStamina;

    this.slots.set(resolvedSlot, state);
    this.playerSlotMap.set(playerId, resolvedSlot);

    await this._buildCharacterMesh(state);
    await this._attachWeaponForState(state);
    this.restoreCharacterRenderState(state);

    this._emit("onPlayerSpawned", {
      slot: resolvedSlot,
      playerId,
      characterId: state.characterId,
      entityType: "COMPANION",
      position: pos,
    });
    return state;
  }

  despawnEntity(slot) {
    const state = this.slots.get(slot);
    if (!state) return;

    // Let the dummy know it's being erased
    if (state.isTrainingDummy) {
      state.dummyRef?.dispose();
      this.playerSlotMap.delete(state.playerId);
      this.slots.delete(slot);
      return;
    }

    state.auraSystem?.dispose();
    
    // Unparent to prevent double-dispose errors if the root node tries to clean children
    if (state.weaponNode) { state.weaponNode.parent = null; state.weaponNode.dispose(); }
    if (state.fxNode) { state.fxNode.parent = null; state.fxNode.dispose(); }
    
    state.animationGroups?.forEach?.((group) => group.dispose?.());
    state.skeletons?.forEach?.((skel) => skel.dispose?.()); // Fix skeleton leak
    
    state.mesh?.dispose();
    state.rootNode?.dispose();

    this.playerSlotMap.delete(state.playerId);
    this.slots.delete(slot);
    console.log(`[CharacterRegistry] Despawned slot ${slot}`);
  }

  despawnSlot(slot) {
    this.despawnEntity(slot);
  }

  despawnEntityByPlayerId(playerId) {
    const slot = this.playerSlotMap.get(playerId);
    if (slot !== undefined) this.despawnEntity(slot);
  }

  despawnAll() {
    for (const slot of [...this.slots.keys()]) this.despawnEntity(slot);
  }

  // ─── Combat API ─────────────────────────────────────────────────────────────

  /**
   * Apply damage to a slot.
   * @param {number} slot
   * @param {number} amount
   * @param {string} sourcePlayerId
   */
  applyDamage(slot, amount, sourcePlayerId = null) {
    const state = this.slots.get(slot);
    if (!state || state.isDead) return 0;
    if (state.isInvincible) return 0;

    // ── Z-Vanish Perfect Dodge Check ──
    const now = performance.now();
    if (state.lastDodgeTime && (now - state.lastDodgeTime) < (this.config.combat?.perfectDodgeWindowMs || 150)) {
      const attackerState = sourcePlayerId ? this.getStateByPlayerId(sourcePlayerId) : null;
      if (attackerState) {
        // Teleport behind attacker
        const forward = attackerState.rootNode
          ? new Vector3(Math.sin(attackerState.rootNode.rotation.y), 0, Math.cos(attackerState.rootNode.rotation.y))
          : new Vector3(0, 0, 1);
        
        const backPos = attackerState.position.subtract(forward.scale(2.5));
        const oldPosition = state.position.clone();
        
        state.position.copyFrom(backPos);
        state.isGrounded = false;
        state.isFlying = true;
        
        if (state.rootNode) {
          const toAttacker = attackerState.position.subtract(state.position);
          state.rootNode.rotation.y = Math.atan2(toAttacker.x, toAttacker.z);
        }
        state.lastDodgeTime = 0; // Consume dodge window
        this._emit("onZVanish", { evaderSlot: slot, attackerSlot: attackerState.slot, oldPosition, newPosition: state.position.clone() });
        return -1; // Flag as negated/vanished
      }
    }

    // Route damage to Training Dummy if applicable
    if (state.isTrainingDummy) {
      const res = state.dummyRef.takeDamage(amount, null, null);
      state.hp = state.dummyRef.hp;
      this._emit("onDamageTaken", { slot, amount: res.actual, remainingHP: state.hp, sourcePlayerId });
      return res.actual;
    }

    // Defense factor based on current power level vs attacker's PL
    // Use the attacker's actual power level when known; otherwise skip defense scaling
    // (passing `amount` as a stand-in PL was causing a fixed 50% damage cut for all
    // non-attributed hits, which broke beam clash and projectile damage.)
    const sourcePL = sourcePlayerId
      ? (this.getStateByPlayerId(sourcePlayerId)?.powerLevel ?? state.powerLevel)
      : state.powerLevel;
      
    // Ensure safe division in case of corrupted or base-0 power levels
    const safeSourcePL = Math.max(1, sourcePL);
    const defFactor = Math.max(0.1, 1 - (state.powerLevel / (safeSourcePL * 2)));
    const effective = Math.round(amount * defFactor);

    state.hp = Math.max(0, state.hp - effective);
    state.lastDamageTime = performance.now();

    this._emit("onDamageTaken", { slot, amount: effective, remainingHP: state.hp, sourcePlayerId });

    if (state.hp <= 0 && !state.isDead) {
      state.isDead = true;
      
      // Fade-out logic only. AnimationController handles playing the actual death clip.
      setTimeout(() => {
        if (state.rootNode) {
          state.rootNode.setEnabled(false);
        }
      }, 2200);

      this._emit("onPlayerDied", {
        slot,
        playerId: state.playerId,
        entityType: state.entityType,
        teamId: state.teamId,
        isBoss: state.isBoss,
      });
    }

    return effective;
  }

  /**
   * Restore HP to a slot without exceeding max HP.
   * @param {number} slot
   * @param {number} amount
   * @returns {number}
   */
  applyHeal(slot, amount) {
    const state = this.slots.get(slot);
    if (!state || state.isDead) return 0;
    const before = state.hp;
    state.hp = Math.min(state.maxHP, state.hp + Math.max(0, amount));
    return state.hp - before;
  }

  /**
   * Trigger a transformation for a slot.
   * @param {number} slot
   * @param {string} transformId e.g. "SSJ1"
   */
  transform(slot, transformId) {
    const state = this.slots.get(slot);
    if (!state || state.isDead) return false;

    const transforms = state.characterDef.transformations;
    const idx = transforms.findIndex(t => t.id === transformId);
    if (idx === -1) return false;

    const tf = transforms[idx];

    // Check ki cost
    if (state.ki < tf.kiCost) {
      console.log(`[CharacterRegistry] Not enough Ki to transform (need ${tf.kiCost}, have ${state.ki})`);
      return false;
    }

    // Revert from current transform first, then apply new one
    const basePL = state.characterDef.basePowerLevel;
    state.ki -= tf.kiCost;
    state.currentTransform = tf;
    state.transformIndex = idx;
    state.powerLevel = Math.round(basePL * tf.plMultiplier);

    // Update aura color
    this._updateAuraColor(state, tf.color);

    this._emit("onTransformChanged", { slot, transformId, powerLevel: state.powerLevel });
    this._emit("onPowerLevelChanged", { slot, powerLevel: state.powerLevel });
    console.log(`[CharacterRegistry] Slot ${slot} → ${tf.label} | PL: ${state.powerLevel.toLocaleString()}`);
    return true;
  }

  /** Revert to base form */
  revertTransform(slot) {
    const state = this.slots.get(slot);
    if (!state) return;

    state.currentTransform = null;
    state.transformIndex = -1;
    state.powerLevel = state.characterDef.basePowerLevel;

    this._updateAuraColor(state, new Color3(0.3, 0.5, 1.0));

    this._emit("onTransformChanged", { slot, transformId: null, powerLevel: state.powerLevel });
    this._emit("onPowerLevelChanged", { slot, powerLevel: state.powerLevel });
  }

  // ─── Per-Frame Update ────────────────────────────────────────────────────────
  update(delta) {
    for (const [, state] of this.slots) {
      if (state.isDead) continue;
      if (state.isTrainingDummy) continue; // Training dummies managed by dummyManager

      // Stamina regen (paused for 1.5s after a stance switch is handled
      // naturally since stamina only drains on toggle, not continuously)
      state.stamina = Math.min(state.maxStamina, state.stamina + this.staminaRegenRate * delta);

      // Ki regen (slower while transformed)
      const kiRegen = state.currentTransform ? this.kiRegenRate * 0.3 : this.kiRegenRate;
      state.ki = Math.min(state.maxKi, state.ki + kiRegen * delta);

      // HP regen (only when not recently hit — 3s grace period)
      const timeSinceHit = (performance.now() - state.lastDamageTime) / 1000;
      if (timeSinceHit > 3.0) {
        state.hp = Math.min(state.maxHP, state.hp + this.hpRegenRate * delta);
      }

      // Gain ki while charging (player is powering up)
      if (state.isChargingKi) {
        state.ki = Math.min(state.maxKi, state.ki + (this.config.combat?.kiChargeRate ?? 20) * delta);
      }

      // Sync mesh position (in a full impl, physics drives this — this is a fallback)
      if (state.rootNode) {
        state.rootNode.position.copyFrom(state.position);
      }

      this._ensureCharacterRenderState(state);
    }
  }

  // ─── Getters ─────────────────────────────────────────────────────────────────
  getState(slot) {
    return this.slots.get(slot) ?? null;
  }

  getStateByPlayerId(playerId) {
    const slot = this.playerSlotMap.get(playerId);
    return slot !== undefined ? this.slots.get(slot) ?? null : null;
  }

  getEntitiesByTeam(teamId) {
    return [...this.slots.values()].filter((s) => s.teamId === teamId);
  }

  restoreCharacterRenderState(slotOrState) {
    const state = typeof slotOrState === "number" ? this.slots.get(slotOrState) : slotOrState;
    if (!state) return false;

    // Prevent restoring visibility for dead characters that have already faded out
    if (state.isDead && state.rootNode && !state.rootNode.isEnabled()) {
      return false;
    }

    // ── Restore correct scaling if animation retargeting corrupted it ──
    if (state._correctScaling && state.rootNode) {
      const s = state.rootNode.scaling;
      const c = state._correctScaling;
      if (Math.abs(s.x - c.x) > 0.001 || Math.abs(s.y - c.y) > 0.001 || Math.abs(s.z - c.z) > 0.001) {
        state.rootNode.scaling.copyFrom(c);
      }
    }

    // ── Sync rootNode position from authoritative state.position ──
    if (state.rootNode && state.position) {
      state.rootNode.position.copyFrom(state.position);
    }

    // ── CRITICAL: Ensure root node and all children are visible ──
    if (state.rootNode) {
      state.rootNode.setEnabled(true);
      // Force visibility on all descendants recursively
      this._forceNodeVisibility(state.rootNode);
    }

    // Also ensure individual mesh visibility
    for (const mesh of state.characterMeshes ?? []) {
      if (!mesh || mesh.isDisposed?.()) continue;
      this._configureCharacterMesh(mesh, { forceActiveSelection: true });
      // Force parent to be enabled
      if (mesh.parent) {
        mesh.parent.setEnabled?.(true);
      }
    }

    if (state.mesh && !state.mesh.isDisposed?.()) {
      this._configureCharacterMesh(state.mesh, { forceActiveSelection: true });
      // Force parent to be enabled
      if (state.mesh.parent) {
        state.mesh.parent.setEnabled?.(true);
      }
    }

    if (state.weaponNode && !state.weaponNode.isDisposed?.()) {
      state.weaponNode.setEnabled?.(state.currentStance === "SWORD");
    }

    state.rootNode?.computeWorldMatrix?.(true);
    return true;
  }

  /**
   * Recursively force visibility on a node and all its children
   * @private
   */
  _forceNodeVisibility(node) {
    if (!node) return;
    
    // Enable this node
    node.setEnabled?.(true);
    
    // If it's a mesh, ensure visibility properties
    if (node.isVisible !== undefined) {
      node.isVisible = true;
      node.visibility = 1;
    }
    
    // Process children recursively ONCE using getChildren()
    if (node.getChildren) {
      for (const child of node.getChildren(null, false)) {
        this._forceNodeVisibility(child);
      }
    }
  }

  /** Returns a snapshot of all slot states (safe to serialize for network sync) */
  getSnapshot() {
    const snap = {};
    for (const [slot, state] of this.slots) {
      snap[slot] = {
        playerId: state.playerId,
        characterId: state.characterId,
        hp: state.hp,
        maxHP: state.maxHP,
        ki: state.ki,
        maxKi: state.maxKi,
        stamina: state.stamina,
        maxStamina: state.maxStamina,
        powerLevel: state.powerLevel,
        transformId: state.currentTransform?.id ?? null,
        position: { x: state.position.x, y: state.position.y, z: state.position.z },
        velocity: { x: state.velocity.x, y: state.velocity.y, z: state.velocity.z },
        isFlying: state.isFlying,
        isGrounded: state.isGrounded,
        isChargingKi: state.isChargingKi,
        isBlocking: state.isBlocking,
        currentStance: state.currentStance,
        isDead: state.isDead,
      };
    }
    return snap;
  }

  /** Apply a snapshot received from the host (client-side reconciliation) */
  applySnapshot(snapshot) {
    for (const [slotStr, data] of Object.entries(snapshot)) {
      const slot = parseInt(slotStr, 10);
      const state = this.slots.get(slot);
      if (!state) continue;

      state.hp = data.hp;
      state.ki = data.ki;
      state.stamina = data.stamina ?? state.stamina;
      state.powerLevel = data.powerLevel;
      state.isFlying = data.isFlying ?? state.isFlying;
      state.isGrounded = data.isGrounded ?? state.isGrounded;
      state.isChargingKi = data.isChargingKi ?? state.isChargingKi;
      state.isBlocking = data.isBlocking ?? state.isBlocking;

      const prevStance = state.currentStance;
      state.currentStance = data.currentStance ?? state.currentStance;
      state.isDead = data.isDead;

      state.position.set(data.position.x, data.position.y, data.position.z);
      if (data.velocity) {
        state.velocity.set(data.velocity.x, data.velocity.y, data.velocity.z);
      }

      if (prevStance !== state.currentStance) {
        this._emit("onStanceChanged", { slot, stance: state.currentStance });
      }
    }
  }

  // ─── Event System ────────────────────────────────────────────────────────────
  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    this._listeners[event] = (this._listeners[event] || []).filter(f => f !== fn);
  }

  _emit(event, data) {
    (this._listeners[event] || []).forEach(fn => fn(data));
  }

  _toTargetPropertyPath(rawPath) {
    if (Array.isArray(rawPath)) return rawPath.map((part) => String(part));
    if (typeof rawPath !== "string") return [];
    return rawPath
      .split(".")
      .map((part) => part.trim())
      .filter(Boolean);
  }

  _sanitizeImportedAnimationGroups(animationGroups = []) {
    for (const group of animationGroups) {
      const targeted = Array.isArray(group?.targetedAnimations) ? group.targetedAnimations : null;
      if (!targeted?.length) continue;

      for (let i = targeted.length - 1; i >= 0; i -= 1) {
        const path = this._toTargetPropertyPath(targeted[i]?.animation?.targetPropertyPath);
        if (!path.length) continue;

        const normalizedPath = path.map((part) => String(part).toLowerCase());
        const hidesMesh = normalizedPath.includes("visibility") || normalizedPath.includes("isvisible");
        const togglesEnabled = normalizedPath.includes("enabled") || normalizedPath.includes("setenabled");
        if (hidesMesh || togglesEnabled) {
          targeted.splice(i, 1);
        }
      }
    }
  }

  _selectPrimaryRenderableMesh(meshes = []) {
    return meshes.find((mesh) => (mesh?.getTotalVertices?.() ?? 0) > 0 && mesh?.skeleton)
      ?? meshes.find((mesh) => (mesh?.getTotalVertices?.() ?? 0) > 0)
      ?? meshes.find((mesh) => mesh?.skeleton)
      ?? meshes[0]
      ?? null;
  }

  _configureCharacterMesh(mesh, { forceActiveSelection = false } = {}) {
    if (!mesh || mesh.isDisposed?.()) return;
    mesh.isCharacter = true;
    mesh.isPickable = false;
    mesh.isVisible = true;
    mesh.visibility = 1;
    mesh.setEnabled?.(true);
    mesh.alwaysSelectAsActiveMesh = forceActiveSelection;
    mesh.doNotSyncBoundingInfo = false;
    mesh.refreshBoundingInfo?.();
    mesh.computeWorldMatrix?.(true);
  }

  // ─── Internals ────────────────────────────────────────────────────────────────
  async _buildCharacterMesh(state) {
    const root = new TransformNode(`player_${state.slot}_root`, this.scene);
    root.position.copyFrom(state.position);
    state.rootNode = root;

    // Try to load the GLB; fall back to capsule in dev
    try {
      const resolvedModelPath = await resolveAssetUrl(state.characterDef.modelPath);
      const importSource = await resolveSceneSource(state.characterDef.modelPath);
      console.log(`[CharacterRegistry] Loading model from: ${state.characterDef.modelPath} -> ${resolvedModelPath}`);

      const result = await SceneLoader.ImportMeshAsync("", importSource.rootUrl, importSource.sceneFilename, this.scene);

      // Preserve the GLB's internal parent-child hierarchy (e.g. Body → Armature → __root__).
      // Only reparent top-level nodes (parent === null) to our game root so the skeleton's
      // bone TransformNodes and their child Meshes share the same coordinate space.
      // Flattening all meshes under player_X_root would misplace the body mesh relative to
      // the skeleton bones (which stay under __root__), causing deformation artifacts.
      result.meshes.forEach(m => {
        if (!m.parent) m.parent = root;
        const hasVertices = (m.getTotalVertices?.() ?? 0) > 0;
        this._configureCharacterMesh(m, { forceActiveSelection: hasVertices });
      });

      state.mesh = this._selectPrimaryRenderableMesh(result.meshes);
      state.characterMeshes = result.meshes.filter((mesh) => (mesh?.getTotalVertices?.() ?? 0) > 0);
      if (!state.characterMeshes.length) {
        state.characterMeshes = result.meshes.filter(Boolean);
      }

      // Strip visibility/isVisible animation tracks BEFORE stopping, so that
      // goToFrame(0) and Babylon's render-loop evaluation cannot hide meshes.
      // Then stop all groups so they don't auto-play before the
      // AnimationController retargets and starts the correct clips.
      this._sanitizeImportedAnimationGroups(result.animationGroups ?? []);
      result.animationGroups?.forEach?.(g => {
        g.goToFrame?.(0);
        g.stop();
        g.weight = 0;
      });

      state.animationGroups = result.animationGroups ?? [];
      state.skeletons = result.skeletons ?? [];

      this._normalizeImportedCharacterScale(state, result.meshes);

      console.log(`[CharacterRegistry] Model loaded for ${state.characterId}:`, {
        meshCount: result.meshes.length,
        skeletonCount: result.skeletons.length,
        animGroupCount: result.animationGroups.length,
        animGroupNames: result.animationGroups.map(g => g.name),
      });
    } catch (err) {
      console.warn(`[CharacterRegistry] Model not found for ${state.characterId}: ${err.message}`);
      const capsule = MeshBuilder.CreateCapsule(
        `player_${state.slot}_mesh`,
        { height: 2, radius: 0.4 },
        this.scene
      );
      capsule.parent = root;
      capsule.isCharacter = true;
      capsule.isPickable = false;
      capsule.alwaysSelectAsActiveMesh = true;

      const mat = new StandardMaterial(`player_${state.slot}_mat`, this.scene);
      const slotColors = [Color3.Blue(), Color3.Red(), Color3.Yellow(), Color3.Green()];
      const fallbackColor = slotColors[state.slot % slotColors.length] ?? Color3.White();
      mat.diffuseColor = fallbackColor;
      capsule.material = mat;

      state.mesh = capsule;
      state.characterMeshes = [capsule];
      state.animationGroups = [];
      state.skeletons = [];
    }

    // Spawn base ki aura (dim, always present)
    this._spawnAura(state);
  }

  _spawnAura(state) {
    // Aura visuals are handled by AuraSystem; avoid paying for a duplicate particle stack here.
    state.auraSystem = null;
  }

  _normalizeImportedCharacterScale(state, meshes) {
    const allMeshes = (meshes ?? []).filter(Boolean);
    const renderMeshes = allMeshes.filter((mesh) =>
      mesh?.getBoundingInfo &&
      mesh.isEnabled?.() !== false &&
      mesh.isVisible !== false &&
      (mesh.getTotalVertices?.() ?? 0) > 0
    );

    if (!state?.rootNode || !renderMeshes.length) return;

    // Force world-matrix refresh before reading initial bounds so we get
    // accurate world-space values even if the scene hasn't rendered yet.
    state.rootNode.computeWorldMatrix(true);
    renderMeshes.forEach(m => {
      m.computeWorldMatrix?.(true);
      m.refreshBoundingInfo?.();
    });

    const bounds = this._getMeshBounds(renderMeshes);
    if (!bounds) return;

    const currentHeight = bounds.max.y - bounds.min.y;
    if (!(currentHeight > 0.001)) return;

    const desiredHeight = MODEL_HEIGHT_OVERRIDES_M[state.characterDef?.modelPath]
      ?? state.characterDef?.desiredHeightM
      ?? DEFAULT_CHARACTER_HEIGHT_M;
    const targetHeight = Math.min(
      CHARACTER_MAX_HEIGHT_M,
      Math.max(CHARACTER_MIN_HEIGHT_M, desiredHeight)
    );
    const scale = targetHeight / currentHeight;

    state.rootNode.scaling.setAll(scale);
    this._ensureFxNode(state, scale);

    // Force world-matrix refresh AFTER scaling so the bounding box reflects
    // the new scale before we compute the foot-alignment offset.
    state.rootNode.computeWorldMatrix(true);
    renderMeshes.forEach(m => {
      m.computeWorldMatrix?.(true);
      m.refreshBoundingInfo?.();
    });

    const scaledBounds = this._getMeshBounds(renderMeshes);
    if (!scaledBounds) return;

    // Find the top-level GLB root (direct child of player_X_root).
    // Shifting this node moves the entire imported hierarchy together without
    // double-shifting child nodes whose positions are relative to their parents.
    const glbRoot = allMeshes.find(m => m.parent === state.rootNode) ?? renderMeshes[0];
    if (glbRoot) {
      // World-space delta needed to align the mesh's feet with rootNode.position.y
      const feetWorldY = scaledBounds.min.y;
      const targetFeetY = state.rootNode.position.y;
      const worldDelta = targetFeetY - feetWorldY;

      if (Math.abs(worldDelta) > 0.0001) {
        // Convert world delta → local delta for glbRoot, accounting for BOTH
        // the rootNode's uniform scale AND the glbRoot's own scaling (e.g. a
        // GLB exported in centimetres will have __root__.scaling ≈ 0.01).
        const effectiveScaleY = Math.max(
          state.rootNode.scaling.y * (glbRoot.scaling?.y ?? 1),
          0.0001
        );
        glbRoot.position.y += worldDelta / effectiveScaleY;
      }
    }

    // Final refresh so subsequent bound queries (e.g. camera framing) are correct.
    state.rootNode.computeWorldMatrix(true);
    renderMeshes.forEach(m => m.computeWorldMatrix?.(true));

    // ── Save the correct scaling so restoreCharacterRenderState can recover
    // from animation retargeting that corrupts rootNode.scaling.
    state._correctScaling = state.rootNode.scaling.clone();

    const finalBounds = this._getMeshBounds(renderMeshes);
    const finalHeight = finalBounds ? (finalBounds.max.y - finalBounds.min.y) : targetHeight;
    console.log(`[CharacterRegistry] Normalized ${state.characterId} height -> ${finalHeight.toFixed(2)}m (target ${targetHeight.toFixed(2)}m)`);
  }

  _ensureCharacterRenderState(state) {
    this.restoreCharacterRenderState(state);
  }

  _ensureFxNode(state, visualScale = 1) {
    if (!state?.rootNode) return;
    if (!state.fxNode || state.fxNode.isDisposed?.()) {
      state.fxNode = new TransformNode(`player_${state.slot}_fx`, this.scene);
      state.fxNode.parent = state.rootNode;
      state.fxNode.position.set(0, 0, 0);
    }
    const inverseScale = 1 / Math.max(visualScale, 0.0001);
    state.fxNode.scaling.setAll(inverseScale);
  }

  _getMeshBounds(meshes) {
    let min = null;
    let max = null;
    for (const mesh of meshes) {
      mesh.computeWorldMatrix?.(true);
      const info = mesh.getBoundingInfo?.();
      const box = info?.boundingBox;
      if (!box) continue;

      const meshMin = box.minimumWorld;
      const meshMax = box.maximumWorld;

      if (!min) {
        min = meshMin.clone();
        max = meshMax.clone();
        continue;
      }

      min.x = Math.min(min.x, meshMin.x);
      min.y = Math.min(min.y, meshMin.y);
      min.z = Math.min(min.z, meshMin.z);
      max.x = Math.max(max.x, meshMax.x);
      max.y = Math.max(max.y, meshMax.y);
      max.z = Math.max(max.z, meshMax.z);
    }
    return min && max ? { min, max } : null;
  }

  _updateAuraColor(state, color) {
    if (!state.auraSystem) return;
    state.auraSystem.color1 = new Color4(color.r, color.g, color.b, 0.7);
    state.auraSystem.color2 = new Color4(color.r * 0.5, color.g * 0.5, color.b * 0.5, 0.2);
    state.auraSystem.emitRate = state.currentTransform ? 200 : 60;
  }

  _assignEntitySlot() {
    for (let i = 1; i < MAX_ENTITIES; i++) {
      if (!this.slots.has(i)) return i;
    }
    throw new Error("CharacterRegistry: no free entity slots");
  }

  // ─── Stance Toggle ────────────────────────────────────────────────────────
  /**
   * Toggle Ayo's combat stance between MELEE ↔ SWORD.
   * Costs stamina. No-op for characters that only support one stance.
   * @param {number} slot
   * @returns {boolean} true if stance changed
   */
  toggleStance(slot) {
    const state = this.slots.get(slot);
    if (!state || state.isDead) return false;

    const def = state.characterDef;
    const stances = def.stances ?? ["MELEE"];
    if (stances.length < 2) return false;

    const cost = def.stanceSwitchCost ?? 10;
    if (state.stamina < cost) {
      console.log(`[CharacterRegistry] Not enough stamina to switch stance (need ${cost})`);
      return false;
    }

    const wasActionLocked = !!state.isActionLocked;
    if (wasActionLocked) {
      state.isActionLocked = false;
    }
    state.stamina = Math.max(0, state.stamina - cost);
    const next = state.currentStance === "MELEE" ? "SWORD" : "MELEE";
    state.currentStance = next;

    // Show/hide weapon mesh
    if (state.weaponNode) state.weaponNode.setEnabled(next === "SWORD");

    this._emit("onStanceChanged", { slot, stance: next, wasActionLocked });
    console.log(`[CharacterRegistry] Slot ${slot} stance → ${next}`);
    return true;
  }

  // ─── Enemy Weapon Attachment ──────────────────────────────────────────────
  /** Pool of weapon asset ids to randomly pick from */
  static ENEMY_WEAPON_POOL = [
    "weapon_ayoskatana",
    "weapon_katana",
    "weapon_neon_blade",
    "weapon_night_sword",
  ];

  /**
   * Load a sword and parent it to the character's right-hand bone.
   * Non-blocking — falls back gracefully when bone is not found.
   * @param {PlayerState} state
   */
  async _attachWeaponForState(state) {
    if (!state) return;
    const supportsSword = (state.characterDef?.stances ?? []).includes("SWORD");
    if (!supportsSword) return;

    const weapId = this._resolveWeaponAssetId(state);

    // Resolve path from the already-imported static manifest
    const weapDef = ASSET_MANIFEST.models.find(m => m.id === weapId);
    if (!weapDef) {
      console.warn(`[CharacterRegistry] Weapon asset not in manifest: ${weapId}`);
      return;
    }

    let weapResult;
    try {
      const _resolvedWeaponPath = await resolveAssetUrl(weapDef.path);
      const importSource = await resolveSceneSource(weapDef.path);
      weapResult = await SceneLoader.ImportMeshAsync("", importSource.rootUrl, importSource.sceneFilename, this.scene);
    } catch (err) {
      console.warn(`[CharacterRegistry] Could not load weapon ${weapId}:`, err.message);
      return;
    }

    // Try to find a hand/wrist bone on the skeleton — exact names first, fuzzy fallback
    const skeleton = state.mesh?.skeleton ?? null;
    let handBone = null;
    if (skeleton) {
      const exactNames = [
        "mixamorig:RightHand", "mixamorig9Character:RightHand",
        "RightHand", "Hand_R", "hand_r", "Bip01_R_Hand", "Wrist_R",
      ];
      for (const name of exactNames) {
        handBone = skeleton.bones.find(b => b.name === name) ?? null;
        if (handBone) break;
      }
      if (!handBone) {
        const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");
        const fingerKw = ["index", "middle", "ring", "pinky", "thumb", "finger"];
        handBone = skeleton.bones.find(b => {
          const n = norm(b.name);
          const isHand = n.includes("righthand") || n.includes("handr") || n.endsWith("rhand");
          return isHand && !fingerKw.some(k => n.includes(k));
        }) ?? null;
      }
    }

    // Measure the weapon's actual bounding box before reparenting/scaling
    const realMeshes = weapResult.meshes.filter(m => m.getTotalVertices() > 0);
    let naturalLength = 1.0;
    if (realMeshes.length > 0) {
      let minV = new Vector3(Infinity, Infinity, Infinity);
      let maxV = new Vector3(-Infinity, -Infinity, -Infinity);
      for (const m of realMeshes) {
        m.computeWorldMatrix(true);
        const bi = m.getBoundingInfo();
        minV.minimizeInPlace(bi.boundingBox.minimumWorld);
        maxV.maximizeInPlace(bi.boundingBox.maximumWorld);
      }
      const diag = maxV.subtract(minV);
      naturalLength = Math.max(diag.x, diag.y, diag.z);
    }

    // Target ~0.85 m for a 1.82 m character, proportional to character height
    const desiredLengthM = 0.85 * ((state.characterDef?.desiredHeightM ?? 1.82) / 1.82);
    const uniformScale = naturalLength > 0.001 ? desiredLengthM / naturalLength : 0.01;

    const weaponRoot = new TransformNode(`weapon_${state.slot}`, this.scene);
    if (handBone && state.mesh) {
      weaponRoot.parent = state.mesh;
      weaponRoot.attachToBone(handBone, state.mesh);
    } else {
      weaponRoot.parent = state.rootNode;
      weaponRoot.position = new Vector3(0.4, 1.0, 0.2);
    }

    // Parent the GLB root to weaponRoot with computed scale; child meshes keep
    // their relative transforms so the whole sword scales as one unit.
    const importedRoot = weapResult.meshes[0];
    if (importedRoot) {
      importedRoot.parent = weaponRoot;
      importedRoot.position = Vector3.Zero();
      importedRoot.rotationQuaternion = null;
      importedRoot.rotation = Vector3.Zero();
      importedRoot.scaling = new Vector3(uniformScale, uniformScale, uniformScale);
    } else {
      weapResult.meshes.forEach(m => {
        m.parent = weaponRoot;
        m.scaling = new Vector3(uniformScale, uniformScale, uniformScale);
      });
    }

    state.weaponNode = weaponRoot;
    state.weaponNode.setEnabled(state.currentStance === "SWORD");
    console.log(`[CharacterRegistry] Attached ${weapId} to slot ${state.slot}`);
  }

  _resolveWeaponAssetId(state) {
    const pool = CharacterRegistry.ENEMY_WEAPON_POOL;
    const enemyDef = state?.enemyDefId ? getEnemyDef(state.enemyDefId) : null;
    if (enemyDef?.weaponForced) return enemyDef.weaponForced;

    switch (state?.characterId) {
      case "AYO": return "weapon_ayoskatana";
      case "LEBRON": return "weapon_neon_blade";
      case "AKADEMIKS": return "weapon_katana";
      case "OPP": return "weapon_night_sword";
      default: return pool[Math.floor(Math.random() * pool.length)];
    }
  }
}
