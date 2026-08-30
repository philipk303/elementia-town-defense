# Firestorm — real projectiles with no targeting

**Date:** 2026-08-04 · **Branch:** `codex/redesign-reconciliation` ·
**Status:** SPEC — approved for build in a new session, not yet implemented ·
**Supersedes:** decision B2 in `docs/plans/2026-07-26-task1-decision-sheet.md`
("one authoritative volley, eight cosmetic projectiles"), which itself
superseded combat-structure spec §6.3.

## 0. Intent

Firestorm should **fire eight real fireballs in fixed directions with no
targeting, which can miss.** Today it does an instantaneous radius scan
(`tickVolley`, `server/game/structureBehaviors/volley.js`) that cannot miss and
draws nothing. The goal is feel and readability: siting and enemy spacing
should matter, and the player should see the tower do something.

Philip's stated intent, verbatim: fewer/less powerful projectiles, **AoE
reduced on impact**, **slower refresh**, **shorter range**.

## 1. Three findings that shape the plan

### 1a. "Shorter range" as stated would be a large buff

A player Fireball is `PROJECTILE.FIREBALL.maxRangePx: 300`. Firestorm's reach is
`BALANCE.TOWER.FIRESTORM.rangePx: 100` — already **one third** of a Fireball. So
"half or 75% of a regular fireball" = 150–225px, i.e. **1.5–2.25× Firestorm's
current reach and 2.25–5× its footprint area**, plus longer flight time, which
*raises* concurrent projectile count rather than lowering it.

**Decision: `maxRangePx: 100`, unchanged footprint.** Phase 2 may shorten it.

### 1b. Miss chance is a spec knob, not a consequence of using projectiles

A projectile that hits nothing still detonates at max range
(`projectiles.js:143`) and `detonateAoe` applies full damage there. With
Fireball's `aoeRadiusPx: 44`, eight detonation points around a 100px rim are
spaced 78px apart with 88px-diameter blasts — **they overlap, and the rim is
fully covered.** Reusing `FIREBALL` unchanged would produce a tower that misses
almost nothing.

**Decision: a dedicated `FIRESTORM_BOLT` projectile with a small AoE.** This is
the knob that creates the miss chance Philip is asking for.

### 1c. Burn carries ~half the damage and is resilient to misses

Per body in range today: `damage: 8` per 700ms (11.4 dps) plus
`burn: { dps: 10, ms: 4000 }` — about **21.4 dps, 47% of it burn**. Burn lasts
4s and refreshes on any hit, so it stays near-continuous as long as roughly one
bolt connects every 4s. A pure mechanism swap at unchanged numbers is therefore
**a ~20–25% nerf concentrated on the direct component**, not the 60%+ a naive
"it misses half the time" estimate suggests.

**This matters because Firestorm is the only fusion that passes**, at +0.26
(`docs/reviews/2026-08-04-fusion-roster-retake-isolated-instrument.md`). It does
not have room to absorb mechanism change *and* a deliberate nerf in one step
without the verdict becoming unattributable.

## 2. Do we need to limit the projectile count?

**No — keep eight.** Eight is the visual identity and the number the spec has
always carried. The concurrency concern is real but is better solved on two
other axes, both of which are architectural improvements worth having anyway.

**Concurrency math.** Flight time = 100px ÷ 420px/s = 0.238s. Eight bolts per
volley at a 700ms cooldown gives **2.7 average / 8 peak concurrent per tower**.
The budget is `LIMITS.MAX_PROJECTILES: 64`, so eight towers would have to volley
on the same tick to reach it. Not a real risk — but see 2a, because that budget
is currently a lie.

### 2a. `MAX_PROJECTILES` is asserted by tests and never enforced

`grep` finds it only in `shared/balance.js` and two test files
(`simulationBudgets.test.js:53`, `matchRunner.test.js:486`). **Nothing in
`server/` enforces it at spawn.** This is a latent gap today and would become a
real one with a structure spawning eight at a time.

**Add enforcement in `spawnProjectile`:** refuse the spawn and return `null`
when `state.projectiles.length >= LIMITS.MAX_PROJECTILES`. **Refuse, do not
drop-oldest** — dropping would silently delete a player's in-flight Fireball,
which is a worse failure than a structure losing a bolt. Callers already ignore
the return value; `tickVolley` should count refusals so the probe can report
whether the cap ever binds.

### 2b. The FX cap would silently eat the muzzle flash

`FX_CAP_PER_TYPE = 8` (`server/net/encode.js:24`). Eight simultaneous
`projSpawn` events sit **exactly at the ceiling**, so a second Firestorm
volleying on the same tick loses its spawn FX entirely.

**Do not raise the cap** — it is a free-tier bandwidth guard pinned by
`encode.test.js`. Instead: **structure-owned projectiles emit no per-bolt
`projSpawn`.** One muzzle event per volley at the tower is the correct visual
anyway — eight fireballs leaving one tower is one event, not eight.

This costs nothing today: `projSpawn` currently falls through to
`default: break` in `GameScene.js:612` and is not rendered at all.

## 3. Visuals — no client work is required

**The eight bolts will render with zero new client code.** Projectiles are
replicated as *entities*, not FX: `encode.js` ships them at `PROJECTILE_STRIDE`
and `GameScene.js:964` already creates, moves and destroys a graphic per
projectile id. Adding a projectile type is additive on the wire —
`PROJECTILE_TYPES = ['FIREBALL', 'FAN_BLADE']` is an append-only index, so
`'FIRESTORM_BOLT'` takes index 2 and no existing client breaks.

`AnimationController.structureFamily` already returns `'volley'` off the live
spec (`AnimationController.js:94`) and the `cycleSeq` bump already fires once per
volley — the tower's own cast animation hook is in place and unchanged.

So "visuals not compromised" is satisfied by construction, and the art track can
give the bolt a distinct sprite later without touching this work.

## 4. Phase 1 — mechanism conversion at output parity

**Change the mechanism only.** Every balance number that governs how much
Firestorm hurts stays where it is, so the measurement isolates *missable +
variance* from *weaker*.

### 4a. New projectile spec

```js
// shared/balance.js, PROJECTILE
FIRESTORM_BOLT: { speedPx: 420, maxRangePx: 100, hitRadiusPx: 8, aoeRadiusPx: 16 },
```

`aoeRadiusPx: 16` (vs Fireball's 44) is what makes a bolt missable: eight
corridors ~24px wide across a 100px radius cover roughly **55% of the
footprint**, so a body in range is hit by some bolt about half the time.

### 4b. Firestorm spec

```js
// shared/balance.js, TOWER
FIRESTORM: { volley: true, rangePx: 100, damage: 8, cooldownMs: 700,
             burn: { dps: 10, ms: 4000 },
             volleyBolts: 8, boltType: 'FIRESTORM_BOLT' },
```

`damage`, `cooldownMs`, `burn` and `rangePx` **unchanged from today**. `volley:
true` is retained so `structureFamily` and `towers.js` dispatch are untouched.

### 4c. `tickVolley` rewrite

1. **Keep the in-range gate.** Scan for any enemy within `rangePx` before
   firing. If none, return **without spending cooldown** — exactly today's
   behaviour (`volley.js:43`). This stops the tower firing into empty space,
   keeps concurrency down, and keeps the probe's `activations` metric
   comparable across the change. A bolt can still miss the enemy that opened
   the gate; that is the point.
2. **Spawn eight bolts** on world-fixed headings at 45° increments.
3. **Rotate the fan per volley** by `(cycleSeq * 22.5°)`, deterministic from
   the existing counter. Without this the eight gaps are fixed in world space
   and a stationary enemy parked in a gap is never hit — a pathological
   exploit and a source of siting variance the harness would read as noise.
   Determinism is required for seed reproducibility.
4. **`ownerId: null`** on every bolt. `triggerAggro` already short-circuits on
   null (`aggro.js:61`), so eight detonations cause zero aggro retargets. This
   is decision B2's original concern and it is what the null path was built
   for. **Note this is a behaviour change**: today Firestorm pulls aggro to
   `s.ownerId` once per volley; after this it pulls none. That is the correct
   semantic for a team-owned structure and it must be measured, not assumed
   neutral.
5. **`category: 'structure'`, `label: s.type`** — attribution unchanged.
6. Bump `cycleSeq` once per volley, as today.

### 4d. Combat-stats accounting

`detonateAoe` records `recordUseful`/`recordMiss` per projectile keyed on
`(category, ownerId)`. `ownerBucket` builds the key by template string
(`combatStats.js:74`), so `ownerId: null` yields `"structure:null"` — valid, no
crash.

**Keep per-bolt accounting.** Under the old mechanism a "miss" was impossible so
the metric was meaningless; now it is a real accuracy figure directly comparable
to a player's Fireball. That is a feature, and it is the cheapest acceptance
signal available. Record it and say in the review that the metric's meaning
changed at this commit.

### 4e. Extend the probe

`test/harness/volleyProbe.mjs` currently counts `activations` and `hits` off the
instantaneous path. Extend `state.volleyProbe` to also count `boltsSpawned`,
`boltsHit`, `boltsRefused` (cap), so the probe reports **hits per volley** on
both mechanisms and the before/after is like-for-like.

### 4f. Acceptance criteria — Phase 1

Declared before the build, per the project's standing discipline:

1. **Hang gate 0/144 per cell**, both mazes, both sitings, isolated protocol.
   This is the highest-risk item: three soft-lock mechanisms have been found in
   this project, at least one in the aggro/flow-field layer, and 4c.4 changes
   aggro behaviour.
2. **Peak concurrent projectiles < 64** and `boltsRefused == 0` in a normal
   match. If refusals are non-zero the cap binds and the design needs revisiting.
3. **Suite green** (618/620 baseline) and `npm run build` clean.
4. **Expected output within ~15% of the pre-change reading**, measured as
   `hits/volley × damage` from the probe. If it lands outside that, adjust
   **`damage` only** — not cooldown or range — to bring it back, and record the
   calibration. Formula: `damage_new = damage_old × (hits_old / hits_new)`.
5. **Re-run the four maze-B Firestorm cells** on the isolated instrument and
   report Welch t, paired t and the exact sign test, per
   `docs/reviews/2026-08-04-paired-statistic-retrospective.md`. Phase 1 should
   **not** move the verdict. If it does, the mechanism change alone did
   something and that is the finding.

## 5. Phase 2 — the deliberate nerf, measured separately

Only after Phase 1 lands green. These are Philip's requested changes, applied as
a tuning pass with a known-good baseline underneath:

| lever | from | to | rationale |
|---|---|---|---|
| `aoeRadiusPx` | 16 | 10–12 | "AoE reduced on impact" — raises miss chance further |
| `cooldownMs` | 700 | 900–1000 | "slower refresh"; also cuts time-averaged concurrency ~25% |
| `maxRangePx` | 100 | 85–90 | "shorter range", as a mild trim rather than the 150–225 in §1a |
| `damage` | Phase-1 calibrated | ↓ | only if the three above are not enough |

**Expect this to cost Firestorm its PASS.** At +0.26 with a ~25% output cut and
added variance, the most likely outcome is "not resolvable" — which would leave
the roster with **zero** passing fusions against the A1.4(a) bar. That is a
legitimate design choice if the feel is worth it, but it should be made
knowingly, not discovered.

Acceptance for Phase 2 is the same five criteria, minus (4) — the point is to
move output, so parity is not the target. Add: **report the new verdict
explicitly**, including if it is a downgrade.

## 6. Change footprint

| file | change |
|---|---|
| `shared/balance.js` | `PROJECTILE.FIRESTORM_BOLT`; `TOWER.FIRESTORM` gains `volleyBolts`/`boltType` |
| `server/net/encode.js` | append `'FIRESTORM_BOLT'` to `PROJECTILE_TYPES` (index 2, additive) |
| `server/game/projectiles.js` | enforce `MAX_PROJECTILES` at spawn (refuse, return null); suppress `projSpawn` for structure-owned bolts |
| `server/game/structureBehaviors/volley.js` | rewrite: in-range gate → 8 spawns on a rotating fan, `ownerId: null` |
| `test/harness/matchRunner.js` | probe counters (already has `volleyProbe`) |
| `test/harness/volleyProbe.mjs` | count bolts spawned / hit / refused |
| tests | new: fan geometry + rotation determinism, cap-refusal path, zero-aggro assertion. Existing budget tests re-measured. |
| client | **none** |

## 7. Risks

1. **Soft-lock.** Aggro semantics change. The hang gate is the defence and it is
   cheap — run it first, not last.
2. **Firestorm loses its verdict** (§5). Known, accepted, must be stated.
3. **Harness power.** Added variance lowers resolution on a structure whose
   effect is already 0.26 score points. A post-change "no verdict" may be the
   instrument, not the change — the probe's mechanical hits/volley figure is
   the more trustworthy readout and should lead the report.
4. **Enemy pathing through gaps.** Mitigated by the per-volley fan rotation
   (4c.3); if it is ever removed, the exploit returns.

## 8. Recommended setup

- **Model: Sonnet** for Phase 1 — well-specified, bounded, mostly mechanical,
  and the hard thinking is in this document. Escalate to Opus only if the
  hang gate trips.
- **Subagents:** no for the build; **yes** for one adversarial reviewer before
  the Phase-2 tuning pass, per the standing convention.
- **Do not** combine Phase 1 and Phase 2 into one commit. The whole point of
  the split is attribution.
