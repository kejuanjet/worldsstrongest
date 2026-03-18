export type GameMode =
  | "MENU"
  | "SINGLE_PLAYER"
  | "TRAINING"
  | "MULTIPLAYER_HOST"
  | "MULTIPLAYER_CLIENT";

export type SlotId = number;

export interface InputStateLike {
  moveX: number;
  moveZ: number;
  flyY: number;
  btnAttack: boolean;
  btnHeavy: boolean;
  btnBlast: boolean;
  btnUltimate: boolean;
  btnRush: boolean;
  btnGrab: boolean;
  btnTransform: boolean;
  btnTransformDown: boolean;
  btnDodge: boolean;
  btnKi: boolean;
  btnBlock: boolean;
  btnStance: boolean;
  lockedSlot: SlotId | null;
  mashCount: number;
  yaw?: number;
  pitch?: number;
}

export interface AttackInputEdges {
  btnAttack: boolean;
  btnHeavy: boolean;
  btnBlast: boolean;
  btnUltimate: boolean;
  btnRush: boolean;
  btnGrab: boolean;
  btnTransform: boolean;
  btnTransformDown: boolean;
  btnStance: boolean;
  btnKiStart: boolean;
  btnKiEnd: boolean;
}
