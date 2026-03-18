export class ScreenOverlays {
  constructor() {
    this._speedLinesEl = null;
    this._colorWashEl = null;
    this._build();
  }

  _build() {
    const speedLines = document.createElement("div");
    speedLines.id = "vfxSpeedLines";
    Object.assign(speedLines.style, {
      position: "fixed",
      inset: "0",
      pointerEvents: "none",
      opacity: "0",
      zIndex: "9988",
      background: "repeating-conic-gradient(rgba(255,255,255,0.78) 0deg 0.7deg, transparent 0.7deg 6deg)",
      mixBlendMode: "screen",
      transition: "opacity 0.06s ease-out",
    });
    document.body.appendChild(speedLines);
    this._speedLinesEl = speedLines;

    const colorWash = document.createElement("div");
    colorWash.id = "vfxColorWash";
    Object.assign(colorWash.style, {
      position: "fixed",
      inset: "0",
      pointerEvents: "none",
      opacity: "0",
      zIndex: "9987",
      background: "white",
      mixBlendMode: "screen",
      transition: "opacity 0.05s ease-out",
    });
    document.body.appendChild(colorWash);
    this._colorWashEl = colorWash;
  }

  triggerSpeedLines(intensity = 0.5, duration = 0.14) {
    if (!this._speedLinesEl) return;

    this._speedLinesEl.style.transition = "none";
    this._speedLinesEl.style.opacity = String(Math.min(1, intensity));
    requestAnimationFrame(() => {
      this._speedLinesEl.style.transition = `opacity ${Math.round(duration * 1000)}ms ease-out`;
      this._speedLinesEl.style.opacity = "0";
    });
  }

  triggerColorWash(color = "white", peak = 0.45, duration = 0.4) {
    if (!this._colorWashEl) return;

    this._colorWashEl.style.background = color;
    this._colorWashEl.style.transition = "none";
    this._colorWashEl.style.opacity = String(Math.min(1, peak));
    setTimeout(() => {
      this._colorWashEl.style.transition = `opacity ${Math.round(duration * 1000)}ms ease-out`;
      this._colorWashEl.style.opacity = "0";
    }, 30);
  }

  dispose() {
    this._speedLinesEl?.remove();
    this._colorWashEl?.remove();
    this._speedLinesEl = null;
    this._colorWashEl = null;
  }
}
