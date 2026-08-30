#!/usr/bin/env node
// Blizzard mechanic probe (2026-08-04, Task 20 §0).
//
// Score deltas said Blizzard is worth much LESS in the lane than on the flank.
// This asks the mechanical question directly, per activation:
//   selected  the densest-cluster size found at SELECTION time
//             (selectDensestClusterCenter's bestSize)
//   resolved  bodies still inside clusterRadiusPx at RESOLUTION, 400ms later
//             — the number that actually eats damage and freeze
// A big selected/resolved gap means the telegraph is losing the cluster; a
// small `selected` means the mechanic never found a cluster worth hitting at
// that siting in the first place. Those are different problems.
//
// Usage: node test/harness/blizzardProbe.mjs

import { runMatch } from './matchRunner.js'
import { scenarioMatrix, resolveMaze, SEEDS } from './scenarios.js'

const screenSeeds = SEEDS.slice(0, 24)

for (const mazeName of ['A', 'B']) {
  const maze = resolveMaze(mazeName)
  const scenarios = scenarioMatrix({ seeds: screenSeeds, maze })
  for (const siting of ['tower', 'funnel']) {
    const freeSpecialSites = siting === 'funnel' ? 'funnel' : null
    const p = { activations: 0, selectedSize: 0, resolvedHits: 0, killed: 0, frozen: 0 }
    let runs = 0
    for (const s of scenarios) {
      runMatch({
        ...s, fuse: true, fuseWave: 4, humanElement: 'WATER', fuseWith: 'WIND',
        freeSpecialSites, tiProbe: p,
      })
      runs++
    }
    const per = k => (p.activations ? p[k] / p.activations : 0).toFixed(2)
    console.log(
      `maze ${mazeName} ${siting.padEnd(6)}`,
      `activations ${String(p.activations).padStart(5)} (${(p.activations / runs).toFixed(1)}/run)`,
      `| selected ${per('selectedSize')}`,
      `| resolved ${per('resolvedHits')}`,
      `| killed ${per('killed')}`,
      `| frozen ${per('frozen')}`)
  }
}
