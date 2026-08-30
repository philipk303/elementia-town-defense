# Fusion roster v2 — result

Date: 2026-08-15. Families `fusion-roster-{earth,fire,water}-v2`. 16,200 runs,
engine `d0f9c07`, clean worktree, **0 hangs, 0 crashes**. All three
registrations `valid`, `verdictAllowed: true`, 18+12+6 = **36 tests = the
declared familySize of 36**. Metric: `hallHpAuc` (adopted in
metric-selection-v2), n = 900 per cell.

---

## 0. The headline caveat: this is NOT an A1.4(a) verdict

**The equal-gold premise the design rested on is false, and the pre-registered
A1.4(a) question cannot be answered in R1.**

The design assumed `spendDown: true` would convert the control arm's surplus
gold into Watchtowers, making the measured delta "fusion vs the Watchtowers that
gold would have bought" — the A1.4(a) bar. The corpus refutes it:

| | control | fusion arms |
|---|---|---|
| `towersPurchased` (A) | 12.07–12.37 | 12.10–12.38 |
| `towersPurchased` (B) | 12.23–12.40 | 12.24–12.40 |
| `goldUnspent` | 287–358 | 261–352 |

**Every arm saturates the 12-site pool, and every arm ends with ~300 gold
unspent.** The control cannot buy more Watchtowers because there is nowhere to
put them. There is therefore **no gold opportunity cost in R1 at all**, and the
fusion is effectively free.

This is a re-discovery of §1 of `2026-08-15-regime-calibration.md` — "gold is not
a lever because the policy has nowhere to put it" — which was on record before
this sweep was designed. It should have been anticipated; it was not.

**Consequence:** every delta below measures the fusion's contribution **at zero
opportunity cost**. That is a strictly *weaker* bar than A1.4(a). A positive
result here means "better than nothing", NOT "better than the gold alternative",
so **no fusion may be recorded as clearing A1.4(a) on this corpus.** A negative
result, however, is *stronger* than it looks: a structure that hurts while free
is unambiguously broken.

The arms themselves are clean — **100% combo formation in all six fusion arms,
0% in all controls, correct fusion type in 900/900 runs each.** The contrast is
exactly fusion-present vs fusion-absent.

## 1. Results at the achievable bar (contribution when free)

Paired delta vs the same-element control on `hallHpAuc`. Gates: BH q<0.05 across
the family of 36, exact sign test agreement, split-half rho > 0.5,
hang-imputation survival.

| fusion | maze | Δ hallHpAuc | t | q | sign | gates | reading |
|---|---|---|---|---|---|---|---|
| grinder | A | **+0.092** | 5.22 | 2.1e-6 | 395/264 | 4/4 | positive |
| magma-trap | A | **+0.055** | 3.23 | 5.2e-3 | 341/249 | 4/4 | positive |
| blizzard | B | **+0.242** | 6.55 | 3.4e-9 | 505/197 | 4/4 | positive (largest) |
| muddy-bog | A | +0.051 | 2.70 | 2.3e-2 | 335/306 | sign fails | unresolved |
| firestorm | A | +0.010 | 0.79 | 1.00 | 346/380 | — | unresolved |
| steam-vent | A | +0.011 | 1.11 | 1.00 | 323/308 | — | unresolved |
| magma-trap | B | −0.004 | −0.16 | 1.00 | 316/205 | — | unresolved |
| grinder | B | −0.003 | −0.11 | 1.00 | 228/282 | — | unresolved |
| firestorm | B | −0.061 | −2.35 | 0.17 | 183/239 | q fails | unresolved |
| blizzard | A | −0.066 | −3.93 | 8.2e-4 | 254/296 | sign fails | unresolved |
| **steam-vent** | **B** | **−0.137** | **−4.95** | **1.6e-5** | 185/233 | **4/4** | **HARMFUL** |
| muddy-bog | B | −0.334 | −9.15 | 1.4e-17 | 168/403 | rho fails | see §3 |

Both declared secondaries corroborate every decided cell, with no sign
disagreement anywhere:

- grinder A: score +0.158 (t 4.33), wavesCleared +0.108
- magma-trap A: score +0.145 (t 4.43), wavesCleared +0.058
- blizzard B: score +0.165 (t 3.20), wavesCleared +0.160
- steam-vent B: score −0.210 (t −4.79), wavesCleared −0.171
- muddy-bog B: score −0.313 (t −6.01), wavesCleared −0.277

## 2. The split-half gate is degenerate in small families — do not read it as a fourth gate

`splitForMetric` (analyze.mjs:356) ranks the **arms** and correlates the two
seed-halves' rankings, so its resolution is set by the arm count:

- **water family: 2 arms → Spearman rho over two points is ±1 by construction.**
  Blizzard's `rho = 1.00` is **vacuous**; its verdict rests on three gates, not
  four. (It survives that: q = 3.4e-9 and sign 505/197 are strong on their own.)
- fire family: 3 arms → rho ∈ {1, 0.5, −0.5, −1}. A 0.50 fails a `> 0.5` gate on
  a four-value scale.
- earth family: 4 arms → the 0.80 (maze A) and 0.20 (maze B) are the only
  informative split-half values in this corpus.

This is a real limitation of the gate as specified, not of this data. Any future
family with fewer than ~4 arms should treat split-half rho as uninformative and
say so up front.

## 3. Muddy Bog on maze B: the largest effect in the corpus, and it is blocked

Muddy Bog B is −0.334 on hallHpAuc (t −9.15, q 1.4e-17), −0.313 on score
(t −6.01) and −0.277 on wavesCleared (t −6.42). It is blocked from a verdict
solely by the earth family's maze-B split-half rho of 0.20, which is shared
across every arm in that block.

Per the v2 monotonicity/resolvability discipline, the honest label is
**unresolved, not refuted** — but three metrics agreeing at |t| > 6 with 168/403
in the sign test is not nothing. The maze-B earth block's low split-half rho is
itself the finding to chase: it says that block's arm ordering does not reproduce
across seed halves.

## 4. What is actually actionable before playtesting

1. **Steam Vent is a defect.** It is resolvably *harmful* on maze B through all
   four gates and corroborated by both secondaries — while costing nothing. A
   structure that makes the defence worse for free needs a retune, not a
   verdict.
2. **Muddy Bog is very likely a defect on maze B** (§3), pending the split-half
   question.
3. **Firestorm has no measurable contribution on either maze even when free**
   (|t| < 1 on A, q = 0.17 on B). Consistent with the Phase-2 nerf recorded in
   [[elementia-firestorm-phase2-conversion]] having overshot.
4. **The maze split is structural, not noise.** All three EARTH fusions are
   positive on A and ≤ 0 on B; Blizzard is the exact reverse. Worth a mechanism
   study before any retune, because a retune that fixes B may break A.
5. **A likely mechanism for negative-when-free:** fusions are 2x2 **blocking**
   structures at the funnel, and the regime doc already documented blocking
   structures re-routing the horde for the worse (`hallBand`, §6). A fusion can
   plausibly cost more in routing than it adds in damage.

## 5. What this does NOT establish

- **No A1.4(a) verdict, for or against any fusion.** See §0. The roster's
  standing against A1.4(a) is unchanged from before this sweep.
- No balance change ships from this family. It names retune targets; the retune
  is a separate, separately-registered decision.
- **The cross-policy gate is still empty** (only `scripted-v1` exists), so every
  verdict here is provisional on it.
- R1's wave 9–10 scope limit stands: late-elite value is invisible, and fusions
  are plausibly exactly the kind of structure whose value concentrates there.
- `hallHpAuc` ceiling on maze A (46% at the observed max in the v2 2x arm) means
  the maze-A positives are measured in a compressed band.

## 6. To make A1.4(a) answerable at all

The bar needs an opportunity cost that R1 does not have. Options, cheapest first:

1. **`defenceCap` the control below 12** so the fusion arm's gold has somewhere
   to go — but this changes absolute difficulty, so it compares two different
   games rather than two uses of the same purse.
2. **Cut `HALL_BASE_INCOME`** until gold binds. The regime doc showed income
   10→20 was byte-identical *upward*; downward is untested and is the direct
   lever on whether gold is scarce.
3. **Restate A1.4(a).** If gold is structurally non-scarce in the shipped game,
   "worth its gold" may simply not be the right design criterion, and
   "contributes positively at all" — which this corpus *can* measure — may be
   the honest replacement.

Option 2 is the one I would test first, and it is a ~30 s sweep.

**UPDATE (same day): option 2 was tested and is REFUTED.** See
`docs/reviews/2026-08-15-income-calibration.md`. Sweeping `HALL_BASE_INCOME`
10 → 0 leaves `towersPurchased` identical to three decimals (12.142, sd 0.397)
and `hallHpAuc` identical at every rung. At zero hall income the policy still
ends with 246 gold spare — **3.4x the cost of filling the entire 12-site pool**.
The defence is site-limited, not gold-limited, so no income knob can create an
opportunity cost. Option 1 is ruled out separately because both validated
larger pools censor (gapWideDeep ceilings maze A at 8 waves, floors maze B at
9). **Option 3 — restate A1.4(a) — is now the recommended path**, on
measurement rather than on inference.
