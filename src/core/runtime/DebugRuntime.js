// Debug utilities: entity state dumping and automation-status publishing.
// Extracted from GameLoop to keep the main orchestrator thin.

/**
 * Dump a full snapshot of one entity's state to the browser console.
 * Useful for debugging — press F3 in-game on the local player, or
 * Shift+F3 to dump all AI-controlled entities.
 */
export function dumpEntityState(game, slot) {
  const char = game.registry.getState(slot);
  const anim = game.animationController.getAnimator(slot);
  const brain = game.enemyAI.getBrainState(slot);
  const v = char?.velocity;

  const dump = {
    slot,
    characterId:    char?.characterId ?? null,
    hp:             char?.hp ?? null,
    maxHP:          char?.maxHP ?? null,
    ki:             char?.ki ?? null,
    stamina:        char?.stamina ?? null,
    isActionLocked: char?.isActionLocked ?? null,
    isBlocking:     char?.isBlocking ?? null,
    isInvincible:   char?.isInvincible ?? null,
    isDead:         char?.isDead ?? null,
    isGrounded:     char?.isGrounded ?? null,
    isFlying:       char?.isFlying ?? null,
    currentStance:  char?.currentStance ?? null,
    animationState: anim?.currentState ?? null,
    velocity:       v ? { x: +v.x.toFixed(3), y: +v.y.toFixed(3), z: +v.z.toFixed(3) } : null,
    position:       char?.position ? {
      x: +char.position.x.toFixed(2),
      y: +char.position.y.toFixed(2),
      z: +char.position.z.toFixed(2),
    } : null,
    aiRole:         brain?.role ?? null,
    aiNextDecisionAt: brain?.nextDecisionAt ?? null,
    aiCurrentTimeMs:  game.enemyAI._timeMs ?? null,
    aiCounterWindow:  brain?.counterWindowEnd ?? null,
    aiLastHp:         brain?.lastHpAtDecision ?? null,
  };

  console.group(`[DEBUG] dumpEntityState — slot ${slot}`);
  console.log(JSON.stringify(dump, null, 2));
  console.groupEnd();
}

/**
 * Publish a machine-readable status snapshot to `window.__WS_AUTOTEST__`
 * for automated testing / external tooling.
 */
export function publishAutomationStatus(game) {
  if (typeof window === "undefined") return;
  const activeMeshes = game.scene?.getActiveMeshes?.();
  const enemySlot = game._oneFightEnemySlot
    ?? [...game.registry.slots.entries()].find(([, state]) => state?.teamId === "ENEMY" && !state?.isDead)?.[0]
    ?? null;
  const serializeState = (slot) => {
    const state = game.registry.getState(slot);
    if (!state) return null;
    const visibleMeshCount = (state.characterMeshes ?? []).filter((mesh) => {
      const enabled = typeof mesh?.isEnabled === "function" ? mesh.isEnabled() : true;
      return enabled && (mesh?.isVisible ?? true) && ((mesh?.visibility ?? 1) > 0.01);
    }).length;
    return {
      slot,
      characterId: state.characterId ?? null,
      entityType: state.entityType ?? null,
      teamId: state.teamId ?? null,
      isDead: !!state.isDead,
      isActionLocked: !!state.isActionLocked,
      isBlocking: !!state.isBlocking,
      isChargingKi: !!state.isChargingKi,
      currentStance: state.currentStance ?? null,
      animationState: game.animationController.getAnimator(slot)?.currentState ?? null,
      position: state.position ? {
        x: +state.position.x.toFixed(2),
        y: +state.position.y.toFixed(2),
        z: +state.position.z.toFixed(2),
      } : null,
      velocity: state.velocity ? {
        x: +state.velocity.x.toFixed(2),
        y: +state.velocity.y.toFixed(2),
        z: +state.velocity.z.toFixed(2),
      } : null,
      rootEnabled: state.rootNode ? state.rootNode.isEnabled?.() ?? true : false,
      visibleMeshCount,
    };
  };

  const state = {
    ts: Date.now(),
    started: !!game._started,
    mode: game.mode,
    scenarioId: game._scenarioId ?? null,
    autotestEnabled: !!game._autotestEnabled,
    countdownActive: !!game._countdownIntroActive,
    inputEnabled: !!game.inputManager?.enabled && !game._countdownIntroActive,
    localSlot: game.localSlot ?? 0,
    opponentSlot: enemySlot,
    currentZoneId: game.currentZoneId ?? null,
    loadingHidden: !document.getElementById("loadingScreen") || document.getElementById("loadingScreen")?.classList.contains("hidden"),
    mainMenuVisible: !!document.getElementById("mainMenu"),
    scene: {
      activeMeshCount: activeMeshes?.length ?? null,
      totalMeshCount: game.scene?.meshes?.length ?? null,
      qualityMode: game._qualityMode,
      qualityPreset: game._effectiveQualityPreset,
      performanceTier: game._performanceTier,
      hardwareScalingLevel: game._hardwareScalingLevel,
    },
    entities: {
      local: serializeState(game.localSlot ?? 0),
      opponent: enemySlot != null ? serializeState(enemySlot) : null,
    },
  };

  window.__WS_AUTOTEST__ = state;
}
