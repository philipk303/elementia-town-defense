// The scenario matrix (Phase 8A) and the BALANCE dial-path resolver.
//
// Two independent axes of variation, both genuine post-Task-1:
//   seed    — gate order AND per-spawn timing jitter
//   postGap — which of the two lanes the scripted human plugs
//
// Report per-cell outcomes and the spread, never a bare win rate: with a
// threshold-y sim a binary readout looks non-monotonic under perturbation no
// matter what the mechanism is.
//
// SAMPLE SIZE (raised from 6 seeds to 40 on 2026-07-25, Task 7 remediation)
//
// The original 6 seeds x 2 posts = 12 cells could not resolve a 4x change in
// goblin HP: the calibration run measured a 0.585 score-point effect against a
// within-cell sd of 1.133, which is 1.3 standard errors at n=12 — genuinely
// underpowered, not absent. Sizing from a minimum effect declared in advance:
//
//   delta = 0.5     half a cleared wave — the smallest difference worth calling
//                   a gameplay change. Declared BEFORE re-running, so the
//                   sample size is not reverse-engineered from a result.
//   alpha = 0.05 two-sided, power = 0.80
//   n = 2*sigma^2*(1.96+0.84)^2 / delta^2
//
// Sized in two passes, because the first estimate of sigma was itself taken
// from the underpowered n=12 matrix and was too small:
//
//   sigma = 1.133 (measured at n=12)  -> n =  81 cells -> 40 seeds
//   sigma = 1.439 (measured at n=80)  -> n = 131 cells -> 72 seeds (+ hang slack)
//
// The larger matrix revealed genuine scenario variance the small one could not
// see. Only sigma was updated; delta and the power target are unchanged from
// what was declared up front, so this is a corrected input, not a moved goal
// post. ~10% of cells hang and are excluded, so 144 raw cells yields ~130.
//
// 72 seeds x 2 posts = 144 cells. See requiredN() in stats.js. Cost is ~43 s per
// dial, which is affordable and not a reason to under-sample.

export const MAZE = { wallRow: 8, gaps: [13, 27] }

// EXTERNAL VALIDITY (added 2026-07-25). Every number Phase 8A has produced was
// measured on ONE layout, so nothing yet distinguishes "how this game behaves"
// from "how this maze behaves". Maze B changes exactly one thing: the lanes sit
// on the flanks instead of near-center. Same wall row, same lane count, so the
// matrix keeps its 72 x 2 shape and the two runs are directly comparable.
export const MAZE_B = { wallRow: 8, gaps: [5, 35] }

const MAZES = { A: MAZE, B: MAZE_B }

/**
 * Resolve a maze by name. THROWS on an unknown name — same rule as
 * resolveDial: silently defaulting prints a table for a configuration nobody
 * asked for and calls it a result.
 */
export function resolveMaze(name) {
  const m = MAZES[String(name).toUpperCase()]
  if (!m) throw new Error(`unknown maze "${name}" — known mazes: ${Object.keys(MAZES).join(', ')}`)
  return m
}

export const SEEDS = Array.from({ length: 72 }, (_, i) => 20260801 + i)

export function scenarioMatrix({ seeds = SEEDS, maze = MAZE, maxWaves } = {}) {
  const out = []
  for (const seed of seeds) {
    for (let postGap = 0; postGap < maze.gaps.length; postGap++) {
      out.push({ seed, maze, postGap, ...(maxWaves ? { maxWaves } : {}) })
    }
  }
  return out
}

/**
 * Resolve a dotted BALANCE path to { obj, key } for read/write.
 * Supports numeric segments for array indices: 'COST_FIELD.WALL_ENTRY_COST.1'.
 * THROWS on a path that does not resolve — a probe that silently defaults a
 * missing dial prints identical rows and calls it smooth.
 */
export function resolveDial(root, path) {
  const parts = path.split('.')
  let obj = root
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]
    if (obj == null || !(p in obj)) {
      throw new Error(`dial path "${path}" does not resolve: no "${p}" at segment ${i}`)
    }
    obj = obj[p]
  }
  const key = parts[parts.length - 1]
  if (obj == null || !(key in obj)) {
    throw new Error(`dial path "${path}" does not resolve: no leaf "${key}"`)
  }
  return { obj, key }
}
