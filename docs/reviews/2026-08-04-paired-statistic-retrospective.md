# Retrospective: re-reading every on-disk baseline through the paired statistic

**Date:** 2026-08-04 · **Branch:** `codex/redesign-reconciliation` ·
**Script:** `test/harness/pairedReread.mjs` (regenerates every number below:
`node test/harness/pairedReread.mjs --tsv cells.tsv`) ·
**Follows:** `3d232be` (paired statistic), `4937f2a` (siting confound),
`docs/handoffs/2026-08-04-paired-stat-and-fusion-retake.md` ·
**Adversarially reviewed** before commit; 18 findings, 4 verdict-changing. The
corrections are folded in and the substantive ones are named in section 9.

**170 cells** re-read across 16 on-disk result files plus 10 cells transcribed
from review prose. No matches were re-run.

---

## 0. Headline, before the detail

1. **The handoff's premise that "per-cell data is already on disk" is wrong.**
   No file in `test/harness/` stores per-cell score arrays. The **sign test is
   exactly recoverable** for all 170 cells; the **paired t is not recoverable
   for any pre-fix cell** and has been *bracketed*, not measured. Section 1.

2. **Not one pre-2026-08-04 cell can be promoted into a balance finding — but
   the reason is not the one this review first gave.** 17 pre-fix cells change
   verdict under the better statistic. 13 of them measure balance values that
   `4937f2a` reverted or screening candidates that never landed: they describe
   structures that do not exist. The other 4 were directly re-measured on the
   isolated instrument on 2026-08-04, which **refutes three of them and
   corroborates one** (Steam Vent, maze A, wave 1 — already in the published
   verdict). Section 3.

3. **The finding nobody was looking for: no baseline in this project has ever
   corrected for multiple comparisons.** The fusion roster scans 24 cells per
   run at an uncorrected `t > 2`. Applying Benjamini–Hochberg **within each
   run**, 21 of the 55 originally-significant cells stop being significant —
   including one cell a published verdict rests on. Section 5. **The paired t
   absorbs most of that loss** (21 of its 24 survive, against the Welch's 34 of
   55), which is the `3d232be` power argument one level up.

4. **A data-sourcing error in this review's own first draft, kept here as the
   cautionary note it is.** The draft read Rock Trap's landed retune off
   `.rocktrap-standalone-sitefix.json` — which is the *site-cap fix alone, no
   balance change* — and reported maze A as a significant **loss** confirming
   the retune. The actual landed run reads maze A as **exactly neutral**
   (48 better / 49 worse, sign p = 1.000). Section 6. The landed numbers are
   not on disk at all.

Net effect on the six fusion verdicts: **all six stand.** One (Magma Trap) has
a *supporting citation* that does not survive multiplicity correction, and the
"worth approximately nothing — DEAD" entry that rests solely on that cell needs
re-anchoring. Section 4.

---

## 1. What is on disk, and what that permits

Every driver (`fusionRoster.js`, `rockTrapRetest.js`, `firepitRetest.js`)
stores **per-comparison aggregates only**: the mean delta, the unpaired Welch
`t`, the paired sign counts, the hang-imputed pair, and the split-half pair. No
per-cell score array is written anywhere.

| statistic | recoverable? | why |
|---|---|---|
| **sign test** | **yes, exactly, all 170 cells** | `signs.better`/`signs.worse` are already *true paired counts* — `fusionRoster.js:77` walks the two arms scenario-key by scenario-key, and that function predates `3d232be`, so the 2026-08-02/03 files' counts are pairing-valid too. |
| **paired t** | **no, for any pre-fix cell** | needs `sd(deltas)`. The files store the mean delta, the tie count, and the *unpaired* SE. Those do not determine `sd(deltas)`. |
| Welch `t` | already stored | unchanged, used as the baseline of comparison |

The sign-test recomputation is **validated**: the two post-fix files carry 48
stored `signTestP` values, and `pairedReread.mjs` asserts its own output matches
all 48 to `1e-12` before doing anything else, exiting non-zero if not.

### 1a. The paired-t bracket, and why it is not a measurement

For a pre-fix cell the paired t can only be extrapolated. The relation is exact:

```
paired_t / welch_t  =  1 / sqrt(1 − 2·r·sA·sB/(sA²+sB²))
```

which follows from `sd(Δ)² = sA² + sB² − 2r·sA·sB` and `welch_se² = (sA²+sB²)/n`
at equal `n`. With `r > 0` — the arms share seeds and differ by one structure —
the ratio is **always > 1**. That gives the direction of the correction for
free: **the paired t is never smaller than the Welch t.** It does not give the
size.

The size was calibrated on the 47 cells that have both statistics *and* a
non-zero Welch t (there are 48; isolated-funnel maze A Grinder wave 4 has an
effect of exactly 0.000 and is excluded as 0/0):

```
ratio  min 1.121   p10 1.217   median 1.390   p90 1.900   max 2.385
fit    ratio = 0.690 + 1.563·tieFraction     R² 0.315     residual sd 0.229
```

**Three limits on this, all load-bearing:**

- **R² 0.315.** Tie fraction explains under a third of the ratio. A pre-fix
  cell's paired t is a range spanning roughly a factor of two, not a number.
- **The bracket endpoints are the observed extrema of an n = 47 sample**, with
  no sampling allowance. A 48th cell could fall outside [1.121, 2.385]; the
  residual sd of 0.229 is ~±0.45 at 2σ, comparable to the entire observed
  spread. The `SIG`/`NULL` band labels the script assigns are therefore
  **screening labels, not tests**.
- **Protocol transfer is unverified.** Tie fractions do transfer well — the
  calibration set spans 0.292–0.694 and only 3 of the 112 on-disk pre-fix cells
  fall outside that range — but the arm-to-arm correlation `r` under legacy
  control-tower geometry need not match the isolated geometry, and nothing here
  checks that.

The tables print pre-fix brackets as `lo..hi` and real measured values with a
trailing `*`. **No bracketed value appears in any conclusion below**, and no
cell is called "significant under all three statistics" when the third is a
bracket. At the extremes the bracket is still informative: Welch `t ≥ 1.79`
clears `t > 2` under every observed ratio, `t ≤ 0.83` under none.

### 1b. What cannot be re-read at all

**`probe.js` — the driver behind every dial sweep in this project — persists
nothing and computes no sign counts.** No `writeFileSync`, no `--out`, no
`signTest`/`pairedT`. That means:

- the entire **2026-07-25 Phase 8A baseline**,
- the **difficulty-ramp / maze-B** sweeps,
- every `--dial` sweep ever run,

**cannot be re-read through any paired statistic without re-running them.** This
is the largest body of work the underpowered statistic touched, and it is
exactly the category the handoff worried about. The retrospective has nothing to
say about it. Remediation in section 7.

Gaps in the persisted record, all filled by hand-transcription here:

- **Rock Trap's landed retune (2026-08-04):** *not on disk in any form.*
  `.rocktrap-standalone.json` is pre-site-cap-fix; `-sitefix.json` is the fix
  with no balance change. The confirmation run is table 5 of
  `2026-08-04-rock-trap-site-cap-fix-and-balance-tweak.md`. See section 6 — the
  first draft of this document got this wrong.
- **Firepit retest (2026-08-02):** `firepitRetest.js` supports `--out` but was
  run without it.
- **Tower baselines (2026-07-25, 2026-08-01):** sign counts published for 6
  cells only. The rest of those reviews' numbers have no recoverable pairing.

---

## 2. Method, and its assumptions

Per cell: exact two-sided sign test; Welch `t` as stored; paired t measured
(post-fix) or bracketed (pre-fix); then four gates — **hang imputation**,
**split-half replication**, **multiplicity**, and a **structural** gate for
whether the run describes anything that still exists.

**Multiplicity is applied symmetrically.** Correcting only the cells that *move*
would hold new readings to a stricter standard than published ones — that is the
shape the "a more sensitive statistic makes over-reading easier" trap takes in a
retrospective. So Benjamini–Hochberg at q = 0.05 runs on all three statistics
and is reported against the originally significant Welch cells too (section 5).

Two honest caveats on the BH layer, since it carries a headline finding:

- **The cells are not independent.** Within one roster file, the 24 cells share
  seeds across fusions, and wave 1 and wave 4 within a fusion share the *same
  control array*. BH controls FDR under independence or positive dependence
  (PRDS); this dependence is positive, so BH here is most likely **conservative**
  rather than anti-conservative — but that is an argument, not a proof.
- **The Welch p-values are from a mis-specified model.** They are recomputed
  from the stored (unpaired) `t` at a pooled `df = 2n − 2`, not
  Welch–Satterthwaite. Running BH on them is a like-for-like *comparison device*
  — "what would the published reading have looked like corrected?" — not an
  FDR-controlling procedure for a correct model. The paired-t BH column is the
  one to trust.

**Family = one output file** — the set of cells a reader of one run actually
scans, 24 for a roster sweep, 2 for a standalone. A global family across all 19
studies is computed as a sanity bound and never used as a gate.

**Hang imputation** is *not* available for the sign test: no file stores imputed
sign counts, only imputed means and t. Every cell discussed below has **zero
hangs** except Firepit maze B (7), flagged where it appears.

**Structural gates** (`pairedReread.mjs`, `structuralGate`), in binding order:

| gate | meaning |
|---|---|
| `reverted` | measures a balance value `4937f2a` reverted, or a screening candidate that never landed. The structure does not exist. Maze-independent, airtight. |
| `superseded` | the same quantity was re-measured on the isolated instrument on 2026-08-04. The later reading governs. |
| `siting-A` | **maze A only** — the ~1.2-point Watchtower-displacement artifact. |
| `instrument` | 2-wide-footprint site-cap defect, un-remediated for that run. |

The `siting-A` gate is deliberately **not** applied to maze B. The confound
diagnosis says so directly ("maze B shows no meaningful spread, so maze B
numbers are likely sound; maze A fusion numbers should be treated as unverified
until re-taken"), and the isolated retake's own protocol comparison confirms it
empirically ("the two protocols agree on maze B, 5 of 6 within ±0.16"). **The
first draft of this review applied a blanket "legacy siting ⇒ dead" rule and was
wrong for 13 of its 17 rows.** The gates above replace it; the conclusion of
section 3 is unchanged, but it now rests on reasons that hold.

---

## 3. Verdict changes on the pre-2026-08-04 baselines

**26 cells change verdict** — 17 pre-fix, 9 on the post-fix instrument
(section 4).

**The direction of the change is not symmetric, but part of that is
tautological.** The paired-t bracket is `welch_t × ratio` with `ratio ≥ 1.121`,
so it is *arithmetically incapable* of demoting anything — it can only promote.
The sign test can go either way, and it does: it **demotes 5 Welch-significant
cells** (section 3d). The one-directional power claim from `3d232be` is
therefore confirmed only where a real paired t exists (48 cells); the other 122
cells add no independent evidence for it.

### 3a. The 17 pre-fix promotions, and the gate each one meets

| file | mz | fusion | arm | effect | Welch t | sign p | paired t (bracket) | split | gate |
|---|---|---|---|---|---|---|---|---|---|
| blizzard-hp135-dmg18 | B | BLIZZARD | wave4 | +0.481 | 1.93 | **0.0000** | 2.16..4.59 | agree | reverted |
| blizzard-hp135-dmg18 | B | BLIZZARD | wave1 | +0.422 | 1.77 | **0.0035** | 1.99..4.23 | agree | reverted |
| magma-v2-flank | B | MAGMA_TRAP | wave1 | +0.347 | 1.83 | **0.0097** | 2.05..4.35 | agree | reverted |
| muddybog-v2-flank | B | MUDDY_BOG | wave4 | +0.354 | 1.86 | **0.0004** | 2.08..4.43 | **FLIP** | reverted |
| muddybog-v2-flank | B | MUDDY_BOG | wave1 | +0.222 | 1.17 | **0.0170** | 1.31..2.80 | agree | reverted |
| steamvent-v2-funnel | A | STEAM_VENT | wave1 | +0.173 | 0.96 | **0.0226** | 1.07..2.29 | agree | reverted |
| grinder-v2-funnel | B | GRINDER | wave4 | +0.139 | 0.76 | **0.0330** | 0.85..1.81 | **FLIP** | reverted, fails BH |
| grinder-v3-dmg60 | B | GRINDER | wave1 | +0.111 | 0.60 | **0.0300** | 0.68..1.44 | agree | reverted, fails BH |
| grinder-v3-dmg60 | B | GRINDER | wave4 | +0.132 | 0.72 | **0.0138** | 0.80..1.71 | **FLIP** | reverted, fails BH |
| grinder-v4-dirS | B | GRINDER | wave4 | +0.153 | 0.83 | **0.0192** | 0.93..1.98 | **FLIP** | reverted, fails BH |
| roster-legacy-current | A | STEAM_VENT | wave4 | +0.309 | 1.97 | **0.0140** | 2.21..4.71 | agree | reverted |
| roster-legacy-current | B | BLIZZARD | wave1 | +0.360 | 1.68 | **0.0138** | 1.89..4.02 | agree | reverted |
| roster-legacy-current | B | GRINDER | wave1 | −0.306 | 1.59 | **0.0027** | 1.78..3.78 | agree | reverted |
| fusion-roster-funnel | A | BLIZZARD | wave1 | −0.264 | 1.83 | **0.0088** | 2.05..4.36 | agree | superseded |
| fusion-roster-funnel | B | MAGMA_TRAP | wave4 | +0.313 | 1.69 | **0.0021** | 1.90..4.04 | agree | superseded |
| fusion-roster-funnel | B | GRINDER | wave4 | +0.236 | 1.26 | **0.0152** | 1.41..2.99 | **FLIP** | superseded |
| fusion-roster-output | A | STEAM_VENT | wave1 | −0.186 | 1.80 | 0.0725 | 2.02..4.30 | agree | superseded, fails BH |

That is all 17. Five fail split-half, five fail within-file BH.

**13 are `reverted`.** `.blizzard-hp*`, `.grinder-v*`, `.magma-v2`,
`.muddybog-v*` and `.steamvent-v2` are screening runs at candidate dial values
that were never adopted; `.roster-legacy-currentvalues` was taken at the
2026-08-02 tuned values that `4937f2a` reverted. Whatever those cells measured,
it was not the game as it now exists. This gate is maze-independent and does not
depend on the siting confound at all.

### 3b. The four `superseded` promotions, checked against the re-measurement

These four were taken at then-shipped values, so the reverted gate does not
apply. All four were re-measured on the isolated instrument on 2026-08-04:

| pre-fix reading | isolated re-measurement | outcome |
|---|---|---|
| funnel A BLIZZARD w1 −0.264, sign p 0.0088 | −0.085, Welch 0.67, paired −1.04, sign p 0.289 | **refuted** |
| funnel B MAGMA_TRAP w4 +0.313, sign p 0.0021 | +0.007, Welch 0.04, paired +0.09, sign p 1.000 | **refuted** |
| funnel B GRINDER w4 +0.236, sign p 0.0152 (split FLIP) | +0.014, Welch 0.08, paired +0.14, sign p 0.382 | **refuted** |
| flank A STEAM_VENT w1 −0.186, bracket 2.02..4.30 | −0.278, paired **−3.12**, sign p 0.0204 | **corroborated** |

**One pre-fix promotion out of 17 survives contact with a valid instrument**, and
it is Steam Vent's maze-A wave-1 harm — which the isolated retake found
independently and the published verdict already carries ("harmful at wave 1").
So the retrospective's expected outcome — retiring a "worth nothing" finding the
way Firestorm's was retired — **does not occur.** Nothing is retired, and
nothing new is learned about any structure from the pre-fix record.

### 3c. Did the underpowered statistic cause the overtuning?

The handoff's hypothesis — a real effect reads "not resolvable", the dial gets
pushed, the structure ends up overtuned — is **visible in the record for Muddy
Bog.** Flank siting, maze B wave 4, same instrument throughout:

| dial state | effect | Welch t | verdict as read at the time | sign p |
|---|---|---|---|---|
| shipped | −0.021 | 0.13 | NO SIGNAL | 1.0000 |
| **v2 candidate** | **+0.354** | **1.86** | **NO SIGNAL — "not resolvable"** | **0.0004** |
| v3, damage 25 | +0.799 | 4.33 | SIGNAL | 0.0000 |

The reader saw `t 1.86, not resolvable` and pushed damage further; the sign test
on the same stored counts read p = 0.0004. That is the failure mode as
described. **It still does not establish the v2 value was right** — that cell
fails split-half — and the whole chain sits behind the `reverted` gate.

**The Grinder chain does not support the same story, and the first draft's
reading of it was a category error.** Grinder was buffed three times (damage
45→60, hp 90→160) and the fusion-vs-control delta did not move:

| dial state | effect (B, wave 4) | Welch t | sign p | split |
|---|---|---|---|---|
| baseline | +0.236 | 1.26 | 0.0152 | FLIP |
| v2 | +0.139 | 0.76 | 0.0330 | FLIP |
| v3 (dmg 60) | +0.132 | 0.72 | 0.0138 | FLIP |
| v4 (dirS, dmg 60, hp 160) | +0.153 | 0.83 | 0.0192 | FLIP |

None of these is a test of the dial — each is a fusion-vs-no-fusion contrast
measured *at* a dial setting. A small, stable delta that does not respond when
damage rises 33% is the correct reading "**the dial does nothing, stop**", not
an encouragement to push. The draft claimed the sign test "would have encouraged
another overtune"; that was wrong. All four fail split-half regardless.

**Conclusion:** the mechanism is real and documented in one chain. It is not
established as the general cause of the reverted buffs, and this retrospective
cannot establish it, because the instrument those buffs were measured on was
independently invalid.

### 3d. Where the sign test *removes* a signal the Welch found

Five cells, all Welch-significant, none surviving the exact sign test:

| file | mz | fusion | arm | effect | Welch t | sign p | gate |
|---|---|---|---|---|---|---|---|
| fusion-roster-output | A | BLIZZARD | wave4 | +0.219 | 2.11 | 0.0568 (44/27) | superseded |
| fusion-roster-output | B | FIRESTORM | wave4 | +0.368 | 2.38 | 0.2242 (47/35) | superseded |
| grinder-v4-dirS | A | GRINDER | wave4 | +0.264 | 2.30 | 0.3492 (41/32) | reverted |
| magma-v2-flank | A | MAGMA_TRAP | wave4 | +0.237 | 2.11 | 0.0505 (47/29) | reverted |
| **roster-isolated-funnel** | **A** | **GRINDER** | **wave1** | **−0.222** | **2.05** | **0.1006 (29/44)** | **ok** |

The last is on the valid instrument and has a real paired t of −2.50. Both
t-family statistics call it a signal; the distribution-free one does not. It is
inside Grinder, which has no verdict, so nothing turns on it — but it is the
cleanest example in the data of the two statistics genuinely disagreeing, and
the honest report is both numbers.

### 3e. Direction conflicts

**14 cells** have the mean pointing one way and the paired sign counts the
other — e.g. isolated/flank maze A Firestorm wave 4 reads effect **−0.023**
while the counts are **48 better / 34 worse**; Rock Trap's landed maze A reads
**+0.122** on counts of **48 better / 49 worse**. Every one of the 14 is
non-significant under all three statistics, so no verdict turns on any of them.
The interpretive point stands: on a metric this discrete and this tied, **a small
signed mean is not evidence of direction.** An asymmetric tail on a few cells
moves the mean while the majority of matches went the other way.

---

## 4. The post-fix isolated instrument, re-read under all three statistics

These 48 cells were published on 2026-08-04 with the paired t already computed.
What is new is the multiplicity correction. `Y` = survives within-file BH at
q = 0.05. Cells omitted are non-significant on all three statistics
*uncorrected*; the full table is available via `--tsv`.

| mz | fusion | arm | siting | effect | Welch t | BH | paired t | BH | sign p | BH | split |
|---|---|---|---|---|---|---|---|---|---|---|---|
| B | FIRESTORM | wave1 | flank | +0.926 | 4.18 | **Y** | **+4.93** | **Y** | 0.0138 | **Y** | agree |
| B | FIRESTORM | wave4 | flank | +0.931 | 4.11 | **Y** | **+5.75** | **Y** | 0.0003 | **Y** | agree |
| B | FIRESTORM | wave1 | funnel | +0.313 | 1.60 | . | **+2.45** | **Y** | 0.1821 | . | agree |
| B | FIRESTORM | wave4 | funnel | +0.257 | 1.28 | . | **+2.55** | **Y** | 0.0817 | . | agree |
| A | FIRESTORM | all four | both | −0.24..−0.02 | ≤1.37 | . | ≤1.87 | . | ≥0.15 | . | mixed |
| B | MUDDY_BOG | wave1 | flank | −0.861 | 4.78 | **Y** | **−6.48** | **Y** | 0.0000 | **Y** | agree |
| B | MUDDY_BOG | wave4 | flank | −0.583 | 3.26 | **Y** | **−4.84** | **Y** | 0.0000 | **Y** | agree |
| B | MUDDY_BOG | wave1 | funnel | −0.632 | 3.29 | **Y** | **−4.34** | **Y** | 0.0001 | **Y** | agree |
| B | MUDDY_BOG | wave4 | funnel | −0.403 | 2.21 | . | **−3.46** | **Y** | 0.0008 | **Y** | agree |
| A | MUDDY_BOG | wave1 | flank | −0.514 | 4.37 | **Y** | **−5.69** | **Y** | 0.0000 | **Y** | agree |
| A | MUDDY_BOG | wave4 | flank | −0.236 | 2.30 | . | **−2.97** | **Y** | 0.0145 | **Y** | agree |
| A | MUDDY_BOG | wave1 | funnel | −0.236 | 1.99 | . | **−2.46** | **Y** | 0.2145 | . | agree |
| A | MUDDY_BOG | wave4 | funnel | +0.063 | 0.58 | . | +0.75 | . | 0.2145 | . | **FLIP** |
| B | MAGMA_TRAP | wave1 | flank | −0.528 | 3.05 | **Y** | **−3.91** | **Y** | 0.0023 | **Y** | agree |
| B | MAGMA_TRAP | wave4 | flank | −0.229 | 1.37 | . | −2.07 | **.** | 0.0271 | **.** | agree |
| A | MAGMA_TRAP | wave1 | flank | −0.250 | 1.92 | . | **−2.67** | **Y** | 0.2007 | . | agree |
| A | STEAM_VENT | wave1 | flank | −0.278 | 1.77 | . | **−3.12** | **Y** | 0.0204 | . | agree |
| A | STEAM_VENT | wave1 | funnel | −0.222 | 1.53 | . | **−2.48** | **Y** | 0.2000 | . | agree |
| — | STEAM_VENT | wave4 | both mazes, both sitings | −0.24..−0.02 | ≤0.98 | . | ≤1.86 | . | ≥0.17 | . | 2 of 4 **FLIP** |
| A | BLIZZARD | wave1 | flank | −0.381 | 2.39 | . | **−3.46** | **Y** | 0.0356 | . | agree |
| A | BLIZZARD | wave4 | flank | −0.368 | 2.12 | . | **−3.20** | **Y** | 0.0498 | . | agree |
| A | BLIZZARD | wave4 | funnel | −0.183 | 1.39 | . | −2.36 | . | 0.0105 | . | agree |
| B | BLIZZARD | wave4 | flank | +0.432 | 2.33 | . | **+2.98** | **Y** | 0.0206 | . | agree |
| B | BLIZZARD | wave4 | funnel | +0.277 | 1.33 | . | 2.15 | . | 0.0124 | . | agree |
| B | GRINDER | wave1 | funnel | −0.542 | 2.91 | **Y** | **−3.76** | **Y** | 0.0021 | **Y** | agree |
| A | GRINDER | wave1 | flank | −0.299 | 2.64 | **Y** | **−2.96** | **Y** | 0.0220 | . | agree |
| A | GRINDER | wave1 | funnel | −0.222 | 2.05 | . | **−2.50** | **Y** | 0.1006 | . | agree |

### What this does to each published verdict

**FIRESTORM — PASS stands, unchanged.** All four maze-B cells positive, paired t
surviving BH in all four. The sign test survives BH in only the two flank
cells, so the conservative funnel figures (+0.313, +0.257) rest on the paired t
alone — **and the published review already says exactly this** ("Note the sign
test clears only on the flank pair (funnel p 0.082 / 0.182), so this rests on
the paired t"). The only new information is that the paired-t significance is
BH-robust, which strengthens rather than qualifies it. Magnitude is still
unsettled; section 8.

**MUDDY_BOG — FAIL stands and is now properly supported.** Three of four wave-4
cells and three of four wave-1 cells negative with **both** the paired t and the
exact sign test surviving BH. The one non-negative cell (funnel maze A wave 4,
+0.063) fails split-half. The Welch alone would have carried only 4 of those 6
through BH — this verdict was partly being held up by the weaker statistic. (It
is not, however, "the most robust finding in the project": Firepit maze A at
p = 1.0e-25 and Rock Trap maze B at p = 1.9e-13 are both larger.)

**MAGMA_TRAP — FAIL stands; one downstream claim needs re-anchoring.** The
verdict row cites two cells and the stronger one is fine: maze B **wave 1** at
−0.528 (paired −3.91, sign p 0.0023, both BH-clear). The weaker one — maze B
wave 4, "sign p 0.027, paired t −2.07" — **does not survive within-file BH on
either statistic** (paired q 0.068, sign q 0.059). That matters because §7 row 4
of the published review ("MAGMA_TRAP is 'worth approximately nothing' — **DEAD**")
rests *solely* on that cell. The FAIL verdict is unaffected; the "DEAD" entry
should be re-anchored to the wave-1 cell, which says the same thing more
strongly.

**STEAM_VENT — unchanged and better supported.** Wave 1 negative on both sitings
of maze A with the paired t BH-surviving (−3.12, −2.48). Wave 4 null everywhere,
2 of its 4 cells failing split-half (and all four *maze-B* readings failing,
across both timings, as published). "NOT RESOLVED at wave 4, harmful at wave 1"
is exactly right.

**BLIZZARD — no verdict, cleanly maze-split, unchanged.** Maze A negative and
maze B positive at both sitings; the flank cells' paired t is BH-clear, the
funnel cells' is not. The spec-declared policy confound still blocks a verdict.

**GRINDER — no verdict, unchanged, values untouched.** The strongest cell
(funnel maze B wave 1, −0.542) survives all three statistics under BH but
disagrees with flank maze B wave 1 and with every wave-4 cell — and section 3d's
disagreement cell is also inside Grinder. The playtest-data ruling stands.

---

## 5. Nothing was ever corrected for multiplicity

| statistic | passing uncorrected | passing within-file BH |
|---|---|---|
| Welch `t > 2` | 55 / 170 | **34** |
| exact sign `p < 0.05` | 70 / 170 | **54** |
| paired `\|t\| > 2` (48 cells that have one) | 24 / 48 | **21** |

**21 of the 55 originally-significant Welch cells lose significance.** Every
published verdict was read off an uncorrected `t > 2` across a 24-cell sweep;
under the complete null that expects ~1.2 false positives per run, and the sweep
has been run many times. (The project is *not* under the complete null — several
of those cells carry real effects — so 1.2 is an upper bound on the expected
false-positive count, not a prediction.)

The paired t absorbs most of the loss: 21 of 24 survive, against the Welch's 34
of 55. **The correct statistic buys back more than the correction costs** — the
same argument as `3d232be`, one level up. But it is not free, and section 4 shows
one published citation inside the gap.

Standing instrument defect, applying to every multi-cell driver in
`test/harness/`.

---

## 6. Findings that are confirmed — and the one this review got wrong first

### Rock Trap — the landed retune is a maze-B win and a maze-A *neutral*

**The first draft of this document reported the wrong run.** It read the retune
off `.rocktrap-standalone-sitefix.json`, which is the site-cap fix *alone with
no balance change*, and reported maze A's −0.583 (18 better / 79 worse) as
"confirmed distribution-free" — presenting a **significant loss as confirmation
of the retune**. The landed configuration
(`splashRadiusPx: 48`, `cooldownMs: 3000`) is not on disk in any file.

Actual landed numbers, transcribed from table 5 of
`2026-08-04-rock-trap-site-cap-fix-and-balance-tweak.md`:

| | effect | Welch t | paired signs | **exact sign p** | split-half | hangs |
|---|---|---|---|---|---|---|
| maze A | +0.122 | 1.16 | 48 / 49 / 47 | **1.0000** | agree | 0/144 |
| maze B | **+1.382** | 8.73 | 89 / 16 / 39 | **1.9e-13** | agree | 0/144 |

Maze A is as close to a perfect null as this instrument can produce — which
**matches the retune review's own conclusion** ("just neutral"), so the landed
decision was read correctly at the time; only this retrospective misread it.
Maze B is confirmed distribution-free with enormous margin. **Not reopened.**

### Firepit — confirmed on maze A, but on an un-remediated instrument

Maze A −1.091, 5/106 better/worse, sign p **1.0e-25**. Maze B null under all
three (41/51, p 0.35), split-half FLIP, **7 hangs**. Both readings stand as
published. One caveat this review must state rather than exempt: `FIRE_SPECIAL`
is also 2×1, so per
`2026-08-04-rock-trap-site-cap-fix-and-balance-tweak.md` §1 the Firepit retest
shares Rock Trap's site-cap defect **and was never re-measured under the fix**.
Its cells carry the `instrument` gate here. **Not reopened** — but that is
Philip's standing instruction, not a claim the measurement is clean.

### Tower baselines — not refuted

All 6 cells with published sign counts are non-significant under the sign test
(fusion @ wave 4 maze A, 31/24, p 0.42; free special maze A, 38/24, p 0.098).
Four of the six have brackets whose upper end exceeds 2 — free-special maze A
reaches 1.32 × 2.385 = 3.15 — and per section 1a a bracket cannot decide
anything. So the correct statement is that the **"fusion measures neutral"
reading is not refuted** by the paired re-read, not that it survives it. These
are fusion measurements through the same harness, so the maze-A cells carry the
`siting-A` gate too.

---

## 7. Remediation (proposed, not applied here)

1. **`probe.js` must record the pairing.** It is the driver behind every dial
   sweep and it discards the only thing that would make a sweep re-readable. It
   should compute paired sign counts and a paired t between endpoint cells (they
   already run over the same scenario matrix) and persist per-cell arrays behind
   an `--out`. Small, additive, same shape as `3d232be`.
2. **Every driver should persist per-cell arrays, not just aggregates.** This
   retrospective was limited by ~2 KB of missing data per run.
3. **Always pass `--out`.** Two of this project's most consequential runs —
   Firepit's retest and Rock Trap's landed retune — exist only as review prose,
   and the second of those directly caused a verdict-changing error in this
   document's first draft.
4. **Report a BH-adjusted q alongside the raw t** in any driver printing more
   than a handful of cells. `fusionRoster.js` prints 24.
5. **Re-run the dial sweeps** only if their conclusions are still load-bearing.
   Scope call, not a measurement call.

## 8. What this does not settle — Firestorm's magnitude, now partly answered

Direction is established and BH-robust on the paired t in all four maze-B cells;
the 3.6× flank/funnel gap was unexplained, and the funnel cells — the
conservative ones — are the ones the sign test declines to confirm.

**Measured after this review, in
`docs/reviews/2026-08-04-firestorm-volley-delivery-probe.md`:** the flank-sited
Firestorm delivers **1.88× the hits** of the funnel-sited one on maze B, and
0.97× on maze A where the score is flat. So a real mechanism exists and the
flank cell is not a pure artifact — but 1.88× of delivery is not 3.6× of a
saturating terminal score, and **+0.26 remains the figure to carry forward.**

## 9. Adversarial review findings folded in

Reported 18; 4 verdict-changing. The substantive ones, all corrected above:

1. **Rock Trap read off the wrong run** — a significant loss reported as
   confirmation of the retune (section 6).
2. **"In zero cells does the better statistic remove a signal" was false** — the
   sign test demotes 5 cells, and the bracket cannot demote by construction
   (sections 3, 3d).
3. **The blanket "legacy siting ⇒ dead" gate was wrong for 13 of 17 rows** —
   the confound is maze-A-specific by the diagnosis's own words (sections 2, 3a).
4. **The Grinder escalation narrative was a category error** — those cells test
   the fusion, not the dial (section 3c).
5. Firestorm's sign-test caveat was already in the published review; the draft
   claimed it as new (section 4).
6. Isolated-funnel maze A Blizzard wave 4 was omitted from section 4's table
   while its weaker sibling was listed (now included).
7. BH dependence and the mis-specified Welch p-values were unstated (section 2).
8. Firepit, pre-fix Rock Trap and the tower baselines were exempted from
   structural gating that the project's own record applies to them (section 2).
9. Minor arithmetic: `t ≤ 0.83` not 0.84; 19 studies not 18; the calibration
   uses 47 of 48 eligible cells; "most robust finding in the project"
   unsupported; "~1.2 false positives" holds under the complete null only;
   `.roster-legacy-currentvalues` is a same-session control, not a pre-fix
   baseline; tower baselines are "not refuted", not "survive".
