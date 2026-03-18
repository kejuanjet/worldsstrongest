// src/ui/TrainingHUD.js
// Training Mode HUD - displays damage meters, combo counters, and dummy controls

import { Vector3, Matrix } from "@babylonjs/core";
import {
  AdvancedDynamicTexture,
  TextBlock,
  Rectangle,
  StackPanel,
  Button,
  Control,
  Grid,
} from "@babylonjs/gui";

// ─── TrainingHUD ───────────────────────────────────────────────────────────────

export class TrainingHUD {
  /**
   * @param {import("@babylonjs/core").Scene} scene
   * @param {import("../core/CharacterRegistry").CharacterRegistry} registry
   * @param {import("../ai/TrainingDummy").TrainingDummyManager} dummyManager
   */
  constructor(scene, registry, dummyManager) {
    this.scene = scene;
    this.registry = registry;
    this.dummyManager = dummyManager;
    
    // Create the main UI layer
    this.advancedTexture = AdvancedDynamicTexture.CreateFullscreenUI("TrainingHUD", true, scene);
    
    // State
    this.visible = false;
    this.lastHitTime = 0;
    this.firstHitTime = 0;
    this.damageSinceLastUpdate = 0;
    this.damageNumbers = [];
    
    // Configuration
    this.damageNumberDuration = 1.5;
    this.damageNumberFadeStart = 1.0;
    
    // Toggle states
    this.godMode = false;
    this.showDamageNumbers = true;
    this.hitStop = true;
    
    // Build the UI
    this._buildLayout();
    
    console.log("[TrainingHUD] Initialized");
  }

  _buildLayout() {
    // Main container
    this.mainContainer = new Rectangle("trainingMainContainer");
    this.mainContainer.width = "100%";
    this.mainContainer.height = "100%";
    this.mainContainer.thickness = 0;
    this.mainContainer.isVisible = this.visible;
    this.advancedTexture.addControl(this.mainContainer);
    
    // Create panels
    this._createStatsPanel();
    this._createDummyControlPanel();
    this._createHelpPanel();
  }

  _createStatsPanel() {
    // Left side stats panel
    this.statsPanel = new Rectangle("trainingStatsPanel");
    this.statsPanel.width = "280px";
    this.statsPanel.height = "320px";
    this.statsPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.statsPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.statsPanel.left = "20px";
    this.statsPanel.top = "80px";
    this.statsPanel.thickness = 0;
    this.statsPanel.background = "rgba(10, 15, 30, 0.85)";
    this.mainContainer.addControl(this.statsPanel);
    
    // Stats stack
    const statsStack = new StackPanel("trainingStatsStack");
    statsStack.width = "260px";
    statsStack.isVertical = true;
    statsStack.paddingTop = "10px";
    this.statsPanel.addControl(statsStack);
    
    // Title
    const title = this._createTextBlock("trainingTitle", "TRAINING STATS", {
      fontSize: 18,
      fontWeight: "bold",
      color: "#fbbf24",
      textHorizontalAlignment: Control.HORIZONTAL_ALIGNMENT_CENTER,
    });
    statsStack.addControl(title);
    
    // Divider
    statsStack.addControl(this._createDivider());
    
    // Stats labels
    this.totalDamageText = this._createStatRow("Total Damage:", "0", statsStack);
    this.hitCountText = this._createStatRow("Hits:", "0", statsStack);
    this.maxComboText = this._createStatRow("Max Combo:", "0", statsStack);
    this.dpsText = this._createStatRow("DPS:", "0", statsStack);
    
    // Divider
    statsStack.addControl(this._createDivider());
    
    // Current combo (large display)
    this.comboDisplay = this._createTextBlock("comboDisplay", "", {
      fontSize: 48,
      fontWeight: "bold",
      color: "#f97316",
      textHorizontalAlignment: Control.HORIZONTAL_ALIGNMENT_CENTER,
      height: "60px",
    });
    statsStack.addControl(this.comboDisplay);
    
    // Combo label
    const comboLabel = this._createTextBlock("comboLabel", "COMBO", {
      fontSize: 14,
      color: "#94a3b8",
      textHorizontalAlignment: Control.HORIZONTAL_ALIGNMENT_CENTER,
    });
    statsStack.addControl(comboLabel);
    
    // Divider
    statsStack.addControl(this._createDivider());
    
    // Player resources
    this._createStatRow("HP:", "100%", statsStack, "hpValue");
    this._createStatRow("Ki:", "100%", statsStack, "kiValue");
  }

  _createDummyControlPanel() {
    // Right side control panel
    this.controlPanel = new Rectangle("trainingControlPanel");
    this.controlPanel.width = "300px";
    this.controlPanel.height = "380px";
    this.controlPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.controlPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.controlPanel.left = "-20px";
    this.controlPanel.top = "80px";
    this.controlPanel.thickness = 0;
    this.controlPanel.background = "rgba(10, 15, 30, 0.85)";
    this.mainContainer.addControl(this.controlPanel);
    
    // Control stack
    const controlStack = new StackPanel("trainingControlStack");
    controlStack.width = "280px";
    controlStack.isVertical = true;
    controlStack.paddingTop = "10px";
    this.controlPanel.addControl(controlStack);
    
    // Title
    const title = this._createTextBlock("controlTitle", "DUMMY CONTROLS", {
      fontSize: 18,
      fontWeight: "bold",
      color: "#fbbf24",
      textHorizontalAlignment: Control.HORIZONTAL_ALIGNMENT_CENTER,
    });
    controlStack.addControl(title);
    
    // Divider
    controlStack.addControl(this._createDivider());
    
    // Spawn buttons
    const spawnLabel = this._createTextBlock("spawnLabel", "Spawn Dummy:", {
      fontSize: 14,
      color: "#94a3b8",
      textHorizontalAlignment: Control.HORIZONTAL_ALIGNMENT_LEFT,
      paddingLeft: "10px",
    });
    controlStack.addControl(spawnLabel);
    
    // Spawn buttons grid
    const spawnGrid = new Grid("spawnGrid");
    spawnGrid.width = "260px";
    spawnGrid.height = "120px";
    spawnGrid.addColumnDefinition(0.5);
    spawnGrid.addColumnDefinition(0.5);
    spawnGrid.addRowDefinition(0.5);
    spawnGrid.addRowDefinition(0.5);
    controlStack.addControl(spawnGrid);
    
    // Add spawn buttons
    this._addSpawnButton(spawnGrid, 0, 0, "BASIC", "Basic", "#6b7280");
    this._addSpawnButton(spawnGrid, 1, 0, "BLOCKING", "Blocking", "#d97706");
    this._addSpawnButton(spawnGrid, 0, 1, "MOVING", "Moving", "#16a34a");
    this._addSpawnButton(spawnGrid, 1, 1, "EVASIVE", "Evasive", "#6366f1");
    
    // Divider
    controlStack.addControl(this._createDivider());
    
    // Action buttons
    const actionStack = new StackPanel("actionStack");
    actionStack.isVertical = false;
    actionStack.height = "50px";
    actionStack.width = "260px";
    controlStack.addControl(actionStack);
    
    // Reset button
    const resetBtn = this._createButton("resetBtn", "Reset", "#3b82f6", () => {
      this.dummyManager?.resetAll();
      this._resetStats();
    });
    resetBtn.width = "125px";
    actionStack.addControl(resetBtn);
    
    // Clear button
    const clearBtn = this._createButton("clearBtn", "Clear", "#ef4444", () => {
      this.dummyManager?.clearAll();
    });
    clearBtn.width = "125px";
    actionStack.addControl(clearBtn);
    
    // Divider
    controlStack.addControl(this._createDivider());
    
    // Toggles
    this._createToggle("godMode", "God Mode (Unlimited HP/Ki)", controlStack);
    this._createToggle("showDamageNumbers", "Show Damage Numbers", controlStack, true);
    this._createToggle("hitStop", "Hit Stop Effect", controlStack, true);
  }

  _addSpawnButton(grid, col, row, type, label, color) {
    const btn = this._createButton(`spawn_${type}`, label, color, () => {
      const playerState = this.registry?.getState(0);
      if (playerState) {
        const spawnPos = playerState.position.add(new Vector3(0, 0, 10));
        this.dummyManager?.spawnDummy(type, spawnPos);
      }
    });
    grid.addControl(btn, row, col);
  }

  _createHelpPanel() {
    // Bottom help panel
    this.helpPanel = new Rectangle("trainingHelpPanel");
    this.helpPanel.width = "600px";
    this.helpPanel.height = "60px";
    this.helpPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.helpPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    this.helpPanel.left = "0px";
    this.helpPanel.top = "-20px";
    this.helpPanel.thickness = 0;
    this.helpPanel.background = "rgba(10, 15, 30, 0.75)";
    this.mainContainer.addControl(this.helpPanel);
    
    const helpStack = new StackPanel("helpStack");
    helpStack.isVertical = false;
    helpStack.height = "50px";
    this.helpPanel.addControl(helpStack);
    
    // Help text
    const helpText = this._createTextBlock("helpText", 
      "LMB: Light Attack | RMB: Heavy Attack | Q: Ki Blast | R: Ultimate | Space: Fly | F: Block",
      { fontSize: 13, color: "#94a3b8", textHorizontalAlignment: Control.HORIZONTAL_ALIGNMENT_CENTER }
    );
    helpStack.addControl(helpText);
  }

  _createTextBlock(name, text, options = {}) {
    const tb = new TextBlock(name, text);
    tb.color = options.color || "#ffffff";
    tb.fontSize = options.fontSize || 16;
    tb.fontFamily = "Rajdhani, sans-serif";
    tb.fontWeight = options.fontWeight || "normal";
    tb.textHorizontalAlignment = options.textHorizontalAlignment || Control.HORIZONTAL_ALIGNMENT_LEFT;
    tb.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    if (options.height) tb.height = options.height;
    if (options.paddingLeft) tb.paddingLeft = options.paddingLeft;
    return tb;
  }

  _createStatRow(label, value, parent, nameSuffix = "") {
    const row = new StackPanel(`statRow_${nameSuffix}`);
    row.isVertical = false;
    row.height = "28px";
    row.width = "240px";
    parent.addControl(row);
    
    const labelText = this._createTextBlock(`statLabel_${nameSuffix}`, label, {
      fontSize: 14,
      color: "#94a3b8",
      width: "120px",
    });
    row.addControl(labelText);
    
    const valueText = this._createTextBlock(`statValue_${nameSuffix}`, value, {
      fontSize: 16,
      fontWeight: "bold",
      color: "#ffffff",
      width: "120px",
    });
    row.addControl(valueText);
    
    if (nameSuffix) {
      this[`${nameSuffix}Text`] = valueText;
    }
    
    return row;
  }

  _createDivider() {
    const divider = new Rectangle("divider");
    divider.height = "1px";
    divider.width = "240px";
    divider.thickness = 0;
    divider.background = "#334155";
    divider.paddingTop = "8px";
    divider.paddingBottom = "8px";
    return divider;
  }

  _createButton(name, text, color, callback) {
    const btn = Button.CreateSimpleButton(name, text);
    btn.width = "100%";
    btn.height = "40px";
    btn.color = "#ffffff";
    btn.fontSize = 14;
    btn.fontFamily = "Rajdhani, sans-serif";
    btn.fontWeight = "bold";
    btn.background = color;
    btn.cornerRadius = 6;
    btn.thickness = 0;
    btn.paddingLeft = "4px";
    btn.paddingRight = "4px";
    btn.paddingTop = "2px";
    btn.paddingBottom = "2px";
    btn.onPointerUpObservable.add(callback);
    return btn;
  }

  _createToggle(name, label, parent, defaultValue = false) {
    const row = new StackPanel(`toggleRow_${name}`);
    row.isVertical = false;
    row.height = "32px";
    row.width = "260px";
    parent.addControl(row);
    
    const toggle = Button.CreateSimpleButton(`toggle_${name}`, "");
    toggle.width = "40px";
    toggle.height = "24px";
    toggle.cornerRadius = 12;
    toggle.thickness = 0;
    toggle.background = defaultValue ? "#22c55e" : "#374151";
    toggle.onPointerUpObservable.add(() => {
      this[name] = !this[name];
      toggle.background = this[name] ? "#22c55e" : "#374151";
    });
    row.addControl(toggle);
    
    const labelText = this._createTextBlock(`toggleLabel_${name}`, label, {
      fontSize: 13,
      color: "#e2e8f0",
      width: "200px",
      paddingLeft: "10px",
    });
    row.addControl(labelText);
    
    this[name] = defaultValue;
  }

  _resetStats() {
    this.lastHitTime = 0;
    this.firstHitTime = 0;
    this.damageSinceLastUpdate = 0;
  }

  // ─── Public Methods ─────────────────────────────────────────────────────────

  show() {
    this.visible = true;
    this.mainContainer.isVisible = true;
    console.log("[TrainingHUD] Shown");
  }

  hide() {
    this.visible = false;
    this.mainContainer.isVisible = false;
    console.log("[TrainingHUD] Hidden");
  }

  toggle() {
    if (this.visible) this.hide();
    else this.show();
  }

  /**
   * Update the HUD each frame
   * @param {number} delta - Time since last frame in seconds
   */
  update(delta) {
    if (!this.visible) return;
    
    // Update player resource displays
    const playerState = this.registry?.getState(0);
    if (playerState) {
      const hpPercent = Math.round((playerState.hp / playerState.maxHP) * 100);
      const kiPercent = Math.round((playerState.ki / playerState.maxKi) * 100);
      
      if (this.hpValueText) {
        this.hpValueText.text = `${hpPercent}%`;
        this.hpValueText.color = hpPercent > 50 ? "#22c55e" : hpPercent > 25 ? "#fbbf24" : "#ef4444";
      }
      if (this.kiValueText) {
        this.kiValueText.text = `${kiPercent}%`;
        this.kiValueText.color = kiPercent > 30 ? "#3b82f6" : "#ef4444";
      }
    }
    
    // Get dummy stats
    const stats = this.dummyManager?.getTotalStats() || { totalDamage: 0, totalHits: 0, maxCombo: 0 };
    
    // Update stats display
    if (this.totalDamageText) {
      const children = this.totalDamageText.children;
      if (children && children[1]) {
        children[1].text = stats.totalDamage.toLocaleString();
      }
    }
    
    if (this.hitCountText) {
      const children = this.hitCountText.children;
      if (children && children[1]) {
        children[1].text = stats.totalHits.toString();
      }
    }
    
    if (this.maxComboText) {
      const children = this.maxComboText.children;
      if (children && children[1]) {
        children[1].text = stats.maxCombo.toString();
      }
    }
    
    // Calculate DPS
    if (this.dpsText && this.lastHitTime && this.firstHitTime) {
      const timeSinceFirstHit = (performance.now() - this.firstHitTime) / 1000;
      const dps = timeSinceFirstHit > 0 ? Math.round(stats.totalDamage / timeSinceFirstHit) : 0;
      const children = this.dpsText.children;
      if (children && children[1]) {
        children[1].text = dps.toLocaleString() + "/s";
      }
    }
    
    // Update combo display
    if (this.comboDisplay) {
      const maxCombo = stats.maxCombo;
      if (maxCombo > 1) {
        this.comboDisplay.text = `${maxCombo}`;
        this.comboDisplay.color = maxCombo >= 10 ? "#ef4444" : maxCombo >= 5 ? "#f97316" : "#fbbf24";
      } else {
        this.comboDisplay.text = "";
      }
    }
    
    // Update damage numbers
    this._updateDamageNumbers(delta);
  }

  /**
   * Record a hit on a dummy for display
   */
  recordHit(damage, position, blocked = false, dodged = false) {
    if (!this.visible || !this.showDamageNumbers) return;
    
    this.lastHitTime = performance.now();
    if (!this.firstHitTime) this.firstHitTime = this.lastHitTime;
    this.damageSinceLastUpdate += damage;
    
    // Create damage number at the position
    this._createDamageNumber(damage, position, blocked, dodged);
  }

  _createDamageNumber(damage, position, blocked, dodged) {
    if (!this.scene.activeCamera) return;

    const damageText = new TextBlock();
    damageText.text = dodged ? "DODGE!" : blocked ? "BLOCKED" : damage.toString();
    damageText.color = dodged ? "#94a3b8" : blocked ? "#fbbf24" : "#ef4444";
    damageText.fontSize = dodged || blocked ? 24 : 32;
    damageText.fontWeight = "bold";
    damageText.fontFamily = "Rajdhani, sans-serif";
    damageText.outlineWidth = 2;
    damageText.outlineColor = "#000000";

    this.advancedTexture.addControl(damageText);

    // Position in screen space
    const screenPos = Vector3.Project(
      position.add(new Vector3(0, 2, 0)),
      Matrix.Identity(),
      this.scene.getTransformMatrix(),
      this.scene.activeCamera.viewport.toGlobal(
        this.scene.getEngine().getRenderWidth(),
        this.scene.getEngine().getRenderHeight()
      )
    );

    damageText.left = `${screenPos.x}px`;
    damageText.top = `${screenPos.y}px`;

    // Animate up and fade
    const startTime = performance.now();
    const startY = screenPos.y;

    const animateNumber = () => {
      if (this._disposed) { damageText.dispose(); return; }
      const elapsed = (performance.now() - startTime) / 1000;
      if (elapsed >= this.damageNumberDuration) {
        damageText.dispose();
        return;
      }

      const progress = elapsed / this.damageNumberDuration;
      damageText.top = `${startY - (progress * 80)}px`;

      if (elapsed >= this.damageNumberFadeStart) {
        const fadeProgress = (elapsed - this.damageNumberFadeStart) / (this.damageNumberDuration - this.damageNumberFadeStart);
        damageText.alpha = 1 - fadeProgress;
      }

      requestAnimationFrame(animateNumber);
    };

    animateNumber();
  }

  _updateDamageNumbers(delta) {
    const now = performance.now();
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const dn = this.damageNumbers[i];
      if (now - dn.createdAt >= this.damageNumberDuration * 1000) {
        dn.control.dispose();
        this.damageNumbers.splice(i, 1);
      }
    }
  }

  dispose() {
    this._disposed = true;
    this.advancedTexture.dispose();
    console.log("[TrainingHUD] Disposed");
  }
}
