// Named constants for all AI tuning values.
// The nested objects are the canonical structure; the flat exports remain for
// compatibility while the rest of the AI stack is migrated incrementally.

export const ENEMY_AI = {
	behavior: {
		strafeReversalBaseMs: 1800,
		strafeReversalJitterMs: 1600,
		counterWindowMs: 600,
		hitDetectionThreshold: 10,
		dodgeChance: 0.35,
		blockSustainBaseMs: 400,
		blockSustainJitterMs: 300,
		predictiveBlockRange: 5.5,
		predictiveBlockWindowMs: 250,
	},
	transform: {
		hpThreshold: 0.3,
		kiMinimum: 20,
		chance: 0.08,
	},
	retreat: {
		hpThreshold: 0.18,
		cadenceMultiplier: 1.2,
		blastChance: 0.7,
		blastKiCost: 10,
		moveScale: 0.8,
		closeRangeOffset: 3,
		farRangeOffset: 2,
	},
	combat: {
		urgentUltimateHp: 0.35,
		urgentUltimateKi: 80,
		urgentUltimateChance: 0.5,
		normalUltimateKi: 100,
		counterRushRange: 4,
		counterRushChance: 0.5,
		grabRange: 3.5,
		grabChance: 0.15,
		meleeRangeFallback: 7,
		blastKiCost: 10,
		counterCadenceMultiplier: 0.45,
		stanceSwapChance: 0.5,
		stanceDistanceMin: 4.5,
	},
	defaults: {
		preferredDistance: 8,
		attackCadenceMs: 1400,
		strafeBias: 0.5,
		blockChance: 0.3,
		predictiveBlockScale: 0.3,
	},
} as const;

export const COMPANION_AI = {
	healing: {
		bigHealKiCost: 45,
		healKiCost: 20,
		selfHealHpThreshold: 0.45,
		bigHealMoveThreshold: 8,
		healMoveThreshold: 15,
		healCheckIntervalMs: 400,
		bigHealCooldownMs: 1200,
		healCooldownMs: 800,
		selfHealCooldownMs: 1000,
		healerSpellKiCost: 25,
		healerSpellChance: 0.45,
		healerBlastKiCost: 10,
	},
	positioning: {
		healerSafeDistance: 10,
		healerSafeInner: 2,
		healerSafeOuter: 4,
		healerMeleeRange: 5,
		fighterCloseRange: 2.4,
		fighterCloseScale: 0.55,
		fighterStrafeScale: 0.35,
		fighterHeavyRange: 4,
		fighterHeavyRoll: 0.78,
		fighterBlastRange: 6,
		healerBehindDistance: 4.5,
		fighterBehindDistance: 2.8,
		leaderSpeedThreshold: 4,
		idleSpeedScale: 0.35,
		catchupMinSpeed: 0.35,
		catchupSpeedRange: 0.45,
		healerStrafeScale: 0.4,
		healerApproachScale: 0.5,
		healerRetreatScale: 0.7,
	},
	defaults: {
		healerFollowDistance: 6,
		fighterFollowDistance: 4.5,
		catchupDistance: 10,
		engageDistance: 16,
		healerAttackDistance: 12,
		fighterAttackDistance: 5.5,
		cadenceMs: 700,
		healerBlastChance: 0.5,
		fighterBlastChance: 0.25,
		healThreshold: 0.65,
		bigHealThreshold: 0.4,
	},
} as const;

export const ENEMY_STRAFE_REVERSAL_BASE_MS = ENEMY_AI.behavior.strafeReversalBaseMs;
export const ENEMY_STRAFE_REVERSAL_JITTER_MS = ENEMY_AI.behavior.strafeReversalJitterMs;
export const ENEMY_COUNTER_WINDOW_MS = ENEMY_AI.behavior.counterWindowMs;
export const ENEMY_HIT_DETECTION_THRESHOLD = ENEMY_AI.behavior.hitDetectionThreshold;
export const ENEMY_DODGE_CHANCE = ENEMY_AI.behavior.dodgeChance;
export const ENEMY_BLOCK_SUSTAIN_BASE_MS = ENEMY_AI.behavior.blockSustainBaseMs;
export const ENEMY_BLOCK_SUSTAIN_JITTER_MS = ENEMY_AI.behavior.blockSustainJitterMs;
export const ENEMY_PREDICTIVE_BLOCK_RANGE = ENEMY_AI.behavior.predictiveBlockRange;
export const ENEMY_PREDICTIVE_BLOCK_WINDOW_MS = ENEMY_AI.behavior.predictiveBlockWindowMs;
export const ENEMY_TRANSFORM_HP_THRESHOLD = ENEMY_AI.transform.hpThreshold;
export const ENEMY_TRANSFORM_KI_MINIMUM = ENEMY_AI.transform.kiMinimum;
export const ENEMY_TRANSFORM_CHANCE = ENEMY_AI.transform.chance;
export const ENEMY_RETREAT_HP_THRESHOLD = ENEMY_AI.retreat.hpThreshold;
export const ENEMY_RETREAT_CADENCE_MULTIPLIER = ENEMY_AI.retreat.cadenceMultiplier;
export const ENEMY_RETREAT_BLAST_CHANCE = ENEMY_AI.retreat.blastChance;
export const ENEMY_RETREAT_BLAST_KI_COST = ENEMY_AI.retreat.blastKiCost;
export const ENEMY_URGENT_ULTIMATE_HP = ENEMY_AI.combat.urgentUltimateHp;
export const ENEMY_URGENT_ULTIMATE_KI = ENEMY_AI.combat.urgentUltimateKi;
export const ENEMY_URGENT_ULTIMATE_CHANCE = ENEMY_AI.combat.urgentUltimateChance;
export const ENEMY_NORMAL_ULTIMATE_KI = ENEMY_AI.combat.normalUltimateKi;
export const ENEMY_COUNTER_RUSH_RANGE = ENEMY_AI.combat.counterRushRange;
export const ENEMY_COUNTER_RUSH_CHANCE = ENEMY_AI.combat.counterRushChance;
export const ENEMY_GRAB_RANGE = ENEMY_AI.combat.grabRange;
export const ENEMY_GRAB_CHANCE = ENEMY_AI.combat.grabChance;
export const ENEMY_MELEE_RANGE_FALLBACK = ENEMY_AI.combat.meleeRangeFallback;
export const ENEMY_BLAST_KI_COST = ENEMY_AI.combat.blastKiCost;
export const ENEMY_COUNTER_CADENCE_MULTIPLIER = ENEMY_AI.combat.counterCadenceMultiplier;
export const ENEMY_STANCE_SWAP_CHANCE = ENEMY_AI.combat.stanceSwapChance;
export const ENEMY_STANCE_DISTANCE_MIN = ENEMY_AI.combat.stanceDistanceMin;
export const ENEMY_RETREAT_MOVE_SCALE = ENEMY_AI.retreat.moveScale;
export const ENEMY_CLOSE_RANGE_OFFSET = ENEMY_AI.retreat.closeRangeOffset;
export const ENEMY_FAR_RANGE_OFFSET = ENEMY_AI.retreat.farRangeOffset;

export const DEFAULT_PREFERRED_DISTANCE = ENEMY_AI.defaults.preferredDistance;
export const DEFAULT_ATTACK_CADENCE_MS = ENEMY_AI.defaults.attackCadenceMs;
export const DEFAULT_STRAFE_BIAS = ENEMY_AI.defaults.strafeBias;
export const DEFAULT_BLOCK_CHANCE = ENEMY_AI.defaults.blockChance;
export const DEFAULT_PREDICTIVE_BLOCK_SCALE = ENEMY_AI.defaults.predictiveBlockScale;

export const COMPANION_BIG_HEAL_KI_COST = COMPANION_AI.healing.bigHealKiCost;
export const COMPANION_HEAL_KI_COST = COMPANION_AI.healing.healKiCost;
export const COMPANION_SELF_HEAL_HP_THRESHOLD = COMPANION_AI.healing.selfHealHpThreshold;
export const COMPANION_BIG_HEAL_MOVE_THRESHOLD = COMPANION_AI.healing.bigHealMoveThreshold;
export const COMPANION_HEAL_MOVE_THRESHOLD = COMPANION_AI.healing.healMoveThreshold;
export const COMPANION_HEAL_CHECK_INTERVAL_MS = COMPANION_AI.healing.healCheckIntervalMs;
export const COMPANION_BIG_HEAL_COOLDOWN_MS = COMPANION_AI.healing.bigHealCooldownMs;
export const COMPANION_HEAL_COOLDOWN_MS = COMPANION_AI.healing.healCooldownMs;
export const COMPANION_SELF_HEAL_COOLDOWN_MS = COMPANION_AI.healing.selfHealCooldownMs;
export const COMPANION_HEALER_SAFE_DISTANCE = COMPANION_AI.positioning.healerSafeDistance;
export const COMPANION_HEALER_SAFE_INNER = COMPANION_AI.positioning.healerSafeInner;
export const COMPANION_HEALER_SAFE_OUTER = COMPANION_AI.positioning.healerSafeOuter;
export const COMPANION_HEALER_SPELL_KI_COST = COMPANION_AI.healing.healerSpellKiCost;
export const COMPANION_HEALER_SPELL_CHANCE = COMPANION_AI.healing.healerSpellChance;
export const COMPANION_HEALER_BLAST_KI_COST = COMPANION_AI.healing.healerBlastKiCost;
export const COMPANION_HEALER_MELEE_RANGE = COMPANION_AI.positioning.healerMeleeRange;
export const COMPANION_FIGHTER_CLOSE_RANGE = COMPANION_AI.positioning.fighterCloseRange;
export const COMPANION_FIGHTER_CLOSE_SCALE = COMPANION_AI.positioning.fighterCloseScale;
export const COMPANION_FIGHTER_STRAFE_SCALE = COMPANION_AI.positioning.fighterStrafeScale;
export const COMPANION_FIGHTER_HEAVY_RANGE = COMPANION_AI.positioning.fighterHeavyRange;
export const COMPANION_FIGHTER_HEAVY_ROLL = COMPANION_AI.positioning.fighterHeavyRoll;
export const COMPANION_FIGHTER_BLAST_RANGE = COMPANION_AI.positioning.fighterBlastRange;
export const COMPANION_HEALER_BEHIND_DISTANCE = COMPANION_AI.positioning.healerBehindDistance;
export const COMPANION_FIGHTER_BEHIND_DISTANCE = COMPANION_AI.positioning.fighterBehindDistance;
export const COMPANION_LEADER_SPEED_THRESHOLD = COMPANION_AI.positioning.leaderSpeedThreshold;
export const COMPANION_IDLE_SPEED_SCALE = COMPANION_AI.positioning.idleSpeedScale;
export const COMPANION_CATCHUP_MIN_SPEED = COMPANION_AI.positioning.catchupMinSpeed;
export const COMPANION_CATCHUP_SPEED_RANGE = COMPANION_AI.positioning.catchupSpeedRange;
export const COMPANION_HEALER_STRAFE_SCALE = COMPANION_AI.positioning.healerStrafeScale;
export const COMPANION_HEALER_APPROACH_SCALE = COMPANION_AI.positioning.healerApproachScale;
export const COMPANION_HEALER_RETREAT_SCALE = COMPANION_AI.positioning.healerRetreatScale;

export const DEFAULT_HEALER_FOLLOW_DISTANCE = COMPANION_AI.defaults.healerFollowDistance;
export const DEFAULT_FIGHTER_FOLLOW_DISTANCE = COMPANION_AI.defaults.fighterFollowDistance;
export const DEFAULT_CATCHUP_DISTANCE = COMPANION_AI.defaults.catchupDistance;
export const DEFAULT_ENGAGE_DISTANCE = COMPANION_AI.defaults.engageDistance;
export const DEFAULT_HEALER_ATTACK_DISTANCE = COMPANION_AI.defaults.healerAttackDistance;
export const DEFAULT_FIGHTER_ATTACK_DISTANCE = COMPANION_AI.defaults.fighterAttackDistance;
export const DEFAULT_COMPANION_CADENCE_MS = COMPANION_AI.defaults.cadenceMs;
export const DEFAULT_HEALER_BLAST_CHANCE = COMPANION_AI.defaults.healerBlastChance;
export const DEFAULT_FIGHTER_BLAST_CHANCE = COMPANION_AI.defaults.fighterBlastChance;
export const DEFAULT_HEAL_THRESHOLD = COMPANION_AI.defaults.healThreshold;
export const DEFAULT_BIG_HEAL_THRESHOLD = COMPANION_AI.defaults.bigHealThreshold;
