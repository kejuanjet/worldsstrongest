export const SESSION_ROLE: { HOST: string; CLIENT: string; NONE: string };
export const MSG_TYPE: Record<string, string>;
export class SessionManager {
  constructor();
  localSlot?: number;
  sendInputState(inputState: any): void;
  getPlayerState(slot: number): any;
  [key: string]: any;
}
export class InputState {
  constructor();
  [key: string]: any;
}
