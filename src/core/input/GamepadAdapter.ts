// src/core/input/GamepadAdapter.ts
// Gamepad polling, button/axis reading, camera look, and rumble.

import type { ArcRotateCamera } from "@babylonjs/core";
import { CONFIG } from "../../config/index.js";
import type { IInputAdapter } from "./IInputAdapter.js";

export class GamepadAdapter implements IInputAdapter {
  private _gamepad: Gamepad | null = null;
  private _lookVelX = 0;
  private _lookVelY = 0;

  private _onConnected: ((e: GamepadEvent) => void) | null = null;
  private _onDisconnected: ((e: GamepadEvent) => void) | null = null;

  constructor(private readonly getCamera: () => ArcRotateCamera | null) {}

  setup(): void {
    this._onConnected = (e) => {
      this._gamepad = e.gamepad;
      console.log(`[GamepadAdapter] Connected: ${e.gamepad.id}`);
      const isPS5 = e.gamepad.id.toLowerCase().includes("dualsense") ||
                    e.gamepad.id.toLowerCase().includes("playstation") ||
                    e.gamepad.id.toLowerCase().includes("wireless controller");
      if (isPS5) {
        console.log("[GamepadAdapter] PS5 DualSense detected!");
      }
    };
    this._onDisconnected = (e) => {
      this._gamepad = null;
      console.log(`[GamepadAdapter] Disconnected: ${e.gamepad.id}`);
    };
    window.addEventListener("gamepadconnected", this._onConnected);
    window.addEventListener("gamepaddisconnected", this._onDisconnected);

    // Check for already-connected gamepads
    if (typeof navigator.getGamepads === "function") {
      for (const pad of navigator.getGamepads()) {
        if (pad?.connected) {
          this._gamepad = pad;
          console.log(`[GamepadAdapter] Found already-connected: ${pad.id}`);
          break;
        }
      }
    }
  }

  poll(): void {
    this._gamepad = null;
    if (typeof navigator.getGamepads !== "function") return;
    for (const pad of navigator.getGamepads()) {
      if (pad?.connected) { this._gamepad = pad; break; }
    }
  }

  /** Apply smoothed gamepad right-stick to camera. */
  applyCamera(delta: number): void {
    const camera = this.getCamera();
    if (!camera || !this._gamepad) return;
    const rx = this._gamepad.axes[2] ?? 0;
    const ry = this._gamepad.axes[3] ?? 0;
    const deadzone = CONFIG.camera.inputDeadzone;
    const lookX = Math.abs(rx) > deadzone ? rx : 0;
    const lookY = Math.abs(ry) > deadzone ? ry : 0;
    const accel = CONFIG.camera.inputAccel * 0.5;
    this._lookVelX += lookX * accel * delta;
    this._lookVelY += lookY * accel * delta;
    this._lookVelX *= 0.88;
    this._lookVelY *= 0.88;
    const sens = CONFIG.camera.gamepadSensitivity;
    camera.alpha -= this._lookVelX * sens * delta;
    camera.beta = Math.max(
      CONFIG.camera.minBeta,
      Math.min(CONFIG.camera.maxBeta, camera.beta + this._lookVelY * sens * delta),
    );
  }

  isBindingHeld(binding: string): boolean {
    if (!this._gamepad || !binding) return false;

    if (binding.startsWith("axis_")) {
      const parts = binding.split("_");
      const axisIndex = parseInt(parts[1] ?? "0", 10);
      const axisValue = this._gamepad.axes[axisIndex] ?? 0;
      const threshold = 0.5;
      if (parts[2] === "neg") return axisValue < -threshold;
      if (parts[2] === "pos") return axisValue > threshold;
      return Math.abs(axisValue) > threshold;
    }

    if (binding.startsWith("button_")) {
      const idx = parseInt(binding.replace("button_", ""), 10);
      const btn = this._gamepad.buttons[idx];
      return btn ? (btn.pressed || btn.value > 0.5) : false;
    }

    return false;
  }

  getAxis(index: number): number {
    return this._gamepad?.axes[index] ?? 0;
  }

  getButtonValue(index: number): number {
    return this._gamepad?.buttons[index]?.value ?? 0;
  }

  get connected(): boolean { return this._gamepad !== null; }

  get info(): { id: string; index: number } | null {
    if (!this._gamepad) return null;
    return { id: this._gamepad.id, index: this._gamepad.index };
  }

  clearLook(): void {
    this._lookVelX = 0;
    this._lookVelY = 0;
  }

  // ─── Rumble ────────────────────────────────────────────────────────────────

  rumble(intensity = 0.5, duration = 200): void {
    if (!this._gamepad?.vibrationActuator) return;
    try {
      void this._gamepad.vibrationActuator.playEffect("dual-rumble", {
        startDelay: 0,
        duration,
        weakMagnitude: intensity * 0.5,
        strongMagnitude: intensity,
      });
    } catch { /* ignore rumble errors */ }
  }

  rumbleLight(): void { this.rumble(0.3, 100); }
  rumbleHeavy(): void { this.rumble(0.8, 300); }

  dispose(): void {
    if (this._onConnected) window.removeEventListener("gamepadconnected", this._onConnected);
    if (this._onDisconnected) window.removeEventListener("gamepaddisconnected", this._onDisconnected);
    this._gamepad = null;
  }
}
