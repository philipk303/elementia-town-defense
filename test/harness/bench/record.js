// The run record: the single interface between measurement and analysis.
//
// Balance Harness v2, spec section 2
// (docs/plans/2026-08-14-balance-harness-v2-spec.md).
//
// run.mjs WRITES records through makeRunRecord. analyze.mjs READS them and
// never invokes the sim. This module is the only place that knows the shape, so
// the two cannot drift apart — which matters because they are built
// independently and in parallel.
//
// THE RULE THAT MAKES THE STORE WORTH HAVING: a record is self-describing. It
// carries the fully-resolved protocol, the engine version, the balance hash and
// every balance override, so any past measurement can be re-analysed, re-pooled
// or refuted without re-running it. Two of this project's most consequential
// runs exist only as review prose, and one of them caused a verdict-changing
// error in a later review that tried to reason about it second-hand.

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { canonicalProtocol } from '../protocol.js'

export const SCHEMA_VERSION = 1

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..', '..')

const sha1 = s => createHash('sha1').update(s).digest('hex')

/**
 * The engine's identity. `dirty` is not cosmetic: a sweep taken on a dirty tree
 * cannot be reproduced from its gitSha alone, and analyze.mjs must be able to
 * say so rather than presenting the result as if it were pinned.
 */
export function engineVersion() {
  const git = args => execFileSync('git', args, { cwd: REPO, encoding: 'utf8' }).trim()
  return { gitSha: git(['rev-parse', '--short', 'HEAD']), dirty: git(['status', '--porcelain']).length > 0 }
}

/** Hash of the balance table AS SHIPPED, before any per-arm override. */
export function balanceHash() {
  return sha1(readFileSync(join(REPO, 'shared', 'balance.js'), 'utf8'))
}

// seed and postGap are the two axes a sweep ITERATES; everything else defines
// the cell being swept. Excluding them is what makes configHash a cell
// identity rather than a run identity.
const RUN_AXES = ['seed', 'postGap']

/**
 * The CELL identity. Two runs with the same configHash belong to the same cell:
 * same arm configuration, same maze, same engine, same balance table, same
 * overrides — differing only in which seed and post they drew.
 *
 * It originally hashed the whole protocol, seed included, which made it a
 * second run identity and left the analyser with nothing but `armId` to group
 * by (found by the WP1 agent, 2026-08-14). Grouping by label rather than by
 * content is not a cosmetic problem here: an arm whose overrides changed while
 * keeping its name would pool silently with its own earlier self, and "the
 * configuration moved under a stable label" is the single most repeated defect
 * in this project's measurement history. With the run axes excluded, the
 * analyser can refuse to pool two same-named arms whose cell hashes disagree.
 *
 * Overrides are key-sorted so `{a,b}` and `{b,a}` cannot produce two hashes for
 * one arm.
 */
export function configHashFor({ protocol, balanceOverrides = {}, engine, balance }) {
  const overrides = {}
  for (const k of Object.keys(balanceOverrides).sort()) overrides[k] = balanceOverrides[k]
  const cell = canonicalProtocol(protocol)
  for (const axis of RUN_AXES) delete cell[axis]
  return sha1(JSON.stringify({
    schema: SCHEMA_VERSION,
    protocol: cell,
    overrides,
    engine: `${engine.gitSha}${engine.dirty ? '+dirty' : ''}`,
    balance,
  }))
}

/**
 * The idempotency key. seed and postGap live in the protocol already, but they
 * are the two axes a sweep iterates, so naming them here keeps resume cheap:
 * the runner can decide whether a run is already done without re-resolving
 * anything.
 */
export function runIdFor(configHash, seed, postGap) {
  return sha1(`${configHash}:${seed}:${postGap}`)
}

const REQUIRED = [
  'schema', 'runId', 'configHash', 'sweepId', 'familyId', 'armId',
  'engineVersion', 'balanceHash', 'balanceOverrides', 'protocol',
  'outcome', 'metrics', 'waves', 'combat', 'placements', 'durationMs', 'startedAt',
]

const OUTCOME_KEYS = ['won', 'lost', 'stalled', 'timedOut', 'stoppedEarly']

/**
 * Build one record from a runMatch result.
 *
 * `metrics` deliberately keeps every scalar runMatch produced. Storage is
 * cheap and a metric you did not think to keep is a re-run: the whole of WP4
 * (choosing a lower-variance outcome than `score`) is only free because the
 * candidates are already in the store.
 */
export function makeRunRecord({ m, sweepId, familyId, armId, balanceOverrides = {}, engine, balance, durationMs, startedAt }) {
  const protocol = m.protocol
  const configHash = configHashFor({ protocol, balanceOverrides, engine, balance })

  const outcome = {}
  for (const k of OUTCOME_KEYS) outcome[k] = Boolean(m[k])

  // Everything scalar that is not already broken out into its own top-level
  // field. Objects and arrays (waves, combat, placements, protocol,
  // cooldownUtilization) are handled explicitly so `metrics` stays flat and
  // trivially aggregable.
  const skip = new Set([...OUTCOME_KEYS, 'protocol', 'waves', 'combat', 'placements', 'cooldownUtilization'])
  const metrics = {}
  for (const [k, v] of Object.entries(m)) {
    if (skip.has(k)) continue
    if (v === null || ['number', 'boolean', 'string'].includes(typeof v)) metrics[k] = v
  }

  const rec = {
    schema: SCHEMA_VERSION,
    runId: runIdFor(configHash, protocol.seed, protocol.postGap),
    configHash,
    sweepId, familyId, armId,
    engineVersion: engine,
    balanceHash: balance,
    balanceOverrides,
    protocol: canonicalProtocol(protocol),
    outcome,
    metrics,
    waves: m.waves,
    combat: m.combat,
    cooldownUtilization: m.cooldownUtilization,
    placements: m.placements,
    durationMs,
    startedAt,
  }
  validateRecord(rec)
  return rec
}

/**
 * Throws on a malformed record. Called on write (so a bad record never enters
 * the store) and on read (so a store hand-edited or produced by an older schema
 * fails loudly rather than being silently half-analysed).
 */
export function validateRecord(rec) {
  for (const k of REQUIRED) {
    if (!(k in rec)) throw new Error(`run record missing "${k}"`)
  }
  if (rec.schema !== SCHEMA_VERSION) {
    throw new Error(`run record schema ${rec.schema}, expected ${SCHEMA_VERSION}`)
  }
  for (const k of OUTCOME_KEYS) {
    if (typeof rec.outcome[k] !== 'boolean') throw new Error(`outcome.${k} must be boolean`)
  }
  // A record that resolves to none of the five terminal states means the run
  // loop exited a way nobody has accounted for. That is a bug report, not a
  // data point, and it must not be averaged into anything.
  if (!OUTCOME_KEYS.some(k => rec.outcome[k])) {
    throw new Error(`run ${rec.runId} has no terminal outcome — the loop exited an unaccounted way`)
  }
  if (typeof rec.metrics.score !== 'number' || !Number.isFinite(rec.metrics.score)) {
    throw new Error(`run ${rec.runId} has a non-finite score`)
  }
  return rec
}
