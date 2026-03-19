export function resolveConfiguredBeamAttack(state: {
  currentStance?: string;
  characterDef?: { beamAttacks?: string[]; spellAttacks?: string[] } | null;
}): string;
export function resolveConfiguredUltimateAttack(state: {
  characterDef?: { ultimateAttack?: string | null } | null;
}): string | null;