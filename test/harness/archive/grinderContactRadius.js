#!/usr/bin/env node
// Grinder contact-RADIUS probe (2026-08-29). Tests the dwell-time hypothesis
// the contactDps dose ladder produced: sweeping dps 10->40 barely moved
// hallHpAuc, which means damage rate is not the binding constraint. If dwell
// time is, widening the contact radius should move the number where more
// damage did not.
//
// Paired against contact damage OFF, on the same seeds, same as
// grinderContactDirect.js -- the contrast that decides whether the dial earns
// its place, not a vs-control reading.
//
// Usage: node test/harness/archive/grinderContactRadius.js [--seeds N] [--dps 20] [--radii 55,80,110,160]

import { runMatch } from '../matchRunner.js'
import { scenarioMatrix, resolveMaze, SEEDS } from '../scenarios.js'
import { classify } from '../stats.js'
import { BALANCE } from '../../../shared/balance.js'

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 || i === process.argv.length - 1 ? fallback : process.argv[i + 1]
}

const seeds = SEEDS.slice(0, parseInt(arg('seeds', '72'), 10))
const dps = Number(arg('dps', '20'))
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
const savedDps = G.contactDps
const savedRadius = G.contactRadiusPx

try {
  for (const mazeName of ['A', 'B']) {
    const maze = resolveMaze(mazeName)
    const scenarios = scenarioMatrix({ seeds, maze })
    console.log(`\n=== MAZE ${mazeName} — contact radius sweep at ${dps} dps, paired vs contact OFF ===`)

    for (const radius of radii) {
      const off = [], on = []
      let hangs = 0, better = 0, worse = 0, tied = 0
      for (const s of scenarios) {
        const common = { seed: s.seed, postGap: s.postGap, maze, humanElement: 'EARTH', spendDown: true, maxWaves: 10, freeSpecial: true, fuse: true, fuseWith: 'WIND' }
        G.contactDps = 0
        const mOff = runMatch({ ...common })
        G.contactDps = dps
        G.contactRadiusPx = radius
        const mOn = runMatch({ ...common })
        if (mOff.timedOut || mOff.stalled || mOn.timedOut || mOn.stalled) { hangs++; continue }
        const a = hallHpAuc(mOff), b = hallHpAuc(mOn)
        if (a === undefined || b === undefined) { hangs++; continue }
        off.push(a); on.push(b)
        if (b > a) better++; else if (b < a) worse++; else tied++
      }
      const c = classify([off, on])
      const diff = c.means[1] - c.means[0]
      console.log(`  radius=${String(radius).padStart(3)}px  off=${c.means[0].toFixed(3)}  on=${c.means[1].toFixed(3)}` +
        `  diff=${diff >= 0 ? '+' : ''}${diff.toFixed(3)} (t ${c.t === Infinity ? 'inf' : c.t.toFixed(2)})` +
        `  signs ${better}/${worse}/${tied}`)
    }
  }
} finally {
  G.contactDps = savedDps
  G.contactRadiusPx = savedRadius
}
