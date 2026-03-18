import { GAME_MODE } from "./gameModes.js";

export function setRuntimeBadgeRuntime(game, label) {
  game.overlayUi?.setRuntimeBadge(label);
}

export function showOverlayRuntime(game, mode = "pause", visible = true) {
  if (game._overlayMode === mode && game._overlayVisible === visible) return;
  game._overlayMode = mode;
  game._overlayVisible = visible;
  game.overlayUi?.show(mode, visible);
}

export function updateOverlayRuntime(game) {
  if (game._countdownIntroActive) {
    showOverlayRuntime(game, game._overlayMode, false);
    return;
  }

  if (game.isPaused) {
    showOverlayRuntime(game, game._overlayMode, true);
    return;
  }

  game.overlayUi?.show(game._overlayMode, false);
  game.overlayUi?.updateRuntimeBadge({ isPaused: false });
  if (!game._started && game.mode === GAME_MODE.MENU) {
    setRuntimeBadgeRuntime(game, "Menu");
  }
}

export function updateHudVisibilityRuntime(game) {
  if (game.hud?.ui?.rootContainer) {
    game.hud.ui.rootContainer.isVisible = game.hudVisible;
  }
  if (game.trainingHUD) {
    if (game.mode === GAME_MODE.TRAINING && game.hudVisible) game.trainingHUD.show();
    else game.trainingHUD.hide();
  }
}

export function toggleHudRuntime(game) {
  game.hudVisible = !game.hudVisible;
  updateHudVisibilityRuntime(game);
}

export function showControlsHelpRuntime(game) {
  if (!game._started) return;
  game.isPaused = true;
  showOverlayRuntime(game, "help", true);
}

export function togglePauseRuntime(game, force) {
  if (!game._started) return false;
  if (force !== undefined) {
    game.isPaused = force;
  } else {
    game.isPaused = !game.isPaused;
  }
  showOverlayRuntime(game, "pause", game.isPaused);
  return game.isPaused;
}
