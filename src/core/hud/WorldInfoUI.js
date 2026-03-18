import { TextBlock, Ellipse, Control, Rectangle } from "@babylonjs/gui";
import { Vector3, Matrix } from "@babylonjs/core";
import { CONFIG } from "../../config/index.js";
import { HUD_COLORS } from "./HUDTheme.js";

/* Reusable head-offset vector — avoids allocating every frame per target */
const _HEAD_OFFSET = new Vector3(0, 1.8, 0);
const _scratchWorldPos = Vector3.Zero();
const _IDENTITY = Matrix.Identity();

export class WorldInfoUI {
  constructor({ ui, scene, registry, sessionManager }) {
    this.ui = ui;
    this.scene = scene;
    this.registry = registry;
    this.sessionManager = sessionManager;
    this.zoneLabelText = null;
    this.latencyText = null;

    // Lock-on UI elements
    this.lockOnRing = null;
    this.lockOnLabel = null;
    this.lockOnPulse = 0;

    // Soft lock indicator
    this.softLockIndicator = null;
    this.softLockPulse = 0;

    // Candidate markers
    this.candidateMarkers = new Map();
    this.candidatePool = [];
    this.maxCandidateMarkers = CONFIG.performance?.candidateMarkerLimit ?? 4;
    this._projectionContext = null;

    this.inputManager = null;
    this.openWorldDirector = null;
    this.discoveryText = null;
    this.travelPromptText = null;
  }

  build() {
    this._buildZoneLabel();
    this._buildLatencyDisplay();
    this._buildExplorationStatus();
    this._buildLockOnIndicator();
    this._buildSoftLockIndicator();
    this._buildCandidateMarkerPool();
  }

  setInputManager(inputManager) {
    this.inputManager = inputManager;
  }

  setOpenWorldDirector(openWorldDirector) {
    this.openWorldDirector = openWorldDirector;
  }

  setZoneLabel(label) {
    this.zoneLabelText.text = label ? `[${label}]` : "";
  }

  showZoneTransition(label) {
    this.zoneLabelText.text = `-> ${label}`;
    this.zoneLabelText.color = HUD_COLORS.TEXT;
    setTimeout(() => {
      if (!this.zoneLabelText) return;
      this.zoneLabelText.text = `[${label}]`;
      this.zoneLabelText.color = HUD_COLORS.TEXT_DIM;
    }, 3000);
  }

  update(delta, { shouldRunHeavyUi }) {
    if (!shouldRunHeavyUi) return;

    if (this.sessionManager.role === "CLIENT") {
      const ms = this.sessionManager.latency;
      this.latencyText.color = ms < 60 ? "#22c55e" : ms < 120 ? "#f59e0b" : "#ef4444";
      this.latencyText.text = `${ms}ms`;
    } else if (this.sessionManager.role === "HOST") {
      this.latencyText.color = HUD_COLORS.TEXT_DIM;
      this.latencyText.text = "HOST";
    } else {
      this.latencyText.text = "";
    }

    this._projectionContext = this._buildProjectionContext();
    this._updateLockOnIndicator(delta, this._projectionContext);
    this._updateSoftLockIndicator(delta, this._projectionContext);
    this._updateCandidateMarkers(delta, this._projectionContext);
    this._updateExplorationStatus();
  }

  _buildZoneLabel() {
    const text = new TextBlock("zoneLabel");
    text.text = "";
    text.color = HUD_COLORS.TEXT_DIM;
    text.fontSize = 13;
    text.fontFamily = "Orbitron";
    text.fontWeight = "500";
    text.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    text.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    text.top = "20px";
    this.ui.addControl(text);
    this.zoneLabelText = text;
  }

  _buildLatencyDisplay() {
    const text = new TextBlock("latencyText");
    text.text = "";
    text.color = HUD_COLORS.TEXT_DIM;
    text.fontSize = 12;
    text.fontFamily = "Orbitron";
    text.fontWeight = "600";
    text.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    text.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    text.left = "20px";
    text.top = "60px";
    this.ui.addControl(text);
    this.latencyText = text;
  }

  _buildExplorationStatus() {
    const discovery = new TextBlock("landmarkDiscoveryText");
    discovery.text = "";
    discovery.color = "#8be9ff";
    discovery.fontSize = 12;
    discovery.fontFamily = "Orbitron";
    discovery.fontWeight = "600";
    discovery.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    discovery.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    discovery.right = "20px";
    discovery.top = "58px";
    this.ui.addControl(discovery);
    this.discoveryText = discovery;

    const prompt = new TextBlock("travelPromptText");
    prompt.text = "";
    prompt.color = "#f6d365";
    prompt.fontSize = 12;
    prompt.fontFamily = "Orbitron";
    prompt.fontWeight = "600";
    prompt.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    prompt.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    prompt.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    prompt.right = "20px";
    prompt.top = "78px";
    this.ui.addControl(prompt);
    this.travelPromptText = prompt;
  }

  _buildLockOnIndicator() {
    // Main lock-on ring (hard lock)
    const ring = new Ellipse("lockOnRing");
    ring.width = "60px";
    ring.height = "60px";
    ring.color = "#ff3333";
    ring.thickness = 3;
    ring.background = "transparent";
    ring.shadowColor = "#ff0000";
    ring.shadowBlur = 20;
    ring.isVisible = false;
    ring.isHitTestVisible = false;
    this.ui.addControl(ring);

    // Inner dot
    const dot = new Ellipse("lockOnDot");
    dot.width = "10px";
    dot.height = "10px";
    dot.color = "transparent";
    dot.background = "#ff4444";
    dot.shadowColor = "#ff0000";
    dot.shadowBlur = 12;
    dot.isHitTestVisible = false;
    ring.addControl(dot);

    // Target label
    const label = new TextBlock("lockOnLabel");
    label.color = "#ff4444";
    label.fontSize = 14;
    label.fontFamily = "Orbitron";
    label.fontWeight = "700";
    label.outlineWidth = 2;
    label.outlineColor = "#000";
    label.top = "45px";
    label.isHitTestVisible = false;
    ring.addControl(label);

    // Health bar background
    const healthBg = new Rectangle("lockOnHealthBg");
    healthBg.width = "50px";
    healthBg.height = "4px";
    healthBg.color = "#333";
    healthBg.thickness = 1;
    healthBg.background = "#222";
    healthBg.top = "55px";
    healthBg.isHitTestVisible = false;
    healthBg.isVisible = false;
    ring.addControl(healthBg);

    // Health bar fill
    const healthFill = new Rectangle("lockOnHealthFill");
    healthFill.width = "100%";
    healthFill.height = "100%";
    healthFill.color = "transparent";
    healthFill.background = "#ff4444";
    healthFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    healthFill.isHitTestVisible = false;
    healthBg.addControl(healthFill);

    this.lockOnRing = ring;
    this.lockOnLabel = label;
    this.lockOnHealthBg = healthBg;
    this.lockOnHealthFill = healthFill;
  }

  _buildSoftLockIndicator() {
    // Soft lock indicator (subtle, for auto-target candidates)
    const indicator = new Ellipse("softLockIndicator");
    indicator.width = "40px";
    indicator.height = "40px";
    indicator.color = "#ffaa00";
    indicator.thickness = 2;
    indicator.background = "transparent";
    indicator.shadowColor = "#ff8800";
    indicator.shadowBlur = 10;
    indicator.isVisible = false;
    indicator.isHitTestVisible = false;
    indicator.alpha = 0.7;
    this.ui.addControl(indicator);

    // Inner dot for soft lock
    const dot = new Ellipse("softLockDot");
    dot.width = "6px";
    dot.height = "6px";
    dot.color = "transparent";
    dot.background = "#ffaa00";
    dot.isHitTestVisible = false;
    indicator.addControl(dot);

    this.softLockIndicator = indicator;
  }

  _buildCandidateMarkerPool() {
    // Create a pool of candidate markers for reuse
    for (let i = 0; i < this.maxCandidateMarkers; i++) {
      const marker = new Ellipse(`candidateMarker_${i}`);
      marker.width = "20px";
      marker.height = "20px";
      marker.color = "#ffffff";
      marker.thickness = 1;
      marker.background = "transparent";
      marker.alpha = 0.4;
      marker.isVisible = false;
      marker.isHitTestVisible = false;
      this.ui.addControl(marker);
      this.candidatePool.push(marker);
    }
  }

  _updateLockOnIndicator(delta, projectionContext) {
    if (!this.lockOnRing) return;

    const lockedSlot = this.inputManager?.lockedTargetSlot ?? null;
    const target = lockedSlot != null ? this.registry.getState(lockedSlot) : null;

    if (!target || target.isDead) {
      this.lockOnRing.isVisible = false;
      this.lockOnHealthBg.isVisible = false;
      return;
    }

    if (!this._projectStateHead(target, projectionContext)) {
      this.lockOnRing.isVisible = false;
      this.lockOnHealthBg.isVisible = false;
      return;
    }
    const screenX = projectionContext.projected.x - projectionContext.halfWidth;
    const screenY = projectionContext.projected.y - projectionContext.halfHeight;

    this.lockOnRing.isVisible = true;
    this.lockOnRing.left = `${Math.round(screenX)}px`;
    this.lockOnRing.top = `${Math.round(screenY)}px`;

    // Distance-based size scaling — ring shrinks with depth for spatial feedback
    const dist = Vector3.Distance(projectionContext.camera.position, _scratchWorldPos);
    const distScale = Math.max(0.5, Math.min(1.3, 8 / Math.max(dist, 1)));

    // Pulse animation
    this.lockOnPulse += delta * 5;
    const pulse = 0.8 + 0.2 * Math.sin(this.lockOnPulse);
    const size = Math.round(60 * pulse * distScale);
    this.lockOnRing.width = `${size}px`;
    this.lockOnRing.height = `${size}px`;

    // Update label
    this.lockOnLabel.text = target.characterDef?.label ?? `Slot ${lockedSlot}`;

    // Update health bar
    if (target.hp !== undefined && target.maxHP !== undefined) {
      this.lockOnHealthBg.isVisible = true;
      const healthPercent = Math.max(0, Math.min(1, target.hp / Math.max(target.maxHP, 1)));
      this.lockOnHealthFill.width = `${healthPercent * 100}%`;
      
      // Color based on health
      if (healthPercent > 0.6) {
        this.lockOnHealthFill.background = "#44ff44";
      } else if (healthPercent > 0.3) {
        this.lockOnHealthFill.background = "#ffff44";
      } else {
        this.lockOnHealthFill.background = "#ff4444";
      }
    } else {
      this.lockOnHealthBg.isVisible = false;
    }
  }

  _updateSoftLockIndicator(delta, projectionContext) {
    if (!this.softLockIndicator) return;

    const softSlot = this.inputManager?.softLockTargetSlot ?? null;
    
    // Don't show soft lock if we have hard lock on same target
    if (softSlot === null || softSlot === this.inputManager?.lockedTargetSlot) {
      this.softLockIndicator.isVisible = false;
      return;
    }

    const target = this.registry.getState(softSlot);
    if (!target || target.isDead) {
      this.softLockIndicator.isVisible = false;
      return;
    }

    if (!this._projectStateHead(target, projectionContext)) {
      this.softLockIndicator.isVisible = false;
      return;
    }
    const screenX = projectionContext.projected.x - projectionContext.halfWidth;
    const screenY = projectionContext.projected.y - projectionContext.halfHeight;

    this.softLockIndicator.isVisible = true;
    this.softLockIndicator.left = `${Math.round(screenX)}px`;
    this.softLockIndicator.top = `${Math.round(screenY)}px`;

    // Faster pulse for soft lock
    this.softLockPulse += delta * 8;
    const pulse = 0.85 + 0.15 * Math.sin(this.softLockPulse);
    const size = Math.round(40 * pulse);
    this.softLockIndicator.width = `${size}px`;
    this.softLockIndicator.height = `${size}px`;
  }

  _updateCandidateMarkers(_delta, projectionContext) {
    const candidates = this.inputManager?.getLockOnCandidates?.() ?? [];
    const lockedSlot = this.inputManager?.lockedTargetSlot ?? null;
    const softSlot = this.inputManager?.softLockTargetSlot ?? null;

    if (!projectionContext || !projectionContext.camera || candidates.length === 0) {
      for (const marker of this.candidatePool) {
        marker.isVisible = false;
      }
      return;
    }
    
    // Filter out locked and soft-locked targets
    const visibleCandidates = candidates
      .filter(c => c.slot !== lockedSlot && c.slot !== softSlot)
      .slice(0, this.maxCandidateMarkers);

    // Update markers
    for (let i = 0; i < this.candidatePool.length; i++) {
      const marker = this.candidatePool[i];
      const candidate = visibleCandidates[i];

      if (!candidate) {
        marker.isVisible = false;
        continue;
      }

      const target = this.registry.getState(candidate.slot);
      if (!target || target.isDead) {
        marker.isVisible = false;
        continue;
      }

      if (!this._projectStateHead(target, projectionContext)) {
        marker.isVisible = false;
        continue;
      }
      const screenX = projectionContext.projected.x - projectionContext.halfWidth;
      const screenY = projectionContext.projected.y - projectionContext.halfHeight;

      marker.isVisible = true;
      marker.left = `${Math.round(screenX)}px`;
      marker.top = `${Math.round(screenY)}px`;

      // Fade based on score (better candidates are more visible)
      const scoreAlpha = 0.3 + (candidate.score / 100) * 0.4;
      marker.alpha = Math.min(0.7, scoreAlpha);

      // Color based on angle (green = in front, yellow = side, red = behind)
      if (candidate.angle < 30) {
        marker.color = "#44ff44";
      } else if (candidate.angle < 60) {
        marker.color = "#ffff44";
      } else {
        marker.color = "#ff4444";
      }
    }
  }

  _updateExplorationStatus() {
    if (!this.discoveryText || !this.travelPromptText || !this.openWorldDirector) return;
    const state = this.openWorldDirector.getHudState?.();
    if (!state) {
      this.discoveryText.text = "";
      this.travelPromptText.text = "";
      return;
    }

    this.discoveryText.text = state.totalCount > 0
      ? `Landmarks ${state.discoveredCount}/${state.totalCount}`
      : "";
    this.travelPromptText.text = state.travelPrompt ?? "";
    this.travelPromptText.color = state.nearbyLandmarkDiscovered ? "#7ef9c6" : "#f6d365";
  }

  dispose() {
    // Clean up all UI controls
    if (this.lockOnRing) {
      this.ui.removeControl(this.lockOnRing);
      this.lockOnRing.dispose();
    }
    if (this.softLockIndicator) {
      this.ui.removeControl(this.softLockIndicator);
      this.softLockIndicator.dispose();
    }
    for (const marker of this.candidatePool) {
      this.ui.removeControl(marker);
      marker.dispose();
    }
    this.candidatePool = [];
    
    if (this.zoneLabelText) {
      this.ui.removeControl(this.zoneLabelText);
      this.zoneLabelText.dispose();
    }
    if (this.latencyText) {
      this.ui.removeControl(this.latencyText);
      this.latencyText.dispose();
    }
    if (this.discoveryText) {
      this.ui.removeControl(this.discoveryText);
      this.discoveryText.dispose();
    }
    if (this.travelPromptText) {
      this.ui.removeControl(this.travelPromptText);
      this.travelPromptText.dispose();
    }
  }

  _buildProjectionContext() {
    const engine = this.scene.getEngine();
    const camera = this.scene.activeCamera;
    if (!engine || !camera) return null;

    const width = engine.getRenderWidth();
    const height = engine.getRenderHeight();
    return {
      camera,
      viewport: camera.viewport.toGlobal(width, height),
      projected: { x: 0, y: 0, z: 0 },
      halfWidth: width / 2,
      halfHeight: height / 2,
    };
  }

  _projectStateHead(target, projectionContext) {
    if (!projectionContext?.camera || !target?.position) return false;

    target.position.addToRef(_HEAD_OFFSET, _scratchWorldPos);
    const projected = Vector3.Project(
      _scratchWorldPos,
      _IDENTITY,
      this.scene.getTransformMatrix(),
      projectionContext.viewport,
    );

    if (projected.z > 1 || projected.z < 0) {
      return false;
    }

    projectionContext.projected.x = projected.x;
    projectionContext.projected.y = projected.y;
    projectionContext.projected.z = projected.z;
    return true;
  }
}
