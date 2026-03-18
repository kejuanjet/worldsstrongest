import { Quaternion, type Vector3, type Quaternion as QuaternionType } from "@babylonjs/core";

export interface PhysicsAggregateLike {
  body?: {
    setTargetTransform?: (position: Vector3, rotation: QuaternionType, instanceIndex?: number) => void;
    setLinearVelocity?: (v: Vector3) => void;
    getLinearVelocity?: () => Vector3;
    applyImpulse?: (impulse: Vector3, point: Vector3) => void;
  };
  dispose?: () => void;
}

export class PhysicsHandle {
  public readonly aggregate: PhysicsAggregateLike | null;
  public readonly bodyId: string;
  public isActive: boolean;

  public constructor(aggregate: PhysicsAggregateLike | null, bodyId: string) {
    this.aggregate = aggregate;
    this.bodyId = bodyId;
    this.isActive = true;
  }

  public setPosition(v: Vector3): void {
    this.aggregate?.body?.setTargetTransform?.(v, Quaternion.Identity());
  }

  public setLinearVelocity(v: Vector3): void {
    this.aggregate?.body?.setLinearVelocity?.(v);
  }

  public getLinearVelocity(): Vector3 {
    // Babylon Vector3.Zero() import avoided to keep this module lightweight;
    // callers should guard on `isActive` before relying on the return value.
    return this.aggregate?.body?.getLinearVelocity?.() ?? ({ x: 0, y: 0, z: 0 } as Vector3);
  }

  public applyImpulse(impulse: Vector3, point: Vector3): void {
    this.aggregate?.body?.applyImpulse?.(impulse, point);
  }

  public dispose(): void {
    this.aggregate?.dispose?.();
    this.isActive = false;
  }
}
