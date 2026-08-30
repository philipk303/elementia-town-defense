# Phase 8A + 8B — Chase-routing root-cause fix & sweep harness

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the chaotic, non-monotonic balance behavior that blocked Phase 4 and Phase 6 tuning, then build the harness that lets Phase 8C sweep balance values with trustworthy results.

**Architecture:** Two root causes are fixed. (1) Chase-mode enemies currently steer with a raw unit vector at their target, ignoring the cost field entirely — they will be gated on tile line-of-sight and fall back to normal cost-field march when LoS is blocked. (2) Respawning players become instant aggro magnets beside the hall — they get a brief spawn-protection window during which they cannot trigger or hold aggro. Then the acceptance harness gains an inverse control, and a new headless multi-seed sweep script measures win rate over `BALANCE` tunables through the real `tickGame` path.

**Tech Stack:** Node 20 ESM, `node --test`, no runtime dependencies in `server/`. All balance magnitudes live in `shared/balance.js` (never inline).

---

## Required reading before Task 1

1. `docs/plans/2026-07-18-slice1-implementation-plan.md` — "Phase 8 — Balance, e2e & deploy" and "Standing rules for execution".
2. `docs/reviews/2026-07-19-checkpoint-phase6-designer-review.md` — the **REMEDIATION STAMP** at the bottom. It documents the measured chaos this plan exists to fix, and the Phase-8 sweep intake list.
3. `docs/superpowers/specs/2026-07-17-slice1-design.md` — Section 4 (aggro, death & revive), Section 5 (netcode / no-allocation-in-tick rule).

**Standing rules that apply to every task below:** TDD (write the failing test first). Commit at every green boundary. Never commit red. No allocation in the per-tick hot path. Any spec deviation gets a dated amendment written into the spec file.

---

## ⚠ Open decision to confirm before Task 4

Philip approved spawn protection described as *"~2-3s after respawn the player cannot trigger or hold aggro; **protection ends early if they attack**."*

**This plan deliberately omits the ends-early-on-attack clause.** Reasons:

- Both the acceptance harness (`test/game/phase6Acceptance.test.js:80`) and the bot FSM hammer `actions.basic/special/second` every single tick. An attack-clears rule is therefore a no-op in exactly the simulation we are trying to stabilise.
- More importantly, attack-clearing makes the protection window's real duration a function of combat timing — which reintroduces the timing coupling that Phase 8A exists to remove. A flat window is predictable; predictability is the entire point of this phase.

The exploit an attack-clear normally guards against (camping the hall invulnerable) is bounded to 2.5s here and cannot be re-triggered without dying again.

**If Philip prefers the attack-clear anyway**, add this line inside the `if (input) {` block at `server/game/players.js:185`, before the action calls, and adjust the Task 4 tests accordingly:

```js
if (input.actions.basic || input.actions.special || input.actions.second) p.protectedUntil = 0
```

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `server/game/grid.js` | modify | Add `hasLineOfSight` — a pure, allocation-free tile raycast primitive. Grid math belongs here alongside `worldToTileX`/`inBounds`. |
| `server/game/enemies.js` | modify (`~217-251`) | Gate the chase steering branch on LoS; fall through to the existing march branch when blocked. |
| `server/game/players.js` | modify (`respawn`, `~70`) | Stamp `p.protectedUntil` on respawn. |
| `server/game/state.js` | modify (`~50`) | Initialise `protectedUntil: 0` on the player object. |
| `shared/balance.js` | modify (`PLAYER` block, `~213`) | Add `SPAWN_PROTECT_MS`. |
| `test/game/lineOfSight.test.js` | create | Unit tests for the raycast primitive. |
| `test/game/chaseRouting.test.js` | create | Behavioural tests for LoS-gated chase + the CP3-C1 regression. |
| `test/game/spawnProtection.test.js` | create | Spawn-protection lifecycle tests. |
| `test/game/phase6Acceptance.test.js` | modify | Add the inverse control the Phase-6 designer review asked for. |
| `tools/balanceSweep.js` | create | Headless multi-seed sweep harness (not a test — a script). |
| `tools/monotonicityProbe.js` | create | One-off verification that the chaos is gone. |
| `package.json` | modify | Add `sweep` and `probe` npm scripts. |

---

## Task 1: Line-of-sight tile raycast

**Files:**
- Modify: `server/game/grid.js` (append at end of file)
- Test: `test/game/lineOfSight.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `test/game/lineOfSight.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasLineOfSight, tileToWorldX, tileToWorldY, TILE_SIZE } from '../../server/game/grid.js'

// A solid-tile predicate over an explicit set of "gx,gy" keys.
function solidSet(...tiles) {
  const s = new Set(tiles.map(([gx, gy]) => `${gx},${gy}`))
  return (gx, gy) => s.has(`${gx},${gy}`)
}
const open = () => false
const W = (gx, gy) => [tileToWorldX(gx), tileToWorldY(gy)]

test('clear horizontal line has line of sight', () => {
  const [x0, y0] = W(2, 5)
  const [x1, y1] = W(9, 5)
  assert.equal(hasLineOfSight(open, x0, y0, x1, y1), true)
})

test('a solid tile directly between the endpoints blocks line of sight', () => {
  const [x0, y0] = W(2, 5)
  const [x1, y1] = W(9, 5)
  assert.equal(hasLineOfSight(solidSet([5, 5]), x0, y0, x1, y1), false)
})

test('a solid tile off the line does not block', () => {
  const [x0, y0] = W(2, 5)
  const [x1, y1] = W(9, 5)
  assert.equal(hasLineOfSight(solidSet([5, 8]), x0, y0, x1, y1), true)
})

test('vertical and diagonal lines are handled (no divide-by-zero)', () => {
  const [vx0, vy0] = W(4, 1)
  const [vx1, vy1] = W(4, 9)
  assert.equal(hasLineOfSight(open, vx0, vy0, vx1, vy1), true)
  assert.equal(hasLineOfSight(solidSet([4, 5]), vx0, vy0, vx1, vy1), false)

  const [dx0, dy0] = W(1, 1)
  const [dx1, dy1] = W(6, 6)
  assert.equal(hasLineOfSight(open, dx0, dy0, dx1, dy1), true)
  assert.equal(hasLineOfSight(solidSet([3, 3]), dx0, dy0, dx1, dy1), false)
})

test('the target tile itself being solid does not block (you can see the wall you stand on)', () => {
  const [x0, y0] = W(2, 5)
  const [x1, y1] = W(6, 5)
  assert.equal(hasLineOfSight(solidSet([6, 5]), x0, y0, x1, y1), true)
})

test('same-tile endpoints always have line of sight', () => {
  const [x0, y0] = W(7, 7)
  assert.equal(hasLineOfSight(solidSet([7, 7]), x0, y0, x0 + 3, y0 + 3), true)
})

test('a line leaving the map bounds reports no line of sight', () => {
  assert.equal(hasLineOfSight(open, TILE_SIZE * 2, TILE_SIZE * 2, -500, -500), false)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/game/lineOfSight.test.js`
Expected: FAIL — `hasLineOfSight` is not exported from `grid.js`.

- [ ] **Step 3: Implement the primitive**

Append to `server/game/grid.js`:

```js
// Amanatides–Woo tile traversal between two world points. Returns false as soon
// as a solid tile is entered before reaching the target tile. Allocation-free
// (all scalars) — safe for the per-enemy-per-tick path. The START tile is never
// tested (an enemy body may overlap a wall it was pushed against) and the TARGET
// tile is never tested (you can see the wall you are standing on).
export function hasLineOfSight(isSolidTile, x0, y0, x1, y1) {
  let gx = worldToTileX(x0), gy = worldToTileY(y0)
  const gx1 = worldToTileX(x1), gy1 = worldToTileY(y1)
  if (gx === gx1 && gy === gy1) return true

  const dx = x1 - x0, dy = y1 - y0
  const stepX = dx > 0 ? 1 : -1
  const stepY = dy > 0 ? 1 : -1
  const adx = Math.abs(dx), ady = Math.abs(dy)
  const tDeltaX = adx === 0 ? Infinity : TILE_SIZE / adx
  const tDeltaY = ady === 0 ? Infinity : TILE_SIZE / ady
  let tMaxX = adx === 0 ? Infinity
    : (dx > 0 ? (gx + 1) * TILE_SIZE - x0 : x0 - gx * TILE_SIZE) / adx
  let tMaxY = ady === 0 ? Infinity
    : (dy > 0 ? (gy + 1) * TILE_SIZE - y0 : y0 - gy * TILE_SIZE) / ady

  // Bounded: the map diagonal is 63 tiles, so 256 steps can never be reached
  // legitimately. The guard exists so a NaN input can never spin the tick.
  for (let guard = 0; guard < 256; guard++) {
    if (tMaxX < tMaxY) { gx += stepX; tMaxX += tDeltaX }
    else { gy += stepY; tMaxY += tDeltaY }
    if (!inBounds(gx, gy)) return false
    if (gx === gx1 && gy === gy1) return true
    if (isSolidTile(gx, gy)) return false
  }
  return false
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/game/lineOfSight.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add server/game/grid.js test/game/lineOfSight.test.js
git commit -m "Phase 8A: allocation-free tile line-of-sight primitive"
```

---

## Task 2: Gate chase steering on line-of-sight

This is the core root-cause fix. Currently `server/game/enemies.js:221-238` steers straight at the target regardless of geometry, and bashes whatever wall it walks into. After this task, a chasing enemy that cannot see its target reverts to cost-field march — which already routes correctly around obstacles.

**Files:**
- Modify: `server/game/enemies.js` (import line ~16-20, and the steering block at ~217-251)
- Test: `test/game/chaseRouting.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `test/game/chaseRouting.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tileToWorldX, tileToWorldY, TILE_SIZE } from '../../server/game/grid.js'
import { CostField, hpToBand } from '../../server/game/costField.js'
import { ENEMY_TYPE } from '../../server/game/enemyTypes.js'
import { EnemyStore, tickEnemies } from '../../server/game/enemies.js'

let sid = 0
function struct(gx, gy, hp = 40) {
  return { id: sid++, type: 'BARRICADE', ownerId: 'x', gx, gy, w: 1, h: 1,
           hp, maxHp: hp, dormant: false, createdAt: 0 }
}

function makeSimState({ structures = [], players = [], hallGx = 19, hallGy = 19 } = {}) {
  const cf = new CostField()
  cf.setHall(hallGx, hallGy)
  for (const s of structures) cf.setWallBand(s.gx, s.gy, hpToBand(s.hp, s.maxHp))
  cf.compute()
  return {
    enemyStore: new EnemyStore(), costField: cf, structures, players,
    hall: { gx: hallGx, gy: hallGy, w: 2, h: 2,
            x: (hallGx + 1) * TILE_SIZE, y: (hallGy + 1) * TILE_SIZE, hp: 1000, maxHp: 1000 },
    placedVersion: 0, livingEnemyCount: 0, waveBounty: 0, fx: [], wave: 1,
  }
}

function player(id, gx, gy) {
  return { id, x: tileToWorldX(gx), y: tileToWorldY(gy), alive: true, life: 'up',
           hp: 100, maxHp: 100, protectedUntil: 0, kvx: 0, kvy: 0 }
}

function run(state, ticks, startNow = 0) {
  let now = startNow
  for (let t = 0; t < ticks; t++) { now += 50; tickEnemies(state, now, 50) }
  return now
}

test('a chasing enemy with clear line of sight still beelines at its target', () => {
  const p = player('p1', 10, 5)
  const state = makeSimState({ players: [p] })
  const st = state.enemyStore
  const i = st.spawn({ type: ENEMY_TYPE.GOBLIN, elite: false,
                       x: tileToWorldX(5), y: tileToWorldY(5) }, 0)
  const startDist = Math.abs(st.x[i] - p.x)
  run(state, 20)
  assert.ok(st.aggro[i].state === 'chase', 'proximity triggered a chase')
  assert.ok(Math.abs(st.x[i] - p.x) < startDist - 10, 'closed distance toward the target')
  assert.ok(Math.abs(st.y[i] - p.y) < TILE_SIZE, 'stayed on the straight line (did not route)')
})

test('a chasing enemy whose target is behind a wall does NOT walk into the wall', () => {
  // Wall column at gx=7 spanning the corridor; player at gx=10, enemy at gx=5.
  const structures = []
  for (let gy = 0; gy < 12; gy++) structures.push(struct(7, gy))
  const p = player('p1', 10, 5)
  const state = makeSimState({ structures, players: [p] })
  const st = state.enemyStore
  const i = st.spawn({ type: ENEMY_TYPE.GOBLIN, elite: false,
                       x: tileToWorldX(5), y: tileToWorldY(5) }, 0)

  run(state, 40)

  // The defining assertion: it must not be parked against the wall face.
  // Cost-field march sends it around the wall's open end (gy >= 12) toward the
  // hall, so it makes real vertical progress instead of grinding at gx≈6.
  assert.ok(st.y[i] > tileToWorldY(6), 'routed around the wall instead of beelining into it')
})

test('CP3-C1 stays closed: a player holding aggro across a wall cannot freeze the enemy', () => {
  const structures = []
  for (let gy = 0; gy < 12; gy++) structures.push(struct(7, gy))
  const p = player('p1', 8, 5)          // pressed right up against the far side
  const state = makeSimState({ structures, players: [p] })
  const st = state.enemyStore
  const i = st.spawn({ type: ENEMY_TYPE.GOBLIN, elite: false,
                       x: tileToWorldX(6), y: tileToWorldY(5) }, 0)

  const x0 = st.x[i], y0 = st.y[i]
  run(state, 60)
  const moved = Math.hypot(st.x[i] - x0, st.y[i] - y0)
  const wallStillUp = structures[5].hp === 40

  // Either it left (routed away) or it chewed through the wall. What it must
  // NEVER do is sit motionless being safely meleed through an intact barricade.
  assert.ok(moved > TILE_SIZE || !wallStillUp,
    'the enemy either routed away or bulldozed — it did not stall against the wall')
})

test('losing line of sight mid-chase reverts steering to the cost field', () => {
  const p = player('p1', 10, 5)
  const state = makeSimState({ players: [p] })
  const st = state.enemyStore
  const i = st.spawn({ type: ENEMY_TYPE.GOBLIN, elite: false,
                       x: tileToWorldX(5), y: tileToWorldY(5) }, 0)
  run(state, 10)
  assert.equal(st.aggro[i].state, 'chase')

  // Drop a wall between them, mid-chase.
  for (let gy = 0; gy < 12; gy++) {
    const s = struct(7, gy)
    state.structures.push(s)
    state.costField.setWallBand(s.gx, s.gy, hpToBand(s.hp, s.maxHp))
  }
  state.costField.compute()

  const yBefore = st.y[i]
  run(state, 30, 500)
  assert.ok(st.y[i] > yBefore + 4, 'switched to the routed march instead of pressing the wall')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/game/chaseRouting.test.js`
Expected: FAIL — the wall tests fail because chase currently beelines and grinds against the wall face.

- [ ] **Step 3: Implement the LoS gate**

In `server/game/enemies.js`, add `hasLineOfSight` to the existing `./grid.js` import block (around line 16-20):

```js
import {
  N_TILES, tileIdx, inBounds, TILE_SIZE,
  NEIGHBOR_DX, NEIGHBOR_DY,
  tileToWorldX, tileToWorldY, worldToTileX, worldToTileY,
  hasLineOfSight,
} from './grid.js'
```

Then replace the whole steering block (currently `server/game/enemies.js:217-251`, from `let dirX = 0, dirY = 0` down to the closing brace of the `else` march branch) with:

```js
    let dirX = 0, dirY = 0
    let attackStruct = -1
    let attackPlayer = null
    const attackHall = hallEdgeDist(hall, ex, ey) <= MELEE_RANGE_PX + store.radius[i]

    // Phase 8A root-cause fix: CHASE is now a LINE-OF-SIGHT behaviour. It used
    // to steer with a raw unit vector at the target regardless of geometry, so
    // a chaser would walk into walls and (post-CP3-C1) grind them down in place.
    // That unrouted beeline was the shared root cause behind the chaotic,
    // non-monotonic balance results documented in the Phase-4 respawn revert and
    // the Phase-6 designer remediation stamp. When LoS is blocked we fall
    // through to the march branch, which descends the cost field and therefore
    // routes around obstacles (and still bulldozes a wall that sits on its
    // cheapest path). CP3-C1 stays closed: the enemy no longer freezes against
    // a barricade being safely meleed through it — it leaves or it chews.
    let steering = mode
    if (mode === AGGRO_MODE.CHASE && target) {
      const dx = target.x - ex, dy = target.y - ey
      const d = Math.hypot(dx, dy) || 1
      if (d <= store.radius[i] + CONFIG.PLAYER_RADIUS + MELEE_RANGE_PX) {
        dirX = dx / d; dirY = dy / d
        attackPlayer = target
      } else if (hasLineOfSight(solidFn(costField), ex, ey, target.x, target.y)) {
        dirX = dx / d; dirY = dy / d
      } else {
        steering = AGGRO_MODE.MARCH
      }
    } else {
      steering = AGGRO_MODE.MARCH
    }

    if (steering === AGGRO_MODE.MARCH) {
      const gx = worldToTileX(ex), gy = worldToTileY(ey)
      const k = chooseStepDir(costField, gx, gy)
      if (k !== -1) {
        const tx = gx + NEIGHBOR_DX[k], ty = gy + NEIGHBOR_DY[k]
        if (costField.wallBand[tileIdx(tx, ty)] !== BAND_NONE) {
          attackStruct = store.tileStruct[tileIdx(tx, ty)]  // bulldoze the wall on the path
        } else {
          const inv = 1 / Math.hypot(NEIGHBOR_DX[k], NEIGHBOR_DY[k])
          dirX = NEIGHBOR_DX[k] * inv; dirY = NEIGHBOR_DY[k] * inv
        }
      }
    }
```

Note: the old chase branch's `attackStruct` wall-bash lookup is deliberately deleted — the march branch's bulldoze now covers that case, which is what closes CP3-C1 without stalling the enemy.

- [ ] **Step 4: Run the new tests, then the full suite**

Run: `node --test test/game/chaseRouting.test.js`
Expected: PASS, 4 tests.

Run: `npm test`
Expected: all tests pass. **If `phase4Acceptance` / `phase6Acceptance` now fail, STOP and report** — do not tune numbers to make them pass. A shifted acceptance here is expected-ish (the sim genuinely changed) and needs a human decision about re-certifying the baseline, which is exactly the trap Phases 4 and 6 fell into.

- [ ] **Step 5: Commit**

```bash
git add server/game/enemies.js test/game/chaseRouting.test.js
git commit -m "Phase 8A: gate chase steering on line-of-sight, route via cost field when blocked"
```

---

## Task 3: Add the spawn-protection balance value

**Files:**
- Modify: `shared/balance.js` (`PLAYER` block, after `RESPAWN_PER_WAVE_MS` at ~213)

- [ ] **Step 1: Add the tunable**

In `shared/balance.js`, inside the `PLAYER` block, immediately after the `RESPAWN_PER_WAVE_MS` line:

```js
    RESPAWN_PER_WAVE_MS: 1_000, // ...scaling longer per wave beyond the first
    // Phase 8A: a respawned player cannot trigger or hold enemy aggro for this
    // long. Decouples hall-adjacent respawn timing from the hall fight — half of
    // the root cause behind the non-monotonic balance results in Phases 4 and 6.
    // Flat window by design: an ends-on-attack rule would make the real duration
    // a function of combat timing, reintroducing the coupling this removes.
    SPAWN_PROTECT_MS:   2_500,  // [Phase 8C sweep]
```

- [ ] **Step 2: Verify nothing broke**

Run: `npm test`
Expected: all tests still pass (the value is not read yet).

- [ ] **Step 3: Commit**

```bash
git add shared/balance.js
git commit -m "Phase 8A: add PLAYER.SPAWN_PROTECT_MS tunable"
```

---

## Task 4: Spawn protection on respawn

**Files:**
- Modify: `server/game/state.js` (~line 53, player object literal)
- Modify: `server/game/players.js` (`respawn`, ~70; its call site, ~111)
- Modify: `server/game/enemies.js` (aggro target scan, ~193-208)
- Test: `test/game/spawnProtection.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `test/game/spawnProtection.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tileToWorldX, tileToWorldY, TILE_SIZE } from '../../server/game/grid.js'
import { CostField } from '../../server/game/costField.js'
import { ENEMY_TYPE } from '../../server/game/enemyTypes.js'
import { EnemyStore, tickEnemies } from '../../server/game/enemies.js'
import { BALANCE } from '../../shared/balance.js'

function makeSimState(players) {
  const cf = new CostField()
  cf.setHall(19, 19)
  cf.compute()
  return {
    enemyStore: new EnemyStore(), costField: cf, structures: [], players,
    hall: { gx: 19, gy: 19, w: 2, h: 2, x: 20 * TILE_SIZE, y: 20 * TILE_SIZE, hp: 1000, maxHp: 1000 },
    placedVersion: 0, livingEnemyCount: 0, waveBounty: 0, fx: [], wave: 1,
  }
}

function player(id, gx, gy, protectedUntil = 0) {
  return { id, x: tileToWorldX(gx), y: tileToWorldY(gy), alive: true, life: 'up',
           hp: 100, maxHp: 100, protectedUntil, kvx: 0, kvy: 0 }
}

test('a spawn-protected player does not trigger aggro', () => {
  const p = player('p1', 6, 5, 10_000)          // protected well past the run
  const state = makeSimState([p])
  const st = state.enemyStore
  const i = st.spawn({ type: ENEMY_TYPE.GOBLIN, elite: false,
                       x: tileToWorldX(5), y: tileToWorldY(5) }, 0)
  let now = 0
  for (let t = 0; t < 20; t++) { now += 50; tickEnemies(state, now, 50) }
  assert.equal(st.aggro[i].state, 'march', 'protected player was invisible to aggro')
})

test('an unprotected player in the same position DOES trigger aggro (control)', () => {
  const p = player('p1', 6, 5, 0)
  const state = makeSimState([p])
  const st = state.enemyStore
  const i = st.spawn({ type: ENEMY_TYPE.GOBLIN, elite: false,
                       x: tileToWorldX(5), y: tileToWorldY(5) }, 0)
  let now = 0
  for (let t = 0; t < 20; t++) { now += 50; tickEnemies(state, now, 50) }
  assert.equal(st.aggro[i].state, 'chase', 'the protection is what made the difference')
})

test('protection expiring mid-run lets aggro resume', () => {
  const p = player('p1', 6, 5, 300)             // expires after ~6 ticks
  const state = makeSimState([p])
  const st = state.enemyStore
  const i = st.spawn({ type: ENEMY_TYPE.GOBLIN, elite: false,
                       x: tileToWorldX(5), y: tileToWorldY(5) }, 0)
  let now = 0
  for (let t = 0; t < 4; t++) { now += 50; tickEnemies(state, now, 50) }
  assert.equal(st.aggro[i].state, 'march', 'still protected')
  for (let t = 0; t < 20; t++) { now += 50; tickEnemies(state, now, 50) }
  assert.equal(st.aggro[i].state, 'chase', 'protection lapsed, aggro resumed')
})

test('an in-flight chase drops when its target becomes protected', () => {
  const p = player('p1', 6, 5, 0)
  const state = makeSimState([p])
  const st = state.enemyStore
  const i = st.spawn({ type: ENEMY_TYPE.GOBLIN, elite: false,
                       x: tileToWorldX(5), y: tileToWorldY(5) }, 0)
  let now = 0
  for (let t = 0; t < 10; t++) { now += 50; tickEnemies(state, now, 50) }
  assert.equal(st.aggro[i].state, 'chase')

  p.protectedUntil = now + 10_000               // died and respawned protected
  for (let t = 0; t < 10; t++) { now += 50; tickEnemies(state, now, 50) }
  assert.notEqual(st.aggro[i].state, 'chase', 'the lock released')
})

test('SPAWN_PROTECT_MS is a sane, swept-range value', () => {
  assert.ok(BALANCE.PLAYER.SPAWN_PROTECT_MS >= 1000)
  assert.ok(BALANCE.PLAYER.SPAWN_PROTECT_MS <= 5000)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/game/spawnProtection.test.js`
Expected: FAIL — `protectedUntil` is never consulted, so the protected player still pulls a chase.

- [ ] **Step 3: Implement**

**3a.** In `server/game/state.js`, in the player object literal, after the `respawnAt: 0,` line (~53):

```js
    respawnAt: 0,            // hall-respawn time while dead
    protectedUntil: 0,       // Phase 8A: no-aggro window after a hall respawn
```

**3b.** In `server/game/players.js`, change `respawn` to take `now` and stamp the window:

```js
function respawn(state, p, now) {
  p.life = 'up'
  p.alive = true
  p.hp = p.maxHp
  p.x = p.spawnX
  p.y = p.spawnY
  p.kvx = 0; p.kvy = 0
  p.reviveMs = 0
  // Phase 8A: a player rejoining at the hall must not instantly become an aggro
  // magnet in the middle of the hall fight.
  p.protectedUntil = now + P.SPAWN_PROTECT_MS
  state.fx.push({ type: 'respawn', x: p.x, y: p.y })
}
```

And update its call site (~line 111):

```js
  if (p.life === 'dead' && now >= p.respawnAt) respawn(state, p, now)
```

**3c.** In `server/game/enemies.js`, make protected players invisible to aggro. In the nearest-player scan (~193-199), extend the skip condition:

```js
    for (let pi = 0; pi < np; pi++) {
      const p = players[pi]
      if (p.alive === false) continue
      if (now < p.protectedUntil) continue        // Phase 8A: spawn-protected
      const dx = p.x - ex, dy = p.y - ey
      const d2 = dx * dx + dy * dy
      if (d2 < nearD2) { nearD2 = d2; nearP = p }
    }
```

And in the chase-target resolution just below (~203-208), so an in-flight lock releases too:

```js
    let target = null
    if (ag.state === 'chase') {
      for (let pi = 0; pi < np; pi++) {
        const p = players[pi]
        if (p.id === ag.targetId && p.alive !== false && now >= p.protectedUntil) { target = p; break }
      }
    }
```

- [ ] **Step 4: Run the tests**

Run: `node --test test/game/spawnProtection.test.js`
Expected: PASS, 5 tests.

Run: `npm test`
Expected: all pass. Same rule as Task 2 — if an acceptance test flips, STOP and report rather than tuning.

- [ ] **Step 5: Commit**

```bash
git add server/game/state.js server/game/players.js server/game/enemies.js test/game/spawnProtection.test.js
git commit -m "Phase 8A: spawn-protection window decouples hall respawn from the hall fight"
```

---

## Task 5: Monotonicity probe — prove the chaos is gone

This is the gate for the whole phase. If the dials are still chaotic, Phase 8C tuning cannot be trusted and this plan has not achieved its goal.

**Files:**
- Create: `tools/monotonicityProbe.js`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Write the probe**

Create `tools/monotonicityProbe.js`:

```js
// Phase 8A verification. Re-runs the two dials that previously flipped the
// acceptance chaotically (Phase-4 RESPAWN_BASE_MS, Phase-6 bot melee multiplier)
// across many seeds, and reports survival as a function of the dial value.
//
// PASS CRITERIA: survival rate should be a broadly MONOTONIC function of each
// dial. The Phase-6 stamp recorded the pathology to beat: bot melee mult 0.7
// survived to wave 9 while 0.85 and 1.0 lost at wave 4 (weaker bots doing
// BETTER). Any repeat of that shape means the root cause is not fixed.
//
// Run: npm run probe

import { createGameState } from '../server/game/state.js'
import { startBuildPhase, PHASES } from '../server/game/phaseMachine.js'
import { tickGame } from '../server/game/tick.js'
import { hpToBand } from '../server/game/costField.js'
import { STRUCTURE_TYPES, TILE_SIZE } from '../shared/constants.js'
import { BALANCE } from '../shared/balance.js'

const SEEDS = [20260720, 20260721, 20260722, 20260723, 20260724,
               20260725, 20260726, 20260727, 20260728, 20260729]

let sid = 90_000
function addStructure(state, type, gx, gy) {
  const cat = BALANCE.STRUCTURES[type]
  const s = { id: sid++, type, ownerId: 'script', gx, gy, w: 1, h: 1,
              hp: cat.hp, maxHp: cat.hp, dormant: false, createdAt: 0, attackReadyAt: 0 }
  state.structures.push(s)
  state.costField.setWallBand(gx, gy, hpToBand(s.hp, s.maxHp))
  state.placedVersion++
  return s
}

function buildMaze(state) {
  const WALL_ROW = 8, GAP_A = 13, GAP_B = 27
  for (let gx = 1; gx < 39; gx++) {
    if (gx === GAP_A || gx === GAP_B) continue
    addStructure(state, STRUCTURE_TYPES.BARRICADE, gx, WALL_ROW)
  }
  state.costField.compute()
  return { WALL_ROW, GAP_A }
}

function humanInputs(state, post) {
  const buf = new Map()
  const st = state.enemyStore
  for (const p of state.players) {
    if (p.isBot || !p.alive) continue
    let aimX = 0, aimY = -1, bd = Infinity
    for (let i = 0; i < st.count; i++) {
      const dx = st.x[i] - p.x, dy = st.y[i] - p.y
      const d2 = dx * dx + dy * dy
      if (d2 < bd) { bd = d2; aimX = dx; aimY = dy }
    }
    const keys = { w: false, a: false, s: false, d: false }
    const tx = post.x - p.x, ty = post.y - p.y
    if (Math.abs(tx) > 8) (tx > 0 ? keys.d = true : keys.a = true)
    if (Math.abs(ty) > 8) (ty > 0 ? keys.s = true : keys.w = true)
    buf.set(p.id, { keys, aimX, aimY, actions: { basic: true, special: true, second: true } })
  }
  return buf
}

// Runs one match; returns the wave reached (>= targetWave means survived).
function runMatch(seed, targetWave = 5) {
  const room = {
    players: [
      { id: 'h0', element: 'EARTH', displayName: 'human-earth', isBot: false },
      { id: 'b1', element: 'FIRE',  displayName: 'fire-bot',    isBot: true },
      { id: 'b2', element: 'WATER', displayName: 'water-bot',   isBot: true },
      { id: 'b3', element: 'WIND',  displayName: 'wind-bot',    isBot: true },
    ],
    settings: { timingStyle: 'fixed', friendlyFire: false },
  }
  const state = createGameState(room, seed)
  startBuildPhase(state, 1)
  const { WALL_ROW, GAP_A } = buildMaze(state)
  const post = { x: (GAP_A + 0.5) * TILE_SIZE, y: (WALL_ROW + 3) * TILE_SIZE }

  let now = 0
  for (let t = 0; t < 200_000; t++) {
    now += 50
    if (state.phase === PHASES.BUILD || state.phase === PHASES.WAVE_END) state.phaseClockMs = 0
    tickGame(state, humanInputs(state, post), now, 50)
    if (state.phase === PHASES.LOST) return state.wave
    if (state.wave >= targetWave) return state.wave
  }
  return state.wave
}

function sweepDial(label, values, apply, restore) {
  console.log(`\n=== ${label} ===`)
  const rows = []
  for (const v of values) {
    apply(v)
    let survived = 0
    const waves = []
    for (const seed of SEEDS) {
      const w = runMatch(seed)
      waves.push(w)
      if (w >= 5) survived++
    }
    const rate = survived / SEEDS.length
    rows.push({ value: v, rate })
    console.log(`  ${String(v).padStart(8)} → survived ${survived}/${SEEDS.length}` +
                ` (${(rate * 100).toFixed(0)}%)  waves: ${waves.join(',')}`)
  }
  restore()

  // Flag non-monotonicity: a dip followed by a rise (or vice versa) of > 30pp.
  let flips = 0
  for (let i = 2; i < rows.length; i++) {
    const a = rows[i - 2].rate, b = rows[i - 1].rate, c = rows[i].rate
    if ((b - a > 0.3 && b - c > 0.3) || (a - b > 0.3 && c - b > 0.3)) flips++
  }
  console.log(flips === 0
    ? '  VERDICT: monotonic enough — this dial is now safe to sweep.'
    : `  VERDICT: ${flips} NON-MONOTONIC REVERSAL(S) — root cause NOT fixed. Do not sweep.`)
  return flips
}

const P = BALANCE.PLAYER
const B = BALANCE.BOT
const origRespawn = P.RESPAWN_BASE_MS
const origMelee = B.MELEE_MULT ?? 1

let totalFlips = 0
totalFlips += sweepDial(
  'Phase-4 dial: PLAYER.RESPAWN_BASE_MS (lower = friendlier, expect rate to rise)',
  [10_000, 12_000, 15_000, 18_000, 20_000],
  v => { P.RESPAWN_BASE_MS = v },
  () => { P.RESPAWN_BASE_MS = origRespawn },
)
totalFlips += sweepDial(
  'Phase-6 dial: BOT.MELEE_MULT (higher = stronger bots, expect rate to rise)',
  [0.7, 0.85, 1.0, 1.15, 1.3],
  v => { B.MELEE_MULT = v },
  () => { B.MELEE_MULT = origMelee },
)

console.log(`\n${'='.repeat(60)}`)
console.log(totalFlips === 0
  ? 'PHASE 8A VERIFIED: both previously-chaotic dials now behave monotonically.'
  : `PHASE 8A NOT VERIFIED: ${totalFlips} reversal(s) remain. Report before proceeding to 8C.`)
process.exit(totalFlips === 0 ? 0 : 1)
```

- [ ] **Step 2: Wire up the npm script**

In `package.json`, add to `"scripts"`:

```json
    "probe": "node tools/monotonicityProbe.js",
```

- [ ] **Step 3: Check the BOT melee dial actually exists**

Run: `grep -n "MELEE" shared/balance.js`

The probe assumes a `BALANCE.BOT.MELEE_MULT`. If the `BOT` block has no such key, the Phase-6 stamp's "bot-only melee multiplier" was a local experiment rather than a shipped tunable — in that case **add it** to the `BOT` block in `shared/balance.js`:

```js
    MELEE_MULT: 1.0,   // bot-only melee scalar [Phase 8C sweep dial]
```

and apply it in `server/game/bots.js` wherever the bot's melee damage is produced (multiply the per-class melee damage by `BALANCE.BOT.MELEE_MULT`). Commit that as its own step with a test asserting a bot at `MELEE_MULT = 0.5` deals half the damage of the same class at `1.0`.

- [ ] **Step 4: Run the probe**

Run: `npm run probe`
Expected: exit code 0 and `PHASE 8A VERIFIED`.

**If it reports reversals: STOP and report to Philip.** Do not proceed to Task 6, and do not attempt to tune values to make the probe pass — a passing probe obtained by tuning is precisely the failure mode of Phases 4 and 6. Include the printed tables in the report.

- [ ] **Step 5: Commit**

```bash
git add tools/monotonicityProbe.js package.json
git commit -m "Phase 8A: monotonicity probe verifies the chaotic dials are stable"
```

---

## Task 6: Inverse acceptance control

The Phase-6 designer review's explicit recommendation: the current acceptance can pass while CRIT-1 (bots over-tank a solo run) is wide open. The inverse control binds it.

**Files:**
- Modify: `test/game/phase6Acceptance.test.js` (append)

- [ ] **Step 1: Write the failing test**

Append to `test/game/phase6Acceptance.test.js`:

```js
// INVERSE CONTROL (Phase-6 designer review, CRIT-1). The forward acceptance
// proves bots are strong enough to matter. This proves they are not SO strong
// that they solo the game: with no maze at all, 3 bots plus an idle human must
// eventually lose. Spec §4 — bots supplement a team, they are not the answer to
// playing solo. Without this bar, CRIT-1 can regress silently.
test('INVERSE CONTROL: 3 bots + idle human + no maze must lose', () => {
  const state = makeMatch()          // deliberately NO buildMaze() call

  let now = 0
  let resolved = false
  for (let t = 0; t < 400_000; t++) {
    now += 50
    if (state.phase === PHASES.BUILD || state.phase === PHASES.WAVE_END) state.phaseClockMs = 0
    const buf = new Map()
    for (const p of state.players) if (!p.isBot) buf.set(p.id, IDLE)   // human does nothing
    tickGame(state, buf, now, 50)
    if (state.phase === PHASES.LOST || state.phase === PHASES.WON) { resolved = true; break }
  }

  assert.ok(resolved, 'the run resolved rather than timing out')
  assert.equal(state.phase, PHASES.LOST,
    'bots alone with no maze must not carry a passive player through all 10 waves')
})
```

- [ ] **Step 2: Run it**

Run: `node --test test/game/phase6Acceptance.test.js`

Expected: **FAIL** — the Phase-6 CP3 review measured exactly this scenario holding flawlessly to wave 8, and CRIT-1 was deferred, so bots are currently too strong.

- [ ] **Step 3: Do NOT fix it by tuning here**

This test is the *bar for Phase 8C*, not a defect to patch in 8B. Mark it pending so the suite stays green and the bar is recorded in code:

```js
test('INVERSE CONTROL: 3 bots + idle human + no maze must lose', { skip: 'Phase 8C: CRIT-1 bot-strength dial not yet swept' }, () => {
```

Leave the body exactly as written. Phase 8C removes the `skip` once the bot dial is tuned — that is the definition of done for CRIT-1.

- [ ] **Step 4: Verify the suite is green**

Run: `npm test`
Expected: all pass, one skipped.

- [ ] **Step 5: Commit**

```bash
git add test/game/phase6Acceptance.test.js
git commit -m "Phase 8B: inverse acceptance control for CRIT-1 (skipped until 8C sweeps the bot dial)"
```

---

## Task 7: Balance sweep harness

**Files:**
- Create: `tools/balanceSweep.js`
- Modify: `package.json` (scripts)

Sweep target confirmed by Philip: **1 human + 3 bots**. Acceptance bar: **40–70% win rate across seeds**.

- [ ] **Step 1: Write the harness**

Create `tools/balanceSweep.js`:

```js
// Phase 8C balance sweep harness (ez-ctf balance_sweep.js pattern). Runs the
// real tickGame path headlessly across seeds and dial values, reporting FULL
// 10-WAVE win rate for the confirmed sweep target: 1 human + 3 bots.
//
// The plan's bar is a 40-70% win rate for a competent team. Below 40% the slice
// is punishing; above 70% it is a formality.
//
// Usage:
//   npm run sweep                      # baseline win rate only
//   npm run sweep -- PLAYER.RESPAWN_BASE_MS=10000,15000,20000
//   npm run sweep -- BOT.MELEE_MULT=0.6,0.8,1.0 --seeds 20

import { createGameState } from '../server/game/state.js'
import { startBuildPhase, PHASES } from '../server/game/phaseMachine.js'
import { tickGame } from '../server/game/tick.js'
import { hpToBand } from '../server/game/costField.js'
import { STRUCTURE_TYPES, TILE_SIZE } from '../shared/constants.js'
import { BALANCE } from '../shared/balance.js'

const args = process.argv.slice(2)
const seedFlag = args.indexOf('--seeds')
const SEED_COUNT = seedFlag === -1 ? 12 : Number(args[seedFlag + 1])
const SEEDS = Array.from({ length: SEED_COUNT }, (_, i) => 20260800 + i)
const dialArg = args.find(a => a.includes('=') && !a.startsWith('--'))

// Resolve "PLAYER.RESPAWN_BASE_MS" against the BALANCE object.
function resolvePath(path) {
  const parts = path.split('.')
  let obj = BALANCE
  for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]]
  const key = parts[parts.length - 1]
  if (obj === undefined || !(key in obj)) throw new Error(`No such balance key: ${path}`)
  return { obj, key }
}

let sid = 80_000
function addStructure(state, type, gx, gy) {
  const cat = BALANCE.STRUCTURES[type]
  const s = { id: sid++, type, ownerId: 'script', gx, gy, w: 1, h: 1,
              hp: cat.hp, maxHp: cat.hp, dormant: false, createdAt: 0, attackReadyAt: 0 }
  state.structures.push(s)
  state.costField.setWallBand(gx, gy, hpToBand(s.hp, s.maxHp))
  state.placedVersion++
  return s
}

function buildMaze(state) {
  const WALL_ROW = 8, GAP_A = 13, GAP_B = 27
  for (let gx = 1; gx < 39; gx++) {
    if (gx === GAP_A || gx === GAP_B) continue
    addStructure(state, STRUCTURE_TYPES.BARRICADE, gx, WALL_ROW)
  }
  state.costField.compute()
  return { WALL_ROW, GAP_A }
}

function humanInputs(state, post) {
  const buf = new Map()
  const st = state.enemyStore
  for (const p of state.players) {
    if (p.isBot || !p.alive) continue
    let aimX = 0, aimY = -1, bd = Infinity
    for (let i = 0; i < st.count; i++) {
      const dx = st.x[i] - p.x, dy = st.y[i] - p.y
      const d2 = dx * dx + dy * dy
      if (d2 < bd) { bd = d2; aimX = dx; aimY = dy }
    }
    const keys = { w: false, a: false, s: false, d: false }
    const tx = post.x - p.x, ty = post.y - p.y
    if (Math.abs(tx) > 8) (tx > 0 ? keys.d = true : keys.a = true)
    if (Math.abs(ty) > 8) (ty > 0 ? keys.s = true : keys.w = true)
    buf.set(p.id, { keys, aimX, aimY, actions: { basic: true, special: true, second: true } })
  }
  return buf
}

// One full 10-wave match. Returns { won, wave, hallHpPct }.
function runMatch(seed) {
  const room = {
    players: [
      { id: 'h0', element: 'EARTH', displayName: 'human-earth', isBot: false },
      { id: 'b1', element: 'FIRE',  displayName: 'fire-bot',    isBot: true },
      { id: 'b2', element: 'WATER', displayName: 'water-bot',   isBot: true },
      { id: 'b3', element: 'WIND',  displayName: 'wind-bot',    isBot: true },
    ],
    settings: { timingStyle: 'fixed', friendlyFire: false },
  }
  const state = createGameState(room, seed)
  startBuildPhase(state, 1)
  const { WALL_ROW, GAP_A } = buildMaze(state)
  const post = { x: (GAP_A + 0.5) * TILE_SIZE, y: (WALL_ROW + 3) * TILE_SIZE }

  let now = 0
  for (let t = 0; t < 600_000; t++) {
    now += 50
    if (state.phase === PHASES.BUILD || state.phase === PHASES.WAVE_END) state.phaseClockMs = 0
    tickGame(state, humanInputs(state, post), now, 50)
    if (state.phase === PHASES.LOST || state.phase === PHASES.WON) break
  }
  return {
    won: state.phase === PHASES.WON,
    wave: state.wave,
    hallHpPct: state.hall.hp / state.hall.maxHp,
  }
}

function measure(label) {
  let wins = 0, waveSum = 0, hallSum = 0
  const t0 = Date.now()
  for (const seed of SEEDS) {
    const r = runMatch(seed)
    if (r.won) wins++
    waveSum += r.wave
    hallSum += r.hallHpPct
  }
  const rate = wins / SEEDS.length
  const inBand = rate >= 0.4 && rate <= 0.7
  console.log(
    `  ${label.padEnd(26)} win ${(rate * 100).toFixed(0).padStart(3)}%` +
    `  avgWave ${(waveSum / SEEDS.length).toFixed(1)}` +
    `  avgHall ${(hallSum / SEEDS.length * 100).toFixed(0)}%` +
    `  ${inBand ? 'IN BAND' : 'out of band'}` +
    `  (${((Date.now() - t0) / 1000).toFixed(1)}s)`)
  return rate
}

console.log(`Balance sweep — 1 human + 3 bots, full 10 waves, ${SEEDS.length} seeds`)
console.log('Target band: 40-70% win rate\n')

if (!dialArg) {
  measure('baseline')
} else {
  const [path, listRaw] = dialArg.split('=')
  const values = listRaw.split(',').map(Number)
  const { obj, key } = resolvePath(path)
  const original = obj[key]
  console.log(`=== ${path} (baseline ${original}) ===`)
  for (const v of values) {
    obj[key] = v
    measure(`${key}=${v}`)
  }
  obj[key] = original
}
```

- [ ] **Step 2: Wire up the npm script**

In `package.json`, add to `"scripts"`:

```json
    "sweep": "node tools/balanceSweep.js",
```

- [ ] **Step 3: Run the baseline**

Run: `npm run sweep`
Expected: a single `baseline` line with a win-rate percentage. Note whether it is in the 40–70% band — **do not tune it now**, that is Phase 8C. Record the number in the report.

- [ ] **Step 4: Verify a dial sweep works end to end**

Run: `npm run sweep -- PLAYER.RESPAWN_BASE_MS=15000,20000,25000 --seeds 6`
Expected: three rows, and the baseline value restored afterwards (re-run `npm run sweep` and confirm the baseline number is unchanged).

- [ ] **Step 5: Commit**

```bash
git add tools/balanceSweep.js package.json
git commit -m "Phase 8B: headless balance sweep harness (1 human + 3 bots, 10-wave win rate)"
```

---

## Task 8: Spec amendment

**Files:**
- Modify: `docs/superpowers/specs/2026-07-17-slice1-design.md` (Amendments section)

- [ ] **Step 1: Write the amendment**

Append a dated amendment recording, in prose:

- **Chase is now a line-of-sight behaviour.** Chase-mode enemies steer directly at their target only while tile line-of-sight is clear; when it is blocked they revert to cost-field march. Rationale: the unrouted beeline was the shared root cause behind the non-monotonic balance results documented in the Phase-4 respawn revert and the Phase-6 CP3 remediation stamp. Consequence for CP3-C1: the explicit chase-mode wall-bash added in Phase 4 was removed, because a blocked chaser now marches (and the march branch already bulldozes a wall on its cheapest path) rather than freezing against the barricade.
- **Spawn protection.** `PLAYER.SPAWN_PROTECT_MS` (2.5s): a hall-respawned player cannot trigger or hold enemy aggro for a short window. Flat window with no ends-on-attack clause — an attack-clear would make the effective duration a function of combat timing, reinstating the coupling the change removes, and is a no-op against harnesses and bots that fire every tick.
- **Sweep target declared:** 1 human + 3 bots over a full 10-wave run, 40–70% win rate, measured by `tools/balanceSweep.js`.
- **CRIT-1 bar recorded in code:** the inverse acceptance control exists and is skipped pending the Phase 8C bot-strength sweep.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-07-17-slice1-design.md
git commit -m "Phase 8A/8B spec amendment: LoS chase gating, spawn protection, sweep target"
```

---

## Task 9: Checkpoint review

Per the standing authorization, the phase-boundary adversarial subagent review runs automatically.

- [ ] **Step 1: Confirm the suite and probe are green**

```bash
npm test && npm run probe
```

- [ ] **Step 2: Dispatch the review**

Dispatch one `Agent` subagent, senior-multiplayer-systems-programmer profile, adversarial mandate ("find what breaks; do not validate"), reviewing the Phase 8A/8B diff against the spec. Write findings to `docs/reviews/2026-07-24-phase8ab-programmer-review.md`.

Give the reviewer these specific questions:
- Does the LoS gate open any new exploit? Specifically: can a player now break aggro trivially by stepping behind any wall, and does that reintroduce risk-free kiting that the sticky/leash/commit FSM was built to prevent?
- Is `hasLineOfSight` correct at tile boundaries and for exactly-diagonal lines, and is it genuinely allocation-free?
- Does spawn protection let a player camp the hall, or interact badly with `restoreAllPlayers` at build-phase start (which does not stamp a protection window)?
- Is the sweep harness measuring what it claims — is the scripted human genuinely "competent", and does the maze bias the result?

- [ ] **Step 3: Verify each finding against live source before fixing**

Do not blind-apply. Reproduce each claimed failure first — the Phase-7 review established this as the house pattern and it caught a non-defect. Fix real findings with TDD, keep the suite green, then stamp the review doc with a remediation section.

- [ ] **Step 4: Report**

Report what was fixed, what was judged not-a-defect and why, the baseline sweep win rate, and the probe verdict. Then STOP — Phase 8C is a separate session.
