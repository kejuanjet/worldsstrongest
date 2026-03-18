// src/core/InputManager.ts
// Unified input layer: keyboard, mouse, and gamepad.
// Builds an InputState every frame and sends it via SessionManager.
// Also handles local action dispatch (transform, ultimate, etc.)

import { Vector3, type ArcRotateCamera, type Scene } from "@babylonjs/core";
// @ts-ignore - JavaScript module without type declarations
import { InputState } from "./SessionManager.js";
// @ts-ignore - JavaScript module without type declarations
import { CONFIG } from "../config/index.js";
import { LockOnSystem, type LockOnTarget } from "./LockOnSystem.js";

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
  // PS5: X (Cross) = Fly Up
  FLY_UP: { keys: ["Space"], gamepad: "button_0" },
  // PS5: Circle = Fly Down
  FLY_DOWN: { keys: ["ShiftLeft"], gamepad: "button_1" },
  // PS5: Square = Light Attack
  ATTACK_LIGHT: { keys: ["Mouse0"], gamepad: "button_2" },
  // PS5: Triangle = Heavy Attack
  ATTACK_HEAVY: { keys: ["Mouse2"], gamepad: "button_3" },
  // PS5: L1 = Ki Charge
  KI_CHARGE: { keys: ["Mouse1"], gamepad: "button_4" },
  // PS5: R1 = Ki Blast
  KI_BLAST: { keys: ["KeyQ"], gamepad: "button_5" },
  // PS5: L2 = Dodge
  DODGE: { keys: ["KeyE"], gamepad: "button_6" },
  // PS5: R2 = Block
  BLOCK: { keys: ["KeyF"], gamepad: "button_7" },
  // PS5: L3 (Left Stick Press) = Transform
  TRANSFORM: { keys: ["KeyT"], gamepad: "button_8" },
  // PS5: R3 (Right Stick Press) = Transform Down
  TRANSFORM_DOWN: { keys: ["KeyG"], gamepad: "button_9" },
  // PS5: Share button = Ultimate
  ULTIMATE: { keys: ["KeyR"], gamepad: "button_10" },
  // PS5: Options button = Lock On
  LOCK_ON: { keys: ["KeyZ"], gamepad: "button_11" },
  // PS5: D-Pad Up = Rush Combo
  RUSH_COMBO: { keys: ["KeyV"], gamepad: "button_12" },
  // PS5: D-Pad Down = Grab
  GRAB: { keys: ["KeyC"], gamepad: "button_13" },
  // PS5: D-Pad Left = Stance Toggle (Ayo: melee ↔ sword)
  STANCE_TOGGLE: { keys: ["KeyX"], gamepad: "button_14" },
  // QoL Features
  FPS_TOGGLE: { keys: ["F2"], gamepad: "" },
  DAMAGE_NUMBERS_TOGGLE: { keys: ["KeyN"], gamepad: "" },
  // PS5: D-Pad Right = Training Reset
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

  // Private fields
  private readonly _keys: Record<string, boolean> = {};
  private readonly _mouse: Record<number, boolean> = {};
  private _mouseVelX = 0;
  private _mouseVelY = 0;
  private _mouseDeltaX = 0;
  private _mouseDeltaY = 0;
  private _lastMouseClientX: number | null = null;
  private _lastMouseClientY: number | null = null;
  private _pointerLocked = false;
  private _gamepad: Gamepad | null = null;
  private _gamepadLookVelX = 0;
  private _gamepadLookVelY = 0;
  private readonly _actionState = new Map<ActionName, boolean>();
  private readonly _actionJustPressed = new Map<ActionName, boolean>();
  private _prevActionState = new Map<ActionName, boolean>();
  private readonly _rebinds: Record<string, string>;
  private _mashCount = 0;
  private readonly _sendInterval = 50;
  private _lastSentAt = 0;

  // Event listener references (for cleanup)
  private _onKeyDown: ((e: KeyboardEvent) => void) | null = null;
  private _onKeyUp: ((e: KeyboardEvent) => void) | null = null;
  private _onGamepadConnected: ((e: GamepadEvent) => void) | null = null;
  private _onGamepadDisconnected: ((e: GamepadEvent) => void) | null = null;
  private _onMouseDown: ((e: MouseEvent) => void) | null = null;
  private _onMouseUp: ((e: MouseEvent) => void) | null = null;
  private _onContextMenu: ((e: MouseEvent) => void) | null = null;
  private _onMouseMove: ((e: MouseEvent) => void) | null = null;
  private _onMouseLeave: (() => void) | null = null;
  private _onWheel: ((e: WheelEvent) => void) | null = null;
  private _onCanvasClick: (() => void) | null = null;
  private _onPointerLockChange: (() => void) | null = null;

  /**
   * Creates an InputManager instance.
   * @param scene - The Babylon.js scene
   * @param sessionManager - The session manager for network input
   * @param camera - The arc rotate camera for look input
   */
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
    this._rebinds = this._loadRebinds();

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

    this._setupKeyboard();
    this._setupMouse();
    this._setupGamepad();
    this._setupPointerLock();
  }

  // ─── Per-Frame Update ──────────────────────────────────────────────────────

  /**
   * Updates input state. Should be called every frame.
   * @param delta - Time delta in seconds
   */
  update(delta: number): void {
    if (!this.enabled) {
      this._mashCount = 0;
      this._actionJustPressed.clear();
      // Decay input velocities when disabled
      this._mouseVelX *= 0.9;
      this._mouseVelY *= 0.9;
      this._gamepadLookVelX *= 0.9;
      this._gamepadLookVelY *= 0.9;
      return;
    }

    this._prevActionState = new Map(this._actionState);
    this._pollGamepad();
    this._resolveActions();
    this._resolveJustPressed();
    this._applyGamepadCamera(delta);
    this._dispatchActions();

    // Update enhanced lock-on system
    this._updateLockOnSystem(delta);

    const now = performance.now();
    if (now - this._lastSentAt >= this._sendInterval) {
      try {
        this.sessionManager.sendInputState(this._buildInputState());
      } catch (error) {
        // Prevent network errors from crashing the game loop
        console.warn("[InputManager] Failed to send input state:", error);
      }
      this._lastSentAt = now;
    }

    this._mashCount = 0;
  }

  // ─── Queries ───────────────────────────────────────────────────────────────

  /**
   * Check if an action is currently held.
   * @param action - The action name
   * @returns True if the action is held
   */
  isHeld(action: ActionName): boolean {
    return this._actionState.get(action) ?? false;
  }

  /**
   * Check if an action was just pressed this frame.
   * @param action - The action name
   * @returns True if the action was just pressed
   */
  isJustPressed(action: ActionName): boolean {
    return this._actionJustPressed.get(action) ?? false;
  }

  /**
   * Check if an action was just released this frame.
   * @param action - The action name
   * @returns True if the action was just released
   */
  isJustReleased(action: ActionName): boolean {
    return (this._prevActionState.get(action) ?? false) && !(this._actionState.get(action) ?? false);
  }

  /**
   * Gets the camera-relative movement vector.
   * @returns Movement vector
   */
  getMovementVector(): Vector3 {
    return this._cameraRelative(this._getRawMovement());
  }

  /**
   * Gets the fly axis value (-1 to 1).
   * @returns Fly axis value
   */
  getFlyAxis(): number {
    let y = 0;
    if (this.isHeld("FLY_UP")) y += 1;
    if (this.isHeld("FLY_DOWN")) y -= 1;
    if (this._gamepad) {
      const flyUp = this._gamepad.buttons[0]?.value ?? 0;
      const flyDown = this._gamepad.buttons[1]?.value ?? 0;
      y += flyUp - flyDown;
    }
    return Math.max(-1, Math.min(1, y));
  }

  // ─── Rebinding ─────────────────────────────────────────────────────────────

  /**
   * Rebinds an action to a new key.
   * @param action - The action to rebind
   * @param newKey - The new key code
   */
  rebind(action: ActionName, newKey: string): void {
    this._rebinds[action] = newKey;
    this._saveRebinds();
  }

  /**
   * Resets all keybinds to defaults.
   */
  resetRebinds(): void {
    for (const key of Object.keys(this._rebinds)) {
      delete this._rebinds[key];
    }
    localStorage.removeItem("ws_keybinds");
    localStorage.removeItem("dbz_keybinds");
  }

  /**
   * Gets the binding label for an action.
   * @param action - The action name
   * @returns The binding label
   */
  getBindingLabel(action: ActionName): string {
    return this._rebinds[action] ?? ACTION_MAP[action].keys[0] ?? "?";
  }

  /**
   * Registers a mash input (for ultimate charge).
   */
  registerMash(): void {
    this._mashCount++;
  }

  /**
   * Gets the current mash count.
   * @returns Mash count
   */
  getMashCount(): number {
    return this._mashCount;
  }

  /**
   * Enables or disables input processing.
   * @param enabled - Whether input should be enabled
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!this.enabled) this.clearState();
  }

  /**
   * Clears all input state.
   */
  clearState(): void {
    for (const key of Object.keys(this._keys)) {
      delete this._keys[key];
    }
    for (const key of Object.keys(this._mouse)) {
      delete this._mouse[Number(key)];
    }
    this.clearLookInput();
    this._mashCount = 0;
    this._actionState.clear();
    this._actionJustPressed.clear();
    this._prevActionState.clear();
  }

  /**
   * Clears look input (mouse and gamepad camera movement).
   */
  clearLookInput(): void {
    this._mouseVelX = 0;
    this._mouseVelY = 0;
    this._mouseDeltaX = 0;
    this._mouseDeltaY = 0;
    this._gamepadLookVelX = 0;
    this._gamepadLookVelY = 0;
    this._lastMouseClientX = null;
    this._lastMouseClientY = null;
  }

  /**
   * Releases pointer lock if active.
   */
  releasePointerLock(): void {
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
    this._pointerLocked = false;
    this.clearLookInput();
  }

  // ─── Lock-On System Integration ──────────────────────────────────────────────

  /**
   * Set the function to get lock-on targets for the enhanced system
   */
  setLockOnTargetProvider(getTargets: () => LockOnTarget[]): void {
    this._getLockOnTargets = getTargets;
  }

  /**
   * Quick switch to nearest threat
   */
  switchToNearestThreat(): number | null {
    return this.lockOnSystem.switchToNearest();
  }

  /**
   * Get aim-assisted direction for projectiles
   */
  getAimAssistDirection(inputDir: Vector3, assistStrength?: number): Vector3 {
    return this.lockOnSystem.getAimAssist(inputDir, assistStrength);
  }

  /**
   * Get predicted target position for leading shots
   */
  getPredictedTargetPosition(targetSlot: number, projectileSpeed: number): Vector3 | null {
    return this.lockOnSystem.getPredictedPosition(targetSlot, projectileSpeed);
  }

  /**
   * Get current lock-on candidates for UI display
   */
  getLockOnCandidates(): readonly { slot: number; score: number; distance: number; angle: number; isInFront: boolean }[] {
    return this.lockOnSystem.candidates;
  }

  /**
   * Check if soft lock is active
   */
  get hasSoftLock(): boolean {
    return this.lockOnSystem.hasSoftLock;
  }

  /**
   * Get soft lock target slot
   */
  get softLockTargetSlot(): number | null {
    return this.lockOnSystem.softLockSlot;
  }

  // ─── Internals: Input Build ────────────────────────────────────────────────

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

  // ─── Internals: Action Resolution ──────────────────────────────────────────

  private _resolveActions(): void {
    for (const [action, binding] of Object.entries(ACTION_MAP) as [ActionName, ActionBinding][]) {
      const keys = this._getReboundKeys(action, binding.keys);
      const keyboardActive = keys.some(k => this._isKeyOrMouseHeld(k));
      const gamepadActive = this._isGamepadBindingHeld(binding.gamepad);
      this._actionState.set(action, keyboardActive || gamepadActive);
    }
  }

  private _isGamepadBindingHeld(binding: string): boolean {
    if (!this._gamepad || !binding) return false;
    
    // Handle axis bindings (e.g., "axis_0_neg", "axis_1_pos")
    if (binding.startsWith("axis_")) {
      const parts = binding.split("_");
      const axisIndex = parseInt(parts[1] ?? "0", 10);
      const axisValue = this._gamepad.axes[axisIndex] ?? 0;
      const threshold = 0.5; // Deadzone for axis-as-button
      
      if (parts[2] === "neg") return axisValue < -threshold;
      if (parts[2] === "pos") return axisValue > threshold;
      return Math.abs(axisValue) > threshold;
    }
    
    // Handle button bindings (e.g., "button_0")
    if (binding.startsWith("button_")) {
      const buttonIndex = parseInt(binding.replace("button_", ""), 10);
      const button = this._gamepad.buttons[buttonIndex];
      return button ? (button.pressed || button.value > 0.5) : false;
    }
    
    return false;
  }

  private _resolveJustPressed(): void {
    for (const action of Object.keys(ACTION_MAP) as ActionName[]) {
      const curr = this._actionState.get(action) ?? false;
      const prev = this._prevActionState.get(action) ?? false;
      this._actionJustPressed.set(action, curr && !prev);
    }
  }

  private _dispatchActions(): void {
    if (this.isJustPressed("LOCK_ON")) {
      // Use enhanced lock-on system
      this.lockOnSystem.cycleLock(true);
    }
    if (this.isJustPressed("ULTIMATE")) this._mashCount++;
    if (this.isJustPressed("STANCE_TOGGLE")) {
      try {
        this.onStanceToggle?.();
      } catch (error) {
        console.warn("[InputManager] Stance toggle callback error:", error);
      }
    }
    // QoL Features
    if (this.isJustPressed("FPS_TOGGLE")) {
      try {
        this.onFpsToggle?.();
      } catch (e) {
        console.warn("[InputManager] FPS toggle error:", e);
      }
    }
    if (this.isJustPressed("DAMAGE_NUMBERS_TOGGLE")) {
      try {
        this.onDamageNumbersToggle?.();
      } catch (e) {
        console.warn("[InputManager] Damage numbers toggle error:", e);
      }
    }
    if (this.isJustPressed("TRAINING_RESET")) {
      try {
        this.onTrainingReset?.();
      } catch (e) {
        console.warn("[InputManager] Training reset error:", e);
      }
    }
    if (this.isJustPressed("SAVE_POSITION")) {
      try {
        this.onSavePosition?.();
      } catch (e) {
        console.warn("[InputManager] Save position error:", e);
      }
    }
    if (this.isJustPressed("LOAD_POSITION")) {
      try {
        this.onLoadPosition?.();
      } catch (e) {
        console.warn("[InputManager] Load position error:", e);
      }
    }
  }

  private _updateLockOnSystem(delta: number): void {
    if (!this._getLockOnTargets) return;

    const ownSlot = this.sessionManager.localSlot ?? 0;
    const playerState = this.sessionManager.getPlayerState?.(ownSlot);
    if (!playerState) return;

    // Get player facing direction from camera
    const facing = new Vector3(
      Math.sin(this.camera?.alpha ?? 0),
      0,
      Math.cos(this.camera?.alpha ?? 0)
    );

    this.lockOnSystem.update(
      delta,
      playerState.position,
      facing,
      this._getLockOnTargets,
      ownSlot
    );

    // Sync locked slot
    this.lockedTargetSlot = this.lockOnSystem.lockedSlot;
  }

  private _getRawMovement(): Vector3 {
    let x = 0, z = 0;
    if (this.isHeld("MOVE_LEFT")) x -= 1;
    if (this.isHeld("MOVE_RIGHT")) x += 1;
    if (this.isHeld("MOVE_FORWARD")) z += 1;
    if (this.isHeld("MOVE_BACK")) z -= 1;
    if (this._gamepad) {
      const ax = this._gamepad.axes[0] ?? 0;
      const az = this._gamepad.axes[1] ?? 0;
      // Gamepad deadzone handling (0.12 threshold)
      if (Math.abs(ax) > 0.12) x = ax;
      if (Math.abs(az) > 0.12) z = -az;
    }
    const len = Math.sqrt(x * x + z * z);
    if (len > 1) {
      x /= len;
      z /= len;
    }
    return new Vector3(x, 0, z);
  }

  private _cameraRelative(v: Vector3): Vector3 {
    if (!this.camera || v.lengthSquared() < 0.001) return v;
    const yaw = this.camera.alpha;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    return new Vector3(v.x * cos - v.z * sin, 0, -v.x * sin - v.z * cos);
  }

  private _getReboundKeys(action: ActionName, defaults: string[]): string[] {
    const custom = this._rebinds[action];
    return custom ? [custom, ...defaults] : defaults;
  }

  private _isKeyOrMouseHeld(code: string): boolean {
    if (code.startsWith("Mouse")) {
      return !!this._mouse[parseInt(code.replace("Mouse", ""), 10)];
    }
    return !!this._keys[code];
  }

  // ─── Internals: Gamepad ────────────────────────────────────────────────────

  private _pollGamepad(): void {
    this._gamepad = null;
    if (typeof navigator.getGamepads !== "function") {
      return;
    }
    for (const pad of navigator.getGamepads()) {
      if (pad?.connected) {
        this._gamepad = pad;
        break;
      }
    }
  }

  private _setupGamepad(): void {
    this._onGamepadConnected = (e: GamepadEvent) => {
      this._gamepad = e.gamepad;
      console.log(`[InputManager] Gamepad connected: ${e.gamepad.id}`);
      // Check if it's likely a PS5 controller
      const isPS5 = e.gamepad.id.toLowerCase().includes('dualsense') || 
                    e.gamepad.id.toLowerCase().includes('playstation') ||
                    e.gamepad.id.toLowerCase().includes('wireless controller');
      if (isPS5) {
        console.log('[InputManager] PS5 DualSense detected! Button mapping active:');
        console.log('  [X] Jump/Fly Up | [Circle] Fly Down | [Square] Light Attack | [Triangle] Heavy Attack');
        console.log('  [L1] Ki Charge | [R1] Ki Blast | [L2] Dodge | [R2] Block');
        console.log('  [L3] Transform | [R3] Transform Down | [Share] Ultimate | [Options] Lock On');
        console.log('  [D-Pad Up] Rush | [D-Pad Down] Grab | [D-Pad Left] Stance | [D-Pad Right] Reset');
      }
    };
    this._onGamepadDisconnected = (e: GamepadEvent) => {
      this._gamepad = null;
      console.log(`[InputManager] Gamepad disconnected: ${e.gamepad.id}`);
    };
    window.addEventListener("gamepadconnected", this._onGamepadConnected);
    window.addEventListener("gamepaddisconnected", this._onGamepadDisconnected);
    
    // Check for already-connected gamepads
    if (typeof navigator.getGamepads === "function") {
      for (const pad of navigator.getGamepads()) {
        if (pad?.connected) {
          this._gamepad = pad;
          console.log(`[InputManager] Found already-connected gamepad: ${pad.id}`);
          break;
        }
      }
    }
  }

  // ─── Internals: Keyboard ────────────────────────────────────────────────────

  private _setupKeyboard(): void {
    this._onKeyDown = (e: KeyboardEvent) => {
      this._keys[e.code] = true;
      if (["Space", "KeyZ"].includes(e.code)) this._mashCount++;
      if (["Space", "ArrowUp", "ArrowDown"].includes(e.code)) e.preventDefault();
    };
    this._onKeyUp = (e: KeyboardEvent) => {
      this._keys[e.code] = false;
    };
    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
  }

  // ─── Internals: Mouse (GTA-style smoothing) ────────────────────────────────

  private _setupMouse(): void {
    const canvas = this.canvas;
    this._onMouseDown = (e: MouseEvent) => {
      this._mouse[e.button] = true;
    };
    this._onMouseUp = (e: MouseEvent) => {
      this._mouse[e.button] = false;
    };
    this._onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    this._onMouseMove = (e: MouseEvent) => {
      if (!this.enabled) {
        this._lastMouseClientX = e.clientX;
        this._lastMouseClientY = e.clientY;
        return;
      }
      let dx: number, dy: number;
      if (this._pointerLocked) {
        dx = e.movementX || 0;
        dy = e.movementY || 0;
      } else {
        const lastX = this._lastMouseClientX;
        const lastY = this._lastMouseClientY;
        this._lastMouseClientX = e.clientX;
        this._lastMouseClientY = e.clientY;
        if (lastX == null || lastY == null) return;
        dx = e.clientX - lastX;
        dy = e.clientY - lastY;
      }
      this._mouseDeltaX += dx;
      this._mouseDeltaY += dy;
      this._applyMouseToCamera();
    };
    this._onMouseLeave = () => {
      this._lastMouseClientX = null;
      this._lastMouseClientY = null;
    };
    this._onWheel = (e: WheelEvent) => {
      if (!this.camera) return;
      e.preventDefault();
      this.camera.radius = Math.max(
        CONFIG.camera.minRadius,
        Math.min(CONFIG.camera.maxRadius, this.camera.radius + e.deltaY * CONFIG.camera.zoomSensitivity)
      );
    };
    canvas.addEventListener("mousedown", this._onMouseDown);
    canvas.addEventListener("mouseup", this._onMouseUp);
    canvas.addEventListener("contextmenu", this._onContextMenu);
    canvas.addEventListener("mousemove", this._onMouseMove);
    canvas.addEventListener("mouseleave", this._onMouseLeave);
    canvas.addEventListener("wheel", this._onWheel);
  }

  private _applyMouseToCamera(): void {
    if (!this.camera) return;
    // Accumulate raw delta
    const rawDx = this._mouseDeltaX;
    const rawDy = this._mouseDeltaY;
    // Apply acceleration + deadzone
    const accel = CONFIG.camera.inputAccel;
    const deadzone = CONFIG.camera.inputDeadzone;
    const deadzoneDx = Math.abs(rawDx) > deadzone ? rawDx : 0;
    const deadzoneDy = Math.abs(rawDy) > deadzone ? rawDy : 0;
    this._mouseVelX += deadzoneDx * 0.002 * accel;
    this._mouseVelY += deadzoneDy * 0.002 * accel;
    // Damping
    this._mouseVelX *= 0.92;
    this._mouseVelY *= 0.92;
    // Clamp max velocity
    const maxVel = 0.025;
    this._mouseVelX = Math.max(-maxVel, Math.min(maxVel, this._mouseVelX));
    this._mouseVelY = Math.max(-maxVel, Math.min(maxVel, this._mouseVelY));
    // Apply smoothed velocity to camera
    const sens = CONFIG.camera.mouseSensitivity;
    this.camera.alpha -= this._mouseVelX / sens * 10;
    this.camera.beta = Math.max(
      CONFIG.camera.minBeta,
      Math.min(CONFIG.camera.maxBeta, this.camera.beta + this._mouseVelY / sens * 10)
    );
    // Reset delta
    this._mouseDeltaX = 0;
    this._mouseDeltaY = 0;
  }

  // ─── Internals: Gamepad (smoothed look) ────────────────────────────────────

  private _applyGamepadCamera(delta: number): void {
    if (!this.camera || !this._gamepad) return;
    const rx = this._gamepad.axes[2] ?? 0;
    const ry = this._gamepad.axes[3] ?? 0;
    const deadzone = CONFIG.camera.inputDeadzone;
    // Deadzone + acceleration
    let lookX = Math.abs(rx) > deadzone ? rx : 0;
    let lookY = Math.abs(ry) > deadzone ? ry : 0;
    const accel = CONFIG.camera.inputAccel * 0.5; // Gentler for gamepad
    this._gamepadLookVelX += lookX * accel * delta;
    this._gamepadLookVelY += lookY * accel * delta;
    // Damping
    this._gamepadLookVelX *= 0.88;
    this._gamepadLookVelY *= 0.88;
    const sens = CONFIG.camera.gamepadSensitivity;
    this.camera.alpha -= this._gamepadLookVelX * sens * delta;
    this.camera.beta = Math.max(
      CONFIG.camera.minBeta,
      Math.min(CONFIG.camera.maxBeta, this.camera.beta + this._gamepadLookVelY * sens * delta)
    );
  }

  // ─── Pointer Lock ──────────────────────────────────────────────────────────

  private _setupPointerLock(): void {
    const canvas = this.canvas;
    this._onCanvasClick = () => {
      if (!this._pointerLocked) {
        void canvas.requestPointerLock();
      }
    };
    this._onPointerLockChange = () => {
      this._pointerLocked = document.pointerLockElement === canvas;
      if (!this._pointerLocked) this.clearLookInput();
    };
    canvas.addEventListener("click", this._onCanvasClick);
    document.addEventListener("pointerlockchange", this._onPointerLockChange);
  }

  // ─── Rebind Persistence ────────────────────────────────────────────────────

  private _loadRebinds(): Record<string, string> {
    try {
      const stored = localStorage.getItem("ws_keybinds") ?? localStorage.getItem("dbz_keybinds") ?? "{}";
      return JSON.parse(stored) as Record<string, string>;
    } catch {
      return {};
    }
  }

  private _saveRebinds(): void {
    try {
      localStorage.setItem("ws_keybinds", JSON.stringify(this._rebinds));
    } catch (e) {
      console.warn("[InputManager] Failed to save rebinds:", e);
    }
  }

  // ─── Cleanup ───────────────────────────────────────────────────────────────

  /**
   * Triggers haptic feedback (rumble) on the gamepad.
   * @param intensity - Rumble intensity 0-1 (default: 0.5)
   * @param duration - Duration in ms (default: 200)
   */
  rumble(intensity: number = 0.5, duration: number = 200): void {
    if (!this._gamepad?.vibrationActuator) return;
    try {
      // @ts-ignore - vibrationActuator is not in standard types yet
      void this._gamepad.vibrationActuator.playEffect("dual-rumble", {
        startDelay: 0,
        duration: duration,
        weakMagnitude: intensity * 0.5,
        strongMagnitude: intensity,
      });
    } catch {
      // Ignore rumble errors
    }
  }

  /**
   * Triggers a light rumble for light attacks.
   */
  rumbleLight(): void {
    this.rumble(0.3, 100);
  }

  /**
   * Triggers a heavy rumble for heavy attacks/impacts.
   */
  rumbleHeavy(): void {
    this.rumble(0.8, 300);
  }

  /**
   * Returns whether a gamepad is currently connected.
   */
  get isGamepadConnected(): boolean {
    return this._gamepad !== null;
  }

  /**
   * Returns the connected gamepad info, or null if none.
   */
  get gamepadInfo(): { id: string; index: number } | null {
    if (!this._gamepad) return null;
    return { id: this._gamepad.id, index: this._gamepad.index };
  }

  /**
   * Disposes the InputManager and cleans up all event listeners.
   */
  dispose(): void {
    // Remove keyboard listeners
    if (this._onKeyDown) window.removeEventListener("keydown", this._onKeyDown);
    if (this._onKeyUp) window.removeEventListener("keyup", this._onKeyUp);
    // Remove gamepad listeners
    if (this._onGamepadConnected) window.removeEventListener("gamepadconnected", this._onGamepadConnected);
    if (this._onGamepadDisconnected) window.removeEventListener("gamepaddisconnected", this._onGamepadDisconnected);
    // Remove mouse/canvas listeners
    const canvas = this.canvas;
    if (this._onMouseDown) canvas.removeEventListener("mousedown", this._onMouseDown);
    if (this._onMouseUp) canvas.removeEventListener("mouseup", this._onMouseUp);
    if (this._onContextMenu) canvas.removeEventListener("contextmenu", this._onContextMenu);
    if (this._onMouseMove) canvas.removeEventListener("mousemove", this._onMouseMove);
    if (this._onMouseLeave) canvas.removeEventListener("mouseleave", this._onMouseLeave);
    if (this._onWheel) canvas.removeEventListener("wheel", this._onWheel);
    if (this._onCanvasClick) canvas.removeEventListener("click", this._onCanvasClick);
    // Remove pointer lock listener
    if (this._onPointerLockChange) document.removeEventListener("pointerlockchange", this._onPointerLockChange);
    this.onStanceToggle = null;
    this.onLockTargetChanged = null;
    this.onFpsToggle = null;
    this.onDamageNumbersToggle = null;
    this.onTrainingReset = null;
    this.onSavePosition = null;
    this.onLoadPosition = null;
    this.getLockCandidates = null;
    this._gamepad = null;
    console.log("[InputManager] Disposed.");
  }
}
