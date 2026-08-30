// Packed snapshot encoder — Spike A / production.
//
// Design constraints (spec §5 "Network protocol"):
//   - Quantize all world coords to integers (px).
//   - Enemies as a single flat int array [id,type,x,y,hp,flags, ...] — no
//     per-enemy objects, no keyed maps.
//   - Static structures sent ONLY when placedVersion differs from what the
//     client last acked (change-versioned static data).
//   - fx capped server-side per type per emit (FX_CAP_PER_TYPE).
//
// HP is quantized with Math.ceil — fractional DoT damage (burn ticks) must
// never inflate the wire format with long floats, and a living enemy must
// never display as 0 hp. Authoritative float hp lives server-side only.
//
// PROTOCOL DECISION (broadcast vs per-client): the server encodes ONCE per
// emit against a server-side lastBroadcastPv and broadcasts to the room.
// Joining/reconnecting clients are sent one forced FULL snapshot
// (encodeSnapshot(state, -1)) directly, then ride the broadcast. There is no
// per-client ack tracking — a client that misses the full send re-requests it.
//
// encodeSnapshot(state, lastSentPv) → JSON string ready for socket emit.
// decodeSnapshot(str)              → plain object (test/client-side helper).

export const FX_CAP_PER_TYPE = 8
export const ENEMY_STRIDE = 6 // id, type, x, y, hp, flags
export const PROJECTILE_STRIDE = 4 // id, type, x, y

// Projectile wire type indices (Phase 4). Append-only — indices are wire ABI.
export const PROJECTILE_TYPES = ['FIREBALL', 'FAN_BLADE', 'FIRESTORM_BOLT']
const PROJECTILE_TYPE_INDEX = Object.fromEntries(PROJECTILE_TYPES.map((t, i) => [t, i]))

// Attack presentation event kinds (Task 7, staged combat redesign). Richer
// than generic fx — one per basic-attack cast, carrying enough for the
// client to draw the EXACT class shape instead of a generic flash: source
// id (whose attack), kind (which shape), position, aim, and a per-caster
// sequence number (so a client can tell two casts from the same player
// apart even if they land in the same 20 Hz emit). Append-only, same ABI
// discipline as PROJECTILE_TYPES.
// SPECIAL_CAST covers every element's Q/E ability alike (unlike the four
// basic kinds above, one per class's distinct shape) — the animation
// controller resolves the element from the CharacterAnimator's own atlasKey,
// not from the kind, so one shared kind is enough to drive a hero's special-
// cast animation from any element's Q or E.
export const ATTACK_KINDS = ['EARTH_CONE', 'WATER_REACH', 'FIRE_REACH', 'WIND_WINDUP', 'SPECIAL_CAST']
const ATTACK_KIND_INDEX = Object.fromEntries(ATTACK_KINDS.map((k, i) => [k, i]))
const ATK_AIM_SCALE = 100

// Structure wire channels (Task 8, staged combat redesign). Split into two
// payloads so a nonlethal HP/phase/charge/cycle change never forces a full
// static resend (which used to be the only way hp reached the client, and
// only fired on placedVersion bumps — i.e. never, for plain damage):
//   - `s`  static, versioned: placement geometry (id/type/gx/gy/w/h) plus
//     orientation/direction, sent only when placedVersion changes.
//   - `ds` dynamic, unversioned: hp/phase/deadline/charge/cycle/tx/ty, rides
//     every emit for every live structure, same as fx/atk. `tx`/`ty` (added
//     Task 12 remediation, Codex Gate 5) are a locked WORLD POINT distinct
//     from the structure's own position — Rock Trap's telegraph resolves at
//     the target's position when armed started (Amendment C.2), not the
//     structure's center, so the client cannot derive it from `s`/orient/dir
//     alone. Generic like phase/deadline/charge/cycle: 0,0 for every
//     structure that has no locked point of its own.
// Orientation and cardinal direction are append-only index tables, same ABI
// discipline as ATTACK_KINDS/PROJECTILE_TYPES.
export const STRUCT_ORIENTS = ['H', 'V']
const STRUCT_ORIENT_INDEX = Object.fromEntries(STRUCT_ORIENTS.map((o, i) => [o, i]))
export const STRUCT_DIRECTIONS = ['N', 'E', 'S', 'W']
const STRUCT_DIRECTION_INDEX = Object.fromEntries(STRUCT_DIRECTIONS.map((d, i) => [d, i]))
const STRUCT_CHARGE_SCALE = 100

const q = v => Math.round(v)

export function encodeSnapshot(state, lastSentPv) {
  // Enemies live in the SoA store (server/game/enemies.js) — read its dense
  // 0..count-1 slots directly into the flat wire array. Wire layout unchanged.
  const store = state.enemyStore
  const e = new Array(store.count * ENEMY_STRIDE)
  let k = 0
  for (let i = 0; i < store.count; i++) {
    e[k++] = store.id[i]
    e[k++] = store.type[i]
    e[k++] = q(store.x[i])
    e[k++] = q(store.y[i])
    e[k++] = Math.ceil(store.hp[i])
    e[k++] = store.flags[i] | 0
  }

  // Player tuple: `[id,x,y,hp,flags,gold,cdBasic,cdSpecial,cdSecond]`. The
  // three cooldowns are APPENDED after `gold` under the same discipline that
  // appended `gold` itself. `gold` is APPENDED to the legacy
  // 5-field prefix (same append-only ABI discipline as the structure tuples) —
  // a consumer built against the old shape keeps reading id/x/y/hp/flags
  // correctly. Gold is PUBLIC, not owner-only: encodeSnapshot runs once per
  // emit and broadcasts (see PROTOCOL DECISION above), so there is no
  // per-client channel to hide it behind, and wallets are per-player in a
  // co-op game — a teammate seeing your balance costs nothing.
  // Floor, not ceil: a wallet must never round UP into affordability the
  // server would then reject.
  // Cooldowns ride as REMAINING MILLISECONDS, not the server's absolute
  // `readyAt` timestamps: those are `performance.now()` values on the server
  // process, meaningless against a client's own clock. Remaining-ms is
  // skew-free — the client counts it down locally between the 20 Hz emits.
  // Same monotonic clock the readyAt values were written against (loop.js's
  // `now()`), so no signature change is needed to read it here.
  // Clamped at 0 (ready) so a stale/negative delta never wires a negative.
  const tNow = performance.now()
  const cd = (readyAt) => Math.max(0, Math.ceil((readyAt ?? 0) - tNow))
  const p = state.players.map(pl => [
    pl.id, q(pl.x), q(pl.y), Math.ceil(pl.hp), pl.flags | 0, Math.floor(pl.gold ?? 0),
    cd(pl.basicReadyAt), cd(pl.specialReadyAt), cd(pl.secondReadyAt),
  ])

  // Projectiles (Phase 4): flat quantized ints, same convention as enemies.
  const projectiles = state.projectiles || []
  const pr = new Array(projectiles.length * PROJECTILE_STRIDE)
  let pk = 0
  for (const proj of projectiles) {
    pr[pk++] = proj.id
    pr[pk++] = PROJECTILE_TYPE_INDEX[proj.type] | 0
    pr[pk++] = q(proj.x)
    pr[pk++] = q(proj.y)
  }

  // Cap fx per type, preserving order of first-seen events. A 4th element
  // carries an optional integer value (floating combat-text amounts).
  const fxCount = Object.create(null)
  const fx = []
  for (const f of state.fx) {
    const c = fxCount[f.type] || 0
    if (c >= FX_CAP_PER_TYPE) continue
    fxCount[f.type] = c + 1
    fx.push(f.v != null ? [f.type, q(f.x), q(f.y), q(f.v)] : [f.type, q(f.x), q(f.y)])
  }

  // Attack presentation events (Task 7): capped per KIND, not per exact
  // string — an FX-family cap. Without it, one class's players spamming
  // casts in a laggy emit window could crowd every OTHER class's telegraph
  // out of the same fx budget; per-kind capping keeps each class's shape
  // independently readable.
  const atkCount = Object.create(null)
  const atk = []
  for (const a of (state.atkFx || [])) {
    const c = atkCount[a.kind] || 0
    if (c >= FX_CAP_PER_TYPE) continue
    atkCount[a.kind] = c + 1
    atk.push([
      a.srcId, ATTACK_KIND_INDEX[a.kind] | 0, q(a.x), q(a.y),
      Math.round(a.aimX * ATK_AIM_SCALE), Math.round(a.aimY * ATK_AIM_SCALE), a.seq | 0,
    ])
  }

  // Hall hp rides every snapshot now that it can be damaged (Phase 3) — a single
  // ceil-int, clamped >=0 so a fatal overkill never wires a negative (CP2 L1;
  // matches the loop's end-payload rule). Lets the client draw town integrity.
  // Dynamic structure state (Task 8): unconditional, every emit — this is
  // what lets hp/phase/charge/cycle update without a placedVersion bump.
  const structures = state.structures || []
  const ds = structures.map(s => [
    s.id,
    Math.max(0, Math.ceil(s.hp)),
    s.phase | 0,
    q(s.phaseDeadline ?? 0),
    Math.round((s.charge ?? 0) * STRUCT_CHARGE_SCALE),
    s.cycleSeq | 0,
    q(s.tx ?? 0),
    q(s.ty ?? 0),
    q(s.repairMs ?? 0),   // appended (field 9) — drives the repair-channel bar
  ])

  const out = {
    t: state.tick, pv: state.placedVersion,
    hh: Math.max(0, Math.ceil(state.hall.hp)),
    lv: state.teamLevel ?? 1,
    p, e, pr, fx, atk, ds,
  }
  if (state.placedVersion !== lastSentPv) {
    // Field 4 (hp) is a legacy-compat placeholder, NOT the authoritative hp
    // source (that's `ds`, unconditionally) — kept so the tuple's PREFIX
    // still matches the pre-Task-8 `[id,type,gx,gy,hp,w,h]` layout instead of
    // silently reinterpreting hp as w and w as h for a client/replay built
    // against the old shape. Genuinely new fields (orient, dir) are appended
    // after the legacy 7, preserving real append-only discipline.
    out.s = structures.map(s => [
      s.id, s.type, s.gx, s.gy, Math.max(0, Math.ceil(s.hp)), s.w ?? 1, s.h ?? 1,
      STRUCT_ORIENT_INDEX[s.orient] ?? 0,
      s.dir != null && STRUCT_DIRECTION_INDEX[s.dir] != null ? STRUCT_DIRECTION_INDEX[s.dir] : -1,
    ])
  }
  return JSON.stringify(out)
}

export function decodeSnapshot(str) {
  const raw = JSON.parse(str)
  const enemies = []
  for (let i = 0; i < raw.e.length; i += ENEMY_STRIDE) {
    enemies.push({
      id: raw.e[i], type: raw.e[i + 1], x: raw.e[i + 2],
      y: raw.e[i + 3], hp: raw.e[i + 4], flags: raw.e[i + 5],
    })
  }
  const projectiles = []
  const rpr = raw.pr || []
  for (let i = 0; i < rpr.length; i += PROJECTILE_STRIDE) {
    projectiles.push({
      id: rpr[i], type: PROJECTILE_TYPES[rpr[i + 1]],
      x: rpr[i + 2], y: rpr[i + 3],
    })
  }
  const atk = (raw.atk || []).map(a => ({
    srcId: a[0], kind: ATTACK_KINDS[a[1]], x: a[2], y: a[3],
    aimX: a[4] / ATK_AIM_SCALE, aimY: a[5] / ATK_AIM_SCALE, seq: a[6],
  }))
  const out = {
    tick: raw.t,
    placedVersion: raw.pv,
    hallHp: raw.hh,
    teamLevel: raw.lv ?? 1,
    // `gold` defaults per-field (not just "missing = undefined") so a legacy
    // 5-field tuple decodes as a broke wallet, never NaN/undefined arithmetic.
    // Cooldowns default to 0 (= ready) per-field for the same reason gold
    // defaults to 0: a legacy 5- or 6-field tuple must decode to a usable
    // number, never NaN/undefined arithmetic in the HUD's countdown.
    players: raw.p.map(a => ({
      id: a[0], x: a[1], y: a[2], hp: a[3], flags: a[4], gold: a[5] ?? 0,
      cdBasic: a[6] ?? 0, cdSpecial: a[7] ?? 0, cdSecond: a[8] ?? 0,
    })),
    enemies,
    projectiles,
    fx: raw.fx.map(a => (a.length > 3
      ? { type: a[0], x: a[1], y: a[2], v: a[3] }
      : { type: a[0], x: a[1], y: a[2] })),
    atk,
  }
  if (raw.s) {
    // a[4] is the legacy-compat hp placeholder (see encodeSnapshot) — not
    // surfaced here on purpose, since `ds` is this decoder's sole hp source.
    out.structures = raw.s.map(a => ({
      id: a[0], type: a[1], gx: a[2], gy: a[3], w: a[5] ?? 1, h: a[6] ?? 1,
      orient: STRUCT_ORIENTS[a[7]] ?? 'H',
      dir: a[8] >= 0 ? STRUCT_DIRECTIONS[a[8]] : null,
    }))
  }
  // Per-field defaults, not just "missing array = []" — a genuinely
  // truncated/legacy `ds` tuple (e.g. `[id,hp]`) must not decode phase/
  // deadline/cycle as undefined or charge as NaN.
  out.structureState = (raw.ds || []).map(a => ({
    id: a[0], hp: a[1], phase: a[2] ?? 0, deadline: a[3] ?? 0,
    charge: (a[4] ?? 0) / STRUCT_CHARGE_SCALE, cycle: a[5] ?? 0,
    tx: a[6] ?? 0, ty: a[7] ?? 0, repairMs: a[8] ?? 0,
  }))
  return out
}
