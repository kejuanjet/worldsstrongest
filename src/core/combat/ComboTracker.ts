// src/core/combat/ComboTracker.ts
// Tracks per-slot combo state: hit count, accumulated damage, and activity window.


export class ComboTracker {
  hits = 0;
  /** Elapsed game-time in ms at last hit (not wall-clock) */
  lastHitAt = 0;
  damageAccum = 0;
  private lastComboWindow = 400;
  /** Accumulated game-time in ms — advanced externally so pausing freezes combos */
  gameTimeMs = 0;

  register(damage: number, comboWindow: number = 400): number {
    const now = this.gameTimeMs;
    this.lastComboWindow = comboWindow;
    const resetThreshold = comboWindow * 2;
    if (now - this.lastHitAt >= resetThreshold) this.reset();

    this.hits++;
    this.damageAccum += damage;
    this.lastHitAt = now;
    return this.hits;
  }

  reset(): void {
    this.hits = 0;
    this.damageAccum = 0;
    this.lastHitAt = 0;
  }

  get isActive(): boolean {
    const resetThreshold = this.lastComboWindow * 2;
    return this.hits > 0 && this.gameTimeMs - this.lastHitAt < resetThreshold;
  }
}
