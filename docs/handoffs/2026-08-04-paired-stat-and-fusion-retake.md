# Handoff: fusion roster re-take + the paired statistic

**Date:** 2026-08-04 · **Branch:** `codex/redesign-reconciliation` ·
**Commits:** `4937f2a` (instrument fix + reverts), `74b3ceb` (review),
`3d232be` (paired statistic) · Suite **618/620**, 0 fail, 2 skipped,
`npm run build` clean.

## What happened

Two independent measurement defects were found and fixed. They are separate
problems and it matters that they are kept separate.

### 1. The siting confound (`4937f2a`)

Specials are 2 tiles wide and anchored top-left, so the harness's "flank" site
list overlapped the lane **and** competed for tiles with the build policy's
blocking Watchtower. Whichever tile the special took, the tower fell back to
another — and on maze A that displacement alone was worth up to **~1.2 score
points**, larger than the effects being measured. The 2x2 fusion arm also
displaced one more tower than its own 2x1 control arm, so the arms were never
equal-capacity at any siting. Confirmed by falsification: pricing Watchtowers
out of the policy's reach collapsed a 1.26-point spread to noise.

Fixed by `sitingProtocol: 'isolated'` — opt-in, disjoint column bands
(Watchtower pinned to `gap-1` rows 1–6; special/fusion at `gap` for funnel or
`gap+2` for flank). Legacy lists untouched so old numbers stay reproducible.
Pinned by an INSTRUMENT test in `test/harness/matchRunner.test.js`.

Every score-derived 2026-08-02 balance tweak was **reverted to spec-original**
as a consequence: Magma Trap, Muddy Bog, Blizzard, Steam Vent, Grinder. Kept
Steam Vent's `cloudMarginPx` 15 (a geometric spillover bug fix, not a balance
choice). Rock Trap and Firepit go through a different code path and keep their
landed retunes.

### 2. The underpowered statistic (`3d232be`)

`stats.js`'s `classify()` computed an **unpaired** Welch SE on arms that every
driver runs **over the same seeds**, with 51–100 of 144 cells typically tied.
Most of the design's power was being thrown away.

The failure mode is specifically bad for tuning: a real effect reads "not
resolvable", the dial gets pushed harder to make it appear, and the structure
ends up overtuned. **This is the most likely explanation for the hp buffs
reverted above.**

Fixed additively — `pairedDeltas`, `pairedT` (signed; `classify`'s `effect` is
absolute, and losing direction is how a regression gets reported as an
improvement) and `signTest` (exact two-sided binomial, iterative so n=144
doesn't overflow). Six tests pin it. `fusionRoster.js` prints all three
statistics and flags `<-- STATISTICS DISAGREE`.

**`classify()` was deliberately NOT changed** — every published baseline used
it, and redefining it would silently change what those numbers mean.

## Current verdicts (fusion roster, isolated instrument, both sitings)

Hang gate **0/10,368**, `comboFormed` 144/144, 0 mismatches.

| fusion | verdict |
|---|---|
| **FIRESTORM** | **PASS** — positive and paired-significant in all four maze-B cells, both sitings, both timings. **Quote +0.26, never +0.93** (see below) |
| **MUDDY_BOG** | FAIL — significantly negative in 3 of 4 wave-4 cells; clearest negative the project has measured |
| **MAGMA_TRAP** | FAIL — mildly negative on maze B (sign p 0.027, paired t −2.07). The old "worth nothing" reading is dead |
| **STEAM_VENT** | NOT RESOLVED at wave 4 (nothing significant under any statistic); genuinely harmful at wave 1. All four maze-B readings fail split-half |
| **BLIZZARD** | NO VERDICT — spec-declared policy-confounded. Cleanly maze-split at both sitings once paired |
| **GRINDER** | NO VERDICT — Philip ruled it needs playtest data |

Adding the paired statistic changed **10 of 48 cells** and flipped one verdict
(Firestorm). In every disagreeing cell the paired t resolved an effect the Welch
t called noise — the power loss is uniform and one-directional.

**Firestorm's open problem is magnitude, not direction.** Flank reads +0.93 and
funnel +0.26 — a 3.6× gap with no mechanism, and the flank cell is an outlier
against three other measurements of the same quantity (0.368, 0.264, 0.257).

## Philip's rulings this session

- **A1.4(a) bar:** positive on *either* maze is enough. Maze A (anchor 8.592) is
  substantially easier than maze B (5.944); requiring both would force
  overtuning.
- **Grinder:** accept it is not verifiable by this harness; it needs playtest
  data. Do **not** build the repositioning policy — feature-sized work for one
  balance number.
- **Commits:** balance/instrument work committed separately from the unrelated
  art/audio changes on the branch.

## Next steps, in order

1. **Retrospective re-read of pre-2026-08-04 baselines through `pairedT` /
   `signTest`.** Highest value remaining. **Needs no re-runs** — per-cell data
   is already on disk in `test/harness/.*.json`. Expect it to retire some "this
   structure is worth nothing" findings the same way it retired Firestorm's.
2. **Extend the standalone Watchtower-anchored protocol** (Rock Trap's) to the
   four zero-skill-dependency fusions. The roster sweep measures a *trade delta*
   ("fuse vs don't fuse with the same gold"), which is **not** A1.4(a)'s "≥ 1.0
   Watchtower power unit at equal gold" bar.
3. **Volley hit-count probe** to settle Firestorm's magnitude. `hitIds.length`
   at `server/game/structureBehaviors/volley.js:45` is already the quantity; it
   needs a state-flag-gated counter like this session's `tiProbe`.

## Do not reopen

Rock Trap's splash/cooldown retune · Firepit's retune · Fissure's power level ·
the siting confound (fixed and pinned) · Grinder.

## Housekeeping

39 uncommitted entries remain on the branch — all unrelated art/audio work,
deliberately excluded from this session's three commits.

## Recommended setup for the next session

- **Model: Opus 5.** The re-read is mechanically simple but interpretively hard,
  and there is a specific trap: a *more sensitive* statistic makes it easier to
  over-read, not harder. This project has a documented history there
  (`elementia-baseline-review-lessons`).
- **Subagents: no** for the re-read itself — one sequential analysis thread.
  **Yes** for a single adversarial reviewer at the end.
- **Review: yes**, before committing the retrospective. Adversarial measurement
  reviewer at Opus 5 or Fable 5. Both reviews run in this project recently found
  verdict-changing errors in drafts that felt finished; one found ten.
