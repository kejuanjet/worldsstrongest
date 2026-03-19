import { preloadBootEssentials } from "./BootEssentials.js";

async function loadBootstrapDependencies(log) {
  try {
    const [
      gameLoopModule,
      engineModule,
      _loadersModule,
      characterModule,
      zoneModule,
      saveModule,
    ] = await Promise.all([
      import("../GameLoop.js"),
      import("../engine.js"),
      import("@babylonjs/loaders"),
      import("../../data/CharacterRoster.js"),
      import("../ZoneManager.js"),
      import("../../save/SaveGameStore.js"),
    ]);

    return {
      GameLoopClass: gameLoopModule.GameLoop,
      initAssetLoader: engineModule.initAssetLoader,
      CHARACTER_ROSTER: characterModule.CHARACTER_ROSTER,
      ZONE_REGISTRY: zoneModule.ZONE_REGISTRY,
      SaveGameStore: saveModule.SaveGameStore,
    };
  } catch (error) {
    log?.error?.("core module load failed:", error);
    throw new Error(`Core module load failed: ${error?.message ?? error}`);
  }
}

export async function bootstrapGameRuntime({ log, setLoadingText }) {
  setLoadingText?.("Loading core modules...");
  const bootstrapDeps = await loadBootstrapDependencies(log);

  setLoadingText?.("Loading game data...");
  log?.debug?.("initializing asset loader...");
  const loader = await bootstrapDeps.initAssetLoader();
  log?.debug?.("asset loader initialized");

  setLoadingText?.("Building combat systems...");
  const gameLoop = new bootstrapDeps.GameLoopClass();
  console.log("[main] GameLoop created");

  await preloadBootEssentials({
    loader,
    gameLoop,
    SaveGameStore: bootstrapDeps.SaveGameStore,
    setLoadingText,
  });

  return {
    gameLoop,
    CHARACTER_ROSTER: bootstrapDeps.CHARACTER_ROSTER,
    ZONE_REGISTRY: bootstrapDeps.ZONE_REGISTRY,
    SaveGameStore: bootstrapDeps.SaveGameStore,
  };
}