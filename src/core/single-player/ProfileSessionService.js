import { SaveGameStore } from "../../save/SaveGameStore.js";
import { ProgressionSystem } from "../../progression/ProgressionSystem.js";
import { MissionDirector } from "../../missions/MissionDirector.js";
import { getMissionDef } from "../../missions/MissionRegistry.js";

export class ProfileSessionService {
  constructor({ zoneManager, registry, combat, enemyAI, hud }) {
    this.saveStore = new SaveGameStore();
    this.progression = new ProgressionSystem();
    this.missionDirector = new MissionDirector({ zoneManager, registry, combat, enemyAI, hud });
    this.profile = null;
  }

  bindMissionDirector({ emit, clearEnemies, showRewards }) {
    this.missionDirector.on("onMissionStarted", (event) => emit("onMissionStarted", event));
    this.missionDirector.on("onMissionCompleted", ({ mission, result }) => {
      const rewards = this.progression.applyMissionRewards(
        this.profile,
        getMissionDef(mission.missionId),
        result
      );
      clearEnemies();
      this.save();
      showRewards?.(rewards);
      emit("onRewardsGranted", { rewards });
      emit("onMissionCompleted", { mission, result, rewards });
    });
    this.missionDirector.on("onMissionFailed", (event) => {
      clearEnemies();
      emit("onMissionFailed", event);
    });
  }

  async initProfile(profileId = "default") {
    this.profile = this.saveStore.load(profileId);
    return this.profile;
  }

  save() {
    return this.saveStore.save(this.profile);
  }

  getProfile() {
    return this.profile;
  }

  grantActivityRewards(activity) {
    if (!this.profile) return null;
    const rewards = this.progression.applyActivityRewards(this.profile, activity);
    if (rewards) this.save();
    return rewards;
  }

  applyProfileToPlayerState(playerState) {
    this.progression.applyCharacterStatsToState(this.profile, playerState);
  }
}
