#!/usr/bin/env node

// Sweep orchestration lives in the parent; simulation and mutable BALANCE state
// live in forked children. Keeping the store handle out of every child makes a
// partial worker failure a missing run, never interleaved or corrupted JSONL.

import { fork } from 'node:child_process'
import { cpus } from 'node:os'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'

import { BALANCE } from '../../../shared/balance.js'
import { resolveProtocol } from '../protocol.js'
import { resolveDial, resolveMaze, SEEDS } from '../scenarios.js'
import {
  balanceHash,
  configHashFor,
  engineVersion,
  makeRunRecord,
  runIdFor,
} from './record.js'
import { appendRecord, loadedRunIds, openStore } from './store.js'

const RUNNER = fileURLToPath(import.meta.url)
const DEFAULT_WORKERS = Math.max(1, cpus().length - 1)
const SECONDS_PER_RUN = 0.3

function usage() {
  return [
    'Usage: node test/harness/bench/run.mjs --spec <file.json> [options]',
    '',
    'Options:',
    '  --out <path>        JSONL or JSONL.GZ output path',
    '  --workers <N>       child process count (default: CPU count - 1)',
    '  --seeds <N|a,b>     override seed count or explicit seed list',
    '  --mazes <A,B>       override maze list',
    '  --sweep-id <id>     override sweepId',
    '  --family-id <id>    override familyId',
    '  --dry-run           print the resolved plan without running matches',
  ].join('\n')
}

function parseArgs(argv) {
  const args = { workers: DEFAULT_WORKERS, dryRun: false }
  const valueFor = (flag, i) => {
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('--')) throw new Error(`${flag} requires a value`)
    return value
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--child') args.child = true
    else if (arg === '--dry-run') args.dryRun = true
    else if (arg === '--help' || arg === '-h') args.help = true
    else if (arg === '--spec') args.spec = valueFor(arg, i++)
    else if (arg === '--out') args.out = valueFor(arg, i++)
    else if (arg === '--workers') args.workers = Number(valueFor(arg, i++))
    else if (arg === '--seeds') args.seeds = valueFor(arg, i++)
    else if (arg === '--mazes') args.mazes = valueFor(arg, i++)
    else if (arg === '--sweep-id') args.sweepId = valueFor(arg, i++)
    else if (arg === '--family-id') args.familyId = valueFor(arg, i++)
    else throw new Error(`unknown option ${arg}`)
  }
  if (!Number.isInteger(args.workers) || args.workers < 1) throw new Error('--workers must be a positive integer')
  return args
}

function seedList(value) {
  let seeds
  if (Array.isArray(value)) {
    seeds = value
  } else if (Number.isInteger(value)) {
    if (value < 1) throw new Error('seed count must be a positive integer')
    seeds = Array.from({ length: value }, (_, i) => SEEDS[0] + i)
  } else if (typeof value === 'string' && value.includes(',')) {
    seeds = value.split(',').map(Number)
  } else if (typeof value === 'string' && /^\d+$/.test(value)) {
    return seedList(Number(value))
  } else {
    throw new Error('seeds must be a positive count or an explicit integer array')
  }
  if (!seeds.length || seeds.some(seed => !Number.isInteger(seed))) throw new Error('every seed must be an integer')
  if (new Set(seeds).size !== seeds.length) throw new Error('seeds must not contain duplicates')
  return seeds
}

function mazeList(value) {
  const mazes = Array.isArray(value) ? value : String(value).split(',')
  const names = mazes.map(name => String(name).trim().toUpperCase()).filter(Boolean)
  if (!names.length) throw new Error('mazes must contain at least one maze name')
  if (new Set(names).size !== names.length) throw new Error('mazes must not contain duplicates')
  for (const name of names) resolveMaze(name)
  return names
}

function objectOrEmpty(value, label) {
  if (value === undefined) return {}
  if (value === null || Array.isArray(value) || typeof value !== 'object') throw new Error(`${label} must be an object`)
  return value
}

function normalizeSpec(raw, args) {
  const sweepId = args.sweepId ?? raw.sweepId
  const familyId = args.familyId ?? raw.familyId
  if (typeof sweepId !== 'string' || !sweepId.trim()) throw new Error('spec.sweepId must be a non-empty string')
  if (typeof familyId !== 'string' || !familyId.trim()) throw new Error('spec.familyId must be a non-empty string')
  if (!Array.isArray(raw.arms) || raw.arms.length === 0) throw new Error('spec.arms must be a non-empty array')

  const arms = raw.arms.map((arm, index) => {
    if (!arm || typeof arm !== 'object' || Array.isArray(arm)) throw new Error(`spec.arms[${index}] must be an object`)
    if (typeof arm.armId !== 'string' || !arm.armId.trim()) throw new Error(`spec.arms[${index}].armId must be a non-empty string`)
    const balanceOverrides = objectOrEmpty(arm.balanceOverrides, `arm ${arm.armId} balanceOverrides`)
    for (const path of Object.keys(balanceOverrides)) resolveDial(BALANCE, path)
    return {
      armId: arm.armId,
      balanceOverrides,
      protocol: objectOrEmpty(arm.protocol, `arm ${arm.armId} protocol`),
    }
  })
  if (new Set(arms.map(arm => arm.armId)).size !== arms.length) throw new Error('armId values must be unique')

  return {
    sweepId,
    familyId,
    arms,
    mazes: mazeList(args.mazes ?? raw.mazes),
    seeds: seedList(args.seeds ?? raw.seeds),
    protocol: objectOrEmpty(raw.protocol, 'spec.protocol'),
  }
}

function expandRuns(spec, engine, balance) {
  const runs = []
  const firstByArm = new Map()
  for (const arm of spec.arms) {
    for (const mazeName of spec.mazes) {
      const maze = resolveMaze(mazeName)
      for (const seed of spec.seeds) {
        for (let postGap = 0; postGap < maze.gaps.length; postGap++) {
          const partial = { ...spec.protocol, ...arm.protocol, mazeName, seed, postGap }
          const { protocol } = resolveProtocol(partial)
          const configHash = configHashFor({ protocol, balanceOverrides: arm.balanceOverrides, engine, balance })
          const run = {
            armId: arm.armId,
            balanceOverrides: arm.balanceOverrides,
            protocol,
            configHash,
            runId: runIdFor(configHash, protocol.seed, protocol.postGap),
          }
          runs.push(run)
          if (!firstByArm.has(arm.armId)) firstByArm.set(arm.armId, run)
        }
      }
    }
  }
  return { runs, firstByArm }
}

function duration(seconds) {
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  return hours ? `${hours}h ${minutes}m ${secs}s` : minutes ? `${minutes}m ${secs}s` : `${secs}s`
}

function printDryRun({ spec, args, outPath, allRuns, pendingRuns, firstByArm }) {
  console.log('Balance harness sweep plan')
  console.log(`Sweep: ${spec.sweepId}`)
  console.log(`Family: ${spec.familyId}`)
  console.log(`Output: ${outPath}`)
  console.log(`Workers: ${args.workers}`)
  console.log(`Total runs: ${allRuns.length}`)
  console.log(`Already stored: ${allRuns.length - pendingRuns.length}`)
  console.log(`Runs remaining: ${pendingRuns.length}`)
  console.log(`Estimated wall time: ${duration(pendingRuns.length * SECONDS_PER_RUN / args.workers)} at ~${SECONDS_PER_RUN}s/run`)
  for (const arm of spec.arms) {
    const first = firstByArm.get(arm.armId)
    console.log(`\nArm: ${arm.armId}`)
    console.log(`Balance overrides: ${JSON.stringify(arm.balanceOverrides)}`)
    console.log(`Config hash (first run): ${first.configHash}`)
    console.log(`Resolved protocol (first run):\n${JSON.stringify(first.protocol, null, 2)}`)
  }
}

function childMain() {
  let context = null
  process.on('message', async message => {
    if (message.type === 'init') {
      try {
        for (const [path, value] of Object.entries(message.balanceOverrides)) {
          const { obj, key } = resolveDial(BALANCE, path)
          obj[key] = value
        }
        context = message
        process.send?.({ type: 'ready' })
      } catch (error) {
        process.send?.({ type: 'initError', error: error.stack ?? String(error) })
        process.disconnect()
      }
      return
    }
    if (message.type === 'shutdown') {
      process.disconnect()
      return
    }
    if (message.type !== 'run' || !context) return

    const startedAt = new Date().toISOString()
    const started = performance.now()
    try {
      const { runMatch } = await import('../matchRunner.js')
      const m = runMatch(message.protocol)
      const rec = makeRunRecord({
        m,
        sweepId: context.sweepId,
        familyId: context.familyId,
        armId: context.armId,
        balanceOverrides: context.balanceOverrides,
        engine: context.engine,
        balance: context.balance,
        durationMs: Math.round(performance.now() - started),
        startedAt,
      })
      process.send?.({ type: 'record', rec })
    } catch (error) {
      process.send?.({ type: 'crash', error: error.stack ?? String(error) })
    }
  })
}

async function executeRuns({ runs, spec, args, engine, balance, store }) {
  const queues = new Map(spec.arms.map(arm => [arm.armId, []]))
  const arms = new Map(spec.arms.map(arm => [arm.armId, arm]))
  for (const run of runs) queues.get(run.armId).push(run)

  const assigned = new Map(spec.arms.map(arm => [arm.armId, 0]))
  const workers = new Set()
  const limit = Math.min(args.workers, runs.length)
  const started = performance.now()
  let lastProgress = started
  let completed = 0
  let nonWon = 0
  let crashed = 0
  let settled = false

  const progress = () => {
    const now = performance.now()
    if (now - lastProgress < 1000) return
    lastProgress = now
    const elapsed = (now - started) / 1000
    const eta = completed ? elapsed / completed * (runs.length - completed) : runs.length * SECONDS_PER_RUN / Math.max(1, limit)
    console.error(`progress ${completed}/${runs.length} | elapsed ${duration(elapsed)} | ETA ${duration(eta)} | non-won ${nonWon} | crashed ${crashed}`)
  }

  const chooseArm = () => {
    let choice = null
    let best = -1
    for (const [armId, queue] of queues) {
      if (!queue.length) continue
      const score = queue.length / (assigned.get(armId) + 1)
      if (score > best) {
        best = score
        choice = armId
      }
    }
    return choice
  }

  return new Promise((resolvePromise, rejectPromise) => {
    const fail = error => {
      if (settled) return
      settled = true
      for (const state of workers) state.child.kill()
      rejectPromise(error)
    }

    const maybeFinish = () => {
      if (settled || completed !== runs.length || workers.size !== 0) return
      settled = true
      progress()
      resolvePromise({ crashed, nonWon, elapsedMs: performance.now() - started })
    }

    const recordCrash = (run, error) => {
      crashed++
      completed++
      console.error(`worker crash; no record written for protocol ${JSON.stringify(run.protocol)}\n${error}`)
      progress()
    }

    const fillSlots = () => {
      while (!settled && workers.size < limit) {
        const armId = chooseArm()
        if (!armId) break
        launch(armId)
      }
      maybeFinish()
    }

    const sendNext = state => {
      const run = queues.get(state.armId).shift()
      if (!run) {
        state.expectedExit = true
        state.child.send({ type: 'shutdown' })
        return
      }
      state.current = run
      state.child.send({ type: 'run', protocol: run.protocol })
    }

    const handleMessage = async (state, message) => {
      if (message.type === 'ready') {
        state.ready = true
        sendNext(state)
        return
      }
      if (message.type === 'initError') {
        state.initError = message.error
        return
      }
      if (message.type === 'record') {
        const run = state.current
        if (!run) throw new Error(`worker for arm ${state.armId} returned an unassigned record`)
        if (message.rec.runId !== run.runId) {
          recordCrash(run, `worker returned runId ${message.rec.runId}, expected ${run.runId}`)
        } else {
          await appendRecord(store, message.rec)
          completed++
          if (!message.rec.outcome.won) nonWon++
          progress()
        }
        state.current = null
        sendNext(state)
        return
      }
      if (message.type === 'crash') {
        const run = state.current
        if (!run) throw new Error(`worker for arm ${state.armId} reported a crash without a run`)
        recordCrash(run, message.error)
        state.current = null
        sendNext(state)
      }
    }

    const launch = armId => {
      const arm = arms.get(armId)
      const child = fork(RUNNER, ['--child'], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
      const state = {
        armId,
        child,
        current: null,
        ready: false,
        expectedExit: false,
        initError: null,
        processing: Promise.resolve(),
      }
      workers.add(state)
      assigned.set(armId, assigned.get(armId) + 1)

      child.on('message', message => {
        state.processing = state.processing.then(() => handleMessage(state, message)).catch(fail)
      })
      child.on('error', error => { state.childError = error.stack ?? String(error) })
      child.on('exit', () => {
        state.processing.then(() => {
          workers.delete(state)
          assigned.set(armId, assigned.get(armId) - 1)
          if (!state.expectedExit) {
            if (state.current) {
              recordCrash(state.current, state.childError ?? state.initError ?? 'child process exited unexpectedly')
              state.current = null
            } else if (!state.ready && queues.get(armId).length) {
              const failed = queues.get(armId).shift()
              recordCrash(failed, state.childError ?? state.initError ?? 'child process failed during startup')
            }
          }
          fillSlots()
        }).catch(fail)
      })

      child.send({
        type: 'init',
        sweepId: spec.sweepId,
        familyId: spec.familyId,
        armId,
        balanceOverrides: arm.balanceOverrides,
        engine,
        balance,
      })
    }

    fillSlots()
  })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }
  if (!args.spec) throw new Error(`--spec is required\n\n${usage()}`)

  const raw = JSON.parse(await readFile(resolve(args.spec), 'utf8'))
  const spec = normalizeSpec(raw, args)
  const engine = engineVersion()
  const balance = balanceHash()
  const { runs: allRuns, firstByArm } = expandRuns(spec, engine, balance)
  const outPath = resolve(args.out ?? `test/harness/store/${spec.sweepId}.jsonl`)
  const loaded = await loadedRunIds(outPath)
  const pendingRuns = allRuns.filter(run => !loaded.has(run.runId))

  if (args.dryRun) {
    printDryRun({ spec, args, outPath, allRuns, pendingRuns, firstByArm })
    return
  }
  if (!pendingRuns.length) {
    console.error(`Sweep ${spec.sweepId}: all ${allRuns.length} runs already stored; nothing to do.`)
    return
  }

  const store = await openStore(outPath)
  let summary
  try {
    summary = await executeRuns({ runs: pendingRuns, spec, args, engine, balance, store })
  } finally {
    await store.close()
  }
  console.error(`Sweep ${spec.sweepId}: stored ${pendingRuns.length - summary.crashed}/${pendingRuns.length} pending runs in ${duration(summary.elapsedMs / 1000)}; non-won ${summary.nonWon}; crashed ${summary.crashed}.`)
  if (summary.crashed) process.exitCode = 1
}

if (process.argv.includes('--child')) {
  childMain()
} else {
  main().catch(error => {
    console.error(error.stack ?? String(error))
    process.exitCode = 1
  })
}
