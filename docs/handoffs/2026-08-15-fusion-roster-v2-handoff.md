# Next-session prompt — Elementia balance, post fusion-roster-v2

Paste the block below into a fresh session.

---

Resume Elementia balance work. Read first:
  docs/reviews/2026-08-15-fusion-roster-v2-result.md
  docs/reviews/2026-08-15-wp5-competent-v1-review.md

WHERE WE ARE. Three commits landed on master (85d364c, 67b8d3a, 5dee2f3).
Suite 798/796/0/2.

The instrument is VALIDATED for the first time. `hallHpAuc` is adopted as the
primary metric: it clears all four gates on every rung of the Watchtower ladder
on both mazes, is monotone on both, and needs ~40% fewer runs than `score`.
Regime is R1 = {spendDown: true, maxWaves: 8} on the 12-site isolated pool.

The fusion roster was then re-measured on it: 16,200 runs, n=900/cell, 0 hangs,
100% combo formation. THE DESIGN ASSUMPTION FAILED and the failure is the most
important thing to carry forward.

THE BLOCKER. A1.4(a)'s "worth at least the gold's worth of Watchtowers" bar is
UNANSWERABLE in R1. The sweep assumed spendDown would convert the control's
surplus gold into towers. It does not: `towersPurchased` is ~12.1-12.4 in EVERY
arm (the 12-site pool saturates) and `goldUnspent` is ~300 in EVERY arm. There
is no gold opportunity cost, so the fusion is effectively free. No fusion may be
recorded as clearing A1.4(a) from that corpus.

THE INCOME LEVER WAS TESTED AND IS REFUTED (4032 runs, commit 4a1f572, see
docs/reviews/2026-08-15-income-calibration.md). Sweeping HALL_BASE_INCOME 10 -> 0
leaves towersPurchased identical to three decimals (12.142, sd 0.397) and
hallHpAuc identical at every rung. At ZERO hall income the policy still ends with
246 gold unspent -- 3.4x the cost of filling the whole 12-site pool. The defence
is SITE-limited, not gold-limited. Expanding the pool instead is ruled out too:
both validated larger pools censor (gapWideDeep ceilings maze A at w8, floors
maze B at w9).

So fusions genuinely ARE free in the shipped economy. A1.4(a)'s premise is false
about the game as balanced, and this is now measured rather than inferred.

FIRST DECISION, and it is a DESIGN call that is yours, not a measurement
question. Restate A1.4(a): replace "worth at least its gold in Watchtowers" with
"contributes positively at all", which fusion-roster-v2 already measures at
n=900/cell. The alternatives (cut ~78% of total income; ship the archived
defence-pool patch) both change the game in order to preserve a criterion whose
premise the game does not satisfy. Separately and independently: "gold is not
scarce" may itself be a play problem worth fixing -- but fix it for play reasons,
not to rescue a measurement.

THEN THE RETUNE TARGETS, which hold at the weaker "contribution when free" bar
and are actionable regardless of how the above resolves:
  - Steam Vent is HARMFUL on maze B: -0.137 hallHpAuc, all four gates
    (q 1.6e-5), corroborated by score -0.210 and wavesCleared -0.171. A
    structure that makes the defence worse for free is a defect.
  - Muddy Bog is very likely harmful on maze B (-0.334, t -9.15, three metrics
    agreeing at |t|>6) but is blocked by the earth/B split-half rho of 0.20.
    Unresolved, not refuted -- chase the low rho first.
  - Firestorm has NO measurable contribution on either maze even when free. The
    Phase-2 nerf likely overshot.
  - Positive when free: Blizzard B +0.242, Grinder A +0.092, Magma Trap A +0.055.
  - Likely mechanism for negative-when-free: fusions are 2x2 BLOCKING structures
    at the funnel, and blocking structures re-routing the horde for the worse is
    already documented (regime-calibration section 6).

Any retune needs its own pre-registration. No balance change has shipped.

CARRY THESE FORWARD.
  - Before designing ANY equal-gold comparison, check `towersPurchased` and
    `goldUnspent` in the target regime first. That is the mistake above.
  - All three EARTH fusions are positive on maze A and <=0 on maze B; Blizzard is
    the exact reverse. A retune that fixes B may break A. Measure both.
  - The split-half gate is DEGENERATE in small families: splitForMetric ranks the
    ARMS, so with 2 arms Spearman rho is +/-1 by construction and with 3 arms it
    takes only four values. Declare it uninformative up front below ~4 arms.
  - A schema-invalid prereg fails SILENTLY -- analyze.mjs prints descriptives
    only. A ~260-line output means it failed; ~1900 means it worked. Check the
    banner.
  - The CROSS-POLICY GATE IS EMPTY. Only scripted-v1 exists, so every v2 verdict
    is provisional. WP5 must be re-scoped: a siting-only policy provably cannot
    diverge in the 12-site pool (isolatedTowerSites is already row-major, so
    scripted-v1 alternates lanes for free). The levers with headroom are what it
    buys, when it buys, or ability usage -- the spec's third, untouched
    behaviour. Do not re-attempt lane balancing.
  - R1 NEVER measures waves 9-10, where the elites concentrate. Fusions are
    plausibly exactly the structures whose value lives there.
  - hallHpAuc ceilings at 8.0; maze A sat 46% at the observed max in the v2 2x
    arm. Check ceiling share before believing a large positive maze-A effect.
  - Run big sweeps in a throwaway worktree at HEAD (git worktree add
    .worktrees/bench-x HEAD --detach) or records carry dirty:true. Write to
    plain .jsonl -- the runner's resume-check cannot read a non-existent .gz --
    then gzip after.
  - Dispatch Codex only via tools/codex/dispatch.sh.

SETUP. Opus 5. The A1.4(a) decision and any retune are judgement calls on a
validated instrument -- do them inline, not in subagents. If WP5 is re-scoped and
built, Sonnet can build it with an Opus 5 review, but it is NOT on the critical
path to playtesting.
