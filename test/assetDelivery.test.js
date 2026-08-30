// The runtime asset integration gate (docs/superpowers/specs/2026-08-08-
// runtime-asset-integration-gate-design.md): a repository-owned check that
// art/assets-manifest.json's delivery claims are actually backed by files on
// disk and registration in client/src/assets/manifest.js, so an asset can
// never be recorded as further along than what the checked-out tree can
// actually load. Exposed as `npm run test:asset-delivery` and folded into
// the ordinary `npm test` glob (test/**/*.test.js).
//
// Audio gate added 2026-08-10 once the first entries actually claimed a
// processed/integrated state (docs/assets/audio-fx-wiring-2026-08-09.md) —
// before that this file was graphics-only, since validating an audio schema
// nothing had ever populated would be worse than validating nothing.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { ATLASES, IMAGES } from '../client/src/assets/manifest.js'
import { SFX_NAMES, MUSIC_SRC } from '../client/src/audio.js'

const graphics = JSON.parse(readFileSync(new URL('../art/assets-manifest.json', import.meta.url), 'utf8'))
const audioManifest = JSON.parse(readFileSync(new URL('../audio/assets-manifest.json', import.meta.url), 'utf8'))

// Ledger `pillow.output`/`source.reference_path` values are free-text,
// human-readable strings ("A.png + A.json", or "A.png + A.json; B.png +
// B.json" for a multi-atlas package like Rock Trap) rather than a
// structured list — pull every `client/public/...` path out of them rather
// than depending on a fixed separator convention.
function extractPaths(text) {
  if (!text) return []
  return text
    .split(/\s+/)
    .filter((tok) => tok.includes('client/public/'))
    .map((tok) => tok.replace(/[;,]+$/, ''))
}

test('every graphics asset claiming production_converted has its packaged output on disk', () => {
  for (const asset of graphics.assets) {
    if (asset.pillow?.status !== 'production_converted') continue
    const paths = extractPaths(asset.pillow.output)
    assert.ok(paths.length > 0, `${asset.id}: production_converted but pillow.output has no client/public/ path`)
    for (const p of paths) {
      assert.ok(existsSync(p), `${asset.id}: claimed pillow output missing on disk: ${p}`)
    }
  }
})

test('every graphics asset claiming gameplay_integrated (or isolated_preview_loaded/atlas_registered) has a registered runtime key', () => {
  const REGISTERED_STATUSES = new Set([
    'gameplay_integrated', 'isolated_preview_loaded', 'atlas_registered',
  ])
  for (const asset of graphics.assets) {
    const status = asset.runtime?.status
    if (!status || !REGISTERED_STATUSES.has(status)) continue
    const key = asset.runtime.atlas_key ?? asset.runtime.image_key ?? asset.runtime.effect_atlas_key
    if (!key) continue // e.g. shared_presentation entries render procedurally, no image key to check
    const registered = ATLASES.some((a) => a.key === key) || IMAGES.some((i) => i.key === key)
    assert.ok(registered, `${asset.id}: runtime status '${status}' but key '${key}' is not in ATLASES or IMAGES`)
  }
})

test('every ATLASES entry has both a PNG and a JSON on disk', () => {
  for (const { key, png, json } of ATLASES) {
    assert.ok(existsSync(`client/public/${png}`), `${key}: missing atlas PNG client/public/${png}`)
    assert.ok(existsSync(`client/public/${json}`), `${key}: missing atlas JSON client/public/${json}`)
  }
})

test('every IMAGES entry has its PNG on disk', () => {
  for (const { key, png } of IMAGES) {
    assert.ok(existsSync(`client/public/${png}`), `${key}: missing image PNG client/public/${png}`)
  }
})

test('no two ATLASES/IMAGES entries share a runtime key', () => {
  const keys = [...ATLASES, ...IMAGES].map((a) => a.key)
  assert.deepEqual(keys, [...new Set(keys)], 'duplicate runtime key across ATLASES/IMAGES')
})

test('every audio asset claiming processed has its runtime file on disk', () => {
  for (const asset of audioManifest.assets) {
    if (asset.processing_status !== 'processed') continue
    const rel = asset.processing?.output
    assert.ok(rel, `${asset.id}: processed but processing.output is missing`)
    assert.ok(existsSync(rel), `${asset.id}: claimed processed output missing on disk: ${rel}`)
  }
})

test('every non-music audio asset claiming wired has its logical name declared in SFX_NAMES', () => {
  for (const asset of audioManifest.assets) {
    if (asset.category === 'music') continue
    if (asset.integration_status !== 'wired') continue
    assert.ok(
      SFX_NAMES.includes(asset.runtime_id),
      `${asset.id}: integration_status 'wired' but '${asset.runtime_id}' is not in client/src/audio.js's SFX_NAMES`,
    )
  }
})

test('every music asset claiming wired has its logical name declared in MUSIC_SRC', () => {
  for (const asset of audioManifest.assets) {
    if (asset.category !== 'music') continue
    if (asset.integration_status !== 'wired') continue
    assert.ok(
      Object.prototype.hasOwnProperty.call(MUSIC_SRC, asset.runtime_id),
      `${asset.id}: integration_status 'wired' but '${asset.runtime_id}' is not in client/src/audio.js's MUSIC_SRC`,
    )
  }
})

test('every MUSIC_SRC entry resolves to a file that exists under client/public/', () => {
  for (const [key, srcs] of Object.entries(MUSIC_SRC)) {
    assert.ok(Array.isArray(srcs) && srcs.length > 0, `${key}: MUSIC_SRC entry has no src`)
    for (const rel of srcs) {
      assert.ok(existsSync(`client/public/${rel}`), `${key}: MUSIC_SRC path missing on disk: client/public/${rel}`)
    }
  }
})

function totalBytesUnder(dir) {
  let total = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${entry.name}`
    if (entry.isDirectory()) total += totalBytesUnder(p)
    else total += statSync(p).size
  }
  return total
}

test('total shipped audio (client/public/audio) stays under the pipeline\'s 10MB budget', () => {
  const totalMb = totalBytesUnder('client/public/audio') / (1024 * 1024)
  assert.ok(totalMb < 10, `client/public/audio is ${totalMb.toFixed(2)}MB, over the pipeline's 10MB total-shipped-audio budget`)
})

test('Marketplace has a 2x2 packaged runtime image registered under its structure key', () => {
  const marketplace = graphics.assets.find((asset) => asset.id === 'marketplace')
  assert.deepEqual(marketplace.footprint_tiles, { w: 2, h: 2, walkable: false })
  assert.equal(marketplace.pillow.status, 'production_converted')
  assert.equal(marketplace.runtime.status, 'runtime-registered')
  assert.ok(IMAGES.some((image) => image.key === 'marketplace' && image.png === 'art/marketplace.png'))
  assert.ok(existsSync('client/public/art/marketplace.png'))
})
