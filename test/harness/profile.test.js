import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aggregateWaveProfile } from './profile.js'

// A minimal per-wave record, so each test states only the field it is about.
const rec = (wave, over = {}) => ({
  wave, complete: true,
  fightTicks: 100, enemySeconds: 10,
  playerDowns: 0, playerDeaths: 0, structuresLost: 0,
  hallHpFracStart: 1, hallHpFrac: 1, hallDamage: 0,
  closestApproachPx: 400,
  ...over,
})

test('PROFILE: aggregates each wave across matches and counts how many reached it', () => {
  const p = aggregateWaveProfile([
    { waves: [rec(1, { enemySeconds: 10 }), rec(2, { enemySeconds: 30 })] },
    { waves: [rec(1, { enemySeconds: 20 })] },
  ])
  assert.deepEqual(p.waves.map(w => w.wave), [1, 2])
  assert.equal(p.waves[0].n, 2)
  assert.equal(p.waves[0].enemySeconds, 15)
  assert.equal(p.waves[1].n, 1)
  assert.equal(p.waves[1].enemySeconds, 30)
})

// The wave a run was lost, hung or tick-capped inside is a fragment of a wave.
// Averaging it in with cleared ones understates every indicator for that wave.
test('PROFILE: incomplete waves are excluded from the aggregate', () => {
  const p = aggregateWaveProfile([
    { waves: [rec(1), rec(2, { complete: false, enemySeconds: 999, structuresLost: 5 })] },
    { waves: [rec(1), rec(2, { enemySeconds: 40 })] },
  ])
  assert.equal(p.waves[1].n, 1)
  assert.equal(p.waves[1].enemySeconds, 40)
  assert.equal(p.waves[1].structuresLost, 0)
  assert.equal(p.waves[1].incomplete, 1, 'the dropped fragments must still be reported')
})

// A wave with no sampled fight tick has no approach measurement at all. Folding
// its Infinity into the mean would report the tension metric as infinite for
// the whole cell — a readout that silently loses its own resolution is the
// exact failure mode this instrument was rebuilt to stop repeating.
test('PROFILE: an unmeasured approach is skipped, not folded in as Infinity', () => {
  const p = aggregateWaveProfile([
    { waves: [rec(1, { closestApproachPx: Infinity })] },
    { waves: [rec(1, { closestApproachPx: 200 })] },
  ])
  assert.equal(p.waves[0].closestApproachPx, 200)
  assert.equal(p.waves[0].approachN, 1)
})

// "Dead" is deliberately observational: not one run in the whole cell recorded
// a player down, a lost structure or a point of hall damage. No threshold, no
// judgement call — nothing happened, provably.
test('PROFILE: a wave is dead only when NO run recorded anything happening', () => {
  const p = aggregateWaveProfile([
    { waves: [rec(1), rec(2), rec(3)] },
    { waves: [rec(1), rec(2, { structuresLost: 1 }), rec(3)] },
  ])
  assert.deepEqual(p.waves.map(w => w.dead), [true, false, true])
  assert.equal(p.deadWaves, 2)
})

test('PROFILE: a down or hall damage also disqualifies a wave from being dead', () => {
  const downs = aggregateWaveProfile([{ waves: [rec(1, { playerDowns: 1 })] }])
  const hall = aggregateWaveProfile([{ waves: [rec(1, { hallDamage: 0.01 })] }])
  assert.equal(downs.waves[0].dead, false)
  assert.equal(hall.waves[0].dead, false)
  assert.equal(downs.deadWaves, 0)
})

test('PROFILE: no completed waves yields an empty profile, not a crash', () => {
  const p = aggregateWaveProfile([{ waves: [rec(1, { complete: false })] }])
  assert.deepEqual(p.waves, [])
  assert.equal(p.deadWaves, 0)
})
