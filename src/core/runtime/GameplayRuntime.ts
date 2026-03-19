import { Vector3 } from "@babylonjs/core";
import { buildLocalInputState, consumeInputEdges, getAuthoritativeInputForSlot } from "./LoopRuntimeHelpers.js";
import { resolveConfiguredBeamAttack, resolveConfiguredUltimateAttack } from "../combat/AttackRouting.js";
import { GAME_MODE } from "./gameModes.js";
import type { AttackInputEdges, GameMode, InputStateLike } from "./runtimeTypes.js";

interface RuntimeRootNode {
  rotation?: { y: number };
}

interface RuntimeTransformDef {
  id: string;
}

interface RuntimeCharacterState {
  slot: number;
  playerId: string;
  position: Vector3;
  velocity: Vector3;
  currentStance?: string;
  rootNode?: RuntimeRootNode | null;
  entityType?: string;
  teamId?: string | null;
  isDead?: boolean;
  isTrainingDummy?: boolean;
  isActionLocked?: boolean;
  isBlocking?: boolean;
  isChargingKi?: boolean;
  isFlying?: boolean;
  isGrounded?: boolean;
  stamina: number;
  ki: number;
  lastDodgeTime?: number;
  chaseTargetSlot?: number | null;
  chaseWindowEnd?: number;
  characterDef?: {
    transformations?: RuntimeTransformDef[];
    ultimateAttack?: string | null;
    beamAttacks?: string[];
    spellAttacks?: string[];
  } | null;
  transformIndex?: number;
}

interface RuntimeRegistry {
  getState(slot: number): RuntimeCharacterState | null;
  readonly slots: Map<number, RuntimeCharacterState>;
  transform(slot: number, transformId: string): void;
  revertTransform(slot: number): void;
  update(step: number): void;
  _emit?(eventName: string, payload: unknown): void;
}

interface RuntimeGame {
  mode: GameMode;
  localSlot: number;
  config?: {
    movement?: { dodgeStaminaCost?: number };
    combat?: { chaseKiCost?: number };
  };
  registry: RuntimeRegistry;
  enemyAI: { update(step: number): void };
  movement: { applyInput(slot: number, input: InputStateLike): void };
  combat: {
    processAttack(playerId: string, attackId: string, options: { direction: Vector3; targetSlot: number | null }): unknown;
    update(step: number): void;
  };
  combatPresentation: {
    playAttackPresentation(slot: number, attackId: string, direction: Vector3, event: unknown): void;
  };
  singlePlayer: { update(step: number): void };
  dummyManager: { update(step: number): void };
  zoneManager: { update(step: number, players: RuntimeCharacterState[]): void };
  openWorld?: { update?(step: number): void };
  _queuedAiInputs: Map<number, InputStateLike>;
  _remoteInputs: Map<number, InputStateLike>;
  _prevInputs: Map<number, InputStateLike>;
  inputManager: {
    getMovementVector(): Vector3;
    getFlyAxis(): number;
    isHeld(action: string): boolean;
    isJustPressed(action: string): boolean;
    lockedTargetSlot: number | null;
    softLockTargetSlot?: number | null;
    getMashCount(): number;
  };
  camera: { alpha: number; beta: number };
}

type RuntimeInputState = InputStateLike & {
  btnHeal?: boolean;
  btnMagicAttack?: boolean;
};

export function isAuthoritativeMode(mode: GameMode): boolean {
  return mode === GAME_MODE.SINGLE_PLAYER
    || mode === GAME_MODE.TRAINING
    || mode === GAME_MODE.MULTIPLAYER_HOST;
}

export function describeStanceRuntime(game: RuntimeGame, slot: number): string {
  const state = game.registry.getState(slot);
  return state?.currentStance || "MELEE";
}

export function getLockCandidatesRuntime(game: RuntimeGame): number[] {
  const local = game.registry.getState(game.localSlot);
  return [...game.registry.slots.entries()]
    .filter(([slot, state]) => slot !== game.localSlot && state && !state.isDead)
    .filter(([, state]) => !local || state.teamId !== local.teamId)
    .map(([slot]) => slot);
}

export function resolveAttackId(state: RuntimeCharacterState, edges: AttackInputEdges): string | null {
  if (edges.btnHeal && edges.btnMagicAttack) return "MAGIC_HEAL";
  if (edges.btnHeal) return "HEAL_PULSE";
  if (edges.btnMagicAttack) return "TWO_HAND_SPELL";
  if (edges.btnUltimate) return resolveConfiguredUltimateAttack(state) ?? null;
  if (edges.btnRush) return "RUSH_COMBO";
  if (edges.btnGrab) return "GRAB";
  if (edges.btnBlast) return resolveConfiguredBeamAttack(state);
  if (edges.btnHeavy) return state.currentStance === "SWORD" ? "SWORD_HEAVY" : "MELEE_HEAVY";
  if (edges.btnAttack) return state.currentStance === "SWORD" ? "SWORD_LIGHT" : "MELEE_LIGHT";
  return null;
}

export function resolveAttackDirection(game: RuntimeGame, state: RuntimeCharacterState, input: RuntimeInputState): Vector3 {
  if (input.lockedSlot != null) {
    const target = game.registry.getState(input.lockedSlot);
    if (target) {
      const toTarget = target.position.subtract(state.position);
      toTarget.y = 0;
      if (toTarget.lengthSquared() > 0.0001) return toTarget.normalize();
    }
  }

  const move = new Vector3(input.moveX ?? 0, input.flyY ?? 0, input.moveZ ?? 0);
  if (move.lengthSquared() > 0.0001) return move.normalize();

  const yaw = state.rootNode?.rotation?.y ?? 0;
  return new Vector3(Math.sin(yaw), 0, Math.cos(yaw)).normalize();
}

export function processGameplayInputRuntime(
  game: RuntimeGame,
  slot: number,
  input: RuntimeInputState,
  idleInput: RuntimeInputState,
): void {
  const state = game.registry.getState(slot);
  if (!state || state.isDead || state.isTrainingDummy) return;

  const edges = consumeInputEdges(game, slot, input, idleInput);

  if (edges.btnDodge && !state.isActionLocked && state.stamina >= (game.config?.movement?.dodgeStaminaCost ?? 25)) {
    state.lastDodgeTime = performance.now();
  }

  const now = performance.now();
  const chaseTargetSlot = state.chaseTargetSlot;
  if (chaseTargetSlot != null && now < (state.chaseWindowEnd || 0) && edges.btnRush) {
    const target = game.registry.getState(chaseTargetSlot);
    if (target && !target.isDead && state.ki >= (game.config?.combat?.chaseKiCost || 10)) {
      state.chaseTargetSlot = null;
      state.chaseWindowEnd = 0;
      state.ki = Math.max(0, state.ki - (game.config?.combat?.chaseKiCost || 10));
      state.isActionLocked = false;

      const offset = target.position.subtract(state.position).normalize().scale(2.5);
      state.position.copyFrom(target.position.subtract(offset));
      state.velocity.setAll(0);
      state.isFlying = true;
      state.isGrounded = false;

      if (state.rootNode?.rotation) {
        const toTarget = target.position.subtract(state.position);
        state.rootNode.rotation.y = Math.atan2(toTarget.x, toTarget.z);
      }

      game.registry._emit?.("onChaseTriggered", { slot, targetSlot: target.slot });
      return;
    }
  }

  state.isBlocking = !!input.btnBlock && !state.isActionLocked;
  if (edges.btnKiStart && !state.isActionLocked) state.isChargingKi = true;
  if (edges.btnKiEnd) state.isChargingKi = false;

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
    state.isActionLocked = false;
  }
}

export function stepSimulationRuntime(game: RuntimeGame, step: number, idleInput: RuntimeInputState): void {
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
      [...game.registry.slots.values()].filter((state) => state.entityType === "PLAYER"),
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