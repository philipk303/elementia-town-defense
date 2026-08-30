#!/usr/bin/env node
// Structure-occupancy audit (2026-08-29) — steps 3 & 4. Step 3: for the
// range/radius families, a single "did any enemy ever come within reach"
// check per match (towers.js's sampleRangeReach / state.rangeStats) — cheaper
// than the per-tick occupancy accumulator steps 1/2 used, per the handoff's
// own instruction that this tier doesn't need full occupancy tracking. Step
// 4: Grinder's pull-vs-crush landing rate (cycle.js's grinderStats), already
// documented as broken in shared/balance.js's GRINDER comment.
// See docs/handoffs/2026-08-29-structure-occupancy-audit.md.
//
// NOT a test file (no .test.js suffix) — same convention as occupancyCheck.js.
//
// Usage: node test/harness/archive/rangeReachCheck.js [--seeds N]

import { runMatch } from '../matchRunner.js'
import { scenarioMatrix, resolveMaze, SEEDS } from '../scenarios.js'

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 || i === process.argv.length - 1 ? fallback : process.argv[i + 1]
}

const seedCount = parseInt(arg('seeds', '72'), 10)
const seeds = SEEDS.slice(0, seedCount)

// Step 3: plain defence-slot structures (no fusion needed — `defence` accepts
// any BALANCE.STRUCTURES key).
const DEFENCE_STRUCTURES = [
  { label: 'Watchtower', defence: 'WATCHTOWER' },
  { label: 'Rock Trap (EARTH_SPECIAL)', defence: 'EARTH_SPECIAL' },
  { label: 'Snare Post', defence: 'SNARE_POST' },
  { label: 'Wind Vortex (WIND_SPECIAL)', defence: 'WIND_SPECIAL' },
]

// Step 3: fusions that live in the range/radius tier, not the exact-footprint
// tier already covered by occupancyCheck.js.
const RANGE_FUSIONS = [
  { label: 'Firestorm (FIRE+WIND)', humanElement: 'FIRE', fuseWith: 'WIND' },
  { label: 'Blizzard (WATER+WIND)', humanElement: 'WATER', fuseWith: 'WIND' },
]

function runReach(label, protocolExtra) {
  console.log(`\n=== ${label} ===`)
  for (const mazeName of ['A', 'B']) {
    const maze = resolveMaze(mazeName)
    const scenarios = scenarioMatrix({ seeds, maze })
    let n = 0, hangs = 0, everInRange = 0
    for (const s of scenarios) {
      const m = runMatch({
        seed: s.seed, postGap: s.postGap, maze,
        spendDown: true, maxWaves: 10,
        ...protocolExtra,
      })
      if (m.timedOut || m.stalled) { hangs++; continue }
      n++
      const anyTrue = (m.rangeReach ?? []).some(r => r.everInRange)
      if (anyTrue) everInRange++
    }
    console.log(`  maze ${mazeName}: n=${n} hangs=${hangs}  everInRange=${everInRange}/${n} = ${(everInRange / n).toFixed(3)}`)
  }
}

for (const d of DEFENCE_STRUCTURES) {
  runReach(d.label, { defence: d.defence, freeSpecial: false, fuse: false, humanElement: 'EARTH' })
}
for (const f of RANGE_FUSIONS) {
  runReach(f.label, { humanElement: f.humanElement, fuse: true, fuseWith: f.fuseWith })
}

// Step 4: Grinder pull-vs-crush landing rate.
console.log(`\n=== Grinder (EARTH+WIND) pull-vs-crush landing rate ===`)
for (const mazeName of ['A', 'B']) {
  const maze = resolveMaze(mazeName)
  const scenarios = scenarioMatrix({ seeds, maze })
  let n = 0, hangs = 0, cycles = 0, pulled = 0, crushed = 0, pulledAndCrushed = 0, cyclesWithZeroCrush = 0
  for (const s of scenarios) {
    const m = runMatch({
      seed: s.seed, postGap: s.postGap, maze,
      humanElement: 'EARTH', fuse: true, fuseWith: 'WIND',
      spendDown: true, maxWaves: 10,
    })
    if (m.timedOut || m.stalled) { hangs++; continue }
    n++
    const g = m.grinderStats
    if (!g) continue
    cycles += g.cycles
    pulled += g.pulled
    crushed += g.crushed
    pulledAndCrushed += g.pulledAndCrushed
  }
  console.log(`  maze ${mazeName}: n=${n} hangs=${hangs}  cycles=${cycles}`)
  console.log(`    total pulled (outer radius, this cycle): ${pulled}`)
  console.log(`    total crushed (inner radius at crush resolution): ${crushed}`)
  console.log(`    of those pulled, fraction that landed in the crush zone: ${pulled > 0 ? (pulledAndCrushed / pulled).toFixed(4) : 'n/a'}`)
  console.log(`    of those crushed, fraction that had been pulled this cycle: ${crushed > 0 ? (pulledAndCrushed / crushed).toFixed(4) : 'n/a'}`)
}
