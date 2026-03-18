export interface EnemyAIProfile {
  aggroRange: number;
  leashRange: number;
  preferredDistance: number;
  strafeBias: number;
  attackCadenceMs: number;
  blastChance: number;
  ultimateChance?: number;
  stanceSwapChance?: number;
  blockChance?: number;
}

export interface EnemyDef {
  id: string;
  label: string;
  characterId: string;
  basePowerLevel: number;
  maxHP: number;
  maxKi: number;
  maxStamina: number;
  xpReward: number;
  isBoss?: boolean;
  attacks: string[];
  weaponForced?: string;
  aiProfile: EnemyAIProfile;
}

export const ENEMY_ROSTER: Record<string, EnemyDef> = {
  FRIEZA_SOLDIER: {
    id: "FRIEZA_SOLDIER",
    label: "Vanguard Trooper",
    characterId: "PICCOLO",
    basePowerLevel: 900000,
    maxHP: 3200,
    maxKi: 50,
    maxStamina: 70,
    xpReward: 140,
    attacks: ["MELEE_LIGHT", "KI_BLAST"],
    aiProfile: {
      aggroRange: 40,
      leashRange: 80,
      preferredDistance: 8,
      strafeBias: 0.5,
      attackCadenceMs: 700,
      blastChance: 0.35,
    },
  },
  SAIBAMAN: {
    id: "SAIBAMAN",
    label: "Backstreet Stalker",
    characterId: "GOHAN",
    basePowerLevel: 750000,
    maxHP: 2600,
    maxKi: 35,
    maxStamina: 90,
    xpReward: 120,
    attacks: ["MELEE_LIGHT", "RUSH_COMBO"],
    aiProfile: {
      aggroRange: 35,
      leashRange: 75,
      preferredDistance: 3,
      strafeBias: 0.2,
      attackCadenceMs: 550,
      blastChance: 0.05,
    },
  },
  NAMEK_RAIDER: {
    id: "NAMEK_RAIDER",
    label: "Rift Raider",
    characterId: "VEGETA",
    basePowerLevel: 1400000,
    maxHP: 4200,
    maxKi: 75,
    maxStamina: 95,
    xpReward: 220,
    attacks: ["MELEE_LIGHT", "MELEE_HEAVY", "KI_BLAST"],
    aiProfile: {
      aggroRange: 55,
      leashRange: 90,
      preferredDistance: 7,
      strafeBias: 0.6,
      attackCadenceMs: 650,
      blastChance: 0.4,
    },
  },
  ANDROID_DRONE: {
    id: "ANDROID_DRONE",
    label: "Android Drone",
    characterId: "PICCOLO",
    basePowerLevel: 1600000,
    maxHP: 3800,
    maxKi: 90,
    maxStamina: 80,
    xpReward: 240,
    attacks: ["KI_BLAST", "SPECIAL_BEAM_CANNON"],
    aiProfile: {
      aggroRange: 70,
      leashRange: 110,
      preferredDistance: 16,
      strafeBias: 0.75,
      attackCadenceMs: 900,
      blastChance: 0.75,
    },
  },
  CAPTAIN_GINYU_TRAINING: {
    id: "CAPTAIN_GINYU_TRAINING",
    label: "Elite Captain (Training Projection)",
    characterId: "VEGETA",
    basePowerLevel: 2800000,
    maxHP: 12000,
    maxKi: 140,
    maxStamina: 130,
    xpReward: 900,
    isBoss: true,
    attacks: ["MELEE_LIGHT", "MELEE_HEAVY", "KI_BLAST", "FINAL_FLASH"],
    aiProfile: {
      aggroRange: 90,
      leashRange: 150,
      preferredDistance: 10,
      strafeBias: 0.65,
      attackCadenceMs: 500,
      blastChance: 0.45,
      ultimateChance: 0.08,
    },
  },

  // ─── City Enemies ────────────────────────────────────────────────────────
  AKADEMIKS_THUG: {
    id: "AKADEMIKS_THUG",
    label: "Akademiks",
    characterId: "AKADEMIKS",
    basePowerLevel: 1100000,
    maxHP: 4000,
    maxKi: 80,
    maxStamina: 90,
    xpReward: 220,
    attacks: ["SWORD_LIGHT", "SWORD_HEAVY", "SWORD_RANGED", "RUSH_COMBO"],
    weaponForced: "weapon_katana",
    aiProfile: {
      aggroRange: 35,
      leashRange: 75,
      preferredDistance: 4,
      strafeBias: 0.6,
      attackCadenceMs: 550,
      blastChance: 0.15,
      blockChance: 0.25,
    },
  },
  RAYNE_ENFORCER: {
    id: "RAYNE_ENFORCER",
    label: "Rayne",
    characterId: "RAYNE",
    basePowerLevel: 2200000,
    maxHP: 10000,
    maxKi: 130,
    maxStamina: 120,
    xpReward: 750,
    isBoss: true,
    attacks: ["MELEE_LIGHT", "MELEE_HEAVY", "KI_BLAST", "RUSH_COMBO", "RAYNE_BEAM"],
    aiProfile: {
      aggroRange: 60,
      leashRange: 120,
      preferredDistance: 5,
      strafeBias: 0.65,
      attackCadenceMs: 450,
      blastChance: 0.35,
      ultimateChance: 0.07,
      blockChance: 0.4,
    },
  },
  STREET_GRUNT: {
    id: "STREET_GRUNT",
    label: "Street Grunt (Opp)",
    characterId: "OPP",
    basePowerLevel: 700000,
    maxHP: 2600,
    maxKi: 45,
    maxStamina: 80,
    xpReward: 130,
    attacks: ["SWORD_LIGHT", "SWORD_HEAVY", "RUSH_COMBO"],
    weaponForced: "weapon_ayoskatana",
    aiProfile: {
      aggroRange: 25,
      leashRange: 60,
      preferredDistance: 3,
      strafeBias: 0.3,
      attackCadenceMs: 600,
      blastChance: 0.05,
    },
  },
  GRANNY_BRAWLER: {
    id: "GRANNY_BRAWLER",
    label: "Granny",
    characterId: "GRANNY",
    basePowerLevel: 500000,
    maxHP: 2200,
    maxKi: 30,
    maxStamina: 60,
    xpReward: 100,
    attacks: ["MELEE_LIGHT", "MELEE_HEAVY"],
    aiProfile: {
      aggroRange: 20,
      leashRange: 50,
      preferredDistance: 2,
      strafeBias: 0.15,
      attackCadenceMs: 850,
      blastChance: 0.0,
    },
  },
  JELLYROLL_HEAVY: {
    id: "JELLYROLL_HEAVY",
    label: "Jelly Roll",
    characterId: "JELLYROLL",
    basePowerLevel: 1500000,
    maxHP: 7000,
    maxKi: 80,
    maxStamina: 120,
    xpReward: 350,
    attacks: ["MELEE_LIGHT", "MELEE_HEAVY", "RUSH_COMBO"],
    aiProfile: {
      aggroRange: 35,
      leashRange: 75,
      preferredDistance: 3,
      strafeBias: 0.2,
      attackCadenceMs: 900,
      blastChance: 0.15,
    },
  },
  CITY_BOSS: {
    id: "CITY_BOSS",
    label: "Lebron — City King",
    characterId: "LEBRON",
    basePowerLevel: 2000000,
    maxHP: 18000,
    maxKi: 160,
    maxStamina: 130,
    xpReward: 1200,
    isBoss: true,
    attacks: ["MELEE_LIGHT", "MELEE_HEAVY", "SWORD_LIGHT", "SWORD_HEAVY", "SWORD_RANGED", "KI_BLAST"],
    weaponForced: "weapon_night_sword",
    aiProfile: {
      aggroRange: 80,
      leashRange: 140,
      preferredDistance: 6,
      strafeBias: 0.7,
      attackCadenceMs: 480,
      blastChance: 0.35,
      ultimateChance: 0.06,
      stanceSwapChance: 0.3,    // boss can switch between melee and sword mid-fight
    },
  },
  HANA: {
    id: "HANA",
    label: "Hana",
    characterId: "HANA",
    basePowerLevel: 1200000,
    maxHP: 6000,
    maxKi: 120,
    maxStamina: 140,
    xpReward: 800,
    isBoss: true,
    attacks: ["MELEE_LIGHT", "MELEE_HEAVY", "KI_BLAST"],
    aiProfile: {
      aggroRange: 50,
      leashRange: 100,
      preferredDistance: 5,
      strafeBias: 0.6,
      attackCadenceMs: 600,
      blastChance: 0.25,
      ultimateChance: 0.04,
    },
  },
};

export function getEnemyDef(enemyDefId: string): EnemyDef | null {
  if (!Object.prototype.hasOwnProperty.call(ENEMY_ROSTER, enemyDefId)) return null;
  const def = ENEMY_ROSTER[enemyDefId]!;
  return { ...def, attacks: [...def.attacks], aiProfile: { ...def.aiProfile } };
}
