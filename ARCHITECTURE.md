# World's Strongest — Architecture Cheat Sheet

> Feed this file at the start of any complex debugging session so the AI
> understands exactly how your systems talk to each other.

---

## System Map

```
GameLoop (src/core/GameLoop.js)
│  owns & wires every subsystem
│  runs render loop → _frame() every rAF tick
│  runs fixed-step physics loop → stepSimulationRuntime() at 60 Hz
│
├── CharacterRegistry       — source of truth for ALL entity state
│     registry.slots        Map<slot, CharacterState>
│     registry.getState(n)  read any entity
│     emits:  onPlayerSpawned, onPlayerDied, onDamageTaken,
│             onTransformChanged, onStanceChanged
│
├── MovementController      — integrates physics (reads input, writes state.velocity / position)
│     applyInput(slot, input)     called inside stepSimulationRuntime
│     getGroundY(pos)             ray-cast helper
│
├── CombatSystem            — attack validation, damage application
│     processAttack(playerId, attackId, inputData)
│       → deducts ki/stamina
│       → sets state.isActionLocked = true   ← NEW
│       → returns CombatEvent
│     emits:  onHit, onCombo, onKill
│
├── AnimationController     — drives Babylon AnimationGroups per character
│     update(delta)               runs every rAF frame (not fixed-step)
│     triggerAttackLight/Heavy/KiBlast/RushCombo/BeamFire/Dodge(slot, cb)
│       → plays one-shot clip
│       → cb fires when clip ends → clears state.isActionLocked   ← NEW
│     getAnimator(slot) → CharacterAnimator.currentState
│
├── EnemyAIController       — builds synthetic input for AI entities
│     update(step)               called inside stepSimulationRuntime
│       → reads CharacterState (isDead, isActionLocked, hp, ki …)
│       → skips if actor.isActionLocked                            ← NEW
│       → calls _queueInput(slot, input)
│     getBrainState(slot)        returns raw brain object for debugging
│
└── InputManager            — merges keyboard/gamepad into canonical InputFrame
      consumed by stepSimulationRuntime for the local player slot
```

---

## Golden Rules

### 1. Data flows ONE way: Input → Simulation → Render

```
InputManager ──► stepSimulationRuntime ──► CharacterRegistry (state)
                  │   MovementController.applyInput()
                  │   CombatSystem.processAttack()
                  │   EnemyAIController.update()  (queues AI inputs)
                  └──► CharacterRegistry (state)
                                 │
                        AnimationController.update()   (render frame)
                        AuraSystem.update()
                        HUD.update()
```

- **Never** read render state back into simulation.
- **Never** drive CharacterState from AnimationController's update loop
  (only clear `isActionLocked` in completion callbacks).

---

### 2. `isActionLocked` — the single source of truth for "mid-attack"

| Who sets it | When | Value |
|---|---|---|
| `CombatSystem.processAttack()` | Attack accepted (resources deducted) | `true` |
| `AnimationController._unlockThen()` | Attack clip's `onComplete` fires | `false` |

**Consumers:**
- `EnemyAIController.update()` — `if (actor.isActionLocked) continue;`
- Any future system that needs to know if an entity is committed to an action.

---

### 3. CharacterState — key fields

```js
state.hp            // current HP
state.maxHP
state.ki            // energy for specials
state.stamina       // energy for blocking / heavy attacks
state.velocity      // Vector3 — set by MovementController
state.position      // Vector3 — authoritative world position
state.isGrounded    // bool
state.isFlying      // bool
state.isBlocking    // bool
state.isDead        // bool — set by CharacterRegistry when hp ≤ 0
state.isInvincible  // bool — immunity frames after being hit
state.isActionLocked // bool — true while an attack animation is playing
state.isAiControlled // bool — true for enemy/companion entities
state.currentStance // "MELEE" | "SWORD"
state.characterId   // key in CHARACTER_ROSTER (CharacterRegistry.js)
state.slot          // numeric slot index (0 = local player)
state.teamId        // "HERO" | "ENEMY"
```

---

### 4. Attack pipeline (full trace)

```
[InputManager]  player presses attack button
      │
[GameplayRuntime]  resolveAttackId(state, input)  →  attackId string
      │
[CombatSystem]  processAttack(playerId, attackId, inputData)
      │  ✓ checks: !isDead, cooldown, ki, stamina
      │  → deducts ki/stamina, sets isActionLocked = true
      │  → returns CombatEvent  { type, attackerSlot, targetSlot, damage, … }
      │
[CombatPresentationRouter]  receives CombatEvent
      │  → animationController.triggerAttackLight/Heavy/… (slot, cb)
      │              │
      │   [CharacterAnimator]  plays AnimationGroup (one-shot)
      │              │  onComplete fires when clip ends
      │              └──► _unlockThen() clears state.isActionLocked = false
      │
      └──► hud.spawnDamageNumber / audioManager / vfx
```

---

### 5. Fixed-step vs. render-frame

| Loop | Rate | What runs |
|---|---|---|
| Render (`rAF`) | ~60-144 fps | AnimationController, HUD, AuraSystem, camera, audio |
| Fixed step | 60 Hz (1/60 s) | MovementController, CombatSystem, EnemyAIController, CharacterRegistry.tick |

- Physics / game logic is **always** in the fixed step.
- Visual effects / animations are **always** in the render frame.
- Do not put physics in the render frame or animations in the fixed step.

---

### 6. Zone & Session flow

```
GameLoop.startSinglePlayer(options)
  └─► startSinglePlayerRuntime(game, options)   [SessionFlow.js]
        1. resetWorldRuntime(game)
        2. zoneManager.loadZone(zoneId)          loads .glb, collision, portals
        3. registry.spawnPlayer(...)             emits onPlayerSpawned
        4. animationController auto-builds animator (listens to onPlayerSpawned)
        5. _spawnStoryEnemy(game, "HANA", ...)   registers enemy + AI brain
        6. afterStartRuntime(game)               3/2/1/FIGHT countdown
```

Zone IDs → model paths are in `src/core/zone/ZoneRegistry.ts`.
Only `CITY` has a confirmed model file (`/assets/full_gameready_city_buildings.glb`).

---

### 7. Character & Enemy registries

```
CHARACTER_ROSTER  (CharacterRegistry.js)   — playable + NPC visual definitions
  { id, label, modelPath, desiredHeightM, stances, transformations, … }

ENEMY_ROSTER  (EnemyRegistry.ts)           — AI combat definitions
  { id, characterId, basePowerLevel, maxHP, attacks, aiProfile }
  characterId links back to CHARACTER_ROSTER for the visual model
```

To add a new enemy: create an entry in `ENEMY_ROSTER` and ensure its
`characterId` exists in `CHARACTER_ROSTER` with a valid `modelPath`.

---

### 8. Debug tools

**F3** — dumps a full state snapshot of the **local player** to the console.  
**Shift+F3** — dumps all AI-controlled entities.

Output JSON contains: `hp`, `stamina`, `ki`, `isActionLocked`, `isBlocking`,
`isDead`, `isGrounded`, `isFlying`, `animationState`, `velocity`, `position`,
`aiRole`, `aiNextDecisionAt`, `aiCounterWindow`, `aiLastHp`.

When filing a bug with the AI: press F3 at the moment of the bug, copy the
JSON, and include it in your message.

**F1** — toggle HUD  
**F2** — toggle FPS counter

---

### 9. Build & run

```sh
npx vite build          # compile src/ → dist/
npx vite               # dev server at localhost:5173 (serves src/ directly, no rebuild needed)
run.bat / RUN_DESKTOP.BAT   # serve from dist/ via Python HTTP + Electron
```

- Dev server (port 5173): source changes are live-reloaded instantly.
- Prod server: requires `npx vite build` before changes appear.
- Vite returns `index.html` (200) for missing asset URLs — a missing .glb will
  silently fail with an HTML parse error, not a 404.

---

### 10. Common "stuck entity" checklist

1. `state.isActionLocked` still `true` → animation clip's `onComplete` never fired.
   Usually means the clip was interrupted or the duration constant is wrong.
2. `brain.nextDecisionAt` far in the future → AI is in its cadence delay.
3. `state.isDead = true` but entity is still visible → death animation/despawn
   logic didn't fire; check `onPlayerDied` event handler in GameLoop.
4. `animationState` shows a looping attack → `loop: false` not set in
   `AnimationController`'s `transition()` call for that attack state.
5. Velocity non-zero but entity not moving → `state.isGrounded` frozen; check
   `MovementController._simulatePhysicsOnly` ground ray.
