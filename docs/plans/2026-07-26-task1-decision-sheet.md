# Task 1 — Combat Contract Decision Sheet

**Status: APPROVED 2026-07-29.** All 19 rows ruled (see the Ruling column
below). The approved text has been written into both specifications as dated
amendments (Character spec Amendment A; combat-structure spec Amendment C).
This sheet is now the audit trail, not the proposal.

**Sources merged.** Task 1's 11 checkboxes
(`docs/superpowers/plans/2026-07-26-staged-combat-redesign-program.md` §Task 1),
the character spec's §9 "Open decisions before coding", and the implementation
review's "Decisions required before coding"
(`docs/reviews/2026-07-26-character-and-tower-redesign-implementation-review.md`
lines 41-65). These three lists overlap heavily; working them separately would
produce three partial answers to the same questions.

**Gate:** *"The user explicitly approves these rulings. No gameplay
implementation before approval."*

**How to read this.** Items marked **[CODIFIES SHIPPED BEHAVIOR]** cost nothing
to adopt — the code already does this and the ruling just makes it contractual.
Items marked **[SUPERSEDES]** overwrite existing approved text and are the ones
that genuinely change the plan of record. Items marked **[OPEN]** have no prior
answer anywhere.

---

## Part A — Character basics

### A1. Wind wind-up duration — **125 ms** [OPEN, within approved range]

Character spec §9 leaves it open "within the approved 100-150 ms" range; Task 1
line 185 already proposes 125 ms.

//go with recommendation// **Recommend: 125 ms.** It is the midpoint of the approved band and Task 1's own
number. There is no evidence favouring either edge, and picking the midpoint
leaves symmetric room to tune after instrumented simulation.

### A2. Wind "attack commitment" semantics — **only down/death cancels** [OPEN]

The review (lines 53-54) correctly notes "commitment" is undefined while Wind
retains full movement. Task 1 line 185 answers part of it: full movement,
cooldown consumed at wind-up **start**, cancelled by down/death, **not**
cancelled by input release. The review raises two more cases Task 1 does not
cover: special use, and a repeated basic.

//go with recommendation// **Recommend the complete rule:**

- Cooldown is consumed at wind-up start.
- Movement is unaffected for the whole wind-up.
- **Cancelled by: down and death only.**
- **Not cancelled by: input release, casting either special, or pressing basic
  again.** A repeated basic during wind-up is ignored (it is on cooldown anyway).
- **No cooldown refund on cancel.** The cooldown was spent at wind-up start.

Rationale: one rule, one direction of causality, no partial-refund bookkeeping,
and nothing that can be exploited by tapping. "Commitment" should mean the shot
resolves unless the character stops existing.

### A3. Wind fan projectile constants — **500 px/s, 8 px hit radius, 100 px range, 400 ms lifetime** [OPEN]

The review (lines 55-56) flags speed, hit radius, lifetime and wall/structure
collision as undefined. Task 1 line 186 rules collision: enemy-only, plus
arena/range/lifetime termination, **no wall or structure collision in v1**.

//go with recommendation// **Recommend:**

| Attribute | Value | Why |
|---|---:|---|
| `speedPx` | 500 | Crosses its own 100 px range in 200 ms — snappy at short range. Well under the `MAX_STEP_PX` per-tick clamp at 60 Hz (8.3 px/tick), so it cannot tunnel. |
| `hitRadiusPx` | 8 | Smaller than Fireball's 12: single-target, no AoE, should reward aim. |
| `maxRangePx` | 100 | Fixed by the approved basic table (§3.4). |
| `lifetimeMs` | 400 | Pure failsafe at 2x expected flight time. Range terminates it first in every normal case. |

Enemy-only collision is consistent with the existing Fireball, which already
flies over structures by design ("the maze shapes enemies, not friendly fire
support" — `projectiles.js`). Adopting the same rule avoids a second collision
model.

### A4. Earth cone — **90 degrees, cap 3, distance then stable enemy ID** [OPEN angle, ordering per Task 1]

Task 1 line 187 already specifies all three. The character spec §9 leaves the
angle open.

**Recommend: accept as written.** 90 degrees is a readable, animatable sweep and
is wide enough that the cap of 3 — not the angle — is the real constraint.
Ordering by distance then **stable enemy ID** matters more than the angle: it is
the determinism requirement, and it must be stable ID rather than dense array
index, because swap-removal reorders slots within a tick.

### A5. Earth "increased aggro" — **multi-target contact only, no threat subsystem** [CODIFIES SHIPPED BEHAVIOR]

The review (lines 59-60) notes `aggro.js` accepts a boolean damage trigger, not
an intensity or threat value — confirmed: `triggerAggro(a, targetId, ex, ey,
now, byDamage)`.

**Recommend: accept Task 1's ruling.** Earth's aggro advantage is that its sweep
calls `triggerAggro(byDamage=true)` on up to **three** enemies where every other
class pulls one. That is a real, felt tanking advantage that requires **zero new
code** and no threat-intensity subsystem. Explicitly defer any threat-value
system; it is a large change to a tuned FSM for a benefit we have not shown we
need.

### A6. Water and Fire hit/animation timing — **instant server resolution; animation is presentation only** [OPEN]

Character spec §9 and the review both leave "exact animation/hit timing" open.

**Recommend: neither Water nor Fire gets a server-side wind-up.** Both resolve
instantly at cooldown start, exactly as the current shared melee does. The
client animation's hit frame is presentation and must never gate server damage.

Rationale: **Wind is the only class the design asks to telegraph** (§3.4). Giving
Water and Fire server wind-ups would add three timing state machines to buy
nothing the design requested, and every one is a new desync and cancel-rule
surface. If a future readability pass wants a visible delay, it can be animation
lead-in without touching the server.

### A7. Range semantics — **edge distance for every basic** [CODIFIES SHIPPED BEHAVIOR]

The review (lines 48-49) asks whether ranges mean edge or centre distance.

**Recommend: edge distance, universally.** This is already exactly what ships:
`players.js:126` computes `reach = P.MELEE.RANGE_PX + R + store.radius[i]` —
player radius plus enemy radius. Adopting it costs nothing, and it is the
behaviour every existing balance number was measured against. Centre distance
would silently change the effective reach of every class against every enemy
size tier.

Applies to Earth's cone origin and Wind's projectile spawn as well, for
consistency.

### A8. Missed basics consume cooldown — **yes** [CODIFIES SHIPPED BEHAVIOR]

Task 1 line 188; the review (lines 57-58) notes current melee consumes cooldown
before target acquisition.

**Recommend: yes, and confirmed against source.** `players.js:118-119` sets
`p.basicReadyAt = now + COOLDOWN_MS` and only then scans for a target, returning
early on a miss. Zero migration. For Wind, "consumes cooldown on miss" resolves
at **wind-up start** (per A2), not at projectile expiry.

### A9. Basic-attack constants — **adopt §3 as initial test baselines** [ALREADY APPROVED, recorded for completeness]

| Class | Damage | Cooldown | Reach/shape |
|---|---:|---:|---|
| Earth | 8 | 750 ms | 90-degree cone, up to 3 |
| Water | 10 | 500 ms | 34 px, one target |
| Fire | 12 | 700 ms | 65 px, one target |
| Wind | 11 | 500 ms | 100 px fan projectile, one target |

Character spec §3 marks these "approved initial test baselines... subject to
instrumented simulation", and §9 leaves open whether they survive simulation
unchanged.

**Worth noting for migration:** Water's 34 px / 500 ms is **identical to the
current shared melee** (`BALANCE.PLAYER.MELEE = { RANGE_PX: 34, COOLDOWN_MS: 500
}`). Water is therefore the zero-change baseline class — implement it first and
it should produce byte-identical behaviour to today apart from damage, which is
a useful control for the whole character slice.

**Recommend: adopt as baselines, explicitly not as final balance**, and answer
§9's "do they survive simulation" question with evidence at Phase 8H rather than
now.

### A10. Rename the shared melee multiplier — **`MELEE_LEVEL_MULT` to `BASIC_LEVEL_MULT`** [OPEN, mechanical]

Character spec §3 (line 89) and §8 item 5: the shared melee multiplier becomes a
basic-attack multiplier because Wind no longer melees, with **progression
behaviour unchanged**.

**Recommend: accept.** Pure rename, retain the current per-level values so class
identities stay stable. Touches `BALANCE.LEVELING`, `players.js:132`, and
`leveling.test.js`.

---

## Part B — Structures

### B1. Firepit cadence — **RESOLVED, no longer open** [CLOSED]

Task 1 line 189 asked to retain continuous DPS or restore fixed pulses, and
recommended continuous with an amendment to the shared fixed-pulse rule.

**This is done.** Philip ruled continuous on 2026-07-26 and it is recorded as
**Amendment B** in the combat-structure spec, superseding the fixed-pulse
language for the area-field family only and preserving the bounded-work
constraint for every other family. Committed at `c985563`. Tick this box.

### B2. Firestorm — **one authoritative volley, eight cosmetic projectiles** [SUPERSEDES]

Task 1 line 190.

**This supersedes** combat-structure spec §6.3 ("Fires eight fireballs per
volley... Each projectile travels independently") **and Amendment A3.3**, both of
which assume eight real server projectiles reusing the Fireball path.

//go with recommendation//**Recommend: accept the Task 1 form, strongly.** Beyond being bounded work, it
dissolves a defect Amendment A3.3 had to raise separately: `detonate()` calls
`triggerAggro(store.aggro[i], pr.ownerId, ...)`, so eight server projectiles per
volley from a **team-owned** structure would repeatedly yank the horde onto
whichever player id sat on the record. One authoritative resolution has one
aggro decision, and eight cosmetic client projectiles have none. It also removes
the need for the per-source and global projectile caps A3.3 specified, and the
fx-volume concern along with them.

Amendment A3.3's remaining point — that a structure-owned effect needs a
null/structure path through `triggerAggro` — still stands and should be carried
into the amended text.

### B3. Rock Trap — **lock a world impact point at telegraph start** [SUPERSEDES, partially]

Task 1 line 191.

Combat-structure spec §5.2 currently says "Lock the target ID during telegraph"
and "Resolve the strike at the target's impact-time position". A locked **world
point** replaces the second half.

//go with recommendation//**Recommend: accept.** A telegraph the player and the enemy can both read, and
which a fast enemy can actually walk out of, is better game feel than a homing
strike that cannot miss. It also removes a stable-ID resolution from the impact
path.

### B4. Blizzard — **also lock a world point** [SUPERSEDES]

Task 1 line 191 leaves this explicitly open and recommends locking a point.

**This supersedes Amendment A §6.5**, which says "Lock the target ID during
telegraph and center impact on its impact-time position if still valid."

//go with recommendation//**Recommend: lock a point, matching Rock Trap.** Two structures with telegraphs
should not have two different targeting philosophies — that is a rule players
must learn twice. Cluster-centre selection still happens at telegraph start; it
just resolves to a fixed point rather than tracking. This also deletes the
"target death during telegraph" edge case entirely rather than handling it.

### B5. Fusion consent, permanence, team ownership, destruction-only removal — **KEEP** [ALREADY APPROVED]

Task 1 line 192. Matches Amendment A1.1 (permanence confirmed, enemy destruction
the only removal path) and A1.2 (human initiator confirms for bot-owned
ingredients).

**Recommend: no change.** Recorded here only so Task 1's box can be ticked
against an explicit statement. **Gate 1 finding 2.2 remains open** — the shipped
`combos.js` still destroys the neighbour without any consent gate. That is
tracked remediation, not a contract question.

### B6. Steam Vent confusion stays last — **KEEP, and do not substitute** [ALREADY APPROVED]

Task 1 line 193.

**Recommend: no change.** Confusion suspends hall-march steering and target
acquisition, which is the hall-ring soft-lock's exact signature; it goes last,
behind every other fusion's gates, and no cheaper mechanic is silently swapped in
if it proves hard.

---

## Part C — Housekeeping the gate requires

### C1. Spec contradiction sweep [Task 1 line 194]

The contradictions found so far are B2, B3 and B4 above. On approval, both specs
need a consistency pass for **ambiguous timing terms** specifically — "brief",
"short", "medium-fast", "medium-to-long" appear throughout the structure spec
with no numeric anchor. Recommend they stay qualitative for now (§11 defers exact
numbers) but that the sweep confirms no term is doing load-bearing work where a
test will need to pin it.

### C2. Test baseline reconciliation [not in Task 1; found at Gate 1]

The program plan states an expected baseline of **346 tests, 344 pass**; the tree
is at **347 / 345**. The delta traces to an edit to `test/game/firepit.test.js`
made outside this session's changes. Recommend reconciling the number in the plan
before Gate 2 treats either as authoritative.

### C3. Documentation-only commit [Task 1 line 195]

On approval: write the rulings into both specs as dated amendments, tick Task 1's
boxes, update the ledger's 8C row, commit **documentation only**. No code.

---

## Decision log — fill in the Ruling column

Mark each row `approve`, `reject`, or write the alternative. Blank rulings are
treated as undecided, **not** as tacit approval — the executing session must stop
and ask rather than assume.

The seven rows in **bold** are the ones that genuinely need thought. The rest are
either already-approved text being restated so Task 1's boxes can be ticked
against something explicit, or shipped behaviour being made contractual.

| # | Decision | Recommendation | Kind | Ruling |
|---|---|---|---|---|
| **A1** | Wind wind-up duration | 125 ms | open (within approved 100-150) | **Approved as recommended.** 125 ms. |
| **A2** | What cancels the Wind wind-up | down/death only; no cooldown refund; input release, specials and repeat-basic do NOT cancel | open | **Approved as recommended.** |
| **A3** | Wind fan projectile constants | 500 px/s speed, 8 px hit radius, 100 px range, 400 ms failsafe lifetime; enemy-only collision | open | **Approved as recommended.** |
| A4 | Earth cone | 90 degrees, cap 3, distance then stable enemy ID | confirms Task 1 | **Approved.** |
| A5 | Earth "increased aggro" | multi-target contact only; no threat-intensity subsystem | codifies shipped | **Approved.** |
| **A6** | Water and Fire hit timing | no server wind-up; animation hit-frame is cosmetic and never gates damage | open | **Basics: approved as recommended (instant, no wind-up).** Additionally, expanded in chat 2026-07-29: **every first and second special, across all four classes, gets a small server-side wind-up, none exceeding 300 ms.** Ordering fastest-to-slowest: Wind's basic (125 ms) < Water's first special (Whirlpool) < Fire's first special (Fireball) < Wind's specials (Wind Blast, Gale Dash). Earth's specials (Ground Slam, Fissure) match Water's first-special speed. Exact ms values deferred to instrumented tuning, same treatment as A9. Full text: Character spec Amendment A, A6. |
| A7 | Range semantics | edge distance for every basic | codifies shipped | **Approved.** |
| A8 | Missed basics consume cooldown | yes; for Wind this resolves at wind-up start | codifies shipped | **Approved.** |
| A9 | Basic-attack constants | adopt §3 table as initial test baselines, explicitly not final balance | already approved | **Approved.** |
| **A10** | Shared multiplier rename | `MELEE_LEVEL_MULT` to `BASIC_LEVEL_MULT`, progression behaviour unchanged | open (mechanical) | **Approved as recommended.** |
| B1 | Firepit cadence | CLOSED — continuous, per Amendment B at `c985563`. Tick the box. | closed | **Box ticked** (already closed). |
| **B2** | **Firestorm resolution** | **one authoritative volley + eight cosmetic client projectiles — SUPERSEDES §6.3 and Amendment A3.3** | supersedes | **Approved as recommended.** Written as combat-structure spec Amendment C, C1. |
| B3 | Rock Trap targeting | lock a world impact point at telegraph start | supersedes §5.2 partially | **Approved as recommended.** Written as combat-structure spec Amendment C, C2. |
| **B4** | **Blizzard targeting** | **lock a world point, matching Rock Trap — SUPERSEDES Amendment A §6.5** | supersedes | **Approved as recommended.** Written as combat-structure spec Amendment C, C3. |
| B5 | Fusion consent / permanence / team ownership / destruction-only removal | keep, unchanged | already approved | **Approved, unchanged.** Gate 1 finding 2.2 remains open remediation. |
| B6 | Steam Vent confusion stays last | keep; no silent substitution | already approved | **Approved, unchanged.** |
| C1 | Spec contradiction and timing-term sweep | run on approval; keep qualitative terms qualitative | housekeeping | **Done.** Superseded text in §5.2/§6.3/§6.5/Amendment A3.3 struck 2026-07-29; qualitative timing terms left qualitative. |
| C2 | Test baseline number | reconcile plan's 346/344 against actual 347/345 | housekeeping | **Done.** Actual (347/345/2 skipped) confirmed via `npm test` and recorded as authoritative in combat-structure spec Amendment C, C6, and the ledger. |
| C3 | Commit scope | documentation only, after approval | housekeeping | **Done.** This session's commit is documentation only. |

### Why B2 and B4 deserve the most scrutiny

They are the only two rows that **overwrite decisions already recorded and
committed** in Amendment A. Approving them is not a clarification; it changes the
plan of record, and the superseded text has to be struck rather than left to
contradict the new ruling.

B2 additionally has a hidden benefit worth weighing: it dissolves the
`triggerAggro(pr.ownerId, ...)` defect that Amendment A3.3 had to raise
separately, because one authoritative resolution makes one aggro decision instead
of eight from a team-owned structure.
