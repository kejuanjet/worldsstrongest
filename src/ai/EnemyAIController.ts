// src/ai/EnemyAIController.ts
// AI decision-making for enemies and companions.
// Builds a synthetic InputState each frame based on behavior profiles.

import { Vector3 } from "@babylonjs/core";
import type { AIReadState, QueryableRegistry } from "../core/types/CharacterViews.js";
import type { EntityTeam } from "../data/gameData.js";

import {
  // Enemy
  ENEMY_STRAFE_REVERSAL_BASE_MS,
  ENEMY_STRAFE_REVERSAL_JITTER_MS,
  ENEMY_COUNTER_WINDOW_MS,
  ENEMY_HIT_DETECTION_THRESHOLD,
  ENEMY_DODGE_CHANCE,
  ENEMY_BLOCK_SUSTAIN_BASE_MS,
  ENEMY_BLOCK_SUSTAIN_JITTER_MS,
  ENEMY_PREDICTIVE_BLOCK_RANGE,
  ENEMY_PREDICTIVE_BLOCK_WINDOW_MS,
  ENEMY_TRANSFORM_HP_THRESHOLD,
  ENEMY_TRANSFORM_KI_MINIMUM,
  ENEMY_TRANSFORM_CHANCE,
  ENEMY_RETREAT_HP_THRESHOLD,
  ENEMY_RETREAT_CADENCE_MULTIPLIER,
  ENEMY_RETREAT_BLAST_CHANCE,
  ENEMY_RETREAT_BLAST_KI_COST,
  ENEMY_URGENT_ULTIMATE_HP,
  ENEMY_URGENT_ULTIMATE_KI,
  ENEMY_URGENT_ULTIMATE_CHANCE,
  ENEMY_NORMAL_ULTIMATE_KI,
  ENEMY_COUNTER_RUSH_RANGE,
  ENEMY_COUNTER_RUSH_CHANCE,
  ENEMY_GRAB_RANGE,
  ENEMY_GRAB_CHANCE,
  ENEMY_MELEE_RANGE_FALLBACK,
  ENEMY_BLAST_KI_COST,
  ENEMY_COUNTER_CADENCE_MULTIPLIER,
  ENEMY_STANCE_SWAP_CHANCE,
  ENEMY_STANCE_DISTANCE_MIN,
  ENEMY_RETREAT_MOVE_SCALE,
  ENEMY_CLOSE_RANGE_OFFSET,
  ENEMY_FAR_RANGE_OFFSET,
  DEFAULT_PREFERRED_DISTANCE,
  DEFAULT_ATTACK_CADENCE_MS,
  DEFAULT_STRAFE_BIAS,
  DEFAULT_BLOCK_CHANCE,
  DEFAULT_PREDICTIVE_BLOCK_SCALE,
  // Companion
  COMPANION_BIG_HEAL_KI_COST,
  COMPANION_HEAL_KI_COST,
  COMPANION_SELF_HEAL_HP_THRESHOLD,
  COMPANION_BIG_HEAL_MOVE_THRESHOLD,
  COMPANION_HEAL_MOVE_THRESHOLD,
  COMPANION_HEAL_CHECK_INTERVAL_MS,
  COMPANION_BIG_HEAL_COOLDOWN_MS,
  COMPANION_HEAL_COOLDOWN_MS,
  COMPANION_SELF_HEAL_COOLDOWN_MS,
  COMPANION_HEALER_SAFE_DISTANCE,
  COMPANION_HEALER_SAFE_INNER,
  COMPANION_HEALER_SAFE_OUTER,
  COMPANION_HEALER_SPELL_KI_COST,
  COMPANION_HEALER_SPELL_CHANCE,
  COMPANION_HEALER_BLAST_KI_COST,
  COMPANION_HEALER_MELEE_RANGE,
  COMPANION_FIGHTER_CLOSE_RANGE,
  COMPANION_FIGHTER_CLOSE_SCALE,
  COMPANION_FIGHTER_STRAFE_SCALE,
  COMPANION_FIGHTER_HEAVY_RANGE,
  COMPANION_FIGHTER_HEAVY_ROLL,
  COMPANION_FIGHTER_BLAST_RANGE,
  COMPANION_HEALER_BEHIND_DISTANCE,
  COMPANION_FIGHTER_BEHIND_DISTANCE,
  COMPANION_LEADER_SPEED_THRESHOLD,
  COMPANION_IDLE_SPEED_SCALE,
  COMPANION_CATCHUP_MIN_SPEED,
  COMPANION_CATCHUP_SPEED_RANGE,
  COMPANION_HEALER_STRAFE_SCALE,
  COMPANION_HEALER_APPROACH_SCALE,
  COMPANION_HEALER_RETREAT_SCALE,
  DEFAULT_HEALER_FOLLOW_DISTANCE,
  DEFAULT_FIGHTER_FOLLOW_DISTANCE,
  DEFAULT_CATCHUP_DISTANCE,
  DEFAULT_ENGAGE_DISTANCE,
  DEFAULT_HEALER_ATTACK_DISTANCE,
  DEFAULT_FIGHTER_ATTACK_DISTANCE,
  DEFAULT_COMPANION_CADENCE_MS,
  DEFAULT_HEALER_BLAST_CHANCE,
  DEFAULT_FIGHTER_BLAST_CHANCE,
  DEFAULT_HEAL_THRESHOLD,
  DEFAULT_BIG_HEAL_THRESHOLD,
} from "./AIConstants.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AIProfile {
  preferredDistance?: number;
  attackCadenceMs?: number;
  strafeBias?: number;
  blockChance?: number;
  ultimateChance?: number;
  followDistance?: number;
  catchUpDistance?: number;
  engageDistance?: number;
  attackDistance?: number;
  blastChance?: number;
  healThreshold?: number;
  bigHealThreshold?: number;
  formationOffset?: number;
}

export interface BrainState {
  role: "ENEMY" | "COMPANION";
  characterId: string;
  aiProfile: AIProfile;
  nextDecisionAt: number;
  strafeDir: 1 | -1;
  strafeReverseAt: number;
  spawnPos: Vector3;
  formationOffset: number;
  lastHpAtDecision: number | null;
  counterWindowEnd: number;
  attackProfile: AttackProfile;
  attackComboIndex: number;
  lastBlockEndAt: number;
  flankAngle: number;
  nextHealCheckAt: number;
}

export interface AttackProfile {
  label: string;
  attacks: string[];
}

export interface AIInput {
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

type InputQueueSink = (slot: number, input: AIInput) => void;

interface ZoneManagerLike {
  getSpawnPoint?(slot: number): Vector3 | undefined;
}

// ─── Controller ──────────────────────────────────────────────────────────────

export class EnemyAIController {
  private readonly registry: QueryableRegistry<AIReadState>;
  private readonly zoneManager: ZoneManagerLike | null;
  private readonly _brains = new Map<number, BrainState>();
  private _queueInput: InputQueueSink | null = null;
  private _timeMs = 0;

  constructor({ registry, zoneManager }: {
    registry: QueryableRegistry<AIReadState>;
    movement?: unknown;
    combat?: unknown;
    zoneManager?: ZoneManagerLike | null;
  }) {
    this.registry = registry;
    this.zoneManager = zoneManager ?? null;
  }

  setInputQueueSink(fn: InputQueueSink): void {
    this._queueInput = fn;
  }

  private _resolveSpawnPos(slot: number): Vector3 {
    return this.registry.getState(slot)?.position?.clone?.()
      ?? this.zoneManager?.getSpawnPoint?.(slot)
      ?? new Vector3(0, 1, 0);
  }

  registerEnemy(slot: number, aiProfile: AIProfile = {}, characterId = "", attacks: string[] | null = null): void {
    const attackProfile: AttackProfile = attacks?.length
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

  registerCompanion(slot: number, aiProfile: AIProfile = {}, characterId = ""): void {
    const attackProfile: AttackProfile = { label: "Default", attacks: ["MELEE_LIGHT", "MELEE_HEAVY", "MELEE_LIGHT", "KI_BLAST"] };

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

  removeEnemy(slot: number): void {
    this._brains.delete(slot);
  }

  /** Returns the raw brain state for a slot (used by dumpEntityState). */
  getBrainState(slot: number): BrainState | null {
    return this._brains.get(slot) ?? null;
  }

  clear(): void {
    this._brains.clear();
  }

  update(step: number): void {
    this._timeMs += step * 1000;
    if (!this._queueInput) return;

    const player = this._findHero();
    for (const [slot, brain] of this._brains) {
      const actor = this.registry.getState(slot);
      if (!actor || actor.isDead) continue;
      if (actor.isActionLocked) continue;

      const input = brain.role === "COMPANION"
        ? this._buildCompanionInput(actor, player, brain)
        : this._buildEnemyInput(actor, player, brain);
      this._queueInput(slot, input);
    }
  }

  private _findHero(): AIReadState | null {
    const heroes = this.registry.getEntitiesByTeam?.("HERO") ?? [];
    return heroes.find((s) => !s.isDead && !s.isActionLocked) ??
      heroes.find((s) => !s.isDead && s.slot === 0) ??
      this.registry.getState(0);
  }

  private _findClosestTarget(originState: AIReadState, teamId: EntityTeam): AIReadState | null {
    let closest: AIReadState | null = null;
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

  private _createEmptyInput(lockedSlot: number | null = null): AIInput {
    return {
      moveX: 0, moveZ: 0, flyY: 0,
      btnAttack: false, btnHeavy: false, btnBlast: false, btnUltimate: false,
      btnRush: false, btnGrab: false, btnTransform: false, btnTransformDown: false,
      btnDodge: false, btnKi: false, btnBlock: false, btnStance: false,
      btnHeal: false, btnMagicAttack: false,
      lockedSlot,
      mashCount: 0,
    };
  }

  // ─── Enemy AI ──────────────────────────────────────────────────────────────

  private _buildEnemyInput(enemy: AIReadState, player: AIReadState | null, brain: BrainState): AIInput {
    const ai = brain.aiProfile;
    const preferredDistance = ai.preferredDistance ?? DEFAULT_PREFERRED_DISTANCE;
    const attackCadenceMs   = ai.attackCadenceMs   ?? DEFAULT_ATTACK_CADENCE_MS;
    const strafeBias        = ai.strafeBias        ?? DEFAULT_STRAFE_BIAS;
    const blockChance       = ai.blockChance       ?? DEFAULT_BLOCK_CHANCE;

    const input = this._createEmptyInput(player?.slot ?? 0);

    if (!player || player.isDead) return input;

    const toHero   = player.position.subtract(enemy.position);
    const dist     = toHero.length();
    const dir      = dist > 0.01 ? toHero.scale(1 / dist) : Vector3.Zero();
    const stances  = enemy.characterDef?.stances ?? [];
    const canSwap  = stances.includes("MELEE") && stances.includes("SWORD");
    const hpRatio  = enemy.hp / (enemy.maxHP || 1);

    // ── Strafe direction reversal ────────────────────────────────────────────
    if (this._timeMs >= brain.strafeReverseAt) {
      brain.strafeDir *= -1;
      brain.strafeReverseAt = this._timeMs + ENEMY_STRAFE_REVERSAL_BASE_MS + Math.random() * ENEMY_STRAFE_REVERSAL_JITTER_MS;
    }

    // ── Detect if enemy was just hit ─────────────────────────────────────────
    const justHit = brain.lastHpAtDecision != null && enemy.hp < brain.lastHpAtDecision - ENEMY_HIT_DETECTION_THRESHOLD;
    if (justHit) {
      brain.counterWindowEnd = this._timeMs + ENEMY_COUNTER_WINDOW_MS;
    }
    brain.lastHpAtDecision = enemy.hp;

    // ── Reactive defense: dodge OR block when hit ────────────────────────────
    if (justHit) {
      const defenseRoll = Math.random();
      if (defenseRoll < ENEMY_DODGE_CHANCE) {
        input.btnDodge = true;
        return input;
      } else if (defenseRoll < ENEMY_DODGE_CHANCE + blockChance) {
        input.btnBlock = true;
        brain.lastBlockEndAt = this._timeMs + ENEMY_BLOCK_SUSTAIN_BASE_MS + Math.random() * ENEMY_BLOCK_SUSTAIN_JITTER_MS;
        return input;
      }
    }

    // ── Sustained blocking ───────────────────────────────────────────────────
    if (this._timeMs < brain.lastBlockEndAt) {
      input.btnBlock = true;
      const tangent = new Vector3(-dir.z, 0, dir.x).scale(brain.strafeDir * 0.4);
      input.moveX = tangent.x;
      input.moveZ = tangent.z;
      return input;
    }

    // ── Predictive blocking when close ───────────────────────────────────────
    if (dist < ENEMY_PREDICTIVE_BLOCK_RANGE && Math.random() < blockChance * DEFAULT_PREDICTIVE_BLOCK_SCALE && this._timeMs >= brain.nextDecisionAt) {
      input.btnBlock = true;
      brain.lastBlockEndAt = this._timeMs + ENEMY_PREDICTIVE_BLOCK_WINDOW_MS;
      return input;
    }

    // ── Transform when desperate ─────────────────────────────────────────────
    if (hpRatio < ENEMY_TRANSFORM_HP_THRESHOLD && enemy.ki >= ENEMY_TRANSFORM_KI_MINIMUM && Math.random() < ENEMY_TRANSFORM_CHANCE) {
      input.btnTransform = true;
      input.btnTransformDown = true;
      return input;
    }

    // ── Retreat at critically low HP ─────────────────────────────────────────
    if (hpRatio < ENEMY_RETREAT_HP_THRESHOLD) {
      input.moveX = -dir.x;
      input.moveZ = -dir.z;
      if (this._timeMs >= brain.nextDecisionAt && enemy.ki >= ENEMY_RETREAT_BLAST_KI_COST) {
        brain.nextDecisionAt = this._timeMs + attackCadenceMs * ENEMY_RETREAT_CADENCE_MULTIPLIER;
        if (Math.random() < ENEMY_RETREAT_BLAST_CHANCE) input.btnBlast = true;
      }
      return input;
    }

    // ── Flanking movement ────────────────────────────────────────────────────
    const flankAngle = brain.flankAngle || 0;
    if (dist > preferredDistance + ENEMY_FAR_RANGE_OFFSET) {
      const cos = Math.cos(flankAngle);
      const sin = Math.sin(flankAngle);
      input.moveX = dir.x * cos - dir.z * sin;
      input.moveZ = dir.x * sin + dir.z * cos;
    } else if (dist < Math.max(2, preferredDistance - ENEMY_CLOSE_RANGE_OFFSET)) {
      input.moveX = -dir.x * ENEMY_RETREAT_MOVE_SCALE;
      input.moveZ = -dir.z * ENEMY_RETREAT_MOVE_SCALE;
    } else {
      const tangent = new Vector3(-dir.z, 0, dir.x).scale(brain.strafeDir);
      input.moveX = tangent.x * strafeBias;
      input.moveZ = tangent.z * strafeBias;
    }

    // ── Attack decisions ─────────────────────────────────────────────────────
    const inCounterWindow = this._timeMs < brain.counterWindowEnd;
    const effectiveCadence = inCounterWindow ? attackCadenceMs * ENEMY_COUNTER_CADENCE_MULTIPLIER : attackCadenceMs;

    if (this._timeMs >= brain.nextDecisionAt) {
      brain.nextDecisionAt = this._timeMs + effectiveCadence;

      // Stance swap
      const desiredStance = canSwap && dist > Math.max(ENEMY_STANCE_DISTANCE_MIN, preferredDistance) ? "SWORD" : "MELEE";
      if (canSwap && enemy.currentStance !== desiredStance && Math.random() < ENEMY_STANCE_SWAP_CHANCE) {
        input.btnStance = true;
        return input;
      }

      // Ultimate
      const urgentUltimate = hpRatio < ENEMY_URGENT_ULTIMATE_HP && enemy.ki >= ENEMY_URGENT_ULTIMATE_KI;
      const normalUltimate = (ai.ultimateChance ?? 0) > 0 && Math.random() < (ai.ultimateChance ?? 0) && enemy.ki >= ENEMY_NORMAL_ULTIMATE_KI;
      if ((urgentUltimate && Math.random() < ENEMY_URGENT_ULTIMATE_CHANCE) || normalUltimate) {
        input.btnUltimate = true;
        return input;
      }

      // Counter rush
      if (dist < ENEMY_COUNTER_RUSH_RANGE && inCounterWindow && Math.random() > ENEMY_COUNTER_RUSH_CHANCE) {
        input.btnRush = true;
        return input;
      }

      // Grab (breaks guard)
      if (dist < ENEMY_GRAB_RANGE && Math.random() < ENEMY_GRAB_CHANCE) {
        input.btnGrab = true;
        return input;
      }

      // Profile-based attack
      const profile = brain.attackProfile;
      const attackType = profile.attacks[brain.attackComboIndex % profile.attacks.length];
      brain.attackComboIndex++;

      if ((attackType === "MELEE_LIGHT" || attackType === "RUSH_COMBO") && dist > ENEMY_MELEE_RANGE_FALLBACK) {
        if (enemy.ki >= ENEMY_BLAST_KI_COST) input.btnBlast = true;
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
            if (enemy.ki >= ENEMY_BLAST_KI_COST) input.btnBlast = true; else input.btnAttack = true; break;
          case "RUSH_COMBO":
            input.btnRush   = true; break;
          default:
            input.btnAttack = true;
        }
      }
    }

    return input;
  }

  // ─── Companion AI ──────────────────────────────────────────────────────────

  private _buildCompanionInput(companion: AIReadState, leader: AIReadState | null, brain: BrainState): AIInput {
    const ai = brain.aiProfile;
    const isHealer = brain.characterId === "HANA";
    const followDistance = ai.followDistance ?? (isHealer ? DEFAULT_HEALER_FOLLOW_DISTANCE : DEFAULT_FIGHTER_FOLLOW_DISTANCE);
    const catchUpDistance = ai.catchUpDistance ?? DEFAULT_CATCHUP_DISTANCE;
    const engageDistance = ai.engageDistance ?? DEFAULT_ENGAGE_DISTANCE;
    const attackDistance = ai.attackDistance ?? (isHealer ? DEFAULT_HEALER_ATTACK_DISTANCE : DEFAULT_FIGHTER_ATTACK_DISTANCE);
    const attackCadenceMs = ai.attackCadenceMs ?? DEFAULT_COMPANION_CADENCE_MS;
    const blastChance = ai.blastChance ?? (isHealer ? DEFAULT_HEALER_BLAST_CHANCE : DEFAULT_FIGHTER_BLAST_CHANCE);
    const healThreshold = ai.healThreshold ?? DEFAULT_HEAL_THRESHOLD;
    const bigHealThreshold = ai.bigHealThreshold ?? DEFAULT_BIG_HEAL_THRESHOLD;

    const input = this._createEmptyInput(null);

    if (!leader || leader.isDead) return input;

    // ── Healer priority: check if leader or self needs healing ───────────────
    if (isHealer && this._timeMs >= (brain.nextHealCheckAt || 0)) {
      brain.nextHealCheckAt = this._timeMs + COMPANION_HEAL_CHECK_INTERVAL_MS;
      const leaderHpRatio = leader.hp / (leader.maxHP || 1);
      const selfHpRatio = companion.hp / (companion.maxHP || 1);

      // Big heal when leader is in danger
      if (leaderHpRatio < bigHealThreshold && companion.ki >= COMPANION_BIG_HEAL_KI_COST) {
        input.lockedSlot = leader.slot;
        input.btnHeal = true;
        input.btnMagicAttack = true;
        brain.nextHealCheckAt = this._timeMs + COMPANION_BIG_HEAL_COOLDOWN_MS;
        const toLeader = leader.position.subtract(companion.position);
        const distToLeader = toLeader.length();
        if (distToLeader > COMPANION_BIG_HEAL_MOVE_THRESHOLD) {
          const moveDir = toLeader.scale(1 / Math.max(distToLeader, 0.001));
          input.moveX = moveDir.x;
          input.moveZ = moveDir.z;
        }
        return input;
      }

      // Regular heal pulse when leader is hurt
      if (leaderHpRatio < healThreshold && companion.ki >= COMPANION_HEAL_KI_COST) {
        input.lockedSlot = leader.slot;
        input.btnHeal = true;
        brain.nextHealCheckAt = this._timeMs + COMPANION_HEAL_COOLDOWN_MS;
        const toLeader = leader.position.subtract(companion.position);
        const distToLeader = toLeader.length();
        if (distToLeader > COMPANION_HEAL_MOVE_THRESHOLD) {
          const moveDir = toLeader.scale(1 / Math.max(distToLeader, 0.001));
          input.moveX = moveDir.x;
          input.moveZ = moveDir.z;
        }
        return input;
      }

      // Self-heal when own HP is low
      if (selfHpRatio < COMPANION_SELF_HEAL_HP_THRESHOLD && companion.ki >= COMPANION_HEAL_KI_COST) {
        input.btnHeal = true;
        brain.nextHealCheckAt = this._timeMs + COMPANION_SELF_HEAL_COOLDOWN_MS;
        return input;
      }
    }

    // ── Formation anchor position behind leader ──────────────────────────────
    const leaderForward = this._getForward(leader);
    const leaderRight = new Vector3(leaderForward.z, 0, -leaderForward.x).normalize();
    const behindDist = isHealer ? COMPANION_HEALER_BEHIND_DISTANCE : COMPANION_FIGHTER_BEHIND_DISTANCE;
    const anchor = leader.position
      .subtract(leaderForward.scale(behindDist))
      .add(leaderRight.scale(brain.formationOffset ?? 0));
    const toAnchor = anchor.subtract(companion.position);
    const distToAnchor = toAnchor.length();

    const target = this._findClosestTarget(companion, "ENEMY");
    const shouldEngage = target && Vector3.Distance(target.position, leader.position) <= engageDistance;

    if (shouldEngage && target) {
      input.lockedSlot = target.slot;
      const toTarget = target.position.subtract(companion.position);
      const distToTarget = toTarget.length();
      const dir = distToTarget > 0.01 ? toTarget.scale(1 / distToTarget) : Vector3.Zero();

      if (isHealer) {
        // ── Healer combat: stay at range, use ranged spells ──────────────────
        if (distToTarget < COMPANION_HEALER_SAFE_DISTANCE - COMPANION_HEALER_SAFE_INNER) {
          input.moveX = -dir.x * COMPANION_HEALER_RETREAT_SCALE;
          input.moveZ = -dir.z * COMPANION_HEALER_RETREAT_SCALE;
        } else if (distToTarget > COMPANION_HEALER_SAFE_DISTANCE + COMPANION_HEALER_SAFE_OUTER) {
          input.moveX = dir.x * COMPANION_HEALER_APPROACH_SCALE;
          input.moveZ = dir.z * COMPANION_HEALER_APPROACH_SCALE;
        } else {
          const tangent = new Vector3(-dir.z, 0, dir.x).scale((brain.strafeDir || 1) * COMPANION_HEALER_STRAFE_SCALE);
          input.moveX = tangent.x;
          input.moveZ = tangent.z;
        }

        if (this._timeMs >= brain.nextDecisionAt) {
          brain.nextDecisionAt = this._timeMs + attackCadenceMs;
          if (companion.ki >= COMPANION_HEALER_SPELL_KI_COST && Math.random() < COMPANION_HEALER_SPELL_CHANCE) {
            input.btnMagicAttack = true;
          } else if (companion.ki >= COMPANION_HEALER_BLAST_KI_COST && Math.random() < blastChance) {
            input.btnBlast = true;
          } else if (distToTarget < COMPANION_HEALER_MELEE_RANGE) {
            input.btnAttack = true;
          }
        }
      } else {
        // ── Non-healer companion: standard melee/ranged combat ───────────────
        if (distToTarget > attackDistance + 1.5) {
          input.moveX = dir.x;
          input.moveZ = dir.z;
        } else if (distToTarget < Math.max(COMPANION_FIGHTER_CLOSE_RANGE, attackDistance - 2)) {
          input.moveX = -dir.x * COMPANION_FIGHTER_CLOSE_SCALE;
          input.moveZ = -dir.z * COMPANION_FIGHTER_CLOSE_SCALE;
        } else {
          const tangent = new Vector3(-dir.z, 0, dir.x).scale((brain.strafeDir || 1) * COMPANION_FIGHTER_STRAFE_SCALE);
          input.moveX = tangent.x;
          input.moveZ = tangent.z;
        }

        if (this._timeMs >= brain.nextDecisionAt) {
          brain.nextDecisionAt = this._timeMs + attackCadenceMs;
          const roll = Math.random();
          if (roll < blastChance && companion.ki >= COMPANION_HEALER_BLAST_KI_COST && distToTarget > COMPANION_FIGHTER_BLAST_RANGE) input.btnBlast = true;
          else if (distToTarget < COMPANION_FIGHTER_HEAVY_RANGE && roll > COMPANION_FIGHTER_HEAVY_ROLL) input.btnHeavy = true;
          else if (distToTarget < attackDistance + 1) input.btnAttack = true;
        }
      }

      return input;
    }

    // ── Follow leader when no enemies nearby ─────────────────────────────────
    if (distToAnchor > catchUpDistance) {
      const moveDir = toAnchor.normalize();
      input.moveX = moveDir.x;
      input.moveZ = moveDir.z;
    } else if (distToAnchor > followDistance + 1.5) {
      const t = Math.min(1, (distToAnchor - followDistance) / (catchUpDistance - followDistance));
      const mag = COMPANION_CATCHUP_MIN_SPEED + t * COMPANION_CATCHUP_SPEED_RANGE;
      const moveDir = toAnchor.normalize();
      input.moveX = moveDir.x * mag;
      input.moveZ = moveDir.z * mag;
    } else {
      const leaderSpeed = Math.sqrt((leader.velocity?.x ?? 0) ** 2 + (leader.velocity?.z ?? 0) ** 2);
      if (leaderSpeed > COMPANION_LEADER_SPEED_THRESHOLD && distToAnchor > 2) {
        const moveDir = new Vector3(leader.velocity?.x ?? 0, 0, leader.velocity?.z ?? 0).normalize().scale(COMPANION_IDLE_SPEED_SCALE);
        input.moveX = moveDir.x;
        input.moveZ = moveDir.z;
      }
    }

    return input;
  }

  private _getForward(state: AIReadState): Vector3 {
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
