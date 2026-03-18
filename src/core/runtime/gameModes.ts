export const GAME_MODE = Object.freeze({
  MENU: "MENU",
  SINGLE_PLAYER: "SINGLE_PLAYER",
  TRAINING: "TRAINING",
  MULTIPLAYER_HOST: "MULTIPLAYER_HOST",
  MULTIPLAYER_CLIENT: "MULTIPLAYER_CLIENT",
} as const);

export type GameMode = (typeof GAME_MODE)[keyof typeof GAME_MODE];
