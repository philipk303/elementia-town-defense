// Focused delivery test for the enemy sprites and Fireball projectile
// recovered from codex/asset-wiring-prep — no dedicated QA doc existed for
// these before docs/assets/enemies-production-qa.md, so this is the
// executable form of that doc's "verification performed" table. Decodes the
// PNG directly (IHDR + inflated IDAT) rather than depending on an image
// library, since this repo has none available to `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { inflateSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { IMAGES, enemyArtKey } from '../../client/src/assets/manifest.js'

function decodePng(buf) {
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20)
  const colorType = buf.readUInt8(25)
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 1
  const idats = []
  let offset = 8
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset)
    const type = buf.toString('ascii', offset + 4, offset + 8)
    if (type === 'IDAT') idats.push(buf.subarray(offset + 8, offset + 8 + len))
    offset += 8 + len + 4
  }
  const raw = inflateSync(Buffer.concat(idats))
  const stride = w * bpp
  const pixels = Buffer.alloc(h * stride)
  let prevRow = Buffer.alloc(stride)
  let rp = 0
  for (let y = 0; y < h; y++) {
    const filter = raw[rp]; rp++
    const row = raw.subarray(rp, rp + stride); rp += stride
    const out = Buffer.alloc(stride)
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[x - bpp] : 0
      const b = prevRow[x]
      const c = x >= bpp ? prevRow[x - bpp] : 0
      let val = row[x]
      if (filter === 1) val = (val + a) & 0xff
      else if (filter === 2) val = (val + b) & 0xff
      else if (filter === 3) val = (val + ((a + b) >> 1)) & 0xff
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        val = (val + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff
      }
      out[x] = val
    }
    out.copy(pixels, y * stride)
    prevRow = out
  }
  return { w, h, bpp, colorType, pixels }
}

function alphaAt(img, x, y) {
  if (img.bpp < 4) return 255
  return img.pixels[(y * img.w + x) * img.bpp + 3]
}

async function loadPng(relPath) {
  const buf = await readFile(fileURLToPath(new URL(`../../${relPath}`, import.meta.url)))
  return decodePng(buf)
}

const CASES = [
  { key: 'goblin', file: 'client/public/art/goblin.png', size: 24 },
  { key: 'orc', file: 'client/public/art/orc.png', size: 28 },
  { key: 'troll', file: 'client/public/art/troll.png', size: 32 },
  { key: 'fireball', file: 'client/public/art/fireball.png', size: 24 },
]

for (const { key, file, size } of CASES) {
  test(`${key} is registered in IMAGES at its declared runtime key and path`, () => {
    assert.deepEqual(IMAGES.find((img) => img.key === key), { key, png: file.replace('client/public/', '') })
  })

  test(`${key}.png is a real ${size}x${size} RGBA sprite with transparent corners and opaque content`, async () => {
    const img = await loadPng(file)
    assert.equal(img.w, size)
    assert.equal(img.h, size)
    assert.equal(img.colorType, 6, 'must be RGBA (PNG color type 6)')
    for (const [cx, cy] of [[0, 0], [img.w - 1, 0], [0, img.h - 1], [img.w - 1, img.h - 1]]) {
      assert.equal(alphaAt(img, cx, cy), 0, `corner (${cx},${cy}) must be fully transparent`)
    }
    let opaque = 0
    for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if (alphaAt(img, x, y) > 10) opaque++
    assert.ok(opaque > 20, `expected real foreground content, got only ${opaque} opaque pixels`)
  })
}

test('enemyArtKey maps every base type index to a registered IMAGES key', () => {
  for (let i = 0; i < 3; i++) {
    const key = enemyArtKey(i)
    assert.ok(key, `type index ${i} has no art key`)
    assert.ok(IMAGES.some((img) => img.key === key), `${key} is not registered in IMAGES`)
  }
})
