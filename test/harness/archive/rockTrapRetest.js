#!/usr/bin/env node
// Rock Trap (EARTH_SPECIAL) standalone measurement — Amendment A1.4(a) niche
// floor, never previously measured outside a fusion role. See
// docs/handoffs/2026-08-02-rock-trap-standalone-measurement.md for the brief.
//
// Same method as the Firepit falsification test / retest (docs/reviews/
// 2026-07-25-firepit-falsification-test.md, test/harness/firepitRetest.js):
// Watchtower vs EARTH_SPECIAL, both spendDown:true, freeSpecial:false,
// fuse:false, 144 paired cells (72 seeds x 2 posts) per maze, both mazes.
// Hang-imputation + split-half discipline per elementia-baseline-review-
// lessons. Declared scenario (§5.2): highest-maxHp priority-target burst
// damage — not positioning-dependent, so no siting option needed beyond what
// matchRunner's defSites already does for a walkable defence (funnel sites
// tried before tower sites, confirmed in the handoff, point 3).
//
// NOT a test file (no .test.js suffix) — same convention as probe.js /
// fusionRoster.js / firepitRetest.js.
//
// Usage: node test/harness/rockTrapRetest.js [--maze A|B|both] [--out path.json]

import { runMatch } from './matchRunner.js'
import { scenarioMatrix, resolveMaze } from './scenarios.js'
import { classify, mean } from './stats.js'
import { STRUCTURE_TYPES } from '../../shared/constants.js'
import { BALANCE } from '../../shared/balance.js'
import fs from 'node:fs'

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 || i === process.argv.length - 1 ? fallback : process.argv[i + 1]
}

const mazeArg = arg('maze', 'both')
const mazes = mazeArg === 'both' ? ['A', 'B'] : [mazeArg.toUpperCase()]
const outPath = arg('out', null)

console.log(`Rock Trap (EARTH_SPECIAL) cost: ${BALANCE.STRUCTURES.EARTH_SPECIAL.cost}`)
console.log(`Watchtower cost: ${BALANCE.STRUCTURES.WATCHTOWER.cost}`)

// Same worst-case imputation rule as fusionRoster.js/firepitRetest.js: a hung
// run's score is imputed at the observed minimum of its OWN arm's live cells
// for this maze.
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

const results = { generatedAt: new Date().toISOString(), mazes: {} }

for (const mazeName of mazes) {
  const maze = resolveMaze(mazeName)
  const scenarios = scenarioMatrix({ maze })
  const half = Math.floor(scenarios.length / 2)
  console.log(`\n=== MAZE ${mazeName} — wall row ${maze.wallRow}, lanes ${maze.gaps.join('/')} ===`)

  const arms = { watchtower: [], rockTrap: [] }
  const armCells = { watchtower: new Map(), rockTrap: new Map() }
  const hangs = { watchtower: 0, rockTrap: 0 }

  const t0 = Date.now()
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
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)

  console.log(`[${elapsed}s]`)
  console.log(`  hangs: watchtower ${hangs.watchtower}/144  rockTrap ${hangs.rockTrap}/144`)
  console.log(`  score: watchtower ${cw.means[0].toFixed(3)}  rockTrap ${cw.means[1].toFixed(3)}`)
  console.log(`  diff: ${(cw.means[1] - cw.means[0]).toFixed(3)} (t ${cw.t === Infinity ? 'inf' : cw.t.toFixed(2)}) — ${signs.better} better / ${signs.worse} worse / ${signs.tied} tied`)
  console.log(`  imputed diff: ${(cwImp.means[1] - cwImp.means[0]).toFixed(3)} (t ${cwImp.t === Infinity ? 'inf' : cwImp.t.toFixed(2)})`)
  console.log(`  split-half agree: ${agree} (half1 ${(split.half1.means[1] - split.half1.means[0]).toFixed(3)}, half2 ${(split.half2.means[1] - split.half2.means[0]).toFixed(3)})`)

  results.mazes[mazeName] = {
    hangs,
    watchtowerMean: mean(arms.watchtower), rockTrapMean: mean(arms.rockTrap),
    diff: cw.means[1] - cw.means[0], t: cw.t, signs,
    imputed: { diff: cwImp.means[1] - cwImp.means[0], t: cwImp.t },
    splitHalf: { half1: split.half1.means[1] - split.half1.means[0], half2: split.half2.means[1] - split.half2.means[0], agree },
  }
}

if (outPath) {
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2))
  console.log(`\nwritten: ${outPath}`)
}
