import { Quaternion } from "@babylonjs/core";
import { describe, expect, it, vi } from "vitest";
import { ANIM_STATE } from "./AnimationData.js";
import { CharacterAnimator } from "./CharacterAnimator.js";

function makeGroup(name: string): any {
  return {
    name,
    targetedAnimations: [],
    metadata: {},
    weight: 0,
    speedRatio: 1,
    isPlaying: false,
    stop() {
      this.isPlaying = false;
    },
    play(loop: boolean) {
      this.isPlaying = true;
      this.loop = loop;
      return this;
    },
    dispose() {
      this.disposed = true;
    },
  };
}

describe("CharacterAnimator hot-swap behavior", () => {
  it("restores a requested state once the replacement asset contains it", () => {
    const previewAsset = {
      animGroups: [makeGroup("Idle")],
      skeletons: [],
    };
    const animator = new CharacterAnimator("GOKU", previewAsset as any);

    animator.transition(ANIM_STATE.RUN);
    expect(animator.currentState).toBe(ANIM_STATE.IDLE);
    expect(animator.captureRuntimeState().requestedState).toBe(ANIM_STATE.RUN);

    const fullAsset = {
      animGroups: [makeGroup("Idle"), makeGroup("running")],
      skeletons: [],
    };
    animator.replaceModelAsset(fullAsset as any);

    expect(animator.currentState).toBe(ANIM_STATE.RUN);
    expect(animator.captureRuntimeState().requestedState).toBe(ANIM_STATE.RUN);
  });

  it("cancels a pending one-shot without firing its completion callback", () => {
    const asset = {
      animGroups: [makeGroup("Idle"), makeGroup("Hook Punch")],
      skeletons: [],
    };
    const animator = new CharacterAnimator("GOKU", asset as any);
    const onComplete = vi.fn();

    animator.playLightAttack(onComplete);
    expect(animator.currentState).toBe(ANIM_STATE.ATTACK_LIGHT_1);

    animator.cancelPendingOneShot();
    animator.transition(ANIM_STATE.IDLE, { forceRestart: true });
    animator.update(1);

    expect(onComplete).not.toHaveBeenCalled();
    expect(animator.oneShotCallback).toBeNull();
    expect(animator.currentState).toBe(ANIM_STATE.IDLE);
  });

  it("removes unsafe visibility and root transform tracks from imported groups", () => {
    const group = makeGroup("Idle");
    group.targetedAnimations = [
      {
        target: { name: "__root__", parent: null, visibility: 1 },
        animation: { targetPropertyPath: "visibility" },
      },
      {
        target: { name: "Armature", parent: null, rotationQuaternion: Quaternion.Identity() },
        animation: { targetPropertyPath: "rotationQuaternion" },
      },
      {
        target: { name: "Spine", parent: { name: "Armature" } },
        animation: { targetPropertyPath: "rotationQuaternion" },
      },
    ];

    new CharacterAnimator("GOKU", { animGroups: [group], skeletons: [] } as any);

    expect(group.targetedAnimations).toHaveLength(1);
    expect(group.targetedAnimations[0]?.target?.name).toBe("Spine");
  });
});
