export const CAMERA_CONFIG = {
  // Core positioning
  defaultAlpha: Math.PI / 2,
  defaultBeta: 1.2,
  defaultRadius: 7.35,
  verticalOffset: 1.8,
  
  // Limits
  minRadius: 3.5,
  maxRadius: 20,
  minBeta: 0.4,
  maxBeta: 1.6,
  
  // Lerping (legacy)
  followSpeed: 8,
  rotationLerpSpeed: 12,
  zoomLerpSpeed: 10,
  
  // NEW: Spring system (GTA-style smooth bouncy follow)
  springStiffness: 120,      // Higher = snappier
  springDamping: 0.85,       // 0-1, higher = less oscillation
  springTolerance: 0.01,
  
  // Input
  mouseSensitivity: 0.002,
  gamepadSensitivity: 2.5,
  zoomSensitivity: 0.001,
  inputAccel: 15,            // Mouse/gamepad acceleration
  inputDeadzone: 0.15,
  
  // Dynamics
  speedZoomRange: 12,        // Radius increase per speed unit
  groundLookAhead: 2.5,
  flightLookAhead: 4.5,
  
  // NEW: Collision avoidance
  collisionMargin: 1.2,
  collisionSamples: 16,      // Rays around camera sphere
  collisionRaise: 0.8,       // Y offset on collision
  
  // NEW: Cinematic motion
  bobFreqGround: 2.2,        // Hz
  bobFreqFlight: 1.1,
  bobAmp: 0.08,
  swayFreq: 1.8,
  swayAmp: 0.12,
  rollTiltMax: 0.08,         // Camera roll on sharp turns
  fovSpeedRamp: 0.15,        // FOV widen at high speed
  fovMin: 0.75,
  fovMax: 1.25,
  
  // Lock-on
  lockOnBeta: 1.02,
  lockOnRadiusScale: 0.44,
  lockOnRadiusPadding: 3.2,
  lockOnOffsetY: 1.35,
  lockOnVerticalClamp: 1.6,
  lockOnShoulderOffset: 0.6,
  lockOnBreakDistance: 35,
  
  // OTS (over-the-shoulder)
  shoulderOffset: 1.2,
  
  // Misc
  fov: 0.9,
};

