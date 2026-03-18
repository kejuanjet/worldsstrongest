import { Vector3 } from "@babylonjs/core";
import { CONFIG } from "../index.js";
import { SESSION_ROLE } from "../SessionManager.js";
import { getMissionDef } from "../../missions/MissionRegistry.js";
import { ENEMY_ROSTER } from "../../ai/EnemyRegistry.js";
import { GAME_MODE } from "./gameModes.js";

export async function startSinglePlayerRuntime(game, {
  profileId = "default",
  startZone = "CITY",
  characterId = "AYO",
  missionId = null,
  autoStartMission = true,
} = {}) {
  await resetWorldRuntime(game);

  _setLocalRuntimeContext(game, {
    mode: GAME_MODE.SINGLE_PLAYER,
    profileId,
    missionId,
  });

  const profile = await _initializeProfileRuntime(game, profileId);
  profile.selectedCharacterId = characterId;
  const finalZoneId = _resolveFinalZoneId(startZone, missionId, autoStartMission);
  profile.lastZoneId = finalZoneId;
  profile.lastMissionId = missionId;
  profile.lastMode = GAME_MODE.SINGLE_PLAYER;

  await game.zoneManager.loadZone(finalZoneId, true);
  const playerState = await _spawnPrimaryPlayerRuntime(game, characterId, {
    applyProfile: true,
  });

  // Spawn Hana as an active enemy ~12 units ahead, facing the player.
  const hanaSpawn = _getPrimarySpawnPoint(game, 0).add(new Vector3(0, 0, 12));
  game._storyHanaSlot = await _spawnStoryEnemy(game, "HANA", hanaSpawn, Math.PI);

  if (missionId && autoStartMission) {
    await game.singlePlayer.startMission(missionId);
  }

  stabilizeSpawnStateRuntime(game, playerState, { yaw: 0 });

  // Run the 3/2/1/FIGHT countdown — same flow as training mode.
  afterStartRuntime(game);
  game._autosave(true);
}

export async function startOneFightRuntime(game, {
  profileId = "default",
  startZone = "TRAINING_GROUND",
  characterId = "AYO",
  opponentCharacterId = "RAYNE",
  autotest = false,
} = {}) {
  await resetWorldRuntime(game);

  _setLocalRuntimeContext(game, {
    mode: GAME_MODE.SINGLE_PLAYER,
    profileId,
    missionId: null,
    scenarioId: "ONEFIGHT",
    autotestEnabled: !!autotest,
    oneFightConfig: {
      playerCharacterId: characterId,
      opponentCharacterId,
      startZone,
    },
  });

  await _initializeProfileRuntime(game, profileId);
  game.currentZoneId = startZone;

  await game.zoneManager.loadZone(startZone, true);
  const playerState = await _spawnPrimaryPlayerRuntime(game, characterId, {
    applyProfile: true,
  });

  const opponentSpawn = _getPrimarySpawnPoint(game, 0).add(new Vector3(0, 0, 12));
  game._oneFightEnemySlot = await _spawnOneFightEnemy(game, opponentCharacterId, opponentSpawn, Math.PI);

  stabilizeSpawnStateRuntime(game, playerState, { yaw: 0 });
  afterStartRuntime(game);
  game.hud.showStatusMessage(`${characterId} vs ${opponentCharacterId}`, 2500);
}

export async function startTrainingModeRuntime(game, characterId = "AYO") {
  await resetWorldRuntime(game);

  _setLocalRuntimeContext(game, {
    mode: GAME_MODE.TRAINING,
    profileId: "default",
    missionId: null,
  });

  const profile = await _initializeProfileRuntime(game, "default");
  profile.selectedCharacterId = characterId;
  profile.lastZoneId = "TRAINING_GROUND";
  profile.lastMissionId = null;
  profile.lastMode = GAME_MODE.TRAINING;

  await game.zoneManager.loadZone("TRAINING_GROUND", true);
  const playerState = await _spawnPrimaryPlayerRuntime(game, characterId, {
    applyProfile: true,
  });
  spawnTrainingTargetsRuntime(game);
  
  // Spawn initial standalone training dummy
  game.dummyManager.spawnDummy("BASIC", playerState.position.add(new Vector3(0, 0, 8)));
  if (game.trainingHUD) game.trainingHUD.show();

  afterStartRuntime(game);
  game.hud.showStatusMessage("Training mode ready");
  game._autosave(true);
}

export async function hostSessionRuntime(game, zoneId = "CITY", characterId = "AYO") {
  await resetWorldRuntime(game);

  _setLocalRuntimeContext(game, {
    mode: GAME_MODE.MULTIPLAYER_HOST,
  });
  await game.sessionManager.host(CONFIG.network.defaultPort);

  await game.zoneManager.loadZone(zoneId, true);
  await _spawnPrimaryPlayerRuntime(game, characterId);

  game.sessionManager.startSnapshotBroadcast(() => game.registry.getSnapshot());
  afterStartRuntime(game);
  game.hud.showStatusMessage("Hosting session");
}

export async function joinSessionRuntime(game, host, characterId = "RAYNE") {
  await resetWorldRuntime(game);

  _setLocalRuntimeContext(game, {
    mode: GAME_MODE.MULTIPLAYER_CLIENT,
  });
  await game.sessionManager.join(host, CONFIG.network.defaultPort, characterId);
  game.localSlot = game.sessionManager.localSlot ?? 0;

  await game.zoneManager.loadZone("EARTH_PLAINS", true);
  const playerState = await game._ensureNetworkPlayer(game.localSlot, game.sessionManager.localPlayerId, characterId);
  stabilizeSpawnStateRuntime(game, playerState, { yaw: 0 });

  afterStartRuntime(game);
  game.hud.showStatusMessage(`Connected to ${host}`);
}

export async function resetWorldRuntime(game) {
  game.sessionManager.stopSnapshotBroadcast?.();
  if (game.sessionManager.connected || game.sessionManager.role !== SESSION_ROLE.NONE) {
    game.sessionManager.disconnect();
  }

  game._countdownIntroActive = false;
  game._countdownIntroPrime = null;
  game.isPaused = false;
  game._showOverlay("pause", false);
  game._fixedAccumulator = 0;
  game._autosaveElapsed = 0;
  game._remoteInputs.clear();
  game._queuedAiInputs.clear();
  game._prevInputs.clear();
  game._hitReactStates.clear();
  game._recentHitsByAttacker.clear();
  game._finisherCamera = null;
  game.inputManager.clearState();
  game.inputManager.lockedTargetSlot = null;
  game.enemyAI.clear();
  game.registry.despawnAll();
  clearTransientCombatRuntime(game);
  clearRespawnTimersRuntime(game);
  game.singlePlayer.clearEnemies();
  game.openWorld?.reset?.();
  game.dummyManager?.clearAll();
  if (game.trainingHUD) game.trainingHUD.hide();

  game._storyFightActive     = false;
  game._storyHanaSlot        = null;
  game._oneFightEnemySlot    = null;
  game._scenarioId           = null;
  game._autotestEnabled      = false;
  game._oneFightConfig       = null;
}

export function afterStartRuntime(game) {
  game._started = true;
  game._lastFrameAt = performance.now();
  game.isPaused = false;
  game.inputManager.releasePointerLock?.();
  game.inputManager.setEnabled(false);
  game.inputManager.clearState?.();

  game._updateHudVisibility();
  game._updateOverlay();

  // Run countdown — input is frozen until "FIGHT!" finishes.
  // Animations and rendering keep running so characters aren't stuck in T-pose.
  _runCountdown(game);
}

/**
 * Called when the player defeats Hana in the story fight.
 */
export function resolveStoryVictoryRuntime(game) {
  if (!game._storyFightActive) return;
  game._storyFightActive = false;
  game.hud.showRewardPopup({ label: "VICTORY! Hana defeated!", xp: 500, credits: 250 });
  setTimeout(() => {
    game.hud.showStatusMessage("Hana: ...Not bad. I'll remember this.", 4000);
  }, 2200);
  game._autosave(false);
}

async function _runCountdown(game) {
  game._countdownIntroActive = true;
  game.inputManager.setEnabled(false);
  game.inputManager.clearState?.();
  game.inputManager.clearLookInput?.();
  game.inputManager.lockedTargetSlot = null;
  game._prevInputs.clear?.();

  // Wait for the player's animator to finish building so idle plays before
  // the countdown starts. Don't freeze physics — let animations run.
  try {
    await _waitForIntroReady(game, game.localSlot);
  } catch (e) {
    console.warn("[SessionFlow] _waitForIntroReady failed, proceeding anyway:", e);
  }

  _primeCountdownIntro(game);

  const steps = [
    { label: "3", duration: 800 },
    { label: "2", duration: 800 },
    { label: "1", duration: 800 },
    { label: "FIGHT!", duration: 600 },
  ];

  const introHold = setInterval(() => _primeCountdownIntro(game), 150);
  try {
    for (const step of steps) {
      game.hud.showCountdown(step.label);
      await _wait(step.duration);
    }
  } catch (e) {
    console.warn("[SessionFlow] Countdown error:", e);
  } finally {
    clearInterval(introHold);

    // Always unfreeze — even if countdown threw
    game._countdownIntroActive = false;
    game._countdownIntroPrime = null;
    game.hud.hideCountdown();
    game.isPaused = false;
    game.inputManager.clearState?.();
    game.inputManager.clearLookInput?.();
    game._prevInputs.clear?.();
    game.inputManager.setEnabled(true);
  }
}

function _wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Spawn an enemy for story mode and register its AI.
 * Returns the slot number.
 */
async function _spawnStoryEnemy(game, characterId, spawnPos, yaw) {
  const state = await game.singlePlayer.spawnEnemy(characterId, spawnPos, {});
  if (state) {
    stabilizeSpawnStateRuntime(game, state, { yaw });
    game._storyFightActive = true;
    game.hud.showBossHealth?.(state.slot, state.hp, state.maxHP, characterId);
  }
  return state?.slot ?? null;
}

async function _spawnOneFightEnemy(game, opponentCharacterId, spawnPos, yaw) {
  const matchedEnemyDef = Object.values(ENEMY_ROSTER).find(
    (def) => def.characterId === opponentCharacterId
  ) ?? null;

  let state = null;
  if (matchedEnemyDef) {
    state = await game.singlePlayer.spawnEnemy(matchedEnemyDef.id, spawnPos, { isBoss: true });
  } else {
    state = await game.registry.spawnEnemy(opponentCharacterId, null, spawnPos, {
      isBoss: true,
      teamId: "ENEMY",
    });
    if (state) {
      state.isBoss = true;
      state.enemyDefId = `ONEFIGHT_${opponentCharacterId}`;
      state.aiProfileId = state.enemyDefId;
      state.powerLevel = state.characterDef?.basePowerLevel ?? state.powerLevel;
      state.maxHP = Math.max(state.maxHP ?? 0, 6000);
      state.hp = state.maxHP;
      state.maxKi = Math.max(state.maxKi ?? 0, 120);
      state.ki = state.maxKi;
      state.maxStamina = Math.max(state.maxStamina ?? 0, 120);
      state.stamina = state.maxStamina;
      game.enemyAI?.registerEnemy(
        state.slot,
        {
          aggroRange: 55,
          leashRange: 120,
          preferredDistance: 5,
          strafeBias: 0.6,
          attackCadenceMs: 500,
          blastChance: 0.3,
          ultimateChance: 0.05,
          blockChance: 0.35,
        },
        opponentCharacterId,
        _defaultOneFightAttacks(opponentCharacterId),
      );
    }
  }

  if (state) {
    stabilizeSpawnStateRuntime(game, state, { yaw });
    game.hud.showBossHealth?.(state.slot, state.hp, state.maxHP, opponentCharacterId);
  }
  return state?.slot ?? null;
}

function _defaultOneFightAttacks(characterId) {
  if (characterId === "RAYNE") {
    return ["MELEE_LIGHT", "MELEE_HEAVY", "KI_BLAST", "RUSH_COMBO", "RAYNE_BEAM"];
  }
  if (characterId === "AYO") {
    return ["MELEE_LIGHT", "MELEE_HEAVY", "KI_BLAST", "RUSH_COMBO", "AYO_MELEE_BEAM"];
  }
  return ["MELEE_LIGHT", "MELEE_HEAVY", "KI_BLAST", "RUSH_COMBO"];
}

function _ensureCharactersOnGround(game) {
  const localPlayer = game.registry.getState(game.localSlot);

  for (let slot = 0; slot < 16; slot++) {
    const state = game.registry.getState(slot);
    if (!state) continue;
    stabilizeSpawnStateRuntime(game, state, {
      yaw: _resolveIntroYaw(state, localPlayer),
    });
  }
}

/**
 * Position camera behind the player at a proper angle.
 * Sets orbital params directly (no setPosition/setTarget side-effects) and
 * resets spring state so RuntimeCameraController.update() starts clean.
 */
function _positionCameraBehindPlayer(game) {
  const player = game.registry.getState(game.localSlot);
  if (!player || !game.camera || !game.cameraController) return;

  const camera = game.camera;
  const playerYaw = player.rootNode?.rotation?.y ?? 0;

  // BabylonJS ArcRotateCamera convention:
  //   x = target.x + radius * sin(beta) * sin(alpha)
  //   z = target.z + radius * sin(beta) * cos(alpha)
  // For player facing +Z (yaw=0), camera behind = at -Z → cos(alpha)=-1 → alpha=PI.
  // General formula: behindAlpha = playerYaw + PI.
  const behindAlpha = playerYaw + Math.PI;
  const beta        = Math.min(CONFIG.camera.maxBeta, Math.max(CONFIG.camera.defaultBeta, 1.16));
  const radius      = CONFIG.camera.defaultRadius;

  // Mutate target vector directly — avoids rebuildAnglesAndRadius() side-effect
  // that would overwrite the alpha/beta/radius we're about to set.
  const t = player.position.add(new Vector3(0, CONFIG.camera.verticalOffset, 0));
  camera.target.copyFrom(t);

  // Set orbital params after target mutation so Babylon renders from the right spot
  camera.alpha  = behindAlpha;
  camera.beta   = beta;
  camera.radius = radius;

  // Zero out all spring velocities so there's no residual motion from prior state
  game.cameraController._springVel?.setAll?.(0);
  game.cameraController._springAlphaVel = 0;
  game.cameraController._springBetaVel  = 0;
  game.cameraController._springZoomVel  = 0;

  // Snap camera for the first N frames so the spring doesn't drift from the
  // just-computed position before the player has moved.
  game.cameraController.markInitialized();
}

/**
 * Force idle animation on all spawned characters.
 *
 * _buildAnimator() is triggered by the onPlayerSpawned event and runs
 * asynchronously, so the animator may not exist yet when afterStartRuntime()
 * calls this function.  We attempt immediately and then retry after a short
 * delay to cover the async gap.
 */
function _forceIdleAnimation(game) {
  _applyIdleToAllSlots(game);

  // Retry after 600 ms to catch animators that finished building after the
  // initial call (async retarget + clone pipeline).
  setTimeout(() => _applyIdleToAllSlots(game), 600);
}

function _applyIdleToAllSlots(game) {
  for (let slot = 0; slot < 16; slot++) {
    const state = game.registry.getState(slot);
    if (!state) continue;

    try {
      const animator = game.animationController?.getAnimator?.(slot);
      if (animator) {
        // Transition directly to IDLE — do NOT play a combat animation first.
        animator.transition?.("IDLE", { loop: true, forceRestart: true });
      }
    } catch (e) {
      // Non-fatal — the animation will settle on the next update tick.
    }
  }
}

function _primeCountdownIntro(game) {
  game.inputManager.clearLookInput?.();
  _ensureCharactersOnGround(game);
  _applyIdleToAllSlots(game);
  _positionCameraBehindPlayer(game);
}

async function _waitForIntroReady(game, localSlot, timeoutMs = 20000) {
  const startAt = performance.now();
  while ((performance.now() - startAt) < timeoutMs) {
    const state = game.registry.getState(localSlot);
    const animator = game.animationController?.getAnimator?.(localSlot);
    if (state?.rootNode && animator) {
      _applyIdleToAllSlots(game);
      return;
    }
    await _wait(50);
  }
}

function _resolveIntroYaw(state, localPlayer) {
  if (state.slot === localPlayer?.slot) return 0;
  if (state.entityType === "ENEMY" && localPlayer) {
    const toPlayer = localPlayer.position.subtract(state.position);
    toPlayer.y = 0;
    if (toPlayer.lengthSquared() > 0.0001) {
      return Math.atan2(toPlayer.x, toPlayer.z);
    }
  }
  return localPlayer?.rootNode?.rotation?.y ?? 0;
}

export function spawnTrainingTargetsRuntime(game) {
  const spawnPoints = game.zoneManager.currentZoneDef?.trainingSpawnPoints ?? [];
  const defs = ["GRANNY_BRAWLER", "AKADEMIKS_THUG", "ANDROID_DRONE"];

  defs.forEach((enemyDefId, index) => {
    let spawn;
    if (spawnPoints[index]) {
      spawn = spawnPoints[index].clone();
    } else {
      // Spawn enemies in a line in front of player, spaced apart
      // Player is at (0,0,0) by default, spawn enemies at z=15, spaced by x
      spawn = new Vector3((index - 1) * 8, 0, 15);
    }
    
    // Ensure Y is at ground level
    spawn.y = 0;
    
    game.singlePlayer.spawnEnemy(enemyDefId, spawn, { trainingDummy: true });
  });
}

export function scheduleRespawnRuntime(game, slot, delaySeconds) {
  if (game._respawnTimers.has(slot)) return;
  const timer = setTimeout(() => {
    game._respawnTimers.delete(slot);
    respawnSlotRuntime(game, slot);
  }, Math.max(0.2, delaySeconds) * 1000);
  game._respawnTimers.set(slot, timer);
}

export function respawnSlotRuntime(game, slot) {
  const state = game.registry.getState(slot);
  if (!state) return;

  const respawnPos = state.entityType === "PLAYER"
    ? game.zoneManager.getSpawnPoint(Math.max(0, slot))
    : (state.spawnPosition?.clone?.() ?? new Vector3(0, 1, 0));

  state.hp = state.maxHP;
  state.ki = state.maxKi;
  state.stamina = state.maxStamina;
  state.velocity.setAll(0);
  state.position.copyFrom(respawnPos);
  state.spawnPosition?.copyFrom?.(respawnPos);
  state.isDead = false;
  state.isFlying = false;
  state.isGrounded = true;
  state.isBlocking = false;
  state.isChargingKi = false;
  state.isInvincible = false;
  state.currentTransform = null;
  state.transformIndex = -1;
  state.powerLevel = state.characterDef?.basePowerLevel ?? state.powerLevel;
  stabilizeSpawnStateRuntime(game, state, {
    yaw: slot === game.localSlot ? 0 : null,
  });

  if (slot === game.localSlot) game.hud.showStatusMessage("Respawned");
}

export function clearTransientCombatRuntime(game) {
  game.combat.projectiles.forEach((proj) => proj.destroy?.());
  game.combat.beams.forEach((beam) => beam.destroy?.());
  game.combat.projectiles.clear();
  game.combat.beams.clear();
  game.combat.activeClashes.clear();
}

export function clearRespawnTimersRuntime(game) {
  game._respawnTimers.forEach((timer) => clearTimeout(timer));
  game._respawnTimers.clear();
}

function _setLocalRuntimeContext(game, {
  mode,
  profileId = null,
  missionId = null,
  scenarioId = null,
  autotestEnabled = false,
  oneFightConfig = null,
} = {}) {
  game.mode = mode;
  game.currentProfileId = profileId;
  game.currentMissionId = missionId;
  game.localSlot = 0;
  game.sessionManager.localSlot = 0;
  game._scenarioId = scenarioId;
  game._autotestEnabled = !!autotestEnabled;
  game._oneFightConfig = oneFightConfig;
}

async function _initializeProfileRuntime(game, profileId) {
  return game.singlePlayer.initProfile(profileId);
}

async function _spawnPrimaryPlayerRuntime(game, characterId, {
  slot = 0,
  applyProfile = false,
  yaw = 0,
} = {}) {
  const playerState = await game.registry.spawnPlayer(
    game.sessionManager.localPlayerId,
    slot,
    _getPrimarySpawnPoint(game, slot),
    characterId
  );
  if (applyProfile) {
    game.singlePlayer.applyProfileToPlayerState(playerState);
  }
  stabilizeSpawnStateRuntime(game, playerState, { yaw });
  return playerState;
}

function _resolveFinalZoneId(startZone, missionId, autoStartMission) {
  if (!missionId || !autoStartMission) return startZone;
  return getMissionDef(missionId)?.zoneId ?? startZone;
}

function _getPrimarySpawnPoint(game, slot = 0) {
  const zone = game.zoneManager.currentZoneDef;
  if (slot === 0) {
    return zone?.safeZoneSpawn?.clone?.() ?? game.zoneManager.getSpawnPoint(slot);
  }
  return game.zoneManager.getSpawnPoint(slot);
}

export function stabilizeSpawnStateRuntime(game, slotOrState, {
  yaw = null,
  snapSpawnPosition = true,
} = {}) {
  const state = typeof slotOrState === "number"
    ? game.registry.getState(slotOrState)
    : slotOrState;
  if (!state) return null;

  const groundY = game.movement?.snapStateToGround?.(state) ?? state.position.y;
  if (snapSpawnPosition) {
    state.spawnPosition?.copyFrom?.(state.position);
    if (state.spawnPosition && !state.spawnPosition.copyFrom) {
      state.spawnPosition.x = state.position.x;
      state.spawnPosition.y = groundY;
      state.spawnPosition.z = state.position.z;
    }
  }
  state.lastSafePosition?.copyFrom?.(state.position);

  state.velocity.setAll(0);
  state.lastMoveInput?.setAll?.(0);
  state.isDead = false;
  state.isGrounded = true;
  state.isFlying = false;
  state.isChargingKi = false;
  state.isBlocking = false;
  state.isInvincible = false;

  game.registry.restoreCharacterRenderState?.(state);

  if (state.rootNode) {
    state.rootNode.position.copyFrom(state.position);
    state.rootNode.rotationQuaternion = null;
    state.rootNode.rotation.x = 0;
    state.rootNode.rotation.z = 0;
    state.rootNode.rotation.y = Number.isFinite(yaw) ? yaw : (state.rootNode.rotation.y ?? 0);

    // ── Restore correct scaling if animation retargeting corrupted it ──
    if (state._correctScaling) {
      state.rootNode.scaling.copyFrom(state._correctScaling);
    }

    state.rootNode.computeWorldMatrix?.(true);
  }

  return state;
}
