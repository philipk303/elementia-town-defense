import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { ATLASES, ELEMENT_ATLAS_KEY } from '../../client/src/assets/manifest.js'

const HERO_STATES = ['idle', 'run', 'attack', 'cast', 'hurt', 'death']
const DIRECTIONS = ['down', 'up', 'left', 'right']

async function loadHeroAtlas(key) {
  const url = new URL(`../../client/public/art/${key}.json`, import.meta.url)
  return JSON.parse(await readFile(url, 'utf8'))
}

for (const [element, key] of [['FIRE', 'chibi_fire'], ['EARTH', 'chibi_earth']]) {
  test(`${element} hero registers under ${key} and matches ELEMENT_ATLAS_KEY`, () => {
    assert.deepEqual(ATLASES.find((a) => a.key === key), {
      key, png: `art/${key}.png`, json: `art/${key}.json`,
    })
    assert.equal(ELEMENT_ATLAS_KEY[element], key)
  })

  test(`${key} atlas ships all 6 states x 4 directions, same 80-frame contract as chibi_wind/chibi_water`, async () => {
    const atlas = await loadHeroAtlas(key)
    const groups = new Set(Object.keys(atlas.frames).map((n) => n.replace(/_\d+\.png$/, '')))
    const expectedGroups = new Set(
      HERO_STATES.flatMap((state) => DIRECTIONS.map((dir) => `${state}_${dir}`)),
    )
    assert.deepEqual(groups, expectedGroups)
    assert.equal(Object.keys(atlas.frames).length, 80)
  })
}
