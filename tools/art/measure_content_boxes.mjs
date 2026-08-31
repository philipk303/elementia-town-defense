// Measures, for every structure image, the box its VISIBLE pixels actually
// occupy inside its frame — and writes the result as a generated module the
// renderer reads.
//
// WHY. Structure art carries between 3% and 31% of empty margin inside its
// frame. The renderer fits the FRAME to the footprint, so that margin is
// rendered as blank tile and the building reads smaller than the 2x2 (or 1x1)
// it actually occupies. Worst cases measured 2026-08-30: farm 69% of its
// width, hall 78%, steam_vent 81%, magma_trap 88%W/74%H.
//
// Fitting the CONTENT box instead makes every structure fill its footprint,
// and gives the ground line for free (the content's bottom edge), which is why
// this also replaces the hand-maintained BASELINE_Y table in
// client/src/render/structureVisuals.js.
//
// The box is the UNION across every frame of an animated atlas, never
// per-frame: a per-frame box would rescale the sprite each time the animation
// advanced, and the structure would visibly pulse.
//
// Run: node tools/art/measure_content_boxes.mjs

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
// (art paths come from the manifest below, never guessed from the key name)
const OUT = path.join(ROOT, 'client/src/render/structureContentBoxes.js')

// Pixels this faint are treated as margin, not content — a soft glow's tail
// should not count as the building's edge.
const ALPHA_THRESHOLD = 8

// Image keys the renderer asks for. structureArtKey() lowercases the runtime
// type, plus the Hall which is drawn on its own path.
const KEYS = [
  'hall', 'barricade', 'snare_post', 'watchtower', 'farm', 'marketplace',
  'earth_special', 'fire_special', 'water_special', 'wind_special',
  'magma_trap', 'firestorm', 'muddy_bog', 'blizzard', 'steam_vent', 'grinder',
]

// Key -> files comes from the CLIENT MANIFEST, never from the key name.
// Several keys deliberately do not match their filenames (wind_special ->
// wind_vortex.*, firestorm -> firestorm_fx.*), and in firestorm's case a
// superseded art/firestorm.png is still on disk as lineage evidence and is
// deliberately unregistered — guessing by filename measures the wrong file.
const { ATLASES, IMAGES } = await import('file://' + path.join(ROOT, 'client/src/assets/manifest.js').replace(/\\/g, '/'))
const REGISTERED = new Map(
  [...ATLASES, ...IMAGES].map(e => [e.key, { png: e.png, json: e.json ?? null }]),
)

function decodeRGBA(file) {
  const buf = fs.readFileSync(file)
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20)
  if (buf[24] !== 8 || buf[25] !== 6) {
    throw new Error(`${path.basename(file)}: expected 8-bit RGBA, got bitDepth=${buf[24]} colorType=${buf[25]}`)
  }
  let off = 8
  const idat = []
  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    if (buf.toString('ascii', off + 4, off + 8) === 'IDAT') idat.push(buf.subarray(off + 8, off + 8 + len))
    off += 12 + len
  }
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const bpp = 4, stride = w * bpp
  const out = Buffer.alloc(h * stride)
  let p = 0
  for (let y = 0; y < h; y++) {
    const filter = raw[p++]
    for (let x = 0; x < stride; x++) {
      const rb = raw[p + x]
      const a = x >= bpp ? out[y * stride + x - bpp] : 0
      const b = y > 0 ? out[(y - 1) * stride + x] : 0
      const c = (x >= bpp && y > 0) ? out[(y - 1) * stride + x - bpp] : 0
      let v
      if (filter === 0) v = rb
      else if (filter === 1) v = rb + a
      else if (filter === 2) v = rb + b
      else if (filter === 3) v = rb + ((a + b) >> 1)
      else if (filter === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c)
        v = rb + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)
      } else throw new Error(`unknown PNG filter ${filter}`)
      out[y * stride + x] = v & 0xff
    }
    p += stride
  }
  return { w, h, px: out, stride }
}

// Every frame rect in the sheet. Atlas JSON if registered, else the whole image.
function frameRects(jsonRel, img) {
  if (!jsonRel) return [{ x: 0, y: 0, w: img.w, h: img.h }]
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'client/public', jsonRel), 'utf8'))
  const frames = Array.isArray(j.frames) ? j.frames : Object.values(j.frames)
  return frames.map(f => f.frame)
}

function unionContentBox(img, rects) {
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1
  let fw = 0, fh = 0
  for (const r of rects) {
    fw = Math.max(fw, r.w); fh = Math.max(fh, r.h)
    for (let y = 0; y < r.h; y++) {
      for (let x = 0; x < r.w; x++) {
        const a = img.px[(r.y + y) * img.stride + (r.x + x) * 4 + 3]
        if (a > ALPHA_THRESHOLD) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
  }
  if (maxX < 0) return null
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, frameW: fw, frameH: fh }
}

const boxes = {}
const report = []
for (const key of KEYS) {
  const reg = REGISTERED.get(key)
  if (!reg) { report.push(`${key.padEnd(15)} SKIPPED — not registered in the client manifest`); continue }
  const png = path.join(ROOT, 'client/public', reg.png)
  if (!fs.existsSync(png)) { report.push(`${key.padEnd(15)} SKIPPED — missing ${reg.png}`); continue }
  const img = decodeRGBA(png)
  const rects = frameRects(reg.json, img)
  const box = unionContentBox(img, rects)
  if (!box) { report.push(`${key.padEnd(15)} SKIPPED — fully transparent`); continue }
  boxes[key] = box
  const pw = (box.w / box.frameW * 100).toFixed(0), ph = (box.h / box.frameH * 100).toFixed(0)
  report.push(`${key.padEnd(15)} frame ${box.frameW}x${box.frameH}  content ${box.w}x${box.h} @${box.x},${box.y}  (${pw}%W ${ph}%H, ${rects.length} frame${rects.length > 1 ? 's' : ''})`)
}

const body = Object.entries(boxes)
  .map(([k, b]) => `  ${k}: { x: ${b.x}, y: ${b.y}, w: ${b.w}, h: ${b.h}, frameW: ${b.frameW}, frameH: ${b.frameH} },`)
  .join('\n')

fs.writeFileSync(OUT, `// GENERATED by tools/art/measure_content_boxes.mjs — do not edit by hand.
// Re-run that script after changing any structure art.
//
// The box each structure's VISIBLE pixels occupy inside its frame, as the
// UNION across every frame of its atlas (a per-frame box would rescale the
// sprite as the animation advanced). Coordinates are frame-local pixels.
//
// The renderer fits this box — not the frame — to the footprint, so authored
// margin is not rendered as blank tile, and the box's bottom edge is the
// structure's ground line.
export const STRUCTURE_CONTENT_BOX = {
${body}
}
`)

console.log(report.join('\n'))
console.log(`\nwrote ${path.relative(ROOT, OUT)} (${Object.keys(boxes).length} entries)`)
