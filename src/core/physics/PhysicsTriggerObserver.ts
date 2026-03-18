import type { IPhysicsEnginePlugin } from "@babylonjs/core";

type CollisionCallback = (slot: number) => void;

export class PhysicsTriggerObserver {
  private readonly plugin: IPhysicsEnginePlugin | null;
  private readonly triggerBodies: Map<string, unknown>;
  private readonly characterBodies: Map<number, unknown>;
  private readonly callbacks: Map<string, CollisionCallback>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _observer: any | null = null;

  public constructor(
    plugin: IPhysicsEnginePlugin | null,
    triggerBodies: Map<string, unknown>,
    characterBodies: Map<number, unknown>,
    callbacks: Map<string, CollisionCallback>,
  ) {
    this.plugin = plugin;
    this.triggerBodies = triggerBodies;
    this.characterBodies = characterBodies;
    this.callbacks = callbacks;
  }

  public attach(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = this.plugin as any;
    if (!p?.onCollisionObservable || this._observer) return;

    this._observer = p.onCollisionObservable.add((event: CollisionEvent) => {
      const idA = event.collidedAgainst?.transformNode?.name ?? "";
      const idB = event.collider?.transformNode?.name ?? "";

      for (const [triggerId] of this.triggerBodies) {
        if (idA !== triggerId && idB !== triggerId) continue;

        const callback = this.callbacks.get(triggerId);
        if (!callback) continue;

        for (const [slot] of this.characterBodies) {
          const capsuleName = `physCapsule_${slot}`;
          if (idA !== capsuleName && idB !== capsuleName) continue;
          callback(slot);
        }
      }
    });
  }

  public dispose(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = this.plugin as any;
    if (!this._observer || !p?.onCollisionObservable) return;
    p.onCollisionObservable.remove(this._observer);
    this._observer = null;
  }
}

interface CollisionEvent {
  collidedAgainst?: { transformNode?: { name?: string } };
  collider?: { transformNode?: { name?: string } };
}
