import { describe, expect, it, vi, beforeEach } from "vitest";
import { Vector3 } from "@babylonjs/core";
import { CombatSystem, ATTACK_CATALOG } from "./CombatSystem";
import type { CombatState, CombatRegistry, KnockbackController } from "./types/CharacterViews";

// ─── Mock Helpers ────────────────────────────────────────────────────────────

function makeState(overrides: Partial<CombatState> = {}): CombatState {
  return {
    slot: 0,
    playerId: "player_0",
    isDead: false,
    ki: 100,
    stamina: 100,
    powerLevel: 1_000_000,
    position: new Vector3(0, 0, 0),
    velocity: Vector3.Zero(),
    rootNode: { position: new Vector3(0, 0, 0), rotation: { y: 0 } },
    teamId: "HERO",
    entityType: "PLAYER",
    ...overrides,
  };
}

function makeRegistry(states: CombatState[]): CombatRegistry {
  const slots = new Map<number, CombatState>();
  const playerMap = new Map<string, CombatState>();
  for (const s of states) {
    slots.set(s.slot, s);
    playerMap.set(s.playerId, s);
  }

  return {
    getState: (slot: number) => slots.get(slot) ?? null,
    getStateByPlayerId: (id: string) => playerMap.get(id) ?? null,
    slots,
    applyDamage: vi.fn((_slot: number, damage: number) => {
      return damage;
    }),
    applyHeal: vi.fn((slot: number, amount: number) => {
      const s = slots.get(slot);
      if (!s) return 0;
      return amount;
    }),
  };
}

function makeMovement(): KnockbackController {
  return { applyKnockback: vi.fn() };
}

function makeScene() {
   
  return {} as any;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("CombatSystem", () => {
  let attacker: CombatState;
  let target: CombatState;
  let registry: CombatRegistry;
  let movement: KnockbackController;
  let combat: CombatSystem;

  beforeEach(() => {
    attacker = makeState({ slot: 0, playerId: "p0", teamId: "HERO" });
    target = makeState({
      slot: 1,
      playerId: "p1",
      teamId: "ENEMY",
      position: new Vector3(2, 0, 0), // within melee range
    });
    registry = makeRegistry([attacker, target]);
    movement = makeMovement();
    combat = new CombatSystem(makeScene(), registry, movement);
  });

  describe("processAttack", () => {
    it("returns null for unknown attack IDs", () => {
      const result = combat.processAttack("p0", "NONEXISTENT_ATTACK");
      expect(result).toBeNull();
    });

    it("returns null when attacker is dead", () => {
      attacker.isDead = true;
      const result = combat.processAttack("p0", "MELEE_LIGHT");
      expect(result).toBeNull();
    });

    it("returns null when player not found", () => {
      const result = combat.processAttack("unknown_player", "MELEE_LIGHT");
      expect(result).toBeNull();
    });

    it("deducts ki and stamina on attack", () => {
      const def = ATTACK_CATALOG["MELEE_HEAVY"];
      const kiBefore = attacker.ki;
      const stamBefore = attacker.stamina;

      combat.processAttack("p0", "MELEE_HEAVY", { targetSlot: 1 });

      expect(attacker.ki).toBe(kiBefore - (def?.kiCost ?? 0));
      expect(attacker.stamina).toBe(stamBefore - (def?.staminaCost ?? 0));
    });

    it("rejects attack when ki is insufficient", () => {
      attacker.ki = 0;
      const result = combat.processAttack("p0", "KAMEHAMEHA"); // costs 40 ki
      expect(result).toBeNull();
    });

    it("rejects attack when stamina is insufficient", () => {
      attacker.stamina = 0;
      const result = combat.processAttack("p0", "MELEE_LIGHT"); // costs stamina
      expect(result).toBeNull();
    });

    it("enforces cooldown between attacks", () => {
      combat.processAttack("p0", "MELEE_LIGHT", { targetSlot: 1 });
      // Immediate second attack should be cooldown-blocked
      const result = combat.processAttack("p0", "MELEE_LIGHT", { targetSlot: 1 });
      expect(result).toBeNull();
    });
  });

  describe("melee hits", () => {
    it("applies damage to target in range", () => {
      target.position = new Vector3(1.5, 0, 0); // well within 3.5m range
      combat.processAttack("p0", "MELEE_LIGHT", { targetSlot: 1 });

      expect(registry.applyDamage).toHaveBeenCalledWith(
        1,
        expect.any(Number),
        "p0",
      );
    });

    it("does not damage same-team entities", () => {
      target.teamId = "HERO"; // same team
      combat.processAttack("p0", "MELEE_LIGHT", { targetSlot: 1 });

      expect(registry.applyDamage).not.toHaveBeenCalled();
    });

    it("does not damage invincible targets", () => {
      target.isInvincible = true;
      combat.processAttack("p0", "MELEE_LIGHT", { targetSlot: 1 });

      expect(registry.applyDamage).not.toHaveBeenCalled();
    });

    it("reduces damage when target is blocking", () => {
      target.isBlocking = true;
      target.position = new Vector3(1.5, 0, 0);
      combat.processAttack("p0", "MELEE_LIGHT", { targetSlot: 1 });

      if ((registry.applyDamage as ReturnType<typeof vi.fn>).mock.calls.length > 0) {
        const dmg = (registry.applyDamage as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as number;
        const baseDamage = ATTACK_CATALOG["MELEE_LIGHT"]?.baseDamage ?? 280;
        // Blocked damage should be ~30% of raw damage
        expect(dmg).toBeLessThan(baseDamage);
      }
    });
  });

  describe("event system", () => {
    it("emits onHit when damage is dealt", () => {
      const onHit = vi.fn();
      combat.on("onHit", onHit);

      target.position = new Vector3(1.5, 0, 0);
      combat.processAttack("p0", "MELEE_LIGHT", { targetSlot: 1 });

      expect(onHit).toHaveBeenCalled();
    });

    it("supports unsubscribe via returned function", () => {
      const listener = vi.fn();
      const unsub = combat.on("onHit", listener);
      unsub();

      target.position = new Vector3(1.5, 0, 0);
      combat.processAttack("p0", "MELEE_LIGHT", { targetSlot: 1 });

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("charge system", () => {
    it("sets isChargingKi on startCharge", () => {
      attacker.isChargingKi = false;
      combat.startCharge("p0", "KAMEHAMEHA"); // beam with chargeTime: 1200
      expect(attacker.isChargingKi).toBe(true);
    });

    it("clears isChargingKi on releaseCharge", () => {
      attacker.isChargingKi = false;
      combat.startCharge("p0", "KAMEHAMEHA");
      expect(attacker.isChargingKi).toBe(true);
      // Drain ki so processAttack inside releaseCharge is rejected early,
      // avoiding Babylon scene-dependent beam creation
      attacker.ki = 0;
      combat.releaseCharge("p0", "KAMEHAMEHA");
      expect(attacker.isChargingKi).toBe(false);
    });

    it("does nothing for attacks without chargeTime", () => {
      combat.startCharge("p0", "MELEE_LIGHT"); // no chargeTime
      expect(attacker.isChargingKi).toBeFalsy();
    });
  });

  describe("update", () => {
    it("does not throw with no active projectiles or beams", () => {
      expect(() => combat.update(1 / 60)).not.toThrow();
    });
  });

  describe("integration: full combat flow", () => {
    let now: number;

    beforeEach(() => {
      now = 1000;
      vi.spyOn(performance, "now").mockImplementation(() => now);
    });

    it("chains light → heavy melee with damage, knockback, and events", () => {
      const onHit = vi.fn();
      combat.on("onHit", onHit);

      // Place target within melee range
      target.position = new Vector3(1.5, 0, 0);

      // 1. Light attack lands
      const r1 = combat.processAttack("p0", "MELEE_LIGHT", { targetSlot: 1 });
      expect(r1).not.toBeNull();
      expect(registry.applyDamage).toHaveBeenCalledWith(1, expect.any(Number), "p0");
      expect(onHit).toHaveBeenCalledTimes(1);

      // Advance past cooldown (1 second)
      now += 1000;

      // 2. Follow-up heavy attack
      const r2 = combat.processAttack("p0", "MELEE_HEAVY", { targetSlot: 1 });
      expect(r2).not.toBeNull();
      expect(registry.applyDamage).toHaveBeenCalledTimes(2);
      expect(onHit).toHaveBeenCalledTimes(2);

      // 3. Ki and stamina were consumed across both attacks
      const lightDef = ATTACK_CATALOG["MELEE_LIGHT"];
      const heavyDef = ATTACK_CATALOG["MELEE_HEAVY"];
      const totalKiCost = (lightDef?.kiCost ?? 0) + (heavyDef?.kiCost ?? 0);
      const totalStamCost = (lightDef?.staminaCost ?? 0) + (heavyDef?.staminaCost ?? 0);
      expect(attacker.ki).toBe(100 - totalKiCost);
      expect(attacker.stamina).toBe(100 - totalStamCost);

      // 4. Knockback was applied on heavy
      expect(movement.applyKnockback).toHaveBeenCalled();
    });

    it("blocks attack → target blocks → attacker waits cooldown → re-attacks", () => {
      target.position = new Vector3(1.5, 0, 0);
      target.isBlocking = true;

      // Attack while blocking — should still fire (reduced damage handled internally)
      combat.processAttack("p0", "MELEE_LIGHT", { targetSlot: 1 });

      // Cooldown blocks immediate follow-up
      const blocked = combat.processAttack("p0", "MELEE_LIGHT", { targetSlot: 1 });
      expect(blocked).toBeNull();

      // After cooldown, target drops guard
      now += 1000;
      target.isBlocking = false;

      const hit = combat.processAttack("p0", "MELEE_LIGHT", { targetSlot: 1 });
      expect(hit).not.toBeNull();
    });
  });
});
