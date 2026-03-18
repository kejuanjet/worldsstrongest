import {
  MeshBuilder,
  PhysicsAggregate,
  PhysicsShapeType,
  Vector3,
  type AbstractMesh,
  type Scene,
} from "@babylonjs/core";
import { COLLISION_LAYER, COLLISION_MASK } from "./PhysicsLayers.js";
import { PhysicsHandle } from "./PhysicsHandle.js";

export function createCharacterHandle(
  scene: Scene,
  slot: number,
  rootNode: AbstractMesh | null,
  position: Vector3,
): PhysicsHandle {
  if (!rootNode) {
    throw new Error(`Character root node is required for slot ${slot}.`);
  }

  const capsule = MeshBuilder.CreateCapsule(
    `physCapsule_${slot}`,
    { height: 2.0, radius: 0.42 },
    scene,
  );
  capsule.position.copyFrom(position);
  capsule.isVisible = false;

  let aggregate: PhysicsAggregate;
  try {
    aggregate = new PhysicsAggregate(capsule, PhysicsShapeType.CAPSULE, {
      mass: 80,
      restitution: 0.0,
      friction: 0.8,
    }, scene);
  } catch (error) {
    capsule.dispose(false, true);
    throw error;
  }

  aggregate.body.setMassProperties({ inertia: Vector3.Zero() });
  aggregate.shape.filterMembershipMask = COLLISION_LAYER.PLAYER;
  aggregate.shape.filterCollideMask = COLLISION_MASK.PLAYER;
  capsule.parent = rootNode;

  return new PhysicsHandle(aggregate, `char_${slot}`);
}

export function createProjectileHandle(
  scene: Scene,
  id: string,
  position: Vector3,
  velocity: Vector3,
  radius = 0.3,
): PhysicsHandle {
  const sphere = MeshBuilder.CreateSphere(`physProj_${id}`, { diameter: radius * 2 }, scene);
  sphere.position.copyFrom(position);
  sphere.isVisible = false;

  let aggregate: PhysicsAggregate;
  try {
    aggregate = new PhysicsAggregate(sphere, PhysicsShapeType.SPHERE, {
      mass: 0.1,
      restitution: 0.0,
    }, scene);
  } catch (error) {
    sphere.dispose(false, true);
    throw error;
  }

  aggregate.shape.filterMembershipMask = COLLISION_LAYER.PROJECTILE;
  aggregate.shape.filterCollideMask = COLLISION_MASK.PROJECTILE;
  aggregate.body.setLinearVelocity(velocity);
  aggregate.body.setGravityFactor(0);

  return new PhysicsHandle(aggregate, id);
}

export function createTerrainHandle(
  scene: Scene,
  zoneId: string,
  mesh: AbstractMesh,
): { id: string; handle: PhysicsHandle } {
  const aggregate = new PhysicsAggregate(mesh, PhysicsShapeType.MESH, {
    mass: 0,
    restitution: 0.1,
    friction: 0.85,
  }, scene);

  aggregate.shape.filterMembershipMask = COLLISION_LAYER.TERRAIN;
  aggregate.shape.filterCollideMask = COLLISION_MASK.TERRAIN;

  const id = `terrain_${zoneId}_${mesh.name}`;
  return { id, handle: new PhysicsHandle(aggregate, id) };
}

export function createTriggerHandle(
  scene: Scene,
  id: string,
  position: Vector3,
  radius: number,
): PhysicsHandle {
  const sphere = MeshBuilder.CreateSphere(`trigger_${id}`, { diameter: radius * 2 }, scene);
  sphere.position.copyFrom(position);
  sphere.isVisible = false;
  sphere.isPickable = false;

  let aggregate: PhysicsAggregate;
  try {
    aggregate = new PhysicsAggregate(sphere, PhysicsShapeType.SPHERE, { mass: 0 }, scene);
  } catch (error) {
    sphere.dispose(false, true);
    throw error;
  }
  aggregate.shape.filterMembershipMask = COLLISION_LAYER.TRIGGER;
  aggregate.shape.filterCollideMask = COLLISION_MASK.TRIGGER;
  aggregate.body.setCollisionCallbackEnabled(true);

  return new PhysicsHandle(aggregate, id);
}

export function createDestructibleHandle(
  scene: Scene,
  id: string,
  mesh: AbstractMesh,
  mass = 50,
): PhysicsHandle {
  const aggregate = new PhysicsAggregate(mesh, PhysicsShapeType.MESH, {
    mass,
    restitution: 0.2,
    friction: 0.6,
  }, scene);

  aggregate.shape.filterMembershipMask = COLLISION_LAYER.DESTRUCTIBLE;
  aggregate.shape.filterCollideMask = COLLISION_MASK.DESTRUCTIBLE;

  return new PhysicsHandle(aggregate, id);
}
