#!/usr/bin/env node
// Three-way siting sweep with a GENUINELY off-lane arm (2026-08-04, Task 20 §0).
//
// The published Blizzard/Steam Vent "flank vs funnel" A/B does not contrast
// flank against lane. Specials are 2 tiles wide and anchored top-left, and
// `towerSites`' first entry is [gap - 1, ...] — so the "flank" arm's structure
// covers gap-1 AND gap, standing in the one-tile lane just like the "funnel"
// arm. Measured placement is deterministic and identical in every one of 144
// cells: maze A tower -> anchor (12,9) covering 12-13; funnel -> (13,9)
// covering 13-14. Gap is column 13. Both are in the lane; the A/B is a
// one-tile shift.
//
// Arms:
//   none     no free special, no fusion (anchor)
//   offlane  anchors [gap+1] / [gap-2] — the first placement that actually
//            clears the lane column
//   tower    the published "flank" arm (half in lane)
//   funnel   the published "lane" arm (half in lane, shifted one tile)
//
// Reported for the live fusion and, on maze A, for an INERT one (damage 0,
// freeze off) so the mechanic's value can be read separately from the cost of
// the body's position.
//
// Usage: node test/harness/laneCoverageSweep.mjs

import { runMatch } from './matchRunner.js'
import { scenarioMatrix, resolveMaze, SEEDS } from './scenarios.js'
import { classify } from './stats.js'
import { BALANCE } from '../../shared/balance.js'

const blizBase = { ...BALANCE.TOWER.BLIZZARD }
const SITINGS = ['offlane', null, 'funnel']
const mean = a => a.reduce((x, v) => x + v, 0) / (a.length || 1)

function arm(scenarios, opts) {
  const scores = []
  let hangs = 0
  for (const s of scenarios) {
    const m = runMatch({ ...s, humanElement: 'WATER', ...opts })
    if (m.timedOut || m.stalled) hangs++
    else scores.push(m.score)
  }
  return { scores, hangs }
}

for (const mazeName of ['A', 'B']) {
  const maze = resolveMaze(mazeName)
  const scenarios = scenarioMatrix({ seeds: SEEDS, maze })
  console.log(`\n=== maze ${mazeName} (gaps ${maze.gaps.join('/')}) ===`)

  const none = arm(scenarios, { fuse: false, freeSpecial: false })
  console.log(`none    score ${mean(none.scores).toFixed(3)} (n ${none.scores.length}, hangs ${none.hangs})`)

  for (const [vname, v] of [['live', {}], ['inert', { damage: 0, freeze: undefined }]]) {
    Object.assign(BALANCE.TOWER.BLIZZARD, blizBase, v)
    const cells = {}
    for (const siting of SITINGS) {
      const a = arm(scenarios, {
        fuse: true, fuseWave: 4, fuseWith: 'WIND', freeSpecialSites: siting,
      })
      const c = classify([none.scores, a.scores])
      const d = c.means[1] - c.means[0]
      cells[siting || 'tower'] = { a, txt: `${d >= 0 ? '+' : ''}${d.toFixed(3)}(t${c.t.toFixed(2)})` }
    }
    console.log(`${vname.padEnd(6)} vs none:`,
      Object.entries(cells).map(([k, r]) => `${k} ${r.txt}`).join('   '),
      `| hangs ${Object.values(cells).map(r => r.a.hangs).join('/')}`)

    // mechanic value at each siting = live - inert, printed by the caller loop
    // below via the stored scores.
    cells.__name = vname
    if (vname === 'live') globalThis.__live = cells
    else {
      for (const k of ['offlane', 'tower', 'funnel']) {
        const c = classify([cells[k].a.scores, globalThis.__live[k].a.scores])
        const d = c.means[1] - c.means[0]
        console.log(`  mechanic value (live - inert) @ ${k.padEnd(7)} ${d >= 0 ? '+' : ''}${d.toFixed(3)} (t${c.t.toFixed(2)})`)
      }
    }
  }
  Object.assign(BALANCE.TOWER.BLIZZARD, blizBase)
}
