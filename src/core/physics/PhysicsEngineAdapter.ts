import { HavokPlugin, Vector3, type Scene } from "@babylonjs/core";

type PhysicsPluginLike = Exclude<Parameters<Scene["enablePhysics"]>[1], null | undefined>;

export async function initPhysicsEngine(scene: Scene): Promise<PhysicsPluginLike | null> {
  try {
    const havokModuleId = "@babylonjs/havok";
    const havokModule = await import(/* @vite-ignore */ havokModuleId);
    const createHavok = havokModule.default as (() => Promise<unknown>) | undefined;
    if (!createHavok) {
      throw new Error("Havok module did not expose a default factory.");
    }

    const havok = await createHavok();
    const plugin = new HavokPlugin(true, havok) as PhysicsPluginLike;
    scene.enablePhysics(new Vector3(0, -18, 0), plugin);
    console.log("[PhysicsWorld] Havok initialized.");
    return plugin;
  } catch (err) {
    console.error("[PhysicsWorld] Havok failed to load; using fallback physics.", err);
    return initFallbackPhysics(scene);
  }
}

export function initFallbackPhysics(scene: Scene): PhysicsPluginLike | null {
  try {
    // Cannon.js is an optional legacy fallback; dynamic require keeps it out
    // of the main bundle and avoids TypeScript errors on the missing type defs.
     
    const { CannonJSPlugin } = require("@babylonjs/core") as {
      CannonJSPlugin: new (...args: unknown[]) => unknown;
    };
     
    const CANNON = require("cannon") as unknown;
    const plugin = new CannonJSPlugin(true, 10, CANNON) as PhysicsPluginLike;
    scene.enablePhysics(new Vector3(0, -18, 0), plugin);
    console.log("[PhysicsWorld] Cannon.js fallback active.");
    return plugin;
  } catch {
    console.warn("[PhysicsWorld] No physics engine available; collision disabled.");
    return null;
  }
}
