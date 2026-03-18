const LEVEL_XP_BASE = 250;

export class ProgressionSystem {
  constructor() {
    this._listeners = {
      onProfileUpdated: [],
      onRewardsApplied: [],
      onUnlockGranted: [],
    };
  }

  on(event, fn) {
    (this._listeners[event] = this._listeners[event] || []).push(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    this._listeners[event] = (this._listeners[event] || []).filter((f) => f !== fn);
  }

  _emit(event, data) {
    (this._listeners[event] || []).forEach((fn) => fn(data));
  }

  applyActivityRewards(profile, activity = {}) {
    if (!profile) return null;

    const rewards = {
      label: activity.label ?? "Activity Complete",
      xp: activity.xp ?? 0,
      credits: activity.credits ?? activity.zeni ?? 0,
      zoneMastery: activity.zoneMastery ?? 0,
      unlocks: [],
    };

    const charId = profile.selectedCharacterId || "AYO";
    this._applyCharacterRewards(profile, charId, rewards);
    this._applyZoneRewards(profile, activity.zoneId ?? null, rewards.zoneMastery);

    this._emit("onRewardsApplied", { activityId: activity.id ?? rewards.label, rewards, profile });
    this._emit("onProfileUpdated", { profile });
    return rewards;
  }

  applyMissionRewards(profile, missionDef, result = {}) {
    if (!profile || !missionDef) return null;
    const charId = profile.selectedCharacterId || "AYO";

    const rewards = this.applyActivityRewards(profile, {
      id: missionDef.id,
      label: missionDef.label ?? missionDef.id,
      zoneId: missionDef.zoneId,
      xp: missionDef.rewards?.xp ?? 0,
      credits: missionDef.rewards?.credits ?? missionDef.rewards?.zeni ?? 0,
      zoneMastery: missionDef.rewards?.zoneMastery ?? 0,
    });
    if (!rewards) return null;

    const missionEntry = (profile.missionProgress[missionDef.id] ||= {});
    missionEntry.completed = true;
    missionEntry.bestRank = this._scoreToRank(result.score ?? 0);
    if (result.durationMs != null) {
      missionEntry.bestTimeMs = Math.min(missionEntry.bestTimeMs ?? Infinity, result.durationMs);
      if (!Number.isFinite(missionEntry.bestTimeMs)) delete missionEntry.bestTimeMs;
    }

    const unlocked = this._applyUnlocks(profile, charId, missionDef.id);
    rewards.unlocks.push(...unlocked);

    return rewards;
  }

  applyCharacterStatsToState(profile, state) {
    if (!profile || !state) return;
    const cp = profile.characterProgress?.[state.characterId];
    if (!cp) return;
    state.level = cp.level ?? 1;
    state.maxHP += cp.statBonuses?.hp ?? 0;
    state.hp = Math.min(state.hp, state.maxHP);
    state.maxKi += cp.statBonuses?.ki ?? 0;
    state.ki = Math.min(state.ki, state.maxKi);
    state.maxStamina += cp.statBonuses?.stamina ?? 0;
    state.stamina = Math.min(state.stamina, state.maxStamina);
  }

  _applyUnlocks(profile, charId, missionId) {
    const unlocked = [];
    if (missionId === "HTC_TRAINING_001" && !profile.unlockedCharacters.includes("HANA")) {
      profile.unlockedCharacters.push("HANA");
      unlocked.push({ type: "CHARACTER", id: "HANA" });
      this._emit("onUnlockGranted", unlocked[unlocked.length - 1]);
    }

    const cp = profile.characterProgress[charId];
    if (!cp) return unlocked;
    const forms = cp.unlockedTransforms || (cp.unlockedTransforms = []);
    const transformUnlockByCharacter = {
      AYO: "RAGE",
      HANA: "ARCANE",
      RAYNE: "FURY",
    };
    const transformId = transformUnlockByCharacter[charId];
    if (transformId && (cp.level ?? 1) >= 3 && !forms.includes(transformId)) {
      forms.push(transformId);
      unlocked.push({ type: "TRANSFORM", characterId: charId, id: transformId });
      this._emit("onUnlockGranted", unlocked[unlocked.length - 1]);
    }
    return unlocked;
  }

  _xpToNext(level) {
    return LEVEL_XP_BASE * Math.max(1, level);
  }

  _applyCharacterRewards(profile, charId, rewards) {
    const cp = (profile.characterProgress[charId] ||= {
      level: 1,
      xp: 0,
      statBonuses: { hp: 0, ki: 0, stamina: 0 },
      unlockedTransforms: [],
    });

    cp.xp += rewards.xp;
    while (cp.xp >= this._xpToNext(cp.level)) {
      cp.xp -= this._xpToNext(cp.level);
      cp.level += 1;
      cp.statBonuses.hp += 150;
      cp.statBonuses.ki += 3;
      cp.statBonuses.stamina += 2;
    }

    const currentCredits = profile.currencies?.credits ?? profile.currencies?.zeni ?? 0;
    profile.currencies ??= {};
    profile.currencies.credits = currentCredits + rewards.credits;
    if ("zeni" in profile.currencies) delete profile.currencies.zeni;
  }

  _applyZoneRewards(profile, zoneId, zoneMastery) {
    if (!zoneId || !zoneMastery) return;
    const zm = (profile.zoneMastery[zoneId] ||= { level: 1, xp: 0 });
    zm.xp += zoneMastery;
    while (zm.xp >= 100 * zm.level) {
      zm.xp -= 100 * zm.level;
      zm.level += 1;
    }
  }

  _scoreToRank(score) {
    if (score >= 2000) return "S";
    if (score >= 1200) return "A";
    if (score >= 700) return "B";
    if (score >= 300) return "C";
    return "D";
  }
}
