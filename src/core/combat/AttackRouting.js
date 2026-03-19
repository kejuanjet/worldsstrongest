function getConfiguredAttack(attackList, state, fallback) {
  if (!Array.isArray(attackList) || attackList.length === 0) {
    return fallback;
  }

  const stanceIndex = state.currentStance === "SWORD" && attackList.length > 1 ? 1 : 0;
  return attackList[stanceIndex] ?? attackList[0] ?? fallback;
}

function getLastAttack(attackList, fallback) {
  if (!Array.isArray(attackList) || attackList.length === 0) {
    return fallback;
  }

  return attackList[attackList.length - 1] ?? fallback;
}

export function resolveConfiguredBeamAttack(state) {
  const characterDef = state.characterDef ?? {};
  return getConfiguredAttack(
    characterDef.beamAttacks,
    state,
    getLastAttack(characterDef.spellAttacks, "KI_BLAST"),
  );
}

export function resolveConfiguredUltimateAttack(state) {
  return state.characterDef?.ultimateAttack ?? null;
}
