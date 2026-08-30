# Muddy Bog: decoupling damage from its own root

Date: 2026-08-28 (second session of the day). **EXPLORATORY — no registered
family, no prereg, no verdict gates.** One mechanic change
(`server/game/structureBehaviors/areaEntry.js`), one balance retune
(`shared/balance.js`), 51,000 sweep runs across two corpora, 0 crashed, 0
hangs. Every figure below is a plain paired contrast — fused minus
`bog-unfused` on identical seeds — computed directly off the raw store
records with `pairedDeltas`/`pairedT` from `test/harness/stats.js`, not read
off `analyze.mjs`'s unpaired descriptive table and not computed with
`--option-set` (that estimator is under a registered hold, per
`docs/reviews/2026-08-27-option-set-procedure-check-result.md`).

**This write-up was independently reviewed (Opus 5, adversarial pass,
recomputing every headline number from the raw store records rather than
trusting this document or any script left behind).** The review confirmed
the arithmetic and found no bugs in the mechanism itself, but caught real
problems in the first draft of this document and in test coverage — both are
fixed below and called out explicitly rather than silently corrected, since
one of them changes the causal story.

Following up on `docs/handoffs/2026-08-28-muddy-bog-decouple.md`, written at
the end of the prior session, which found Muddy Bog was the one fusion in the
2026-08-28 roster-worth retune (`docs/reviews/2026-08-28-fusion-roster-worth-retune.md`)
that no dial could fix, because its pulse damage only ever applied to enemies
its own root currently owned — total damage was `root uptime x tick damage`,
and both factors saturated independently.

## 1. The mechanic change

`areaEntry.js`'s damage loop used to iterate `s.bgRooted` (a map keyed on
root ownership) and skip any enemy whose `rootSourceId` wasn't this Bog. It
now iterates `s.bgPulse`, a map keyed purely on **footprint presence** — any
enemy standing inside the 2x2 rect takes pulses, rooted by this Bog or not.
Root ownership survives as `s.bgRooted` (now a `Set`), used only to pay the
lingering slow when ownership is lost — unchanged in every other respect.

This has three real, intended behaviour changes from the old code, all now
covered by tests:
1. An enemy still takes damage after ITS OWN root (owned by this Bog)
   naturally expires, as long as it stays in the footprint.
2. An enemy rooted by a **different, longer** root from another source still
   takes THIS Bog's damage while standing in its footprint — the old code
   dropped it the instant ownership moved.
3. A **root-immune** enemy (elite Goblins — `enemyTypes.slowRootImmune`,
   `SPEED.SUPER_FAST`) took literally zero Bog damage under the old code,
   since it never entered the root-ownership map in the first place. It now
   takes full pulse damage from standing in the mud, independent of its CC
   immunity. This is arguably the single largest behaviour change in this
   session and was missed entirely in the first draft of this review — the
   independent reviewer caught it, not this session's own read.

`test/game/muddyBog.test.js`: the test asserting damage stopped at root
expiry was rewritten to assert the opposite; new tests cover both (2) and (3)
above; the entry-only test was rewrapped in `withHistoricDamage` after the
reviewer found it was silently reading a stale/dead enemy's pooled status
object at the shipped damage value (a corpse can't be rooted, but the test
happened to pass anyway — see finding 8 in the review, folded in below).
14 tests, all passing.

## 2. The retune, the surprise in it, and a second surprise the review found

**Expectation going in:** removing the multiplicative ceiling should let a
*much smaller* nominal `pulse.damage` than 12 produce equal or more total
damage, since a decoupled pulse fires on every tick an enemy is in the
footprint rather than only while rooted.

**First surprise: that expectation was wrong.** Full sweep, all 15 damage
arms plus control (paired contrast, fused minus `bog-unfused`, n=1500 pairs
per cell):

| pulse.damage | maze A mean (t) | maze B mean (t) |
|---|---|---|
| 1 | −0.018 (−0.77) | −0.510 (−15.51) |
| 2 | +0.044 (2.07) | −0.504 (−14.85) |
| 3 | +0.053 (2.62) | −0.385 (−11.55) |
| 4 | +0.056 (2.93) | −0.323 (−9.98) |
| 6 | +0.090 (4.61) | −0.223 (−7.63) |
| 8 | +0.092 (4.66) | −0.263 (−8.95) |
| 12 (old shipped value, re-measured under the NEW code) | +0.080 (4.20) | −0.148 (−5.43) |
| 16 | +0.093 (4.64) | −0.256 (−8.79) |
| 20 | +0.126 (6.35) | −0.128 (−4.80) |
| 24 | +0.122 (6.13) | −0.014 (−0.57) |
| 25 | +0.124 (6.17) | −0.019 (−0.76) |
| 26 | +0.123 (6.12) | −0.013 (−0.52) |
| **27** | +0.120 (6.00) | **+0.203 (8.08)** |
| **28 (shipped)** | **+0.123 (6.14)** | **+0.201 (7.99)** |
| 32 | +0.149 (7.49) | +0.280 (10.83) |

**This range does not "hold flat" — it oscillates.** The first draft of this
document reported only 10 of these 15 arms and called the 12–26 stretch a
flat shelf. Consecutive arm-to-arm contrasts on maze B (same cells, more
powerful than each arm vs. control) show real, resolvable movement inside
that stretch: 8→12 is +0.114 (t 4.60), 12→16 is −0.108 (t −4.48), 16→20 is
+0.128 (t 5.40) — a ±0.11 zigzag, the same order of magnitude as the
eventual headline effect, not noise. What IS real and reproducible is the
step between 26 and 27: raw mean hallHpAuc on maze B jumps 7.302 → 7.518 at
n=1500 pairs each (t goes from −0.52 to 8.08), and it replicates across
disjoint seed halves (t 7.36 and t 9.27 independently) — a genuine threshold,
not a shelf-then-cliff. Its mechanical cause wasn't pinned down; a plausible
candidate is that an elite Troll (hp 270 = 27 × 10 exactly) is the first
enemy tier to die one pulse sooner at 27 than at 26, but this is a hypothesis,
not a confirmed mechanism.

**Second surprise, found only by the independent review: decoupling barely
mattered, empirically, at the shipped value.** A follow-up control sweep ran
`pulse.damage: 28` under the OLD, root-gated code (3,000 runs, identical
seeds, `test/harness/store/2026-08-28-bog-oldgate-dmg28-check.jsonl`) and
compared it against the same `bog-unfused` control:

| | maze A | maze B |
|---|---|---|
| damage 28, OLD root-gated code | +0.115 (t 5.79) | +0.201 (t 8.01) |
| damage 28, NEW decoupled code | +0.123 (t 6.14) | +0.201 (t 7.99) |

**These are statistically indistinguishable.** The thing that actually
cleared the bar in this sweep range was raising the damage number past the
26→27 threshold — not the mechanism fix. Root's own duration window
(600–2400ms) turns out to already cover most of the relevant kill-or-leave
window at this damage level, so decoupling only matters for the cases where
an enemy outlives its own root while still standing in the footprint, which
is apparently rare enough at damage 28 to be invisible in this contrast.

The decoupling is kept anyway, deliberately, for two reasons that don't
depend on this sweep range: (1) it fixes a real, previously-measured edge
case — with root disabled, the old code dealt **literally zero damage**
(bit-identical across 3,000 cells at damage 3 and 12 with root off), which
is a bug regardless of how often it bites at the tuned value; (2) the
cross-source and root-immune behaviour changes (§1, items 2–3) are correct,
intended design, not incidental side effects to be routed around. But the
causal claim "decoupling is what unlocked the fix" does not hold at the
value actually shipped, and this document said otherwise in its first draft.

**Shipped: `pulse.damage: 28`.** Maze B +0.201 (t 7.99, clearly positive —
the bar was "better than −0.147, ideally ≥ 0"), maze A +0.123 (t 6.14,
comfortably above the +0.079 floor). `root.msByWeight` and `lingerSlow`
unchanged.

## 3. The win is not uniform across the scenario grid

Decomposed by `postGap` (maze B, vs. control):

| pulse.damage | postGap 0 | postGap 1 |
|---|---|---|
| 26 | −0.088 (t −2.68) | +0.062 (t 1.66) |
| 27 | +0.056 (t 1.76) | +0.350 (t 9.17) |
| 28 | +0.053 (t 1.66) | +0.350 (t 9.15) |

The shipped +0.201 is a pooled average of a non-significant postGap-0 result
and a large, clearly significant postGap-1 result. At postGap 0, Bog at
damage 28 is not resolvably better than not building it at all. This isn't
disqualifying — pooling across the scenario grid is the standing protocol
for every fusion in this project — but "building Bog is no longer a mistake
on maze B" is true on average, not true at every gate, and that distinction
was missing from the first draft.

## 4. A conflict with a prior note, surfaced rather than hidden

A 2026-08-04 comment in `shared/balance.js` (still present, now amended)
flagged that pulse damage 12 exactly one-shots a full-HP Goblin (hp 12) on
the very first pulse — killing it before the player ever gets to observe the
root/slow effect doing anything — and said any future candidate should stay
under 12 for that reason. (Root and slow are still applied that same tick —
`applyRoot` runs before the pulse loop — the goblin just doesn't survive
long enough for it to matter.)

**28 is well past that line, and now ALSO one-shots even root-immune elite
Goblins via the footprint gate**, which the old code couldn't do at all. The
reasoning in the old note doesn't mechanically hold anymore — it was really
about the *cause* being root-gated damage, where a low nominal number was
the only lever available at all — but the *symptom* it was worried about (an
enemy dying too fast for the player to register what's happening) is, if
anything, worse now, and broader. This is a real, undecided tension between
"the measured number that clears the balance bar" and "the number a previous
session thought preserved a legible fight," and it is not resolved by more
sweeping — it needs a human to look at it.

## 5. What still hasn't happened

Per the handoff's standing note: **no human has played any of the six
fusions changed on 2026-08-28**, and this session adds a seventh material
change (Bog's damage model, plus a damage value nearly 2.5x the previous
one) on top. Every simulated match still runs against the scripted bot,
which cannot report on feel, pacing, or whether a goblin — or now an elite
goblin — dying in a single frame reads as satisfying or broken. This is now
the single highest-value next step before any further dial-turning on this
roster.

## Sweep artifacts

- Main spec: `test/harness/bench/specs/bog-decouple-retune.json` — 16 arms
  (15 `pulse.damage` values 1–32 plus `bog-unfused` control), mazes A/B, 750
  seeds x 2 postGaps each = 48,000 records total, in
  `test/harness/store/2026-08-28-bog-decouple-retune.jsonl`.
- Old-gate control check: `test/harness/bench/specs/bog-oldgate-dmg28-check.json`
  — 1 arm (`pulse.damage: 28` under a temporarily-reverted `areaEntry.js`,
  via `git stash`, restored immediately after the sweep), same seeds, 3,000
  records, in `test/harness/store/2026-08-28-bog-oldgate-dmg28-check.jsonl`.
  Compared against the same `bog-unfused` control cells from the main store
  (that arm never touches `areaEntry.js`, so its records are valid regardless
  of which version of the file was checked out when it ran).
- Protocol, identical across both corpora and matching the handoff's spec:
  `spendDown: true, maxWaves: 10, humanElement: EARTH, defence: WATCHTOWER,
  defenceCap: null, legacySiting: false, specialSiting: funnel,
  freeSpecial: true, fuse: true, fuseWith: WATER, fuseWave: 4`
- Both runs dirty (`git status --porcelain` non-empty at sweep time, from
  unrelated pre-existing untracked art assets in this working tree, not from
  this session's own edits mid-sweep — confirmed the old-gate sweep's
  `areaEntry.js` state was the stashed/reverted one via a resolved-protocol
  dry-run and a diff check before running). Analyzed with `--allow-mixed`;
  every record within each store shares one dirty engine snapshot, so this
  does not affect the internal validity of the paired contrasts — only
  reproducing the exact sweep from a clean checkout later needs the git sha
  plus a clean tree.
- Suite: 896 pass / 0 fail / 2 skipped (unchanged from the mechanism-only
  draft; net +2 tests from the review's coverage fixes, net +1 from the
  original decouple work, vs. 895/0/2 at handoff).
