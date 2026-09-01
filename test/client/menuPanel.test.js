// Menu panel content (client/src/ui/menuPanel.js).
//
// The DOM half needs a browser and is verified live. What is tested here is
// the part that decides WHAT the panel says, because a controls list that
// disagrees with the code is worse than no controls list -- it sends a player
// to press a key that does nothing and makes them distrust the rest of it.
//
// The keyboard rows are cross-checked against the real GameScene bindings by
// reading the source, so moving a binding without updating the panel fails
// here rather than in front of a playtester.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { controlsFor, MIN_TARGET_PX } from '../../client/src/ui/menuPanel.js'

const SCENE = readFileSync(
  fileURLToPath(new URL('../../client/src/scenes/GameScene.js', import.meta.url)),
  'utf8',
)

const rows = (scheme) => controlsFor(scheme).flatMap(g => g.rows)
const keysFor = (scheme, action) => rows(scheme).find(([a]) => a === action)?.[1]

test('both schemes are non-empty and every row is an action plus its control', () => {
  for (const scheme of ['desktop', 'touch']) {
    const all = rows(scheme)
    assert.ok(all.length >= 10, `${scheme} documents only ${all.length} controls`)
    for (const [action, keys] of all) {
      assert.ok(action && action.length > 2, `${scheme}: empty action label`)
      assert.ok(keys && keys.length > 0, `${scheme}: "${action}" has no control named`)
    }
  }
})

test('an unknown or missing scheme falls back to the keyboard list', () => {
  // GameScene seeds _inputScheme to 'touch' or 'desktop' and nothing else, but
  // a panel that renders BLANK on an unexpected value is the worst outcome.
  assert.deepEqual(controlsFor(undefined), controlsFor('desktop'))
  assert.deepEqual(controlsFor('gamepad'), controlsFor('desktop'))
})

test('no action is documented twice within a scheme', () => {
  for (const scheme of ['desktop', 'touch']) {
    const actions = rows(scheme).map(([a]) => a)
    assert.equal(new Set(actions).size, actions.length, `${scheme} lists an action twice`)
  }
})

test('the keyboard list matches the bindings GameScene actually registers', () => {
  // Each entry: the panel row, and a snippet that must be present in the scene
  // for that binding to exist at all.
  const bindings = [
    ['Move', 'W A S D', 'KC.W'],
    ['Special ability', 'Q', 'KC.Q'],
    ['Second ability (level 4)', 'E', 'KC.E'],
    ['Repair a structure', 'F', 'KC.F'],
    ['Pick what to build', '1 - 9', "/^Digit([1-9])$/"],
    ['Rotate the footprint', 'R', "'KeyR'"],
    ['Accept a fusion offer', 'Y', "'KeyY'"],
    ['Decline a fusion offer', 'N', "'KeyN'"],
    ['Mute and unmute', 'M', "'KeyM'"],
    ['Shrink or grow the HUD', '[ and ]', "'BracketLeft'"],
  ]
  for (const [action, keys, sceneSnippet] of bindings) {
    assert.equal(keysFor('desktop', action), keys, `panel row for "${action}" drifted`)
    assert.ok(SCENE.includes(sceneSnippet), `GameScene no longer binds ${action} (${sceneSnippet})`)
  }
  assert.ok(SCENE.includes('ArrowUp'), 'GameScene no longer reads arrow keys')
  assert.equal(keysFor('desktop', 'Set output direction'), 'Arrow keys')
})

test('the touch list names no keyboard keys', () => {
  // A touch player has no keyboard. inputHints() stripped key prose for the
  // same reason (client/src/input/touchControls.js:377) -- telling someone to
  // press R while a ROTATE button sits under their thumb is worse than
  // silence.
  for (const [action, keys] of rows('touch')) {
    assert.ok(
      !/\b(press|key|keys|W A S D|arrow keys)\b/i.test(`${action} ${keys}`),
      `touch row "${action}" names a keyboard control: ${keys}`,
    )
  }
})

test('the touch list covers everything the keyboard list covers', () => {
  // Both schemes must document the same set of ABILITIES even where the
  // control differs, or the touch panel silently teaches less.
  for (const action of ['Move', 'Special ability', 'Repair a structure', 'Ready up']) {
    assert.ok(keysFor('touch', action), `touch list omits "${action}"`)
  }
})

test('the touch-target floor is the WCAG 2.5.5 minimum', () => {
  assert.equal(MIN_TARGET_PX, 44)
})
