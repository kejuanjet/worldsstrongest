import { Vector3 } from "@babylonjs/core";
import { PhysicsBodyRegistry } from "./physics/PhysicsBodyRegistry.js";
import { initPhysicsEngine } from "./physics/PhysicsEngineAdapter.js";
import { PhysicsQueries } from "./physics/PhysicsQueries.js";
import { PhysicsTriggerObserver } from "./physics/PhysicsTriggerObserver.js";

export { COLLISION_LAYER, COLLISION_MASK } from "./physics/PhysicsLayers.js";

export class PhysicsWorld {
  constructor(scene) {
    this.scene = scene;
    this.plugin = null;
    this.ready = false;

    this._bodies = new PhysicsBodyRegistry(scene);
    this._queries = new PhysicsQueries(scene);
    this._collisionCallbacks = new Map();
    this._triggerObserver = null;
  }

  async init() {
    this.plugin = await initPhysicsEngine(this.scene);
    this.ready = !!this.plugin;

    if (this.ready) {
      this._triggerObserver = new PhysicsTriggerObserver(
        this.plugin,
        this._bodies.triggers,
        this._bodies.characters,
        this._collisionCallbacks
      );
      this._triggerObserver.attach();
    }
  }

  addCharacter(slot, rootNode, position) {
    if (!this.ready) return null;
    return this._bodies.addCharacter(slot, rootNode, position);
  }

  removeCharacter(slot) {
    this._bodies.removeCharacter(slot);
  }

  getCharacterHandle(slot) {
    return this._bodies.characters.get(slot) ?? null;
  }

  addProjectile(id, position, velocity, radius = 0.3) {
    if (!this.ready) return null;
    return this._bodies.addProjectile(id, position, velocity, radius);
  }

  removeProjectile(id) {
    this._bodies.removeProjectile(id);
  }

  addTerrainMeshes(zoneId, meshes) {
    if (!this.ready) return;
    this._bodies.addTerrainMeshes(zoneId, meshes);
    console.log(`[PhysicsWorld] Added terrain for zone: ${zoneId}`);
  }

  removeTerrainForZone(zoneId) {
    this._bodies.removeTerrainForZone(zoneId);
  }

  addTrigger(id, position, radius, onEnter) {
    if (!this.ready) return null;
    this._collisionCallbacks.set(id, onEnter);
    return this._bodies.addTrigger(id, position, radius);
  }

  removeTrigger(id) {
    this._bodies.removeTrigger(id);
    this._collisionCallbacks.delete(id);
  }

  addDestructible(id, mesh, mass = 50) {
    if (!this.ready) return null;
    return this._bodies.addDestructible(id, mesh, mass);
  }

  applyExplosionForce(epicenter, radius, force) {
    for (const [, handle] of this._bodies.destructibles) {
      if (!handle.isActive) continue;
      const mesh = handle.aggregate?.transformNode;
      if (!mesh) continue;

      const distance = Vector3.Distance(epicenter, mesh.position);
      if (distance >= radius) continue;

      const direction = mesh.position.subtract(epicenter).normalize();
      const falloff = 1 - distance / radius;
      const impulse = direction.scale(force * falloff);
      handle.applyImpulse(impulse, mesh.position);
    }
  }

  sampleGround(position) {
    return this._queries.sampleGround(position, this.ready, this.plugin);
  }

  isInAir(position, threshold = 0.3) {
    return this._queries.isInAir(position, this.ready, this.plugin, threshold);
  }

  setGravity(g) {
    if (!this.ready) return;
    this.scene.getPhysicsEngine()?.setGravity(new Vector3(0, g, 0));
  }

  dispose() {
    this._triggerObserver?.dispose();
    this._collisionCallbacks.clear();
    this._queries.clear();
    this._bodies.disposeAll();
    this.scene.disablePhysicsEngine?.();
    console.log("[PhysicsWorld] Disposed.");
  }
}
