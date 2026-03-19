import { afterEach, describe, expect, it, vi } from "vitest";
import { bindHotkeys } from "./HotkeyBindings.js";

describe("HotkeyBindings", () => {
  afterEach(() => {
    delete globalThis.window;
    vi.restoreAllMocks();
  });

  it("queues a frame advance when period is pressed while paused", () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    globalThis.window = { addEventListener, removeEventListener };

    const game = {
      _started: true,
      isPaused: true,
      requestFrameAdvance: vi.fn(),
      togglePause: vi.fn(),
      _setRuntimeBadge: vi.fn(),
      _toggleMute: vi.fn(),
      _showOverlay: vi.fn(),
      _updateHudVisibility: vi.fn(),
      config: { debug: { showHitboxes: false } },
      registry: { slots: new Map(), getState: vi.fn() },
      localSlot: 0,
    };

    const handler = bindHotkeys(game);
    handler({ key: "." });
    window.removeEventListener("keydown", handler);

    expect(game.requestFrameAdvance).toHaveBeenCalledTimes(1);
    expect(game.togglePause).not.toHaveBeenCalled();
  });

  it("pauses first and shows the step hint when period is pressed during gameplay", () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    globalThis.window = { addEventListener, removeEventListener };

    const game = {
      _started: true,
      isPaused: false,
      requestFrameAdvance: vi.fn(),
      togglePause: vi.fn(),
      _setRuntimeBadge: vi.fn(),
      _toggleMute: vi.fn(),
      _showOverlay: vi.fn(),
      _updateHudVisibility: vi.fn(),
      config: { debug: { showHitboxes: false } },
      registry: { slots: new Map(), getState: vi.fn() },
      localSlot: 0,
    };

    const handler = bindHotkeys(game);
    handler({ key: "." });
    window.removeEventListener("keydown", handler);

    expect(game.togglePause).toHaveBeenCalledWith(true);
    expect(game._setRuntimeBadge).toHaveBeenCalledWith("Paused - press . to advance one frame");
    expect(game.requestFrameAdvance).not.toHaveBeenCalled();
  });
});