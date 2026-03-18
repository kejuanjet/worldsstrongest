import {
  Color3,
  MeshBuilder,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { createEventEmitter } from "../utils/createEventEmitter.js";
import { ZONE_REGISTRY } from "../ZoneManager.js";

const DISCOVERY_REWARD = Object.freeze({
  xp: 35,
  credits: 45,
  zoneMastery: 12,
});

const ENCOUNTER_REWARD_BASE = Object.freeze({
  xp: 90,
  credits: 130,
  zoneMastery: 22,
});

const AMBIENT_SPAWN_INTERVAL = 20;
const ENCOUNTER_SAFE_DISTANCE = 18;
const HOSTILE_TRAVEL_LOCK_DISTANCE = 24;

/* ── cached marker colours (avoid per-frame Color3 allocations) ─── */
const _COL_UNDISCOVERED = Object.freeze(new Color3(1.0, 0.72, 0.22));
const _COL_DISCOVERED   = Object.freeze(new Color3(0.2, 0.78, 1.0));
const _COL_ACTIVE       = Object.freeze(new Color3(0.25, 1.0, 0.78));

export class OpenWorldDirector {
  constructor({
    scene,
    zoneManager,
    registry,
    movement,
    singlePlayer,
    hud,
    gameLoop,
    getLocalSlot,
  }) {
    this.scene = scene;
    this.zoneManager = zoneManager;
    this.registry = registry;
    this.movement = movement;
    this.singlePlayer = singlePlayer;
    this.hud = hud;
    this.gameLoop = gameLoop;
    this.getLocalSlot = getLocalSlot;

    this.profile = null;
    this._ambientSpawnElapsed = 0;
    this._markerPulse = 0;
    this._markers = new Map();
    this._nearbyLandmarkId = null;
    this._activeEncounter = null;

    this._events = createEventEmitter([
      "onLandmarkDiscovered",
      "onTravelNetworkChanged",
      "onAmbientEncounterStarted",
      "onAmbientEncounterCleared",
    ]);

    this._unsubZoneLoaded = this.zoneManager.on("onZoneLoaded", (zoneDef) => {
      this._ambientSpawnElapsed = 0;
      this._nearbyLandmarkId = null;
      this._clearAmbientEnemies();
      this._activeEncounter = null;
      this._syncZoneMarkers(zoneDef);
    });
    this._unsubZoneUnloaded = this.zoneManager.on("onZoneUnloaded", () => {
      this._clearZoneMarkers();
    });
  }

  on(event, fn) {
    return this._events.on(event, fn);
  }

  bindProfile(profile) {
    this.profile = profile ?? null;
    if (!this.profile) return;
    for (const zoneId of Object.keys(this.profile.worldState ?? {})) {
      this._ensureZoneState(zoneId);
    }
    if (this.zoneManager.currentZoneDef) {
      this._syncZoneMarkers(this.zoneManager.currentZoneDef);
    }
  }

  reset() {
    this._ambientSpawnElapsed = 0;
    this._nearbyLandmarkId = null;
    this._activeEncounter = null;
    this._clearZoneMarkers();
  }

  dispose() {
    this.reset();
    this._unsubZoneLoaded?.();
    this._unsubZoneUnloaded?.();
  }

  update(delta) {
    if (!this.profile) return;

    const zoneDef = this.zoneManager.currentZoneDef;
    const player = this.registry.getState(this.getLocalSlot());
    if (!zoneDef || !player || player.isDead) return;

    this._markerPulse += delta;
    this._updateLandmarkDiscovery(zoneDef, player);
    this._updateMarkerVisuals(zoneDef, player);
    this._updateAmbientEncounter(delta, zoneDef, player);
  }

  getHudState() {
    const zoneDef = this.zoneManager.currentZoneDef;
    const player = this.registry.getState(this.getLocalSlot());
    if (!zoneDef || !player) {
      return {
        discoveredCount: 0,
        totalCount: 0,
        nearbyLandmarkLabel: null,
        nearbyLandmarkDiscovered: false,
        travelPrompt: "",
      };
    }

    const state = this._ensureZoneState(zoneDef.id);
    const nearby = this._getNearbyLandmark(zoneDef, player);
    const nearbyDiscovered = nearby ? this._isLandmarkDiscovered(zoneDef.id, nearby.id) : false;
    let travelPrompt = "";

    if (nearby && nearby.unlocksFastTravel !== false) {
      if (nearbyDiscovered && this._isInsideTravelRadius(player, nearby)) {
        travelPrompt = "Press J to open the travel network";
      } else if (!nearbyDiscovered) {
        travelPrompt = `Approach ${nearby.label} to discover it`;
      }
    }

    return {
      discoveredCount: state.discoveredLandmarks.length,
      totalCount: zoneDef.landmarks.length,
      nearbyLandmarkLabel: nearby?.label ?? null,
      nearbyLandmarkDiscovered: nearbyDiscovered,
      travelPrompt,
    };
  }

  getTravelMenuState() {
    const zoneDef = this.zoneManager.currentZoneDef;
    const player = this.registry.getState(this.getLocalSlot());
    const travelGate = this._getTravelGateState(zoneDef, player);
    const destinations = [];

    for (const [zoneId, zoneState] of Object.entries(this.profile?.worldState ?? {})) {
      const zone = this.zoneManager.currentZoneId === zoneId
        ? zoneDef
        : null;
      const destinationZone = zone ?? this._resolveZone(zoneId);
      if (!destinationZone) continue;

      for (const landmarkId of zoneState.fastTravelNodes ?? []) {
        const landmark = destinationZone.landmarks.find((entry) => entry.id === landmarkId);
        if (!landmark) continue;
        destinations.push({
          key: `${zoneId}:${landmarkId}`,
          zoneId,
          zoneLabel: destinationZone.label,
          landmarkId,
          label: landmark.label,
          description: landmark.description,
          isCurrentZone: this.zoneManager.currentZoneId === zoneId,
          isCurrentAnchor: travelGate.anchor?.id === landmarkId && this.zoneManager.currentZoneId === zoneId,
          canTravel: travelGate.ok,
        });
      }
    }

    destinations.sort((a, b) => {
      if (a.isCurrentZone !== b.isCurrentZone) return a.isCurrentZone ? -1 : 1;
      if (a.zoneLabel !== b.zoneLabel) return a.zoneLabel.localeCompare(b.zoneLabel);
      return a.label.localeCompare(b.label);
    });

    return {
      isTravelOnline: travelGate.ok,
      reason: travelGate.reason,
      sourceLabel: travelGate.anchor?.label ?? null,
      currentZoneLabel: zoneDef?.label ?? "Unknown Zone",
      destinations,
    };
  }

  async fastTravelTo(destinationKey) {
    const [zoneId, landmarkId] = String(destinationKey ?? "").split(":");
    if (!zoneId || !landmarkId) {
      return { ok: false, reason: "Invalid destination." };
    }

    const zoneDef = this._resolveZone(zoneId);
    const landmark = zoneDef?.landmarks.find((entry) => entry.id === landmarkId);
    if (!zoneDef || !landmark) {
      return { ok: false, reason: "Unknown destination." };
    }
    if (!this._hasFastTravelNode(zoneId, landmarkId)) {
      return { ok: false, reason: "Destination not unlocked yet." };
    }

    const player = this.registry.getState(this.getLocalSlot());
    const currentZone = this.zoneManager.currentZoneDef;
    const gate = this._getTravelGateState(currentZone, player);
    if (!gate.ok) {
      return { ok: false, reason: gate.reason };
    }

    if (zoneId !== this.zoneManager.currentZoneId) {
      await this.zoneManager.loadZone(zoneId);
    }

    const refreshedPlayer = this.registry.getState(this.getLocalSlot());
    if (!refreshedPlayer) {
      return { ok: false, reason: "Player unavailable after transit." };
    }

    const arrival = this._buildArrivalPoint(landmark);
    refreshedPlayer.position.copyFrom(arrival);
    refreshedPlayer.velocity.setAll(0);
    refreshedPlayer.spawnPosition?.copyFrom?.(arrival);
    refreshedPlayer.lastSafePosition?.copyFrom?.(arrival);
    this.movement.snapStateToGround(refreshedPlayer);
    this.registry.restoreCharacterRenderState?.(refreshedPlayer);
    this.gameLoop.cameraController?.centerOnSlot?.(this.getLocalSlot());

    const destinationState = this._ensureZoneState(zoneId);
    if (!destinationState.discoveredLandmarks.includes(landmarkId)) {
      destinationState.discoveredLandmarks.push(landmarkId);
    }
    this.singlePlayer.save();
    this.hud?.showZoneTransition?.(`${zoneDef.label} • ${landmark.label}`);
    this.hud?.showStatusMessage?.(`Fast traveled to ${landmark.label}`, 2200);
    this._syncZoneMarkers(this.zoneManager.currentZoneDef);
    return { ok: true };
  }

  canOpenTravelMenu() {
    if (!this.profile?.worldState) return false;
    for (const zoneState of Object.values(this.profile.worldState)) {
      if (zoneState.fastTravelNodes?.length > 0) return true;
    }
    return false;
  }

  _updateLandmarkDiscovery(zoneDef, player) {
    for (const landmark of zoneDef.landmarks) {
      const distance = Vector3.Distance(player.position, landmark.position);
      if (distance > landmark.discoverRadius) continue;
      if (this._isLandmarkDiscovered(zoneDef.id, landmark.id)) continue;
      this._discoverLandmark(zoneDef, landmark);
    }
  }

  _discoverLandmark(zoneDef, landmark) {
    const zoneState = this._ensureZoneState(zoneDef.id);
    zoneState.discoveredLandmarks.push(landmark.id);
    if (landmark.unlocksFastTravel !== false && !zoneState.fastTravelNodes.includes(landmark.id)) {
      zoneState.fastTravelNodes.push(landmark.id);
    }

    const rewards = zoneDef.trainingMode
      ? null
      : this.singlePlayer.grantActivityRewards({
          id: `landmark:${zoneDef.id}:${landmark.id}`,
          label: `Discovered ${landmark.label}`,
          zoneId: zoneDef.id,
          ...DISCOVERY_REWARD,
        });

    if (!rewards) {
      this.singlePlayer.save();
    } else {
      this.hud?.showRewardPopup?.({
        label: `Landmark Discovered: ${landmark.label}`,
        xp: rewards.xp,
        credits: rewards.credits,
        zoneMastery: rewards.zoneMastery,
      });
    }

    this.hud?.showStatusMessage?.(`Landmark discovered: ${landmark.label}`, 2600);
    this._events.emit("onLandmarkDiscovered", { zoneId: zoneDef.id, landmarkId: landmark.id, landmark });
    this._events.emit("onTravelNetworkChanged", this.getTravelMenuState());
    this._updateMarkerVisuals(zoneDef, this.registry.getState(this.getLocalSlot()));
  }

  _updateAmbientEncounter(delta, zoneDef, player) {
    this._cleanupAmbientEncounter();
    if (this._activeEncounter?.slots?.size) return;
    if (zoneDef.trainingMode || (zoneDef.encounterPools?.length ?? 0) === 0) return;
    if (this.singlePlayer.getActiveMissionState()?.missionId) return;

    const nearbyHostiles = this._getNearbyHostiles(player.position, ENCOUNTER_SAFE_DISTANCE);
    if (nearbyHostiles.length > 0) return;

    this._ambientSpawnElapsed += delta;
    if (this._ambientSpawnElapsed < AMBIENT_SPAWN_INTERVAL) return;
    this._ambientSpawnElapsed = 0;

    const zoneState = this._ensureZoneState(zoneDef.id);
    const lastAt = zoneState.lastAmbientEncounterAt ?? 0;
    if ((Date.now() - lastAt) < 16000) return;

    const landmark = this._pickEncounterLandmark(zoneDef, player);
    if (!landmark) return;

    const masteryLevel = this._getZoneMasteryLevel(zoneDef.id);
    const groupSize = Math.max(1, Math.min(3, 1 + Math.floor((masteryLevel - 1) / 2)));
    const encounterId = `ambient_${zoneDef.id}_${landmark.id}_${Date.now()}`;
    const slots = new Set();

    for (let i = 0; i < groupSize; i++) {
      const enemyDefId = zoneDef.encounterPools[Math.floor(Math.random() * zoneDef.encounterPools.length)];
      const spawnPos = this._buildEncounterSpawn(landmark.position, i);
      const state = this.singlePlayer.spawnEnemy(enemyDefId, spawnPos, {
        aggroTargetSlot: this.getLocalSlot(),
        openWorldEncounterId: encounterId,
      });
      if (!state) continue;
      state.isAmbientEncounter = true;
      state.ambientEncounterId = encounterId;
      state.ambientLandmarkId = landmark.id;
      slots.add(state.slot);
    }

    if (slots.size === 0) return;

    this._activeEncounter = {
      id: encounterId,
      zoneId: zoneDef.id,
      landmarkId: landmark.id,
      landmarkLabel: landmark.label,
      slots,
      count: slots.size,
    };
    this.hud?.showStatusMessage?.(`Hostiles spotted near ${landmark.label}`, 2200);
    this._events.emit("onAmbientEncounterStarted", { ...this._activeEncounter });
  }

  _cleanupAmbientEncounter() {
    if (!this._activeEncounter) return;

    for (const slot of [...this._activeEncounter.slots]) {
      const state = this.registry.getState(slot);
      if (!state || state.isDead) {
        this._activeEncounter.slots.delete(slot);
      }
    }

    if (this._activeEncounter.slots.size > 0) return;

    const cleared = this._activeEncounter;
    const zoneState = this._ensureZoneState(cleared.zoneId);
    zoneState.ambientEncountersCleared += 1;
    zoneState.lastAmbientEncounterAt = Date.now();
    const rewards = this.singlePlayer.grantActivityRewards({
      id: `ambient-clear:${cleared.zoneId}:${cleared.landmarkId}`,
      label: `Secured ${cleared.landmarkLabel}`,
      zoneId: cleared.zoneId,
      xp: ENCOUNTER_REWARD_BASE.xp + cleared.count * 25,
      credits: ENCOUNTER_REWARD_BASE.credits + cleared.count * 35,
      zoneMastery: ENCOUNTER_REWARD_BASE.zoneMastery + cleared.count * 4,
    });

    if (!rewards) {
      this.singlePlayer.save();
    } else {
      this.hud?.showRewardPopup?.({
        label: `Secured ${cleared.landmarkLabel}`,
        xp: rewards.xp,
        credits: rewards.credits,
        zoneMastery: rewards.zoneMastery,
      });
    }

    this.hud?.showStatusMessage?.(`${cleared.landmarkLabel} secured`, 2200);
    this._events.emit("onAmbientEncounterCleared", { ...cleared, rewards });
    this._activeEncounter = null;
  }

  _syncZoneMarkers(zoneDef) {
    this._clearZoneMarkers();
    if (!zoneDef) return;

    for (const landmark of zoneDef.landmarks) {
      const root = new TransformNode(`landmark_${zoneDef.id}_${landmark.id}`, this.scene);
      root.position.copyFrom(landmark.position);

      const ring = MeshBuilder.CreateTorus(`landmark_ring_${landmark.id}`, {
        diameter: 4.8,
        thickness: 0.12,
      }, this.scene);
      ring.parent = root;
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.35;

      const orb = MeshBuilder.CreateSphere(`landmark_orb_${landmark.id}`, {
        diameter: 0.65,
        segments: 12,
      }, this.scene);
      orb.parent = root;
      orb.position.y = 2.6;

      const beam = MeshBuilder.CreateCylinder(`landmark_beam_${landmark.id}`, {
        height: 5.5,
        diameterTop: 0.2,
        diameterBottom: 0.5,
        tessellation: 12,
      }, this.scene);
      beam.parent = root;
      beam.position.y = 2.7;

      const ringMat = new StandardMaterial(`landmark_ring_mat_${landmark.id}`, this.scene);
      ringMat.disableLighting = true;
      ringMat.alpha = 0.8;
      ring.material = ringMat;

      const orbMat = new StandardMaterial(`landmark_orb_mat_${landmark.id}`, this.scene);
      orbMat.disableLighting = true;
      orb.material = orbMat;

      const beamMat = new StandardMaterial(`landmark_beam_mat_${landmark.id}`, this.scene);
      beamMat.disableLighting = true;
      beamMat.alpha = 0.18;
      beam.material = beamMat;

      this._markers.set(landmark.id, {
        root,
        ring,
        orb,
        beam,
        ringMat,
        orbMat,
        beamMat,
      });
    }

    this._updateMarkerVisuals(zoneDef, this.registry.getState(this.getLocalSlot()));
  }

  _updateMarkerVisuals(zoneDef, player) {
    if (!zoneDef) return;

    const nearby = player ? this._getNearbyLandmark(zoneDef, player) : null;
    this._nearbyLandmarkId = nearby?.id ?? null;

    /* reusable scratch colour – avoids allocating Color3 every frame */
    const _scratch = OpenWorldDirector._scratchColor ??= new Color3();

    for (const landmark of zoneDef.landmarks) {
      const marker = this._markers.get(landmark.id);
      if (!marker) continue;

      const discovered = this._isLandmarkDiscovered(zoneDef.id, landmark.id);
      const active = nearby?.id === landmark.id && player && this._isInsideTravelRadius(player, landmark);
      const pulse = 0.86 + Math.sin(this._markerPulse * (active ? 5.2 : 2.4)) * 0.12;
      const base = active ? _COL_ACTIVE : discovered ? _COL_DISCOVERED : _COL_UNDISCOVERED;

      marker.root.scaling.setAll(active ? 1.1 : 1.0);
      marker.orb.scaling.setAll(pulse);
      marker.beam.scaling.y = active ? 1.22 : (discovered ? 1.0 : 0.82);

      _scratch.copyFrom(base).scaleInPlace(active ? 1.3 : 1.0);
      marker.ringMat.emissiveColor.copyFrom(_scratch);
      marker.ringMat.diffuseColor.copyFrom(base);

      _scratch.copyFrom(base).scaleInPlace(active ? 1.5 : 1.1);
      marker.orbMat.emissiveColor.copyFrom(_scratch);
      marker.orbMat.diffuseColor.copyFrom(base);

      _scratch.copyFrom(base).scaleInPlace(0.9);
      marker.beamMat.emissiveColor.copyFrom(_scratch);
      _scratch.copyFrom(base).scaleInPlace(0.55);
      marker.beamMat.diffuseColor.copyFrom(_scratch);
      marker.beamMat.alpha = discovered ? (active ? 0.32 : 0.2) : 0.12;
    }
  }

  _clearZoneMarkers() {
    for (const marker of this._markers.values()) {
      marker.ring?.dispose?.();
      marker.orb?.dispose?.();
      marker.beam?.dispose?.();
      marker.ringMat?.dispose?.();
      marker.orbMat?.dispose?.();
      marker.beamMat?.dispose?.();
      marker.root?.dispose?.();
    }
    this._markers.clear();
  }

  _getNearbyLandmark(zoneDef, player) {
    let best = null;
    let bestDistance = Infinity;
    for (const landmark of zoneDef.landmarks) {
      const distance = Vector3.Distance(player.position, landmark.position);
      const radius = Math.max(landmark.discoverRadius, landmark.travelRadius ?? 0);
      if (distance > radius) continue;
      if (distance >= bestDistance) continue;
      best = landmark;
      bestDistance = distance;
    }
    return best;
  }

  _getTravelGateState(zoneDef, player) {
    if (!this.profile) {
      return { ok: false, reason: "No active profile.", anchor: null };
    }
    if (!zoneDef || !player) {
      return { ok: false, reason: "Travel network unavailable.", anchor: null };
    }
    if (this.singlePlayer.getActiveMissionState()?.missionId) {
      return { ok: false, reason: "Finish the active mission first.", anchor: null };
    }

    const anchor = zoneDef.landmarks.find((landmark) =>
      this._hasFastTravelNode(zoneDef.id, landmark.id) && this._isInsideTravelRadius(player, landmark)
    ) ?? null;
    if (!anchor) {
      return { ok: false, reason: "Stand inside a discovered travel beacon to fast travel.", anchor: null };
    }

    if (this._getNearbyHostiles(player.position, HOSTILE_TRAVEL_LOCK_DISTANCE).length > 0) {
      return { ok: false, reason: "Hostiles are too close to the beacon.", anchor };
    }

    return { ok: true, reason: "", anchor };
  }

  _isInsideTravelRadius(player, landmark) {
    const radius = landmark.travelRadius ?? Math.max(5, landmark.discoverRadius * 0.5);
    return Vector3.Distance(player.position, landmark.position) <= radius;
  }

  _pickEncounterLandmark(zoneDef, player) {
    const candidates = zoneDef.landmarks
      .map((landmark) => ({
        landmark,
        distance: Vector3.Distance(player.position, landmark.position),
      }))
      .filter(({ landmark, distance }) =>
        (landmark.ambientEncounterWeight ?? 1) > 0
        && distance >= ENCOUNTER_SAFE_DISTANCE
      );

    if (candidates.length === 0) return null;

    /* weighted-random selection so encounters don't always spawn at the
       same landmark – closer landmarks with higher weight are favoured
       but not guaranteed */
    const weights = candidates.map(({ landmark, distance }) =>
      Math.max(0.1, (landmark.ambientEncounterWeight ?? 1) * 10 - distance * 0.05)
    );
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let roll = Math.random() * totalWeight;
    for (let i = 0; i < candidates.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return candidates[i].landmark;
    }
    return candidates[candidates.length - 1].landmark;
  }

  _buildEncounterSpawn(center, index) {
    const angle = (index / 3) * Math.PI * 2 + Math.PI * 0.25;
    const radius = 6 + index * 2.2;
    return new Vector3(
      center.x + Math.cos(angle) * radius,
      center.y,
      center.z + Math.sin(angle) * radius,
    );
  }

  _buildArrivalPoint(landmark) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 2.2 + Math.random() * 1.4;
    return new Vector3(
      landmark.position.x + Math.cos(angle) * radius,
      landmark.position.y,
      landmark.position.z + Math.sin(angle) * radius,
    );
  }

  _getNearbyHostiles(position, radius) {
    const radiusSq = radius * radius;
    return (this.registry.getEntitiesByTeam?.("ENEMY") ?? []).filter((state) => {
      if (!state || state.isDead) return false;
      return Vector3.DistanceSquared(position, state.position) <= radiusSq;
    });
  }

  _getZoneMasteryLevel(zoneId) {
    const mastery = this.profile?.zoneMastery?.[zoneId];
    if (typeof mastery === "number") return Math.max(1, mastery);
    return Math.max(1, mastery?.level ?? 1);
  }

  _ensureZoneState(zoneId) {
    if (!this.profile) return { discoveredLandmarks: [], fastTravelNodes: [], ambientEncountersCleared: 0, lastAmbientEncounterAt: null };
    this.profile.worldState ??= {};
    this.profile.worldState[zoneId] ??= {
      discoveredLandmarks: [],
      fastTravelNodes: [],
      ambientEncountersCleared: 0,
      lastAmbientEncounterAt: null,
    };
    return this.profile.worldState[zoneId];
  }

  _isLandmarkDiscovered(zoneId, landmarkId) {
    return this._ensureZoneState(zoneId).discoveredLandmarks.includes(landmarkId);
  }

  _hasFastTravelNode(zoneId, landmarkId) {
    return this._ensureZoneState(zoneId).fastTravelNodes.includes(landmarkId);
  }

  _resolveZone(zoneId) {
    return this.zoneManager.currentZoneId === zoneId
      ? this.zoneManager.currentZoneDef
      : ZONE_REGISTRY[zoneId] ?? null;
  }

  _clearAmbientEnemies() {
    for (const state of this.registry.getEntitiesByTeam?.("ENEMY") ?? []) {
      if (!state?.isAmbientEncounter) continue;
      this.registry.despawnEntity?.(state.slot);
      this.singlePlayer.enemyAI?.removeEnemy?.(state.slot);
    }
  }
}
