// The run record's identity contract.
//
// configHash is a CELL identity and runId is a RUN identity, and the difference
// is load-bearing: the analyser groups by cell, and a cell whose definition
// changed under a stable armId is the most repeated defect in this project's
// measurement history.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { configHashFor, runIdFor, validateRecord, makeRunRecord } from './record.js'
import { resolveProtocol } from '../protocol.js'

const engine = { gitSha: 'abc1234', dirty: false }
const balance = 'balance-hash-a'
const cfg = (partial, balanceOverrides = {}) =>
  configHashFor({ protocol: resolveProtocol({ seed: 1, ...partial }).protocol, balanceOverrides, engine, balance })

test('configHash is stable across seed and postGap — it identifies the CELL', () => {
  assert.equal(cfg({ seed: 1, postGap: 0 }), cfg({ seed: 999, postGap: 1 }),
    'two runs in the same cell must share a configHash, or the analyser has nothing but armId to group by')
})

test('configHash moves when anything that defines the cell moves', () => {
  const baseline = cfg({})
  assert.notEqual(baseline, cfg({ mazeName: 'B' }), 'maze')
  assert.notEqual(baseline, cfg({ specialSiting: 'flank' }), 'siting')
  assert.notEqual(baseline, cfg({ fuseWave: 1 }), 'fuseWave')
  assert.notEqual(baseline, cfg({ legacySiting: true }), 'siting protocol')
  assert.notEqual(baseline, cfg({}, { 'ENEMY.BASE.0.hp': 30 }), 'a balance override')
  assert.notEqual(baseline, configHashFor({
    protocol: resolveProtocol({ seed: 1 }).protocol, engine: { gitSha: 'def5678', dirty: false }, balance,
  }), 'engine version')
  assert.notEqual(baseline, configHashFor({
    protocol: resolveProtocol({ seed: 1 }).protocol, engine, balance: 'balance-hash-b',
  }), 'balance table')
})

test('a dirty tree produces a different configHash than a clean one at the same sha', () => {
  const p = resolveProtocol({ seed: 1 }).protocol
  assert.notEqual(
    configHashFor({ protocol: p, engine: { gitSha: 'abc1234', dirty: false }, balance }),
    configHashFor({ protocol: p, engine: { gitSha: 'abc1234', dirty: true }, balance }),
    'a sweep taken on a dirty tree is not reproducible from its sha and must not pool with one that is',
  )
})

test('override key order does not change the hash', () => {
  const p = resolveProtocol({ seed: 1 }).protocol
  const a = configHashFor({ protocol: p, balanceOverrides: { x: 1, y: 2 }, engine, balance })
  const b = configHashFor({ protocol: p, balanceOverrides: { y: 2, x: 1 }, engine, balance })
  assert.equal(a, b)
})

test('runId separates runs within a cell', () => {
  const c = cfg({})
  assert.notEqual(runIdFor(c, 1, 0), runIdFor(c, 2, 0), 'different seed')
  assert.notEqual(runIdFor(c, 1, 0), runIdFor(c, 1, 1), 'different post')
  assert.equal(runIdFor(c, 1, 0), runIdFor(c, 1, 0), 'and is deterministic')
})

test('configHashFor does not mutate the protocol it is given', () => {
  const { protocol } = resolveProtocol({ seed: 1 })
  configHashFor({ protocol, engine, balance })
  assert.equal(protocol.seed, 1, 'the run axes must be stripped from a copy, never from the caller\'s frozen protocol')
  assert.equal(protocol.postGap, 0)
})

test('validateRecord rejects a run with no terminal outcome', () => {
  const rec = makeRunRecord({
    m: {
      protocol: resolveProtocol({ seed: 1 }).protocol, score: 5, won: true,
      waves: [], combat: {}, cooldownUtilization: [], placements: [],
    },
    sweepId: 's', familyId: 'f', armId: 'control', engine, balance, durationMs: 1, startedAt: 'now',
  })
  assert.ok(validateRecord(rec))
  // A loop that exited a way nobody accounted for is a bug report, not a data
  // point, and must never be averaged into anything.
  assert.throws(() => validateRecord({ ...rec, outcome: { ...rec.outcome, won: false } }),
    /no terminal outcome/)
})
