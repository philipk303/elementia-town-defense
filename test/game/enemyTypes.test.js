import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ENEMY_TYPE, WEIGHT, SPEED,
  baseProfile, eliteProfile,
  displacementImmune, slowRootImmune,
  FLAG, statusFlags,
} from '../../server/game/enemyTypes.js'

// --- roster (spec §4 enemy table) --------------------------------------------

test('base roster maps each type to its weight/speed tiers', () => {
  assert.deepEqual(baseProfile(ENEMY_TYPE.GOBLIN), { weight: WEIGHT.LIGHT,  speed: SPEED.FAST })
  assert.deepEqual(baseProfile(ENEMY_TYPE.ORC),    { weight: WEIGHT.MEDIUM, speed: SPEED.MEDIUM })
  assert.deepEqual(baseProfile(ENEMY_TYPE.TROLL),  { weight: WEIGHT.HEAVY,  speed: SPEED.SLOW })
})

// --- elite modifier + counter-triangle (spec §4 Elite table) -----------------

test('elite bumps weight one tier and applies the counter-triangle speeds', () => {
  // Elite Goblin: medium weight, super-fast → immune slow/root, displaceable.
  assert.deepEqual(eliteProfile(ENEMY_TYPE.GOBLIN), { weight: WEIGHT.MEDIUM,      speed: SPEED.SUPER_FAST })
  // Elite Orc: heavy + fast → resists both, immune to neither (hardest).
  assert.deepEqual(eliteProfile(ENEMY_TYPE.ORC),    { weight: WEIGHT.HEAVY,       speed: SPEED.FAST })
  // Elite Troll: super-heavy, slow → immune displacement, rootable.
  assert.deepEqual(eliteProfile(ENEMY_TYPE.TROLL),  { weight: WEIGHT.SUPER_HEAVY, speed: SPEED.SLOW })
})

test('elite weight is always exactly one tier above the base', () => {
  for (const t of [ENEMY_TYPE.GOBLIN, ENEMY_TYPE.ORC, ENEMY_TYPE.TROLL]) {
    assert.equal(eliteProfile(t).weight, baseProfile(t).weight + 1)
  }
})

// --- immunity helpers --------------------------------------------------------

test('super-heavy weight is displacement-immune; nothing lighter is', () => {
  assert.equal(displacementImmune(WEIGHT.SUPER_HEAVY), true)
  assert.equal(displacementImmune(WEIGHT.HEAVY), false)
  assert.equal(displacementImmune(WEIGHT.LIGHT), false)
})

test('super-fast speed is slow/root-immune; nothing slower is', () => {
  assert.equal(slowRootImmune(SPEED.SUPER_FAST), true)
  assert.equal(slowRootImmune(SPEED.FAST), false)
  assert.equal(slowRootImmune(SPEED.SLOW), false)
})

test('the counter-triangle: exactly one elite is CC-immune on each axis, the Orc on neither', () => {
  const eg = eliteProfile(ENEMY_TYPE.GOBLIN)
  const eo = eliteProfile(ENEMY_TYPE.ORC)
  const et = eliteProfile(ENEMY_TYPE.TROLL)
  // Goblin: displaceable but slow/root-immune.
  assert.equal(displacementImmune(eg.weight), false)
  assert.equal(slowRootImmune(eg.speed), true)
  // Troll: displacement-immune but rootable.
  assert.equal(displacementImmune(et.weight), true)
  assert.equal(slowRootImmune(et.speed), false)
  // Orc: immune to neither (the hardest).
  assert.equal(displacementImmune(eo.weight), false)
  assert.equal(slowRootImmune(eo.speed), false)
})

// --- wire flag bits ----------------------------------------------------------

test('flag bits are distinct single-bit masks', () => {
  const bits = [FLAG.ELITE, FLAG.BURN, FLAG.WET, FLAG.SLOW, FLAG.ROOT, FLAG.FREEZE, FLAG.AGGRO]
  for (const b of bits) assert.equal(b & (b - 1), 0, `${b} is not a single bit`)
  assert.equal(new Set(bits).size, bits.length, 'all flag bits are distinct')
})

test('statusFlags packs active statuses into the wire bitfield', () => {
  // elite troll, burning and rooted, aggro'd.
  const f = statusFlags({ elite: true, burn: true, root: true, aggro: true })
  assert.equal(f & FLAG.ELITE, FLAG.ELITE)
  assert.equal(f & FLAG.BURN, FLAG.BURN)
  assert.equal(f & FLAG.ROOT, FLAG.ROOT)
  assert.equal(f & FLAG.AGGRO, FLAG.AGGRO)
  assert.equal(f & FLAG.WET, 0)
  assert.equal(f & FLAG.SLOW, 0)
  assert.equal(f & FLAG.FREEZE, 0)
})
