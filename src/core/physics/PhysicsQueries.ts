import { Ray, Vector3, type Scene } from "@babylonjs/core";

export class PhysicsQueries {
  private readonly scene: Scene;
  private readonly _groundCache = new Map<string, number>();

  public constructor(scene: Scene) {
    this.scene = scene;
  }

  public sampleGround(
    position: Vector3,
    ready: boolean,
    plugin: unknown,
  ): number {
    if (!ready || !plugin) return 0;

    const key = `${Math.round(position.x * 2)}_${Math.round(position.z * 2)}`;
    const cached = this._groundCache.get(key);
    if (cached !== undefined) return cached;

    const origin = new Vector3(position.x, position.y + 5, position.z);
    const ray = new Ray(origin, Vector3.Down(), 55);
    const hit = this.scene.pickWithRay(
      ray,
      (mesh) => mesh.checkCollisions && !mesh.name.startsWith("phys"),
    );

    const groundY = hit?.hit ? (hit.pickedPoint?.y ?? 0) : 0;
    this._groundCache.set(key, groundY);

    if (this._groundCache.size > 500) {
      this._groundCache.clear();
    }

    return groundY;
  }

  public isInAir(
    position: Vector3,
    ready: boolean,
    plugin: unknown,
    threshold = 0.3,
  ): boolean {
    return position.y - this.sampleGround(position, ready, plugin) > threshold;
  }

  public clear(): void {
    this._groundCache.clear();
  }
}
