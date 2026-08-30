# Grinder r3 — the first registered verdict on the retuned structure

Date: 2026-08-30. Two pre-registered families, both run AFTER their prereg was
committed (`ce58758`), both on a clean tree, 25,600 runs, 0 crashed.

**Headline: the retuned Grinder PASSES on BOTH mazes — maze A is finally
resolved (+0.144, t 7.28) after being unresolvable all through 2026-08-29.
The root capture also passes, but its effect is BELOW the MDE we declared in
advance as "worth calling a gameplay change" (+0.029 / +0.091 against an MDE
of 0.100). My pre-registered prediction that the root would come back null
was WRONG in direction and roughly right in magnitude: it is real, and it is
small.**

## Verdicts

`grinder-r3-worth` — does the retuned Grinder beat the two structures it eats?

| maze | control | grinder | delta | 95% CI | t | BH q | verdict |
|---|---|---|---|---|---|---|---|
| A | 7.849 | 7.993 | **+0.144** | [0.105, 0.183] | 7.28 | <0.00001 | **PASS** |
| B | 6.660 | 7.472 | **+0.812** | [0.765, 0.858] | 34.01 | <0.00001 | **PASS** |

`grinder-r3-root` — does the 2s root add anything ON TOP OF contact damage?
(Here `control` is the same fusion with `rootMs: 0`, NOT the two-ingredient
control.)

| maze | no root | rooted | delta | 95% CI | t | BH q | verdict |
|---|---|---|---|---|---|---|---|
| A | 7.963 | 7.993 | **+0.029** | [0.006, 0.053] | 2.45 | 0.028 | PASS |
| B | 7.381 | 7.472 | **+0.091** | [0.070, 0.113] | 8.42 | <0.00001 | PASS |

All four primary cells cleared every gate (BH q, sign test, split-half,
hang-imputation), and both secondary metrics (`score`, `wavesCleared`) passed
on both mazes in both families — 12 of 12 registered cells PASS. Zero hangs
in 25,600 runs.

## What actually changed versus the ad-hoc probes

| | n=144 probe (2026-08-29) | n=3200 registered | |
|---|---|---|---|
| worth, maze A | +0.201, t 1.73, unresolvable | **+0.144, t 7.28** | resolved, point estimate 28% lower |
| worth, maze B | +0.786, t 5.22 | **+0.812, t 34.01** | confirmed |
| root, maze A | +0.094 | **+0.029** | 3.2x smaller than the probe said |
| root, maze B | +0.048 | **+0.091** | 1.9x larger than the probe said |

The two root estimates moved in OPPOSITE directions relative to the probe,
which is exactly what noise below the detection floor looks like — the
2026-08-29 numbers for that contrast carried no information, as
`docs/reviews/2026-08-29-grinder-rootms-and-power.md` predicted they would
not.

Achieved MDE was better than declared everywhere: 0.055 / 0.067 (worth) and
0.034 / 0.030 (root) against a declared 0.100. The root family's paired sigma
came in at 0.678 / 0.612 rather than the 1.41 it was sized on — the prereg
called this out in advance ("both arms here are the same fusion differing in
one dial, whose paired sd is likely SMALLER, so sizing on it is
conservative"), and that held.

## The honest reading of the root result

The root PASSES its gates but its effect is **below the MDE declared before
the run**. `_schema.json` defines `mde` as "the smallest difference worth
calling a gameplay change — not the effect you expect to find", and we set it
at 0.100. The root delivers 0.029 (maze A) and 0.091 (maze B).

So the correct statement is: **the root capture is real, is not harmful, and
is worth less than the threshold this project declared as meaningful.** It is
not decoration — 3,200 paired cells and a t of 8.42 on maze B rule that out —
but it is not carrying the structure either. The contact damage is.

That is a genuinely different conclusion from either thing said about it on
2026-08-29: the review docs credited the root with part of the improvement
(overstated), and this family's own prereg predicted it would come back null
(also wrong). Recording both errors here rather than quietly landing on the
right answer.

**No change follows from this.** `rootMs: 2000` stays: it passes, it is
harmless, it is the requested value, and the 2026-08-29 duration sweep showed
the point estimates plateau from ~500ms out to 4000ms. A sub-MDE effect is
not a retune trigger; it is a note about where the value comes from.

## Caveats carried from the preregs

- **CROSS-POLICY GATE IS EMPTY.** Only `scripted-v1` exists, so every verdict
  here is PROVISIONAL on a policy gate that cannot yet be met. Declared in
  both preregs up front, not discovered afterwards.
- **R2 bars terminal measures.** Only 0-7% of runs end with the hall alive,
  so `hallHpFrac` and win rate are floor-censored and were never eligible;
  `hallHpAuc` is exempt as an integral over waves played.
- **No cross-family ranking.** `humanElement` confounds comparison against
  fusions in other families. This says Grinder beats ITS OWN control, nothing
  about where it ranks in the roster.
- **BH family-size mismatch is intentional.** Both preregs declared
  `familySize: 12` spanning the two families together while each store
  contains 6 tests; analyze pads the missing 6 with p=1, which makes the
  correction STRICTER, not looser. Flagged by the tool, expected by design.

## Process notes worth keeping

Two traps hit on the way here, both caught before they corrupted a verdict:

1. **The first clean run was still stamped dirty**, because `record.js`
   computes `dirty` from `git status --porcelain`, which counts UNTRACKED
   files — a pile of unrelated art assets in the tree was enough.
   `analyze.mjs` refused outright rather than quietly reporting. The art was
   stashed, both sweeps re-run, and the art restored.
2. **The first sweep's own output dirtied the tree for the second.** Writing
   `2026-08-30-grinder-r3-worth.jsonl.gz` into `test/harness/store/` left an
   untracked file, so the root sweep that followed it was stamped
   `dirty=true` even though the tree had been clean when the pair started.
   Fixed by parking the first store outside the repo while the second ran.
   **Anyone running two registered sweeps back to back will hit this.**
