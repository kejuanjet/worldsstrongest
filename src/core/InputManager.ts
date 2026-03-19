// src/core/InputManager.ts
// Unified input layer: keyboard, mouse, and gamepad.
// Coordinates adapter modules and builds InputState each frame.

import { Vector3, type ArcRotateCamera, type Scene } from "@babylonjs/core";
import { InputState } from "./SessionManager.js";
import { LockOnSystem, type LockOnTarget } from "./LockOnSystem.js";

// ─── Adapters ────────────────────────────────────────────────────────────────

import { KeyboardAdapter } from "./input/KeyboardAdapter.js";
import { MouseAdapter } from "./input/MouseAdapter.js";
import { GamepadAdapter } from "./input/GamepadAdapter.js";
import { ActionResolver } from "./input/ActionResolver.js";

// ─── Type Definitions ─────────────────────────────────────────────────────────

/** Action binding configuration for ACTION_MAP entries */
export interface ActionBinding {
  keys: string[];
  gamepad: string;
}

/** Options for InputManager constructor */
export interface InputManagerOptions {
  scene: Scene;
  sessionManager: SessionManager;
  camera: ArcRotateCamera | null;
}

/** Callback type for stance toggle events */
export type StanceToggleCallback = () => void;

type InputActionCallback = (() => void) | null;

/** Callback type for lock target change events */
export type LockTargetChangedCallback = (slot: number | null) => void;

interface SessionManager {
  localSlot?: number;
  getPlayerState?(slot: number): { position: Vector3 } | null;
  sendInputState(inputState: InputState): void;
}

/** Union type of all action names */
export type ActionName =
  | "MOVE_FORWARD"
  | "MOVE_BACK"
  | "MOVE_LEFT"
  | "MOVE_RIGHT"
  | "FLY_UP"
  | "FLY_DOWN"
  | "ATTACK_LIGHT"
  | "ATTACK_HEAVY"
  | "KI_CHARGE"
  | "KI_BLAST"
  | "DODGE"
  | "BLOCK"
  | "TRANSFORM"
  | "TRANSFORM_DOWN"
  | "ULTIMATE"
  | "LOCK_ON"
  | "RUSH_COMBO"
  | "GRAB"
  | "STANCE_TOGGLE"
  // QoL Features
  | "FPS_TOGGLE"
  | "DAMAGE_NUMBERS_TOGGLE"
  | "TRAINING_RESET"
  | "SAVE_POSITION"
  | "LOAD_POSITION";

// ─── Action Map ───────────────────────────────────────────────────────────────
// PS5 Controller Button Mapping Reference:
// 0 = X (Cross)     - Fly Up / Jump
// 1 = Circle        - Fly Down / Descend
// 2 = Square        - Light Attack
// 3 = Triangle      - Heavy Attack
// 4 = L1            - Ki Charge
// 5 = R1            - Ki Blast
// 6 = L2            - Dodge
// 7 = R2            - Block
// 8 = L3 (L Stick)  - Transform
// 9 = R3 (R Stick)  - Transform Down
// 10 = Share        - Ultimate
// 11 = Options      - Lock On
// 12 = D-Pad Up     - Rush Combo
// 13 = D-Pad Down   - Grab
// 14 = D-Pad Left   - Stance Toggle
// 15 = D-Pad Right  - Training Reset
// Axes: 0=L Stick X, 1=L Stick Y, 2=R Stick X, 3=R Stick Y

export const ACTION_MAP: Record<ActionName, ActionBinding> = {
  MOVE_FORWARD: { keys: ["KeyW", "ArrowUp"], gamepad: "axis_1_neg" },
  MOVE_BACK: { keys: ["KeyS", "ArrowDown"], gamepad: "axis_1_pos" },
  MOVE_LEFT: { keys: ["KeyA", "ArrowLeft"], gamepad: "axis_0_neg" },
  MOVE_RIGHT: { keys: ["KeyD", "ArrowRight"], gamepad: "axis_0_pos" },
  FLY_UP: { keys: ["Space"], gamepad: "button_0" },
  FLY_DOWN: { keys: ["ShiftLeft"], gamepad: "button_1" },
  ATTACK_LIGHT: { keys: ["Mouse0"], gamepad: "button_2" },
  ATTACK_HEAVY: { keys: ["Mouse2"], gamepad: "button_3" },
  KI_CHARGE: { keys: ["Mouse1"], gamepad: "button_4" },
  KI_BLAST: { keys: ["KeyQ"], gamepad: "button_5" },
  DODGE: { keys: ["KeyE"], gamepad: "button_6" },
  BLOCK: { keys: ["KeyF"], gamepad: "button_7" },
  TRANSFORM: { keys: ["KeyT"], gamepad: "button_8" },
  TRANSFORM_DOWN: { keys: ["KeyG"], gamepad: "button_9" },
  ULTIMATE: { keys: ["KeyR"], gamepad: "button_10" },
  LOCK_ON: { keys: ["KeyZ"], gamepad: "button_11" },
  RUSH_COMBO: { keys: ["KeyV"], gamepad: "button_12" },
  GRAB: { keys: ["KeyC"], gamepad: "button_13" },
  STANCE_TOGGLE: { keys: ["KeyX"], gamepad: "button_14" },
  FPS_TOGGLE: { keys: ["F2"], gamepad: "" },
  DAMAGE_NUMBERS_TOGGLE: { keys: ["KeyN"], gamepad: "" },
  TRAINING_RESET: { keys: ["Backspace"], gamepad: "button_15" },
  SAVE_POSITION: { keys: ["BracketLeft"], gamepad: "" },
  LOAD_POSITION: { keys: ["BracketRight"], gamepad: "" },
};

// ─── InputManager ─────────────────────────────────────────────────────────────

export class InputManager {
  public readonly scene: Scene;
  public readonly sessionManager: SessionManager;
  public camera: ArcRotateCamera | null;
  public readonly canvas: HTMLCanvasElement;
  public enabled: boolean;

  // Callback hooks
  public onStanceToggle: StanceToggleCallback | null = null;
  public onLockTargetChanged: LockTargetChangedCallback | null = null;

  // QoL callbacks
  public onFpsToggle: (() => void) | null = null;
  public onDamageNumbersToggle: (() => void) | null = null;
  public onTrainingReset: (() => void) | null = null;
  public onSavePosition: (() => void) | null = null;
  public onLoadPosition: (() => void) | null = null;

  // Lock-on state
  public lockedTargetSlot: number | null = null;
  public getLockCandidates: (() => number[]) | null = null;

  // Enhanced lock-on system
  public lockOnSystem: LockOnSystem;
  private _getLockOnTargets: (() => LockOnTarget[]) | null = null;

  // ─── Adapters ──────────────────────────────────────────────────────────────

  private readonly _keyboard: KeyboardAdapter;
  private readonly _mouse: MouseAdapter;
  private readonly _gamepad: GamepadAdapter;
  private readonly _actions: ActionResolver;

  // Private fields
  private _mashCount = 0;
  private readonly _sendInterval = 50;
  private _lastSentAt = 0;

  constructor(scene: Scene, sessionManager: SessionManager, camera: ArcRotateCamera | null) {
    this.scene = scene;
    this.sessionManager = sessionManager;
    this.camera = camera;
    const renderingCanvas = this.scene.getEngine().getRenderingCanvas();
    if (!(renderingCanvas instanceof HTMLCanvasElement)) {
      throw new Error("[InputManager] Rendering canvas is unavailable.");
    }
    this.canvas = renderingCanvas;
    this.enabled = true;

    // Initialize adapters
    this._keyboard = new KeyboardAdapter();
    this._mouse = new MouseAdapter(this.canvas, () => this.camera);
    this._gamepad = new GamepadAdapter(() => this.camera);
    this._actions = new ActionResolver();

    this._keyboard.setup();
    this._mouse.setup();
    this._gamepad.setup();

    // Initialize enhanced lock-on system
    this.lockOnSystem = new LockOnSystem();
    this.lockOnSystem.onLockChanged = (slot, _prevSlot) => {
      this.lockedTargetSlot = slot;
      try {
        this.onLockTargetChanged?.(slot);
      } catch (error) {
        console.warn("[InputManager] Lock target changed callback error:", error);
      }
    };
  }

  // ─── Per-Frame Update ──────────────────────────────────────────────────────

  update(delta: number): void {
    if (!this.enabled) {
      this._mashCount = 0;
      this._actions.justPressed.clear();
      this._mouse.velX *= 0.9;
      this._mouse.velY *= 0.9;
      return;
    }

    this._gamepad.poll();
    this._actions.resolve(this._keyboard, this._mouse, this._gamepad);
    this._actions.resolveJustPressed();
    this._gamepad.applyCamera(delta);
    this._dispatchActions();

    this._updateLockOnSystem(delta);

    const now = performance.now();
    if (now - this._lastSentAt >= this._sendInterval) {
      try {
        this.sessionManager.sendInputState(this._buildInputState());
      } catch (error) {
        console.warn("[InputManager] Failed to send input state:", error);
      }
      this._lastSentAt = now;
    }

    this._mashCount = 0;
  }

  // ─── Queries (delegate to ActionResolver) ──────────────────────────────────

  isHeld(action: ActionName): boolean { return this._actions.isHeld(action); }
  isJustPressed(action: ActionName): boolean { return this._actions.isJustPressed(action); }
  isJustReleased(action: ActionName): boolean { return this._actions.isJustReleased(action); }

  getMovementVector(): Vector3 {
    return this._cameraRelative(this._getRawMovement());
  }

  getFlyAxis(): number {
    let y = 0;
    if (this.isHeld("FLY_UP")) y += 1;
    if (this.isHeld("FLY_DOWN")) y -= 1;
    if (this._gamepad.connected) {
      y += this._gamepad.getButtonValue(0) - this._gamepad.getButtonValue(1);
    }
    return Math.max(-1, Math.min(1, y));
  }

  // ─── Rebinding ─────────────────────────────────────────────────────────────

  rebind(action: ActionName, newKey: string): void { this._actions.rebind(action, newKey); }
  resetRebinds(): void { this._actions.resetRebinds(); }
  getBindingLabel(action: ActionName): string { return this._actions.getBindingLabel(action); }

  registerMash(): void { this._mashCount++; }
  getMashCount(): number { return this._mashCount; }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this._mouse.enabled = enabled;
    if (!this.enabled) this.clearState();
  }

  clearState(): void {
    this._keyboard.clearState();
    this._mouse.clearState();
    this._gamepad.clearLook();
    this.clearLookInput();
    this._mashCount = 0;
    this._actions.clearState();
  }

  clearLookInput(): void {
    this._mouse.clearLook();
    this._gamepad.clearLook();
  }

  releasePointerLock(): void {
    this._mouse.releasePointerLock();
  }

  // ─── Lock-On System Integration ────────────────────────────────────────────

  setLockOnTargetProvider(getTargets: () => LockOnTarget[]): void {
    this._getLockOnTargets = getTargets;
  }

  switchToNearestThreat(): number | null { return this.lockOnSystem.switchToNearest(); }

  getAimAssistDirection(inputDir: Vector3, assistStrength?: number): Vector3 {
    return this.lockOnSystem.getAimAssist(inputDir, assistStrength);
  }

  getPredictedTargetPosition(targetSlot: number, projectileSpeed: number): Vector3 | null {
    return this.lockOnSystem.getPredictedPosition(targetSlot, projectileSpeed);
  }

  getLockOnCandidates(): readonly { slot: number; score: number; distance: number; angle: number; isInFront: boolean }[] {
    return this.lockOnSystem.candidates;
  }

  get hasSoftLock(): boolean { return this.lockOnSystem.hasSoftLock; }
  get softLockTargetSlot(): number | null { return this.lockOnSystem.softLockSlot; }

  // ─── Rumble (delegate to GamepadAdapter) ───────────────────────────────────

  rumble(intensity = 0.5, duration = 200): void { this._gamepad.rumble(intensity, duration); }
  rumbleLight(): void { this._gamepad.rumbleLight(); }
  rumbleHeavy(): void { this._gamepad.rumbleHeavy(); }
  get isGamepadConnected(): boolean { return this._gamepad.connected; }
  get gamepadInfo(): { id: string; index: number } | null { return this._gamepad.info; }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private _buildInputState(): InputState {
    const move = this.getMovementVector();
    const s = new InputState();
    s.moveX = move.x;
    s.moveZ = move.z;
    s.flyY = this.getFlyAxis();
    s.yaw = this.camera?.alpha ?? 0;
    s.pitch = this.camera?.beta ?? 0;
    s.btnAttack = this.isHeld("ATTACK_LIGHT");
    s.btnHeavy = this.isHeld("ATTACK_HEAVY");
    s.btnKi = this.isHeld("KI_CHARGE");
    s.btnBlast = this.isHeld("KI_BLAST");
    s.btnDodge = this.isJustPressed("DODGE");
    s.btnBlock = this.isHeld("BLOCK");
    s.btnTransform = this.isJustPressed("TRANSFORM");
    s.btnTransformDown = this.isJustPressed("TRANSFORM_DOWN");
    s.btnUltimate = this.isJustPressed("ULTIMATE");
    s.btnRush = this.isJustPressed("RUSH_COMBO");
    s.btnGrab = this.isJustPressed("GRAB");
    s.btnLockOn = this.isJustPressed("LOCK_ON");
    s.btnStance = this.isJustPressed("STANCE_TOGGLE");
    s.lockedSlot = this.lockedTargetSlot;
    s.mashCount = this._mashCount;
    return s;
  }

  private _dispatchActions(): void {
    if (this.isJustPressed("LOCK_ON")) this.lockOnSystem.cycleLock(true);
    if (this.isJustPressed("ULTIMATE")) this._mashCount++;

    const actionCallbacks: Array<[ActionName, InputActionCallback, string]> = [
      ["STANCE_TOGGLE", this.onStanceToggle, "Stance toggle"],
      ["FPS_TOGGLE", this.onFpsToggle, "FPS toggle"],
      ["DAMAGE_NUMBERS_TOGGLE", this.onDamageNumbersToggle, "Damage numbers toggle"],
      ["TRAINING_RESET", this.onTrainingReset, "Training reset"],
      ["SAVE_POSITION", this.onSavePosition, "Save position"],
      ["LOAD_POSITION", this.onLoadPosition, "Load position"],
    ];

    for (const [action, callback, label] of actionCallbacks) {
      if (!this.isJustPressed(action)) continue;
      this._invokeActionCallback(callback, label);
    }
  }

  private _invokeActionCallback(callback: InputActionCallback, label: string): void {
    try {
      callback?.();
    } catch (error) {
      console.warn(`[InputManager] ${label} error:`, error);
    }
  }

  private _updateLockOnSystem(delta: number): void {
    if (!this._getLockOnTargets) return;
    const ownSlot = this.sessionManager.localSlot ?? 0;
    const playerState = this.sessionManager.getPlayerState?.(ownSlot);
    if (!playerState) return;
    const facing = new Vector3(
      Math.sin(this.camera?.alpha ?? 0),
      0,
      Math.cos(this.camera?.alpha ?? 0),
    );
    this.lockOnSystem.update(delta, playerState.position, facing, this._getLockOnTargets, ownSlot);
    this.lockedTargetSlot = this.lockOnSystem.lockedSlot;
  }

  private _getRawMovement(): Vector3 {
    let x = 0, z = 0;
    if (this.isHeld("MOVE_LEFT")) x -= 1;
    if (this.isHeld("MOVE_RIGHT")) x += 1;
    if (this.isHeld("MOVE_FORWARD")) z += 1;
    if (this.isHeld("MOVE_BACK")) z -= 1;
    if (this._gamepad.connected) {
      const ax = this._gamepad.getAxis(0);
      const az = this._gamepad.getAxis(1);
      if (Math.abs(ax) > 0.12) x = ax;
      if (Math.abs(az) > 0.12) z = -az;
    }
    const len = Math.sqrt(x * x + z * z);
    if (len > 1) { x /= len; z /= len; }
    return new Vector3(x, 0, z);
  }

  private _cameraRelative(v: Vector3): Vector3 {
    if (!this.camera || v.lengthSquared() < 0.001) return v;
    const yaw = this.camera.alpha;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    return new Vector3(v.x * cos - v.z * sin, 0, -v.x * sin - v.z * cos);
  }

  // ─── Cleanup ───────────────────────────────────────────────────────────────

  dispose(): void {
    this._keyboard.dispose();
    this._mouse.dispose();
    this._gamepad.dispose();
    this.onStanceToggle = null;
    this.onLockTargetChanged = null;
    this.onFpsToggle = null;
    this.onDamageNumbersToggle = null;
    this.onTrainingReset = null;
    this.onSavePosition = null;
    this.onLoadPosition = null;
    this.getLockCandidates = null;
    console.log("[InputManager] Disposed.");
  }
}
