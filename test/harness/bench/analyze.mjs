#!/usr/bin/env node

// Store-only analysis for Balance Harness v2. This file deliberately imports
// the run-record contract and statistical primitives, never matchRunner: an
// analysis that can accidentally run the simulation is neither free nor safely
// repeatable, which is the defect the v2 store exists to remove.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateRecord } from './record.js'
import { readRecords } from './store.js'
import {
  benjaminiHochberg, bootstrapCI, mean, mde, pairedDeltas, pairedT, sd,
  selectBest, signTest, splitCells, splitHalfRho,
} from '../stats.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEFAULT_PREREG_DIR = join(HERE, '..', 'prereg')
const PREREG_SCHEMA = JSON.parse(readFileSync(join(DEFAULT_PREREG_DIR, '_schema.json'), 'utf8'))
const DERIVED_METRICS = new Set(['hallHpAuc', 'structuresLostTotal', 'closestApproachPxMin'])
const KNOWN_DERIVED = [...DERIVED_METRICS, 'clearMargin']
const CONTROL_ARM = 'control'
// The registered bar, not a looser one. Every prereg that gates on censoring
// asks for the control to be under 10% at the bound (regime-r2-adoption.json
// gate 3), while this warning sat at 50% and therefore stayed silent on cells
// that failed the registered gate by 4x — metric-selection-v2/A is 37.8% at
// the ceiling and printed no warning. Prose bars a human reads are not a
// substitute for the tool saying so.
const BOUND_WARNING_SHARE = 0.10
//
// Exact equality against the OBSERVED extreme is deliberate and is the right
// rule for these metrics, not a bug. `hallHpAuc` is discrete at its bounds: an
// undamaged run scores exactly `waves.length`, so the ceiling is an ATOM, and
// the share of runs equal to the observed max reproduces the undamaged share to
// the digit on every committed corpus (metric-selection-v2/A: 37.78% by both
// definitions). `wavesCleared` and `score` are integer-valued and tie likewise.
// A range-relative tolerance band was tried on 2026-08-26 and reverted: it
// measures mode tightness rather than proximity to a bound, and it reports a
// clean bimodal distribution as 31% censored at both ends.
//
// What was genuinely missing is the FLOOR — see describe().

const asPath = value => value instanceof URL ? fileURLToPath(value) : value
const finite = value => typeof value === 'number' && Number.isFinite(value)
const fmt = (value, digits = 3) => Number.isFinite(value) ? value.toFixed(digits) : 'n/a'
const pct = value => Number.isFinite(value) ? `${(value * 100).toFixed(0)}%` : 'n/a'
const clipped = (value, width) => {
  const text = String(value)
  return text.length <= width ? text : `${text.slice(0, width - 1)}…`
}

function wrapped(text, indent = '', width = 120) {
  const output = []
  for (const sourceLine of String(text).split('\n')) {
    if (!sourceLine.trim()) { output.push(indent.trimEnd()); continue }
    let line = indent
    const capacity = Math.max(1, width - indent.length)
    const words = sourceLine.trim().split(/\s+/).flatMap(word => {
      const chunks = []
      for (let i = 0; i < word.length; i += capacity) chunks.push(word.slice(i, i + capacity))
      return chunks
    })
    for (const word of words) {
      if (line.trim() && line.length + word.length + 1 > width) {
        output.push(line)
        line = `${indent}${word}`
      } else {
        line += `${line === indent ? '' : ' '}${word}`
      }
    }
    output.push(line)
  }
  return output
}

function isRfc3339(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value)
  if (!match || !Number.isFinite(Date.parse(value))) return false
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, offsetHourText, offsetMinuteText] = match
  const year = Number(yearText), month = Number(monthText), day = Number(dayText)
  const daysInMonth = month >= 1 && month <= 12 ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 0
  return day >= 1 && day <= daysInMonth && Number(hourText) <= 23 && Number(minuteText) <= 59 &&
    Number(secondText) <= 59 && (offsetHourText === undefined || (Number(offsetHourText) <= 23 && Number(offsetMinuteText) <= 59))
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function schemaTypeMatches(value, type) {
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value)
  if (type === 'array') return Array.isArray(value)
  if (type === 'integer') return Number.isInteger(value)
  if (type === 'number') return finite(value)
  return typeof value === type
}

// This validator implements every keyword used by _schema.json. Keeping it
// local avoids turning preregistration—the guard against post-hoc flexibility—
// into an optional dependency that can be skipped when installs are stale.
function validateSchema(value, schema, path = '$', errors = []) {
  if (schema.type && !schemaTypeMatches(value, schema.type)) {
    errors.push(`${path} must be ${schema.type}`)
    return errors
  }
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path} must be one of ${schema.enum.join(', ')}`)
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path} is shorter than ${schema.minLength}`)
    if (schema.pattern && !(new RegExp(schema.pattern)).test(value)) errors.push(`${path} does not match ${schema.pattern}`)
    if (schema.format === 'date-time') {
      if (!isRfc3339(value)) errors.push(`${path} is not an RFC 3339 date-time`)
    }
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path} must be >= ${schema.minimum}`)
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path} must be <= ${schema.maximum}`)
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) errors.push(`${path} must be > ${schema.exclusiveMinimum}`)
    if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) errors.push(`${path} must be < ${schema.exclusiveMaximum}`)
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path} needs at least ${schema.minItems} items`)
    if (schema.items) value.forEach((item, index) => validateSchema(item, schema.items, `${path}[${index}]`, errors))
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const required of schema.required ?? []) {
      if (!(required in value)) errors.push(`${path}.${required} is required`)
    }
    for (const [key, child] of Object.entries(value)) {
      if (schema.properties?.[key]) validateSchema(child, schema.properties[key], `${path}.${key}`, errors)
      else if (schema.additionalProperties === false) errors.push(`${path}.${key} is not allowed`)
    }
  }
  return errors
}

function loadRegistration(familyId, records, preregDir) {
  const path = join(asPath(preregDir), `${familyId}.json`)
  let prereg
  try {
    prereg = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return { status: 'missing', path, errors: [] }
    return { status: 'invalid', path, errors: [`cannot parse preregistration: ${error.message}`] }
  }
  const errors = validateSchema(prereg, PREREG_SCHEMA)
  if (prereg.familyId !== familyId) errors.push(`$.familyId must equal store familyId ${familyId}`)
  if (!prereg.arms?.includes(CONTROL_ARM)) errors.push('$.arms must include control')
  if (new Set(prereg.arms ?? []).size !== (prereg.arms ?? []).length) errors.push('$.arms must not contain duplicates')
  const metrics = [prereg.primaryMetric, ...(prereg.secondaryMetrics ?? [])]
  if (new Set(metrics).size !== metrics.length) errors.push('primaryMetric and secondaryMetrics must be unique')
  // The schema cannot express "exactly one of" (no anyOf in validateSchema), and
  // a positive control that commits to NEITHER a size nor an ordering has made
  // no falsifiable prediction at all — which is the whole point of having one.
  if (prereg.positiveControl) {
    const hasEffect = 'expectedEffect' in prereg.positiveControl
    const hasDirection = 'expectedDirection' in prereg.positiveControl
    if (!hasEffect && !hasDirection) errors.push('$.positiveControl must declare expectedEffect (single-arm) or expectedDirection (ladder)')
    if (hasEffect && hasDirection) errors.push('$.positiveControl must declare exactly one of expectedEffect or expectedDirection')
  }
  if (errors.length) return { status: 'invalid', path, prereg, errors }

  const earliestStartedAt = records.reduce((earliest, record) => {
    const time = Date.parse(record.startedAt)
    return Math.min(earliest, time)
  }, Infinity)
  const registeredAt = Date.parse(prereg.registeredAt)
  if (!(registeredAt < earliestStartedAt)) {
    return { status: 'post-registered', path, prereg, errors: [], earliestStartedAt: new Date(earliestStartedAt).toISOString() }
  }
  return { status: 'valid', path, prereg, errors: [], earliestStartedAt: new Date(earliestStartedAt).toISOString() }
}

// CELL DRIFT. configHash identifies the cell — arm configuration, maze, engine,
// balance table and overrides, with the seed/postGap axes stripped (see
// record.js). Within one family a given (armId, maze) must therefore resolve to
// exactly ONE configHash. More than one means the arm's definition moved while
// its label stayed put: someone re-ran "control" or "dose-13" after changing an
// override, a siting flag or the balance table, and the two generations are now
// sitting in the same store under the same name.
//
// Grouping by armId alone cannot see this, and pooling the two generations
// produces a number that is an average over two different experiments. "The
// configuration moved under a stable label" is the single most repeated defect
// in this project's measurement history, so it is a corruption signal, not a
// warning.
function cellDrift(records) {
  const byCell = new Map()
  for (const record of records) {
    const key = `${record.armId}|${record.protocol.mazeName}`
    if (!byCell.has(key)) byCell.set(key, new Map())
    const hashes = byCell.get(key)
    if (!hashes.has(record.configHash)) hashes.set(record.configHash, { configHash: record.configHash, n: 0, overrides: record.balanceOverrides })
    hashes.get(record.configHash).n++
  }
  const drift = []
  for (const [key, hashes] of byCell) {
    if (hashes.size < 2) continue
    const [armId, maze] = key.split('|')
    drift.push({ armId, maze, generations: [...hashes.values()].sort((a, b) => b.n - a.n) })
  }
  return drift
}

function dedupe(records) {
  const byRunId = new Map()
  const corruption = []
  for (const record of records) {
    validateRecord(record)
    if (!Number.isFinite(Date.parse(record.startedAt))) throw new Error(`run ${record.runId} has invalid startedAt`)
    const prior = byRunId.get(record.runId)
    if (!prior) {
      byRunId.set(record.runId, record)
      continue
    }
    if (canonical(prior.metrics) !== canonical(record.metrics)) {
      corruption.push({
        runId: record.runId,
        familyIds: [...new Set([prior.familyId, record.familyId])],
        olderStartedAt: Date.parse(prior.startedAt) <= Date.parse(record.startedAt) ? prior.startedAt : record.startedAt,
        newerStartedAt: Date.parse(prior.startedAt) <= Date.parse(record.startedAt) ? record.startedAt : prior.startedAt,
      })
    }
    // Newest wins only after the disagreement has been retained as a first-
    // class signal. Picking without the signal hid engine drift in v1.
    if (Date.parse(record.startedAt) >= Date.parse(prior.startedAt)) byRunId.set(record.runId, record)
  }
  return { records: [...byRunId.values()], corruption }
}

function metricValue(record, metric) {
  if (finite(record.metrics?.[metric])) return record.metrics[metric]
  const waves = Array.isArray(record.waves) ? record.waves : []
  if (metric === 'structuresLostTotal') {
    return waves.reduce((total, wave) => total + (finite(wave.structuresLost) ? wave.structuresLost : 0), 0)
  }
  if (metric === 'closestApproachPxMin') {
    const values = waves.map(wave => wave.closestApproachPx).filter(finite)
    return values.length ? Math.min(...values) : undefined
  }
  if (metric === 'hallHpAuc') {
    if (!waves.length) return undefined
    let area = 0
    for (const wave of waves) {
      if (!finite(wave.hallHpFracStart) || !finite(wave.hallHpFrac)) return undefined
      area += (wave.hallHpFracStart + wave.hallHpFrac) / 2
    }
    return area
  }
  // clearMargin is intentionally absent. Neither the record nor the prereg
  // defines a censoring model, so manufacturing one would be post-hoc metric
  // selection under a name that falsely looks preregistered.
  return undefined
}

const isHang = record => Boolean(record.outcome.stalled || record.outcome.timedOut)
const cellKey = record => `${record.protocol.seed}:${record.protocol.postGap}`
const versionKey = record => `${record.engineVersion.gitSha}|${record.balanceHash}|${record.engineVersion.dirty ? 'dirty' : 'clean'}`
const versionLabel = records => {
  const record = records[0]
  return `git ${record.engineVersion.gitSha} | balance ${record.balanceHash} | ${record.engineVersion.dirty ? 'DIRTY' : 'clean'}`
}

// `bounds` are the observed max/min across the WHOLE maze band, not this arm,
// so control and arm are scored against the same edges.
function describe(records, metric, bounds) {
  const completed = records.filter(record => !isHang(record))
  const values = completed.map(record => metricValue(record, metric)).filter(finite)
  const { ceiling, floor } = bounds ?? {}
  const shareAt = bound => (
    values.length && finite(bound)
      ? values.filter(value => value === bound).length / values.length
      : NaN
  )
  return {
    n: values.length,
    mean: values.length ? mean(values) : NaN,
    sd: values.length ? sd(values) : NaN,
    ceilingShare: shareAt(ceiling),
    // The floor was never computed at all — `describe` took a ceiling and
    // nothing else. It is the end that matters under R2, where 98.8-100% of
    // runs end with the hall dead: a defence measured entirely below its own
    // failure point is as unreadable as one measured entirely at its ceiling,
    // and nothing in this analyser would have said so.
    floorShare: shareAt(floor),
    hangs: records.filter(isHang).length,
    total: records.length,
  }
}

function mapValues(records, metric, { impute = false } = {}) {
  const completedValues = records.filter(record => !isHang(record)).map(record => metricValue(record, metric)).filter(finite)
  const cellMinimum = completedValues.length ? Math.min(...completedValues) : undefined
  const map = new Map()
  const counts = new Map()
  for (const record of records) counts.set(cellKey(record), (counts.get(cellKey(record)) ?? 0) + 1)
  const duplicateKeys = [...counts].filter(([, count]) => count > 1).map(([key]) => key)
  // Count before hang/metric filtering: otherwise a completed record plus a
  // hung duplicate lets map insertion order choose a protocol without a trace.
  const blocked = new Set(duplicateKeys)
  for (const record of records) {
    const value = isHang(record) ? (impute ? cellMinimum : undefined) : metricValue(record, metric)
    if (!finite(value)) continue
    const key = cellKey(record)
    if (blocked.has(key)) continue
    map.set(key, value)
  }
  return { map, cellMinimum, duplicateKeys }
}

function compareKeySets(controlRecords, armRecords) {
  const control = new Set(controlRecords.map(cellKey)), arm = new Set(armRecords.map(cellKey))
  return {
    equal: control.size === arm.size && [...control].every(key => arm.has(key)),
    controlOnly: [...control].filter(key => !arm.has(key)),
    armOnly: [...arm].filter(key => !control.has(key)),
  }
}

function hashSeed(text) {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

// Lanczos log-gamma plus a continued fraction for the regularized beta. This
// supplies an actual Student-t p value; a normal approximation would overstate
// evidence in precisely the small cells where the analyzer must be cautious.
function logGamma(z) {
  const p = [0.9999999999998099, 676.5203681218851, -1259.1392167224028,
    771.3234287776531, -176.6150291621406, 12.50734327868691,
    -0.1385710952657201, 9.984369578019572e-6, 1.505632735149312e-7]
  if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z)
  z -= 1
  let x = p[0]
  for (let i = 1; i < p.length; i++) x += p[i] / (z + i)
  const t = z + 7.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x)
}

function betaFraction(x, a, b) {
  const maxIterations = 200, epsilon = 3e-14, tiny = 1e-300
  const qab = a + b, qap = a + 1, qam = a - 1
  let c = 1, d = 1 - qab * x / qap
  if (Math.abs(d) < tiny) d = tiny
  d = 1 / d
  let h = d
  for (let m = 1; m <= maxIterations; m++) {
    const m2 = 2 * m
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2))
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny
    d = 1 / d; h *= d * c
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    const delta = d * c
    h *= delta
    if (Math.abs(delta - 1) < epsilon) break
  }
  return h
}

function regularizedBeta(x, a, b) {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x))
  return x < (a + 1) / (a + b + 2)
    ? front * betaFraction(x, a, b) / a
    : 1 - front * betaFraction(1 - x, b, a) / b
}

function pairedPValue(test) {
  if (test.n < 2 || Number.isNaN(test.t)) return NaN
  if (!Number.isFinite(test.t)) return 0
  const df = test.n - 1
  return regularizedBeta(df / (df + test.t ** 2), df / 2, 0.5)
}

function splitForMetric(records, metric, arms) {
  const seeds = [...new Set(records.map(record => record.protocol.seed))].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }))
  const midpoint = Math.floor(seeds.length / 2)
  const firstSeeds = new Set(seeds.slice(0, midpoint)), secondSeeds = new Set(seeds.slice(midpoint))
  const cells = half => arms.map(arm => records
    .filter(record => record.armId === arm && half.has(record.protocol.seed) && !isHang(record))
    .map(record => metricValue(record, metric)).filter(finite))
  return splitHalfRho({ first: cells(firstSeeds), second: cells(secondSeeds) })
}

function adjustComparisons(comparisons, familySize, field, qField) {
  const [group, key] = field.split('.')
  const [qGroup, qKey] = qField.split('.')
  if (!comparisons.length) return 0
  // A declared cell with too few pairs still occupies its preregistered slot.
  // Treating it as absent would narrow the family because data were missing.
  const pValues = comparisons.map(row => finite(row[group]?.[key]) ? row[group][key] : 1)
  const correctionSize = Math.max(familySize ?? pValues.length, pValues.length)
  while (pValues.length < correctionSize) pValues.push(1)
  const adjusted = benjaminiHochberg(pValues)
  comparisons.forEach((row, index) => {
    row[qGroup][qKey] = finite(row[group]?.[key]) ? adjusted[index] : NaN
  })
  return comparisons.length
}

function analyzeBand(records, prereg, registration, metricFilter, familyIntegrity, mixedLabel) {
  const declaredMetrics = prereg ? [prereg.primaryMetric, ...(prereg.secondaryMetrics ?? [])] : []
  const observedMetrics = [...new Set(records.flatMap(record => Object.entries(record.metrics ?? {})
    .filter(([, value]) => finite(value)).map(([key]) => key)))]
  const derivedPresent = KNOWN_DERIVED.filter(metric => records.some(record => finite(metricValue(record, metric))))
  const metrics = metricFilter ? [metricFilter] : prereg ? declaredMetrics : [...new Set([...observedMetrics, ...derivedPresent])]
  // `mazeName`, not `maze`. The spec's section-2 example wrote `maze` while
  // protocol.js and record.js persist `mazeName`, and the two halves of this
  // harness were built in parallel against opposite sides of that discrepancy.
  // The symptom was silent and expensive rather than loud: every cell came out
  // labelled `undefined`, which then failed `prereg.mazes.includes(...)` and
  // downgraded every declared cell to EXPLORATORY. A verdict layer that
  // quietly refuses to issue verdicts is the worst possible failure here.
  const mazes = [...new Set(records.map(record => record.protocol.mazeName))].sort()
  const arms = prereg
    ? prereg.arms.filter(arm => records.some(record => record.armId === arm))
      .concat([...new Set(records.map(record => record.armId))].filter(arm => !prereg.arms.includes(arm)).sort())
    : [...new Set(records.map(record => record.armId))].sort((a, b) => a === CONTROL_ARM ? -1 : b === CONTROL_ARM ? 1 : a.localeCompare(b))
  const descriptives = [], comparisons = [], unavailableMetrics = []

  for (const metric of metrics) {
    if (!records.some(record => finite(metricValue(record, metric)))) {
      unavailableMetrics.push({ metric, reason: metric === 'clearMargin'
        ? 'stored data defines no censoring model or clear-distance quantity'
        : 'no finite value can be computed from the stored records' })
      continue
    }
    for (const maze of mazes) {
      const mazeRecords = records.filter(record => record.protocol.mazeName === maze)
      const completedValues = mazeRecords.filter(record => !isHang(record)).map(record => metricValue(record, metric)).filter(finite)
      const bounds = {
        ceiling: completedValues.length ? Math.max(...completedValues) : NaN,
        floor: completedValues.length ? Math.min(...completedValues) : NaN,
      }
      for (const armId of arms) {
        const armRecords = mazeRecords.filter(record => record.armId === armId)
        if (!armRecords.length) continue
        descriptives.push({ metric, maze, armId, ...describe(armRecords, metric, bounds) })
      }

      if (!prereg || ![...new Set(mazeRecords.map(record => record.armId))].includes(CONTROL_ARM)) continue
      const splitRho = splitForMetric(mazeRecords, metric, arms)
      const controlRecords = mazeRecords.filter(record => record.armId === CONTROL_ARM)
      for (const armId of arms.filter(arm => arm !== CONTROL_ARM)) {
        const armRecords = mazeRecords.filter(record => record.armId === armId)
        if (!armRecords.length) continue
        const reasons = []
        if (!declaredMetrics.includes(metric)) reasons.push(`metric ${metric} is not declared`)
        if (!prereg.mazes.includes(maze) || !prereg.arms.includes(armId)) reasons.push(`cell ${maze}/${armId} is not declared`)
        if (registration.status !== 'valid') reasons.push(`registration is ${registration.status}`)
        if (!familyIntegrity) reasons.push('family has a corruption signal')
        const coverage = compareKeySets(controlRecords, armRecords)
        if (!coverage.equal) reasons.push(`asymmetric scenario keys: ${coverage.controlOnly.length} control-only, ${coverage.armOnly.length} arm-only`)

        const control = mapValues(controlRecords, metric)
        const arm = mapValues(armRecords, metric)
        if (control.duplicateKeys.length || arm.duplicateKeys.length) {
          reasons.push(`duplicate scenario keys: ${control.duplicateKeys.length} control, ${arm.duplicateKeys.length} arm`)
        }
        const deltas = pairedDeltas(control.map, arm.map)
        const paired = pairedT(deltas)
        const rawP = pairedPValue(paired)
        const better = deltas.filter(delta => delta > 0).length
        const worse = deltas.filter(delta => delta < 0).length
        const sign = { better, worse, ...signTest(better, worse) }
        const controlImputed = mapValues(controlRecords, metric, { impute: true })
        const armImputed = mapValues(armRecords, metric, { impute: true })
        const imputedDeltas = pairedDeltas(controlImputed.map, armImputed.map)
        const imputedPaired = pairedT(imputedDeltas)
        const imputedP = pairedPValue(imputedPaired)
        const ci = deltas.length ? bootstrapCI(deltas, {
          alpha: prereg.alpha,
          seed: hashSeed(`${prereg.familyId}|${mixedLabel}|${maze}|${armId}|${metric}`),
        }) : { lo: NaN, hi: NaN }
        // paired.sd is already the spread of arm-control differences. mde()
        // inverts requiredN's independent-arm formula, so divide by sqrt(2)
        // here or the paired design pays that variance penalty twice.
        const achievedMde = paired.n > 0 && finite(paired.sd)
          ? mde(paired.sd / Math.sqrt(2), paired.n, { alpha: prereg.alpha, power: prereg.power }) : NaN
        const primaryUnderpowered = metric === prereg.primaryMetric && finite(achievedMde) && achievedMde > prereg.mde
        // Described once. It was previously recomputed for the ceiling flag,
        // and adding a floor flag would have made it three full re-scans of
        // controlRecords per comparison.
        const controlDescribed = describe(controlRecords, metric, bounds)
        comparisons.push({
          metric, maze, armId,
          status: reasons.length ? 'exploratory' : 'registered', reasons,
          control: controlDescribed, arm: describe(armRecords, metric, bounds),
          coverage, pairingN: paired.n,
          delta: { mean: paired.mean, sd: paired.sd, se: paired.se, t: paired.t, p: rawP, ci },
          sign, splitHalfRho: splitRho,
          imputed: { mean: imputedPaired.mean, sd: imputedPaired.sd, t: imputedPaired.t, p: imputedP },
          achievedMde, declaredMde: prereg.mde, primaryUnderpowered,
          ceilingHigh: controlDescribed.ceilingShare >= BOUND_WARNING_SHARE,
          floorHigh: controlDescribed.floorShare >= BOUND_WARNING_SHARE,
          derivedFromWaves: DERIVED_METRICS.has(metric),
        })
      }
    }
  }

  const actualTests = adjustComparisons(comparisons, prereg?.familySize, 'delta.p', 'delta.q')
  // Dot paths are expanded explicitly because adjustment operates on both the
  // ordinary and imputed families with identical preregistered width.
  const liveImputed = comparisons.filter(row => finite(row.imputed.p))
  if (liveImputed.length) {
    const ps = liveImputed.map(row => row.imputed.p)
    const size = Math.max(prereg?.familySize ?? ps.length, ps.length)
    while (ps.length < size) ps.push(1)
    const qs = benjaminiHochberg(ps)
    liveImputed.forEach((row, index) => { row.imputed.q = qs[index] })
  }
  for (const row of comparisons) {
    const direction = Math.sign(row.delta.mean)
    row.gates = {
      bhQ: finite(row.delta.q) && row.delta.q < prereg.alpha,
      signAgreement: row.sign.p < prereg.alpha && Math.sign(row.sign.better - row.sign.worse) === direction && direction !== 0,
      splitHalf: finite(row.splitHalfRho) && row.splitHalfRho > 0.5,
      hangSurvival: finite(row.imputed.p) && row.imputed.p < prereg.alpha && Math.sign(row.imputed.mean) === direction && direction !== 0,
    }
    row.verdict = Object.values(row.gates).every(Boolean)
  }
  return { label: mixedLabel, records: records.length, descriptives, comparisons, unavailableMetrics, actualTests }
}

export function analyzeRecords(inputRecords, {
  family: familyFilter, metric: metricFilter, allowMixed = false,
  preregDir = DEFAULT_PREREG_DIR, storePath = null,
} = {}) {
  const selectedInput = familyFilter ? inputRecords.filter(record => record.familyId === familyFilter) : inputRecords
  if (!selectedInput.length) throw new Error(familyFilter ? `store contains no records for family ${familyFilter}` : 'store contains no records')
  const deduped = dedupe(selectedInput)
  const familyIds = [...new Set(deduped.records.map(record => record.familyId))].sort()
  const result = { storePath, inputRecords: selectedInput.length, recordsAfterDedupe: deduped.records.length, corruption: deduped.corruption, families: [] }

  for (const familyId of familyIds) {
    const records = deduped.records.filter(record => record.familyId === familyId)
    // Registration guards measurement chronology, so it must see append-only
    // history before dedupe. Otherwise a newer duplicate could erase the run
    // proving that data collection began before registeredAt.
    const registrationRecords = selectedInput.filter(record => record.familyId === familyId)
    const registration = loadRegistration(familyId, registrationRecords, preregDir)
    const prereg = registration.prereg
    const familyCorruption = deduped.corruption.filter(signal => signal.familyIds.includes(familyId))
    const drift = cellDrift(records)
    const shas = new Set(records.map(record => record.engineVersion.gitSha))
    const balances = new Set(records.map(record => record.balanceHash))
    const hasDirty = records.some(record => record.engineVersion.dirty)
    const incompatible = shas.size > 1 || balances.size > 1 || hasDirty
    const familyResult = {
      familyId, registration, prereg, records: records.length,
      refused: incompatible && !allowMixed,
      mixed: incompatible,
      verdictAllowed: registration.status === 'valid' && familyCorruption.length === 0 && drift.length === 0,
      familyCorruption, cellDrift: drift,
      versionSummary: { gitShas: [...shas], balanceHashes: [...balances], dirty: hasDirty },
      bands: [],
    }
    if (!familyResult.refused) {
      const grouped = new Map()
      for (const record of records) {
        const key = allowMixed ? versionKey(record) : 'pooled'
        if (!grouped.has(key)) grouped.set(key, [])
        grouped.get(key).push(record)
      }
      for (const bandRecords of grouped.values()) {
        familyResult.bands.push(analyzeBand(
          bandRecords, registration.status === 'invalid' ? undefined : prereg, registration, metricFilter,
          familyCorruption.length === 0 && drift.length === 0,
          `${allowMixed && incompatible ? 'MIXED DATA ALLOWED — ' : ''}${versionLabel(bandRecords)}`,
        ))
      }
    }
    result.families.push(familyResult)
  }
  return result
}

// This delegates to store.js's streaming readRecords, which makes the whole CLI
// path async. An earlier revision decompressed and split the store here instead,
// on the reasoning that keeping analyzeStore synchronous was worth a duplicated
// reader — "a large change for a small one". Scale retired that trade: the
// 96,000-run option-set-procedure-check corpus decompresses past V8's maximum
// string length (0x1fffffe8 chars), so gunzipSync(...).toString('utf8') threw
// "Cannot create a string longer than 0x1fffffe8 characters" and NO corpus of
// that size could be analysed at all. Streaming never materialises the whole
// store as one string, so the ceiling is gone rather than raised.
//
// Sharing store.js's reader also closes the interface gap that produced the
// previous revision: store.js grew gzip support and the analyser never learned
// about it, so reading a .jsonl.gz failed with "invalid JSON: Unexpected token",
// which reads like a corrupt store rather than a wrong decoder. One reader
// cannot drift from itself. It validates records where the old one only parsed
// them — stricter than before, and deliberate: appendRecord validates on the way
// in, so anything failing here never came from this harness.
async function readStore(path) {
  return readRecords(path)
}

export async function analyzeStore(path, options = {}) {
  return analyzeRecords(await readStore(path), { ...options, storePath: path })
}

function renderDescriptives(lines, band) {
  lines.push('metric                    maze arm              n      mean        sd   ceiling     floor  hangs')
  lines.push('------------------------- ---- ---------------- ---- --------- --------- --------- --------- -------')
  for (const row of band.descriptives) {
    lines.push(`${clipped(row.metric, 25).padEnd(25)} ${clipped(row.maze, 4).padEnd(4)} ${clipped(row.armId, 16).padEnd(16)} ${String(row.n).padStart(4)} ` +
      `${fmt(row.mean).padStart(9)} ${fmt(row.sd).padStart(9)} ${pct(row.ceilingShare).padStart(9)} ${pct(row.floorShare).padStart(9)} ` +
      `${`${row.hangs}/${row.total}`.padStart(7)}`)
  }
  for (const row of band.descriptives.filter(row => row.armId === CONTROL_ARM && row.ceilingShare >= BOUND_WARNING_SHARE)) {
    lines.push(...wrapped(`CEILING WARNING: ${row.metric}/${row.maze} control is ${pct(row.ceilingShare)} at the observed maximum (registered bar ${pct(BOUND_WARNING_SHARE)}); ` +
      'use a harder baseline rather than a more sensitive statistic.'))
  }
  for (const row of band.descriptives.filter(row => row.armId === CONTROL_ARM && row.floorShare >= BOUND_WARNING_SHARE)) {
    lines.push(...wrapped(`FLOOR WARNING: ${row.metric}/${row.maze} control is ${pct(row.floorShare)} at the observed minimum (registered bar ${pct(BOUND_WARNING_SHARE)}); ` +
      'the control is bottomed out, so an arm can only be measured upward from a failure state — use an easier baseline.'))
  }
}

function renderComparison(lines, family, band, row) {
  const tag = row.status === 'registered' && family.verdictAllowed ? 'REGISTERED' : 'EXPLORATORY'
  lines.push(...wrapped(`${row.metric} | maze ${row.maze} | ${CONTROL_ARM} vs ${row.armId} | ${tag}`))
  lines.push(`  n control/arm/pairs ${row.control.n}/${row.arm.n}/${row.pairingN}` +
    ` | means ${fmt(row.control.mean)}/${fmt(row.arm.mean)} | sd ${fmt(row.control.sd)}/${fmt(row.arm.sd)}` +
    ` | ceiling ${pct(row.control.ceilingShare)}/${pct(row.arm.ceilingShare)}` +
    ` | floor ${pct(row.control.floorShare)}/${pct(row.arm.floorShare)}`)
  lines.push(`  delta ${fmt(row.delta.mean)} | 95% CI [${fmt(row.delta.ci.lo)}, ${fmt(row.delta.ci.hi)}]` +
    ` | t ${fmt(row.delta.t, 2)} | raw p ${fmt(row.delta.p, 5)} | BH q ${fmt(row.delta.q, 5)}`)
  lines.push(`  sign exact p ${fmt(row.sign.p, 5)} (${row.sign.better}+/${row.sign.worse}-)` +
    ` | split-half rho ${fmt(row.splitHalfRho, 2)}` +
    ` | hang imputation delta ${fmt(row.imputed.mean)}, raw p ${fmt(row.imputed.p, 5)}, BH q ${fmt(row.imputed.q, 5)}`)
  lines.push(`  paired sigma ${fmt(row.delta.sd)} | achieved MDE ${fmt(row.achievedMde)}` +
    ` | prereg primary MDE ${fmt(row.declaredMde)} | prereg nRequired ${family.prereg.nRequired}` +
    `${row.metric === family.prereg.primaryMetric ? '' : ' (different units; no power comparison)'}`)
  if (row.reasons.length) lines.push(...wrapped(`EXPLORATORY: ${row.reasons.join('; ')}`, '  '))
  if (!row.coverage.equal) lines.push(`  PAIR ASYMMETRY: control-only ${row.coverage.controlOnly.length}, arm-only ${row.coverage.armOnly.length}`)
  if (row.ceilingHigh) lines.push('  CEILING WARNING: control share is high; use a harder baseline rather than a more sensitive statistic.')
  if (row.floorHigh) lines.push('  FLOOR WARNING: control share is high; the control is bottomed out, so this delta is measured upward from a failure state.')
  if (row.primaryUnderpowered) lines.push('  UNDER-POWERED: achieved MDE is worse than the preregistered primary-metric MDE.')
  if (row.derivedFromWaves) lines.push('  WAVE-DERIVED: values use each run’s reached waves; later-wave support is conditional on survival.')
  if (tag === 'REGISTERED') {
    lines.push('  VERDICT GATES')
    lines.push(`    BH q < ${family.prereg.alpha}: ${row.gates.bhQ ? 'PASS' : 'FAIL'}`)
    lines.push(`    sign test agrees: ${row.gates.signAgreement ? 'PASS' : 'FAIL'}`)
    lines.push(`    split-half rho > 0.5: ${row.gates.splitHalf ? 'PASS' : 'FAIL'}`)
    lines.push(`    hang imputation survives: ${row.gates.hangSurvival ? 'PASS' : 'FAIL'}`)
    lines.push(`    CONJUNCTION: ${row.verdict ? 'PASS' : 'FAIL'}`)
    lines.push('    prereg rule (verbatim):')
    lines.push(...wrapped(family.prereg.decisionRule, '      '))
  }
}

export function renderText(result) {
  const lines = []
  lines.push('ELEMENTIA BALANCE HARNESS — STORED-RUN ANALYSIS')
  lines.push(`records ${result.inputRecords} input, ${result.recordsAfterDedupe} after runId dedupe`)
  if (result.corruption.length) {
    lines.push('!!! CORRUPTION SIGNAL — duplicate runId records disagree in metrics; affected verdicts are exploratory !!!')
    for (const signal of result.corruption) lines.push(...wrapped(`duplicate ${signal.runId}: newest ${signal.newerStartedAt}`, '  '))
  }
  for (const family of result.families) {
    lines.push('', ...wrapped(`=== FAMILY ${family.familyId} ===`))
    if (family.refused) {
      lines.push('!!! REFUSED — mixed gitSha/balanceHash data or dirty engine records; pass --allow-mixed to band explicitly !!!')
      continue
    }
    if (family.registration.status === 'missing') lines.push('!!! EXPLORATORY — NO VERDICT: no preregistration file !!!')
    if (family.registration.status === 'invalid') {
      lines.push('!!! EXPLORATORY — NO VERDICT: preregistration is schema-invalid !!!')
      family.registration.errors.forEach(error => lines.push(`  ${error}`))
    }
    if (family.registration.status === 'post-registered') {
      lines.push(`!!! POST-REGISTRATION — EXPLORATORY: registeredAt ${family.prereg.registeredAt} did not predate earliest run ${family.registration.earliestStartedAt} !!!`)
    }
    if (family.familyCorruption.length) lines.push('!!! FAMILY DOWNGRADED TO EXPLORATORY BY CORRUPTION SIGNAL !!!')
    for (const d of family.cellDrift ?? []) {
      lines.push(...wrapped(`!!! CELL DRIFT: ${d.armId}/${d.maze} carries ${d.generations.length} different configHashes ` +
        `(${d.generations.map(g => `${g.configHash.slice(0, 8)} n=${g.n} overrides=${JSON.stringify(g.overrides)}`).join('; ')}). ` +
        'The arm definition changed while its label did not. These are different experiments and must not be pooled; ' +
        're-run the arm or split the store by configHash. !!!'))
    }
    for (const band of family.bands) {
      lines.push('', ...wrapped(`--- ${band.label} ---`))
      renderDescriptives(lines, band)
      for (const unavailable of band.unavailableMetrics) {
        lines.push(...wrapped(`UNAVAILABLE DECLARED METRIC: ${unavailable.metric} — ${unavailable.reason}`))
      }
      if (!family.prereg || family.registration.status === 'invalid') continue
      if (band.actualTests !== family.prereg.familySize) {
        lines.push(...wrapped(`!!! BH FAMILY-SIZE MISMATCH: ran ${band.actualTests}, preregistered ${family.prereg.familySize}; ` +
          `${band.actualTests < family.prereg.familySize ? 'missing tests padded with p=1' : 'using the larger observed family'} !!!`))
      }
      for (const row of band.comparisons) {
        lines.push('')
        renderComparison(lines, family, band, row)
      }
    }
  }
  return `${lines.join('\n')}\n`
}

// --- option-set mode ------------------------------------------------------
//
// A different QUESTION from everything above, so a different entry point. The
// control-vs-arm path asks "does this arm beat the baseline". This asks "is the
// structure ever the right thing to build", by comparing the best policy in a
// registered set against the best policy in that set with the structure removed.
// See docs/plans/2026-08-27-option-set-comparison-spec.md.
//
// The primary deliverable is the policy-by-maze value matrix (spec Q1), which
// does not depend on the selection estimator at all and cannot be annihilated
// by it. Contribution (Q2) is secondary and is reported only where it means
// something — see the `identical` branch below.

// Every arm must be scored on the SAME scenarios or a maximum over arms is not
// a maximum over anything. Arms are measured on the intersection of their cell
// keys, and whatever each arm holds beyond it is reported, never silently used.
function commonCells(valuesByArm) {
  const perArm = [...valuesByArm.values()].map(byCell => new Set(byCell.keys()))
  if (!perArm.length) return { common: new Set(), dropped: new Map() }
  let common = perArm[0]
  for (const keys of perArm.slice(1)) common = new Set([...common].filter(key => keys.has(key)))
  const dropped = new Map()
  for (const [armId, byCell] of valuesByArm) {
    const extra = [...byCell.keys()].filter(key => !common.has(key)).length
    if (extra) dropped.set(armId, extra)
  }
  return { common, dropped }
}

function pairedOnCells(valuesByArm, armA, armB, cells) {
  const a = valuesByArm.get(armA), b = valuesByArm.get(armB)
  const deltas = []
  for (const key of [...cells].sort()) {
    const va = a?.get(key), vb = b?.get(key)
    if (finite(va) && finite(vb)) deltas.push(va - vb)
  }
  return deltas
}

export function analyzeOptionSet(inputRecords, {
  family: familyFilter, metric = 'hallHpAuc', preregDir = DEFAULT_PREREG_DIR,
  storePath = null, excludeArms = [], splitSeed, splits = 200,
  alpha = 0.05, power = 0.8,
} = {}) {
  if (!Number.isInteger(splitSeed)) {
    throw new Error('option-set analysis requires an integer splitSeed; an unregistered split is a researcher degree of freedom')
  }
  const selectedInput = familyFilter ? inputRecords.filter(record => record.familyId === familyFilter) : inputRecords
  if (!selectedInput.length) throw new Error(familyFilter ? `store contains no records for family ${familyFilter}` : 'store contains no records')
  const deduped = dedupe(selectedInput)
  const familyIds = [...new Set(deduped.records.map(record => record.familyId))].sort()
  if (familyIds.length > 1) throw new Error(`option-set analysis takes one family at a time; store holds ${familyIds.join(', ')}`)
  const familyId = familyIds[0]
  const records = deduped.records.filter(record => record.familyId === familyId)
  const registration = loadRegistration(familyId, selectedInput.filter(record => record.familyId === familyId), preregDir)

  const excluded = new Set(excludeArms)
  const mazes = [...new Set(records.map(record => record.protocol.mazeName))].sort()
  const bands = []

  for (const maze of mazes) {
    const mazeRecords = records.filter(record => record.protocol.mazeName === maze)
    const armIds = [...new Set(mazeRecords.map(record => record.armId))].sort()
    const unknownExclusions = [...excluded].filter(armId => !armIds.includes(armId))

    const valuesByArm = new Map()
    for (const armId of armIds) {
      valuesByArm.set(armId, mapValues(mazeRecords.filter(record => record.armId === armId), metric).map)
    }
    const { common, dropped } = commonCells(valuesByArm)
    const { s1, s2 } = splitCells([...common], { seed: splitSeed })

    const arms = armIds.map(armId => {
      const byCell = valuesByArm.get(armId)
      const on = cells => {
        const values = [...cells].map(key => byCell.get(key)).filter(finite)
        return values.length ? mean(values) : NaN
      }
      const all = [...common].map(key => byCell.get(key)).filter(finite)
      return {
        armId, buildsTarget: excluded.has(armId),
        n: all.length, meanAll: all.length ? mean(all) : NaN, sdAll: all.length ? sd(all) : NaN,
        meanS1: on(s1), meanS2: on(s2),
        hangs: mazeRecords.filter(record => record.armId === armId && isHang(record)).length,
      }
    })

    // The resolution of the SELECTION half. A winner ahead by less than this was
    // chosen by noise, and the family is a null whatever else it prints.
    const sds = arms.map(arm => arm.sdAll).filter(finite)
    const pooledSd = sds.length ? mean(sds) : NaN
    const selectionMde = finite(pooledSd) && s1.size ? mde(pooledSd, s1.size, { alpha, power }) : NaN

    const reducedArms = new Map([...valuesByArm].filter(([armId]) => !excluded.has(armId)))
    const full = selectBest(valuesByArm, s1)
    const reduced = reducedArms.size ? selectBest(reducedArms, s1) : { armId: null, mean: NaN, margin: NaN, n: 0 }
    const valueOn = armId => {
      if (!armId) return NaN
      const values = [...s2].map(key => valuesByArm.get(armId)?.get(key)).filter(finite)
      return values.length ? mean(values) : NaN
    }
    const identical = Boolean(full.armId) && full.armId === reduced.armId

    // THE BRANCH THE SPEC IS BUILT AROUND. When the same policy wins with and
    // without the structure, the paired delta vector is identically zero:
    // pairedT returns t = 0, the sign test sees 0 better and 0 worse, and
    // splitHalfRho is NaN. Emitting the four gates on that would dress a
    // structural zero as a statistical result. The honest report is categorical
    // — "the structure is not in the best response" — and no gates at all.
    let comparison = null
    if (!identical && full.armId && reduced.armId) {
      const deltas = pairedOnCells(valuesByArm, full.armId, reduced.armId, s2)
      const paired = pairedT(deltas)
      const better = deltas.filter(delta => delta > 0).length
      const worse = deltas.filter(delta => delta < 0).length
      comparison = {
        between: [full.armId, reduced.armId],
        n: paired.n, delta: paired.mean, sd: paired.sd, t: paired.t,
        p: pairedPValue(paired),
        sign: { better, worse, ...signTest(better, worse) },
        ci: deltas.length
          ? bootstrapCI(deltas, { alpha, seed: hashSeed(`${familyId}|${maze}|option-set|${metric}`) })
          : { lo: NaN, hi: NaN },
        achievedMde: paired.n > 0 && finite(paired.sd)
          ? mde(paired.sd / Math.sqrt(2), paired.n, { alpha, power }) : NaN,
      }
    }

    // Stability is REPORTED, never gated. Rev 1 of the spec set a 95%-of-splits
    // bar and it was withdrawn: near-tied policies can never clear it and
    // well-separated ones clear it trivially, so it never discriminates.
    const tally = new Map(armIds.map(armId => [armId, { full: 0, reduced: 0 }]))
    for (let index = 0; index < splits; index++) {
      const draw = splitCells([...common], { seed: splitSeed + 1 + index })
      const pickFull = selectBest(valuesByArm, draw.s1).armId
      if (pickFull) tally.get(pickFull).full++
      if (reducedArms.size) {
        const pickReduced = selectBest(reducedArms, draw.s1).armId
        if (pickReduced) tally.get(pickReduced).reduced++
      }
    }

    bands.push({
      maze, metric, cells: common.size, s1: s1.size, s2: s2.size,
      droppedCells: [...dropped].map(([armId, count]) => ({ armId, count })),
      unknownExclusions, arms, selectionMde,
      selection: {
        full: { ...full, valueS2: valueOn(full.armId) },
        reduced: { ...reduced, valueS2: valueOn(reduced.armId) },
        identical,
        contribution: identical ? 0 : valueOn(full.armId) - valueOn(reduced.armId),
        selectedByNoise: finite(selectionMde) && finite(full.margin) && full.margin < selectionMde,
      },
      comparison,
      stability: [...tally].map(([armId, counts]) => ({
        armId, shareFull: counts.full / splits, shareReduced: counts.reduced / splits,
      })).sort((a, b) => b.shareFull - a.shareFull),
    })
  }

  // BH across the comparisons actually emitted, padded to the declared family
  // size when the prereg names one — the same rule the control-vs-arm path uses.
  const emitted = bands.filter(band => band.comparison)
  if (emitted.length) {
    const declared = registration.prereg?.familySize
    const raw = emitted.map(band => band.comparison.p)
    const padded = finite(declared) && declared > raw.length
      ? [...raw, ...new Array(declared - raw.length).fill(1)] : raw
    const qs = benjaminiHochberg(padded)
    emitted.forEach((band, index) => { band.comparison.q = qs[index] })
  }

  return {
    storePath, familyId, metric, registration,
    excludeArms: [...excluded], splitSeed, splits,
    inputRecords: selectedInput.length, recordsAfterDedupe: deduped.records.length,
    corruption: deduped.corruption, bands,
  }
}

export function renderOptionSet(result) {
  const lines = ['ELEMENTIA BALANCE HARNESS — OPTION-SET ANALYSIS']
  lines.push(`family ${result.familyId} | metric ${result.metric} | split seed ${result.splitSeed} | ${result.splits} stability splits`)
  lines.push(`removed for the reduced set: ${result.excludeArms.length ? result.excludeArms.join(', ') : '(none — matrix only, no contribution)'}`)
  if (result.registration.status !== 'valid') {
    lines.push(...wrapped(`REGISTRATION ${result.registration.status.toUpperCase()} — descriptive only, no verdict: ${result.registration.errors.join('; ') || result.registration.path}`))
  }

  for (const band of result.bands) {
    lines.push('')
    lines.push(`--- maze ${band.maze} | ${band.cells} common cells (${band.s1} select / ${band.s2} evaluate) ---`)
    if (band.droppedCells.length) {
      lines.push(...wrapped(`CELL ASYMMETRY: ${band.droppedCells.map(row => `${row.armId} +${row.count}`).join(', ')} outside the common set and excluded from every mean.`))
    }
    if (band.unknownExclusions.length) {
      lines.push(...wrapped(`EXCLUSION NAMES NO SUCH ARM: ${band.unknownExclusions.join(', ')} — the reduced set is NOT what you asked for.`))
    }
    // Q1, the primary deliverable. Printed before any selection result so a
    // reader meets the matrix first, which is the spec's stated priority.
    lines.push('policy            builds?     n      mean        sd    select      eval')
    lines.push('---------------- -------- ----- --------- --------- --------- ---------')
    for (const arm of [...band.arms].sort((a, b) => b.meanAll - a.meanAll)) {
      lines.push(`${clipped(arm.armId, 16).padEnd(16)} ${(arm.buildsTarget ? 'yes' : 'no').padEnd(8)} ${String(arm.n).padStart(5)} ` +
        `${fmt(arm.meanAll).padStart(9)} ${fmt(arm.sdAll).padStart(9)} ${fmt(arm.meanS1).padStart(9)} ${fmt(arm.meanS2).padStart(9)}`)
    }
    lines.push(`selection-half MDE ${fmt(band.selectionMde)} — a winner ahead by less than this was chosen by noise`)

    const { full, reduced, identical, contribution, selectedByNoise } = band.selection
    lines.push('')
    lines.push(`best in full set     ${full.armId ?? 'n/a'} (select ${fmt(full.mean)}, margin ${fmt(full.margin)}, eval ${fmt(full.valueS2)})`)
    lines.push(`best without target  ${reduced.armId ?? 'n/a'} (select ${fmt(reduced.mean)}, margin ${fmt(reduced.margin)}, eval ${fmt(reduced.valueS2)})`)
    if (selectedByNoise) {
      lines.push(...wrapped('SELECTED BY NOISE: the winning margin is inside the selection-half MDE, so which policy won is not resolvable. Read the matrix, not the winner.'))
    }
    if (identical) {
      lines.push(...wrapped('NOT IN THE BEST RESPONSE: the same policy wins with and without the target, so contribution is exactly 0 by construction. No gates are computed — a structural zero is not a statistical result.'))
    } else if (!full.armId || !reduced.armId) {
      lines.push('CONTRIBUTION UNAVAILABLE: one of the two sets has no scored arm.')
    } else {
      lines.push(`contribution ${fmt(contribution)} (evaluation half, ${full.armId} minus ${reduced.armId})`)
    }

    if (band.comparison) {
      const row = band.comparison
      lines.push(`  paired ${row.between[0]} vs ${row.between[1]} | n ${row.n} | delta ${fmt(row.delta)}` +
        ` | 95% CI [${fmt(row.ci.lo)}, ${fmt(row.ci.hi)}] | t ${fmt(row.t, 2)}`)
      lines.push(`  raw p ${fmt(row.p, 5)} | BH q ${fmt(row.q, 5)} | sign exact p ${fmt(row.sign.p, 5)} (${row.sign.better}+/${row.sign.worse}-)` +
        ` | achieved MDE ${fmt(row.achievedMde)}`)
    }

    lines.push('  selection stability over splits (full / reduced):')
    for (const row of band.stability.filter(row => row.shareFull > 0 || row.shareReduced > 0)) {
      lines.push(`    ${clipped(row.armId, 16).padEnd(16)} ${pct(row.shareFull).padStart(5)} ${pct(row.shareReduced).padStart(6)}`)
    }
  }
  lines.push('')
  lines.push(...wrapped('Stability is reported, not gated. A registered policy set may not be extended after seeing this output: the estimator is a maximum over the set, so adding a policy can only raise it.'))
  return `${lines.join('\n')}\n`
}

function parseArgs(argv) {
  const options = { allowMixed: false }
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (token === '--allow-mixed') options.allowMixed = true
    else if (token === '--option-set') options.optionSet = true
    else if (['--store', '--family', '--metric', '--json', '--exclude', '--split-seed', '--splits'].includes(token)) {
      if (i + 1 >= argv.length) throw new Error(`${token} requires a value`)
      options[token.slice(2)] = argv[++i]
    } else if (token === '--help') options.help = true
    else throw new Error(`unknown option ${token}`)
  }
  return options
}

function usage() {
  return [
    'Usage: npm run bench:analyze -- --store <path.jsonl> [--family <id>] [--metric <name>] [--json <path>] [--allow-mixed]',
    '',
    'Option-set mode (docs/plans/2026-08-27-option-set-comparison-spec.md):',
    '  --option-set              best-response over a registered policy set instead of control-vs-arm',
    '  --split-seed <int>        REQUIRED in option-set mode; the registered selection/evaluation split',
    '  --exclude <a,b>           arms that build the structure under test; omit for the matrix alone',
    '  --splits <N>              stability draws (default 200)',
  ].join('\n')
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  if (args.help) {
    console.log(usage())
    return 0
  }
  if (!args.store) throw new Error(`--store is required\n${usage()}`)

  if (args.optionSet) {
    // Parsed here rather than in parseArgs so the error names the flag the user
    // actually typed. An unregistered split seed is a researcher degree of
    // freedom, so it is required rather than defaulted.
    const splitSeed = Number(args['split-seed'])
    if (!Number.isInteger(splitSeed)) throw new Error(`--option-set requires an integer --split-seed\n${usage()}`)
    const splits = args.splits === undefined ? 200 : Number(args.splits)
    if (!Number.isInteger(splits) || splits < 1) throw new Error('--splits must be a positive integer')
    const optionResult = analyzeOptionSet(await readStore(resolve(args.store)), {
      family: args.family, metric: args.metric, preregDir: DEFAULT_PREREG_DIR,
      storePath: resolve(args.store), splitSeed, splits,
      excludeArms: args.exclude ? args.exclude.split(',').map(name => name.trim()).filter(Boolean) : [],
    })
    process.stdout.write(renderOptionSet(optionResult))
    if (args.json) writeFileSync(resolve(args.json), `${JSON.stringify(optionResult, null, 2)}\n`)
    return 0
  }

  const result = await analyzeStore(resolve(args.store), {
    family: args.family, metric: args.metric, allowMixed: args.allowMixed,
  })
  process.stdout.write(renderText(result))
  if (args.json) writeFileSync(resolve(args.json), `${JSON.stringify(result, null, 2)}\n`)
  return result.families.some(family => family.refused) ? 2 : 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await main()
  } catch (error) {
    console.error(`bench:analyze: ${error.message}`)
    process.exitCode = 1
  }
}
