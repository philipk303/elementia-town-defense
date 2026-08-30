// Firestorm (redesign §6.3, Amendment C.1, Task 14; converted to real
// projectiles 2026-08-04 per docs/plans/2026-08-04-firestorm-projectile-
// conversion-spec.md Phase 1) — eight real, untargeted FIRESTORM_BOLT
// projectiles fired on a rotating fan, instead of one authoritative
// instantaneous AoE resolution. A bolt can MISS; only the in-range gate that
// decides whether the volley fires at all is guaranteed.
//
// Because bolts now fly, tests use `createGameState` (the real state
// factory — spawnProjectile needs state.projectiles/fx/nextProjectileId) and
// a `resolveBolts` helper that ticks projectile flight forward until every
// bolt from the volley has detonated or a generous tick budget is exhausted.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ELEMENTS } from '../../shared/constants.js'
import { createGameState } from '../../server/game/state.js'
import { PHASES } from '../../server/game/phaseMachine.js'
import { tickTowers } from '../../server/game/towers.js'
import { tickProjectiles } from '../../server/game/projectiles.js'
import { ENEMY_TYPE } from '../../server/game/enemyTypes.js'
import { BALANCE } from '../../shared/balance.js'
import { tileToWorldX, tileToWorldY } from '../../server/game/grid.js'

const SPEC = BALANCE.TOWER.FIRESTORM

// The 2026-08-28 fusion-worth retune raised damage 13 -> 26 and halved the
// cooldown, so an 8-bolt volley now kills a 90hp troll outright and there is no
// second volley to count. cycleSeq accounting is a damage-independent contract,
// so it is exercised at the historic damage.
function withHistoricDamage(fn) {
  const previous = SPEC.damage
  SPEC.damage = 13
  try { fn() } finally { SPEC.damage = previous }
}
const BOLT = BALANCE.PROJECTILE.FIRESTORM_BOLT
const DT = 1000 / 60

function firestorm(gx, gy, id = 1) {
  return { id, type: 'FIRESTORM', ownerId: null, gx, gy, w: 2, h: 2, orient: 'H', hp: 90, maxHp: 90 }
}
function makeState(structures) {
  const state = createGameState({
    players: ELEMENTS.map((el, i) => ({ id: `p${i}`, element: el, displayName: el, isBot: i > 0 })),
    settings: { timingStyle: 'fixed', friendlyFire: false },
  }, 1)
  state.phase = PHASES.FIGHT
  for (const p of state.players) { p.x = 1200; p.y = 700 }   // out of the way
  state.structures = structures
  return state
}
function spawnAt(store, x, y, type = ENEMY_TYPE.ORC, elite = false) {
  return store.spawn({ type, elite, x, y }, 0)
}
// Structure center for a 2x2 'H' fusion at (gx,gy): towers.js's centerX/centerY.
function centerOf(gx, gy) { return { cx: tileToWorldX(gx) + 16, cy: tileToWorldY(gy) + 16 } }

// Ticks projectile flight forward (fixed DT, growing `now`) until every bolt
// spawned by the volley has detonated, or a generous budget is exhausted.
// 100px range / 420px/s = ~0.24s of flight; 60 ticks is a wide margin.
function resolveBolts(state, startNow = 1) {
  let now = startNow
  for (let t = 0; t < 60 && state.projectiles.length > 0; t++) {
    now += DT
    tickProjectiles(state, now, DT)
  }
  return now
}

// The first volley's fan is rotated by cycleSeq(=1) * 22.5°; bolt b's heading
// is baseAngle + b * 45°. Placing an enemy exactly on bolt 0's heading makes
// the direct-hit path deterministic. distancePx was picked by direct
// simulation (not derived): flight is tick-quantized at a fixed 7px/tick
// step, and the projectile's hit-trigger radius (hitRadiusPx + enemy radius
// = 22 for a TROLL) exceeds FIRESTORM_BOLT's aoeRadiusPx by less than one
// tick step — so a bolt closing on-ray can register selectHitEnemy's overlap
// check a tick before it is actually within the smaller AoE damage radius,
// and most on-ray distances resolve as a "detect but no damage" graze. 17px
// (re-derived 2026-08-04 for Phase 2's aoeRadiusPx 16->12, brute-forced over
// 1-30px) is one of the residues (mod the 7px step) where the first detected
// overlap already lands inside the AoE radius with margin, so the test isn't
// riding a floating-point boundary. Verified by direct simulation (full
// 8-bolt volley, not just bolt 0 in isolation) that only the aligned bolt
// actually lands damage at this distance — the seven 45°-apart neighbors
// pass close enough to be geometrically near the target but their
// tick-quantized detonation points don't land inside its AoE radius.
function bolt0Target(cx, cy, distancePx = 17) {
  const angle = (1 * 22.5 * Math.PI) / 180
  return { x: cx + distancePx * Math.cos(angle), y: cy + distancePx * Math.sin(angle) }
}

test('a volley spawns eight real bolts on a rotating fan, not an instant hit', () => {
  const f = firestorm(10, 10)
  const st = makeState([f])
  const { cx, cy } = centerOf(10, 10)
  spawnAt(st.enemyStore, cx + 10, cy, ENEMY_TYPE.TROLL)

  tickTowers(st, 1, 16)

  assert.equal(st.projectiles.length, SPEC.volleyBolts, 'eight bolts spawned')
  for (const pr of st.projectiles) {
    assert.equal(pr.type, 'FIRESTORM_BOLT')
    assert.equal(pr.ownerId, null, 'team-owned: no player aggro pull')
    assert.equal(pr.category, 'structure')
    assert.equal(pr.label, 'FIRESTORM')
  }
  // 45° apart, rotated by cycleSeq(=1) * 22.5°.
  const angles = st.projectiles.map(pr => (Math.atan2(pr.vy, pr.vx) * 180) / Math.PI)
    .map(a => (a + 360) % 360).sort((a, b) => a - b)
  const expected = Array.from({ length: 8 }, (_, b) => (22.5 + b * 45) % 360).sort((a, b) => a - b)
  for (let i = 0; i < 8; i++) assert.ok(Math.abs(angles[i] - expected[i]) < 1e-6, `bolt ${i} heading`)
})

test('the fan rotates by 22.5° on the next volley (deterministic from cycleSeq)', () => {
  const f = firestorm(10, 10)
  const st = makeState([f])
  const { cx, cy } = centerOf(10, 10)
  spawnAt(st.enemyStore, cx + 10, cy, ENEMY_TYPE.TROLL)

  tickTowers(st, 1, 16)
  const firstHeading = (Math.atan2(st.projectiles[0].vy, st.projectiles[0].vx) * 180) / Math.PI
  resolveBolts(st, 1)
  spawnAt(st.enemyStore, cx + 10, cy, ENEMY_TYPE.TROLL)   // replace whatever the first volley killed/missed

  tickTowers(st, SPEC.cooldownMs + 100, 16)
  const secondHeading = (Math.atan2(st.projectiles[0].vy, st.projectiles[0].vx) * 180) / Math.PI

  const delta = ((secondHeading - firstHeading + 540) % 360) - 180
  assert.ok(Math.abs(Math.abs(delta) - 22.5) < 1e-6, `fan rotated by 22.5°, got ${delta}`)
})

test('a bolt on target damages the enemy exactly once', () => {
  const f = firestorm(10, 10)
  const st = makeState([f])
  const { cx, cy } = centerOf(10, 10)
  const { x, y } = bolt0Target(cx, cy)
  const i = spawnAt(st.enemyStore, x, y, ENEMY_TYPE.TROLL)

  tickTowers(st, 1, 16)
  resolveBolts(st, 1)

  assert.equal(st.enemyStore.hp[i], st.enemyStore.maxHp[i] - SPEC.damage)
})

test('burn is applied on a landed hit', () => {
  const f = firestorm(10, 10)
  const st = makeState([f])
  const { cx, cy } = centerOf(10, 10)
  const { x, y } = bolt0Target(cx, cy)
  const i = spawnAt(st.enemyStore, x, y, ENEMY_TYPE.TROLL)

  tickTowers(st, 1, 16)
  resolveBolts(st, 1)

  assert.ok(st.enemyStore.status[i].burnMs > 0, 'burn applied by a landed bolt')
})

test('bounded range: an enemy far outside range is never hit and no volley fires', () => {
  const f = firestorm(10, 10)
  const st = makeState([f])
  const { cx, cy } = centerOf(10, 10)
  const i = spawnAt(st.enemyStore, cx + SPEC.rangePx + 50, cy)

  tickTowers(st, 1, 16)

  assert.equal(st.projectiles.length, 0, 'gate blocked: no bolts spawned')
  assert.equal(st.enemyStore.hp[i], st.enemyStore.maxHp[i])
})

test('cooldown gates re-activation: a second tick before cooldown spawns no second batch', () => {
  const f = firestorm(10, 10)
  const st = makeState([f])
  const { cx, cy } = centerOf(10, 10)
  spawnAt(st.enemyStore, cx + 10, cy, ENEMY_TYPE.TROLL)

  tickTowers(st, 1, 16)
  assert.equal(st.projectiles.length, SPEC.volleyBolts)
  tickTowers(st, 100, 16)   // still on cooldown
  assert.equal(st.projectiles.length, SPEC.volleyBolts, 'no second batch before cooldown elapses')
})

test('cooldown gates re-activation: a second volley fires once the cadence elapses', () => {
  const f = firestorm(10, 10)
  const st = makeState([f])
  const { cx, cy } = centerOf(10, 10)
  spawnAt(st.enemyStore, cx + 10, cy, ENEMY_TYPE.TROLL)

  tickTowers(st, 1, 16)
  resolveBolts(st, 1)
  spawnAt(st.enemyStore, cx + 10, cy, ENEMY_TYPE.TROLL)

  tickTowers(st, SPEC.cooldownMs + 100, 16)
  assert.equal(st.projectiles.length, SPEC.volleyBolts, 'a second volley fired')
})

test('an empty-range tick spends no cooldown (stays ready)', () => {
  const f = firestorm(10, 10)
  const st = makeState([f])
  const { cx, cy } = centerOf(10, 10)

  tickTowers(st, 1, 16)   // nothing in range yet
  assert.equal(st.projectiles.length, 0)
  spawnAt(st.enemyStore, cx + 10, cy, ENEMY_TYPE.TROLL)
  tickTowers(st, 2, 16)   // should still fire immediately, not wait out a spent cooldown

  assert.equal(st.projectiles.length, SPEC.volleyBolts)
})

test('cycleSeq bumps exactly once per volley, regardless of hit count', () => {
  withHistoricDamage(() => {
    const f = firestorm(10, 10)
    const st = makeState([f])
    const { cx, cy } = centerOf(10, 10)
    spawnAt(st.enemyStore, cx + 10, cy, ENEMY_TYPE.TROLL)
    spawnAt(st.enemyStore, cx - 10, cy, ENEMY_TYPE.TROLL)
    spawnAt(st.enemyStore, cx, cy + 10, ENEMY_TYPE.TROLL)

    assert.equal(f.cycleSeq ?? 0, 0, 'no cue before any activation')
    tickTowers(st, 1, 16)
    assert.equal(f.cycleSeq, 1, 'exactly one cue for the whole volley')
    resolveBolts(st, 1)

    tickTowers(st, SPEC.cooldownMs + 100, 16)
    assert.equal(f.cycleSeq, 2, 'the next volley bumps it again, once')
  })
})

test('destroying the structure stops it from ever firing again', () => {
  const f = firestorm(10, 10)
  const st = makeState([f])
  const { cx, cy } = centerOf(10, 10)
  spawnAt(st.enemyStore, cx + 10, cy, ENEMY_TYPE.TROLL)

  st.structures = []   // destroyed before its first tick
  tickTowers(st, 1, 16)

  assert.equal(st.projectiles.length, 0, 'no volley without the structure to resolve it')
})

test('a team-owned volley (ownerId null) never touches a real aggro lock', () => {
  const f = firestorm(10, 10)
  const st = makeState([f])
  const { cx, cy } = centerOf(10, 10)
  const { x, y } = bolt0Target(cx, cy)
  const i = spawnAt(st.enemyStore, x, y, ENEMY_TYPE.TROLL)
  st.enemyStore.aggro[i].state = 'chase'
  st.enemyStore.aggro[i].targetId = 'p1'
  st.enemyStore.aggro[i].stickyUntilMs = 10_000

  tickTowers(st, 1, 16)
  resolveBolts(st, 1)

  assert.equal(st.enemyStore.aggro[i].state, 'chase', 'still chasing')
  assert.equal(st.enemyStore.aggro[i].targetId, 'p1', 'the volley did not steal or clear the real target')
})

test('MAX_PROJECTILES cap refuses spawns beyond the budget rather than dropping an existing bolt', () => {
  const f = firestorm(10, 10)
  const st = makeState([f])
  const { cx, cy } = centerOf(10, 10)
  spawnAt(st.enemyStore, cx + 10, cy, ENEMY_TYPE.TROLL)

  // Fill the budget to 3 short of the cap with inert placeholder projectiles.
  const room = 3
  for (let n = 0; n < BALANCE.LIMITS.MAX_PROJECTILES - room; n++) {
    st.projectiles.push({ id: `filler${n}`, type: 'FIREBALL', category: 'ability', ownerId: null, x: 0, y: 0, vx: 0, vy: 0, traveled: 0, ageMs: 0, lifetimeMs: null, maxRangePx: 9999, hitRadiusPx: 0, aoeRadiusPx: 0, damage: 0, burn: null, ffShove: null })
  }
  st.volleyProbe = { activations: 0, hits: 0, boltsSpawned: 0, boltsHit: 0, boltsRefused: 0 }

  tickTowers(st, 1, 16)

  assert.equal(st.projectiles.length, BALANCE.LIMITS.MAX_PROJECTILES, 'refused, never exceeded the cap')
  assert.equal(st.volleyProbe.boltsSpawned, room, 'only the remaining room was spawned')
  assert.equal(st.volleyProbe.boltsRefused, SPEC.volleyBolts - room, 'the rest were refused, not substituted')
})

test('volleyProbe accounting: activations/boltsSpawned/boltsHit/hits track the projectile mechanism', () => {
  const f = firestorm(10, 10)
  const st = makeState([f])
  const { cx, cy } = centerOf(10, 10)
  const { x, y } = bolt0Target(cx, cy)
  spawnAt(st.enemyStore, x, y, ENEMY_TYPE.TROLL)
  st.volleyProbe = { activations: 0, hits: 0, boltsSpawned: 0, boltsHit: 0, boltsRefused: 0 }

  tickTowers(st, 1, 16)
  assert.equal(st.volleyProbe.activations, 1)
  assert.equal(st.volleyProbe.boltsSpawned, SPEC.volleyBolts)
  assert.equal(st.volleyProbe.boltsRefused, 0)

  resolveBolts(st, 1)
  assert.equal(st.volleyProbe.boltsHit, 1, 'exactly the one bolt aimed at the enemy connected')
  assert.equal(st.volleyProbe.hits, 1)
})
