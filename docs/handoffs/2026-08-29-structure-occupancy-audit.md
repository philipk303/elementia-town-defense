# Handoff — does the enemy path actually reach these structures?

Date: 2026-08-29. Written at the start of a session that raised a question
the balance-sweep program has never answered for almost anything in the
roster: **when a structure's whole value depends on an enemy walking through
or near it, has anyone ever checked that enemies actually do?**

---

## READ THIS FIRST

This is not Muddy-Bog-specific. It generalizes to most of the structure
roster, at different severities depending on mechanism. Two facts made this
worth a session of its own rather than a footnote:

1. **One structure already has this documented as a KNOWN, unresolved
   problem**, in `shared/balance.js`'s own GRINDER comment (line ~630):
   > "Enemies the pull failed to drag inside take nothing — §7's safeguard
   > ('outer pull cannot guarantee inner-zone arrival') is a live property of
   > position-gated crush selection, not a tuning promise... the redesign
   > spec itself names it policy-confounded (the scripted human never
   > repositions to catch a pull-and-crush cycle), so a sub-1.0 Grinder number
   > measures the policy, not the structure."

   That is exactly the user's hypothesis, already written down, already
   affecting a live balance number (Grinder's `-0.035` maze-A result has
   never been trusted for this reason — see
   `docs/reviews/2026-08-28-fusion-roster-worth-retune.md`, "Grinder
   unchanged, deliberately").

2. **Only ONE structure in the entire roster has ever had its occupancy
   measured, and nobody has read the number.** See §2.

## 1. The roster, classified by how exposed each mechanism is

| structure | family (balance.js flag) | reach | occupancy telemetry? |
|---|---|---|---|
| Muddy Bog | `areaEntry` | exact 2x2 footprint | **none** |
| Magma Trap (Volcano) | `entryTrigger` | exact 2x2 footprint, crossing-counted | **none** |
| Firepit (FIRE_SPECIAL) | `aoe` | 2x1 footprint + 15px margin | **yes — `state.aoeStats`, unread** |
| Water Geyser (WATER_SPECIAL) | `displace` | footprint-only target selection | **none** |
| Steam Vent | `scaldField` (own file) | cloud around footprint, `cloudMarginPx: 15` | **none** |
| Grinder | `grind` (cycle.js) | outer pull radius 160px / inner crush zone 55px | **none** — and already flagged as broken by this exact issue |
| Wind Vortex (WIND_SPECIAL) | `cycle` (TIMED PHASE MACHINE) | suction radius 150px | none |
| Watchtower | plain ranged | rangePx 75 | none (but this project already has a whole siting-confound history — see below) |
| Snare Post | `aura` | radiusPx 40 | none |
| Rock Trap (EARTH_SPECIAL) | `targetImpact` | rangePx 140 | none |
| Blizzard | `targetImpact`, denseCluster | rangePx (not yet read) | none |
| Firestorm | `volley` | rangePx 88 | none |

**Two tiers of exposure:**
- **Exact-footprint mechanisms** (Bog, Magma Trap, Firepit, arguably Water
  Geyser/Steam Vent) need an enemy to physically walk through a ~1-2 tile
  rect. A lane that's even slightly wider than the structure, or enemies that
  spread out, could mean a meaningful fraction of enemies never touch it —
  this is the sharpest version of the concern.
- **Range/radius mechanisms** (Watchtower, Rock Trap, Vortex, Blizzard,
  Firestorm, Snare Post, Grinder's pull) are more forgiving (radii of
  75-160px vs. a roughly 32-64px lane), but not immune — and Grinder's own
  comment proves "more forgiving" isn't "safe."

This project has ALSO already found and fixed a *related but different*
problem for Watchtower: the 2026-08-04 siting-confound saga
(`docs/reviews/2026-08-04-fusion-siting-confound-diagnosis.md`,
`elementia-siting-confound` memory) was about the harness's OWN placement
policy accidentally displacing Watchtower and contaminating fusion readings.
That is a policy/measurement artifact, not "does the enemy's real path reach
the structure" — the two are easy to conflate but are genuinely different
questions. Don't assume the siting-confound fix already covers this.

## 2. The free data point nobody has read

`server/game/towers.js`'s `tickArea` (the `aoe` family's tick function, used
by Firepit) already increments `state.aoeStats.activeTicks` and
`state.aoeStats.enemySeconds` every tick something is standing in its field,
and `matchRunner.js` already writes these out as `aoeActiveTicks` /
`aoeEnemySeconds` on every stored record. This has been silently collected in
**every historical sweep that ever built a Firepit** — which includes every
Magma Trap sweep and every Steam Vent sweep, going back to 2026-08-15/16.

**Nobody has ever read this field.** It's sitting in
`test/harness/store/*.jsonl.gz` archives already on disk. Reading it costs
nothing — no new sweep, no new code — and would be the first real, existing
evidence for or against "enemies are walking around footprint structures."

## 3. Recommended sequence

1. **Free first: decompress an existing Firepit-containing store archive
   (e.g. `2026-08-16-fusion-r2-magma-trap.jsonl.gz` or one of the Steam Vent
   corpora) and read `aoeActiveTicks`/`aoeEnemySeconds` per record.** Compute
   what fraction of total match time the field held at least one enemy, and
   whether that varies by maze/postGap. This alone either confirms or kills
   part of the hypothesis with zero new compute, and tells you whether it's
   worth building more instrumentation at all.

2. **If (1) shows meaningful uncovered time: wire the same `aoeStats` idiom
   into `areaEntry.js` (Bog) and `entryTrigger.js` (Magma Trap)** — both
   already have a `stillInside`/equivalent set built every tick for their own
   logic, so this is a few lines each, not a new mechanism. Re-run against
   the EXISTING `bog-decouple-retune` store's seeds (or a fresh small sweep)
   and get real occupancy numbers for the two structures most exposed to
   this (small exact footprints, no active pull toward them).

3. **Lighter-weight version for the range-based structures**: don't build
   full occupancy tracking for radius mechanisms — instead check whether
   enemies ever come within `rangePx`/`radiusPx` at all, which is a single
   distance check, not a per-tick accumulator. Watchtower is the highest
   priority here given its central role in every fusion contrast (it's the
   `defence` arm in every spec this project runs).

4. **Grinder specifically**: this is not a "should we investigate" — it's
   already documented as broken by this class of issue. Once the
   instrumentation from (2)/(3) exists, use it to actually quantify how often
   Grinder's pull fails to land an enemy in the crush zone, rather than
   continuing to treat its number as untrustworthy-but-unquantified.

5. **Lowest priority, different question, real code change**: the "multiple
   Bogs vs. an equivalent number of unfused pairs" idea from earlier in this
   session is a DIFFERENT question (does value scale with count) and the
   harness currently hard-caps at one fusion per match
   (`matchRunner.js`'s `partnerPlacedAt` latch). Only worth building once (1)-(4)
   establish whether the single-instance numbers are even trustworthy.

## Status of the Muddy Bog decouple work (this session, prior chapter)

Landed but **not committed**: `server/game/structureBehaviors/areaEntry.js`
(damage decoupled from root, gated on footprint presence),
`shared/balance.js` (`MUDDY_BOG.pulse.damage` 12 → 28), `test/game/muddyBog.test.js`
(14 tests, 2 new, covering the cross-source-damage and root-immune-damage
behaviour changes an adversarial review caught). Suite 897/0/2. Full
write-up, including the adversarial review's findings and this session's
corrections to it, in `docs/reviews/2026-08-28-muddy-bog-decouple.md`. Two
untracked sweep specs (`bog-decouple-retune.json`,
`bog-oldgate-dmg28-check.json`) and their stores are also on disk, uncommitted.
**Ask the user whether to commit this before starting the occupancy audit** —
it's unrelated work sitting in the same working tree and shouldn't be
silently bundled into a commit for the new topic, or lost if not committed
at all.

## Recommended setup

- **Model: Sonnet 5 is fine for step 1** (reading existing data, no judgment
  calls). Steps 2-4 involve a real mechanism decision (what exactly counts as
  "occupancy" for entryTrigger's crossing-based Volcano vs. areaEntry's
  continuous Bog) — Opus 5 if the finding from step 1 is non-trivial enough
  to justify building new instrumentation.
- **Subagents: none for step 1** (a single read-and-report). Fine to delegate
  step 1 to a background agent if the session has other work queued, since
  it's pure read-only investigation with no judgment calls.
- **No review needed for step 1** (read-only, no code change). Steps 2+ that
  touch `areaEntry.js`/`entryTrigger.js` should get the same adversarial
  review treatment the Bog decouple got — this project has a well-established
  pattern of the first draft of a finding being wrong in some way a second
  pass catches.

## Next-session prompt

```
Resume the Elementia balance work. Read
docs/handoffs/2026-08-29-structure-occupancy-audit.md first, especially the
"READ THIS FIRST" section.

The question: for structures whose value depends on an enemy actually
walking through or near them (Muddy Bog, Magma Trap, Firepit, Water Geyser,
Steam Vent, Grinder, Watchtower, and most of the roster to varying degrees),
has anyone ever verified enemies actually do? Grinder's own balance.js
comment already documents this as a known, unresolved problem for that one
structure. Nobody has checked it for anything else.

Start with step 1 in the handoff: it's free. Firepit already has occupancy
telemetry (state.aoeStats -> aoeActiveTicks/aoeEnemySeconds on every stored
record) sitting unread in existing store archives
(test/harness/store/*.jsonl.gz) from every historical sweep that built one.
Decompress one and read it before writing any new code or running any new
sweep -- this alone tells us whether the hypothesis has legs before spending
compute on it.

Then work through the rest of the sequence in the handoff's §3, in order.

Before starting: ask the user whether to commit the prior session's Muddy Bog
decouple work (uncommitted, see the handoff's status section) -- it's
unrelated to this topic and sitting in the same working tree.
```
