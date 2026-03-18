import { Vector3 } from "@babylonjs/core";

export class CombatPresentationRouter {
  constructor({ registry, audioManager, vfx, animationController }) {
    this.registry = registry;
    this.audioManager = audioManager;
    this.vfx = vfx;
    this.animationController = animationController;
  }

  playAttackPresentation(slot, attackId, direction, event = null) {
    const state = this.registry.getState(slot);
    if (!state || !attackId) return;

    const trailOrigin =
      state.weaponNode?.getAbsolutePosition?.() ??
      state.rootNode?.position ??
      state.position;

    this.audioManager.playAttackWhoosh(attackId, trailOrigin);
    this._spawnAttackTrail(state, attackId, direction);

    if (attackId === "RUSH_COMBO") {
      this.animationController.triggerRushCombo(slot);
      return;
    }
    if (attackId === "GRAB") {
      this.animationController.triggerThrow(slot);
      return;
    }
    if (event?.type === "BEAM_FIRED" || event?.type === "ULTIMATE" || /(BEAM|FLASH|BOMB)/.test(attackId)) {
      this.animationController.triggerBeamFire(slot);
      return;
    }
    if (event?.type === "PROJECTILE_SPAWNED" || /(KI_|SPELL|HEAL)/.test(attackId)) {
      this.animationController.triggerKiBlast(slot);
      return;
    }
    if (/HEAVY/.test(attackId)) {
      this.animationController.triggerAttackHeavy(slot);
      return;
    }

    this.animationController.triggerAttackLight(slot);
  }

  playAttackPresentationFromEvent(event) {
    if (!event) return;

    const primary = Array.isArray(event.events) ? event.events[0] : event;
    const slot = primary?.ownerSlot ?? primary?.attackerSlot ?? null;
    const attackId = primary?.attackId ?? null;
    if (slot == null || !attackId) return;

    let direction = null;
    if (primary.direction && typeof primary.direction.x === "number") {
      direction = new Vector3(primary.direction.x, primary.direction.y ?? 0, primary.direction.z);
    } else if (primary.targetSlot != null) {
      const attacker = this.registry.getState(slot);
      const target = this.registry.getState(primary.targetSlot);
      if (attacker && target) {
        direction = target.position.subtract(attacker.position);
      }
    }

    this.playAttackPresentation(slot, attackId, direction, primary);
  }

  _spawnAttackTrail(state, attackId, direction) {
    if (!state || !direction) return;

    const dir = direction.clone();
    if (dir.lengthSquared() < 0.0001) return;
    dir.normalize();

    const origin =
      state.weaponNode?.getAbsolutePosition?.() ??
      state.rootNode?.position ??
      state.position;

    if (attackId.includes("SWORD")) {
      this.vfx.spawnWeaponTrail(origin, dir, {
        colorHex: attackId.includes("BEAM") || attackId.includes("RANGED") ? "#93c5fd" : "#e2e8f0",
        length: attackId.includes("HEAVY") ? 5.6 : 4.8,
        height: attackId.includes("HEAVY") ? 1.35 : 1.0,
        duration: attackId.includes("HEAVY") ? 0.2 : 0.16,
        heightOffset: 1.4,
      });
      return;
    }

    if (/(MELEE|RUSH|GRAB)/.test(attackId)) {
      this.vfx.spawnWeaponTrail(origin, dir, {
        colorHex: /HEAVY|RUSH|GRAB/.test(attackId) ? "#f59e0b" : "#fde68a",
        length: /HEAVY|RUSH|GRAB/.test(attackId) ? 3.9 : 3.1,
        height: /HEAVY|RUSH|GRAB/.test(attackId) ? 1.15 : 0.82,
        duration: /HEAVY|RUSH|GRAB/.test(attackId) ? 0.18 : 0.12,
        heightOffset: 1.2,
        alpha: 0.6,
      });
      return;
    }

    if (/(BEAM|FLASH|BOMB)/.test(attackId)) {
      this.vfx.spawnWeaponTrail(origin, dir, {
        colorHex: "#bfdbfe",
        length: 5.2,
        height: 1.2,
        duration: 0.18,
        heightOffset: 1.35,
        alpha: 0.64,
      });
    }
  }
}
