// src/core/types/StatusEffect.ts
// Typed status effect interface replacing `any[]` on CharacterState.

export interface StatusEffect {
  id: string;
  type: "BUFF" | "DEBUFF";
  duration: number;
  remainingMs: number;
  magnitude: number;
  sourceSlot?: number;
}
