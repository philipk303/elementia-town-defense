# Handoff — Task 3b: Finish the Combat Measurement Primitives

Paste the prompt below into a new Claude Code session. **Model: Sonnet 5**
(same tier as Tasks 1-3 — this is still instrumentation work with a clear TDD
path, not open-ended architecture). One caveat below.

---

You are continuing Phase 8C of Elementia Town Defense — the staged combat
redesign program — with Task 3b, the deferred remainder of Task 3.

Repository: `C:\dev\Elementia-Town-Defense`
Branch: `codex/redesign-reconciliation` (already checked out; do not create or
switch branches)

## Where we are

Task 3's first increment landed as `dc585a8` (2026-07-30): source-tagged
combat accounting in `server/game/combatStats.js`, wired through ONE choke
point — `damageEnemy(state, i, amount, meta)` in `server/game/enemies.js`,
where every damage source in the game already passes through (basic attacks
in `players.js`, abilities in `abilities.js` including the deferred
Fireball-projectile case in `projectiles.js`, structures in `towers.js`).
`state.combatStats` is opt-in (only `test/harness/matchRunner.js` creates
one), following the existing `state.tickOrderLog`/`state.aoeStats` idiom —
absent and inert during normal play and every non-harness test.

That increment covers: damage/hits/kills/unique-targets for basic/ability/
structure, and attempts/misses/useful-activation for basic and ability
(discrete per-cooldown casts only — structures were excluded because a
point-target tower auto-hits with no meaningful "miss", and the area-field
family is continuous, not discrete). Per-wave damage-by-category reconciles
exactly with the run total. 6 reconciliation tests landed in
`test/harness/matchRunner.test.js`. Suite: 361/359/2.

**Explicitly NOT done, and now your job (Task 3b):**
- CC-seconds
- Cooldown utilization
- Displacement progress
- Peak-active-effects
- Generalizing `probe.js`'s hang-imputation/split-half treatment (today only
  applied to `score` and `enemySeconds`) to the new combat metrics

## The goal

Complete Task 3's checklist and close its gate: *"The harness can answer
whether an attack/structure is effective without relying only on DPS."* The
program plan currently marks Task 3 PARTIAL — see the exact split in:

`docs/superpowers/plans/2026-07-26-staged-combat-redesign-program.md`, §Task 3
(read the checklist and the current partial-gate note before starting).

## Key files

- `server/game/combatStats.js` — the existing instrument. Read this first; it
  documents its own scope boundary in the file header.
- `server/game/enemies.js` — `damageEnemy` (~line 384) and `tickEnemies`
  (~line 196). `tickStatus()` is called around line 208, inside the per-enemy
  hot loop — this is your CC-seconds hook (see design note below).
- `server/game/status.js` — the per-enemy status object (burn/wet/slow/root/
  freeze). No caster reference lives here; do not add one unless you have a
  specific need — CC-seconds does not require attributing CC to a source, only
  to the enemy population as a whole (see design note).
- `server/game/abilities.js`, `server/game/towers.js` — where cooldowns and
  displacement (`applyKnockback`) already live; you'll read `BALANCE.ABILITY`/
  `BALANCE.PLAYER.MELEE`/`BALANCE.TOWER` cooldown values from here.
- `test/harness/matchRunner.js`, `matchRunner.test.js` — the harness and its
  tests; this is where cooldown-utilization is most naturally computed
  (post-processing over data the harness already has, not a new engine hook).
- `test/harness/probe.js` — the sweep script; currently only `score` and
  `enemySeconds` get hang-imputation/split-half treatment (see its own
  comments, ~line 197 onward, for the existing pattern to generalize).
- Memory: `elementia-phase8-plan.md`, Session 9 entry — the design note this
  handoff summarizes was written there; read it for the reasoning, not just
  the conclusion.

## Next concrete step

Read Task 3's checklist (program plan §Task 3) and `combatStats.js`'s header
comment, then start the TDD pass for **CC-seconds first** — it's the item
with the clearest single hook. Write a failing reconciliation test in
`matchRunner.test.js` before touching `enemies.js`.

## Design note (already worked out — don't re-derive)

- **CC-seconds**: root/freeze/slow duration lives on the per-enemy status
  object with no caster reference — attribution to a specific ability/tower
  is NOT required (and would need a larger status-object change to add a
  caster field, which is out of scope). Track it as a population-wide
  enemy-seconds-under-CC figure, the same shape as the existing
  `state.aoeStats.enemySeconds` pattern in `towers.js`'s `tickArea`. Hook it
  at `tickStatus()`'s call site in `enemies.js` (~line 208): accumulate
  `dtSec` for every enemy where `s.rootMs > 0 || s.freezeMs > 0` (hard CC);
  decide with the harness numbers in hand whether slow (partial CC) deserves
  a separate, weighted bucket or should stay out of this metric entirely.
- **Cooldown utilization**: each source's `attempts` count already exists in
  `combatStats`. Utilization = attempts / theoretical-max-attempts given
  `fightTicks * DT_MS / cooldownMs`. This does NOT need a new engine hook —
  compute it in `matchRunner.js` as a post-processing step once a wave/run
  closes, reading the relevant `cooldownMs` out of `BALANCE`.
- **Displacement progress**: `applyKnockback` (`enemyMove.js`) already
  computes push/pull; the natural measurement is total displacement distance
  applied per source per wave — likely a small additive hook next to the
  existing knockback call sites (similar shape to the `damageEnemy` meta
  pattern, but for `applyKnockback` instead).
- **Peak-active-effects**: track the running max of concurrent
  structure-owned effects / projectiles per tick — `BALANCE.LIMITS` (from
  Task 2, `shared/balance.js`) already names the SAFETY BUDGET ceilings for
  these; this metric is the harness reading the live count against that
  ceiling, not a new counter design.

## Caveat on the model choice

CC-seconds is the one item here that touches `enemies.js`'s hot per-tick
enemy loop — a previously soft-lock-prone area (see the
`elementia-hall-ring-softlock` memory: a real production bug lived in exactly
this loop, fixed 2026-07-25). Budget more care there specifically than the
rest of this task warrants: read the surrounding loop fully before editing,
and re-run the FULL suite (not just `test/harness/*`) after any change to
`enemies.js`, not only the targeted test file.

## Open decisions / blockers

None declared — this is scoped, TDD-shaped follow-on work with no open
question requiring Philip's input before starting.

## When done

- Run `npm test`; confirm no regressions against the 361/359/2 baseline.
- Update Task 3's checklist/gate in the program plan from PARTIAL to closed
  (or note what remains, if anything still doesn't fit).
- Update `docs/plans/2026-07-26-slice1-status-ledger.md`'s baseline count and
  "next authorized work" line.
- Commit as `test: complete combat-source instrumentation (Task 3b)` (or
  split into smaller commits per metric if that reads better in review —
  your judgment).
- Stage by name, never `git add -A` — the tree still holds unrelated
  `art/`, `audio/`, `tools/`, `client/public/`, wind-preview files, and
  `docs/handoffs/` itself (all untracked, a separate work stream).

## Recommended setup for this session

- **Model: Sonnet 5.** Same tier as Tasks 1-3 — clear TDD path, not
  open-ended architecture. See the caveat above re: the CC-seconds hook.
- **Subagents: none.** Single sequential thread; the sub-items build on each
  other's harness plumbing rather than being independently parallelizable.
- **Review after landing: yes.** Engineer/code-reviewer role, **Opus 5**.
  Touching the hot enemy-tick loop plus generalizing `probe.js`'s
  hang-imputation/split-half pattern to new metrics is exactly the kind of
  change that can look right and be subtly wrong — worth a second pass before
  this gets built on further.
