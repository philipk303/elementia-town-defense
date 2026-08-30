#!/usr/bin/env node
// Grinder mechanism decomposition (2026-08-29). The radius sweep showed
// contact damage at 160px is worth a lot WITH root capture and nothing
// WITHOUT it, but that is a joint reading -- it cannot say which of the two
// is carrying the result, and shipping two dials on one measurement is how
// this project ended up with the Steam Vent confusion mechanic (inert, but
// bundled with something that worked, so nobody noticed for weeks; see
// docs/reviews/2026-08-15-steam-vent-mechanism.md).
//
// Four arms, each paired on seed+postGap+maze against the SAME
// two-ingredient control (the contrast spec §1 actually asks for):
//   base     — rootMs 0, contactDps 0   (the pre-2026-08-29 Grinder)
//   root     — rootMs 2000, contactDps 0
//   contact  — rootMs 0, contactDps 20 @160px
//   both     — the shipped config
//
// Reports hangs explicitly: rooting enemies in a lane is the exact shape of
// this project's three documented soft-lock classes, so a hang count that
// moves is a stop signal, not a footnote.
//
// Usage: node test/harness/archive/grinderMechanismDecompose.js [--seeds N]

import { runMatch } from '../matchRunner.js'
import { scenarioMatrix, resolveMaze, SEEDS } from '../scenarios.js'
import { classify } from '../stats.js'
import { BALANCE } from '../../../shared/balance.js'

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 || i === process.argv.length - 1 ? fallback : process.argv[i + 1]
}

const seeds = SEEDS.slice(0, parseInt(arg('seeds', '72'), 10))

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
const saved = { rootMs: G.rootMs, contactDps: G.contactDps, contactRadiusPx: G.contactRadiusPx }

const ARMS = [
  { id: 'base    ', rootMs: 0,    contactDps: 0 },
  { id: 'root    ', rootMs: 2000, contactDps: 0 },
  { id: 'contact ', rootMs: 0,    contactDps: 20 },
  { id: 'both    ', rootMs: 2000, contactDps: 20 },
]

try {
  for (const mazeName of ['A', 'B']) {
    const maze = resolveMaze(mazeName)
    const scenarios = scenarioMatrix({ seeds, maze })
    console.log(`\n=== MAZE ${mazeName} — Grinder vs its two ingredients, by mechanism ===`)

    for (const arm of ARMS) {
      G.rootMs = arm.rootMs
      G.contactDps = arm.contactDps
      G.contactRadiusPx = 160

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

      const c = classify([ctrl, fused])
      const diff = c.means[1] - c.means[0]
      console.log(`  ${arm.id} n=${ctrl.length} hangs=${hangs}  control=${c.means[0].toFixed(3)}  grinder=${c.means[1].toFixed(3)}` +
        `  diff=${diff >= 0 ? '+' : ''}${diff.toFixed(3)} (t ${c.t === Infinity ? 'inf' : c.t.toFixed(2)})  signs ${better}/${worse}/${tied}`)
    }
  }
} finally {
  Object.assign(G, saved)
}
