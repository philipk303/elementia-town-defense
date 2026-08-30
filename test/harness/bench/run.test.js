import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { test } from 'node:test'

import { readRecords } from './store.js'

const execFileAsync = promisify(execFile)
const RUNNER = fileURLToPath(new URL('./run.mjs', import.meta.url))

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'elementia-runner-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const specPath = join(dir, 'spec.json')
  const outPath = join(dir, 'runs.jsonl')
  await writeFile(specPath, JSON.stringify({
    sweepId: 'runner-test',
    familyId: 'runner-test-v1',
    mazes: ['A'],
    seeds: [20260801],
    protocol: { maxWaves: 1 },
    arms: [
      { armId: 'control' },
      { armId: 'dose', balanceOverrides: { 'ENEMY.BASE.0.hp': 30 } },
    ],
  }))
  return { specPath, outPath }
}

async function run(args) {
  return execFileAsync(process.execPath, [RUNNER, ...args], {
    cwd: process.cwd(),
    windowsHide: true,
  })
}

test('dry-run prints the Cartesian plan without creating a store', async t => {
  const { specPath, outPath } = await fixture(t)

  const { stdout } = await run(['--spec', specPath, '--out', outPath, '--workers', '2', '--dry-run'])

  assert.match(stdout, /Total runs:\s+4/)
  assert.match(stdout, /Arm: control/)
  assert.match(stdout, /Arm: dose/)
  assert.match(stdout, /Config hash \(first run\): [0-9a-f]{40}/)
  await assert.rejects(readFile(outPath), error => error.code === 'ENOENT')
})

test('a second invocation resumes without appending duplicate runs', async t => {
  const { specPath, outPath } = await fixture(t)
  const args = ['--spec', specPath, '--out', outPath, '--workers', '1']

  await run(args)
  const first = await readRecords(outPath)
  await run(args)
  const resumed = await readRecords(outPath)

  assert.equal(first.length, 4)
  assert.deepEqual(resumed, first)
  assert.deepEqual(new Set(first.map(rec => rec.armId)), new Set(['control', 'dose']))
  assert.ok(first.every(rec => rec.protocol.maxWaves === 1))
})

test('a failing arm does not stop healthy runs and makes the sweep exit non-zero', async t => {
  const { specPath, outPath } = await fixture(t)
  const spec = JSON.parse(await readFile(specPath, 'utf8'))
  spec.arms[1] = { armId: 'broken', balanceOverrides: { 'ENEMY.BASE': null } }
  await writeFile(specPath, JSON.stringify(spec))

  let failure
  try {
    await run(['--spec', specPath, '--out', outPath, '--workers', '2'])
  } catch (error) {
    failure = error
  }

  assert.equal(failure?.code, 1)
  assert.match(failure.stderr, /worker crash; no record written for protocol/)
  assert.match(failure.stderr, /crashed 2\./)
  const records = await readRecords(outPath)
  assert.equal(records.length, 2)
  assert.ok(records.every(rec => rec.armId === 'control'))
})
