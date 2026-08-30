#!/usr/bin/env node
// Is the "siting" A/B actually measuring WATCHTOWER displacement? (2026-08-04,
// Task 20 §0, final test.)
//
// laneCoverageSweep.mjs (maze A, n=144) found an INERT fusion — damage 0,
// freeze off — swinging 0.83 score points on position alone: offlane -0.767,
// tower +0.061, funnel -0.575. An inert walkable body has almost no way to
// affect a match... except that it CONSUMES A BUILD TILE, and the scripted
// policy's Watchtower — which IS blocking, and therefore reshapes the cost
// field — takes the first free `towerSites` entry after it.
//
// Maze A, gap column 13, top-left anchors, 2-wide footprints:
//   tower   anchor (12,9) covers 12-13 -> blocks towerSites 12 -> towers go EAST to col 14
//   funnel  anchor (13,9) covers 13-14 -> blocks towerSites 14 -> towers go WEST to col 12
//   offlane anchor (14,9) covers 14-15 -> blocks towerSites 14 -> towers go WEST to col 12
// The two arms that push towers WEST (funnel, offlane) both score badly; the
// one that pushes them EAST (tower) does not. The scores track the WATCHTOWER
// column, not the fusion's column.
//
// This removes Watchtowers from the policy entirely by pricing them out of
// reach, so the fusion's own tile is the only thing that differs between arms.
// If the spread collapses, the published flank-vs-funnel numbers are an
// artifact of where the tower went, not a property of the fusion.
//
// Usage: node test/harness/sitingConfoundTest.mjs

import { runMatch } from './matchRunner.js'
import { scenarioMatrix, resolveMaze, SEEDS } from './scenarios.js'
import { classify } from './stats.js'
import { BALANCE } from '../../shared/balance.js'

const blizBase = { ...BALANCE.TOWER.BLIZZARD }
const towerCost = BALANCE.STRUCTURES.WATCHTOWER.cost
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

const maze = resolveMaze('A')
const scenarios = scenarioMatrix({ seeds: SEEDS, maze })

for (const towers of [true, false]) {
  BALANCE.STRUCTURES.WATCHTOWER.cost = towers ? towerCost : 9999
  console.log(`\n=== maze A — watchtowers ${towers ? 'ON (published policy)' : 'PRICED OUT'} ===`)
  const none = arm(scenarios, { fuse: false, freeSpecial: false })
  console.log(`none    score ${mean(none.scores).toFixed(3)}`)

  for (const [vname, v] of [['live', {}], ['inert', { damage: 0, freeze: undefined }]]) {
    Object.assign(BALANCE.TOWER.BLIZZARD, blizBase, v)
    const out = []
    for (const siting of ['offlane', null, 'funnel']) {
      const a = arm(scenarios, { fuse: true, fuseWave: 4, fuseWith: 'WIND', freeSpecialSites: siting })
      const c = classify([none.scores, a.scores])
      const d = c.means[1] - c.means[0]
      out.push(`${(siting || 'tower').padEnd(7)} ${d >= 0 ? '+' : ''}${d.toFixed(3)}(t${c.t.toFixed(2)})`)
    }
    console.log(`${vname.padEnd(6)} vs none:`, out.join('  '))
  }
  Object.assign(BALANCE.TOWER.BLIZZARD, blizBase)
}
BALANCE.STRUCTURES.WATCHTOWER.cost = towerCost
