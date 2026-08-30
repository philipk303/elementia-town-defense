#!/usr/bin/env node
// Structure-occupancy audit (2026-08-29) — step 2. Measures real occupancy
// for the two exact-footprint fusions (Muddy Bog / areaEntry, Magma Trap /
// entryTrigger) using the areaEntryStats/entryTriggerStats instrumentation
// just added to matchRunner.js, the same idiom as Firepit's aoeStats.
// See docs/handoffs/2026-08-29-structure-occupancy-audit.md.
//
// NOT a test file (no .test.js suffix) — same convention as firepitRetest.js.
// Read-only measurement script: runs matches directly via runMatch, no store
// write, no comparison arm needed since this asks "does the enemy path reach
// it," not "is it worth its cost."
//
// Usage: node test/harness/archive/occupancyCheck.js [--seeds N]

import { runMatch } from '../matchRunner.js'
import { scenarioMatrix, resolveMaze, SEEDS } from '../scenarios.js'

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 || i === process.argv.length - 1 ? fallback : process.argv[i + 1]
}

const seedCount = parseInt(arg('seeds', '72'), 10)
const seeds = SEEDS.slice(0, seedCount)

const FUSIONS = [
  { label: 'Muddy Bog (EARTH+WATER)', humanElement: 'EARTH', fuseWith: 'WATER', ticksField: 'areaEntryActiveTicks', secField: 'areaEntryEnemySeconds' },
  { label: 'Magma Trap (EARTH+FIRE)', humanElement: 'EARTH', fuseWith: 'FIRE', ticksField: 'entryTriggerActiveTicks', secField: 'entryTriggerEnemySeconds' },
]

for (const fusion of FUSIONS) {
  console.log(`\n=== ${fusion.label} ===`)
  for (const mazeName of ['A', 'B']) {
    const maze = resolveMaze(mazeName)
    const scenarios = scenarioMatrix({ seeds, maze })

    let n = 0, hangs = 0, sumFight = 0, sumActive = 0, sumEnemySec = 0, sumFieldSec = 0, zeroActive = 0

    for (const s of scenarios) {
      const m = runMatch({
        seed: s.seed, postGap: s.postGap, maze,
        humanElement: fusion.humanElement,
        fuse: true, fuseWith: fusion.fuseWith,
        spendDown: true, maxWaves: 10,
      })
      if (m.timedOut || m.stalled) { hangs++; continue }
      n++
      sumFight += m.fightTicks
      sumActive += m[fusion.ticksField] ?? 0
      sumEnemySec += m.enemySeconds
      sumFieldSec += m[fusion.secField] ?? 0
      if ((m[fusion.ticksField] ?? 0) === 0) zeroActive++
    }

    console.log(`  maze ${mazeName}: n=${n} hangs=${hangs}`)
    console.log(`    fraction of fight-ticks occupied: ${(sumActive / sumFight).toFixed(4)}`)
    console.log(`    fraction of enemy-seconds in footprint: ${(sumFieldSec / sumEnemySec).toFixed(4)}`)
    console.log(`    matches with ZERO occupancy: ${zeroActive}/${n} = ${(zeroActive / n).toFixed(3)}`)
  }
}
