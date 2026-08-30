import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { ATLASES, structureArtKey } from '../../client/src/assets/manifest.js'

const atlasJson = new URL('../../client/public/art/magma_trap.json', import.meta.url)

test('Volcano registers its state atlas at the MAGMA_TRAP runtime key', () => {
  assert.deepEqual(ATLASES.find((atlas) => atlas.key === 'magma_trap'), {
    key: 'magma_trap', png: 'art/magma_trap.png', json: 'art/magma_trap.json',
  })
  assert.equal(structureArtKey('MAGMA_TRAP'), 'magma_trap')
})

test('Volcano atlas provides every StructureAnimator state', async () => {
  const { frames } = JSON.parse(await readFile(atlasJson, 'utf8'))
  assert.deepEqual(Object.keys(frames), [
    'idle_0.png', 'telegraph_0.png', 'charged_0.png', 'active_0.png', 'recovery_0.png',
  ])
})
