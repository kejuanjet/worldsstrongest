import { describe, expect, it } from "vitest";
import { advanceHudUpdateAccumulator, getHudUpdateStep } from "./hudUpdateScheduler.js";

describe("hudUpdateScheduler", () => {
  it("computes the configured heavy-ui cadence", () => {
    expect(getHudUpdateStep({ performance: { hudUpdateHz: 10 }, ui: { hudUpdateHz: 20 } })).toBe(0.1);
    expect(getHudUpdateStep({ performance: {}, ui: { hudUpdateHz: 20 } })).toBe(0.05);
  });

  it("only runs heavy UI work once the accumulator reaches the step", () => {
    const hudStep = 0.05;

    expect(advanceHudUpdateAccumulator(0, 0.02, hudStep)).toEqual({
      shouldRunHeavyUi: false,
      accumulator: 0.02,
    });

    const result = advanceHudUpdateAccumulator(0.02, 0.04, hudStep);
    expect(result.shouldRunHeavyUi).toBe(true);
    expect(result.accumulator).toBeCloseTo(0.01);
  });
});
