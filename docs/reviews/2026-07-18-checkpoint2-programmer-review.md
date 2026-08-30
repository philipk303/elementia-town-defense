# Checkpoint 2 — Adversarial Programmer Review (Phase 3: enemies, waves, status, aggro & combat)

**Reviewer:** Opus 4.8 subagent, senior systems programmer, adversarial mandate.
**Subject:** commit `712f1b9` vs parent `f4a3137`. New: `server/game/{enemyTypes,waves,status,aggro,enemies,towers}.js` + tests; modified `server/game/{tick,state}.js`, `server/net/encode.js`, `shared/balance.js`, `client/src/scenes/GameScene.js`.
**Suite at review time:** 154/154 green — and, as at CP1, that is not evidence of correctness. The two findings below marked HIGH were each reproduced against this green suite; the acceptance test that is supposed to police the horde runs with the horde's only targets deleted.

## Summary

The SoA store, swap-remove, status math, and the pure aggro FSM are genuinely solid — the swap-remove keeps identity/status/aggro objects with the slot, the `i--; continue` re-visit pattern is correct at both the swap and the tail case, and the CC two-axis scaling matches the amendment. But three things are wrong and one of them is hidden by the acceptance test itself:

1. The motion-aware wall-pushout anchor (the CP0-C1 anti-tunnel fix) is **wired up with the wrong argument** — the came-from anchor is computed into dead locals and the post-move position is passed instead, re-opening the tunnel hole.
2. The hot loop **allocates one object per enemy per tick** (`nearestAlivePlayer`), directly contradicting the commit's "hot paths never allocate" claim and spec §5's hard rule — and it is active *right now* (bot players are present every match), not dormant.
3. Both acceptance scenarios run with `state.players = []`, so the aggro FSM is **never exercised in-sim**. With the real static bot-players present, the undefended hall takes **783 s to fall, not the claimed ~97 s** (8×) — the anti-kite `commit` inverts into a stall against stationary targets. The headline acceptance number describes a configuration that never occurs in play.

No CRITICAL: nothing here bricks the server or is a remote DoS in the CP1-C1 sense. I looked — the swap-remove, the burn-kill re-visit, the tower kill-during-scan, and the tile→structure index are all correct. Ranked most-severe first.

---

## HIGH

- **H1 — the wall-pushout anchor is discarded; the CP0-C1 tunnel fix is not actually wired in.** `server/game/enemies.js:216` computes `const ax = ex, ay = ey` (the pre-move position) and then **never uses it**; the pushout call at `server/game/enemies.js:242` passes `store.x[i], store.y[i]` — the *post-move* position — as `resolveTilePushout`'s `(ax, ay)` anchor. That anchor exists for exactly one purpose (`server/game/collisionIndex.js:87-118`): when a circle center ends up *inside* a solid tile, eject it toward the side it came from, "never along the shallowest axis — otherwise a shove past the midline pops the entity out the FAR face and it tunnels through the maze." Feeding it the current (inside-the-tile) position makes `adx = ax - cx` the in-tile offset, i.e. exactly the shallowest-axis ejection the comment warns kills the guard. **Failure scenario:** at the wave-10 single-gap funnel, enemy-enemy separation (`resolveCircles`, run *after* pushout each tick) shoves a crowded enemy's center past a barricade midline; next tick the defeated pushout ejects it out the far face → it is now behind the maze, marching the hall through a wall the players built to stop it. It is *latent-severe*: Phase 3 never calls `applyKnockback` (towers apply status/damage only), so today only crowd-push can trigger it — but the moment Phase-4 knockback lands, every shove into a wall is a tunnel candidate. The dead `ax/ay` locals are the smoking gun that the author intended to pass them and the refactor into a separate pushout loop dropped the thread. **Fix:** capture each enemy's pre-integrate position (a `preX/preY` scratch Float64Array on the store, written before `integrate`) and pass *those* to `resolveTilePushout`; delete the dead locals. Add a regression test: place a 1-wide barricade, force a center just past its midline, assert the enemy ejects back to the came-from side.

- **H2 — per-tick, per-enemy heap allocation in the hot loop; the "never allocate" claim is false.** `server/game/enemies.js:160` — `nearestAlivePlayer` returns `{ player: best, dist: Math.sqrt(bestD2) }`, an object literal, and it is called for **every enemy every tick** whenever `players.length` (`server/game/enemies.js:183`). The commit body and the module header both assert "the movement/collision hot paths never allocate"; spec §5 lists allocation-free tick as a hard rule. This is not dormant-until-Phase-4: `createGameState` always builds 4 (bot-filled) players, so the allocation fires for the whole horde on every real tick now — ~78 enemies × 60 Hz × 2 rooms ≈ 9k short-lived objects/s of pure GC pressure, precisely in the loop the SoA design existed to keep clean. **Fix:** return the nearest player index (or write `bestIdx`/`bestDist` into two scratch scalars on the store) instead of a fresh object; the caller only reads `.player` and `.dist`. The redundant `Math.sqrt` then `dist*dist <= prox2` compare (`:184`) can also drop to a squared-distance compare with no sqrt.

- **H3 — the acceptance test hides the aggro FSM, and the real config it hides is an 8× stall.** `test/game/phase3Acceptance.test.js:57` and `:66` both set `players: 'none'` → `state.players = []`, so `nearestAlivePlayer` is never called and **no enemy ever enters `chase`** in either acceptance scenario. The FSM has good *unit* coverage (`test/game/aggro.test.js` exercises sticky/leash/cap/commit as pure functions) but **zero integration coverage**, and the emergent behavior is bad: driving the real `tickGame` with the actual bot-players present (their Phase-1 static placeholder positions ~3 tiles above the hall), the undefended hall falls at **t≈783 s** with an enemy in `chase` on **46 578 of 46 992 ticks** — vs **t≈97.7 s** with `players=[]` (both reproduced this session). Cause: `commit` lasts `COMMIT_MS=2000` but `chase` caps at `CHASE_CAP_MS=4000`, so against a stationary target an enemy spends ~4 s stalled on the player (chase steers *at* an unmoving point next to it, doing nothing) for every ~2 s beelining the hall; the anti-kite mechanism becomes a horde-wide brake. The headline "undefended town falls in ~97 s" in the spec amendment is therefore measured under a configuration (no players at all) that never occurs in an actual match. This is a Phase-4 mitigation candidate (real players move), but it is shipped now, untested now, and the acceptance criterion that is supposed to catch exactly this class of problem was written to look the other way. **Fix:** add an acceptance/integration variant that keeps the bot-players and asserts a bound on time-to-fall (and that the hall *does* take damage while chased); reconcile the amendment's "~97 s" with the with-players number or state the measurement config explicitly.

---

## MEDIUM

- **M1 — a chasing enemy deals zero damage to the hall or to structures, even when adjacent.** `server/game/enemies.js:192-211`: `attackHall`/`attackStruct` are only ever set inside the `else` (march) branch; in `AGGRO_MODE.CHASE` the melee block at `:220-228` has nothing to fire. So an enemy locked onto a player standing on the hall doorstep sits on the hall doing no damage for the entire chase window. This is the mechanism behind H3's stall, and it is also just wrong on its own terms: a bulldozer that reaches the wall while chasing should still chew the wall. **Fix:** in chase mode, still evaluate `hallEdgeDist`/the descent-step wall test and allow melee against whatever the enemy is physically against, independent of steering mode.

- **M2 — `pullCount` grows unbounded for a living enemy, driving `effectivePullRange` to ~0.** `server/game/aggro.js:45` increments `pullCount` on every `enterCommit` and it is only reset by `resetAggro` (spawn). Against a static target an enemy commits roughly every 6 s (H3), so over a long wave `pullCount` climbs into the dozens; `effectivePullRange = base * 0.6 ** pullCount` (`:90`) underflows toward zero. The Phase-4 pull ability that consumes this will find long-lived enemies effectively un-pullable for reasons unrelated to any recent yank. **Fix:** decay `pullCount` over time, or cap it, or only bump it on a *pull-induced* commit rather than every leash/cap commit.

- **M3 — slow stacking keeps the strongest factor and the longest duration independently, yielding a slow stronger-for-longer than any single source.** `server/game/status.js:48-54`: `applySlow` does `if (f < s.slowFactor) s.slowFactor = f` and `if (ms > s.slowMs) s.slowMs = ms` as separate maxima. A strong-but-brief slow (factor 0.3, 200 ms) followed by a weak-long one (factor 0.8, 3000 ms) leaves the enemy at factor 0.3 for the full 3000 ms — stronger and longer than either applicator. The header advertises "strongest-wins"; this is strongest-factor × longest-duration, which is a different, more punishing rule. **Fix:** track the factor with its own remaining timer (strongest active wins, and lapses on its own clock), or document that strength and duration are deliberately decoupled.

---

## LOW

- **L1 — snapshot can carry negative hall HP on the wire.** `server/net/encode.js:58` emits `hh: Math.ceil(state.hall.hp)`; an overkill tick drives `hall.hp` below 0 before the `LOST` transition, so `hh` can be e.g. `-3`. The client clamps (`GameScene.js` `Math.max(0, …)`), so it's cosmetic — same class as CP1-L1, which was fixed for `GAME_END` but not for the per-snapshot field. Clamp with `Math.max(0, …)`.

- **L2 — an enemy can melee on its spawn tick.** `server/game/enemies.js:79` sets `attackReadyAt[i] = now` on spawn and `:220` gates melee on `now >= attackReadyAt[i]`, so an enemy spawned already in melee range acts with no initial cooldown. Harmless today (gates are far from the hall/walls) but a latent smell; seed `attackReadyAt` to `now + attackCdMs` if a spawn-grace is intended.

- **L3 — potential march stall at a corner-cut-blocked local minimum.** `chooseStepDir` (`server/game/enemyMove.js:28`) returns `-1` when no neighbor is strictly downhill; in `enemies.js:201` that means no move, and `attackStruct` stays `-1`, so an enemy at a plateau whose only lower-cost neighbors are diagonals rejected by the corner-cut guard would neither step, attack, nor progress until crowd-push jostles it loose. Not reproduced (requires a specific wall-corner geometry plus a plateau), so LOW — but worth a targeted test given the maze is player-authored and can produce adversarial corners.

- **L4 — client renders enemies with no interpolation.** `GameScene.js` `entry.dot.setPosition(en.x, en.y)` snaps to raw 20 Hz snapshot coords; spec §5 mandates client interpolation (`INTERP_DELAY_MS`). CP1 assigned interpolation to Phase 4, so this is expected scope, noted only so it isn't lost: the enemy layer will need the same interp buffer as players.

---

## Verdict

**CONDITIONAL GO.** The horde core (SoA, swap-remove, status, tower offense, the pure aggro FSM, tile-indexed collision) is correct under adversarial tracing and the wave/gate/composition tables match the beat sheet deterministically. But **H1 must be fixed before any Phase-4 knockback lands** (it silently re-opens the maze-tunnel hole the CP0-C1 fix exists to close, and the dead `ax/ay` locals prove it was meant to be wired and wasn't), and **H2 is a live violation of the spec §5 allocation-free hard rule the commit explicitly claims to honor** — both are small, localized fixes. **H3 is the one to take seriously culturally:** the acceptance test was written around the subsystem it should stress, and the number it certifies (~97 s) is off by 8× from what the shipped sim actually does with players present. Add the with-players integration assertion and fix M1 (chase deals no melee) together — they are the same stall. M2/M3 are correctness rough edges that will surface in Phase 4/5; the LOWs are cleanup.

---

## Remediation — 2026-07-18 (auto-applied, TDD; suite 162/162 green)

All HIGH/MEDIUM fixed; LOWs dispositioned. Each fix is test-first.

- **H1 (pushout anchor) — FIXED.** `resolveTilePushout` moved back into the main
  per-enemy loop in `server/game/enemies.js`, called with the pre-integrate anchor
  `(ax, ay)`; the dead locals are gone. The came-from eject side is restored, so a
  Phase-4 knockback into a wall can no longer pop a body out the far face.
- **H2 (hot-loop allocation) — FIXED.** `nearestAlivePlayer` deleted; the nearest
  player and the locked-target lookup are now inline index loops writing scalars
  (`nearP`/`nearD2`), squared-distance compare, no `Math.sqrt`. Zero per-enemy
  allocation. The one `solidAt` closure is memoised per-field (once per tick, not
  per enemy).
- **H3 (acceptance hid the FSM) — FIXED.** `test/game/phase3Acceptance.test.js`
  reworked: the undefended run now keeps the real bot-players and asserts (a) loss,
  (b) the hall is actually destroyed, (c) `chase` is entered in-sim. Added a full
  10-wave defended run that must resolve. With M1 fixed + `COMMIT_MS>=CHASE_CAP_MS`,
  the realistic undefended fall is **~178 s** (down from the reviewer's 783 s); the
  amendment's stale "~97 s (players=[])" is replaced with this figure and its config.
- **M1 (chase deals no melee) — FIXED.** `attackHall` is computed in every steering
  mode; a chasing enemy pressed against the hall now damages it. This is the
  mechanism behind H3's stall — same fix.
- **M2 (`pullCount` unbounded) — FIXED.** `effectivePullRange` caps the stack at
  `BALANCE.AGGRO.PULL_DIMINISH_MAX` (=4); pull range floors above zero. (`aggro.js`)
- **M3 (slow stacking) — DOC-FIXED (behavior intentional).** Kept the single-slot
  strongest-factor × longest-duration model (no per-slow stack in slice 1); the
  `applySlow` header now describes it accurately and flags the slight player-favor
  for the Phase 8 sweep, rather than claiming "strongest-wins".
- **L1 (negative hall HP on wire) — FIXED.** `encode.js` emits
  `hh: Math.max(0, Math.ceil(hall.hp))`.
- **L2 (spawn-tick melee) — NO CHANGE (intended).** Gates are far from the hall/walls,
  so it is unreachable in practice, and immediate melee-on-arrival is the desired
  behavior (no artificial spawn grace). Left as-is.
- **L3 (corner-cut plateau stall) — NO CHANGE NEEDED (unreachable by construction).**
  The corner-cut guard is applied symmetrically in `costField.compute` AND
  `chooseStepDir`, so a non-seed tile's cost is never propagated through a diagonal
  that descent would reject; a strictly-lower non-blocked neighbour therefore always
  exists at any in-bounds non-seed tile. `chooseStepDir` returns -1 only at the
  cost-0 hall ring (→ attack hall). The real stuck case was the OFF-GRID variant
  (designer C1), now fixed by clamping every enemy into the arena each tick.
- **L4 (enemy interpolation) — DEFERRED to Phase 4** (CP1-assigned scope).
