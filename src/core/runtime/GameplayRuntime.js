import { Vector3 } from "@babylonjs/core";
import { buildLocalInputState, consumeInputEdges, getAuthoritativeInputForSlot } from "./LoopRuntimeHelpers.js";
import { GAME_MODE } from "./gameModes.js";
import { CONFIG } from "../index.js";

const BEAM_ATTACK_MAP = {
  GOKU: "KAMEHAMEHA",
  VEGETA: "GALICK_GUN",
  GOHAN: "MASENKO",
  PICCOLO: "SPECIAL_BEAM_CANNON",
  HANA: "TWO_HAND_SPELL",
  RAYNE: "RAYNE_BEAM",
};

const ULTIMATE_ATTACK_MAP = {
  GOKU: "SPIRIT_BOMB",
  VEGETA: "FINAL_FLASH",
  GOHAN: "MASENKO",
  PICCOLO: "SPECIAL_BEAM_CANNON",
  AYO: "AYO_SWORD_BEAM",
  HANA: "MAGIC_HEAL",
  RAYNE: "RUSH_COMBO",
};

export function isAuthoritativeMode(mode) {
  return mode === GAME_MODE.SINGLE_PLAYER
    || mode === GAME_MODE.TRAINING
    || mode === GAME_MODE.MULTIPLAYER_HOST;
}

export function describeStanceRuntime(game, slot) {
  const state = game.registry.getState(slot);
  return state?.currentStance || "MELEE";
}

export function getLockCandidatesRuntime(game) {
  const local = game.registry.getState(game.localSlot);
  return [...game.registry.slots.entries()]
    .filter(([slot, state]) => slot !== game.localSlot && state && !state.isDead)
    .filter(([, state]) => !local || state.teamId !== local.teamId)
    .map(([slot]) => slot);
}

export function resolveAttackId(state, edges) {
  // Hana healing spells: btnHeal triggers heal, btnMagicAttack selects the big heal
  if (edges.btnHeal && edges.btnMagicAttack) return "MAGIC_HEAL";
  if (edges.btnHeal) return "HEAL_PULSE";
  if (edges.btnMagicAttack) return "TWO_HAND_SPELL";
  if (edges.btnUltimate) return ULTIMATE_ATTACK_MAP[state.characterId] ?? null;
  if (edges.btnRush) return "RUSH_COMBO";
  if (edges.btnGrab) return "GRAB";
  if (edges.btnBlast) {
    if (state.characterId === "AYO") {
      return state.currentStance === "SWORD" ? "AYO_SWORD_BEAM" : "AYO_MELEE_BEAM";
    }
    return BEAM_ATTACK_MAP[state.characterId] ?? "KI_BLAST";
  }
  if (edges.btnHeavy) return state.currentStance === "SWORD" ? "SWORD_HEAVY" : "MELEE_HEAVY";
  if (edges.btnAttack) return state.currentStance === "SWORD" ? "SWORD_LIGHT" : "MELEE_LIGHT";
  return null;
}

export function resolveAttackDirection(game, state, input) {
  if (input.lockedSlot != null) {
    const target = game.registry.getState(input.lockedSlot);
    if (target) {
      const toTarget = target.position.subtract(state.position);
      toTarget.y = 0; // Flatten so the character doesn't pitch into the floor
      if (toTarget.lengthSquared() > 0.0001) return toTarget.normalize();
    }
  }

  const move = new Vector3(input.moveX ?? 0, input.flyY ?? 0, input.moveZ ?? 0);
  if (move.lengthSquared() > 0.0001) return move.normalize();

  const yaw = state.rootNode?.rotation?.y ?? 0;
  return new Vector3(Math.sin(yaw), 0, Math.cos(yaw)).normalize();
}

export function processGameplayInputRuntime(game, slot, input, idleInput) {
  const state = game.registry.getState(slot);
  if (!state || state.isDead || state.isTrainingDummy) return;

  const edges = consumeInputEdges(game, slot, input, idleInput);

  // ── Z-Vanish Dodge Tracking ──
  if (edges.btnDodge && !state.isActionLocked && state.stamina >= (CONFIG.movement?.dodgeStaminaCost ?? 25)) {
    state.lastDodgeTime = performance.now();
  }

  // ── Aerial Chase Juggling Hook ──
  const now = performance.now();
  if (state.chaseTargetSlot !== null && now < (state.chaseWindowEnd || 0) && edges.btnRush) {
    const target = game.registry.getState(state.chaseTargetSlot);
    if (target && !target.isDead && state.ki >= (CONFIG.combat.chaseKiCost || 10)) {
      state.chaseTargetSlot = null;
      state.chaseWindowEnd = 0;
      state.ki = Math.max(0, state.ki - (CONFIG.combat.chaseKiCost || 10));
      state.isActionLocked = false; // Break heavy attack animation lock
      
      // High speed dash to target mid-air
      const offset = target.position.subtract(state.position).normalize().scale(2.5);
      state.position.copyFrom(target.position.subtract(offset));
      state.velocity.setAll(0);
      state.isFlying = true;
      state.isGrounded = false;
      
      if (state.rootNode) {
        const toTarget = target.position.subtract(state.position);
        state.rootNode.rotation.y = Math.atan2(toTarget.x, toTarget.z);
      }
      
      game.registry._emit("onChaseTriggered", { slot, targetSlot: target.slot });
      return; // Skip normal attack processing this frame to let them arrive cleanly
    }
  }

  // Allow blocking and ki charge even while action-locked
  state.isBlocking = !!input.btnBlock && !state.isActionLocked;
  if (edges.btnKiStart && !state.isActionLocked) state.isChargingKi = true;
  if (edges.btnKiEnd) state.isChargingKi = false;

  // Skip offensive actions while action-locked (mid-attack animation)
  if (state.isActionLocked) return;

  if (edges.btnTransform) {
    const transforms = state.characterDef?.transformations ?? [];
    const nextIndex = Math.min((state.transformIndex ?? -1) + 1, transforms.length - 1);
    const nextTransform = transforms[nextIndex];
    if (nextTransform) {
      game.registry.transform(slot, nextTransform.id);
    }
  }

  if (edges.btnTransformDown) {
    game.registry.revertTransform(slot);
  }

  const attackId = resolveAttackId(state, edges);
  if (!attackId) return;

  state.isActionLocked = true;
  const direction = resolveAttackDirection(game, state, input);
  const event = game.combat.processAttack(state.playerId, attackId, {
    direction,
    targetSlot: input.lockedSlot ?? null,
  });

  if (event) {
    game.combatPresentation.playAttackPresentation(slot, attackId, direction, event);
  } else {
    // Attack was rejected (cooldown, insufficient ki, etc.) — release lock immediately
    state.isActionLocked = false;
  }
}

export function stepSimulationRuntime(game, step, idleInput) {
  if (isAuthoritativeMode(game.mode)) {
    game.enemyAI.update(step);
    for (const [slot] of game.registry.slots) {
      const input = getAuthoritativeInputForSlot(game, slot, idleInput);
      processGameplayInputRuntime(game, slot, input, idleInput);
      game.movement.applyInput(slot, input);
    }
    game.singlePlayer.update(step);
    game.dummyManager.update(step);
    game.zoneManager.update(
      step,
      [...game.registry.slots.values()].filter((state) => state?.entityType === "PLAYER")
    );
    game.openWorld?.update?.(step);
    game.registry.update(step);
    game.combat.update(step);
    return;
  }

  if (game.mode === GAME_MODE.MULTIPLAYER_CLIENT) {
    const input = buildLocalInputState(game);
    game.movement.applyInput(game.localSlot, input);
    game.registry.update(step);
    game.combat.update(step);
  }
}
