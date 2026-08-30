# Blizzard / Steam Vent siting sign-flip — mechanism diagnosis

**Date:** 2026-08-04 · **Branch:** `codex/redesign-reconciliation` ·
**Task 20 §0** (`docs/handoffs/2026-08-04-blizzard-steamvent-siting-decision.md`)
· Suite 611/613 pass, 2 skipped, 0 fail after the changes below.

## Verdict

**The flank-vs-funnel sign flip is an instrument artifact, not a property of
either fusion.** It is a Firepit-class defect: the arm labelled "flank" was
never off-lane, and the score difference between the two arms is produced by
where the scripted policy's **blocking Watchtower** ends up, not by where the
fusion stands.

With the confound removed, both structures are siting-**insensitive** to within
noise, and both have a real, positive, previously-invisible mechanic value on
maze B.

**§1 of the handoff — Philip's ruling on intended siting — is moot.** There is
no siting question to answer. The remaining open question is a different one: a
maze A / maze B split (see §5).

## 1. Two defects, found in order

### 1a. "Flank" siting was never off-lane

Every special is **2 tiles wide**, and footprints are anchored **top-left**
(`server/game/structures.js:48`). `towerSites`' first entry is
`[gap - 1, wallRow + 1]` (`test/harness/matchRunner.js:162-171`) — sized for the
1x1 blocking Watchtower it was written for. A 2-wide special placed there
occupies `gap - 1` **and `gap`**, i.e. it stands in the one-tile lane, exactly
like the "funnel" arm it is supposed to be contrasted against.

Placement is deterministic and identical in all 144 cells:

| maze | arm | anchor | tiles covered | gap column |
|---|---|---|---|---|
| A | tower ("flank") | (12,9) | 12–13 | 13 |
| A | funnel | (13,9) | 13–14 | 13 |
| B | tower ("flank") | (4,9) | 4–5 | 5 |
| B | funnel | (5,9) | 5–6 | 5 |

So the published A/B is not flank-vs-lane. On maze A it is *"covers columns
12–13"* vs *"covers 13–14"* — **a one-tile shift, with both arms in the lane.**

### 1b. The one-tile shift moves the Watchtower, and that is what scores

An `offLaneSites` arm was added (anchors `[gap + 1]` / `[gap - 2]`, the first
placements that actually clear the gap column) to get a real three-way read.
Maze A, n=144, vs a no-free-special anchor of 8.592:

| Blizzard | offlane | tower ("flank") | funnel |
|---|---|---|---|
| live | −0.946 (t6.98) | **+0.314 (t3.49)** | −0.905 (t7.31) |
| inert (dmg 0, freeze off) | −0.767 (t6.36) | +0.061 (t0.57) | −0.575 (t4.56) |

A **fully inert** walkable body swings 0.83 score points on position alone. An
inert walkable structure has almost no way to affect a match — except that it
consumes a build tile, and the policy's Watchtower (which **is** blocking, and
does reshape the cost field) takes the first free `towerSites` entry after it.

Measured Watchtower columns, maze A gap 13, 24 seeds x 2 posts:

| arm | col 12 (west) | col 14 (east, hall-side) |
|---|---|---|
| offlane | 141 | 43 |
| tower | 74 | **110** |
| funnel | 143 | 49 |

The two arms that push towers **west** (offlane, funnel) both score badly; the
one that pushes them **east** scores well. The scores track the Watchtower
column, not the fusion's column.

### Falsification

Price the Watchtower out of the policy's reach so the fusion's own tile is the
only thing that differs. Maze A, n=144:

| | offlane | tower | funnel |
|---|---|---|---|
| inert, towers ON | −0.767 (t6.36) | +0.061 (t0.57) | −0.575 (t4.56) |
| **inert, towers PRICED OUT** | +0.014 (t0.08) | −0.046 (t0.25) | −0.060 (t0.33) |
| live, towers ON | −0.946 (t6.98) | +0.314 (t3.49) | −0.905 (t7.31) |
| **live, towers PRICED OUT** | −0.259 (t1.49) | +0.074 (t0.47) | +0.016 (t0.10) |

The spread collapses from 1.26 score points to noise. Confirmed.

## 2. Hypotheses that were tested and rejected

Recording these so they are not re-run:

- **"The control arm moved, not the fusion."** Plausible on paper — Blizzard's
  control keeps a Water Geyser (footprint-only selection) and Steam Vent's keeps
  a Firepit (already proven siting-critical). **Falsified:**
  `sitingDecompose.mjs` measured the ingredient against a siting-independent
  no-free-special anchor. Maze A ingredient-vs-none moved +0.012 → −0.169 while
  the fusion arm moved +0.260 → −0.822. The fusion arm is what swung.
- **"Blizzard finds smaller clusters in the lane"** (the handoff's leading
  hypothesis). **Falsified:** `blizzardProbe.mjs` instrumented
  `selectDensestClusterCenter`'s `bestSize` and the bodies actually inside the
  circle at resolution. Maze A: selected 4.06 (flank) vs 3.79 (funnel);
  resolved **4.00 vs 4.00**; kills **1.73 vs 2.19** — the mechanic performs the
  same or slightly *better* in the lane while scoring far worse.
- **"The stuck watchdog is suppressed."** `enemies.js:458` counts
  `attackWalkable` as progress, so a body jammed on top of a walkable structure
  never arms the escape. Real code smell, but **not the cause here:**
  `stuckEscapes` measured ~0.00–0.02 per run in every arm.
- **"The harness's hardcoded `dir: 'S'` free Water Geyser launches enemies
  hallward for waves 1–3."** Real (`matchRunner.js:245`; the harness's own
  Grinder note calls 'S' "toward the hall"), but worth **+0.086 (t0.58)** when
  neutered — not the mechanism.
- **"A walkable body in the lane costs score by itself."** Isolated to a pure
  inert 2x1 free special with no fusion and no partner gold:
  funnel − tower = **−0.123 (t0.89)** on maze A. Not significant.

## 3. Clean verdicts (confound removed)

Watchtowers priced out — a **diagnostic** protocol, not the shipped one (it
lowers the maze A anchor from 8.592 to 7.338 and changes the game). Its only
job is to read each mechanic without the tower confound on top. n=144 per cell.

**MECHANIC = live − inert** (the payload's own worth):

| | maze A tower | maze A funnel | maze B tower | maze B funnel |
|---|---|---|---|---|
| **Blizzard** | +0.120 (t0.72) | +0.076 (t0.46) | **+0.583 (t2.78)** | **+0.569 (t2.76)** |
| **Steam Vent** | +0.174 (t0.89) | +0.181 (t0.91) | **+0.771 (t3.77)** | **+0.840 (t4.13)** |

Whole-structure (live − none):

| | maze A tower | maze A funnel | maze B tower | maze B funnel |
|---|---|---|---|---|
| **Blizzard** | +0.074 (t0.47) | +0.016 (t0.10) | **+0.708 (t3.48)** | **+0.694 (t3.47)** |
| **Steam Vent** | +0.174 (t0.90) | +0.201 (t1.03) | **+1.056 (t4.88)** | **+1.146 (t5.33)** |

Every tower/funnel pair agrees to within 0.09. **The sign flip is gone.**

## 4. Is the mechanic actually useful?

Yes on maze B, for both — clearly and significantly, and for the first time
visibly at all. Not measurably on maze A.

This is **not** a siting split; it is a maze split, and it holds at every siting.
Supporting detail: `blizzardProbe.mjs` measured **12.8 Blizzard activations per
run on maze A vs 4.6 on maze B**. Blizzard fires nearly three times as often on
maze A and contributes less there — consistent with maze A (anchor 8.592 vs maze
B 5.944, i.e. substantially easier) simply not being constrained by the thing
these structures supply.

## 5. What this invalidates, and what to do next

**Reach of the confound.** It lives in `runBuildPolicy`'s free-special path
colliding with `towerSites`, so it applies to **every fusion measurement taken
through this harness** — the full six-fusion roster sweep
(`docs/reviews/2026-08-02-*`), the siting-fix review, and this session's earlier
tweak screens. On maze A the artifact is worth up to ~1.2 score points, which is
larger than most of the effects those reviews reported. Maze B shows no
meaningful spread, so maze B numbers are likely sound; **maze A fusion numbers
should be treated as unverified until re-taken.** Rock Trap's landed standalone
retune went through the `spendDown` / `walkableDefenceSites` path instead and is
not directly implicated, but has not been re-checked.

**Instrument fix — APPLIED 2026-08-04** (`sitingProtocol: 'isolated'`,
opt-in; legacy lists untouched so old numbers stay reproducible). Disjoint
column bands per gap:

| | column band |
|---|---|
| Watchtower (1x1, blocking) | `gap - 1` only, rows 1–6 |
| free special / fusion, funnel | anchor `gap` → covers `gap`, `gap+1` |
| free special / fusion, flank | anchor `gap + 2` → covers `gap+2`, `gap+3` |

No special placement can touch `gap - 1`, so the Watchtower column is identical
in the control arm, in every fusion arm, and at both sitings. The tower's *side*
is pinned by construction rather than left free, because which side it lands on
is exactly what was load-bearing. Depth is 1–6 rather than 1–3 because pinning
the column halves the pool and the policy buys one tower per build phase over
~10 waves.

Pinned by `INSTRUMENT: the isolated siting protocol keeps specials off the
Watchtower column` (`test/harness/matchRunner.test.js`) — asserted across both
mazes and all three arms, so a future change cannot silently reintroduce the
overlap. Pricing towers out, as used in the falsification above, remains a
diagnostic only.

Smoke test (24 seeds, post-revert values): maze A flank −0.340 (t1.09) vs
funnel −0.250 (t1.10) — the sign flip is gone, matching the priced-out
diagnostic.

**Tuning reverted 2026-08-04.** Every 2026-08-02 Task 20 balance change chosen
from a score reading was reverted to spec-original, because all of them rest on
the contaminated instrument:

| structure | reverted |
|---|---|
| Magma Trap | burn 15/3000 → 6/2500; eruption 75 dmg / 30 dps / 160px → 50 / 14 / 140 |
| Muddy Bog | hp 150 → 90; root msByWeight −30%; pulse damage 8 → 3 |
| Blizzard | hp 135 → 90; damage 18 → 12 |
| Steam Vent | hp 160 → 90; pulse damage 25 → 4 |
| Grinder | hp 160 → 90; damage 60 → 45 |

**Kept:** Steam Vent's `cloudMarginPx` 16 → 15 — a spillover bug fix with a
purely geometric justification, not a balance choice. The Firepit and Rock Trap
tracks went through the `spendDown` / `walkableDefenceSites` path and are
untouched.

Reverting Magma Trap also restored a spec invariant the buff had broken: §7
requires Firepit's passive output to exceed Volcano's, but the buff put Magma
Trap's passive burn at 15 against Firepit's 9.

Three pinned harness tests moved and were updated with reasons, per the
project's existing convention: the full-clear seed (20261085 → 20260838), the
default run's pinned figures (score/waves 8 → 6, enemySeconds 1614.0 → 850.1),
and the CC-seconds coverage guard. That last one is worth reading rather than
skimming: on the shortened default run `ccSeconds` fell to exactly 0.00 against
119 ability hits, because the EARTH human's Fissure roots and damages on the
same hit and was killing every enemy it caught in the same frame. Same shape as
Muddy Bog's one-shot note. The guard was moved to a genuine 10-wave seed rather
than weakened to accept zero.

Suite 612/614, 2 skipped, 0 fail. `npm run build` clean.

**Open question for Philip** (replaces the siting ruling, which is moot): both
fusions read positive on maze B and flat on maze A. Is "useful on the harder
layout, redundant on the easier one" an acceptable verdict for A1.4(a), or does
it need to clear a bar on both?

## Artifacts

Harness scripts added (none are `.test.js`; same convention as `probe.js`):

- `test/harness/sitingDecompose.mjs` — three-arm decomposition against a
  siting-independent anchor
- `test/harness/blizzardComponents.mjs` — damage/freeze/body payload isolation
- `test/harness/blizzardProbe.mjs` — per-activation cluster size and resolved hits
- `test/harness/funnelBodyProbe.mjs` — score split (waves vs hall) + jam telemetry
- `test/harness/funnelBodyConfirm.mjs` — n=144 confirmation of the body effect
- `test/harness/inertBodyIsolate.mjs` — pure inert 2x1, no fusion, split by postGap
- `test/harness/laneCoverageSweep.mjs` — three-way sweep incl. the new off-lane arm
- `test/harness/sitingConfoundTest.mjs` — the falsification (towers priced out)
- `test/harness/cleanFusionVerdict.mjs` — clean verdicts, both fusions, both mazes

Production changes (both narrow, both opt-in, suite green):

- `server/game/structureBehaviors/targetImpact.js` —
  `selectDensestClusterCenter` now also returns the winning cluster's `size`,
  and `resolveUniformImpact` records per-activation counts **only when
  `state.tiProbe` is set** (same harness-sets-it-on-state convention as
  `state.aoeStats`). No behavior change with the probe absent.
- `test/harness/matchRunner.js` — `tiProbe` scenario param; new
  `offLaneSites(maze)` reachable via `freeSpecialSites: 'offlane'`. `towerSites`
  and `funnelSites` untouched, so existing baselines stay byte-comparable.
