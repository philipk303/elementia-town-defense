// Spike A — wave-10 free-tier snapshot budget.
//
// Builds a deterministic synthetic worst-case wave-10 state (120 enemies,
// 150 structures, 4 players, 40 fx) and measures, for BOTH the naive
// keyed-object full-state encoding (ez-ctf buildEmitSnapshot style) and the
// packed change-versioned encoder (server/net/encode.js):
//   - bytes per snapshot (delta = statics unchanged; full = statics included)
//   - room bandwidth at 20 Hz x 4 clients; GB per 100 hours of play
//   - encode CPU per emit (µs on dev machine; x10 = 0.1-vCPU proxy)
//
// GO thresholds (plan Phase 0 / Spike A):
//   packed delta snapshot <= 8 KB
//   encode CPU <= 150 µs/emit on dev machine
//
// Run: npm run spike:a

import { mulberry32 } from '../shared/rng.js'
import { encodeSnapshot } from '../server/net/encode.js'

const rng = mulberry32(0xE1E)
const ri = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1))

// --- synthetic worst-case wave-10 state --------------------------------------
const state = {
  tick: 36000,
  placedVersion: 42,
  players: Array.from({ length: 4 }, (_, i) => ({
    id: i + 1, x: rng() * 1280, y: rng() * 736, hp: ri(20, 100), flags: ri(0, 7),
  })),
  enemies: Array.from({ length: 120 }, (_, i) => ({
    id: 1000 + i,
    type: ri(0, 5), // 3 base + 3 elite variants
    x: rng() * 1280, y: rng() * 736,
    hp: ri(5, 900), flags: ri(0, 63), // status bits: burn/wet/slow/root/freeze/aggro
  })),
  structures: Array.from({ length: 150 }, (_, i) => ({
    id: 2000 + i, type: ri(0, 9), gx: ri(0, 39), gy: ri(0, 22), hp: ri(1, 500),
  })),
  fx: Array.from({ length: 40 }, () => ({ type: ri(0, 7), x: rng() * 1280, y: rng() * 736 })),
}
// The packed encoder reads enemies from the SoA store (server/game/enemies.js);
// mirror the synthetic horde into that shape (id/type/x/y/hp/flags slots).
state.enemyStore = {
  count: state.enemies.length,
  id:    state.enemies.map(e => e.id),
  type:  state.enemies.map(e => e.type),
  x:     state.enemies.map(e => e.x),
  y:     state.enemies.map(e => e.y),
  hp:    state.enemies.map(e => e.hp),
  flags: state.enemies.map(e => e.flags),
}

// --- naive encoder (ez-ctf style: keyed objects, full floats, statics always) --
function encodeNaive(s) {
  return JSON.stringify({
    tick: s.tick,
    placedVersion: s.placedVersion,
    players: s.players,
    enemies: s.enemies,
    structures: s.structures, // re-sent every emit, full precision
    fx: s.fx,
  })
}

// --- measurement --------------------------------------------------------------
function bench(label, fn, iters = 2000, warmup = 300) {
  for (let i = 0; i < warmup; i++) fn()
  const t0 = process.hrtime.bigint()
  let bytes = 0
  for (let i = 0; i < iters; i++) bytes = Buffer.byteLength(fn())
  const usPerEmit = Number(process.hrtime.bigint() - t0) / 1000 / iters
  return { label, bytes, usPerEmit }
}

const results = [
  bench('naive full-state', () => encodeNaive(state)),
  bench('packed FULL (pv changed)', () => encodeSnapshot(state, -1)),
  bench('packed DELTA (pv unchanged)', () => encodeSnapshot(state, state.placedVersion)),
]

const HZ = 20, CLIENTS = 4
console.log('Spike A — wave-10 snapshot budget (120 enemies / 150 structures / 4 players / 40 fx)\n')
for (const r of results) {
  const mbps = r.bytes * HZ * CLIENTS / 1e6
  const gbPer100h = mbps * 3600 * 100 / 1000
  console.log(`${r.label}`)
  console.log(`  bytes/snapshot : ${r.bytes}`)
  console.log(`  room bandwidth : ${mbps.toFixed(3)} MB/s (20Hz x 4 clients)`)
  console.log(`  GB per 100 hrs : ${gbPer100h.toFixed(1)}`)
  console.log(`  encode CPU     : ${r.usPerEmit.toFixed(1)} µs/emit (dev) ≈ ${(r.usPerEmit / 100).toFixed(2)} ms on 0.1 vCPU\n`)
}

const delta = results[2]
const goSize = delta.bytes <= 8 * 1024
const goCpu = delta.usPerEmit <= 150
console.log(`GO check — packed delta <= 8 KB: ${goSize ? 'PASS' : 'FAIL'} (${delta.bytes} B)`)
console.log(`GO check — encode CPU <= 150 µs: ${goCpu ? 'PASS' : 'FAIL'} (${delta.usPerEmit.toFixed(1)} µs)`)
console.log(`\nVERDICT: ${goSize && goCpu ? 'GO' : 'NO-GO'}`)
