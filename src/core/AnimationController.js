// src/core/AnimationController.js
// Orchestrates animation playback per character slot.
// CharacterAnimator owns per-character state-machine playback.
// AnimationRetargeter owns clip retargeting and clone management.

import { Scalar } from "@babylonjs/core";
import { CONFIG } from "./index.js";
import { ANIM_STATE, buildAnimationNameMap } from "./animation/AnimationData.js";
import { CharacterAnimator } from "./animation/CharacterAnimator.js";
import { AnimationRetargeter } from "./animation/AnimationRetargeter.js";

export { ANIM_STATE } from "./animation/AnimationData.js";

export class AnimationController {
  /**
   * @param {import("@babylonjs/core").Scene} scene
   * @param {import("./CharacterRegistry").CharacterRegistry} registry
   * @param {import("./AssetLoader").AssetLoader | null} [assetLoader]
   */
  constructor(scene, registry, assetLoader = null) {
    this.scene = scene;
    this.registry = registry;
    this.assetLoader = assetLoader;
    this._retargeter = new AnimationRetargeter(assetLoader);
    /** @type {Map<number, CharacterAnimator>} */
    this._animators = new Map();
    /** @type {Array<() => void>} */
    this._registryUnsubs = [];
    this._wireRegistryEvents();
  }

  _normalizeModelAsset(asset) {
    if (!asset) return null;
    const animGroups =
      asset.animGroups ?? asset.animationGroups ?? asset.container?.animationGroups ?? [];
    const skeletons = asset.skeletons ?? asset.container?.skeletons ?? [];
    if (!animGroups.length && !skeletons.length) {
      return null;
    }
    return { animGroups, skeletons };
  }

  _makeAnimatorAsset(state, characterId) {
    if (state?.animationGroups?.length) {
      return { animGroups: state.animationGroups, skeletons: state.skeletons ?? [] };
    }
    if (!this.assetLoader) return null;
    return this._normalizeModelAsset(
      this.assetLoader.getOrFallback(`char_${characterId.toLowerCase()}`),
    );
  }

  update(delta) {
    for (const [slot, state] of this.registry.slots) {
      if (state && !state.isDead && !this._animators.has(slot)) {
        this.registry.restoreCharacterRenderState?.(state);
      }
    }

    for (const [slot, animator] of this._animators) {
      const state = this.registry.getState(slot);
      if (!state) {
        this._disposeAnimator(slot);
        continue;
      }

      const horizontalSpeed = Math.sqrt(
        state.velocity.x ** 2 + state.velocity.z ** 2,
      );
      const moveSpeedCap = state.isFlying
        ? CONFIG.movement.flightSpeed * (state.characterDef?.baseSpeed ?? 10) / 10
        : CONFIG.movement.groundSpeed * (state.characterDef?.baseSpeed ?? 10) / 10;
      const normSpeed =
        moveSpeedCap > 0.001
          ? Scalar.Clamp(horizontalSpeed / moveSpeedCap, 0, 1.4)
          : 0;
      const inputX =
        Math.abs(state.lastMoveInput?.x ?? 0) > 0.01
          ? state.lastMoveInput.x
          : state.velocity.x;
      const inputZ =
        Math.abs(state.lastMoveInput?.z ?? 0) > 0.01
          ? state.lastMoveInput.z
          : state.velocity.z;

      animator.setLocomotion({
        speed: normSpeed,
        isFlying: state.isFlying,
        isGrounded: state.isGrounded,
        verticalSpeed: state.velocity.y ?? 0,
        inputX,
        inputZ,
        facingYaw: state.rootNode?.rotation?.y ?? 0,
      });
      animator.update(delta);

      if (state.isChargingKi && animator.currentState !== ANIM_STATE.KI_CHARGE) {
        animator.startKiCharge();
      } else if (
        !state.isChargingKi &&
        animator.currentState === ANIM_STATE.KI_CHARGE
      ) {
        animator.stopKiCharge();
      }

      if (
        state.isBlocking &&
        animator.currentState !== ANIM_STATE.BLOCK &&
        animator.currentState !== ANIM_STATE.BLOCK_IDLE
      ) {
        animator.startBlock();
      } else if (
        !state.isBlocking &&
        (animator.currentState === ANIM_STATE.BLOCK ||
          animator.currentState === ANIM_STATE.BLOCK_IDLE)
      ) {
        animator.stopBlock();
      }

      if (state.isDead && animator.currentState !== ANIM_STATE.DEATH) {
        animator.playDeath();
      }

      if (!state.isDead) {
        this.registry.restoreCharacterRenderState?.(state);
      }
    }
  }

  _unlockThen(slot, onComplete) {
    return () => {
      const state = this.registry.getState(slot);
      if (state) state.isActionLocked = false;
      onComplete?.();
    };
  }

  triggerAttackLight(slot, onComplete) {
    const animator = this._animators.get(slot);
    const done = this._unlockThen(slot, onComplete);
    if (!animator) return done();
    animator.playLightAttack(done);
  }

  triggerAttackHeavy(slot, onComplete) {
    const animator = this._animators.get(slot);
    const done = this._unlockThen(slot, onComplete);
    if (!animator) return done();
    animator.playHeavyAttack(done);
  }

  triggerThrow(slot, onComplete) {
    const animator = this._animators.get(slot);
    const done = this._unlockThen(slot, onComplete);
    if (!animator) return done();
    animator.playThrowAttack(done);
  }

  triggerSetAttackVariants(slot, lightStates, heavyStates) {
    this._animators.get(slot)?.setAttackVariants(lightStates, heavyStates);
  }

  triggerKiBlast(slot, onComplete) {
    const animator = this._animators.get(slot);
    const done = this._unlockThen(slot, onComplete);
    if (!animator) return done();
    animator.playKiBlast(done);
  }

  triggerRushCombo(slot, onComplete) {
    const animator = this._animators.get(slot);
    const done = this._unlockThen(slot, onComplete);
    if (!animator) return done();
    animator.playRushCombo(done);
  }

  triggerBeamCharge(slot) {
    this._animators.get(slot)?.startBeamCharge();
  }

  triggerBeamFire(slot, cb) {
    const animator = this._animators.get(slot);
    const done = this._unlockThen(slot, cb);
    if (!animator) return done();
    animator.playBeamFire(done);
  }

  triggerDodge(slot, cb) {
    const animator = this._animators.get(slot);
    const done = this._unlockThen(slot, cb);
    if (!animator) return done();
    animator.playDodge(done);
  }

  triggerHurt(slot, cb) {
    const animator = this._animators.get(slot);
    const done = this._unlockThen(slot, cb);
    if (!animator) return done();
    animator.playHurt(done);
  }

  triggerKnockback(slot, cb) {
    const animator = this._animators.get(slot);
    const done = this._unlockThen(slot, cb);
    if (!animator) return done();
    animator.playKnockback(done);
  }

  triggerVictory(slot, cb) {
    const animator = this._animators.get(slot);
    const unlock = this._unlockThen(slot, cb);
    if (!animator) return unlock();
    animator.playVictory(unlock);
  }

  triggerTransformation(slot, onBuildup, onBurst, onLand) {
    const animator = this._animators.get(slot);
    if (!animator) return;
    animator.playTransformation(
      onBuildup,
      onBurst,
      this._unlockThen(slot, onLand),
    );
  }

  getAnimator(slot) {
    return this._animators.get(slot) ?? null;
  }

  getAverageRetargetMs() {
    return this._retargeter.getAverageRetargetMs?.() ?? 0;
  }

  async prewarmCharacterSet(characterIds = []) {
    const uniqueIds = [...new Set(characterIds.filter(Boolean))];
    if (!uniqueIds.length) return;
    await this._retargeter.prewarmCharacterAnimations?.(uniqueIds);
  }

  _disposeAnimator(slot, { unlockState = false } = {}) {
    const animator = this._animators.get(slot);
    if (!animator) return;
    if (unlockState) {
      const state = this.registry.getState(slot);
      if (state) state.isActionLocked = false;
    }
    try {
      animator.dispose?.();
    } finally {
      this._animators.delete(slot);
    }
  }

  _wireRegistryEvents() {
    this._registryUnsubs.push(
      this.registry.on("onPlayerSpawned", async ({ slot, characterId }) => {
        try {
          await this._buildAnimator(slot, characterId);
        } catch (err) {
          console.warn(
            `[AnimationController] Failed to build animator for slot ${slot} (${characterId}): ${err?.message ?? err}`,
          );
        }
        const state = this.registry.getState(slot);
        const variants = state?.characterDef?.attackAnimVariants;
        if (variants) {
          this.triggerSetAttackVariants(slot, variants.light, variants.heavy);
        }
      }),
    );

    this._registryUnsubs.push(
      this.registry.on("onDamageTaken", (payload) => {
        const slot = payload?.slot;
        const amount = payload?.amount ?? 0;
        const state = this.registry.getState(slot);
        if (!state || state.isDead) return;
        if (amount > 500) this.triggerKnockback(slot);
        else this.triggerHurt(slot);
      }),
    );

    this._registryUnsubs.push(
      this.registry.on("onTransformChanged", (payload) => {
        const slot = payload?.slot;
        const transformId = payload?.transformId ?? payload?.currentTransform?.id ?? null;
        if (!transformId) return;
        this.triggerTransformation(
          slot,
          () => console.log(`[AnimCtrl] Slot ${slot} buildup`),
          () => console.log(`[AnimCtrl] Slot ${slot} burst`),
          () => console.log(`[AnimCtrl] Slot ${slot} landed`),
        );
      }),
    );

    this._registryUnsubs.push(
      this.registry.on("onStanceChanged", (payload) => {
        const slot = payload?.slot;
        const stance = payload?.stance ?? payload?.currentStance ?? "MELEE";
        const animator = this._animators.get(slot);
        if (animator && payload?.wasActionLocked) {
          animator.cancelPendingOneShot?.();
        }
        animator?.switchStance(stance ?? "MELEE");
      }),
    );
  }

  async _buildAnimator(slot, characterId) {
    const state = this.registry.getState(slot);
    const isStillCurrent = () => {
      const current = this.registry.getState(slot);
      return !!current && current === state && current.characterId === characterId;
    };
    const existingAnimator = this._animators.get(slot) ?? null;

    this._retargeter.cleanupClonedGroups(state, slot);

    if (!isStillCurrent()) {
      this._disposeAnimator(slot, { unlockState: true });
      return;
    }

    await this._retargeter.ensurePriorityAnimation(state, characterId);
    if (!isStillCurrent()) {
      this._disposeAnimator(slot, { unlockState: true });
      return;
    }

    const makeAsset = () => this._makeAnimatorAsset(state, characterId);
    if (!existingAnimator && state?.animationGroups?.length && this._hasReadyLocomotionSet(state, characterId)) {
      const preliminaryAnimator = new CharacterAnimator(characterId, makeAsset());
      preliminaryAnimator.setInitialStance(state?.currentStance ?? "MELEE");
      this._animators.set(slot, preliminaryAnimator);
      this.registry.restoreCharacterRenderState?.(state);
      console.log(
        `[AnimationController] Preliminary animator set for slot ${slot} (${characterId})`,
      );
    }

    await this._retargeter.ensureRetargetedAnimations(
      state,
      characterId,
      this._animators.get(slot)?.currentStance ?? state?.currentStance ?? "MELEE",
    );
    if (!isStillCurrent()) {
      this._disposeAnimator(slot, { unlockState: true });
      return;
    }

    const asset = makeAsset();
    const assetId = `char_${characterId.toLowerCase()}`;
    if (!asset) {
      console.warn(
        `[AnimationController] No asset for ${assetId} (slot ${slot}); skipping animator build.`,
      );
      return;
    }

    const animator = this._animators.get(slot);
    if (animator) {
      animator.replaceModelAsset?.(asset);
      this.registry.restoreCharacterRenderState?.(state);
      console.log(
        `[AnimationController] Animator upgraded in place for slot ${slot} (${characterId}) - ${asset.animGroups?.length ?? 0} animation groups`,
      );
      return;
    }

    console.log(
      `[AnimationController] Full asset ${assetId} ready - ${asset.animGroups?.length ?? 0} animation groups`,
    );
    const fullAnimator = new CharacterAnimator(characterId, asset);
    fullAnimator.setInitialStance(state?.currentStance ?? "MELEE");
    this._animators.set(slot, fullAnimator);
    this.registry.restoreCharacterRenderState?.(state);
    console.log(
      `[AnimationController] Full animator created for slot ${slot} (${characterId})`,
    );
  }

  _hasReadyLocomotionSet(state, characterId) {
    const required = ["IDLE", "WALK", "RUN"];
    const available = new Set(
      (state?.animationGroups ?? []).flatMap((group) => {
        const name = group?.name ?? "";
        return [String(name).toLowerCase(), String(name).replace(/[^a-z0-9]+/gi, "").toLowerCase()];
      }),
    );
    return required.every((stateId) => {
      const clipName = this._resolveClipName(characterId, stateId);
      if (!clipName) return false;
      const normalized = clipName.replace(/[^a-z0-9]+/gi, "").toLowerCase();
      return available.has(clipName.toLowerCase()) || available.has(normalized);
    });
  }

  _resolveClipName(characterId, stateId) {
    return buildAnimationNameMap(characterId, "MELEE")[stateId] ?? null;
  }

  dispose() {
    for (const unsub of this._registryUnsubs.splice(0)) {
      try {
        unsub?.();
      } catch (err) {
        console.warn(
          `[AnimationController] Failed to unsubscribe registry listener: ${err?.message ?? err}`,
        );
      }
    }

    for (const slot of [...this._animators.keys()]) {
      this._disposeAnimator(slot, { unlockState: true });
    }
  }
}
