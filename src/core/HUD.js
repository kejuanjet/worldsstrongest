import { AdvancedDynamicTexture, Rectangle } from "@babylonjs/gui";
import { CONFIG } from "../config/index.js";
import { PlayerPanelUI } from "./hud/PlayerPanelUI.js";
import { CombatFeedUI } from "./hud/CombatFeedUI.js";
import { MissionUI } from "./hud/MissionUI.js";
import { WorldInfoUI } from "./hud/WorldInfoUI.js";
import { advanceHudUpdateAccumulator, getHudUpdateStep } from "./hud/hudUpdateScheduler.js";

export class HUD {
  /**
   * @param {import("@babylonjs/core").Scene} scene
   * @param {import("./CharacterRegistry").CharacterRegistry} registry
   * @param {import("./SessionManager").SessionManager} sessionManager
   */
  constructor(scene, registry, sessionManager) {
    this.scene = scene;
    this.registry = registry;
    this.sessionManager = sessionManager;
    this._inputManager = null;
    this._localSlot = 0;
    this._hudUpdateAccumulator = 0;

    this._flashAlpha = 0;
    this._flashDecayRate = 0;

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
    this._buildFlashOverlay();
  }

  _buildFlashOverlay() {
    this.flashRect = new Rectangle("screenFlashOverlay");
    this.flashRect.width = "100%";
    this.flashRect.height = "100%";
    this.flashRect.background = "white";
    this.flashRect.alpha = 0;
    this.flashRect.isHitTestVisible = false;
    this.flashRect.zIndex = -10; // Behind UI panels but over the 3D scene
    this.flashRect.thickness = 0;
    this.ui.addControl(this.flashRect);
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

    // Smooth frame-synced decay for the screen flash
    if (this._flashAlpha > 0) {
      this._flashAlpha -= this._flashDecayRate * delta;
      if (this._flashAlpha <= 0) {
        this._flashAlpha = 0;
      }
      if (this.flashRect) this.flashRect.alpha = this._flashAlpha;
    }
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

  _triggerFlash(color, durationMs, maxOpacity) {
    if (!this.flashRect) return;
    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);
    this.flashRect.background = `rgb(${r},${g},${b})`;
    this._flashAlpha = maxOpacity;
    this.flashRect.alpha = this._flashAlpha;
    this._flashDecayRate = maxOpacity / (durationMs / 1000); // Compute alpha decay per second
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

    this.registry.on("onScreenFlashRequested", (payload) => {
      this._triggerFlash(payload.color, payload.durationMs, payload.opacity);
    });
  }

  dispose() {
    this.ui.dispose();
    console.log("[HUD] Disposed.");
  }
}
