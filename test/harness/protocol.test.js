// The protocol resolver's contract (Balance Harness v2, WP3).
//
// These are not incidental unit tests. Each one pins a property that, when it
// was absent, cost this project a retracted measurement:
//
//   * unknown keys throw           — a typo'd flag that silently does nothing
//                                     reports a protocol the run did not run
//   * every default is written out — an unstated default is invisible in the
//                                     output, which is how the Watchtower
//                                     displacement hid for three weeks
//   * the result is frozen         — a protocol edited after resolution is a
//                                     label that no longer describes the run
//   * legacy is opt-in and loud    — pre-2026-08-04 maze-A numbers are
//                                     confounded and must never pool with v2

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveProtocol, canonicalProtocol, PROTOCOL_DEFAULTS } from './protocol.js'
import { runMatch } from './matchRunner.js'

const base = { seed: 20260801 }

test('an unknown key throws instead of being ignored', () => {
  assert.throws(() => resolveProtocol({ ...base, sitingProtocol: 'isolated' }),
    /unknown key "sitingProtocol"/)
  // The old vocabulary specifically: every archived driver passes these, so a
  // copy-paste from one must fail loudly rather than run a different protocol.
  assert.throws(() => resolveProtocol({ ...base, freeSpecialSites: 'funnel' }),
    /unknown key "freeSpecialSites"/)
  assert.throws(() => resolveProtocol({ ...base, defense: 'WATCHTOWER' }),
    /unknown key "defense"/)
})

test('every default is written out explicitly, none elided', () => {
  const { protocol } = resolveProtocol(base)
  for (const k of Object.keys(PROTOCOL_DEFAULTS)) {
    assert.ok(k in protocol, `resolved protocol is missing "${k}"`)
  }
  assert.equal(protocol.mazeName, 'A')
  assert.equal(protocol.legacySiting, false, 'the isolated protocol is the default now')
  assert.equal(protocol.specialSiting, 'funnel')
})

test('the resolved protocol is frozen', () => {
  const { protocol } = resolveProtocol(base)
  assert.throws(() => { protocol.fuseWave = 1 }, TypeError)
})

test('hooks are separated from the hashable protocol', () => {
  const onEnd = () => {}
  const { protocol, hooks } = resolveProtocol({ ...base, onEnd })
  assert.equal(hooks.onEnd, onEnd)
  assert.ok(!('onEnd' in protocol),
    'a diagnostic callback must not change a configHash — it runs after the loop and cannot affect a measurement')
  assert.ok(!('tiProbe' in canonicalProtocol(protocol)))
})

test('canonicalProtocol is key-order stable', () => {
  const a = resolveProtocol({ ...base, fuseWave: 4, humanElement: 'FIRE', fuseWith: 'WIND' }).protocol
  const b = resolveProtocol({ ...base, fuseWith: 'WIND', humanElement: 'FIRE', fuseWave: 4 }).protocol
  assert.equal(JSON.stringify(canonicalProtocol(a)), JSON.stringify(canonicalProtocol(b)),
    'two spellings of the same experiment must hash identically or the store cannot dedupe')
})

test('an object-form maze still records a stable name', () => {
  const { protocol } = resolveProtocol({ ...base, maze: { wallRow: 8, gaps: [5, 35] } })
  assert.equal(protocol.mazeName, 'B')
})

test('an ad-hoc maze is named as custom, never as A or B', () => {
  const { protocol } = resolveProtocol({ ...base, maze: { wallRow: 8, gaps: [9, 31] } })
  assert.match(protocol.mazeName, /^custom:/,
    'an ad-hoc diagnostic maze must not pool with real measurements in the store')
})

test('legacy site lists are reachable only through legacySiting', () => {
  assert.throws(() => resolveProtocol({ ...base, legacySpecialSites: 'funnel' }),
    /legacySiting is false/)
  const { protocol } = resolveProtocol({ ...base, legacySiting: true, legacySpecialSites: 'offlane' })
  assert.equal(protocol.legacySpecialSites, 'offlane')
})

test('invalid inputs are rejected at resolve time, not silently defaulted', () => {
  assert.throws(() => resolveProtocol({}), /seed must be an integer/)
  assert.throws(() => resolveProtocol({ ...base, postGap: 7 }), /not an index into maze/)
  assert.throws(() => resolveProtocol({ ...base, fuseWith: 'FIER' }), /is not an element/)
  assert.throws(() => resolveProtocol({ ...base, specialSiting: 'offlane' }), /specialSiting "offlane" unknown/)
  assert.throws(() => resolveProtocol({ ...base, defenceCap: -1 }), /defenceCap must be null/)
  // An arm that can never form the combo it is named after produces a table of
  // control-vs-control and reads as "no effect" — the most expensive possible
  // silent failure for a fusion sweep.
  assert.throws(() => resolveProtocol({ ...base, humanElement: 'FIRE', fuseWith: 'FIRE' }),
    /cannot fuse with itself/)
})

test('runMatch carries its resolved protocol and footprint ledger on the metrics', () => {
  const m = runMatch({ seed: 20260801, maxWaves: 2, humanElement: 'WATER', fuseWith: 'WIND' })
  assert.equal(m.protocol.legacySiting, false)
  assert.equal(m.protocol.specialSiting, 'funnel')
  assert.equal(m.protocol.mazeName, 'A')
  assert.ok(m.placements.length > 0, 'the policy places a free special and a defence in wave 1')
  for (const pl of m.placements) {
    assert.ok(pl.w >= 1 && pl.h >= 1)
    assert.ok(['freeSpecial', 'partnerSpecial', 'fusion', 'defence'].includes(pl.role))
  }
})

// The property the isolated protocol exists to guarantee, restated over the
// ledger rather than over live state: no placement the policy makes may touch
// the Watchtower's pinned column. matchRunner.test.js pins this against
// state.structures at end of run; this pins it against the recorded output,
// which is what an analyst will actually read six weeks from now.
test('the footprint ledger shows no special or fusion on the Watchtower column', () => {
  const gaps = [13, 27]
  const towerCols = new Set(gaps.map(g => g - 1))
  for (const specialSiting of ['funnel', 'flank']) {
    const m = runMatch({ seed: 20260801, maxWaves: 3, humanElement: 'WATER', fuseWith: 'WIND', specialSiting })
    for (const pl of m.placements) {
      if (pl.role === 'defence') continue
      for (let dx = 0; dx < pl.w; dx++) {
        assert.ok(!towerCols.has(pl.gx + dx),
          `${pl.role} ${pl.type} occupies col ${pl.gx + dx}, a pinned Watchtower column, at siting ${specialSiting}`)
      }
    }
  }
})

// THE TWO-INGREDIENT CONTROL'S GUARD RAILS (2026-08-15). `partnerSpecial` is a
// control arm, not a fusion variant: it buys the partner and DECLINES the
// proposal. Every rejection below is a configuration that would otherwise run a
// protocol nobody declared — the exact failure class this module exists for.
test('partnerSpecial rejects the configurations that would silently mean something else', () => {
  const base = { seed: 1, humanElement: 'FIRE', fuse: false }
  // fuse says accept, partnerSpecial says decline. Letting either win silently
  // is how an arm ends up labelled "control" while measuring a fusion.
  assert.throws(() => resolveProtocol({ ...base, fuse: true, partnerSpecial: 'WATER' }), /requires fuse:false/)
  // The human already owns its own element's special, so this buys nothing and
  // the arm would be a one-ingredient control wearing a two-ingredient label.
  assert.throws(() => resolveProtocol({ ...base, partnerSpecial: 'FIRE' }), /equals humanElement/)
  // The partner is placed relative to the free special's anchor.
  assert.throws(() => resolveProtocol({ ...base, partnerSpecial: 'WATER', freeSpecial: false }), /freeSpecial:false/)
  assert.throws(() => resolveProtocol({ ...base, partnerSpecial: 'WATTER' }), /is not an element/)
})

test('partnerSpecial defaults to null and is recorded in the canonical protocol', () => {
  const { protocol } = resolveProtocol({ seed: 1 })
  assert.equal(protocol.partnerSpecial, null)
  // It must be hashed: two arms differing only in this flag are DIFFERENT
  // experiments, and a configHash that cannot tell them apart would pool a
  // control with the fusion it is the control for.
  assert.ok('partnerSpecial' in canonicalProtocol(protocol))
})
