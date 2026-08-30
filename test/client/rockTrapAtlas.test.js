import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const load = key => JSON.parse(readFileSync(`client/public/art/${key}.json`, 'utf8'))

test('Rock Trap packages launcher and target-point effect atlases', () => {
  const launcher = load('earth_special').frames
  const effect = load('rock_trap_fx').frames
  assert.deepEqual(Object.keys(launcher), ['idle_down_0.png', 'launch_down_0.png', 'recovery_down_0.png'])
  assert.equal(Object.keys(effect).length, 8)
  assert.ok(effect['impact_down_0.png'])
})
