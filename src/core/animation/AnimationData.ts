// src/core/animation/AnimationData.ts
// Pure animation lookup data — states, clip mappings, timing tables, state classification.
// Separated from AnimationController to decouple data from state-machine logic.

// ─── Animation State IDs ──────────────────────────────────────────────────────

export const ANIM_STATE = {
  // Locomotion
  IDLE:           "IDLE",
  RUN:            "RUN",
  SPRINT:         "SPRINT",
  WALK:           "WALK",
  FLY_IDLE:       "FLY_IDLE",
  FLY_MOVE:       "FLY_MOVE",
  FLY_FAST:       "FLY_FAST",
  LAND:           "LAND",
  FALL:           "FALL",
  JUMP:           "JUMP",
  BACKFLIP:       "BACKFLIP",
  DODGE_LEFT:     "DODGE_LEFT",
  DODGE_RIGHT:    "DODGE_RIGHT",
  STRAFE_L:       "STRAFE_L",
  STRAFE_R:       "STRAFE_R",
  TURN_L:         "TURN_L",
  TURN_R:         "TURN_R",
  // Combat — melee stance
  ATTACK_LIGHT_1: "ATTACK_LIGHT_1",
  ATTACK_LIGHT_2: "ATTACK_LIGHT_2",
  ATTACK_LIGHT_3: "ATTACK_LIGHT_3",
  ATTACK_HEAVY:   "ATTACK_HEAVY",
  KI_CHARGE:      "KI_CHARGE",
  KI_BLAST:       "KI_BLAST",
  BEAM_CHARGE:    "BEAM_CHARGE",
  BEAM_FIRE:      "BEAM_FIRE",
  RUSH_COMBO:     "RUSH_COMBO",
  DODGE:          "DODGE",
  BLOCK:          "BLOCK",
  BLOCK_IDLE:     "BLOCK_IDLE",
  HURT:           "HURT",
  KNOCKBACK:      "KNOCKBACK",
  DEATH:          "DEATH",
  VICTORY:        "VICTORY",
  // Mixamo combat variants — heavy
  ATTACK_HEAVY_ALT_1: "ATTACK_HEAVY_ALT_1",
  ATTACK_HEAVY_ALT_2: "ATTACK_HEAVY_ALT_2",
  ATTACK_HEAVY_ALT_3: "ATTACK_HEAVY_ALT_3",
  ATTACK_HEAVY_ALT_4: "ATTACK_HEAVY_ALT_4",
  ATTACK_HEAVY_ALT_5: "ATTACK_HEAVY_ALT_5",
  // Mixamo combat variants — light
  ATTACK_LIGHT_ALT_1: "ATTACK_LIGHT_ALT_1",
  ATTACK_LIGHT_ALT_2: "ATTACK_LIGHT_ALT_2",
  ATTACK_LIGHT_ALT_3: "ATTACK_LIGHT_ALT_3",
  ATTACK_LIGHT_ALT_4: "ATTACK_LIGHT_ALT_4",
  ATTACK_LIGHT_ALT_5: "ATTACK_LIGHT_ALT_5",
  // Mixamo throw attacks
  ATTACK_THROW_1: "ATTACK_THROW_1",
  ATTACK_THROW_2: "ATTACK_THROW_2",
  ATTACK_THROW_3: "ATTACK_THROW_3",
  // Mixamo hit-reaction variants
  HIT_REACT_ALT_1: "HIT_REACT_ALT_1",
  HIT_REACT_ALT_2: "HIT_REACT_ALT_2",
  HIT_REACT_ALT_3: "HIT_REACT_ALT_3",
  HIT_REACT_ALT_4: "HIT_REACT_ALT_4",
  HIT_REACT_ALT_5: "HIT_REACT_ALT_5",
  HIT_REACT_ALT_6: "HIT_REACT_ALT_6",
  HIT_REACT_ALT_7: "HIT_REACT_ALT_7",
  HIT_REACT_ALT_8: "HIT_REACT_ALT_8",
  HIT_REACT_ALT_9: "HIT_REACT_ALT_9",
  // Mixamo victory variant
  VICTORY_ALT_1: "VICTORY_ALT_1",
  // Combat — sword stance
  SWORD_WITHDRAW:   "SWORD_WITHDRAW",
  SWORD_SHEATHE:    "SWORD_SHEATHE",
  SWORD_SLASH_1:    "SWORD_SLASH_1",
  SWORD_SLASH_2:    "SWORD_SLASH_2",
  SWORD_HEAVY:      "SWORD_HEAVY",
  SWORD_JUMP_ATK:   "SWORD_JUMP_ATK",
  SWORD_WHIRLWIND:  "SWORD_WHIRLWIND",
  SWORD_SHOCKWAVE:  "SWORD_SHOCKWAVE",
  SWORD_BEAM:       "SWORD_BEAM",
  SWORD_IDLE:       "SWORD_IDLE",
  SWORD_RUN:        "SWORD_RUN",
  SWORD_STRAFE:     "SWORD_STRAFE",
  SWORD_WALK:       "SWORD_WALK",
  SWORD_DEATH:      "SWORD_DEATH",
  // Healing / Support
  HEAL_CAST:    "HEAL_CAST",
  MAGIC_BLAST:  "MAGIC_BLAST",
  TWO_H_CAST:   "TWO_H_CAST",
  // Transformation
  TRANSFORM_BUILDUP: "TRANSFORM_BUILDUP",
  TRANSFORM_BURST:   "TRANSFORM_BURST",
  TRANSFORM_LAND:    "TRANSFORM_LAND",
} as const;

export type AnimStateId = (typeof ANIM_STATE)[keyof typeof ANIM_STATE];
export type StanceType = "MELEE" | "SWORD";

// ─── Default Clip Name Map ────────────────────────────────────────────────────

export const DEFAULT_ANIM_NAMES: Readonly<Record<string, string>> = {
  [ANIM_STATE.IDLE]:              "Idle",
  [ANIM_STATE.WALK]:              "Walking",
  [ANIM_STATE.RUN]:               "running",
  [ANIM_STATE.SPRINT]:            "running",
  [ANIM_STATE.JUMP]:              "jump",
  [ANIM_STATE.BACKFLIP]:          "Backflip",
  [ANIM_STATE.DODGE_LEFT]:        "Dodging Left(1)",
  [ANIM_STATE.DODGE_RIGHT]:       "Dodging Right",
  [ANIM_STATE.STRAFE_L]:          "left strafe",
  [ANIM_STATE.STRAFE_R]:          "right strafe",
  [ANIM_STATE.TURN_L]:            "left turn",
  [ANIM_STATE.TURN_R]:            "right turn",
  [ANIM_STATE.FLY_IDLE]:          "Flying",
  [ANIM_STATE.FLY_MOVE]:          "Flying",
  [ANIM_STATE.FLY_FAST]:          "Flying",
  [ANIM_STATE.LAND]:              "jump",
  [ANIM_STATE.FALL]:              "jump",
  [ANIM_STATE.ATTACK_LIGHT_1]:   "Hook Punch",
  [ANIM_STATE.ATTACK_LIGHT_2]:   "Kicking",
  [ANIM_STATE.ATTACK_LIGHT_3]:   "Uppercut Jab",
  [ANIM_STATE.ATTACK_HEAVY]:     "Quad Punch",
  [ANIM_STATE.KI_CHARGE]:        "Casting Spell",
  [ANIM_STATE.KI_BLAST]:         "Magic Spell Casting",
  [ANIM_STATE.BEAM_CHARGE]:      "Two Hand Spell Casting",
  [ANIM_STATE.BEAM_FIRE]:        "Standing 2H Magic Attack 03",
  [ANIM_STATE.RUSH_COMBO]:       "Punch To Elbow Combo",
  [ANIM_STATE.DODGE]:            "Dodging Right",
  [ANIM_STATE.BLOCK]:            "Inward Block",
  [ANIM_STATE.BLOCK_IDLE]:       "Standing Block Idle",
  [ANIM_STATE.HURT]:             "Dodging Left(1)",
  [ANIM_STATE.KNOCKBACK]:        "Dodging Left(1)",
  [ANIM_STATE.DEATH]:            "Dying",
  [ANIM_STATE.VICTORY]:          "Backflip",
  // Mixamo heavy
  [ANIM_STATE.ATTACK_HEAVY_ALT_1]: "Mixamo_bash_mixamo_Motion",
  [ANIM_STATE.ATTACK_HEAVY_ALT_2]: "Mixamo_hell_slammer_A_mixamo_Motion",
  [ANIM_STATE.ATTACK_HEAVY_ALT_3]: "Mixamo_hell_slammer_B_mixamo_Motion",
  [ANIM_STATE.ATTACK_HEAVY_ALT_4]: "Mixamo_heavy_weapon_swing_mixamo_Motion",
  [ANIM_STATE.ATTACK_HEAVY_ALT_5]: "Mixamo_smash_mixamo_Motion",
  // Mixamo light
  [ANIM_STATE.ATTACK_LIGHT_ALT_1]: "Mixamo_leg_sweep_mixamo_Motion",
  [ANIM_STATE.ATTACK_LIGHT_ALT_2]: "Mixamo_side_hit_mixamo_Motion",
  [ANIM_STATE.ATTACK_LIGHT_ALT_3]: "Mixamo_stomp_mixamo_Motion",
  [ANIM_STATE.ATTACK_LIGHT_ALT_4]: "Mixamo_stomping_mixamo_Motion",
  [ANIM_STATE.ATTACK_LIGHT_ALT_5]: "Mixamo_upward_thrust_mixamo_Motion",
  // Mixamo throw
  [ANIM_STATE.ATTACK_THROW_1]:     "Mixamo_throw_mixamo_Motion",
  [ANIM_STATE.ATTACK_THROW_2]:     "Mixamo_throwing_mixamo_Motion",
  [ANIM_STATE.ATTACK_THROW_3]:     "Mixamo_throw_object_mixamo_Motion",
  // Mixamo hit reactions
  [ANIM_STATE.HIT_REACT_ALT_1]:   "Mixamo_big_kidney_hit_mixamo_Motion",
  [ANIM_STATE.HIT_REACT_ALT_2]:   "Mixamo_big_side_hit_mixamo_Motion",
  [ANIM_STATE.HIT_REACT_ALT_3]:   "Mixamo_head_hit_mixamo_Motion",
  [ANIM_STATE.HIT_REACT_ALT_4]:   "Mixamo_hit_on_back_of_head_mixamo_Motion",
  [ANIM_STATE.HIT_REACT_ALT_5]:   "Mixamo_hit_on_legs_mixamo_Motion",
  [ANIM_STATE.HIT_REACT_ALT_6]:   "Mixamo_hit_on_side_of_body_mixamo_Motion",
  [ANIM_STATE.HIT_REACT_ALT_7]:   "Mixamo_hit_on_side_of_head_mixamo_Motion",
  [ANIM_STATE.HIT_REACT_ALT_8]:   "Mixamo_hit_on_the_back_mixamo_Motion",
  [ANIM_STATE.HIT_REACT_ALT_9]:   "Mixamo_kidney_hit_mixamo_Motion",
  // Mixamo victory
  [ANIM_STATE.VICTORY_ALT_1]:     "Mixamo_fist_pump_mixamo_Motion",
  // Sword stance
  [ANIM_STATE.SWORD_WITHDRAW]:   "Withdrawing Sword",
  [ANIM_STATE.SWORD_SHEATHE]:    "Sheathing Sword",
  [ANIM_STATE.SWORD_SLASH_1]:    "Great Sword Slash",
  [ANIM_STATE.SWORD_SLASH_2]:    "Stable Sword In Slash",
  [ANIM_STATE.SWORD_HEAVY]:      "Stable Sword Out Slash",
  [ANIM_STATE.SWORD_JUMP_ATK]:   "Great Sword Jump Attack",
  [ANIM_STATE.SWORD_WHIRLWIND]:  "Great Sword Slash Whirlwind",
  [ANIM_STATE.SWORD_SHOCKWAVE]:  "Stable Sword Outward ShockwaveSlash",
  [ANIM_STATE.SWORD_BEAM]:       "casting spell with one hand sword in the other hand",
  [ANIM_STATE.SWORD_IDLE]:       "Idle",
  [ANIM_STATE.SWORD_RUN]:        "Run With Sword",
  [ANIM_STATE.SWORD_STRAFE]:     "Great Sword Strafe",
  [ANIM_STATE.SWORD_WALK]:       "Great Sword Walk",
  [ANIM_STATE.SWORD_DEATH]:      "Two Handed Sword Death",
  // Healing / support
  [ANIM_STATE.HEAL_CAST]:        "Magic Heal",
  [ANIM_STATE.MAGIC_BLAST]:      "Magic Spell Casting",
  [ANIM_STATE.TWO_H_CAST]:       "Two Hand Spell Casting",
  // Transformation
  [ANIM_STATE.TRANSFORM_BUILDUP]:"Casting Spell",
  [ANIM_STATE.TRANSFORM_BURST]:  "Standing 2H Magic Attack 03",
  [ANIM_STATE.TRANSFORM_LAND]:   "jump",
};

// ─── Per-Character Overrides ──────────────────────────────────────────────────

export const CHARACTER_ANIM_OVERRIDES: Readonly<Record<string, Record<string, string>>> = {
  PICCOLO: {
    [ANIM_STATE.KI_BLAST]:    "Magic Spell Casting",
    [ANIM_STATE.BEAM_CHARGE]: "Two Hand Spell Casting",
    [ANIM_STATE.BEAM_FIRE]:   "Standing 2H Magic Attack 03",
  },
  GOHAN: {
    [ANIM_STATE.KI_BLAST]:    "Magic Spell Casting",
    [ANIM_STATE.BEAM_CHARGE]: "Two Hand Spell Casting",
    [ANIM_STATE.BEAM_FIRE]:   "Standing 2H Magic Attack 03",
  },
  AYO: {
    [ANIM_STATE.ATTACK_LIGHT_1]: "Hook Punch",
    [ANIM_STATE.ATTACK_HEAVY]:   "Hurricane Kick",
    [ANIM_STATE.RUSH_COMBO]:     "Mma Kick",
    [ANIM_STATE.BEAM_FIRE]:      "aura boomerang",
  },
  HANA: {
    [ANIM_STATE.ATTACK_LIGHT_1]: "Hook Punch",
    [ANIM_STATE.ATTACK_LIGHT_2]: "Kicking",
    [ANIM_STATE.KI_BLAST]:       "Magic Heal",
    [ANIM_STATE.BEAM_FIRE]:      "Two Hand Spell Casting",
    [ANIM_STATE.RUSH_COMBO]:     "Punch To Elbow Combo",
  },
  RAYNE: {
    [ANIM_STATE.ATTACK_LIGHT_1]: "Hurricane Kick",
    [ANIM_STATE.ATTACK_LIGHT_2]: "Mma Kick",
    [ANIM_STATE.ATTACK_LIGHT_3]: "Kicking",
    [ANIM_STATE.ATTACK_HEAVY]:   "Punch To Elbow Combo",
    [ANIM_STATE.RUSH_COMBO]:     "Quad Punch",
    [ANIM_STATE.BEAM_FIRE]:      "Quad Punch",
  },
};

// ─── Retarget State Lists ─────────────────────────────────────────────────────

export const BASE_RETARGET_STATES: readonly string[] = [
  ANIM_STATE.IDLE, ANIM_STATE.WALK, ANIM_STATE.RUN, ANIM_STATE.SPRINT,
  ANIM_STATE.JUMP, ANIM_STATE.BACKFLIP,
  ANIM_STATE.DODGE_LEFT, ANIM_STATE.DODGE_RIGHT,
  ANIM_STATE.STRAFE_L, ANIM_STATE.STRAFE_R,
  ANIM_STATE.TURN_L, ANIM_STATE.TURN_R,
  ANIM_STATE.FLY_IDLE, ANIM_STATE.FLY_MOVE, ANIM_STATE.FLY_FAST,
  ANIM_STATE.ATTACK_LIGHT_1, ANIM_STATE.ATTACK_LIGHT_2, ANIM_STATE.ATTACK_LIGHT_3,
  ANIM_STATE.ATTACK_HEAVY,
  ANIM_STATE.KI_CHARGE, ANIM_STATE.KI_BLAST,
  ANIM_STATE.BEAM_CHARGE, ANIM_STATE.BEAM_FIRE,
  ANIM_STATE.RUSH_COMBO,
  ANIM_STATE.BLOCK, ANIM_STATE.BLOCK_IDLE,
  ANIM_STATE.HURT, ANIM_STATE.KNOCKBACK,
  ANIM_STATE.DEATH, ANIM_STATE.VICTORY,
  ANIM_STATE.ATTACK_HEAVY_ALT_1, ANIM_STATE.ATTACK_HEAVY_ALT_2,
  ANIM_STATE.ATTACK_HEAVY_ALT_3, ANIM_STATE.ATTACK_HEAVY_ALT_4,
  ANIM_STATE.ATTACK_HEAVY_ALT_5,
  ANIM_STATE.ATTACK_LIGHT_ALT_1, ANIM_STATE.ATTACK_LIGHT_ALT_2,
  ANIM_STATE.ATTACK_LIGHT_ALT_3, ANIM_STATE.ATTACK_LIGHT_ALT_4,
  ANIM_STATE.ATTACK_LIGHT_ALT_5,
  ANIM_STATE.ATTACK_THROW_1, ANIM_STATE.ATTACK_THROW_2, ANIM_STATE.ATTACK_THROW_3,
  ANIM_STATE.HIT_REACT_ALT_1, ANIM_STATE.HIT_REACT_ALT_2, ANIM_STATE.HIT_REACT_ALT_3,
  ANIM_STATE.HIT_REACT_ALT_4, ANIM_STATE.HIT_REACT_ALT_5, ANIM_STATE.HIT_REACT_ALT_6,
  ANIM_STATE.HIT_REACT_ALT_7, ANIM_STATE.HIT_REACT_ALT_8, ANIM_STATE.HIT_REACT_ALT_9,
  ANIM_STATE.VICTORY_ALT_1,
];

export const SWORD_RETARGET_STATES: readonly string[] = [
  ANIM_STATE.SWORD_WITHDRAW, ANIM_STATE.SWORD_SHEATHE,
  ANIM_STATE.SWORD_SLASH_1, ANIM_STATE.SWORD_SLASH_2,
  ANIM_STATE.SWORD_HEAVY, ANIM_STATE.SWORD_JUMP_ATK,
  ANIM_STATE.SWORD_WHIRLWIND, ANIM_STATE.SWORD_SHOCKWAVE,
  ANIM_STATE.SWORD_BEAM, ANIM_STATE.SWORD_IDLE, ANIM_STATE.SWORD_RUN,
  ANIM_STATE.SWORD_STRAFE, ANIM_STATE.SWORD_WALK,
  ANIM_STATE.SWORD_DEATH,
];

export const SUPPORT_RETARGET_STATES: readonly string[] = [
  ANIM_STATE.HEAL_CAST,
  ANIM_STATE.MAGIC_BLAST,
  ANIM_STATE.TWO_H_CAST,
];

// ─── Clip → Asset ID Map ─────────────────────────────────────────────────────

export const CLIP_ASSET_IDS: Readonly<Record<string, string>> = {
  "Idle": "anim_idle",
  "pistol idle": "anim_pistol_idle",
  "Walking": "anim_walk",
  "running": "anim_run",
  "jump": "anim_jump",
  "Backflip": "anim_backflip",
  "Dodging Left(1)": "anim_dodge_left",
  "Dodging Right": "anim_dodge_right",
  "left strafe": "anim_strafe_l",
  "right strafe": "anim_strafe_r",
  "left turn": "anim_turn_l",
  "right turn": "anim_turn_r",
  "Flying": "anim_fly",
  "Hook Punch": "anim_hook_punch",
  "Hurricane Kick": "anim_hurricane_kick",
  "Kicking": "anim_kicking",
  "Mma Kick": "anim_mma_kick",
  "Punch To Elbow Combo": "anim_elbow_combo",
  "Quad Punch": "anim_quad_punch",
  "Uppercut Jab": "anim_uppercut",
  "Casting Spell": "anim_cast_spell",
  "Magic Heal": "anim_magic_heal",
  "Magic Spell Casting": "anim_magic_cast",
  "Two Hand Spell Casting": "anim_two_hand_spell",
  "aura boomerang": "anim_aura_boomerang",
  "Standing 2H Magic Attack 03": "anim_2h_magic_atk",
  "Standing Block Idle": "anim_block_idle",
  "Inward Block": "anim_inward_block",
  "Dying": "anim_death_3",
  "Withdrawing Sword": "anim_sw_withdraw",
  "Sheathing Sword": "anim_sw_sheathe",
  "Great Sword Slash": "anim_sw_slash",
  "Stable Sword In Slash": "anim_sw_in_slash",
  "Stable Sword Out Slash": "anim_sw_out_slash",
  "Great Sword Jump Attack": "anim_sw_jump_atk",
  "Great Sword Slash Whilrwind": "anim_sw_whirlwind",
  "Great Sword Slash Whirlwind": "anim_sw_whirlwind",
  "Stable Sword Outward ShockwaveSlash": "anim_sw_outward_shock",
  "casting spell with one hand sword in the other hand": "anim_sw_cast",
  "Spell cast with Sword": "anim_spell_sword",
  "Run With Sword": "anim_sw_run",
  "Great Sword Strafe": "anim_sw_strafe",
  "Great Sword Walk": "anim_sw_walk",
  "Two Handed Sword Death": "anim_sw_death",
  // Mixamo combat packs
  "Mixamo_bash_mixamo_Motion":                "anim_mx_bash",
  "Mixamo_hell_slammer_A_mixamo_Motion":      "anim_mx_hell_slammer_a",
  "Mixamo_hell_slammer_B_mixamo_Motion":      "anim_mx_hell_slammer_b",
  "Mixamo_heavy_weapon_swing_mixamo_Motion":  "anim_mx_heavy_weapon_swing",
  "Mixamo_smash_mixamo_Motion":               "anim_mx_smash",
  "Mixamo_leg_sweep_mixamo_Motion":           "anim_mx_leg_sweep",
  "Mixamo_side_hit_mixamo_Motion":            "anim_mx_side_hit",
  "Mixamo_stomp_mixamo_Motion":               "anim_mx_stomp",
  "Mixamo_stomping_mixamo_Motion":            "anim_mx_stomping",
  "Mixamo_upward_thrust_mixamo_Motion":       "anim_mx_upward_thrust",
  "Mixamo_throw_mixamo_Motion":               "anim_mx_throw",
  "Mixamo_throwing_mixamo_Motion":            "anim_mx_throwing",
  "Mixamo_throw_object_mixamo_Motion":        "anim_mx_throw_object",
  "Mixamo_big_kidney_hit_mixamo_Motion":      "anim_mx_big_kidney_hit",
  "Mixamo_big_side_hit_mixamo_Motion":        "anim_mx_big_side_hit",
  "Mixamo_head_hit_mixamo_Motion":            "anim_mx_head_hit",
  "Mixamo_hit_on_back_of_head_mixamo_Motion": "anim_mx_hit_back_of_head",
  "Mixamo_hit_on_legs_mixamo_Motion":         "anim_mx_hit_on_legs",
  "Mixamo_hit_on_side_of_body_mixamo_Motion": "anim_mx_hit_side_body",
  "Mixamo_hit_on_side_of_head_mixamo_Motion": "anim_mx_hit_side_head",
  "Mixamo_hit_on_the_back_mixamo_Motion":     "anim_mx_hit_on_back",
  "Mixamo_kidney_hit_mixamo_Motion":          "anim_mx_kidney_hit",
  "Mixamo_fist_pump_mixamo_Motion":           "anim_mx_fist_pump",
};

export const KNOWN_CLIP_NAMES: ReadonlySet<string> = new Set(Object.keys(CLIP_ASSET_IDS));

const MAX_LOGGED_FALLBACKS = 1024;

// ─── Fallback Logging ─────────────────────────────────────────────────────────

const loggedAnimFallbacks = new Set<string>();

export function logAnimFallback(
  characterId: string,
  stateId: string,
  missingClip: string,
  fallbackClip: string | null = null,
): void {
  if (loggedAnimFallbacks.size >= MAX_LOGGED_FALLBACKS) {
    loggedAnimFallbacks.clear();
  }
  const key = `${characterId}:${stateId}:${missingClip}:${fallbackClip ?? "none"}`;
  if (loggedAnimFallbacks.has(key)) return;
  loggedAnimFallbacks.add(key);

  if (fallbackClip) {
    console.warn(
      `[AnimationController] Missing clip override for ${characterId}.${stateId}: "${missingClip}". Falling back to "${fallbackClip}".`,
    );
    return;
  }
  console.warn(
    `[AnimationController] Missing clip mapping for ${characterId}.${stateId}: "${missingClip}".`,
  );
}

// ─── Build Animation Name Map ─────────────────────────────────────────────────

export function buildAnimationNameMap(
  characterId: string,
  stance: StanceType = "MELEE",
): Record<string, string> {
  const baseMap: Record<string, string> = {
    ...DEFAULT_ANIM_NAMES,
    ...(CHARACTER_ANIM_OVERRIDES[characterId] ?? {}),
  };

  if (stance === "SWORD") {
    Object.assign(baseMap, {
      [ANIM_STATE.IDLE]:           DEFAULT_ANIM_NAMES[ANIM_STATE.SWORD_IDLE] ?? DEFAULT_ANIM_NAMES[ANIM_STATE.IDLE],
      [ANIM_STATE.RUN]:            DEFAULT_ANIM_NAMES[ANIM_STATE.SWORD_RUN],
      [ANIM_STATE.SPRINT]:         DEFAULT_ANIM_NAMES[ANIM_STATE.SWORD_RUN],
      [ANIM_STATE.WALK]:           DEFAULT_ANIM_NAMES[ANIM_STATE.SWORD_WALK],
      [ANIM_STATE.STRAFE_L]:       DEFAULT_ANIM_NAMES[ANIM_STATE.SWORD_STRAFE],
      [ANIM_STATE.STRAFE_R]:       DEFAULT_ANIM_NAMES[ANIM_STATE.SWORD_STRAFE],
      [ANIM_STATE.ATTACK_LIGHT_1]: DEFAULT_ANIM_NAMES[ANIM_STATE.SWORD_SLASH_1],
      [ANIM_STATE.ATTACK_LIGHT_2]: DEFAULT_ANIM_NAMES[ANIM_STATE.SWORD_SLASH_2],
      [ANIM_STATE.ATTACK_HEAVY]:   DEFAULT_ANIM_NAMES[ANIM_STATE.SWORD_HEAVY],
      [ANIM_STATE.RUSH_COMBO]:     DEFAULT_ANIM_NAMES[ANIM_STATE.SWORD_JUMP_ATK],
      [ANIM_STATE.BEAM_FIRE]:      DEFAULT_ANIM_NAMES[ANIM_STATE.SWORD_BEAM],
      [ANIM_STATE.KI_BLAST]:       DEFAULT_ANIM_NAMES[ANIM_STATE.SWORD_SHOCKWAVE],
      [ANIM_STATE.DEATH]:          DEFAULT_ANIM_NAMES[ANIM_STATE.SWORD_DEATH],
    });
  }

  const resolvedMap: Record<string, string> = {};
  for (const [stateId, clipName] of Object.entries(baseMap)) {
    if (clipName && KNOWN_CLIP_NAMES.has(clipName)) {
      resolvedMap[stateId] = clipName;
      continue;
    }
    const fallbackClip = DEFAULT_ANIM_NAMES[stateId];
    if (fallbackClip && KNOWN_CLIP_NAMES.has(fallbackClip)) {
      if (clipName && clipName !== fallbackClip) {
        logAnimFallback(characterId, stateId, clipName, fallbackClip);
      }
      resolvedMap[stateId] = fallbackClip;
      continue;
    }
    if (clipName) {
      logAnimFallback(characterId, stateId, clipName);
    }
  }

  return resolvedMap;
}

// ─── Normalize Target Name ────────────────────────────────────────────────────

import { normalizeTargetName } from "../utils/animationUtils.js";

export { normalizeTargetName };

function warnOnFallbackCycles(
  fallbackMap: Readonly<Record<string, readonly string[]>>,
): void {
  const warnedStates = new Set<string>();
  const visit = (stateId: string, stack: string[]): void => {
    const cycleStart = stack.indexOf(stateId);
    if (cycleStart >= 0) {
      const cycle = [...stack.slice(cycleStart), stateId];
      const cycleKey = cycle.join(" -> ");
      if (!warnedStates.has(cycleKey)) {
        warnedStates.add(cycleKey);
        console.warn(
          `[AnimationData] Cyclic state fallback chain detected: ${cycleKey}. Keep _resolveAvailableState non-recursive unless this graph is fixed.`,
        );
      }
      return;
    }

    const nextStack = [...stack, stateId];
    for (const nextState of fallbackMap[stateId] ?? []) {
      visit(nextState, nextStack);
    }
  };

  for (const stateId of Object.keys(fallbackMap)) {
    visit(stateId, []);
  }
}

// ─── State Fallback Chains ────────────────────────────────────────────────────

export const STATE_FALLBACKS: Readonly<Record<string, readonly string[]>> = {
  [ANIM_STATE.RUN]: [
    ANIM_STATE.WALK, ANIM_STATE.IDLE,
  ],
  [ANIM_STATE.SPRINT]: [
    ANIM_STATE.RUN, ANIM_STATE.WALK, ANIM_STATE.IDLE,
  ],
  [ANIM_STATE.STRAFE_L]: [
    ANIM_STATE.RUN, ANIM_STATE.WALK, ANIM_STATE.IDLE,
  ],
  [ANIM_STATE.STRAFE_R]: [
    ANIM_STATE.RUN, ANIM_STATE.WALK, ANIM_STATE.IDLE,
  ],
  [ANIM_STATE.ATTACK_LIGHT_1]: [
    ANIM_STATE.ATTACK_LIGHT_2, ANIM_STATE.ATTACK_LIGHT_3,
    ANIM_STATE.ATTACK_LIGHT_ALT_1, ANIM_STATE.ATTACK_LIGHT_ALT_2,
    ANIM_STATE.ATTACK_LIGHT_ALT_3, ANIM_STATE.ATTACK_LIGHT_ALT_4,
    ANIM_STATE.ATTACK_LIGHT_ALT_5,
    ANIM_STATE.IDLE,
  ],
  [ANIM_STATE.ATTACK_LIGHT_2]: [
    ANIM_STATE.ATTACK_LIGHT_3,
    ANIM_STATE.ATTACK_LIGHT_ALT_1, ANIM_STATE.ATTACK_LIGHT_ALT_2,
    ANIM_STATE.ATTACK_LIGHT_ALT_3, ANIM_STATE.ATTACK_LIGHT_ALT_4,
    ANIM_STATE.ATTACK_LIGHT_ALT_5,
    ANIM_STATE.IDLE,
  ],
  [ANIM_STATE.ATTACK_LIGHT_3]: [
    ANIM_STATE.ATTACK_LIGHT_ALT_1, ANIM_STATE.ATTACK_LIGHT_ALT_2,
    ANIM_STATE.ATTACK_LIGHT_ALT_3, ANIM_STATE.ATTACK_LIGHT_ALT_4,
    ANIM_STATE.ATTACK_LIGHT_ALT_5,
    ANIM_STATE.IDLE,
  ],
  [ANIM_STATE.ATTACK_HEAVY]: [
    ANIM_STATE.ATTACK_HEAVY_ALT_1, ANIM_STATE.ATTACK_HEAVY_ALT_2,
    ANIM_STATE.ATTACK_HEAVY_ALT_3, ANIM_STATE.ATTACK_HEAVY_ALT_4,
    ANIM_STATE.ATTACK_HEAVY_ALT_5,
    ANIM_STATE.ATTACK_LIGHT_ALT_5, ANIM_STATE.IDLE,
  ],
  [ANIM_STATE.RUSH_COMBO]: [
    ANIM_STATE.ATTACK_HEAVY_ALT_1, ANIM_STATE.ATTACK_HEAVY_ALT_2,
    ANIM_STATE.ATTACK_LIGHT_ALT_3, ANIM_STATE.ATTACK_LIGHT_ALT_5,
    ANIM_STATE.IDLE,
  ],
  [ANIM_STATE.ATTACK_THROW_1]: [
    ANIM_STATE.ATTACK_THROW_2, ANIM_STATE.ATTACK_THROW_3,
    ANIM_STATE.ATTACK_HEAVY_ALT_1, ANIM_STATE.ATTACK_HEAVY,
    ANIM_STATE.ATTACK_LIGHT_1,
  ],
  [ANIM_STATE.ATTACK_THROW_2]: [
    ANIM_STATE.ATTACK_THROW_3,
    ANIM_STATE.ATTACK_HEAVY_ALT_1, ANIM_STATE.ATTACK_HEAVY,
    ANIM_STATE.ATTACK_LIGHT_1,
  ],
  [ANIM_STATE.ATTACK_THROW_3]: [
    ANIM_STATE.ATTACK_HEAVY_ALT_1, ANIM_STATE.ATTACK_HEAVY,
    ANIM_STATE.ATTACK_LIGHT_1,
  ],
  [ANIM_STATE.KI_BLAST]: [
    ANIM_STATE.ATTACK_HEAVY, ANIM_STATE.ATTACK_LIGHT_1, ANIM_STATE.IDLE,
  ],
  [ANIM_STATE.BEAM_CHARGE]: [
    ANIM_STATE.KI_CHARGE, ANIM_STATE.BLOCK_IDLE, ANIM_STATE.IDLE,
  ],
  [ANIM_STATE.BEAM_FIRE]: [
    ANIM_STATE.KI_BLAST, ANIM_STATE.ATTACK_HEAVY,
    ANIM_STATE.ATTACK_LIGHT_1, ANIM_STATE.IDLE,
  ],
  [ANIM_STATE.KI_CHARGE]: [
    ANIM_STATE.BLOCK_IDLE, ANIM_STATE.IDLE,
  ],
  [ANIM_STATE.BLOCK]: [
    ANIM_STATE.BLOCK_IDLE, ANIM_STATE.HURT, ANIM_STATE.IDLE,
  ],
  [ANIM_STATE.BLOCK_IDLE]: [
    ANIM_STATE.BLOCK, ANIM_STATE.IDLE,
  ],
  [ANIM_STATE.HURT]: [
    ANIM_STATE.HIT_REACT_ALT_1, ANIM_STATE.HIT_REACT_ALT_2,
    ANIM_STATE.HIT_REACT_ALT_3, ANIM_STATE.HIT_REACT_ALT_4,
    ANIM_STATE.HIT_REACT_ALT_5, ANIM_STATE.HIT_REACT_ALT_6,
    ANIM_STATE.HIT_REACT_ALT_7, ANIM_STATE.HIT_REACT_ALT_8,
    ANIM_STATE.HIT_REACT_ALT_9,
    ANIM_STATE.KNOCKBACK, ANIM_STATE.IDLE,
  ],
  [ANIM_STATE.KNOCKBACK]: [
    ANIM_STATE.FALL,
    ANIM_STATE.HIT_REACT_ALT_1, ANIM_STATE.HIT_REACT_ALT_2,
    ANIM_STATE.HIT_REACT_ALT_3, ANIM_STATE.IDLE,
  ],
  [ANIM_STATE.DEATH]: [
    ANIM_STATE.SWORD_DEATH, ANIM_STATE.KNOCKBACK, ANIM_STATE.HURT,
  ],
  [ANIM_STATE.VICTORY]: [
    ANIM_STATE.VICTORY_ALT_1, ANIM_STATE.BACKFLIP, ANIM_STATE.IDLE,
  ],
  [ANIM_STATE.TRANSFORM_BUILDUP]: [
    ANIM_STATE.KI_CHARGE, ANIM_STATE.BEAM_CHARGE, ANIM_STATE.IDLE,
  ],
  [ANIM_STATE.TRANSFORM_BURST]: [
    ANIM_STATE.BEAM_FIRE, ANIM_STATE.KI_BLAST, ANIM_STATE.ATTACK_HEAVY,
  ],
  [ANIM_STATE.TRANSFORM_LAND]: [
    ANIM_STATE.JUMP, ANIM_STATE.FALL, ANIM_STATE.IDLE,
  ],
};

// ─── Blend Times ──────────────────────────────────────────────────────────────

export const BLEND_TIMES: Readonly<Record<string, number>> = {
  [ANIM_STATE.IDLE]:             0.25,
  [ANIM_STATE.RUN]:              0.15,
  [ANIM_STATE.SPRINT]:           0.12,
  [ANIM_STATE.FLY_IDLE]:         0.30,
  [ANIM_STATE.FLY_MOVE]:         0.20,
  [ANIM_STATE.FLY_FAST]:         0.15,
  [ANIM_STATE.LAND]:             0.08,
  [ANIM_STATE.FALL]:             0.20,
  [ANIM_STATE.ATTACK_LIGHT_1]:   0.06,
  [ANIM_STATE.ATTACK_LIGHT_2]:   0.04,
  [ANIM_STATE.ATTACK_LIGHT_3]:   0.04,
  [ANIM_STATE.ATTACK_HEAVY]:     0.08,
  [ANIM_STATE.KI_CHARGE]:        0.20,
  [ANIM_STATE.KI_BLAST]:         0.06,
  [ANIM_STATE.BEAM_CHARGE]:      0.25,
  [ANIM_STATE.BEAM_FIRE]:        0.05,
  [ANIM_STATE.RUSH_COMBO]:       0.05,
  [ANIM_STATE.DODGE]:            0.04,
  [ANIM_STATE.BLOCK]:            0.12,
  [ANIM_STATE.HURT]:             0.05,
  [ANIM_STATE.KNOCKBACK]:        0.05,
  [ANIM_STATE.DEATH]:            0.08,
  [ANIM_STATE.VICTORY]:          0.25,
  [ANIM_STATE.TRANSFORM_BUILDUP]: 0.10,
  [ANIM_STATE.TRANSFORM_BURST]:   0.02,
  [ANIM_STATE.TRANSFORM_LAND]:    0.10,
  [ANIM_STATE.ATTACK_HEAVY_ALT_1]: 0.07,
  [ANIM_STATE.ATTACK_HEAVY_ALT_2]: 0.05,
  [ANIM_STATE.ATTACK_HEAVY_ALT_3]: 0.05,
  [ANIM_STATE.ATTACK_HEAVY_ALT_4]: 0.08,
  [ANIM_STATE.ATTACK_HEAVY_ALT_5]: 0.06,
  [ANIM_STATE.ATTACK_LIGHT_ALT_1]: 0.05,
  [ANIM_STATE.ATTACK_LIGHT_ALT_2]: 0.04,
  [ANIM_STATE.ATTACK_LIGHT_ALT_3]: 0.05,
  [ANIM_STATE.ATTACK_LIGHT_ALT_4]: 0.04,
  [ANIM_STATE.ATTACK_LIGHT_ALT_5]: 0.06,
  [ANIM_STATE.ATTACK_THROW_1]:     0.08,
  [ANIM_STATE.ATTACK_THROW_2]:     0.08,
  [ANIM_STATE.ATTACK_THROW_3]:     0.08,
  [ANIM_STATE.HIT_REACT_ALT_1]:   0.05,
  [ANIM_STATE.HIT_REACT_ALT_2]:   0.05,
  [ANIM_STATE.HIT_REACT_ALT_3]:   0.05,
  [ANIM_STATE.HIT_REACT_ALT_4]:   0.05,
  [ANIM_STATE.HIT_REACT_ALT_5]:   0.05,
  [ANIM_STATE.HIT_REACT_ALT_6]:   0.05,
  [ANIM_STATE.HIT_REACT_ALT_7]:   0.05,
  [ANIM_STATE.HIT_REACT_ALT_8]:   0.05,
  [ANIM_STATE.HIT_REACT_ALT_9]:   0.05,
  [ANIM_STATE.VICTORY_ALT_1]:     0.20,
};

// ─── Attack Durations ─────────────────────────────────────────────────────────

export const ATTACK_DURATIONS: Readonly<Record<string, number>> = {
  [ANIM_STATE.ATTACK_LIGHT_1]:  0.35,
  [ANIM_STATE.ATTACK_LIGHT_2]:  0.33,
  [ANIM_STATE.ATTACK_LIGHT_3]:  0.38,
  [ANIM_STATE.ATTACK_HEAVY]:    0.55,
  [ANIM_STATE.ATTACK_HEAVY_ALT_1]: 0.50,
  [ANIM_STATE.ATTACK_HEAVY_ALT_2]: 0.55,
  [ANIM_STATE.ATTACK_HEAVY_ALT_3]: 0.55,
  [ANIM_STATE.ATTACK_HEAVY_ALT_4]: 0.60,
  [ANIM_STATE.ATTACK_HEAVY_ALT_5]: 0.50,
  [ANIM_STATE.ATTACK_LIGHT_ALT_1]: 0.38,
  [ANIM_STATE.ATTACK_LIGHT_ALT_2]: 0.33,
  [ANIM_STATE.ATTACK_LIGHT_ALT_3]: 0.35,
  [ANIM_STATE.ATTACK_LIGHT_ALT_4]: 0.35,
  [ANIM_STATE.ATTACK_LIGHT_ALT_5]: 0.40,
  [ANIM_STATE.ATTACK_THROW_1]:     0.50,
  [ANIM_STATE.ATTACK_THROW_2]:     0.50,
  [ANIM_STATE.ATTACK_THROW_3]:     0.50,
  [ANIM_STATE.SWORD_SLASH_1]:  0.40,
  [ANIM_STATE.SWORD_SLASH_2]:  0.38,
  [ANIM_STATE.SWORD_HEAVY]:    0.55,
  [ANIM_STATE.SWORD_JUMP_ATK]: 0.60,
  [ANIM_STATE.SWORD_WHIRLWIND]:0.65,
  [ANIM_STATE.SWORD_SHOCKWAVE]:0.50,
  [ANIM_STATE.SWORD_BEAM]:     0.80,
  [ANIM_STATE.BLOCK]:              0.20,
  [ANIM_STATE.HURT]:               0.25,
  [ANIM_STATE.KNOCKBACK]:          0.45,
  [ANIM_STATE.DODGE]:              0.22,
  [ANIM_STATE.VICTORY]:            1.00,
  [ANIM_STATE.VICTORY_ALT_1]:      1.00,
  [ANIM_STATE.KI_BLAST]:           0.40,
  [ANIM_STATE.BEAM_FIRE]:          0.80,
  [ANIM_STATE.RUSH_COMBO]:         0.70,
  [ANIM_STATE.TRANSFORM_BUILDUP]:  1.80,
  [ANIM_STATE.TRANSFORM_BURST]:    0.60,
  [ANIM_STATE.TRANSFORM_LAND]:     0.50,
};

// ─── State Classification Sets ────────────────────────────────────────────────

export const NON_LOOPING_STATES: ReadonlySet<string> = new Set([
  ANIM_STATE.ATTACK_LIGHT_1, ANIM_STATE.ATTACK_LIGHT_2, ANIM_STATE.ATTACK_LIGHT_3,
  ANIM_STATE.ATTACK_HEAVY, ANIM_STATE.KI_BLAST,
  ANIM_STATE.BEAM_FIRE, ANIM_STATE.RUSH_COMBO,
  ANIM_STATE.DODGE, ANIM_STATE.DODGE_LEFT, ANIM_STATE.DODGE_RIGHT, ANIM_STATE.HURT,
  ANIM_STATE.KNOCKBACK, ANIM_STATE.DEATH,
  ANIM_STATE.VICTORY, ANIM_STATE.LAND, ANIM_STATE.BACKFLIP,
  ANIM_STATE.SWORD_WITHDRAW, ANIM_STATE.SWORD_SHEATHE,
  ANIM_STATE.SWORD_SLASH_1, ANIM_STATE.SWORD_SLASH_2,
  ANIM_STATE.SWORD_HEAVY, ANIM_STATE.SWORD_JUMP_ATK,
  ANIM_STATE.SWORD_WHIRLWIND, ANIM_STATE.SWORD_SHOCKWAVE,
  ANIM_STATE.SWORD_BEAM, ANIM_STATE.SWORD_DEATH,
  ANIM_STATE.HEAL_CAST, ANIM_STATE.MAGIC_BLAST, ANIM_STATE.TWO_H_CAST,
  ANIM_STATE.TRANSFORM_BUILDUP, ANIM_STATE.TRANSFORM_BURST, ANIM_STATE.TRANSFORM_LAND,
  ANIM_STATE.ATTACK_HEAVY_ALT_1, ANIM_STATE.ATTACK_HEAVY_ALT_2,
  ANIM_STATE.ATTACK_HEAVY_ALT_3, ANIM_STATE.ATTACK_HEAVY_ALT_4,
  ANIM_STATE.ATTACK_HEAVY_ALT_5,
  ANIM_STATE.ATTACK_LIGHT_ALT_1, ANIM_STATE.ATTACK_LIGHT_ALT_2,
  ANIM_STATE.ATTACK_LIGHT_ALT_3, ANIM_STATE.ATTACK_LIGHT_ALT_4,
  ANIM_STATE.ATTACK_LIGHT_ALT_5,
  ANIM_STATE.ATTACK_THROW_1, ANIM_STATE.ATTACK_THROW_2, ANIM_STATE.ATTACK_THROW_3,
  ANIM_STATE.HIT_REACT_ALT_1, ANIM_STATE.HIT_REACT_ALT_2, ANIM_STATE.HIT_REACT_ALT_3,
  ANIM_STATE.HIT_REACT_ALT_4, ANIM_STATE.HIT_REACT_ALT_5, ANIM_STATE.HIT_REACT_ALT_6,
  ANIM_STATE.HIT_REACT_ALT_7, ANIM_STATE.HIT_REACT_ALT_8, ANIM_STATE.HIT_REACT_ALT_9,
  ANIM_STATE.VICTORY_ALT_1,
]);

export const COMBAT_STATES: ReadonlySet<string> = new Set([
  ANIM_STATE.ATTACK_LIGHT_1, ANIM_STATE.ATTACK_LIGHT_2, ANIM_STATE.ATTACK_LIGHT_3,
  ANIM_STATE.ATTACK_HEAVY, ANIM_STATE.BEAM_CHARGE, ANIM_STATE.BEAM_FIRE,
  ANIM_STATE.KI_BLAST, ANIM_STATE.KI_CHARGE, ANIM_STATE.RUSH_COMBO,
  ANIM_STATE.HURT, ANIM_STATE.KNOCKBACK, ANIM_STATE.DEATH,
  ANIM_STATE.BLOCK, ANIM_STATE.BLOCK_IDLE, ANIM_STATE.DODGE,
  ANIM_STATE.DODGE_LEFT, ANIM_STATE.DODGE_RIGHT,
  ANIM_STATE.VICTORY, ANIM_STATE.VICTORY_ALT_1,
  ANIM_STATE.SWORD_SLASH_1, ANIM_STATE.SWORD_SLASH_2,
  ANIM_STATE.SWORD_HEAVY, ANIM_STATE.SWORD_JUMP_ATK,
  ANIM_STATE.SWORD_WHIRLWIND, ANIM_STATE.SWORD_SHOCKWAVE,
  ANIM_STATE.SWORD_BEAM, ANIM_STATE.SWORD_WITHDRAW, ANIM_STATE.SWORD_SHEATHE,
  ANIM_STATE.HEAL_CAST, ANIM_STATE.MAGIC_BLAST, ANIM_STATE.TWO_H_CAST,
  ANIM_STATE.ATTACK_HEAVY_ALT_1, ANIM_STATE.ATTACK_HEAVY_ALT_2,
  ANIM_STATE.ATTACK_HEAVY_ALT_3, ANIM_STATE.ATTACK_HEAVY_ALT_4,
  ANIM_STATE.ATTACK_HEAVY_ALT_5,
  ANIM_STATE.ATTACK_LIGHT_ALT_1, ANIM_STATE.ATTACK_LIGHT_ALT_2,
  ANIM_STATE.ATTACK_LIGHT_ALT_3, ANIM_STATE.ATTACK_LIGHT_ALT_4,
  ANIM_STATE.ATTACK_LIGHT_ALT_5,
  ANIM_STATE.ATTACK_THROW_1, ANIM_STATE.ATTACK_THROW_2, ANIM_STATE.ATTACK_THROW_3,
  ANIM_STATE.HIT_REACT_ALT_1, ANIM_STATE.HIT_REACT_ALT_2, ANIM_STATE.HIT_REACT_ALT_3,
  ANIM_STATE.HIT_REACT_ALT_4, ANIM_STATE.HIT_REACT_ALT_5, ANIM_STATE.HIT_REACT_ALT_6,
  ANIM_STATE.HIT_REACT_ALT_7, ANIM_STATE.HIT_REACT_ALT_8, ANIM_STATE.HIT_REACT_ALT_9,
]);

// States that interrupt ongoing actions and should release action locks
export const INTERRUPT_STATES: ReadonlySet<string> = new Set([
  ANIM_STATE.HURT,
  ANIM_STATE.KNOCKBACK,
  ANIM_STATE.DEATH,
]);

export const TRANSFORM_STATES: ReadonlySet<string> = new Set([
  ANIM_STATE.TRANSFORM_BUILDUP,
  ANIM_STATE.TRANSFORM_BURST,
  ANIM_STATE.TRANSFORM_LAND,
]);

warnOnFallbackCycles(STATE_FALLBACKS);
