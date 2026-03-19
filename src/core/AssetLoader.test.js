import { describe, expect, it } from "vitest";
import { SceneLoader } from "@babylonjs/core";
import "@babylonjs/loaders";
import { buildLoadingProgressSnapshot, getAssetUrlCandidates } from "./AssetLoader.js";

describe("AssetLoader helpers", () => {
  it("builds candidate URLs for asset and texture aliases", () => {
    expect(getAssetUrlCandidates("assets/models/ayo.glb")).toEqual([
      "/assets/models/ayo.glb",
      "/public/assets/models/ayo.glb",
    ]);

    expect(getAssetUrlCandidates("/textures/fx/aura_sheet.png")).toEqual([
      "/textures/fx/aura_sheet.png",
      "/public/assets/textures/fx/aura_sheet.png",
      "/public/textures/fx/aura_sheet.png",
    ]);
  });

  it("formats loading progress text consistently", () => {
    expect(buildLoadingProgressSnapshot(42, "char_ayo")).toEqual({
      percentText: "42%",
      statusText: "Loading: char_ayo",
    });
    expect(buildLoadingProgressSnapshot(100, "")).toEqual({
      percentText: "100%",
      statusText: "Loading: 100%",
    });
  });

  it("registers the Babylon glTF loader plugin", () => {
    expect(SceneLoader.IsPluginForExtensionAvailable(".glb")).toBe(true);
    expect(SceneLoader.IsPluginForExtensionAvailable(".gltf")).toBe(true);
  });
});
