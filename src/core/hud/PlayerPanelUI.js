import { Rectangle, TextBlock, Control } from "@babylonjs/gui";
import { Scalar } from "@babylonjs/core";
import { HUD_COLORS, HUD_SLOT_LAYOUTS, HUD_TRANSFORM_COLORS } from "./HUDTheme.js";

export class PlayerPanelUI {
  constructor({ ui, registry }) {
    this.ui = ui;
    this.registry = registry;
    this.slotPanels = new Map();
    this.localSlot = 0;
    this.frameDelta = 1 / 60;
    this.chargePanel = null;
    this.chargeFill = null;
    this.chargePulse = 0;
  }

  build() {
    this._buildPlayerPanels();
    this._buildChargeIndicator();
  }

  setLocalSlot(slot) {
    this.localSlot = slot;
  }

  update(delta, { shouldRunHeavyUi }) {
    this.frameDelta = delta;

    if (shouldRunHeavyUi) {
      for (const [slot, panel] of this.slotPanels.entries()) {
        const state = this.registry.getState(slot);
        if (!state) {
          panel.container.isVisible = false;
          continue;
        }

        panel.container.isVisible = true;
        this._updateSlotPanel(state, panel);
      }
    }

    if (this.chargePanel) {
      const localState = this.registry.getState(this.localSlot);
      if (localState?.isChargingKi) {
        this.chargePanel.isVisible = true;
        this.chargePulse += delta * 4;
        const pulse = 0.5 + 0.5 * Math.sin(this.chargePulse);
        const kiPct = Math.min(1, localState.ki / (localState.maxKi || 1));
        this.chargeFill.width = `${Math.round(kiPct * 100)}%`;
        this.chargePanel.color = `rgba(168,85,247,${0.5 + pulse * 0.5})`;
        this.chargeFill.background = `linear-gradient(90deg, #cc00ff, #${Math.floor(200 + pulse * 55).toString(16)}00ff)`;
      } else {
        this.chargePanel.isVisible = false;
        this.chargePulse = 0;
      }
    }
  }

  handleTransformChanged(slot) {
    const panel = this.slotPanels.get(slot);
    if (!panel) return;
    const originalBackground = panel.container.background;
    panel.container.background = "rgba(251,191,36,0.35)";
    setTimeout(() => {
      if (panel.container) panel.container.background = originalBackground;
    }, 500);
  }

  handlePlayerDied(slot) {
    const panel = this.slotPanels.get(slot);
    if (!panel) return;
    panel.nameText.color = "#ef4444";
    panel.hpFill.background = "#ef4444";
    panel.hpFill.shadowColor = "#ef4444";
  }

  _buildPlayerPanels() {
    for (let slot = 0; slot < HUD_SLOT_LAYOUTS.length; slot++) {
      const panel = this._buildSlotPanel(slot, HUD_SLOT_LAYOUTS[slot]);
      this.slotPanels.set(slot, panel);
    }
  }

  _buildSlotPanel(slot, layout) {
    const isRight = layout.h === "right";
    const slotColor = HUD_COLORS.SLOT_COLORS[slot];

    const container = new Rectangle(`slot_${slot}_container`);
    container.width = "340px";
    container.height = "120px";
    container.cornerRadius = 4;
    container.color = `${slotColor}AA`;
    container.thickness = 3;
    container.background = HUD_COLORS.PANEL_BG;
    container.shadowColor = slotColor;
    container.shadowBlur = 25;
    container.horizontalAlignment = isRight ? Control.HORIZONTAL_ALIGNMENT_RIGHT : Control.HORIZONTAL_ALIGNMENT_LEFT;
    container.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    container.left = `${layout.x}px`;
    container.top = `${layout.y}px`;
    this.ui.addControl(container);

    const accent = new Rectangle(`slot_${slot}_accent`);
    accent.width = "8px";
    accent.height = "100%";
    accent.background = HUD_COLORS.BORDER;
    accent.shadowColor = slotColor;
    accent.shadowBlur = 16;
    accent.horizontalAlignment = isRight ? Control.HORIZONTAL_ALIGNMENT_RIGHT : Control.HORIZONTAL_ALIGNMENT_LEFT;
    accent.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    container.addControl(accent);

    const nameText = new TextBlock(`slot_${slot}_name`);
    nameText.text = "---";
    nameText.color = HUD_COLORS.TEXT;
    nameText.fontSize = 18;
    nameText.fontFamily = "Orbitron";
    nameText.fontWeight = "800";
    nameText.fontStyle = "italic";
    nameText.outlineWidth = 3;
    nameText.outlineColor = "#000000";
    nameText.shadowColor = slotColor;
    nameText.shadowBlur = 12;
    nameText.horizontalAlignment = isRight ? Control.HORIZONTAL_ALIGNMENT_RIGHT : Control.HORIZONTAL_ALIGNMENT_LEFT;
    nameText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    nameText.left = isRight ? "-20px" : "20px";
    nameText.top = "12px";
    container.addControl(nameText);

    const formText = new TextBlock(`slot_${slot}_form`);
    formText.text = "";
    formText.color = HUD_COLORS.GOLD;
    formText.fontSize = 14;
    formText.fontFamily = "Orbitron";
    formText.fontStyle = "italic";
    formText.fontWeight = "700";
    formText.outlineWidth = 3;
    formText.outlineColor = "#000000";
    formText.shadowColor = HUD_COLORS.GOLD;
    formText.shadowBlur = 15;
    formText.horizontalAlignment = isRight ? Control.HORIZONTAL_ALIGNMENT_RIGHT : Control.HORIZONTAL_ALIGNMENT_LEFT;
    formText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    formText.left = isRight ? "-20px" : "20px";
    formText.top = "36px";
    container.addControl(formText);

    const plText = new TextBlock(`slot_${slot}_pl`);
    plText.text = "PL: ---";
    plText.color = HUD_COLORS.NEON_GLOW;
    plText.fontSize = 13;
    plText.fontFamily = "Orbitron";
    plText.fontWeight = "600";
    plText.fontStyle = "italic";
    plText.horizontalAlignment = isRight ? Control.HORIZONTAL_ALIGNMENT_RIGHT : Control.HORIZONTAL_ALIGNMENT_LEFT;
    plText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    plText.left = isRight ? "-20px" : "20px";
    plText.top = "56px";
    container.addControl(plText);

    const hpBg = new Rectangle(`slot_${slot}_hpBg`);
    hpBg.width = "280px";
    hpBg.height = "20px";
    hpBg.background = HUD_COLORS.BAR_BG;
    hpBg.cornerRadius = 4;
    hpBg.color = HUD_COLORS.CHROME;
    hpBg.thickness = 2;
    hpBg.horizontalAlignment = isRight ? Control.HORIZONTAL_ALIGNMENT_RIGHT : Control.HORIZONTAL_ALIGNMENT_LEFT;
    hpBg.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    hpBg.left = isRight ? "-20px" : "20px";
    hpBg.top = "-44px";
    container.addControl(hpBg);

    const hpFill = new Rectangle(`slot_${slot}_hpFill`);
    hpFill.width = "100%";
    hpFill.height = "100%";
    hpFill.background = HUD_COLORS.HP;
    hpFill.cornerRadius = 4;
    hpFill.color = "transparent";
    hpFill.shadowColor = HUD_COLORS.HP;
    hpFill.shadowBlur = 15;
    hpFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    hpBg.addControl(hpFill);

    const hpGhostFill = new Rectangle(`slot_${slot}_hpGhostFill`);
    hpGhostFill.width = "100%";
    hpGhostFill.height = "100%";
    hpGhostFill.background = `${HUD_COLORS.AURA_PINK}66`;
    hpGhostFill.cornerRadius = 4;
    hpGhostFill.color = "transparent";
    hpGhostFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    hpBg.addControl(hpGhostFill);
    hpBg.removeControl(hpFill);
    hpBg.addControl(hpFill);

    const hpLabel = new TextBlock(`slot_${slot}_hpLabel`);
    hpLabel.text = "HP";
    hpLabel.color = "rgba(255,255,255,0.9)";
    hpLabel.fontSize = 12;
    hpLabel.fontFamily = "Orbitron";
    hpLabel.fontWeight = "800";
    hpLabel.fontStyle = "italic";
    hpLabel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    hpLabel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    hpLabel.left = "8px";
    hpBg.addControl(hpLabel);

    const kiBg = new Rectangle(`slot_${slot}_kiBg`);
    kiBg.width = "280px";
    kiBg.height = "14px";
    kiBg.background = HUD_COLORS.BAR_BG;
    kiBg.cornerRadius = 3;
    kiBg.color = HUD_COLORS.CHROME;
    kiBg.thickness = 1.5;
    kiBg.horizontalAlignment = isRight ? Control.HORIZONTAL_ALIGNMENT_RIGHT : Control.HORIZONTAL_ALIGNMENT_LEFT;
    kiBg.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    kiBg.left = isRight ? "-20px" : "20px";
    kiBg.top = "-24px";
    container.addControl(kiBg);

    const kiFill = new Rectangle(`slot_${slot}_kiFill`);
    kiFill.width = "100%";
    kiFill.height = "100%";
    kiFill.background = HUD_COLORS.KI;
    kiFill.cornerRadius = 3;
    kiFill.color = "transparent";
    kiFill.shadowColor = HUD_COLORS.KI_CHARGING;
    kiFill.shadowBlur = 18;
    kiFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    kiBg.addControl(kiFill);

    const stBg = new Rectangle(`slot_${slot}_stBg`);
    stBg.width = "280px";
    stBg.height = "8px";
    stBg.background = HUD_COLORS.BAR_BG;
    stBg.cornerRadius = 2;
    stBg.color = HUD_COLORS.CHROME;
    stBg.horizontalAlignment = isRight ? Control.HORIZONTAL_ALIGNMENT_RIGHT : Control.HORIZONTAL_ALIGNMENT_LEFT;
    stBg.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    stBg.left = isRight ? "-20px" : "20px";
    stBg.top = "-10px";
    container.addControl(stBg);

    const stFill = new Rectangle(`slot_${slot}_stFill`);
    stFill.width = "100%";
    stFill.height = "100%";
    stFill.background = HUD_COLORS.STAMINA;
    stFill.cornerRadius = 2;
    stFill.color = "transparent";
    stFill.shadowColor = HUD_COLORS.GOLD;
    stFill.shadowBlur = 12;
    stFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    stBg.addControl(stFill);

    return {
      container,
      nameText,
      formText,
      plText,
      hpBg,
      hpFill,
      hpGhostFill,
      kiFill,
      stFill,
      displayedHpRatio: 1,
      ghostHpRatio: 1,
      hpPulseTimer: 0,
    };
  }

  _buildChargeIndicator() {
    const panel = new Rectangle("chargePanel");
    panel.width = "320px";
    panel.height = "55px";
    panel.background = "rgba(10, 0, 25, 0.95)";
    panel.cornerRadius = 8;
    panel.color = "#cc00ff";
    panel.thickness = 2;
    panel.shadowColor = "#cc00ff";
    panel.shadowBlur = 25;
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    panel.top = "-140px";
    panel.isVisible = false;
    this.ui.addControl(panel);

    const label = new TextBlock("chargeLabel");
    label.text = "POWERING UP!!";
    label.color = "#ee88ff";
    label.fontSize = 16;
    label.fontFamily = "Orbitron";
    label.fontWeight = "700";
    label.outlineWidth = 2;
    label.outlineColor = "#000000";
    label.shadowColor = "#cc00ff";
    label.shadowBlur = 15;
    label.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    label.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    label.top = "6px";
    panel.addControl(label);

    const barBg = new Rectangle("chargeBg");
    barBg.width = "280px";
    barBg.height = "12px";
    barBg.background = "rgba(180,0,255,0.25)";
    barBg.cornerRadius = 6;
    barBg.color = "rgba(200,0,255,0.3)";
    barBg.thickness = 1;
    barBg.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    barBg.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    barBg.top = "-8px";
    panel.addControl(barBg);

    const fill = new Rectangle("chargeFill");
    fill.width = "0%";
    fill.height = "100%";
    fill.background = "linear-gradient(90deg, #cc00ff, #ff00ff)";
    fill.cornerRadius = 6;
    fill.color = "transparent";
    fill.shadowColor = "#cc00ff";
    fill.shadowBlur = 15;
    fill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    barBg.addControl(fill);

    this.chargePanel = panel;
    this.chargeFill = fill;
  }

  _updateSlotPanel(state, panel) {
    panel.nameText.text = state.characterDef?.label ?? "---";
    panel.nameText.color = state.isDead ? "#ef4444" : HUD_COLORS.TEXT;
    panel.container.alpha = state.isDead ? 0.5 : 1;

    const form = state.currentTransform;
    panel.formText.text = state.isDead ? "KO" : (form ? form.label : "");
    panel.formText.color = form ? (HUD_TRANSFORM_COLORS[form.id] ?? HUD_COLORS.GOLD) : HUD_COLORS.GOLD;
    panel.formText.shadowBlur = form ? 15 : 0;
    panel.plText.text = `PL: ${state.powerLevel.toLocaleString()}`;

    const hpPct = Math.max(0, state.hp / state.maxHP);
    const prevDisplayed = panel.displayedHpRatio ?? hpPct;
    const prevGhost = panel.ghostHpRatio ?? hpPct;
    const frontLerp = hpPct < prevDisplayed ? 0.6 : 0.3;
    panel.displayedHpRatio = Scalar.Lerp(prevDisplayed, hpPct, frontLerp);
    if (Math.abs(panel.displayedHpRatio - hpPct) < 0.002) panel.displayedHpRatio = hpPct;

    if (hpPct < prevDisplayed - 0.01) {
      panel.ghostHpRatio = Math.max(prevGhost, prevDisplayed);
      panel.hpPulseTimer = 0.25;
    } else {
      panel.ghostHpRatio = Math.max(hpPct, Scalar.Lerp(prevGhost, hpPct, 0.1));
      if (Math.abs(panel.ghostHpRatio - hpPct) < 0.002) panel.ghostHpRatio = hpPct;
    }

    panel.hpFill.width = `${Math.round(panel.displayedHpRatio * 100)}%`;
    panel.hpGhostFill.width = `${Math.round(panel.ghostHpRatio * 100)}%`;

    const hpColor = hpPct < 0.25 ? HUD_COLORS.HP_LOW : hpPct < 0.5 ? HUD_COLORS.HP_MED : HUD_COLORS.HP;
    panel.hpFill.background = hpColor;
    panel.hpFill.shadowColor = hpColor;

    if (panel.hpPulseTimer > 0) {
      panel.hpPulseTimer = Math.max(0, panel.hpPulseTimer - this.frameDelta);
      const pulse = panel.hpPulseTimer / 0.25;
      panel.hpBg.thickness = pulse > 0 ? 1 + Math.round(pulse * 3) : 1;
      panel.hpBg.color = pulse > 0 ? `rgba(255,255,255,${0.1 + pulse * 0.5})` : "rgba(255,255,255,0.08)";
    } else {
      panel.hpBg.thickness = 1;
      panel.hpBg.color = "rgba(255,255,255,0.08)";
    }

    const kiPct = Math.max(0, state.ki / state.maxKi);
    panel.kiFill.width = `${Math.round(kiPct * 100)}%`;
    const kiColor = state.isChargingKi ? HUD_COLORS.KI_CHARGING : HUD_COLORS.KI;
    panel.kiFill.background = kiColor;
    panel.kiFill.shadowColor = kiColor;

    const stPct = Math.max(0, state.stamina / state.maxStamina);
    panel.stFill.width = `${Math.round(stPct * 100)}%`;
  }
}
