# Six-fusion roster sweep, re-taken on the isolated instrument — Task 20

**Date:** 2026-08-04 · **Branch:** `codex/redesign-reconciliation` ·
**Instrument fix committed at** `4937f2a` ·
**Supersedes:** `docs/reviews/2026-08-02-full-fusion-roster-sweep.md` for every
score number; **does not** supersede its hang-gate or `comboFormed` findings,
which replicate.

**Status: this draft was rewritten after an adversarial review found ten
problems in the first version, four of them verdict-changing.** What survived
and what did not is recorded in §9, because the failure modes are reusable.

**Headline: one fusion passes — Firestorm — and the magnitude is roughly a
quarter of what the first draft claimed.** This verdict moved twice. The first
draft passed Firestorm on a single outlier cell (wrong reason, right answer);
the second draft withdrew it to NO VERDICT; adding the paired statistic (§2a)
restored it on evidence that actually replicates across siting. The number to
quote is **+0.26, not +0.93** (§5).

**Update, 2026-08-04 (second revision):** the paired statistic described in §2a
as an open question has since been **implemented** (`stats.js`, `pairedT` /
`signTest` / `pairedDeltas`, pinned by six tests) and wired into
`fusionRoster.js`, which now prints all three statistics and flags cells where
they disagree. Both isolated sweeps were re-run. **10 of 48 cells disagree**,
and one of them changes a verdict. Sections 2a, 5, 6 and 7 reflect the re-run.

**Raw data (gitignored scratch, reproducible from the script):**

```
node test/harness/fusionRoster.js --maze both --protocol isolated --out test/harness/.roster-isolated.json
node test/harness/fusionRoster.js --maze both --protocol isolated --siting funnel --out test/harness/.roster-isolated-funnel.json
node test/harness/fusionRoster.js --maze both --out test/harness/.roster-legacy-currentvalues.json
```

The third run is the **legacy-protocol control at today's balance values**. It
exists because the published 2026-08-02 numbers were taken at different values,
so old-vs-new is not an instrument comparison.

## 0. What this sweep measures, stated before the numbers

The 2026-08-02 sweep declared its scenario and skill dependency in advance per
Amendment A1.4. That declaration is **unchanged and still binding** — it is a
property of the structures and the policy, not of the instrument:

- `MAGMA_TRAP`, `FIRESTORM`, `MUDDY_BOG`, `STEAM_VENT` — zero skill dependency.
  Their numbers are honest floor-test evidence.
- `BLIZZARD` and `GRINDER` — **the spec itself names both as policy-confounded**
  ("Blizzard (cluster timing)... and Grinder all have value that a dumb policy
  cannot express"). A flat or negative number for either is evidence about the
  policy, not the structure. Fixing the siting instrument does **nothing** for
  this; it is an orthogonal defect.

**The quantity in these tables is not an A1.4(a) power unit.** A1.4(a) asks for
≥ 1.0 × the score contribution of one `WATCHTOWER` at equal gold. What
`fusionRoster.js` reports is a *paired trade delta*: the fusion arm spends the
entire 8-gold opening purse on the partner special, while the control arm keeps
that gold and the policy spends it on a Watchtower (6) plus barricades. A delta
of 0 means "worth about what 8 gold of towers-and-barricades is worth" —
adjacent to the A1.4(a) anchor, not equal to it, and not convertible into power
units without the standalone Watchtower-anchored protocol Rock Trap's retune
used.

**Decision rule, applied consistently below:** a significantly negative delta is
an unambiguous A1.4(a) failure. A significant positive is *necessary but not
sufficient* for a pass. **Neither significant** is `NOT RESOLVED` — not a fail.
The first draft violated its own rule here by marking Steam Vent FAIL on eight
non-significant cells; that is corrected.

## 1. Hang gate — PASSES, 0 / 10,368

6 fusions × 2 mazes × 2 sitings × 3 arms × 144 cells. **Every cell reads
`control 0/144  wave1 0/144  wave4 0/144`** — no aggregate hiding a non-zero
cell, the failure mode `elementia-spawn-grid-artifact` warns about.

`comboFormed`: **144/144 built the intended combo in all 24 fuse-arm ×
maze × siting cells, 0 mismatches anywhere.**

The 2026-08-02 gate's 0/5,184 result therefore **replicates and roughly
doubles** under a protocol that places the fusion on entirely different tiles.
This is the strongest surviving conclusion from the old sweep, and the only one
this review did not have to weaken.

## 2. Score effect — and a statistic the project has been getting wrong

### 2a. The harness's t-test discards the pairing

`fusionRoster.js` runs control and fuse arms **over the same seeds**, then hands
the two arrays to `classify()`. `stats.js:117` computes
`se = sqrt(sd_lo²/n_lo + sd_hi²/n_hi)` — a **two-sample Welch SE, unpaired**.
Between 51 and 100 of the 144 cells are *tied* in a typical arm, so the arms are
heavily correlated and discarding the pairing throws away most of the power.

This is a project-wide harness issue, not a defect of this sweep. **`classify`
is deliberately not changed** — every published baseline used it, and silently
redefining it would change what those numbers mean without re-running any of
them. Instead `stats.js` gained two additive second opinions:

- **`pairedT`** — a paired t on the per-cell deltas. Signed, unlike `classify`'s
  `effect`, which takes an absolute value (losing direction is how a regression
  gets reported as an improvement).
- **`signTest`** — an exact two-sided sign test on the better/worse counts.
  Distribution-free, so unlike the t it cannot be fooled by the score metric's
  discreteness — scores are wave counts, a handful of integers, not a continuum.
  Strictly less powerful when the t's assumptions hold, which is why both run.

`fusionRoster.js` now prints all three and marks any cell where they reach
different verdicts with `<-- STATISTICS DISAGREE`.

### The disagreement map (both isolated sweeps, 48 cells)

**10 of 48 cells disagree.** In every one, the paired t resolves an effect the
Welch t calls noise — the direction of the power loss is uniform, exactly as
predicted.

| cell | Δ | Welch | paired | sign p |
|---|---|---|---|---|
| **wave 4** | | | | |
| MAGMA_TRAP B flank | −0.229 | 1.37 | **−2.07** | **0.027** |
| BLIZZARD A funnel | −0.183 | 1.39 | **−2.36** | **0.011** |
| BLIZZARD B funnel | +0.277 | 1.33 | **+2.15** | **0.012** |
| **FIRESTORM B funnel** | **+0.257** | 1.28 | **+2.55** | 0.082 |
| **wave 1** | | | | |
| MAGMA_TRAP A flank | −0.250 | 1.92 | **−2.67** | 0.201 |
| STEAM_VENT A flank | −0.278 | 1.77 | **−3.12** | **0.020** |
| MUDDY_BOG A funnel | −0.236 | 1.99 | **−2.46** | 0.215 |
| GRINDER A funnel | −0.222 | **2.05** | **−2.50** | 0.101 |
| STEAM_VENT A funnel | −0.222 | 1.53 | **−2.48** | 0.200 |
| FIRESTORM B funnel | +0.313 | 1.60 | **+2.45** | 0.182 |

Read the sign test as the conservative check: where it also clears (four cells),
the effect is solid. Where only the paired t clears, treat it as real but
provisional — the t is the more powerful test but the one making distributional
assumptions this metric strains.

**The Firestorm B funnel row is the verdict-changing one** (§5, §6).

### 2b. Wave 4 — the defensible timing

Δ (Welch t) · **bold** = Welch t > 2 · `§` = significant by sign test only ·
`†` = significant by Welch only.

| fusion | A flank | A funnel | B flank | B funnel |
|---|---|---|---|---|
| MAGMA_TRAP | −0.049 (0.41) | +0.090 (0.79) | −0.229 (1.37) `§` | +0.007 (0.04) |
| MUDDY_BOG | **−0.236 (2.30)** | +0.063 (0.58) | **−0.583 (3.26)** | **−0.403 (2.21)** |
| GRINDER | −0.132 (1.31) | +0.000 (0.00) | −0.014 (0.09) | +0.014 (0.08) |
| STEAM_VENT | −0.118 (0.83) | −0.083 (0.58) | −0.243 (0.98) | −0.021 (0.10) |
| FIRESTORM | −0.023 (0.13) | −0.016 (0.09) | **+0.931 (4.11)** | +0.257 (1.28) |
| BLIZZARD | **−0.368 (2.12)** | −0.183 (1.39) `§` | **+0.432 (2.33)** | +0.277 (1.33) `§` |

Sign-test p for the `§` cells: Magma Trap B flank **0.027** (24 better / 43
worse), Blizzard A funnel **0.011** (18/38), Blizzard B funnel **0.012**
(59/34).

### 2c. Wave 1

| fusion | A flank | A funnel | B flank | B funnel |
|---|---|---|---|---|
| MAGMA_TRAP | −0.250 (1.92) | −0.104 (0.80) | **−0.528 (3.05)** | −0.028 (0.16) |
| MUDDY_BOG | **−0.514 (4.37)** | −0.236 (1.99) | **−0.861 (4.78)** | **−0.632 (3.29)** |
| GRINDER | **−0.299 (2.64)** | **−0.222 (2.05)** `†` | −0.111 (0.66) | **−0.542 (2.91)** |
| STEAM_VENT | −0.278 (1.77) `§` | −0.222 (1.53) | −0.146 (0.59) | −0.063 (0.31) |
| FIRESTORM | −0.236 (1.37) | −0.101 (0.64) | **+0.926 (4.18)** | +0.313 (1.60) |
| BLIZZARD | **−0.381 (2.39)** | −0.085 (0.67) | +0.199 (1.01) | −0.052 (0.23) |

`T_CRIT` is 2 with a strict `>`, so Muddy Bog's maze-A funnel wave-1 cell
(t 1.99) is not bolded. Grinder maze-A funnel is the one cell where Welch calls
significance and the sign test does not (p = 0.10).

**Counts, corrected from the first draft:** 15 cells clear Welch t > 2 (6 at
wave 4, **9** at wave 1). Of the 9 at wave 1, **8 are negative** and one
(Firestorm B flank) is positive. 21 of 24 wave-1 cells are negative.
**All 15 Welch-significant cells also agree across seed halves.**

**Split-half disagreements: 14, not 10** (4 in the flank run, 10 in the funnel
run). The first draft claimed they "cluster on cells within ~0.1 of zero"; that
is **false for two of them**, both Steam Vent maze B flank (−0.146 and −0.243),
which matters in §6.

### 2d. Wave-1-is-a-trap — a weaker claim than the first draft made

The first draft called this "the most-replicated result in the project." It is
not, for two reasons it did not acknowledge:

- **The cells are not independent.** Flank and funnel are separate runs over the
  **same 72 seeds**, and within one cell wave 1 and wave 4 **share the same
  control array** (`fusionRoster.js:108-110`). "21 of 24" counts correlated
  observations as independent.
- **Half the significant cells are policy-confounded.** Strip Blizzard and
  Grinder per §0 and the 8 significant wave-1 negatives reduce to **4**:
  Muddy Bog ×3 and Magma Trap ×1. Three of four are one structure.

The finding still points the same way and no cell contradicts it. But the
honest statement is "consistent with, and nowhere contradicted by, this sweep" —
not "most-replicated."

## 3. Did siting stop mattering? The sign flip is gone; the magnitude is not

The confound diagnosis predicted the flank-vs-funnel **sign flip** would
disappear. It did:

- **No fusion changes sign between flank and funnel at wave 4 with both cells
  ≥ 0.10 in magnitude.** Sign changes do occur (Magma Trap on both mazes, Muddy
  Bog on A, Grinder on B), but in every case one side sits within 0.10 of zero.
  Grinder maze A goes to exactly 0.000, which is not a sign change at all.
  The 1.26-point maze-A spread that motivated the fix is gone.
- Largest remaining wave-4 flank/funnel gap: **0.674** (Firestorm, maze B).
  Median: **0.17**.

| | flank − funnel, wave 4 |
|---|---|
| maze A | −0.14, −0.30, −0.13, −0.04, −0.01, −0.19 — funnel better 6/6 |
| maze B | −0.24, −0.18, −0.03, −0.22, **+0.67**, +0.16 — funnel better 4/6 |

Funnel siting is better in **10 of 12** wave-4 cells (sign test p ≈ 0.04, and
the cells are not independent, so treat that as suggestive only).

**The first draft asserted a mechanism here — "walkable structures in the lane
get more crossings; that is a real property, not an artifact" — and that
assertion is withdrawn.** It is un-instrumented, and it is exactly the kind of
plausible-story-for-a-number this project's own history says to distrust. Two
things argue against taking it at face value:

1. Under the isolated protocol the **blocking** Watchtower column (`gap-1`) sits
   *immediately adjacent* to the funnel anchor (`gap`, covering `gap`/`gap+1`)
   and two columns from the flank anchor. The flank-vs-funnel difference
   therefore still contains a pathing interaction with the blocking column. The
   protocol removed the *displacement* confound, not every interaction.
2. It does not explain Firestorm on maze B at all (§5).

## 4. Instrument-only comparison against the 2026-08-02 sweep

The obvious comparison — old sweep vs this one — is **not** instrument-only.
`shared/balance.js` has exactly three live value changes since `ca4a76e`: Rock
Trap `splashRadiusPx` 32→48 and `cooldownMs` 4000→3000, and Steam Vent
`cloudMarginPx` 16→15. (`targetImpact.js` also changed; that diff was audited
and is behavior-neutral — it adds a `size` field to the selector's return and
increments counters only under `state.tiProbe`. The legacy site lists in
`matchRunner.js` are untouched, and the one changed call site,
`walkableDefenceSites`, is unreachable from `fusionRoster.js`. So the legacy
control run is a valid control.)

A legacy-protocol sweep was therefore re-run **at today's values**. Wave 4:

| fusion | 2026-08-02 legacy<br>(old values) | today legacy<br>(current values) | today **isolated** flank | protocol difference |
|---|---|---|---|---|
| **maze A** | | | | |
| MAGMA_TRAP | +0.113 (1.50) | **+0.295 (2.49)** | −0.049 (0.41) | −0.344 |
| MUDDY_BOG | +0.063 (0.96) | +0.097 (0.84) | **−0.236 (2.30)** | −0.333 |
| GRINDER | +0.020 (0.31) | +0.132 (1.14) | −0.132 (1.31) | −0.264 |
| STEAM_VENT | −0.176 (1.57) | +0.309 (1.97) | −0.118 (0.83) | −0.427 |
| FIRESTORM | **+0.454 (3.94)** | **+0.794 (5.24)** | −0.023 (0.13) | −0.817 |
| BLIZZARD | **+0.219 (2.11)** | **+0.416 (4.01)** | **−0.368 (2.12)** | −0.784 |
| **maze B** | | | | |
| MAGMA_TRAP | +0.174 (1.11) | −0.111 (0.60) | −0.229 (1.37) | −0.118 |
| MUDDY_BOG | −0.021 (0.13) | **−0.424 (2.13)** | **−0.583 (3.26)** | −0.159 |
| GRINDER | +0.139 (0.87) | −0.139 (0.75) | −0.014 (0.09) | +0.125 |
| STEAM_VENT | −0.132 (0.73) | −0.111 (0.53) | −0.243 (0.98) | −0.132 |
| FIRESTORM | **+0.368 (2.38)** | +0.264 (1.31) | **+0.931 (4.11)** | **+0.667** |
| BLIZZARD | +0.122 (0.65) | **+0.514 (2.42)** | **+0.432 (2.33)** | −0.082 |

**What this supports:**

- **The two protocols disagree on maze A in all 6 cells**, mean **−0.50**, range
  −0.26 to −0.82, in the direction the falsification test predicted. Under
  legacy at today's values maze A shows three Welch-significant positives (Magma
  Trap t2.49, Firestorm t5.24, Blizzard t4.01) plus Steam Vent at t1.97; **all
  four vanish or invert under the isolated protocol.**
- **The two protocols agree on maze B**, 5 of 6 within ±0.16, no verdict
  changing on any of those five. The diagnosis's guess that maze B was largely
  sound is supported. **Firestorm is the sole exception** (+0.667).

**What this does NOT support, corrected from the first draft:**

- The first draft said "the legacy instrument was manufacturing maze-A wins."
  Too strong. `isolatedTowerSites` is **not** the same control arm as
  `towerSites`: legacy is dy 1–3 across **both** flanks (`gap-1` *and* `gap+1`);
  isolated is dy 1–**6** on `gap-1` **only**. Same site count, but the
  Watchtowers now stack six deep in one column instead of spreading across two,
  and the maze-A control mean moves 7.958 → 7.375. The column therefore bundles
  the displacement fix with a wholesale change to where the *control* arm's
  towers go. The defensible statement is the one above: **the two protocols
  disagree on maze A by a mean of −0.50, in the predicted direction.**
- The first draft attributed the old→today legacy movement to Rock Trap's buff
  and called the question "settled." **Withdrawn.** Only 1 of 6 cells clears
  t = 2, and it is Steam Vent — the one fusion carrying a second balance change
  (`cloudMarginPx` 16→15) which is a *nerf* and should push it **down**; it went
  **up 0.485**. Worse, the mechanism predicts a split that the data contradicts:
  Rock Trap is the human's free special for the EARTH-human fusions (Magma Trap,
  Muddy Bog, Grinder) and is **consumed by the fusion**, so buffing it should
  push those three *negative*; for the other three it is a hall-sited bot seed
  structure present in both arms and should largely **cancel**. Observed maze-A
  movement: EARTH-human +0.18/+0.03/+0.11, non-EARTH +0.49/+0.34/+0.20 — the
  cells predicted to cancel moved most. **This is unexplained movement between
  two single runs, not an attributed cause,** and it is the reason §6 no longer
  reassigns causation for Muddy Bog or Blizzard.

## 5. The Firestorm maze-B anomaly — and why the first draft read it backwards

The first draft called this "two independent comparisons pointing at one cell."
**They are not independent — they share a term:**

- §3 gap = isolated-flank-B (0.9306) − isolated-funnel-B (0.2569) = 0.6737
- §4 difference = isolated-flank-B (0.9306) − legacy-today-B (0.2639) = 0.6667

Both subtract from the same 0.9306; they differ by 0.0070, which is just
`0.2639 − 0.2569`. The "near-identical magnitudes" were a near-tautology.

**The correct read.** Four measurements of Firestorm maze B wave 4 exist:
legacy@old **0.368**, legacy@today **0.264**, isolated-funnel **0.257**,
isolated-flank **0.931**. Three cluster at 0.26–0.37; one is an outlier — and
the outlier is the isolated-**flank** cell. There is one anomaly, not two, and
it belongs to a *siting*, not to maze B.

That inverts the first draft's framing: the 0.931 is the suspect number, and it
was the sole basis for the first draft's claimed pass.

**But the paired statistic changes what follows from that.** The second draft
concluded that because the flank cell is an outlier and the funnel cell was
non-significant, Firestorm had no verdict at all. With the pairing used, the
funnel cell **is** significant, and the full maze-B picture is:

| Firestorm maze B | Δ | Welch | paired | sign p |
|---|---|---|---|---|
| flank, wave 1 | +0.926 | 4.18 | **+4.93** | **0.014** |
| flank, wave 4 | +0.931 | 4.11 | **+5.75** | **0.000** |
| funnel, wave 1 | +0.313 | 1.60 | **+2.45** | 0.182 |
| funnel, wave 4 | +0.257 | 1.28 | **+2.55** | 0.082 |

**Four of four maze-B cells positive and paired-significant, across both
sitings and both timings.** Maze A is flat at both sitings (max |paired t| 1.87,
nothing significant). So the *existence and direction* of Firestorm's effect
replicate across the siting axis — which is precisely what the second draft said
was missing — while the *magnitude* still does not: 0.93 flank vs 0.26 funnel is
a 3.6× gap with no mechanism.

**The honest position: Firestorm's effect is real; its size is unknown, and the
conservative figure is the funnel one (~+0.26).** The flank cell should not be
quoted as Firestorm's power level until the volley probe explains it.

**Untested hypothesis, recorded so the next session need not re-derive it:** a
fixed-radius radial volley wants *area* coverage, not a single-file line. At the
gap column it is centered on the choke where bodies are strung out one-wide; two
columns past it, it may be centered on where the horde fans back out. Testable:
the per-volley hit count is not currently instrumented, but `hitIds.length` at
`server/game/structureBehaviors/volley.js:45` is exactly the quantity, and a
state-flag-gated counter (same pattern as this session's `tiProbe`) is a
few lines. **Do not assume it without measuring.**

## 6. Verdicts

Philip's ruling this session: **positive on either maze is enough** for an
A1.4(a)-direction pass; a fusion need not clear a bar on both. Maze A (anchor
8.592) is substantially easier than maze B (5.944), so demanding a win on a
layout not constrained by what these structures supply would force overtuning.

That ruling stands, and it is what Firestorm passes on.

| fusion | verdict | basis |
|---|---|---|
| **FIRESTORM** | **PASS (direction) — quote +0.26, not +0.93** | Positive and paired-significant in **all four** maze-B cells, across both sitings and both timings (§5); flat on maze A. The effect replicates on the siting axis, which is what a verdict requires. Its *magnitude* does not — the flank cell is 3.6× the funnel cell with no mechanism — so the conservative funnel figure is the one to carry forward, and the volley probe should settle the gap before Firestorm is tuned or used as a reference point. Note the sign test clears only on the flank pair (funnel p 0.082 / 0.182), so this rests on the paired t |
| **MUDDY_BOG** | **FAIL — actively negative** | Significantly negative in 3 of 4 wave-4 cells and 3 of 4 wave-1 cells, by both statistics, split-half agreeing. Zero skill dependency, so this is trustworthy floor-test evidence and the clearest negative the project has measured. **Caveat the first draft omitted:** the non-significant cell is maze A **funnel** at both timings, where wave 4 reads **+0.063, positive**, with split-half *disagreeing*. So it is not negative at both sitings on the easier maze |
| **MAGMA_TRAP** | **FAIL — mildly negative on maze B** | Flat on maze A at both sitings. On maze B flank the sign test calls it **significantly negative** (24 better / 43 worse, p = 0.027) where Welch does not (t1.37), and wave 1 is unambiguous (−0.528, t3.05). The first draft's "worth nothing, no cell within reach of significance" is **wrong**: it is not neutral, it is mildly harmful on the harder maze |
| **STEAM_VENT** | **NOT RESOLVED at wave 4; harmful at wave 1** | Negative in 8 of 8 cells. At **wave 4 — the decision timing — nothing is significant under any of the three statistics** (max \|paired t\| 1.86), so per §0's rule this is not a FAIL. At wave 1 the paired t now resolves maze A at both sitings (−3.12 flank, −2.48 funnel), so the early-fuse harm is real. Worse for interpretability: **all four maze-B readings fail their split-half check** (flank wave 4 splits +0.069 / −0.556). This protocol cannot resolve Steam Vent at the timing that matters |
| **BLIZZARD** | **NO VERDICT** (policy-confounded) | Worth recording that it is nonetheless the **most siting-robust signal in the sweep**: significantly negative on maze A at *both* sitings and significantly positive on maze B at *both* sitings, once the sign test is used (A funnel p = 0.011, B funnel p = 0.012). A1.4 still forbids reading either as a floor test for this structure. The first draft additionally discounted the maze-B positive as inherited from Rock Trap's buff; that attribution is **withdrawn** per §4 |
| **GRINDER** | **NO VERDICT** | Spec-declared policy-confounded. Per Philip's ruling, accepted as **not verifiable by this harness**; needs playtest data. Spec-original values stand untouched — there is a warning comment in `shared/balance.js` saying so, leave it |

**So: one pass, two fails, one unresolved, two no-verdict.** Still a
worse-looking roster than the 2026-08-02 sweep reported, and that is the honest
starting point rather than a regression — the values are spec-original and
untuned, and the instrument that produced the old optimism is the one that was
found defective.

Worth stating plainly: the 2026-08-02 sweep and this one **agree that Firestorm
is the one fusion that works.** They disagree on everything else, and on
Firestorm's size and which maze carries it. Arriving at the same structure by a
different route, on a fixed instrument and a better statistic, is the closest
thing to a replication this project has for any fusion.

## 7. Which 2026-08-02 conclusions survive

| # | 2026-08-02 conclusion | status |
|---|---|---|
| 1 | Hang gate 0/5,184, all six fusions, both mazes, all arms | **SURVIVES** — replicated and doubled to 0/10,368 on different tiles |
| 2 | `comboFormed` 144/144, 0 mismatches | **SURVIVES** — 0 mismatches across 24 cells |
| 3 | Wave-1 fusing is a trap | **SURVIVES, but weaker than claimed** — see §2d: 4 significant negatives once policy-confounded cells are stripped, and the cells are not independent |
| 4 | MAGMA_TRAP is "worth approximately nothing" | **DEAD** — both the sign test (p 0.027) and the paired t (−2.07) call maze B significantly negative. Mildly harmful, not neutral |
| 5 | FIRESTORM "clears t > 2 on **both** mazes" | **HALF SURVIVES** — maze A does not replicate at all (+0.454 t3.94 → −0.023 t0.13, and −0.817 of that is the protocol). Maze B does, at both sitings and both timings under the paired t. So the *both-mazes* claim is dead and the *structure* survives as the roster's only pass — at roughly a quarter of the headline magnitude (§5) |
| 6 | STEAM_VENT "negative in all four cells, never significant" | **SURVIVES exactly** — now negative in all eight cells across both sitings, still not one significant, by either statistic |
| 7 | MUDDY_BOG "is flat everywhere" | **DEAD** — significantly negative in 3 of 4 wave-4 cells. Cause not attributed (§4) |
| 8 | GRINDER: wave-1 trap, wave-4 flat, no verdict available | **SURVIVES** — no verdict available now either, for the unchanged reason |
| 9 | BLIZZARD "mixed and inconsistent between mazes" | **SURVIVES in shape, inverted in polarity** — old: A significant-positive / B flat. New: A significant-negative / B significant-positive, at both sitings. "Inconsistent" is now the wrong word: it is *consistently* maze-split |
| 10 | §0's flank-siting caveat applies to all six equally | **SURVIVES and was an understatement** — not an exposure caveat but a Watchtower-displacement confound worth more than most reported effects |

## 8. No retune is proposed

The session's goal was to re-derive tuning from clean numbers. **No tuning
values are proposed, and Philip should overrule me if he disagrees:**

1. **The quantity measured is not the A1.4(a) bar** (§0). Tuning until a trade
   delta goes positive tunes against "8 gold of Watchtower and barricades," not
   the 1.0-power-unit anchor. Rock Trap's landed retune used a proper Watchtower
   anchor; these numbers cannot support the same move.
2. ~~The statistic is unsettled.~~ **DONE** — `pairedT` and `signTest` landed
   and both sweeps were re-run (§2a). This removes the objection but does not
   replace the other three.
3. **Two protocol effects remain unexplained** — the flank/funnel residual (§3)
   and Firestorm's outlier cell (§5).
4. **A single sweep is not a replication.** Split-half is an internal check.

Ranked next steps:

1. ~~Decide the statistic.~~ **DONE.** Note the open consequence: every prior
   dial sweep in this project used the unpaired form, so **the reverted 2026-08-02
   tunings were probably chasing effects that were already there.** Re-reading
   the older baselines through `pairedT` is cheap (the per-cell data is in the
   JSONs) and is the highest-value thing left in the harness.
2. **Instrument the volley hit count** and settle Firestorm's *magnitude* (§5).
   It is the only fusion that passes, and the 3.6× flank/funnel gap means its
   power level is unknown even though its direction is established.
   `volley.js:45` already holds the quantity.
3. **`MUDDY_BOG` dial sweep on the isolated instrument.** The clearest,
   most-replicating negative. Note the known trap: pulse damage 12 one-shots a
   full-HP Goblin before root/slow ever applies, so damage has a hard ceiling
   and root duration is the likelier lever.
4. **`STEAM_VENT` needs the standalone Watchtower-anchored protocol**, not more
   roster sweeps — eight insignificant cells and four failed split-halves is the
   signature of a structure this protocol cannot resolve.
5. **No action on `GRINDER` or `BLIZZARD`.** Both spec-declared out of reach.

## 9. What the first draft got wrong (kept deliberately)

The adversarial review found ten problems. Recording the reusable ones:

- **Quarantining a number for tuning, then spending it for a verdict.** The
  first draft called Firestorm's maze-B cell untrustworthy in §3 and used it as
  the sole basis for a PASS in §6. If a number is too suspect to tune on, it is
  too suspect to pass on.
- **Two derived quantities that share a term are not corroboration** (§5). Both
  "independent" comparisons subtracted from the same measurement.
- **Reading a mechanism off a correlation** — the Rock Trap attribution (§4) and
  the "more crossings in the lane" story (§3), both asserted, neither
  instrumented, one of them contradicted by a split the draft never ran.
- **Violating its own stated decision rule** — §0 said only a *significant*
  negative is a fail; §6 then failed Steam Vent on eight insignificant cells.
- **Counting correlated cells as independent** (§2d) — same seeds across runs,
  shared control array across timings.
- **Applying "no verdict" inconsistently** — excluding Blizzard and Grinder from
  verdicts while counting their cells in a headline claim.
- **Five arithmetic/count errors** in cell counts and split-half tallies, none
  of which changed a verdict but all of which were avoidable.

## 10. What this review does NOT establish

- No claim here is a balance change.
- No A1.4(a) power-unit number is produced for any fusion (§0).
- Every number is measured at Rock Trap's post-retune strength and at
  `cloudMarginPx` 15. §4 shows the effect of those changes is **not** cleanly
  attributable, so **no figure here is comparable to a pre-2026-08-04 fusion
  number** without re-running the control.
- The §4 protocol difference is not a pure measurement of the displacement
  confound; it bundles a control-arm tower-geometry change.
- Win rate is not reported — too thin on this maze/policy combination.
- This is one sweep per siting, not a cross-run replication.
