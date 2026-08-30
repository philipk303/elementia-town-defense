# Phase 8 — Fix the instrument first, then measure, then fix what the measurement justifies

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make this project capable of measuring its own balance honestly — genuine per-seed variation in the sim, a harness that actually plays the build phase, live (mutable) balance dials, and a continuous outcome metric — then publish a baseline and let that baseline decide which gameplay fixes Phase 8 ships.

**Architecture:** Phase 8A touches four things: `waves.js` gains per-spawn timing jitter drawn from the seeded RNG (the seed stops being one bit); five modules stop destructuring `BALANCE` to primitives at import (dials stop being dead); `WALL_ENTRY_COST` moves into `BALANCE` (the prime chaos suspect becomes sweepable); and a new `test/harness/` runs full 10-wave matches with a real 45-second build phase and a scripted build/rebuild policy, reporting a continuous score instead of a coin flip. Phase 8A ends at a **decision gate** — a published baseline table and a ruling from Philip. Phase 8B then ships only the fixes that stand on their own merits (a real cross-wall melee exploit, and spawn protection), each measured against that baseline. The chase-steering LoS gate is **deferred to 8C** because its justification was the diagnosis the review dismantled.

**Tech Stack:** Node 20 ESM, `node:test` + `node:assert/strict`, no new dependencies.

---

## Why this plan exists (read before Task 1)

The previous plan — `docs/superpowers/plans/2026-07-24-phase8a-8b-root-cause-and-sweep-harness.md` — was reviewed **NO GO** (`docs/reviews/2026-07-24-phase8ab-plan-review.md`). **Do not execute it.** Its TDD scaffolding was good; its premise was wrong.

Two verified instrument defects invalidate every balance measurement this project has taken:

1. **The seed is one bit.** `state.rng` is consumed exactly once per match — `server/game/waves.js:20`, via `server/game/state.js:76`. Everything downstream is deterministic by design. So N "seeds" produce at most **2** simulations (side gate LEFT vs RIGHT). "10/10", "0/8", "5/15" were never statistics.
2. **The build phase never ran.** Both acceptance harnesses zero `state.phaseClockMs` every tick (`test/game/phase6Acceptance.test.js:98,118`), but the clock counts **down** (`phaseMachine.js:59`) and `isBuildComplete` for `fixed` is `phaseClockMs <= 0` (`phaseMachine.js:73`). Build lasted one tick, every wave, for ten waves. **Economy, tower placement, combos and dormancy have been inert in every measurement ever taken here.**

The consequence: the "chaotic, non-monotonic balance" finding that drove the Phase-4 respawn revert and the Phase-6 CP3 mass-deferral is most likely **a binary threshold observed through a two-valued instrument**, not a property of the simulation. The tell is that all three interventions Phase 6 measured as chaotic (reviver cap, anchor spread, melee mult) are *bot positioning* changes — none touches chase routing, so the "chase beeline" root-cause story never explained the reviver-cap result at all.

So this plan does not build a fix for chaos. It builds an instrument, measures, and stops.

---

## Decisions to confirm with Philip before Task 1

- [ ] **Channel-repair does not exist in the shipped game.** `server/game/repair.js` is spec'd, balanced (`BALANCE.REPAIR`), and unit-tested (`test/game/repair.test.js`) — but `tryChannelRepair` has **no caller outside its own test**. There is no `EVENTS.REPAIR_STRUCTURE` in `shared/constants.js`, no handler in `server/index.js`, no client binding. The review's HIGH-4 fix ("scripted build policy: repair any structure below 60 %") assumes a mechanic that is not wired.
  **This plan's scripted build policy therefore does NOT repair — it rebuilds destroyed barricades with real gold through the real `buildStructure` path.** That measures the game as it actually is: barricades are consumable. Wiring repair is a genuine feature addition and belongs in its own phase (proposed: 8D). Confirm this is the right call.

- [ ] **Phase 8B scope.** This plan ships only two gameplay changes, both justified independently of the chaos diagnosis: the CP3-C1 "half 2" cross-wall melee fix, and spawn protection. The **chase-steering LoS gate is deferred to 8C**, to be decided from the 8A baseline. Confirm.

- [x] **`test/game/phase6Acceptance.test.js` is left unchanged.** It is a shipped acceptance stamp; rewriting it to use a real build phase would very likely flip it, and this plan's discipline is *report, do not tune*. Task 7 instead runs the same scenario through the new harness and **reports** whether waves 1–4 still hold with a real build phase. Confirm.

  **AMENDED 2026-07-25 — Philip ruled option (a): both tests are `test.skip`ped with the rationale recorded in the file header.** The gate as written became untenable during Task 1. Wiring `state.rng` into `tick.js:19` turns the file red at `JITTER_MS = 150`, and the measured sweep (recorded in the file header and in the `elementia-spawn-grid-artifact` memory) shows the *control* — not just the acceptance half — fails at every jitter value from 10 to 100 ms: with any de-cohering of the spawn clumps, the botless maze survives untouched. So the control was measuring spawn-grid synchronization, not bot contribution, and "unmodified" now means "permanently red for a reason that invalidates the test anyway."

  The two options rejected, and why: carrying a permanent red through Tasks 2–7 would kill this plan's own `stop and report on any pre-existing failure` gates at Tasks 3, 5 and 6 — the condition under which a genuine new regression hides. Deferring the `tick.js` wiring to Task 4 would only relocate the collision to Task 2, whose `seedEntropy.test.js` is *designed* to fail without exactly that wiring.

  **`JITTER_MS` stays 150.** Values 75 and 300 are green; selecting one because it passes is tuning-to-pass, the failure mode this whole phase exists to end.

  This ruling **supersedes Task 4 Step 2** — the header note it asks for is already written, expanded to cover both the `phaseClockMs` limitation and the skip rationale. Task 4 Step 2 is a no-op; do not re-insert it.

## Non-goals

- Wiring channel-repair. (See above.)
- Moving `hpToBand`'s 0.6 / 0.25 band thresholds into `BALANCE`. `WALL_ENTRY_COST` is the dial worth sweeping; the thresholds are a second-order suspect.
- Moving `enemyMove.js`'s `MAX_STEP_PX` / `KB_*` constants into `BALANCE`.
- Any balance *tuning*. Every task in this plan that produces a number ends in "record it", never "adjust until it passes."
- A multi-dial sweep driver. `probe.js` sweeps one dial across the scenario matrix; that is the whole 8B harness deliverable. Multi-dial search is 8C.

---

## File structure

**Modified (production):**
- `shared/balance.js` — add `WAVE_SPAWN.JITTER_MS`, `COST_FIELD.WALL_ENTRY_COST`; later `PLAYER.SPAWN_PROTECT_MS` / `PLAYER.REVIVE_PROTECT_MS`.
- `server/game/waves.js` — `buildSpawnSchedule` gains an optional `rng` and jitters each spawn time.
- `server/game/tick.js` — passes `state.rng` into `buildSpawnSchedule`.
- `server/game/aggro.js`, `server/game/enemies.js`, `server/game/status.js` — object-ref reads instead of import-time destructuring.
- `server/game/costField.js` — `WALL_ENTRY_COST` becomes a live view onto `BALANCE`.
- `server/game/grid.js` — (8B) `hasLineOfSight`.
- `server/game/players.js` — (8B) melee LoS gate, spawn/revive protection.

**Created (harness — deliberately outside `test/**/*.test.js` so `npm test` does not run matches):**
- `test/harness/matchRunner.js` — builds a match, runs it to WON/LOST with a **real** build phase and a scripted build policy, returns continuous metrics. One responsibility: run one scenario, report numbers.
- `test/harness/scenarios.js` — the scenario matrix (seed list, maze variants, human posts) and the dial-path resolver.
- `test/harness/probe.js` — executable: sweep one dial across the matrix, print the table and a signal classification. **Never prints PASS/VERIFIED.**
- `test/harness/matchRunner.test.js` — the instrument's own test suite. This is the file that would have caught both defects.

**Created (docs):**
- `docs/reviews/2026-07-25-phase8a-baseline.md` — the published baseline.
- `docs/superpowers/specs/` amendment (Task 12, 8B only).

---

## Phase 8A — the instrument

### Task 1: Real seed entropy — per-spawn timing jitter

Today `buildSpawnSchedule` is deterministic by design and says so. That was correct when the seed's only job was gate order; it is why the seed space is one bit. Jitter on each spawn time is the cheapest honest entropy source, and it doubles as a sensitivity probe: if outcomes barely move under ±150 ms of spawn jitter, the sim is *stable*, and the "chaos" was measurement error.

The `rng` parameter is **optional** so every existing caller and test keeps its current byte-identical behaviour.

**Files:**
- Modify: `shared/balance.js:111`
- Modify: `server/game/waves.js:70-91`
- Modify: `server/game/tick.js:19`
- Test: `test/game/waves.test.js` (append)

- [ ] **Step 1: Write the failing tests**

Append to `test/game/waves.test.js`:

```js
test('without an rng the schedule is byte-identical to the un-jittered form', () => {
  const order = { SIDE_A: 'LEFT', SIDE_B: 'RIGHT' }
  const sched = buildSpawnSchedule(1, order)
  const { INTERVAL_MS, GATE_STAGGER_MS } = BALANCE.WAVE_SPAWN
  for (const s of sched) {
    const rem = (s.atMs % INTERVAL_MS + INTERVAL_MS) % INTERVAL_MS
    assert.ok(rem === 0 || rem === GATE_STAGGER_MS % INTERVAL_MS,
      `un-jittered atMs ${s.atMs} should sit on the grid`)
  }
})

test('an rng jitters the spawn times without changing the composition', () => {
  const order = { SIDE_A: 'LEFT', SIDE_B: 'RIGHT' }
  const plain = buildSpawnSchedule(5, order)
  const jittered = buildSpawnSchedule(5, order, mulberry32(1))

  assert.equal(jittered.length, plain.length, 'same number of spawns')
  const bag = s => s.map(e => `${e.gate}:${e.type}:${e.elite}`).sort().join('|')
  assert.equal(bag(jittered), bag(plain), 'same gate/type/elite multiset')
  assert.notDeepEqual(jittered.map(e => e.atMs), plain.map(e => e.atMs),
    'at least one spawn time moved')
})

test('two different seeds produce different spawn timings', () => {
  const order = { SIDE_A: 'LEFT', SIDE_B: 'RIGHT' }
  const a = buildSpawnSchedule(5, order, mulberry32(1)).map(e => e.atMs)
  const b = buildSpawnSchedule(5, order, mulberry32(2)).map(e => e.atMs)
  assert.notDeepEqual(a, b)
})

test('the same seed reproduces the same schedule exactly', () => {
  const order = { SIDE_A: 'LEFT', SIDE_B: 'RIGHT' }
  assert.deepEqual(
    buildSpawnSchedule(5, order, mulberry32(42)),
    buildSpawnSchedule(5, order, mulberry32(42)),
  )
})

test('jitter never produces a negative spawn time and stays time-ordered', () => {
  const order = { SIDE_A: 'LEFT', SIDE_B: 'RIGHT' }
  for (let seed = 0; seed < 20; seed++) {
    const sched = buildSpawnSchedule(10, order, mulberry32(seed))
    for (let i = 0; i < sched.length; i++) {
      assert.ok(sched[i].atMs >= 0, `atMs ${sched[i].atMs} must be >= 0`)
      if (i > 0) assert.ok(sched[i].atMs >= sched[i - 1].atMs, 'schedule stays sorted')
    }
  }
})
```

`test/game/waves.test.js` already imports `mulberry32`, `BALANCE`, `buildSpawnSchedule` and `assert` — verify at the top of the file before running; add any missing import.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/game/waves.test.js`
Expected: FAIL — the jitter tests fail because `buildSpawnSchedule` ignores its third argument, so `notDeepEqual` on the atMs arrays throws (the arrays are identical).

- [ ] **Step 3: Add the tunable**

In `shared/balance.js`, replace line 111:

```js
  WAVE_SPAWN: { INTERVAL_MS: 500, GATE_STAGGER_MS: 200 },
```

with:

```js
  // Per-spawn timing jitter drawn from the seeded RNG (Phase 8A). This is the
  // sim's only genuine per-run entropy beyond the gate-order coin flip: before
  // it, every "seed" produced one of exactly two simulations, which is why
  // every multi-seed result this project ever printed was really n=2. It is
  // also a deliberate sensitivity probe — if outcomes barely move under +/-
  // JITTER_MS, the sim is stable and the "chaos" was the instrument.
  WAVE_SPAWN: { INTERVAL_MS: 500, GATE_STAGGER_MS: 200, JITTER_MS: 150 },
```

- [ ] **Step 4: Jitter the schedule**

In `server/game/waves.js`, replace lines 70-91 with:

```js
// `rng` is optional: omit it and the schedule is exactly the deterministic grid
// it has always been (every pre-Phase-8 caller and test relies on that). Pass
// state.rng and each spawn time is nudged by +/- JITTER_MS, so two seeds run
// two genuinely different fights rather than the same fight twice.
export function buildSpawnSchedule(wave, order, rng = null) {
  const plan = BALANCE.WAVES[wave - 1]
  if (!plan) return []
  const gates = openGatesForWave(wave, order)
  const flat = expandComp(plan.comp)

  const { INTERVAL_MS, GATE_STAGGER_MS, JITTER_MS } = BALANCE.WAVE_SPAWN
  const perGate = new Array(gates.length).fill(0)
  const sched = []
  for (let i = 0; i < flat.length; i++) {
    const gi = i % gates.length
    const j = perGate[gi]++
    const base = gi * GATE_STAGGER_MS + j * INTERVAL_MS
    const jitter = rng ? (rng() * 2 - 1) * JITTER_MS : 0
    sched.push({
      atMs: Math.max(0, base + jitter),
      gate: gates[gi],
      type: flat[i].type,
      elite: flat[i].elite,
    })
  }
  sched.sort((a, b) => a.atMs - b.atMs)
  return sched
}
```

Also update the module header comment at `server/game/waves.js:13`:

```js
//   - buildSpawnSchedule(wave, order, rng?): time-ordered [{atMs, gate, type,
//     elite}]. With an rng, spawn times carry +/- WAVE_SPAWN.JITTER_MS of
//     seeded jitter (Phase 8A: the sim's per-run entropy).
```

- [ ] **Step 5: Feed the sim's RNG in**

In `server/game/tick.js`, replace line 19:

```js
  state.spawnSchedule = buildSpawnSchedule(state.wave, state.gateOrder, state.rng)
```

- [ ] **Step 6: Run the new tests, then the full suite**

Run: `node --test test/game/waves.test.js`
Expected: PASS.

Run: `npm test`
Expected: PASS, 263/263 (258 existing + 5 new). If any pre-existing test fails, **stop and report** — the `rng = null` default should make this change invisible to every existing caller except `tick.js`.

- [ ] **Step 7: Commit**

```bash
git add shared/balance.js server/game/waves.js server/game/tick.js test/game/waves.test.js
git commit -m "Phase 8A: seeded per-spawn timing jitter — the seed space stops being one bit"
```

---

### Task 2: Prove the entropy reaches the simulation

Task 1 proves the *schedule* varies. That is not the claim that matters. The claim that matters is that two seeds now produce two different *fights* — and it must be tested against two seeds that resolve to the **same gate order**, otherwise the test passes on the old one-bit entropy and proves nothing.

**Files:**
- Test: `test/game/seedEntropy.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `test/game/seedEntropy.test.js`:

```js
// Phase 8A instrument test. Before the spawn jitter, state.rng had exactly one
// call site (waves.js resolveGateOrder), so two seeds differed only in which
// physical side gate was SIDE_A. This test deliberately picks two seeds with
// the SAME gate order — under the old one-bit entropy their fights were
// bit-identical, so this test could not have passed.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mulberry32 } from '../../shared/rng.js'
import { createGameState } from '../../server/game/state.js'
import { startBuildPhase, PHASES } from '../../server/game/phaseMachine.js'
import { tickGame } from '../../server/game/tick.js'
import { resolveGateOrder } from '../../server/game/waves.js'

// Two seeds that land on the same physical gate assignment.
function sameGateOrderSeeds() {
  const first = resolveGateOrder(mulberry32(1)).SIDE_A
  for (let s = 2; s < 200; s++) {
    if (resolveGateOrder(mulberry32(s)).SIDE_A === first) return [1, s]
  }
  throw new Error('no same-gate-order seed pair below 200 — investigate mulberry32')
}

const IDLE = { keys: { w: false, a: false, s: false, d: false }, aimX: 0, aimY: -1,
               actions: { basic: false, special: false, second: false } }

function room() {
  return {
    players: [{ id: 'h0', element: 'EARTH', displayName: 'h', isBot: false }],
    settings: { timingStyle: 'fixed', friendlyFire: false },
  }
}

// Run wave 1's fight for `ticks` steps and fingerprint the horde's positions.
function fingerprint(seed, ticks) {
  const state = createGameState(room(), seed)
  startBuildPhase(state, 1)
  const buf = new Map([['h0', IDLE]])
  let now = 0
  for (let t = 0; t < ticks; t++) {
    now += 50
    if (state.phase === PHASES.BUILD || state.phase === PHASES.WAVE_END) state.phaseClockMs = 0
    tickGame(state, buf, now, 50)
  }
  const st = state.enemyStore
  let h = ''
  for (let i = 0; i < st.count; i++) h += `${st.x[i].toFixed(3)},${st.y[i].toFixed(3)};`
  return { h, count: st.count }
}

test('two seeds with the SAME gate order now produce different fights', () => {
  const [a, b] = sameGateOrderSeeds()
  assert.equal(resolveGateOrder(mulberry32(a)).SIDE_A, resolveGateOrder(mulberry32(b)).SIDE_A,
    'precondition: the two seeds share a gate order')
  const fa = fingerprint(a, 120)
  const fb = fingerprint(b, 120)
  assert.ok(fa.count > 0 && fb.count > 0, 'both runs actually spawned enemies')
  assert.notEqual(fa.h, fb.h, 'the horde state diverges — seed entropy reaches the sim')
})

test('the same seed still replays identically', () => {
  const [a] = sameGateOrderSeeds()
  assert.equal(fingerprint(a, 120).h, fingerprint(a, 120).h)
})
```

- [ ] **Step 2: Run it**

Run: `node --test test/game/seedEntropy.test.js`
Expected: PASS (Task 1 already landed the jitter). If the first test FAILS, the jitter is not reaching `initFight` — check `server/game/tick.js:19` passes `state.rng`. **Do not weaken the test to make it pass.**

Sanity-check that this test has teeth: temporarily revert `tick.js:19` to `buildSpawnSchedule(state.wave, state.gateOrder)`, re-run, confirm the first test FAILS, then restore. Record in the commit message that you did this.

- [ ] **Step 3: Commit**

```bash
git add test/game/seedEntropy.test.js
git commit -m "Phase 8A: end-to-end seed-entropy test (verified failing without the tick.js wiring)"
```

---

### Task 3: Make the balance dials live

Five modules destructure `BALANCE` into module-scope primitives at import. Those keys are **dead** to any runtime sweep — a probe would set them, measure nothing, and print a smooth table. The aggro FSM is the subject of half of Phase 8's open questions and *all six* of its keys are in this state.

Object refs (`const A = BALANCE.AGGRO`) stay live because the object identity never changes. `players.js:21`, `bots.js:30` and `abilities.js:28` already do this correctly — copy that pattern.

`WALL_ENTRY_COST` is a separate problem: it is not in `BALANCE` at all, so it cannot be swept even in principle. It is also the review's prime suspect for genuine sensitive dependence (`30 → 12 → 4` across the `hpToBand` band edges, driving a **global** Dijkstra re-route on a throttled 250 ms boundary from one point of chip damage). It must be sweepable before the baseline is taken.

**Files:**
- Modify: `server/game/aggro.js:22` and its 7 use sites
- Modify: `server/game/enemies.js:32-33` and its 9 use sites
- Modify: `server/game/status.js:14` and its 3 use sites
- Modify: `shared/balance.js` (add `COST_FIELD`)
- Modify: `server/game/costField.js:19-29`
- Test: `test/game/balanceLiveness.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `test/game/balanceLiveness.test.js`:

```js
// Phase 8A instrument test. A balance key that a module captured at import time
// is invisible to a runtime sweep: the probe sets it, the sim ignores it, and
// the table comes back suspiciously smooth. Each test here mutates BALANCE at
// runtime and asserts the module observed the change.
//
// AGGRO.PROXIMITY_PX, ENEMY.MELEE_RANGE_PX and COST_FIELD.WALL_ENTRY_COST are
// not cheaply unit-testable here (they only bite inside the enemy tick); they
// are covered by the liveness canary in test/harness/matchRunner.test.js.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BALANCE } from '../../shared/balance.js'
import { makeAggro, triggerAggro, updateAggro, effectivePullRange, AGGRO_MODE } from '../../server/game/aggro.js'
import { makeStatus, tickStatus, speedMultiplier } from '../../server/game/status.js'
import { WALL_ENTRY_COST } from '../../server/game/costField.js'

// Mutate a BALANCE leaf for the duration of fn, then restore it.
function withValue(obj, key, value, fn) {
  const prev = obj[key]
  obj[key] = value
  try { return fn() } finally { obj[key] = prev }
}

test('AGGRO.STICKY_MS is live', () => {
  const a = makeAggro()
  withValue(BALANCE.AGGRO, 'STICKY_MS', 0, () => {
    triggerAggro(a, 'p1', 100, 100, 1000, true)
    // Sticky expired the instant it was set, and the target is not in proximity,
    // so the FSM must drop back to march on this very tick.
    const mode = updateAggro(a, 100, 100, { id: 'p1', x: 100, y: 100 }, false, 1000)
    assert.equal(mode, AGGRO_MODE.MARCH, 'a zero sticky window must not hold the lock')
  })
})

test('AGGRO.LEASH_PX is live', () => {
  const a = makeAggro()
  triggerAggro(a, 'p1', 0, 0, 1000, true)   // anchor at (0,0)
  withValue(BALANCE.AGGRO, 'LEASH_PX', 1, () => {
    const mode = updateAggro(a, 50, 0, { id: 'p1', x: 50, y: 0 }, true, 1100)
    assert.equal(mode, AGGRO_MODE.MARCH, 'a 1px leash must break immediately')
    assert.equal(a.state, 'commit', 'breaking the leash enters commit')
  })
})

test('AGGRO.CHASE_CAP_MS is live', () => {
  const a = makeAggro()
  triggerAggro(a, 'p1', 0, 0, 1000, true)
  withValue(BALANCE.AGGRO, 'CHASE_CAP_MS', 1, () => {
    const mode = updateAggro(a, 0, 0, { id: 'p1', x: 0, y: 0 }, true, 2000)
    assert.equal(mode, AGGRO_MODE.MARCH, 'a 1ms chase cap must expire immediately')
  })
})

test('AGGRO.COMMIT_MS is live', () => {
  const a = makeAggro()
  triggerAggro(a, 'p1', 0, 0, 1000, true)
  withValue(BALANCE.AGGRO, 'COMMIT_MS', 7777, () => {
    withValue(BALANCE.AGGRO, 'LEASH_PX', 1, () => {
      updateAggro(a, 50, 0, { id: 'p1', x: 50, y: 0 }, true, 1100)
    })
    assert.equal(a.committedUntilMs, 1100 + 7777)
  })
})

test('AGGRO.PULL_DIMINISH and PULL_DIMINISH_MAX are live', () => {
  const a = makeAggro()
  a.pullCount = 3
  withValue(BALANCE.AGGRO, 'PULL_DIMINISH', 0.5, () => {
    withValue(BALANCE.AGGRO, 'PULL_DIMINISH_MAX', 2, () => {
      assert.equal(effectivePullRange(a, 100), 25, '0.5^min(3,2) * 100')
    })
  })
})

test('STATUS.CC_DURATION_SCALE and CC_STRENGTH_SCALE are live', () => {
  // Both are per-speed-tier arrays; replace the whole array so no element
  // identity is shared with the original.
  const dur = BALANCE.STATUS.CC_DURATION_SCALE
  const scaled = dur.map(() => 0)
  withValue(BALANCE.STATUS, 'CC_DURATION_SCALE', scaled, () => {
    const s = makeStatus()
    // A root applied with a zero duration scale must not root at all.
    s.rootMs = 0
    assert.equal(scaled.every(v => v === 0), true, 'precondition')
  })
  assert.equal(BALANCE.STATUS.CC_DURATION_SCALE, dur, 'restored')
})

test('STATUS.WET is live', () => {
  const s = makeStatus()
  s.wetMs = 1000
  const before = speedMultiplier(s)
  withValue(BALANCE.STATUS, 'WET', { ...BALANCE.STATUS.WET, slowFactor: 0.1 }, () => {
    assert.notEqual(speedMultiplier(s), before, 'WET.slowFactor must be read at call time')
    assert.equal(speedMultiplier(s), 0.1)
  })
})

test('COST_FIELD.WALL_ENTRY_COST is the same array the cost field reads', () => {
  assert.equal(WALL_ENTRY_COST, BALANCE.COST_FIELD.WALL_ENTRY_COST,
    'costField must expose BALANCE\'s array by reference, not a copy')
  assert.equal(WALL_ENTRY_COST.length, 4, 'one entry per band (NONE/HEALTHY/DAMAGED/CRITICAL)')
})
```

> **Note on the `CC_DURATION_SCALE` test:** it is deliberately weak — it asserts the swap/restore mechanics rather than a behavioural effect, because `applyCC`-style entry points are not exported. That is honest: the real coverage for the CC scales is the sweep. Do not strengthen it by exporting internals just for the test.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/game/balanceLiveness.test.js`
Expected: FAIL — the AGGRO tests fail (the module captured the primitives at import), and the `WALL_ENTRY_COST` test fails with `BALANCE.COST_FIELD is undefined`.

- [ ] **Step 3: Make `aggro.js` read through the object**

In `server/game/aggro.js`, replace line 22:

```js
// Object ref, not a destructure: destructuring to primitives at import makes
// every one of these keys DEAD to a runtime balance sweep (Phase 8A).
const A = BALANCE.AGGRO
```

Then update the seven use sites:

- L43: `a.committedUntilMs = now + A.COMMIT_MS`
- L55: `if (targetId === a.targetId) { a.stickyUntilMs = now + A.STICKY_MS; return true } // refresh`
- L61: `a.stickyUntilMs = now + A.STICKY_MS`
- L80: `if (dxA * dxA + dyA * dyA > A.LEASH_PX * A.LEASH_PX) { enterCommit(a, now); return AGGRO_MODE.MARCH }`
- L81: `if (now - a.chaseStartMs > A.CHASE_CAP_MS) { enterCommit(a, now); return AGGRO_MODE.MARCH }`
- L93: `return baseRange * A.PULL_DIMINISH ** Math.min(a.pullCount, A.PULL_DIMINISH_MAX)`

- [ ] **Step 4: Make `enemies.js` read through the object**

In `server/game/enemies.js`, replace lines 32-33:

```js
// Object refs, not destructures (Phase 8A liveness — see aggro.js).
const E = BALANCE.ENEMY
const AG = BALANCE.AGGRO
```

Then update the nine use sites:

- L36: `constructor(cap = BALANCE.ENEMY.MAX) {`
- L70: `const cat = E.BASE[type]`
- L77: `this.hp[i] = this.maxHp[i] = cat.hp * (elite ? E.ELITE.hpMult : 1)`
- L78: `this.damage[i] = cat.damage * (elite ? E.ELITE.damageMult : 1)`
- L81: `this.bounty[i] = cat.bounty * (elite ? E.ELITE.bountyMult : 1)`
- L82: `this.radius[i] = elite ? Math.min(cat.radius * E.ELITE.radiusMult, E.ELITE.radiusCap) : cat.radius`
- L84: `this.moveSpeed[i] = E.SPEED_PX[prof.speed]`
- L174: `const prox2 = AG.PROXIMITY_PX * AG.PROXIMITY_PX`
- L220: `const attackHall = hallEdgeDist(hall, ex, ey) <= E.MELEE_RANGE_PX + store.radius[i]`
- L227: `if (d <= store.radius[i] + CONFIG.PLAYER_RADIUS + E.MELEE_RANGE_PX) attackPlayer = target`

`prox2` is computed once per `tickEnemies` call, so reading it there keeps the per-enemy inner loop on a local — no hot-path cost.

- [ ] **Step 5: Make `status.js` read through the object**

In `server/game/status.js`, replace line 14:

```js
// Object ref, not a destructure (Phase 8A liveness — see aggro.js).
const S = BALANCE.STATUS
```

Then update the three use sites:

- L28: `return baseMs * S.CC_DURATION_SCALE[speedTier]`
- L35: `return 1 - (1 - baseFactor) * S.CC_STRENGTH_SCALE[speedTier]`
- L81: `if (s.wetMs > 0 && S.WET.slowFactor < m) m = S.WET.slowFactor`

- [ ] **Step 6: Move `WALL_ENTRY_COST` into `BALANCE`**

In `shared/balance.js`, insert a new block immediately after the `REPAIR` block (after line 77):

```js
  // Cost-field routing (spec §5). Extra cost to ENTER a wall tile, indexed by
  // the hpToBand band: [NONE, HEALTHY, DAMAGED, CRITICAL]. Lived in
  // costField.js as a module constant until Phase 8A; moved here because it is
  // the single most consequential routing dial in the game and was therefore
  // the one dial a balance sweep could not reach. Note the discontinuity this
  // creates: one point of chip damage can flip a band, which re-routes the
  // WHOLE horde on the next throttled recompute (<=1 per 250ms). That is the
  // leading suspect for any genuine sensitive dependence in this sim.
  COST_FIELD: {
    WALL_ENTRY_COST: [0, 30, 12, 4],
  },
```

In `server/game/costField.js`, add the import (after line 22's `} from './grid.js'`):

```js
import { BALANCE } from '../../shared/balance.js'
```

and replace lines 28-29:

```js
// Extra cost to ENTER a wall tile, per band. Re-exported by reference from
// BALANCE (Phase 8A) so a sweep can move it; the array identity never changes,
// so existing importers and the Dijkstra inner loop are unaffected.
export const WALL_ENTRY_COST = BALANCE.COST_FIELD.WALL_ENTRY_COST
```

No call-site changes: lines 104 and 124 keep reading `WALL_ENTRY_COST[...]`, and it is now the same array object `BALANCE.COST_FIELD.WALL_ENTRY_COST` points at. The type changes from `Float64Array` to a plain array; both index identically and the Dijkstra cost is dominated by the heap, not the lookup.

- [ ] **Step 7: Run the liveness test, then the full suite**

Run: `node --test test/game/balanceLiveness.test.js`
Expected: PASS, 8 tests.

Run: `npm test`
Expected: PASS, 271/271 (263 + 8 new). `test/game/costField.test.js:54` imports `WALL_ENTRY_COST` and must still pass unchanged — it reads `WALL_ENTRY_COST[BAND_HEALTHY]`, which is still `30`.

If any existing test fails, **stop and report**. This task is meant to be purely mechanical; a behaviour change here means a use site was mis-transcribed.

- [ ] **Step 8: Commit**

```bash
git add server/game/aggro.js server/game/enemies.js server/game/status.js \
        server/game/costField.js shared/balance.js test/game/balanceLiveness.test.js
git commit -m "Phase 8A: make the balance surface live — object-ref reads, WALL_ENTRY_COST into BALANCE"
```

---

### Task 4: The match runner — a harness that actually plays the build phase

This replaces the measurement approach used by `phase6Acceptance.test.js`. Two changes carry all the weight:

1. **It does not zero `phaseClockMs`.** The 45-second build phase runs. Gold gets earned and spent, towers get placed, dormancy and combos run.
2. **It reports a continuous score, not a coin flip.** `score = wavesCleared + hallHpFraction` — a smooth 0…11 scalar. A binary win/loss on a threshold-y sim is the worst possible readout and is the single most likely reason Phases 4 and 6 looked chaotic.

The scripted build policy is deliberately dumb: rebuild the barricades the horde ate, then buy a watchtower flanking a lane. It does not have to be smart. It has to be **non-zero**, or half the balance surface is invisible.

**Files:**
- Create: `test/harness/matchRunner.js`
- Modify: `test/game/phase6Acceptance.test.js` (header comment only)
- Modify: `package.json` (add the `probe` script — used from Task 6)

- [ ] **Step 1: Write the runner**

Create `test/harness/matchRunner.js`:

```js
// Phase 8A measurement instrument. One responsibility: run ONE scenario to
// completion and report numbers.
//
// Why this exists. Every balance measurement this project took before Phase 8A
// was made through two broken instruments:
//
//   1. state.rng had exactly one call site (waves.js resolveGateOrder), so N
//      "seeds" produced at most TWO simulations. Task 1 fixed the sim side.
//   2. Both acceptance harnesses set state.phaseClockMs = 0 every tick. The
//      clock counts DOWN and isBuildComplete('fixed') is phaseClockMs <= 0, so
//      the build phase completed in ONE tick, ten times per run. Economy, tower
//      placement, combos and dormancy were inert in every number ever printed.
//
// This runner fixes (2) and reports a CONTINUOUS score. A binary win/loss over
// a threshold-y sim always looks non-monotonic under perturbation regardless of
// the underlying mechanism — which is very likely the whole of the "chaotic
// balance" finding.
//
// NOT a test file (no .test.js suffix) — `npm test` must not run matches.

import { createGameState } from '../../server/game/state.js'
import { startBuildPhase, PHASES } from '../../server/game/phaseMachine.js'
import { tickGame } from '../../server/game/tick.js'
import { hpToBand } from '../../server/game/costField.js'
import { findStructureAt } from '../../server/game/structures.js'
import { buildStructure } from '../../server/game/economy.js'
import { STRUCTURE_TYPES, TILE_SIZE } from '../../shared/constants.js'
import { BALANCE } from '../../shared/balance.js'

export const DT_MS = 50
export const MAX_TICKS = 400_000   // safety net only; a real run resolves far sooner

// --- match setup -----------------------------------------------------------

// 1 human EARTH + 3 AI bots — the Phase 6 acceptance shape, which is also the
// target configuration for the Phase 8C sweep.
function makeRoom() {
  return {
    players: [
      { id: 'h0', element: 'EARTH', displayName: 'human-earth', isBot: false },
      { id: 'b1', element: 'FIRE',  displayName: 'fire-bot',    isBot: true },
      { id: 'b2', element: 'WATER', displayName: 'water-bot',   isBot: true },
      { id: 'b3', element: 'WIND',  displayName: 'wind-bot',    isBot: true },
    ],
    settings: { timingStyle: 'fixed', friendlyFire: false },
  }
}

let seedStructureId = 900_000

// The starting maze is script-placed and free — same as phase6Acceptance, so
// the change under measurement is "the build phase is real", not "the human now
// has to afford the opening maze". REBUILDS below are paid, through the real
// buildStructure path.
function placeStartingMaze(state, maze) {
  for (let gx = 1; gx < 39; gx++) {
    if (maze.gaps.includes(gx)) continue
    const cat = BALANCE.STRUCTURES[STRUCTURE_TYPES.BARRICADE]
    const s = {
      id: seedStructureId++, type: STRUCTURE_TYPES.BARRICADE, ownerId: 'script',
      gx, gy: maze.wallRow, w: 1, h: 1,
      hp: cat.hp, maxHp: cat.hp, dormant: false, createdAt: 0, attackReadyAt: 0,
    }
    state.structures.push(s)
    state.costField.setWallBand(gx, maze.wallRow, hpToBand(s.hp, s.maxHp))
    state.placedVersion++
  }
  state.costField.compute()
}

// --- scripted actors -------------------------------------------------------

// The scripted "competent human": hold a post below one gap, aim at the nearest
// enemy, hammer every action (the server's own gates decide what lands).
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

// Tower sites: tiles flanking each lane on the defended side of the wall,
// nearest row first. Deterministic order — the policy takes the first that
// placeStructure accepts.
function towerSites(maze) {
  const sites = []
  for (let dy = 1; dy <= 3; dy++) {
    for (const gap of maze.gaps) {
      sites.push([gap - 1, maze.wallRow + dy])
      sites.push([gap + 1, maze.wallRow + dy])
    }
  }
  return sites
}

// One scripted build phase. Deliberately dumb: rebuild what the horde ate, then
// buy one watchtower. It only has to be non-zero — a harness with an amputated
// build loop cannot see the economy, the tower catalog, combos or dormancy.
//
// NOTE: it does NOT repair. server/game/repair.js has no caller outside its own
// test — no EVENTS entry, no socket handler, no client binding — so channel
// repair does not exist in the shipped game. Scripting it here would measure a
// game nobody can play. Barricades are consumable; that is the real game.
function runBuildPolicy(state, maze, now, m) {
  const human = state.players.find(p => !p.isBot)
  if (!human) return

  for (let gx = 1; gx < 39; gx++) {
    if (maze.gaps.includes(gx)) continue
    if (findStructureAt(state, gx, maze.wallRow)) continue
    if ((human.gold ?? 0) < BALANCE.STRUCTURES[STRUCTURE_TYPES.BARRICADE].cost) {
      m.rebuildsSkippedForGold++
      continue
    }
    const res = buildStructure(state, human, STRUCTURE_TYPES.BARRICADE, gx, maze.wallRow, now)
    if (res.ok) m.rebuildsPurchased++
  }

  if ((human.gold ?? 0) >= BALANCE.STRUCTURES[STRUCTURE_TYPES.WATCHTOWER].cost) {
    for (const [gx, gy] of towerSites(maze)) {
      if (findStructureAt(state, gx, gy)) continue
      const res = buildStructure(state, human, STRUCTURE_TYPES.WATCHTOWER, gx, gy, now)
      if (res.ok) { m.towersPurchased++; break }
    }
  }

  state.costField.compute()
}

// --- the run ---------------------------------------------------------------

/**
 * Run one scenario to WON / LOST / tick-cap.
 *
 * @param {object}  scenario
 * @param {number}  scenario.seed
 * @param {object}  scenario.maze  { wallRow, gaps: number[] }
 * @param {number}  scenario.postGap  which gap the human plugs (index into maze.gaps)
 * @param {number}  scenario.maxWaves stop after this many cleared waves. Full
 *                  runs use the default; the runner's own tests use 2-3 so
 *                  `npm test` stays fast.
 * @returns {object} metrics
 */
export function runMatch({ seed, maze, postGap = 0, maxWaves = BALANCE.WAVE_COUNT }) {
  const state = createGameState(makeRoom(), seed)
  startBuildPhase(state, 1)
  placeStartingMaze(state, maze)

  const post = {
    x: (maze.gaps[postGap] + 0.5) * TILE_SIZE,
    y: (maze.wallRow + 3) * TILE_SIZE,
  }

  const m = {
    seed, postGap, gaps: maze.gaps.join('/'),
    wavesCleared: 0, won: false, lost: false, timedOut: false, stoppedEarly: false,
    hallHp: state.hall.hp, hallHpFrac: 1, score: 0,
    enemySeconds: 0, playerDowns: 0, playerDeaths: 0,
    rebuildsPurchased: 0, rebuildsSkippedForGold: 0, towersPurchased: 0,
    goldUnspent: 0, buildTicks: 0, fightTicks: 0, ticks: 0,
  }

  let now = 0
  let policyRanForWave = -1

  for (let t = 0; t < MAX_TICKS; t++) {
    now += DT_MS

    // The scripted build policy fires once per build phase, at its start.
    if (state.phase === PHASES.BUILD && policyRanForWave !== state.wave) {
      policyRanForWave = state.wave
      runBuildPolicy(state, maze, now, m)
    }

    // THE CHANGE: phaseClockMs is NOT zeroed. The build phase runs its full
    // BALANCE.PHASE.BUILD_TIMER_MS, every wave.
    const event = tickGame(state, humanInputs(state, post), now, DT_MS)

    m.ticks++
    if (state.phase === PHASES.BUILD) m.buildTicks++
    if (state.phase === PHASES.FIGHT) {
      m.fightTicks++
      m.enemySeconds += state.livingEnemyCount * (DT_MS / 1000)
    }
    for (const fx of state.fx) {
      if (fx.type === 'downed') m.playerDowns++
      else if (fx.type === 'pdied') m.playerDeaths++
    }
    if (event === 'waveEnd') m.wavesCleared++

    if (state.phase === PHASES.WON)  { m.won = true;  break }
    if (state.phase === PHASES.LOST) { m.lost = true; break }
    if (m.wavesCleared >= maxWaves)  { m.stoppedEarly = true; break }
  }

  if (!m.won && !m.lost && !m.stoppedEarly) m.timedOut = true
  m.hallHp = Math.max(0, state.hall.hp)
  m.hallHpFrac = m.hallHp / state.hall.maxHp
  m.goldUnspent = state.players.filter(p => !p.isBot).reduce((a, p) => a + (p.gold ?? 0), 0)

  // The continuous outcome metric. Waves cleared dominates; hall HP resolves
  // ties within a wave. Range 0..11. Report this, never a win rate alone.
  m.score = m.wavesCleared + m.hallHpFrac
  return m
}
```

- [ ] **Step 2: Record the limitation on the old acceptance test**

The Phase-6 acceptance stamp stays green and unmodified (see the confirmed decisions at the top of this plan), but a future reader must not mistake it for a balance measurement. Insert after `test/game/phase6Acceptance.test.js:9` (the end of the existing header block):

```js
//
// PHASE 8A NOTE — this test is an acceptance STAMP, not a balance measurement.
// It sets state.phaseClockMs = 0 every tick; the clock counts DOWN and
// isBuildComplete('fixed') is phaseClockMs <= 0, so the build phase completes
// in ONE tick for every wave. Economy, tower placement, combos and dormancy are
// inert here. For balance measurement use test/harness/matchRunner.js, which
// runs the real build phase. Left as-is deliberately: rewriting a shipped
// acceptance stamp to a different game is a tuning move, not a fix.
```

- [ ] **Step 3: Add the npm script**

In `package.json`, add to `"scripts"` after `"test:e2e"`:

```json
    "probe": "node test/harness/probe.js",
```

(`test/harness/probe.js` arrives in Task 6. Adding the script now keeps the two `package.json` edits from colliding.)

- [ ] **Step 4: Smoke-run one match and record the wall-clock cost**

Run:

```bash
node -e "import('./test/harness/matchRunner.js').then(async m => { const t = Date.now(); const r = m.runMatch({ seed: 20260801, maze: { wallRow: 8, gaps: [13, 27] } }); console.log(r); console.log('wallclock ms', Date.now() - t) })"
```

Expected: an object printed, with **`buildTicks` in the thousands** (a 45 s build phase at 50 ms is 900 ticks per wave — if `buildTicks` is in single digits the clock is still being zeroed somewhere) and `timedOut: false`.

**Record the wall-clock number in the commit message.** Task 6 sizes the scenario matrix from it: the probe runs `values × scenarios` matches, so 5 values × 12 scenarios = 60 matches. If one match costs more than ~10 s, cut the seed list to 8 and say so in Task 6 rather than letting the probe take an hour.

If `timedOut: true`, **stop and report** — do not raise `MAX_TICKS` to paper over it. A run that cannot resolve in 400 k ticks (5.5 sim-hours) means the wave never clears, which is itself the finding.

- [ ] **Step 5: Commit**

```bash
git add test/harness/matchRunner.js test/game/phase6Acceptance.test.js package.json
git commit -m "Phase 8A: match runner with a real build phase and a continuous score"
```

---

### Task 5: Test the instrument

This is the most important test file in the phase. Two of these tests are exactly the ones whose absence let three sessions of conclusions stand on a broken measurement: **the build phase actually ran**, and **two seeds actually diverge**. Two more are the review's CRIT-3 and CRIT-5 fixes: a **null-dial control** (a dial that provably does nothing must produce identical rows) and a **liveness canary** (a dial that provably does something must not).

All tests use `maxWaves: 2` so `npm test` stays fast.

**Files:**
- Create: `test/harness/matchRunner.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/harness/matchRunner.test.js`:

```js
// The measurement instrument's own test suite (Phase 8A).
//
// If any test here fails, every number the probe prints is worthless. In
// particular: `the build phase actually runs` and `two seeds diverge` are the
// two assertions whose absence let this project reach Phase 7 on measurements
// taken through a one-bit seed and an amputated build loop.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runMatch } from './matchRunner.js'
import { BALANCE } from '../../shared/balance.js'
import { mulberry32 } from '../../shared/rng.js'
import { resolveGateOrder } from '../../server/game/waves.js'

const MAZE = { wallRow: 8, gaps: [13, 27] }
const short = seed => runMatch({ seed, maze: MAZE, maxWaves: 2 })

// Two seeds that share a gate order — under the pre-Phase-8A one-bit entropy
// their runs were bit-identical.
function sameGateOrderSeeds() {
  const first = resolveGateOrder(mulberry32(20260801)).SIDE_A
  for (let s = 20260802; s < 20260900; s++) {
    if (resolveGateOrder(mulberry32(s)).SIDE_A === first) return [20260801, s]
  }
  throw new Error('no same-gate-order seed pair in range')
}

test('INSTRUMENT: the build phase actually runs', () => {
  const m = short(20260801)
  // BUILD_TIMER_MS / DT_MS ticks per build phase, at least 2 build phases.
  const perPhase = BALANCE.PHASE.BUILD_TIMER_MS / 50
  assert.ok(m.buildTicks >= perPhase * 1.5,
    `buildTicks ${m.buildTicks} — expected >= ${perPhase * 1.5}. ` +
    'A tiny number means phaseClockMs is being zeroed and the build loop is amputated.')
})

test('INSTRUMENT: the human actually spends gold on structures', () => {
  const m = short(20260801)
  assert.ok(m.towersPurchased + m.rebuildsPurchased > 0,
    'the scripted build policy bought nothing — the economy is inert')
})

test('INSTRUMENT: the same seed replays identically', () => {
  const a = short(20260801)
  const b = short(20260801)
  assert.deepEqual(a, b, 'the runner must be deterministic given a seed')
})

test('INSTRUMENT: two seeds with the same gate order produce different runs', () => {
  const [s1, s2] = sameGateOrderSeeds()
  const a = short(s1)
  const b = short(s2)
  assert.notEqual(a.enemySeconds, b.enemySeconds,
    'the two runs are identical — seed entropy is not reaching the sim')
})

test('INSTRUMENT: a null dial produces byte-identical metrics (control)', () => {
  // A key nothing reads. If sweeping THIS ever changes the metrics, the runner
  // is nondeterministic and every table it prints is noise.
  const base = short(20260801)
  for (const v of [1, 2, 3]) {
    BALANCE.__NULL_DIAL = v
    try {
      assert.deepEqual(short(20260801), base,
        'a dial nothing reads changed the outcome — the runner is nondeterministic')
    } finally {
      delete BALANCE.__NULL_DIAL
    }
  }
})

test('INSTRUMENT: a live dial changes the metrics (liveness canary)', () => {
  const base = short(20260801)
  const prev = BALANCE.AGGRO.PROXIMITY_PX
  BALANCE.AGGRO.PROXIMITY_PX = prev * 4
  try {
    const moved = short(20260801)
    assert.notEqual(moved.enemySeconds, base.enemySeconds,
      'quadrupling the aggro proximity radius changed nothing — ' +
      'BALANCE.AGGRO is still being destructured to primitives somewhere')
  } finally {
    BALANCE.AGGRO.PROXIMITY_PX = prev
  }
})

test('INSTRUMENT: WALL_ENTRY_COST is sweepable end to end', () => {
  const arr = BALANCE.COST_FIELD.WALL_ENTRY_COST
  const base = short(20260801)
  const prevHealthy = arr[1]
  arr[1] = 1   // a healthy wall becomes almost free to walk through
  try {
    const moved = short(20260801)
    assert.notEqual(moved.enemySeconds, base.enemySeconds,
      'the horde routed identically with near-free wall entry — ' +
      'WALL_ENTRY_COST is not live in the cost field')
  } finally {
    arr[1] = prevHealthy
  }
})

test('INSTRUMENT: the score is continuous, not binary', () => {
  const m = short(20260801)
  assert.ok(m.score >= 0 && m.score <= BALANCE.WAVE_COUNT + 1)
  assert.ok(m.hallHpFrac >= 0 && m.hallHpFrac <= 1)
  assert.equal(m.score, m.wavesCleared + m.hallHpFrac)
})
```

- [ ] **Step 2: Run it**

Run: `node --test test/harness/matchRunner.test.js`
Expected: PASS, 8 tests.

Failure triage — **do not weaken an assertion to make it pass:**
- *build phase* fails → something is still zeroing `phaseClockMs`, or `timingStyle` is not `'fixed'`.
- *spends gold* fails → `placeStructure` is rejecting; log `res.reason`. Likely `no-build-arc` (tower sites too close to the hall) or `insufficient-gold`.
- *two seeds diverge* fails → Task 1/2 regressed; re-run `test/game/seedEntropy.test.js`.
- *null dial* fails → the runner has a nondeterminism source (wall-clock, `Date.now()`, iteration over a `Set`). Find it; it invalidates everything.
- *liveness canary* or *WALL_ENTRY_COST* fails → a Task 3 use site was missed.

- [ ] **Step 3: Check the suite's runtime is still acceptable**

Run: `npm test`
Expected: PASS, 279/279 (271 + 8 new).

Record the total suite wall-clock. If it grew by more than ~30 s, drop the runner tests to `maxWaves: 1` and re-run. Do not delete tests to save time.

- [ ] **Step 4: Commit**

```bash
git add test/harness/matchRunner.test.js
git commit -m "Phase 8A: instrument test suite — build-phase, entropy, null-dial and liveness canaries"
```

---

### Task 6: The scenario matrix and the probe

The rejected plan's probe had a detector that **could not fire on the pathology it was written to detect** (a step-down-then-flat curve scores zero "flips"), sweeping a dial that **did not exist**, and it printed `PHASE 8A VERIFIED` and exited 0. An unfailable gate is worse than no gate.

This probe fixes that at the root: **it does not have a pass criterion.** It prints a table, a Spearman rank correlation against the dial order, an effect size measured against the within-cell noise floor, and a one-word classification. A human reads it. The only hard assertions in this phase live in `matchRunner.test.js`, where they can actually fail.

It also **throws** on a dial path that does not resolve, rather than silently defaulting.

**Files:**
- Create: `test/harness/scenarios.js`
- Create: `test/harness/probe.js`

- [ ] **Step 1: Write the scenario matrix**

Create `test/harness/scenarios.js`:

```js
// The scenario matrix (Phase 8A) and the BALANCE dial-path resolver.
//
// Two independent axes of variation, both genuine post-Task-1:
//   seed    — gate order AND per-spawn timing jitter
//   postGap — which of the two lanes the scripted human plugs
//
// 6 seeds x 2 posts = 12 scenarios. Report per-cell outcomes and the spread,
// never a bare win rate: with a threshold-y sim a binary readout looks
// non-monotonic under perturbation no matter what the mechanism is.

export const MAZE = { wallRow: 8, gaps: [13, 27] }

export const SEEDS = [20260801, 20260802, 20260803, 20260804, 20260805, 20260806]

export function scenarioMatrix({ seeds = SEEDS, maze = MAZE, maxWaves } = {}) {
  const out = []
  for (const seed of seeds) {
    for (let postGap = 0; postGap < maze.gaps.length; postGap++) {
      out.push({ seed, maze, postGap, ...(maxWaves ? { maxWaves } : {}) })
    }
  }
  return out
}

/**
 * Resolve a dotted BALANCE path to { obj, key } for read/write.
 * Supports numeric segments for array indices: 'COST_FIELD.WALL_ENTRY_COST.1'.
 * THROWS on a path that does not resolve — a probe that silently defaults a
 * missing dial prints identical rows and calls it smooth.
 */
export function resolveDial(root, path) {
  const parts = path.split('.')
  let obj = root
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]
    if (obj == null || !(p in obj)) {
      throw new Error(`dial path "${path}" does not resolve: no "${p}" at segment ${i}`)
    }
    obj = obj[p]
  }
  const key = parts[parts.length - 1]
  if (obj == null || !(key in obj)) {
    throw new Error(`dial path "${path}" does not resolve: no leaf "${key}"`)
  }
  return { obj, key }
}
```

- [ ] **Step 2: Write the probe**

Create `test/harness/probe.js`:

```js
#!/usr/bin/env node
// Sweep ONE balance dial across the scenario matrix and print what happened.
//
// This script deliberately has NO pass criterion and NEVER prints "VERIFIED".
// The version of it in the rejected Phase 8A plan had a detector that could not
// fire on the shape it was written to detect, swept a key that did not exist,
// and printed PHASE 8A VERIFIED. A gate that cannot fail is worse than none.
//
// Usage:
//   npm run probe -- --dial AGGRO.STICKY_MS --values 500,1500,3000,4500,6000
//   npm run probe -- --dial COST_FIELD.WALL_ENTRY_COST.1 --values 5,15,30,45,60
//   npm run probe -- --dial __NULL_DIAL --values 1,2,3   (control: expect NO SIGNAL)
//
// Options:
//   --maxWaves N   stop each match after N cleared waves (default: full 10)
//   --seeds a,b,c  override the seed list

import { BALANCE } from '../../shared/balance.js'
import { runMatch } from './matchRunner.js'
import { scenarioMatrix, resolveDial, SEEDS } from './scenarios.js'

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 || i === process.argv.length - 1 ? fallback : process.argv[i + 1]
}

const dialPath = arg('dial')
const valuesRaw = arg('values')
if (!dialPath || !valuesRaw) {
  console.error('usage: npm run probe -- --dial <BALANCE.PATH> --values <v1,v2,...>')
  process.exit(2)
}
const values = valuesRaw.split(',').map(Number)
const maxWaves = arg('maxWaves') ? Number(arg('maxWaves')) : undefined
const seeds = arg('seeds') ? arg('seeds').split(',').map(Number) : SEEDS

// __NULL_DIAL is the control: create it so resolveDial finds it, and assert
// nothing reads it.
if (dialPath === '__NULL_DIAL') BALANCE.__NULL_DIAL = values[0]

const { obj, key } = resolveDial(BALANCE, dialPath)   // throws on a missing dial
const original = obj[key]

const mean = a => a.reduce((x, y) => x + y, 0) / a.length
const sd = a => {
  if (a.length < 2) return 0
  const m = mean(a)
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1))
}

// Spearman rank correlation between the dial ORDER (1..k) and the per-value
// mean score. Replaces the rejected plan's local-extremum "flip" detector,
// which was direction-agnostic and blind to a step-down-then-flat curve.
function spearman(ys) {
  const n = ys.length
  const idx = ys.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0])
  const rank = new Array(n)
  for (let i = 0; i < n; i++) {
    let j = i
    while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++
    const r = (i + j) / 2 + 1
    for (let k2 = i; k2 <= j; k2++) rank[idx[k2][1]] = r
    i = j
  }
  const xs = ys.map((_, i) => i + 1)
  const mx = mean(xs), my = mean(rank)
  let num = 0, dx2 = 0, dy2 = 0
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx, b = rank[i] - my
    num += a * b; dx2 += a * a; dy2 += b * b
  }
  return dy2 === 0 ? 0 : num / Math.sqrt(dx2 * dy2)
}

const scenarios = scenarioMatrix({ seeds, maxWaves })
console.log(`dial:      ${dialPath}`)
console.log(`values:    ${values.join(', ')}`)
console.log(`scenarios: ${scenarios.length} (${seeds.length} seeds x 2 posts)`)
console.log(`matches:   ${scenarios.length * values.length}`)
console.log('')

const rows = []
const t0 = Date.now()
for (const v of values) {
  obj[key] = v
  const scores = [], enemySecs = []
  let wins = 0
  for (const s of scenarios) {
    const m = runMatch(s)
    scores.push(m.score)
    enemySecs.push(m.enemySeconds)
    if (m.won) wins++
  }
  rows.push({
    v,
    mean: mean(scores), sd: sd(scores),
    min: Math.min(...scores), max: Math.max(...scores),
    winRate: wins / scenarios.length,
    enemySec: mean(enemySecs),
    scores,
  })
  console.log(
    `${String(v).padStart(10)} | score ${rows.at(-1).mean.toFixed(3)}` +
    ` +/- ${rows.at(-1).sd.toFixed(3)}` +
    ` | range ${rows.at(-1).min.toFixed(2)}-${rows.at(-1).max.toFixed(2)}` +
    ` | win ${(rows.at(-1).winRate * 100).toFixed(0)}%` +
    ` | enemy-s ${rows.at(-1).enemySec.toFixed(0)}`)
}
obj[key] = original
if (dialPath === '__NULL_DIAL') delete BALANCE.__NULL_DIAL

// --- interpretation (no pass/fail) ---
const means = rows.map(r => r.mean)
const effect = Math.abs(means.at(-1) - means[0])
const noise = mean(rows.map(r => r.sd))          // within-cell scenario spread
const rho = spearman(means)

let signal
if (effect < 2 * noise) signal = 'NO SIGNAL (effect is inside the scenario noise floor)'
else if (Math.abs(rho) >= 0.9) signal = `MONOTONIC (rho ${rho.toFixed(2)})`
else signal = `NON-MONOTONIC (rho ${rho.toFixed(2)}) — the dial moves the game, but not in one direction`

console.log('')
console.log(`effect (last - first mean): ${effect.toFixed(3)}`)
console.log(`noise floor (mean within-cell sd): ${noise.toFixed(3)}`)
console.log(`spearman rho vs dial order: ${rho.toFixed(3)}`)
console.log(`classification: ${signal}`)
console.log(`elapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s`)
console.log('')
console.log('This script has no pass criterion by design. Read the table.')
```

- [ ] **Step 3: Run the null-dial control first**

Run: `npm run probe -- --dial __NULL_DIAL --values 1,2,3 --maxWaves 2`

Expected: three **byte-identical** rows (same mean, sd 0 differences, same win rate), `effect 0.000`, `classification: NO SIGNAL`.

If the null dial shows any effect, the runner is nondeterministic — **stop and fix that before taking any measurement.** This is the self-test the rejected plan lacked.

- [ ] **Step 4: Run a dial that must resolve to nothing**

Run: `npm run probe -- --dial BOT.MELEE_MULT --values 0.7,1.0,1.3`

Expected: **throws** `dial path "BOT.MELEE_MULT" does not resolve: no leaf "MELEE_MULT"`, exit non-zero.

This is the exact key the rejected plan swept for five rows before printing VERIFIED. `BALANCE.BOT` has `ENGAGE_RANGE_PX`, `ENGAGE_LEASH_PX`, `CONTACT_PX`, `KITE_BACKOFF_PX`, `HOLD_FORWARD_TILES`, `CLASS`, `SPECIAL_CAST_PX`, `SECOND_CAST_PX` — no melee scalar. Bot melee flows through `p.meleeDamage` exactly like a human's.

- [ ] **Step 5: Commit**

```bash
git add test/harness/scenarios.js test/harness/probe.js
git commit -m "Phase 8A: scenario matrix + dial probe (no pass criterion, throws on a dead dial)"
```

---

### Task 6.5: Make the instrument honest about hangs (ADDED 2026-07-25 — gates Task 7)

**This task did not exist in the original plan. It was added because Task 6's own validation runs
found the instrument reporting hangs as wins.** Do not skip it and do not fold it into Task 7.

Running the probe surfaced two readout defects and, through them, two genuine engine soft-locks
(diagnosed against live source; full mechanism in the `elementia-hall-ring-softlock` memory):

1. **Cost-field zero plateau on the hall ring.** `CostField.setHall` seeds the 8 tiles ringing the
   hall at cost 0, and `chooseStepDir` needs a *strictly* lower neighbour — so all 8 are terminal
   local minima. An enemy that halts there sits ~29-32 px from the hall AABB, outside the ~17 px
   `MELEE_RANGE_PX + radius` reach: no move step, no attack target, inert forever. A crowd normally
   shoves bodies into range via `resolveCircles`; 1-3 stragglers cannot. **The comment at
   `server/game/enemies.js:154-160` asserts the exact invariant this violates.**
2. **Bot leash has no return path.** `server/game/bots.js:134-139` — past `BOT.ENGAGE_LEASH_PX` the
   bot emits no steer instead of walking back to its anchor, so a bot that overshoots while chasing
   freezes while any enemy is within `ENGAGE_RANGE_PX`.

**Frequency: 13 of 152 scenarios (8.6%)**, stall waves 6/7/9/10, both posts, four enemy types.

**Why this blocks the baseline:** a hung run returns `wavesCleared + 1.0` with a full-HP hall — it
scores as one of the *best possible outcomes while actually being a hang* — and `probe.js` drops
`timedOut` entirely. Every mean is biased upward by ~8.6% of cells. Publishing on that instrument
would repeat this phase's own founding error.

**Philip's rulings (2026-07-25), both binding:**

- **Instrument-only before the baseline.** Fix the readout; leave `server/` alone. The baseline is
  taken on the **unmodified game**, and both engine bugs move to **Phase 8B**, justified by a
  measured delta against it. Patching the engine first would make the baseline describe a game that
  differs from everything Phases 4-6 measured, and would ship gameplay changes ahead of the
  measurement meant to justify them.
- **Hung runs are excluded from the mean, not rescored.** Drop timed-out cells from mean/sd and
  print a **`hangs: N/12`** column per dial row. Rescoring a hang as a loss would invent an outcome
  the sim never produced and make hangs indistinguishable from real losses.

**⛔ Do NOT treat the two engine bugs as 8B-automatic.** The bot-leash fix in particular is small
and looks obviously right — which is exactly why it needs the baseline to justify it. That
reflex is the failure mode this phase exists to end.

**Files:**
- Modify: `test/harness/matchRunner.js` — stall detection; the `win` bug
- Modify: `test/harness/probe.js` — surface and exclude hangs
- Modify: `test/harness/matchRunner.test.js` — cover both

- [ ] **Step 1: Fix the `win` bug.** `runMatch` breaks on `m.wavesCleared >= maxWaves` before the
  phase machine reaches `PHASES.WON`, and the default `maxWaves` *is* `BALANCE.WAVE_COUNT` — so
  `won` is structurally always `false` and the probe's `win %` column is always 0. Seed 20260802 /
  postGap 1 clears all 10 waves and still reports `won: false`. Fix so a full clear registers as a
  win. **Do not change what counts as clearing a wave** — only the ordering of the break.

- [ ] **Step 2: Detect the stall.** The hang is a true fixed point — sampled every 1000 ticks over
  100k ticks, positions were identical to 0.1 px and player state frozen. Add stall detection to
  `runMatch` (e.g. living-enemy count unchanged for N fight ticks; N = 20 000 was validated against
  full 400k runs and reproduced the same classification). Record it distinctly from `timedOut` if
  you can — a detected stall and a genuine 400k-tick overrun are different findings. Detection must
  **not** change any sim behaviour; it only stops the loop earlier and sets a flag.

- [ ] **Step 3: Surface it in the probe.** Exclude hung cells from `mean`/`sd`/`min`/`max`, add a
  `hangs: N/12` column to each row, and include the hang count in the summary block. **The hangs
  column is itself data** — whether a dial makes hangs more or less frequent is a real result.
  Keep the probe's no-pass-criterion discipline: never print VERIFIED, never exit non-zero on a
  measurement.

- [ ] **Step 4: Test it.** Add coverage to `test/harness/matchRunner.test.js` for the stall flag and
  the win fix. Seed **20260806 / postGap 0** is the known stall in the standard matrix (wave 9).
  Keep `npm test` fast — the suite is currently ~2.5 s total.

- [ ] **Step 5: Re-run the controls.** `npm run probe -- --dial __NULL_DIAL --values 1,2,3` at the
  **full 10-wave horizon** must still give byte-identical rows and NO SIGNAL. (At `maxWaves` 2-3
  every cell scores identically, `sd = 0`, and the `2*noise` test is vacuous — **the baseline must
  sweep at the full horizon.**) Confirm the dead-dial run still throws non-zero.

- [ ] **Step 6: Commit**, then proceed to Task 7.

---

### Task 7: Take and publish the baseline

The rejected plan ran its probe only *after* its fixes landed and read a green result as proof the fixes worked. That inference is invalid — nobody had ever run the probe against unmodified code. **Only a change in this table is evidence of anything.** So the table gets taken now, on a sim with no gameplay changes in it, and published.

Five dials, chosen for what each one can tell us:

| dial | why | expected |
|---|---|---|
| `ENEMY.BASE.0.hp` (goblin HP) | **calibration.** Higher enemy HP is unambiguously worse for defenders. If this is not monotonic, the instrument or the sim is broken and nothing else in the table means anything. | strongly monotonic, negative |
| `COST_FIELD.WALL_ENTRY_COST.1` | the review's prime suspect for genuine sensitive dependence — the band quantiser re-routes the whole horde globally off one point of chip damage | unknown; this is the real question |
| `BOT.ENGAGE_RANGE_PX` | the axis the Phase-6 data actually implicated. All three "chaotic" interventions were bot-positioning changes; none touched chase routing | unknown |
| `AGGRO.STICKY_MS` | subject of the phase, and dead to every previous sweep | unknown |
| `PLAYER.RESPAWN_BASE_MS` | the dial the Phase-4 respawn revert was decided on | unknown |

**Files:**
- Create: `docs/reviews/2026-07-25-phase8a-baseline.md`

- [ ] **Step 1: Confirm the tree is clean and green**

Run: `npm test`
Expected: PASS, 279/279. Baseline numbers taken from a dirty tree are worthless.

- [ ] **Step 2: Run the calibration dial first**

Run: `npm run probe -- --dial ENEMY.BASE.0.hp --values 6,9,12,18,24`

Goblin base HP is 12 (`shared/balance.js:124`), so this spans 0.5×–2×.

**If this comes back `NO SIGNAL` or `NON-MONOTONIC`, stop the phase and report.** Doubling goblin HP must make the game harder. A calibration dial that does not move the score means the instrument is still lying, and no other row in this table can be trusted.

- [ ] **Step 3: Run the remaining four dials**

```bash
npm run probe -- --dial COST_FIELD.WALL_ENTRY_COST.1 --values 5,15,30,45,60
```

```bash
npm run probe -- --dial BOT.ENGAGE_RANGE_PX --values 260,390,520,650,780
```

```bash
npm run probe -- --dial AGGRO.STICKY_MS --values 500,1500,3000,4500,6000
```

```bash
npm run probe -- --dial PLAYER.RESPAWN_BASE_MS --values 5000,12000,20000,30000,40000
```

Capture the full stdout of each run — the tables go into the doc verbatim, not summarised.

- [ ] **Step 4: Run the Phase-6 acceptance scenario through the real build phase**

The Phase-6 acceptance stamp ("1 human + 3 bots survive waves 1–4") was measured with the build loop amputated. Find out what it looks like with a real one:

```bash
node -e "import('./test/harness/matchRunner.js').then(async m => { const s = await import('./test/harness/scenarios.js'); for (const sc of s.scenarioMatrix({ maxWaves: 4 })) { const r = m.runMatch(sc); console.log(sc.seed, 'post', sc.postGap, 'cleared', r.wavesCleared, 'hall', r.hallHpFrac.toFixed(2), 'lost', r.lost) } })"
```

**Report the result. Do not change any test, and do not tune anything to make it look better.** If waves 1–4 now hold comfortably (likely — the human is buying towers for the first time), say so. If they do not, that is a finding about the game, not a bug in the harness.

- [ ] **Step 5: Write the baseline doc**

Create `docs/reviews/2026-07-25-phase8a-baseline.md` with these sections:

1. **What changed in the instrument** — the two defects (one-bit seed, amputated build phase), what Tasks 1–6 did about them, and the commit SHAs.
2. **The five dial tables** — verbatim probe stdout for each, one fenced block per dial.
3. **Calibration verdict** — did `ENEMY.BASE.0.hp` come back monotonic? Quote the ρ and the effect/noise ratio.
4. **Does the chaos exist?** — for each of the four real dials, the classification the probe printed and one sentence of reading. Answer the phase's actual question explicitly: *under a continuous metric with genuine scenario variation, is this simulation rough or smooth?*
5. **Phase-6 acceptance under a real build phase** — the Step 4 table and what it implies for the shipped stamp.
6. **What this means for Phases 4 and 6** — if the sim reads smooth, say plainly that the respawn revert and the CP3 mass-deferral were decided on measurement error and list what should be revisited.
7. **Recommendation for 8B/8C** — see the decision gate below.
8. **Instrument caveats — REQUIRED, do not omit.** What this baseline still cannot see:
   - **Economy dials are saturated and will read as insensitive.** Task 4's smoke run ended with
     `goldUnspent: 508` and `rebuildsSkippedForGold: 0` — the scripted build policy is never
     gold-limited. So a flat row for `STARTING_GOLD` / structure costs / income is a property of
     the deliberately-dumb policy, **not** a statement that cost changes don't matter in the game.
   - **Short horizons have a degenerate noise floor.** At `maxWaves` 2-3 all 12 cells score
     identically, `sd = 0`, and the `effect <= 2*noise` test is vacuous. Every table in this
     baseline must be taken at the **full 10-wave horizon** (sd ≈ 0.84, range 8.00-11.00).
   - **Hang rate.** Report the `hangs` count per dial from Task 6.5, and say plainly that hung
     cells are excluded from the means.
   - **The two engine soft-locks are present, unfixed, in every number here** — deliberately, so
     8B's fixes can be read as a delta against this table.

- [ ] **Step 6: Commit**

```bash
git add docs/reviews/2026-07-25-phase8a-baseline.md
git commit -m "Phase 8A: publish the baseline — first honest balance measurement this project has taken"
```

---

## ⛔ DECISION GATE — stop here and report to Philip

Phase 8A is complete. **Do not start Task 8 until Philip has read the baseline and ruled.**

Present the baseline and these three questions:

1. **Is the sim rough or smooth?**
   - *Smooth under a continuous metric* → the "chaotic balance" finding was a measurement artifact. The Phase-4 respawn revert and the Phase-6 CP3 deferrals were decided on noise and should be revisited. 8C becomes a straightforward balance sweep instead of a chaos hunt.
   - *Genuinely rough* → the review's ranked suspects are, in order: the `WALL_ENTRY_COST` band quantiser (global re-route off one point of chip damage), then wave-4 flank-coverage latency (all four bot anchors sit within ~64 px of each other at `bots.js:44-51`, and only drift once a stream enters the 520 px engage range — the wave-4 side gate opens exactly at the acceptance bar). Chase routing is *not* on this list; it explains none of the Phase-6 data.

2. **Does 8B still ship as planned?** Task 9 (cross-wall melee) closes a live exploit and is justified independently of the baseline. Task 10 (spawn protection) is a feel fix and is now measurable for the first time. Neither depends on the chaos diagnosis — but confirm before building.

3. **What goes in 8C?** Candidates, to be ranked from the baseline: the chase-steering LoS gate, the wall-band quantiser, bot anchor spread, and the actual balance sweep toward a 40–70 % win rate at 1 human + 3 bots.

---

## Phase 8B — the two fixes that stand on their own merits

Neither task below depends on the chaos diagnosis. Task 9 closes an exploit that is live in the shipped build right now. Task 10 is a feel fix that, for the first time, can be measured.

**The chase-steering LoS gate is NOT here.** Its entire justification was the root-cause story the review dismantled, and it is a genuine *difficulty increase* (a blocked chaser stops pressing a wall and resumes walking to the loss condition). It goes to 8C, ranked from the baseline.

### Task 8: Line-of-sight tile raycast

The primitive itself was reviewed as correct. Two changes from the rejected plan's version: the loop bound is tightened to the actual ray length (it was 4× the map diagonal), and the tests no longer place every endpoint at a tile centre — where the two branches of the `tMax` initialisation are numerically identical, so a very common Amanatides–Woo bug (dropping the ternary) passed all seven of them.

**Files:**
- Modify: `server/game/grid.js` (append at end of file)
- Test: `test/game/lineOfSight.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `test/game/lineOfSight.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  hasLineOfSight, tileToWorldX, tileToWorldY, TILE_SIZE,
} from '../../server/game/grid.js'

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

// --- off-centre endpoints -------------------------------------------------
// tileToWorldX always returns the tile CENTRE, where the two branches of the
// tMax initialisation evaluate to the same number (16/adx). An implementation
// that dropped the ternary entirely — a classic Amanatides-Woo bug — passes
// every test above. In the real sim, enemy and player positions are arbitrary
// floats (enemies.js:186, players.js:150-151), where that bug yields a
// half-tile-offset ray and therefore wrong LoS on every leftward/upward chase.

test('leftward ray from near the right face of its tile is blocked correctly', () => {
  const x0 = 9 * TILE_SIZE + 30, y0 = 5 * TILE_SIZE + 30   // deep in tile (9,5)
  const x1 = 2 * TILE_SIZE + 2,  y1 = 5 * TILE_SIZE + 2    // near the corner of (2,5)
  assert.equal(hasLineOfSight(open, x0, y0, x1, y1), true)
  assert.equal(hasLineOfSight(solidSet([5, 5]), x0, y0, x1, y1), false)
})

test('rightward mirror of the same ray agrees', () => {
  const x0 = 2 * TILE_SIZE + 2,  y0 = 5 * TILE_SIZE + 2
  const x1 = 9 * TILE_SIZE + 30, y1 = 5 * TILE_SIZE + 30
  assert.equal(hasLineOfSight(open, x0, y0, x1, y1), true)
  assert.equal(hasLineOfSight(solidSet([5, 5]), x0, y0, x1, y1), false)
})

test('upward ray from near the bottom face of its tile is blocked correctly', () => {
  const x0 = 4 * TILE_SIZE + 4, y0 = 9 * TILE_SIZE + 31
  const x1 = 4 * TILE_SIZE + 4, y1 = 1 * TILE_SIZE + 1
  assert.equal(hasLineOfSight(open, x0, y0, x1, y1), true)
  assert.equal(hasLineOfSight(solidSet([4, 5]), x0, y0, x1, y1), false)
})

test('non-diagonal rays are symmetric under endpoint swap', () => {
  // Scoped to non-diagonal rays on purpose: on an EXACT diagonal the tie-break
  // `tMaxX < tMaxY` resolves toward Y, so the forward and reverse walks visit
  // different tile sets and a wall on one of them legitimately blocks only one
  // direction. See the note on hasLineOfSight.
  const solid = solidSet([5, 5], [6, 8], [3, 11])
  const pairs = [
    [[2, 5], [9, 5]], [[4, 1], [4, 9]], [[1, 8], [9, 8]],
    [[2, 4], [9, 7]], [[8, 11], [1, 9]],
  ]
  for (const [[agx, agy], [bgx, bgy]] of pairs) {
    const ax = agx * TILE_SIZE + 7,  ay = agy * TILE_SIZE + 21
    const bx = bgx * TILE_SIZE + 25, by = bgy * TILE_SIZE + 5
    assert.equal(
      hasLineOfSight(solid, ax, ay, bx, by),
      hasLineOfSight(solid, bx, by, ax, ay),
      `asymmetric LoS between (${agx},${agy}) and (${bgx},${bgy})`)
  }
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/game/lineOfSight.test.js`
Expected: FAIL — `hasLineOfSight` is not exported from `grid.js`.

- [ ] **Step 3: Implement the primitive**

Append to `server/game/grid.js`:

```js
// Amanatides-Woo tile traversal between two world points. Returns false as soon
// as a solid tile is entered before reaching the target tile. Allocation-free
// (all scalars) — safe for the per-enemy-per-tick path.
//
// The START tile is never tested (a body may have been pushed against a wall it
// overlaps) and the TARGET tile is never tested (you can see the wall you are
// standing on).
//
// KNOWN ASYMMETRY: on an exact diagonal the `tMaxX < tMaxY` tie-break resolves
// toward Y, so W(1,1)->W(6,6) walks (2,2),(2,3),(3,3)... while the reverse walks
// (6,5),(5,5),(5,4)... A wall on exactly one of those sets blocks one direction
// only. Accepted: both call sites query a live pair of bodies whose float
// positions are effectively never on an exact tile diagonal, and making the
// tie-break symmetric costs a second solid test per step in the hot path.
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

  // The real bound: one step per tile boundary crossed, plus slack. Also the
  // NaN guard — a NaN input makes every comparison false, so the loop must
  // terminate on count.
  const maxSteps = Math.ceil((adx + ady) / TILE_SIZE) + 2
  for (let guard = 0; guard < maxSteps; guard++) {
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
Expected: PASS, 11 tests.

If the off-centre tests fail, the `tMax` ternary is wrong — that is exactly what they exist to catch. Fix the implementation, not the test.

- [ ] **Step 5: Commit**

```bash
git add server/game/grid.js test/game/lineOfSight.test.js
git commit -m "Phase 8B: allocation-free tile line-of-sight primitive with off-centre ray tests"
```

---

### Task 9: Close CP3-C1 half 2 — melee requires line of sight

CP3-C1 was described as **two halves, "both needed"** (`docs/reviews/2026-07-19-checkpoint3-designer-review.md:69-98`):

1. chase-blocked enemies attack the obstruction — **shipped** (`enemies.js:229-238`);
2. melee requires no solid tile between attacker and target, for **both** player basic and enemy contact melee — **deferred**, justified solely because half 1 closed the infinite stall.

Half 2 is still open and the exploit is live today. `tryBasicAttack` (`players.js:117-137`) has no geometry check: reach is `MELEE.RANGE_PX 34 + PLAYER_RADIUS 14 + enemy radius 9-14` = **57-62 px**, and two bodies on opposite faces of a 32 px tile are 55-60 px apart. A player presses the safe face of a barricade, hits enemies through it at will, takes zero damage, and pulls aggro by damage (`players.js:134` → `aggro.js:57`).

The enemy side has the mirror hole: at `enemies.js:227`, an in-reach target sets `attackPlayer` and therefore **skips** the wall-bash branch entirely — so an enemy pressed against the far face of a wall hits through it and never damages the wall.

Both are fixed here. This is ~6 lines and it closes the exploit at its source.

**Files:**
- Modify: `server/game/players.js` (imports, `tryBasicAttack`)
- Modify: `server/game/enemies.js:227`
- Test: `test/game/meleeLineOfSight.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `test/game/meleeLineOfSight.test.js`:

```js
// CP3-C1 half 2. The probe the CP3 designer review actually described: a player
// standing on the safe face of a barricade melees an enemy on the far face.
//
// Before this fix: the enemy takes full damage, the player takes none, and the
// WALL takes none either (being attacked through a wall PROTECTED the wall).
// After: the player's swing does not connect, and the enemy — which cannot
// reach the player either — bashes the barricade in its way.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGameState } from '../../server/game/state.js'
import { startBuildPhase, PHASES } from '../../server/game/phaseMachine.js'
import { tickGame } from '../../server/game/tick.js'
import { hpToBand } from '../../server/game/costField.js'
import { STRUCTURE_TYPES, TILE_SIZE } from '../../shared/constants.js'
import { BALANCE } from '../../shared/balance.js'
import { tileToWorldX, tileToWorldY } from '../../server/game/grid.js'
import { ENEMY_TYPE } from '../../server/game/enemyTypes.js'

const WALL_GX = 10, WALL_GY = 10

function setup() {
  const room = {
    players: [{ id: 'h0', element: 'EARTH', displayName: 'h', isBot: false }],
    settings: { timingStyle: 'fixed', friendlyFire: false },
  }
  const state = createGameState(room, 20260801)
  startBuildPhase(state, 1)

  const cat = BALANCE.STRUCTURES[STRUCTURE_TYPES.BARRICADE]
  const wall = {
    id: 99_001, type: STRUCTURE_TYPES.BARRICADE, ownerId: 'script',
    gx: WALL_GX, gy: WALL_GY, w: 1, h: 1,
    hp: cat.hp, maxHp: cat.hp, dormant: false, createdAt: 0, attackReadyAt: 0,
  }
  state.structures.push(wall)
  state.costField.setWallBand(WALL_GX, WALL_GY, hpToBand(wall.hp, wall.maxHp))
  state.costField.compute()

  // Player one tile BELOW the wall, enemy one tile ABOVE it — 32px of solid
  // barricade between two bodies that are ~64px apart, inside the 57-62px reach.
  const p = state.players[0]
  p.x = tileToWorldX(WALL_GX)
  p.y = tileToWorldY(WALL_GY + 1) - 14      // pressed against the wall's south face

  const st = state.enemyStore
  st.spawn({
    type: ENEMY_TYPE.GOBLIN, elite: false,
    x: tileToWorldX(WALL_GX), y: tileToWorldY(WALL_GY - 1) + 12,
  }, 0)

  return { state, wall, p }
}

const ATTACK = (aimY) => ({
  keys: { w: false, a: false, s: false, d: false },
  aimX: 0, aimY,
  actions: { basic: true, special: false, second: false },
})

test('CP3-C1: a player cannot melee an enemy through a barricade', () => {
  const { state, p } = setup()
  const st = state.enemyStore
  const hp0 = st.hp[0]

  let now = 0
  for (let t = 0; t < 100; t++) {          // 5s at 50ms
    now += 50
    state.phaseClockMs = 0                  // stay in build: no wave spawns to confuse the probe
    p.x = tileToWorldX(WALL_GX)             // pin the player against the wall
    p.y = tileToWorldY(WALL_GY + 1) - 14
    tickGame(state, new Map([['h0', ATTACK(-1)]]), now, 50)
    if (st.count === 0) break
  }

  assert.equal(st.count, 1, 'the enemy is still alive')
  assert.equal(st.hp[0], hp0,
    'the enemy took damage through a solid barricade — CP3-C1 half 2 is still open')
})

test('CP3-C1: the same player CAN melee the enemy once the wall is gone', () => {
  const { state, wall, p } = setup()
  // Remove the barricade from the field; keep the geometry identical.
  state.costField.setWallBand(WALL_GX, WALL_GY, 0)
  state.costField.compute()
  wall.hp = 0

  const st = state.enemyStore
  const hp0 = st.hp[0]

  let now = 0
  for (let t = 0; t < 40; t++) {
    now += 50
    state.phaseClockMs = 0
    p.x = tileToWorldX(WALL_GX)
    p.y = tileToWorldY(WALL_GY + 1) - 14
    tickGame(state, new Map([['h0', ATTACK(-1)]]), now, 50)
    if (st.count === 0) return             // killed outright is a pass
  }
  assert.ok(st.hp[0] < hp0,
    'with no wall in the way the swing must connect — the LoS gate is too strict')
})

test('CP3-C1: a wall-blocked enemy damages the wall instead of hitting through it', () => {
  const { state, wall } = setup()

  let now = 0
  for (let t = 0; t < 200; t++) {          // 10s
    now += 50
    state.phaseClockMs = 0
    tickGame(state, new Map(), now, 50)
    if (wall.hp < wall.maxHp) break
  }

  assert.ok(wall.hp < wall.maxHp,
    'the barricade took no damage — being attacked through a wall still protects the wall')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/game/meleeLineOfSight.test.js`
Expected: FAIL on test 1 — the enemy's HP dropped, because `tryBasicAttack` has no LoS check. Test 3 may also fail (the enemy hits the player through the wall and never sets `attackStruct`).

**This failure is the exploit.** Record the exact HP delta in the commit message; it is the first direct measurement of CP3-C1 half 2.

- [ ] **Step 3: Gate the player's basic on line of sight**

In `server/game/players.js`, extend the `grid.js` import — the file currently imports nothing from it, so add:

```js
import { hasLineOfSight } from './grid.js'
```

Then in `tryBasicAttack`, replace lines 124-129 (the candidate scan):

```js
  const store = state.enemyStore
  const solid = solidFn(state.costField)
  let best = -1, bestD2 = Infinity
  for (let i = 0; i < store.count; i++) {
    const dx = store.x[i] - p.x, dy = store.y[i] - p.y
    const reach = P.MELEE.RANGE_PX + R + store.radius[i]
    const d2 = dx * dx + dy * dy
    if (d2 > reach * reach || d2 >= bestD2) continue
    // CP3-C1 half 2: no solid tile between the two bodies. Without this, reach
    // (57-62px) exceeds a tile (32px), so a player pressed against a barricade
    // hits through it for free — full damage out, zero damage in, and the wall
    // itself takes nothing because the enemy's in-reach branch skips the
    // bulldoze. Checked LAST: it is the only non-scalar test in this loop.
    if (!hasLineOfSight(solid, p.x, p.y, store.x[i], store.y[i])) continue
    bestD2 = d2; best = i
  }
```

`solidFn` is already defined at `players.js:29-33` and returns a memoised per-field closure — no allocation.

- [ ] **Step 4: Gate the enemy's contact melee on line of sight**

In `server/game/enemies.js`, `hasLineOfSight` needs adding to the existing `./grid.js` import block (lines 1-20).

Then replace line 227:

```js
      // Contact melee vs the chased player (the Phase-3 deferral closed), now
      // with CP3-C1 half 2: in reach is not enough, the swing needs a clear
      // line. Without the LoS test an in-reach target sets attackPlayer and
      // SKIPS the bulldoze branch below, so an enemy on the far face of a wall
      // hits through it and the wall takes nothing.
      if (d <= store.radius[i] + CONFIG.PLAYER_RADIUS + E.MELEE_RANGE_PX &&
          hasLineOfSight(solidFn(costField), ex, ey, target.x, target.y)) {
        attackPlayer = target
      }
```

The existing `else { ... }` block that follows (the wall-bash) is unchanged and now correctly catches the blocked-but-in-reach case.

- [ ] **Step 5: Run the new tests, then the full suite**

Run: `node --test test/game/meleeLineOfSight.test.js`
Expected: PASS, 3 tests.

Run: `npm test`
Expected: PASS, 282/282.

**If a pre-existing test flips, STOP and report — do not tune it back.** The most likely casualties are Phase-3/Phase-4 melee tests that place a player and an enemy across a structure by accident. Read each failure and say whether it was asserting the exploit.

- [ ] **Step 6: Commit**

```bash
git add server/game/players.js server/game/enemies.js test/game/meleeLineOfSight.test.js
git commit -m "Phase 8B: close CP3-C1 half 2 — melee requires line of sight, both directions"
```

---

### Task 10: Spawn protection — flat window, on respawn AND revive

**The design ruling, restated correctly.** The window is flat with **no break condition** — not on attack input, not on damage dealt, not on movement, not decaying. The reviewer upheld the conclusion but corrected the argument, and the corrected argument is what goes in the code comment and the spec:

- The old justification ("the harness hammers every action key, so an attack-clear is a no-op there") is test convenience driving design. **Do not repeat it in that form.** It survives only when restated about real play: humans mash the basic on respawn out of reflex, so an attack-clear makes the mechanic inert in the game too — a feature that only works for players who deliberately hold still is a trap for the attentive.
- The load-bearing argument is different and sufficient on its own: **any break condition makes the window's duration a function of combat timing**, which is the exact coupling this phase exists to remove. All three alternatives were checked and fail — damage-break collapses to ~500 ms (`P.MELEE.COOLDOWN_MS`), movement-break fires within a tick or two and punishes walking back to the line, and decay reintroduces the continuous coupling while still crossing `damagePlayer`'s hard `hp <= 0` threshold at a combat-determined moment.

**The three mandatory amendments, all carried:**

1. **1500 ms, not 2500 ms.** At a 500 ms basic cooldown, 2.5 s of immunity buys five free hits to a human who sprints from the hall into the pack — a strictly dominant respawn opener with no counterplay. 1.5 s buys three.
2. **`revive()` gets protection too.** `respawn` puts a full-HP player at the hall after a ≥20 s timer — the case that needs it least. `revive` stands a player up **in place, in the middle of whatever killed them, at 40 % HP**, inside a pack whose proximity trigger is 90 px, and currently grants nothing. That is the case that generates the feels-bad and burns the teammate's 3 s channel.
3. **It is de-facto damage immunity, and the code says so.** `attackPlayer` is only ever set inside the `CHASE && target` branch (`enemies.js:221-227`). Remove the player from targeting and `updateAggro` returns `MARCH`, `attackPlayer` stays `null`, and the enemy melee path at `enemies.js:267-269` is unreachable. Enemies have no other damage source against players. "Untargetable" and "immune" have different exploit surfaces; a future reader will not derive the second from the first.

Camping is self-limiting and needs no extra guard: dying costs `BLEED_OUT_MS` 15 s plus `RESPAWN_BASE_MS` 20 s + 1 s/wave — 35 s+ of removal for 1.5 s of immunity, with the hall taking the damage you were absorbing.

**Files:**
- Modify: `shared/balance.js` (`PLAYER` block)
- Modify: `server/game/players.js` (`makePlayer` is in `state.js`; `respawn`, `revive`, `restoreAllPlayers`, new `isTargetable`)
- Modify: `server/game/state.js:54` (initialise the field)
- Modify: `server/game/enemies.js:195,206` (targeting filter)
- Test: `test/game/spawnProtection.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `test/game/spawnProtection.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGameState } from '../../server/game/state.js'
import { startBuildPhase } from '../../server/game/phaseMachine.js'
import { tickGame } from '../../server/game/tick.js'
import { restoreAllPlayers, isTargetable, damagePlayer } from '../../server/game/players.js'
import { tileToWorldX, tileToWorldY } from '../../server/game/grid.js'
import { ENEMY_TYPE } from '../../server/game/enemyTypes.js'
import { BALANCE } from '../../shared/balance.js'

const P = BALANCE.PLAYER

function setup() {
  const room = {
    players: [
      { id: 'h0', element: 'EARTH', displayName: 'h', isBot: false },
      { id: 'h1', element: 'FIRE',  displayName: 'm', isBot: false },
    ],
    settings: { timingStyle: 'fixed', friendlyFire: false },
  }
  const state = createGameState(room, 20260801)
  startBuildPhase(state, 1)
  return state
}

const IDLE = { keys: { w: false, a: false, s: false, d: false }, aimX: 0, aimY: -1,
               actions: { basic: false, special: false, second: false } }

test('a fresh player carries no protection', () => {
  const state = setup()
  assert.equal(state.players[0].protectedUntil, 0)
  assert.equal(isTargetable(state.players[0], 0), true)
})

test('respawn stamps SPAWN_PROTECT_MS of protection', () => {
  const state = setup()
  const p = state.players[0]
  p.life = 'dead'; p.alive = false; p.respawnAt = 1000

  let now = 0
  for (let t = 0; t < 40 && p.life !== 'up'; t++) {
    now += 50
    state.phaseClockMs = 0
    tickGame(state, new Map([['h0', IDLE], ['h1', IDLE]]), now, 50)
  }
  assert.equal(p.life, 'up', 'the player respawned')
  assert.equal(p.protectedUntil, now + P.SPAWN_PROTECT_MS)
  assert.equal(isTargetable(p, now), false, 'protected right after respawn')
  assert.equal(isTargetable(p, now + P.SPAWN_PROTECT_MS + 1), true, 'and targetable after it lapses')
})

test('revive stamps REVIVE_PROTECT_MS — the case that actually needed it', () => {
  const state = setup()
  const [p, mate] = state.players
  // Down p with the mate standing on top of them so the channel completes.
  damagePlayer(state, p, p.maxHp + 1, 0)
  assert.equal(p.life, 'down')
  mate.x = p.x; mate.y = p.y

  let now = 0
  for (let t = 0; t < 200 && p.life !== 'up'; t++) {
    now += 50
    state.phaseClockMs = 0
    mate.x = p.x; mate.y = p.y
    tickGame(state, new Map([['h0', IDLE], ['h1', IDLE]]), now, 50)
  }
  assert.equal(p.life, 'up', 'the revive channel completed')
  assert.ok(p.protectedUntil > now, 'a revived player is protected — this is the feels-bad case')
  assert.equal(p.protectedUntil, now + P.REVIVE_PROTECT_MS)
})

test('restoreAllPlayers clears any stale protection', () => {
  const state = setup()
  state.players[0].protectedUntil = 999_999
  restoreAllPlayers(state)
  assert.equal(state.players[0].protectedUntil, 0)
})

test('an enemy will not aggro or damage a protected player', () => {
  const state = setup()
  const p = state.players[0]
  const other = state.players[1]
  other.alive = false            // remove the second player from targeting entirely
  other.life = 'dead'

  p.x = tileToWorldX(10); p.y = tileToWorldY(10)
  p.protectedUntil = 5_000
  const hp0 = p.hp

  const st = state.enemyStore
  st.spawn({ type: ENEMY_TYPE.GOBLIN, elite: false, x: p.x + 20, y: p.y }, 0)

  let now = 0
  for (let t = 0; t < 60; t++) {   // 3s, well inside the window
    now += 50
    state.phaseClockMs = 0
    p.x = tileToWorldX(10); p.y = tileToWorldY(10)
    tickGame(state, new Map([['h0', IDLE]]), now, 50)
  }
  assert.equal(p.hp, hp0, 'a protected player took enemy damage')
  assert.equal(st.aggro[0].state, 'march', 'a protected player pulled aggro')
})

test('the same enemy DOES damage the player once protection lapses', () => {
  const state = setup()
  const p = state.players[0]
  const other = state.players[1]
  other.alive = false
  other.life = 'dead'

  p.x = tileToWorldX(10); p.y = tileToWorldY(10)
  p.protectedUntil = 0
  const hp0 = p.hp

  const st = state.enemyStore
  st.spawn({ type: ENEMY_TYPE.GOBLIN, elite: false, x: p.x + 20, y: p.y }, 0)

  let now = 0
  for (let t = 0; t < 60; t++) {
    now += 50
    state.phaseClockMs = 0
    p.x = tileToWorldX(10); p.y = tileToWorldY(10)
    tickGame(state, new Map([['h0', IDLE]]), now, 50)
    if (p.hp < hp0) return        // pass
  }
  assert.fail('an unprotected player standing next to a goblin took no damage — ' +
              'the control is broken, so the protection test above proves nothing')
})
```

The last test is the control. Without it, "protected player took no damage" could pass because the enemy never reaches anyone.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/game/spawnProtection.test.js`
Expected: FAIL — `isTargetable` is not exported and `P.SPAWN_PROTECT_MS` is `undefined`.

- [ ] **Step 3: Add the tunables**

In `shared/balance.js`, inside the `PLAYER` block, after `RESPAWN_PER_WAVE_MS` (line 213):

```js
    // Spawn protection (Phase 8B). FLAT windows with NO break condition — not
    // on attack input, damage dealt, movement, or decay. Any break condition
    // makes the window's duration a function of combat timing, which is the
    // exact coupling Phase 8 exists to remove; and an attack-clear in
    // particular makes the mechanic inert for the typical player, who mashes
    // the basic on respawn out of reflex.
    //
    // THIS IS DE-FACTO DAMAGE IMMUNITY, not merely "invisible to aggro".
    // enemies.js only ever sets attackPlayer inside the CHASE && target branch,
    // and enemies have no other damage source against players — so removing the
    // player from targeting removes them from harm. (Friendly fire and ability
    // effects still apply: they go through damagePlayer directly.)
    //
    // 1500ms, not 2500: at a 500ms basic cooldown, 2.5s buys five free hits to
    // a human who sprints from the hall into the pack. [Phase 8C sweep]
    SPAWN_PROTECT_MS:  1_500,   // hall respawn (full HP, >=20s timer — needs it least)
    REVIVE_PROTECT_MS: 1_500,   // stood up IN PLACE at 40% HP inside the pack — needs it most
```

- [ ] **Step 4: Initialise the field**

In `server/game/state.js`, in `makePlayer`, after line 54 (`basicReadyAt: 0, ...`):

```js
    protectedUntil: 0,       // spawn/revive protection deadline (Phase 8B)
```

- [ ] **Step 5: Stamp and clear the window**

In `server/game/players.js`:

Replace `respawn` (lines 70-79) — note the added `now` parameter:

```js
function respawn(state, p, now) {
  p.life = 'up'
  p.alive = true
  p.hp = p.maxHp
  p.x = p.spawnX
  p.y = p.spawnY
  p.kvx = 0; p.kvy = 0
  p.reviveMs = 0
  p.protectedUntil = now + P.SPAWN_PROTECT_MS
  state.fx.push({ type: 'respawn', x: p.x, y: p.y })
}
```

Replace `revive` (lines 81-88) — same, plus the protection that is the point of amendment 2:

```js
function revive(state, p, now) {
  p.life = 'up'
  p.alive = true
  p.hp = Math.round(p.maxHp * P.REVIVE_HP_FRACTION)
  p.reviveMs = 0
  p.kvx = 0; p.kvy = 0
  // A revived player stands up IN PLACE, at 40% HP, inside whatever pack
  // downed them. Without this they are re-targeted within a tick (proximity
  // 90px) and usually re-down within a second, burning the 3s channel their
  // teammate just spent.
  p.protectedUntil = now + P.REVIVE_PROTECT_MS
  state.fx.push({ type: 'revived', x: p.x, y: p.y })
}
```

Update the two call sites in `tickLifecycle`:

- line 105: `if (p.reviveMs >= P.REVIVE_CHANNEL_MS) revive(state, p, now)`
- line 111: `if (p.life === 'dead' && now >= p.respawnAt) respawn(state, p, now)`

Add the targeting predicate near `playerFlags` (after line 41):

```js
// The single targeting predicate the enemy sim reads. `alive` alone was it
// until Phase 8B; spawn/revive protection now also removes a player from
// aggro and, transitively, from all enemy damage (see BALANCE.PLAYER
// SPAWN_PROTECT_MS for why that is immunity, not just invisibility).
export function isTargetable(p, now) {
  return p.alive !== false && !(p.protectedUntil > now)
}
```

Add hygiene to `restoreAllPlayers` (after line 203's `p.reviveMs = 0`):

```js
    p.protectedUntil = 0     // never let a stale window leak into a fight
```

- [ ] **Step 6: Filter targeting in the enemy sim**

In `server/game/enemies.js`, add `isTargetable` to the existing `./players.js` import (line 30):

```js
import { damagePlayer, isTargetable } from './players.js'
```

Replace line 195:

```js
      if (!isTargetable(p, now)) continue
```

Replace line 206:

```js
        if (p.id === ag.targetId && isTargetable(p, now)) { target = p; break }
```

- [ ] **Step 7: Run the new tests, then the full suite**

Run: `node --test test/game/spawnProtection.test.js`
Expected: PASS, 6 tests.

Run: `npm test`
Expected: PASS, 288/288.

**If the Phase-4 or Phase-6 acceptance tests flip, STOP and report the flip — do not tune `SPAWN_PROTECT_MS` to make them pass.** That is exactly the failure mode this phase exists to end.

- [ ] **Step 8: Commit**

```bash
git add shared/balance.js server/game/players.js server/game/state.js \
        server/game/enemies.js test/game/spawnProtection.test.js
git commit -m "Phase 8B: flat spawn protection on respawn AND revive (1500ms, documented as damage immunity)"
```

---

### Task 11: Re-measure against the baseline

The point of Phase 8A was that only a **change** in the baseline table is evidence. Take the same measurements again and diff them.

**Files:**
- Modify: `docs/reviews/2026-07-25-phase8a-baseline.md` (append an 8B section)

- [ ] **Step 1: Re-run all five dials**

Run each of the five commands from Task 7 Steps 2–3 again, unmodified, and capture stdout.

- [ ] **Step 2: Re-run the Phase-6 acceptance scenario**

Run the Task 7 Step 4 command again.

- [ ] **Step 3: Append the diff**

Append a `## After Phase 8B` section to `docs/reviews/2026-07-25-phase8a-baseline.md` containing, for each dial: the before/after mean at each value, the change in classification (if any), and one sentence of reading. Then a short summary answering:

- Did closing CP3-C1 half 2 make the game measurably harder for the defenders? (It should: the player loses a free damage source and the enemy gains a wall-bash it previously skipped.)
- Did spawn protection move anything?
- Did any dial change classification — smooth → rough or vice versa?

**Report the numbers. Do not tune anything.** If 8B made the game materially harder, that is a genuine, expected difficulty increase and it is 8C's job to decide what to do about it.

- [ ] **Step 4: Commit**

```bash
git add docs/reviews/2026-07-25-phase8a-baseline.md
git commit -m "Phase 8B: re-measure against the baseline"
```

---

### Task 12: Spec amendment

**Files:**
- Modify: `docs/superpowers/specs/2026-07-17-slice1-design.md`

- [ ] **Step 1: Write the amendment**

Append a `## Phase 8 amendment (2026-07-25)` section recording, each in a short paragraph:

1. **Spawn protection.** Flat windows, `SPAWN_PROTECT_MS` 1500 on hall respawn and `REVIVE_PROTECT_MS` 1500 on revive. **No break condition** — state the load-bearing reason (any break makes the window's duration a function of combat timing) and the supporting one (an attack-clear is inert for players who mash the basic on respawn). State plainly that it is **de-facto immunity to all enemy damage**, not merely untargetability, because `attackPlayer` is only reachable from the chase branch; friendly fire and ability effects are unaffected. Both values are `[Phase 8C sweep]` candidates.
2. **Melee requires line of sight** (CP3-C1 half 2, now closed) for both the player basic and enemy contact melee. Note the previously-live exploit it closed and that `hasLineOfSight` is asymmetric on exact diagonals by design.
3. **Spawn timing is jittered from the seeded RNG** (`WAVE_SPAWN.JITTER_MS`). Record *why*: before Phase 8A the seed had one consumer, so every multi-seed result the project produced was really n=2.
4. **`WALL_ENTRY_COST` now lives in `BALANCE.COST_FIELD`**, and the band quantiser's discontinuity is named as the leading suspect for any genuine sensitive dependence.
5. **Channel repair is unwired.** `repair.js` has no caller outside its own test. Record it as a known gap with a proposed home (Phase 8D), so nobody again assumes the maze can be maintained.
6. **Chase steering is deliberately NOT LoS-gated.** Record that it was proposed, that its justification was a root-cause diagnosis the 2026-07-24 review dismantled, and that it is deferred to 8C pending the baseline.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-07-17-slice1-design.md
git commit -m "Phase 8 spec amendment: spawn protection, melee LoS, seed entropy, WALL_ENTRY_COST, repair gap"
```

---

### Task 13: Checkpoint review

Standing authorization applies — dispatch the adversarial checkpoint review without asking.

- [ ] **Step 1: Confirm the tree is green**

Run: `npm test`
Expected: PASS, 288/288.

Run: `npm run probe -- --dial __NULL_DIAL --values 1,2,3 --maxWaves 2`
Expected: `NO SIGNAL`, identical rows. The instrument must still be honest at the end of the phase.

- [ ] **Step 2: Dispatch the review**

Dispatch an Opus subagent with a senior multiplayer-systems-engineer + senior-game-designer profile and an adversarial mandate ("find what breaks"), reviewing this plan's diff against live source. Require every line reference to be read, not inferred. Point it specifically at:

- Is the instrument actually honest now, or does it have a new blind spot? Attack `matchRunner.js` and `probe.js` first.
- Is `WAVE_SPAWN.JITTER_MS` enough entropy to make a 12-scenario matrix meaningful, or is it still effectively n=2 with noise?
- Does the scripted build policy measure a game a human would recognise?
- Did the melee LoS gate open anything new?
- Is 1500 ms defensible, and does protecting `revive` create a revive-camping loop?

- [ ] **Step 3: Verify each finding against live source before acting**

The last review found real defects and this plan carries its fixes, but a finding is still a claim. Read the cited lines before changing anything, and say so per finding.

- [ ] **Step 4: Report to Philip**

Verdict, findings that survived verification, findings that did not, and the recommended 8C scope.

---

## Notes for whoever executes this

- **Nothing in this plan may be tuned to make a test or a probe pass.** Every measurement step says "record it" or "stop and report" on purpose. Phases 4 and 6 both reverted good changes because a number moved; that is the failure mode the whole phase exists to end.
- **Test counts** (258 → 263 → 271 → 279 → 282 → 288) assume no other work lands in parallel. Treat a mismatch as informational, not as a failure.
- **The 8A/8B split is a hard gate.** Task 8 does not start until Philip has ruled on the baseline.
- **If the baseline says the sim is smooth**, expect the follow-up conversation to be about un-reverting Phase 4's respawn change and re-opening the Phase-6 CP3 deferrals — not about building more fixes.
