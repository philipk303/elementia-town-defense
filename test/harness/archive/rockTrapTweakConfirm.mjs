#!/usr/bin/env node
// Full 72-seed confirmation of the Rock Trap balance-tweak candidate found in
// docs/reviews/2026-08-04-rock-trap-site-cap-fix.md's screening pass:
// splashRadiusPx 32->48, cooldownMs 4000->3000. Same method/output shape as
// rockTrapRetest.js, applied on top of the BALANCE object before each maze's
// sweep. Throwaway confirmation script, not committed as a permanent tool.

import { runMatch } from './matchRunner.js'
import { scenarioMatrix, resolveMaze } from './scenarios.js'
import { classify, mean } from './stats.js'
import { STRUCTURE_TYPES } from '../../shared/constants.js'
import { BALANCE } from '../../shared/balance.js'

BALANCE.TOWER.EARTH_SPECIAL.splashRadiusPx = 48
BALANCE.TOWER.EARTH_SPECIAL.cooldownMs = 3000
console.log('EARTH_SPECIAL tower spec:', JSON.stringify(BALANCE.TOWER.EARTH_SPECIAL))

function imputeHangs(liveScores, hangCount) {
  if (!liveScores.length) return liveScores
  const lo = Math.min(...liveScores)
  return liveScores.concat(new Array(hangCount).fill(lo))
}
function pairedSignCounts(controlByCell, armByCell) {
  let better = 0, worse = 0, tied = 0
  for (const [k, cScore] of controlByCell) {
    if (!armByCell.has(k)) continue
    const aScore = armByCell.get(k)
    if (aScore > cScore) better++
    else if (aScore < cScore) worse++
    else tied++
  }
  return { better, worse, tied }
}

for (const mazeName of ['A', 'B']) {
  const maze = resolveMaze(mazeName)
  const scenarios = scenarioMatrix({ maze })
  const half = Math.floor(scenarios.length / 2)
  console.log(`\n=== MAZE ${mazeName} ===`)

  const arms = { watchtower: [], rockTrap: [] }
  const armCells = { watchtower: new Map(), rockTrap: new Map() }
  const hangs = { watchtower: 0, rockTrap: 0 }

  scenarios.forEach(s => {
    const key = `${s.seed}:${s.postGap}`
    const common = { ...s, fuse: false, freeSpecial: false, spendDown: true }
    const mTower = runMatch({ ...common, defence: STRUCTURE_TYPES.WATCHTOWER })
    const mRock = runMatch({ ...common, defence: STRUCTURE_TYPES.EARTH_SPECIAL })
    if (mTower.timedOut || mTower.stalled) hangs.watchtower++
    else { arms.watchtower.push(mTower.score); armCells.watchtower.set(key, mTower.score) }
    if (mRock.timedOut || mRock.stalled) hangs.rockTrap++
    else { arms.rockTrap.push(mRock.score); armCells.rockTrap.set(key, mRock.score) }
  })

  const cw = classify([arms.watchtower, arms.rockTrap])
  const impTower = imputeHangs(arms.watchtower, hangs.watchtower)
  const impRock = imputeHangs(arms.rockTrap, hangs.rockTrap)
  const cwImp = classify([impTower, impRock])

  const firstHalfKeys = new Set(scenarios.slice(0, half).map(s => `${s.seed}:${s.postGap}`))
  const splitArm = (cellMap) => {
    const a = [], b = []
    for (const [k, v] of cellMap) (firstHalfKeys.has(k) ? a : b).push(v)
    return [a, b]
  }
  const [twA, twB] = splitArm(armCells.watchtower)
  const [rkA, rkB] = splitArm(armCells.rockTrap)
  const split = { half1: classify([twA, rkA]), half2: classify([twB, rkB]) }
  const agree = Math.sign(split.half1.means[1] - split.half1.means[0]) ===
    Math.sign(split.half2.means[1] - split.half2.means[0])
  const signs = pairedSignCounts(armCells.watchtower, armCells.rockTrap)

  console.log(`  hangs: watchtower ${hangs.watchtower}/144  rockTrap ${hangs.rockTrap}/144`)
  console.log(`  score: watchtower ${cw.means[0].toFixed(3)}  rockTrap ${cw.means[1].toFixed(3)}`)
  console.log(`  diff: ${(cw.means[1] - cw.means[0]).toFixed(3)} (t ${cw.t.toFixed(2)}) — ${signs.better} better / ${signs.worse} worse / ${signs.tied} tied`)
  console.log(`  imputed diff: ${(cwImp.means[1] - cwImp.means[0]).toFixed(3)} (t ${cwImp.t.toFixed(2)})`)
  console.log(`  split-half agree: ${agree} (half1 ${(split.half1.means[1] - split.half1.means[0]).toFixed(3)}, half2 ${(split.half2.means[1] - split.half2.means[0]).toFixed(3)})`)
}
