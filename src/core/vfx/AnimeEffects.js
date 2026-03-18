// src/core/vfx/AnimeEffects.js
// Anime-style visual enhancements wired to PostProcessing shaders.
// screenFlash → CSS div overlay (no GUI dependency)
// speedLines  → GLSL shader via PostProcessing
// chargeGlow  → PostProcessing bloom
// impactNumber → delegated to CombatFeedUI (no-op here)

import { Scalar } from "@babylonjs/core";

const FLASH_DIV_ID = "animeScreenFlash";

export class AnimeEffects {
  /**
   * @param {import("@babylonjs/core").Scene} scene
   * @param {*} _guiTexture  kept for API compatibility, unused
   * @param {import("../PostProcessing").PostProcessing} postProcessing
   */
  constructor(scene, _guiTexture, postProcessing) {
    this.scene = scene;
    this._pp   = postProcessing ?? null;
    this._flashTimeout = null;
    this._speedLinesTimeout = null;
    this._buildFlashDiv();
  }

  // ─── Screen flash ───────────────────────────────────────────────────────────

  _buildFlashDiv() {
    if (document.getElementById(FLASH_DIV_ID)) return;
    const el = document.createElement("div");
    el.id = FLASH_DIV_ID;
    Object.assign(el.style, {
      position:      "fixed",
      inset:         "0",
      opacity:       "0",
      background:    "#fff",
      pointerEvents: "none",
      zIndex:        "9996",
      transition:    "opacity 0.03s linear",
    });
    document.body.appendChild(el);
  }

  /**
   * Full-screen color flash — white for normal hits, orange-red for heavy.
   * @param {"LIGHT"|"HEAVY"|"BEAM"} impactType
   * @param {number} duration  seconds
   */
  screenFlash(impactType = "LIGHT", duration = 0.12) {
    const el = document.getElementById(FLASH_DIV_ID);
    if (!el) return;

    const colors = {
      BEAM:  "#ffffff",
      HEAVY: "#ff6b00",
      LIGHT: "#ffffff",
    };
    const opacities = { BEAM: 0.55, HEAVY: 0.45, LIGHT: 0.22 };

    el.style.background  = colors[impactType] ?? "#ffffff";
    el.style.transition  = "opacity 0.03s linear";
    el.style.opacity     = String(opacities[impactType] ?? 0.2);

    if (this._flashTimeout != null) {
      clearTimeout(this._flashTimeout);
      this._flashTimeout = null;
    }
    this._flashTimeout = setTimeout(() => {
      el.style.transition = `opacity ${(duration * 0.75).toFixed(2)}s ease-out`;
      el.style.opacity    = "0";
      this._flashTimeout = null;
    }, duration * 250);
  }

  // ─── Speed lines ────────────────────────────────────────────────────────────

  /**
   * Burst of manga speed lines radiating from screen centre.
   * Uses the PostProcessing GLSL shader when available.
   * @param {number} intensity  0–1
   */
  speedLines(intensity = 1.0) {
    if (!this._pp || intensity <= 0) return;
    const clamped = Scalar.Clamp(intensity, 0, 1);
    this._pp.setSpeedLines(clamped);
    if (this._speedLinesTimeout != null) {
      clearTimeout(this._speedLinesTimeout);
      this._speedLinesTimeout = null;
    }
    this._speedLinesTimeout = setTimeout(() => {
      this._pp?.setSpeedLines(0);
      this._speedLinesTimeout = null;
    }, 320);
  }

  // ─── Charge glow ────────────────────────────────────────────────────────────

  /**
   * Boost bloom while ki is charging.
   * @param {number} intensity  0–1
   */
  chargeGlow(intensity = 1.0) {
    if (!this._pp) return;
    this._pp.setBloom(1.0 + Scalar.Clamp(intensity, 0, 1) * 1.2);
  }

  // ─── Impact number (delegated) ──────────────────────────────────────────────

  /**
   * No-op: damage numbers are handled by CombatFeedUI.spawnDamageNumber.
   * Kept so call-sites in GameLoop don't need to change.
   */
  impactNumber() {}

  dispose() {
    if (this._flashTimeout != null) {
      clearTimeout(this._flashTimeout);
      this._flashTimeout = null;
    }
    if (this._speedLinesTimeout != null) {
      clearTimeout(this._speedLinesTimeout);
      this._speedLinesTimeout = null;
    }
    const el = document.getElementById(FLASH_DIV_ID);
    if (el) el.remove();
    this._pp?.setSpeedLines(0);
  }
}
