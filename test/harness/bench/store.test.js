import assert from 'node:assert/strict'
import { mkdtemp, rm, appendFile, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { runMatch } from '../matchRunner.js'
import { makeRunRecord } from './record.js'
import { appendRecord, loadedRunIds, openStore, readRecords } from './store.js'

const ENGINE = { gitSha: 'test-sha', dirty: false }
const BALANCE_HASH = 'test-balance-hash'

function recordFor(seed, armId = 'control') {
  const m = runMatch({ seed, maxWaves: 2 })
  return makeRunRecord({
    m,
    sweepId: 'store-test',
    familyId: 'store-test-v1',
    armId,
    engine: ENGINE,
    balance: BALANCE_HASH,
    durationMs: 1,
    startedAt: '2026-08-14T00:00:00.000Z',
  })
}

async function withTempStore(t, extension = '.jsonl') {
  const dir = await mkdtemp(join(tmpdir(), 'elementia-store-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return join(dir, `runs${extension}`)
}

async function appendAll(path, records) {
  const handle = await openStore(path)
  try {
    for (const rec of records) await appendRecord(handle, rec)
  } finally {
    await handle.close()
  }
}

test('append then read preserves a run record exactly', async t => {
  const path = await withTempStore(t)
  const rec = recordFor(20260801)

  await appendAll(path, [rec])

  assert.deepEqual(await readRecords(path), [rec])
})

test('opening an existing store appends without losing its records', async t => {
  const path = await withTempStore(t)
  const first = recordFor(20260801)
  const second = recordFor(20260802)

  await appendAll(path, [first])
  await appendAll(path, [second])

  assert.deepEqual(await readRecords(path), [first, second])
})

test('loadedRunIds returns exactly the persisted ids and tolerates a missing store', async t => {
  const path = await withTempStore(t)
  const records = [recordFor(20260801), recordFor(20260802)]

  assert.deepEqual(await loadedRunIds(path), new Set())
  await appendAll(path, records)

  assert.deepEqual(await loadedRunIds(path), new Set(records.map(rec => rec.runId)))
})

test('loadedRunIds tolerates a missing gzip store rather than dying on an unhandled stream error', async t => {
  const path = await withTempStore(t, '.jsonl.gz')

  assert.deepEqual(await loadedRunIds(path), new Set())
})

test('a malformed complete line throws with its line number', async t => {
  const path = await withTempStore(t)
  await appendAll(path, [recordFor(20260801)])
  await appendFile(path, '{not json}\n')

  await assert.rejects(readRecords(path), /line 2/i)
})

test('an unterminated corrupt trailing line warns and is skipped', async t => {
  const path = await withTempStore(t)
  const rec = recordFor(20260801)
  await appendAll(path, [rec])
  await appendFile(path, '{"schema":1')
  const warnings = []
  const originalWarn = console.warn
  console.warn = warning => warnings.push(String(warning))
  t.after(() => { console.warn = originalWarn })

  assert.deepEqual(await readRecords(path), [rec])
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /line 2/i)
  assert.match(warnings[0], /trailing/i)
})

test('gzip and plain stores expose identical records and resume ids', async t => {
  const plainPath = await withTempStore(t)
  const gzipPath = await withTempStore(t, '.jsonl.gz')
  const records = [recordFor(20260801), recordFor(20260802)]

  await appendAll(plainPath, records)
  await appendAll(gzipPath, records)

  assert.deepEqual(await readRecords(gzipPath), await readRecords(plainPath))
  assert.deepEqual(await loadedRunIds(gzipPath), await loadedRunIds(plainPath))
})

test('a truncated final gzip member warns and preserves earlier records', async t => {
  const path = await withTempStore(t, '.jsonl.gz')
  const records = [recordFor(20260801), recordFor(20260802)]
  await appendAll(path, records)
  const bytes = await readFile(path)
  await writeFile(path, bytes.subarray(0, bytes.length - 8))
  const warnings = []
  const originalWarn = console.warn
  console.warn = warning => warnings.push(String(warning))
  t.after(() => { console.warn = originalWarn })

  assert.deepEqual(await readRecords(path), [records[0]])
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /trailing/i)
  assert.match(warnings[0], /line 2/i)
})

test('appendRecord validates before a malformed record reaches disk', async t => {
  const path = await withTempStore(t)
  const warnings = []
  const originalWarn = console.warn
  console.warn = warning => warnings.push(String(warning))
  t.after(() => { console.warn = originalWarn })
  const handle = await openStore(path)
  try {
    await assert.rejects(appendRecord(handle, { schema: 1 }), /missing "runId"/)
  } finally {
    await handle.close()
  }

  assert.deepEqual(await readRecords(path), [])
  assert.deepEqual(warnings, [])
})

test('a stored protocol reproduces its score through runMatch', async t => {
  const path = await withTempStore(t)
  const rec = recordFor(20260801)
  await appendAll(path, [rec])

  const [stored] = await readRecords(path)
  const replay = runMatch(stored.protocol)

  assert.equal(replay.score, stored.metrics.score)
})
