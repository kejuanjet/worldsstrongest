// src/core/input/ActionResolver.ts
// Maps raw input device state to named action states (held, just-pressed, just-released).
// Also handles keybind persistence.

import { ACTION_MAP, type ActionName, type ActionBinding } from "../InputManager.js";
import type { KeyboardAdapter } from "./KeyboardAdapter.js";
import type { MouseAdapter } from "./MouseAdapter.js";
import type { GamepadAdapter } from "./GamepadAdapter.js";

export class ActionResolver {
  readonly state = new Map<ActionName, boolean>();
  readonly justPressed = new Map<ActionName, boolean>();
  private _prev = new Map<ActionName, boolean>();

  private readonly _rebinds: Record<string, string>;

  constructor() {
    this._rebinds = ActionResolver._loadRebinds();
  }

  resolve(keyboard: KeyboardAdapter, mouse: MouseAdapter, gamepad: GamepadAdapter): void {
    this._prev = new Map(this.state);

    for (const [action, binding] of Object.entries(ACTION_MAP) as [ActionName, ActionBinding][]) {
      const keys = this._getReboundKeys(action, binding.keys);
      const keyboardActive = keys.some((k) => {
        if (k.startsWith("Mouse")) return mouse.isButtonHeld(parseInt(k.replace("Mouse", ""), 10));
        return keyboard.isKeyHeld(k);
      });
      const gamepadActive = gamepad.isBindingHeld(binding.gamepad);
      this.state.set(action, keyboardActive || gamepadActive);
    }
  }

  resolveJustPressed(): void {
    for (const action of Object.keys(ACTION_MAP) as ActionName[]) {
      const curr = this.state.get(action) ?? false;
      const prev = this._prev.get(action) ?? false;
      this.justPressed.set(action, curr && !prev);
    }
  }

  isHeld(action: ActionName): boolean { return this.state.get(action) ?? false; }
  isJustPressed(action: ActionName): boolean { return this.justPressed.get(action) ?? false; }
  isJustReleased(action: ActionName): boolean {
    return (this._prev.get(action) ?? false) && !(this.state.get(action) ?? false);
  }

  // ─── Rebinding ─────────────────────────────────────────────────────────────

  rebind(action: ActionName, newKey: string): void {
    this._rebinds[action] = newKey;
    this._saveRebinds();
  }

  resetRebinds(): void {
    for (const key of Object.keys(this._rebinds)) delete this._rebinds[key];
    localStorage.removeItem("ws_keybinds");
    localStorage.removeItem("dbz_keybinds");
  }

  getBindingLabel(action: ActionName): string {
    return this._rebinds[action] ?? ACTION_MAP[action].keys[0] ?? "?";
  }

  clearState(): void {
    this.state.clear();
    this.justPressed.clear();
    this._prev.clear();
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private _getReboundKeys(action: ActionName, defaults: string[]): string[] {
    const custom = this._rebinds[action];
    return custom ? [custom, ...defaults] : defaults;
  }

  private _saveRebinds(): void {
    try {
      localStorage.setItem("ws_keybinds", JSON.stringify(this._rebinds));
    } catch (e) {
      console.warn("[ActionResolver] Failed to save rebinds:", e);
    }
  }

  private static _loadRebinds(): Record<string, string> {
    try {
      const stored = localStorage.getItem("ws_keybinds") ?? localStorage.getItem("dbz_keybinds") ?? "{}";
      return JSON.parse(stored) as Record<string, string>;
    } catch {
      return {};
    }
  }
}
