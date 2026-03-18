import { Color3, Vector3 } from "@babylonjs/core";

export interface ZonePortalDef {
  targetZone: string;
  position: Vector3;
  radius: number;
}

export interface ZoneSpawnRegion {
  tag: string;
  points: Vector3[];
}

export interface ZoneLandmarkDef {
  id: string;
  label: string;
  description: string;
  position: Vector3;
  discoverRadius: number;
  travelRadius?: number;
  unlocksFastTravel?: boolean;
  ambientEncounterWeight?: number;
}

export interface ZoneDef {
  id: string;
  label: string;
  modelPath: string;
  skyboxPath: string;
  ambientColor: Color3;
  gravity: number;
  musicTrack: string;
  spawnPoints: Vector3[];
  portals: ZonePortalDef[];
  safeZoneSpawn: Vector3;
  missionBoard: string[];
  encounterPools: string[];
  enemySpawnRegions: ZoneSpawnRegion[];
  landmarks: ZoneLandmarkDef[];
  cityScale?: number;
  targetExtent?: number;
  forceScaleToExtent?: boolean;
  isTrainingZone?: boolean;
  trainingMode?: boolean;
  instantRegen?: boolean;
  noDeath?: boolean;
  trainingSpawnPoints?: Vector3[];
  trainingMultiplier?: number;
}

export const ZONE_REGISTRY: Record<string, ZoneDef> = {
  EARTH_PLAINS: {
    id: "EARTH_PLAINS",
    label: "Frontier Plains",
    // No authored zone mesh is present on disk; ZoneLoader will build a fallback arena.
    modelPath: "",
    skyboxPath: "",
    ambientColor: new Color3(0.9, 0.85, 0.75),
    gravity: -9.81,
    musicTrack: "earth_theme",
    spawnPoints: [
      new Vector3(-30, 1, 0),
      new Vector3(30, 1, 0),
      new Vector3(0, 1, -30),
      new Vector3(0, 1, 30),
    ],
    portals: [
      { targetZone: "KAMI_LOOKOUT", position: new Vector3(80, 1, 0), radius: 3 },
      { targetZone: "HYPERBOLIC_TC", position: new Vector3(-80, 1, 0), radius: 3 },
      { targetZone: "TRAINING_GROUND", position: new Vector3(0, 1, -40), radius: 3 },
    ],
    safeZoneSpawn: new Vector3(0, 1, 0),
    missionBoard: ["EARTH_TRAINING_001"],
    encounterPools: ["GRANNY_BRAWLER", "STREET_GRUNT", "AKADEMIKS_THUG", "JELLYROLL_HEAVY"],
    enemySpawnRegions: [
      { tag: "default", points: [new Vector3(18, 1, 8), new Vector3(-18, 1, 8), new Vector3(0, 1, -18), new Vector3(14, 1, -16)] },
    ],
    landmarks: [
      {
        id: "WIND_TEMPLE",
        label: "Wind Temple",
        description: "An ancient stone ring that anchors the plains' travel network.",
        position: new Vector3(24, 1, -6),
        discoverRadius: 13,
        travelRadius: 7,
        unlocksFastTravel: true,
        ambientEncounterWeight: 1.2,
      },
      {
        id: "CANYON_PASS",
        label: "Canyon Pass",
        description: "A broken ridge path where raiders ambush travelers.",
        position: new Vector3(-28, 1, 18),
        discoverRadius: 14,
        travelRadius: 7,
        unlocksFastTravel: true,
        ambientEncounterWeight: 1.1,
      },
    ],
  },

  KAMI_LOOKOUT: {
    id: "KAMI_LOOKOUT",
    label: "Skywatch Lookout",
    modelPath: "",
    skyboxPath: "",
    ambientColor: new Color3(0.6, 0.7, 1.0),
    gravity: -4.0,
    musicTrack: "lookout_theme",
    spawnPoints: [
      new Vector3(-8, 0.5, 0),
      new Vector3(8, 0.5, 0),
      new Vector3(0, 0.5, -8),
      new Vector3(0, 0.5, 8),
    ],
    portals: [
      { targetZone: "EARTH_PLAINS", position: new Vector3(0, 0.5, 15), radius: 2.5 },
    ],
    safeZoneSpawn: new Vector3(0, 0.5, 0),
    missionBoard: [],
    encounterPools: ["ANDROID_DRONE"],
    enemySpawnRegions: [
      { tag: "default", points: [new Vector3(-10, 0.5, -10), new Vector3(10, 0.5, -10), new Vector3(0, 0.5, 12)] },
    ],
    landmarks: [
      {
        id: "GUARDIAN_RING",
        label: "Guardian Ring",
        description: "A watchpoint above the clouds with a stable fast-travel signal.",
        position: new Vector3(0, 0.5, -6),
        discoverRadius: 11,
        travelRadius: 6,
        unlocksFastTravel: true,
        ambientEncounterWeight: 0.9,
      },
    ],
  },

  HYPERBOLIC_TC: {
    id: "HYPERBOLIC_TC",
    label: "Time Rift Chamber",
    modelPath: "",
    skyboxPath: "",
    ambientColor: new Color3(1.0, 1.0, 1.0),
    gravity: -9.81,
    musicTrack: "htc_theme",
    spawnPoints: [
      new Vector3(-5, 1, 0),
      new Vector3(5, 1, 0),
      new Vector3(0, 1, -5),
      new Vector3(0, 1, 5),
    ],
    portals: [
      { targetZone: "EARTH_PLAINS", position: new Vector3(0, 1, 30), radius: 2.5 },
    ],
    trainingMultiplier: 2.0,
    safeZoneSpawn: new Vector3(0, 1, 0),
    missionBoard: ["HTC_TRAINING_001"],
    encounterPools: ["ANDROID_DRONE", "FRIEZA_SOLDIER"],
    enemySpawnRegions: [
      { tag: "default", points: [new Vector3(-12, 1, 10), new Vector3(12, 1, 10), new Vector3(0, 1, -14), new Vector3(8, 1, -8)] },
    ],
    landmarks: [
      {
        id: "TIME_SPLIT",
        label: "Time Split",
        description: "A rupture in the chamber that can sling fighters across the world.",
        position: new Vector3(0, 1, -10),
        discoverRadius: 12,
        travelRadius: 6,
        unlocksFastTravel: true,
        ambientEncounterWeight: 1.3,
      },
    ],
  },

  PLANET_NAMEK: {
    id: "PLANET_NAMEK",
    label: "Emerald Wilds",
    modelPath: "",
    skyboxPath: "",
    ambientColor: new Color3(0.4, 0.9, 0.5),
    gravity: -8.5,
    musicTrack: "namek_theme",
    spawnPoints: [
      new Vector3(-25, 1, 0),
      new Vector3(25, 1, 0),
      new Vector3(0, 1, -25),
      new Vector3(0, 1, 25),
    ],
    portals: [
      { targetZone: "EARTH_PLAINS", position: new Vector3(0, 1, 60), radius: 3 },
    ],
    safeZoneSpawn: new Vector3(0, 1, 0),
    missionBoard: ["NAMEK_BOSS_001"],
    encounterPools: ["NAMEK_RAIDER", "CAPTAIN_GINYU_TRAINING"],
    enemySpawnRegions: [
      { tag: "default", points: [new Vector3(-20, 1, 12), new Vector3(20, 1, 12), new Vector3(0, 1, -24), new Vector3(-10, 1, -18)] },
      { tag: "boss", points: [new Vector3(0, 1, 16)] },
    ],
    landmarks: [
      {
        id: "ELDER_BASIN",
        label: "Elder Basin",
        description: "A luminous pool that pulses with Namekian transit energy.",
        position: new Vector3(-14, 1, 10),
        discoverRadius: 14,
        travelRadius: 7,
        unlocksFastTravel: true,
        ambientEncounterWeight: 1.4,
      },
      {
        id: "EMERALD_SPIRE",
        label: "Emerald Spire",
        description: "A tall crystal outcrop that draws in hostile scouts.",
        position: new Vector3(18, 1, -18),
        discoverRadius: 14,
        travelRadius: 7,
        unlocksFastTravel: true,
        ambientEncounterWeight: 1.2,
      },
    ],
  },

  TRAINING_GROUND: {
    id: "TRAINING_GROUND",
    label: "Training Ground",
    modelPath: "",
    skyboxPath: "",
    ambientColor: new Color3(0.7, 0.8, 0.9),
    gravity: -9.81,
    musicTrack: "training_theme",
    spawnPoints: [
      new Vector3(0, 0, 0),
      new Vector3(10, 0, 0),
      new Vector3(-10, 0, 0),
      new Vector3(0, 0, 5),
    ],
    portals: [
      { targetZone: "EARTH_PLAINS", position: new Vector3(0, 1, 40), radius: 3 },
    ],
    safeZoneSpawn: new Vector3(0, 1, 0),
    missionBoard: [],
    encounterPools: [],
    enemySpawnRegions: [],
    isTrainingZone: true,
    trainingMode: true,
    instantRegen: true,
    noDeath: true,
    landmarks: [
      {
        id: "TRAINING_PYLON",
        label: "Training Pylon",
        description: "A local reset beacon for practice drills.",
        position: new Vector3(0, 0, 10),
        discoverRadius: 10,
        travelRadius: 5,
        unlocksFastTravel: false,
        ambientEncounterWeight: 0,
      },
    ],
    trainingSpawnPoints: [
      new Vector3(0, 0, 15),
      new Vector3(-8, 0, 12),
      new Vector3(8, 0, 12),
      new Vector3(0, 0, 20),
    ],
  },

  CITY: {
    id: "CITY",
    label: "The City",
    modelPath: "/assets/full_gameready_city_buildings.glb",
    skyboxPath: "",
    ambientColor: new Color3(0.85, 0.85, 0.9),
    gravity: -9.81,
    musicTrack: "battle_theme",
    cityScale: 1.0,
    targetExtent: 550,
    forceScaleToExtent: true,
    spawnPoints: [
      new Vector3(0, 0.5, 0),
      new Vector3(15, 0.5, 0),
      new Vector3(0, 0.5, 15),
      new Vector3(-15, 0.5, 0),
    ],
    portals: [
      { targetZone: "EARTH_PLAINS", position: new Vector3(0, 0.5, 100), radius: 4 },
    ],
    safeZoneSpawn: new Vector3(0, 0.5, 0),
    missionBoard: ["CITY_PATROL_001"],
    encounterPools: ["AKADEMIKS_THUG", "STREET_GRUNT", "CITY_BOSS"],
    enemySpawnRegions: [
      { tag: "default", points: [
        new Vector3(30, 0.5, 10),
        new Vector3(-30, 0.5, 10),
        new Vector3(10, 0.5, -30),
        new Vector3(-10, 0.5, -30),
        new Vector3(40, 0.5, 40),
        new Vector3(-40, 0.5, 40),
      ] },
      { tag: "boss", points: [new Vector3(0, 0.5, 60)] },
    ],
    landmarks: [
      {
        id: "CENTRAL_PLAZA",
        label: "Central Plaza",
        description: "The city's central travel anchor and safest arrival point.",
        position: new Vector3(0, 0.5, 12),
        discoverRadius: 13,
        travelRadius: 7,
        unlocksFastTravel: true,
        ambientEncounterWeight: 0.8,
      },
      {
        id: "SKYLINE_GATE",
        label: "Skyline Gate",
        description: "A rooftop transfer point overlooking the combat district.",
        position: new Vector3(38, 0.5, 36),
        discoverRadius: 14,
        travelRadius: 7,
        unlocksFastTravel: true,
        ambientEncounterWeight: 1.5,
      },
      {
        id: "UNDERPASS_MARKET",
        label: "Underpass Market",
        description: "A dense street hub where patrol requests erupt into brawls.",
        position: new Vector3(-34, 0.5, 24),
        discoverRadius: 14,
        travelRadius: 7,
        unlocksFastTravel: true,
        ambientEncounterWeight: 1.3,
      },
    ],
  },
};

export function getZoneLandmark(zoneId: string, landmarkId: string): ZoneLandmarkDef | null {
  const zone = ZONE_REGISTRY[zoneId];
  if (!zone) return null;
  return zone.landmarks.find((landmark) => landmark.id === landmarkId) ?? null;
}
