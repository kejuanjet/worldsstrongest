// src/core/input/KeyboardAdapter.ts
// Captures keyboard key-down / key-up state.

import type { IInputAdapter } from "./IInputAdapter.js";

export class KeyboardAdapter implements IInputAdapter {
  readonly keys: Record<string, boolean> = {};

  private _onKeyDown: ((e: KeyboardEvent) => void) | null = null;
  private _onKeyUp: ((e: KeyboardEvent) => void) | null = null;
  private _mashCount = 0;

  setup(): void {
    this._onKeyDown = (e: KeyboardEvent) => {
      this.keys[e.code] = true;
      if (["Space", "KeyZ"].includes(e.code)) this._mashCount++;
      if (["Space", "ArrowUp", "ArrowDown"].includes(e.code)) e.preventDefault();
    };
    this._onKeyUp = (e: KeyboardEvent) => {
      this.keys[e.code] = false;
    };
    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
  }

  poll(): void {
    // Keyboard is event-driven — no per-frame poll needed.
  }

  isKeyHeld(code: string): boolean {
    return !!this.keys[code];
  }

  consumeMashCount(): number {
    const count = this._mashCount;
    this._mashCount = 0;
    return count;
  }

  clearState(): void {
    for (const key of Object.keys(this.keys)) {
      delete this.keys[key];
    }
    this._mashCount = 0;
  }

  dispose(): void {
    if (this._onKeyDown) window.removeEventListener("keydown", this._onKeyDown);
    if (this._onKeyUp) window.removeEventListener("keyup", this._onKeyUp);
    this._onKeyDown = null;
    this._onKeyUp = null;
  }
}
