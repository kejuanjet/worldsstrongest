import type { Scene, Vector3 } from "@babylonjs/core";
// @ts-ignore – JS modules pending TS migration
import { SEQUENCE_PROFILES } from "./transformation/TransformationProfiles.js";
// @ts-ignore
import { runTransformationTimeline } from "./transformation/TransformationTimeline.js";

// Dependency references kept as `any` / loose types because those subsystems
// are not yet typed. Add proper interfaces here as each system is migrated.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySubsystem = any;

export interface TransformationSequenceDeps {
  scene: Scene;
  auraSystem: AnySubsystem;
  impactFX: AnySubsystem;
  postProcessing: AnySubsystem;
  animCtrl: AnySubsystem;
  audio: AnySubsystem;
  camera: AnySubsystem;
}

export class TransformationSequence {
  private readonly scene: Scene;
  private readonly auraSystem: AnySubsystem;
  private readonly impactFX: AnySubsystem;
  private readonly postFX: AnySubsystem;
  private readonly animCtrl: AnySubsystem;
  private readonly audio: AnySubsystem;
  private readonly camera: AnySubsystem;
  private readonly _activeSequences = new Set<number>();

  public constructor(deps: TransformationSequenceDeps) {
    this.scene = deps.scene;
    this.auraSystem = deps.auraSystem;
    this.impactFX = deps.impactFX;
    this.postFX = deps.postProcessing;
    this.animCtrl = deps.animCtrl;
    this.audio = deps.audio;
    this.camera = deps.camera;
  }

  public isTransforming(slot: number): boolean {
    return this._activeSequences.has(slot);
  }

  public async playSequence(
    slot: number,
    characterId: string,
    transformId: string | null,
    position: Vector3,
  ): Promise<void> {
    if (this._activeSequences.has(slot)) return;
    this._activeSequences.add(slot);

    const profile =
      SEQUENCE_PROFILES[transformId ?? "REVERT"] ?? SEQUENCE_PROFILES.SSJ1;
    console.log(`[TransformSeq] Slot ${slot}: ${profile.label}`);

    try {
      await runTransformationTimeline(
        {
          scene: this.scene,
          auraSystem: this.auraSystem,
          impactFX: this.impactFX,
          postFX: this.postFX,
          animCtrl: this.animCtrl,
          audio: this.audio,
          camera: this.camera,
          slot,
        },
        slot,
        characterId,
        transformId,
        position,
        profile,
      );
    } finally {
      this._activeSequences.delete(slot);
    }
  }
}
