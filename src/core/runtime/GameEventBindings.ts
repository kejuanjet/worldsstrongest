import type { Vector3 } from "@babylonjs/core";
import { CONFIG } from "../index.js";
import { ZONE_REGISTRY } from "../ZoneManager.js";
import { SESSION_ROLE } from "../SessionManager.js";
import { GAME_MODE } from "./gameModes.js";
import { describeStanceRuntime, getLockCandidatesRuntime, isAuthoritativeMode } from "./GameplayRuntime.js";
import { flashDamageRuntime } from "./LoopRuntimeHelpers.js";
import { scheduleRespawnRuntime, resolveStoryVictoryRuntime } from "./SessionFlow.js";
import { setRuntimeBadgeRuntime, updateOverlayRuntime } from "./OverlayRuntime.js";

interface CombatEventTargetState {
  slot: number;
  position: Vector3;
  velocity: Vector3;
  teamId?: string | null;
  hp?: number | null;
  maxHP?: number | null;
  isDead?: boolean;
  isInvincible?: boolean;
  entityType?: string;
  characterDef?: { label?: string | null; stances?: string[] } | null;
}

interface ZoneDefinition {
  id: string;
  label: string;
}

interface RuntimeGame {
  localSlot: number;
  mode: string;
  currentZoneId: string | null;
  _storyFightActive?: boolean;
  _storyHanaSlot?: number | null;
  _damageToggle?: { shouldShow?(): boolean };
  _speedLineOverrideUntil: number;
  _bloomOverrideUntil: number;
  registry: {
    slots: Map<number, CombatEventTargetState>;
    getState(slot: number): CombatEventTargetState | null;
    on(eventName: string, handler: (payload: unknown) => void): void;
    toggleStance(slot: number): boolean;
    despawnEntity?(slot: number): void;
  };
  inputManager: {
    getLockCandidates: (() => number[]) | null;
    setLockOnTargetProvider(fn: () => Array<{
      slot: number;
      position: Vector3;
      velocity: Vector3;
      isDead: boolean;
      isInvincible: boolean;
      teamId: string | null;
      characterDef: CombatEventTargetState["characterDef"];
      health: number | null;
      maxHealth: number | null;
    }>): void;
    onStanceToggle: (() => void) | null;
    onLockTargetChanged: ((slot: number | null) => void) | null;
    rumble(intensity?: number, duration?: number): void;
    rumbleLight(): void;
    rumbleHeavy(): void;
  };
  hud: {
    showStatusMessage(message: string, durationMs?: number): void;
    setZoneLabel(label: string): void;
    showZoneTransition(label: string): void;
    spawnDamageNumber(position: Vector3, damage: number, impactType: string): void;
    showCombo(comboCount: number, totalDamage: number): void;
    addKillFeedEntry(killer: string, target: string): void;
  };
  zoneManager: {
    on(eventName: string, handler: (payload: unknown) => void): void;
    canDie(): boolean;
  };
  sessionManager: {
    role: string;
    localPlayerId?: string;
    onSnapshot(handler: (snapshot: unknown) => void): void;
    on(eventName: string, handler: (payload: unknown) => void): void;
  };
  combat: {
    on(eventName: string, handler: (payload: unknown) => void): void;
  };
  impactFX: {
    wireCombat(combat: RuntimeGame["combat"], registry: RuntimeGame["registry"]): void;
    playDodgeFlash(position: Vector3): void;
  };
  audioManager: {
    playVaried(id: string, rate: number, options?: { volume?: number }): void;
  };
  postProcessing: {
    onDamageTaken(damage: number): void;
    triggerWhiteFlash(duration: number): void;
    triggerChromaticAberration(amount: number): void;
    triggerHitDistortion(x: number, y: number, strength: number): void;
    setSpeedLines(amount: number): void;
    setBloom(amount: number): void;
  };
  cameraController?: {
    triggerShake(intensity: number, duration: number): void;
  };
  movement: { removeSlot?(slot: number): void };
  auraSystem: { removeSlot?(slot: number): void };
  _ensureNetworkPlayer(slot: number, playerId: string, characterId?: string): Promise<unknown>;
}

interface HitEvent {
  attackerSlot: number;
  targetSlot: number;
  damage: number;
  impactType?: string;
  projectile?: boolean;
  beam?: boolean;
}

interface ComboEvent {
  attackerSlot: number;
  comboCount: number;
  totalDamage: number;
}

interface KillEvent {
  killerSlot: number;
  targetSlot: number;
}

export function wireGameLoopEvents(game: RuntimeGame): void {
  game.inputManager.getLockCandidates = () => getLockCandidatesRuntime(game as unknown as Parameters<typeof getLockCandidatesRuntime>[0]);
  game.inputManager.setLockOnTargetProvider(() => {
    const targets = [];
    for (const [slot, state] of game.registry.slots.entries()) {
      if (!state || slot === game.localSlot) continue;
      targets.push({
        slot,
        position: state.position,
        velocity: state.velocity,
        isDead: !!state.isDead,
        isInvincible: !!state.isInvincible,
        teamId: state.teamId ?? null,
        characterDef: state.characterDef ?? null,
        health: state.hp ?? null,
        maxHealth: state.maxHP ?? null,
      });
    }
    return targets;
  });

  game.inputManager.onStanceToggle = () => {
    if (!isAuthoritativeMode(game.mode as Parameters<typeof isAuthoritativeMode>[0])) return;
    const changed = game.registry.toggleStance(game.localSlot);
    if (changed) game.hud.showStatusMessage(describeStanceRuntime(game as unknown as Parameters<typeof describeStanceRuntime>[0], game.localSlot));
  };

  game.inputManager.onLockTargetChanged = (slot) => {
    const label = slot == null
      ? "Lock Off"
      : `Locked: ${game.registry.getState(slot)?.characterDef?.label ?? `Slot ${slot}`}`;
    setRuntimeBadgeRuntime(game, label);
    game.hud.showStatusMessage(label, 1200);
  };

  game.zoneManager.on("onZoneLoaded", (payload) => {
    const def = payload as ZoneDefinition;
    game.currentZoneId = def.id;
    game.hud.setZoneLabel(def.label);
    updateOverlayRuntime(game);
  });

  game.zoneManager.on("onPortalTriggered", (payload) => {
    const { targetZone } = payload as { targetZone: keyof typeof ZONE_REGISTRY };
    const targetLabel = ZONE_REGISTRY[targetZone]?.label ?? targetZone;
    game.hud.showZoneTransition(targetLabel);
  });

  game.sessionManager.onSnapshot((snapshot) => {
    if (game.sessionManager.role === SESSION_ROLE.CLIENT) {
      (game.registry as unknown as { applySnapshot(snapshot: unknown): void }).applySnapshot(snapshot);
    }
  });

  game.sessionManager.on("onClientInput", (payload) => {
    const { slot, input } = payload as { slot?: number; input: unknown };
    if (slot != null) {
      (game as unknown as { _remoteInputs: Map<number, unknown> })._remoteInputs.set(slot, input);
    }
  });

  game.sessionManager.on("onPlayerJoined", async (payload) => {
    const { playerId, slot, characterId } = payload as { playerId: string; slot?: number; characterId?: string };
    if (slot == null || playerId === game.sessionManager.localPlayerId) return;
    if (game.mode === GAME_MODE.MULTIPLAYER_HOST || game.mode === GAME_MODE.MULTIPLAYER_CLIENT) {
      try {
        await game._ensureNetworkPlayer(slot, playerId, characterId ?? "RAYNE");
      } catch (error) {
        console.error(`[GameEventBindings] Failed to ensure network player ${playerId}:`, error);
      }
    }
  });

  game.sessionManager.on("onPlayerLeft", (payload) => {
    const { slot } = payload as { slot?: number };
    if (slot == null) return;
    game.registry.despawnEntity?.(slot);
    game.movement.removeSlot?.(slot);
    game.auraSystem.removeSlot?.(slot);
  });

  game.combat.on("onHit", (payload) => {
    const event = payload as HitEvent;
    if (event.damage <= 0) return;

    const target = game.registry.getState(event.targetSlot);
    if (target && Number.isFinite(event.damage)) {
      if (game._damageToggle?.shouldShow?.() ?? true) {
        game.hud.spawnDamageNumber(target.position, event.damage, event.impactType ?? "LIGHT");
      }
      const animeEffects = (game as unknown as { animeEffects?: { screenFlash(type: string, duration: number): void; impactNumber(position: Vector3, damage: number, type: string): void } }).animeEffects;
      animeEffects?.screenFlash(event.impactType ?? "LIGHT", 0.12);
      animeEffects?.impactNumber(target.position, event.damage, event.impactType ?? "LIGHT");
    }

    if (event.targetSlot === game.localSlot) {
      flashDamageRuntime();
      game.inputManager.rumble(0.6, 250);
      game.postProcessing.onDamageTaken(event.damage ?? 0);
    }

    if (event.attackerSlot === game.localSlot) {
      const isBeam = !!event.beam;
      const isHeavy = event.impactType === "HEAVY" || event.projectile || isBeam;

      if (isBeam) {
        game.inputManager.rumbleHeavy();
        game.postProcessing.triggerWhiteFlash(0.1);
        game.postProcessing.triggerChromaticAberration(85);
        (game as unknown as { animeEffects?: { speedLines(amount: number): void } }).animeEffects?.speedLines(1);
      } else if (isHeavy) {
        game.inputManager.rumbleHeavy();
        game.postProcessing.triggerChromaticAberration(50);
        game.postProcessing.triggerHitDistortion(0.5, 0.5, 0.045);
        (game as unknown as { animeEffects?: { speedLines(amount: number): void } }).animeEffects?.speedLines(0.8);
      } else {
        game.inputManager.rumbleLight();
        game.postProcessing.triggerChromaticAberration(20);
        game.postProcessing.triggerHitDistortion(0.5, 0.5, 0.018);
      }
    }
  });

  game.combat.on("onCombo", (payload) => {
    const { attackerSlot, comboCount, totalDamage } = payload as ComboEvent;
    if (attackerSlot !== game.localSlot) return;

    game.hud.showCombo(comboCount, totalDamage);
    if (comboCount >= 5) {
      game.inputManager.rumble(Math.min(0.3 + comboCount * 0.05, 0.9), 150);
    }
    if (comboCount >= 20) {
      game.postProcessing.triggerChromaticAberration(95);
      game.postProcessing.setSpeedLines(1);
      game._speedLineOverrideUntil = performance.now() + 500;
      game.postProcessing.setBloom(2.4);
      game._bloomOverrideUntil = performance.now() + 600;
    } else if (comboCount >= 10) {
      game.postProcessing.triggerChromaticAberration(60);
      game.postProcessing.setSpeedLines(0.75);
      game._speedLineOverrideUntil = performance.now() + 380;
    } else if (comboCount === 5) {
      game.postProcessing.triggerChromaticAberration(30);
    }
  });

  game.combat.on("onKill", (payload) => {
    const { killerSlot, targetSlot } = payload as KillEvent;
    const killer = game.registry.getState(killerSlot);
    const target = game.registry.getState(targetSlot);
    game.hud.addKillFeedEntry(
      killer?.characterDef?.label ?? `Slot ${killerSlot}`,
      target?.characterDef?.label ?? `Slot ${targetSlot}`,
    );
    if (game._storyFightActive && targetSlot === game._storyHanaSlot) {
      resolveStoryVictoryRuntime(game);
    }
    if (killerSlot === game.localSlot) {
      game.inputManager.rumble(1, 400);
      game.postProcessing.triggerWhiteFlash(0.07);
      game.postProcessing.setBloom(2);
      game._bloomOverrideUntil = performance.now() + 350;
    }
  });

  game.combat.on("onBeamClash", (payload) => {
    const { winnerSlot, loserSlot } = payload as { winnerSlot: number; loserSlot: number };
    if (winnerSlot === game.localSlot || loserSlot === game.localSlot) {
      game.inputManager.rumbleHeavy();
    }
  });

  game.combat.on("onMeleeClash", (payload) => {
    const { slotA, slotB } = payload as { slotA: number; slotB: number };
    if (slotA === game.localSlot || slotB === game.localSlot) {
      game.inputManager.rumble(0.7, 200);
    }
  });

  game.registry.on("onPlayerDied", (payload) => {
    const { slot } = payload as { slot: number };
    const state = game.registry.getState(slot);
    if (!state || state.entityType !== "PLAYER" || !game.zoneManager.canDie()) return;
    scheduleRespawnRuntime(game, slot, CONFIG.respawnDelay);
  });

  game.impactFX.wireCombat(game.combat, game.registry);

  game.registry.on("onZVanish", (payload) => {
    const { evaderSlot, oldPosition } = payload as { evaderSlot: number; oldPosition: Vector3 };
    game.audioManager.playVaried("sfx_dodge", 0.15);
    if (evaderSlot === game.localSlot) {
      game.postProcessing.triggerWhiteFlash(0.05);
      game.cameraController?.triggerShake(0.3, 0.1);
    }
    game.impactFX.playDodgeFlash(oldPosition);
  });

  game.registry.on("onChaseTriggered", (payload) => {
    const { slot } = payload as { slot: number };
    game.audioManager.playVaried("sfx_beam_fire", 0.1, { volume: 0.8 });
    if (slot === game.localSlot) {
      game.postProcessing.setSpeedLines(1);
      game._speedLineOverrideUntil = performance.now() + 400;
      game.cameraController?.triggerShake(0.2, 0.2);
    }
  });
}