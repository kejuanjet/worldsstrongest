const MAX_BOOT_PRELOAD_MS = 1500;

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
      import("../CharacterRegistry.js"),
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

async function preloadBootEssentials({ loader, gameLoop, SaveGameStore, setLoadingText }) {
  let essentialsSettled = false;
  setLoadingText?.("Preloading essentials...");

  const essentialsPromise = loader.loadEssentials()
    .then(() => {
      essentialsSettled = true;
      console.log("[main] loadEssentials completed");
      gameLoop.audioManager.buildPools();
      const profile = new SaveGameStore().load("default");
      const prewarmIds = [
        profile.selectedCharacterId ?? "AYO",
        "RAYNE",
      ];
      void gameLoop.animationController.prewarmCharacterSet(prewarmIds).catch((error) => {
        console.warn("[main] Animation prewarm failed (non-fatal):", error);
      });
    })
    .catch((error) => {
      essentialsSettled = true;
      console.warn("[main] Some assets failed to load (non-fatal):", error);
    })
    .finally(() => {
      if (typeof loader.loadBackground === "function") {
        loader.loadBackground();
      } else if (typeof loader.voidBackgroundLoad === "function") {
        loader.voidBackgroundLoad();
      }
    });

  await Promise.race([
    essentialsPromise,
    new Promise((resolve) => setTimeout(resolve, MAX_BOOT_PRELOAD_MS)),
  ]);

  if (!essentialsSettled) {
    setLoadingText?.("Finishing setup in background...");
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