import { Rectangle, TextBlock, Control, StackPanel } from "@babylonjs/gui";
import { Vector3, Matrix } from "@babylonjs/core";
import { CONFIG } from "../../config/index.js";
import { HUD_COLORS } from "./HUDTheme.js";

export class CombatFeedUI {
  constructor({ ui, scene }) {
    this.ui = ui;
    this.scene = scene;
    this.comboPanel = null;
    this.comboText = null;
    this.comboDamageText = null;
    this.comboTimer = 0;
    this.killFeed = [];
    this.killFeedItems = [];
    this.clashPanel = null;
    this.clashBar = null;
    this.damageNumbers = [];
  }

  build() {
    this._buildComboCounter();
    this._buildKillFeed();
    this._buildClashIndicator();
    this._buildDamageNumberPool();
  }

  update(delta, { shouldRunHeavyUi }) {
    if (shouldRunHeavyUi) {
      const killFeedDurationMs = (CONFIG.ui.killFeedDuration ?? 5) * 1000;
      const now = Date.now();
      this.killFeed = this.killFeed.filter((entry) => now - entry.createdAt < killFeedDurationMs);
      this._refreshKillFeed();
    }

    if (this.comboPanel?.isVisible) {
      this.comboTimer -= delta;
      if (this.comboTimer <= 0) {
        this.comboPanel.isVisible = false;
      }
    }

    for (const entry of this.damageNumbers) {
      if (!entry.text.isVisible) continue;
      entry.timer += delta;
      const t = entry.timer / entry.duration;
      if (t >= 1) {
        entry.text.isVisible = false;
        continue;
      }
      
      // Anime-style pop-in scale animation
      const scale = t < 0.08 ? (t / 0.08) * 1.6 : (t < 0.2 ? 1.6 - ((t - 0.08) / 0.12) * 0.6 : 1.0);
      entry.text.scaleX = scale;
      entry.text.scaleY = scale;

      // Scatter physics (fountain effect)
      entry.screenX += entry.velX * delta;
      entry.screenY += entry.velY * delta;
      entry.velY += 160 * delta; // Gravity arc
      entry.text.left = `${Math.round(entry.screenX)}px`;
      entry.text.top = `${Math.round(entry.screenY)}px`;
      entry.text.alpha = t < 0.65 ? 1 : 1 - ((t - 0.65) / 0.35);
    }
  }

  showCombo(comboCount, totalDamage) {
    let label;
    let color;
    let size;
    let glowColor;

    if (comboCount >= 20) {
      label = `${comboCount}  HIT\nGODLIKE!!!`;
      color = "#ff00ff";
      size = 60;
      glowColor = "#ff00ff";
    } else if (comboCount >= 15) {
      label = `${comboCount}  HIT\nGOD COMBO!!!`;
      color = "#ff00ff";
      size = 56;
      glowColor = "#ff00ff";
    } else if (comboCount >= 10) {
      label = `${comboCount}  HIT\nULTRA COMBO!!`;
      color = "#ff4400";
      size = 52;
      glowColor = "#ff6600";
    } else if (comboCount >= 5) {
      label = `${comboCount}  HIT COMBO!`;
      color = "#ffe033";
      size = 44;
      glowColor = "#ffaa00";
    } else {
      label = `${comboCount}  HIT COMBO`;
      color = "#ff9900";
      size = 38;
      glowColor = "#ff6600";
    }

    this.comboText.text = label;
    this.comboText.color = color;
    this.comboText.fontSize = size;
    this.comboText.shadowColor = glowColor;
    this.comboText.shadowBlur = comboCount >= 10 ? 35 : 20;
    this.comboDamageText.text = `${totalDamage.toLocaleString()} DMG`;
    this.comboDamageText.color = comboCount >= 10 ? "#ffffff" : HUD_COLORS.GOLD;
    this.comboPanel.isVisible = true;
    this.comboTimer = comboCount >= 10 ? 4 : comboCount >= 5 ? 3 : 2.5;
  }

  addKillFeedEntry(killerName, targetName) {
    const text = `${killerName}  >  ${targetName}`;
    this.killFeed.unshift({ text, createdAt: Date.now() });
    this.killFeed = this.killFeed.slice(0, CONFIG.ui.killFeedMaxItems);
    this._refreshKillFeed();
  }

  showBeamClash(progress = 0.5) {
    this.clashPanel.isVisible = true;
    this.updateClashProgress(progress);
  }

  updateClashProgress(progress) {
    this.clashBar.width = `${Math.round(progress * 100)}%`;
  }

  hideBeamClash() {
    this.clashPanel.isVisible = false;
  }

  spawnDamageNumber(worldPos, damage, impactType = "LIGHT") {
    const camera = this.scene.activeCamera;
    if (!camera) return;

    let entry = this.damageNumbers.find((item) => !item.text.isVisible);
    if (!entry) {
      entry = this.damageNumbers.reduce((a, b) => a.timer > b.timer ? a : b);
    }

    const { width, height } = this.scene.getEngine().getRenderingCanvasClientRect?.() ?? { width: 1280, height: 720 };
    const screenVec = Vector3.Project(
      worldPos.add(new Vector3(0, 1.8, 0)),
      Matrix.Identity(),
      this.scene.getTransformMatrix(),
      camera.viewport.toGlobal(width, height),
    );

    const isHeavy = impactType === "HEAVY";
    const isBlock = impactType === "BLOCK";
    const isCrit = impactType === "CRIT";

    entry.text.text = isBlock ? `(${damage})` : damage.toLocaleString();
    
    // Flashy neon colors & glows based on impact type
    if (isCrit) {
      entry.text.color = "#ff33ff";
      entry.text.shadowColor = "#9900ff";
      entry.text.fontSize = 52;
    } else if (isHeavy) {
      entry.text.color = "#ffea00"; 
      entry.text.shadowColor = "#ea580c"; 
      entry.text.fontSize = 44;
    } else if (isBlock) {
      entry.text.color = "#94a3b8"; 
      entry.text.shadowColor = "#0f172a";
      entry.text.fontSize = 28;
    } else {
      entry.text.color = "#ffffff";
      entry.text.shadowColor = "#0284c7"; 
      entry.text.fontSize = 34;
    }

    // Physics state
    entry.screenX = screenVec.x - width / 2;
    entry.screenY = screenVec.y - height / 2;
    entry.velX = (Math.random() - 0.5) * 120; // Burst outward left/right
    entry.velY = -80 - Math.random() * 80;    // Burst upward

    entry.text.left = `${Math.round(entry.screenX)}px`;
    entry.text.top = `${Math.round(entry.screenY)}px`;
    entry.text.alpha = 1;
    entry.text.scaleX = 0.1;
    entry.text.scaleY = 0.1;
    entry.text.isVisible = true;
    entry.timer = 0;
    entry.duration = isHeavy ? 1.2 : 0.9;
  }

  _buildComboCounter() {
    const panel = new Rectangle("comboPanel");
    panel.width = "500px";
    panel.height = "160px";
    panel.background = "rgba(10,0,20,0.9)";
    panel.cornerRadius = 8;
    panel.color = `${HUD_COLORS.COMBO}CC`;
    panel.thickness = 3;
    panel.shadowColor = HUD_COLORS.COMBO;
    panel.shadowBlur = 40;
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    panel.top = "80px";
    panel.isVisible = false;
    this.ui.addControl(panel);

    const text = new TextBlock("comboText");
    text.text = "0 HIT COMBO";
    text.color = HUD_COLORS.COMBO;
    text.fontSize = 64;
    text.fontFamily = "Orbitron";
    text.fontWeight = "900";
    text.fontStyle = "italic"; // Action slant
    text.outlineWidth = 6;
    text.outlineColor = "#000000";
    text.shadowColor = HUD_COLORS.COMBO;
    text.shadowBlur = 40;
    text.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    text.top = "10px";
    panel.addControl(text);

    const damageText = new TextBlock("comboDamage");
    damageText.text = "";
    damageText.color = HUD_COLORS.GOLD;
    damageText.fontSize = 22;
    damageText.fontFamily = "Orbitron";
    damageText.fontWeight = "700";
    damageText.fontStyle = "italic";
    damageText.outlineWidth = 3;
    damageText.outlineColor = "#000000";
    damageText.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    damageText.top = "-20px";
    panel.addControl(damageText);

    this.comboPanel = panel;
    this.comboText = text;
    this.comboDamageText = damageText;
  }

  _buildKillFeed() {
    const panel = new StackPanel("killFeedPanel");
    panel.isVertical = true;
    panel.width = "280px";
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    panel.top = "60px";
    panel.left = "-20px";
    this.ui.addControl(panel);

    for (let i = 0; i < CONFIG.ui.killFeedMaxItems; i++) {
      const row = new TextBlock(`kf_${i}`);
      row.text = "";
      row.color = HUD_COLORS.KILL_FEED;
      row.fontSize = 13;
      row.fontFamily = "Orbitron";
      row.fontWeight = "500";
      row.fontStyle = "italic";
      row.height = "24px";
      row.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      row.isVisible = false;
      panel.addControl(row);
      this.killFeedItems.push(row);
    }
  }

  _buildClashIndicator() {
    const panel = new Rectangle("clashPanel");
    panel.width = "480px";
    panel.height = "85px";
    panel.background = "rgba(8, 0, 24, 0.95)";
    panel.cornerRadius = 12;
    panel.color = HUD_COLORS.CLASH;
    panel.thickness = 2;
    panel.shadowColor = HUD_COLORS.CLASH;
    panel.shadowBlur = 30;
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    panel.top = "100px";
    panel.isVisible = false;
    this.ui.addControl(panel);

    const label = new TextBlock("clashLabel");
    label.text = "BEAM CLASH";
    label.color = HUD_COLORS.CLASH;
    label.fontSize = 22;
    label.fontFamily = "Orbitron";
    label.fontWeight = "700";
    label.fontStyle = "italic";
    label.outlineWidth = 3;
    label.outlineColor = "#000000";
    label.shadowColor = HUD_COLORS.CLASH;
    label.shadowBlur = 20;
    label.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    label.top = "10px";
    panel.addControl(label);

    const mashHint = new TextBlock("clashMash");
    mashHint.text = "MASH [ SPACE / Z ] TO WIN!";
    mashHint.color = "#ff88cc";
    mashHint.fontSize = 13;
    mashHint.fontFamily = "Rajdhani";
    mashHint.fontWeight = "600";
    mashHint.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    mashHint.top = "38px";
    panel.addControl(mashHint);

    const barBg = new Rectangle("clashBarBg");
    barBg.width = "420px";
    barBg.height = "14px";
    barBg.background = "rgba(0,0,0,0.6)";
    barBg.cornerRadius = 7;
    barBg.color = "rgba(255,32,144,0.3)";
    barBg.thickness = 1;
    barBg.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    barBg.top = "-10px";
    panel.addControl(barBg);

    const barFill = new Rectangle("clashBarFill");
    barFill.width = "50%";
    barFill.height = "100%";
    barFill.background = HUD_COLORS.CLASH;
    barFill.cornerRadius = 7;
    barFill.color = "transparent";
    barFill.shadowColor = HUD_COLORS.CLASH;
    barFill.shadowBlur = 15;
    barFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    barBg.addControl(barFill);

    this.clashPanel = panel;
    this.clashBar = barFill;
  }

  _buildDamageNumberPool() {
    for (let i = 0; i < 20; i++) {
      const txt = new TextBlock(`dmgNum_${i}`);
      txt.color = "#ffffff";
      txt.fontSize = 32;
      txt.fontFamily = "Orbitron";
      txt.fontWeight = "900"; // Maximum thickness
      txt.fontStyle = "italic"; // Punchy slanting damage numbers
      txt.outlineWidth = 5; // Heavy black stroke for readability against explosions
      txt.outlineColor = "#000";
      txt.shadowColor = "#000";
      txt.shadowBlur = 15;
      txt.isVisible = false;
      txt.isHitTestVisible = false;
      this.ui.addControl(txt);
      this.damageNumbers.push({ text: txt, timer: 0, duration: 1, screenX: 0, screenY: 0, velX: 0, velY: 0 });
    }
  }

  _refreshKillFeed() {
    this.killFeedItems.forEach((row, i) => {
      const entry = this.killFeed[i];
      if (entry) {
        row.text = entry.text;
        row.isVisible = true;
      } else {
        row.isVisible = false;
      }
    });
  }
}
