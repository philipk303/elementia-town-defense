import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  encodeSnapshot, decodeSnapshot, FX_CAP_PER_TYPE, PROJECTILE_TYPES, ATTACK_KINDS,
  STRUCT_ORIENTS, STRUCT_DIRECTIONS,
} from '../../server/net/encode.js'

function makeState() {
  return {
    tick: 1234,
    placedVersion: 7,
    hall: { hp: 640.2 },
    players: [
      { id: 1, x: 100.4, y: 200.6, hp: 80, flags: 0 },
      { id: 2, x: 50.0, y: 60.0, hp: 100, flags: 3 },
    ],
    // SoA enemy store (server/game/enemies.js). Plain arrays suffice for the
    // encoder — it reads count + the id/type/x/y/hp/flags slots by index.
    enemyStore: {
      count: 2,
      id:    [10, 11],
      type:  [0, 2],
      x:     [320.49, 400],
      y:     [64.51, 96],
      hp:    [12, 300],
      flags: [0, 1],
    },
    structures: [
      { id: 100, type: 1, gx: 5, gy: 6, w: 1, h: 1, orient: 'H', dir: null, hp: 40, phase: 0, phaseDeadline: 0, charge: 0, cycleSeq: 0 },
      { id: 101, type: 3, gx: 20, gy: 21, w: 1, h: 1, orient: 'V', dir: 'E', hp: 500, phase: 2, phaseDeadline: 1500, charge: 0.75, cycleSeq: 4, tx: 123.4, ty: 56.6 },
    ],
    fx: [{ type: 1, x: 10.7, y: 11.2 }],
  }
}

test('round-trip preserves state with quantized coords', () => {
  const s = makeState()
  const d = decodeSnapshot(encodeSnapshot(s, -1))
  assert.equal(d.tick, 1234)
  assert.equal(d.placedVersion, 7)
  assert.equal(d.hallHp, 641, 'hall hp round-trips as a ceil-int')
  assert.deepEqual(d.players[0], {
    id: 1, x: 100, y: 201, hp: 80, flags: 0, gold: 0,
    cdBasic: 0, cdSpecial: 0, cdSecond: 0,
  })
  assert.deepEqual(d.enemies[0], { id: 10, type: 0, x: 320, y: 65, hp: 12, flags: 0 })
  assert.deepEqual(d.enemies[1], { id: 11, type: 2, x: 400, y: 96, hp: 300, flags: 1 })
  assert.deepEqual(d.fx[0], { type: 1, x: 11, y: 11 })
  assert.deepEqual(d.structures, [
    { id: 100, type: 1, gx: 5, gy: 6, w: 1, h: 1, orient: 'H', dir: null },
    { id: 101, type: 3, gx: 20, gy: 21, w: 1, h: 1, orient: 'V', dir: 'E' },
  ])
  assert.deepEqual(d.structureState, [
    { id: 100, hp: 40, phase: 0, deadline: 0, charge: 0, cycle: 0, tx: 0, ty: 0, repairMs: 0 },
    { id: 101, hp: 500, phase: 2, deadline: 1500, charge: 0.75, cycle: 4, tx: 123, ty: 57, repairMs: 0 },
  ])
})

test('statics omitted when placedVersion matches lastSentPv', () => {
  const s = makeState()
  const d = decodeSnapshot(encodeSnapshot(s, 7))
  assert.equal(d.structures, undefined)
})

test('statics included again when placedVersion bumps', () => {
  const s = makeState()
  s.placedVersion = 8
  const d = decodeSnapshot(encodeSnapshot(s, 7))
  assert.equal(d.structures.length, 2)
})

test('fractional hp (burn DoT) encodes as ceil-int, never a long float, never 0 while alive', () => {
  const s = makeState()
  s.enemyStore.hp[0] = 0.4166666666666667
  s.players[0].hp = 79.99999999
  s.structures[0].hp = 39.5
  const str = encodeSnapshot(s, -1)
  assert.ok(!str.includes('.'), 'no floats anywhere on the wire')
  const d = decodeSnapshot(str)
  assert.equal(d.enemies[0].hp, 1, 'living enemy at 0.42 hp shows 1, not 0')
  assert.equal(d.players[0].hp, 80)
  assert.equal(d.structureState[0].hp, 40)
})

// --- Player gold on the wire -----------------------------------------------
// Gold rides the public per-player tuple as an appended 6th field (the encoder
// broadcasts ONE payload per emit — see the PROTOCOL DECISION note in
// encode.js — so there is no owner-only channel to hide it behind, and this is
// a co-op game where a teammate seeing your wallet is harmless).

test('gold round-trips per player, independently for each player', () => {
  const s = makeState()
  s.players[0].gold = 17
  s.players[1].gold = 4
  const d = decodeSnapshot(encodeSnapshot(s, -1))
  assert.equal(d.players[0].gold, 17)
  assert.equal(d.players[1].gold, 4)
})

test('gold defaults to 0 for a player with no wallet (bots) and never wires a float', () => {
  const s = makeState()
  delete s.players[0].gold
  s.players[1].gold = 12.7
  const str = encodeSnapshot(s, -1)
  assert.ok(!str.includes('.'), 'no floats anywhere on the wire')
  const d = decodeSnapshot(str)
  assert.equal(d.players[0].gold, 0)
  assert.equal(d.players[1].gold, 12, 'fractional gold quantizes, it does not leak a float')
})

test('a legacy 5-field player tuple decodes with gold 0 rather than undefined', () => {
  const s = makeState()
  const raw = JSON.parse(encodeSnapshot(s, -1))
  raw.p = raw.p.map(t => t.slice(0, 5))
  const d = decodeSnapshot(JSON.stringify(raw))
  assert.equal(d.players[0].gold, 0)
  assert.equal(d.players[0].hp, 80, 'the legacy prefix still decodes')
})

// --- Player ability cooldowns on the wire -----------------------------------
// Appended after `gold` (fields 7/8/9) under the same append-only discipline.
// They ride as REMAINING MILLISECONDS, not the server's absolute readyAt
// timestamps, which are performance.now() values meaningless to a client.

test('ability cooldowns round-trip as remaining-ms, per player and per slot', () => {
  const s = makeState()
  const now = performance.now()
  s.players[0].basicReadyAt = now + 700
  s.players[0].specialReadyAt = now + 5000
  s.players[0].secondReadyAt = now + 9000
  const d = decodeSnapshot(encodeSnapshot(s, -1))
  // Encoding takes a nonzero moment, so assert a tight band, not equality.
  assert.ok(d.players[0].cdBasic > 600 && d.players[0].cdBasic <= 700, `got ${d.players[0].cdBasic}`)
  assert.ok(d.players[0].cdSpecial > 4900 && d.players[0].cdSpecial <= 5000)
  assert.ok(d.players[0].cdSecond > 8900 && d.players[0].cdSecond <= 9000)
  assert.equal(d.players[1].cdBasic, 0, 'a player who never cast reads ready')
})

test('an already-elapsed cooldown wires 0 (ready), never a negative', () => {
  const s = makeState()
  s.players[0].basicReadyAt = performance.now() - 5000
  s.players[0].specialReadyAt = 0
  const raw = JSON.parse(encodeSnapshot(s, -1))
  for (const t of raw.p) {
    for (const v of t.slice(6)) assert.ok(v >= 0, `negative cooldown on the wire: ${v}`)
  }
  const d = decodeSnapshot(JSON.stringify(raw))
  assert.equal(d.players[0].cdBasic, 0)
  assert.equal(d.players[0].cdSpecial, 0)
})

test('cooldowns never wire a float', () => {
  const s = makeState()
  s.players[0].basicReadyAt = performance.now() + 700.6
  const str = encodeSnapshot(s, -1)
  assert.ok(!str.includes('.'), 'no floats anywhere on the wire')
})

test('a legacy 6-field player tuple decodes with cooldowns 0 rather than undefined', () => {
  const s = makeState()
  s.players[0].gold = 17
  const raw = JSON.parse(encodeSnapshot(s, -1))
  raw.p = raw.p.map(t => t.slice(0, 6))
  const d = decodeSnapshot(JSON.stringify(raw))
  assert.equal(d.players[0].cdBasic, 0)
  assert.equal(d.players[0].cdSpecial, 0)
  assert.equal(d.players[0].cdSecond, 0)
  assert.equal(d.players[0].gold, 17, 'the gold-era prefix still decodes')
  assert.equal(d.players[0].hp, 80, 'the legacy prefix still decodes')
})

test('the player tuple keeps its [id,x,y,hp,flags,gold] prefix before the cooldowns', () => {
  const s = makeState()
  s.players[0].gold = 17
  s.players[0].basicReadyAt = performance.now() + 700
  const raw = JSON.parse(encodeSnapshot(s, -1))
  const t = raw.p[0]
  assert.equal(t.length, 9, 'six legacy fields plus three cooldowns')
  assert.equal(t[3], 80, 'hp still at index 3')
  assert.equal(t[5], 17, 'gold still at index 5')
  assert.ok(t[6] > 600 && t[6] <= 700, 'cooldowns start at index 6')
})

// --- Task 8: static/dynamic structure wire channels -------------------------

test('dynamic structure state (ds) rides every snapshot even when statics are omitted', () => {
  const s = makeState()
  s.structures[0].hp = 12
  const d = decodeSnapshot(encodeSnapshot(s, 7))  // pv unchanged -> no static resend
  assert.equal(d.structures, undefined, 'no full static resend for a plain hp change')
  assert.equal(d.structureState.length, 2)
  assert.equal(d.structureState[0].hp, 12, 'hp staleness resolved through ds, not a static resend')
})

test('orientation and direction round-trip through the append-only wire ABI', () => {
  assert.deepEqual(STRUCT_ORIENTS, ['H', 'V'])
  const s = makeState()
  const d = decodeSnapshot(encodeSnapshot(s, -1))
  assert.equal(d.structures[0].orient, 'H')
  assert.equal(d.structures[0].dir, null, 'non-directional structure has no direction')
  assert.equal(d.structures[1].orient, 'V')
  assert.equal(d.structures[1].dir, 'E')
  for (const dir of STRUCT_DIRECTIONS) {
    s.structures[0].dir = dir
    const dd = decodeSnapshot(encodeSnapshot(s, -1))
    assert.equal(dd.structures[0].dir, dir)
  }
})

test('phase, deadline, charge, and cycle sequence round-trip as quantized ints (no floats on the wire)', () => {
  const s = makeState()
  s.structures[1].phaseDeadline = 2345.6
  s.structures[1].charge = 0.333
  const str = encodeSnapshot(s, -1)
  assert.ok(!str.includes('.'), 'no floats anywhere on the wire')
  const d = decodeSnapshot(str)
  assert.equal(d.structureState[1].deadline, 2346)
  assert.ok(Math.abs(d.structureState[1].charge - 0.33) < 0.01)
  assert.equal(d.structureState[1].cycle, 4)
})

test('missing orientation/direction/phase/charge/cycle fields default sanely (compatibility)', () => {
  const s = makeState()
  s.structures = [{ id: 200, type: 1, gx: 0, gy: 0, w: 1, h: 1, hp: 10 }]
  const d = decodeSnapshot(encodeSnapshot(s, -1))
  assert.deepEqual(d.structures[0], { id: 200, type: 1, gx: 0, gy: 0, w: 1, h: 1, orient: 'H', dir: null })
  assert.deepEqual(d.structureState[0], { id: 200, hp: 10, phase: 0, deadline: 0, charge: 0, cycle: 0, tx: 0, ty: 0, repairMs: 0 })
})

// Gate 4 finding: the `s` tuple must keep the pre-Task-8 `[id,type,gx,gy,hp,
// w,h]` PREFIX so a decoder/replay built against that shape doesn't silently
// misread hp as w or w as h — genuinely new fields (orient, dir) are appended
// after the legacy 7, not inserted before them.
test('the s tuple keeps the legacy [id,type,gx,gy,hp,w,h] prefix before orient/dir (Gate 4 ABI finding)', () => {
  const s = makeState()
  const raw = JSON.parse(encodeSnapshot(s, -1))
  assert.deepEqual(raw.s[0], [100, 1, 5, 6, 40, 1, 1, 0, -1])
  assert.deepEqual(raw.s[1], [101, 3, 20, 21, 500, 1, 1, 1, 1])
})

// Gate 4 finding: a genuinely truncated ds record (not just an omitted
// server-side field re-encoded through the current encoder) must decode
// with safe defaults, not undefined/NaN.
test('a truncated ds record decodes with safe defaults, not NaN/undefined (Gate 4 finding)', () => {
  const raw = { t: 1, pv: 1, hh: 100, lv: 1, p: [], e: [], pr: [], fx: [], atk: [], ds: [[300, 25]] }
  const d = decodeSnapshot(JSON.stringify(raw))
  assert.deepEqual(d.structureState[0], { id: 300, hp: 25, phase: 0, deadline: 0, charge: 0, cycle: 0, tx: 0, ty: 0, repairMs: 0 })
})

test('hall hp never encodes negative — clamped to 0 on the wire (CP2 L1)', () => {
  const s = makeState()
  s.hall.hp = -12.5
  assert.equal(decodeSnapshot(encodeSnapshot(s, -1)).hallHp, 0)
})

test('fx capped per type per emit', () => {
  const s = makeState()
  s.fx = []
  for (let i = 0; i < 30; i++) s.fx.push({ type: 1, x: i, y: i })
  for (let i = 0; i < 3; i++) s.fx.push({ type: 2, x: i, y: i })
  const d = decodeSnapshot(encodeSnapshot(s, -1))
  assert.equal(d.fx.filter(f => f.type === 1).length, FX_CAP_PER_TYPE)
  assert.equal(d.fx.filter(f => f.type === 2).length, 3)
})

// --- Phase 4 wire extensions -------------------------------------------------

test('team level rides every snapshot (default 1 when absent)', () => {
  const s = makeState()
  s.teamLevel = 3
  assert.equal(decodeSnapshot(encodeSnapshot(s, -1)).teamLevel, 3)
  const bare = makeState()
  assert.equal(decodeSnapshot(encodeSnapshot(bare, -1)).teamLevel, 1)
})

test('projectiles ride as a flat quantized array and round-trip', () => {
  const s = makeState()
  s.projectiles = [
    { id: 5, type: 'FIREBALL', x: 123.6, y: 45.4 },
    { id: 6, type: 'FIREBALL', x: 900, y: 700 },
  ]
  const str = encodeSnapshot(s, -1)
  assert.ok(!str.includes('.'), 'projectile coords quantized — no floats on the wire')
  const d = decodeSnapshot(str)
  assert.deepEqual(d.projectiles, [
    { id: 5, type: 'FIREBALL', x: 124, y: 45 },
    { id: 6, type: 'FIREBALL', x: 900, y: 700 },
  ])
})

test('FAN_BLADE is appended to the projectile wire ABI without disturbing FIREBALL\'s index (Task 5)', () => {
  assert.deepEqual(PROJECTILE_TYPES, ['FIREBALL', 'FAN_BLADE', 'FIRESTORM_BOLT'], 'append-only — old index 0 (FIREBALL) is preserved')
  const s = makeState()
  s.projectiles = [
    { id: 5, type: 'FIREBALL', x: 100, y: 100 },
    { id: 6, type: 'FAN_BLADE', x: 200, y: 200 },
  ]
  const d = decodeSnapshot(encodeSnapshot(s, -1))
  assert.deepEqual(d.projectiles, [
    { id: 5, type: 'FIREBALL', x: 100, y: 100 },
    { id: 6, type: 'FAN_BLADE', x: 200, y: 200 },
  ])
})

test('fx events carry an optional value (floating combat text amounts)', () => {
  const s = makeState()
  s.fx = [
    { type: 'dmg', x: 10, y: 20, v: 22 },
    { type: 'boom', x: 30, y: 40 },
  ]
  const d = decodeSnapshot(encodeSnapshot(s, -1))
  assert.deepEqual(d.fx[0], { type: 'dmg', x: 10, y: 20, v: 22 })
  assert.deepEqual(d.fx[1], { type: 'boom', x: 30, y: 40 })
})

// --- Task 7: attack presentation events ------------------------------------

test('attack events carry source id, kind, position, aim, and sequence', () => {
  const s = makeState()
  s.atkFx = [{ srcId: 1, kind: 'EARTH_CONE', x: 100.4, y: 200.6, aimX: 0.707, aimY: -0.707, seq: 5 }]
  const d = decodeSnapshot(encodeSnapshot(s, -1))
  assert.deepEqual(d.atk, [{ srcId: 1, kind: 'EARTH_CONE', x: 100, y: 201, aimX: 0.71, aimY: -0.71, seq: 5 }])
})

test('every attack kind round-trips through the ATTACK_KINDS wire ABI', () => {
  const s = makeState()
  s.atkFx = ATTACK_KINDS.map((kind, i) => ({ srcId: i, kind, x: 0, y: 0, aimX: 1, aimY: 0, seq: 1 }))
  const d = decodeSnapshot(encodeSnapshot(s, -1))
  assert.deepEqual(d.atk.map(a => a.kind), ATTACK_KINDS)
})

test('attack events absent entirely when no attacks occurred this emit', () => {
  const s = makeState()
  const d = decodeSnapshot(encodeSnapshot(s, -1))
  assert.deepEqual(d.atk, [])
})

test('attack events are capped per KIND (FX-family cap) — one class spamming casts cannot starve another\'s telegraph', () => {
  const s = makeState()
  s.atkFx = []
  for (let i = 0; i < 30; i++) s.atkFx.push({ srcId: 1, kind: 'EARTH_CONE', x: 0, y: 0, aimX: 1, aimY: 0, seq: i })
  for (let i = 0; i < 3; i++) s.atkFx.push({ srcId: 2, kind: 'WIND_WINDUP', x: 0, y: 0, aimX: 1, aimY: 0, seq: i })
  const d = decodeSnapshot(encodeSnapshot(s, -1))
  assert.equal(d.atk.filter(a => a.kind === 'EARTH_CONE').length, FX_CAP_PER_TYPE)
  assert.equal(d.atk.filter(a => a.kind === 'WIND_WINDUP').length, 3)
})

// Multi-tile footprints: the client renders and hit-tests structures from the
// snapshot alone, so w/h have to be on the wire. Without them a 2x1 Firepit
// draws as one tile and a click on its far tile hits nothing.
test('a structure carries its footprint on the wire', () => {
  const s = makeState()
  s.structures[0].w = 2
  s.structures[0].h = 1
  const d = decodeSnapshot(encodeSnapshot(s, -1))
  assert.equal(d.structures[0].w, 2)
  assert.equal(d.structures[0].h, 1)
})
