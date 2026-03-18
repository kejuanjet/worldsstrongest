import { Color4, ParticleSystem, Vector3 } from "@babylonjs/core";

export function spawnGroundRock(scene, position, explode = false) {
  const ps = new ParticleSystem(`rock_${Date.now()}`, 20, scene);
  ps.emitter = new Vector3(
    position.x + (Math.random() - 0.5) * 6,
    position.y,
    position.z + (Math.random() - 0.5) * 6
  );
  ps.color1 = new Color4(0.5, 0.45, 0.38, 1);
  ps.color2 = new Color4(0.3, 0.28, 0.22, 0.8);
  ps.colorDead = new Color4(0, 0, 0, 0);
  ps.minSize = 0.06;
  ps.maxSize = 0.28;
  ps.minLifeTime = 0.5;
  ps.maxLifeTime = 1.8;
  ps.emitRate = 0;
  ps.manualEmitCount = 20;
  ps.direction1 = explode ? new Vector3(-6, 8, -6) : new Vector3(-1, 4, -1);
  ps.direction2 = explode ? new Vector3(6, 18, 6) : new Vector3(1, 8, 1);
  ps.minEmitPower = explode ? 8 : 2;
  ps.maxEmitPower = explode ? 18 : 6;
  ps.updateSpeed = 0.02;
  ps.gravity = new Vector3(0, -18, 0);
  ps.disposeOnStop = true;
  ps.start();

  setTimeout(() => ps.dispose?.(), 2000);
}

export function spawnLightningBolt(scene, position) {
  const ps = new ParticleSystem(`lightning_${Date.now()}`, 30, scene);
  ps.emitter = new Vector3(
    position.x + (Math.random() - 0.5) * 4,
    position.y + 1 + Math.random() * 2,
    position.z + (Math.random() - 0.5) * 4
  );
  ps.color1 = new Color4(0.8, 0.9, 1.0, 1.0);
  ps.color2 = new Color4(1.0, 1.0, 0.6, 0.8);
  ps.colorDead = new Color4(0, 0, 0, 0);
  ps.minSize = 0.02;
  ps.maxSize = 0.08;
  ps.minLifeTime = 0.03;
  ps.maxLifeTime = 0.1;
  ps.emitRate = 0;
  ps.manualEmitCount = 30;
  ps.direction1 = new Vector3(-5, -1, -5);
  ps.direction2 = new Vector3(5, 1, 5);
  ps.minEmitPower = 6;
  ps.maxEmitPower = 14;
  ps.updateSpeed = 0.01;
  ps.blendMode = ParticleSystem.BLENDMODE_ADD;
  ps.disposeOnStop = true;
  ps.start();

  setTimeout(() => ps.dispose?.(), 200);
}

export function spawnDustSettle(scene, position) {
  const ps = new ParticleSystem(`dust_${Date.now()}`, 60, scene);
  ps.emitter = new Vector3(position.x, position.y + 0.1, position.z);
  ps.color1 = new Color4(0.7, 0.65, 0.55, 0.5);
  ps.color2 = new Color4(0.5, 0.48, 0.4, 0.2);
  ps.colorDead = new Color4(0, 0, 0, 0);
  ps.minSize = 0.3;
  ps.maxSize = 1.2;
  ps.minLifeTime = 1.0;
  ps.maxLifeTime = 2.5;
  ps.emitRate = 0;
  ps.manualEmitCount = 60;
  ps.direction1 = new Vector3(-3, 0.2, -3);
  ps.direction2 = new Vector3(3, 1.0, 3);
  ps.minEmitPower = 1;
  ps.maxEmitPower = 4;
  ps.updateSpeed = 0.02;
  ps.gravity = new Vector3(0, -0.5, 0);
  ps.disposeOnStop = true;
  ps.start();

  setTimeout(() => ps.dispose?.(), 3000);
}

export function applyHairChange(slot, transformId) {
  import("../Debug.ts")
    .then(({ dlog }) => dlog(`[TransformSeq] Hair change → slot ${slot}: ${transformId}`))
    .catch(() => {});

  try {
    const ev = new CustomEvent("dbz:applyTransformMesh", { detail: { slot, transformId } });
    if (typeof window !== "undefined" && window.dispatchEvent) {
      window.dispatchEvent(ev);
    }
  } catch {}
}
