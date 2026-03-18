import { CONFIG, applyConfig } from "../index.js";
import "../../ui/styles/theme.css";
import "../../ui/styles/game-overlay.css";

const OVERLAY_COPY = {
  help: {
    title: "Controls",
    subtitle: "Master the battlefield with these combat controls and shortcuts.",
    tab: "controls",
  },
  settings: {
    title: "Settings",
    subtitle: "Customize your audio, visual quality, and gameplay preferences.",
    tab: "settings",
  },
  pause: {
    title: "Paused",
    subtitle: "Game is paused. Resume when ready, or adjust your settings.",
    tab: "main",
  },
  world: {
    title: "Travel Network",
    subtitle: "Unlock landmarks across the world and route between them from active beacons.",
    tab: "world",
  },
};

const CONTROLS = [
  ["Move", ["WASD", "Arrows"]],
  ["Fly Up/Down", ["Space", "Shift"]],
  ["Light Attack", ["LMB"]],
  ["Heavy Attack", ["RMB"]],
  ["Charge Ki", ["Hold RMB"]],
  ["Ki Blast", ["Q"]],
  ["Dodge", ["E"]],
  ["Block", ["F"]],
  ["Transform", ["T", "G"]],
  ["Lock Target", ["Z"]],
  ["Change Stance", ["X"]],
  ["Ultimate", ["R"]],
  ["Travel Network", ["J"]],
];

export class GameOverlayUI {
  constructor({
    audioManager,
    postProcessing,
    singlePlayer,
    registry,
    zoneManager,
    openWorld,
    getLocalSlot,
    onTogglePause,
    onAutosave,
    onSetQualityMode,
    getQualityMode,
    getEffectiveQualityPreset,
  }) {
    this.audioManager = audioManager;
    this.postProcessing = postProcessing;
    this.singlePlayer = singlePlayer;
    this.registry = registry;
    this.zoneManager = zoneManager;
    this.openWorld = openWorld;
    this.getLocalSlot = getLocalSlot;
    this.onTogglePause = onTogglePause;
    this.onAutosave = onAutosave;
    this.onSetQualityMode = onSetQualityMode;
    this.getQualityMode = getQualityMode;
    this.getEffectiveQualityPreset = getEffectiveQualityPreset;

    this.root = null;
    this.modal = null;
    this.title = null;
    this.subtitle = null;
    this.runtimeBadge = null;
    this.qualitySelect = null;
    this.tabs = new Map();
    this.stats = {
      zone: null,
      character: null,
      powerLevel: null,
    };
    this.worldUi = {
      status: null,
      source: null,
      destinations: null,
      empty: null,
    };

    this._build();
  }

  show(mode, visible) {
    if (!this.modal) return;

    const overlayState = OVERLAY_COPY[mode] ?? OVERLAY_COPY.pause;
    this.modal.classList.toggle("is-visible", visible);
    this.modal.dataset.mode = mode;

    this.title.textContent = overlayState.title;
    this.subtitle.textContent = overlayState.subtitle;
    this._setActiveTab(overlayState.tab);

    if (visible) {
      if (overlayState.tab === "world") {
        this._refreshWorldTab();
      }
      this.updateRuntimeBadge();
    }
  }

  setRuntimeBadge(text) {
    if (this.runtimeBadge) {
      this.runtimeBadge.textContent = text;
    }
  }

  updateRuntimeBadge({ isPaused = false } = {}) {
    if (!this.runtimeBadge || isPaused) return;

    const localSlot = this.getLocalSlot();
    const profile = this.singlePlayer.getProfile?.();
    const player = this.registry.getState(localSlot);
    const zone = this.zoneManager.currentZoneDef?.label ?? "Menu";
    const character = player?.characterDef?.label ?? "No Fighter";
    const credits = profile?.currencies?.credits ?? profile?.currencies?.zeni ?? 0;
    const powerLevel = player?.powerLevel?.toLocaleString?.() ?? "--";

    const qualityMode = this.getQualityMode?.() ?? CONFIG.ui.qualityMode ?? "AUTO";
    const effectiveQuality = this.getEffectiveQualityPreset?.() ?? qualityMode;
    const qualityLabel = qualityMode === "AUTO" ? `AUTO:${effectiveQuality}` : effectiveQuality;

    this.runtimeBadge.textContent = `${character}  |  ${zone}  |  ${credits.toLocaleString()} Credits  |  ${qualityLabel}`;

    if (this.stats.zone) this.stats.zone.textContent = zone;
    if (this.stats.character) this.stats.character.textContent = character;
    if (this.stats.powerLevel) this.stats.powerLevel.textContent = powerLevel;
  }

  dispose() {
    this.root?.remove();
    this.root = null;
    this.modal = null;
    this.title = null;
    this.subtitle = null;
    this.runtimeBadge = null;
    this.tabs.clear();
  }

  _setActiveTab(tabId) {
    for (const [id, tab] of this.tabs.entries()) {
      tab.classList.toggle("is-active", id === tabId);
    }
  }

  _build() {
    const root = document.createElement("div");
    root.id = "gameLoopOverlay";

    const hintBar = document.createElement("div");
    hintBar.className = "ws-overlay__hintbar";
    hintBar.append(
      this._createHint("Esc", "Pause"),
      this._createHintSeparator(),
      this._createHint("H", "Help"),
      this._createHintSeparator(),
      this._createHint("J", "World"),
      this._createHintSeparator(),
      this._createHint("M", "Mute"),
      this._createHintSeparator(),
      this._createHint("F1", "HUD"),
    );
    root.appendChild(hintBar);

    const badge = document.createElement("div");
    badge.className = "ws-overlay__badge";
    badge.textContent = "Menu";
    root.appendChild(badge);

    const modal = document.createElement("div");
    modal.className = "ws-overlay__modal";

    const panel = document.createElement("div");
    panel.className = "ws-overlay__panel";

    const left = document.createElement("div");
    left.className = "ws-overlay__column";

    const title = document.createElement("h2");
    title.className = "ws-overlay__title";
    title.textContent = OVERLAY_COPY.pause.title;
    left.appendChild(title);

    const subtitle = document.createElement("p");
    subtitle.className = "ws-overlay__subtitle";
    subtitle.textContent = OVERLAY_COPY.pause.subtitle;
    left.appendChild(subtitle);

    const buttonStack = document.createElement("div");
    buttonStack.className = "ws-overlay__button-stack";
    buttonStack.append(
      this._createActionButton(">", "Resume", "#0ea5e9", "rgba(14,165,233,0.4)", () => this.onTogglePause(false)),
      this._createActionButton("WORLD", "Travel Network", "#14b8a6", "rgba(20,184,166,0.4)", () => this.show("world", true)),
      this._createActionButton("?", "Controls", "#f59e0b", "rgba(245,158,11,0.4)", () => this.show("help", true)),
      this._createActionButton("S", "Settings", "#22c55e", "rgba(34,197,94,0.4)", () => this.show("settings", true)),
      this._createActionButton("SAVE", "Save Progress", "#6366f1", "rgba(99,102,241,0.4)", () => this.onAutosave(true)),
      this._createActionButton("EXIT", "Return To Menu", "#ef4444", "rgba(239,68,68,0.4)", () => window.location.reload()),
    );
    left.appendChild(buttonStack);

    const right = document.createElement("div");
    right.className = "ws-overlay__column";

    const controlsTab = this._buildControlsTab();
    const settingsTab = this._buildSettingsTab();
    const mainTab = this._buildMainTab();
    const worldTab = this._buildWorldTab();
    right.append(controlsTab, settingsTab, mainTab, worldTab);

    panel.append(left, right);
    modal.appendChild(panel);
    root.appendChild(modal);
    document.body.appendChild(root);

    this.root = root;
    this.modal = modal;
    this.title = title;
    this.subtitle = subtitle;
    this.runtimeBadge = badge;
    this._setActiveTab("main");
  }

  _createHint(key, label) {
    const fragment = document.createDocumentFragment();

    const keyEl = document.createElement("span");
    keyEl.className = "ws-overlay__hint-key";
    keyEl.textContent = key;
    fragment.appendChild(keyEl);

    const labelEl = document.createElement("span");
    labelEl.className = "ws-overlay__hint-label";
    labelEl.textContent = label;
    fragment.appendChild(labelEl);

    return fragment;
  }

  _createHintSeparator() {
    const separator = document.createElement("span");
    separator.className = "ws-overlay__hint-separator";
    separator.textContent = "|";
    return separator;
  }

  _createActionButton(icon, label, color, glowColor, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ws-overlay__button";
    btn.style.setProperty("--btn-color", color);
    btn.style.setProperty("--btn-glow", glowColor);
    btn.addEventListener("click", onClick);

    const iconEl = document.createElement("span");
    iconEl.className = "ws-overlay__button-icon";
    iconEl.textContent = icon;

    const labelEl = document.createElement("span");
    labelEl.textContent = label;

    btn.append(iconEl, labelEl);
    return btn;
  }

  _buildControlsTab() {
    const tab = document.createElement("div");
    tab.className = "ws-overlay__tab";
    tab.dataset.tab = "controls";

    const header = document.createElement("div");
    header.className = "ws-overlay__section-label";
    header.textContent = "Combat Controls";
    tab.appendChild(header);

    const grid = document.createElement("div");
    grid.className = "ws-overlay__controls-grid";
    for (const [label, keys] of CONTROLS) {
      const row = document.createElement("div");
      row.className = "ws-overlay__control-row";

      const labelEl = document.createElement("span");
      labelEl.className = "ws-overlay__control-label";
      labelEl.textContent = label;

      const keyList = document.createElement("div");
      keyList.className = "ws-overlay__key-list";
      for (const key of keys) {
        const badge = document.createElement("span");
        badge.className = "ws-overlay__key-badge";
        badge.textContent = key;
        keyList.appendChild(badge);
      }

      row.append(labelEl, keyList);
      grid.appendChild(row);
    }

    tab.appendChild(grid);
    this.tabs.set("controls", tab);
    return tab;
  }

  _buildSettingsTab() {
    const tab = document.createElement("div");
    tab.className = "ws-overlay__tab";
    tab.dataset.tab = "settings";

    const header = document.createElement("div");
    header.className = "ws-overlay__section-label";
    header.textContent = "Audio & Visual";
    tab.appendChild(header);

    const settingsList = document.createElement("div");
    settingsList.className = "ws-overlay__settings-list";
    settingsList.append(
      this._createSliderSetting("Master Volume", "masterVolume", CONFIG.audio.masterVolume, "#00d4ff"),
      this._createSliderSetting("Music Volume", "musicVolume", CONFIG.audio.musicVolume, "#8b5cf6"),
      this._createSliderSetting("SFX Volume", "sfxVolume", CONFIG.audio.sfxVolume, "#ff6b35"),
      this._createSliderSetting("Voice Volume", "voiceVolume", CONFIG.audio.voiceVolume, "#22c55e"),
      this._createQualitySetting(),
    );

    tab.appendChild(settingsList);
    this.tabs.set("settings", tab);
    return tab;
  }

  _buildMainTab() {
    const tab = document.createElement("div");
    tab.className = "ws-overlay__tab";
    tab.dataset.tab = "main";

    const header = document.createElement("div");
    header.className = "ws-overlay__section-label";
    header.textContent = "Session Stats";
    tab.appendChild(header);

    const statsList = document.createElement("div");
    statsList.className = "ws-overlay__stats-list";
    statsList.append(
      this._createStatRow("Current Zone", "zone"),
      this._createStatRow("Character", "character"),
      this._createStatRow("Power Level", "powerLevel", "ws-overlay__stat-value ws-overlay__stat-value--gold"),
    );
    tab.appendChild(statsList);

    this.tabs.set("main", tab);
    return tab;
  }

  _buildWorldTab() {
    const tab = document.createElement("div");
    tab.className = "ws-overlay__tab";
    tab.dataset.tab = "world";

    const header = document.createElement("div");
    header.className = "ws-overlay__section-label";
    header.textContent = "Unlocked Fast Travel";
    tab.appendChild(header);

    const status = document.createElement("div");
    status.className = "ws-overlay__travel-status";
    tab.appendChild(status);

    const source = document.createElement("div");
    source.className = "ws-overlay__travel-source";
    tab.appendChild(source);

    const list = document.createElement("div");
    list.className = "ws-overlay__travel-list";
    tab.appendChild(list);

    const empty = document.createElement("div");
    empty.className = "ws-overlay__travel-empty";
    empty.textContent = "Discover landmarks in the world to unlock travel routes.";
    tab.appendChild(empty);

    this.worldUi.status = status;
    this.worldUi.source = source;
    this.worldUi.destinations = list;
    this.worldUi.empty = empty;

    this.tabs.set("world", tab);
    return tab;
  }

  _createSliderSetting(label, key, value, color) {
    const wrapper = document.createElement("label");
    wrapper.className = "ws-overlay__setting";

    const header = document.createElement("div");
    header.className = "ws-overlay__setting-header";

    const labelEl = document.createElement("span");
    labelEl.className = "ws-overlay__setting-label";
    labelEl.textContent = label;

    const valueEl = document.createElement("span");
    valueEl.className = "ws-overlay__setting-value";
    valueEl.style.color = color;
    valueEl.textContent = `${Math.round(value * 100)}%`;

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "1";
    slider.step = "0.05";
    slider.value = `${value}`;
    slider.className = "ws-overlay__slider";
    slider.addEventListener("input", () => {
      const numeric = Number(slider.value);
      valueEl.textContent = `${Math.round(numeric * 100)}%`;
      if (key === "masterVolume") this.audioManager.setMasterVolume(numeric);
      if (key === "musicVolume") this.audioManager.setMusicVolume(numeric);
      if (key === "sfxVolume") this.audioManager.setSFXVolume(numeric);
      if (key === "voiceVolume") this.audioManager.setVoiceVolume(numeric);
      applyConfig("audio", { [key]: numeric });
    });

    header.append(labelEl, valueEl);
    wrapper.append(header, slider);
    return wrapper;
  }

  _createQualitySetting() {
    const wrapper = document.createElement("label");
    wrapper.className = "ws-overlay__setting";

    const labelEl = document.createElement("span");
    labelEl.className = "ws-overlay__setting-label";
    labelEl.textContent = "Visual Quality";

    const select = document.createElement("select");
    select.className = "ws-overlay__quality-select";
    for (const preset of ["AUTO", "LOW", "MED", "HIGH", "ULTRA"]) {
      const option = document.createElement("option");
      option.value = preset;
      option.textContent = preset;
      select.appendChild(option);
    }
    select.value = this.getQualityMode?.() ?? CONFIG.ui.qualityMode ?? "AUTO";
    select.addEventListener("change", () => {
      const nextMode = select.value;
      if (this.onSetQualityMode) {
        this.onSetQualityMode(nextMode);
      } else {
        this.postProcessing.setQuality(nextMode === "AUTO" ? "MED" : nextMode);
      }
      applyConfig("ui", { qualityMode: nextMode });
      this.updateRuntimeBadge();
    });

    wrapper.append(labelEl, select);
    this.qualitySelect = select;
    return wrapper;
  }

  _createStatRow(label, statKey, valueClass = "ws-overlay__stat-value") {
    const row = document.createElement("div");
    row.className = "ws-overlay__stat-card";

    const labelEl = document.createElement("span");
    labelEl.className = "ws-overlay__stat-label";
    labelEl.textContent = label;

    const valueEl = document.createElement("span");
    valueEl.className = valueClass;
    valueEl.textContent = "--";

    row.append(labelEl, valueEl);
    this.stats[statKey] = valueEl;
    return row;
  }

  async _handleFastTravel(destinationKey) {
    const result = await this.openWorld?.fastTravelTo?.(destinationKey);
    if (!result?.ok) {
      this.setRuntimeBadge(result?.reason ?? "Travel failed");
      this._refreshWorldTab();
      return;
    }
    this.onTogglePause(false);
    this.show("pause", false);
  }

  _refreshWorldTab() {
    if (!this.worldUi.destinations || !this.worldUi.empty) return;
    const state = this.openWorld?.getTravelMenuState?.() ?? {
      isTravelOnline: false,
      reason: "Travel network offline.",
      sourceLabel: null,
      destinations: [],
    };

    if (this.worldUi.status) {
      this.worldUi.status.textContent = state.isTravelOnline
        ? "Beacon synchronized. Select a destination."
        : state.reason || "Stand in a discovered beacon to travel.";
      this.worldUi.status.dataset.online = state.isTravelOnline ? "true" : "false";
    }

    if (this.worldUi.source) {
      this.worldUi.source.textContent = state.sourceLabel
        ? `Current beacon: ${state.sourceLabel}`
        : `Current zone: ${state.currentZoneLabel ?? this.zoneManager.currentZoneDef?.label ?? "Unknown"}`;
    }

    this.worldUi.destinations.replaceChildren();
    this.worldUi.empty.style.display = state.destinations.length > 0 ? "none" : "block";

    for (const destination of state.destinations) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ws-overlay__travel-destination";
      button.disabled = !state.isTravelOnline || destination.isCurrentAnchor;
      button.addEventListener("click", () => {
        void this._handleFastTravel(destination.key);
      });

      const top = document.createElement("div");
      top.className = "ws-overlay__travel-topline";

      const title = document.createElement("span");
      title.className = "ws-overlay__travel-label";
      title.textContent = destination.label;

      const zone = document.createElement("span");
      zone.className = "ws-overlay__travel-zone";
      zone.textContent = destination.zoneLabel;

      top.append(title, zone);

      const description = document.createElement("div");
      description.className = "ws-overlay__travel-description";
      description.textContent = destination.isCurrentAnchor
        ? "Current beacon"
        : destination.description;

      button.append(top, description);
      this.worldUi.destinations.appendChild(button);
    }
  }
}
