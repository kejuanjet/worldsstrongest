import { Color3 } from "@babylonjs/core";
import type { CharacterDefinition } from "./gameData";

// ─── Character Roster ─────────────────────────────────────────────────────────
// Define all selectable characters with base stats and transformation thresholds.
export const CHARACTER_ROSTER: Record<string, CharacterDefinition> = {
  GOKU: {
    id: "GOKU",
    label: "Atlas",
    modelPath: "/assets/models/ayo.glb",
    desiredHeightM: 1.8,
    basePowerLevel: 3_000_000,
    baseSpeed: 12,
    baseStamina: 100,
    ultimateAttack: "SPIRIT_BOMB",
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
    ultimateAttack: "FINAL_FLASH",
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
    ultimateAttack: "MASENKO",
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
    ultimateAttack: "SPECIAL_BEAM_CANNON",
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
    ultimateAttack: "AYO_SWORD_BEAM",
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
    ultimateAttack: "MAGIC_HEAL",
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
    ultimateAttack: "RUSH_COMBO",
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
