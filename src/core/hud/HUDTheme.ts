export const HUD_COLORS = {
  HP: "#00ffaa",
  HP_LOW: "#ff1493",
  HP_MED: "#ff69b4",
  KI: "#00d4ff",
  KI_CHARGING: "#ff00ff",
  STAMINA: "#ffd700",
  BAR_BG: "rgba(10,5,25,0.85)",
  PANEL_BG: "rgba(5,0,15,0.94)",
  BORDER: "linear-gradient(45deg, #c0c0c0, #f0f0f0, #c0c0c0)",
  TEXT: "#ffffff",
  TEXT_DIM: "#a0a0a0",
  GOLD: "#ffd700",
  COMBO: "#ff4500",
  CLASH: "#ff1493",
  KILL_FEED: "#ffeb3b",
  SLOT_COLORS: ["#00ffff", "#ff00ff", "#ffff00", "#00ff00"] as const,
  AURA_PINK: "#ff69b4",
  CHROME: "#c0c0c0",
  NEON_GLOW: "#00ffff80",
} as const;

export type HudColor = (typeof HUD_COLORS)[keyof Omit<typeof HUD_COLORS, "SLOT_COLORS">];

export const HUD_TRANSFORM_COLORS = {
  SSJ1: "#fde68a",
  SSJ2: "#fef08a",
  SSJ3: "#fef9c3",
  SSB: "#93c5fd",
  SSBE: "#60a5fa",
  MYSTIC: "#e2e8f0",
  SYNC: "#86efac",
  ORANGE: "#fdba74",
} as const;

export type TransformColorKey = keyof typeof HUD_TRANSFORM_COLORS;

export const HUD_SLOT_LAYOUTS = [
  { h: "left" as const,  v: "bottom" as const, x:  20, y:  -20 },
  { h: "left" as const,  v: "bottom" as const, x:  20, y: -140 },
  { h: "right" as const, v: "bottom" as const, x: -20, y:  -20 },
  { h: "right" as const, v: "bottom" as const, x: -20, y: -140 },
] as const;

export type SlotLayout = (typeof HUD_SLOT_LAYOUTS)[number];
