// src/core/types/AuraSystemRef.ts
// Minimal interface for the aura particle system attached to a CharacterState.

import type { Color4 } from "@babylonjs/core";

export interface AuraSystemRef {
  color1: Color4;
  color2: Color4;
  emitRate: number;
  dispose(): void;
}
