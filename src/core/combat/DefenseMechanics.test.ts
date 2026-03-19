import { Vector3 } from "@babylonjs/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  canMeleeClash,
  canZVanish,
  deflectProjectile,
  executeMeleeClash,
  executeZVanish,
} from "./DefenseMechanics.js";
import { CombatEventBus } from "./CombatEventBus.js";

describe("DefenseMechanics", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("allows Z-Vanish inside the dodge window when stamina is available", () => {
    vi.spyOn(performance, "now").mockReturnValue(1000);
    expect(canZVanish({ lastDodgeTime: 900, stamina: 100 } as never)).toBe(true);
    expect(canZVanish({ lastDodgeTime: 600, stamina: 100 } as never)).toBe(false);
    expect(canZVanish({ lastDodgeTime: 900, stamina: 0 } as never)).toBe(false);
  });

  it("teleports the evader behind the attacker and emits the event", () => {
    const bus = new CombatEventBus();
    const listener = vi.fn();
    bus.on("onZVanish", listener);

    const evader = {
      slot: 2,
      stamina: 100,
      lastDodgeTime: 950,
      position: new Vector3(0, 0, 0),
      velocity: new Vector3(1, 0, 0),
      rootNode: {
        position: new Vector3(0, 0, 0),
        rotation: { y: 0 },
      },
    };
    const attacker = {
      slot: 1,
      position: new Vector3(10, 0, 0),
      velocity: Vector3.Zero(),
      rootNode: {
        rotation: { y: Math.PI / 2 },
      },
    };

    executeZVanish(bus, evader as never, attacker as never);

    expect(evader.position.x).toBeLessThan(attacker.position.x);
    expect(evader.rootNode.position.equals(evader.position)).toBe(true);
    expect(listener).toHaveBeenCalledWith({ evaderSlot: 2, attackerSlot: 1 });
  });

  it("detects melee clash windows and applies mirrored knockback", () => {
    vi.spyOn(performance, "now").mockReturnValue(1000);
    expect(canMeleeClash({ lastMeleeTime: 900 } as never)).toBe(true);
    expect(canMeleeClash({ lastMeleeTime: 700 } as never)).toBe(false);

    const bus = new CombatEventBus();
    const listener = vi.fn();
    const applyKnockback = vi.fn();
    bus.on("onMeleeClash", listener);

    const fighterA = { slot: 0, lastMeleeTime: 950, position: new Vector3(0, 0, 0) };
    const fighterB = { slot: 1, lastMeleeTime: 950, position: new Vector3(2, 0, 0) };
    const clashedSlots = new Set<number>();

    executeMeleeClash(bus, clashedSlots, fighterA as never, fighterB as never, applyKnockback);

    expect(clashedSlots.has(0)).toBe(true);
    expect(clashedSlots.has(1)).toBe(true);
    expect(applyKnockback).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("reverses projectile ownership on deflect", () => {
    const bus = new CombatEventBus();
    const listener = vi.fn();
    bus.on("onProjectileDeflected", listener);

    const projectile = {
      id: "proj_1",
      position: new Vector3(0, 0, 0),
      direction: new Vector3(1, 0, 0),
      ownerSlot: 1,
      ownerId: "attacker",
      speed: 10,
    };
    const deflector = {
      slot: 2,
      playerId: "deflector",
      lastMeleeTime: 950,
    };
    const originalOwner = {
      position: new Vector3(-5, 0, 0),
    };

    deflectProjectile(bus, projectile as never, deflector as never, originalOwner as never);

    expect(projectile.ownerSlot).toBe(2);
    expect(projectile.ownerId).toBe("deflector");
    expect(projectile.speed).toBeGreaterThan(10);
    expect(listener).toHaveBeenCalledWith({ deflectorSlot: 2, projId: "proj_1" });
  });
});