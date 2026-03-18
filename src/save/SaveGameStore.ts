const SAVE_KEY_PREFIX = "ws_save_";
const LEGACY_SAVE_KEY_PREFIX = "dbz_sp_save_";
const SAVE_VERSION = 1;

export interface CharacterProgress {
  level: number;
  xp: number;
  statBonuses: { hp: number; ki: number; stamina: number };
  unlockedTransforms: string[];
}

export interface SaveSettings {
  difficulty: "EASY" | "NORMAL" | "HARD";
  qualityPreset: "LOW" | "MEDIUM" | "HIGH" | "ULTRA";
  showHints: boolean;
}

export interface ZoneWorldState {
  discoveredLandmarks: string[];
  fastTravelNodes: string[];
  ambientEncountersCleared: number;
  lastAmbientEncounterAt: number | null;
}

export interface SaveProfile {
  version: number;
  profileId: string;
  unlockedCharacters: string[];
  selectedCharacterId: string;
  lastZoneId: string;
  lastMissionId: string | null;
  lastMode: string;
  characterProgress: Record<string, CharacterProgress>;
  missionProgress: Record<string, unknown>;
  zoneMastery: Record<string, number>;
  worldState: Record<string, ZoneWorldState>;
  currencies: { credits: number };
  settings: SaveSettings;
}

function defaultZoneWorldState(): ZoneWorldState {
  return {
    discoveredLandmarks: [],
    fastTravelNodes: [],
    ambientEncountersCleared: 0,
    lastAmbientEncounterAt: null,
  };
}

function defaultCharacterProgress(unlockedTransforms: string[] = []): CharacterProgress {
  return {
    level: 1,
    xp: 0,
    statBonuses: { hp: 0, ki: 0, stamina: 0 },
    unlockedTransforms: [...unlockedTransforms],
  };
}

export function createDefaultSave(profileId = "default"): SaveProfile {
  return {
    version: SAVE_VERSION,
    profileId,
    unlockedCharacters: ["AYO"],
    selectedCharacterId: "AYO",
    lastZoneId: "CITY",
    lastMissionId: null,
    lastMode: "SINGLE_PLAYER",
    characterProgress: {
      AYO: defaultCharacterProgress(["RAGE"]),
      HANA: defaultCharacterProgress(),
      RAYNE: defaultCharacterProgress(),
    },
    missionProgress: {},
    zoneMastery: {},
    worldState: {},
    currencies: { credits: 0 },
    settings: { difficulty: "NORMAL", qualityPreset: "HIGH", showHints: true },
  };
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

function mergeCharacterProgress(
  base: Record<string, CharacterProgress>,
  saved: Record<string, Partial<CharacterProgress>>,
): Record<string, CharacterProgress> {
  const result: Record<string, CharacterProgress> = { ...base };
  for (const [charId, partial] of Object.entries(saved)) {
    const defaults = base[charId] ?? defaultCharacterProgress();
    result[charId] = {
      level: partial.level ?? defaults.level,
      xp: partial.xp ?? defaults.xp,
      statBonuses: { ...defaults.statBonuses, ...(partial.statBonuses ?? {}) },
      unlockedTransforms: [...(partial.unlockedTransforms ?? defaults.unlockedTransforms)],
    };
  }
  return result;
}

function migrateSave(raw: Partial<SaveProfile>, profileId = "default"): SaveProfile {
  const base = createDefaultSave(profileId);
  const merged: SaveProfile = {
    ...base,
    ...raw,
    characterProgress: mergeCharacterProgress(base.characterProgress, raw.characterProgress ?? {}),
    missionProgress:   { ...base.missionProgress,   ...(raw.missionProgress   ?? {}) },
    zoneMastery:       { ...base.zoneMastery,        ...(raw.zoneMastery       ?? {}) },
    worldState:        { ...base.worldState,         ...(raw.worldState        ?? {}) },
    currencies:        { ...base.currencies,         ...(raw.currencies        ?? {}) },
    settings:          { ...base.settings,           ...(raw.settings          ?? {}) },
  };
  for (const [zoneId, state] of Object.entries(merged.worldState)) {
    const zoneState = state as Partial<ZoneWorldState>;
    merged.worldState[zoneId] = {
      ...defaultZoneWorldState(),
      ...zoneState,
      discoveredLandmarks: [...(zoneState.discoveredLandmarks ?? [])],
      fastTravelNodes: [...(zoneState.fastTravelNodes ?? [])],
    };
  }
  // Legacy key rename
  const legacyCurrencies = merged.currencies as Record<string, number>;
  if (legacyCurrencies["credits"] == null && legacyCurrencies["zeni"] != null) {
    merged.currencies.credits = legacyCurrencies["zeni"]!;
  }
  merged.version = SAVE_VERSION;
  return merged;
}

export class SaveGameStore {
  private readonly storage: Storage | null;

  public constructor(
    storage: Storage | null = typeof localStorage !== "undefined" ? localStorage : null,
  ) {
    this.storage = storage;
  }

  public load(profileId = "default"): SaveProfile {
    if (!this.storage) return createDefaultSave(profileId);
    try {
      const raw =
        this.storage.getItem(`${SAVE_KEY_PREFIX}${profileId}`) ??
        this.storage.getItem(`${LEGACY_SAVE_KEY_PREFIX}${profileId}`);
      if (!raw) return createDefaultSave(profileId);
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        console.warn("[SaveGameStore] Save data is corrupt (unexpected type). Using defaults.");
        return createDefaultSave(profileId);
      }
      return migrateSave(parsed as Partial<SaveProfile>, profileId);
    } catch (err) {
      console.warn("[SaveGameStore] Failed to load save. Using defaults.", err);
      return createDefaultSave(profileId);
    }
  }

  public save(profile: SaveProfile): boolean {
    if (!this.storage || !profile.profileId) return false;
    try {
      const payload = migrateSave(deepClone(profile), profile.profileId);
      this.storage.setItem(`${SAVE_KEY_PREFIX}${profile.profileId}`, JSON.stringify(payload));
      return true;
    } catch (err) {
      console.warn("[SaveGameStore] Failed to save profile.", err);
      return false;
    }
  }
}
