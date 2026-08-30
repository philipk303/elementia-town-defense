// ROCK TRAP (redesign §5.2, Task 11) — the telegraph half of the "ready/
// target/impact/cooldown" family (spec §3 family 2). Watchtower and Water
// Geyser also belong to that family but resolve instantly on selection; Rock
// Trap is the one member that needs an actual telegraph delay between
// selection and resolution, so that delay — plus the locked-point resolution
// Amendment C.2 requires — lives here rather than duplicated into towers.js.
//
// Cycle: idle -> (highest-HP target found in range) -> armed, locking BOTH
// the target's stable ID and its current world position -> telegraphMs later,
// resolve at the locked point -> cooldownMs before the next selection. The
// whole armed+cooldown span is one `attackReadyAt` gate, so "one activation
// per cooldown" (spec verification) holds by construction: a new target can't
// be selected while a previous one is still telegraphing.
//
// Amendment C.2 (2026-07-29) supersedes "resolve at the target's impact-time
// position" — this deliberately does NOT re-track the target after telegraph
// start. If the locked target has walked outside splash radius of the locked
// point by impact time, it takes no primary hit; splash still resolves at the
// point regardless. That is the named trade: a telegraph a fast enemy can
// actually walk out of.
//
// Wire mirroring (Codex Gate 5 finding, 2026-08-01): tiState/tiX/tiY/
// tiImpactAt are this module's own field names, but a client needs the
// locked world point and the resolve deadline to draw the telegraph
// (Amendment C.2's whole point is that it is NOT the structure's center).
// Rather than inventing a Rock-Trap-specific wire channel, this mirrors
// armed/idle onto the SAME generic phase/phaseDeadline/cycleSeq fields
// encode.js already sends for every structure (Task 8), plus two new
// generic `tx`/`ty` fields for the locked point — one shared contract for
// every current and future target-impact/phase-machine structure, not a
// one-off. tiState/tiImpactAt remain the actual resolution logic below;
// phase/phaseDeadline/tx/ty/cycleSeq are presentation mirrors only.
//
// BLIZZARD (redesign §6.5, Amendment C.3, Task 14) joins this family
// sharing the same idle -> armed -> resolve -> cooldown timing skeleton and
// wire mirror, but with a different selection AND resolution: `spec.select
// === 'denseCluster'` swaps highest-maxHp selection for densest-hittable-
// cluster selection (selectDensestClusterCenter), and `spec.resolve ===
// 'uniform'` swaps the primary+splash resolution for one flat AoE — every
// enemy within clusterRadiusPx of the locked point takes the same damage and
// freeze, no primary/splash distinction. Amendment C.3 supersedes "lock the
// target's ID and re-center on impact-time position" for Blizzard the same
// way C.2 did for Rock Trap: the locked point is a world point, not a
// tracked target, so there is no target-invalidation case to handle at all.

import { damageEnemy } from '../enemies.js'
import { applyFreeze } from '../status.js'

function idxOfId(store, id) {
  for (let i = 0; i < store.count; i++) if (store.id[i] === id) return i
  return -1
}

// Highest max-HP enemy within `rangePx` of (cx,cy). Ties break by distance
// then ascending stable ID (same convention as towers.js's nearestInRange),
// so the pick is deterministic regardless of live-array scan order.
function selectHighestMaxHp(store, cx, cy, rangePx) {
  const r2 = rangePx * rangePx
  let best = -1, bestHp = -Infinity, bestD2 = Infinity, bestId = Infinity
  for (let i = 0; i < store.count; i++) {
    const dx = store.x[i] - cx, dy = store.y[i] - cy
    const d2 = dx * dx + dy * dy
    if (d2 > r2) continue
    const hp = store.maxHp[i]
    const id = store.id[i]
    if (hp > bestHp || (hp === bestHp && (d2 < bestD2 || (d2 === bestD2 && id < bestId)))) {
      best = i; bestHp = hp; bestD2 = d2; bestId = id
    }
  }
  return best
}

// Resolve at the locked point. Candidate IDs are captured up front, then each
// hit re-resolves its live index right before damaging it (mirrors
// basicAttacks.js's Earth cone) — a kill mid-resolution swap-removes and
// reorders slots, so a stale index could misdirect or skip a later hit. The
// primary target is excluded from the splash list so it is never double-hit.
function resolveImpact(state, s, spec) {
  const store = state.enemyStore
  const meta = { category: 'structure', ownerId: s.id, label: s.type }
  const r2 = spec.splashRadiusPx * spec.splashRadiusPx

  const splashIds = []
  let primaryPresent = false
  for (let i = 0; i < store.count; i++) {
    const dx = store.x[i] - s.tiX, dy = store.y[i] - s.tiY
    if (dx * dx + dy * dy > r2) continue
    if (store.id[i] === s.tiTargetId) { primaryPresent = true; continue }
    splashIds.push(store.id[i])
  }

  if (primaryPresent) {
    const i = idxOfId(store, s.tiTargetId)
    if (i !== -1) damageEnemy(state, i, spec.damage, meta)
  }
  for (const id of splashIds) {
    const i = idxOfId(store, id)
    if (i !== -1) damageEnemy(state, i, spec.splashDamage, meta)
  }
}

// Densest-cluster selection (spec §6.5, Amendment C.3): for each candidate
// within acquisitionRangePx of center, count how many enemies (including
// itself) sit within clusterRadiusPx of THAT candidate's position. The
// largest cluster wins; ties break by distance to center then ascending
// stable ID, same convention as selectHighestMaxHp. Returns the winning
// candidate's world POINT, not its id — Amendment C.3 locks a point, not a
// tracked target.
function selectDensestClusterCenter(store, cx, cy, acquisitionRangePx, clusterRadiusPx) {
  const acq2 = acquisitionRangePx * acquisitionRangePx
  const cr2 = clusterRadiusPx * clusterRadiusPx
  let found = false, bestX = 0, bestY = 0, bestSize = -1, bestD2 = Infinity, bestId = Infinity
  for (let i = 0; i < store.count; i++) {
    const dx = store.x[i] - cx, dy = store.y[i] - cy
    const d2 = dx * dx + dy * dy
    if (d2 > acq2) continue
    let size = 0
    for (let j = 0; j < store.count; j++) {
      const jdx = store.x[j] - store.x[i], jdy = store.y[j] - store.y[i]
      if (jdx * jdx + jdy * jdy <= cr2) size++
    }
    const id = store.id[i]
    if (size > bestSize || (size === bestSize && (d2 < bestD2 || (d2 === bestD2 && id < bestId)))) {
      found = true; bestSize = size; bestD2 = d2; bestId = id; bestX = store.x[i]; bestY = store.y[i]
    }
  }
  return found ? { x: bestX, y: bestY, size: bestSize } : null
}

// Uniform AoE resolution (Blizzard): every enemy within clusterRadiusPx of
// the locked point takes the same damage and freeze — no primary hit, no
// separate splash tier, so (unlike resolveImpact) there is no target id to
// exclude from a splash list at all.
function resolveUniformImpact(state, s, spec) {
  const store = state.enemyStore
  const meta = { category: 'structure', ownerId: s.id, label: s.type }
  const r2 = spec.clusterRadiusPx * spec.clusterRadiusPx

  const ids = []
  for (let i = 0; i < store.count; i++) {
    const dx = store.x[i] - s.tiX, dy = store.y[i] - s.tiY
    if (dx * dx + dy * dy > r2) continue
    ids.push(store.id[i])
  }
  let killed = 0, frozen = 0
  for (const id of ids) {
    const i = idxOfId(store, id)
    if (i === -1) continue
    if (damageEnemy(state, i, spec.damage, meta)) { killed++; continue }
    if (spec.freeze) {
      const wasFrozen = store.status[i].freezeMs > 0
      applyFreeze(store.status[i], spec.freeze.ms, store.speed[i])
      if (!wasFrozen && store.status[i].freezeMs > 0) state.fx.push({ type: 'freeze', x: store.x[i], y: store.y[i] })
      frozen++
    }
  }
  // Opt-in harness instrumentation, same convention as state.aoeStats: absent
  // in the shipped server, set only by a probe script. Records what the
  // mechanic ACTUALLY delivered per activation (cluster found at selection vs
  // bodies still in the circle at resolution) so a siting question can be
  // answered mechanically instead of only through terminal score.
  if (state.tiProbe) {
    const p = state.tiProbe
    p.activations++
    p.selectedSize += (s.tiProbeSize || 0)
    p.resolvedHits += ids.length
    p.killed += killed
    p.frozen += frozen
  }
}

// Mirror armed/idle onto the generic wire fields (see module note above).
function setArmedWireState(s) {
  s.phase = 1
  s.phaseDeadline = s.tiImpactAt
  s.tx = s.tiX
  s.ty = s.tiY
  s.cycleSeq = (s.cycleSeq | 0) + 1
}
function setIdleWireState(s) {
  s.phase = 0
  s.phaseDeadline = 0
}

// Called once per tick for a `spec.targetImpact` structure. `cx`/`cy` is the
// structure's world center (caller-computed, same convention as aura.js).
export function tickTargetImpact(state, s, spec, now, cx, cy) {
  if (s.tiState === 'armed') {
    if (now < s.tiImpactAt) return
    if (spec.resolve === 'uniform') resolveUniformImpact(state, s, spec)
    else resolveImpact(state, s, spec)
    s.tiState = 'idle'
    s.attackReadyAt = now + spec.cooldownMs
    setIdleWireState(s)
    return
  }

  if (now < (s.attackReadyAt || 0)) return
  const store = state.enemyStore

  if (spec.select === 'denseCluster') {
    const point = selectDensestClusterCenter(store, cx, cy, spec.rangePx, spec.clusterRadiusPx)
    if (!point) return
    s.tiTargetId = -1   // a locked point, not a tracked target (Amendment C.3)
    s.tiX = point.x
    s.tiY = point.y
    if (state.tiProbe) s.tiProbeSize = point.size
  } else {
    const idx = selectHighestMaxHp(store, cx, cy, spec.rangePx)
    if (idx === -1) return
    s.tiTargetId = store.id[idx]
    s.tiX = store.x[idx]
    s.tiY = store.y[idx]
  }

  s.tiState = 'armed'
  s.tiImpactAt = now + spec.telegraphMs
  setArmedWireState(s)
}
