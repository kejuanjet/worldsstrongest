import { CONFIG, applyConfig } from "../index.js";

export function buildLocalInputState(game) {
  const move = game.inputManager.getMovementVector();
  return {
    moveX: move.x,
    moveZ: move.z,
    flyY: game.inputManager.getFlyAxis(),
    yaw: game.camera.alpha,
    pitch: game.camera.beta,
    btnAttack: game.inputManager.isHeld("ATTACK_LIGHT"),
    btnHeavy: game.inputManager.isHeld("ATTACK_HEAVY"),
    btnBlast: game.inputManager.isJustPressed("KI_BLAST"),
    btnUltimate: game.inputManager.isJustPressed("ULTIMATE"),
    btnRush: game.inputManager.isJustPressed("RUSH_COMBO"),
    btnGrab: game.inputManager.isJustPressed("GRAB"),
    btnTransform: game.inputManager.isJustPressed("TRANSFORM"),
    btnTransformDown: game.inputManager.isJustPressed("TRANSFORM_DOWN"),
    btnDodge: game.inputManager.isJustPressed("DODGE"),
    btnKi: game.inputManager.isHeld("KI_CHARGE"),
    btnBlock: game.inputManager.isHeld("BLOCK"),
    btnStance: game.inputManager.isJustPressed("STANCE_TOGGLE"),
    lockedSlot: game.inputManager.lockedTargetSlot ?? game.inputManager.softLockTargetSlot ?? null,
    mashCount: game.inputManager.getMashCount(),
  };
}

export function getAuthoritativeInputForSlot(game, slot, idleInput) {
  const state = game.registry.getState(slot);
  if (!state) return idleInput;
  if (slot === game.localSlot) return buildLocalInputState(game);
  if (state.isAiControlled) return game._queuedAiInputs.get(slot) ?? idleInput;
  return game._remoteInputs.get(slot) ?? idleInput;
}

export function consumeInputEdges(game, slot, input, idleInput) {
  const prev = game._prevInputs.get(slot) ?? idleInput;
  const current = { ...idleInput, ...input };
  game._prevInputs.set(slot, current);

  return {
    btnAttack: !!current.btnAttack && !prev.btnAttack,
    btnHeavy: !!current.btnHeavy && !prev.btnHeavy,
    btnBlast: !!current.btnBlast && !prev.btnBlast,
    btnUltimate: !!current.btnUltimate && !prev.btnUltimate,
    btnRush: !!current.btnRush && !prev.btnRush,
    btnGrab: !!current.btnGrab && !prev.btnGrab,
    btnTransform: !!current.btnTransform && !prev.btnTransform,
    btnTransformDown: !!current.btnTransformDown && !prev.btnTransformDown,
    btnStance: !!current.btnStance && !prev.btnStance,
    btnKiStart: !!current.btnKi && !prev.btnKi,
    btnKiEnd: !current.btnKi && !!prev.btnKi,
    btnHeal: !!current.btnHeal && !prev.btnHeal,
    btnMagicAttack: !!current.btnMagicAttack && !prev.btnMagicAttack,
  };
}

export function toggleMuteRuntime(game) {
  if (game.audioManager.masterVolume > 0) {
    game._lastNonZeroMaster = game.audioManager.masterVolume;
    game.audioManager.setMasterVolume(0);
    applyConfig("audio", { masterVolume: 0 });
    game._setRuntimeBadge("Muted");
  } else {
    const restore = game._lastNonZeroMaster ?? CONFIG.audio.masterVolume ?? 0.8;
    game.audioManager.setMasterVolume(restore);
    applyConfig("audio", { masterVolume: restore });
    game._setRuntimeBadge("Audio Restored");
  }
}

export function autosaveRuntime(game, force = false) {
  if (game.mode !== "SINGLE_PLAYER" && game.mode !== "TRAINING") return;
  if (!force && game._autosaveElapsed < 20) return;

  const profile = game.singlePlayer.getProfile?.();
  const player = game.registry.getState(game.localSlot);
  if (!profile || !player) return;

  profile.selectedCharacterId = player.characterId;
  profile.lastZoneId = game.currentZoneId;
  profile.lastMissionId = game.currentMissionId;
  profile.lastMode = game.mode;
  game.singlePlayer.save();
  game._autosaveElapsed = 0;
  game._setRuntimeBadge("Autosaved");
}

export function flashDamageRuntime() {
  const flashEl = document.getElementById("damageFlash");
  if (!flashEl) return;
  flashEl.style.opacity = "0.22";
  setTimeout(() => { flashEl.style.opacity = "0"; }, CONFIG.ui.damageFlashMs);
}
