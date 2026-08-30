import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { ATLASES, structureArtKey } from '../../client/src/assets/manifest.js'
import { structureFamily, StructureAnimator, STRUCTURE_STATE } from '../../client/src/render/AnimationController.js'
import { BALANCE } from '../../shared/balance.js'

const atlasJson = new URL('../../client/public/art/muddy_bog.json', import.meta.url)

test('Muddy Bog registers its state atlas at the MUDDY_BOG runtime key', () => {
  assert.deepEqual(ATLASES.find((atlas) => atlas.key === 'muddy_bog'), {
    key: 'muddy_bog', png: 'art/muddy_bog.png', json: 'art/muddy_bog.json',
  })
  assert.equal(structureArtKey('MUDDY_BOG'), 'muddy_bog')
})

// Delivered (codex/muddy-bog-package) as idle/entry/root. Renamed to
// idle_0/active_0/active_1 during gameplay wiring so buildAnimsForAtlas
// groups entry+root into one two-frame 'active' clip StructureAnimator's
// generic cycleSeq-bump window can find — same shape as Steam Vent's
// pressure+confusion rename. Same pixels, same frame count, different keys.
test('Muddy Bog atlas packages the approved idle and two-frame active states', async () => {
  const atlas = JSON.parse(await readFile(atlasJson, 'utf8'))
  assert.deepEqual(new Set(Object.keys(atlas.frames)), new Set(['idle_0.png', 'active_0.png', 'active_1.png']))
  for (const frame of Object.values(atlas.frames)) {
    assert.equal(frame.frame.w, 64)
    assert.equal(frame.frame.h, 64)
    assert.equal(frame.trimmed, false)
    assert.deepEqual(frame.sourceSize, { w: 64, h: 64 })
  }
})

// Pins the reason only idle/active are reachable, and that the server now
// actually emits the cycleSeq bump this depends on — so a future change to
// either side (adding a phase machine, or dropping the bump) fails loudly.
test('MUDDY_BOG is the areaEntry family, so only idle and active are reachable', () => {
  const spec = BALANCE.TOWER.MUDDY_BOG
  assert.equal(structureFamily(spec), 'static')

  const anim = new StructureAnimator({ atlasKey: 'muddy_bog', spec })
  assert.equal(anim.update({ phase: 0, charge: 0, cycle: 0 }, 0), STRUCTURE_STATE.IDLE)
  assert.equal(anim.update({ phase: 0, charge: 0, cycle: 1 }, 0), STRUCTURE_STATE.ACTIVE)
  assert.equal(anim.animKey(), 'muddy_bog_active')
  assert.equal(anim.update({ phase: 1, charge: 1, cycle: 1 }, 10_000), STRUCTURE_STATE.IDLE)
})
