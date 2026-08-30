#!/usr/bin/env node
// Controlled same-site comparison (2026-08-29 follow-up): does FUSING change
// occupancy, holding the site fixed? Uses the SAME anchor+partner site logic
// for both arms (matchRunner.js's runBuildPolicy: "every fusion partner
// builds directly below this anchor tile, so the free special's site list is
// also the fusion's" — the anchor and partner tile are identical whether or
// not the proposal is accepted), varying only fuse:true vs fuse:false
// (partnerSpecial control, already built into protocol.js for exactly this
// contrast).
//
// Control arm: freeSpecial:true (anchor) + partnerSpecial:X, fuse:false —
// two standing 2x1 ingredients, unfused, at (fx,fy) and (fx,fy+1).
// Experiment arm: fuse:true, fuseWith:X — same two tiles, merged into one
// fused 2x2 structure.
//
// Usage: node test/harness/archive/sameSiteFuseCheck.js [--seeds N]

import { runMatch } from '../matchRunner.js'
import { scenarioMatrix, resolveMaze, SEEDS } from '../scenarios.js'

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 || i === process.argv.length - 1 ? fallback : process.argv[i + 1]
}

const seedCount = parseInt(arg('seeds', '72'), 10)
const seeds = SEEDS.slice(0, seedCount)

const PAIRS = [
  { label: 'EARTH+FIRE (Magma Trap)', humanElement: 'EARTH', partner: 'FIRE', unfusedField: ['aoeActiveTicks', 'aoeEnemySeconds'], fusedField: ['entryTriggerActiveTicks', 'entryTriggerEnemySeconds'] },
  { label: 'EARTH+WATER (Muddy Bog)', humanElement: 'EARTH', partner: 'WATER', unfusedField: ['displaceActiveTicks', 'displaceEnemySeconds'], fusedField: ['areaEntryActiveTicks', 'areaEntryEnemySeconds'] },
]

function summarize(records, ticksField, secField) {
  let n = 0, sumFight = 0, sumActive = 0, sumEnemySec = 0, sumFieldSec = 0, zero = 0
  for (const m of records) {
    n++
    sumFight += m.fightTicks
    sumActive += m[ticksField] ?? 0
    sumEnemySec += m.enemySeconds
    sumFieldSec += m[secField] ?? 0
    if ((m[ticksField] ?? 0) === 0) zero++
  }
  return { n, occTicks: sumActive / sumFight, occSec: sumFieldSec / sumEnemySec, zeroFrac: zero / n }
}

for (const pair of PAIRS) {
  console.log(`\n=== ${pair.label} — same anchor site, fused vs unfused ===`)
  for (const mazeName of ['A', 'B']) {
    const maze = resolveMaze(mazeName)
    const scenarios = scenarioMatrix({ seeds, maze })

    const unfused = [], fused = []
    let sameSiteCount = 0
    for (const s of scenarios) {
      const common = { seed: s.seed, postGap: s.postGap, maze, humanElement: pair.humanElement, spendDown: true, maxWaves: 10 }
      const mControl = runMatch({ ...common, freeSpecial: true, fuse: false, partnerSpecial: pair.partner })
      const mFused = runMatch({ ...common, freeSpecial: true, fuse: true, fuseWith: pair.partner })
      if (!mControl.timedOut && !mControl.stalled) unfused.push(mControl)
      if (!mFused.timedOut && !mFused.stalled) fused.push(mFused)
      // Same seed -> deterministic build order -> same anchor site chosen
      // both times. Sanity check it actually holds.
      if (mControl.freeSpecialAt && mFused.freeSpecialAt &&
          mControl.freeSpecialAt[0] === mFused.freeSpecialAt[0] &&
          mControl.freeSpecialAt[1] === mFused.freeSpecialAt[1]) sameSiteCount++
    }

    const u = summarize(unfused, pair.unfusedField[0], pair.unfusedField[1])
    const f = summarize(fused, pair.fusedField[0], pair.fusedField[1])
    console.log(`  maze ${mazeName}: same-site sanity check ${sameSiteCount}/${scenarios.length}`)
    console.log(`    unfused (2 ingredients standing): n=${u.n}  occTicks=${u.occTicks.toFixed(4)}  occSec=${u.occSec.toFixed(4)}  zeroOccupancy=${(u.zeroFrac * 100).toFixed(1)}%`)
    console.log(`    fused   (1 merged structure):      n=${f.n}  occTicks=${f.occTicks.toFixed(4)}  occSec=${f.occSec.toFixed(4)}  zeroOccupancy=${(f.zeroFrac * 100).toFixed(1)}%`)
  }
}
