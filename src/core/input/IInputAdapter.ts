// src/core/input/IInputAdapter.ts
// Shared interface for all input adapters (keyboard, mouse, gamepad).

export interface IInputAdapter {
  /** One-time setup — attaches event listeners. */
  setup(): void;
  /** Per-frame poll (e.g. gamepad axis read). */
  poll(): void;
  /** Remove all event listeners and release resources. */
  dispose(): void;
}
