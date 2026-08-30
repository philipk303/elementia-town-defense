#!/usr/bin/env node
// Screening sweep for Rock Trap (EARTH_SPECIAL) balance tweak candidates —
// throwaway exploration in response to the cross-maze sign-flip found in
// docs/reviews/2026-08-03-rock-trap-standalone-measurement.md. Reduced seed
// set (24 seeds x 2 posts = 48 cells/maze) for speed; a winning candidate
// gets a full 72-seed confirmation via rockTrapRetest.js before any number
// is proposed for real.

import { runMatch } from './matchRunner.js'
import { scenarioMatrix, resolveMaze, SEEDS } from './scenarios.js'
import { classify } from './stats.js'
import { STRUCTURE_TYPES } from '../../shared/constants.js'
import { BALANCE } from '../../shared/balance.js'

const screenSeeds = SEEDS.slice(0, 24)

const base = {
  cost: BALANCE.STRUCTURES.EARTH_SPECIAL.cost,
  ...BALANCE.TOWER.EARTH_SPECIAL,
}

const variants = {
  baseline: {},
  biggerSplash: { splashRadiusPx: 48 },
  fasterCooldown: { cooldownMs: 3000 },
  cheaper: { cost: 7 },
  shorterTelegraph: { telegraphMs: 350 },
  biggerSplash_cheaper: { splashRadiusPx: 48, cost: 7 },
  fasterCooldown_biggerSplash: { cooldownMs: 3000, splashRadiusPx: 48 },
}

function applyVariant(v) {
  BALANCE.STRUCTURES.EARTH_SPECIAL.cost = v.cost ?? base.cost
  BALANCE.TOWER.EARTH_SPECIAL.rangePx = v.rangePx ?? base.rangePx
  BALANCE.TOWER.EARTH_SPECIAL.telegraphMs = v.telegraphMs ?? base.telegraphMs
  BALANCE.TOWER.EARTH_SPECIAL.damage = v.damage ?? base.damage
  BALANCE.TOWER.EARTH_SPECIAL.splashDamage = v.splashDamage ?? base.splashDamage
  BALANCE.TOWER.EARTH_SPECIAL.splashRadiusPx = v.splashRadiusPx ?? base.splashRadiusPx
  BALANCE.TOWER.EARTH_SPECIAL.cooldownMs = v.cooldownMs ?? base.cooldownMs
}

for (const [name, v] of Object.entries(variants)) {
  applyVariant(v)
  const line = { name }
  for (const mazeName of ['A', 'B']) {
    const maze = resolveMaze(mazeName)
    const scenarios = scenarioMatrix({ seeds: screenSeeds, maze })
    const tw = [], rk = []
    let hangsTw = 0, hangsRk = 0
    for (const s of scenarios) {
      const common = { ...s, fuse: false, freeSpecial: false, spendDown: true }
      const mTower = runMatch({ ...common, defence: STRUCTURE_TYPES.WATCHTOWER })
      const mRock = runMatch({ ...common, defence: STRUCTURE_TYPES.EARTH_SPECIAL })
      if (mTower.timedOut || mTower.stalled) hangsTw++; else tw.push(mTower.score)
      if (mRock.timedOut || mRock.stalled) hangsRk++; else rk.push(mRock.score)
    }
    const c = classify([tw, rk])
    line[mazeName] = { diff: c.means[1] - c.means[0], t: c.t, hangsTw, hangsRk, n: scenarios.length }
  }
  console.log(name.padEnd(28),
    `A: ${line.A.diff.toFixed(3)} (t${line.A.t.toFixed(2)}, hang ${line.A.hangsRk}/${line.A.n})`,
    `  B: ${line.B.diff.toFixed(3)} (t${line.B.t.toFixed(2)}, hang ${line.B.hangsRk}/${line.B.n})`)
}

applyVariant({}) // restore baseline before exit, in case anything else imports BALANCE after
