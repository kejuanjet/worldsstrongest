const MAX_BOOT_PRELOAD_MS = 1500;

function startBackgroundAssetLoad(loader) {
  if (typeof loader.loadBackground === "function") {
    loader.loadBackground();
    return;
  }

  if (typeof loader.voidBackgroundLoad === "function") {
    loader.voidBackgroundLoad();
  }
}

export async function preloadBootEssentials({ loader, gameLoop, SaveGameStore, setLoadingText }) {
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
      startBackgroundAssetLoad(loader);
    });

  await Promise.race([
    essentialsPromise,
    new Promise((resolve) => setTimeout(resolve, MAX_BOOT_PRELOAD_MS)),
  ]);

  if (!essentialsSettled) {
    setLoadingText?.("Finishing setup in background...");
  }
}
