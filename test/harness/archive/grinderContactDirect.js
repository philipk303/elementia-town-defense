#!/usr/bin/env node
// Direct paired A/B on the contact-damage dial itself (2026-08-29).
// grinderContactProbe.js measures each dose AGAINST THE CONTROL, which cannot
// say whether one dose beats another -- two overlapping vs-control readings
// are not a comparison. This runs the Grinder against ITSELF at two doses,
// paired on seed+postGap+maze, which is the contrast that actually decides
// whether `grind.contactDps` earns its place.
//
// Usage: node test/harness/archive/grinderContactDirect.js [--seeds N] [--a 0] [--b 20]

import { runMatch } from '../matchRunner.js'
import { scenarioMatrix, resolveMaze, SEEDS } from '../scenarios.js'
import { classify } from '../stats.js'
import { BALANCE } from '../../../shared/balance.js'

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 || i === process.argv.length - 1 ? fallback : process.argv[i + 1]
}

const seeds = SEEDS.slice(0, parseInt(arg('seeds', '72'), 10))
const doseA = Number(arg('a', '0'))
const doseB = Number(arg('b', '20'))

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
    const a = [], b = []
    let hangs = 0, better = 0, worse = 0, tied = 0

    for (const s of scenarios) {
      const common = { seed: s.seed, postGap: s.postGap, maze, humanElement: 'EARTH', spendDown: true, maxWaves: 10, freeSpecial: true, fuse: true, fuseWith: 'WIND' }
      BALANCE.TOWER.GRINDER.grind.contactDps = doseA
      const mA = runMatch({ ...common })
      BALANCE.TOWER.GRINDER.grind.contactDps = doseB
      const mB = runMatch({ ...common })
      if (mA.timedOut || mA.stalled || mB.timedOut || mB.stalled) { hangs++; continue }
      const va = hallHpAuc(mA), vb = hallHpAuc(mB)
      if (va === undefined || vb === undefined) { hangs++; continue }
      a.push(va); b.push(vb)
      if (vb > va) better++; else if (vb < va) worse++; else tied++
    }

    const c = classify([a, b])
    const diff = c.means[1] - c.means[0]
    console.log(`maze ${mazeName}: n=${a.length} hangs=${hangs}`)
    console.log(`  contactDps ${doseA} = ${c.means[0].toFixed(3)}   contactDps ${doseB} = ${c.means[1].toFixed(3)}`)
    console.log(`  diff = ${diff >= 0 ? '+' : ''}${diff.toFixed(3)}  (t ${c.t === Infinity ? 'inf' : c.t.toFixed(2)})`)
    console.log(`  paired signs: ${better} better / ${worse} worse / ${tied} tied`)
  }
} finally {
  BALANCE.TOWER.GRINDER.grind.contactDps = saved
}
