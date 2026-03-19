import type { AttackInputEdges, InputStateLike } from "./runtimeTypes.js";

export function buildLocalInputState(game: unknown): InputStateLike;
export function getAuthoritativeInputForSlot(game: unknown, slot: number, idleInput: InputStateLike): InputStateLike;
export function consumeInputEdges(
  game: unknown,
  slot: number,
  input: InputStateLike,
  idleInput: InputStateLike,
): AttackInputEdges;
export function toggleMuteRuntime(game: unknown): void;
export function autosaveRuntime(game: unknown, force?: boolean): void;
export function flashDamageRuntime(): void;