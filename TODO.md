# Architecture Hardening TODO
Approved plan from BLACKBOXAI. Track progress here. Mark [x] when complete.

## Phase 1: Consolidate runtime ownership (Canonical first)
- [ ] Update canonical-modules.md with current shims
- [ ] Search/replace imports → canonical paths (src/core/*)
- [ ] Delete vestigial shims (src/character/, src/combat/ → core/)
- [ ] Verify: no breakage in onefight/training

## Phase 2: Split bootstrap from gameplay
- [ ] Extract engine/scene init → engineBootstrap.ts
- [ ] main.js: explicit stages (engine → assets → scene → GameLoop)
- [ ] GameLoop constructor: minimal (accept injected subsystems)
- [ ] Verify: startup unchanged

## Phase 3: Decompose GameLoop
- [ ] Extract fixed-step → SimulationTicker.ts
- [ ] Wiring → SubsystemFactory.ts
- [ ] _frame(): coordination only (~100 LoC target)
- [ ] Measure: GameLoop.js < 400 LoC
- [ ] Verify: 60 FPS fixed timestep

## Phase 4: Formalize session flow
- [ ] SessionFlow.js → SessionStateMachine.ts
- [ ] Atomic: zoneLoad → profileApply → spawn → missionStart
- [ ] Verify: transitions atomic

## Phase 5: Subsystem contracts
- [ ] Events/methods over direct access (registry/combat/movement)
- [ ] Explicit isActionLocked contracts
- [ ] Verify: no shared mutable internals

## Phase 6: Guardrails + cleanup
- [ ] Tests: startup, transitions, boundaries
- [ ] Docs: import rules, dep direction
- [ ] Remove dead code/docs
- [ ] Final: typecheck + full test suite

**Next: Phase 1 → run after each.**
