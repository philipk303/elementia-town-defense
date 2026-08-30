# Next-session prompt — Elementia balance, the R2 fusion roster re-take

Paste the block below into a fresh session.

---

Resume Elementia balance work. Read first:
  docs/reviews/2026-08-16-steam-vent-dials.md
  docs/reviews/2026-08-15-regime-r2-adoption.md
  docs/reviews/2026-08-15-steam-vent-mechanism.md  (note its correction banner)

WHERE WE ARE. Nine commits landed on master today (744b318 through a9505a2).
Suite 801/799/0/2. Nothing is blocked and nothing is half-finished.

THE JOB THIS SESSION: **re-measure the full 6-fusion roster on R2 with the
two-ingredient control.** Every number in fusion-roster-v2 was taken against the
wrong baseline in a window that could not see the answer, and both defects are
now fixed. This is a large but entirely mechanical sweep — the instrument work
is done, the discipline is established, and there is no open design question
blocking it.

WHY THE OLD ROSTER NUMBERS DO NOT COUNT. Two independent instrument defects,
both fixed today:

1. **The control held ONE ingredient.** The partner special was bought only
   inside the fuse branch, so `fuse:false` left the control with just the free
   special while the fusion arm gave up two. Spec §1 asks a fusion to beat
   BOTH. Fixed by `partnerSpecial: <ELEMENT>` (commit 79bba51), which buys the
   partner at the fusion's own anchor tile and declines the proposal. Measured
   consequence: Steam Vent's harm was −0.137 against the old control and −0.309
   against the correct one.
2. **R1 was ceiling-blind and stopped before the elites.** 19%/34% of control
   runs sat at the hallHpAuc maximum and the top Watchtower ladder rung moved
   maze A by +0.0011 — R1 could see the defence get worse and was nearly blind
   to it getting better, which is backwards for grading structures meant to
   help. R2 = {spendDown, maxWaves 10} was adopted on 18/18 gates (commit
   edbb95d): 0% ceiling on both mazes, same dose moves maze A +0.713, reaches
   wave 9 in 68–84% of runs.

HOW TO BUILD IT. Three families again (earth/fire/water), because `humanElement`
sets the human's class and a cross-element control would confound the fusion
with the player. Each arm pairs against a `control` that carries the SAME
`humanElement` AND `partnerSpecial` set to that fusion's partner element. Note
this means each family needs one control PER PARTNER, not one control total —
the earth family's Magma Trap, Muddy Bog and Grinder consume different second
ingredients, so they cannot share a two-ingredient control. That is the one real
design difference from fusion-roster-v2 and it is easy to get wrong.

  regime:  {spendDown: true, maxWaves: 10}
  metric:  hallHpAuc, secondaries score + wavesCleared
  n:       3000/cell (1500 seeds x 2 postGaps); nRequired 2990 at MDE 0.10
  seeds:   20320801 + i  (every earlier set is used — see below)
  runtime: roughly 6 min per 18,000 runs

SEEDS ARE DETERMINISTIC (`20260801 + i`, run.mjs:77). Re-running at the same
count reproduces an earlier corpus byte for byte, which is a determinism check
and NOT a replication. Sets already consumed: 20260801+ (fusion roster v1, the
mechanism family, the wave-10 probe), 20270801+ (steam-vent replication),
20280801+ (R2 adoption), 20290801+ (steam-vent retune), 20300801+ (scald dial),
20310801+ (slow dial). Start at 20320801+.

THE STANDING TRAPS, all of which bit someone today:
  - **Commit the spec BEFORE creating the bench worktree**, or the records carry
    `dirty: true` and analyze refuses to pool them. Write to plain `.jsonl` (the
    runner's resume-check cannot read a non-existent `.gz`), then gzip after.
  - **A schema-invalid prereg fails SILENTLY** — analyze prints descriptives
    under an EXPLORATORY banner. Check for the banner and the line count; ~260
    lines means it failed, 1500+ means it worked. `positiveControl` must declare
    exactly ONE of `expectedEffect` or `expectedDirection`.
  - **Split-half is degenerate below ~4 arms** (splitForMetric ranks the ARMS).
    Declare it uninformative up front rather than letting it block a verdict —
    that gate is what blocked Muddy Bog.
  - **R2 bars every TERMINAL measure.** Only 0–7% of runs end with the hall
    alive, so hallHpFrac and win rate are floor-censored. hallHpAuc is exempt as
    an integral over waves played. Do not add a terminal secondary.
  - **Attribute through the outcome metric with paired arms.** Today's worst
    error was isolating a structure's contribution via a damage ledger; total
    structure damage is nearly CONSERVED, because if one structure does not
    remove the enemy pool's fixed HP the Watchtowers do. That measure returns
    ~1.0 for anything.

WHAT TO EXPECT, stated so it is not read as confirmation afterwards. Every
fusion's number should move DOWN relative to fusion-roster-v2, because the
control got stronger by one whole structure. The interesting question is which
fusions still clear it. Steam Vent is the calibration point: it went from
−0.137 (old instrument) to −0.015 (retuned, correct instrument) and is now
roughly break-even with its ingredients.

STEAM VENT IS DONE AND NEEDS NOTHING THIS SESSION. Confusion retired, scald 8
confirmed as the retune's real driver (+0.253 maze B, t 13.20), slow retained on
a pre-declared cross-policy caveat despite its registered rule firing for DROP.
Its defect is fixed; it does not yet OUTPERFORM its ingredients, and that is the
roster-wide question this sweep answers rather than a Steam Vent to-do.

TWO OPEN ITEMS, NEITHER BLOCKING:
  - **The confusion subsystem is dead code.** status.js, the enemies.js wander
    steering and the serialization bit all still work, are still pinned by tests
    that now drive `applyConfusion` directly, and nothing in the shipped game
    calls them. Deliberately left in place so a bad retune stayed cheap to
    revert. The retune is now measured as a large improvement, so deleting it is
    a clean standalone commit whenever someone wants it.
  - **The cross-policy gate is still empty** (only `scripted-v1`). Every verdict
    in the project is provisional on it. WP5 needs re-scoping to what/when/
    abilities — a siting-only policy provably cannot diverge in the 12-site pool.
    It is not on the critical path to playtesting.

SETUP. Opus 5. The sweep is mechanical; the judgement is in reading the roster
result and deciding what, if anything, to retune. Do it inline, not in subagents.
