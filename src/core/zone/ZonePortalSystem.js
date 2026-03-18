import {
  Color3,
  Color4,
  MeshBuilder,
  ParticleSystem,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core";

export class ZonePortalSystem {
  constructor(scene) {
    this.scene = scene;
    this.portalEffects = new Map();
    this._lastPortalCheck = 0;
  }

  spawn(def, zoneRoot) {
    this.clear();

    for (const [index, portal] of def.portals.entries()) {
      const portalKey = `${portal.targetZone}:${index}`;
      const disc = MeshBuilder.CreateDisc(
        `portal_${portalKey}`,
        { radius: portal.radius, tessellation: 32 },
        this.scene
      );
      disc.position = portal.position.clone();
      disc.rotation.x = Math.PI / 2;
      disc.parent = zoneRoot;

      const material = new StandardMaterial(`portalMat_${portalKey}`, this.scene);
      material.emissiveColor = new Color3(0.2, 0.6, 1.0);
      material.alpha = 0.65;
      disc.material = material;

      const ps = new ParticleSystem(`portalPS_${portalKey}`, 80, this.scene);
      ps.emitter = portal.position.clone();
      ps.minEmitBox = new Vector3(-portal.radius, 0, -portal.radius);
      ps.maxEmitBox = new Vector3(portal.radius, 0, portal.radius);
      ps.color1 = new Color4(0.3, 0.7, 1.0, 1.0);
      ps.color2 = new Color4(1.0, 1.0, 1.0, 0.5);
      ps.colorDead = new Color4(0, 0, 0, 0);
      ps.minSize = 0.1;
      ps.maxSize = 0.4;
      ps.minLifeTime = 0.5;
      ps.maxLifeTime = 1.5;
      ps.emitRate = 40;
      ps.direction1 = new Vector3(-0.5, 2, -0.5);
      ps.direction2 = new Vector3(0.5, 4, 0.5);
      ps.minEmitPower = 0.5;
      ps.maxEmitPower = 1.5;
      ps.updateSpeed = 0.02;
      ps.start();

      this.portalEffects.set(portalKey, ps);
    }
  }

  update(def, players = [], onTriggered) {
    const now = performance.now();
    if (now - this._lastPortalCheck < 200) return false;
    this._lastPortalCheck = now;

    for (const portal of def.portals) {
      for (const player of players) {
        const distance = Vector3.Distance(player.position, portal.position);
        if (distance < portal.radius) {
          onTriggered?.({ playerId: player.id, targetZone: portal.targetZone, portal });
          return true;
        }
      }
    }

    return false;
  }

  clear() {
    for (const [, ps] of this.portalEffects) {
      ps.dispose();
    }
    this.portalEffects.clear();
  }
}
