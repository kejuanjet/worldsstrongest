import { Scalar } from "@babylonjs/core";
import {
  applyHairChange,
  spawnDustSettle,
  spawnGroundRock,
  spawnLightningBolt,
} from "./TransformationEffects.js";
import { VOICE_MAP } from "./TransformationProfiles.js";

export async function runTransformationTimeline(deps, slot, characterId, transformId, position, profile) {
  const originalCameraRadius = deps.camera?.radius ?? 18;

  // AnimationController already owns transform animation dispatch via registry events.
  // Do not trigger it again here or the sequence can double-play when this timeline is wired in.
  deps.audio?.play("sfx_ki_charge", { loop: false, volume: 0.9 });

  await runBuildupPhase(deps, slot, position, profile, originalCameraRadius);

  if (profile.screechMs > 0) {
    const voiceId = VOICE_MAP[characterId]?.[transformId] ?? null;
    if (voiceId) deps.audio?.play(voiceId, { volume: 1.0 });
    deps.impactFX?._triggerScreenShake(profile.shakeMagnitude, profile.screechMs / 1000);
    await wait(profile.screechMs);
  }

  await runBurstPhase(deps, slot, transformId, position, profile);
  await runLandPhase(deps, transformId, position, profile, originalCameraRadius);

  deps.postFX?.setDistortion(getFormDistortion(transformId));
  console.log(`[TransformSeq] Slot ${slot} sequence complete: ${profile.label}`);
}

async function runBuildupPhase(deps, slot, position, profile, originalCameraRadius) {
  const buildupStart = performance.now();

  const phaseInterval = setInterval(() => {
    const elapsed = (performance.now() - buildupStart) / profile.buildupMs;
    const progress = Math.min(1, elapsed);

    deps.auraSystem?.boostAura(slot, 1 + progress * 4, 0.1);

    if (profile.screenDistort > 0) {
      deps.postFX?.setDistortion(progress * profile.screenDistort * 0.6);
    }

    deps.postFX?.setBloom(1.0 + progress * (profile.bloomPeak - 1.0) * 0.7);

    if (deps.camera && profile.cameraZoomOut > 1) {
      const targetRadius = originalCameraRadius * profile.cameraZoomOut;
      deps.camera.radius = Scalar.Lerp(originalCameraRadius, targetRadius, progress);
    }

    if (profile.shakeRampUp) {
      const magnitude = profile.shakeMagnitude * progress * 0.5;
      deps.impactFX?._triggerScreenShake(magnitude, 0.12);
    }

    if (profile.groundRockCount > 0 && Math.random() < 0.15) {
      spawnGroundRock(deps.scene, position);
    }

    if (profile.lightningStorms > 0 && Math.random() < 0.08) {
      spawnLightningBolt(deps.scene, position);
    }
  }, 60);

  await wait(profile.buildupMs);
  clearInterval(phaseInterval);
}

async function runBurstPhase(deps, slot, transformId, position, profile) {
  deps.postFX?.setDistortion(profile.screenDistort);
  deps.postFX?.triggerWhiteFlash(profile.burstMs / 1000);
  deps.postFX?.setBloom(profile.bloomPeak);
  deps.postFX?.triggerMotionBlur(0.8);

  deps.auraSystem?.setTransform(slot, transformId, true, () => {
    applyHairChange(slot, transformId);
  });

  deps.impactFX?._triggerScreenShake(profile.shakeMagnitude, 0.4);
  if (profile.groundRockCount > 0) {
    for (let i = 0; i < 3; i++) {
      setTimeout(() => spawnGroundRock(deps.scene, position, true), i * 80);
    }
  }

  if (profile.shakeMagnitude > 0.3) {
    deps.impactFX?.playLandingImpact(position, 20 + profile.shakeMagnitude * 30);
  }

  deps.audio?.play("sfx_transform", { volume: 1.0 });
  await wait(profile.burstMs);
}

async function runLandPhase(deps, transformId, position, profile, originalCameraRadius) {
  if (deps.camera) {
    const target = originalCameraRadius;
    const start = deps.camera.radius;
    const startedAt = performance.now();
    const zoomBack = () => {
      const t = Math.min(1, (performance.now() - startedAt) / profile.landMs);
      deps.camera.radius = Scalar.Lerp(start, target, easeOutCubic(t));
      if (t < 1) requestAnimationFrame(zoomBack);
    };
    requestAnimationFrame(zoomBack);
  }

  deps.postFX?.onTransformation(transformId ?? "BASE");
  spawnDustSettle(deps.scene, position);

  if (profile.lightningStorms >= 4) {
    for (let i = 0; i < profile.lightningStorms; i++) {
      setTimeout(() => spawnLightningBolt(deps.scene, position), i * 80);
    }
  }

  await wait(profile.landMs);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function getFormDistortion(transformId) {
  const map = { SSJ3: 0.7, SSB: 0.5, SSBE: 0.85, SSJ2: 0, SSJ1: 0, BASE: 0 };
  return map[transformId] ?? 0;
}
