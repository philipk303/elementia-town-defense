import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SnapshotBuffer } from '../../client/src/net/SnapshotBuffer.js'
import { NETCODE, CONFIG, PLAYER_FLAG } from '../../shared/constants.js'

const TICK_MS = CONFIG.TICK_MS

function snap(tick, over = {}) {
  return {
    tick, placedVersion: 0, hallHp: 1000, teamLevel: 1,
    players: [], enemies: [], projectiles: [], fx: [],
    ...over,
  }
}

// Push two snapshots 3 ticks apart so serverTime spans 50ms, with a stable
// arrival offset (nowMs chosen so offsetEma maps cleanly).
function twoSnaps(buf, mk1, mk2) {
  const t1 = 60, t2 = 63
  buf.push(snap(t1, mk1), t1 * TICK_MS)      // offset 0
  buf.push(snap(t2, mk2), t2 * TICK_MS)      // offset 0
  return { t1, t2 }
}

test('remote entities render INTERP_DELAY_MS in the past, lerped between snapshots', () => {
  const buf = new SnapshotBuffer()
  const { t1, t2 } = twoSnaps(buf,
    { enemies: [{ id: 1, type: 0, x: 100, y: 0, hp: 10, flags: 0 }] },
    { enemies: [{ id: 1, type: 0, x: 200, y: 0, hp: 10, flags: 0 }] })
  // Render time = now - delay = midpoint of the two snapshots.
  const mid = (t1 + t2) / 2 * TICK_MS
  const view = buf.getRenderView(mid + NETCODE.INTERP_DELAY_MS, 'me')
  assert.ok(Math.abs(view.enemies[0].x - 150) < 1e-6, `lerped midpoint, got ${view.enemies[0].x}`)
})

test('never extrapolates: past the newest snapshot everything clamps to newest', () => {
  const buf = new SnapshotBuffer()
  twoSnaps(buf,
    { enemies: [{ id: 1, type: 0, x: 100, y: 0, hp: 10, flags: 0 }] },
    { enemies: [{ id: 1, type: 0, x: 200, y: 0, hp: 10, flags: 0 }] })
  const view = buf.getRenderView(1e9, 'me')
  assert.equal(view.enemies[0].x, 200)
})

test('out-of-order and duplicate snapshots are rejected by the watermark', () => {
  const buf = new SnapshotBuffer()
  buf.push(snap(10), 0)
  buf.push(snap(9), 10)
  buf.push(snap(10), 20)
  assert.equal(buf.size, 1)
})

test('dynamic structure state (Task 8 ds) rides the render view unmodified — no interpolation needed', () => {
  const buf = new SnapshotBuffer()
  const { t1, t2 } = twoSnaps(buf,
    { structureState: [{ id: 1, hp: 40, phase: 0, deadline: 0, charge: 0, cycle: 0 }] },
    { structureState: [{ id: 1, hp: 12, phase: 1, deadline: 500, charge: 0.5, cycle: 2 }] })
  const view = buf.getRenderView(t2 * TICK_MS, 'me')
  assert.deepEqual(view.structureState, [{ id: 1, hp: 12, phase: 1, deadline: 500, charge: 0.5, cycle: 2 }],
    'ds is discrete per-tick state from the latest snapshot, not interpolated')
})

test('local player uses the shorter delay; a respawn edge snaps instead of sliding', () => {
  const buf = new SnapshotBuffer()
  twoSnaps(buf,
    { players: [{ id: 'me', x: 100, y: 0, hp: 0, flags: PLAYER_FLAG.DEAD }] },
    { players: [{ id: 'me', x: 640, y: 672, hp: 100, flags: 0 }] })
  const view = buf.getRenderView(63 * TICK_MS + NETCODE.LOCAL_INTERP_DELAY_MS, 'me')
  assert.equal(view.players[0].x, 640, 'respawn snaps to the new position — no corpse slide')
})

test('an enemy present only in `from` (died) is dropped from the view', () => {
  const buf = new SnapshotBuffer()
  const { t1, t2 } = twoSnaps(buf,
    { enemies: [{ id: 1, type: 0, x: 100, y: 0, hp: 10, flags: 0 }, { id: 2, type: 0, x: 300, y: 0, hp: 5, flags: 0 }] },
    { enemies: [{ id: 1, type: 0, x: 150, y: 0, hp: 10, flags: 0 }] })
  const mid = (t1 + t2) / 2 * TICK_MS
  const view = buf.getRenderView(mid + NETCODE.INTERP_DELAY_MS, 'me')
  assert.equal(view.enemies.length, 1)
  assert.equal(view.enemies[0].id, 1)
})

test('projectiles lerp like enemies', () => {
  const buf = new SnapshotBuffer()
  const { t1, t2 } = twoSnaps(buf,
    { projectiles: [{ id: 7, type: 'FIREBALL', x: 0, y: 0 }] },
    { projectiles: [{ id: 7, type: 'FIREBALL', x: 20, y: 0 }] })
  const mid = (t1 + t2) / 2 * TICK_MS
  const view = buf.getRenderView(mid + NETCODE.INTERP_DELAY_MS, 'me')
  assert.ok(Math.abs(view.projectiles[0].x - 10) < 1e-6)
})

test('reset clears the watermark so a rematch starting at tick 1 renders again', () => {
  const buf = new SnapshotBuffer()
  buf.push(snap(5000), 0)
  buf.reset()
  buf.push(snap(1), 0)
  assert.equal(buf.size, 1)
})
