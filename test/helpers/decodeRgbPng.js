// Minimal PNG reader for the one shape the art pipelines write: 8-bit
// truecolour (colour type 2), non-interlaced. Pulling in an image dependency
// for the handful of assertions that need pixels would cost more than the ~45
// lines it replaces. Used by groundLayer.test.js and themeContrast.test.js.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

export function decodeRgbPng(path) {
  const buf = readFileSync(path)
  assert.equal(buf.readUInt32BE(0), 0x89504e47, `${path}: not a PNG`)

  const width = buf.readUInt32BE(16)
  const height = buf.readUInt32BE(20)
  assert.equal(buf[24], 8, `${path}: expected 8-bit channels`)
  assert.equal(buf[25], 2, `${path}: expected truecolour RGB (no alpha)`)
  assert.equal(buf[28], 0, `${path}: expected non-interlaced`)

  const idat = []
  for (let off = 8; off + 8 <= buf.length;) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    if (type === 'IDAT') idat.push(buf.subarray(off + 8, off + 8 + len))
    off += len + 12
    if (type === 'IEND') break
  }
  const raw = inflateSync(Buffer.concat(idat))

  // Undo the per-scanline filters (PNG spec 9.2).
  const bpp = 3
  const stride = width * bpp
  const out = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[y * stride + i - bpp] : 0
      const b = y > 0 ? out[(y - 1) * stride + i] : 0
      const c = (i >= bpp && y > 0) ? out[(y - 1) * stride + i - bpp] : 0
      let v = src[i]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c)
      }
      out[y * stride + i] = v & 0xff
    }
  }
  return { width, height, data: out }
}

// WCAG 2.1 relative luminance and contrast ratio. The 3:1 threshold used by
// the callers is the non-text / graphical-object level (SC 1.4.11), which is
// the right bar for sprites and placement overlays.
function channel(v) {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance([r, g, b]) {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(a, b) {
  const x = relativeLuminance(a) + 0.05
  const y = relativeLuminance(b) + 0.05
  return Math.max(x, y) / Math.min(x, y)
}

// Mean RGB of a horizontal band of the image, given fractions of its height.
export function bandMean(img, fromFrac, toFrac) {
  const y0 = Math.floor(img.height * fromFrac)
  const y1 = Math.floor(img.height * toFrac)
  let r = 0, g = 0, b = 0, n = 0
  for (let y = y0; y < y1; y += 3) {
    for (let x = 0; x < img.width; x += 3) {
      const i = (y * img.width + x) * 3
      r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]
      n++
    }
  }
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)]
}
