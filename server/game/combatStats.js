// Source-tagged combat accounting (Phase 8C Task 3, first increment).
//
// Opt-in, following the state.tickOrderLog / state.aoeStats idiom already used
// by tick.js and towers.js: `state.combatStats` is undefined during normal
// play and in every existing test, and every record* function below no-ops in
// that case — instrumentation cannot change simulation behavior. The harness
// (matchRunner.js) is the only caller that ever creates one.
//
// SCOPE OF THIS INCREMENT: damage/hits/kills/unique-targets for all three
// categories (basic, ability, structure), plus attempts/misses/useful-
// activation for basic and ability, whose casts are discrete per-cooldown
// events. Structure offense is either an automatic point-target lock (no
// meaningful "miss" — see towers.js tickTowers) or a continuous area field (no
// discrete "attempt" — see tickArea, which already has its own occupancy
// instrument in state.aoeStats), so attempts/misses are not tracked for it
// here. CC-seconds, cooldown utilization, displacement progress and peak-
// active-effects are the declared remainder of Task 3 and are NOT covered by
// this file — see the program plan checklist.
//
// Damage with no meta (burn DoT, applied from a status object that carries no
// caster/category) still lands on the enemy as before but is not counted
// here. "Reconciles" therefore means the instrumented totals are internally
// consistent — categories sum to totalDamage, owners sum to their category —
// not that totalDamage equals every point of damage the enemy ever took.
//
// SCOPE OF TASK 3B (this increment adds CC-seconds and displacement to the
// above; cooldown utilization and peak-active-effects are computed entirely
// in matchRunner.js from data this module and the engine already expose, per
// the program plan design note — no further engine hook needed for those two).
//
// CC-seconds is POPULATION-WIDE, not per-source: the per-enemy status object
// (status.js) carries no caster reference, so a root/freeze cannot be
// attributed to the ability/tower that applied it without a larger
// status-object change that is out of scope here (see enemies.js's hook site
// for the full reasoning). It is a boolean per-tick gate (enemy is
// rooted-or-frozen this tick → the whole tick's dtSec counts), the same
// granularity as state.aoeStats.enemySeconds — not a sub-tick fraction.
//
// Displacement is an IMPULSE proxy, not a measured travel distance: the
// actual pixels an enemy moves from a knockback depend on velocity decay,
// the per-tick MAX_STEP_PX clamp, and whatever the flow field wanted to do
// that same tick (enemyMove.js) — none of which is attributable to a single
// source once multiple effects overlap. What IS attributable per source is
// the weight-scaled impulse magnitude applyKnockback actually applied
// (KB_WEIGHT_SCALE[weightTier] * power, in px/s); that is what byCategory/
// byOwner `.displacement` accumulates. Comparable across sources and
// additive per hit, but do not read it as "pixels traveled."

function newBucket() {
  return {
    damage: 0, attempts: 0, hits: 0, misses: 0, useful: 0, kills: 0,
    displacement: 0, targets: new Set(),
  }
}

export function createCombatStats() {
  return {
    totalDamage: 0,
    totalDisplacement: 0,
    ccSeconds: 0,
    // Steam Vent confusion is a soft CC — it steers rather than immobilizing —
    // so it is counted separately from ccSeconds rather than folded into it.
    // Its real job is coverage: a hang gate for a confusion structure that
    // cannot show any enemy was ever confused proves nothing about the failure
    // mode it exists to rule out (Task 16 review, finding F4).
    confusedSeconds: 0,
    // The same coverage axis for the SOFT-CC-BY-SLOW case, added 2026-08-15 when
    // Steam Vent's confusion was replaced by a strong slow. Slow is deliberately
    // NOT folded into ccSeconds, which counts only hard CC (root/freeze) — an
    // enemy that is merely slowed is still advancing. Its job here is identical
    // to confusedSeconds': a gate for a status structure that cannot show any
    // enemy was ever affected proves nothing about the failure mode it exists to
    // rule out (Task 16 review, finding F4).
    slowedSeconds: 0,
    byCategory: { basic: newBucket(), ability: newBucket(), structure: newBucket() },
    byOwner: new Map(),
    deathsByClass: {},
  }
}

function ownerBucket(cs, category, ownerId) {
  const key = `${category}:${ownerId}`
  let b = cs.byOwner.get(key)
  if (!b) { b = newBucket(); b.category = category; b.ownerId = ownerId; cs.byOwner.set(key, b) }
  return b
}

export function recordAttempt(state, category, ownerId) {
  const cs = state.combatStats
  if (!cs) return
  cs.byCategory[category].attempts++
  ownerBucket(cs, category, ownerId).attempts++
}

export function recordMiss(state, category, ownerId) {
  const cs = state.combatStats
  if (!cs) return
  cs.byCategory[category].misses++
  ownerBucket(cs, category, ownerId).misses++
}

export function recordUseful(state, category, ownerId) {
  const cs = state.combatStats
  if (!cs) return
  cs.byCategory[category].useful++
  ownerBucket(cs, category, ownerId).useful++
}

// Hits already attributed to this owner in this category — used by callers
// (abilities.js) to tell an attempt that connected from one that didn't,
// without threading a hit-count out of the per-element switch-case bodies.
export function hitsSoFar(state, category, ownerId) {
  const cs = state.combatStats
  if (!cs) return 0
  return cs.byOwner.get(`${category}:${ownerId}`)?.hits ?? 0
}

// Called from enemies.js damageEnemy — the single choke point every damage
// source already passes through, so this is the only place a hit or a kill is
// ever recorded.
export function recordDamage(state, meta, amount, targetId) {
  const cs = state.combatStats
  if (!cs || !meta) return
  const { category, ownerId } = meta
  cs.totalDamage += amount
  const cat = cs.byCategory[category]
  cat.damage += amount; cat.hits++; cat.targets.add(targetId)
  const ob = ownerBucket(cs, category, ownerId)
  ob.damage += amount; ob.hits++; ob.targets.add(targetId)
}

// Population-wide hard-CC accounting — see the header note above for why
// this cannot be attributed to a source. Called from enemies.js once per
// enemy per tick when that enemy is rooted or frozen.
export function recordCC(state, dtSec) {
  const cs = state.combatStats
  if (!cs) return
  cs.ccSeconds += dtSec
}

// Same population-wide, opt-in shape as recordCC, for the soft-CC axis.
export function recordConfusion(state, dtSec) {
  const cs = state.combatStats
  if (!cs) return
  cs.confusedSeconds += dtSec
}

// Same shape again, for slow. See the field note in createCombatStats.
export function recordSlow(state, dtSec) {
  const cs = state.combatStats
  if (!cs) return
  cs.slowedSeconds += dtSec
}

// Weight-scaled knockback impulse actually applied (see the header note on
// why this is a proxy, not a measured travel distance).
export function recordDisplacement(state, meta, magnitude) {
  const cs = state.combatStats
  if (!cs || !meta || magnitude <= 0) return
  const { category, ownerId } = meta
  cs.totalDisplacement += magnitude
  cs.byCategory[category].displacement += magnitude
  ownerBucket(cs, category, ownerId).displacement += magnitude
}

export function recordKill(state, meta) {
  const cs = state.combatStats
  if (!cs || !meta) return
  const { category, ownerId, label } = meta
  cs.byCategory[category].kills++
  ownerBucket(cs, category, ownerId).kills++
  if (label) cs.deathsByClass[label] = (cs.deathsByClass[label] || 0) + 1
}

// Plain-object snapshot for a metrics report: Sets/Maps don't assert.deepEqual
// or JSON-serialize cleanly, so callers get a target COUNT, not the Set.
export function snapshotCombatStats(cs) {
  const cat = k => ({ ...cs.byCategory[k], targets: cs.byCategory[k].targets.size })
  return {
    totalDamage: cs.totalDamage,
    totalDisplacement: cs.totalDisplacement,
    ccSeconds: cs.ccSeconds,
    confusedSeconds: cs.confusedSeconds,
    slowedSeconds: cs.slowedSeconds,
    byCategory: { basic: cat('basic'), ability: cat('ability'), structure: cat('structure') },
    byOwner: [...cs.byOwner.values()].map(b => ({ ...b, targets: b.targets.size })),
    deathsByClass: { ...cs.deathsByClass },
  }
}

export function snapshotCategoryDamage(cs) {
  return {
    basic: cs.byCategory.basic.damage,
    ability: cs.byCategory.ability.damage,
    structure: cs.byCategory.structure.damage,
  }
}
