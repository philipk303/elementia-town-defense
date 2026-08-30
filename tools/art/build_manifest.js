#!/usr/bin/env node
// Rebuilds art/assets-manifest.json from art/manifest/_root.json plus one
// fragment file per asset (art/manifest/<id>.json). The fragments are the
// editable source of truth; art/assets-manifest.json is generated output,
// committed so every existing reader (tests, docs, tooling) keeps working
// unchanged. Run after editing any file under art/manifest/.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'

const ROOT_DIR = new URL('../../art/manifest/', import.meta.url)
const OUTPUT = new URL('../../art/assets-manifest.json', import.meta.url)

const root = JSON.parse(readFileSync(new URL('_root.json', ROOT_DIR), 'utf8'))
const categoryOrder = Object.keys(root.categories)

const fragmentFiles = readdirSync(ROOT_DIR).filter((f) => f.endsWith('.json') && f !== '_root.json')
const assets = fragmentFiles.map((f) => {
  const asset = JSON.parse(readFileSync(new URL(f, ROOT_DIR), 'utf8'))
  if (`${asset.id}.json` !== f) {
    throw new Error(`art/manifest/${f} id "${asset.id}" does not match its file name`)
  }
  return asset
})

assets.sort((a, b) => {
  const ca = categoryOrder.indexOf(a.category)
  const cb = categoryOrder.indexOf(b.category)
  if (ca !== cb) return ca - cb
  return a.id.localeCompare(b.id)
})

const full = { ...root, assets }
writeFileSync(OUTPUT, `${JSON.stringify(full, null, 2)}\n`)
console.log(`Rebuilt art/assets-manifest.json from ${assets.length} fragments in art/manifest/`)
