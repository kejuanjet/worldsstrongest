// src/core/input/MouseAdapter.ts
// Mouse button state, pointer-lock camera look, and scroll zoom.

import type { ArcRotateCamera } from "@babylonjs/core";
import { CONFIG } from "../../config/index.js";
import type { IInputAdapter } from "./IInputAdapter.js";

export class MouseAdapter implements IInputAdapter {
  readonly buttons: Record<number, boolean> = {};

  // Smoothed camera velocity
  velX = 0;
  velY = 0;

  private _deltaX = 0;
  private _deltaY = 0;
  private _lastClientX: number | null = null;
  private _lastClientY: number | null = null;
  private _pointerLocked = false;

  private _onMouseDown: ((e: MouseEvent) => void) | null = null;
  private _onMouseUp: ((e: MouseEvent) => void) | null = null;
  private _onContextMenu: ((e: MouseEvent) => void) | null = null;
  private _onMouseMove: ((e: MouseEvent) => void) | null = null;
  private _onMouseLeave: (() => void) | null = null;
  private _onWheel: ((e: WheelEvent) => void) | null = null;
  private _onCanvasClick: (() => void) | null = null;
  private _onPointerLockChange: (() => void) | null = null;

  private _enabled = true;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly getCamera: () => ArcRotateCamera | null,
  ) {}

  set enabled(val: boolean) { this._enabled = val; }

  setup(): void {
    const canvas = this.canvas;
    this._onMouseDown = (e) => { this.buttons[e.button] = true; };
    this._onMouseUp = (e) => { this.buttons[e.button] = false; };
    this._onContextMenu = (e) => { e.preventDefault(); };
    this._onMouseMove = (e) => {
      if (!this._enabled) {
        this._lastClientX = e.clientX;
        this._lastClientY = e.clientY;
        return;
      }
      let dx: number, dy: number;
      if (this._pointerLocked) {
        dx = e.movementX || 0;
        dy = e.movementY || 0;
      } else {
        const lastX = this._lastClientX;
        const lastY = this._lastClientY;
        this._lastClientX = e.clientX;
        this._lastClientY = e.clientY;
        if (lastX == null || lastY == null) return;
        dx = e.clientX - lastX;
        dy = e.clientY - lastY;
      }
      this._deltaX += dx;
      this._deltaY += dy;
      this._applyToCamera();
    };
    this._onMouseLeave = () => {
      this._lastClientX = null;
      this._lastClientY = null;
    };
    this._onWheel = (e) => {
      const camera = this.getCamera();
      if (!camera) return;
      e.preventDefault();
      camera.radius = Math.max(
        CONFIG.camera.minRadius,
        Math.min(CONFIG.camera.maxRadius, camera.radius + e.deltaY * CONFIG.camera.zoomSensitivity),
      );
    };
    canvas.addEventListener("mousedown", this._onMouseDown);
    canvas.addEventListener("mouseup", this._onMouseUp);
    canvas.addEventListener("contextmenu", this._onContextMenu);
    canvas.addEventListener("mousemove", this._onMouseMove);
    canvas.addEventListener("mouseleave", this._onMouseLeave);
    canvas.addEventListener("wheel", this._onWheel);

    // Pointer lock
    this._onCanvasClick = () => {
      if (!this._pointerLocked) void canvas.requestPointerLock();
    };
    this._onPointerLockChange = () => {
      this._pointerLocked = document.pointerLockElement === canvas;
      if (!this._pointerLocked) this.clearLook();
    };
    canvas.addEventListener("click", this._onCanvasClick);
    document.addEventListener("pointerlockchange", this._onPointerLockChange);
  }

  poll(): void {
    // Mouse is event-driven — no per-frame poll needed.
  }

  isButtonHeld(btn: number): boolean {
    return !!this.buttons[btn];
  }

  clearLook(): void {
    this.velX = 0;
    this.velY = 0;
    this._deltaX = 0;
    this._deltaY = 0;
    this._lastClientX = null;
    this._lastClientY = null;
  }

  clearState(): void {
    for (const key of Object.keys(this.buttons)) delete this.buttons[Number(key)];
    this.clearLook();
  }

  releasePointerLock(): void {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this._pointerLocked = false;
    this.clearLook();
  }

  get isPointerLocked(): boolean { return this._pointerLocked; }

  dispose(): void {
    const canvas = this.canvas;
    if (this._onMouseDown) canvas.removeEventListener("mousedown", this._onMouseDown);
    if (this._onMouseUp) canvas.removeEventListener("mouseup", this._onMouseUp);
    if (this._onContextMenu) canvas.removeEventListener("contextmenu", this._onContextMenu);
    if (this._onMouseMove) canvas.removeEventListener("mousemove", this._onMouseMove);
    if (this._onMouseLeave) canvas.removeEventListener("mouseleave", this._onMouseLeave);
    if (this._onWheel) canvas.removeEventListener("wheel", this._onWheel);
    if (this._onCanvasClick) canvas.removeEventListener("click", this._onCanvasClick);
    if (this._onPointerLockChange) document.removeEventListener("pointerlockchange", this._onPointerLockChange);
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private _applyToCamera(): void {
    const camera = this.getCamera();
    if (!camera) return;
    const accel = CONFIG.camera.inputAccel;
    const deadzone = CONFIG.camera.inputDeadzone;
    const deadzoneDx = Math.abs(this._deltaX) > deadzone ? this._deltaX : 0;
    const deadzoneDy = Math.abs(this._deltaY) > deadzone ? this._deltaY : 0;
    this.velX += deadzoneDx * 0.002 * accel;
    this.velY += deadzoneDy * 0.002 * accel;
    this.velX *= 0.92;
    this.velY *= 0.92;
    const maxVel = 0.025;
    this.velX = Math.max(-maxVel, Math.min(maxVel, this.velX));
    this.velY = Math.max(-maxVel, Math.min(maxVel, this.velY));
    const sens = CONFIG.camera.mouseSensitivity;
    camera.alpha -= this.velX / sens * 10;
    camera.beta = Math.max(
      CONFIG.camera.minBeta,
      Math.min(CONFIG.camera.maxBeta, camera.beta + this.velY / sens * 10),
    );
    this._deltaX = 0;
    this._deltaY = 0;
  }
}
