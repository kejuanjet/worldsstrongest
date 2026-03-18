import { Vector3 } from "@babylonjs/core";

export interface AiCharacterState {
  slot: number;
  teamId: string;
  hp: number;
  maxHP: number;
  ki: number;
  isDead: boolean;
  isAiControlled?: boolean;
  currentStance?: string;
  position: Vector3;
  velocity: Vector3;
  rootNode?: { rotation?: Vector3 } | null;
  characterDef?: {
    stances?: string[];
    attackProfiles?: Array<{
      label: string;
      attacks: string[];
    }>;
  };
}

export interface AiRegistryLike {
  slots: Map<number, AiCharacterState>;
  getState(slot: number): AiCharacterState | null;
  getEntitiesByTeam?(teamId: string): AiCharacterState[];
}

interface EnemyAiControllerOptions {
  registry: AiRegistryLike;
}

export interface AiInputSnapshot {
  moveX: number;
  moveZ: number;
  flyY: number;
  btnAttack: boolean;
  btnHeavy: boolean;
  btnBlast: boolean;
  btnUltimate: boolean;
  btnRush: boolean;
  btnGrab: boolean;
  btnTransform: boolean;
  btnTransformDown: boolean;
  btnDodge: boolean;
  btnKi: boolean;
  btnBlock: boolean;
  btnStance: boolean;
  btnHeal: boolean;
  btnMagicAttack: boolean;
  lockedSlot: number | null;
  mashCount: number;
}

interface BrainState {
  role: "ENEMY" | "COMPANION";
  characterId: string;
  aiProfile: Record<string, number>;
  nextDecisionAt: number;
  strafeDir: 1 | -1;
  strafeReverseAt: number;
  formationOffset: number;
  lastHpAtDecision: number | null;
  counterWindowEnd: number;
  attackProfile: {
    label: string;
    attacks: string[];
  };
  attackComboIndex: number;
  lastBlockEndAt: number;
  flankAngle: number;
  nextHealCheckAt: number;
}

const DEFAULT_ATTACK_PROFILE = {
  label: "Default",
  attacks: ["MELEE_LIGHT", "MELEE_HEAVY", "MELEE_LIGHT", "KI_BLAST"],
};

export class EnemyAIController {
  private readonly _registry: AiRegistryLike;
  private readonly _brains = new Map<number, BrainState>();
  private readonly _scratchA = new Vector3();
  private readonly _scratchB = new Vector3();
  private readonly _scratchC = new Vector3();
  private readonly _scratchD = new Vector3();
  private _queueInput: ((slot: number, input: AiInputSnapshot) => void) | null = null;
  private _timeMs = 0;

  public constructor(registryOrOptions: AiRegistryLike | EnemyAiControllerOptions) {
    this._registry = "registry" in registryOrOptions
      ? registryOrOptions.registry
      : registryOrOptions;
  }

  public setInputQueueSink(callback: (slot: number, input: AiInputSnapshot) => void): void {
    this._queueInput = callback;
  }

  public registerEnemy(slot: number, aiProfile: Record<string, number> = {}, characterId = "", attacks: string[] | null = null): void {
    const attackProfile = attacks?.length
      ? { label: "EnemyDef", attacks }
      : DEFAULT_ATTACK_PROFILE;

    this._brains.set(slot, {
      role: "ENEMY",
      characterId,
      aiProfile,
      nextDecisionAt: 0,
      strafeDir: Math.random() > 0.5 ? 1 : -1,
      strafeReverseAt: 0,
      formationOffset: 0,
      lastHpAtDecision: null,
      counterWindowEnd: 0,
      attackProfile,
      attackComboIndex: 0,
      lastBlockEndAt: 0,
      flankAngle: (Math.random() - 0.5) * Math.PI * 0.6,
      nextHealCheckAt: 0,
    });
  }

  public registerCompanion(slot: number, aiProfile: Record<string, number> = {}, characterId = ""): void {
    const attackProfile = DEFAULT_ATTACK_PROFILE;

    this._brains.set(slot, {
      role: "COMPANION",
      characterId,
      aiProfile,
      nextDecisionAt: 0,
      strafeDir: Math.random() > 0.5 ? 1 : -1,
      strafeReverseAt: 0,
      formationOffset: aiProfile.formationOffset ?? ((slot % 2 === 0 ? 1 : -1) * (2 + (slot % 3) * 1.2)),
      lastHpAtDecision: null,
      counterWindowEnd: 0,
      attackProfile,
      attackComboIndex: 0,
      lastBlockEndAt: 0,
      flankAngle: 0,
      nextHealCheckAt: 0,
    });
  }

  public removeEnemy(slot: number): void {
    this._brains.delete(slot);
  }

  public clear(): void {
    this._brains.clear();
  }

  public getBrainState(slot: number): BrainState | null {
    return this._brains.get(slot) ?? null;
  }

  public update(step: number): void {
    if (!this._queueInput) {
      return;
    }

    this._timeMs += step * 1000;
    const leader = this._findHero();

    for (const [slot, brain] of this._brains) {
      const actor = this._registry.getState(slot);
      if (!actor || actor.isDead) {
        continue;
      }

      const input = brain.role === "COMPANION"
        ? this._buildCompanionInput(actor, leader, brain)
        : this._buildEnemyInput(actor, leader, brain);

      this._queueInput(slot, input);
    }
  }

  private _findHero(): AiCharacterState | null {
    const heroes = this._registry.getEntitiesByTeam?.("HERO") ?? [];
    return heroes.find((entity) => !entity.isDead && !entity.isAiControlled)
      ?? heroes.find((entity) => !entity.isDead && entity.slot === 0)
      ?? this._registry.getState(0);
  }

  private _findClosestTarget(origin: AiCharacterState, teamId: string): AiCharacterState | null {
    let closest: AiCharacterState | null = null;
    let closestDistanceSq = Number.POSITIVE_INFINITY;

    for (const [, candidate] of this._registry.slots) {
      if (candidate.isDead || candidate.slot === origin.slot || candidate.teamId !== teamId) {
        continue;
      }

      origin.position.subtractToRef(candidate.position, this._scratchA);
      const distanceSq = this._scratchA.lengthSquared();
      if (distanceSq < closestDistanceSq) {
        closestDistanceSq = distanceSq;
        closest = candidate;
      }
    }

    return closest;
  }

  private _buildEnemyInput(enemy: AiCharacterState, target: AiCharacterState | null, brain: BrainState): AiInputSnapshot {
    const input = this._createInput();
    input.lockedSlot = target?.slot ?? 0;

    if (!target || target.isDead) {
      return input;
    }

    const preferredDistance = brain.aiProfile.preferredDistance ?? 8;
    const attackCadenceMs = brain.aiProfile.attackCadenceMs ?? 1400;
    const strafeBias = brain.aiProfile.strafeBias ?? 0.5;
    const blockChance = brain.aiProfile.blockChance ?? 0.3;

    target.position.subtractToRef(enemy.position, this._scratchA);
    const distance = this._scratchA.length();

    if (distance > 0.001) {
      this._scratchA.scaleInPlace(1 / distance);
    } else {
      this._scratchA.copyFromFloats(0, 0, 1);
    }

    if (this._timeMs >= brain.strafeReverseAt) {
      brain.strafeDir = brain.strafeDir === 1 ? -1 : 1;
      brain.strafeReverseAt = this._timeMs + 1800 + Math.random() * 1600;
    }

    const justHit = brain.lastHpAtDecision !== null && enemy.hp < brain.lastHpAtDecision - 10;
    if (justHit) {
      brain.counterWindowEnd = this._timeMs + 600;
    }
    brain.lastHpAtDecision = enemy.hp;

    // ── Reactive defense: dodge OR block when hit ──
    if (justHit) {
      const defenseRoll = Math.random();
      if (defenseRoll < 0.35) {
        input.btnDodge = true;
        return input;
      } else if (defenseRoll < 0.35 + blockChance) {
        input.btnBlock = true;
        brain.lastBlockEndAt = this._timeMs + 400 + Math.random() * 300;
        return input;
      }
    }

    // ── Sustained blocking: hold block for a short window ──
    if (this._timeMs < brain.lastBlockEndAt) {
      input.btnBlock = true;
      // Strafe while blocking
      this._scratchB.copyFromFloats(-this._scratchA.z, 0, this._scratchA.x);
      this._scratchB.scaleInPlace(brain.strafeDir * 0.4);
      input.moveX = this._scratchB.x;
      input.moveZ = this._scratchB.z;
      return input;
    }

    // ── Predictive blocking: block when close and enemy attacking ──
    if (distance < 5.5 && Math.random() < blockChance * 0.3 && this._timeMs >= brain.nextDecisionAt) {
      input.btnBlock = true;
      brain.lastBlockEndAt = this._timeMs + 250;
      return input;
    }

    const hpRatio = enemy.hp / Math.max(1, enemy.maxHP);

    // ── Transform when desperate ──
    if (hpRatio < 0.30 && enemy.ki >= 20 && Math.random() < 0.08) {
      input.btnTransform = true;
      return input;
    }

    // ── Desperate retreat: back off and blast at very low HP ──
    if (hpRatio < 0.18) {
      input.moveX = -this._scratchA.x;
      input.moveZ = -this._scratchA.z;
      if (this._timeMs >= brain.nextDecisionAt && enemy.ki >= 10 && Math.random() < 0.7) {
        brain.nextDecisionAt = this._timeMs + attackCadenceMs * 1.2;
        input.btnBlast = true;
      }
      return input;
    }

    // ── Flanking movement: approach at an angle instead of head-on ──
    const flankBias = brain.flankAngle;
    if (distance > preferredDistance + 2) {
      // Approach with flanking offset
      const cos = Math.cos(flankBias);
      const sin = Math.sin(flankBias);
      const fx = this._scratchA.x * cos - this._scratchA.z * sin;
      const fz = this._scratchA.x * sin + this._scratchA.z * cos;
      input.moveX = fx;
      input.moveZ = fz;
    } else if (distance < Math.max(2, preferredDistance - 3)) {
      input.moveX = -this._scratchA.x * 0.8;
      input.moveZ = -this._scratchA.z * 0.8;
    } else {
      // Strafe at preferred distance
      this._scratchB.copyFromFloats(-this._scratchA.z, 0, this._scratchA.x);
      this._scratchB.scaleInPlace(brain.strafeDir * strafeBias);
      input.moveX = this._scratchB.x;
      input.moveZ = this._scratchB.z;
    }

    const inCounterWindow = this._timeMs < brain.counterWindowEnd;
    const cadence = inCounterWindow ? attackCadenceMs * 0.45 : attackCadenceMs;

    if (this._timeMs >= brain.nextDecisionAt) {
      brain.nextDecisionAt = this._timeMs + cadence;

      // ── Stance switching ──
      const stances = enemy.characterDef?.stances ?? [];
      const canSwapStance = stances.includes("MELEE") && stances.includes("SWORD");
      const desiredStance = canSwapStance && distance > Math.max(4.5, preferredDistance) ? "SWORD" : "MELEE";

      if (canSwapStance && enemy.currentStance !== desiredStance && Math.random() < 0.5) {
        input.btnStance = true;
        return input;
      }

      // ── Ultimate: use when desperate or ki is high ──
      const urgentUltimate = hpRatio < 0.35 && enemy.ki >= 80;
      if ((urgentUltimate && Math.random() < 0.5) || ((brain.aiProfile.ultimateChance ?? 0) > Math.random() && enemy.ki >= 100)) {
        input.btnUltimate = true;
        return input;
      }

      // ── Counter-attack rush when in counter window and close ──
      if (distance < 4 && inCounterWindow && Math.random() > 0.5) {
        input.btnRush = true;
        return input;
      }

      // ── Grab when close and target is blocking ──
      if (distance < 3.5 && Math.random() < 0.15) {
        input.btnGrab = true;
        return input;
      }

      // ── Profile-based attack selection ──
      const attackProfile = brain.attackProfile;
      const attackType = attackProfile.attacks[brain.attackComboIndex % attackProfile.attacks.length];
      brain.attackComboIndex += 1;

      // Ranged fallback when melee attacks are out of range
      if ((attackType === "MELEE_LIGHT" || attackType === "RUSH_COMBO") && distance > 7) {
        input.btnBlast = enemy.ki >= 10;
        if (!input.btnBlast) input.btnAttack = true;
      } else {
        switch (attackType) {
          case "MELEE_LIGHT":
          case "SWORD_LIGHT":
            input.btnAttack = true;
            break;
          case "MELEE_HEAVY":
          case "SWORD_HEAVY":
            input.btnHeavy = true;
            break;
          case "KI_BLAST":
          case "SWORD_RANGED":
            input.btnBlast = enemy.ki >= 10;
            input.btnAttack = !input.btnBlast;
            break;
          case "RUSH_COMBO":
            input.btnRush = true;
            break;
          default:
            input.btnAttack = true;
            break;
        }
      }
    }

    return input;
  }

  private _buildCompanionInput(companion: AiCharacterState, leader: AiCharacterState | null, brain: BrainState): AiInputSnapshot {
    const input = this._createInput();

    if (!leader || leader.isDead) {
      return input;
    }

    const isHealer = brain.characterId === "HANA";
    const followDistance = brain.aiProfile.followDistance ?? (isHealer ? 6 : 4.5);
    const catchUpDistance = brain.aiProfile.catchUpDistance ?? 10;
    const engageDistance = brain.aiProfile.engageDistance ?? 16;
    const attackDistance = brain.aiProfile.attackDistance ?? (isHealer ? 12 : 5.5);
    const attackCadenceMs = brain.aiProfile.attackCadenceMs ?? 700;
    const blastChance = brain.aiProfile.blastChance ?? (isHealer ? 0.5 : 0.25);
    const healThreshold = brain.aiProfile.healThreshold ?? 0.65;
    const bigHealThreshold = brain.aiProfile.bigHealThreshold ?? 0.40;

    // ── Healer priority: check if leader or self needs healing ──
    if (isHealer && this._timeMs >= brain.nextHealCheckAt) {
      brain.nextHealCheckAt = this._timeMs + 400;
      const leaderHpRatio = leader.hp / Math.max(1, leader.maxHP);
      const selfHpRatio = companion.hp / Math.max(1, companion.maxHP);

      // Big heal (MAGIC_HEAL) when leader is in danger
      if (leaderHpRatio < bigHealThreshold && companion.ki >= 45) {
        input.lockedSlot = leader.slot;
        input.btnHeal = true;
        input.btnMagicAttack = true; // signals MAGIC_HEAL specifically
        brain.nextHealCheckAt = this._timeMs + 1200;
        // Move toward leader to stay in range
        leader.position.subtractToRef(companion.position, this._scratchA);
        const distToLeader = this._scratchA.length();
        if (distToLeader > 8) {
          this._scratchA.scaleInPlace(1 / Math.max(distToLeader, 0.001));
          input.moveX = this._scratchA.x;
          input.moveZ = this._scratchA.z;
        }
        return input;
      }

      // Regular heal pulse when leader is hurt
      if (leaderHpRatio < healThreshold && companion.ki >= 20) {
        input.lockedSlot = leader.slot;
        input.btnHeal = true;
        brain.nextHealCheckAt = this._timeMs + 800;
        // Move toward leader
        leader.position.subtractToRef(companion.position, this._scratchA);
        const distToLeader = this._scratchA.length();
        if (distToLeader > 15) {
          this._scratchA.scaleInPlace(1 / Math.max(distToLeader, 0.001));
          input.moveX = this._scratchA.x;
          input.moveZ = this._scratchA.z;
        }
        return input;
      }

      // Self-heal when own HP is low
      if (selfHpRatio < 0.45 && companion.ki >= 20) {
        input.btnHeal = true;
        brain.nextHealCheckAt = this._timeMs + 1000;
        return input;
      }
    }

    // ── Formation anchor position behind leader ──
    this._getForward(leader, this._scratchA);
    this._scratchB.copyFromFloats(this._scratchA.z, 0, -this._scratchA.x);
    this._scratchC.copyFrom(leader.position);
    const behindDist = isHealer ? -4.5 : -2.8;
    this._scratchA.scaleToRef(behindDist, this._scratchD);
    this._scratchC.addInPlace(this._scratchD);
    this._scratchB.scaleToRef(brain.formationOffset, this._scratchD);
    this._scratchC.addInPlace(this._scratchD);

    this._scratchC.subtractToRef(companion.position, this._scratchD);
    const distanceToAnchor = this._scratchD.length();
    const target = this._findClosestTarget(companion, "ENEMY");
    const shouldEngage = Boolean(target) && target!.position.subtract(leader.position).length() <= engageDistance;

    if (shouldEngage && target) {
      input.lockedSlot = target.slot;
      target.position.subtractToRef(companion.position, this._scratchA);
      const distanceToTarget = this._scratchA.length();

      if (distanceToTarget > 0.001) {
        this._scratchA.scaleInPlace(1 / distanceToTarget);
      } else {
        this._scratchA.copyFromFloats(0, 0, 1);
      }

      if (isHealer) {
        // ── Healer combat: stay at range, use ranged spells ──
        const safeDistance = 10;

        if (distanceToTarget < safeDistance - 2) {
          // Too close — back away
          input.moveX = -this._scratchA.x * 0.7;
          input.moveZ = -this._scratchA.z * 0.7;
        } else if (distanceToTarget > safeDistance + 4) {
          // Too far — close in a bit
          input.moveX = this._scratchA.x * 0.5;
          input.moveZ = this._scratchA.z * 0.5;
        } else {
          // Good range — strafe
          this._scratchB.copyFromFloats(-this._scratchA.z, 0, this._scratchA.x);
          this._scratchB.scaleInPlace(brain.strafeDir * 0.4);
          input.moveX = this._scratchB.x;
          input.moveZ = this._scratchB.z;
        }

        if (this._timeMs >= brain.nextDecisionAt) {
          brain.nextDecisionAt = this._timeMs + attackCadenceMs;

          if (companion.ki >= 25 && Math.random() < 0.45) {
            // Two-Hand Spell (ranged magic attack)
            input.btnMagicAttack = true;
          } else if (companion.ki >= 10 && Math.random() < blastChance) {
            // Ki blast at range
            input.btnBlast = true;
          } else if (distanceToTarget < 5) {
            // Melee if forced close
            input.btnAttack = true;
          }
        }
      } else {
        // ── Non-healer companion: standard melee/ranged combat ──
        if (distanceToTarget > attackDistance + 1.5) {
          input.moveX = this._scratchA.x;
          input.moveZ = this._scratchA.z;
        } else if (distanceToTarget < Math.max(2.4, attackDistance - 2)) {
          input.moveX = -this._scratchA.x * 0.55;
          input.moveZ = -this._scratchA.z * 0.55;
        } else {
          this._scratchB.copyFromFloats(-this._scratchA.z, 0, this._scratchA.x);
          this._scratchB.scaleInPlace(brain.strafeDir * 0.35);
          input.moveX = this._scratchB.x;
          input.moveZ = this._scratchB.z;
        }

        if (this._timeMs >= brain.nextDecisionAt) {
          brain.nextDecisionAt = this._timeMs + attackCadenceMs;
          const roll = Math.random();

          if (roll < blastChance && companion.ki >= 10 && distanceToTarget > 6) {
            input.btnBlast = true;
          } else if (distanceToTarget < 4 && roll > 0.78) {
            input.btnHeavy = true;
          } else if (distanceToTarget < attackDistance + 1) {
            input.btnAttack = true;
          }
        }
      }

      return input;
    }

    // ── Follow leader when no enemies nearby ──
    if (distanceToAnchor > catchUpDistance) {
      this._scratchD.scaleInPlace(1 / Math.max(distanceToAnchor, 0.001));
      input.moveX = this._scratchD.x;
      input.moveZ = this._scratchD.z;
    } else if (distanceToAnchor > followDistance) {
      this._scratchD.scaleInPlace(0.75 / Math.max(distanceToAnchor, 0.001));
      input.moveX = this._scratchD.x;
      input.moveZ = this._scratchD.z;
    } else {
      this._scratchA.copyFromFloats(leader.velocity.x, 0, leader.velocity.z);
      const speed = this._scratchA.length();
      if (speed > 2) {
        this._scratchA.scaleInPlace(0.45 / speed);
        input.moveX = this._scratchA.x;
        input.moveZ = this._scratchA.z;
      }
    }

    return input;
  }

  private _getForward(state: AiCharacterState, out: Vector3): void {
    if (state.rootNode?.rotation) {
      const yaw = state.rootNode.rotation.y;
      out.copyFromFloats(Math.sin(yaw), 0, Math.cos(yaw));
      return;
    }

    out.copyFromFloats(state.velocity.x, 0, state.velocity.z);
    if (out.lengthSquared() > 0.001) {
      out.normalize();
      return;
    }

    out.copyFromFloats(0, 0, 1);
  }

  private _createInput(): AiInputSnapshot {
    return {
      moveX: 0,
      moveZ: 0,
      flyY: 0,
      btnAttack: false,
      btnHeavy: false,
      btnBlast: false,
      btnUltimate: false,
      btnRush: false,
      btnGrab: false,
      btnTransform: false,
      btnTransformDown: false,
      btnDodge: false,
      btnKi: false,
      btnBlock: false,
      btnStance: false,
      btnHeal: false,
      btnMagicAttack: false,
      lockedSlot: null,
      mashCount: 0,
    };
  }
}
