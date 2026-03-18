// src/core/combat/Projectile.ts
// Visual ki-blast projectile entity with core, glow shell, and trail particles.

import {
  Vector3,
  Color3,
  Color4,
  MeshBuilder,
  StandardMaterial,
  ParticleSystem,
  type Mesh,
  type Scene,
} from "@babylonjs/core";
import type { AttackDefinition } from "./AttackCatalog.js";

export interface ProjectileParams {
  id: string;
  ownerId: string;
  ownerSlot: number;
  attackId: string;
  origin: Vector3;
  direction: Vector3;
  speed: number;
  maxRange: number;
  attackDef: AttackDefinition;
  scene: Scene;
}

export class Projectile {
  readonly id: string;
  ownerId: string;
  ownerSlot: number;
  readonly attackId: string;
  readonly attackDef: AttackDefinition;
  readonly scene: Scene;

  position: Vector3;
  direction: Vector3;
  speed: number;
  maxRange: number;
  traveled = 0;
  alive = true;

  mesh!: Mesh;
  private _glow!: Mesh;
  private _coreMat!: StandardMaterial;
  private _glowMat!: StandardMaterial;
  private particles!: ParticleSystem;
  private _elapsed = 0;

  constructor(params: ProjectileParams) {
    this.id = params.id;
    this.ownerId = params.ownerId;
    this.ownerSlot = params.ownerSlot;
    this.attackId = params.attackId;
    this.attackDef = params.attackDef;
    this.scene = params.scene;

    this.position = params.origin.clone();
    this.direction = params.direction.normalize();
    this.speed = params.speed;
    this.maxRange = params.maxRange;

    this._buildMesh();
  }

  private _buildMesh(): void {
    const c = this.attackDef.color ?? new Color3(0.4, 0.8, 1.0);

    // Inner core
    this.mesh = MeshBuilder.CreateSphere(
      `proj_${this.id}`,
      { diameter: 0.5, segments: 10 },
      this.scene,
    );
    this.mesh.position.copyFrom(this.position);

    const coreMat = new StandardMaterial(`projCoreMat_${this.id}`, this.scene);
    coreMat.emissiveColor = new Color3(
      Math.min(1, c.r + 0.6),
      Math.min(1, c.g + 0.6),
      Math.min(1, c.b + 0.6),
    );
    coreMat.alpha = 0.95;
    coreMat.backFaceCulling = false;
    coreMat.disableLighting = true;
    this.mesh.material = coreMat;
    this._coreMat = coreMat;
    this.mesh.isPickable = false;
    this.mesh.renderingGroupId = 1;

    // Outer glow shell
    this._glow = MeshBuilder.CreateSphere(
      `projGlow_${this.id}`,
      { diameter: 1.1, segments: 8 },
      this.scene,
    );
    this._glow.parent = this.mesh;
    const glowMat = new StandardMaterial(`projGlowMat_${this.id}`, this.scene);
    glowMat.emissiveColor = c;
    glowMat.alpha = 0.35;
    glowMat.backFaceCulling = false;
    glowMat.disableLighting = true;
    this._glow.material = glowMat;
    this._glow.isPickable = false;
    this._glow.renderingGroupId = 1;
    this._glowMat = glowMat;

    // Trail particles
    const ps = new ParticleSystem(`projPS_${this.id}`, 90, this.scene);
    ps.emitter = this.mesh;
    ps.minEmitBox = Vector3.Zero();
    ps.maxEmitBox = Vector3.Zero();
    ps.color1 = new Color4(c.r, c.g, c.b, 1.0);
    ps.color2 = new Color4(
      Math.min(1, c.r + 0.4),
      Math.min(1, c.g + 0.4),
      Math.min(1, c.b + 0.4),
      0.7,
    );
    ps.colorDead = new Color4(c.r * 0.2, c.g * 0.2, c.b * 0.2, 0);
    ps.minSize = 0.06;
    ps.maxSize = 0.32;
    ps.minLifeTime = 0.08;
    ps.maxLifeTime = 0.35;
    ps.emitRate = 120;
    const back = this.direction.scale(-3);
    ps.direction1 = new Vector3(back.x - 1.2, back.y - 1.2, back.z - 1.2);
    ps.direction2 = new Vector3(back.x + 1.2, back.y + 1.2, back.z + 1.2);
    ps.minEmitPower = 2;
    ps.maxEmitPower = 6;
    ps.updateSpeed = 0.015;
    ps.gravity = Vector3.Zero();
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.start();
    this.particles = ps;
  }

  update(delta: number): void {
    if (!this.alive) return;
    const move = this.direction.scale(this.speed * delta);
    this.position.addInPlace(move);
    this.mesh.position.copyFrom(this.position);
    this.traveled += move.length();

    this._elapsed += delta;
    const pulse = 0.3 + 0.15 * Math.sin(this._elapsed * 18);
    this._glowMat.alpha = pulse;
    const s = 1 + 0.2 * Math.sin(this._elapsed * 14);
    this._glow.scaling.setAll(s);

    if (this.traveled >= this.maxRange) this.destroy();
  }

  destroy(): void {
    if (!this.alive) {
      return;
    }
    this.alive = false;
    this.particles.dispose();
    this._coreMat.dispose();
    this._glowMat.dispose();
    this._glow.dispose();
    this.mesh.dispose();
  }
}
