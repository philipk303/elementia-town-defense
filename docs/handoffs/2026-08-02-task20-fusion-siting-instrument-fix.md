# Task 20 continued — fusion flank-siting instrument fix (paste this into a new session)

Branch `codex/redesign-reconciliation`, current HEAD `d1d77f4`. Suite
613/611/0/2 skipped, `npm run build` clean, hang gate 0/144 both mazes on
every arm this repo currently measures.

**This supersedes `docs/handoffs/2026-08-02-task20-balance-sweep-prompt.md`.**
That prompt's step 1 (hang-gate regression + tower baseline retake across the
full six-fusion roster) is DONE — a concurrent session ran it the same day.
Don't repeat it; read its output instead (next section).

## What's already done, so you don't redo it

1. **Full six-fusion roster sweep** (`docs/reviews/2026-08-02-full-fusion-roster-sweep.md`,
   `elementia-fusion-roster-sweep` memory) — 0/5,184 hangs across the complete
   roster (was MAGMA_TRAP-only before; `humanElement` + `fuseWith` now reach
   all six). Per-fusion verdicts: MAGMA_TRAP/MUDDY_BOG confirmed "worth
   approximately nothing"; **FIRESTORM is a real, replicating positive**
   (+0.454 t3.94 maze A, +0.368 t2.38 maze B, zero skill dependency); STEAM_VENT
   uniformly negative but not individually significant; **GRINDER and BLIZZARD
   have no honest A1.4(a) verdict** — the spec itself names both as
   policy-confounded.
2. **Firepit maze-B hang gate fix + full Watchtower/Firepit retune**
   (`docs/reviews/2026-08-02-firepit-hang-fix.md`,
   `docs/reviews/2026-08-02-firepit-dps-retune.md`, this session, committed
   `d1d77f4`). Unrelated to fusion siting — a lane-gap steering defect plus a
   general stuck-body watchdog in `enemies.js`, then a Watchtower/Firepit
   numeric retune. Mentioned here only so you don't re-measure Firepit as
   part of "what's next" — it's closed for now.

**Housekeeping, not yours to decide unilaterally:** the fusion-roster-sweep
session left `test/harness/fusionRoster.js`,
`docs/reviews/2026-08-02-full-fusion-roster-sweep.md`, and
`test/harness/.fusion-roster-output.json` UNCOMMITTED (check `git status`).
That's a different session's work — don't fold it into your commit without
asking; flag it to Philip if it's still sitting there when you start.

## Why THIS session exists

The fusion roster sweep found a real instrument defect and explicitly did
NOT fix it (measurement-only scope that session): **every one of the six
fusions is sited at a `towerSites` (flank) location, never `funnelSites`
(in-lane)** — the same siting-bug CLASS the Firepit falsification test found
and fixed for a *standalone* walkable structure
(`docs/reviews/2026-07-25-firepit-falsification-test.md`), but that fix was
never checked against *fused* walkable structures. All six fusions are
`WALKABLE_TYPES`. This caveat applies equally to every fusion number
measured to date, including the previously-published MAGMA_TRAP figures.

**Root cause, precisely located, not guessed:** `runBuildPolicy` in
`test/harness/matchRunner.js` (~line 204) places the human's FREE special —
the anchor tile every fusion partner then builds directly below
(`m.freeSpecialAt`, ~line 240) — using ONLY `towerSites(maze)`:
```js
for (const [gx, gy] of towerSites(maze)) {
  if (findStructureAt(state, gx, gy)) continue
  const res = buildStructure(state, human, type, gx, gy, now, { orient: 'H', dir: freeDir })
  if (res.ok) { m.freeSpecialPlaced = true; m.freeSpecialAt = [gx, gy]; break }
}
```
Compare against the DEFENSE arm's site list a few lines later (~line 291),
which already tries funnel sites first for a walkable defence:
```js
const defSites = isWalkable(defence) ? [...funnelSites(maze), ...towerSites(maze)] : towerSites(maze)
```
The free-special loop was never given the same treatment. Since every fusion
is built on top of the free special's anchor tile, this single site list is
the reason every fusion in the game has only ever been measured flank-sited.

The fusion-roster review names this as "the highest-leverage single fix if
Task 20 continues" and specifically calls out that it's a **candidate root
cause for STEAM_VENT's ambiguous negative AND for GRINDER/BLIZZARD's
no-verdict status** — an in-lane Steam Vent cloud or Grinder pull might behave
completely differently than a flank-sited one.

## Scope for this session

**A controlled A/B, not a blind fix.** Per the review's own ranking: "site
flank vs site funnel, everything else held constant" — confirm the siting
question changes anything before treating it as settled, the same discipline
this project has used every time an instrument question came up (see
`elementia-baseline-review-lessons` memory).

1. Add an opt-in `freeSpecialSites` parameter (or similar — your call on the
   exact shape) to `runMatch`/`runBuildPolicy` so a harness script can drive
   the free special's site list explicitly, defaulting to today's
   `towerSites`-only behavior so every existing pinned test/baseline stays
   unchanged unless a script opts in.
2. Re-run the SAME six-fusion sweep the prior session ran
   (`fusionRoster.js`, reused not reinvented) with the free special sited via
   `funnelSites` instead, both mazes, same seeds. Compare against the
   existing flank-sited numbers in `2026-08-02-full-fusion-roster-sweep.md`
   §2 directly.
3. **Report whether this changes STEAM_VENT's verdict or gives GRINDER/BLIZZARD
   a usable niche-floor reading.** If it does, that's the actual finding — a
   siting bug was suppressing/inflating fusion numbers, not a power-level
   problem. If it doesn't move anything, that's also a real, useful result
   (rules out siting as the explanation, narrows where the real GRINDER/BLIZZARD
   blocker actually is — likely genuine target-selection/cluster-timing policy
   gaps, per the spec's own framing).
4. Hang gate: re-confirm 0/144 both mazes for every fusion under the new
   siting — a funnel-sited fusion changes flow-field geometry near the lane,
   which is exactly the class of change that has produced soft-locks before
   in this project (see this session's own Firepit lane-gap fix for the most
   recent example of that exact failure mode).

## What NOT to do

- **Don't tune any balance numbers.** This is instrument correctness work —
  fixing WHERE fusions are measured, not WHAT their power level should be.
  If a fusion's verdict changes as a result, report it; don't also "fix" the
  structure in the same session.
- **Don't extend this to Water Geyser / Wind Vortex standalone (non-fused)
  measurement**, or to Rock Trap (not implemented — no `ROCK_TRAP` entry
  exists in `shared/balance.js`/`shared/constants.js`). Those need actual
  policy work (target selection, cluster timing) per the spec, a materially
  bigger task than a siting A/B. Out of scope here.
- **Don't assume GRINDER/BLIZZARD are "fixed" just because they got a
  number** under funnel siting — a number existing is not the same as a
  trustworthy A1.4(a) verdict. Both structures involve directional/
  target-selecting mechanics the scripted policy doesn't drive intelligently
  regardless of where they're sited; siting is one confound, not necessarily
  the only one.

## Context you'll need

- `docs/reviews/2026-08-02-full-fusion-roster-sweep.md` — read first, full
  method and the §0 siting caveat this session investigates.
- `elementia-fusion-roster-sweep` memory — the compressed version of the
  above.
- `docs/reviews/2026-07-25-firepit-falsification-test.md` — precedent for the
  SAME siting-bug class on a standalone structure, and how it was diagnosed.
- `test/harness/matchRunner.js` ~line 190-300 — `runBuildPolicy`, the free
  special placement loop and the (already-fixed) defense-arm site list to
  match its pattern against.
- `test/harness/fusionRoster.js` — reuse this script's structure; don't
  reinvent the six-fusion sweep harness.
- `elementia-baseline-review-lessons` memory — hang-imputation/split-half
  discipline, required on every claim this session makes.

## Output

A dated review doc under `docs/reviews/`, same format as the fusion roster
sweep it extends: flank-vs-funnel comparison per fusion, both mazes, hang
gate re-confirmed, explicit verdict on whether STEAM_VENT/GRINDER/BLIZZARD's
readings change. Ranked recommendations for Philip to rule on if anything
does change — same pattern as every prior sweep, nothing landed unilaterally.

**Recommended model: Sonnet 5** — this is harness-driven measurement plus a
small, well-scoped parameterization of an existing function, same tier as
the fusion roster sweep itself. Escalate to Opus only if the site-list change
interacts with flow-field geometry in a way that produces a NEW hang pattern
(same escalation trigger this project has used for every soft-lock
investigation) — don't debug a fresh soft-lock on Sonnet.
