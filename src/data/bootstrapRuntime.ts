import type { Scene } from "@babylonjs/core";
import { AssetLoader } from "../core/AssetLoader";
import { CharacterRegistry } from "../core/CharacterRegistry";
import { loadGameData } from "./gameData";

export async function bootstrapRuntime(scene: Scene): Promise<{
  assetLoader: AssetLoader;
  characterRegistry: CharacterRegistry;
}> {
  const { manifest, characters } = await loadGameData();
  const assetLoader = new AssetLoader(scene, manifest);
  const characterRegistry = new CharacterRegistry(scene, assetLoader, characters);
  return { assetLoader, characterRegistry };
}
