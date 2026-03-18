// src/main.js
// Entry point. Loaded by index.html via <script type="module">.
// Creates the canvas, boots Babylon, instantiates GameLoop, shows main menu.

import "../ui/styles/theme.css";
import "../ui/styles/main-menu.css";
import {
  appendDiagnosticHistory,
  buildDiagnosticReport,
  copyTextToClipboard,
  formatDiagnosticForClipboard,
} from "./diagnostics.js";
import { Logger } from "./Logger.js";
import { bootstrapGameRuntime } from "./runtime/AppBootstrap.js";

const log = Logger.scoped("main");

const canvas = document.getElementById("renderCanvas");
canvas.style.width = "100%";
canvas.style.height = "100%";
canvas.style.display = "block";
canvas.style.outline = "none";
canvas.setAttribute("tabindex", "0");
canvas.focus();

const flashEl = document.createElement("div");
flashEl.id = "damageFlash";
Object.assign(flashEl.style, {
  position: "fixed",
  inset: "0",
  background: "radial-gradient(circle, rgba(239,68,68,0.4) 0%, transparent 70%)",
  opacity: "0",
  pointerEvents: "none",
  transition: "opacity 0.1s ease-out",
  zIndex: "9999",
});
document.body.appendChild(flashEl);

export let gameLoop = null;
let CHARACTER_ROSTER = null;
let ZONE_REGISTRY = null;
let SaveGameStore = null;
let latestDiagnosticReport = null;
let latestRetryAction = null;

function createParticleBackground() {
  const container = document.createElement("div");
  container.className = "ws-main-menu__particles";

  for (let i = 0; i < 20; i++) {
    const particle = document.createElement("div");
    particle.className = "ws-main-menu__particle";
    particle.style.setProperty("--particle-size", `${2 + Math.random() * 3}px`);
    particle.style.setProperty("--particle-left", `${Math.random() * 100}%`);
    particle.style.setProperty("--particle-top", `${Math.random() * 100}%`);
    particle.style.setProperty("--particle-duration", `${6 + Math.random() * 4}s`);
    particle.style.setProperty("--particle-delay", `${Math.random() * 5}s`);
    particle.style.setProperty(
      "--particle-color",
      Math.random() > 0.5 ? "var(--ws-color-primary)" : "var(--ws-color-secondary)",
    );
    container.appendChild(particle);
  }

  return container;
}

function createGlowEffect() {
  const glow = document.createElement("div");
  glow.className = "ws-main-menu__glow";
  return glow;
}

function createMenuField(label, id, options, selectedValue) {
  const wrapper = document.createElement("label");
  wrapper.className = "ws-main-menu__field";

  const labelEl = document.createElement("span");
  labelEl.className = "ws-main-menu__field-label";
  labelEl.textContent = label;

  const select = document.createElement("select");
  select.id = id;
  select.className = "ws-main-menu__select";
  for (const optionDef of options) {
    const option = document.createElement("option");
    option.value = optionDef.id;
    option.textContent = optionDef.label;
    option.selected = optionDef.id === selectedValue;
    select.appendChild(option);
  }

  wrapper.append(labelEl, select);
  return wrapper;
}

function createMenuButton(label, icon, accentColor, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ws-main-menu__button";
  btn.style.setProperty("--menu-accent", accentColor);
  btn.addEventListener("click", onClick);

  const iconEl = document.createElement("span");
  iconEl.textContent = icon;

  const labelEl = document.createElement("span");
  labelEl.textContent = label;

  btn.append(iconEl, labelEl);
  return btn;
}

function createInfoCard(title, accentColor) {
  const card = document.createElement("section");
  card.className = "ws-main-menu__info-card";
  card.style.setProperty("--card-accent", accentColor);

  const heading = document.createElement("h2");
  heading.className = "ws-main-menu__card-title";
  heading.textContent = title;

  const body = document.createElement("div");
  body.className = "ws-main-menu__card-body";

  card.append(heading, body);
  return { card, body };
}

async function showMainMenu() {
  const saveStore = new SaveGameStore();
  const profile = saveStore.load("default");
  const characterOptions = Object.values(CHARACTER_ROSTER)
    .filter((entry) => !["AKADEMIKS", "GRANNY", "JELLYROLL", "OPP", "LEBRON"].includes(entry.id));
  const zoneOptions = Object.values(ZONE_REGISTRY)
    .map((zone) => ({ id: zone.id, label: zone.label }));

  const menu = document.createElement("div");
  menu.id = "mainMenu";
  menu.className = "ws-main-menu";

  const card = document.createElement("div");
  card.className = "ws-main-menu__card";
  card.appendChild(createGlowEffect());

  const leftCol = document.createElement("section");
  leftCol.className = "ws-main-menu__content";

  const header = document.createElement("div");
  const eyebrow = document.createElement("p");
  eyebrow.className = "ws-main-menu__eyebrow";
  eyebrow.textContent = "World's Strongest";

  const title = document.createElement("h1");
  title.className = "ws-main-menu__title";
  title.innerHTML = `Fight <span class="ws-main-menu__title-accent">Faster</span>.<br/>Manage <span class="ws-main-menu__title-muted">Less</span>.`;
  header.append(eyebrow, title);
  leftCol.appendChild(header);

  const desc = document.createElement("p");
  desc.className = "ws-main-menu__description";
  desc.textContent = "Experience next-generation combat with seamless single-player missions, intense training modes, and multiplayer battles featuring real-time physics.";
  leftCol.appendChild(desc);

  const selectionGrid = document.createElement("div");
  selectionGrid.className = "ws-main-menu__selection-grid";
  selectionGrid.appendChild(createMenuField("Character", "menu-character", characterOptions, profile.selectedCharacterId ?? "AYO"));
  selectionGrid.appendChild(createMenuField("Start Zone", "menu-zone", zoneOptions, profile.lastZoneId ?? "CITY"));
  leftCol.appendChild(selectionGrid);

  const statusText = document.createElement("p");
  statusText.id = "status-text";
  statusText.className = "ws-main-menu__status";
  statusText.dataset.status = "";

  const diagnosticsPanel = document.createElement("section");
  diagnosticsPanel.className = "ws-main-menu__diag";
  diagnosticsPanel.hidden = true;

  const diagnosticsTitle = document.createElement("h3");
  diagnosticsTitle.className = "ws-main-menu__diag-title";
  diagnosticsTitle.textContent = "Issue helper";

  const diagnosticsSummary = document.createElement("p");
  diagnosticsSummary.className = "ws-main-menu__diag-summary";

  const diagnosticsSuggestions = document.createElement("ol");
  diagnosticsSuggestions.className = "ws-main-menu__diag-steps";

  const diagnosticsButtons = document.createElement("div");
  diagnosticsButtons.className = "ws-main-menu__diag-actions";

  const copyReportButton = document.createElement("button");
  copyReportButton.type = "button";
  copyReportButton.className = "ws-main-menu__diag-button";
  copyReportButton.textContent = "Copy report for IDE";

  const retryActionButton = document.createElement("button");
  retryActionButton.type = "button";
  retryActionButton.className = "ws-main-menu__diag-button";
  retryActionButton.textContent = "Retry action";
  retryActionButton.hidden = true;

  const clearReportButton = document.createElement("button");
  clearReportButton.type = "button";
  clearReportButton.className = "ws-main-menu__diag-button ws-main-menu__diag-button--ghost";
  clearReportButton.textContent = "Clear";

  diagnosticsButtons.append(copyReportButton, retryActionButton, clearReportButton);

  const diagnosticsDetails = document.createElement("details");
  diagnosticsDetails.className = "ws-main-menu__diag-details";

  const diagnosticsDetailsSummary = document.createElement("summary");
  diagnosticsDetailsSummary.textContent = "Technical details";

  const diagnosticsDetailsContent = document.createElement("pre");
  diagnosticsDetailsContent.className = "ws-main-menu__diag-pre";

  diagnosticsDetails.append(diagnosticsDetailsSummary, diagnosticsDetailsContent);
  diagnosticsPanel.append(
    diagnosticsTitle,
    diagnosticsSummary,
    diagnosticsSuggestions,
    diagnosticsButtons,
    diagnosticsDetails,
  );

  const getCharacter = () => document.getElementById("menu-character")?.value || "AYO";
  const getZone = () => document.getElementById("menu-zone")?.value || "CITY";
  const getSafeStartZone = () => {
    const zone = getZone();
    return ZONE_REGISTRY?.[zone] ? zone : "CITY";
  };
  const setStatus = (msg, status = "") => {
    statusText.textContent = msg;
    statusText.dataset.status = status;
  };

  const renderDiagnostic = (report, hasRetryAction = false) => {
    latestDiagnosticReport = report;
    diagnosticsPanel.hidden = false;
    diagnosticsDetails.open = false;
    diagnosticsTitle.textContent = `Issue helper (${report.errorId})`;
    retryActionButton.hidden = !hasRetryAction;

    diagnosticsSummary.textContent = report.friendlyMessage;
    diagnosticsSuggestions.textContent = "";
    for (const suggestion of report.suggestions) {
      const li = document.createElement("li");
      li.textContent = suggestion;
      diagnosticsSuggestions.appendChild(li);
    }

    diagnosticsDetailsContent.textContent = formatDiagnosticForClipboard(report);
  };

  const reportIssue = (action, error, extraContext = {}, retryAction = null) => {
    const report = buildDiagnosticReport({
      action,
      error,
      context: {
        mode: profile.lastMode ?? "MENU",
        characterId: getCharacter(),
        zoneId: getSafeStartZone(),
        ...extraContext,
      },
    });

    latestRetryAction = retryAction;
    setStatus(`${report.friendlyMessage} [${report.errorId}]`, "danger");
    renderDiagnostic(report, Boolean(retryAction));
    return report;
  };

  copyReportButton.addEventListener("click", async () => {
    if (!latestDiagnosticReport) {
      setStatus("No report yet. Trigger an error first.", "warning");
      return;
    }

    const copied = await copyTextToClipboard(formatDiagnosticForClipboard(latestDiagnosticReport));
    if (copied) {
      setStatus(`Report copied (${latestDiagnosticReport.errorId}). Paste it in IDE chat.`, "success");
    } else {
      setStatus("Copy failed. Open technical details and copy manually.", "warning");
    }
  });

  retryActionButton.addEventListener("click", async () => {
    if (!latestRetryAction) {
      setStatus("No retry action available for this issue.", "warning");
      return;
    }

    setStatus("Retrying action...", "info");
    try {
      await latestRetryAction();
    } catch (retryError) {
      reportIssue("retry_action", retryError);
    }
  });

  clearReportButton.addEventListener("click", () => {
    latestDiagnosticReport = null;
    latestRetryAction = null;
    diagnosticsPanel.hidden = true;
    diagnosticsDetailsContent.textContent = "";
    diagnosticsTitle.textContent = "Issue helper";
    retryActionButton.hidden = true;
    setStatus("", "");
  });
  const closeMenu = () => {
    menu.classList.add("is-closing");
    setTimeout(() => menu.remove(), 300);
  };

  const handleContinue = async () => {
    if (!gameLoop) { setStatus("Game engine not ready.", "danger"); return; }
    setStatus("Restoring last session...", "info");
    try {
      if (profile.lastMode === "TRAINING") {
        await gameLoop.startTrainingMode(profile.selectedCharacterId ?? "AYO");
      } else {
        const continueZone = profile.lastMissionId ? profile.lastZoneId : getSafeStartZone();
        await gameLoop.startSinglePlayer({
          profileId: "default",
          startZone: continueZone ?? "CITY",
          characterId: profile.selectedCharacterId ?? "AYO",
          missionId: profile.lastMissionId,
          autoStartMission: !!profile.lastMissionId,
        });
      }
      closeMenu();
    } catch (e) {
      reportIssue("menu_continue", e, {}, handleContinue);
    }
  };

  const handleSolo = async () => {
    if (!gameLoop) { setStatus("Game engine not ready.", "danger"); return; }
    setStatus("Loading single-player...", "warning");
    try {
      await gameLoop.startSinglePlayer({
        profileId: "default",
        startZone: getSafeStartZone(),
        characterId: getCharacter(),
      });
      closeMenu();
    } catch (e) {
      reportIssue("menu_solo", e, {}, handleSolo);
    }
  };

  const handleOneFight = async () => {
    if (!gameLoop) { setStatus("Game engine not ready.", "danger"); return; }
    const search = new URLSearchParams(window.location.search);
    const characterId = search.get("character") || "AYO";
    const opponentCharacterId = search.get("opponent") || "RAYNE";
    const autotest = search.get("autotest") === "1";
    const startZone = search.get("zone") || "TRAINING_GROUND";
    setStatus(`Launching ${characterId} vs ${opponentCharacterId}...`, "warning");
    try {
      await gameLoop.startOneFight({
        profileId: "default",
        startZone,
        characterId,
        opponentCharacterId,
        autotest,
      });
      closeMenu();
    } catch (e) {
      reportIssue("menu_onefight", e, {
        characterId,
        opponentCharacterId,
        autotest,
        startZone,
      }, handleOneFight);
    }
  };

  const handleTraining = async () => {
    if (!gameLoop) { setStatus("Game engine not ready.", "danger"); return; }
    setStatus("Loading Training Mode...", "info");
    try {
      await gameLoop.startTrainingMode(getCharacter());
      closeMenu();
    } catch (e) {
      reportIssue("menu_training", e, {}, handleTraining);
    }
  };

  const handleHost = async () => {
    if (!gameLoop) { setStatus("Game engine not ready.", "danger"); return; }
    setStatus("Starting hosted session...", "success");
    try {
      await gameLoop.hostSession(getSafeStartZone(), getCharacter());
      closeMenu();
    } catch (e) {
      reportIssue("menu_host", e, {}, handleHost);
    }
  };

  const buttonRow = document.createElement("div");
  buttonRow.className = "ws-main-menu__actions";
  buttonRow.append(
    createMenuButton("Continue", ">", "var(--ws-color-primary)", () => handleContinue()),
    createMenuButton("Solo", "VS", "var(--ws-color-energy)", () => handleSolo()),
    createMenuButton("Training", "TRN", "var(--ws-color-secondary)", () => handleTraining()),
    createMenuButton("Host", "NET", "var(--ws-color-success)", () => handleHost()),
  );
  leftCol.append(buttonRow, statusText, diagnosticsPanel);

  const rightCol = document.createElement("section");
  rightCol.className = "ws-main-menu__sidebar";

  const selectedCharacterLabel = CHARACTER_ROSTER[profile.selectedCharacterId]?.label ?? profile.selectedCharacterId ?? "Ayo";
  const continueCard = createInfoCard("Quick Continue", "var(--ws-color-gold)");
  const continueStrong = document.createElement("strong");
  continueStrong.textContent = `${selectedCharacterLabel} in ${ZONE_REGISTRY[profile.lastZoneId ?? "CITY"]?.label ?? "The City"}`;
  const continueMeta = document.createElement("small");
  continueMeta.textContent = `Last mode: ${profile.lastMode ?? "SINGLE_PLAYER"}${profile.lastMissionId ? ` | Mission ${profile.lastMissionId}` : ""}`;
  continueCard.body.append(continueStrong, document.createElement("br"), continueMeta);
  rightCol.appendChild(continueCard.card);

  const joinCard = createInfoCard("Join Session", "var(--ws-color-success)");
  const joinForm = document.createElement("div");
  joinForm.className = "ws-main-menu__join-form";

  const hostInput = document.createElement("input");
  hostInput.id = "host-addr";
  hostInput.className = "ws-main-menu__join-input";
  hostInput.placeholder = "Host IP or hostname";

  const connectButton = document.createElement("button");
  connectButton.id = "btn-connect";
  connectButton.type = "button";
  connectButton.className = "ws-main-menu__join-button";
  connectButton.textContent = "Join Session";
  const attemptJoin = async (addr) => {
    setStatus(`Connecting to ${addr}...`, "info");
    try {
      await gameLoop.joinSession(addr, getCharacter());
      closeMenu();
    } catch (e) {
      reportIssue("menu_join", e, { hostAddress: addr }, () => attemptJoin(addr));
    }
  };

  connectButton.addEventListener("click", async () => {
    const addr = hostInput.value?.trim();
    if (!addr) {
      setStatus("Enter a host address.", "danger");
      return;
    }

    await attemptJoin(addr);
  });
  joinForm.append(hostInput, connectButton);
  joinCard.body.appendChild(joinForm);
  rightCol.appendChild(joinCard.card);

  const hotkeysCard = createInfoCard("Quick Controls", "var(--ws-color-primary)");
  const hotkeys = document.createElement("div");
  hotkeys.className = "ws-main-menu__hotkeys";
  for (const [key, label] of [
    ["Esc", "Pause menu"],
    ["H", "Controls help"],
    ["M", "Toggle mute"],
    ["F1", "Toggle HUD"],
    ["F2", "FPS + Memory"],
    ["N", "Toggle Damage #s"],
    ["Bksp", "Reset Training"],
    ["[ / ]", "Save/Load Pos"],
  ]) {
    const row = document.createElement("div");
    row.className = "ws-main-menu__hotkey-row";

    const keyEl = document.createElement("kbd");
    keyEl.className = "ws-main-menu__key";
    keyEl.textContent = key;

    const labelEl = document.createElement("span");
    labelEl.textContent = label;

    row.append(keyEl, labelEl);
    hotkeys.appendChild(row);
  }
  hotkeysCard.body.appendChild(hotkeys);
  rightCol.appendChild(hotkeysCard.card);

  menu.appendChild(createParticleBackground());
  card.append(leftCol, rightCol);
  menu.appendChild(card);
  document.body.appendChild(menu);

  const searchParams = new URLSearchParams(window.location.search);
  const autostartMode = searchParams.get("autostart");
  const queryCharacter = searchParams.get("character");
  const queryZone = searchParams.get("zone");
  const characterSelect = document.getElementById("menu-character");
  const zoneSelect = document.getElementById("menu-zone");
  if (queryCharacter && characterSelect?.querySelector?.(`option[value="${queryCharacter}"]`)) {
    characterSelect.value = queryCharacter;
  }
  if (queryZone && zoneSelect?.querySelector?.(`option[value="${queryZone}"]`)) {
    zoneSelect.value = queryZone;
  }
  if (autostartMode === "continue") {
    setTimeout(() => void handleContinue(), 50);
  } else if (autostartMode === "solo") {
    setTimeout(() => void handleSolo(), 50);
  } else if (autostartMode === "onefight") {
    setTimeout(() => void handleOneFight(), 50);
  } else if (autostartMode === "training") {
    setTimeout(() => void handleTraining(), 50);
  }
}

window.addEventListener("error", (e) => {
  const message = e?.error?.message || e?.message || "Unknown global error";
  appendDiagnosticHistory({
    ts: new Date().toISOString(),
    level: "error",
    action: "global_error",
    issueType: "GENERAL",
    message,
  });
  console.error("Global JS error:", e.error || e.message, e);
});

window.addEventListener("unhandledrejection", (e) => {
  const reason = e?.reason;
  const message = reason instanceof Error ? reason.message : String(reason);
  appendDiagnosticHistory({
    ts: new Date().toISOString(),
    level: "error",
    action: "unhandled_rejection",
    issueType: "GENERAL",
    message,
  });
  console.error("Unhandled promise rejection:", reason);
});

async function bootstrap() {
  log.info("bootstrap start");
  const loadingScreen = document.getElementById("loadingScreen");
  const loadingText = document.querySelector(".loading-text");
  const setLoadingText = (message) => {
    if (loadingText) loadingText.textContent = message;
  };

  const runtimeBootstrap = await bootstrapGameRuntime({
    log,
    setLoadingText,
  });
  gameLoop = runtimeBootstrap.gameLoop;
  CHARACTER_ROSTER = runtimeBootstrap.CHARACTER_ROSTER;
  ZONE_REGISTRY = runtimeBootstrap.ZONE_REGISTRY;
  SaveGameStore = runtimeBootstrap.SaveGameStore;

  if (loadingScreen) {
    loadingScreen.classList.add("hidden");
  }

  setLoadingText("Opening main menu...");
  await showMainMenu();
}

bootstrap().catch((e) => {
  appendDiagnosticHistory({
    ts: new Date().toISOString(),
    level: "error",
    action: "bootstrap",
    issueType: "GENERAL",
    message: e?.message || String(e),
  });
  console.error("Bootstrap failed:", e);
  const loadingText = document.querySelector(".loading-text");
  if (loadingText) loadingText.textContent = `Bootstrap error: ${e.message}`;
});
