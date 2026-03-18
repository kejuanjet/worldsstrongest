import { describe, expect, it, vi } from "vitest";
import { GAME_MODE } from "./gameModes.js";
import { isAuthoritativeMode, resolveAttackId, stepSimulationRuntime } from "./GameplayRuntime.js";

describe("GameplayRuntime", () => {
  it("resolves character-specific and stance-sensitive attacks", () => {
    const swordState = { characterId: "AYO", currentStance: "SWORD" };
    const meleeState = { characterId: "GOKU", currentStance: "MELEE" };

    expect(resolveAttackId(swordState, { btnHeavy: true })).toBe("SWORD_HEAVY");
    expect(resolveAttackId(meleeState, { btnAttack: true })).toBe("MELEE_LIGHT");
    expect(resolveAttackId({ characterId: "VEGETA", currentStance: "MELEE" }, { btnUltimate: true })).toBe("FINAL_FLASH");
    expect(resolveAttackId({ characterId: "HANA", currentStance: "MELEE" }, { btnBlast: true })).toBe("TWO_HAND_SPELL");
  });

  it("marks only single-player, training, and host as authoritative", () => {
    expect(isAuthoritativeMode(GAME_MODE.SINGLE_PLAYER)).toBe(true);
    expect(isAuthoritativeMode(GAME_MODE.TRAINING)).toBe(true);
    expect(isAuthoritativeMode(GAME_MODE.MULTIPLAYER_HOST)).toBe(true);
    expect(isAuthoritativeMode(GAME_MODE.MULTIPLAYER_CLIENT)).toBe(false);
    expect(isAuthoritativeMode(GAME_MODE.MENU)).toBe(false);
  });

  it("runs the client simulation branch without host-side systems", () => {
    const game = {
      mode: GAME_MODE.MULTIPLAYER_CLIENT,
      localSlot: 2,
      inputManager: {
        getMovementVector: () => ({ x: 1, z: 0 }),
        getFlyAxis: () => 0,
        isHeld: () => false,
        isJustPressed: () => false,
        getMashCount: () => 0,
        lockedTargetSlot: null,
      },
      camera: { alpha: 0, beta: 0 },
      movement: { applyInput: vi.fn() },
      registry: { update: vi.fn() },
      combat: { update: vi.fn() },
      enemyAI: { update: vi.fn() },
    };

    stepSimulationRuntime(game, 1 / 60, {});

    expect(game.movement.applyInput).toHaveBeenCalledWith(2, expect.objectContaining({ moveX: 1, moveZ: 0, flyY: 0 }));
    expect(game.registry.update).toHaveBeenCalledWith(1 / 60);
    expect(game.combat.update).toHaveBeenCalledWith(1 / 60);
    expect(game.enemyAI.update).not.toHaveBeenCalled();
  });
});
