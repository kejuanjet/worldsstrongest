import { ArcRotateCamera, NullEngine, Scene, Vector3 } from "@babylonjs/core";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ImpactFX } from "./ImpactFX.js";

describe("ImpactFX hitstop throttling", () => {
  let previousDocument;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(performance, "now").mockImplementation(() => vi.getMockedSystemTime());
    previousDocument = globalThis.document;
    const elements = new Map();
    globalThis.document = {
      getElementById: vi.fn((id) => elements.get(id) ?? null),
      createElement: vi.fn((tag) => ({
        id: "",
        tagName: tag.toUpperCase(),
        style: {},
      })),
      body: {
        appendChild: vi.fn((node) => {
          if (node?.id) elements.set(node.id, node);
          return node;
        }),
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    globalThis.document = previousDocument;
  });

  it("does not retrigger global animation freeze on every rapid combat hit", () => {
    vi.setSystemTime(0);

    const engine = new NullEngine();
    const scene = new Scene(engine);
    scene.animationsEnabled = true;
    const camera = new ArcRotateCamera("cam", 0, 1, 10, Vector3.Zero(), scene);
    const impactFx = new ImpactFX(scene, camera, null);

    impactFx._triggerHitstop(45);
    expect(scene.animationsEnabled).toBe(false);
    expect(impactFx._hitstop.active).toBe(true);

    vi.setSystemTime(30);
    impactFx._triggerHitstop(45);
    expect(impactFx._hitstop.remaining).toBe(45);

    impactFx.update(0.05);
    expect(scene.animationsEnabled).toBe(true);
    expect(impactFx._hitstop.active).toBe(false);
  });

  it("restores animations only when hitstop disabled them", () => {
    vi.setSystemTime(0);

    const engine = new NullEngine();
    const scene = new Scene(engine);
    scene.animationsEnabled = false;
    const camera = new ArcRotateCamera("cam", 0, 1, 10, Vector3.Zero(), scene);
    const impactFx = new ImpactFX(scene, camera, null);

    impactFx._triggerHitstop(45);
    expect(scene.animationsEnabled).toBe(false);

    impactFx.update(0.05);
    expect(scene.animationsEnabled).toBe(false);
  });
});