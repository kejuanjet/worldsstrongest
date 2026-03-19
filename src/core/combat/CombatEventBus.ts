// src/core/combat/CombatEventBus.ts
// Typed event emitter for combat subsystems.

export type CombatEventName =
  | "onHit"
  | "onKill"
  | "onCombo"
  | "onBeamFired"
  | "onBeamClash"
  | "onUltimate"
  | "onEnemyDefeated"
  | "onBossDefeated"
  | "onDamageTakenByPlayer"
  | "onZVanish"
  | "onMeleeClash"
  | "onProjectileDeflected";

export type CombatListener = (data: unknown) => void;

export class CombatEventBus {
  private _listeners: Record<string, CombatListener[]> = {
    onHit: [],
    onKill: [],
    onCombo: [],
    onBeamFired: [],
    onBeamClash: [],
    onUltimate: [],
    onEnemyDefeated: [],
    onBossDefeated: [],
    onDamageTakenByPlayer: [],
    onZVanish: [],
    onMeleeClash: [],
    onProjectileDeflected: [],
  };

  on(event: CombatEventName, fn: CombatListener): () => void {
    (this._listeners[event] = this._listeners[event] || []).push(fn);
    return () => this.off(event, fn);
  }

  off(event: CombatEventName, fn: CombatListener): void {
    this._listeners[event] = (this._listeners[event] || []).filter((f) => f !== fn);
  }

  emit(event: CombatEventName, data: unknown): void {
    (this._listeners[event] || []).forEach((fn) => fn(data));
  }
}
