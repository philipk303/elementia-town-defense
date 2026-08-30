#!/usr/bin/env node
// Structure-occupancy audit (2026-08-29) — follow-up to steps 1-4. Water
// Geyser and Steam Vent were flagged in the handoff's classification table
// as sharing Firepit's exposure (footprint + margin / non-crossing target
// selection), but were never measured. Same idiom as occupancyCheck.js:
// activeTicks/enemySeconds via state.displaceStats (Water Geyser) and
// state.scaldFieldStats (Steam Vent).
//
// NOT a test file (no .test.js suffix) — same convention as occupancyCheck.js.
//
// Usage: node test/harness/archive/occupancyCheck2.js [--seeds N]

import { runMatch } from '../matchRunner.js'
import { scenarioMatrix, resolveMaze, SEEDS } from '../scenarios.js'

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 || i === process.argv.length - 1 ? fallback : process.argv[i + 1]
}

const seedCount = parseInt(arg('seeds', '72'), 10)
const seeds = SEEDS.slice(0, seedCount)

// Water Geyser is a plain special (WATER_SPECIAL), not a fusion — build it
// via `defence` like the range-based structures in rangeReachCheck.js.
function runWaterGeyser() {
  console.log(`\n=== Water Geyser (WATER_SPECIAL) ===`)
  for (const mazeName of ['A', 'B']) {
    const maze = resolveMaze(mazeName)
    const scenarios = scenarioMatrix({ seeds, maze })
    let n = 0, hangs = 0, sumFight = 0, sumActive = 0, sumEnemySec = 0, sumFieldSec = 0, zeroActive = 0
    for (const s of scenarios) {
      const m = runMatch({
        seed: s.seed, postGap: s.postGap, maze,
        defence: 'WATER_SPECIAL', freeSpecial: false, fuse: false, humanElement: 'EARTH',
        spendDown: true, maxWaves: 10,
      })
      if (m.timedOut || m.stalled) { hangs++; continue }
      n++
      sumFight += m.fightTicks
      sumActive += m.displaceActiveTicks ?? 0
      sumEnemySec += m.enemySeconds
      sumFieldSec += m.displaceEnemySeconds ?? 0
      if ((m.displaceActiveTicks ?? 0) === 0) zeroActive++
    }
    console.log(`  maze ${mazeName}: n=${n} hangs=${hangs}`)
    console.log(`    fraction of fight-ticks occupied: ${(sumActive / sumFight).toFixed(4)}`)
    console.log(`    fraction of enemy-seconds in footprint: ${(sumFieldSec / sumEnemySec).toFixed(4)}`)
    console.log(`    matches with ZERO occupancy: ${zeroActive}/${n} = ${(zeroActive / n).toFixed(3)}`)
  }
}

// Steam Vent is a fusion (FIRE+WATER).
function runSteamVent() {
  console.log(`\n=== Steam Vent (FIRE+WATER) ===`)
  for (const mazeName of ['A', 'B']) {
    const maze = resolveMaze(mazeName)
    const scenarios = scenarioMatrix({ seeds, maze })
    let n = 0, hangs = 0, sumFight = 0, sumActive = 0, sumEnemySec = 0, sumFieldSec = 0, zeroActive = 0
    for (const s of scenarios) {
      const m = runMatch({
        seed: s.seed, postGap: s.postGap, maze,
        humanElement: 'FIRE', fuse: true, fuseWith: 'WATER',
        spendDown: true, maxWaves: 10,
      })
      if (m.timedOut || m.stalled) { hangs++; continue }
      n++
      sumFight += m.fightTicks
      sumActive += m.scaldFieldActiveTicks ?? 0
      sumEnemySec += m.enemySeconds
      sumFieldSec += m.scaldFieldEnemySeconds ?? 0
      if ((m.scaldFieldActiveTicks ?? 0) === 0) zeroActive++
    }
    console.log(`  maze ${mazeName}: n=${n} hangs=${hangs}`)
    console.log(`    fraction of fight-ticks occupied: ${(sumActive / sumFight).toFixed(4)}`)
    console.log(`    fraction of enemy-seconds in cloud: ${(sumFieldSec / sumEnemySec).toFixed(4)}`)
    console.log(`    matches with ZERO occupancy: ${zeroActive}/${n} = ${(zeroActive / n).toFixed(3)}`)
  }
}

runWaterGeyser()
runSteamVent()
