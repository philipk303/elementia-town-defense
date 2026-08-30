# Task 17 adversarial review — paste this into a new Opus 5 session

Branch: `codex/redesign-reconciliation`, commit `c08194a` ("feat: add bounded
combat animation controller"). This review substitutes for the Codex review
normally owed after a task lands (Codex is out of tokens) — same bar, adversarial
posture: find reasons this is wrong, not reasons it's fine.

## What to review

```
git show c08194a
```

Files touched: `client/src/render/AnimationController.js` (new, 287 lines),
`client/src/render/EffectPool.js` (new, 58 lines), `client/src/scenes/GameScene.js`
(+181/-?), `client/src/scenes/Preload.js` (+16), `client/src/assets/manifest.js`
(+11), `test/client/animationController.test.js` (new, 347 lines).

## Claims made in the commit message — verify each one, don't take it on faith

1. **Authoritative-state-only sourcing.** Claims animation resolution never
   reads local key state — only PLAYER_FLAG bits, hp deltas between snapshots,
   server `atk` events, and interpolated displacement. Check every branch in
   `AnimationController.js` for a stray read of local input/key state that
   would make a remote player's animation diverge from what other clients see.
2. **Priority order**: death/downed > hurt > attack/cast > run/idle for
   characters; death/downed CANCELS an in-flight cast rather than outranking
   it (asymmetric handling — verify this doesn't produce a state where a cast
   both plays post-mortem in one code path and gets cancelled in another).
3. **Two staleness gates**: per-caster `seq` must be strictly newer for an
   `atk` to be accepted (rejects duplicate/reordered delivery); an accepted
   but late `atk` plays only its remainder, not the full duration. Verify the
   remainder computation is correct at the boundary (an event so late that
   its "remainder" is <= 0 — does it correctly skip instead of playing a
   zero/negative-duration animation, or glitch?).
4. **Structure cycleSeq**: only a FORWARD move counts as an activation pulse.
   Check the comparison handles sequence wraparound (if `cycleSeq` is a bounded
   integer that wraps, does "forward" logic break at the wrap boundary?).
5. **EffectPool caps**: 64 floating labels / 32 impact rings, claims dropped
   rather than allocated over cap. Verify: (a) the cap is actually enforced at
   the allocation site, not just intended; (b) "dropped" doesn't leak a
   reference that keeps the pool slot logically occupied; (c) the claimed
   peak-then-return-to-0 behavior in the manual verification isn't masking a
   slow leak that only shows over a longer session than one wave.
6. **Family derivation off `BALANCE.TOWER` spec keys** rather than a hand-kept
   type list, so a new fusion "picks up the right presentation the moment its
   spec lands." Verify this is actually true for all current fusion structures
   (Volcano, Firestorm, Muddy Bog, Blizzard, Steam Vent, Grinder) — check each
   resolves to a sane family, not a silent fallback to `static` that would be
   wrong for a structure that does have real animated states.
7. **Undirected atlas scanning**: Preload's frame regex now accepts frames
   without a direction segment (`active_0.png`). Verify this doesn't
   accidentally also match/misparse a directional frame name, or vice versa
   (regex over-matching is the classic bug shape here).
8. **Graceful degradation claims**: placeholder shapes with no `.play()` run
   the state machine without drawing; partial atlases check `anims.exists`
   before playing. Verify there's no code path that calls `.play()` unguarded
   on a shape that lacks it (e.g. a state added later, or an edge case in
   `GameScene.js`'s wiring) — a Phaser exception here would visibly crash a
   real match, not just log quietly.

## Test suite

`npm test` claims 608/606 pass, 2 skipped, clean build. Actually run:
```
npm test
npm run build
```
Read `test/client/animationController.test.js` and judge whether the 34 new
tests actually exercise the staleness gates, priority order, and pool caps
above, or whether they're shallow (e.g. only test the happy path per state,
not the boundary/interruption cases the commit message itself calls out as
deliberate design decisions).

## Context you may need

- `docs/handoffs/2026-08-02-task17-complete.md` — the task's own handoff,
  written by the implementer. Read it, but the whole point of this review is
  not to just agree with it.
- `docs/superpowers/plans/2026-07-26-staged-combat-redesign-program.md` — the
  overall program this task serves.
- Task 8's `phase/deadline/charge/cycleSeq` wire fields (search the server
  code) are the source of truth this controller reads from.

## Output

Standard adversarial review format: concrete, reproducible findings ranked by
severity, each with a failure scenario (specific inputs/state → wrong
output). If nothing survives scrutiny, say so plainly — don't manufacture
findings to look thorough.
