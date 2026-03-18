import { Rectangle, TextBlock, Control } from "@babylonjs/gui";
import { HUD_COLORS } from "./HUDTheme.js";

export class MissionUI {
  constructor({ ui, registry }) {
    this.ui = ui;
    this.registry = registry;
    this.missionPanel = null;
    this.missionTitle = null;
    this.missionBody = null;
    this.missionWave = null;
    this.missionTimerText = null;
    this.missionState = null;
    this.rewardPopupText = null;
    this.rewardPopupTimer = 0;
    this.bossPanel = null;
    this.bossNameText = null;
    this.bossHpFill = null;
    this.bossSlot = null;
    this.statusText = null;
    this.statusTimer = 0;
    this.countdownText = null;
  }

  build() {
    this._buildMissionPanel();
    this._buildBossPanel();
    this._buildRewardPopup();
    this._buildStatusMessage();
    this._buildCountdownOverlay();
  }

  update(delta, { shouldRunHeavyUi }) {
    if (shouldRunHeavyUi && this.missionState && this.missionTimerText) {
      const elapsed = Math.floor(this.missionState.elapsedSec ?? 0);
      const mins = Math.floor(elapsed / 60);
      const secs = `${elapsed % 60}`.padStart(2, "0");
      this.missionTimerText.text = `${mins}:${secs}`;
    }

    if (this.rewardPopupText?.isVisible) {
      this.rewardPopupTimer -= delta;
      if (this.rewardPopupTimer <= 0) this.rewardPopupText.isVisible = false;
    }

    if (this.statusText?.isVisible) {
      this.statusTimer -= delta;
      if (this.statusTimer <= 0) this.statusText.isVisible = false;
    }

    if (shouldRunHeavyUi && this.bossSlot != null) {
      const boss = this.registry.getState(this.bossSlot);
      if (!boss || boss.isDead) {
        this.bossPanel.isVisible = false;
        this.bossSlot = null;
      } else {
        this.showBossHealth(this.bossSlot, boss.hp, boss.maxHP, boss.characterDef?.label || "Boss");
      }
    }
  }

  showStatusMessage(text, duration = 2200) {
    if (!this.statusText) return;
    this.statusText.text = text;
    this.statusText.isVisible = true;
    this.statusTimer = duration / 1000;
  }

  showMission(missionState) {
    this.missionState = missionState;
    if (!missionState) {
      if (this.missionPanel) this.missionPanel.isVisible = false;
      return;
    }

    this.missionPanel.isVisible = true;
    this.missionTitle.text = "* " + (missionState.title ?? missionState.missionId ?? "MISSION");
    this.missionWave.text = `Wave ${Math.min((missionState.waveIndex ?? 0) + 1, missionState.waveCount ?? 1)}/${missionState.waveCount ?? 1}  |  Enemies: ${missionState.enemiesRemaining ?? 0}`;
    this.missionBody.text = (missionState.objectives || [])
      .map((objective) => {
        const target = objective.target ?? 1;
        const progress = objective.progress ?? 0;
        const marker = objective.complete ? "[x]" : "[ ]";
        return `${marker} ${objective.label ?? objective.type} (${progress}/${target})`;
      })
      .join("\n");
  }

  updateMissionObjectiveProgress(missionState) {
    this.showMission(missionState);
  }

  showMissionComplete(results) {
    this.showRewardPopup({
      xp: 0,
      credits: 0,
      label: `MISSION CLEAR: ${results?.title ?? results?.missionId ?? ""}`,
    });
  }

  showMissionFailed(reason) {
    if (!this.rewardPopupText) return;
    this.rewardPopupText.text = `MISSION FAILED: ${reason}`;
    this.rewardPopupText.color = "#ef4444";
    this.rewardPopupText.shadowColor = "#ff0000";
    this.rewardPopupText.isVisible = true;
    this.rewardPopupTimer = 3;
  }

  showBossHealth(slot, hp, maxHP, label = "Boss") {
    if (!this.bossPanel) return;
    this.bossSlot = slot;
    this.bossPanel.isVisible = true;
    this.bossNameText.text = `BOSS ${label}`;
    const pct = Math.max(0, Math.min(1, maxHP > 0 ? hp / maxHP : 0));
    this.bossHpFill.width = `${Math.round(pct * 100)}%`;
  }

  showRewardPopup(rewards) {
    if (!this.rewardPopupText) return;
    const unlockText = rewards?.unlocks?.length ? ` | Unlocks: ${rewards.unlocks.map((u) => u.id).join(", ")}` : "";
    const credits = rewards?.credits ?? rewards?.zeni ?? 0;
    this.rewardPopupText.color = HUD_COLORS.GOLD;
    this.rewardPopupText.shadowColor = HUD_COLORS.GOLD;
    this.rewardPopupText.text = rewards?.label ?? `+${rewards?.xp ?? 0} XP  +${credits} Credits${unlockText}`;
    this.rewardPopupText.isVisible = true;
    this.rewardPopupTimer = 4;
  }

  showCountdown(label) {
    if (!this.countdownText) return;
    this.countdownText.text = label;
    this.countdownText.isVisible = true;
    if (label === "FIGHT!") {
      this.countdownText.color = "#ff3333";
      this.countdownText.fontSize = 160;
      this.countdownText.shadowColor = "#ff0000";
      this.countdownText.shadowBlur = 60;
    } else {
      this.countdownText.color = "#ffe033";
      this.countdownText.fontSize = 140;
      this.countdownText.shadowColor = "#ff6600";
      this.countdownText.shadowBlur = 40;
    }
  }

  hideCountdown() {
    if (this.countdownText) this.countdownText.isVisible = false;
  }

  _buildMissionPanel() {
    const panel = new Rectangle("missionPanel");
    panel.width = "480px";
    panel.height = "180px";
    panel.background = HUD_COLORS.PANEL_BG;
    panel.color = HUD_COLORS.NEON_GLOW;
    panel.cornerRadius = 6;
    panel.thickness = 3;
    panel.shadowColor = HUD_COLORS.KI_CHARGING;
    panel.shadowBlur = 30;
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    panel.top = "40px";
    panel.isVisible = false;
    this.ui.addControl(panel);

    const title = new TextBlock("missionTitle");
    title.text = "CHAPTER 1";
    title.color = HUD_COLORS.GOLD;
    title.fontSize = 20;
    title.fontFamily = "Orbitron";
    title.fontWeight = "900";
    title.outlineWidth = 4;
    title.outlineColor = "#000";
    title.shadowColor = HUD_COLORS.COMBO;
    title.shadowBlur = 20;
    title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    title.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    title.top = "12px";
    panel.addControl(title);

    const wave = new TextBlock("missionWave");
    wave.text = "WAVE 1/5";
    wave.color = HUD_COLORS.NEON_GLOW;
    wave.fontSize = 14;
    wave.fontFamily = "Orbitron";
    wave.fontWeight = "700";
    wave.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    wave.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    wave.top = "36px";
    panel.addControl(wave);

    const timer = new TextBlock("missionTimer");
    timer.text = "03:45";
    timer.color = HUD_COLORS.AURA_PINK;
    timer.fontSize = 16;
    timer.fontFamily = "Orbitron";
    timer.fontWeight = "800";
    timer.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    timer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    timer.top = "58px";
    panel.addControl(timer);

    const body = new TextBlock("missionBody");
    body.text = "Defeat targets";
    body.color = HUD_COLORS.TEXT;
    body.fontSize = 14;
    body.fontFamily = "Rajdhani";
    body.textWrapping = true;
    body.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    body.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    body.left = "20px";
    body.top = "20px";
    body.width = "90%";
    body.height = "80px";
    panel.addControl(body);

    this.missionPanel = panel;
    this.missionTitle = title;
    this.missionBody = body;
    this.missionWave = wave;
    this.missionTimerText = timer;
  }

  _buildBossPanel() {
    const panel = new Rectangle("bossPanel");
    panel.width = "560px";
    panel.height = "70px";
    panel.background = "rgba(20, 0, 0, 0.95)";
    panel.color = "#cc0000";
    panel.thickness = 2;
    panel.cornerRadius = 8;
    panel.shadowColor = "#ff0000";
    panel.shadowBlur = 25;
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    panel.top = "50px";
    panel.isVisible = false;
    this.ui.addControl(panel);

    const name = new TextBlock("bossName");
    name.text = "BOSS";
    name.color = "#ff4444";
    name.fontSize = 18;
    name.fontFamily = "Orbitron";
    name.fontWeight = "800";
    name.outlineWidth = 3;
    name.outlineColor = "#000000";
    name.shadowColor = "#ff0000";
    name.shadowBlur = 15;
    name.top = "8px";
    name.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    panel.addControl(name);

    const bg = new Rectangle("bossHpBg");
    bg.width = "500px";
    bg.height = "16px";
    bg.background = "rgba(0,0,0,0.6)";
    bg.cornerRadius = 8;
    bg.color = "rgba(200,0,0,0.3)";
    bg.thickness = 1;
    bg.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    bg.top = "-12px";
    panel.addControl(bg);

    const fill = new Rectangle("bossHpFill");
    fill.width = "100%";
    fill.height = "100%";
    fill.background = "#ff2020";
    fill.cornerRadius = 8;
    fill.color = "transparent";
    fill.shadowColor = "#ff0000";
    fill.shadowBlur = 12;
    fill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    bg.addControl(fill);

    this.bossPanel = panel;
    this.bossNameText = name;
    this.bossHpFill = fill;
  }

  _buildRewardPopup() {
    const text = new TextBlock("rewardPopup");
    text.text = "";
    text.color = HUD_COLORS.GOLD;
    text.fontSize = 18;
    text.fontFamily = "Orbitron";
    text.fontWeight = "700";
    text.outlineWidth = 3;
    text.outlineColor = "#000";
    text.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    text.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    text.top = "-180px";
    text.isVisible = false;
    text.shadowColor = HUD_COLORS.GOLD;
    text.shadowBlur = 20;
    this.ui.addControl(text);
    this.rewardPopupText = text;
  }

  _buildStatusMessage() {
    const txt = new TextBlock("statusMsg");
    txt.text = "";
    txt.color = HUD_COLORS.GOLD;
    txt.fontSize = 24;
    txt.fontFamily = "Orbitron";
    txt.fontWeight = "700";
    txt.outlineWidth = 3;
    txt.outlineColor = "#000";
    txt.shadowColor = HUD_COLORS.GOLD;
    txt.shadowBlur = 15;
    txt.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    txt.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    txt.top = "160px";
    txt.isVisible = false;
    this.ui.addControl(txt);
    this.statusText = txt;
  }

  _buildCountdownOverlay() {
    const text = new TextBlock("countdownText");
    text.color = "#ffe033";
    text.fontSize = 140;
    text.fontFamily = "Orbitron";
    text.fontWeight = "900";
    text.outlineWidth = 6;
    text.outlineColor = "#000";
    text.shadowColor = "#ff6600";
    text.shadowBlur = 50;
    text.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    text.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    text.isVisible = false;
    text.isHitTestVisible = false;
    this.ui.addControl(text);
    this.countdownText = text;
  }
}
