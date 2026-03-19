import { describe, expect, it, vi } from "vitest";
import { canDamage, emitDamageEvents, scaleDamage } from "./DamageCalculator.js";
import { CombatEventBus } from "./CombatEventBus.js";

describe("DamageCalculator", () => {
  it("scales damage by power ratio with a floor", () => {
    expect(scaleDamage(100, 1000, 1000)).toBeGreaterThan(0);
    expect(scaleDamage(100, 2000, 1000)).toBeGreaterThan(scaleDamage(100, 1000, 1000));
    expect(scaleDamage(1, 1, 100000)).toBeGreaterThanOrEqual(50);
  });

  it("blocks friendly fire and allows opposing teams", () => {
    expect(canDamage({ teamId: "HERO" } as never, { teamId: "HERO" } as never)).toBe(false);
    expect(canDamage({ teamId: "HERO" } as never, { teamId: "ENEMY" } as never)).toBe(true);
  });

  it("emits player damage events only when the hero team is hit", () => {
    const bus = new CombatEventBus();
    const listener = vi.fn();
    bus.on("onDamageTakenByPlayer", listener);

    emitDamageEvents(
      bus,
      { slot: 1, teamId: "ENEMY" } as never,
      { slot: 0, teamId: "HERO" } as never,
      250,
      "MELEE_LIGHT",
    );
    emitDamageEvents(
      bus,
      { slot: 0, teamId: "HERO" } as never,
      { slot: 1, teamId: "ENEMY" } as never,
      250,
      "MELEE_LIGHT",
    );

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      attackerSlot: 1,
      targetSlot: 0,
      damage: 250,
      attackId: "MELEE_LIGHT",
    });
  });
});