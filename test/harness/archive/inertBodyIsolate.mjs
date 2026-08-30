#!/usr/bin/env node
// Isolate the in-lane BODY penalty (2026-08-04, Task 20 §0, confirmation 2).
//
// funnelBodyConfirm.mjs (maze A, n=144) established that a fully INERT fusion
// costs -0.575 (t4.56) in the lane and +0.061 (t0.57) on the flank — the
// penalty is the placement, not the payload. But that arm still carries a
// fusion's baggage: a partner purchase (8 gold), a 2x2 footprint, and a
// wave-4 transition. This strips all of it.
//
// Arms: the human's FREE special only (no fusion, no partner gold), with
// WATER_SPECIAL neutered to a pure inert 2x1 walkable body — no damage, no
// displacement. The only thing that varies is which tile it stands on.
//
// Also split by postGap, which decides which lane the scripted human plugs.
// funnelSites always fills gaps[0] first, so postGap 0 puts the body in the
// DEFENDED lane and postGap 1 puts it in the undefended one. If the penalty
// only appears in the defended lane, the mechanism involves the human; if it
// appears in both, it is pure enemy-flow geometry.
//
// Usage: node test/harness/inertBodyIsolate.mjs

import { runMatch } from './matchRunner.js'
import { scenarioMatrix, resolveMaze, SEEDS } from './scenarios.js'
import { classify } from './stats.js'
import { BALANCE } from '../../shared/balance.js'

const geyserBase = { ...BALANCE.TOWER.WATER_SPECIAL }
const DEAD = { displace: { power: 0 }, damage: 0, cooldownMs: 2500 }

const mean = a => a.reduce((x, v) => x + v, 0) / (a.length || 1)
function report(label, a, b) {
  const c = classify([a, b])
  const d = c.means[1] - c.means[0]
  console.log(`  ${label.padEnd(28)} ${d >= 0 ? '+' : ''}${d.toFixed(3)} (t${c.t.toFixed(2)})`)
}

for (const mazeName of ['A', 'B']) {
  const maze = resolveMaze(mazeName)
  const scenarios = scenarioMatrix({ seeds: SEEDS, maze })
  console.log(`\n=== maze ${mazeName} — inert 2x1 body, free special only, no fusion ===`)

  const by = {}
  for (const [label, opts] of [
    ['none', { freeSpecial: false }],
    ['tower', { freeSpecialSites: null }],
    ['funnel', { freeSpecialSites: 'funnel' }],
  ]) {
    Object.assign(BALANCE.TOWER.WATER_SPECIAL, geyserBase, DEAD)
    const all = [], g0 = [], g1 = []
    for (const s of scenarios) {
      const m = runMatch({ ...s, fuse: false, humanElement: 'WATER', ...opts })
      if (m.timedOut || m.stalled) continue
      all.push(m.score);
      (s.postGap === 0 ? g0 : g1).push(m.score)
    }
    by[label] = { all, g0, g1 }
    console.log(`${label.padEnd(7)} n ${all.length} | score ${mean(all).toFixed(3)}`,
      `| postGap0 ${mean(g0).toFixed(3)} | postGap1 ${mean(g1).toFixed(3)}`)
  }

  report('tower - none', by.none.all, by.tower.all)
  report('funnel - none', by.none.all, by.funnel.all)
  report('funnel - none (postGap 0)', by.none.g0, by.funnel.g0)
  report('funnel - none (postGap 1)', by.none.g1, by.funnel.g1)
  report('funnel - tower', by.tower.all, by.funnel.all)
}

Object.assign(BALANCE.TOWER.WATER_SPECIAL, geyserBase)
