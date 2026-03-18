// src/vfx/PostProcessing.js
// Full post-process pipeline for the game's visual signature.
// Bloom for ki effects, chromatic aberration on hits, vignette for intensity,
// motion blur on fast movement / transformation, and screen distortion during
// high-power auras (SSJ3, SSB).

import {
  DefaultRenderingPipeline,
  ChromaticAberrationPostProcess,
  MotionBlurPostProcess,
  PostProcess,
  Effect,
  Vector2,
  Color3,
  Color4,
  Scalar,
  ColorCurves,
} from "@babylonjs/core";
import { CONFIG } from "../config/index.js";

// ─── Custom Shader: Screen Distortion ─────────────────────────────────────────
// Used during SSJ3 / SSB aura to ripple the screen slightly.

const DISTORTION_FRAG = `
  precision highp float;
  varying vec2 vUV;
  uniform sampler2D textureSampler;
  uniform float time;
  uniform float intensity;

  void main(void) {
    vec2 uv = vUV;
    float wave = sin(uv.y * 18.0 + time * 3.5) * 0.004 * intensity;
    float wave2 = cos(uv.x * 12.0 + time * 2.8) * 0.003 * intensity;
    uv.x += wave;
    uv.y += wave2;
    gl_FragColor = texture2D(textureSampler, uv);
  }
`;

// ─── Custom Shader: Hit Distortion (radial warp from impact) ──────────────────

const HIT_DISTORT_FRAG = `
  precision highp float;
  varying vec2 vUV;
  uniform sampler2D textureSampler;
  uniform vec2 center;
  uniform float strength;
  uniform float radius;

  void main(void) {
    vec2 uv     = vUV;
    vec2 delta  = uv - center;
    float dist  = length(delta);
    float ring  = smoothstep(radius, radius * 0.2, dist) * smoothstep(0.0, radius * 0.2, dist);
    uv += normalize(delta) * ring * strength;
    gl_FragColor = texture2D(textureSampler, uv);
  }
`;

// ─── Custom Shader: Anime Speed Lines ─────────────────────────────────────────

const SPEED_LINES_FRAG = `
  precision highp float;
  varying vec2 vUV;
  uniform sampler2D textureSampler;
  uniform float time;
  uniform float intensity;

  float rand(vec2 co){ return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453); }

  void main(void) {
    vec2 center = vec2(0.5, 0.5);
    vec2 uv = vUV - center;
    float dist = length(uv);
    float angle = atan(uv.y, uv.x);
    
    float noise = rand(vec2(floor(angle * 150.0), floor(time * 20.0)));
    float line = smoothstep(0.65, 1.0, noise) * smoothstep(0.15, 0.7, dist) * intensity;
    
    vec4 baseColor = texture2D(textureSampler, vUV);
    // Add bright white/cyan streaks
    gl_FragColor = baseColor + vec4(0.9, 0.95, 1.0, 1.0) * line * 1.5;
  }
`;

// ─── PostProcessing ───────────────────────────────────────────────────────────

export class PostProcessing {
  /**
   * @param {import("@babylonjs/core").Scene} scene
   * @param {import("@babylonjs/core").ArcRotateCamera} camera
   */
  constructor(scene, camera) {
    this.scene  = scene;
    this.camera = camera;
    this.engine = scene.getEngine();

    /** @type {DefaultRenderingPipeline | null} */
    this.pipeline = null;

    /** @type {MotionBlurPostProcess | null} */
    this.motionBlur = null;

    /** @type {PostProcess | null} custom distortion */
    this.distortion = null;

    /** @type {PostProcess | null} per-hit radial warp */
    this.hitDistort = null;

    /** @type {PostProcess | null} dynamic speed lines */
    this.speedLines = null;

    /** @type {ChromaticAberrationPostProcess | null} */
    this.chromatic = null;

    // Animation state
    this._distortionIntensity = 0;
    this._distortionTarget    = 0;
    this._time                = 0;

    this._chromaticTarget     = 0;
    this._chromaticCurrent    = 0;

    this._vignetteTarget      = 0;
    this._vignetteCurrent     = 0;

    // Hit distort state
    this._hitDistortActive    = false;
    this._hitDistortTimer     = 0;
    this._hitDistortDuration  = 0.18;
    this._hitDistortCenter    = new Vector2(0.5, 0.5);
    this._hitDistortStrength  = 0;

    this._speedLinesIntensity = 0;
    this._speedLinesTarget    = 0;

    this._bloomTarget         = CONFIG.vfx.bloomWeight;
    this._bloomCurrent        = CONFIG.vfx.bloomWeight;

    try {
      this._init();
    } catch (err) {
      console.warn("[PostProcessing] Pipeline init failed. Continuing without post FX.", err);
      this.pipeline = null;
      this.motionBlur = null;
      this.distortion = null;
      this.hitDistort = null;
      this.chromatic = null;
      this.speedLines = null;
    }
  }

  // ─── Init ─────────────────────────────────────────────────────────────────

  _init() {
    // ── Main rendering pipeline (bloom + depth of field + fxaa) ──────────
    this.pipeline = new DefaultRenderingPipeline("mainPipeline", true, this.scene, [this.camera]);

    // FXAA
    this.pipeline.fxaaEnabled = true;

    // Bloom
    this.pipeline.bloomEnabled    = true;
    this.pipeline.bloomThreshold  = CONFIG.vfx.bloomThreshold;
    this.pipeline.bloomWeight     = CONFIG.vfx.bloomWeight;
    this.pipeline.bloomKernel     = CONFIG.vfx.bloomKernel;
    this.pipeline.bloomScale      = 0.5;

    // Image processing
    this.pipeline.imageProcessingEnabled = true;
    this.pipeline.imageProcessing.contrast   = 1.25; // Punchy anime contrast
    this.pipeline.imageProcessing.exposure   = 1.15; // Slightly brighter overall
    this.pipeline.imageProcessing.toneMappingEnabled = true;
    this.pipeline.imageProcessing.toneMappingType = 1; // ACES tone mapping for cinematic highlights

    // ── Shonen Anime Cool Blue Color Grading ──
    const curves = new ColorCurves();
    curves.globalHue = 210;         // Cool blue tint
    curves.globalDensity = 15;      // Subtle global influence
    curves.globalSaturation = 30;   // High saturation for vivid JRPG colors
    
    // Tint shadows cool-blue and lift them slightly for a flatter, toon-like appearance
    curves.shadowsHue = 220;
    curves.shadowsDensity = 25;
    curves.shadowsExposure = 10;
    
    // Keep midtones bright and colorful
    curves.midtonesHue = 200;
    curves.midtonesDensity = 10;
    curves.midtonesSaturation = 15;

    this.pipeline.imageProcessing.colorCurvesEnabled = true;
    this.pipeline.imageProcessing.colorCurves = curves;

    // Vignette (managed dynamically)
    this.pipeline.imageProcessing.vignetteEnabled  = true;
    this.pipeline.imageProcessing.vignetteWeight   = 1.5;
    this.pipeline.imageProcessing.vignetteStretch  = 0;
    this.pipeline.imageProcessing.vignetteColor    = new Color4(0, 0, 0, 0);
    this.pipeline.imageProcessing.vignetteBlendMode = 0;

    // ── Chromatic Aberration ──────────────────────────────────────────────
    this.chromatic = new ChromaticAberrationPostProcess(
      "chromaticAberration",
      this.engine.getRenderWidth(),
      this.engine.getRenderHeight(),
      1.0,
      this.camera,
      undefined,
      this.engine
    );
    this.chromatic.aberrationAmount = 0;
    this.chromatic.radialIntensity  = 1.0;

    // ── Motion Blur ───────────────────────────────────────────────────────
    this.motionBlur = new MotionBlurPostProcess(
      "motionBlur", this.scene, 1.0, this.camera
    );
    this.motionBlur.motionStrength = 0;
    this.motionBlur.motionBlurSamples = 4;  // 8 is expensive; 4 is imperceptible difference

    // ── Custom Screen Distortion shader ───────────────────────────────────
    Effect.ShadersStore["distortionFragmentShader"] = DISTORTION_FRAG;
    this.distortion = new PostProcess(
      "distortion", "distortion", ["time", "intensity"], null, 1.0, this.camera
    );
    this.distortion.onApply = (effect) => {
      effect.setFloat("time",      this._time);
      effect.setFloat("intensity", this._distortionIntensity);
    };
    this.distortion.enabled = false;

    // ── Hit radial warp ───────────────────────────────────────────────────
    Effect.ShadersStore["hitDistortFragmentShader"] = HIT_DISTORT_FRAG;
    this.hitDistort = new PostProcess(
      "hitDistort", "hitDistort",
      ["center", "strength", "radius"],
      null, 1.0, this.camera
    );
    this.hitDistort.onApply = (effect) => {
      effect.setVector2("center",   this._hitDistortCenter);
      effect.setFloat("strength",   this._hitDistortStrength * Math.max(0, 1 - this._hitDistortTimer / this._hitDistortDuration));
      effect.setFloat("radius",     0.25);
    };
    this.hitDistort.enabled = false;

    // ── Speed Lines ───────────────────────────────────────────────────────
    Effect.ShadersStore["speedLinesFragmentShader"] = SPEED_LINES_FRAG;
    this.speedLines = new PostProcess(
      "speedLines", "speedLines", ["time", "intensity"], null, 1.0, this.camera
    );
    this.speedLines.onApply = (effect) => {
      effect.setFloat("time",      this._time);
      effect.setFloat("intensity", this._speedLinesIntensity);
    };
    this.speedLines.enabled = false;

    this.setQuality("MED");
    console.log("[PostProcessing] Pipeline ready.");
  }

  // ─── Per-Frame Update ─────────────────────────────────────────────────────

  update(delta) {
    this._time += delta;

    // Smooth bloom
    this._bloomCurrent = Scalar.Lerp(this._bloomCurrent, this._bloomTarget, delta * 4);
    if (this.pipeline) this.pipeline.bloomWeight = this._bloomCurrent;

    // Smooth chromatic aberration
    this._chromaticCurrent = Scalar.Lerp(this._chromaticCurrent, this._chromaticTarget, delta * 8);
    if (this.chromatic) this.chromatic.aberrationAmount = this._chromaticCurrent;

    // Smooth vignette
    this._vignetteCurrent = Scalar.Lerp(this._vignetteCurrent, this._vignetteTarget, delta * 5);
    if (this.pipeline?.imageProcessing) {
      this.pipeline.imageProcessing.vignetteWeight = 1.5 + this._vignetteCurrent * 6;
    }

    // Screen distortion
    if (this._distortionIntensity > 0 || this._distortionTarget > 0) {
      this._distortionIntensity = Scalar.Lerp(this._distortionIntensity, this._distortionTarget, delta * 3);
      if (this.distortion) this.distortion.enabled = this._distortionIntensity > 0.01;
    }

    // Hit distortion decay
    if (this._hitDistortActive) {
      this._hitDistortTimer += delta;
      if (this._hitDistortTimer >= this._hitDistortDuration) {
        this._hitDistortActive        = false;
        if (this.hitDistort) this.hitDistort.enabled = false;
        this._hitDistortStrength      = 0;
      }
    }

    // Speed lines
    if (this._speedLinesIntensity > 0 || this._speedLinesTarget > 0) {
      this._speedLinesIntensity = Scalar.Lerp(this._speedLinesIntensity, this._speedLinesTarget, delta * 6);
      if (this.speedLines) this.speedLines.enabled = this._speedLinesIntensity > 0.01;
    }

    // Motion blur: decay toward 0 each frame
    if (this.motionBlur && this.motionBlur.motionStrength > 0) {
      this.motionBlur.motionStrength = Scalar.Lerp(
        this.motionBlur.motionStrength, 0, delta * 6
      );
    }
  }

  // ─── Public Control API ───────────────────────────────────────────────────

  /**
   * Set bloom intensity. 0 = off, 1 = max.
   * @param {number} intensity   0–1
   */
  setBloom(intensity) {
    this._bloomTarget = Scalar.Clamp(CONFIG.vfx.bloomWeight * intensity, 0, 1.5);
  }

  /**
   * Trigger chromatic aberration (hit flash, damage effect).
   * Decays automatically.
   * @param {number} amount   0–200 (ChromaticAberration scale)
   * @param {number} decaySpeed   how fast it fades back to 0
   */
  triggerChromaticAberration(amount = 60, decaySpeed = 8) {
    this._chromaticTarget = amount;
    // Schedule decay back to 0
    setTimeout(() => { this._chromaticTarget = 0; }, 80);
  }

  /**
   * Set vignette darkness. 0 = normal, 1 = heavily darkened edges.
   * @param {number} amount  0–1
   */
  setVignette(amount) {
    this._vignetteTarget = Scalar.Clamp(amount, 0, 1);
  }

  /**
   * Enable screen distortion ripple (for high-power auras like SSJ3/SSB).
   * @param {number} intensity   0 = off, 1 = full ripple
   */
  setDistortion(intensity) {
    this._distortionTarget = Scalar.Clamp(intensity, 0, 1);
  }

  /**
   * Trigger a radial hit distortion from a screen-space point.
   * @param {number} screenX   0–1 normalized screen X
   * @param {number} screenY   0–1 normalized screen Y
   * @param {number} strength  warp amount
   */
  triggerHitDistortion(screenX = 0.5, screenY = 0.5, strength = 0.04) {
    if (!this.hitDistort) return;
    this._hitDistortCenter.x   = screenX;
    this._hitDistortCenter.y   = screenY;
    this._hitDistortStrength   = strength;
    this._hitDistortTimer      = 0;
    this._hitDistortActive     = true;
    this.hitDistort.enabled    = true;
  }

  /**
   * Enable screen-edge manga action lines.
   * @param {number} intensity   0 = off, 1 = max lines
   */
  setSpeedLines(intensity) {
    this._speedLinesTarget = Scalar.Clamp(intensity, 0, 1);
  }

  /**
   * Trigger motion blur (transformation burst, high-speed dodge).
   * @param {number} strength  0–1
   */
  triggerMotionBlur(strength = 0.4) {
    if (this.motionBlur) this.motionBlur.motionStrength = strength;
  }

  /**
   * Full screen white flash (transformation, ultimate impact).
   * @param {number} duration   seconds
   */
  triggerWhiteFlash(duration = 0.15) {
    if (!this.pipeline?.imageProcessing) return;
    const orig = this.pipeline.imageProcessing.exposure;
    this.pipeline.imageProcessing.exposure = 8.0;
    const start = performance.now();
    const decay = () => {
      const t = Math.min(1, (performance.now() - start) / (duration * 1000));
      this.pipeline.imageProcessing.exposure = 8.0 - (8.0 - orig) * t;
      if (t < 1) requestAnimationFrame(decay);
    };
    requestAnimationFrame(decay);
  }

  /**
   * React to a transformation — set all post-process to transformation levels.
   * @param {string} transformId
   */
  onTransformation(transformId) {
    const profiles = {
      SSJ1: { bloom: 1.4, aberration: 0,    distortion: 0,    vignette: 0.15, motionBlur: 0.5 },
      SSJ2: { bloom: 1.6, aberration: 0,    distortion: 0,    vignette: 0.2,  motionBlur: 0.6 },
      SSJ3: { bloom: 2.0, aberration: 0,    distortion: 0.7,  vignette: 0.35, motionBlur: 0.8 },
      SSB:  { bloom: 1.8, aberration: 0,    distortion: 0.5,  vignette: 0.25, motionBlur: 0.7 },
      SSBE: { bloom: 2.2, aberration: 0,    distortion: 0.85, vignette: 0.4,  motionBlur: 0.8 },
      BASE: { bloom: 1.0, aberration: 0,    distortion: 0,    vignette: 0,    motionBlur: 0   },
    };

    const p = profiles[transformId] ?? profiles.BASE;
    this.setBloom(p.bloom);
    this.setDistortion(p.distortion);
    this.setVignette(p.vignette);
    this.triggerMotionBlur(p.motionBlur);
    this.triggerWhiteFlash(0.2);
  }

  /**
   * React to taking damage — hit flash effects.
   * @param {number} amount
   */
  onDamageTaken(amount) {
    const scale = Math.min(1, amount / 2000);
    this.triggerChromaticAberration(30 + scale * 120);
    this.triggerHitDistortion(0.5, 0.5, 0.02 + scale * 0.06);
    this.setVignette(Math.max(this._vignetteTarget, scale * 0.5));
    setTimeout(() => this.setVignette(0), 400);
  }

  /**
   * React to combat intensity — boost bloom when ki blasts are flying.
   * @param {number} intensity   0–1
   */
  setCombatIntensity(intensity) {
    this.setBloom(1.0 + intensity * 1.2);
  }

  // ─── Quality Preset ───────────────────────────────────────────────────────

  /**
   * @param {"LOW"|"MED"|"HIGH"|"ULTRA"} preset
   */
  setQuality(preset) {
    const presets = {
      LOW:   { fxaa: false, bloom: false, motionBlur: false, bloomKernel: 24, chromatic: false, distortion: false, hitDistort: false },
      MED:   { fxaa: true,  bloom: true,  motionBlur: false, bloomKernel: 32, chromatic: true,  distortion: false, hitDistort: true  },
      HIGH:  { fxaa: true,  bloom: true,  motionBlur: true,  bloomKernel: 48, chromatic: true,  distortion: true,  hitDistort: true  },
      ULTRA: { fxaa: true,  bloom: true,  motionBlur: true,  bloomKernel: 64, chromatic: true,  distortion: true,  hitDistort: true  },
    };
    const p = presets[preset] ?? presets.HIGH;
    if (this.pipeline) {
      this.pipeline.fxaaEnabled        = p.fxaa;
      this.pipeline.bloomEnabled       = p.bloom;
      this.pipeline.bloomKernel        = p.bloomKernel;
    }
    if (this.motionBlur) this.motionBlur.isEnabled = p.motionBlur;
    if (this.chromatic) this.chromatic.enabled = p.chromatic;
    if (this.distortion && !p.distortion) this.distortion.enabled = false;
    if (this.hitDistort && !p.hitDistort) this.hitDistort.enabled = false;

    console.log(`[PostProcessing] Quality: ${preset}`);
  }

  dispose() {
    this.pipeline?.dispose();
    this.motionBlur?.dispose();
    this.distortion?.dispose();
    this.hitDistort?.dispose();
    this.chromatic?.dispose();
    this.speedLines?.dispose();
  }
}
