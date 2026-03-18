import { getEnemyDef } from "../../ai/EnemyRegistry.js";

export class EnemySpawnService {
  constructor({ registry, enemyAI }) {
    this.registry = registry;
    this.enemyAI = enemyAI;
  }

  spawnEnemy(enemyDefId, spawnPos, params = {}) {
    const def = getEnemyDef(enemyDefId);
    if (!def) return null;

    const state = this.registry.spawnEnemy(enemyDefId, null, spawnPos, params);
    if (!state) return null;

    state.powerLevel = def.basePowerLevel;
    state.maxHP = def.maxHP;
    state.hp = def.maxHP;
    state.maxKi = def.maxKi;
    state.ki = def.maxKi;
    state.maxStamina = def.maxStamina;
    state.stamina = def.maxStamina;
    state.xpReward = def.xpReward;
    state.isBoss = !!(params.isBoss || def.isBoss);
    state.enemyDefId = enemyDefId;
    state.aiProfileId = enemyDefId;

    this.enemyAI?.registerEnemy(state.slot, def.aiProfile, def.characterId, def.attacks);
    return state;
  }

  clearEnemies() {
    for (const state of this.registry.getEntitiesByTeam?.("ENEMY") || []) {
      this.registry.despawnEntity?.(state.slot);
      this.enemyAI?.removeEnemy(state.slot);
    }
  }
}
