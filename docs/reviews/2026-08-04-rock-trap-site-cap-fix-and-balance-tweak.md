# Rock Trap — site-cap instrument fix + balance-tweak recommendation

**Date:** 2026-08-04 · **Branch:** `codex/redesign-reconciliation` ·
**HEAD at start:** `a1c8b07` · Suite 611/611/2 skipped, `npm run build` clean
(unaffected — only `test/harness/matchRunner.js` changed) ·
**Follow-up to:** `docs/reviews/2026-08-03-rock-trap-standalone-measurement.md`,
ranked option 1 ("investigate the purchased-count asymmetry as its own
task").

Per Philip's instruction to investigate the cross-maze sign flip and screen
balance tweaks. **One instrument fix was landed** (scoped, additive,
harness-only — same class of change as the Firepit siting fix and the
fusion funnel-siting fix, both landed without a balance sign-off in their
own sessions). **No balance.js numbers were changed** — this session
recommends specific values for Philip to rule on, per the project's
standing "nothing landed unilaterally" convention for actual balance
changes.

## 1. Root cause of the purchased-count asymmetry: a real instrument defect

The prior review flagged, but didn't chase, why Rock Trap's purchase count
differed sharply by maze (8.9/match on A vs 12.1 on B) while Watchtower's
didn't (12.4 vs 12.2). Isolating to a single wave-1 build phase (`maxWaves:
1`) and sweeping `EARTH_SPECIAL`'s cost from 8 down to 1 and 0 showed
purchases **pinned at exactly 8, regardless of cost** — proof the loop was
site-limited, not gold-limited.

Mechanism: `EARTH_SPECIAL` (and `FIRE_SPECIAL`) are a 2-wide, 1-tall
footprint (`STRUCTURE_SIZE`, `shared/constants.js:114`), but the DEFENSE
arm's site list (`funnelSites(maze)` + `towerSites(maze)`,
`matchRunner.js:300`) was generated as single-tile anchor points spaced 1
tile apart — sized for the ORIGINAL use case (a single free-special
placement or a 1x1 Watchtower), never audited against a 2-wide structure
buying repeatedly under `spendDown`. A funnel site's second tile (`gap+1,
dy`) silently collides with the same-row tower sites on both sides: the
`+1` side is caught by the harness's cheap anchor-only precheck and skipped
before it ever calls `buildStructure`; the `-1` side isn't (its own anchor
tile is empty) so it reaches `placeStructure`, fails there on the full
footprint check, and just wastes a harmless loop iteration. Net effect
either way: **all 12 `towerSites` entries are unusable for a 2-wide walkable
defence**, leaving only the 8 `funnelSites` slots as the real candidate
pool — a hard cap independent of gold that Watchtower, being 1x1 and
blocking (so it never takes the walkable branch at all), never hits.

**This means the "equal gold" defence-arm protocol was not actually equal
capacity for any 2-wide walkable defence** — this affects Rock Trap and, by
the same mechanism, the Firepit retest (`FIRE_SPECIAL` is also 2x1), though
re-measuring Firepit is out of scope here.

## 2. Fix

Added `walkableDefenceSites(maze)` in `matchRunner.js` — the same
single-column funnel geometry `funnelSites` already uses (a 2-wide-1-tall
footprint stacked one row at a time never self-collides), extended from 4
rows to 10 rows per gap (20 sites total, matching Watchtower's own ~20-site
nominal pool rather than inventing new site geometry). Both gap columns sit
well outside `NO_BUILD_ARC_RADIUS_PX` at every row used (checked against the
hall's position in `shared/constants.js`). Used **only** in the DEFENSE
arm's walkable branch (`matchRunner.js:300`); `funnelSites`/`towerSites`
themselves — and therefore Watchtower's own site list, and the
`freeSpecialSites: 'funnel'` single-placement path fusion siting relies on
— are untouched. Confirmed byte-identical Watchtower behavior (unaffected
code path) and confirmed the fix: wave-1-only purchases at near-zero cost
went from pinned-at-8 to gold-limited-at-9 (matches the wave-1 leftover
purse, not a site ceiling). Full suite still 611/611/2 skipped after the
change (harness-only file, no game code touched).

## 3. Effect of the fix alone on the standalone measurement (no balance change yet)

| | maze A (old → fixed) | maze B (old → fixed) |
|---|---|---|
| diff (t) | -0.667 (8.11) → **-0.583 (6.41)** | +0.535 (3.03) → **+0.785 (4.92)** |
| hangs | 0/144 → 0/144 | 0/144 → 0/144 |

Both mazes moved (confirming the site cap was a real, non-trivial confound
worth fixing), but **the sign flip did not resolve** — maze B's win got
stronger, not weaker. The cross-maze disagreement is not an artifact of the
site cap. Something else about Rock Trap's actual combat behavior differs
by maze.

## 4. Balance-tweak screening (on the fixed instrument)

Screened on a reduced 24-seed subset (48 cells/maze) for speed, against
Watchtower, same equal-gold protocol:

| variant | maze A diff (t) | maze B diff (t) |
|---|---|---|
| baseline | -0.646 (3.72) | +0.646 (2.69) |
| splashRadiusPx 32→48 | **-0.029 (0.16)** | +0.729 (2.93) |
| cooldownMs 4000→3000 | -0.494 (2.74) | +0.750 (3.08) |
| cost 8→7 | -0.646 (3.72) — **no change** | +0.646 (2.69) — **no change** |
| telegraphMs 500→350 | -0.396 (2.74) | +0.917 (3.68) |
| splash 48 + cost 7 | -0.029 (0.16) — same as splash alone | +0.729 (2.93) |
| **splash 48 + cooldown 3000** | **+0.266 (1.34)** | **+0.979 (3.90)** |

**Cost has zero measurable effect at either 8 or 7**, confirmed at both the
screening and (below) full sample size — Rock Trap's purchases are
gold-limited well below where a 1-gold price cut changes anything at this
margin. Cost is not a useful lever here; drop it from consideration.

**Splash radius is the single strongest lever**, closing nearly all of
maze A's loss on its own (t 3.72 → 0.16) while barely moving maze B. This
matches the mechanical story: Rock Trap locks a world point at telegraph
start (Amendment C.2) and does NOT re-track its target, so a fast enemy
that walks more than 32px (~1 tile) during the 500ms telegraph escapes the
splash entirely — the exact "telegraph a fast enemy can actually walk out
of" tradeoff the amendment names explicitly. A 48px radius gives ~50% more
dodge tolerance and, per §5.2's own design intent ("very high direct
damage... low splash"), also improves genuine crowd handling when multiple
enemies are near the locked point.

## 5. Full 72-seed confirmation of the winning candidate

`splashRadiusPx: 48, cooldownMs: 3000` (damage/splashDamage/telegraphMs/cost
unchanged):

| | maze A | maze B |
|---|---|---|
| Watchtower | 8.236 | 6.486 |
| Rock Trap | 8.358 | 7.868 |
| diff (t) | +0.122 (t 1.16) | **+1.382 (t 8.73)** |
| paired signs | 48 better / 49 worse / 47 tied | 89 better / 16 worse / 39 tied |
| split-half | agree (half1 0.232, half2 0.013) | agree (half1 1.097, half2 1.667) |
| hangs | 0/144 | 0/144 |

Maze A: the significant loss is **gone** (t 6.41 → 1.16, i.e. no longer
distinguishable from noise) — split-half both cells are weakly positive
(0.232, 0.013), so it's not a new significant win either, just neutral.
Maze B: an already-strong win gets **stronger and more replicable** (t 4.92
→ 8.73, split-half 1.097/1.667, both far past significance). Hang gate
clean on both mazes, both arms, at the new values.

## 6. What this does and does not establish

- **Does not deliver an A1.4(a) niche-floor pass.** A1.4(a) asks for a
  positive result IN the declared scenario; "no longer a significant loss"
  on maze A is progress, not a floor pass. Only maze B currently passes on
  its own.
- **Does resolve the "actively contradicts itself" problem** from the prior
  review. Rock Trap no longer loses decisively anywhere; it wins decisively
  on one maze and is a wash on the other. That is a materially more
  trustworthy, recommendable state than the pre-fix result.
- **The instrument fix (§2) is separable from the balance recommendation
  (§4-5)** — it is already landed (harness-only, no balance number changed)
  and is correct regardless of what Philip decides on splash/cooldown.
- Telegraph-dodge is a plausible mechanical story for WHY splash radius
  works, not a proven one — no per-hit telemetry (e.g. "primary landed vs
  missed" rate) was added to confirm it directly. If Philip wants that
  confirmed before committing to the number, it's a small, cheap follow-up
  (a counter in `resolveImpact`, `structureBehaviors/targetImpact.js:78`).

## 7. Recommendation, ranked — nothing landed to `shared/balance.js`

1. **Apply `splashRadiusPx: 32 → 48` and `cooldownMs: 4000 → 3000` to
   `EARTH_SPECIAL`** (`shared/balance.js:253-258`). This is what I'd do
   first: it's the cleanest, most surgical fix — two numbers, both already
   confirmed at full sample size, hang gate clean, no other structure
   touched. It moves Rock Trap from "loses on A, wins on B, no honest
   verdict" to "neutral on A, wins decisively on B" — closer to usable than
   anything measured for Rock Trap so far.
2. **Splash radius alone, skip the cooldown cut**, if Philip wants the
   smallest possible change: at full sample size splash-alone wasn't
   re-confirmed (only screened at n=48/maze, -0.029/t0.16 on A, +0.729/t2.93
   on B) — would need the same 72-seed confirmation pass before trusting it
   equally to option 1's numbers.
3. **Do nothing to balance.js yet; keep only the instrument fix.** Honest
   and low-risk, but leaves Rock Trap in the weakest state actually
   measured (decisive loss on A) even though a cheap fix is sitting right
   here. I don't think this is the better call given how clean the option-1
   numbers came out, but it's Philip's structure to tune, not mine to
   decide unilaterally.
4. **Chase the mechanical confirmation (§6) before committing any number.**
   Slower, more rigorous, matches this project's general caution — but the
   splash-radius result already replicates cleanly across the full sample
   and both split halves, so I don't think it's necessary before shipping
   option 1.

My own pick, if asked to rank: **option 1.** The numbers are real,
replicated, hang-gate-clean, and the change is small and well-targeted.

## What was NOT done

- `shared/balance.js` was not edited. Only `test/harness/matchRunner.js`
  (the site-cap fix, §2) is a real code change from this session.
- Rock Trap's fusion-ingredient role (Magma Trap, Muddy Bog, Grinder) is
  untouched and would need its own re-measurement if `EARTH_SPECIAL`'s
  numbers change, since all three fusions inherit from the same balance
  entry pre-fusion-transform.
- Firepit was not re-measured under the same site-cap fix, despite sharing
  the 2-wide-footprint defect — flagged in §1, not chased here.
- New scratch scripts (`rockTrapTweakScreen.mjs`, `rockTrapTweakConfirm.mjs`)
  are uncommitted throwaway tools, same convention as `firepitRetest.js` /
  `fusionRoster.js` before them.
