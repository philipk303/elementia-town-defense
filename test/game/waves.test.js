import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mulberry32 } from '../../shared/rng.js'
import { BALANCE } from '../../shared/balance.js'
import { ENEMY_TYPE } from '../../server/game/enemyTypes.js'
import {
  resolveGateOrder, openGatesForWave, nextGateToOpen, buildSpawnSchedule,
} from '../../server/game/waves.js'

function compTotal(comp) {
  return Object.values(comp).reduce((a, b) => a + b, 0)
}

// --- gate order RNG ----------------------------------------------------------

test('gate order assigns SIDE_A/SIDE_B to the two physical sides, never the same', () => {
  for (let seed = 0; seed < 50; seed++) {
    const order = resolveGateOrder(mulberry32(seed))
    assert.ok(['LEFT', 'RIGHT'].includes(order.SIDE_A))
    assert.ok(['LEFT', 'RIGHT'].includes(order.SIDE_B))
    assert.notEqual(order.SIDE_A, order.SIDE_B, 'the two side gates must be different tiles')
  }
})

test('gate order is deterministic for a given seed', () => {
  assert.deepEqual(resolveGateOrder(mulberry32(7)), resolveGateOrder(mulberry32(7)))
})

test('both side-orderings are reachable across seeds (RNG actually branches)', () => {
  const seen = new Set()
  for (let seed = 0; seed < 50; seed++) seen.add(resolveGateOrder(mulberry32(seed)).SIDE_A)
  assert.equal(seen.size, 2, 'SIDE_A lands on both LEFT and RIGHT across seeds')
})

// --- open gates per wave (spec §4: gates at 1 / 4 / 7) -----------------------

test('open gates grow at waves 1 / 4 / 7', () => {
  const order = { SIDE_A: 'LEFT', SIDE_B: 'RIGHT' }
  for (const w of [1, 2, 3]) assert.deepEqual(openGatesForWave(w, order), ['CENTER'])
  for (const w of [4, 5, 6]) assert.deepEqual(openGatesForWave(w, order), ['CENTER', 'LEFT'])
  for (const w of [7, 8, 9, 10]) assert.deepEqual(openGatesForWave(w, order), ['CENTER', 'LEFT', 'RIGHT'])
})

test('open gates honor the resolved side order', () => {
  const order = { SIDE_A: 'RIGHT', SIDE_B: 'LEFT' }
  assert.deepEqual(openGatesForWave(4, order), ['CENTER', 'RIGHT'])
  assert.deepEqual(openGatesForWave(7, order), ['CENTER', 'RIGHT', 'LEFT'])
})

// --- telegraph (spec §4: next gate telegraphed one wave in advance) ----------

test('telegraph names the physical gate opening the following wave', () => {
  const order = { SIDE_A: 'LEFT', SIDE_B: 'RIGHT' }
  assert.equal(nextGateToOpen(3, order), 'LEFT')   // build of wave 3 → SIDE_A opens wave 4
  assert.equal(nextGateToOpen(6, order), 'RIGHT')  // build of wave 6 → SIDE_B opens wave 7
})

test('telegraph is null on waves with no gate opening next', () => {
  const order = { SIDE_A: 'LEFT', SIDE_B: 'RIGHT' }
  for (const w of [1, 2, 4, 5, 7, 8, 9, 10]) assert.equal(nextGateToOpen(w, order), null)
})

// --- spawn schedule ----------------------------------------------------------

test('schedule spawns exactly the wave composition (count and types)', () => {
  const order = { SIDE_A: 'LEFT', SIDE_B: 'RIGHT' }
  for (const w of BALANCE.WAVES) {
    const sched = buildSpawnSchedule(w.wave, order)
    assert.equal(sched.length, compTotal(w.comp), `wave ${w.wave} total`)

    const count = { goblin: 0, orc: 0, troll: 0, eliteGoblin: 0, eliteOrc: 0, eliteTroll: 0 }
    for (const s of sched) {
      const base = s.type === ENEMY_TYPE.GOBLIN ? 'goblin' : s.type === ENEMY_TYPE.ORC ? 'orc' : 'troll'
      count[(s.elite ? 'elite' + base[0].toUpperCase() + base.slice(1) : base)]++
    }
    for (const key of Object.keys(w.comp)) {
      assert.equal(count[key], w.comp[key], `wave ${w.wave} ${key}`)
    }
  }
})

test('wave 1 spawns only from CENTER; wave 10 uses all three gates', () => {
  const order = { SIDE_A: 'LEFT', SIDE_B: 'RIGHT' }
  const g1 = new Set(buildSpawnSchedule(1, order).map(s => s.gate))
  assert.deepEqual([...g1], ['CENTER'])
  const g10 = new Set(buildSpawnSchedule(10, order).map(s => s.gate))
  assert.deepEqual([...g10].sort(), ['CENTER', 'LEFT', 'RIGHT'])
})

test('schedule is sorted by spawn time, all times finite and non-negative', () => {
  const order = { SIDE_A: 'LEFT', SIDE_B: 'RIGHT' }
  const sched = buildSpawnSchedule(9, order)
  let prev = -1
  for (const s of sched) {
    assert.ok(Number.isFinite(s.atMs) && s.atMs >= 0)
    assert.ok(s.atMs >= prev, 'schedule must be time-ordered')
    prev = s.atMs
  }
})

test('elites lead the horde — the earliest elite spawns no later than any regular', () => {
  const order = { SIDE_A: 'LEFT', SIDE_B: 'RIGHT' }
  const sched = buildSpawnSchedule(10, order)
  const firstElite = Math.min(...sched.filter(s => s.elite).map(s => s.atMs))
  const firstBase  = Math.min(...sched.filter(s => !s.elite).map(s => s.atMs))
  assert.ok(firstElite <= firstBase, 'an elite is at the front of the wave')
})

test('elite introductions teach a counterable elite first (CP2 designer H1)', () => {
  // The first elite the player meets should be one they can answer. The Elite
  // Troll is rootable/freezable (towers can counter it); the Elite Orc is the
  // "no clean counter" unit and must not lead the introductions.
  const firstWaveWith = key => (BALANCE.WAVES.find(w => w.comp[key])?.wave ?? Infinity)
  const troll = firstWaveWith('eliteTroll')
  const orc   = firstWaveWith('eliteOrc')
  const gob   = firstWaveWith('eliteGoblin')
  assert.ok(Number.isFinite(troll), 'the Elite Troll appears somewhere in the run')
  assert.ok(troll < orc, 'the counterable Elite Troll precedes the no-counter Elite Orc')
  assert.ok(troll <= gob, 'a counterable elite leads the elite introductions')
})

test('a wave with no gate open state still spawns from CENTER (wave 2/3)', () => {
  const order = { SIDE_A: 'LEFT', SIDE_B: 'RIGHT' }
  assert.ok(buildSpawnSchedule(2, order).every(s => s.gate === 'CENTER'))
})

// --- spawn jitter (Phase 8A: seeded per-spawn entropy) -----------------------

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
