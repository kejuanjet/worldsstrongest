import { Engine, Scene, Color4 } from "@babylonjs/core";
import { AssetLoader } from "./AssetLoader.js";
import { loadGameData } from "../data/gameData.js";
// @ts-expect-error Runtime config currently lives in JS.
import { CONFIG } from "./index.js";

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;

export const engine = new Engine(canvas, true, {
  preserveDrawingBuffer: false,
  stencil: true,
  antialias: true,
  adaptToDeviceRatio: false,
});

let currentHardwareScalingLevel = 1;

export function getHardwareScalingLevel(): number {
  return currentHardwareScalingLevel;
}

export function getScalingLevelForPerformanceTier(
  tier: "LOW" | "MED" | "HIGH" | "ULTRA",
): number {
  if (tier === "LOW") {
    return CONFIG.performance?.lowScalingLevel ?? 1.5;
  }
  if (tier === "MED") {
    return CONFIG.performance?.mediumScalingLevel ?? 1.25;
  }
  return CONFIG.performance?.highScalingLevel ?? 1;
}

export function applyHardwareScalingLevel(level = CONFIG.performance?.highScalingLevel ?? 1): number {
  const nextLevel = Math.max(1, Number.isFinite(level) ? level : 1);
  currentHardwareScalingLevel = nextLevel;
  engine.setHardwareScalingLevel(nextLevel);
  return currentHardwareScalingLevel;
}

export const scene = new Scene(engine);
scene.clearColor = new Color4(0, 0, 0, 1);
applyHardwareScalingLevel();

// AssetLoader will be initialized after we load the manifest
export let assetLoader: AssetLoader | null = null;

/**
 * Initialize the asset loader with the manifest.
 * Call this before using assetLoader.
 */
export async function initAssetLoader(): Promise<AssetLoader> {
  if (assetLoader) {
    return assetLoader;
  }
  const { manifest } = await loadGameData();
  assetLoader = new AssetLoader(scene, manifest);
  return assetLoader;
}

export default { engine, scene, get assetLoader() { return assetLoader; }, initAssetLoader };
