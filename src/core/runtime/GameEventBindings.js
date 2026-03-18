import { CONFIG } from "../index.js";
import { ZONE_REGISTRY } from "../ZoneManager.js";
import { SESSION_ROLE } from "../SessionManager.js";
import { GAME_MODE } from "./gameModes.js";
import { describeStanceRuntime, getLockCandidatesRuntime, isAuthoritativeMode } from "./GameplayRuntime.js";
import { flashDamageRuntime } from "./LoopRuntimeHelpers.js";
import { scheduleRespawnRuntime, resolveStoryVictoryRuntime } from "./SessionFlow.js";
import { setRuntimeBadgeRuntime, updateOverlayRuntime } from "./OverlayRuntime.js";

export function wireGameLoopEvents(game) {
  game.inputManager.getLockCandidates = () => getLockCandidatesRuntime(game);
  game.inputManager.setLockOnTargetProvider(() => {
    const targets = [];
    for (const [slot, state] of game.registry.slots.entries()) {
      if (!state || slot === game.localSlot) continue;
      if (!state.position || !state.velocity) continue;
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
    if (isAuthoritativeMode(game.mode)) {
      const changed = game.registry.toggleStance(game.localSlot);
      if (changed) game.hud.showStatusMessage(describeStanceRuntime(game, game.localSlot));
    }
  };
  game.inputManager.onLockTargetChanged = (slot) => {
    const label = slot == null ? "Lock Off" : `Locked: ${game.registry.getState(slot)?.characterDef?.label ?? `Slot ${slot}`}`;
    setRuntimeBadgeRuntime(game, label);
    game.hud.showStatusMessage(label, 1200);
  };
  game.zoneManager.on("onZoneLoaded", (def) => {
    game.currentZoneId = def.id;
    game.hud.setZoneLabel(def.label);
    updateOverlayRuntime(game);
  });
  game.zoneManager.on("onPortalTriggered", ({ targetZone }) => {
    const targetLabel = ZONE_REGISTRY[targetZone]?.label ?? targetZone;
    game.hud.showZoneTransition(targetLabel);
  });
  game.sessionManager.onSnapshot((snapshot) => {
    if (game.sessionManager.role === SESSION_ROLE.CLIENT) {
      game.registry.applySnapshot(snapshot);
    }
  });
  game.sessionManager.on("onClientInput", ({ slot, input }) => {
    if (slot != null) game._remoteInputs.set(slot, input);
  });
  game.sessionManager.on("onPlayerJoined", async ({ playerId, slot, characterId }) => {
    if (slot == null || playerId === game.sessionManager.localPlayerId) return;
    if (game.mode === GAME_MODE.MULTIPLAYER_HOST || game.mode === GAME_MODE.MULTIPLAYER_CLIENT) {
      await game._ensureNetworkPlayer(slot, playerId, characterId ?? "RAYNE");
    }
  });
  game.sessionManager.on("onPlayerLeft", ({ slot }) => {
    if (slot == null) return;
    game.registry.despawnEntity?.(slot);
    game.movement.removeSlot?.(slot);
    game.auraSystem.removeSlot?.(slot);
  });
  game.combat.on("onHit", (event) => {
    // Suppress onHit FX if damage was completely negated (Z-Vanish returns -1)
    if (event.damage <= 0) return;

    const target = game.registry.getState(event.targetSlot);
    if (target && Number.isFinite(event.damage)) {
      if (game._damageToggle?.shouldShow?.() ?? true) {
        game.hud.spawnDamageNumber(target.position, event.damage, event.impactType ?? "LIGHT");
      }
      if (game.animeEffects) {
        game.animeEffects.screenFlash(event.impactType ?? "LIGHT", 0.12);
        game.animeEffects.impactNumber(target.position, event.damage, event.impactType ?? "LIGHT");
      }
    }
    if (event.targetSlot === game.localSlot) {
      flashDamageRuntime();
      game.inputManager.rumble(0.6, 250);
      game.postProcessing.onDamageTaken(event.damage ?? 0);
    }
    if (event.attackerSlot === game.localSlot) {
      const isBeam = !!event.beam;
      const isHeavy = event.impactType === "HEAVY" || event.projectile || isBeam;
      
      // ── Aerial Chase Juggling Setup ──
      if (event.impactType === "HEAVY" && !isBeam && !event.projectile) {
        const attacker = game.registry.getState(event.attackerSlot);
        if (attacker && target && !target.isDead) {
          attacker.chaseTargetSlot = event.targetSlot;
          attacker.chaseWindowEnd = performance.now() + (CONFIG.combat.chaseWindowMs || 1000);
          // Vertical launch
          target.velocity.y = (CONFIG.movement.jumpImpulse || 8) * 1.5;
          target.isGrounded = false;
          target.isFlying = false;
        }
      }

      if (isBeam) {
        game.inputManager.rumbleHeavy();
        game.postProcessing.triggerWhiteFlash(0.10);
        game.postProcessing.triggerChromaticAberration(85);
        game.animeEffects?.speedLines(1.0);
      } else if (isHeavy) {
        game.inputManager.rumbleHeavy();
        game.postProcessing.triggerChromaticAberration(50);
        game.postProcessing.triggerHitDistortion(0.5, 0.5, 0.045);
        game.animeEffects?.speedLines(0.8);
      } else {
        game.inputManager.rumbleLight();
        game.postProcessing.triggerChromaticAberration(20);
        game.postProcessing.triggerHitDistortion(0.5, 0.5, 0.018);
      }
    }
  });
  game.combat.on("onCombo", ({ attackerSlot, comboCount, totalDamage }) => {
    if (attackerSlot === game.localSlot) {
      game.hud.showCombo(comboCount, totalDamage);
      if (comboCount >= 5) {
        game.inputManager.rumble(Math.min(0.3 + comboCount * 0.05, 0.9), 150);
      }
      if (comboCount >= 20) {
        game.postProcessing.triggerChromaticAberration(95);
        game.postProcessing.setSpeedLines(1.0);
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
    }
  });
  game.combat.on("onKill", ({ killerSlot, targetSlot }) => {
    const killer = game.registry.getState(killerSlot);
    const target = game.registry.getState(targetSlot);
    game.hud.addKillFeedEntry(
      killer?.characterDef?.label ?? `Slot ${killerSlot}`,
      target?.characterDef?.label ?? `Slot ${targetSlot}`
    );
    if (game._storyFightActive && targetSlot === game._storyHanaSlot) {
      resolveStoryVictoryRuntime(game);
    }
    if (killerSlot === game.localSlot) {
      game.inputManager.rumble(1.0, 400);
      game.postProcessing.triggerWhiteFlash(0.07);
      game.postProcessing.setBloom(2.0);
      game._bloomOverrideUntil = performance.now() + 350;
    }
  });
  game.combat.on("onBeamClash", ({ winnerSlot, loserSlot }) => {
    if (winnerSlot === game.localSlot || loserSlot === game.localSlot) {
      game.inputManager.rumbleHeavy();
    }
  });
  game.combat.on("onMeleeClash", ({ slotA, slotB }) => {
    if (slotA === game.localSlot || slotB === game.localSlot) {
      game.inputManager.rumble(0.7, 200);
    }
  });
  game.registry.on("onPlayerDied", ({ slot }) => {
    const state = game.registry.getState(slot);
    if (!state || state.entityType !== "PLAYER" || !game.zoneManager.canDie()) return;
    scheduleRespawnRuntime(game, slot, CONFIG.respawnDelay);
  });
  game.impactFX.wireCombat(game.combat);

  // ── Shonen Mechanics Events ──
  game.registry.on("onZVanish", ({ evaderSlot, attackerSlot, oldPosition, newPosition }) => {
    game.audioManager.playVaried("sfx_dodge", 0.15); // sharp vanish sound
    if (evaderSlot === game.localSlot) {
      game.postProcessing.triggerWhiteFlash(0.05);
      game.cameraController?.triggerShake(0.3, 0.1);
    }
    game.impactFX.playDodgeFlash(oldPosition);
  });

  game.registry.on("onChaseTriggered", ({ slot, targetSlot }) => {
    game.audioManager.playVaried("sfx_beam_fire", 0.1, { volume: 0.8 }); // sonic boom dash
    if (slot === game.localSlot) {
      game.postProcessing.setSpeedLines(1.0);
      game._speedLineOverrideUntil = performance.now() + 400;
      game.cameraController?.triggerShake(0.2, 0.2);
    }
  });
}
