// Grinder / GRINDER (redesign §6.6, Task 15) — the TIMED PHASE MACHINE family
// (spec §3 family 3), sharing structureBehaviors/cycle.js with Wind Vortex.
// INTAKE runs fixed pull pulses over the outer radius; at intake's end ONE
// CRUSH deals high group damage to the inner zone only, then ejects the
// survivors in the locked cardinal direction.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EnemyStore } from '../../server/game/enemies.js'
import { tickTowers } from '../../server/game/towers.js'
import { ENEMY_TYPE } from '../../server/game/enemyTypes.js'
import { BALANCE } from '../../shared/balance.js'
import { tileToWorldX, tileToWorldY } from '../../server/game/grid.js'
import { GRINDER_PHASE } from '../../server/game/structureBehaviors/cycle.js'
import { encodeSnapshot, decodeSnapshot } from '../../server/net/encode.js'
import { createCombatStats } from '../../server/game/combatStats.js'

const SPEC = BALANCE.TOWER.GRINDER
const G = SPEC.grind

function grinder(gx, gy, dir = 'E', id = 1) {
  return { id, type: 'GRINDER', ownerId: null, gx, gy, w: 2, h: 2, orient: 'H', dir, hp: 90, maxHp: 90 }
}
function makeState(structures) {
  // `fx` is part of the real state shape (matchRunner drains it every tick);
  // this fixture omitted it until 2026-08-29, when root capture became the
  // first Grinder behaviour to emit an effect.
  return { structures, enemyStore: new EnemyStore(), waveBounty: 0, fx: [] }
}
function spawnAt(store, x, y, type = ENEMY_TYPE.GOBLIN, elite = false) {
  return store.spawn({ type, elite, x, y }, 0)
}
function centerOf(gx, gy) { return { cx: tileToWorldX(gx) + 16, cy: tileToWorldY(gy) + 16 } }

// Advance to the tick the crush resolves on: intake's deadline is intakeMs, so
// the first tick at or past it flips to CRUSH, and the crush fires on the tick
// after that (the phase body runs on entry to the next tickTowers call).
// The CRUSH-semantics tests below isolate the crush by turning contact damage
// off (added 2026-08-29). Contact damage is continuous and dwell-dependent, so
// an exact `maxHp - SPEC.damage` assertion left running against it would be
// asserting the fixture's tick count as much as the crush — and would drift
// every time a cadence constant moved. `contactDps: 0` is a documented clean
// off switch, and there is a test at the bottom of this file guarding exactly
// that, so this isolation cannot quietly stop isolating.
function crushOnly(fn) {
  const saved = BALANCE.TOWER.GRINDER.grind.contactDps
  BALANCE.TOWER.GRINDER.grind.contactDps = 0
  try { fn() } finally { BALANCE.TOWER.GRINDER.grind.contactDps = saved }
}

function runToCrush(st, extraTicks = 0) {
  tickTowers(st, 0, 16)                 // establishes the cycle, first intake pulse
  tickTowers(st, G.intakeMs, 16)        // deadline reached -> phase flips to CRUSH
  tickTowers(st, G.intakeMs + 16, 16)   // CRUSH body resolves once
  for (let k = 0; k < extraTicks; k++) tickTowers(st, G.intakeMs + 32 + k * 16, 16)
}

test('a new cycle starts in INTAKE with the deadline set from grind.intakeMs', () => {
  const g = grinder(10, 10)
  const st = makeState([g])
  tickTowers(st, 0, 16)
  assert.equal(g.phase, GRINDER_PHASE.INTAKE)
  assert.equal(g.phaseDeadline, G.intakeMs)
  assert.equal(g.cycleSeq, 0)
})

test('intake pulses on a fixed cadence, not every tick', () => {
  const g = grinder(10, 10)
  const st = makeState([g])
  const { cx, cy } = centerOf(10, 10)
  const i = spawnAt(st.enemyStore, cx + 100, cy)   // inside outer (160), outside inner (55)

  tickTowers(st, 0, 16)   // first pulse fires immediately
  const kvAfterFirst = st.enemyStore.kvx[i]
  assert.ok(kvAfterFirst < 0, 'pulled toward center (-x)')

  tickTowers(st, 100, 16) // still inside the same pulse window (pulseMs = 250)
  assert.equal(st.enemyStore.kvx[i], kvAfterFirst, 'no second pulse before pulseMs elapses')

  tickTowers(st, G.pulseMs, 16)
  assert.ok(st.enemyStore.kvx[i] < kvAfterFirst, 'a second pulse adds further pull')
})

test('only enemies inside the OUTER radius are pulled', () => {
  const g = grinder(10, 10)
  const st = makeState([g])
  const { cx, cy } = centerOf(10, 10)
  const inside = spawnAt(st.enemyStore, cx + SPEC.outerRadiusPx - 10, cy)
  const outside = spawnAt(st.enemyStore, cx + SPEC.outerRadiusPx + 20, cy)

  tickTowers(st, 0, 16)

  assert.ok(st.enemyStore.kvx[inside] < 0, 'inside the outer radius: pulled')
  assert.equal(st.enemyStore.kvx[outside], 0, 'beyond the outer radius: untouched')
})

test('the pull is an impulse, never a snap to the center coordinate', () => {
  // §6.6: "do not force enemies to an identical center coordinate".
  const g = grinder(10, 10)
  const st = makeState([g])
  const { cx, cy } = centerOf(10, 10)
  const a = spawnAt(st.enemyStore, cx + 100, cy)
  const b = spawnAt(st.enemyStore, cx + 120, cy)

  tickTowers(st, 0, 16)

  assert.equal(st.enemyStore.x[a], cx + 100, 'position is not written by the pull, only velocity')
  assert.notEqual(st.enemyStore.x[a], st.enemyStore.x[b], 'two pulled enemies do not converge to one point')
})

test('only INNER-zone enemies take crush damage; outer-zone stragglers take none', () => crushOnly(() => {
  const g = grinder(10, 10)
  const st = makeState([g])
  const { cx, cy } = centerOf(10, 10)
  const inner = spawnAt(st.enemyStore, cx + 10, cy, ENEMY_TYPE.TROLL)
  const straggler = spawnAt(st.enemyStore, cx + SPEC.outerRadiusPx - 5, cy, ENEMY_TYPE.TROLL)

  // Freeze both in place so the pull cannot drag the straggler inside — this
  // isolates the position gate, which is the whole point of the mechanic.
  runToCrush(st)

  assert.equal(st.enemyStore.hp[inner], st.enemyStore.maxHp[inner] - SPEC.damage, 'inner zone crushed')
  assert.equal(st.enemyStore.hp[straggler], st.enemyStore.maxHp[straggler],
    'never reached the inner zone, so took no crush damage')
}))

test('every inner-zone enemy takes the crush damage exactly once', () => crushOnly(() => {
  const g = grinder(10, 10)
  const st = makeState([g])
  const { cx, cy } = centerOf(10, 10)
  const ids = [
    spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.TROLL),
    spawnAt(st.enemyStore, cx + 8, cy, ENEMY_TYPE.TROLL),
    spawnAt(st.enemyStore, cx, cy + 8, ENEMY_TYPE.TROLL),
  ]

  // Several extra ticks inside the CRUSH phase must not re-resolve it.
  runToCrush(st, 5)

  for (const i of ids) {
    assert.equal(st.enemyStore.hp[i], st.enemyStore.maxHp[i] - SPEC.damage,
      'exactly one crush hit, no matter how many ticks the crush phase lasts')
  }
}))

test('survivors are ejected in the locked direction, weight-scaled', () => {
  const g = grinder(10, 10, 'E')
  const st = makeState([g])
  const { cx, cy } = centerOf(10, 10)
  // Both sit EXACTLY on center so the intake pull contributes zero impulse
  // (a zero direction vector), isolating the eject as the only force here.
  // The light enemy is given troll-grade HP because a goblin's real 12 HP is
  // one-shot by the crush and a corpse cannot be ejected.
  const light = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.GOBLIN)   // LIGHT (kb scale 1.0)
  const heavy = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.TROLL)    // HEAVY (kb scale 0.3)
  st.enemyStore.hp[light] = st.enemyStore.maxHp[light] = 200

  runToCrush(st)

  assert.ok(st.enemyStore.kvx[light] > 0, 'ejected east, the locked direction')
  assert.equal(st.enemyStore.kvy[light], 0, 'no cross-axis component on a cardinal eject')
  assert.ok(st.enemyStore.kvx[heavy] > 0, 'heavy is ejected too')
  assert.ok(st.enemyStore.kvx[heavy] < st.enemyStore.kvx[light], 'weight scales the eject')
})

test('the eject direction follows the structure\'s locked dir, not the enemy position', () => {
  const g = grinder(10, 10, 'N')
  const st = makeState([g])
  const { cx, cy } = centerOf(10, 10)
  const i = spawnAt(st.enemyStore, cx + 20, cy, ENEMY_TYPE.TROLL)   // east of center

  tickTowers(st, 0, 16)
  const pullOnly = st.enemyStore.kvx[i]
  assert.ok(pullOnly < 0, 'intake pulled it west, toward center')

  runToCrush(st)

  assert.ok(st.enemyStore.kvy[i] < 0, 'ejected north despite sitting east of center')
  assert.ok(st.enemyStore.kvx[i] < 0,
    'the eject added nothing on the x axis — it follows dir, not the center-offset the pull used')
})

test('a super-heavy enemy resists displacement but is still crushed in the inner zone', () => crushOnly(() => {
  // §6.6 verification, exactly this case. Elite troll = HEAVY + 1 = SUPER_HEAVY.
  const g = grinder(10, 10)
  const st = makeState([g])
  const { cx, cy } = centerOf(10, 10)
  const sh = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.TROLL, true)
  assert.equal(st.enemyStore.weight[sh], 3, 'fixture really is super-heavy')

  tickTowers(st, 0, 16)
  assert.equal(st.enemyStore.kvx[sh], 0, 'intake cannot drag a super-heavy enemy')
  assert.equal(st.enemyStore.kvy[sh], 0)

  runToCrush(st)

  assert.equal(st.enemyStore.hp[sh], st.enemyStore.maxHp[sh] - SPEC.damage,
    'takes the full crush hit because it was already standing in the zone')
  assert.equal(st.enemyStore.kvx[sh], 0, 'and is still not ejected')
}))

test('an enemy killed by the crush is handled without disturbing the others', () => crushOnly(() => {
  // Swap-removal safety (§6.6: "carefully handle enemy swap-removal during
  // group damage") — kill the FIRST candidate so a later slot gets swapped
  // down into the freed index mid-resolution.
  const g = grinder(10, 10)
  const st = makeState([g])
  const { cx, cy } = centerOf(10, 10)
  const doomed = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.GOBLIN)
  const survivor = spawnAt(st.enemyStore, cx + 8, cy, ENEMY_TYPE.TROLL)
  const survivorId = st.enemyStore.id[survivor]
  st.enemyStore.hp[doomed] = 1   // dies to the crush

  runToCrush(st)

  assert.equal(st.enemyStore.count, 1, 'the doomed enemy was removed')
  const s = [...Array(st.enemyStore.count).keys()].find(k => st.enemyStore.id[k] === survivorId)
  assert.notEqual(s, undefined, 'the survivor is still in the store')
  assert.equal(st.enemyStore.hp[s], st.enemyStore.maxHp[s] - SPEC.damage,
    'the survivor took exactly one crush hit despite the mid-resolution removal')
  assert.ok(st.enemyStore.kvx[s] > 0, 'and was still ejected')
}))

test('post-crush immunity stops the next intake from instantly recapturing an ejection', () => {
  // The immunity is only meaningful because immunityMs > crushMs — see the
  // balance-table note. If that ordering is ever broken this test is what
  // catches it: the window would lapse before the next intake even began.
  assert.ok(G.immunityMs > G.crushMs, 'immunity must outlive the crush phase to bite at all')

  const g = grinder(10, 10)
  const st = makeState([g])
  const { cx, cy } = centerOf(10, 10)
  const i = spawnAt(st.enemyStore, cx + 20, cy, ENEMY_TYPE.TROLL)   // off-center so the pull is observable

  runToCrush(st)                                  // crush resolves at intakeMs + 16
  const kvAfterEject = st.enemyStore.kvx[i]

  tickTowers(st, G.intakeMs + G.crushMs, 16)      // cycle resets to INTAKE
  tickTowers(st, G.intakeMs + G.crushMs + 16, 16) // first intake pulse of the new cycle
  assert.equal(st.enemyStore.kvx[i], kvAfterEject, 'still immune: no recapture pull applied')

  // Once immunity lapses the same enemy is eligible again.
  tickTowers(st, G.intakeMs + 16 + G.immunityMs + G.pulseMs, 16)
  assert.ok(st.enemyStore.kvx[i] < kvAfterEject, 'immunity expired: pull resumes')
})

test('the cycle returns to INTAKE and can crush again', () => crushOnly(() => {
  const g = grinder(10, 10)
  const st = makeState([g])
  const { cx, cy } = centerOf(10, 10)
  // Elite troll (270 HP) survives two crushes; a plain troll's 90 HP is
  // exactly two crush hits and would die on the second, hiding the result.
  const i = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.TROLL, true)

  runToCrush(st)
  assert.equal(g.phase, GRINDER_PHASE.CRUSH)
  assert.equal(g.cycleSeq, 1)

  tickTowers(st, G.intakeMs + G.crushMs, 16)
  assert.equal(g.phase, GRINDER_PHASE.INTAKE, 'crush phase ran out into a fresh intake')
  assert.equal(g.charge, 0)

  // Second full cycle: crush lands again.
  const t2 = G.intakeMs + G.crushMs
  tickTowers(st, t2 + G.intakeMs, 16)
  tickTowers(st, t2 + G.intakeMs + 16, 16)
  assert.equal(g.cycleSeq, 2)
  assert.equal(st.enemyStore.hp[i], st.enemyStore.maxHp[i] - SPEC.damage * 2, 'crushed once per cycle')
}))

test('destruction during intake cancels the crush', () => crushOnly(() => {
  const g = grinder(10, 10)
  const st = makeState([g])
  const { cx, cy } = centerOf(10, 10)
  const i = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.TROLL)

  tickTowers(st, 0, 16)          // intake underway
  st.structures = []             // destroyed mid-intake

  tickTowers(st, G.intakeMs, 16)
  tickTowers(st, G.intakeMs + 16, 16)

  assert.equal(st.enemyStore.hp[i], st.enemyStore.maxHp[i], 'no crush without the structure to resolve it')
}))

test('intake and eject impulses are both recorded in combat instrumentation', () => {
  const g = grinder(10, 10)
  const st = makeState([g])
  st.combatStats = createCombatStats()
  const { cx, cy } = centerOf(10, 10)
  // Off-center (so the pull registers) but inside the inner zone (so the
  // crush and eject register too) — one enemy exercises all three paths.
  spawnAt(st.enemyStore, cx + 30, cy, ENEMY_TYPE.TROLL)

  tickTowers(st, 0, 16)   // one intake pulse, no crush yet
  const afterIntake = st.combatStats.byCategory.structure.displacement
  assert.ok(afterIntake > 0, 'intake pull is recorded, not discarded')

  runToCrush(st)
  assert.ok(st.combatStats.byCategory.structure.displacement > afterIntake, 'eject adds further impulse')
  assert.ok(st.combatStats.byCategory.structure.damage > 0, 'crush damage is attributed to the structure')
})

test('phase, deadline, charge and cycle sequence survive a snapshot round-trip', () => {
  const g = grinder(10, 10, 'E', 91)
  const st = makeState([g])
  const { cx, cy } = centerOf(10, 10)
  spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.TROLL)

  runToCrush(st)
  assert.equal(g.phase, GRINDER_PHASE.CRUSH)

  const netState = {
    tick: 1, placedVersion: 1, hall: { hp: 100 }, players: [],
    enemyStore: st.enemyStore, projectiles: [], fx: [], atkFx: [],
    structures: st.structures,
  }
  const wire = decodeSnapshot(encodeSnapshot(netState, -1)).structureState.find(s => s.id === 91)
  assert.equal(wire.phase, g.phase)
  assert.equal(wire.deadline, g.phaseDeadline)
  assert.equal(wire.cycle, g.cycleSeq)
})

// --- contact damage (2026-08-29) --------------------------------------------
// Continuous, time-scaled damage to anything in the INNER zone, in BOTH
// phases, independent of the crush. Added after the occupancy audit measured
// the outer pull landing only 11.3%/40.1% of what it grabs into the crush
// zone — see structureBehaviors/cycle.js's doContactDamage header.

test('an enemy standing in the inner zone takes contact damage during INTAKE, before any crush', () => {
  const g = grinder(10, 10)
  const st = makeState([g])
  const { cx, cy } = centerOf(10, 10)
  const i = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.TROLL)
  const full = st.enemyStore.maxHp[i]

  tickTowers(st, 0, 16)
  assert.equal(g.phase, GRINDER_PHASE.INTAKE, 'still in intake — no crush has resolved')
  assert.ok(st.enemyStore.hp[i] < full, 'took damage while merely standing inside')
  assert.ok(full - st.enemyStore.hp[i] < SPEC.damage, 'a tick of contact damage is far below one crush')
})

test('contact damage is time-scaled: two ticks of dt deal twice one tick', () => {
  const one = (() => {
    const g = grinder(10, 10)
    const st = makeState([g])
    const { cx, cy } = centerOf(10, 10)
    const i = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.TROLL)
    tickTowers(st, 0, 16)
    return st.enemyStore.maxHp[i] - st.enemyStore.hp[i]
  })()
  const two = (() => {
    const g = grinder(10, 10)
    const st = makeState([g])
    const { cx, cy } = centerOf(10, 10)
    const i = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.TROLL)
    tickTowers(st, 0, 32)
    return st.enemyStore.maxHp[i] - st.enemyStore.hp[i]
  })()
  assert.ok(Math.abs(two - one * 2) < 1e-9, `expected ${one * 2}, got ${two} — contact damage must scale with dt, not tick count`)
})

test('contact damage is position-gated: beyond the contact radius takes nothing', () => {
  // The boundary moved out to the suction radius when contactRadiusPx was
  // tuned (2026-08-29); the GATE is what this test is for, so it asserts at
  // whatever the configured edge actually is rather than a pinned 55.
  const g = grinder(10, 10)
  const st = makeState([g])
  const { cx, cy } = centerOf(10, 10)
  const edge = BALANCE.TOWER.GRINDER.grind.contactRadiusPx ?? SPEC.innerRadiusPx
  const inside = spawnAt(st.enemyStore, cx + edge - 10, cy, ENEMY_TYPE.TROLL)
  const outside = spawnAt(st.enemyStore, cx + edge + 20, cy, ENEMY_TYPE.TROLL)

  tickTowers(st, 0, 16)
  assert.ok(st.enemyStore.hp[inside] < st.enemyStore.maxHp[inside], 'inside the contact radius: damaged')
  assert.equal(st.enemyStore.hp[outside], st.enemyStore.maxHp[outside],
    'beyond it: untouched — contact damage is position-gated, not global')
})

test('contact damage keeps running during the CRUSH phase, on top of the crush itself', () => {
  const g = grinder(10, 10)
  const st = makeState([g])
  const { cx, cy } = centerOf(10, 10)
  // Super-heavy (elite troll = HEAVY + 1): KB_WEIGHT_SCALE 0, so neither pull
  // nor eject moves it. It stays in the inner zone across the phase boundary,
  // which is exactly the case that separates "contact damage runs in both
  // phases" from "the crush happened to fire twice".
  const i = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.TROLL, true)
  assert.equal(st.enemyStore.weight[i], 3, 'fixture really is super-heavy')
  runToCrush(st)
  const afterCrush = st.enemyStore.hp[i]
  assert.ok(afterCrush < st.enemyStore.maxHp[i], 'crush landed')

  tickTowers(st, G.intakeMs + 32, 16)   // still CRUSH: grCrushed latched, no second crush
  assert.equal(g.phase, GRINDER_PHASE.CRUSH, 'still in the crush phase')
  assert.ok(st.enemyStore.hp[i] < afterCrush, 'contact damage continued after the crush resolved')
  assert.ok(afterCrush - st.enemyStore.hp[i] < SPEC.damage, 'and it was contact damage, not a second crush')
})

test('contact damage is attributed to the structure in combat instrumentation', () => {
  const g = grinder(10, 10)
  const st = makeState([g])
  st.combatStats = createCombatStats()
  const { cx, cy } = centerOf(10, 10)
  spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.TROLL)

  tickTowers(st, 0, 16)
  assert.equal(g.phase, GRINDER_PHASE.INTAKE, 'no crush yet')
  assert.ok(st.combatStats.byCategory.structure.damage > 0, 'contact damage is attributed, not untracked')
})

test('contactDps 0 disables contact damage entirely (the pre-2026-08-29 behaviour)', () => {
  const g = grinder(10, 10)
  const st = makeState([g])
  const { cx, cy } = centerOf(10, 10)
  const i = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.TROLL)

  const saved = BALANCE.TOWER.GRINDER.grind.contactDps
  BALANCE.TOWER.GRINDER.grind.contactDps = 0
  try {
    tickTowers(st, 0, 16)
    assert.equal(st.enemyStore.hp[i], st.enemyStore.maxHp[i], 'dial at 0 must be a clean off switch')
  } finally {
    BALANCE.TOWER.GRINDER.grind.contactDps = saved
  }
})

test('contactRadiusPx is a separate dial, tuned to the full suction radius', () => {
  // Tuned 2026-08-29 from the inner zone out to the suction radius, on a
  // monotonic sweep that only became monotonic once root capture existed.
  assert.equal(BALANCE.TOWER.GRINDER.grind.contactRadiusPx, SPEC.outerRadiusPx,
    'contact damage covers the whole suction field, not just the crush zone')

  const g = grinder(10, 10)
  const st = makeState([g])
  const { cx, cy } = centerOf(10, 10)
  // 100px: inside the suction radius, well outside the crush zone (55).
  const far = spawnAt(st.enemyStore, cx + 100, cy, ENEMY_TYPE.TROLL)

  tickTowers(st, 0, 16)
  assert.ok(st.enemyStore.hp[far] < st.enemyStore.maxHp[far],
    'damaged out at suction range, not only in the crush zone')
  assert.equal(g.phase, GRINDER_PHASE.INTAKE, 'and no crush was triggered to do it')
})

test('unsetting contactRadiusPx falls back to the crush zone', () => {
  // The fallback is what makes the dial safe to sweep — an absent value must
  // mean one specific thing, not undefined behaviour.
  const g = grinder(10, 10)
  const st = makeState([g])
  const { cx, cy } = centerOf(10, 10)
  const far = spawnAt(st.enemyStore, cx + 100, cy, ENEMY_TYPE.TROLL)

  const saved = BALANCE.TOWER.GRINDER.grind.contactRadiusPx
  delete BALANCE.TOWER.GRINDER.grind.contactRadiusPx
  try {
    tickTowers(st, 0, 16)
    assert.equal(st.enemyStore.hp[far], st.enemyStore.maxHp[far], 'unset radius = inner zone only')
  } finally {
    BALANCE.TOWER.GRINDER.grind.contactRadiusPx = saved
  }
})

// --- root capture (2026-08-29) ----------------------------------------------
// Crossing into the SUCTION radius roots the enemy for grind.rootMs, in
// addition to the pull. The dwell-time fix the contactDps dose ladder called
// for — see structureBehaviors/cycle.js's doRootCapture header.

test('the root lands at the CORE, not out at the suction edge', () => {
  // The shipped design is "sucked to the centre, held THERE" — an enemy still
  // being drawn in must stay walkable, or it freezes where it was caught and
  // never arrives. Rooting at the edge measured harmful; see
  // docs/reviews/2026-08-29-grinder-root-position.md.
  const g = grinder(10, 10)
  const st = makeState([g])
  const { cx, cy } = centerOf(10, 10)
  const arriving = spawnAt(st.enemyStore, cx + 100, cy, ENEMY_TYPE.TROLL)   // in suction, not yet at the core
  const arrived = spawnAt(st.enemyStore, cx + 20, cy, ENEMY_TYPE.TROLL)     // at the core

  tickTowers(st, 0, 16)

  assert.equal(st.enemyStore.status[arriving].rootMs, 0, 'still being drawn in: not yet held')
  assert.ok(st.enemyStore.kvx[arriving] < 0, 'and still under suction')
  assert.ok(st.enemyStore.status[arrived].rootMs > 0, 'arrived at the core: held there')
  assert.equal(st.enemyStore.status[arrived].rootSourceId, g.id, 'and this Grinder owns the root')
})

test('an enemy beyond the suction radius is not rooted', () => {
  const g = grinder(10, 10)
  const st = makeState([g])
  const { cx, cy } = centerOf(10, 10)
  const out = spawnAt(st.enemyStore, cx + SPEC.outerRadiusPx + 20, cy, ENEMY_TYPE.TROLL)

  tickTowers(st, 0, 16)
  assert.equal(st.enemyStore.status[out].rootMs, 0, 'outside the suction radius: untouched')
})

test('the root does not block the pull — root and knockback are independent axes', () => {
  // This is the whole reason rooting at the OUTER radius works: root zeroes
  // locomotion, the intake pull is knockback, so they compose instead of
  // cancelling. If this ever inverts, the mechanic silently stops working.
  const g = grinder(10, 10)
  const st = makeState([g])
  const { cx, cy } = centerOf(10, 10)
  // Inside the root radius but off-centre, so the pull vector is non-zero.
  const i = spawnAt(st.enemyStore, cx + 40, cy, ENEMY_TYPE.TROLL)

  tickTowers(st, 0, 16)
  assert.ok(st.enemyStore.status[i].rootMs > 0, 'rooted')
  assert.ok(st.enemyStore.kvx[i] < 0, 'and still pulled toward the centre in the same tick')
})

test('one root per crossing — residency does not refresh it', () => {
  // Refreshing every tick would be a permanent lockdown for anything that
  // cannot leave the radius. Same rule areaEntry.js's Bog uses.
  const g = grinder(10, 10)
  const st = makeState([g])
  const { cx, cy } = centerOf(10, 10)
  const i = spawnAt(st.enemyStore, cx + 20, cy, ENEMY_TYPE.TROLL)   // inside the root radius

  tickTowers(st, 0, 16)
  const first = st.enemyStore.status[i].rootMs
  assert.ok(first > 0, 'fixture is actually rooted — otherwise this test is vacuous')

  // Decay a chunk of it, then tick again while still resident.
  st.enemyStore.status[i].rootMs = first - 500
  tickTowers(st, 100, 16)
  assert.ok(st.enemyStore.status[i].rootMs <= first - 500,
    'still inside: no fresh root applied on top')
})

test('the eject releases this Grinder\'s own root — held, THEN spat out', () => {
  const g = grinder(10, 10, 'E')
  const st = makeState([g])
  const { cx, cy } = centerOf(10, 10)
  const i = spawnAt(st.enemyStore, cx + 10, cy, ENEMY_TYPE.TROLL)

  tickTowers(st, 0, 16)
  assert.ok(st.enemyStore.status[i].rootMs > 0, 'rooted on the way in')

  runToCrush(st)
  assert.equal(st.enemyStore.status[i].rootMs, 0, 'released at the eject')
  assert.ok(st.enemyStore.kvx[i] > 0, 'and actually ejected')
})

test('the eject does not clear a longer root owned by another source', () => {
  // Ownership rule, same as areaEntry.js: downgrading someone else's root
  // would mean a friendly Bog or an Earth Fissure got weakened by the Grinder.
  const g = grinder(10, 10, 'E')
  const st = makeState([g])
  const { cx, cy } = centerOf(10, 10)
  const i = spawnAt(st.enemyStore, cx + 10, cy, ENEMY_TYPE.TROLL)

  tickTowers(st, 0, 16)
  // A longer root from elsewhere takes ownership.
  st.enemyStore.status[i].rootMs = 99999
  st.enemyStore.status[i].rootSourceId = 4242

  runToCrush(st)
  assert.equal(st.enemyStore.status[i].rootMs, 99999, 'another source\'s root survives the eject')
  assert.equal(st.enemyStore.status[i].rootSourceId, 4242)
})

test('rootMs 0 disables root capture entirely', () => {
  const g = grinder(10, 10)
  const st = makeState([g])
  const { cx, cy } = centerOf(10, 10)
  const i = spawnAt(st.enemyStore, cx + 100, cy, ENEMY_TYPE.TROLL)

  const saved = BALANCE.TOWER.GRINDER.grind.rootMs
  BALANCE.TOWER.GRINDER.grind.rootMs = 0
  try {
    tickTowers(st, 0, 16)
    assert.equal(st.enemyStore.status[i].rootMs, 0, 'dial at 0 must be a clean off switch')
    assert.ok(st.enemyStore.kvx[i] < 0, 'the pull still works with root disabled')
  } finally {
    BALANCE.TOWER.GRINDER.grind.rootMs = saved
  }
})

// --- suction actually converges on the centre --------------------------------
// The existing pull tests assert ONE impulse points the right way. That is not
// the same claim as "the suction gets enemies to the centre", which is the
// premise the root-at-centre design rests on, so it is tested directly here.

test('sustained suction moves an unrooted enemy measurably closer to the centre', () => {
  const g = grinder(10, 10)
  const st = makeState([g])
  const { cx, cy } = centerOf(10, 10)
  const i = spawnAt(st.enemyStore, cx + 120, cy, ENEMY_TYPE.TROLL)
  const startDist = Math.abs(st.enemyStore.x[i] - cx)

  // Root off, so this measures the PULL alone rather than the pull plus a
  // frozen target. enemyMove is not run by tickTowers, so integrate the
  // knockback velocity the way the sim does: position += kv * dt.
  const saved = BALANCE.TOWER.GRINDER.grind.rootMs
  BALANCE.TOWER.GRINDER.grind.rootMs = 0
  try {
    for (let t = 0; t < 60; t++) {
      tickTowers(st, t * 16, 16)
      st.enemyStore.x[i] += st.enemyStore.kvx[i] * 0.016
      st.enemyStore.y[i] += st.enemyStore.kvy[i] * 0.016
    }
  } finally {
    BALANCE.TOWER.GRINDER.grind.rootMs = saved
  }

  const endDist = Math.abs(st.enemyStore.x[i] - cx)
  assert.ok(endDist < startDist,
    `suction must close the gap: started ${startDist.toFixed(1)}px, ended ${endDist.toFixed(1)}px`)
})

test('rootRadiusPx confines the root to the centre without touching the suction reach', () => {
  const g = grinder(10, 10)
  const st = makeState([g])
  const { cx, cy } = centerOf(10, 10)
  const far = spawnAt(st.enemyStore, cx + 120, cy, ENEMY_TYPE.TROLL)   // in suction, outside centre
  const near = spawnAt(st.enemyStore, cx + 10, cy, ENEMY_TYPE.TROLL)   // at the centre

  const saved = BALANCE.TOWER.GRINDER.grind.rootRadiusPx
  BALANCE.TOWER.GRINDER.grind.rootRadiusPx = SPEC.innerRadiusPx
  try {
    tickTowers(st, 0, 16)
    assert.equal(st.enemyStore.status[far].rootMs, 0, 'outside the root radius: free to keep being pulled in')
    assert.ok(st.enemyStore.kvx[far] < 0, 'and still under suction — the dial does not shrink the pull')
    assert.ok(st.enemyStore.status[near].rootMs > 0, 'arrived at the centre: held there')
  } finally {
    if (saved === undefined) delete BALANCE.TOWER.GRINDER.grind.rootRadiusPx
    else BALANCE.TOWER.GRINDER.grind.rootRadiusPx = saved
  }
})
