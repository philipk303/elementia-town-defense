// Regression test for a class of gap found 2026-08-23: client/src/audio.js can
// declare a logical SFX name in SFX_NAMES/LOOP_SFX_NAMES with no matching file
// ever having been processed into client/public/audio/sfx/. Howler then 404s
// silently at runtime (no console warning, nothing plays) -- audioMap.test.js
// only checks the fx-type -> logical-name MAPPING is internally consistent, it
// never checks the declared names actually resolve to a file on disk. This
// test closes that gap by reading the real filesystem.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Provide a window-ish global BEFORE importing audio.js so it loads headless.
globalThis.window = globalThis
globalThis.window.__audioLog = []

const { SFX_NAMES, LOOP_SFX_NAMES } = await import('../../client/src/audio.js')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SFX_DIR = path.join(__dirname, '../../client/public/audio/sfx')

test('every declared SFX_NAMES entry has a processed .ogg file on disk', () => {
  const missing = SFX_NAMES.filter(name => !existsSync(path.join(SFX_DIR, `${name}.ogg`)))
  assert.deepEqual(missing, [], `SFX_NAMES declares names with no file under client/public/audio/sfx/: ${missing.join(', ')}`)
})

test('every LOOP_SFX_NAMES entry has a processed .ogg file on disk', () => {
  const missing = [...LOOP_SFX_NAMES].filter(name => !existsSync(path.join(SFX_DIR, `${name}.ogg`)))
  assert.deepEqual(missing, [], `LOOP_SFX_NAMES declares names with no file under client/public/audio/sfx/: ${missing.join(', ')}`)
})

test('LOOP_SFX_NAMES is a subset of SFX_NAMES (every loop name is also declared as an SFX asset)', () => {
  const notDeclared = [...LOOP_SFX_NAMES].filter(name => !SFX_NAMES.includes(name))
  assert.deepEqual(notDeclared, [], `LOOP_SFX_NAMES has names missing from SFX_NAMES: ${notDeclared.join(', ')}`)
})
