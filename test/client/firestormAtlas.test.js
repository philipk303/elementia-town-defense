import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { ATLASES, IMAGES, structureArtKey } from '../../client/src/assets/manifest.js'
import { structureFamily, StructureAnimator, STRUCTURE_STATE } from '../../client/src/render/AnimationController.js'
import { BALANCE } from '../../shared/balance.js'

const atlasJson = new URL('../../client/public/art/firestorm_fx.json', import.meta.url)

test('Firestorm registers its state atlas at the FIRESTORM runtime key', () => {
  assert.deepEqual(ATLASES.find((atlas) => atlas.key === 'firestorm'), {
    key: 'firestorm', png: 'art/firestorm_fx.png', json: 'art/firestorm_fx.json',
  })
  assert.equal(structureArtKey('FIRESTORM'), 'firestorm')
})

// The delivery shipped a static firestorm.png before the atlas existed. Both
// would claim the same runtime key, and the atlas supersedes the static, so
// the static must stay unregistered — a second entry would be a key collision
// (see test/assetDelivery.test.js's no-duplicate-key check).
test('the superseded static Firestorm image is not also registered', () => {
  assert.equal(IMAGES.find((image) => image.key === 'firestorm'), undefined)
})

test('Firestorm atlas provides every StructureAnimator state, two frames each', async () => {
  const { frames } = JSON.parse(await readFile(atlasJson, 'utf8'))
  assert.deepEqual(Object.keys(frames), [
    'idle_00.png', 'idle_01.png',
    'telegraph_00.png', 'telegraph_01.png',
    'charged_00.png', 'charged_01.png',
    'active_00.png', 'active_01.png',
    'recovery_00.png', 'recovery_01.png',
  ])
})

// Pins the reason the extra frames are inert, so that if FIRESTORM ever gains
// a phase machine this test fails and the inventory note gets revisited rather
// than silently going stale.
test('FIRESTORM is the volley family, so only idle and active are reachable', () => {
  const spec = BALANCE.TOWER.FIRESTORM
  assert.equal(structureFamily(spec), 'volley')

  const anim = new StructureAnimator({ atlasKey: 'firestorm', spec })
  assert.equal(anim.update({ phase: 0, charge: 0, cycle: 0 }, 0), STRUCTURE_STATE.IDLE)
  // A volley fires: the cycleSeq bump is the only activation signal this
  // family emits, and it must reach ACTIVE.
  assert.equal(anim.update({ phase: 0, charge: 0, cycle: 1 }, 0), STRUCTURE_STATE.ACTIVE)
  assert.equal(anim.animKey(), 'firestorm_active')
  // Past the active window it falls back to idle, never telegraph/charged/
  // recovery, no matter what phase/charge the packet carries.
  assert.equal(anim.update({ phase: 1, charge: 1, cycle: 1 }, 10_000), STRUCTURE_STATE.IDLE)
})
