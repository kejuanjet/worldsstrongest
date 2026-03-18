// src/ai/TrainingDummy.js
// Training dummy system for practice mode
// Dummies don't fight back - they just display damage and react visually

import {
  Vector3,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Color4,
  TransformNode,
  ParticleSystem,
} from "@babylonjs/core";

// ─── Training Dummy Definitions ─────────────────────────────────────────────────

export const TRAINING_DUMMY_TYPES = {
  BASIC: {
    id: "BASIC",
    label: "Basic Dummy",
    description: "A stationary target for practicing basic attacks",
    color: new Color3(0.5, 0.5, 0.5),
    hp: 100000,
    ki: 100000,
    behavior: "stationary",
    blocks: false,
  },
  BLOCKING: {
    id: "BLOCKING",
    label: "Blocking Dummy",
    description: "A dummy that blocks some damage - practice your guard breaks",
    color: new Color3(0.6, 0.4, 0.2),
    hp: 100000,
    ki: 100000,
    behavior: "stationary",
    blocks: true,
    blockReduction: 0.7,
  },
  MOVING: {
    id: "MOVING",
    label: "Moving Dummy",
    description: "A moving target to practice tracking attacks",
    color: new Color3(0.3, 0.6, 0.3),
    hp: 100000,
    ki: 100000,
    behavior: "moving",
    moveSpeed: 3,
    moveRange: 15,
    blocks: false,
  },
  EVASIVE: {
    id: "EVASIVE",
    label: "Evasive Dummy",
    description: "Dodges frequently - practice your predictive attacks",
    color: new Color3(0.4, 0.4, 0.7),
    hp: 100000,
    ki: 100000,
    behavior: "evasive",
    dodgeChance: 0.3,
    blocks: false,
  },
};

// ─── TrainingDummy Entity ─────────────────────────────────────────────────────

export class TrainingDummy {
  /**
   * @param {object} params
   * @param {string} params.id - Unique identifier
   * @param {string} params.type - Type key from TRAINING_DUMMY_TYPES
   * @param {number} params.slot - Entity slot for the registry
   * @param {Vector3} params.position - Spawn position
   * @param {import("@babylonjs/core").Scene} params.scene - Babylon scene
   */
  constructor({ id, type, slot, position, scene }) {
    this.id = id;
    this.type = type;
    this.slot = slot;
    this.scene = scene;
    
    const def = TRAINING_DUMMY_TYPES[type] ?? TRAINING_DUMMY_TYPES.BASIC;
    if (!TRAINING_DUMMY_TYPES[type]) {
      console.warn(`[TrainingDummy] Unknown type: ${type}. Falling back to BASIC.`);
    }
    
    this.def = def;
    this.position = position.clone();
    this.hp = def.hp;
    this.maxHP = def.hp;
    this.ki = def.ki;
    this.maxKi = def.ki;
    this.isDead = false;
    this.lastDamageTime = 0;
    
    // Movement state
    this.moveTime = 0;
    this.homePosition = position.clone();
    this.dodgeCooldown = 0;
    
    // Stats tracking
    this.totalDamageTaken = 0;
    this.hitCount = 0;
    this.maxCombo = 0;
    this.currentCombo = 0;
    this.comboTimer = 0;
    
    // Visual feedback
    this.flashTimer = 0;
    
    this._buildMesh();
  }

  _buildMesh() {
    this.root = new TransformNode(`dummy_${this.id}_root`, this.scene);
    this.root.position.copyFrom(this.position);
    
    // Create dummy mesh based on type
    const mesh = MeshBuilder.CreateCapsule(
      `dummy_${this.id}_mesh`,
      { height: 2.2, radius: 0.5 },
      this.scene
    );
    mesh.parent = this.root;
    
    // Material
    const mat = new StandardMaterial(`dummy_${this.id}_mat`, this.scene);
    mat.diffuseColor = this.def.color.clone();
    mat.specularColor = new Color3(0.2, 0.2, 0.2);
    mesh.material = mat;
    this.material = mat;
    
    // Hit effect particles
    this._createHitParticles();
    
    // Damage number container
    this.damageNumbers = [];
    
    console.log(`[TrainingDummy] Created ${this.def.label} at slot ${this.slot}`);
  }

  _createHitParticles() {
    this.hitParticles = new ParticleSystem(`dummy_${this.id}_hits`, 50, this.scene);
    this.hitParticles.emitter = this.root;
    this.hitParticles.minEmitBox = new Vector3(-0.3, 0.5, -0.3);
    this.hitParticles.maxEmitBox = new Vector3(0.3, 1.5, 0.3);
    this.hitParticles.color1 = new Color4(1, 0.8, 0.2, 1);
    this.hitParticles.color2 = new Color4(1, 0.5, 0, 1);
    this.hitParticles.colorDead = new Color4(0.5, 0.2, 0, 0);
    this.hitParticles.minSize = 0.1;
    this.hitParticles.maxSize = 0.3;
    this.hitParticles.minLifeTime = 0.2;
    this.hitParticles.maxLifeTime = 0.5;
    this.hitParticles.emitRate = 0;
    this.hitParticles.manualEmitCount = 0;
    this.hitParticles.direction1 = new Vector3(-1, 2, -1);
    this.hitParticles.direction2 = new Vector3(1, 3, 1);
    this.hitParticles.minEmitPower = 2;
    this.hitParticles.maxEmitPower = 5;
    this.hitParticles.start();
  }

  /**
   * Apply damage to the dummy
   * @param {number} damage - Raw damage amount
   * @param {string} attackId - The attack that hit
   * @param {number} attackerSlot - Slot of the attacker
   * @returns {object} Result with actual damage and blocking info
   */
  takeDamage(damage, attackId, attackerSlot) {
    if (this.isDead) return { actual: 0, blocked: false, dodged: false };
    
    // Check for dodge (evasive type)
    if (this.def.behavior === "evasive" && this.dodgeCooldown <= 0) {
      if (Math.random() < (this.def.dodgeChance || 0.3)) {
        this.dodgeCooldown = 1.0;
        return { actual: 0, blocked: false, dodged: true };
      }
    }
    
    // Check for block
    let blocked = false;
    let actualDamage = damage;
    
    if (this.def.blocks) {
      blocked = Math.random() < 0.5; // 50% chance to block
      if (blocked) {
        actualDamage = Math.round(damage * (1 - (this.def.blockReduction || 0.7)));
      }
    }
    
    // Apply damage
    this.hp = Math.max(0, this.hp - actualDamage);
    this.totalDamageTaken += actualDamage;
    this.hitCount++;
    this.lastDamageTime = performance.now();
    
    // Combo tracking
    this.comboTimer = 2.0; // 2 second combo window
    this.currentCombo++;
    if (this.currentCombo > this.maxCombo) {
      this.maxCombo = this.currentCombo;
    }
    
    // Visual feedback
    this._flashMesh();
    this.hitParticles.manualEmitCount = 15;
    
    // Check death (respawn)
    if (this.hp <= 0) {
      this._respawnTimeout = setTimeout(() => this.respawn(), 500);
    }
    
    return { actual: actualDamage, blocked, dodged: false };
  }

  _flashMesh() {
    this.flashTimer = 0.15;
    this.material.emissiveColor = new Color3(1, 0.3, 0.1);
  }

  /**
   * Reset the dummy to full HP
   */
  respawn() {
    if (this._isDisposed) return;
    this.hp = this.maxHP;
    this.isDead = false;
    this.totalDamageTaken = 0;
    this.hitCount = 0;
    this.maxCombo = 0;
    this.currentCombo = 0;
    this.comboTimer = 0;
    
    // Reset position for moving types
    if (this.def.behavior === "moving" || this.def.behavior === "evasive") {
      this.position = this.homePosition.clone();
      this.root.position.copyFrom(this.position);
    }
    
    console.log(`[TrainingDummy] ${this.def.label} respawned`);
  }

  /**
   * Update dummy behavior each frame
   * @param {number} delta - Time since last frame in seconds
   */
  update(delta) {
    if (this.isDead) return;
    
    // Update combo timer
    if (this.comboTimer > 0) {
      this.comboTimer -= delta;
      if (this.comboTimer <= 0) {
        this.currentCombo = 0;
      }
    }
    
    // Update dodge cooldown
    if (this.dodgeCooldown > 0) {
      this.dodgeCooldown -= delta;
    }
    
    // Update flash effect
    if (this.flashTimer > 0) {
      this.flashTimer -= delta;
      if (this.flashTimer <= 0) {
        this.material.emissiveColor = new Color3(0, 0, 0);
      }
    }
    
    // Movement behavior
    if (this.def.behavior === "moving") {
      this._updateMovingBehavior(delta);
    } else if (this.def.behavior === "evasive") {
      this._updateEvasiveBehavior(delta);
    }
    
    // Sync mesh position
    this.root.position.copyFrom(this.position);
  }

  _updateMovingBehavior(delta) {
    this.moveTime += delta;
    const speed = this.def.moveSpeed || 3;
    const range = this.def.moveRange || 15;
    
    // Circular movement pattern
    const angle = this.moveTime * speed * 0.5;
    this.position.x = this.homePosition.x + Math.cos(angle) * range * 0.5;
    this.position.z = this.homePosition.z + Math.sin(angle) * range * 0.5;
    this.position.y = this.homePosition.y;
  }

  _updateEvasiveBehavior(delta) {
    this.moveTime += delta;
    const range = 10;
    
    // Erratic movement
    const moveX = Math.sin(this.moveTime * 2) * Math.cos(this.moveTime * 0.7);
    const moveZ = Math.cos(this.moveTime * 1.5) * Math.sin(this.moveTime * 0.3);
    
    this.position.x = this.homePosition.x + moveX * range;
    this.position.z = this.homePosition.z + moveZ * range;
    this.position.y = this.homePosition.y;
  }

  /**
   * Get training statistics
   */
  getStats() {
    return {
      totalDamage: this.totalDamageTaken,
      hitCount: this.hitCount,
      maxCombo: this.maxCombo,
      currentCombo: this.currentCombo,
      hp: this.hp,
      maxHP: this.maxHP,
      hpPercent: (this.hp / this.maxHP) * 100,
    };
  }

  /**
   * Dispose of the dummy
   */
  dispose() {
    this._isDisposed = true;
    clearTimeout(this._respawnTimeout);
    this.hitParticles?.dispose();
    this.root?.dispose();
    console.log(`[TrainingDummy] Disposed ${this.def.label}`);
  }
}

// ─── TrainingDummyManager ─────────────────────────────────────────────────────

export class TrainingDummyManager {
  /**
   * @param {import("@babylonjs/core").Scene} scene 
   */
  constructor(scene) {
    this.scene = scene;
    this.dummies = new Map();
    this._dummyCounter = 0;
    
    console.log("[TrainingDummyManager] Initialized");
  }

  /**
   * Spawn a new training dummy
   * @param {string} type - Type key from TRAINING_DUMMY_TYPES
   * @param {Vector3} position - Spawn position
   * @param {number} slot - Entity slot (for integration with combat system)
   */
  spawnDummy(type, position, slot = 10) {
    const id = `training_dummy_${++this._dummyCounter}`;
    const dummy = new TrainingDummy({
      id,
      type,
      slot,
      position,
      scene: this.scene,
    });
    
    this.dummies.set(id, dummy);
    console.log(`[TrainingDummyManager] Spawned ${type} dummy`);
    
    return dummy;
  }

  /**
   * Remove a dummy by ID
   */
  removeDummy(id) {
    const dummy = this.dummies.get(id);
    if (dummy) {
      dummy.dispose();
      this.dummies.delete(id);
    }
  }

  /**
   * Remove all dummies
   */
  clearAll() {
    for (const [id, dummy] of this.dummies) {
      dummy.dispose();
    }
    this.dummies.clear();
  }

  /**
   * Reset all dummies to full HP
   */
  resetAll() {
    for (const [, dummy] of this.dummies) {
      dummy.respawn();
    }
  }

  /**
   * Get a dummy by slot
   */
  getBySlot(slot) {
    for (const [, dummy] of this.dummies) {
      if (dummy.slot === slot) return dummy;
    }
    return null;
  }

  /**
   * Get combined stats from all dummies
   */
  getTotalStats() {
    let totalDamage = 0;
    let totalHits = 0;
    let maxCombo = 0;
    
    for (const [, dummy] of this.dummies) {
      const stats = dummy.getStats();
      totalDamage += stats.totalDamage;
      totalHits += stats.hitCount;
      if (stats.maxCombo > maxCombo) maxCombo = stats.maxCombo;
    }
    
    return {
      totalDamage,
      totalHits,
      maxCombo,
      dummyCount: this.dummies.size,
    };
  }

  /**
   * Update all dummies
   */
  update(delta) {
    for (const [, dummy] of this.dummies) {
      dummy.update(delta);
    }
  }

  dispose() {
    this.clearAll();
    console.log("[TrainingDummyManager] Disposed");
  }
}
