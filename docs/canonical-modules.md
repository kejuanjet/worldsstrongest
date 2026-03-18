# Canonical Runtime Modules

These files are the active source of truth for runtime code. Compatibility re-export files stay in place to avoid breaking old imports while migration debt is cleaned up.

- `src/core/SessionManager.js` is canonical. `src/network/SessionManager.js` is a compatibility re-export.
- `src/core/CharacterRegistry.js` is canonical. `src/character/CharacterRegistry.js` is a compatibility re-export.
- `src/core/MovementController.js` is canonical. `src/character/MovementController.js` is a compatibility re-export.
- `src/ai/EnemyAIController.js` is the active runtime implementation. `src/ai/EnemyAIController.ts` remains migration debt until core imports are switched intentionally.

When adding or refactoring features, update canonical files first and preserve bridge exports only when they are still referenced.
