// src/core/combat/AttackCatalog.ts
// Attack type enum, per-attack definitions, and the full attack catalog.

import { Color3 } from "@babylonjs/core";

// ─── Attack Types ─────────────────────────────────────────────────────────────

export const ATTACK_TYPE = {
  MELEE_LIGHT:  "MELEE_LIGHT",
  MELEE_HEAVY:  "MELEE_HEAVY",
  KI_BLAST:     "KI_BLAST",
  KI_BEAM:      "KI_BEAM",
  ULTIMATE:     "ULTIMATE",
  RUSH_COMBO:   "RUSH_COMBO",
  GRAB:         "GRAB",
  COUNTER:      "COUNTER",
  SWORD_LIGHT:  "SWORD_LIGHT",
  SWORD_HEAVY:  "SWORD_HEAVY",
  SWORD_RANGED: "SWORD_RANGED",
  SWORD_BEAM:   "SWORD_BEAM",
  HEAL_PULSE:   "HEAL_PULSE",
  MAGIC_ATTACK: "MAGIC_ATTACK",
} as const;

export type AttackTypeId = (typeof ATTACK_TYPE)[keyof typeof ATTACK_TYPE];

// ─── Attack Definition ────────────────────────────────────────────────────────

export interface AttackDefinition {
  type: AttackTypeId;
  label?: string;
  characters?: string[];
  baseDamage?: number;
  healAmount?: number;
  selfHeal?: number;
  chargeTime?: number;
  range?: number;
  radius?: number;
  width?: number;
  kiCost: number;
  staminaCost: number;
  hitstun?: number;
  knockback?: number;
  comboWindow?: number;
  castTime?: number;
  breaksGuard?: boolean;
  piercing?: boolean;
  aoe?: boolean;
  projectileSpeed?: number;
  hitRadius?: number;
  color?: Color3;
}

// ─── Attack Catalog ───────────────────────────────────────────────────────────

export const ATTACK_CATALOG: Readonly<Record<string, AttackDefinition>> = {
  // ── Melee ────────────────────────────────────────────────────────────────
  MELEE_LIGHT: {
    type:        ATTACK_TYPE.MELEE_LIGHT,
    baseDamage:  280,
    range:       3.5,
    kiCost:      0,
    staminaCost: 8,
    hitstun:     180,
    knockback:   4.0,
    comboWindow: 400,
    castTime:    80,
  },
  MELEE_HEAVY: {
    type:        ATTACK_TYPE.MELEE_HEAVY,
    baseDamage:  620,
    range:       3.8,
    kiCost:      5,
    staminaCost: 20,
    hitstun:     350,
    knockback:   12.0,
    comboWindow: 600,
    castTime:    200,
    breaksGuard: true,
  },
  KI_BLAST: {
    type:        ATTACK_TYPE.KI_BLAST,
    baseDamage:  340,
    range:       80,
    kiCost:      10,
    staminaCost: 0,
    hitstun:     120,
    knockback:   6.0,
    castTime:    120,
    projectileSpeed: 40,
  },
  // ── Beams ────────────────────────────────────────────────────────────────
  KAMEHAMEHA: {
    type:        ATTACK_TYPE.KI_BEAM,
    label:       "Arc Beam",
    characters:  ["GOKU", "GOHAN"],
    baseDamage:  1800,
    chargeTime:  1200,
    range:       150,
    width:       1.2,
    kiCost:      40,
    staminaCost: 0,
    hitstun:     600,
    knockback:   25.0,
    castTime:    200,
    color:       new Color3(0.2, 0.5, 1.0),
  },
  GALICK_GUN: {
    type:        ATTACK_TYPE.KI_BEAM,
    label:       "Nova Lance",
    characters:  ["VEGETA"],
    baseDamage:  1750,
    chargeTime:  1100,
    range:       150,
    width:       1.0,
    kiCost:      40,
    staminaCost: 0,
    hitstun:     600,
    knockback:   28.0,
    castTime:    180,
    color:       new Color3(0.7, 0.1, 0.9),
  },
  SPECIAL_BEAM_CANNON: {
    type:        ATTACK_TYPE.KI_BEAM,
    label:       "Prism Piercer",
    characters:  ["PICCOLO"],
    baseDamage:  2200,
    chargeTime:  2000,
    range:       200,
    width:       0.3,
    kiCost:      60,
    staminaCost: 0,
    hitstun:     800,
    knockback:   20.0,
    castTime:    300,
    color:       new Color3(0.1, 0.9, 0.1),
    piercing:    true,
  },
  MASENKO: {
    type:        ATTACK_TYPE.KI_BEAM,
    label:       "Solar Volley",
    characters:  ["GOHAN"],
    baseDamage:  1600,
    chargeTime:  900,
    range:       120,
    width:       0.8,
    kiCost:      35,
    staminaCost: 0,
    hitstun:     500,
    knockback:   22.0,
    castTime:    150,
    color:       new Color3(0.9, 0.8, 0.1),
  },
  // ── Ayo Beams ────────────────────────────────────────────────────────────
  AYO_MELEE_BEAM: {
    type:        ATTACK_TYPE.KI_BEAM,
    label:       "Aura Boomerang",
    characters:  ["AYO"],
    baseDamage:  1400,
    chargeTime:  800,
    range:       100,
    width:       1.0,
    kiCost:      30,
    staminaCost: 0,
    hitstun:     450,
    knockback:   18.0,
    castTime:    150,
    color:       new Color3(0.8, 0.4, 0.1),
    aoe:         false,
  },
  AYO_SWORD_BEAM: {
    type:        ATTACK_TYPE.SWORD_BEAM,
    label:       "Spell Cast (Sword)",
    characters:  ["AYO"],
    baseDamage:  1600,
    chargeTime:  1000,
    range:       110,
    width:       0.9,
    kiCost:      35,
    staminaCost: 0,
    hitstun:     500,
    knockback:   20.0,
    castTime:    160,
    color:       new Color3(0.4, 0.8, 1.0),
  },
  // ── Sword Melee ──────────────────────────────────────────────────────────
  SWORD_LIGHT: {
    type:        ATTACK_TYPE.SWORD_LIGHT,
    baseDamage:  460,
    range:       4.5,
    kiCost:      0,
    staminaCost: 10,
    hitstun:     200,
    knockback:   5.5,
    comboWindow: 450,
    castTime:    90,
  },
  SWORD_HEAVY: {
    type:        ATTACK_TYPE.SWORD_HEAVY,
    baseDamage:  880,
    range:       5.0,
    kiCost:      8,
    staminaCost: 22,
    hitstun:     400,
    knockback:   16.0,
    comboWindow: 700,
    castTime:    220,
    breaksGuard: true,
  },
  SWORD_RANGED: {
    type:        ATTACK_TYPE.SWORD_RANGED,
    label:       "Shockwave Slash",
    baseDamage:  620,
    range:       50,
    kiCost:      15,
    staminaCost: 5,
    hitstun:     300,
    knockback:   10.0,
    castTime:    180,
    aoe:         false,
    projectileSpeed: 30,
    color:       new Color3(0.7, 0.7, 0.9),
  },
  SWORD_WHIRLWIND: {
    type:        ATTACK_TYPE.SWORD_RANGED,
    label:       "Whirlwind Slash",
    baseDamage:  540,
    range:       8.0,
    radius:      6.0,
    kiCost:      20,
    staminaCost: 15,
    hitstun:     250,
    knockback:   12.0,
    castTime:    200,
    aoe:         true,
    color:       new Color3(0.6, 0.6, 1.0),
  },
  // ── Hana Support ─────────────────────────────────────────────────────────
  HEAL_PULSE: {
    type:        ATTACK_TYPE.HEAL_PULSE,
    label:       "Healing Pulse",
    characters:  ["HANA"],
    healAmount:  800,
    selfHeal:    400,
    range:       25,
    kiCost:      20,
    staminaCost: 15,
    castTime:    250,
    color:       new Color3(0.3, 1.0, 0.5),
  },
  MAGIC_HEAL: {
    type:        ATTACK_TYPE.HEAL_PULSE,
    label:       "Magic Heal",
    characters:  ["HANA"],
    healAmount:  1800,
    selfHeal:    900,
    range:       0,
    kiCost:      45,
    staminaCost: 30,
    castTime:    400,
    color:       new Color3(0.1, 1.0, 0.3),
  },
  TWO_HAND_SPELL: {
    type:        ATTACK_TYPE.MAGIC_ATTACK,
    label:       "Two-Hand Spell",
    characters:  ["HANA"],
    baseDamage:  900,
    chargeTime:  800,
    range:       60,
    kiCost:      25,
    staminaCost: 0,
    hitstun:     300,
    knockback:   8.0,
    castTime:    200,
    color:       new Color3(0.7, 0.3, 1.0),
  },
  // ── Rayne ────────────────────────────────────────────────────────────────
  RAYNE_BEAM: {
    type:        ATTACK_TYPE.KI_BEAM,
    label:       "Furious Blast",
    characters:  ["RAYNE"],
    baseDamage:  1500,
    chargeTime:  1000,
    range:       120,
    width:       1.5,
    kiCost:      45,
    staminaCost: 0,
    hitstun:     500,
    knockback:   25.0,
    castTime:    200,
    color:       new Color3(0.9, 0.2, 0.2),
  },
  // ── Rush / Grab ──────────────────────────────────────────────────────────
  RUSH_COMBO: {
    type:        ATTACK_TYPE.RUSH_COMBO,
    baseDamage:  120,
    range:       3.0,
    kiCost:      15,
    staminaCost: 20,
    castTime:    150,
    hitstun:     400,
    knockback:   8.0,
    comboWindow: 500,
  },
  GRAB: {
    type:        ATTACK_TYPE.GRAB,
    baseDamage:  500,
    range:       2.5,
    kiCost:      0,
    staminaCost: 30,
    castTime:    250,
    hitstun:     300,
    knockback:   8.0,
    breaksGuard: true,
  },
  // ── Ultimates ────────────────────────────────────────────────────────────
  SPIRIT_BOMB: {
    type:        ATTACK_TYPE.ULTIMATE,
    label:       "Meteor Crash",
    characters:  ["GOKU"],
    baseDamage:  8000,
    chargeTime:  4000,
    range:       30,
    radius:      8.0,
    kiCost:      100,
    staminaCost: 0,
    hitstun:     2000,
    knockback:   50.0,
    castTime:    500,
    color:       new Color3(0.3, 0.7, 1.0),
    aoe:         true,
  },
  FINAL_FLASH: {
    type:        ATTACK_TYPE.ULTIMATE,
    label:       "Overdrive Ray",
    characters:  ["VEGETA"],
    baseDamage:  7500,
    chargeTime:  3500,
    range:       200,
    width:       2.5,
    kiCost:      100,
    staminaCost: 0,
    hitstun:     1500,
    knockback:   60.0,
    castTime:    400,
    color:       new Color3(0.9, 1.0, 0.2),
  },
};
