import { getMissionDef } from "./MissionRegistry.js";

export class MissionDirector {
  constructor({ zoneManager, registry, combat, enemyAI, hud }) {
    this.zoneManager = zoneManager;
    this.registry = registry;
    this.combat = combat;
    this.enemyAI = enemyAI;
    this.hud = hud;
    this._listeners = {
      onMissionStarted: [],
      onMissionUpdated: [],
      onMissionCompleted: [],
      onMissionFailed: [],
    };
    this.active = null;
    this._unsubs = [];
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

  async startMission(missionId, helpers) {
    const def = getMissionDef(missionId);
    if (!def) throw new Error(`Unknown mission: ${missionId}`);
    this.endMissionCleanup();

    // Only load the mission's zone if we're not already in it.
    // This prevents missions like EARTH_TRAINING_001 from blowing away a
    // manually chosen zone (e.g. CITY) right after it finishes loading.
    if (def.zoneId && def.zoneId !== this.zoneManager.currentZoneId) {
      await this.zoneManager.loadZone(def.zoneId, !this.zoneManager.currentZoneId);
    }
    this.zoneManager.setMissionPortalLock?.(true);

    this.active = {
      def,
      startedAt: performance.now(),
      elapsedSec: 0,
      waveIndex: 0,
      spawnedEnemySlots: new Set(),
      kills: 0,
      bossKills: 0,
      playerDamaged: 0,
      transformedCount: 0,
      completed: false,
      failed: false,
      objectives: (def.objectives || []).map((o) => ({ ...o, progress: 0, complete: false })),
    };

    this._wireEvents();
    this._spawnWave(0, helpers);
    this._pushHud();
    this._emit("onMissionStarted", { mission: this.getPublicState() });
    return this.getPublicState();
  }

  update(step, helpers) {
    if (!this.active || this.active.completed || this.active.failed) return;
    this.active.elapsedSec += step;

    this._updateTimedObjectives();
    if (this._checkFailConditions()) return;

    if (this._aliveEnemyCount() === 0) {
      const nextWave = this.active.waveIndex + 1;
      if (nextWave < (this.active.def.enemyWaves?.length ?? 0)) {
        this._spawnWave(nextWave, helpers);
      } else if (this._allObjectivesComplete()) {
        this.complete({ durationMs: Math.round(this.active.elapsedSec * 1000), score: this._computeScore() });
      }
    }

    this._pushHud();
  }

  complete(result = {}) {
    if (!this.active || this.active.completed || this.active.failed) return;
    this.active.completed = true;
    this._emit("onMissionCompleted", { mission: this.getPublicState(), result });
    this.hud?.showMissionComplete?.({
      missionId: this.active.def.id,
      title: this.active.def.title,
      durationMs: result.durationMs,
      score: result.score ?? this._computeScore(),
    });
    this.endMissionCleanup(false);
  }

  fail(reason = "FAILED") {
    if (!this.active || this.active.completed || this.active.failed) return;
    this.active.failed = true;
    this._emit("onMissionFailed", { mission: this.getPublicState(), reason });
    this.hud?.showMissionFailed?.(reason);
    this.endMissionCleanup(false);
  }

  endMissionCleanup(clearHud = true) {
    this._unsubs.forEach((u) => u?.());
    this._unsubs = [];
    this.zoneManager.setMissionPortalLock?.(false);
    if (clearHud) this.hud?.showMission?.(null);
  }

  getPublicState() {
    if (!this.active) return null;
    return {
      missionId: this.active.def.id,
      title: this.active.def.title,
      zoneId: this.active.def.zoneId,
      type: this.active.def.type,
      waveIndex: this.active.waveIndex,
      waveCount: this.active.def.enemyWaves?.length ?? 0,
      enemiesRemaining: this._aliveEnemyCount(),
      elapsedSec: this.active.elapsedSec,
      objectives: this.active.objectives.map((o) => ({ ...o })),
      completed: this.active.completed,
      failed: this.active.failed,
    };
  }

  _wireEvents() {
    this._unsubs.push(this.registry.on("onTransformChanged", (payload) => {
      const slot = payload?.slot;
      const transformId = payload?.transformId ?? payload?.currentTransform?.id ?? null;
      if (slot !== 0 || !transformId || !this.active) return;
      this.active.transformedCount += 1;
      this._markProgress("USE_TRANSFORM", this.active.transformedCount);
    }));

    this._unsubs.push(this.combat.on("onEnemyDefeated", ({ isBoss, enemyDefId }) => {
      if (!this.active) return;
      this.active.kills += 1;
      if (isBoss) this.active.bossKills += 1;
      this._markProgress("DEFEAT_COUNT", this.active.kills);
      if (isBoss) this._markBossProgress(enemyDefId);
    }));

    this._unsubs.push(this.combat.on("onDamageTakenByPlayer", ({ targetSlot, damage }) => {
      if (targetSlot !== 0 || !this.active) return;
      this.active.playerDamaged += damage ?? 0;
    }));

    this._unsubs.push(this.registry.on("onPlayerDied", ({ slot }) => {
      if (slot === 0) this.fail("PLAYER_DEFEATED");
    }));
  }

  _spawnWave(index, helpers) {
    this.active.waveIndex = index;
    const wave = this.active.def.enemyWaves[index];
    let spawnCursor = 0;
    for (const group of (wave?.enemies || [])) {
      for (let i = 0; i < (group.count || 1); i++) {
        const spawnPos = this.zoneManager.getEncounterSpawnPoints?.(group.tag)?.[spawnCursor]
          ?? this.zoneManager.getSpawnPoint((spawnCursor % 3) + 1);
        spawnCursor += 1;
        const enemy = helpers.spawnEnemy(group.enemyDefId, spawnPos, {
          isBoss: !!group.isBoss,
        });
        if (!enemy) continue;
        this.active.spawnedEnemySlots.add(enemy.slot);
        if (enemy.isBoss) {
          this.hud?.showBossHealth?.(enemy.slot, enemy.hp, enemy.maxHP, enemy.characterDef?.label || "Boss");
        }
      }
    }
    this._emit("onMissionUpdated", { mission: this.getPublicState() });
  }

  _markProgress(type, value) {
    if (!this.active) return;
    for (const obj of this.active.objectives) {
      if (obj.type !== type) continue;
      obj.progress = Math.min(obj.target ?? value, value);
      obj.complete = (obj.target ?? 1) <= obj.progress;
    }
    this._emit("onMissionUpdated", { mission: this.getPublicState() });
  }

  _markBossProgress(enemyDefId) {
    if (!this.active) return;
    for (const obj of this.active.objectives) {
      if (obj.type !== "DEFEAT_BOSS") continue;
      // If the objective has an enemyDefId filter, only match that boss
      if (obj.enemyDefId && obj.enemyDefId !== enemyDefId) continue;
      obj.progress = Math.min(obj.target ?? 1, (obj.progress ?? 0) + 1);
      obj.complete = (obj.target ?? 1) <= obj.progress;
    }
    this._emit("onMissionUpdated", { mission: this.getPublicState() });
  }

  _updateTimedObjectives() {
    if (!this.active) return;
    for (const obj of this.active.objectives) {
      if (obj.type === "SURVIVE_DURATION") {
        obj.progress = Math.min(obj.target, Math.floor(this.active.elapsedSec));
        obj.complete = obj.progress >= obj.target;
      } else if (obj.type === "COMPLETE_IN_ZONE") {
        obj.progress = this.zoneManager.currentZoneId === obj.targetZone ? 1 : 0;
        obj.complete = obj.progress >= 1;
      }
    }
    const timeLimit = this.active.def.modifiers?.timeLimitSec;
    if (timeLimit && this.active.elapsedSec > timeLimit) this.fail("TIME_LIMIT");
  }

  _checkFailConditions() {
    if (!this.active) return false;
    return this.active.failed;
  }

  _allObjectivesComplete() {
    if (!this.active) return false;
    return this.active.objectives.every((o) => o.complete);
  }

  _aliveEnemyCount() {
    if (!this.active) return 0;
    let alive = 0;
    for (const slot of this.active.spawnedEnemySlots) {
      const s = this.registry.getState(slot);
      if (s && !s.isDead) alive += 1;
    }
    return alive;
  }

  _computeScore() {
    if (!this.active) return 0;
    const base = this.active.kills * 150 + this.active.bossKills * 600;
    const speedBonus = Math.max(0, 600 - Math.round(this.active.elapsedSec * 3));
    return base + speedBonus;
  }

  _pushHud() {
    this.hud?.showMission?.(this.getPublicState());
  }
}
