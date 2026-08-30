import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { benjaminiHochberg, mde } from '../stats.js'
import { PROTOCOL_DEFAULTS, resolveProtocol } from '../protocol.js'
import { analyzeOptionSet, analyzeRecords, renderOptionSet, renderText } from './analyze.mjs'

const REPO_PREREG = new URL('../prereg/', import.meta.url)
const ANALYZE_CLI = fileURLToPath(new URL('./analyze.mjs', import.meta.url))

function fixtureRecord({
  familyId = 'metric-selection-v1', armId = 'control', maze = 'A', seed = 1,
  postGap = 0, score = 8, startedAt = '2026-08-15T00:00:00.000Z',
  gitSha = 'abc1234', dirty = false, balanceHash = 'balance-a', runId,
  outcome = { won: true, lost: false, stalled: false, timedOut: false, stoppedEarly: false },
  metrics = {}, waves = [],
} = {}) {
  return {
    schema: 1,
    runId: runId ?? `${familyId}:${armId}:${maze}:${seed}:${postGap}:${gitSha}`,
    // A CELL identity, so it must NOT vary with seed or postGap — see
    // record.js configHashFor. The first version of this fixture included both,
    // which made every arm look like it carried one configHash per run and
    // tripped the cell-drift detector on every synthetic family.
    configHash: `config:${armId}:${maze}:${gitSha}:${balanceHash}`,
    sweepId: 'synthetic-wp2', familyId, armId,
    engineVersion: { gitSha, dirty }, balanceHash, balanceOverrides: {},
    // Built from PROTOCOL_DEFAULTS rather than hand-listed. The first version
    // of this fixture spelled the maze key `maze` (following the spec's
    // section-2 example) while protocol.js and record.js persist `mazeName`.
    // Every test here passed against that fixture while the real pipeline was
    // silently labelling every cell `undefined` and downgrading all of them to
    // EXPLORATORY. A fixture that only agrees with itself validates nothing —
    // which is the exact failure this whole harness exists to stop making.
    // `protocolConformsToResolver` below pins the two together.
    protocol: { ...PROTOCOL_DEFAULTS, mazeName: maze, seed, postGap, maxWaves: 10 },
    outcome, metrics: { score, ...metrics }, waves, combat: {}, placements: [],
    durationMs: 1, startedAt,
  }
}

function pairedFamily({ familyId = 'metric-selection-v1', armId = 'dose-13', count = 40 } = {}) {
  const records = []
  const noise = [-0.2, -0.1, 0, 0.1, 0.2]
  for (let seed = 1; seed <= count; seed++) {
    const control = 8 + (seed % 4) * 0.25
    records.push(fixtureRecord({ familyId, armId: 'control', seed, score: control }))
    records.push(fixtureRecord({
      familyId, armId, seed,
      score: control - 1 + noise[(seed - 1) % noise.length],
    }))
  }
  return records
}

test('ANALYZE: a family with no prereg prints descriptives and no verdict tokens', () => {
  const preregDir = mkdtempSync(join(tmpdir(), 'elementia-prereg-'))
  try {
    const records = pairedFamily({ familyId: 'unregistered-family', count: 4 })
    const result = analyzeRecords(records, { preregDir, metric: 'score' })
    const text = renderText(result)
    assert.match(text, /EXPLORATORY — NO VERDICT/)
    assert.doesNotMatch(text, /\b(?:PASS|FAIL)\b/)
    assert.equal(result.families[0].bands[0].comparisons.length, 0,
      'unregistered output is descriptive, not an ungated inferential result')
  } finally {
    rmSync(preregDir, { recursive: true, force: true })
  }
})

test('ANALYZE: a metric absent from the prereg is tagged exploratory per row', () => {
  const records = pairedFamily().map(record => ({
    ...record, metrics: { ...record.metrics, unregisteredMetric: record.metrics.score * 2 },
  }))
  const result = analyzeRecords(records, { preregDir: REPO_PREREG, metric: 'unregisteredMetric' })
  const row = result.families[0].bands[0].comparisons[0]
  assert.equal(row.status, 'exploratory')
  assert.match(row.reasons.join(' '), /metric.*not declared/i)
  assert.match(renderText(result), /unregisteredMetric.*EXPLORATORY/)
})

test('ANALYZE: an undeclared arm is tagged exploratory per row', () => {
  const result = analyzeRecords(pairedFamily({ armId: 'rogue-arm' }), {
    preregDir: REPO_PREREG, metric: 'score',
  })
  const row = result.families[0].bands[0].comparisons[0]
  assert.equal(row.status, 'exploratory')
  assert.match(row.reasons.join(' '), /cell.*not declared/i)
})

test('ANALYZE: a schema-invalid prereg produces descriptives but no verdict', () => {
  const preregDir = mkdtempSync(join(tmpdir(), 'elementia-invalid-prereg-'))
  try {
    writeFileSync(join(preregDir, 'bad-family.json'), JSON.stringify({ familyId: 'bad-family' }))
    const records = pairedFamily({ familyId: 'bad-family', count: 4 })
    const result = analyzeRecords(records, { preregDir, metric: 'score' })
    assert.equal(result.families[0].registration.status, 'invalid')
    assert.match(renderText(result), /schema-invalid/i)
    assert.doesNotMatch(renderText(result), /\b(?:PASS|FAIL)\b/)
  } finally {
    rmSync(preregDir, { recursive: true, force: true })
  }
})

// A ladder positive control has no single expected effect, so the schema
// accepts expectedDirection in place of the numeric expectedEffect. The
// validator has no anyOf, so "exactly one of" lives in loadRegistration — and a
// control committing to NEITHER a size nor an ordering has made no falsifiable
// prediction, which is the only reason to declare a positive control at all.
test('ANALYZE: a positive control must commit to exactly one of effect or direction', () => {
  const preregDir = mkdtempSync(join(tmpdir(), 'elementia-poscontrol-prereg-'))
  try {
    const base = JSON.parse(readFileSync(new URL('../prereg/metric-selection-v1.json', import.meta.url), 'utf8'))
    const statusFor = (positiveControl, familyId) => {
      const prereg = { ...base, familyId, positiveControl }
      writeFileSync(join(preregDir, `${familyId}.json`), JSON.stringify(prereg))
      const result = analyzeRecords(pairedFamily({ familyId, count: 4 }), { preregDir, metric: 'score' })
      return result.families[0].registration
    }
    const { armId, override } = base.positiveControl

    const neither = statusFor({ armId, override }, 'poscontrol-neither')
    assert.equal(neither.status, 'invalid')
    assert.match(neither.errors.join(' '), /expectedEffect .*or expectedDirection/)

    const both = statusFor({ armId, override, expectedEffect: -0.5, expectedDirection: 'increasing damage increases score' }, 'poscontrol-both')
    assert.equal(both.status, 'invalid')
    assert.match(both.errors.join(' '), /exactly one/)

    const ladder = statusFor({ armId, override, expectedDirection: 'increasing damage increases score, monotonically, on both mazes' }, 'poscontrol-ladder')
    assert.deepEqual(ladder.errors, [])
  } finally {
    rmSync(preregDir, { recursive: true, force: true })
  }
})

test('ANALYZE: an impossible RFC 3339 calendar date invalidates the prereg', () => {
  const preregDir = mkdtempSync(join(tmpdir(), 'elementia-date-prereg-'))
  try {
    const prereg = JSON.parse(readFileSync(new URL('../prereg/metric-selection-v1.json', import.meta.url), 'utf8'))
    prereg.familyId = 'impossible-date-family'
    prereg.registeredAt = '2026-02-30T00:00:00.000Z'
    writeFileSync(join(preregDir, 'impossible-date-family.json'), JSON.stringify(prereg))
    const records = pairedFamily({ familyId: prereg.familyId, count: 4 })
    const result = analyzeRecords(records, { preregDir, metric: 'score' })
    assert.equal(result.families[0].registration.status, 'invalid')
    assert.match(result.families[0].registration.errors.join(' '), /date-time/)
  } finally {
    rmSync(preregDir, { recursive: true, force: true })
  }
})

test('ANALYZE: BH known-answer vector remains hand-checkable at the CLI layer', () => {
  assert.deepEqual(benjaminiHochberg([0.01, 0.04, 0.03, 0.002]), [0.02, 0.04, 0.04, 0.008])
})

test('ANALYZE: post-registration downgrades the entire family', () => {
  const records = pairedFamily({ count: 4 }).map(record => ({
    ...record, startedAt: '2026-08-13T23:59:59.000Z',
  }))
  const result = analyzeRecords(records, { preregDir: REPO_PREREG, metric: 'score' })
  const family = result.families[0]
  assert.equal(family.registration.status, 'post-registered')
  assert.equal(family.verdictAllowed, false)
  assert.match(renderText(result), /POST-REGISTRATION.*EXPLORATORY/)
})

test('ANALYZE: registration timing uses the earliest stored duplicate, not only the deduped winner', () => {
  const older = fixtureRecord({ runId: 'same-metrics', startedAt: '2026-08-13T23:59:59Z' })
  const newer = fixtureRecord({ runId: 'same-metrics', startedAt: '2026-08-15T00:00:00Z' })
  const result = analyzeRecords([older, newer], { preregDir: REPO_PREREG, metric: 'score' })
  assert.equal(result.families[0].registration.status, 'post-registered',
    'dedupe must not erase evidence that measurement began before registration')
})

test('ANALYZE: duplicate runIds with differing metrics are a corruption signal', () => {
  const older = fixtureRecord({ runId: 'duplicate', score: 8, startedAt: '2026-08-15T00:00:00Z' })
  const newer = fixtureRecord({ runId: 'duplicate', score: 7, startedAt: '2026-08-15T00:00:01Z' })
  const result = analyzeRecords([older, newer], { preregDir: REPO_PREREG, metric: 'score' })
  assert.equal(result.corruption.length, 1)
  assert.match(renderText(result), /CORRUPTION.*duplicate/i)
  assert.equal(result.families[0].verdictAllowed, false)
  assert.equal(result.recordsAfterDedupe, 1)
  assert.equal(result.families[0].bands[0].descriptives[0].mean, 7,
    'newest startedAt wins after the disagreement is reported')
})

test('ANALYZE: mixed git revisions refuse pooling without --allow-mixed', () => {
  const records = [
    fixtureRecord({ gitSha: 'aaaaaaa', seed: 1 }),
    fixtureRecord({ gitSha: 'bbbbbbb', seed: 2 }),
  ]
  const result = analyzeRecords(records, { preregDir: REPO_PREREG, metric: 'score' })
  assert.equal(result.families[0].refused, true)
  assert.match(renderText(result), /REFUSED.*mixed/i)
})

test('ANALYZE: --allow-mixed bands versions explicitly instead of pooling them', () => {
  const records = [
    ...pairedFamily({ count: 4 }),
    ...pairedFamily({ armId: 'dose-15', count: 4 }).map(record => ({
      ...record, runId: `v2:${record.runId}`, engineVersion: { gitSha: 'bbbbbbb', dirty: false },
    })),
  ]
  const result = analyzeRecords(records, { preregDir: REPO_PREREG, metric: 'score', allowMixed: true })
  assert.equal(result.families[0].refused, false)
  assert.equal(result.families[0].bands.length, 2)
  assert.ok(result.families[0].bands.every(band => band.label.startsWith('MIXED DATA ALLOWED')))
})

test('ANALYZE: asymmetric seed:postGap coverage is reported and cannot receive a verdict', () => {
  const records = pairedFamily({ count: 5 }).filter(record => !(record.armId === 'dose-13' && record.protocol.seed === 5))
  const row = analyzeRecords(records, { preregDir: REPO_PREREG, metric: 'score' })
    .families[0].bands[0].comparisons[0]
  assert.equal(row.coverage.equal, false)
  assert.equal(row.status, 'exploratory')
  assert.match(row.reasons.join(' '), /asymmetric scenario keys/)
})

test('ANALYZE: duplicate scenario keys within an arm are reported instead of overwritten', () => {
  const records = pairedFamily({ count: 4 })
  records.push(fixtureRecord({
    armId: 'dose-13', seed: 1, score: 99, runId: 'different-protocol-same-scenario',
  }))
  const row = analyzeRecords(records, { preregDir: REPO_PREREG, metric: 'score' })
    .families[0].bands[0].comparisons[0]
  assert.equal(row.status, 'exploratory')
  assert.match(row.reasons.join(' '), /duplicate scenario keys/)
})

test('ANALYZE: a completed-plus-hang duplicate key is blocked before outcome filtering', () => {
  const records = pairedFamily({ count: 4 })
  records.push(fixtureRecord({
    armId: 'dose-13', seed: 1, score: 0, runId: 'hung-duplicate-scenario',
    outcome: { won: false, lost: false, stalled: true, timedOut: false, stoppedEarly: false },
  }))
  const row = analyzeRecords(records, { preregDir: REPO_PREREG, metric: 'score' })
    .families[0].bands[0].comparisons[0]
  assert.equal(row.status, 'exploratory')
  assert.match(row.reasons.join(' '), /duplicate scenario keys/)
  assert.equal(row.pairingN, 3, 'the ambiguous key must be removed from ordinary and imputed pairing')
})

test('ANALYZE: a known paired effect is recovered and bracketed by its seeded CI', () => {
  const result = analyzeRecords(pairedFamily(), { preregDir: REPO_PREREG, metric: 'score' })
  const row = result.families[0].bands[0].comparisons[0]
  assert.ok(Math.abs(row.delta.mean - (-1)) < 1e-12, `expected delta -1, got ${row.delta.mean}`)
  assert.ok(Number.isFinite(row.delta.p) && Number.isFinite(row.delta.q),
    'every raw paired p must carry its BH-adjusted q')
  assert.ok(row.delta.ci.lo <= -1 && row.delta.ci.hi >= -1,
    `expected ${JSON.stringify(row.delta.ci)} to bracket the injected effect`)
  assert.ok(Math.abs(row.achievedMde - mde(row.delta.sd / Math.sqrt(2), row.pairingN)) < 1e-12,
    'paired-difference sigma must not receive the independent-arms sqrt(2) penalty twice')
  const text = renderText(result)
  assert.match(text, /BH q.*sign test.*split-half.*hang imputation/is)
  assert.match(text, /CONJUNCTION: PASS/)
  assert.equal(result.families[0].bands[0].actualTests, 1)
  assert.ok(row.delta.q >= row.delta.p, 'padding to familySize=64 must not narrow the raw p')
})

test('ANALYZE: paired Student t raw p matches a published table value', () => {
  const records = []
  for (let seed = 1; seed <= 4; seed++) {
    records.push(fixtureRecord({ armId: 'control', seed, score: 10 }))
    records.push(fixtureRecord({ armId: 'dose-13', seed, score: 10 + seed }))
  }
  const row = analyzeRecords(records, { preregDir: REPO_PREREG, metric: 'score' })
    .families[0].bands[0].comparisons[0]
  // t=3.872983 at df=3 -> two-sided p=0.0304663.
  assert.ok(Math.abs(row.delta.p - 0.0304663) < 1e-7)
})

test('ANALYZE: unbounded exploratory labels still render within 120 columns', () => {
  const preregDir = mkdtempSync(join(tmpdir(), 'elementia-width-prereg-'))
  try {
    const records = [fixtureRecord({
      familyId: `width-family-${'f'.repeat(150)}`, armId: `arm-${'x'.repeat(150)}`, score: 8,
    })]
    const text = renderText(analyzeRecords(records, { preregDir, metric: 'score' }))
    assert.ok(Math.max(...text.split(/\r?\n/).map(line => line.length)) <= 120)
  } finally {
    rmSync(preregDir, { recursive: true, force: true })
  }
})

test('ANALYZE: wave-derived metrics match hand-computed run values', () => {
  const preregDir = mkdtempSync(join(tmpdir(), 'elementia-derived-prereg-'))
  const waves = [
    { hallHpFracStart: 1, hallHpFrac: 0.8, structuresLost: 2, closestApproachPx: 100 },
    { hallHpFracStart: 0.8, hallHpFrac: 0.4, structuresLost: 1, closestApproachPx: 50 },
  ]
  try {
    const records = [fixtureRecord({ familyId: 'derived-family', waves })]
    const value = metric => analyzeRecords(records, { preregDir, metric })
      .families[0].bands[0].descriptives[0].mean
    assert.equal(value('hallHpAuc'), 1.5, 'trapezoids: .9 + .6')
    assert.equal(value('structuresLostTotal'), 3)
    assert.equal(value('closestApproachPxMin'), 50)
  } finally {
    rmSync(preregDir, { recursive: true, force: true })
  }
})

test('ANALYZE: undefined clearMargin is reported rather than omitted or invented', () => {
  const result = analyzeRecords(pairedFamily({ count: 4 }), { preregDir: REPO_PREREG })
  const unavailable = result.families[0].bands[0].unavailableMetrics
  assert.ok(unavailable.some(item => item.metric === 'clearMargin'))
  assert.match(renderText(result), /UNAVAILABLE DECLARED METRIC: clearMargin/)
})

test('ANALYZE CLI: scratch JSONL stores exercise exploratory and gated paths end to end', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'elementia-analyze-cli-'))
  const run = (name, records, familyId) => {
    const store = join(scratch, `${name}.jsonl`)
    const json = join(scratch, `${name}.json`)
    writeFileSync(store, `${records.map(record => JSON.stringify(record)).join('\n')}\n`)
    const child = spawnSync(process.execPath, [
      ANALYZE_CLI, '--store', store, '--family', familyId, '--metric', 'score', '--json', json,
    ], { encoding: 'utf8' })
    assert.equal(child.status, 0, child.stderr)
    assert.equal(JSON.parse(readFileSync(json, 'utf8')).families[0].familyId, familyId)
    return child.stdout
  }
  try {
    const exploratory = run('exploratory', pairedFamily({ familyId: 'no-prereg-cli', count: 4 }), 'no-prereg-cli')
    assert.match(exploratory, /EXPLORATORY — NO VERDICT/)
    assert.doesNotMatch(exploratory, /\b(?:PASS|FAIL)\b/)

    const registered = run('registered', pairedFamily(), 'metric-selection-v1')
    assert.match(registered, /VERDICT GATES/)
    assert.match(registered, /CONJUNCTION: PASS/)
    assert.ok(Math.max(...registered.split(/\r?\n/).map(line => line.length)) <= 120,
      'the primary text interface must remain readable at 120 columns')
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
})

// The fixture above is synthetic by necessity — analyze.mjs must never run the
// sim — but "synthetic" must not mean "unfaithful". This pins the fixture's
// protocol shape against the real resolver, so the next time a field is renamed
// the tests fail here rather than passing while the CLI quietly produces
// undefined cells.
test('CONFORMANCE: the synthetic fixture carries the same protocol keys as a real resolved run', () => {
  const real = resolveProtocol({ seed: 1 }).protocol
  const fixture = fixtureRecord().protocol
  assert.deepEqual(
    Object.keys(fixture).sort(),
    Object.keys(real).sort(),
    'fixture protocol keys have drifted from resolveProtocol — analyze.mjs would be reading fields that do not exist on real records',
  )
})


// The censoring check had ZERO coverage. That did not make it wrong — an
// audit on 2026-08-26 established the opposite: exact equality against the
// observed extreme is the right rule, because hallHpAuc is DISCRETE at its
// ceiling (an undamaged run scores exactly waves.length), and the resulting
// share reproduces the undamaged-run share to the digit on every committed
// corpus. What was actually broken was (a) no floor share existed at all and
// (b) the warning bar was 50% while every prereg gates at 10%, so a control
// failing the registered gate by 4x printed a clean table.
test('ANALYZE: an atom at the ceiling is measured, and warns at the registered 10% bar', () => {
  const preregDir = mkdtempSync(join(tmpdir(), 'elementia-ceiling-prereg-'))
  try {
    // 4 undamaged runs out of 20 = 20%: over the registered 10% bar, under the
    // old hard-coded 50% one. This is the discriminating case — the share
    // itself is unchanged by the fix, the WARNING is what was missing.
    const records = []
    for (let seed = 0; seed < 20; seed++) {
      const damaged = seed >= 4
      records.push(fixtureRecord({
        familyId: 'censor-family', seed,
        waves: [{ hallHpFracStart: 1, hallHpFrac: damaged ? 1 - seed * 0.01 : 1 }],
      }))
    }
    const result = analyzeRecords(records, { preregDir, metric: 'hallHpAuc' })
    assert.equal(result.families[0].bands[0].descriptives[0].ceilingShare, 0.2)
    assert.match(renderText(result), /CEILING WARNING/)
  } finally {
    rmSync(preregDir, { recursive: true, force: true })
  }
})

// The floor is the end that matters in this project: under R2, 98.8-100% of
// runs end with the hall dead. `describe()` took a ceiling and nothing else, so
// a fully bottomed-out control was invisible. Untied fixture on the ceiling
// side so this cannot pass by coincidence.
test('ANALYZE: a control piled at the floor is reported, and was previously invisible', () => {
  const preregDir = mkdtempSync(join(tmpdir(), 'elementia-floor-prereg-'))
  try {
    const records = []
    for (let seed = 0; seed < 20; seed++) {
      const bottomed = seed < 15
      records.push(fixtureRecord({
        familyId: 'censor-family', seed,
        waves: [{ hallHpFracStart: bottomed ? 0 : 0.5 + seed * 0.01, hallHpFrac: 0 }],
      }))
    }
    const result = analyzeRecords(records, { preregDir, metric: 'hallHpAuc' })
    const row = result.families[0].bands[0].descriptives[0]
    assert.equal(row.floorShare, 0.75)
    assert.ok(row.ceilingShare < 0.1, 'the ceiling must stay quiet — this is a floor-only failure')
    assert.match(renderText(result), /FLOOR WARNING/)
  } finally {
    rmSync(preregDir, { recursive: true, force: true })
  }
})

// A cell where every run scored identically is TOTAL censoring at both ends.
// Guard, not red-green: the old implementation also reported 1 at the ceiling.
// It is here so a future tolerance-band rewrite cannot silently turn a
// zero-width range into NaN and render the healthiest possible cell.
test('ANALYZE: a degenerate all-identical cell reports total censoring at both ends', () => {
  const preregDir = mkdtempSync(join(tmpdir(), 'elementia-degenerate-prereg-'))
  try {
    const records = []
    for (let seed = 0; seed < 6; seed++) {
      records.push(fixtureRecord({ familyId: 'censor-family', seed, waves: [{ hallHpFracStart: 1, hallHpFrac: 1 }] }))
    }
    const row = analyzeRecords(records, { preregDir, metric: 'hallHpAuc' }).families[0].bands[0].descriptives[0]
    assert.equal(row.ceilingShare, 1)
    assert.equal(row.floorShare, 1)
  } finally {
    rmSync(preregDir, { recursive: true, force: true })
  }
})

// --- option-set mode ------------------------------------------------------
//
// Layering note: the winner-selection BIAS these tests exist to prevent is
// covered at its own level, in stats.test.js, where independent noise datasets
// can be generated cheaply. Repeated splits of ONE dataset are highly
// correlated, so averaging over splits here would converge to a property of
// that dataset rather than to the truth, and a test built that way would look
// rigorous while proving nothing. These tests cover the integration and the
// branch structure instead.

function optionSetFamily({ familyId = 'option-set-fixture', arms, cells = 60, maze = 'A' } = {}) {
  const records = []
  for (const [armId, valueFor] of Object.entries(arms)) {
    for (let seed = 1; seed <= cells; seed++) {
      records.push(fixtureRecord({ familyId, armId, maze, seed, score: valueFor(seed) }))
    }
  }
  return records
}

test('OPTION-SET: recovers the best policy and reports its contribution', () => {
  const preregDir = mkdtempSync(join(tmpdir(), 'elementia-optionset-prereg-'))
  try {
    // `strong` beats every other arm by a flat 0.5 on every cell, so selection
    // is unambiguous and the contribution has a known true value.
    const wobble = seed => ((seed % 5) - 2) * 0.05
    const records = optionSetFamily({
      arms: {
        control: seed => 7 + wobble(seed),
        'wt-pure': seed => 6.8 + wobble(seed),
        strong: seed => 7.5 + wobble(seed),
      },
    })
    const result = analyzeOptionSet(records, {
      preregDir, metric: 'score', splitSeed: 42, splits: 20, excludeArms: ['strong'],
    })
    const band = result.bands[0]
    assert.equal(band.selection.full.armId, 'strong')
    assert.equal(band.selection.reduced.armId, 'control')
    assert.equal(band.selection.identical, false)
    assert.ok(Math.abs(band.selection.contribution - 0.5) < 0.05,
      `contribution should recover the injected 0.5, got ${band.selection.contribution}`)
    assert.ok(band.comparison, 'a genuine two-policy comparison must be emitted')
    assert.equal(band.comparison.between[0], 'strong')
    assert.equal(band.stability[0].armId, 'strong')
    assert.equal(band.stability[0].shareFull, 1, 'an unambiguous winner should be selected on every split')
  } finally {
    rmSync(preregDir, { recursive: true, force: true })
  }
})

// THE BRANCH THE WHOLE SPEC TURNS ON. When the winning policy does not build
// the structure, the paired delta vector is identically zero: pairedT returns
// t = 0, the sign test sees 0 better and 0 worse, splitHalfRho is NaN. Emitting
// gates on that would dress a structural zero as a statistical finding.
test('OPTION-SET: a target outside the best response yields exact zero and NO gates', () => {
  const preregDir = mkdtempSync(join(tmpdir(), 'elementia-optionset-zero-prereg-'))
  try {
    const wobble = seed => ((seed % 5) - 2) * 0.05
    const records = optionSetFamily({
      arms: {
        control: seed => 7.5 + wobble(seed),
        'fuse-early': seed => 7.0 + wobble(seed),
        'fuse-late': seed => 6.9 + wobble(seed),
      },
    })
    const result = analyzeOptionSet(records, {
      preregDir, metric: 'score', splitSeed: 42, splits: 20,
      excludeArms: ['fuse-early', 'fuse-late'],
    })
    const band = result.bands[0]
    assert.equal(band.selection.full.armId, 'control')
    assert.equal(band.selection.identical, true)
    assert.equal(band.selection.contribution, 0, 'a structural zero must be exactly 0, not a small estimate')
    assert.equal(band.comparison, null, 'no comparison may be emitted when the same policy wins both sets')

    const text = renderOptionSet(result)
    assert.match(text, /NOT IN THE BEST RESPONSE/)
    assert.doesNotMatch(text, /BH q/, 'gate output must not appear for a structural zero')
    assert.doesNotMatch(text, /sign exact p/)
  } finally {
    rmSync(preregDir, { recursive: true, force: true })
  }
})

// A maximum over arms scored on DIFFERENT scenarios is not a maximum over
// anything. Three of this project's instrument defects were cells silently
// mismatched between arms.
test('OPTION-SET: arms are scored only on cells every arm shares, and the rest is reported', () => {
  const preregDir = mkdtempSync(join(tmpdir(), 'elementia-optionset-cells-prereg-'))
  try {
    const records = optionSetFamily({ arms: { control: () => 7, rich: () => 7.2 }, cells: 40 })
    // `control` alone gets ten extra cells, all of them flattering.
    for (let seed = 41; seed <= 50; seed++) {
      records.push(fixtureRecord({ familyId: 'option-set-fixture', armId: 'control', maze: 'A', seed, score: 99 }))
    }
    const result = analyzeOptionSet(records, {
      preregDir, metric: 'score', splitSeed: 42, splits: 5, excludeArms: ['rich'],
    })
    const band = result.bands[0]
    assert.equal(band.cells, 40, 'only the shared 40 cells may be scored')
    assert.deepEqual(band.droppedCells, [{ armId: 'control', count: 10 }])
    assert.equal(band.arms.find(arm => arm.armId === 'control').meanAll, 7,
      'the ten unmatched 99s must not enter any mean')
    assert.match(renderOptionSet(result), /CELL ASYMMETRY/)
  } finally {
    rmSync(preregDir, { recursive: true, force: true })
  }
})

test('OPTION-SET: an unregistered split seed is refused rather than defaulted', () => {
  const records = optionSetFamily({ arms: { control: () => 7, other: () => 7.1 }, cells: 10 })
  assert.throws(
    () => analyzeOptionSet(records, { preregDir: REPO_PREREG, metric: 'score' }),
    /integer splitSeed/,
  )
})

// Naming an arm that does not exist would silently leave the structure IN the
// reduced set, so "removing" it would compare a set with itself and report a
// contribution of zero that means the opposite of what it looks like.
test('OPTION-SET: an exclusion naming no real arm is reported, not ignored', () => {
  const preregDir = mkdtempSync(join(tmpdir(), 'elementia-optionset-typo-prereg-'))
  try {
    const records = optionSetFamily({ arms: { control: () => 7, 'fuse-early': () => 7.4 }, cells: 20 })
    const result = analyzeOptionSet(records, {
      preregDir, metric: 'score', splitSeed: 42, splits: 5, excludeArms: ['fuse-erly'],
    })
    assert.deepEqual(result.bands[0].unknownExclusions, ['fuse-erly'])
    assert.match(renderOptionSet(result), /EXCLUSION NAMES NO SUCH ARM/)
  } finally {
    rmSync(preregDir, { recursive: true, force: true })
  }
})
