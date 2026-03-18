import { Vector3 } from "@babylonjs/core";
import { createEventEmitter } from "./utils/createEventEmitter.js";
import { EnemySpawnService } from "./single-player/EnemySpawnService.js";
import { ProfileSessionService } from "./single-player/ProfileSessionService.js";

export class SinglePlayerManager {
  constructor({ gameLoop, zoneManager, registry, combat, movement, hud, enemyAI }) {
    this.gameLoop = gameLoop;
    this.zoneManager = zoneManager;
    this.registry = registry;
    this.combat = combat;
    this.movement = movement;
    this.hud = hud;
    this.enemyAI = enemyAI;

    this._events = createEventEmitter([
      "onProfileLoaded",
      "onMissionStarted",
      "onMissionCompleted",
      "onMissionFailed",
      "onRewardsGranted",
    ]);
    this._companionSlots = new Set();

    this.enemySpawns = new EnemySpawnService({ registry, enemyAI });
    this.profileSession = new ProfileSessionService({ zoneManager, registry, combat, enemyAI, hud });
    this.missionDirector = this.profileSession.missionDirector;
    this.profileSession.bindMissionDirector({
      emit: (event, payload) => this._events.emit(event, payload),
      clearEnemies: () => this.clearEnemies(),
      showRewards: (rewards) => this.hud?.showRewardPopup?.(rewards),
    });
  }

  get profile() {
    return this.profileSession.getProfile();
  }

  on(event, fn) {
    return this._events.on(event, fn);
  }

  off(event, fn) {
    this._events.off(event, fn);
  }

  async initProfile(profileId = "default") {
    const profile = await this.profileSession.initProfile(profileId);
    this._events.emit("onProfileLoaded", { profile });
    return profile;
  }

  async startMission(missionId, options = {}) {
    if (!this.profile) await this.initProfile("default");
    this.clearEnemies();
    return this.missionDirector.startMission(missionId, {
      ...options,
      spawnEnemy: (enemyDefId, spawnPos, enemyOpts) => this.spawnEnemy(enemyDefId, spawnPos, enemyOpts),
    });
  }

  update(step) {
    this.missionDirector.update(step, {
      spawnEnemy: (enemyDefId, spawnPos, enemyOpts) => this.spawnEnemy(enemyDefId, spawnPos, enemyOpts),
    });
  }

  completeMission(result) {
    this.missionDirector.complete(result);
  }

  failMission(reason) {
    this.missionDirector.fail(reason);
  }

  save() {
    return this.profileSession.save();
  }

  getProfile() {
    return this.profile;
  }

  grantActivityRewards(activity) {
    return this.profileSession.grantActivityRewards(activity);
  }

  getActiveMissionState() {
    return this.missionDirector.getPublicState();
  }

  applyProfileToPlayerState(playerState) {
    this.profileSession.applyProfileToPlayerState(playerState);
  }

  async ensureDefaultCompanions(leaderSlot = 0) {
    const existing = this.registry.getEntitiesByTeam?.("HERO")?.filter((state) => state.entityType === "COMPANION") ?? [];
    if (existing.length > 0) {
      existing.forEach((state) => this._companionSlots.add(state.slot));
      return existing;
    }

    const leader = this.registry.getState(leaderSlot);
    if (!leader) return [];

    const defaults = ["AYO", "HANA", "RAYNE"]
      .filter((id) => id !== leader.characterId)
      .slice(0, 2);

    const spawns = defaults.map(async (characterId, index) => {
      const offset = index === 0 ? -3 : 3;
      const spawnPos = leader.position.add(new Vector3(offset, 0, -3));
      const companion = await this.registry.spawnCompanion(characterId, null, spawnPos, {
        followTargetSlot: leaderSlot,
      });
      this.enemyAI?.registerCompanion(companion.slot, {
        followDistance: characterId === "HANA" ? 6 : 4.5 + index,
        catchUpDistance: 11,
        engageDistance: 18,
        attackDistance: characterId === "HANA" ? 12 : 5.5,
        blastChance: characterId === "HANA" ? 0.5 : 0.2,
        attackCadenceMs: characterId === "HANA" ? 750 : 620,
        formationOffset: index === 0 ? -2.8 : 2.8,
        healThreshold: 0.65,
        bigHealThreshold: 0.40,
      }, characterId);
      this._companionSlots.add(companion.slot);
      return companion;
    });

    return Promise.all(spawns);
  }

  spawnEnemy(enemyDefId, spawnPos, params = {}) {
    return this.enemySpawns.spawnEnemy(enemyDefId, spawnPos, params);
  }

  clearEnemies() {
    this.enemySpawns.clearEnemies();
  }
}
