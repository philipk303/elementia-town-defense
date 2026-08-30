# Rock Trap standalone measurement — paste this into a new session

Branch `codex/redesign-reconciliation`, current HEAD `a1c8b07`. Suite
611/611/2 skipped, `npm run build` clean.

## Why this session exists — and a correction to an earlier handoff

Both prior Task 20 handoffs (`2026-08-02-task20-balance-sweep-prompt.md` and
`2026-08-02-task20-fusion-siting-instrument-fix.md`) stated Rock Trap is
**"not implemented — no `ROCK_TRAP` entry exists in `shared/balance.js`/
`shared/constants.js`."** That claim is wrong. It checked for the wrong key.

**Rock Trap ships today under the name `EARTH_SPECIAL`** — the human Earth
player's base special structure, exactly the same "display name differs from
shipped type ID" pattern as `MAGMA_TRAP` being Volcano's real key:

- `shared/balance.js:253-258` — full balance entry (`targetImpact: true,
  rangePx: 140, telegraphMs: 500, damage: 40, splashDamage: 6,
  splashRadiusPx: 32, cooldownMs: 4000`, cost 8, hp 70).
- `server/game/structureBehaviors/targetImpact.js` — the behavior module's
  own header comment says it was written *for* Rock Trap (Task 11) before
  Blizzard was layered on top of the same family (Amendment C.3, Task 14).
  The highest-max-HP-selection + primary/splash-resolution code path
  (`selectHighestMaxHp`/`resolveImpact`, the non-`denseCluster` branch) is
  Rock Trap's actual, live implementation.
- `server/game/towers.js:124` — wired into the tick loop
  (`if (spec.targetImpact) tickTargetImpact(...)`).
- `test/game/rockTrap.test.js` — passing test file, already part of the
  611-test suite.

So there is nothing to build. **Do not implement a new structure.** Anyone
picking this up should read `shared/balance.js:247-258` and
`structureBehaviors/targetImpact.js` first to confirm this for themselves
before doing anything else — don't take this handoff's word for it either.

## What's actually missing

Rock Trap has only ever been exercised as a **fusion ingredient** — it is
one half of Magma Trap (+FIRE), Muddy Bog (+WATER), and Grinder (+WIND), and
has appeared in every fusion-roster sweep this program has run purely in
that role. It has **never been measured standalone** against the Watchtower
anchor the way Firepit got its own dedicated falsification test
(`docs/reviews/2026-07-25-firepit-falsification-test.md`) or the way this
session's structure-tuning pass measured Magma Trap/Muddy Bog/Blizzard/
Steam Vent directly.

That standalone reading is the actual gap. Amendment A1.4's niche-floor test
(>= 1.0 *in its designed scenario*, declared in advance; no strict
domination required) has never been run against Rock Trap on its own.

## Scope for this session

1. **Read the Firepit falsification test first** — it is the precedent for
   exactly this kind of single-structure standalone measurement, and it
   found two instrument defects before its verdict could be trusted. Don't
   skip that discipline here.
2. **Declare Rock Trap's designed scenario before measuring.** Per its spec
   (`docs/superpowers/specs/2026-07-25-combat-structure-redesign.md:177-206`,
   §5.2): "targets the enemy with the highest maximum HP in range... very
   high direct damage... low splash." This reads as a priority-target burst
   weapon, not a positioning-dependent one (unlike Blizzard/Grinder, its
   value doesn't hinge on cluster geometry or eject direction) — but confirm
   that reading before assuming it, the same way this session had to for
   Blizzard/Muddy Bog.
3. **Siting note, already partially handled:** Rock Trap (`EARTH_SPECIAL`)
   is in `WALKABLE_TYPES` (`shared/constants.js:130`), so it is subject to
   the same flank-vs-funnel confound this session's fusion-siting fix
   addressed (`docs/reviews/2026-08-02-fusion-flank-siting-instrument-fix.md`).
   The good news: the harness's **DEFENSE arm** (what a standalone
   Watchtower-comparison sweep would actually use — see
   `test/harness/matchRunner.js`'s `defSites` logic, ~line 297) already
   tries `funnelSites` before `towerSites` for any walkable defence, so this
   is a *different, already-funnel-aware* code path from the fusion
   `freeSpecialSites` option this session added. Confirm this is true rather
   than assuming it transfers — the fusion path and the defense-arm path are
   genuinely separate pieces of code.
4. **Measure Rock Trap against Watchtower at equal gold**, same protocol as
   `docs/reviews/2026-08-01-tower-baseline-retake.md` — reuse that method,
   don't reinvent it. `defence: 'EARTH_SPECIAL'` in `runMatch`/`probe.js`
   should already exercise the right code path; confirm with a small manual
   run before committing to a full 144-cell sweep.
5. **Hang gate first**, both mazes, before any effect-size claim — same
   discipline every prior sweep in this program has used.
6. **Hang-imputation + split-half on every claim** — `probe.js`'s `METRICS`
   table already does this generically (see `elementia-baseline-review-
   lessons` memory); don't hand-roll a shortcut.

## What NOT to do

- Don't implement anything. If you find yourself writing a new behavior file
  or a new balance.js key named `ROCK_TRAP`, stop — you have misread this
  handoff. The structure exists as `EARTH_SPECIAL`.
- Don't tune Rock Trap's numbers in this session unless the measurement
  itself surfaces a clear problem — same ranked-options-then-ask pattern
  this project has used every time a falsification test fired.
- Don't assume the fusion-siting fix's `freeSpecialSites` option is what you
  need here — it isn't; the defense-arm path is separate (see point 3).

## Context you'll need

- `shared/balance.js:247-258` and `structureBehaviors/targetImpact.js` —
  confirm the "already implemented" claim yourself before proceeding.
- `docs/superpowers/specs/2026-07-25-combat-structure-redesign.md:177-206`
  (§5.2) and the C.2 amendment (~line 913) — Rock Trap's actual design spec.
- `docs/reviews/2026-07-25-firepit-falsification-test.md` — the standalone-
  structure measurement precedent to follow.
- `docs/reviews/2026-08-01-tower-baseline-retake.md` — the equal-gold
  Watchtower-comparison method to reuse.
- `docs/reviews/2026-08-02-fusion-flank-siting-instrument-fix.md` — this
  session's siting-confound finding; relevant context, not a template to
  copy verbatim (different code path, per point 3).
- `elementia-baseline-review-lessons` memory — hang-imputation/split-half
  discipline.

## Output

A dated review doc under `docs/reviews/`, same format as the Firepit
falsification test or the tower baseline retake: hang gate result, declared
scenario, equal-gold comparison against Watchtower with hang-imputed t and
split-half rho, explicit A1.4(a) verdict (or an honest "no verdict, here's
why" if the measurement can't support one). Ranked recommendations if
anything looks wrong — nothing landed unilaterally.

**Recommended model: Sonnet 5** — this is harness-driven measurement reusing
an existing, well-established method (the tower baseline retake), not new
instrumentation design. Escalate to Opus only if the defense-arm siting
question in point 3 turns out to be more tangled than expected, or if a
genuinely new soft-lock pattern shows up during the hang gate.
