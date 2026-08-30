#!/usr/bin/env node
// Grinder rootMs sweep (2026-08-29). The one shipped Grinder dial that has
// NEVER been swept: 2000 is Philip's requested "2 sec", taken on faith while
// rootRadiusPx and contactRadiusPx were both tuned around it.
//
// Run with the shipped geometry (rootRadiusPx 55, contactDps 20 @160) so this
// isolates duration alone. Reports hangs prominently: a longer root is a
// longer lockdown, and this project has three documented soft-lock classes —
// if hangs appear at the top of the ladder that is the finding, not a
// footnote.
//
// Also reports the unconfounded pull-landing rate (contact damage OFF) per
// dose, so the mechanism and the outcome are checked together rather than one
// being inferred from the other.
//
// Usage: node test/harness/archive/grinderRootMs.js [--seeds N] [--doses 0,500,1000,2000,3000,4000]

import { runMatch } from '../matchRunner.js'
import { scenarioMatrix, resolveMaze, SEEDS } from '../scenarios.js'
import { classify } from '../stats.js'
import { BALANCE } from '../../../shared/balance.js'

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 || i === process.argv.length - 1 ? fallback : process.argv[i + 1]
}

const seeds = SEEDS.slice(0, parseInt(arg('seeds', '72'), 10))
const doses = arg('doses', '0,500,1000,2000,3000,4000').split(',').map(Number)

function hallHpAuc(m) {
  if (!m.waves?.length) return undefined
  let area = 0
  for (const w of m.waves) {
    if (!Number.isFinite(w.hallHpFracStart) || !Number.isFinite(w.hallHpFrac)) return undefined
    area += (w.hallHpFracStart + w.hallHpFrac) / 2
  }
  return area
}

const G = BALANCE.TOWER.GRINDER.grind
const saved = { rootMs: G.rootMs, contactDps: G.contactDps }

try {
  for (const mazeName of ['A', 'B']) {
    const maze = resolveMaze(mazeName)
    const scenarios = scenarioMatrix({ seeds, maze })
    console.log(`\n=== MAZE ${mazeName} — rootMs sweep, Grinder vs its two ingredients ===`)
    console.log(`    (rootRadiusPx=${G.rootRadiusPx}, contactDps=${saved.contactDps}, contactRadiusPx=${G.contactRadiusPx})`)

    for (const dose of doses) {
      G.rootMs = dose
      G.contactDps = saved.contactDps

      const ctrl = [], fused = []
      let hangs = 0, better = 0, worse = 0, tied = 0
      for (const s of scenarios) {
        const common = { seed: s.seed, postGap: s.postGap, maze, humanElement: 'EARTH', spendDown: true, maxWaves: 10, freeSpecial: true }
        const mC = runMatch({ ...common, fuse: false, partnerSpecial: 'WIND' })
        const mF = runMatch({ ...common, fuse: true, fuseWith: 'WIND' })
        if (mC.timedOut || mC.stalled || mF.timedOut || mF.stalled) { hangs++; continue }
        const a = hallHpAuc(mC), b = hallHpAuc(mF)
        if (a === undefined || b === undefined) { hangs++; continue }
        ctrl.push(a); fused.push(b)
        if (b > a) better++; else if (b < a) worse++; else tied++
      }

      // Unconfounded landing rate: contact damage off, same dose.
      G.contactDps = 0
      let pulled = 0, landed = 0
      for (const s of scenarios) {
        const m = runMatch({ seed: s.seed, postGap: s.postGap, maze, humanElement: 'EARTH', spendDown: true, maxWaves: 10, freeSpecial: true, fuse: true, fuseWith: 'WIND' })
        if (m.timedOut || m.stalled) continue
        const g = m.grinderStats
        if (g) { pulled += g.pulled; landed += g.pulledAndCrushed }
      }

      const c = classify([ctrl, fused])
      const diff = c.means[1] - c.means[0]
      const flag = hangs > 0 ? '  <-- HANGS' : ''
      console.log(`  rootMs=${String(dose).padStart(4)}  n=${ctrl.length} hangs=${hangs}` +
        `  diff=${diff >= 0 ? '+' : ''}${diff.toFixed(3)} (t ${c.t === Infinity ? 'inf' : c.t.toFixed(2)})` +
        `  signs ${better}/${worse}/${tied}  landing=${pulled ? (landed / pulled * 100).toFixed(1) + '%' : 'n/a'}${flag}`)
    }
  }
} finally {
  Object.assign(G, saved)
}
