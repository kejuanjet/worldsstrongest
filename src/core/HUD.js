import { AdvancedDynamicTexture } from "@babylonjs/gui";
import { CONFIG } from "../config/index.js";
import { PlayerPanelUI } from "./hud/PlayerPanelUI.js";
import { CombatFeedUI } from "./hud/CombatFeedUI.js";
import { MissionUI } from "./hud/MissionUI.js";
import { WorldInfoUI } from "./hud/WorldInfoUI.js";
import { advanceHudUpdateAccumulator, getHudUpdateStep } from "./hud/hudUpdateScheduler.js";

export class HUD {
  /**
   * @param {import("@babylonjs/core").Scene} scene
   * @param {import("../character/CharacterRegistry").CharacterRegistry} registry
   * @param {import("../network/SessionManager").SessionManager} sessionManager
   */
  constructor(scene, registry, sessionManager) {
    this.scene = scene;
    this.registry = registry;
    this.sessionManager = sessionManager;
    this._inputManager = null;
    this._localSlot = 0;
    this._hudUpdateAccumulator = 0;

    this.ui = AdvancedDynamicTexture.CreateFullscreenUI("HUD", true, scene);
    this.ui.renderScale = 1;

    this.playerPanels = new PlayerPanelUI({
      ui: this.ui,
      registry: this.registry,
    });
    this.combatFeed = new CombatFeedUI({
      ui: this.ui,
      scene: this.scene,
    });
    this.missionUi = new MissionUI({
      ui: this.ui,
      registry: this.registry,
    });
    this.worldInfo = new WorldInfoUI({
      ui: this.ui,
      scene: this.scene,
      registry: this.registry,
      sessionManager: this.sessionManager,
    });

    this._build();
    this._wireEvents();
  }

  _build() {
    this.playerPanels.build();
    this.combatFeed.build();
    this.missionUi.build();
    this.worldInfo.build();
  }

  update(delta) {
    const hudStep = getHudUpdateStep(CONFIG);
    const cadence = advanceHudUpdateAccumulator(this._hudUpdateAccumulator, delta, hudStep);
    this._hudUpdateAccumulator = cadence.accumulator;

    this.playerPanels.update(delta, {
      shouldRunHeavyUi: cadence.shouldRunHeavyUi,
    });
    this.combatFeed.update(delta, {
      shouldRunHeavyUi: cadence.shouldRunHeavyUi,
    });
    this.missionUi.update(delta, {
      shouldRunHeavyUi: cadence.shouldRunHeavyUi,
    });
    this.worldInfo.update(delta, {
      shouldRunHeavyUi: cadence.shouldRunHeavyUi,
    });
  }

  setLocalSlot(slot) {
    this._localSlot = slot;
    this.playerPanels.setLocalSlot(slot);
  }

  showCombo(comboCount, totalDamage) {
    this.combatFeed.showCombo(comboCount, totalDamage);
  }

  addKillFeedEntry(killerName, targetName) {
    this.combatFeed.addKillFeedEntry(killerName, targetName);
  }

  showBeamClash(progress = 0.5) {
    this.combatFeed.showBeamClash(progress);
  }

  updateClashProgress(progress) {
    this.combatFeed.updateClashProgress(progress);
  }

  hideBeamClash() {
    this.combatFeed.hideBeamClash();
  }

  setZoneLabel(label) {
    this.worldInfo.setZoneLabel(label);
  }

  showMission(missionState) {
    this.missionUi.showMission(missionState);
  }

  updateMissionObjectiveProgress(missionState) {
    this.missionUi.updateMissionObjectiveProgress(missionState);
  }

  showMissionComplete(results) {
    this.missionUi.showMissionComplete(results);
  }

  showMissionFailed(reason) {
    this.missionUi.showMissionFailed(reason);
  }

  showBossHealth(slot, hp, maxHP, label = "Boss") {
    this.missionUi.showBossHealth(slot, hp, maxHP, label);
  }

  showRewardPopup(rewards) {
    this.missionUi.showRewardPopup(rewards);
  }

  showZoneTransition(label) {
    this.worldInfo.showZoneTransition(label);
  }

  setInputManager(inputManager) {
    this._inputManager = inputManager;
    this.worldInfo.setInputManager(inputManager);
  }

  setOpenWorldDirector(openWorldDirector) {
    this.worldInfo.setOpenWorldDirector(openWorldDirector);
  }

  showStatusMessage(text, duration = 2200) {
    this.missionUi.showStatusMessage(text, duration);
  }

  showCountdown(label) {
    this.missionUi.showCountdown(label);
  }

  hideCountdown() {
    this.missionUi.hideCountdown();
  }

  spawnDamageNumber(worldPos, damage, impactType = "LIGHT") {
    this.combatFeed.spawnDamageNumber(worldPos, damage, impactType);
  }

  _wireEvents() {
    this.registry.on("onTransformChanged", (payload) => {
      const slot = payload?.slot;
      const transformId = payload?.transformId ?? payload?.currentTransform?.id ?? null;
      if (transformId) {
        this.playerPanels.handleTransformChanged(slot);
      }
    });

    this.registry.on("onPlayerDied", ({ slot }) => {
      this.playerPanels.handlePlayerDied(slot);
    });
  }

  dispose() {
    this.ui.dispose();
    console.log("[HUD] Disposed.");
  }
}
