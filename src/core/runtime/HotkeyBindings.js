// Global hotkey bindings for the game loop.
// Extracted from GameLoop to keep the main orchestrator thin.

import { toggleFpsCounterRuntime } from "./QoLFeatures.js";
import { dumpEntityState } from "./DebugRuntime.js";

/**
 * Bind global hotkeys and return a cleanup function.
 */
export function bindHotkeys(game) {
  const handler = (e) => {
    if (e.key === "Escape") {
      game.togglePause();
    } else if (e.key === ".") {
      if (!game._started) return;
      if (!game.isPaused) {
        game.togglePause(true);
        game._setRuntimeBadge("Paused - press . to advance one frame");
        return;
      }
      game.requestFrameAdvance();
    } else if (e.key === "h" || e.key === "H") {
      showControlsHelp(game);
    } else if (e.key === "m" || e.key === "M") {
      game._toggleMute();
    } else if (e.key === "j" || e.key === "J") {
      toggleTravelNetwork(game);
    } else if (e.key === "`" || e.key === "~") {
      if (!game._started) return;
      game.isPaused = true;
      game._showOverlay("dev", true);
    } else if (e.key === "F1") {
      toggleHUD(game);
    } else if (e.key === "F2") {
      toggleFpsCounterRuntime(game);
    } else if (e.key === "F3") {
      if (e.shiftKey) {
        for (const [slot] of game.registry.slots) {
          const s = game.registry.getState(slot);
          if (s?.isAiControlled) dumpEntityState(game, slot);
        }
      } else {
        dumpEntityState(game, game.localSlot);
      }
    } else if (e.key === "F4") {
      game.config.debug.showHitboxes = !game.config.debug.showHitboxes;
      game._setRuntimeBadge(game.config.debug.showHitboxes ? "Hitboxes ON" : "Hitboxes OFF");
    }
  };

  window.addEventListener("keydown", handler);
  return handler; // Returned so the caller can remove it if needed
}

function showControlsHelp(game) {
  if (!game._started) return;
  game.isPaused = true;
  game._showOverlay("help", true);
}

function toggleHUD(game) {
  game.hudVisible = !game.hudVisible;
  game._updateHudVisibility();
}

function toggleTravelNetwork(game) {
  if (!game._started) return;
  if (game._overlayVisible && game._overlayMode === "world") {
    game.togglePause(false);
    return;
  }
  game.isPaused = true;
  game._showOverlay("world", true);
}
