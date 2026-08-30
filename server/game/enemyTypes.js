// Enemy roster + the CC counter-triangle (spec §4). Structural data shared by
// server sim and client render — NOT balance magnitudes (those live in
// shared/balance.js). Weight tiers index KB_WEIGHT_SCALE in enemyMove.js
// (light/medium/heavy/super-heavy); speed tiers add a super-fast tier that is
// immune to slow/root. The elite modifier bumps weight one tier and re-points
// speed per the counter-triangle so exactly one elite is CC-immune on each axis
// and the Elite Orc is immune to neither (the hardest — one sentence teaches it).

export const ENEMY_TYPE = { GOBLIN: 0, ORC: 1, TROLL: 2 }

// Weight tiers — MUST stay aligned with enemyMove.KB_WEIGHT_SCALE indices.
export const WEIGHT = { LIGHT: 0, MEDIUM: 1, HEAVY: 2, SUPER_HEAVY: 3 }
// Speed tiers — SUPER_FAST is the slow/root-immune tier.
export const SPEED  = { SLOW: 0, MEDIUM: 1, FAST: 2, SUPER_FAST: 3 }

const BASE = {
  [ENEMY_TYPE.GOBLIN]: { weight: WEIGHT.LIGHT,  speed: SPEED.FAST },
  [ENEMY_TYPE.ORC]:    { weight: WEIGHT.MEDIUM, speed: SPEED.MEDIUM },
  [ENEMY_TYPE.TROLL]:  { weight: WEIGHT.HEAVY,  speed: SPEED.SLOW },
}

// Elite speed re-point (weight is always base+1). Goblin fast→super-fast,
// Orc medium→fast, Troll stays slow (its identity is the immovable siege unit).
const ELITE_SPEED = {
  [ENEMY_TYPE.GOBLIN]: SPEED.SUPER_FAST,
  [ENEMY_TYPE.ORC]:    SPEED.FAST,
  [ENEMY_TYPE.TROLL]:  SPEED.SLOW,
}

export function baseProfile(type)  { return BASE[type] }
export function eliteProfile(type) {
  return { weight: BASE[type].weight + 1, speed: ELITE_SPEED[type] }
}

export function displacementImmune(weightTier) { return weightTier === WEIGHT.SUPER_HEAVY }
export function slowRootImmune(speedTier)       { return speedTier === SPEED.SUPER_FAST }

// Wire flag bits packed into the packed-encoder's per-enemy `flags` field.
// Bit 0 = elite (encode.test.js already reads flags:1 as the elite troll);
// the rest are status overlays the client renders (Phase 4/7 visuals).
export const FLAG = {
  ELITE:  1 << 0,
  BURN:   1 << 1,
  WET:    1 << 2,
  SLOW:   1 << 3,
  ROOT:   1 << 4,
  FREEZE: 1 << 5,
  AGGRO:  1 << 6,
  // Steam Vent confusion (§6.1): "serialize a confusion flag, not internal
  // heading and timers". Appended, so every existing bit keeps its position —
  // the flags field is wire ABI.
  CONFUSED: 1 << 7,
}

export function statusFlags({ elite, burn, wet, slow, root, freeze, aggro, confused } = {}) {
  let f = 0
  if (elite)  f |= FLAG.ELITE
  if (burn)   f |= FLAG.BURN
  if (wet)    f |= FLAG.WET
  if (slow)   f |= FLAG.SLOW
  if (root)   f |= FLAG.ROOT
  if (freeze) f |= FLAG.FREEZE
  if (aggro)  f |= FLAG.AGGRO
  if (confused) f |= FLAG.CONFUSED
  return f
}
