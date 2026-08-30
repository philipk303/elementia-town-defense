// Muddy Bog / MUDDY_BOG (redesign §6.4, Amendment A2.2, Task 15) — the
// PERSISTENT AREA STATUS family: one weight-scaled root per crossing, fixed
// damage pulses while standing in the footprint (2026-08-28 decouple:
// gated on presence, NOT root ownership), lingering slow on natural expiry.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EnemyStore } from '../../server/game/enemies.js'
import { tickTowers } from '../../server/game/towers.js'
import { destroyStructure } from '../../server/game/structures.js'
import { ENEMY_TYPE } from '../../server/game/enemyTypes.js'
import { BALANCE } from '../../shared/balance.js'
import { tileToWorldX, tileToWorldY } from '../../server/game/grid.js'
import { tickStatus, applyRoot } from '../../server/game/status.js'

const SPEC = BALANCE.TOWER.MUDDY_BOG

// The 2026-08-28 fusion-worth retune raised pulse damage 3 -> 12, and the
// 2026-08-28 mechanic decouple (docs/reviews/2026-08-28-muddy-bog-decouple.md)
// raised it again to 28, well past a goblin's 12 hp: the basic enemy now dies
// to the first pulse. The ROOT mechanics below (duration scales with weight,
// re-entry starts a fresh cycle, bogs track crossings independently,
// destruction releases the root) are damage-independent contracts, but they
// are only OBSERVABLE while the test subject survives long enough to be
// observed. They run at the historic damage for that reason. `pulse damage`
// itself is pinned by the retune test at the end of this file. NOTE: damage
// pulses no longer stop when root ends -- see the areaEntry.js header and the
// "damage pulses continue after..." test below; this file's mechanics list
// above intentionally omits that claim now.
function withHistoricDamage(fn) {
  const previous = SPEC.pulse.damage
  SPEC.pulse.damage = 3
  try { fn() } finally { SPEC.pulse.damage = previous }
}

function bog(gx, gy, id = 1) {
  return { id, type: 'MUDDY_BOG', ownerId: null, gx, gy, w: 2, h: 2, orient: 'H', hp: 90, maxHp: 90 }
}
function makeState(structures) {
  return { structures, enemyStore: new EnemyStore(), waveBounty: 0, now: 0, fx: [] }
}
function spawnAt(store, x, y, type = ENEMY_TYPE.ORC, elite = false) {
  return store.spawn({ type, elite, x, y }, 0)
}
function centerOf(gx, gy) { return { cx: tileToWorldX(gx) + 16, cy: tileToWorldY(gy) + 16 } }

// tickTowers alone never advances status timers (that's tickEnemies' job in
// the real loop, which needs a costField/players/hall this suite doesn't set
// up) — so tests that need root/slow to actually count down decay the store's
// statuses directly, exactly like the real per-tick decrement. Runs off `st.now`
// so every call advances a single consistent clock, matching the real loop's
// "now increases by dt each tick" invariant that tickAreaEntry's absolute
// deadline comparisons rely on.
function step(st, dtMs) {
  st.now += dtMs
  tickTowers(st, st.now, dtMs)
  for (let i = 0; i < st.enemyStore.count; i++) tickStatus(st.enemyStore.status[i], dtMs)
}

// Runs `step` in fixed 16ms slices until at least totalMs has elapsed, so a
// long wait (e.g. "past root expiry") still decays status in realistic
// increments rather than one artificial giant dt.
function advance(st, totalMs, sliceMs = 16) {
  let remaining = totalMs
  while (remaining > 0) {
    const dt = Math.min(sliceMs, remaining)
    step(st, dt)
    remaining -= dt
  }
}

test('crossing into the footprint roots the enemy for its weight tier', () => {
  // Wrapped: at the shipped damage (28, > goblin hp 12) the entry-tick pulse
  // now kills the goblin outright, and reading `status[goblin]` after a
  // swap-remove reads a stale pooled object -- passing by accident rather
  // than by assertion. Gate 6-review-adjacent finding, 2026-08-28 decouple review.
  withHistoricDamage(() => {
    const b = bog(10, 10)
    const st = makeState([b])
    const { cx, cy } = centerOf(10, 10)
    const goblin = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.GOBLIN)   // LIGHT

    step(st, 16)

    assert.equal(st.enemyStore.count, 1, 'the goblin survives the entry pulse at historic damage')
    assert.ok(st.enemyStore.status[goblin].rootMs > 0, 'root applied on entry')
    assert.equal(st.enemyStore.status[goblin].rootSourceId, b.id)
  })
})

test('heavier enemies remain rooted longer than lighter enemies', () => {
  withHistoricDamage(() => {
    const b = bog(10, 10)
    const st = makeState([b])
    const { cx, cy } = centerOf(10, 10)
    const goblin = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.GOBLIN, false)   // LIGHT, FAST
    const troll = spawnAt(st.enemyStore, cx + 3, cy, ENEMY_TYPE.TROLL, false) // HEAVY, SLOW

    step(st, 16)

    assert.ok(st.enemyStore.status[troll].rootMs > st.enemyStore.status[goblin].rootMs,
      'heavy root outlasts light root')
  })
})

test('damage pulses continue after the Bog root ends, as long as the enemy stays in the footprint', () => {
  // 2026-08-28 decouple (docs/handoffs/2026-08-28-muddy-bog-decouple.md): damage
  // used to be gated on root ownership, which made total damage = root uptime x
  // tick damage, saturating on both factors. Damage is now gated on footprint
  // PRESENCE only; root is pure crowd control.
  withHistoricDamage(() => {
    const b = bog(10, 10)
    const st = makeState([b])
    const { cx, cy } = centerOf(10, 10)
    const goblin = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.GOBLIN)

    step(st, 16)   // crossing: root applied, first pulse fires immediately
    const hpAfterEntry = st.enemyStore.hp[goblin]
    assert.ok(hpAfterEntry < st.enemyStore.maxHp[goblin], 'a pulse landed on the rooting tick')

    // Run well past root expiry; the enemy never left the footprint, so pulses
    // must keep landing regardless of root state.
    const rootMsRemaining = st.enemyStore.status[goblin].rootMs
    advance(st, rootMsRemaining)
    assert.equal(st.enemyStore.status[goblin].rootMs, 0, 'root has expired')
    const hpAtExpiry = st.enemyStore.hp[goblin]
    advance(st, SPEC.pulse.ms * 5)
    assert.ok(st.enemyStore.hp[goblin] < hpAtExpiry, 'pulses keep landing after root expiry, gated on footprint presence')
  })
})

test('leaving the footprint stops pulses even while the root is still active', () => {
  // The flip side of the above: damage is gated on presence, not root, so
  // walking out (without being knocked out) must stop pulses just as fast.
  withHistoricDamage(() => {
    const b = bog(10, 10)
    const st = makeState([b])
    const { cx, cy } = centerOf(10, 10)
    const goblin = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.GOBLIN)

    step(st, 16)
    assert.ok(st.enemyStore.status[goblin].rootMs > 0, 'rooted')

    st.enemyStore.x[goblin] = cx + 200   // walk outside the footprint, root still running
    step(st, 16)
    assert.ok(st.enemyStore.status[goblin].rootMs > 0, 'still rooted -- root is independent of position')
    const hpJustOutside = st.enemyStore.hp[goblin]
    advance(st, SPEC.pulse.ms * 3)
    assert.equal(st.enemyStore.hp[goblin], hpJustOutside, 'no pulses land once outside the footprint')
  })
})

test('root does not refresh while the enemy remains inside', () => {
  const b = bog(10, 10)
  const st = makeState([b])
  const { cx, cy } = centerOf(10, 10)
  const goblin = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.GOBLIN)

  step(st, 16)
  const rootAfterEntry = st.enemyStore.status[goblin].rootMs

  step(st, 16)
  const rootNextTick = st.enemyStore.status[goblin].rootMs
  assert.ok(rootNextTick <= rootAfterEntry, 'still-resident enemy only counts down, never refreshes')
})

test('leaving and re-entering starts a new root cycle', () => {
  withHistoricDamage(() => {
    const b = bog(10, 10)
    const st = makeState([b])
    const { cx, cy } = centerOf(10, 10)
    const goblin = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.GOBLIN)
    const rootMs = SPEC.root.msByWeight[0]

    step(st, 16)
    // Let the root fully expire and pick up the lingering slow.
    advance(st, rootMs)
    assert.equal(st.enemyStore.status[goblin].rootMs, 0)
    assert.ok(st.enemyStore.status[goblin].slowMs > 0, 'lingering slow applied on natural expiry')

    st.enemyStore.x[goblin] = cx + 200   // walk outside the footprint
    step(st, 16)
    st.enemyStore.x[goblin] = cx         // walk back in
    step(st, 16)

    assert.ok(st.enemyStore.status[goblin].rootMs > 0, 're-entry starts a fresh root cycle')
    assert.equal(st.enemyStore.status[goblin].rootSourceId, b.id)
  })
})

test('multiple Bogs track crossings independently', () => {
  withHistoricDamage(() => {
    const b1 = bog(10, 10, 1)
    const b2 = bog(20, 10, 2)
    const st = makeState([b1, b2])
    const c1 = centerOf(10, 10)
    const c2 = centerOf(20, 10)
    const a = spawnAt(st.enemyStore, c1.cx, c1.cy, ENEMY_TYPE.GOBLIN)
    const b = spawnAt(st.enemyStore, c2.cx, c2.cy, ENEMY_TYPE.GOBLIN)

    step(st, 16)

    assert.equal(st.enemyStore.status[a].rootSourceId, 1)
    assert.equal(st.enemyStore.status[b].rootSourceId, 2)
  })
})

test('a rooted enemy displaced out of the footprint stops taking pulses', () => {
  // Gate 6 review, HIGH finding. Root and displacement are INDEPENDENT axes
  // (status.js header): root zeroes locomotion but NOT knockback velocity, so
  // a Geyser/Vortex/Grinder can shove a rooted enemy clean out of the mud.
  // The pulse loop originally had no position gate and kept damaging it at
  // unbounded range.
  const b = bog(10, 10)
  const st = makeState([b])
  const { cx, cy } = centerOf(10, 10)
  const troll = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.TROLL)

  step(st, 16)
  assert.ok(st.enemyStore.status[troll].rootMs > 0, 'rooted')

  st.enemyStore.x[troll] = cx + 600        // knocked far away, still rooted
  const hpWhenLaunched = st.enemyStore.hp[troll]
  advance(st, SPEC.pulse.ms * 3)

  assert.ok(st.enemyStore.status[troll].rootMs > 0, 'still rooted — the root outlives the displacement')
  assert.equal(st.enemyStore.hp[troll], hpWhenLaunched, 'but takes no pulses 600px outside the footprint')
})

test('a displaced enemy resumes taking pulses immediately on re-entry', () => {
  const b = bog(10, 10)
  const st = makeState([b])
  const { cx, cy } = centerOf(10, 10)
  const troll = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.TROLL)

  step(st, 16)
  st.enemyStore.x[troll] = cx + 600
  advance(st, SPEC.pulse.ms * 2)
  const hpOutside = st.enemyStore.hp[troll]

  st.enemyStore.x[troll] = cx              // dragged back in, root still running
  step(st, 16)

  assert.ok(st.enemyStore.hp[troll] < hpOutside,
    're-entry re-arms the pulse clock from `now` (bgPulse is deleted on exit and re-added ' +
    'on the next fresh crossing), so damage resumes at once -- same observable effect as the ' +
    'old "clock frozen while outside" design, different mechanism')
})

test('a longer root from another source takes ownership, still pays the lingering slow, AND the enemy still takes this Bog\'s damage while standing in its footprint', () => {
  // Gate 6 review, MEDIUM finding, extended by the 2026-08-28 decouple review
  // (HIGH/MEDIUM findings): ownership moves on any strictly-longer root
  // (status.js applyRoot), and dropping the lingering-slow cycle silently
  // meant an Earth player casting Fissure into a friendly Bog cancelled it.
  // Decoupling damage from root ownership means this Bog keeps damaging the
  // enemy even after a foreign, longer root takes over ownership -- a real,
  // intended behaviour change (areaEntry.js header) that had NO test before
  // this one: damage is gated on footprint presence only, never on which
  // source currently owns the root.
  withHistoricDamage(() => {
    const b = bog(10, 10)
    const st = makeState([b])
    const { cx, cy } = centerOf(10, 10)
    const troll = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.TROLL)

    step(st, 16)
    assert.equal(st.enemyStore.status[troll].rootSourceId, b.id)
    const hpAfterEntry = st.enemyStore.hp[troll]

    // A foreign, longer root lands (sourceId defaults to NO_ROOT_SOURCE).
    applyRoot(st.enemyStore.status[troll], 9000, st.enemyStore.speed[troll])
    assert.notEqual(st.enemyStore.status[troll].rootSourceId, b.id, 'ownership moved')

    advance(st, SPEC.pulse.ms * 3)   // still standing in the footprint the whole time

    assert.ok(st.enemyStore.status[troll].slowMs > 0,
      'the Bog paid out its lingering slow when its cycle was superseded')
    assert.ok(st.enemyStore.hp[troll] < hpAfterEntry,
      'the Bog keeps damaging it via footprint presence even though it no longer owns the root')
  })
})

test('a root-immune elite still takes Bog damage from standing in the footprint', () => {
  // 2026-08-28 decouple review, HIGH finding: SUPER_FAST enemies (elite
  // Goblins -- enemyTypes.js's slowRootImmune) are immune to ROOT, so
  // applyRoot is a no-op and they never entered the OLD bgRooted map -- under
  // the pre-decouple gating they took literally zero Bog damage. Damage is
  // now gated on footprint presence, which root immunity says nothing about,
  // so an elite Goblin standing in the mud DOES take pulses despite never
  // being rooted. This was a real, unnamed behaviour change with no test
  // before this one.
  withHistoricDamage(() => {
    const b = bog(10, 10)
    const st = makeState([b])
    const { cx, cy } = centerOf(10, 10)
    const eliteGoblin = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.GOBLIN, true)

    step(st, 16)

    assert.equal(st.enemyStore.status[eliteGoblin].rootMs, 0, 'elite Goblin is root-immune, as expected')
    assert.ok(st.enemyStore.hp[eliteGoblin] < st.enemyStore.maxHp[eliteGoblin],
      'but still takes the entry-tick pulse -- damage is gated on the footprint, not on root ownership')
  })
})

test('destroying the Bog ends its owned root immediately', () => {
  withHistoricDamage(() => {
    const b = bog(10, 10)
    const st = makeState([b])
    const { cx, cy } = centerOf(10, 10)
    const goblin = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.GOBLIN)

    step(st, 16)
    assert.ok(st.enemyStore.status[goblin].rootMs > 0)

    destroyStructure(st, b)

    assert.equal(st.enemyStore.status[goblin].rootMs, 0, 'root ends immediately on destruction')
  })
})

test('destroying the Bog does not touch an already-applied lingering slow', () => {
  withHistoricDamage(() => {
    const b = bog(10, 10)
    const st = makeState([b])
    const { cx, cy } = centerOf(10, 10)
    const goblin = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.GOBLIN)
    const rootMs = SPEC.root.msByWeight[0]

    step(st, 16)
    advance(st, rootMs)   // root expires naturally, lingering slow applied
    const slowMsBefore = st.enemyStore.status[goblin].slowMs
    assert.ok(slowMsBefore > 0)

    destroyStructure(st, b)

    assert.equal(st.enemyStore.status[goblin].slowMs, slowMsBefore, 'lingering slow untouched by destruction')
  })
})

test('the 2026-08-28 decouple retune values are the shipped ones', () => {
  // pulse damage 12 -> 28, ridden alongside the root/damage decoupling in
  // areaEntry.js (docs/reviews/2026-08-28-muddy-bog-decouple.md). 28 is well
  // past GOBLIN hp (12) -- the basic enemy dies to the first pulse even more
  // certainly than before -- recorded here so it cannot drift back unnoticed.
  // Root is unchanged: scaling it was measured pre-decouple and did not help.
  assert.equal(SPEC.pulse.damage, 28)
  assert.deepEqual(SPEC.root.msByWeight, [600, 1200, 1800, 2400])
})
