#!/usr/bin/env node
// Firepit maze-B soft-lock diagnostic (2026-08-02 follow-up).
//
// Reproduces the 7/144 maze-B stalls the Firepit arm produces
// (docs/reviews/2026-08-02-firepit-retest.md §4a) and inspects the live state
// at the stall point: are the stuck bodies FROZEN (no movement at all) or in a
// LIMIT CYCLE (positions oscillate, count constant) — the crowd-jam signature
// recorded in the elementia-crowd-jam-softlock memory?
//
// NOT a test file (no .test.js suffix) — same convention as probe.js /
// firepitRetest.js.
//
// Usage: node test/harness/firepitHangDiag.js [--seeds 20260808,20260810] [--ticks 60]

import { runMatch } from './matchRunner.js'
import { resolveMaze } from './scenarios.js'
import { STRUCTURE_TYPES } from '../../shared/constants.js'
import { tickGame } from '../../server/game/tick.js'
import { chooseStepDir } from '../../server/game/enemyMove.js'
import { worldToTileX, worldToTileY, tileIdx, NEIGHBOR_DX, NEIGHBOR_DY, inBounds } from '../../server/game/grid.js'
import { BAND_NONE } from '../../server/game/costField.js'

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 || i === process.argv.length - 1 ? fallback : process.argv[i + 1]
}

const seeds = (arg('seeds', '20260808,20260810') ?? '').split(',').map(Number)
const probeTicks = Number(arg('ticks', 60))
const maze = resolveMaze('B')

for (const seed of seeds) {
  console.log(`\n================ seed ${seed} maze B postGap 0 FIRE_SPECIAL ================`)
  const m = runMatch({
    seed, maze, postGap: 0, fuse: false, freeSpecial: false, spendDown: true,
    defence: STRUCTURE_TYPES.FIRE_SPECIAL,
    onEnd: (state, mm) => {
      console.log(`stalled=${mm.stalled} timedOut=${mm.timedOut} won=${mm.won} lost=${mm.lost} wave=${state.wave} phase=${state.phase} living=${state.livingEnemyCount} ticks=${mm.ticks}`)
      if (!mm.stalled) return
      const store = state.enemyStore
      console.log(`store.count=${store.count}`)

      // --- who is stuck, and in what steering mode ---
      for (let i = 0; i < store.count; i++) {
        const gx = worldToTileX(store.x[i]), gy = worldToTileY(store.y[i])
        const k = chooseStepDir(state.costField, gx, gy)
        const st = store.status[i]
        const ag = store.aggro[i]
        const band = state.costField.wallBand[tileIdx(gx, gy)]
        console.log(
          `  e${i} type=${store.type[i]} hp=${store.hp[i].toFixed(1)} ` +
          `pos=(${store.x[i].toFixed(1)},${store.y[i].toFixed(1)}) tile=(${gx},${gy}) ` +
          `r=${store.radius[i]} speed=${store.moveSpeed[i]} ` +
          `kv=(${store.kvx[i].toFixed(2)},${store.kvy[i].toFixed(2)}) ` +
          `step=${k} cost=${state.costField.cost[tileIdx(gx, gy)].toFixed(1)} band=${band} ` +
          `aggro=${ag.state}/${ag.targetId ?? '-'} ` +
          `root=${st.rootMs} freeze=${st.freezeMs} slow=${st.slowMs} confused=${st.confusedMs}`,
        )
        // neighbour costs, to see whether a descent exists at all
        const nb = []
        for (let n = 0; n < 8; n++) {
          const nx = gx + NEIGHBOR_DX[n], ny = gy + NEIGHBOR_DY[n]
          if (!inBounds(nx, ny)) { nb.push(`${n}:oob`); continue }
          const v = tileIdx(nx, ny)
          nb.push(`${n}:(${nx},${ny})c=${state.costField.cost[v].toFixed(1)}${state.costField.blocked[v] ? 'B' : ''}${state.costField.wallBand[v] !== BAND_NONE ? 'W' : ''}`)
        }
        console.log(`      nbrs ${nb.join(' ')}`)
      }

      // --- players: where are they, are they leashed away ---
      for (const p of state.players) {
        console.log(`  ${p.id}(${p.element}${p.isBot ? ',bot' : ''}) pos=(${p.x.toFixed(0)},${p.y.toFixed(0)}) alive=${p.alive} hp=${(p.hp ?? 0).toFixed(0)}`)
      }

      // --- structures near the stuck bodies ---
      const near = state.structures.filter(s => {
        const gx = worldToTileX(store.x[0] ?? 0), gy = worldToTileY(store.y[0] ?? 0)
        return Math.abs(s.gx - gx) <= 4 && Math.abs(s.gy - gy) <= 4
      })
      console.log(`  structures within 4 tiles of e0: ${near.map(s => `${s.type}@(${s.gx},${s.gy})hp${s.hp}`).join(' ') || '(none)'}`)

      // --- FROZEN or LIMIT CYCLE? tick it forward by hand and watch ---
      console.log(`  -- probing ${probeTicks} further ticks --`)
      const trail = []
      for (let t = 0; t < probeTicks; t++) {
        tickGame(state, new Map(), 1e9 + t * 50, 50)
        const row = []
        for (let i = 0; i < store.count; i++) row.push(`${store.x[i].toFixed(2)},${store.y[i].toFixed(2)}`)
        trail.push(row.join(' | '))
      }
      const uniq = new Set(trail)
      console.log(`  distinct position-vectors over ${probeTicks} ticks: ${uniq.size}`)
      console.log(`  first: ${trail[0]}`)
      console.log(`  last:  ${trail.at(-1)}`)
      if (uniq.size > 1 && uniq.size < probeTicks) {
        // find the cycle period
        let period = 0
        for (let p = 1; p <= probeTicks / 2; p++) {
          let ok = true
          for (let t = probeTicks - 1; t >= probeTicks - 10 && t - p >= 0; t--) if (trail[t] !== trail[t - p]) { ok = false; break }
          if (ok) { period = p; break }
        }
        console.log(`  => LIMIT CYCLE, period ${period} ticks`)
      } else if (uniq.size === 1) {
        console.log(`  => FROZEN (fixed point, zero movement)`)
      } else {
        console.log(`  => still drifting (no repeat within ${probeTicks} ticks)`)
      }
    },
  })
  if (!m.stalled) console.log(`  (no stall this seed: won=${m.won} lost=${m.lost} waves=${m.wavesCleared})`)
}
