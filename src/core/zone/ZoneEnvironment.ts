import { Color3, Color4, Vector3, type Scene } from "@babylonjs/core";

export interface ZoneEnvironmentDef {
  gravity: number;
  ambientColor: Color3;
}

export function applyZoneEnvironment(scene: Scene, def: ZoneEnvironmentDef): void {
  scene.gravity = new Vector3(0, def.gravity, 0);

  const ambient = scene.getLightByName("hemiLight");
  if (ambient) {
    ambient.diffuse = Color3.Lerp(def.ambientColor, Color3.White(), 0.2);
    if ("groundColor" in ambient && ambient.groundColor) {
      ambient.groundColor = Color3.Lerp(new Color3(0.05, 0.07, 0.12), def.ambientColor, 0.35);
    }
  }

  scene.metadata = {
    ...(scene.metadata ?? {}),
    zoneEnvironment: {
      ...(scene.metadata?.zoneEnvironment ?? {}),
      gravity: def.gravity,
      ambientColor: {
        r: def.ambientColor.r,
        g: def.ambientColor.g,
        b: def.ambientColor.b,
      },
    },
  };

  scene.clearColor = new Color4(
    def.ambientColor.r * 0.3,
    def.ambientColor.g * 0.3,
    def.ambientColor.b * 0.5,
    1,
  );
}
