// src/core/types/TrainingDummyRef.ts
// Minimal interface for the TrainingDummy attached to a CharacterState.

export interface TrainingDummyRef {
  hp: number;
  takeDamage(amount: number, sourcePlayerId: string | null, attackId: string | null): { actual: number };
  dispose(): void;
}
