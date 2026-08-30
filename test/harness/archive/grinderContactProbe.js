#!/usr/bin/env node
// Grinder contact-damage probe (2026-08-29). Measures what the new
// `grind.contactDps` dial is actually worth, against the two-ingredient
// control, on the adopted hallHpAuc metric.
//
// The contrast is PAIRED on seed+postGap+maze, and the dial is swept in the
// same process so the two dose levels see byte-identical fixtures. dose 0
// reproduces the pre-2026-08-29 Grinder exactly (the documented off switch),
// so the 0 row IS the historical baseline, re-taken rather than cited.
//
// Also reports the pull-to-crush landing rate at each dose, since that is the
// number the change exists to address -- contact damage should NOT move it
// (it does not touch the pull or the crush gate), and a moved value would
// mean the change did something unintended.
//
// NOT a test file (no .test.js suffix) -- same convention as occupancyCheck.js.
//
// Usage: node test/harness/archive/grinderContactProbe.js [--seeds N] [--doses 0,20]

import { runMatch } from '../matchRunner.js'
import { scenarioMatrix, resolveMaze, SEEDS } from '../scenarios.js'
import { classify } from '../stats.js'
import { BALANCE } from '../../../shared/balance.js'

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 || i === process.argv.length - 1 ? fallback : process.argv[i + 1]
}

const seeds = SEEDS.slice(0, parseInt(arg('seeds', '72'), 10))
const doses = arg('doses', '0,20').split(',').map(Number)

// Same derivation analyze.mjs uses for the adopted metric.
function hallHpAuc(m) {
  if (!m.waves?.length) return undefined
  let area = 0
  for (const w of m.waves) {
    if (!Number.isFinite(w.hallHpFracStart) || !Number.isFinite(w.hallHpFrac)) return undefined
    area += (w.hallHpFracStart + w.hallHpFrac) / 2
  }
  return area
}

const saved = BALANCE.TOWER.GRINDER.grind.contactDps
try {
  for (const mazeName of ['A', 'B']) {
    const maze = resolveMaze(mazeName)
    const scenarios = scenarioMatrix({ seeds, maze })
    console.log(`\n=== MAZE ${mazeName} — Grinder (EARTH+WIND) vs its two ingredients ===`)

    for (const dose of doses) {
      BALANCE.TOWER.GRINDER.grind.contactDps = dose

      const ctrl = [], fused = []
      let hangs = 0, pulled = 0, crushed = 0, landed = 0
      for (const s of scenarios) {
        const common = { seed: s.seed, postGap: s.postGap, maze, humanElement: 'EARTH', spendDown: true, maxWaves: 10, freeSpecial: true }
        const mC = runMatch({ ...common, fuse: false, partnerSpecial: 'WIND' })
        const mF = runMatch({ ...common, fuse: true, fuseWith: 'WIND' })
        if (mC.timedOut || mC.stalled || mF.timedOut || mF.stalled) { hangs++; continue }
        const a = hallHpAuc(mC), b = hallHpAuc(mF)
        if (a === undefined || b === undefined) { hangs++; continue }
        ctrl.push(a); fused.push(b)
        const g = mF.grinderStats
        if (g) { pulled += g.pulled; crushed += g.crushed; landed += g.pulledAndCrushed }
      }

      const c = classify([ctrl, fused])
      const diff = c.means[1] - c.means[0]
      const t = c.t === Infinity ? 'inf' : c.t.toFixed(2)
      console.log(`  contactDps=${String(dose).padStart(3)}  n=${ctrl.length} hangs=${hangs}` +
        `  control=${c.means[0].toFixed(3)}  grinder=${c.means[1].toFixed(3)}` +
        `  diff=${diff >= 0 ? '+' : ''}${diff.toFixed(3)} (t ${t})` +
        `  pullLanding=${pulled ? (landed / pulled * 100).toFixed(1) + '%' : 'n/a'}`)
    }
  }
} finally {
  BALANCE.TOWER.GRINDER.grind.contactDps = saved
}
