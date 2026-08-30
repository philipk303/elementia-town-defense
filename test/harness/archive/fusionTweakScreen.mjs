#!/usr/bin/env node
// Screening sweep for balance tweaks on the three fusion structures with an
// unresolved reading (MUDDY_BOG: flat/inert; BLIZZARD/STEAM_VENT: sign-flips
// between flank and funnel siting, docs/reviews/2026-08-02-fusion-flank-
// siting-instrument-fix.md). Not the same defect class as Rock Trap's site
// cap (fusions build via ONE placement, not spendDown, so no self-collision
// risk) — this screens whether an analogous lever (larger effect area /
// faster cooldown, in the spirit of what fixed Rock Trap) moves each
// structure toward a stable, non-contradictory reading. wave4 timing only
// (the project's representative timing — fusing at wave1 is a known trap).
// Reduced 24-seed subset for speed; full 72-seed confirmation via
// fusionRoster.js for any promising candidate.
//
// Usage: node test/harness/fusionTweakScreen.mjs

import { runMatch } from './matchRunner.js'
import { scenarioMatrix, resolveMaze, SEEDS } from './scenarios.js'
import { classify } from './stats.js'
import { BALANCE } from '../../shared/balance.js'

const screenSeeds = SEEDS.slice(0, 24)

const FUSIONS = {
  MUDDY_BOG:  { human: 'EARTH', partner: 'WATER' },
  BLIZZARD:   { human: 'WATER', partner: 'WIND' },
  STEAM_VENT: { human: 'FIRE',  partner: 'WATER' },
}

function sweep(name, variants) {
  const { human, partner } = FUSIONS[name]
  const base = { ...BALANCE.TOWER[name] }
  console.log(`\n### ${name} (${human}+${partner}) base:`, JSON.stringify(base))

  for (const [vname, v] of Object.entries(variants)) {
    Object.assign(BALANCE.TOWER[name], base, v)
    const line = { vname }
    for (const siting of ['tower', 'funnel']) {
      const freeSpecialSites = siting === 'funnel' ? 'funnel' : null
      for (const mazeName of ['A', 'B']) {
        const maze = resolveMaze(mazeName)
        const scenarios = scenarioMatrix({ seeds: screenSeeds, maze })
        const ctrl = [], fused = []
        let hangsC = 0, hangsF = 0
        for (const s of scenarios) {
          const mC = runMatch({ ...s, fuse: false, humanElement: human, freeSpecialSites })
          const mF = runMatch({ ...s, fuse: true, fuseWave: 4, humanElement: human, fuseWith: partner, freeSpecialSites })
          if (mC.timedOut || mC.stalled) hangsC++; else ctrl.push(mC.score)
          if (mF.timedOut || mF.stalled) hangsF++; else fused.push(mF.score)
        }
        const c = classify([ctrl, fused])
        line[`${siting}-${mazeName}`] = { diff: c.means[1] - c.means[0], t: c.t, hangs: `${hangsC}/${hangsF}` }
      }
    }
    console.log(
      vname.padEnd(24),
      Object.entries(line).filter(([k]) => k !== 'vname').map(([k, r]) =>
        `${k}: ${r.diff >= 0 ? '+' : ''}${r.diff.toFixed(3)}(t${r.t.toFixed(2)})`).join('  '))
  }
  Object.assign(BALANCE.TOWER[name], base)
}

sweep('MUDDY_BOG', {
  baseline: {},
  biggerPulse: { pulse: { damage: 14, ms: 500 } },
  fasterPulse: { pulse: { damage: 8, ms: 300 } },
  longerRoot: { root: { msByWeight: [1020, 2040, 3060, 4080] } },
})

sweep('BLIZZARD', {
  baseline: {},
  biggerCluster: { clusterRadiusPx: 90 },
  fasterCooldown: { cooldownMs: 3800 },
  biggerCluster_fasterCooldown: { clusterRadiusPx: 90, cooldownMs: 3800 },
})

sweep('STEAM_VENT', {
  baseline: {},
  fasterPulse: { pulse: { damage: 25, ms: 350 } },
  longerConfuse: { confuse: { ms: 1800 } },
  fasterPulse_longerConfuse: { pulse: { damage: 25, ms: 350 }, confuse: { ms: 1800 } },
})
