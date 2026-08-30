import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scenarioMatrix, resolveMaze, MAZE, MAZE_B, SEEDS } from './scenarios.js'

test('SCENARIOS: the matrix carries the maze it was given', () => {
  const m = scenarioMatrix({ seeds: [1, 2], maze: MAZE_B })
  assert.equal(m.length, 4)
  for (const s of m) assert.equal(s.maze, MAZE_B)
  assert.deepEqual(m.map(s => s.postGap), [0, 1, 0, 1])
})

// Maze B exists to answer ONE question — does a finding survive a different
// layout — so it must differ in exactly one thing. Same wall row and same lane
// COUNT keeps the cell shape identical (72 seeds x 2 posts) and the two
// matrices directly comparable; only where the lanes sit changes.
test('SCENARIOS: maze B varies lane position and nothing else', () => {
  assert.equal(MAZE_B.wallRow, MAZE.wallRow)
  assert.equal(MAZE_B.gaps.length, MAZE.gaps.length)
  assert.notDeepEqual(MAZE_B.gaps, MAZE.gaps)
  assert.equal(scenarioMatrix({ maze: MAZE_B }).length, SEEDS.length * 2)
})

// Same rule as resolveDial: a probe that silently defaults an unrecognized
// input prints a table for a configuration nobody asked for and calls it a
// result.
test('SCENARIOS: an unknown maze name throws rather than defaulting', () => {
  assert.equal(resolveMaze('A'), MAZE)
  assert.equal(resolveMaze('B'), MAZE_B)
  assert.throws(() => resolveMaze('C'), /maze/i)
})
