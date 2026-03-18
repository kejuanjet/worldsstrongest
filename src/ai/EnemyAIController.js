import { Vector3 } from "@babylonjs/core";

export class EnemyAIController {
  constructor({ registry, movement, combat, zoneManager }) {
    this.registry = registry;
    this.movement = movement;
    this.combat = combat;
    this.zoneManager = zoneManager;
    this._brains = new Map(); // slot -> state
    this._queueInput = null;
    this._timeMs = 0;
  }

  setInputQueueSink(fn) {
    this._queueInput = fn;
  }

  _resolveSpawnPos(slot) {
    return this.registry.getState(slot)?.position?.clone?.()
      ?? this.zoneManager?.getSpawnPoint(slot)
      ?? new Vector3(0, 1, 0);
  }

  registerEnemy(slot, aiProfile = {}, characterId = "", attacks = null) {
    const attackProfile = attacks?.length
      ? { label: "EnemyDef", attacks }
      : { label: "Default", attacks: ["MELEE_LIGHT", "MELEE_HEAVY", "MELEE_LIGHT", "KI_BLAST"] };

    this._brains.set(slot, {
      role:              "ENEMY",
      characterId,
      aiProfile,
      nextDecisionAt:    0,
      strafeDir:         Math.random() > 0.5 ? 1 : -1,
      strafeReverseAt:   0,
      spawnPos:          this._resolveSpawnPos(slot),
      formationOffset:   0,
      lastHpAtDecision:  null,
      counterWindowEnd:  0,
      attackProfile,
      attackComboIndex:  0,
      lastBlockEndAt:    0,
      flankAngle:        (Math.random() - 0.5) * Math.PI * 0.6,
      nextHealCheckAt:   0,
    });
  }

  registerCompanion(slot, aiProfile = {}, characterId = "") {
    const attackProfile = { label: "Default", attacks: ["MELEE_LIGHT", "MELEE_HEAVY", "MELEE_LIGHT", "KI_BLAST"] };

    this._brains.set(slot, {
      role: "COMPANION",
      characterId,
      aiProfile,
      nextDecisionAt: 0,
      strafeDir: Math.random() > 0.5 ? 1 : -1,
      strafeReverseAt: 0,
      spawnPos: this._resolveSpawnPos(slot),
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

  removeEnemy(slot) {
    this._brains.delete(slot);
  }

  /** Returns the raw brain state for a slot (used by dumpEntityState). */
  getBrainState(slot) { return this._brains.get(slot) ?? null; }

  clear() {
    this._brains.clear();
  }

  update(step) {
    this._timeMs += step * 1000;
    if (!this._queueInput) return;

    const player = this._findHero();
    for (const [slot, brain] of this._brains) {
      const actor = this.registry.getState(slot);
      if (!actor || actor.isDead) continue;
      // Don't interrupt an in-flight attack animation — wait for the lock to clear
      if (actor.isActionLocked) continue;

      const input = brain.role === "COMPANION"
        ? this._buildCompanionInput(actor, player, brain, step)
        : this._buildEnemyInput(actor, player, brain, step);
      this._queueInput(slot, input);
    }
  }

  _findHero() {
    const heroes = this.registry.getEntitiesByTeam?.("HERO") ?? [];
    return heroes.find((s) => !s.isDead && !s.isAiControlled) ??
      heroes.find((s) => !s.isDead && s.slot === 0) ??
      this.registry.getState(0);
  }

  _findClosestTarget(originState, teamId) {
    let closest = null;
    let closestDist = Infinity;
    for (const [, candidate] of this.registry.slots) {
      if (!candidate || candidate.isDead) continue;
      if (candidate.slot === originState.slot) continue;
      if (candidate.teamId !== teamId) continue;
      const dist = Vector3.Distance(originState.position, candidate.position);
      if (dist < closestDist) {
        closestDist = dist;
        closest = candidate;
      }
    }
    return closest;
  }

  // ─── Improved Enemy AI ──────────────────────────────────────────────────────
  _buildEnemyInput(enemy, player, brain, step) {
    const ai = brain.aiProfile || {};
    const preferredDistance = ai.preferredDistance ?? 8;
    const attackCadenceMs   = ai.attackCadenceMs   ?? 1400;
    const strafeBias        = ai.strafeBias        ?? 0.5;
    const blockChance       = ai.blockChance        ?? 0.3;

    const input = {
      moveX: 0, moveZ: 0, flyY: 0,
      btnAttack: false, btnHeavy: false, btnBlast: false, btnUltimate: false,
      btnRush: false, btnGrab: false, btnTransform: false, btnTransformDown: false,
      btnDodge: false, btnKi: false, btnBlock: false, btnStance: false,
      btnHeal: false, btnMagicAttack: false,
      lockedSlot: player?.slot ?? 0,
      mashCount: 0,
    };

    if (!player || player.isDead) return input;

    const toHero   = player.position.subtract(enemy.position);
    const dist     = toHero.length();
    const dir      = dist > 0.01 ? toHero.scale(1 / dist) : Vector3.Zero();
    const stances  = enemy.characterDef?.stances ?? [];
    const canSwap  = stances.includes("MELEE") && stances.includes("SWORD");
    const hpRatio  = enemy.hp / (enemy.maxHP || 1);

    // ── Strafe direction reversal (faster) ─────────────────────────────────
    if (this._timeMs >= brain.strafeReverseAt) {
      brain.strafeDir *= -1;
      brain.strafeReverseAt = this._timeMs + 1800 + Math.random() * 1600;
    }

    // ── Detect if enemy was just hit ────────────────────────────────────────
    const justHit = brain.lastHpAtDecision != null && enemy.hp < brain.lastHpAtDecision - 10;
    if (justHit) {
      brain.counterWindowEnd = this._timeMs + 600;
    }
    brain.lastHpAtDecision = enemy.hp;

    // ── Reactive defense: dodge OR block when hit ───────────────────────────
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

    // ── Sustained blocking: hold block for a short window ───────────────────
    if (this._timeMs < brain.lastBlockEndAt) {
      input.btnBlock = true;
      const tangent = new Vector3(-dir.z, 0, dir.x).scale(brain.strafeDir * 0.4);
      input.moveX = tangent.x;
      input.moveZ = tangent.z;
      return input;
    }

    // ── Predictive blocking when close ──────────────────────────────────────
    if (dist < 5.5 && Math.random() < blockChance * 0.3 && this._timeMs >= brain.nextDecisionAt) {
      input.btnBlock = true;
      brain.lastBlockEndAt = this._timeMs + 250;
      return input;
    }

    // ── Transform when desperate ────────────────────────────────────────────
    if (hpRatio < 0.30 && enemy.ki >= 20 && Math.random() < 0.08) {
      input.btnTransform = true;
      input.btnTransformDown = true;
      return input;
    }

    // ── Retreat at critically low HP ────────────────────────────────────────
    if (hpRatio < 0.18) {
      input.moveX = -dir.x;
      input.moveZ = -dir.z;
      if (this._timeMs >= brain.nextDecisionAt && enemy.ki >= 10) {
        brain.nextDecisionAt = this._timeMs + attackCadenceMs * 1.2;
        if (Math.random() < 0.7) input.btnBlast = true;
      }
      return input;
    }

    // ── Flanking movement ───────────────────────────────────────────────────
    const flankAngle = brain.flankAngle || 0;
    if (dist > preferredDistance + 2) {
      const cos = Math.cos(flankAngle);
      const sin = Math.sin(flankAngle);
      input.moveX = dir.x * cos - dir.z * sin;
      input.moveZ = dir.x * sin + dir.z * cos;
    } else if (dist < Math.max(2, preferredDistance - 3)) {
      input.moveX = -dir.x * 0.8;
      input.moveZ = -dir.z * 0.8;
    } else {
      const tangent = new Vector3(-dir.z, 0, dir.x).scale(brain.strafeDir);
      input.moveX = tangent.x * strafeBias;
      input.moveZ = tangent.z * strafeBias;
    }

    // ── Attack decisions ────────────────────────────────────────────────────
    const inCounterWindow = this._timeMs < brain.counterWindowEnd;
    const effectiveCadence = inCounterWindow ? attackCadenceMs * 0.45 : attackCadenceMs;

    if (this._timeMs >= brain.nextDecisionAt) {
      brain.nextDecisionAt = this._timeMs + effectiveCadence;

      // Stance swap
      const desiredStance = canSwap && dist > Math.max(4.5, preferredDistance) ? "SWORD" : "MELEE";
      if (canSwap && enemy.currentStance !== desiredStance && Math.random() < 0.5) {
        input.btnStance = true;
        return input;
      }

      // Ultimate
      const urgentUltimate = hpRatio < 0.35 && enemy.ki >= 80;
      const normalUltimate = ai.ultimateChance > 0 && Math.random() < ai.ultimateChance && enemy.ki >= 100;
      if ((urgentUltimate && Math.random() < 0.5) || normalUltimate) {
        input.btnUltimate = true;
        return input;
      }

      // Counter rush
      if (dist < 4 && inCounterWindow && Math.random() > 0.5) {
        input.btnRush = true;
        return input;
      }

      // Grab when close (breaks guard)
      if (dist < 3.5 && Math.random() < 0.15) {
        input.btnGrab = true;
        return input;
      }

      // Profile-based attack
      const profile = brain.attackProfile;
      const attackType = profile.attacks[brain.attackComboIndex % profile.attacks.length];
      brain.attackComboIndex++;

      if ((attackType === "MELEE_LIGHT" || attackType === "RUSH_COMBO") && dist > 7) {
        if (enemy.ki >= 10) input.btnBlast = true;
        else input.btnAttack = true;
      } else {
        switch (attackType) {
          case "MELEE_LIGHT":
          case "SWORD_LIGHT":
            input.btnAttack = true; break;
          case "MELEE_HEAVY":
          case "SWORD_HEAVY":
            input.btnHeavy  = true; break;
          case "KI_BLAST":
          case "SWORD_RANGED":
            if (enemy.ki >= 10) input.btnBlast = true; else input.btnAttack = true; break;
          case "RUSH_COMBO":
            input.btnRush   = true; break;
          default:
            input.btnAttack = true;
        }
      }
    }

    return input;
  }

  // ─── Companion AI (Hana healer + generic) ───────────────────────────────────
  _buildCompanionInput(companion, leader, brain) {
    const ai = brain.aiProfile || {};
    const isHealer = brain.characterId === "HANA";
    const followDistance = ai.followDistance ?? (isHealer ? 6 : 4.5);
    const catchUpDistance = ai.catchUpDistance ?? 10;
    const engageDistance = ai.engageDistance ?? 16;
    const attackDistance = ai.attackDistance ?? (isHealer ? 12 : 5.5);
    const attackCadenceMs = ai.attackCadenceMs ?? 700;
    const blastChance = ai.blastChance ?? (isHealer ? 0.5 : 0.25);
    const healThreshold = ai.healThreshold ?? 0.65;
    const bigHealThreshold = ai.bigHealThreshold ?? 0.40;

    const input = {
      moveX: 0, moveZ: 0, flyY: 0,
      btnAttack: false, btnHeavy: false, btnBlast: false, btnUltimate: false,
      btnRush: false, btnGrab: false, btnTransform: false, btnTransformDown: false,
      btnDodge: false, btnKi: false, btnBlock: false, btnStance: false,
      btnHeal: false, btnMagicAttack: false,
      lockedSlot: null,
      mashCount: 0,
    };

    if (!leader || leader.isDead) return input;

    // ── Healer priority: check if leader or self needs healing ──────────────
    if (isHealer && this._timeMs >= (brain.nextHealCheckAt || 0)) {
      brain.nextHealCheckAt = this._timeMs + 400;
      const leaderHpRatio = leader.hp / (leader.maxHP || 1);
      const selfHpRatio = companion.hp / (companion.maxHP || 1);

      // Big heal (MAGIC_HEAL) when leader is in danger
      if (leaderHpRatio < bigHealThreshold && companion.ki >= 45) {
        input.lockedSlot = leader.slot;
        input.btnHeal = true;
        input.btnMagicAttack = true; // signals MAGIC_HEAL
        brain.nextHealCheckAt = this._timeMs + 1200;
        const toLeader = leader.position.subtract(companion.position);
        const distToLeader = toLeader.length();
        if (distToLeader > 8) {
          const moveDir = toLeader.scale(1 / Math.max(distToLeader, 0.001));
          input.moveX = moveDir.x;
          input.moveZ = moveDir.z;
        }
        return input;
      }

      // Regular heal pulse when leader is hurt
      if (leaderHpRatio < healThreshold && companion.ki >= 20) {
        input.lockedSlot = leader.slot;
        input.btnHeal = true;
        brain.nextHealCheckAt = this._timeMs + 800;
        const toLeader = leader.position.subtract(companion.position);
        const distToLeader = toLeader.length();
        if (distToLeader > 15) {
          const moveDir = toLeader.scale(1 / Math.max(distToLeader, 0.001));
          input.moveX = moveDir.x;
          input.moveZ = moveDir.z;
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

    // ── Formation anchor position behind leader ─────────────────────────────
    const leaderForward = this._getForward(leader);
    const leaderRight = new Vector3(leaderForward.z, 0, -leaderForward.x).normalize();
    const behindDist = isHealer ? 4.5 : 2.8;
    const anchor = leader.position
      .subtract(leaderForward.scale(behindDist))
      .add(leaderRight.scale(brain.formationOffset ?? 0));
    const toAnchor = anchor.subtract(companion.position);
    const distToAnchor = toAnchor.length();

    const target = this._findClosestTarget(companion, "ENEMY");
    const shouldEngage = target && Vector3.Distance(target.position, leader.position) <= engageDistance;

    if (shouldEngage) {
      input.lockedSlot = target.slot;
      const toTarget = target.position.subtract(companion.position);
      const distToTarget = toTarget.length();
      const dir = distToTarget > 0.01 ? toTarget.scale(1 / distToTarget) : Vector3.Zero();

      if (isHealer) {
        // ── Healer combat: stay at range, use ranged spells ─────────────────
        const safeDistance = 10;

        if (distToTarget < safeDistance - 2) {
          input.moveX = -dir.x * 0.7;
          input.moveZ = -dir.z * 0.7;
        } else if (distToTarget > safeDistance + 4) {
          input.moveX = dir.x * 0.5;
          input.moveZ = dir.z * 0.5;
        } else {
          const tangent = new Vector3(-dir.z, 0, dir.x).scale((brain.strafeDir || 1) * 0.4);
          input.moveX = tangent.x;
          input.moveZ = tangent.z;
        }

        if (this._timeMs >= brain.nextDecisionAt) {
          brain.nextDecisionAt = this._timeMs + attackCadenceMs;

          if (companion.ki >= 25 && Math.random() < 0.45) {
            // Two-Hand Spell (ranged magic attack)
            input.btnMagicAttack = true;
          } else if (companion.ki >= 10 && Math.random() < blastChance) {
            input.btnBlast = true;
          } else if (distToTarget < 5) {
            input.btnAttack = true;
          }
        }
      } else {
        // ── Non-healer companion: standard melee/ranged combat ──────────────
        if (distToTarget > attackDistance + 1.5) {
          input.moveX = dir.x;
          input.moveZ = dir.z;
        } else if (distToTarget < Math.max(2.4, attackDistance - 2)) {
          input.moveX = -dir.x * 0.55;
          input.moveZ = -dir.z * 0.55;
        } else {
          const tangent = new Vector3(-dir.z, 0, dir.x).scale((brain.strafeDir || 1) * 0.35);
          input.moveX = tangent.x;
          input.moveZ = tangent.z;
        }

        if (this._timeMs >= brain.nextDecisionAt) {
          brain.nextDecisionAt = this._timeMs + attackCadenceMs;
          const roll = Math.random();
          if (roll < blastChance && companion.ki >= 10 && distToTarget > 6) input.btnBlast = true;
          else if (distToTarget < 4 && roll > 0.78) input.btnHeavy = true;
          else if (distToTarget < attackDistance + 1) input.btnAttack = true;
        }
      }

      return input;
    }

    // ── Follow leader when no enemies nearby ────────────────────────────────
    if (distToAnchor > catchUpDistance) {
      const moveDir = toAnchor.normalize();
      input.moveX = moveDir.x;
      input.moveZ = moveDir.z;
    } else if (distToAnchor > followDistance + 1.5) {
      const t = Math.min(1, (distToAnchor - followDistance) / (catchUpDistance - followDistance));
      const mag = 0.35 + t * 0.45;
      const moveDir = toAnchor.normalize();
      input.moveX = moveDir.x * mag;
      input.moveZ = moveDir.z * mag;
    } else {
      const leaderSpeed = Math.sqrt((leader.velocity?.x ?? 0) ** 2 + (leader.velocity?.z ?? 0) ** 2);
      if (leaderSpeed > 4 && distToAnchor > 2) {
        const moveDir = new Vector3(leader.velocity?.x ?? 0, 0, leader.velocity?.z ?? 0).normalize().scale(0.35);
        input.moveX = moveDir.x;
        input.moveZ = moveDir.z;
      }
    }

    return input;
  }

  _getForward(state) {
    if (state?.rootNode?.rotation) {
      const yaw = state.rootNode.rotation.y ?? 0;
      return new Vector3(Math.sin(yaw), 0, Math.cos(yaw)).normalize();
    }

    const planarVelocity = new Vector3(state?.velocity?.x ?? 0, 0, state?.velocity?.z ?? 0);
    if (planarVelocity.lengthSquared() > 0.01) {
      return planarVelocity.normalize();
    }

    return new Vector3(0, 0, 1);
  }
}
