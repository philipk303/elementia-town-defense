// Wave plan builder (spec §4 beat sheet). Pure/deterministic given the wave
// number and the per-run gate order — no wall-clock, no state mutation. The
// enemy sim (enemies.js) consumes buildSpawnSchedule to stream a wave in over
// the fight; the phase machine's spawnComplete flips once the last scheduled
// enemy has spawned.
//
//   - resolveGateOrder(rng): assigns the logical SIDE_A/SIDE_B beats to the two
//     physical side gates (LEFT/RIGHT), randomized per run via the seeded RNG.
//   - openGatesForWave(wave, order): the physical gates spawning on `wave`
//     (gates open cumulatively at waves 1 / 4 / 7 — spec §4).
//   - nextGateToOpen(wave, order): telegraph — the physical gate that opens on
//     wave+1, or null (shown during build phase one wave ahead).
//   - buildSpawnSchedule(wave, order, rng?): time-ordered [{atMs, gate, type,
//     elite}]. With an rng, spawn times carry +/- WAVE_SPAWN.JITTER_MS of
//     seeded jitter (Phase 8A: the sim's per-run entropy).

import { BALANCE } from '../../shared/balance.js'
import { ENEMY_TYPE } from './enemyTypes.js'

// Assign SIDE_A/SIDE_B to LEFT/RIGHT. One rng() draw branches the whole run.
export function resolveGateOrder(rng) {
  return rng() < 0.5
    ? { SIDE_A: 'LEFT',  SIDE_B: 'RIGHT' }
    : { SIDE_A: 'RIGHT', SIDE_B: 'LEFT' }
}

// Physical gates open on `wave`, canonical order: CENTER, then SIDE_A, SIDE_B
// as each reaches its opening wave (spec §4: 1 / 4 / 7).
export function openGatesForWave(wave, order) {
  const gates = ['CENTER']
  if (wave >= BALANCE.GATE_OPEN_WAVE.SIDE_A) gates.push(order.SIDE_A)
  if (wave >= BALANCE.GATE_OPEN_WAVE.SIDE_B) gates.push(order.SIDE_B)
  return gates
}

// The physical gate opening on wave+1, or null. Used to telegraph one wave ahead.
export function nextGateToOpen(wave, order) {
  const next = wave + 1
  if (next === BALANCE.GATE_OPEN_WAVE.SIDE_A) return order.SIDE_A
  if (next === BALANCE.GATE_OPEN_WAVE.SIDE_B) return order.SIDE_B
  return null
}

// Expand a wave's composition into a spawn ORDER: elites lead ("1 Elite leading
// a horde"), then the base body is interleaved by type so a gate doesn't emit an
// all-goblin block then an all-orc block. Deterministic — no RNG here.
function expandComp(comp) {
  const c = comp
  const list = []
  // Elites first (lead the wave).
  for (let i = 0; i < (c.eliteTroll  || 0); i++) list.push({ type: ENEMY_TYPE.TROLL,  elite: true })
  for (let i = 0; i < (c.eliteOrc    || 0); i++) list.push({ type: ENEMY_TYPE.ORC,    elite: true })
  for (let i = 0; i < (c.eliteGoblin || 0); i++) list.push({ type: ENEMY_TYPE.GOBLIN, elite: true })
  // Base body, round-robin across present types (heaviest first each cycle).
  const pools = [
    { type: ENEMY_TYPE.TROLL,  n: c.troll  || 0 },
    { type: ENEMY_TYPE.ORC,    n: c.orc    || 0 },
    { type: ENEMY_TYPE.GOBLIN, n: c.goblin || 0 },
  ]
  let remaining = pools.reduce((a, p) => a + p.n, 0)
  while (remaining > 0) {
    for (const p of pools) {
      if (p.n > 0) { list.push({ type: p.type, elite: false }); p.n--; remaining-- }
    }
  }
  return list
}

// Distribute the spawn order across the open gates (round-robin) and stamp each
// with a spawn time: within a gate, one every INTERVAL_MS; gates are staggered
// by GATE_STAGGER_MS so multi-gate waves interleave rather than pulse together.
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
