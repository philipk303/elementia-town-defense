import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const PYTHON = 'C:/Users/phili/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
const PIPELINE = 'tools/art/blizzard_pipeline.py'
const ATLAS = 'client/public/art/blizzard_fx.png'
const META = 'client/public/art/blizzard_fx.json'
const STRUCTURE = 'client/public/art/blizzard.png'

test('Blizzard pipeline packages warning, spike, and shatter into an untrimmed atlas', () => {
  execFileSync(PYTHON, [PIPELINE], { stdio: 'pipe' })
  assert.ok(existsSync(ATLAS))
  assert.ok(existsSync(STRUCTURE))
  const meta = JSON.parse(readFileSync(META, 'utf8'))
  assert.deepEqual(Object.keys(meta.frames), ['warning_0.png', 'spike_0.png', 'shatter_0.png'])
  assert.equal(meta.meta.size.w, 196)
  assert.equal(meta.meta.size.h, 64)
  for (const frame of Object.values(meta.frames)) {
    assert.equal(frame.frame.w, 64)
    assert.equal(frame.frame.h, 64)
    assert.equal(frame.trimmed, false)
  }
})
