// src/main.js
// Entry point. Loaded by index.html via <script type="module">.
// Creates the canvas, boots Babylon, instantiates GameLoop, shows main menu.

import "../ui/styles/theme.css";
import "../ui/styles/main-menu.css";
import {
  appendDiagnosticHistory,
} from "./diagnostics.js";
import { Logger } from "./Logger.js";
import { showMainMenu } from "../ui/MainMenuScreen.js";

import { initEngineAndScene, initAssetLoader } from "./engineBootstrap.js";
import { setupScene } from "./runtime/SceneSetup.js";
import { GameLoop } from "./GameLoop.js";
import { CHARACTER_ROSTER } from "../data/CharacterRoster.js";
import { ZONE_REGISTRY } from "./ZoneManager.js";
import { SaveGameStore } from "../save/SaveGameStore.js";
import { preloadBootEssentials } from "./runtime/BootEssentials.js";

const log = Logger.scoped("main");

export let gameLoop = null;

function setupEnvironment() {
  const canvas = document.getElementById("renderCanvas");
  if (canvas) {
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    canvas.style.outline = "none";
    canvas.setAttribute("tabindex", "0");
    canvas.focus();
  }

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
}

async function bootstrap() {
  log.info("bootstrap start");
  const loadingScreen = document.getElementById("loadingScreen");
  const loadingText = document.querySelector(".loading-text");
  const setLoadingText = (message) => {
    if (loadingText) loadingText.textContent = message;
  };

  setupEnvironment();
  const canvas = document.getElementById("renderCanvas");

  setLoadingText("Initializing engine...");
  const { engine, scene } = await initEngineAndScene(canvas);

  setLoadingText("Loading game data...");
  const assetLoader = await initAssetLoader(scene);

  setLoadingText("Setting up scene...");
  const { camera, dayNightCycle } = setupScene(scene);

  setLoadingText("Building combat systems...");
  gameLoop = new GameLoop({ engine, scene, assetLoader, camera, dayNightCycle });
  console.log("[main] GameLoop created");

  await preloadBootEssentials({
    loader: assetLoader,
    gameLoop,
    SaveGameStore,
    setLoadingText,
  });

  if (loadingScreen) {
    loadingScreen.classList.add("hidden");
  }

  setLoadingText("Opening main menu...");
  await showMainMenu({
    gameLoop,
    CHARACTER_ROSTER,
    ZONE_REGISTRY,
    SaveGameStore,
  });
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
