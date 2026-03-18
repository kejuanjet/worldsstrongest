import type { AbstractMesh, Scene, Vector3 } from "@babylonjs/core";
import {
  createCharacterHandle,
  createDestructibleHandle,
  createProjectileHandle,
  createTerrainHandle,
  createTriggerHandle,
} from "./PhysicsBodyFactory.js";
import type { PhysicsHandle } from "./PhysicsHandle.js";

export class PhysicsBodyRegistry {
  private readonly scene: Scene;
  public readonly characters = new Map<number, PhysicsHandle>();
  public readonly projectiles = new Map<string, PhysicsHandle>();
  public readonly triggers = new Map<string, PhysicsHandle>();
  public readonly terrain = new Map<string, PhysicsHandle>();
  public readonly destructibles = new Map<string, PhysicsHandle>();

  public constructor(scene: Scene) {
    this.scene = scene;
  }

  public addCharacter(slot: number, rootNode: AbstractMesh, position: Vector3): PhysicsHandle {
    this.removeCharacter(slot);
    const handle = createCharacterHandle(this.scene, slot, rootNode, position);
    this.characters.set(slot, handle);
    return handle;
  }

  public removeCharacter(slot: number): void {
    this.characters.get(slot)?.dispose();
    this.characters.delete(slot);
  }

  public addProjectile(id: string, position: Vector3, velocity: Vector3, radius?: number): PhysicsHandle {
    this.removeProjectile(id);
    const handle = createProjectileHandle(this.scene, id, position, velocity, radius);
    this.projectiles.set(id, handle);
    return handle;
  }

  public removeProjectile(id: string): void {
    this.projectiles.get(id)?.dispose();
    this.projectiles.delete(id);
  }

  public addTerrainMeshes(zoneId: string, meshes: AbstractMesh[]): void {
    this.removeTerrainForZone(zoneId);
    for (const mesh of meshes) {
      if (!mesh.isVisible) continue;
      const { id, handle } = createTerrainHandle(this.scene, zoneId, mesh);
      this.terrain.set(id, handle);
    }
  }

  public removeTerrainForZone(zoneId: string): void {
    for (const [id, handle] of this.terrain) {
      if (!id.startsWith(`terrain_${zoneId}_`)) continue;
      handle.dispose();
      this.terrain.delete(id);
    }
  }

  public addTrigger(id: string, position: Vector3, radius: number): PhysicsHandle {
    this.removeTrigger(id);
    const handle = createTriggerHandle(this.scene, id, position, radius);
    this.triggers.set(id, handle);
    return handle;
  }

  public removeTrigger(id: string): void {
    this.triggers.get(id)?.dispose();
    this.triggers.delete(id);
  }

  public addDestructible(id: string, mesh: AbstractMesh, mass?: number): PhysicsHandle {
    this.removeDestructible(id);
    const handle = createDestructibleHandle(this.scene, id, mesh, mass);
    this.destructibles.set(id, handle);
    return handle;
  }

  public removeDestructible(id: string): void {
    this.destructibles.get(id)?.dispose();
    this.destructibles.delete(id);
  }

  public disposeAll(): void {
    for (const map of [
      this.characters,
      this.projectiles,
      this.triggers,
      this.terrain,
      this.destructibles,
    ]) {
      for (const [, handle] of map) {
        try {
          handle.dispose();
        } catch (error) {
          console.warn("[PhysicsBodyRegistry] Failed to dispose physics handle:", error);
        }
      }
      map.clear();
    }
  }
}
