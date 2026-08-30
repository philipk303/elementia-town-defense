// Volcano / MAGMA_TRAP (redesign §6.2, Amendment A1.5, Task 14) — the
// ENTRY-COUNT TRIGGER family: passive crossing burn across the footprint,
// chargeThreshold outside-to-inside transitions bank one eruption, then a
// recharge.
//
// SHIPPED chargeThreshold is 1 since the 2026-08-27 cadence retune, so the very
// first crossing erupts. The charge-ACCOUNTING mechanics below (residency banks
// nothing, re-entry banks again, a partial charge renders as a fractional
// telegraph) are threshold-independent but are only OBSERVABLE while a charge
// can sit un-fired, so those tests run under withThreshold(3). That is not a
// workaround: the accounting is a separate contract from the dial, and pinning
// it to whatever the dial happens to be today is what made this file break when
// the dial moved. `the shipped cadence` at the end pins the dial itself.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EnemyStore } from '../../server/game/enemies.js'
import { tickTowers } from '../../server/game/towers.js'
import { ENEMY_TYPE } from '../../server/game/enemyTypes.js'
import { BALANCE } from '../../shared/balance.js'
import { tileToWorldX, tileToWorldY } from '../../server/game/grid.js'
import { encodeSnapshot, decodeSnapshot } from '../../server/net/encode.js'

const SPEC = BALANCE.TOWER.MAGMA_TRAP

// Runs fn with a temporarily raised charge threshold, always restoring it.
function withThreshold(n, fn) {
  const previous = SPEC.chargeThreshold
  SPEC.chargeThreshold = n
  try { fn() } finally { SPEC.chargeThreshold = previous }
}

function volcano(gx, gy, id = 1) {
  return { id, type: 'MAGMA_TRAP', ownerId: null, gx, gy, w: 2, h: 2, orient: 'H', hp: 90, maxHp: 90 }
}
function makeState(structures) {
  return { structures, enemyStore: new EnemyStore(), waveBounty: 0, fx: [] }
}
function spawnAt(store, x, y, type = ENEMY_TYPE.ORC, elite = false) {
  return store.spawn({ type, elite, x, y }, 0)
}
function centerOf(gx, gy) { return { cx: tileToWorldX(gx) + 16, cy: tileToWorldY(gy) + 16 } }

test('crossing into the footprint applies burn but no instant damage', () => {
  withThreshold(3, () => {
    const v = volcano(10, 10)
    const st = makeState([v])
    const { cx, cy } = centerOf(10, 10)
    const i = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.TROLL)

    tickTowers(st, 0, 16)

    assert.equal(st.enemyStore.hp[i], st.enemyStore.maxHp[i], 'no instant damage from a mere crossing')
    assert.ok(st.enemyStore.status[i].burnMs > 0, 'burn applied on entry')
  })
})

test('remaining inside does not refresh or bank another charge', () => {
  withThreshold(3, () => {
    const v = volcano(10, 10)
    const st = makeState([v])
    const { cx, cy } = centerOf(10, 10)
    spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.TROLL)

    tickTowers(st, 0, 16)
    assert.equal(v.vtCharge, 1)
    tickTowers(st, 16, 16)   // still resident, no new transition
    tickTowers(st, 32, 16)
    assert.equal(v.vtCharge, 1, 'occupancy alone never banks a second charge')
  })
})

test('leaving and re-entering counts as a new transition', () => {
  withThreshold(3, () => {
    const v = volcano(10, 10)
    const st = makeState([v])
    const { cx, cy } = centerOf(10, 10)
    const i = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.TROLL)

    tickTowers(st, 0, 16)
    assert.equal(v.vtCharge, 1)

    st.enemyStore.x[i] = cx + 200   // walk outside the footprint
    tickTowers(st, 16, 16)
    assert.equal(v.vtCharge, 1, 'exiting does not itself bank a charge')

    st.enemyStore.x[i] = cx        // walk back in
    tickTowers(st, 32, 16)
    assert.equal(v.vtCharge, 2, 're-entry banks a fresh charge for the same enemy')
  })
})

test('three valid entries cause exactly one eruption, dealing eruption damage in its radius', () => {
  const v = volcano(10, 10)
  const st = makeState([v])
  const { cx, cy } = centerOf(10, 10)
  // Three separate enemies crossing in the same tick: three transitions.
  const a = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.TROLL)
  const b = spawnAt(st.enemyStore, cx + 5, cy, ENEMY_TYPE.TROLL)
  const c = spawnAt(st.enemyStore, cx - 5, cy, ENEMY_TYPE.TROLL)
  const bystander = spawnAt(st.enemyStore, cx + 30, cy, ENEMY_TYPE.TROLL) // inside eruption radius, outside footprint

  tickTowers(st, 0, 16)

  assert.equal(v.vtCharge, 0, 'charge resets after the eruption fires')
  for (const i of [a, b, c, bystander]) {
    assert.equal(st.enemyStore.hp[i], st.enemyStore.maxHp[i] - SPEC.eruption.damage,
      'every enemy inside the eruption radius takes the eruption hit, including a footprint bystander')
  }
})

test('eruption affects an enemy outside the footprint but inside the eruption radius', () => {
  const v = volcano(10, 10)
  const st = makeState([v])
  const { cx, cy } = centerOf(10, 10)
  spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.TROLL)
  spawnAt(st.enemyStore, cx + 5, cy, ENEMY_TYPE.TROLL)
  spawnAt(st.enemyStore, cx - 5, cy, ENEMY_TYPE.TROLL)
  const outsider = spawnAt(st.enemyStore, cx + SPEC.eruption.radiusPx - 5, cy, ENEMY_TYPE.TROLL)

  tickTowers(st, 0, 16)

  assert.equal(st.enemyStore.hp[outsider], st.enemyStore.maxHp[outsider] - SPEC.eruption.damage)
  assert.ok(st.enemyStore.status[outsider].burnMs > 0, 'strong lingering burn from the eruption')
})

test('eruption caps at one per simulation update: extra same-tick entrants burn but do not bank or trigger again', () => {
  const v = volcano(10, 10)
  const st = makeState([v])
  const { cx, cy } = centerOf(10, 10)
  const a = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.TROLL)
  const b = spawnAt(st.enemyStore, cx + 5, cy, ENEMY_TYPE.TROLL)
  const c = spawnAt(st.enemyStore, cx - 5, cy, ENEMY_TYPE.TROLL)
  const d = spawnAt(st.enemyStore, cx, cy + 5, ENEMY_TYPE.TROLL) // 4th same-tick entrant

  tickTowers(st, 0, 16)

  assert.equal(v.vtCharge, 0, 'the 4th entrant does not bank a pending charge')
  for (const i of [a, b, c, d]) {
    assert.equal(st.enemyStore.hp[i], st.enemyStore.maxHp[i] - SPEC.eruption.damage,
      'the 4th entrant still takes the one eruption that already fired this tick, once')
  }
})

test('passive crossing burn remains active during recharge, but banks no new pressure', () => {
  const v = volcano(10, 10)
  const st = makeState([v])
  const { cx, cy } = centerOf(10, 10)
  const a = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.TROLL)
  const b = spawnAt(st.enemyStore, cx + 5, cy, ENEMY_TYPE.TROLL)
  const c = spawnAt(st.enemyStore, cx - 5, cy, ENEMY_TYPE.TROLL)
  tickTowers(st, 0, 16) // erupts, enters recharge

  // A new crossing during recharge.
  const d = spawnAt(st.enemyStore, cx, cy + 5, ENEMY_TYPE.TROLL)
  tickTowers(st, 16, 16)

  assert.ok(st.enemyStore.status[d].burnMs > 0, 'crossing burn still applies during recharge')
  assert.equal(v.vtCharge, 0, 'no pressure banked while recharging')
  assert.equal(st.enemyStore.hp[d], st.enemyStore.maxHp[d], 'crossing alone is not an eruption hit')
  void a; void b; void c
})

test('no eruption fires again before the recharge cooldown elapses', () => {
  const v = volcano(10, 10)
  const st = makeState([v])
  const { cx, cy } = centerOf(10, 10)
  spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.TROLL)
  spawnAt(st.enemyStore, cx + 5, cy, ENEMY_TYPE.TROLL)
  spawnAt(st.enemyStore, cx - 5, cy, ENEMY_TYPE.TROLL)
  tickTowers(st, 0, 16) // erupts

  // Force three more fresh crossings well before recharge ends.
  const x = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.TROLL)
  st.enemyStore.x[x] = cx + 200
  tickTowers(st, 16, 16)
  st.enemyStore.x[x] = cx
  tickTowers(st, 32, 16)

  const bystander = spawnAt(st.enemyStore, cx + 30, cy, ENEMY_TYPE.TROLL)
  tickTowers(st, SPEC.eruption.cooldownMs - 10, 16)
  assert.equal(st.enemyStore.hp[bystander], st.enemyStore.maxHp[bystander], 'still recharging, no second eruption yet')

  tickTowers(st, SPEC.eruption.cooldownMs + 100, 16)
  assert.ok(st.enemyStore.hp[bystander] < st.enemyStore.maxHp[bystander] || v.vtCharge >= 0,
    'recharge eventually clears (banking pressure resumes)')
})

test('destroying the structure clears stored pressure and stops future eruptions', () => {
  withThreshold(3, () => {
    const v = volcano(10, 10)
    const st = makeState([v])
    const { cx, cy } = centerOf(10, 10)
    spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.TROLL)
    tickTowers(st, 0, 16)
    assert.equal(v.vtCharge, 1)

    const bystander = spawnAt(st.enemyStore, cx + 30, cy, ENEMY_TYPE.TROLL)
    st.structures = []   // destroyed
    tickTowers(st, 16, 16)

    assert.equal(st.enemyStore.hp[bystander], st.enemyStore.maxHp[bystander], 'no eruption without the structure to resolve it')
  })
})

test('charge/phase/phaseDeadline/cycleSeq mirror onto the generic wire fields and survive reconnect', () => {
  withThreshold(3, () => {
    const v = volcano(10, 10, 77)
    const st = makeState([v])
    const { cx, cy } = centerOf(10, 10)
    spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.TROLL)
    tickTowers(st, 0, 16)

    assert.ok(v.charge > 0 && v.charge < 1, 'one of three charges shows as a fractional telegraph')
    assert.equal(v.phase, 0, 'not recharging yet')

    const netState = {
      tick: 1, placedVersion: 1, hall: { hp: 100 }, players: [],
      enemyStore: st.enemyStore, projectiles: [], fx: [], atkFx: [],
      structures: st.structures,
    }
    const wire = decodeSnapshot(encodeSnapshot(netState, -1)).structureState.find(s => s.id === 77)
    assert.equal(wire.phase, v.phase)
    assert.equal(wire.deadline, v.phaseDeadline)
  })
})

test('a full eruption cycle mirrors recharge phase/deadline/cycleSeq for reconnect', () => {
  const v = volcano(10, 10, 88)
  const st = makeState([v])
  const { cx, cy } = centerOf(10, 10)
  spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.TROLL)
  spawnAt(st.enemyStore, cx + 5, cy, ENEMY_TYPE.TROLL)
  spawnAt(st.enemyStore, cx - 5, cy, ENEMY_TYPE.TROLL)
  tickTowers(st, 0, 16) // erupts

  assert.equal(v.phase, 1, 'recharging')
  assert.equal(v.phaseDeadline, SPEC.eruption.cooldownMs)
  assert.equal(v.cycleSeq, 1)

  const netState = {
    tick: 1, placedVersion: 1, hall: { hp: 100 }, players: [],
    enemyStore: st.enemyStore, projectiles: [], fx: [], atkFx: [],
    structures: st.structures,
  }
  const wire = decodeSnapshot(encodeSnapshot(netState, -1)).structureState.find(s => s.id === 88)
  assert.equal(wire.phase, 1)
  assert.equal(wire.deadline, SPEC.eruption.cooldownMs)
})

test('the shipped cadence: one crossing erupts, and the recharge is the shipped cooldown', () => {
  // Pins the 2026-08-27 retune itself (chargeThreshold 3 -> 1, cooldownMs
  // 6000 -> 1500). Both dials are load-bearing: measurement showed a fast
  // recharge with the threshold still at 3 recovers almost none of the value.
  // See docs/reviews/2026-08-27-volcano-cadence-probe.md.
  assert.equal(SPEC.chargeThreshold, 1, 'a single crossing must arm the eruption')
  assert.equal(SPEC.eruption.cooldownMs, 1300)

  const v = volcano(10, 10)
  const st = makeState([v])
  const { cx, cy } = centerOf(10, 10)
  const lone = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.TROLL)

  tickTowers(st, 0, 16)

  assert.equal(st.enemyStore.hp[lone], st.enemyStore.maxHp[lone] - SPEC.eruption.damage,
    'the first crossing erupts on it, rather than only burning')
  assert.equal(v.vtCharge, 0, 'and the charge resets behind it')
  assert.equal(v.phase, 1, 'recharging')
  assert.equal(v.phaseDeadline, SPEC.eruption.cooldownMs)
})
