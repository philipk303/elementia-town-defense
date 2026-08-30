#!/usr/bin/env node
// Siting sign-flip diagnosis (2026-08-04, Task 20 §0).
//
// The published Blizzard/Steam Vent numbers are DIFFERENCES: fusion arm minus
// a control arm that still builds the human's own free special. Both arms move
// when `freeSpecialSites` changes, so a sign flip in the difference does not
// by itself say the FUSION behaves differently by siting — the control's own
// ingredient may simply be far more siting-sensitive than the fusion is.
//
// That is not a hypothetical for these two pairs specifically:
//   BLIZZARD   human=WATER -> control keeps a WATER_SPECIAL (Water Geyser),
//              whose selection is FOOTPRINT-ONLY (balance.js:301) — it can
//              only hit enemies standing on its own 2x1 tiles.
//   STEAM_VENT human=FIRE  -> control keeps a FIRE_SPECIAL (Firepit), the
//              structure already proven siting-critical (0.073 targets per
//              pulse on the flanks, matchRunner.js:144-153).
// Both ingredients are near-inert off-lane and strong in-lane. Blizzard by
// contrast acquires at rangePx 180 (~5.6 tiles), so it reaches the lane from
// a flank site anyway.
//
// This script decomposes the difference by adding a THIRD arm that builds no
// free special at all, giving a siting-independent anchor:
//   none       freeSpecial:false, fuse:false
//   ingredient freeSpecial:true,  fuse:false   (= the published control arm)
//   fusion     freeSpecial:true,  fuse:true, fuseWave:4
// If (ingredient - none) swings hard with siting while (fusion - none) does
// not, the sign flip lives in the control, not in the fusion's mechanic.
//
// 24-seed screen, same subset and Welch machinery as fusionTweakScreen.mjs.
//
// Usage: node test/harness/sitingDecompose.mjs

import { runMatch } from './matchRunner.js'
import { scenarioMatrix, resolveMaze, SEEDS } from './scenarios.js'
import { classify } from './stats.js'

const screenSeeds = SEEDS.slice(0, 24)

const CASES = [
  { name: 'BLIZZARD',   human: 'WATER', partner: 'WIND',  ingredient: 'Water Geyser' },
  { name: 'STEAM_VENT', human: 'FIRE',  partner: 'WATER', ingredient: 'Firepit' },
]

function runArm(scenarios, opts) {
  const scores = []
  let hangs = 0
  for (const s of scenarios) {
    const m = runMatch({ ...s, ...opts })
    if (m.timedOut || m.stalled) hangs++
    else scores.push(m.score)
  }
  return { scores, hangs }
}

function fmt(a, b) {
  const c = classify([a.scores, b.scores])
  const d = c.means[1] - c.means[0]
  return `${d >= 0 ? '+' : ''}${d.toFixed(3)}(t${c.t.toFixed(2)})`
}

function meanOf(a) {
  return a.scores.reduce((s, v) => s + v, 0) / a.scores.length
}

for (const c of CASES) {
  console.log(`\n### ${c.name} — human ${c.human} (free special = ${c.ingredient}), partner ${c.partner}`)
  for (const mazeName of ['A', 'B']) {
    const maze = resolveMaze(mazeName)
    const scenarios = scenarioMatrix({ seeds: screenSeeds, maze })

    // Siting-independent anchor: no free special is placed at all, so
    // freeSpecialSites cannot change this arm. Run once per maze.
    const none = runArm(scenarios, { fuse: false, freeSpecial: false, humanElement: c.human })

    for (const siting of ['tower', 'funnel']) {
      const freeSpecialSites = siting === 'funnel' ? 'funnel' : null
      const ing = runArm(scenarios, { fuse: false, humanElement: c.human, freeSpecialSites })
      const fus = runArm(scenarios, {
        fuse: true, fuseWave: 4, humanElement: c.human, fuseWith: c.partner, freeSpecialSites,
      })
      console.log(
        `maze ${mazeName} ${siting.padEnd(6)}`,
        `| abs none ${meanOf(none).toFixed(3)} ing ${meanOf(ing).toFixed(3)} fus ${meanOf(fus).toFixed(3)}`,
        `| ing-none ${fmt(none, ing)}`,
        `| fus-none ${fmt(none, fus)}`,
        `| fus-ing ${fmt(ing, fus)}`,
        `| hangs ${none.hangs}/${ing.hangs}/${fus.hangs}`)
    }
  }
}
