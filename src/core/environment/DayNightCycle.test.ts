import { Color3 } from "@babylonjs/core";
import { describe, expect, it } from "vitest";
import { computeDayNightState } from "./DayNightCycle.js";

describe("DayNightCycle", () => {
  it("builds a bright daytime lighting profile at noon", () => {
    const state = computeDayNightState(0.5, new Color3(0.7, 0.82, 0.92));

    expect(state.phaseLabel).toBe("DAY");
    expect(state.clockLabel).toBe("12:00 PM");
    expect(state.isNight).toBe(false);
    expect(state.daylight).toBeGreaterThan(0.95);
    expect(state.hemiIntensity).toBeGreaterThan(1);
    expect(state.sunIntensity).toBeGreaterThan(1.5);
    expect(state.sunDirection.y).toBeLessThan(0);
  });

  it("builds a cool moonlit profile at midnight", () => {
    const state = computeDayNightState(0, new Color3(0.7, 0.82, 0.92));

    expect(state.phaseLabel).toBe("NIGHT");
    expect(state.clockLabel).toBe("12:00 AM");
    expect(state.isNight).toBe(true);
    expect(state.daylight).toBeLessThan(0.05);
    expect(state.hemiIntensity).toBeLessThan(0.5);
    expect(state.sunIntensity).toBeLessThan(0.5);
    expect(state.sunDiffuse.b).toBeGreaterThan(state.sunDiffuse.r);
    expect(state.clearColor.b).toBeGreaterThan(state.clearColor.r);
  });

  it("passes through a stylized dawn transition", () => {
    const state = computeDayNightState(0.26, new Color3(0.85, 0.78, 0.7));

    expect(state.phaseLabel).toBe("DAWN");
    expect(state.twilight).toBeGreaterThan(0.2);
    expect(state.sunDiffuse.r).toBeGreaterThan(state.sunDiffuse.b);
  });
});