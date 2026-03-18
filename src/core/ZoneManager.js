import { Vector3 } from "@babylonjs/core";
import { createEventEmitter } from "./utils/createEventEmitter.js";
import { applyZoneEnvironment } from "./zone/ZoneEnvironment.js";
import { loadZoneGeometry, unloadZoneRoot } from "./zone/ZoneLoader.js";
import { ZonePortalSystem } from "./zone/ZonePortalSystem.js";
import { ZONE_REGISTRY } from "./zone/ZoneRegistry.js";

export { ZONE_REGISTRY } from "./zone/ZoneRegistry.js";

export class ZoneManager {
  constructor(scene) {
    this.scene = scene;
    this.currentZoneId = null;
    this.currentZoneDef = null;
    this.zoneRoot = null;
    this._transitioning = false;
    this._portalLockForMission = false;

    this._events = createEventEmitter([
      "onZoneLoaded",
      "onZoneUnloaded",
      "onPortalTriggered",
    ]);
    this._portalSystem = new ZonePortalSystem(scene);

    // Preserve the old property shape for external readers.
    this.portalEffects = this._portalSystem.portalEffects;
  }

  async loadZone(zoneId, initial = false) {
    if (this._transitioning) return;
    const def = ZONE_REGISTRY[zoneId];
    if (!def) throw new Error(`ZoneManager: unknown zone "${zoneId}"`);

    this._transitioning = true;

    if (this.currentZoneId && !initial) {
      await this._unloadCurrent();
    }

    console.log(`[ZoneManager] Loading zone: ${def.label}`);

    applyZoneEnvironment(this.scene, def);
    this.zoneRoot = await loadZoneGeometry(this.scene, def);
    this._portalSystem.spawn(def, this.zoneRoot);

    this.currentZoneId = zoneId;
    this.currentZoneDef = def;
    this._transitioning = false;

    this._events.emit("onZoneLoaded", def);
    console.log(`[ZoneManager] Zone ready: ${def.label}`);
  }

  getSpawnPoint(slot) {
    const points = this.currentZoneDef?.spawnPoints;
    if (!points) return new Vector3(0, 1, 0);
    return points[slot % points.length].clone();
  }

  update(delta, players = []) {
    if (!this.currentZoneDef || this._transitioning || this._portalLockForMission) return;

    this._portalSystem.update(this.currentZoneDef, players, ({ playerId, targetZone }) => {
      this._events.emit("onPortalTriggered", { playerId, targetZone });
      this.loadZone(targetZone);
    });
  }

  getCurrentZone() {
    return this.currentZoneDef ? { ...this.currentZoneDef } : null;
  }

  getTrainingMultiplier() {
    return this.currentZoneDef?.trainingMultiplier ?? 1.0;
  }

  isTrainingZone() {
    return this.currentZoneDef?.isTrainingZone ?? false;
  }

  hasInstantRegen() {
    return this.currentZoneDef?.instantRegen ?? false;
  }

  canDie() {
    return !(this.currentZoneDef?.noDeath ?? false);
  }

  getEncounterSpawnPoints(tag = "default") {
    const regions = this.currentZoneDef?.enemySpawnRegions ?? [];
    const region = regions.find((entry) => entry.tag === tag) ?? regions[0];
    return (region?.points ?? []).map((point) => point.clone());
  }

  getZoneGameplayModifiers() {
    return {
      gravity: this.currentZoneDef?.gravity ?? -9.81,
      trainingMultiplier: this.getTrainingMultiplier(),
      encounterPools: [...(this.currentZoneDef?.encounterPools ?? [])],
      missionBoard: [...(this.currentZoneDef?.missionBoard ?? [])],
      safeZoneSpawn: this.currentZoneDef?.safeZoneSpawn?.clone?.() ?? new Vector3(0, 1, 0),
      isTrainingZone: this.isTrainingZone(),
      hasInstantRegen: this.hasInstantRegen(),
      canDie: this.canDie(),
    };
  }

  setMissionPortalLock(locked) {
    this._portalLockForMission = !!locked;
  }

  on(event, fn) {
    return this._events.on(event, fn);
  }

  off(event, fn) {
    this._events.off(event, fn);
  }

  async _unloadCurrent() {
    console.log(`[ZoneManager] Unloading zone: ${this.currentZoneDef?.label}`);
    this._portalSystem.clear();
    unloadZoneRoot(this.zoneRoot);
    this.zoneRoot = null;
    this._events.emit("onZoneUnloaded", this.currentZoneDef);
  }
}
