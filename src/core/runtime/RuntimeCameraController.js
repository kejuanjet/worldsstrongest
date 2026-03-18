import { Scalar, Vector3, Ray } from "@babylonjs/core";
import { CONFIG } from "../../config/index.js";

export class RuntimeCameraController {
  constructor(camera, registry, inputManager) {
    this.camera = camera;
    this.registry = registry;
    this.inputManager = inputManager;
    this._shakeTimer = 0;
    this._shakeDuration = 0.2;
    this._shakeMag = 0;
    this._skipLerpFrames = 0;

    this._springVel = new Vector3(0, 0, 0);
    this._springPosError = new Vector3(0, 0, 0);
    this._springLastError = new Vector3(0, 0, 0);
    this._springAlphaVel = 0;
    this._springBetaVel = 0;
    this._springZoomVel = 0;

    this._bobPhase = 0;
    this._swayPhase = 0;
    this._rollPhase = 0;
    this._lastSpeed = 0;
    this._collisionOffset = new Vector3(0, 0, 0);
    this._collisionTimer = 0;
    this._collisionCheckInterval = 1 / Math.max(1, CONFIG.performance?.cameraCollisionHz ?? 18);
    this._cachedCollisionRadius = null;

    this._playerAnchor = Vector3.Zero();
    this._lookAhead = Vector3.Zero();
    this._target = Vector3.Zero();
    this._enemyAnchor = Vector3.Zero();
    this._midpoint = Vector3.Zero();
    this._attackerAnchor = Vector3.Zero();
    this._victimAnchor = Vector3.Zero();
    this._tempVec3 = Vector3.Zero();
    this._tempVec32 = Vector3.Zero();
    this._tempVec33 = Vector3.Zero();
    this._tempTarget = Vector3.Zero();
    this._lockDiff = Vector3.Zero();
    this._tempRay = Ray.Zero();
  }

  markInitialized() {
    this._skipLerpFrames = 20;
  }

  update(delta, { localSlot, finisherCamera }) {
    const player = this.registry.getState(localSlot);
    if (!player) return finisherCamera ?? null;

    this._playerAnchor.copyFrom(player.position);
    this._playerAnchor.y += CONFIG.camera.verticalOffset;

    const lockedSlot = this.inputManager.lockedTargetSlot;
    const lockedTarget = lockedSlot != null ? this.registry.getState(lockedSlot) : null;
    const speed = Math.sqrt(player.velocity.x ** 2 + player.velocity.z ** 2);
    const lookAheadScale = Math.min(1, speed / 10);
    const lookAheadDistance = player.isFlying
      ? CONFIG.camera.flightLookAhead
      : CONFIG.camera.groundLookAhead;

    if (speed > 0.001) {
      this._tempVec3.copyFromFloats(player.velocity.x / speed, 0, player.velocity.z / speed);
    } else {
      this._tempVec3.set(Math.sin(this.camera.alpha + Math.PI), 0, Math.cos(this.camera.alpha + Math.PI));
    }

    this._lookAhead.copyFrom(this._tempVec3).scaleInPlace(lookAheadDistance * lookAheadScale);
    this._target.copyFrom(this._playerAnchor).addInPlace(this._lookAhead);

    let desiredAlpha = this.camera.alpha;
    let desiredBeta = Scalar.Lerp(this.camera.beta, CONFIG.camera.defaultBeta, Math.min(1, delta * 5));
    let desiredRadius = CONFIG.camera.defaultRadius;
    let nextFinisherCamera = finisherCamera ?? null;

    if (nextFinisherCamera?.timer > 0) {
      nextFinisherCamera = this._applyFinisherCamera(delta, nextFinisherCamera) ?? null;
      if (nextFinisherCamera) {
        const attacker = this.registry.getState(nextFinisherCamera.attackerSlot);
        const targetState = this.registry.getState(nextFinisherCamera.targetSlot);
        if (attacker && targetState) {
          const progress = 1 - (nextFinisherCamera.timer / nextFinisherCamera.duration);
          this._attackerAnchor.copyFrom(attacker.position);
          this._attackerAnchor.y += 2.2;
          this._victimAnchor.copyFrom(targetState.position);
          this._victimAnchor.y += 2.0;
          this._midpoint.copyFrom(this._attackerAnchor).addInPlace(this._victimAnchor).scaleInPlace(0.5);
          this._tempVec32.copyFrom(this._victimAnchor).subtractInPlace(this._attackerAnchor);
          const baseAlpha = Math.atan2(this._tempVec32.x, this._tempVec32.z) + Math.PI * 0.68;
          this._target.copyFrom(this._midpoint);
          desiredAlpha = baseAlpha + Scalar.Lerp(-0.18, 0.28, progress);
          desiredBeta = 1.02 - Math.sin(progress * Math.PI) * 0.12;
          desiredRadius = 3.9 + Math.sin(progress * Math.PI) * 0.9;
        }
      }
    }

    const validLockedTarget = this._getValidLockedTarget(player, lockedTarget);
    if (!nextFinisherCamera && validLockedTarget) {
      this._enemyAnchor.copyFrom(validLockedTarget.position);
      this._enemyAnchor.y += CONFIG.camera.lockOnOffsetY;
      this._midpoint.copyFrom(this._playerAnchor).scaleInPlace(0.58);
      this._tempVec32.copyFrom(this._enemyAnchor).scaleInPlace(0.42);
      this._midpoint.addInPlace(this._tempVec32);
      const clampedY = Scalar.Clamp(
        this._midpoint.y,
        this._playerAnchor.y - CONFIG.camera.lockOnVerticalClamp,
        this._playerAnchor.y + CONFIG.camera.lockOnVerticalClamp,
      );
      this._target.set(this._midpoint.x, clampedY, this._midpoint.z);
      this._lockDiff.copyFrom(validLockedTarget.position).subtractInPlace(player.position);
      this._lockDiff.y = 0;
      const horizontalDistance = Math.sqrt(this._lockDiff.x ** 2 + this._lockDiff.z ** 2);
      desiredAlpha = Math.atan2(this._lockDiff.x, this._lockDiff.z) + Math.PI;
      desiredBeta = CONFIG.camera.lockOnBeta;
      desiredRadius = Scalar.Clamp(
        horizontalDistance * CONFIG.camera.lockOnRadiusScale + CONFIG.camera.lockOnRadiusPadding,
        Math.max(CONFIG.camera.minRadius + 1.4, CONFIG.camera.defaultRadius - 0.15),
        CONFIG.camera.maxRadius,
      );
    } else if (!nextFinisherCamera) {
      desiredRadius = Scalar.Clamp(
        CONFIG.camera.defaultRadius + Math.min(CONFIG.camera.speedZoomRange, speed * 0.08),
        CONFIG.camera.minRadius,
        CONFIG.camera.maxRadius,
      );
      desiredBeta = Scalar.Clamp(
        CONFIG.camera.defaultBeta - Math.min(0.08, speed * 0.004),
        CONFIG.camera.minBeta,
        CONFIG.camera.maxBeta,
      );
    }

    const shoulderAmount = validLockedTarget
      ? CONFIG.camera.lockOnShoulderOffset
      : CONFIG.camera.shoulderOffset;
    if (shoulderAmount > 0.01) {
      const shoulderAlpha = validLockedTarget ? desiredAlpha : this.camera.alpha;
      this._target.x += Math.cos(shoulderAlpha) * shoulderAmount;
      this._target.z += Math.sin(shoulderAlpha) * shoulderAmount;
    }

    const skipSpring = this._skipLerpFrames > 0;
    if (skipSpring) this._skipLerpFrames -= 1;

    this._updateSpring(this._target, desiredAlpha, desiredBeta, desiredRadius, delta, skipSpring, !!validLockedTarget);
    this._resolveCameraCollision(delta);
    this._applyCinematicMotion(delta, speed, player.isFlying);

    this.camera.fov = Scalar.Lerp(
      CONFIG.camera.fovMin,
      CONFIG.camera.fovMax,
      Math.min(1, this._lastSpeed * CONFIG.camera.fovSpeedRamp),
    );

    if (this._shakeTimer > 0) {
      this._shakeTimer -= delta;
      const t = Math.max(0, this._shakeTimer / this._shakeDuration);
      const magnitude = this._shakeMag * t * t;
      this.camera.target.x += (Math.random() - 0.5) * 2 * magnitude;
      this.camera.target.y += (Math.random() - 0.5) * 2 * magnitude * 0.35;
      this.camera.target.z += (Math.random() - 0.5) * 2 * magnitude;
    }

    this._lastSpeed = speed;
    return nextFinisherCamera;
  }

  _updateSpring(target, desiredAlpha, desiredBeta, desiredRadius, delta, skipSpring, isLockedOn = false) {
    const cfg = CONFIG.camera;

    if (skipSpring) {
      this.camera.setTarget(target);
      this.camera.alpha = desiredAlpha;
      this.camera.beta = Scalar.Clamp(desiredBeta, cfg.minBeta, cfg.maxBeta);
      this.camera.radius = Scalar.Clamp(desiredRadius, cfg.minRadius, cfg.maxRadius);
      this._springVel.setAll(0);
      this._springAlphaVel = 0;
      return;
    }

    const followT = 1 - Math.exp(-cfg.followSpeed * delta);
    const activeRotSpeed = isLockedOn ? cfg.lockOnSpeed : cfg.rotationLerpSpeed;
    const rotT = 1 - Math.exp(-activeRotSpeed * delta);
    const zoomT = 1 - Math.exp(-(isLockedOn ? cfg.lockOnSpeed : cfg.zoomLerpSpeed) * delta);

    Vector3.LerpToRef(this.camera.target, target, followT, this._tempTarget);
    this.camera.setTarget(this._tempTarget);

    const alphaDiff = this._angleDiff(desiredAlpha, this.camera.alpha);
    this.camera.alpha += alphaDiff * rotT;
    this.camera.beta = Scalar.Clamp(
      Scalar.Lerp(this.camera.beta, desiredBeta, zoomT),
      cfg.minBeta,
      cfg.maxBeta,
    );
    this.camera.radius = Scalar.Clamp(
      Scalar.Lerp(this.camera.radius, desiredRadius, zoomT),
      cfg.minRadius,
      cfg.maxRadius,
    );
  }

  _resolveCameraCollision(delta) {
    if (this._cachedCollisionRadius != null && this.camera.radius > this._cachedCollisionRadius) {
      this.camera.radius = Scalar.Lerp(this.camera.radius, this._cachedCollisionRadius, 0.22);
    }

    this._collisionTimer += delta;
    if (this._collisionTimer < this._collisionCheckInterval) return;
    this._collisionTimer = 0;

    const scene = this.camera.getScene();
    const targetPos = this.camera.target;
    const camPos = this.camera.position;

    this._tempVec3.copyFrom(camPos).subtractInPlace(targetPos);
    const dist = this._tempVec3.length();
    if (dist < 0.1) return;

    this._tempRay.origin.copyFrom(targetPos);
    this._tempVec32.copyFrom(this._tempVec3).scaleInPlace(1 / dist);
    this._tempRay.direction.copyFrom(this._tempVec32);
    this._tempRay.length = dist;

    const hit = scene.pickWithRay(this._tempRay, (mesh) => mesh.isPickable);
    if (hit?.hit && hit.distance < dist - CONFIG.camera.collisionMargin) {
      const safeRadius = Math.max(CONFIG.camera.minRadius, hit.distance - CONFIG.camera.collisionMargin);
      this._cachedCollisionRadius = safeRadius;
      this.camera.radius = Scalar.Lerp(this.camera.radius, safeRadius, 0.35);
    } else {
      this._cachedCollisionRadius = null;
    }
  }

  _applyCinematicMotion(delta, speed, isFlying) {
    if (speed < 0.5) return;

    const speedT = Math.min(1, speed * 0.12);
    this._bobPhase += delta * (isFlying ? CONFIG.camera.bobFreqFlight : CONFIG.camera.bobFreqGround) * speedT;
    this._swayPhase += delta * CONFIG.camera.swayFreq * speedT;
    const bob = Math.sin(this._bobPhase) * CONFIG.camera.bobAmp * speedT;
    this.camera.radius += bob;
  }

  centerOnSlot(localSlot) {
    const state = this.registry.getState(localSlot);
    if (!state) return;
    this.camera.alpha = CONFIG.camera.defaultAlpha;
    this.camera.beta = CONFIG.camera.defaultBeta;
    this.camera.radius = CONFIG.camera.defaultRadius;
    this._tempTarget.copyFrom(state.position);
    this._tempTarget.y += CONFIG.camera.verticalOffset;
    this.camera.setTarget(this._tempTarget);
    this._springVel.setAll(0);
    this._springAlphaVel = 0;
    this._springBetaVel = 0;
    this._springZoomVel = 0;
  }

  triggerShake(magnitude, duration) {
    if (magnitude > this._shakeMag || this._shakeTimer <= 0) {
      this._shakeMag = magnitude;
      this._shakeDuration = duration;
      this._shakeTimer = duration;
    }
  }

  getListenerPosition(localSlot) {
    const player = this.registry.getState(localSlot);
    return player?.position ?? Vector3.Zero();
  }

  _applyFinisherCamera(delta, finisherCamera) {
    const next = { ...finisherCamera };
    next.timer = Math.max(0, next.timer - delta);
    return next.timer > 0 ? next : null;
  }

  _angleDiff(a, b) {
    let diff = a - b;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return diff;
  }

  _getValidLockedTarget(player, target) {
    if (!target || target.isDead) {
      this._clearLockTarget();
      return null;
    }

    this._lockDiff.copyFrom(target.position).subtractInPlace(player.position);
    this._lockDiff.y = 0;
    const horizontalDistance = Math.sqrt(this._lockDiff.x ** 2 + this._lockDiff.z ** 2);
    if (horizontalDistance > CONFIG.camera.lockOnBreakDistance) {
      this._clearLockTarget();
      return null;
    }

    return target;
  }

  _clearLockTarget() {
    if (this.inputManager.lockedTargetSlot == null) return;
    if (this.inputManager?.lockOnSystem) {
      this.inputManager.lockOnSystem.clearLock();
    } else {
      this.inputManager.lockedTargetSlot = null;
      this.inputManager.onLockTargetChanged?.(null);
    }
  }
}
