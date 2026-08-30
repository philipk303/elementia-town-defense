# The maze split is mostly the control's, not the fusions' — but my registered signature was wrong

> **CORRECTION, 2026-08-27 — five maze-A cells lose their PASS.**
> `stats.js:signTest` seeded its tail with `Math.pow(0.5, n)`, which underflows
> to exactly 0 for n > 1074, so every sign test on more than 1074 untied pairs
> returned p = 0 and passed the sign gate for free. Fixed 2026-08-27 (log-space
> accumulation, regression-tested). Re-running this corpus under the fix, these
> maze-A conjunctions FAIL:
> `hallHpAuc`/`earth-only` (n 2370, sign p 0.169),
> `hallHpAuc`/`earth-water` (n 2348, p 0.095),
> `score` and `wavesCleared`/`earth-only` (n 1294, p 0.559),
> `score` and `wavesCleared`/`earth-water` (n 1275, p 0.867).
> Section 4's note that "`earth-only` on maze A fails the sign-test gate on both
> secondaries ... while passing on `hallHpAuc`" was right about the secondaries
> — caught by eye, not by the tool, which reported p = 0 — and **wrong about
> `hallHpAuc`, which also fails.** `earth-water` on maze A fails on all three.
> Deltas and q values are unaffected. A full re-read of this review has not been
> done. See `docs/reviews/2026-08-27-option-set-pilot-result.md` §4.


Date: 2026-08-16. Family `maze-split-mechanism`, 36,000 runs, engine `5005dc1`,
clean worktree, **0 hangs, 0 crashes**. Registration `valid`,
`verdictAllowed: true`. Metric `hallHpAuc`, regime **R2**, n = 3000 per cell,
`humanElement: EARTH`, `fuse: false` in every arm, seeds `20330801+`.

**Note on the run:** the sweep was backgrounded and its completion record was
lost when the process was torn down. All 36,000 runs were verified present and
parseable by re-running the runner (`Already stored: 36000, Runs remaining: 0`)
before anything was analysed. Nothing was re-run and nothing was imputed.

---

## 0. The positive control fired, so the instrument is live

`wt-x2` doubles Watchtower damage against an all-Watchtower control:

| maze | Δ | t |
|---|---|---|
| A | **+0.556** | 26.88 |
| B | **+0.936** | 33.07 |

Resolvable on both mazes in the committed direction. Every other cell in this
family may be read.

## 1. The registered prediction is REFUTED

I pre-registered that **at least two** of the four specials arms would show
resolvably opposite signs across the two mazes, and committed that as the
signature of the artifact hypothesis. Here is what actually happened:

| arm (vs pure-Watchtower control) | maze A | maze B | signs |
|---|---|---|---|
| `earth-only` | +0.154 (t 7.09) | +0.320 (t 12.77) | same |
| `earth-fire` | +0.222 (t 9.85) | +0.583 (t 23.59) | same |
| `earth-water` | +0.162 (t 7.53) | +0.498 (t 20.41) | same |
| `earth-wind` | +0.269 (t 12.65) | **−0.164** (t −6.02) | **opposite** |

**Exactly one arm flips.** By the letter of the registered rule that is the
`MIXED / UNRESOLVED` outcome, and my prediction is refuted. I am recording that
before anything else because I wrote the threshold before seeing the data.

Two things also fall out that are worth stating on their own:

- **Specials generally BEAT the Watchtowers their gold buys.** Seven of the
  eight specials cells are resolvably positive. The scenario named in
  `whatWouldRefute` — that a single elemental special is simply worse than the
  gold it costs — is refuted. The special/fusion system is not broken at its
  root.
- **`earth-wind` is the exception, and WIND is Grinder's partner.** The one
  control configuration that is resolvably *harmful* on maze B is the one that
  the one EARTH fusion preferring maze B is measured against.

## 2. The artifact hypothesis is supported by a DIFFERENT signature than I registered

My rule tested for the control's **sign** flipping. The control's **magnitude**
swings instead — and that is enough to manufacture the roster's split on its
own. Comparing each fusion's measured delta against the maze swing of the exact
control configuration it was measured against:

| fusion | partner | control swing (B−A) | fusion Δ swing (B−A) | implied fusion-side swing | share explained |
|---|---|---|---|---|---|
| Magma Trap | FIRE | **+0.361** | −0.376 | −0.015 | **96%** |
| Muddy Bog | WATER | **+0.336** | −0.578 | −0.242 | **58%** |
| Grinder | WIND | **−0.433** | +0.573 | +0.140 | **76%** |

The arithmetic is just `D = F − C`, so `D_swing = F_swing − C_swing`. The
control swing is **opposite in sign to the fusion's apparent split in all three
cases**, and comparable in magnitude. For Magma Trap the implied fusion-side
maze swing is **−0.015** — essentially zero. Magma Trap is not maze-situational
at all; its own value is nearly maze-invariant and the entire +A/−B pattern in
`fusion-r2-magma-trap` is its control being much stronger on maze B.

This is exactly the descriptive read the prereg declared in advance — *"if
earth-fire and earth-water prefer one maze and earth-wind the other, the
control's preference tracks the fusion's and the artifact reading is
strengthened"* — and it is what the data shows, in the mirrored direction the
arithmetic requires.

## 3. Why this is NOT yet a verdict, and what it costs to make it one

**The comparison in §2 is UNPAIRED.** This family ran on seeds `20330801+`; the
five `fusion-r2-*` families ran on `20320801+`. The two corpora share no seed,
so §2 differences means-of-deltas across independent corpora rather than a
paired statistic. This project has already been burned once by exactly this
distinction (the `classify()` seed-pairing defect), and the prereg pre-committed
§2 as *"a pattern to be tested by a later family, never as a verdict here."*
It stays descriptive.

It is not noise — at n = 3000 the standard error on each arm mean is ~0.02
against swings of 0.34–0.43 — but "not noise" is not "paired".

**The clean family that would settle it** puts all three arms on the SAME seeds,
one family per fusion:

```
control      pure Watchtowers (freeSpecial:false)
two-special  freeSpecial + partnerSpecial   <- the fusion-r2 control
fusion       the fusion itself
```

Then `fusion − two-special` (the Amendment D question) and
`two-special − control` (the control's own maze value) are both paired inside a
single corpus, and the decomposition in §2 becomes a measured quantity rather
than an inferred one. 3 arms x 2 mazes x 3000 = 18,000 runs per fusion, ~6
minutes each.

## 4. What this does NOT establish

- **Nothing here retracts the `fusion-r2-*` corpus.** Those numbers stand
  exactly as taken. What changes is their *interpretation*: a fusion's delta is
  a difference against a baseline that is itself strongly maze-dependent, and
  reading that delta as a property of the fusion alone is a mistake.
- **It does not clear Firestorm or Blizzard.** This family pins
  `humanElement: EARTH`. FIRE and WATER lines were not measured and their human
  class differs, which is the exact confound the roster's family split exists to
  avoid. Declared as `scopeLimit` (2).
- **It cannot touch the policy hypothesis.** Only `scripted-v1` exists and a
  stationary policy sites structures identically on both mazes. If the split is
  a *policy* artifact this family reproduced it faithfully and cannot name it as
  one. Declared as `scopeLimit` (3), and it remains the single largest open
  threat to every number in the program.
- **Two mazes is the whole population.** This family can establish that the
  trade varies by maze; it cannot establish that varying is abnormal.
- **`earth-only` on maze A fails the sign-test gate on both secondaries**
  (636+/658− on score and wavesCleared) while passing on `hallHpAuc`. A single
  small cell, flagged rather than smoothed over.

## 5. Method note: fourth prediction, fourth refutation

`steam-vent-mechanism` predicted confusion carried the harm; it was inert.
`steam-vent-retune` predicted dwell time carried the fix; damage did.
`steam-vent-scald-dial` predicted the scald was inert; it carried +0.253. Now
`maze-split-mechanism` predicted two or more control arms would flip sign; one
did.

The pattern is not that the hypotheses were wrong — the artifact hypothesis
looks substantially *right*. It is that I keep committing to a specific
**signature** of a mechanism and the mechanism keeps announcing itself through a
different channel. The registered falsifier caught it every time, which is the
system working. The lesson to carry forward is to prefer decision rules stated
over the **quantity that matters** (here: how much of the split the control
explains) rather than over a convenient proxy for it (here: whether the control
flips sign).
