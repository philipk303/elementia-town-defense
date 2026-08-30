import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const atlasJson = new URL('../../client/public/art/steam_vent.json', import.meta.url)

// Delivered (codex/steam-vent-asset-package) as idle/pressure/confusion.
// Renamed to idle/active_0/active_1 during gameplay wiring so
// buildAnimsForAtlas groups pressure+confusion into one two-frame 'active'
// clip StructureAnimator's generic cycleSeq-bump window can find — see
// docs/assets/steam-vent-production-qa.md. Same pixels, same frame count,
// different JSON keys, so this test still asserts the packaging contract.
test('Steam Vent atlas packages the approved idle and two-frame active states', async () => {
  const atlas = JSON.parse(await readFile(atlasJson, 'utf8'))
  const expected = new Set(['idle_0.png', 'active_0.png', 'active_1.png'])

  assert.deepEqual(new Set(Object.keys(atlas.frames)), expected)
  for (const frame of Object.values(atlas.frames)) {
    assert.equal(frame.frame.w, 128)
    assert.equal(frame.frame.h, 128)
    assert.equal(frame.trimmed, false)
    assert.deepEqual(frame.sourceSize, { w: 128, h: 128 })
  }
})
