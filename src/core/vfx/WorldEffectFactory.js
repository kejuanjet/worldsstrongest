import {
  Color3,
  Color4,
  MeshBuilder,
  ParticleSystem,
  StandardMaterial,
  Texture,
  Vector3,
} from "@babylonjs/core";

const SPARK_COLORS = {
  LIGHT:      "#ffe066",
  HEAVY:      "#ff6a00",
  BLOCK:      "#7dd3fc",
  KI_BLAST:   "#60a5fa",
  BEAM:       "#c084fc",
  ULTIMATE:   "#f0abfc",
  RUSH_COMBO: "#fbbf24",
  SWORD:      "#e2e8f0",
  HEAL:       "#4ade80",
};

// ─── Shared soft-glow particle texture ────────────────────────────────────────
// Generated once from canvas so no network request is needed.
let _particleTex = null;
function _getParticleTex(scene) {
  if (_particleTex && !_particleTex.isDisposed()) return _particleTex;
  const size = 64;
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const ctx = cv.getContext("2d");
  const half = size / 2;
  const g = ctx.createRadialGradient(half, half, 0, half, half, half);
  g.addColorStop(0.00, "rgba(255,255,255,1.0)");
  g.addColorStop(0.35, "rgba(255,255,255,0.85)");
  g.addColorStop(0.70, "rgba(255,255,255,0.30)");
  g.addColorStop(1.00, "rgba(255,255,255,0.00)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  _particleTex = new Texture(cv.toDataURL(), scene, false, false);
  return _particleTex;
}

export function createShockwave(scene, worldPos, colorHex = "#ffffff", maxScale = 7, duration = 0.35, crossAxis = false) {
  const uid = `${crossAxis ? "sw2" : "sw"}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const ring = MeshBuilder.CreateTorus(uid, {
    diameter: 0.8,
    thickness: 0.07,
    tessellation: 20,   // reduced from 32 — imperceptible difference at this scale
  }, scene);
  ring.position.copyFrom(worldPos);
  ring.position.y += crossAxis ? 1.0 : 0.25;
  ring.rotation.x = crossAxis ? 0 : Math.PI / 2;
  ring.rotation.z = crossAxis ? Math.PI / 2 : 0;
  ring.renderingGroupId = 1;
  ring.isPickable = false;

  const material = new StandardMaterial(`${uid}Mat`, scene);
  material.emissiveColor = Color3.FromHexString(colorHex.length === 7 ? colorHex : "#ffffff");
  material.disableLighting = true;
  material.backFaceCulling = false;
  ring.material = material;
  ring.visibility = 1;

  return { mesh: ring, timer: 0, duration, maxScale };
}

export function createHitSparks(scene, worldPos, impactClass = "LIGHT", count = 24) {
  const colorHex = SPARK_COLORS[impactClass] ?? "#ffffff";
  const color = Color3.FromHexString(colorHex);

  const uid = `sparks_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const emitter = MeshBuilder.CreateSphere(`${uid}_em`, { diameter: 0.05, segments: 4 }, scene);
  emitter.position.copyFrom(worldPos);
  emitter.position.y += 1.0;
  emitter.isVisible  = false;
  emitter.isPickable = false;

  const ps = new ParticleSystem(uid, count, scene);
  ps.particleTexture = _getParticleTex(scene);

  ps.emitter   = emitter;
  ps.color1    = new Color4(color.r, color.g, color.b, 1.0);
  ps.color2    = new Color4(Math.min(1, color.r + 0.3), Math.min(1, color.g + 0.15), 0.1, 1.0);
  ps.colorDead = new Color4(color.r * 0.3, color.g * 0.2, 0.0, 0.0);

  // Size — heavier impacts get bigger particles
  const isHeavy    = impactClass === "HEAVY" || impactClass === "ULTIMATE" || impactClass === "BEAM";
  const isMedium   = impactClass === "RUSH_COMBO" || impactClass === "KI_BLAST";
  ps.minSize       = isHeavy ? 0.06 : 0.03;
  ps.maxSize       = isHeavy ? 0.32 : isMedium ? 0.20 : 0.14;

  // Lifetime — ultimate lingers a little longer
  ps.minLifeTime   = 0.06;
  ps.maxLifeTime   = isHeavy ? 0.50 : 0.32;

  // Velocity — explosive burst
  ps.minEmitPower  = isHeavy ? 14 : 8;
  ps.maxEmitPower  = isHeavy ? 32 : isMedium ? 22 : 16;
  ps.updateSpeed   = 0.025;
  ps.gravity       = new Vector3(0, -14, 0);

  // Direction — omnidirectional burst
  ps.direction1    = new Vector3(-1, 0.6, -1);
  ps.direction2    = new Vector3( 1, 1.4,  1);

  ps.blendMode          = ParticleSystem.BLENDMODE_ADD;
  ps.isLocal            = false;
  ps.renderingGroupId   = 1;
  ps.manualEmitCount    = count;
  ps.start();

  const duration = isHeavy ? 0.65 : 0.50;
  return { ps, emitter, timer: 0, duration };
}

export function createWeaponTrail(scene, worldPos, direction, opts = {}) {
  const dir = direction.clone();
  if (dir.lengthSquared() < 0.0001) dir.set(0, 0, 1);
  dir.normalize();

  const length = opts.length ?? 3.8;
  const height = opts.height ?? 0.8;
  const duration = opts.duration ?? 0.16;
  const color = Color3.FromHexString((opts.colorHex ?? "#dbeafe").length === 7 ? opts.colorHex : "#dbeafe");
  const uid = `trail_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const plane = MeshBuilder.CreatePlane(uid, { width: length, height, sideOrientation: 2 }, scene);
  plane.position.copyFrom(worldPos);
  plane.position.addInPlace(dir.scale(length * 0.42));
  plane.position.y += opts.heightOffset ?? 1.35;
  plane.rotation.y = Math.atan2(dir.x, dir.z);
  plane.rotation.x = opts.pitch ?? (Math.PI * 0.08);
  plane.rotation.z = opts.roll ?? ((Math.random() - 0.5) * 0.7);
  plane.isPickable = false;

  const material = new StandardMaterial(`${uid}_mat`, scene);
  material.emissiveColor = color;
  material.disableLighting = true;
  material.backFaceCulling = false;
  material.alpha = opts.alpha ?? 0.72;
  plane.material = material;

  const baseScale = new Vector3(0.25, 1, 1);
  const endScale = new Vector3(opts.endScaleX ?? 1.55, opts.endScaleY ?? 0.15, 1);
  plane.scaling.copyFrom(baseScale);

  return { mesh: plane, mat: material, timer: 0, duration, baseScale, endScale };
}

export function createHitFlash(scene, worldPos, colorHex = "#ffffff", maxScale = 1.8, duration = 0.12) {
  const uid = `hitflash_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const orb = MeshBuilder.CreateSphere(uid, { diameter: 0.8, segments: 6 }, scene);
  orb.position.copyFrom(worldPos);
  orb.position.y += 1.1;
  orb.isPickable = false;
  orb.renderingGroupId = 1;

  const material = new StandardMaterial(`${uid}_mat`, scene);
  material.emissiveColor = Color3.FromHexString(colorHex.length === 7 ? colorHex : "#ffffff");
  material.disableLighting = true;
  material.backFaceCulling = false;
  material.alpha = 0.85;
  orb.material = material;
  orb.scaling.setAll(0.35);

  return { mesh: orb, mat: material, timer: 0, duration, maxScale };
}
