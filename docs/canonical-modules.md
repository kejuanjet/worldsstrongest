# Canonical Runtime Modules

These files are the active source of truth for runtime code.

## Core systems
- `src/core/index.js` — CONFIG (single source of truth for all tunables) + derived values.
- `src/core/CharacterRegistry.js` — authoritative entity registry for all player slots. Types in `CharacterRegistry.ts`.
- `src/core/MovementController.ts` — physics-driven movement for all entities.
- `src/core/CombatSystem.ts` — attack validation, damage application (`CombatSystem.js` is a bridge re-export).
- `src/core/SessionManager.js` — 4-player session management (host/join, state sync).
- `src/ai/EnemyAIController.js` — AI brain for enemy/companion entities.

## Runtime modules (extracted from GameLoop)
- `src/core/runtime/SceneSetup.js` — camera, lighting, day-night cycle initialisation.
- `src/core/runtime/PerformanceRuntime.js` — adaptive quality, FPS sampling, tier management.
- `src/core/runtime/HotkeyBindings.js` — global keyboard shortcuts.
- `src/core/runtime/DebugRuntime.js` — entity state dumps, automation-status publishing.
- `src/core/runtime/SessionFlow.js` — mode start sequences (single-player, training, multiplayer).
- `src/core/runtime/GameplayRuntime.js` — fixed-step simulation tick.
- `src/core/runtime/GameEventBindings.js` — combat/registry event wiring.
- `src/core/runtime/LoopRuntimeHelpers.js` — input building, autosave, mute toggle.
- `src/core/runtime/QoLFeatures.js` — FPS counter, damage numbers, training QoL.

## Config
- `src/core/index.js` is the canonical CONFIG definition. `src/config/index.js` is a convenience re-export barrel.
- `src/config/camera.js` — extended camera tuning (merged into CONFIG.camera at load time).

When adding or refactoring features, always import from the canonical paths listed above.
