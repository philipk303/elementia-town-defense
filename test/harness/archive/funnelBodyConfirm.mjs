#!/usr/bin/env node
// Confirmation pass for the "in-lane BODY costs score" finding (2026-08-04,
// Task 20 §0). Maze A only, FULL 72-seed x 2-post matrix — the 24-seed screen
// put the inert tower-vs-funnel gap at 0.57 score points (t2.01 vs t0.53),
// which is exactly the size the baseline-review lessons say not to trust off a
// screen.
//
// Arms (all humanElement WATER; `inert` = BLIZZARD damage 0, freeze off):
//   none          no free special, no fusion — siting-independent anchor
//   inert-tower   inert fusion on the flanks
//   inert-funnel  inert fusion in the lane
//   inert-funnel-noGeyser
//                 as inert-funnel, but WATER_SPECIAL is also neutered. The
//                 free Water Geyser lives in the lane for waves 1-3 before it
//                 is consumed by the fusion, and the harness hardcodes its
//                 cardinal to 'S' (matchRunner.js:245), which the harness's own
//                 Grinder note calls "toward the hall". An in-lane Geyser
//                 launching enemies hallward is a confound that has nothing to
//                 do with Blizzard; this arm removes it.
//   live-tower / live-funnel
//                 unmodified Blizzard, for reference at the same n.
//
// Usage: node test/harness/funnelBodyConfirm.mjs

import { runMatch } from './matchRunner.js'
import { scenarioMatrix, resolveMaze, SEEDS } from './scenarios.js'
import { classify } from './stats.js'
import { BALANCE } from '../../shared/balance.js'

const blizBase = { ...BALANCE.TOWER.BLIZZARD }
const geyserBase = { ...BALANCE.TOWER.WATER_SPECIAL }
const INERT = { damage: 0, freeze: undefined }
const DEAD_GEYSER = { displace: { power: 0 }, damage: 0, cooldownMs: 2500 }

const maze = resolveMaze('A')
const scenarios = scenarioMatrix({ seeds: SEEDS, maze })

const ARMS = [
  ['none                 ', { fuse: false, freeSpecial: false }, {}, {}],
  ['inert-tower          ', { fuse: true, fuseWave: 4, fuseWith: 'WIND', freeSpecialSites: null }, INERT, {}],
  ['inert-funnel         ', { fuse: true, fuseWave: 4, fuseWith: 'WIND', freeSpecialSites: 'funnel' }, INERT, {}],
  ['inert-funnel-noGeyser', { fuse: true, fuseWave: 4, fuseWith: 'WIND', freeSpecialSites: 'funnel' }, INERT, DEAD_GEYSER],
  ['live-tower           ', { fuse: true, fuseWave: 4, fuseWith: 'WIND', freeSpecialSites: null }, {}, {}],
  ['live-funnel          ', { fuse: true, fuseWave: 4, fuseWith: 'WIND', freeSpecialSites: 'funnel' }, {}, {}],
]

const results = new Map()
for (const [label, opts, bliz, geyser] of ARMS) {
  Object.assign(BALANCE.TOWER.BLIZZARD, blizBase, bliz)
  Object.assign(BALANCE.TOWER.WATER_SPECIAL, geyserBase, geyser)
  const scores = [], waves = []
  let hangs = 0
  for (const s of scenarios) {
    const m = runMatch({ ...s, humanElement: 'WATER', ...opts })
    if (m.timedOut || m.stalled) hangs++
    else { scores.push(m.score); waves.push(m.wavesCleared) }
  }
  results.set(label.trim(), scores)
  const mean = a => a.reduce((x, v) => x + v, 0) / a.length
  const vs = results.get('none')
  const c = classify([vs, scores])
  const d = c.means[1] - c.means[0]
  console.log(
    label, `n ${scores.length} hangs ${hangs}`,
    `| score ${mean(scores).toFixed(3)}`,
    `| waves ${mean(waves).toFixed(3)}`,
    `| vs none ${d >= 0 ? '+' : ''}${d.toFixed(3)}(t${c.t.toFixed(2)})`)
}
Object.assign(BALANCE.TOWER.BLIZZARD, blizBase)
Object.assign(BALANCE.TOWER.WATER_SPECIAL, geyserBase)

const pair = (a, b) => {
  const c = classify([results.get(a), results.get(b)])
  const d = c.means[1] - c.means[0]
  console.log(`\n${b} - ${a}: ${d >= 0 ? '+' : ''}${d.toFixed(3)} (t${c.t.toFixed(2)})`)
}
pair('inert-tower', 'inert-funnel')
pair('inert-funnel', 'inert-funnel-noGeyser')
pair('live-tower', 'live-funnel')
