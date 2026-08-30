#!/usr/bin/env node
// Grinder root-RADIUS sweep (2026-08-29). Validates the intended design:
// "suction toward the centre, rooted THERE for 2s with damage, then spat
// out" — as opposed to what currently ships, which roots on crossing into
// the 160px suction edge, i.e. wherever the enemy happened to be caught.
//
// The decomposition already hinted the edge is wrong: root-alone measured
// HARMFUL (-0.262, t 2.83 maze A) with the stated mechanism being "a frozen
// enemy is parked wherever it was caught, and the pull is weaker than
// walking, so freezing at the edge REDUCES arrivals at the core." If that
// reading is right, shrinking rootRadiusPx toward the centre should (a) raise
// the fraction of pulled enemies that reach the crush zone, and (b) improve
// the outcome. Both are reported, so the mechanism and the result are checked
// together rather than one being inferred from the other.
//
// Reports hangs explicitly (rooting in a lane is soft-lock shaped).
//
// Usage: node test/harness/archive/grinderRootRadius.js [--seeds N] [--radii 55,80,110,160]

import { runMatch } from '../matchRunner.js'
import { scenarioMatrix, resolveMaze, SEEDS } from '../scenarios.js'
import { classify } from '../stats.js'
import { BALANCE } from '../../../shared/balance.js'

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 || i === process.argv.length - 1 ? fallback : process.argv[i + 1]
}

const seeds = SEEDS.slice(0, parseInt(arg('seeds', '72'), 10))
const radii = arg('radii', '55,80,110,160').split(',').map(Number)

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
const saved = { rootRadiusPx: G.rootRadiusPx, contactDps: G.contactDps }

try {
  for (const mazeName of ['A', 'B']) {
    const maze = resolveMaze(mazeName)
    const scenarios = scenarioMatrix({ seeds, maze })
    console.log(`\n=== MAZE ${mazeName} — root radius sweep, Grinder vs its two ingredients ===`)

    for (const radius of radii) {
      G.rootRadiusPx = radius

      const ctrl = [], fused = []
      let hangs = 0, better = 0, worse = 0, tied = 0
      let pulled = 0, landed = 0
      for (const s of scenarios) {
        const common = { seed: s.seed, postGap: s.postGap, maze, humanElement: 'EARTH', spendDown: true, maxWaves: 10, freeSpecial: true }
        const mC = runMatch({ ...common, fuse: false, partnerSpecial: 'WIND' })
        const mF = runMatch({ ...common, fuse: true, fuseWith: 'WIND' })
        if (mC.timedOut || mC.stalled || mF.timedOut || mF.stalled) { hangs++; continue }
        const a = hallHpAuc(mC), b = hallHpAuc(mF)
        if (a === undefined || b === undefined) { hangs++; continue }
        ctrl.push(a); fused.push(b)
        if (b > a) better++; else if (b < a) worse++; else tied++
        const g = mF.grinderStats
        if (g) { pulled += g.pulled; landed += g.pulledAndCrushed }
      }

      const c = classify([ctrl, fused])
      const diff = c.means[1] - c.means[0]
      console.log(`  rootRadius=${String(radius).padStart(3)}px  n=${ctrl.length} hangs=${hangs}` +
        `  diff=${diff >= 0 ? '+' : ''}${diff.toFixed(3)} (t ${c.t === Infinity ? 'inf' : c.t.toFixed(2)})` +
        `  signs ${better}/${worse}/${tied}  pullLanding=${pulled ? (landed / pulled * 100).toFixed(1) + '%' : 'n/a'}`)
    }

    // The landing-rate column above is confounded by contact damage (enemies
    // killed in the field never reach the crush, so they never count as
    // landed). Re-take it with damage OFF, which is the clean read of the
    // mechanism claim: does a tighter root radius get more enemies to the core?
    console.log(`  -- landing rate with contact damage OFF (unconfounded) --`)
    G.contactDps = 0
    for (const radius of radii) {
      G.rootRadiusPx = radius
      let pulled = 0, landed = 0, hangs = 0
      for (const s of scenarios) {
        const m = runMatch({ seed: s.seed, postGap: s.postGap, maze, humanElement: 'EARTH', spendDown: true, maxWaves: 10, freeSpecial: true, fuse: true, fuseWith: 'WIND' })
        if (m.timedOut || m.stalled) { hangs++; continue }
        const g = m.grinderStats
        if (g) { pulled += g.pulled; landed += g.pulledAndCrushed }
      }
      console.log(`     rootRadius=${String(radius).padStart(3)}px  pullLanding=${pulled ? (landed / pulled * 100).toFixed(1) + '%' : 'n/a'}  (pulled ${pulled}, landed ${landed}, hangs ${hangs})`)
    }
    G.contactDps = saved.contactDps
  }
} finally {
  Object.assign(G, saved)
  if (saved.rootRadiusPx === undefined) delete G.rootRadiusPx
}
