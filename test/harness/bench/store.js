// Append-only persistence for harness run records. The writer deliberately has
// no update API: analysis may dedupe repeated runIds, but measurement never
// edits history in place.

import { createReadStream } from 'node:fs'
import { mkdir, open } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Readable } from 'node:stream'
import { StringDecoder } from 'node:string_decoder'
import { createGunzip, createGzip } from 'node:zlib'

import { validateRecord } from './record.js'

const isGzipPath = path => String(path).endsWith('.jsonl.gz')

async function gzipLine(line) {
  const chunks = []
  const stream = Readable.from([line]).pipe(createGzip())
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks)
}

export async function openStore(path) {
  await mkdir(dirname(path), { recursive: true })
  const file = await open(path, 'a')
  let pending = Promise.resolve()
  let closed = false

  return {
    path,
    append(line) {
      if (closed) return Promise.reject(new Error(`store ${path} is closed`))
      pending = pending.then(async () => {
        const bytes = isGzipPath(path) ? await gzipLine(line) : line
        await file.appendFile(bytes)
      })
      return pending
    },
    async close() {
      if (closed) return
      closed = true
      try {
        await pending
      } finally {
        await file.close()
      }
    },
  }
}

export async function appendRecord(handle, rec) {
  validateRecord(rec)
  await handle.append(`${JSON.stringify(rec)}\n`)
}

async function * recordLines(path) {
  const source = createReadStream(path)
  const gzip = isGzipPath(path)
  const stream = gzip ? source.pipe(createGunzip()) : source
  // pipe() does not forward source errors, so a missing or unreadable file
  // would surface as an unhandled 'error' on the ReadStream instead of
  // rejecting the iteration below (and reaching the ENOENT case in
  // loadedRunIds, which exists precisely for a not-yet-created store).
  if (gzip) source.on('error', error => stream.destroy(error))
  const decoder = new StringDecoder('utf8')
  let pending = ''
  let lineNumber = 0
  let held = null
  try {
    for await (const chunk of stream) {
      pending += decoder.write(chunk)
      let newline
      while ((newline = pending.indexOf('\n')) !== -1) {
        lineNumber++
        const current = { line: pending.slice(0, newline), lineNumber, trailing: false }
        // Gunzip can emit a complete final line before discovering that the
        // member footer was truncated. Holding one line until clean EOF keeps
        // that unverified record out while preserving all prior members.
        if (gzip) {
          if (held) yield held
          held = current
        } else {
          yield current
        }
        pending = pending.slice(newline + 1)
      }
    }
  } catch (error) {
    if (!gzip || error?.code !== 'Z_BUF_ERROR') throw error
    if (pending.length && held) yield held
    const corruptLine = pending.length ? lineNumber + 1 : held?.lineNumber ?? lineNumber + 1
    console.warn(`warning: skipped corrupt trailing gzip line ${corruptLine} in ${path}: ${error.message}`)
    return
  }
  pending += decoder.end()
  if (held) yield held
  if (pending.length) yield { line: pending, lineNumber: lineNumber + 1, trailing: true }
}

function parseLine(path, { line, lineNumber, trailing }) {
  let rec
  try {
    rec = JSON.parse(line)
  } catch (error) {
    if (trailing) {
      console.warn(`warning: skipped corrupt trailing JSONL line ${lineNumber} in ${path}: ${error.message}`)
      return null
    }
    throw new Error(`invalid JSONL in ${path} at line ${lineNumber}: ${error.message}`, { cause: error })
  }

  try {
    return validateRecord(rec)
  } catch (error) {
    throw new Error(`invalid run record in ${path} at line ${lineNumber}: ${error.message}`, { cause: error })
  }
}

export async function readRecords(path) {
  const records = []
  for await (const line of recordLines(path)) {
    const rec = parseLine(path, line)
    if (rec) records.push(rec)
  }
  return records
}

export async function loadedRunIds(path) {
  try {
    const ids = new Set()
    for await (const line of recordLines(path)) {
      const rec = parseLine(path, line)
      if (rec) ids.add(rec.runId)
    }
    return ids
  } catch (error) {
    if (error?.code === 'ENOENT') return new Set()
    throw error
  }
}
