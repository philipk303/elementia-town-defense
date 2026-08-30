# Structure occupancy audit — steps 1 & 2 result

**SUPERSEDED for the Firepit finding — see
`docs/reviews/2026-08-29-structure-occupancy-CORRECTION.md`.** Step 1's read
mixed records where Firepit was fused away (no Firepit exists in the match)
with records where it genuinely stood — the "34-61% never touched" number
below is a data-filtering artifact, not a real occupancy problem. Step 2's
Bog/Magma Trap result is unaffected and still holds.

Date: 2026-08-29. Follow-up to `docs/handoffs/2026-08-29-structure-occupancy-audit.md`.
Covers steps 1 (read Firepit's existing telemetry) and 2 (wire the same
telemetry into Muddy Bog / Magma Trap and measure).

## Step 1 — Firepit (read-only, no code change)

Read `aoeActiveTicks`/`aoeEnemySeconds` out of four existing store archives
(2026-08-16 magma-trap sweep, 2026-08-15 fire-v2 sweep, 2026-08-16 firestorm
sweep, 2026-08-28 fusion-roster-confirm sweep — 65,400 records total, every
one with a Firepit placed).

| archive | n | fraction fight-ticks occupied | fraction enemy-seconds in field | zero-occupancy matches |
|---|---|---|---|---|
| 2026-08-16 magma-trap | 12000 | 0.0214 | 0.0030 | 34.0% |
| 2026-08-15 fire-v2 | 5400 | 0.0109 | 0.0017 | 60.8% |
| 2026-08-16 firestorm | 12000 | 0.0163 | 0.0020 | 45.6% |
| 2026-08-28 roster-confirm | 36000 | 0.0123 | 0.0016 | 48.0% |

**Verdict: confirmed, and severely.** Enemies spend roughly 0.2% of their
total alive-time standing in the Firepit's field, and in 34–61% of matches
across four independent sweeps, not one enemy ever enters it for the whole
game. Every historical Firepit/Magma-Trap-fusion/Steam-Vent number this
project has ever published was measured against a structure that is
frequently inert.

## Step 2 — Muddy Bog and Magma Trap (new instrumentation, new sweep)

Wired the identical `activeTicks`/`enemySeconds` idiom into
`server/game/structureBehaviors/areaEntry.js` (Bog) and
`entryTrigger.js` (Magma Trap), reusing each file's own `stillInside` set
(already rebuilt every tick for their own crossing/pulse logic — no new
scan). Opt-in via `state.areaEntryStats`/`state.entryTriggerStats`, absent
in the live game, same convention as Firepit's `state.aoeStats`. Wired
through `matchRunner.js` as `areaEntryActiveTicks`/`areaEntryEnemySeconds`
and `entryTriggerActiveTicks`/`entryTriggerEnemySeconds`. Full suite still
897/0/2 after the change.

Measured with a new script, `test/harness/archive/occupancyCheck.js`
(read-only measurement, not a sweep — no store write, no control arm, since
the question is occupancy not worth), 72 seeds x 2 postGaps x 2 mazes = 144
runs per structure per maze:

| structure | maze | fraction fight-ticks occupied | fraction enemy-seconds in footprint | zero-occupancy matches |
|---|---|---|---|---|
| Muddy Bog | A | 0.0162 | 0.0016 | 0/144 (0.0%) |
| Muddy Bog | B | 0.0258 | 0.0028 | 2/144 (1.4%) |
| Magma Trap | A | 0.0101 | 0.0009 | 0/144 (0.0%) |
| Magma Trap | B | 0.0159 | 0.0015 | 2/144 (1.4%) |

**Verdict: a genuinely different picture from Firepit's, not a repeat of
it.** The raw occupancy *fraction* looks similarly small (1–2.6% of
fight-ticks) — but the number that actually answers the audit's question,
"does the enemy path ever reach it," is the zero-occupancy rate, and there
the two structures diverge sharply from Firepit: 98.6–100% of matches have
at least one enemy cross the footprint. The low time-fraction is not enemies
avoiding the structure — it's the structure's own mechanic being
crossing-based rather than dwelling-based (an enemy walking through a 2x2
tile at normal speed is inside for a fraction of a second per crossing, by
design), which this instrumentation cannot distinguish from "barely used"
on its own. Firepit's problem is placement (a free-special build policy that
can site it off the enemy's real path); Bog and Magma Trap sit *in* the
lane by construction and get walked through almost every game.

**This clears the concern raised by the handoff for Bog and Magma Trap
specifically** — their whole-roster balance numbers are not compromised by
an occupancy gap the way Firepit's are. It does NOT clear Firepit, Water
Geyser, or Steam Vent, which share Firepit's free-special siting exposure
and have not been separately measured.

## What's still open (handoff §3, steps 3–5)

- Step 3 (range-based structures — Watchtower, Rock Trap, Blizzard,
  Firestorm, Snare Post): not started. Lighter-weight, single distance
  check rather than per-tick accumulation.
- Step 4 (Grinder): not started. Already documented as broken by this exact
  class of issue in `shared/balance.js`'s GRINDER comment; the new
  instrumentation idiom is proven out and ready to extend to it.
- Water Geyser / Steam Vent: not measured. Both share Firepit's exposure
  (footprint + margin, non-crossing target selection) and were flagged
  "none" in the handoff's telemetry column — worth the same free-first read
  if either ever gets a Firepit-style sweep archive, or new instrumentation
  otherwise.
- Step 5 (multi-Bog vs. unfused pairs): explicitly lowest priority, real
  code change, deferred per the handoff.
