# Review — Combat Structure Redesign

**Reviewing:** `docs/superpowers/specs/2026-07-25-combat-structure-redesign.md` (539 lines, committed `7360b12`)
**Against:** `docs/reviews/2026-07-25-tower-baseline.md` / [[elementia-tower-baseline]] (committed `2c220e3`), and the shipped code at HEAD.
**Date:** 2026-07-25
**Verdict:** Behavior design (§4–§6) is sound and worth building. **§2 and §7 do not answer the measured finding** and should be revised before implementation. **Three architecture items are under-scoped by roughly an order of magnitude.**

---

## 1. Does it answer the baseline?

The baseline finding, restated: *fusion is not underpowered as a tower, it is underpowered as a **trade**.* Paired per-cell over 288 matches on two mazes, fusion at wave 1 measured **−0.228 (t −2.23)** and **−0.391 (t −2.59)**; the free element special measured **+0.132** and **−0.002**. The cause from the catalog: `EARTH_SPECIAL` (8 dps / 90 px / 8g) and `WIND_SPECIAL` (3.75 dps / 90 px / 8g, no status) are strictly dominated by the 6-gold `WATCHTOWER` (10 dps / 130 px) on every axis simultaneously.

### 1.1 The diagnosis is right

§1 identifies exactly the right problem — "Wind and Earth therefore overlap the Watchtower" — and the success criterion "no elemental structure is a weaker elemental Watchtower" is the correct top-line goal. Every structure in §5 and §6 has a job the Watchtower cannot do. On the *distinctness* axis, this plan succeeds and I would build it.

### 1.2 The power budget is self-referential — this is the main defect

§7 defines one elemental structure as **1.0 power unit** and fusion as 2.3–2.5. But 1.0 is defined relative to the elemental structures themselves. **Nothing in the budget is anchored to the Watchtower**, which is the thing that measurably beats them today. Every number in §7 can be satisfied in full while the entire element line stays dominated exactly as it is now.

**Recommended revision:** define the unit externally.

> 1.0 power unit = the measured score contribution of one `WATCHTOWER` at its shipped cost, in the same maze and placement.
> An individual elemental structure must reach ≥ 1.0 **at equal gold** before it is considered done.

This makes the criterion falsifiable by the instrument that already exists, and it makes "is a weaker elemental Watchtower" a measurement rather than a design intention.

### 1.3 The fusion band is probably too low, for a reason the plan misses

§7 accounts for the trade as "two structures, two players, exact placement, permanent". It omits the axis the baseline actually exposed: **two structures cover two places and two range bands; one 2x2 covers one.** The measured comparison was 18 dps across two tiles and two range bands vs 8.6 dps + burn on one. A fusion at 2.4 units that also loses half the map coverage will not be chosen by a rational player in most layouts — which is precisely what the measurement shows today.

§7 already says "two separate structures should remain preferable when two lanes need independent coverage." Agreed — but then 2.3–2.5 is the *ideal-case* band, not the ordinary one. **Recommend 2.5 as the floor for ordinary useful placement and 3.0–3.5 for ideal**, and re-measure. The acceptance question is not "is the fusion strong?" but "**would a rational policy ever choose to fuse?**"

### 1.4 Permanence pushes against the measurement

§2 makes fusion permanent: no sell, no unfuse, no rotate, no redirect, and any direction is locked at confirmation.

The instrument has already caught the failure mode this makes worse. Fusing at wave 1 is *actively harmful* (−0.23 / −0.39); fusing at wave 4 is neutral. So timing is a real trap that a real player can fall into, and this plan removes every recovery from it while simultaneously adding a **locked cardinal direction** — a second irreversible decision, made before the player knows which lane the waves favour, on four of the ten structures.

I understand the intent (permanence is part of the cost that justifies the power). But the cost being paid is *player agency at exactly the moment of highest uncertainty*, and that cost does not convert into fun. **Recommend at minimum one of:**

- fusions are sellable during BUILD phase only, for a partial refund (no unfuse — sell), or
- direction is re-selectable during BUILD phase while the fusion is undamaged, or
- the §2 placement preview must show the explicit trade ("this consumes X and Y; it cannot be sold or rotated") and require confirmation of *that*, not just of the fusion.

This is a judgment call, not an error — but the current text takes the one thing measurement proved is a trap and makes it unrecoverable.

---

## 2. Architecture items (flagged explicitly, as requested)

Ordered by how much the plan under-scopes them.

### 2.1 **Walkable structures do not exist. This is the single largest gap.**

Every structure placed today pushes an HP band onto the cost field — `syncFieldBand` in [structures.js:78](server/game/structures.js:78), called from `placeStructure`, `placeSeedStructure`, `damageStructure`, `destroyStructure`. There is no such thing as a structure the field ignores. Snare Post included: it is a wall band today.

Two consequences, one of which is a correctness hole:

**(a) Walkable structures would be immortal.** The *only* path by which an enemy damages a structure is the wall-band test — [enemies.js:261](server/game/enemies.js:261) (chase, blocked by wall) and [enemies.js:270](server/game/enemies.js:270) (march, bulldoze the wall on the path). Both read `costField.wallBand[...] !== BAND_NONE` and then resolve `store.tileStruct[...]`. A structure with no band is never a melee target under any code path. This directly contradicts §2 ("Enemies can damage and destroy fusion structures"), §4.2, §5.1's "destruction stops pulses", and roughly a dozen verification bullets that assume destruction happens.

An enemy-vs-walkable targeting rule is a **new subsystem** — probably "an enemy standing on or adjacent to a walkable structure attacks it when it has no other melee target" — and it needs its own priority ordering against the existing player > hall > structure ladder at [enemies.js:304](server/game/enemies.js:304). It also opens an obvious new soft-lock shape: an enemy that stops to chew a walkable Firepit under its feet instead of marching. The plan does not name this work at all.

**(b) Three field consumers key off `wallBand` and must agree.** `solidAt` [costField.js:87](server/game/costField.js:87) drives the corner-cut guard in Dijkstra *and* `resolveTilePushout` in the enemy loop. If walkable structures are excluded from the band (correct — they should not shape routes), they must be excluded from all three consistently, and the enemy body must be free to stand on the footprint. That is mechanically fine but it is a pathing-invariant change, and the hall-ring soft-lock fix at `95c69b3` lives in the same code. **Any change here re-opens that fix for measurement.**

**Recommend:** step 1 of §9 becomes its own phase — introduce a `walkable` flag on the structure record, exclude it from `syncFieldBand`, add the enemy-vs-walkable attack rule, and re-run the hang-rate check (0/144 both mazes) *before* any new structure exists.

### 2.2 Fusion creation is a rewrite plus a new protocol, not a bullet

Today's fusion ([combos.js](server/game/combos.js)): automatic, at build time, on **8-connected adjacency**, resolved in-place by mutating the first structure's `type`, single-player, no confirmation, no ownership concept. `rescanCombos` retro-resolves pairs when the team hits L2.

The plan requires: exact 2x2 parallel side-by-side pairs only; a placement preview that names the resulting fusion *before* confirmation; **both contributing players confirm**; team ownership; permanence; team-repairable. That is a full replacement of `resolveCombosAt` plus a **new pending-confirmation protocol** — new client→server messages, pending-fusion state on the match, and answers for: what happens when the second player never confirms; when they disconnect mid-confirmation; when BUILD phase ends with a pending fusion; whether the ingredients are locked (unsellable) while pending. None of that is in the doc. Realistically this is comparable in size to §5's four structures combined.

### 2.3 Two-player confirmation is undefined for bot-owned elements

Fusion is reachable solo today *because* bot-held elements are unlocked for any human — `canPlaceElement` at [structures.js:58](server/game/structures.js:58) returns true when the element's owner `isBot`. This is how 1 human + 3 bots reaches all four elements and all six combos, and it is how the harness measures fusion at all.

"Both contributing players must confirm" has no defined answer when one ingredient is bot-owned. Either bots auto-confirm — in which case the gate is decorative in exactly the configuration most matches run in — or fusion becomes multiplayer-gated, which changes the shipped design *and* makes the tower baseline unreproducible. **This needs an explicit ruling in §2.**

### 2.4 The L2 diagonal gate is not mentioned

`STEAM_VENT` and `GRINDER` are level-gated until `teamLevel >= 2` ([combos.js:34](server/game/combos.js:34), `DIAGONAL_COMBO_TYPES`), and `rescanCombos` retro-resolves waiting pairs the moment L2 lands. The plan describes all six fusions as uniformly available and never mentions `teamLevel`. Worse, **retro-resolution is incompatible with "both players must confirm"** — an automatic level-up cannot satisfy a consent gate. Either the gate goes, or L2 must queue a confirmation prompt instead of fusing.

### 2.5 There is no dynamic per-structure state channel

The encoder sends structures as `[id, type, gx, gy, hp]` ([encode.js:83](server/net/encode.js:83)) and **only when `placedVersion` changes** — that is the whole point of the static/dynamic split. The plan needs direction, orientation, phase, phase deadline, charge count and cooldown on the wire (§10: "reconnecting clients receive enough state to render direction, charge, cooldown, phase, and statuses").

Orientation and direction are static-ish and can ride the existing array (cheap). **Phase and charge are not** — bumping `placedVersion` on every Vortex phase transition would resend *every* structure several times a second. This needs a separate compact dynamic-structure array in the snapshot. It is not hard, but it is unbudgeted and it is the kind of thing that gets discovered at step 5 of §9.

### 2.6 Firestorm's projectile reuse is sound, with two integration defects

Reusing the Fireball path is the right call — [projectiles.js](server/game/projectiles.js) already has velocity flight, the `MAX_STEP_PX` clamp, off-map termination, `maxRangePx`, AoE detonation and burn payload. Two problems:

- **Aggro.** `detonate` calls `triggerAggro(store.aggro[i], pr.ownerId, ...)` at [projectiles.js:58](server/game/projectiles.js:58) — attention follows damage, deliberately. Eight fireballs per volley from a **team-owned** structure will repeatedly yank the horde onto whichever player id is on the record. `ownerId` needs a null/structure path through `triggerAggro`, or Firestorm will silently rewrite the aggro FSM's behavior for the whole match.
- **fx volume.** Every spawn pushes a `projSpawn` and every detonation a `boom` plus a `dmg` per enemy hit ([projectiles.js:44](server/game/projectiles.js:44), [:59](server/game/projectiles.js:59), [:70](server/game/projectiles.js:70)). Eight per volley × N Firestorms × a dense wave is an fx-bandwidth item. §6.3 caps projectiles but says nothing about fx.

### 2.7 The status model conflicts with §3 in one place and lacks an owner field

§3 states: "Status refresh preserves the strongest potency and refreshes duration." **`applySlow` deliberately does not do that** — [status.js:53](server/game/status.js:53) documents the shipped model as "the strongest factor persists for the longest remaining duration among applied slows… NOT strict strongest-single-slow-wins", flagged for the Phase 8 sweep. If §3 is taken literally it changes shipped slow behavior, which moves the balance under the baseline. **Scope the §3 rule to new statuses**, or make the slow change a separate, separately-measured item.

Muddy Bog's "destruction ends Bog-owned roots immediately" (§6.4) needs a **source id on the root**, which the single-slot status object has no field for ([status.js:17](server/game/status.js:17)). Adding `rootSourceId` plus confusion timing/heading/immunity is fine — the objects are preallocated per slot, no hot-path allocation — but `statusFlags` is an `Int32` bitfield and confusion needs a new bit.

### 2.8 Footprints

`footprint()` is HALL-or-1×1 ([structures.js:23](server/game/structures.js:23)). 2x1/2x2 touches placement validation, `findStructureAt`, sell, repair edge-distance, dormancy, the client renderer and placement preview. `indexStructures` ([enemies.js:155](server/game/enemies.js:155)) already loops `st.w`/`st.h` correctly, so the melee lookup is free. Mechanical, wide, low-risk — but it belongs with 2.1 in its own phase.

---

## 3. Soft-lock risk — the largest untracked risk in the plan

This project has documented **three** distinct soft-lock mechanisms. Two of the plan's structures are shaped exactly like two of them, and §10 mentions hangs nowhere.

- **Wind Vortex and Grinder deliberately create crowd compression.** [[elementia-crowd-jam-softlock]] is a separation/flow-field limit cycle that occurs when bodies are packed. §5.4 and §6.6 anticipate part of this ("do not force enemies to an identical center coordinate", post-release immunity, velocity cap) — good instincts, correctly stated. But suction into a small radius is the crowd-jam mechanism *on purpose*.
- **Steam Vent confusion suspends hall-march steering.** The hall-ring soft-lock (`95c69b3`) was precisely "an enemy with no valid step and no attack, holding the wave open." §6.1 says confusion suspends navigation *and target acquisition* while contact attacks continue. A confused enemy on the hall ring with nothing in contact is that bug's exact signature, re-introduced by design. The "faster enemies recover sooner" and recovery-immunity rules bound it, but they do not eliminate it.

**Recommend promoting hang rate to a hard gate**, not a §10 checklist line: after §9 steps 5 (Vortex), 10 (Steam Vent) and 12 (Grinder), the match harness must resolve **0/144 on both maze A and maze B** before the step is considered landed. The current substrate is 288/288 clean, so this is a cheap and unambiguous canary — and it is the one measurement in this project that has repeatedly caught things nothing else caught.

---

## 4. Instrument work this plan requires (schedule it, don't infer it)

§9 step 13 says "add instrumentation and run the balance matrix." That single line is a phase.

1. **The build policy breaks.** `runBuildPolicy` places a special adjacent to a partner and lets `combos.js` fuse them ([matchRunner.js:168](test/harness/matchRunner.js:168)). New geometry (2x1 parallel forming an exact 2x2), orientation selection, direction selection and two-player confirmation all invalidate it. **Every fusion number in the tower baseline becomes non-comparable the moment §2 lands.** That is expected and fine — but it means the baseline must be *re-taken*, and the re-take needs a policy that can express orientation and direction.
2. **The baseline covered one combo, one placement, one dumb policy.** `MAGMA_TRAP` only, lane flank only, a policy that never re-sites, sells or repairs. `GRINDER` and `FIRESTORM` were never measured. §8's matrix (six fusions × six scenarios × two mazes, plus one-ingredient / two-ingredient / fusion comparisons) is far beyond what the harness does today.
3. **§8's metrics do not exist.** Enemy-seconds of slow/root/freeze/confusion, net path progress removed by displacement, useful-hit percentage, wasted activations, cooldown utilization, peak active projectiles — none of these are in `profile.js`. They are the right metrics (§8's "do not balance on raw DPS alone" is correct and well-judged), and they are real work.

Per [[elementia-baseline-review-lessons]]: any dial sweep run against this plan needs hang-imputation and split-half checks. Add that to §8 explicitly — the first cut of the tower baseline would have reported the wrong conclusion without the timing split.

---

## 5. Smaller items

- **Naming migration.** The shipped types are `MAGMA_TRAP` (the plan calls it Volcano), `FIRE_SPECIAL` (Firepit), `EARTH_SPECIAL` (Rock Trap), `WATER_SPECIAL` (Water Geyser), `WIND_SPECIAL` (Wind Vortex). Decide rename-vs-display-alias up front; a rename touches `constants.js`, `balance.js`, saved scenarios and tests. Display alias is cheaper and keeps the baseline greppable.
- **"Timed phase machine"** (§3 family 3) collides in name with `phaseMachine.js`, which is the match BUILD/FIGHT machine. Call it a structure cycle machine.
- **§4.2 changes a shipped, measured tower.** Converting Snare Post from nearest-target to a true pulse aura is correct, but it moves a live balance number. Land it as its own measured step, not bundled into §9 step 3 with three new structures.
- **§9's ordering is otherwise good** — preserving Watchtower behavior through the refactor, verifying low-risk structures first, and the closing "do not implement all structures behind one unverified generic configuration abstraction" is exactly right and worth keeping in bold.
- **§11's deferrals are well chosen**, particularly deferring spatial indexing until profiling demands it (the current linear scan is ~200 enemies off-cooldown only) and deferring true airborne state.

---

## 6. Recommendation

**Approve** §1, §3, §4, §5, §6, §8's metric list, §9's ordering principle, and §11.

**Send back for revision:**
- §7 — anchor the power unit to the Watchtower at equal gold; raise the fusion floor; state the coverage-loss axis.
- §2 — rule on bot confirmation; rule on the L2 gate; reconsider absolute permanence (at minimum, build-phase sell-back or direction re-selection).

**Re-scope §9:**
- Split step 1 into its own phase: walkable structures (field exclusion + the new enemy-vs-walkable attack rule) and multi-tile footprints, gated on 0/144 hangs both mazes.
- Split step 6 into its own phase: fusion geometry, the confirmation protocol, and ownership.
- Promote step 13 to a phase, ahead of final tuning, and re-take the tower baseline once step 6 lands.
- Add a hang-rate gate after steps 5, 10 and 12.

**Then measure one thing before building ten.** Land walkable + footprints, implement **Firepit alone**, and measure it head-to-head against a Watchtower at equal gold on both mazes. If Firepit — the simplest structure in the plan, with no facing, no phase, no target selection — cannot beat a 6-gold Watchtower, nothing further down the list will, and we will have learned it for one structure's worth of work instead of ten.
