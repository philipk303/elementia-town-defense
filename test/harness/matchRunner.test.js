// The measurement instrument's own test suite (Phase 8A).
//
// If any test here fails, every number the probe prints is worthless. In
// particular: `the build phase actually runs` and `two seeds diverge` are the
// two assertions whose absence let this project reach Phase 7 on measurements
// taken through a one-bit seed and an amputated build loop.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runMatch as runMatchRaw } from './matchRunner.js'
import { BALANCE } from '../../shared/balance.js'
import { SPECIAL_TYPE_ELEMENT } from '../../shared/constants.js'
import { mulberry32 } from '../../shared/rng.js'
import { resolveGateOrder } from '../../server/game/waves.js'
import { EnemyStore, damageEnemy } from '../../server/game/enemies.js'
import { ENEMY_TYPE } from '../../server/game/enemyTypes.js'

const MAZE = { wallRow: 8, gaps: [13, 27] }

// WP3 flipped runMatch's default from the legacy overlapping site lists to the
// isolated protocol. Every literal pinned in this file was measured on the
// legacy lists, so the pins are re-anchored explicitly rather than silently
// re-measured: `legacySiting: true` here means "reproduce the historical
// instrument", and it is the ONLY thing that may use it. New measurements take
// the default. The one test that exercises the isolated protocol calls
// runMatchRaw directly.
const runMatch = o => runMatchRaw({ legacySiting: true, ...o })
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

// Task 6.5. Full 10-wave clears used to break on `wavesCleared >= maxWaves`
// the SAME tick the counter hit the cap — one tick before the phase machine
// (one transition per tick) ever reached PHASES.WON — so `won` was
// structurally always false.
//
// Seed CHANGED 2026-07-25 (walkable structures, A5 step 1): the original
// 20260802 / postGap 1 was the Task-6 smoke clear, but it cleared partly
// because the policy's free EARTH_SPECIAL was silently acting as a WALL. Once
// walkable structures stopped pushing a band onto the cost field that seed
// dropped to 9 waves. This is the intended balance consequence, not a
// regression: route-blocking is now a job you buy a Barricade for.
// Seed CHANGED AGAIN 2026-07-26: the Watchtower's range/damage cut (130->100 px,
// 6->5) dropped full clears under the default policy from 16/144 to 2/144.
// 20260812 / postGap 1 is one of the two. Win rate is no longer a usable axis on
// either maze — score only.
// Seed CHANGED AGAIN 2026-07-31 (Task 4, class-specific basic attacks):
// Earth's basic dropped 13->8 damage and Water's 11->10 (Fire rose 9->12,
// net a wash) — 20260812 no longer clears under the new per-class numbers.
// 20260834 / postGap 1 is a fresh 10/10 clear found the same way as the
// prior two seed swaps. This is the intended balance consequence of the
// redesign (Amendment A/A9: the §3 table is an initial baseline, not final),
// not a regression.
// Seed CHANGED AGAIN 2026-07-31 (Task 5, Fireball retune): cooldown 3.5s->5s,
// damage 16->12, burn 6dps->5dps, range 380->300 — Fire's contribution to the
// scripted policy's clear rate drops enough that 20260834 no longer clears.
// 20260814 / postGap 1 is a fresh 10/10 clear, found the same brute-force way
// as the prior three seed swaps. Also intended, not a regression — Wind's
// basic went from a no-op to a real attack this same task, so the net effect
// on any one seed is not obviously signed either way; only a fresh search
// tells you which side of the line a given seed lands on.
// Seed CHANGED AGAIN 2026-07-31 (Task 6, per-class attack bands): basic is
// now gated on real swing reach instead of "an enemy exists somewhere", so
// bots and the scripted human stop wasting the cooldown swinging at air —
// Fire/Wind also hold farther back (65px/100px) instead of closing to a
// universal 30px, changing how much damage each class lands before an enemy
// reaches the wall. 20260814 no longer clears; 20260843 / postGap 1 is a
// fresh 10/10 clear, found the same brute-force way as the prior four seed
// swaps. Intended, not a regression.
// Seed CHANGED AGAIN 2026-08-01 (Task 12, Wind Vortex): WIND_SPECIAL went
// from a plain nearest-target attack tower (rangePx/damage/cooldownMs) to
// the redesign's zero-damage suction/release cycle machine (spec §5.4) —
// losing its structure damage contribution is the intended trade for the
// crowd-control utility it gains. 20260843 no longer clears (9/10);
// 20260850 / postGap 1 is a fresh 10/10 clear, found the same brute-force
// way as the prior five seed swaps. Intended, not a regression.
// Seed CHANGED AGAIN 2026-08-01 (Task 14, Volcano): MAGMA_TRAP went from a
// plain nearest-target attack tower (100px range, fires every 700ms on
// anything nearby) to the redesign's ENTRY-COUNT TRIGGER (spec §6.2): weak
// per-crossing burn, a big eruption only every 3rd literal crossing of its
// own 2x2 footprint. The scripted build policy's single MAGMA_TRAP fusion
// (matchRunner.js's fuse step) sees far fewer total crossings at its one
// fixed tile than the old tower's always-live 100px catchment did — 2
// eruptions and 11 crossings across the whole 10-wave run at seed 20260850,
// down from a continuous machine gun. That is the conditional-power trade
// spec §7 names ("Volcano earns its power through eruption"), not a defect —
// confirmed via VOLCANO_DEBUG instrumentation before this seed swap.
// 20260850 no longer clears (8/10, hall falls); 20260872 / postGap 1 is a
// fresh 10/10 clear, found the same brute-force way as the prior six seed
// swaps. Intended, not a regression.
// 2026-08-02: the lane-gap steering fix + stuck watchdog (enemies.js) reshaped
// how the horde flows through a 1-tile gap, so 20260872/1 now stops at 8/10.
// Swapped to 20260809/postGap 1, a fresh 10/10 clear — then the SAME DAY's
// Firepit dps/margin/burn retune (docs/reviews/2026-08-02-firepit-dps-retune.md)
// moved the horde's damage profile again and 20260809/1 stopped clearing too.
// 20260852/postGap 0 cleared against the intermediate retuned numbers
// (Watchtower 4dmg/750ms) but stopped clearing again once Watchtower's
// damage/range were cut further (3dmg/750ms, rangePx 75 final — a rangePx 50
// attempt was tried and reverted, see the retune review §"the 50% range cut
// detour", it broke a core acceptance test outright). 20260813/postGap 1 is
// the fresh clear against final numbers, hallHpFrac 0.964 — a comfortable
// margin, unlike the last two thin-margin swaps. Same brute-force seed-swap
// convention as the eight before it.
// 20261085/postGap 1 (hallHpFrac 1.0, a perfect clear) 2026-08-02: the
// previous seed (20260813/postGap 1) stopped clearing once Task 20's Magma
// Trap retune (burn 6/2500->15/3000, eruption 50/14dps/140px->75/30dps/160px)
// changed which enemies the bigger eruption catches and when -- a downstream
// effect on this specific seed's outcome, not a defect. Same brute-force
// seed-swap convention as the nine before it.
// 20260838/postGap 1 (hallHpFrac 0.944) 2026-08-04: 20261085 stopped clearing
// when Task 20's Magma Trap retune was REVERTED to spec (burn 15/3000 back to
// 6/2500, eruption 75/30dps/160px back to 50/14dps/140px) — the retune had
// been chosen from readings now known to be an instrument artifact, see
// docs/reviews/2026-08-04-fusion-siting-confound-diagnosis.md. Same
// brute-force seed-swap convention as the ten before it. This seed is also
// the one the CC-seconds guard below uses, for the reason given there.
// -> 20260839 (2026-08-27, the Volcano cadence retune: chargeThreshold 3 -> 1,
// eruption.cooldownMs 6000 -> 1500 — see docs/reviews/2026-08-27-volcano-
// cadence-probe.md). 20260838 now clears 9. Same brute-force seed-swap
// convention as the eleven before it; 20260839 is simply the next seed that
// still wins, and 6 others in 20260801..99 do too, so a winning run is not
// scarce under the retune.
test('INSTRUMENT: a full 10-wave clear registers as a win', () => {
  const m = runMatch({ seed: 20260839, maze: MAZE, postGap: 1 })
  assert.equal(m.wavesCleared, 10)
  assert.equal(m.won, true)
  assert.equal(m.lost, false)
  assert.equal(m.stoppedEarly, false)
})

// --- per-wave difficulty profile -------------------------------------------
//
// The score is purely TERMINAL (wavesCleared + hallHpFrac), so the difficulty
// CURVE is invisible by construction: a run that is empty for four waves and a
// run that is tense throughout score identically if they end the same way. The
// waves-1-4 dead zone was found as a side effect, not because anything measured
// for it. These tests pin the per-wave record down.

test('INSTRUMENT: the profile has one record per wave played', () => {
  const m = short(20260801)
  assert.equal(m.waves.length, 2, 'a 2-wave run must emit 2 per-wave records')
  assert.deepEqual(m.waves.map(w => w.wave), [1, 2])
})

test('INSTRUMENT: per-wave totals reconcile with the run totals', () => {
  const m = short(20260801)
  const sum = k => m.waves.reduce((a, w) => a + w[k], 0)
  assert.equal(sum('fightTicks'), m.fightTicks, 'fight ticks must be fully attributed to waves')
  assert.equal(sum('playerDowns'), m.playerDowns)
  assert.equal(sum('playerDeaths'), m.playerDeaths)
  assert.ok(Math.abs(sum('enemySeconds') - m.enemySeconds) < 1e-6)
  assert.equal(m.waves.at(-1).hallHpFrac, m.hallHpFrac, 'the last record ends where the run ends')
})

// The tension metric. Hall HP cannot tell "something nearly got through" from
// "nothing crossed the wall line" — through wave 4 it is flat at 1.000 in every
// scenario measured, so it is the WORST early signal and currently the only one
// scored on. Closest approach is finite whether or not the hall was ever hit.
test('INSTRUMENT: closest enemy approach is recorded for every wave', () => {
  const m = short(20260801)
  for (const w of m.waves) {
    assert.ok(Number.isFinite(w.closestApproachPx) && w.closestApproachPx > 0,
      `wave ${w.wave} closestApproachPx ${w.closestApproachPx} — expected a finite positive distance`)
  }
  assert.equal(m.waves[0].hallDamage, 0,
    'wave 1 takes no hall damage — which is exactly why approach distance has to be measured')
})

// Barricade losses are rare early (0 through wave 3 on this seed) — which is
// the point: they are a more sensitive early signal than hall HP, but only over
// enough waves to accumulate. Measured on the long run rather than a 2-wave one.
test('INSTRUMENT: structures lost are attributed to the wave that ate them', () => {
  const m = runMatch({ seed: 20260806, maze: MAZE, postGap: 0 })
  assert.ok(m.waves.reduce((a, w) => a + w.structuresLost, 0) > 0,
    'no barricade was eaten in nine waves — structure loss is not being counted')
  for (const w of m.waves) {
    assert.ok(w.structuresLost >= 0)
    if (w.fightTicks === 0) assert.equal(w.structuresLost, 0,
      `wave ${w.wave} lost structures without a fight tick — losses are misattributed`)
  }
})

// Seed 20260803 / postGap 1 kills a player during the waveEnd intermission —
// after the wave's record is closed and before the next wave's record opens.
// The first cut of the profile crashed there; the fix attributes the aftermath
// to the wave that produced it rather than dropping or reopening it.
test('INSTRUMENT: a death between waves is attributed, not a crash', () => {
  const m = runMatch({ seed: 20260803, maze: MAZE, postGap: 1 })
  assert.equal(m.waves.reduce((a, w) => a + w.playerDeaths, 0), m.playerDeaths)
  assert.equal(m.waves.reduce((a, w) => a + w.playerDowns, 0), m.playerDowns)
  assert.equal(m.waves.filter(w => w.complete).length, m.wavesCleared)
})

// Seed 20260806 / postGap 0 used to HANG here, at wave 9 on the hall-ring
// cost-field plateau; since that engine bug was fixed it loses at wave 9
// instead. The assertions below deliberately do NOT pin which of those it is:
// the claim under test is the flush INVARIANT, and pinning a terminal outcome
// would recreate exactly the fixture-bound-to-engine-behaviour problem
// documented below — any future balance change that lets this cell survive
// would turn this test red for an unrelated reason.
test('INSTRUMENT: an unfinished wave is flushed and flagged', () => {
  const m = runMatch({ seed: 20260806, maze: MAZE, postGap: 0 })
  assert.ok(m.wavesCleared > 0, 'the fixture must contain waves that DID clear')
  assert.equal(m.waves.filter(w => w.complete).length, m.wavesCleared)
  assert.equal(m.waves.at(-1).complete, m.won,
    'the last wave is complete if and only if the run cleared it')
})

// Stall detection must be tested against a GUARANTEED stall, not against
// whichever engine bug happens to exist. It was originally anchored to the
// hall-ring soft-lock; fixing that bug deleted the fixture and turned this test
// red — proof that a test whose fixture is a live defect stops being a test the
// moment the defect is fixed.
//
// The synthetic replacement makes the horde immortal and immobile through the
// live balance surface, which holds livingEnemyCount constant by construction.
// Before Task 6.5 a hung run returned wavesCleared + 1.0 with a full-HP hall:
// one of the best possible scores while actually being a hang.
test('INSTRUMENT: a genuine stall is detected and NOT scored as a win', () => {
  const speeds = BALANCE.ENEMY.SPEED_PX.slice()
  const hps = Object.keys(BALANCE.ENEMY.BASE).map(k => [k, BALANCE.ENEMY.BASE[k].hp])
  try {
    BALANCE.ENEMY.SPEED_PX.fill(0)                             // never advances
    for (const [k] of hps) BALANCE.ENEMY.BASE[k].hp = 1e9       // never dies
    const m = runMatch({ seed: 20260806, maze: MAZE, postGap: 0 })
    assert.equal(m.stalled, true, 'an immortal, immobile horde is a stall')
    assert.equal(m.won, false)
    assert.equal(m.lost, false)
    assert.equal(m.timedOut, false, 'a detected stall is distinct from a tick-cap overrun')
    assert.ok(m.ticks < 200_000,
      `stall detection should cut the run short of MAX_TICKS, got ${m.ticks} ticks`)
  } finally {
    speeds.forEach((v, i) => { BALANCE.ENEMY.SPEED_PX[i] = v })
    for (const [k, hp] of hps) BALANCE.ENEMY.BASE[k].hp = hp
  }
})

// The build policy left the game's whole element-tower system unexercised: the
// human's free wave-1 special was never claimed (EARTH_SPECIAL appeared in ZERO
// measured matches) and not one of the six combo types had ever existed in a
// measurement. Guard both, so a policy regression is caught by `npm test` rather
// than by noticing a baseline was taken on a defence nobody plays.
test('INSTRUMENT: the build policy exercises specials and fusion', () => {
  const m = runMatch({ seed: 20260801, maze: MAZE, postGap: 0 })
  assert.equal(m.freeSpecialPlaced, true, 'the FREE wave-1 special must not be left on the table')
  assert.ok(m.comboFormed, `a fusion must actually form, got ${m.comboFormed}`)
  assert.ok(!SPECIAL_TYPE_ELEMENT[m.comboFormed],
    `${m.comboFormed} is an unfused element special, not a combo`)

  const solo = runMatch({ seed: 20260801, maze: MAZE, postGap: 0, fuse: false })
  assert.equal(solo.comboFormed, null, 'fuse:false must leave the pair unfused')
  assert.equal(solo.freeSpecialPlaced, true, 'the free special is independent of fusion')
})

// The counterpart claim, and the one that matters after the fix: the shipped
// game no longer produces stalls at all. Two independent layouts, full matrix,
// 0/144 each — see docs/reviews/2026-07-25-hall-ring-softlock-fix.md. Spot-check
// the seeds that used to hang so a regression is caught by `npm test` rather
// than by a 10-minute probe run.
// --- source-tagged combat accounting (Phase 8C Task 3, first increment) ----
//
// Scope: damage/hits/kills/unique-targets for basic/ability/structure, plus
// attempts/misses/useful-activation for basic and ability (discrete
// per-cooldown casts). Structure attempts/misses, CC-seconds, cooldown
// utilization, displacement progress and peak-active-effects are the declared
// remainder of Task 3 — see the program plan checklist — and are not covered
// by these tests.

test('INSTRUMENT: damage reconciles across categories and owners', () => {
  const m = runMatch({ seed: 20260801, maze: MAZE, postGap: 0 })
  const c = m.combat
  assert.ok(c.totalDamage > 0, 'a 10-wave run must deal instrumented damage')
  const catSum = c.byCategory.basic.damage + c.byCategory.ability.damage + c.byCategory.structure.damage
  assert.ok(Math.abs(catSum - c.totalDamage) < 1e-6,
    `category damage ${catSum} must sum to totalDamage ${c.totalDamage}`)
  const ownerSum = c.byOwner.reduce((a, b) => a + b.damage, 0)
  assert.ok(Math.abs(ownerSum - c.totalDamage) < 1e-6,
    `owner damage ${ownerSum} must sum to totalDamage ${c.totalDamage}`)
  // Per-category owner sums must also reconcile — an owner bucket can never
  // leak damage into the wrong category total.
  for (const cat of ['basic', 'ability', 'structure']) {
    const bySum = c.byOwner.filter(b => b.category === cat).reduce((a, b) => a + b.damage, 0)
    assert.ok(Math.abs(bySum - c.byCategory[cat].damage) < 1e-6,
      `${cat} owner sum ${bySum} must equal category total ${c.byCategory[cat].damage}`)
  }
  // The scripted policy fights with its melee human, casts specials, and
  // builds a Watchtower — all three categories must be non-zero over 10 waves.
  assert.ok(c.byCategory.basic.damage > 0, 'no basic-attack damage recorded')
  assert.ok(c.byCategory.ability.damage > 0, 'no ability damage recorded')
  assert.ok(c.byCategory.structure.damage > 0, 'no structure damage recorded')
})

test('INSTRUMENT: per-wave damage-by-category reconciles with the run total', () => {
  const m = runMatch({ seed: 20260801, maze: MAZE, postGap: 0 })
  for (const cat of ['basic', 'ability', 'structure']) {
    const sum = m.waves.reduce((a, w) => a + w.damage[cat], 0)
    assert.ok(Math.abs(sum - m.combat.byCategory[cat].damage) < 1e-6,
      `sum of per-wave ${cat} damage ${sum} must equal the run total ${m.combat.byCategory[cat].damage}`)
  }
})

test('INSTRUMENT: basic and ability attempts reconcile with useful + misses', () => {
  const m = runMatch({ seed: 20260801, maze: MAZE, postGap: 0 })
  for (const cat of ['basic', 'ability']) {
    const b = m.combat.byCategory[cat]
    assert.ok(b.attempts > 0, `${cat} recorded no attempts over 10 waves`)
    assert.equal(b.useful + b.misses, b.attempts,
      `${cat}: useful (${b.useful}) + misses (${b.misses}) must equal attempts (${b.attempts})`)
  }
})

test('INSTRUMENT: unique targets are bounded by hits and by the enemy population', () => {
  const m = runMatch({ seed: 20260801, maze: MAZE, postGap: 0 })
  for (const cat of ['basic', 'ability', 'structure']) {
    const b = m.combat.byCategory[cat]
    assert.ok(b.targets <= b.hits, `${cat}: unique targets (${b.targets}) cannot exceed hits (${b.hits})`)
    assert.ok(b.targets > 0, `${cat} recorded no unique targets`)
  }
})

test('INSTRUMENT: deaths by class are recorded and sum to total kills', () => {
  const m = runMatch({ seed: 20260801, maze: MAZE, postGap: 0 })
  const totalKills = ['basic', 'ability', 'structure']
    .reduce((a, cat) => a + m.combat.byCategory[cat].kills, 0)
  const classSum = Object.values(m.combat.deathsByClass).reduce((a, v) => a + v, 0)
  assert.ok(totalKills > 0, 'no kills recorded over 10 waves')
  assert.equal(classSum, totalKills, 'deathsByClass must sum to total instrumented kills')
})

test('INSTRUMENT: source-tagged accounting is inert when combatStats is absent', () => {
  // Every other test in the suite (all of test/game/*) creates a raw state
  // with no combatStats — damageEnemy must behave exactly as it did before
  // Task 3: apply damage, return whether the enemy died, never throw for the
  // lack of an accounting object, and never require callers to pass meta.
  const store = new EnemyStore()
  const i = store.spawn({ type: ENEMY_TYPE.GOBLIN, elite: false, x: 0, y: 0 }, 0)
  const state = { enemyStore: store, waveBounty: 0 }   // no combatStats field at all
  const hpBefore = store.hp[i]
  let died
  assert.doesNotThrow(() => { died = damageEnemy(state, i, 1) })
  assert.equal(died, false)
  assert.equal(store.hp[0], hpBefore - 1)
})

// --- source-tagged combat accounting (Phase 8C Task 3b) --------------------
//
// CC-seconds, displacement, cooldown utilization and peak-active-effects —
// the declared remainder of Task 3. See combatStats.js's header for the
// scope caveats (CC-seconds is population-wide, displacement is an impulse
// proxy not a measured travel distance) and matchRunner.js's
// cooldownUtilization() for the utilization caveats.

// Seed swapped 2026-08-04 from the default run (20260801/postGap 0) to the
// full-clear seed above. The default run's only CC source is the EARTH human's
// Fissure, which roots and damages on the same hit; once the Magma Trap revert
// shortened that run from 8 cleared waves to 6, every enemy Fissure caught was
// dying to Fissure's own damage in the same frame, so a rooted tick was never
// counted and ccSeconds read exactly 0.00 against 119 ability hits. That is the
// same "the kill lands before the status can apply" shape as Muddy Bog's
// pulse-damage note in balance.js — a real property of a shorter, weaker run,
// not an instrument fault, so the guard moves to a run that genuinely reaches
// wave 10 rather than being weakened to accept zero.
test('INSTRUMENT: CC-seconds accrue and are bounded by enemy-seconds', () => {
  const m = runMatch({ seed: 20260838, maze: MAZE, postGap: 1 })
  assert.ok(m.combat.ccSeconds > 0, 'a 10-wave run must accrue root/freeze CC-seconds')
  // A tick can only count once toward ccSeconds per enemy, and only while
  // that enemy is alive and counted in enemySeconds — so the total can never
  // exceed the run's enemySeconds.
  assert.ok(m.combat.ccSeconds <= m.enemySeconds,
    `ccSeconds ${m.combat.ccSeconds} cannot exceed enemySeconds ${m.enemySeconds}`)
})

test('INSTRUMENT: displacement reconciles across categories and owners', () => {
  const m = runMatch({ seed: 20260801, maze: MAZE, postGap: 0 })
  const c = m.combat
  assert.ok(c.totalDisplacement > 0, 'a 10-wave run must apply instrumented knockback/pull')
  const catSum = c.byCategory.basic.displacement + c.byCategory.ability.displacement + c.byCategory.structure.displacement
  assert.ok(Math.abs(catSum - c.totalDisplacement) < 1e-6,
    `category displacement ${catSum} must sum to totalDisplacement ${c.totalDisplacement}`)
  const ownerSum = c.byOwner.reduce((a, b) => a + b.displacement, 0)
  assert.ok(Math.abs(ownerSum - c.totalDisplacement) < 1e-6,
    `owner displacement ${ownerSum} must sum to totalDisplacement ${c.totalDisplacement}`)
  // basic never displaces (melee has no knockback in slice 1); the script's
  // human casts EARTH/WATER/WIND-style specials with knockback/pull.
  assert.equal(c.byCategory.basic.displacement, 0, 'basic attacks apply no displacement')
})

test('INSTRUMENT: cooldown utilization is well-formed and never exceeds 1', () => {
  const m = runMatch({ seed: 20260801, maze: MAZE, postGap: 0 })
  assert.equal(m.cooldownUtilization.length, 8, '4 players × {basic, ability} rows')
  for (const row of m.cooldownUtilization) {
    assert.ok(row.theoreticalMax >= 0, `${row.category}:${row.ownerId} theoreticalMax must be >= 0`)
    // Allow a hair over 1.0: cooldownUtilization's own documented caveat is a
    // ~1-tick overcount on the active window near a WON/LOST tail tick.
    assert.ok(row.utilization >= 0 && row.utilization <= 1.01,
      `${row.category}:${row.ownerId} utilization ${row.utilization} must be in [0, ~1]`)
  }
  // The coverage guard moved to postGap 1 on 2026-08-27. Under the Volcano
  // cadence retune this seed's postGap-0 run is one of 5 in 80 where the lane
  // is cleared before the scripted human ever swings, so its attempt counter is
  // legitimately 0. That is a property of this one run, not a systemic loss of
  // player agency: 75 of those 80 runs still record attempts. The guard exists
  // to prove the counter is wired at all, so it needs a run that uses it.
  const swinging = runMatch({ seed: 20260801, maze: MAZE, postGap: 1 })
  const humanBasic = swinging.cooldownUtilization.find(r => r.category === 'basic' && r.ownerId === 'h0')
  assert.ok(humanBasic.attempts > 0, 'the scripted human must have basic-attack attempts')
})

test('INSTRUMENT: peak-active-effects stay under the Task 2 safety budgets', () => {
  const m = runMatch({ seed: 20260801, maze: MAZE, postGap: 0 })
  // >0, not just >=0: a broken sampler (e.g. the aoeStats/projectiles read
  // deleted or never wired up) would silently report 0 forever and pass a
  // >=0 check, hiding the exact regression this test exists to catch. The
  // fire-bot casts Fireball every FIGHT tick it can (matchRunner.js:99), so
  // peakProjectiles > 0 is guaranteed; the firepit-holding path is less
  // reliably exercised by this seed, so peakStructureEffects only gets the
  // budget check.
  assert.ok(m.peakProjectiles > 0, 'peakProjectiles must be observed, not just budgeted')
  assert.ok(m.peakStructureEffects >= 0)
  assert.ok(m.peakProjectiles < BALANCE.LIMITS.MAX_PROJECTILES,
    `peak concurrent projectiles ${m.peakProjectiles} must stay under budget ${BALANCE.LIMITS.MAX_PROJECTILES}`)
  assert.ok(m.peakStructureEffects < BALANCE.LIMITS.MAX_STRUCTURE_EFFECTS,
    `peak concurrent structure-held enemies ${m.peakStructureEffects} must stay under budget ${BALANCE.LIMITS.MAX_STRUCTURE_EFFECTS}`)
})

test('INSTRUMENT: the seeds that used to hang now resolve', () => {
  for (const [seed, postGap] of [[20260806, 0], [20260801, 1], [20260805, 1]]) {
    for (const maze of [MAZE, { wallRow: 8, gaps: [5, 35] }]) {
      const m = runMatch({ seed, maze, postGap })
      assert.equal(m.stalled, false, `seed ${seed}/${postGap} lanes ${maze.gaps} stalled`)
      assert.equal(m.timedOut, false, `seed ${seed}/${postGap} lanes ${maze.gaps} hit the tick cap`)
    }
  }
})

// The default build policy scans ELEMENTS in catalog order, so an EARTH human
// ALWAYS lands MAGMA_TRAP and four of the six fusions never appear in a
// measured match (Task 15). `fuseWith` pins the partner so a gate can exercise
// a specific fusion. Without a committed case the full 144-cell gate lives
// only in a commit message and nothing here would notice if `fuseWith` broke.
// This is a scaled-down in-tree witness of that gate, not a replacement for it.
test('INSTRUMENT: fuseWith builds the requested fusion, and the new ones resolve', () => {
  const cases = [['WIND', 'GRINDER'], ['WATER', 'MUDDY_BOG'], ['FIRE', 'MAGMA_TRAP']]
  for (const [partner, expected] of cases) {
    for (const [seed, postGap] of [[20260801, 0], [20260806, 1]]) {
      for (const maze of [MAZE, { wallRow: 8, gaps: [5, 35] }]) {
        const m = runMatch({ seed, maze, postGap, fuseWith: partner })
        assert.equal(m.comboFormed, expected,
          `fuseWith ${partner} must build ${expected}, got ${m.comboFormed} (a gate that never builds it proves nothing)`)
        assert.equal(m.stalled, false, `${expected} seed ${seed}/${postGap} lanes ${maze.gaps} stalled`)
        assert.equal(m.timedOut, false, `${expected} seed ${seed}/${postGap} lanes ${maze.gaps} hit the tick cap`)
      }
    }
  }
})

// The three fusions with no EARTH in them (Task 16). `fuseWith` cannot reach
// these at all: the policy fuses the human's own free special, so an EARTH
// human only ever produces EARTH pairs, and a "Steam Vent gate" run on
// `fuseWith: 'FIRE'` silently builds a MAGMA_TRAP. `humanElement` closes that.
test('INSTRUMENT: humanElement reaches the fusions that contain no EARTH', () => {
  const cases = [
    ['FIRE',  'WATER', 'STEAM_VENT'],
    ['FIRE',  'WIND',  'FIRESTORM'],
    ['WATER', 'WIND',  'BLIZZARD'],
  ]
  for (const [humanElement, partner, expected] of cases) {
    const m = runMatch({ seed: 20260801, maze: MAZE, postGap: 0, humanElement, fuseWith: partner })
    assert.equal(m.comboFormed, expected,
      `humanElement ${humanElement} + fuseWith ${partner} must build ${expected}, got ${m.comboFormed}`)
    assert.equal(m.stalled, false)
    assert.equal(m.timedOut, false)
  }
})

// Pinned LITERALS, not a self-comparison. Comparing runMatch({}) against
// runMatch({humanElement:'EARTH'}) would send both down the identical new code
// path and could not detect the change that actually carried risk — the free
// special's placement call gaining an explicit `{orient,dir}` where it
// previously passed no opts at all (Task 16 review, finding F5). These numbers
// were recorded from the default run and must not move unless a commit
// deliberately changes balance, in which case they are updated in the same
// commit with the reason, exactly like the pinned full-clear seed above.
test('INSTRUMENT: the default run still matches its pre-humanElement figures', () => {
  const m = runMatch({ seed: 20260801, maze: MAZE, postGap: 0 })
  assert.equal(m.comboFormed, 'MAGMA_TRAP', 'default EARTH human still fuses in catalog order')
  // score 8 -> 9 (wavesCleared 8 -> 9) with the 2026-08-02 Watchtower
  // damage/range cut (this seed's build policy buys a Watchtower on the
  // leftover purse — a weaker Watchtower means the horde survives longer,
  // and on this seed that tips one additional wave into clearing). The prior
  // two retune passes (lane-gap fix, dps/margin/burn retune) left this seed's
  // score/wavesCleared/hallHp untouched — this is the first pass in the
  // 2026-08-02 series where the OUTCOME itself moved, not just enemySeconds.
  // See docs/reviews/2026-08-02-firepit-dps-retune.md.
  //
  // 9 -> 8 (wavesCleared 9 -> 8) 2026-08-04, EARTH_SPECIAL's splashRadiusPx
  // 32->48 / cooldownMs 4000->3000 retune (docs/reviews/2026-08-04-rock-
  // trap-site-cap-fix-and-balance-tweak.md). fuseWave defaults to 4, so the
  // human's free EARTH_SPECIAL fights as a live Rock Trap for waves 1-3
  // before fusing into MAGMA_TRAP — its own combat behavior, not the
  // fusion's, drove this. This is a knife-edge seed (per the note above,
  // it already flipped once from a Watchtower change); the 72-seed
  // aggregate the retune was measured against showed a net improvement for
  // EARTH_SPECIAL, so one single seed tipping the other way is expected
  // noise, not evidence the retune is wrong.
  //
  // 8 -> 6 (wavesCleared 8 -> 6) 2026-08-04, reverting Task 20's Magma Trap
  // retune to spec (burn 15/3000 -> 6/2500, eruption 75/30dps/160px ->
  // 50/14dps/140px). MAGMA_TRAP is the default run's own fusion, so this is
  // the largest move any pass has made to this seed, and it is expected: the
  // 2026-08-02 buff was a real buff, it was just chosen from a contaminated
  // reading. See docs/reviews/2026-08-04-fusion-siting-confound-diagnosis.md.
  // 6 -> 8 (wavesCleared 6 -> 8) 2026-08-09: Marketplace became a real
  // blocking 2x2 market square to match its approved runtime art. The larger
  // seeded footprint changes this deterministic maze's pathing and combat
  // timing; this is an intended geometry change, not a balance retune.
  assert.equal(m.score, 8)
  assert.equal(m.wavesCleared, 8)
  assert.equal(m.hallHp, 0)
  // 1348.1 -> 1393.4 (lane-gap fix) -> 1425.8 (dps/margin/burn retune) ->
  // 2139.3 (Firepit dps/range retune) -> 2071.8 (2026-08-02, Task 20's Magma
  // Trap retune: burn 6/2500->15/3000, eruption 50/14dps/140px->75/30dps/
  // 160px) -> 1614.0 (2026-08-04, EARTH_SPECIAL splash/cooldown retune above
  // — the terminal outcome moved this time too, so enemySeconds moving
  // alongside wavesCleared/score is expected, not a separate finding).
  // -> 850.1 (2026-08-04, the Magma Trap revert above — the run is four waves
  // shorter, so a large enemySeconds drop is the expected companion, not a
  // separate finding).
  // -> 1653.0 (2026-08-09, the 2x2 Marketplace pathing change above).
  // -> 1481.1 (2026-08-27, the Volcano cadence retune: chargeThreshold 3 -> 1,
  // eruption.cooldownMs 6000 -> 1500). Enemies are killed sooner, so they spend
  // less time alive on the field; wavesCleared moved 7 -> 8 on this seed
  // alongside it, so the drop is the expected companion of a stronger defence,
  // not a separate finding.
  assert.ok(Math.abs(m.enemySeconds - 1481.1) < 0.5, `enemySeconds ${m.enemySeconds}`)
})

// The gate's coverage guard (Task 16 review, finding F4). `comboFormed` proves a
// vent was BUILT; it does not prove any enemy ever entered the cloud. A hang
// gate for a confusion structure that cannot show confusion fired is consistent
// with the feature never running at all. Measured across the full 288-cell gate:
// every maze-A cell confused something, and 139/144 on maze B did.
test('INSTRUMENT: a Steam Vent run actually slows enemies', () => {
  const m = runMatch({ seed: 20260801, maze: MAZE, postGap: 0, humanElement: 'FIRE', fuseWith: 'WATER' })
  assert.equal(m.comboFormed, 'STEAM_VENT')
  assert.ok(m.combat.slowedSeconds > 0,
    'the gate must be able to distinguish "no hangs" from "the vent’s status never fired"')
})

// THE TWO-INGREDIENT CONTROL (2026-08-15). Every fusion number this project has
// taken was measured against a control holding ONE ingredient, because the
// partner special is bought inside the fuse branch and nowhere else. Spec §1
// asks a fusion to "outperform their two ingredients", so that control was
// answering a different question and flattered the whole roster. See
// docs/reviews/2026-08-15-steam-vent-mechanism.md §5.
//
// The property that makes the arm a valid control is that it holds BOTH 2x1
// ingredients standing and unfused, on the same tiles the fusion would have
// occupied. If the proposal were silently accepted, this arm would be a fusion
// wearing a control's label and every delta taken against it would be zero.
test('INSTRUMENT: partnerSpecial holds both ingredients unfused', () => {
  const base = { seed: 20260801, maze: MAZE, postGap: 0, humanElement: 'FIRE' }
  const control = runMatch({ ...base, fuse: false, partnerSpecial: 'WATER' })
  const fused = runMatch({ ...base, fuse: true, fuseWith: 'WATER' })

  assert.equal(control.comboFormed, null, 'the proposal must be DECLINED, not accepted')
  assert.equal(control.partnerSpecialPlaced, true, 'the partner must actually be bought')
  assert.equal(fused.comboFormed, 'STEAM_VENT', 'the paired fusion arm must still fuse')

  // Same anchor and same partner tile in both arms: the contrast has to be
  // fused-vs-unfused, never a placement difference wearing that label.
  assert.deepEqual(control.freeSpecialAt, fused.freeSpecialAt)
  assert.deepEqual(control.partnerPlacedAt, fused.partnerPlacedAt)

  // The control keeps two separate 2x1 specials; the fusion arm has one 2x2.
  const roles = control.placements.map(p => p.role)
  assert.ok(roles.includes('freeSpecial') && roles.includes('partnerSpecial'),
    `control must record both ingredients, got ${JSON.stringify(roles)}`)
  assert.ok(!roles.includes('fusion'), 'control must not record a fusion placement')
})

// The latch. `comboFormed` used to be what stopped the fuse branch re-running,
// and it stays null forever in the decline path — so without its own latch the
// control would re-buy the partner every wave once enemies destroyed it, giving
// the control a rebuild the fusion arm cannot have.
test('INSTRUMENT: partnerSpecial is bought exactly once', () => {
  const m = runMatch({
    seed: 20260801, maze: MAZE, postGap: 0,
    humanElement: 'FIRE', fuse: false, partnerSpecial: 'WATER',
  })
  const bought = m.placements.filter(p => p.role === "partnerSpecial")
  assert.equal(bought.length, 1, `partner bought ${bought.length} times, expected exactly 1`)
})

// THE ISOLATED SITING PROTOCOL'S ONE INVARIANT (2026-08-04).
//
// Every maze-A fusion number this harness ever produced was contaminated
// because the 2-wide free special and the 1x1 blocking Watchtower competed for
// the same tiles: whichever tile the special took, the Watchtower fell back to
// a different one, and on maze A that fallback alone was worth up to ~1.2 score
// points — larger than the effects being measured. Worse, the arms were not
// even equal to each other: a 2x1 control special blocks one towerSite, a 2x2
// fusion blocks two. See docs/reviews/2026-08-04-fusion-siting-confound-
// diagnosis.md.
//
// `sitingProtocol: 'isolated'` fixes that with disjoint column bands. This
// pins the property the whole fix rests on: no structure the scripted human
// places can ever touch the Watchtower's pinned column, in ANY arm. If this
// fails, the re-taken sweep is measuring tower placement again and nobody will
// notice from the scores.
test('INSTRUMENT: the isolated siting protocol keeps specials off the Watchtower column', () => {
  for (const maze of [{ wallRow: 8, gaps: [13, 27] }, { wallRow: 8, gaps: [5, 35] }]) {
    const towerCols = new Set(maze.gaps.map(g => g - 1))
    const arms = [
      { fuse: false },
      { fuse: true, fuseWave: 4, fuseWith: 'WIND', specialSiting: 'flank' },
      { fuse: true, fuseWave: 4, fuseWith: 'WIND', specialSiting: 'funnel' },
    ]
    for (const arm of arms) {
      let seen = 0
      runMatchRaw({
        seed: 20260801, maze, postGap: 0, humanElement: 'WATER', ...arm,
        onEnd: (state) => {
          const human = state.players.find(p => !p.isBot)
          for (const s of state.structures) {
            const cols = []
            for (let dx = 0; dx < (s.w ?? 1); dx++) cols.push(s.gx + dx)
            if (s.type === 'WATCHTOWER') {
              seen++
              assert.ok(towerCols.has(s.gx),
                `Watchtower at col ${s.gx}, expected one of ${[...towerCols]}`)
            } else if (s.ownerId === human.id && s.gy > maze.wallRow) {
              // Barricades sit ON the wall row, never in the tower band below
              // it, so they cannot collide with a Watchtower site.
              for (const c of cols) {
                assert.ok(!towerCols.has(c),
                  `${s.type} occupies col ${c}, which is a pinned Watchtower column`)
              }
            }
          }
        },
      })
      assert.ok(seen > 0, 'the arm must actually build Watchtowers for this to prove anything')
    }
  }
})

// --- build policy selection --------------------------------------------------
//
// WP5's cross-policy gate ("no verdict ships unless it holds under BOTH build
// policies") is NOT yet satisfied: only `scripted-v1` exists. A `competent-v1`
// was built and reverted on 2026-08-15 because both of its differences were
// siting differences, which provably cannot diverge in the 12-site isolated
// pool — see docs/reviews/2026-08-15-wp5-competent-v1-review.md for the
// mechanism and for the levers that can (structure mix, purchase timing,
// ability usage).
//
// What survives is the guard below. It is the piece that has to exist FIRST:
// when a second policy is added, an unknown or typo'd `buildPolicy` must fail
// loudly rather than silently running scripted-v1 while the corpus metadata
// claims otherwise — which would make the gate decorative in the one direction
// nobody would think to check.
test('an unknown buildPolicy is rejected, not silently run as scripted-v1', () => {
  assert.throws(() => runMatchRaw({ seed: 20260801, maze: MAZE, buildPolicy: 'bogus-v9' }),
    /buildPolicy/)
})
