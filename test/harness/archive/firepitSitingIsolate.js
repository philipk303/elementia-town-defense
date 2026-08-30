#!/usr/bin/env node
// Isolates WHICH siting mechanism a Firepit occupancy number came from
// (2026-08-29 follow-up, after Philip's question exposed a confound in the
// original step-1 read). Two placement paths exist in this harness:
//  (a) freeSpecial: true, humanElement:'FIRE' -- single placement, the
//      anchor site list (isolatedSpecialSites, dy 1-4, one column).
//  (b) defence:'FIRE_SPECIAL', spendDown:true -- the walkable-defence loop,
//      dy 1-10, builds as many as gold allows.
// Both use the SAME column per walkableDefenceSites' own comment, but (b)
// reaches twice as deep and builds many copies instead of one.

import { runMatch } from '../matchRunner.js'
import { scenarioMatrix, resolveMaze, SEEDS } from '../scenarios.js'

const seeds = SEEDS.slice(0, 72)

function summarize(records) {
  let n = 0, sumFight = 0, sumActive = 0, sumEnemySec = 0, sumFieldSec = 0, zero = 0
  for (const m of records) {
    n++
    sumFight += m.fightTicks
    sumActive += m.aoeActiveTicks ?? 0
    sumEnemySec += m.enemySeconds
    sumFieldSec += m.aoeEnemySeconds ?? 0
    if ((m.aoeActiveTicks ?? 0) === 0) zero++
  }
  return { n, occTicks: sumActive / sumFight, occSec: sumFieldSec / sumEnemySec, zeroFrac: zero / n }
}

for (const mazeName of ['A', 'B']) {
  const maze = resolveMaze(mazeName)
  const scenarios = scenarioMatrix({ seeds, maze })
  const anchorRuns = [], defenceRuns = []
  for (const s of scenarios) {
    const common = { seed: s.seed, postGap: s.postGap, maze, spendDown: true, maxWaves: 10 }
    const mAnchor = runMatch({ ...common, humanElement: 'FIRE', freeSpecial: true, fuse: false })
    const mDefence = runMatch({ ...common, humanElement: 'EARTH', defence: 'FIRE_SPECIAL', freeSpecial: false, fuse: false })
    if (!mAnchor.timedOut && !mAnchor.stalled) anchorRuns.push(mAnchor)
    if (!mDefence.timedOut && !mDefence.stalled) defenceRuns.push(mDefence)
  }
  const a = summarize(anchorRuns), d = summarize(defenceRuns)
  console.log(`maze ${mazeName}:`)
  console.log(`  anchor (freeSpecial, single, dy1-4):   n=${a.n}  occTicks=${a.occTicks.toFixed(4)}  zeroOccupancy=${(a.zeroFrac * 100).toFixed(1)}%`)
  console.log(`  defence (spendDown, many, dy1-10):     n=${d.n}  occTicks=${d.occTicks.toFixed(4)}  zeroOccupancy=${(d.zeroFrac * 100).toFixed(1)}%`)
}
