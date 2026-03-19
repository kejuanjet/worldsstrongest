import { Engine, Scene, Color4 } from "@babylonjs/core";
import { AssetLoader } from "./AssetLoader.js";
import { loadGameData } from "../data/gameData.js";

export async function initEngineAndScene(canvas: HTMLCanvasElement) {
  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: false,
    stencil: true,
    antialias: true,
    adaptToDeviceRatio: false,
  });

  const scene = new Scene(engine);
  scene.clearColor = new Color4(0, 0, 0, 1);
  
  return { engine, scene };
}

export async function initAssetLoader(scene: Scene): Promise<AssetLoader> {
  const { manifest } = await loadGameData();
  const assetLoader = new AssetLoader(scene, manifest);
  return assetLoader;
}
