// src/core/combat/BeamEntity.ts
// Visual ki-beam entity — core, outer glow, tip sphere, and streaming particles.

import {
  Vector3,
  Quaternion,
  Scalar,
  Color3,
  Color4,
  MeshBuilder,
  StandardMaterial,
  ParticleSystem,
  type Mesh,
  type Scene,
} from "@babylonjs/core";
import type { AttackDefinition } from "./AttackCatalog.js";

export interface BeamEntityParams {
  id: string;
  ownerId: string;
  ownerSlot: number;
  attackDef: AttackDefinition;
  origin: Vector3;
  direction: Vector3;
  scene: Scene;
}

export class BeamEntity {
  readonly id: string;
  readonly ownerId: string;
  readonly ownerSlot: number;
  readonly attackDef: AttackDefinition;
  readonly origin: Vector3;
  readonly direction: Vector3;
  readonly scene: Scene;

  alive = true;
  duration = 900;
  elapsed = 0;
  chargeFactor = 1.0;

  core!: Mesh;
  mesh!: Mesh;
  tip!: Mesh;
  private _ps!: ParticleSystem;
  private _coreMat!: StandardMaterial;
  private _outerMat!: StandardMaterial;
  private _tipMat!: StandardMaterial;

  /** Slots already hit — used by piercing beams to avoid per-frame re-damage */
  hitSlots: Set<number> = new Set();

  constructor(params: BeamEntityParams) {
    this.id = params.id;
    this.ownerId = params.ownerId;
    this.ownerSlot = params.ownerSlot;
    this.attackDef = params.attackDef;
    this.origin = params.origin.clone();
    this.direction = params.direction.normalize();
    this.scene = params.scene;
    this._buildMesh();
  }

  private _orient(mesh: Mesh, mid: Vector3): void {
    mesh.position.copyFrom(mid);
    const angle = Math.acos(Scalar.Clamp(Vector3.Dot(Vector3.Up(), this.direction), -1, 1));
    const axis = Vector3.Cross(Vector3.Up(), this.direction).normalize();
    if (axis.lengthSquared() > 0.001) {
      mesh.rotationQuaternion = Quaternion.RotationAxis(axis, angle);
    }
  }

  private _buildMesh(): void {
    const length = this.attackDef.range ?? 150;
    const width = this.attackDef.width ?? 1.0;
    const c = this.attackDef.color ?? new Color3(0.3, 0.6, 1.0);
    const mid = this.origin.add(this.direction.scale(length / 2));

    // Core cylinder
    this.core = MeshBuilder.CreateCylinder(
      `beamCore_${this.id}`,
      { height: length, diameter: width * 0.35, tessellation: 10 },
      this.scene,
    );
    const coreMat = new StandardMaterial(`beamCoreMat_${this.id}`, this.scene);
    coreMat.emissiveColor = new Color3(
      Math.min(1, c.r + 0.7),
      Math.min(1, c.g + 0.7),
      Math.min(1, c.b + 0.7),
    );
    coreMat.alpha = 0.95;
    coreMat.backFaceCulling = false;
    coreMat.disableLighting = true;
    this.core.material = coreMat;
    this.core.isPickable = false;
    this.core.renderingGroupId = 1;
    this._orient(this.core, mid);

    // Outer glow cylinder
    this.mesh = MeshBuilder.CreateCylinder(
      `beam_${this.id}`,
      { height: length, diameter: width * 1.8, tessellation: 14 },
      this.scene,
    );
    const outerMat = new StandardMaterial(`beamMat_${this.id}`, this.scene);
    outerMat.emissiveColor = c;
    outerMat.alpha = 0.38;
    outerMat.backFaceCulling = false;
    outerMat.disableLighting = true;
    this.mesh.material = outerMat;
    this.mesh.isPickable = false;
    this.mesh.renderingGroupId = 1;
    this._orient(this.mesh, mid);
    this._outerMat = outerMat;

    // Tip sphere
    this.tip = MeshBuilder.CreateSphere(
      `beamTip_${this.id}`,
      { diameter: width * 2.6, segments: 10 },
      this.scene,
    );
    const tipMat = new StandardMaterial(`beamTipMat_${this.id}`, this.scene);
    tipMat.emissiveColor = new Color3(
      Math.min(1, c.r + 0.5),
      Math.min(1, c.g + 0.5),
      Math.min(1, c.b + 0.5),
    );
    tipMat.alpha = 0.7;
    tipMat.backFaceCulling = false;
    tipMat.disableLighting = true;
    this.tip.material = tipMat;
    this.tip.isPickable = false;
    this.tip.renderingGroupId = 1;
    this.tip.position = this.origin.add(this.direction.scale(length));
    this._tipMat = tipMat;

    // Streaming particles
    this._ps = new ParticleSystem(`beamPS_${this.id}`, 250, this.scene);
    this._ps.emitter = mid.clone();
    this._ps.minEmitBox = this.direction.scale(-length * 0.45);
    this._ps.maxEmitBox = this.direction.scale(length * 0.45);
    this._ps.color1 = new Color4(c.r, c.g, c.b, 0.9);
    this._ps.color2 = new Color4(
      Math.min(1, c.r + 0.5),
      Math.min(1, c.g + 0.5),
      Math.min(1, c.b + 0.5),
      0.6,
    );
    this._ps.colorDead = new Color4(c.r * 0.3, c.g * 0.3, c.b * 0.3, 0);
    this._ps.minSize = width * 0.08;
    this._ps.maxSize = width * 0.35;
    this._ps.minLifeTime = 0.06;
    this._ps.maxLifeTime = 0.25;
    this._ps.emitRate = 220;
    this._ps.direction1 = new Vector3(-2.5, -2.5, -2.5);
    this._ps.direction2 = new Vector3(2.5, 2.5, 2.5);
    this._ps.minEmitPower = 1;
    this._ps.maxEmitPower = 5;
    this._ps.updateSpeed = 0.015;
    this._ps.gravity = Vector3.Zero();
    this._ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    this._ps.start();

    this._coreMat = coreMat;
  }

  update(deltaMs: number): void {
    this.elapsed += deltaMs;
    if (this.elapsed >= this.duration) {
      this.destroy();
      return;
    }

    const t = this.elapsed / this.duration;
    const pulse = 0.85 + 0.15 * Math.sin(this.elapsed * 0.025);
    const fadeOut = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;

    this._coreMat.alpha = 0.95 * pulse * fadeOut;
    this._outerMat.alpha = 0.38 * pulse * fadeOut;
    const tipPulse = 0.7 + 0.3 * Math.sin(this.elapsed * 0.04);
    this._tipMat.alpha = tipPulse * fadeOut;
    const s = 1 + 0.25 * Math.sin(this.elapsed * 0.03);
    this.tip.scaling.setAll(s);

    const swell = 1 + 0.12 * Math.sin(this.elapsed * 0.018);
    this.mesh.scaling.x = swell;
    this.mesh.scaling.z = swell;
  }

  destroy(): void {
    if (!this.alive) {
      return;
    }
    this.alive = false;
    this._coreMat.dispose();
    this._outerMat.dispose();
    this._tipMat.dispose();
    this.core.dispose();
    this.mesh.dispose();
    this.tip.dispose();
    this._ps.dispose();
  }
}
