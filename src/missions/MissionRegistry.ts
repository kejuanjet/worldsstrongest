export type MissionType = "RAID" | "TRAINING" | "SURVIVAL" | "BOSS";
export type ObjectiveType =
  | "DEFEAT_COUNT"
  | "DEFEAT_BOSS"
  | "SURVIVE_DURATION"
  | "COMPLETE_IN_ZONE";
export type FailConditionType = "PLAYER_DEFEATED";

export interface EnemyWaveEntry {
  enemyDefId: string;
  count: number;
  isBoss?: boolean;
}

export interface EnemyWave {
  enemies: EnemyWaveEntry[];
}

export interface MissionObjective {
  id: string;
  type: ObjectiveType;
  target?: number;
  label: string;
  targetZone?: string;
  enemyDefId?: string;
}

export interface MissionRewards {
  xp: number;
  credits: number;
  zoneMastery: number;
}

export interface MissionDef {
  id: string;
  zoneId: string;
  type: MissionType;
  title: string;
  recommendedPower: number;
  enemyWaves: EnemyWave[];
  objectives: MissionObjective[];
  rewards: MissionRewards;
  failConditions: Array<{ type: FailConditionType }>;
  modifiers: { timeLimitSec: number };
}

export const MISSION_REGISTRY: Readonly<Record<string, MissionDef>> = {
  CITY_PATROL_001: {
    id: "CITY_PATROL_001",
    zoneId: "CITY",
    type: "RAID",
    title: "City Under Siege",
    recommendedPower: 2800000,
    enemyWaves: [
      { enemies: [{ enemyDefId: "STREET_GRUNT", count: 2 }, { enemyDefId: "AKADEMIKS_THUG", count: 1 }] },
      { enemies: [{ enemyDefId: "AKADEMIKS_THUG", count: 2 }, { enemyDefId: "GRANNY_BRAWLER", count: 1 }] },
      { enemies: [{ enemyDefId: "JELLYROLL_HEAVY", count: 1 }, { enemyDefId: "AKADEMIKS_THUG", count: 1 }, { enemyDefId: "STREET_GRUNT", count: 1 }] },
      { enemies: [{ enemyDefId: "RAYNE_ENFORCER", count: 1, isBoss: true }] },
      { enemies: [{ enemyDefId: "CITY_BOSS", count: 1, isBoss: true }] },
    ],
    objectives: [
      { id: "clear_city", type: "DEFEAT_COUNT", target: 11, label: "Defeat 11 enemies" },
      { id: "rayne", type: "DEFEAT_BOSS", target: 1, label: "Defeat Rayne", enemyDefId: "RAYNE_ENFORCER" },
      { id: "boss", type: "DEFEAT_BOSS", target: 1, label: "Defeat the City King", enemyDefId: "CITY_BOSS" },
    ],
    rewards: { xp: 1800, credits: 2200, zoneMastery: 150 },
    failConditions: [{ type: "PLAYER_DEFEATED" }],
    modifiers: { timeLimitSec: 480 },
  },
  EARTH_TRAINING_001: {
    id: "EARTH_TRAINING_001",
    zoneId: "EARTH_PLAINS",
    type: "TRAINING",
    title: "Street Fight Warm-Up",
    recommendedPower: 3000000,
    enemyWaves: [
      { enemies: [{ enemyDefId: "GRANNY_BRAWLER", count: 1 }, { enemyDefId: "STREET_GRUNT", count: 1 }] },
      { enemies: [{ enemyDefId: "AKADEMIKS_THUG", count: 1 }, { enemyDefId: "STREET_GRUNT", count: 1 }] },
      { enemies: [{ enemyDefId: "JELLYROLL_HEAVY", count: 1 }] },
    ],
    objectives: [
      { id: "defeat_5", type: "DEFEAT_COUNT", target: 5, label: "Defeat 5 enemies" },
    ],
    rewards: { xp: 450, credits: 300, zoneMastery: 40 },
    failConditions: [{ type: "PLAYER_DEFEATED" }],
    modifiers: { timeLimitSec: 300 },
  },
  HTC_TRAINING_001: {
    id: "HTC_TRAINING_001",
    zoneId: "HYPERBOLIC_TC",
    type: "SURVIVAL",
    title: "Rift Chamber Endurance",
    recommendedPower: 3500000,
    enemyWaves: [
      { enemies: [{ enemyDefId: "ANDROID_DRONE", count: 2 }] },
      { enemies: [{ enemyDefId: "FRIEZA_SOLDIER", count: 2 }, { enemyDefId: "ANDROID_DRONE", count: 1 }] },
    ],
    objectives: [
      { id: "survive", type: "SURVIVE_DURATION", target: 75, label: "Survive 75s" },
      { id: "defeat_5", type: "DEFEAT_COUNT", target: 5, label: "Defeat 5 enemies" },
    ],
    rewards: { xp: 650, credits: 500, zoneMastery: 60 },
    failConditions: [{ type: "PLAYER_DEFEATED" }],
    modifiers: { timeLimitSec: 180 },
  },
  NAMEK_BOSS_001: {
    id: "NAMEK_BOSS_001",
    zoneId: "PLANET_NAMEK",
    type: "BOSS",
    title: "Emerald Elite Drill",
    recommendedPower: 4200000,
    enemyWaves: [
      { enemies: [{ enemyDefId: "NAMEK_RAIDER", count: 2 }] },
      { enemies: [{ enemyDefId: "CAPTAIN_GINYU_TRAINING", count: 1, isBoss: true }] },
    ],
    objectives: [
      { id: "boss", type: "DEFEAT_BOSS", target: 1, label: "Defeat the boss" },
      { id: "zone", type: "COMPLETE_IN_ZONE", targetZone: "PLANET_NAMEK", label: "Complete in Emerald Wilds" },
    ],
    rewards: { xp: 1100, credits: 1000, zoneMastery: 90 },
    failConditions: [{ type: "PLAYER_DEFEATED" }],
    modifiers: { timeLimitSec: 240 },
  },
} as const;

export function getMissionDef(missionId: string): MissionDef | null {
  return MISSION_REGISTRY[missionId] ?? null;
}
