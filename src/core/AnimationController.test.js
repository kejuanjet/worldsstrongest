import { describe, expect, it, vi } from "vitest";
import { AnimationController } from "./AnimationController.js";

describe("AnimationController stance handling", () => {
  it("cancels pending one-shots before switching stance", () => {
    const listeners = new Map();
    const registry = {
      slots: new Map(),
      getState: vi.fn(),
      restoreCharacterRenderState: vi.fn(),
      on(eventName, handler) {
        listeners.set(eventName, handler);
        return () => listeners.delete(eventName);
      },
    };

    const controller = new AnimationController({}, registry, null);
    const animator = {
      cancelPendingOneShot: vi.fn(),
      switchStance: vi.fn(),
    };
    controller._animators.set(1, animator);

    const handler = listeners.get("onStanceChanged");
    expect(handler).toBeTypeOf("function");
    handler?.({ slot: 1, stance: "SWORD", wasActionLocked: true });

    expect(animator.cancelPendingOneShot).toHaveBeenCalledTimes(1);
    expect(animator.switchStance).toHaveBeenCalledWith("SWORD");
  });
});
