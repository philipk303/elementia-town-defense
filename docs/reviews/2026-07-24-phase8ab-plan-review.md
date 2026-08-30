# Phase 8A/8B plan — adversarial pre-implementation review

**Subject:** `docs/superpowers/plans/2026-07-24-phase8a-8b-root-cause-and-sweep-harness.md`
**Reviewer:** Senior multiplayer systems engineer + senior game designer, adversarial mandate ("find what breaks").
**Date:** 2026-07-24
**Reviewed against live source at `4fd9c0b`.** Every line reference below was read, not inferred.

---

## VERDICT: **NO GO** (as written)

Not because the ideas are bad — LoS-gated chase is a defensible mechanic and the sweep harness is the right shape — but because **the phase's own verification gate is provably incapable of failing, and the plan deletes a shipped CRITICAL fix without replacing its guarantee.**

Three items are individually blocking:

1. **The seed space is one bit.** `state.rng` is consumed exactly once per match (`server/game/waves.js:20`, via `server/game/state.js:76`). Ten "seeds" produce at most **two** distinct simulations. The sweep's own 40–70% acceptance band is **arithmetically unreachable** with its own seed list (see CRIT-1 — I computed it).
2. **The monotonicity probe cannot detect the pathology it was written to detect**, and its second dial does not exist in `BALANCE`, so it will print five identical rows and declare `PHASE 8A VERIFIED` (CRIT-3).
3. **Task 2 deletes CP3-C1's shipped fix and its regression test is satisfied *by* the reopened exploit** (CRIT-4).

Fix CRIT-1 through CRIT-5 and this becomes a straightforward GO. The plan's line references are accurate throughout and its "STOP and report, do not tune" discipline in Tasks 2/4/5 is exactly right — credit where due.

---

## Findings

### CRIT-1 — The seed is one bit. The probe and the sweep are measuring a 2-point sample dressed as n=10/n=12, and the sweep's target band is unreachable.

**What breaks.** `createGameState` draws from the seeded RNG exactly once, ever:

- `server/game/state.js:73-76` — `const rng = mulberry32(seed); const gateOrder = resolveGateOrder(rng)`
- `server/game/waves.js:19-23` — `resolveGateOrder` = one `rng() < 0.5` → `{SIDE_A:'LEFT'}` or `{SIDE_A:'RIGHT'}`
- `grep -rn "state.rng\|rng("` over `server/` returns **exactly one** call site (waves.js:20).

Everything downstream is deterministic by design and says so: wave composition and spawn times (`waves.js:41` "Deterministic — no RNG here"), the bot FSM (`bots.js:21` "no rng, no wall-clock branching"), and the scripted human. So a "seed" selects one of **two** scenarios: whether the wave-4 side gate opens LEFT or RIGHT.

I evaluated `mulberry32` on the plan's actual seed lists:

| harness | seed list | split | attainable rates |
|---|---|---|---|
| `monotonicityProbe.js` (plan L635) | 20260720–20260729 | 5 RIGHT / 5 LEFT | **{0%, 50%, 100%}** |
| `balanceSweep.js` (plan L901) | 20260800–20260811 | 3 RIGHT / 9 LEFT | **{0%, 25%, 75%, 100%}** |

**The sweep's `inBand = rate >= 0.4 && rate <= 0.7` check (plan L995) can never be true.** `IN BAND` is unprintable with that seed list. Phase 8C would then tune forever against a bar that cannot be hit.

For the probe, survival rate is quantized to {0, 0.5, 1}, so the "waves: 5,5,4,5,4,…" column is really two numbers repeated, and every statistic derived from it is a two-sample measurement.

**Fix.** Either (a) inject genuine per-run variation — the cheapest honest source is jitter on `WAVE_SPAWN.INTERVAL_MS`/`GATE_STAGGER_MS` per spawn event drawn from `state.rng`, plus randomizing the scripted human's post between GAP_A/GAP_B, plus 2–3 maze topologies — or (b) stop calling them seeds: enumerate the **scenario matrix** (2 gate orders × N mazes × M human posts) explicitly and report per-cell outcomes. Do not ship a percentage over a 2-valued variable. Also switch the outcome metric from binary win/loss to something continuous (hall HP remaining, total enemy-seconds alive, wave-at-loss) — a binary threshold on a chaotic sim is the worst possible instrument and is most of why Phases 4 and 6 looked "chaotic" (see "Is the diagnosis right?").

---

### CRIT-2 — There is no pre-fix baseline probe run, so a passing probe proves nothing.

**What breaks.** Task 5 runs the probe **only after** Tasks 1–4 land (plan L783-788), and treats a green result as "PHASE 8A VERIFIED: both previously-chaotic dials now behave monotonically." That inference is invalid: nobody has ever run this probe against the current code. If the probe is green on the *pre-8A* commit too — which CRIT-1 and CRIT-3 make very likely — then it measured nothing and the phase's central claim is unsupported.

**Fix.** Insert a Task 0: write the probe first, run it on `4fd9c0b` unmodified, commit the printed tables into the review doc as the **baseline pathology**. Only a *change* in that table is evidence. This is a one-hour step that converts the whole phase from assertion to measurement.

---

### CRIT-3 — The probe's pass criterion cannot fire on the documented pathology, and its second dial does not exist.

**(a) The detector misses the exact shape it was written for.** Plan L727-730:

```js
if ((b - a > 0.3 && b - c > 0.3) || (a - b > 0.3 && c - b > 0.3)) flips++
```

It only fires on a *local extremum* — a spike or a dip with ≥30pp on **both** sides. The Phase-6 stamp's recorded pathology (`docs/reviews/2026-07-19-checkpoint-phase6-designer-review.md:109`) is `0.7 → wave 9; 0.85 → wave 4; 1.0 → wave 4` — a **step down followed by flat**. As rates that is `[1.0, 0, 0, 0, 0]`. Walk it: i=2 → `a-b = 1.0 > 0.3` but `c-b = 0 > 0.3` is false → no flip. i=3, i=4 → all zeros → no flip. **`flips === 0` → "VERDICT: monotonic enough".** The probe certifies the pathology as fixed.

Worse, the detector is direction-agnostic. A *strictly decreasing* curve — stronger bots reliably doing worse, which would be a screaming red flag — scores zero flips and passes, despite the label on plan L751 declaring "higher = stronger bots, expect rate to rise".

**(b) `BALANCE.BOT.MELEE_MULT` does not exist.** I grepped `shared/balance.js`: the `BOT` block (L282-…) has `ENGAGE_RANGE_PX`, `ENGAGE_LEASH_PX`, `CONTACT_PX`, `KITE_BACKOFF_PX`, `HOLD_FORWARD_TILES`, `CLASS`, `SPECIAL_CAST_PX`, `SECOND_CAST_PX` — no melee scalar. Bot melee damage flows through `p.meleeDamage` (`state.js:44`) → `players.js:132-133`, identically to a human's. The Phase-6 "bot-only melee multiplier" was a local experiment, exactly as the plan's Step 3 suspects.

So on first run the probe sets `B.MELEE_MULT = 0.7 … 1.3`, nothing reads it, all five rows are byte-identical, `flips = 0`, and the script prints **`PHASE 8A VERIFIED`** and exits 0. Combined with (a) and CRIT-1, the gate is unfailable.

**Fix.** (1) Move the "does the dial exist" check to Step 1 and make the probe throw on a missing key rather than `?? 1`. (2) Add a **null-dial self-test**: sweep a value that provably does nothing and assert the probe reports "no effect" — if a real dial produces the same table as the null dial, fail loudly. (3) Replace the extremum detector with a monotonic-trend test against the *expected direction* (Spearman ρ, or isotonic-regression residual), and require the total effect size to exceed the sampling noise floor.

---

### CRIT-4 — Deleting the chase wall-bash reopens CP3-C1, and the regression test is satisfied *by* the reopened exploit.

**What C1 actually was.** `docs/reviews/2026-07-19-checkpoint3-designer-review.md:69-98` describes it as **two independent halves, "both needed"**:

1. chase-blocked enemies attack the obstruction (shipped — `enemies.js:229-238`);
2. **melee requires no solid tile between attacker and target**, for *both* player basic and enemy contact melee.

Half 2 was explicitly **deferred**, per the remediation stamp at that file's L5-11: *"The player-melee-line-of-sight half … is left as intended wall-timing behavior, NOT true raycast LoS — reclassified Phase 8 feel-tuning, since the exploit (infinite stall) is closed."* The deferral was justified **solely because half 1 closed the stall.**

Phase 8A deletes half 1 (plan L379) and does not implement half 2. `tryBasicAttack` (`players.js:117-137`) still has no LoS check; reach is `P.MELEE.RANGE_PX 34 + PLAYER_RADIUS 14 + enemy radius 9–14` = **57–62 px**, and two bodies on opposite faces of a 32-px tile are 55–60 px apart. Cross-wall player melee still works, and it still pulls aggro by damage (`players.js:134`, `aggro.js:57`).

**The new failure mode.** Player presses the safe face of a wall and hits an enemy through it. Aggro triggers. LoS is blocked → `steering = MARCH` → the enemy descends the cost field **toward the hall**. The plan's justification (L344-347, L379) is that "the march branch already bulldozes a wall on its cheapest path". That is only true for the wall on its cheapest path — `enemies.js:243-245` sets `attackStruct` from `chooseStepDir`'s chosen neighbour only. A pillar, a spur, or any wall the field routes *around* is never attacked. So:

- the enemy no longer stalls (good — the infinite stall is closed),
- but it also **no longer damages the wall** (the CP3 probe's "wall took zero damage — being attacked through a wall *protects* the wall" property is **restored**),
- and the player takes zero damage while dealing full damage, at will, and can simply walk along the wall to keep hitting it.

Net versus today: the exploit's *duration* is bounded but its *profitability per second* goes **up**, and the repair-economy consequence C1 flagged comes back.

**And the regression test cannot catch it.** Plan L285-286:

```js
assert.ok(moved > TILE_SIZE || !wallStillUp,
  'the enemy either routed away or bulldozed')
```

"Routed away" **is** the exploit's new form. The assertion is satisfied by the failure. The test also never applies player melee and never checks the two quantities C1 was actually about: did the player take damage, and did the wall lose HP.

**Fix (pick one, do not skip).** Either (a) ship C1 half 2 now — reuse `hasLineOfSight` in `tryBasicAttack` (you are building the primitive anyway; this is ~4 lines and closes the exploit at its source, which is the *correct* place), or (b) keep a bounded chase wall-bash: when LoS is blocked **and** the blocking tile is within `MELEE_RANGE_PX + radius`, still set `attackStruct` to it before falling through to march. (a) is strictly better and makes the deletion safe. Then rewrite the regression test to the CP3 probe: player melees through the wall for 5 s; assert `player.hp < 100 || wall.hp < 40`.

---

### CRIT-5 — Several `BALANCE` keys are destructured to primitives at import. The sweep harness will accept them and silently measure nothing.

You asked me to verify this against real source. Verified:

| module:line | binding | live under mutation? |
|---|---|---|
| `server/game/players.js:21` | `const P = BALANCE.PLAYER` | **yes** (object ref) — `RESPAWN_BASE_MS` sweep works |
| `server/game/bots.js:30` | `const B = BALANCE.BOT` | **yes** |
| `server/game/abilities.js:28` | `const A = BALANCE.ABILITY` | **yes** |
| `server/game/aggro.js:22` | `const { STICKY_MS, LEASH_PX, CHASE_CAP_MS, COMMIT_MS, PULL_DIMINISH, PULL_DIMINISH_MAX } = BALANCE.AGGRO` | **NO — all six are dead** |
| `server/game/enemies.js:32` | `const { MAX, SPEED_PX, MELEE_RANGE_PX, BASE, ELITE } = BALANCE.ENEMY` | `MELEE_RANGE_PX`, `MAX` **dead**; `SPEED_PX` dead if *replaced* (live if an element is assigned); `BASE`/`ELITE` live |
| `server/game/enemies.js:33` | `const { PROXIMITY_PX } = BALANCE.AGGRO` | **NO — dead** |
| `server/game/status.js:14` | `const { CC_DURATION_SCALE, CC_STRENGTH_SCALE, WET } = BALANCE.STATUS` | first two **dead**; `WET` live |

`resolvePath` (plan L905-912) only checks `key in obj` — it will happily resolve `AGGRO.STICKY_MS`, `AGGRO.PROXIMITY_PX`, `ENEMY.MELEE_RANGE_PX`, `STATUS.CC_DURATION_SCALE` and produce identical rows across all values. Given that the aggro FSM is the *subject* of this entire phase, `AGGRO.*` being unsweepable is not a footnote.

Also worth recording: `enemyMove.js:17-20` (`MAX_STEP_PX`, `KB_WEIGHT_SCALE`, `KB_DECAY_PER_TICK`) and `costField.js:29` (`WALL_ENTRY_COST`) are hardcoded module constants not in `BALANCE` at all, so they cannot be swept even in principle. `WALL_ENTRY_COST` in particular (30/12/4 per band) is one of the most consequential routing dials in the game.

**Fix.** (1) Replace the six destructures above with object-ref reads (`const A = BALANCE.AGGRO`, then `A.STICKY_MS` at use sites) — mechanical, ~15 call sites, and it makes the whole balance surface live. (2) Add a **liveness assertion** to `balanceSweep.js`: after `obj[key] = v`, run a one-tick canary and refuse to report a row if the dial produced a bit-identical trajectory to the previous value. (3) Move `WALL_ENTRY_COST` into `BALANCE`.

---

### HIGH-1 — `hasLineOfSight` looks correct, but every Task-1 test places both endpoints at exact tile centres, where the two branches of the `tMax` initialisation are numerically identical. The most error-prone line in the function is untested.

The implementation (plan L145-171) is correct as far as I can check it. Concrete arithmetic, "target tile solid does not block" (plan L114-118), `W(2,5)→W(6,5)`:

- `tileToWorldX(2)=80`, `tileToWorldX(6)=208` (`grid.js:9`), `TILE_SIZE=32`.
- `gx=2, gy=5; gx1=6, gy1=5`. `dx=128, dy=0`. `adx=128, ady=0`.
- `tDeltaX = 32/128 = 0.25`; `tDeltaY = Infinity`. `tMaxX = (3·32 − 80)/128 = 16/128 = 0.125`; `tMaxY = Infinity`.
- Steps: `gx=3 (tMaxX=0.375) → 4 (0.625) → 5 (0.875) → 6` → equals target → `true` **before** the solid test. ✔ target tile correctly untested; start tile correctly untested (first action is a step).

Now the defect in the *tests*. `tileToWorldX(gx) = gx·32 + 16` — always the tile centre. At the centre, the positive and negative branches of

```js
tMaxX = (dx > 0 ? (gx + 1) * TILE_SIZE - x0 : x0 - gx * TILE_SIZE) / adx
```

evaluate to **the same number** (16/adx), because the centre is equidistant from both faces. An implementation that dropped the ternary entirely and always wrote `((gx+1)*TILE_SIZE - x0)/adx` — a very common Amanatides–Woo bug — **passes all seven tests**, including the vertical and diagonal ones. In the real sim, enemy and player positions are arbitrary floats (`enemies.js:186`, `players.js:150-151`), where that bug produces a half-tile-offset ray and therefore wrong LoS for every leftward/upward chase.

**Fix.** Add tests with deliberately off-centre, asymmetric endpoints in **both** directions, e.g. a leftward ray from `x0 = gx·32 + 30` (near the right face) past a solid tile, and its mirror; and add a symmetry property test asserting `hasLineOfSight(f,a,b) === hasLineOfSight(f,b,a)` for a set of random axis-aligned pairs (it will legitimately fail for exact diagonals — see MED-1 — so scope it to non-diagonal rays).

### HIGH-2 — Task 2's behavioural assertions pass for the wrong reasons.

- **Test 2**, plan L266: `assert.ok(st.y[i] > tileToWorldY(6))`. The enemy spawns at `tileToWorldY(5) = 176`; the bar is `208`. That is **32 px of vertical drift over 40 ticks × 50 ms = 2 s**. The slowest enemy tier moves at 40 px/s (`balance.js:120`), so *any* downward component whatsoever clears it — including an enemy that merely slides down the wall face without routing anywhere. Assert the thing you mean: that the enemy crosses the wall line (`worldToTileX(st.x[i]) > 7`) or that `costField.cost[tileIdx(...)]` strictly decreased.
- **Test 3** — see CRIT-4; tautological.
- **Test 1** (plan L248): `Math.abs(st.y[i] - p.y) < TILE_SIZE` "stayed on the straight line". Both are at `gy=5` and the chase vector is purely horizontal, so `dirY = 0` exactly; this asserts that a zero stays zero. It cannot distinguish LoS-clear chase from *any* horizontal movement. Put the target off-axis (e.g. player at `(10,7)`) so the assertion has content.
- **Test 4** (plan L307): `run(state, 30, 500)` restarts `now` at 500 while the previous `run` already advanced to 500 — the timestamps happen to line up, but this is fragile coupling between two helpers. Thread `now` through instead.

### HIGH-3 — Spawn protection is de-facto invulnerability (undocumented), and it is granted in the one case that does not need it while `revive` — the case that does — gets nothing.

**Invulnerability.** `attackPlayer` is only ever set inside the `mode === AGGRO_MODE.CHASE && target` branch (`enemies.js:221,227`; plan L349-354). With protection, `target` resolves to `null` (plan L582) → `updateAggro` returns `MARCH` (`aggro.js:78`) → `attackPlayer` stays `null` → the enemy melee path at `enemies.js:267-269` is unreachable. Enemies have no other damage source against players. So `SPAWN_PROTECT_MS` is **2.5 s of complete immunity to the horde**, not merely "cannot trigger or hold aggro". That may be fine, but it must be stated in the spec amendment (Task 8 currently says only "cannot trigger or hold enemy aggro"), because "immunity" and "invisible to aggro" have different exploit surfaces and a future reader will not derive the former from the latter.

**Wrong case protected.** `respawn` (`players.js:70-79`) puts a full-HP player at `spawnX/spawnY` — hall-front, `y = hallTopY − 64` (`state.js:36-38`) — after a ≥20 s timer (`balance.js:212`). `revive` (`players.js:81-88`) stands a player up **in place, in the middle of whatever killed them, at 40 % HP** (`REVIVE_HP_FRACTION` 0.4) and grants **no protection at all**. A revived player is instantly re-targeted by the same pack (proximity 90 px, `balance.js:149`) and, at 40 HP, very likely re-downs within a second — burning the 3 s channel their teammate just spent. That is the actual feels-bad case, it is the one the horde is standing on, and the plan does not touch it.

**Fix.** Stamp `p.protectedUntil = now + P.REVIVE_PROTECT_MS` in `revive()` too, with its own shorter tunable (~1000–1500 ms). Add `p.protectedUntil = 0` to `restoreAllPlayers` (`players.js:196-206`) for hygiene, and document the immunity explicitly.

### HIGH-4 — Both harnesses force `phaseClockMs = 0` every tick, which skips the entire build phase. The sweep is not measuring the game.

`isBuildComplete` for `timingStyle: 'fixed'` is `state.phaseClockMs <= 0` (`phaseMachine.js:68-74`), and the clock counts **down** (`phaseMachine.js:56-58`). The harnesses (plan L698, L974, mirroring `phase6Acceptance.test.js:98`) zero it every tick, so **build lasts one tick, every wave, for ten waves.**

Consequences for a tool whose entire purpose is balance measurement:
- The human never repairs the maze. By wave 6 the barricade line is rubble and is never rebuilt.
- The human never spends gold. The economy (Phase 5), the tower catalog, `combos.js`, and `dormancy.js` are **completely inert** across the measured run. Gold accrues to a number nobody reads.
- Therefore any dial that trades against towers or gold cannot be tuned by this harness, and the 40–70 % band describes a game that does not exist: "one melee human plus three bots, one wave-1 barricade line, zero towers, no repairs, ten waves."

That is not a "competent scripted human" (question 10) — it is an AFK turret at one gap, in a game with the build loop amputated.

**Fix.** Give the harness a scripted build policy: each build phase, repair any structure below 60 % and spend surplus gold on a tower adjacent to the active lane, then advance the clock normally rather than zeroing it. It does not have to be smart; it has to be *non-zero*, or the sweep cannot see half the balance surface.

---

### MED-1 — LoS is asymmetric on exact diagonals.

`if (tMaxX < tMaxY) {…} else {…}` (plan L164) breaks ties toward Y. Tracing `W(1,1) → W(6,6)`: the walk is `(2,2), (2,3), (3,3), (3,4), …`. Tracing the reverse `W(6,6) → W(1,1)`: `(6,5), (5,5), (5,4), (4,4), …`. Different tile sets, so a wall at `(4,3)` blocks one direction and not the other. Today only enemy→player is queried so nothing observable breaks; the moment you reuse the primitive for player melee (which CRIT-4 recommends) it becomes a real inconsistency. Either accept and document it, or test both corner-adjacent tiles on an exact tie.

### MED-2 — Aggro *triggering* is not LoS-gated, only steering. This inflates `pullCount` and degrades Earth's pull ability through walls.

The proximity trigger at `enemies.js:200` is untouched. A player standing behind a wall within 90 px still flips nearby enemies into `chase` every tick. With LoS blocked they immediately march away from the anchor, exceed `LEASH_PX` (220 px, `balance.js:151`), and `enterCommit` fires — which does `a.pullCount++` (`aggro.js:45`). `effectivePullRange` (`aggro.js:92-94`) then shrinks by `0.6^n` up to the cap of 4. So **loitering behind your own maze permanently reduces your team's pull range on those enemies**, for free, invisibly. Consider gating the proximity trigger on LoS as well, or only incrementing `pullCount` when the commit was caused by an actual chase (target was reachable).

### MED-3 — `flags[i]` reports `aggro: true` while the enemy is marching.

`enemies.js:280-285` sets the wire aggro flag from `ag.state === 'chase'`, which is now decoupled from actual steering. Clients will render the aggro overlay on enemies that are walking away toward the hall. Set it from the resolved `steering`, not from `ag.state`.

### MED-4 — CPU is acceptable but the loop bound is 4× too generous.

Allocation-free: confirmed. All locals are scalars, and `solidFn(costField)` (`enemies.js:303-307`) returns a per-field memoised closure, not a fresh one — the call in the plan's Task-2 code allocates nothing. ✔

Cost: only enemies in `CHASE` beyond melee range pay. Ray length is bounded in practice by `LEASH_PX` (220 px ≈ 7 tiles) plus target drift, so ~5–12 tile steps with one indirect call each. Worst plausible case 256 enemies × ~12 steps = ~3 k closure calls/tick. Against the measured 0.037 ms avg tick with 32× margin, expect roughly a doubling of tick cost to ~0.07–0.09 ms — still ~18× margin on the 0.1 vCPU budget. Fine.

But the `guard < 256` bound (plan L163) is 4× the map diagonal (63). Replace it with `Math.ceil((adx + ady) / TILE_SIZE) + 2`, computed once — same NaN safety, tighter worst case, and it documents the real bound.

### MED-5 — `restoreAllPlayers` not stamping protection is *not* a bug today, but it is a latent one.

`restoreAllPlayers` runs from `startBuildPhase` (`phaseMachine.js:39`), and by then the wave has cleared (`isWaveCleared` requires `livingEnemyCount <= 0`, `phaseMachine.js:77`) and `initFight` zeroes the store (`tick.js:23`). No enemies exist, so no protection is needed. Leave it — but add `p.protectedUntil = 0` there so a stale window can never leak into a fight if the phase machine ever changes.

### MED-6 — LoS-gating is a net *increase* in hall pressure. The certified acceptance will move, and that is expected.

A blocked chaser now marches to the hall instead of pressing the wall. Every wall in the maze therefore converts "enemy stuck on a player" into "enemy resumes its path to the loss condition." This is a genuine difficulty increase, not a neutral routing correction. The plan is right to say "if acceptance flips, STOP and report" (L387) rather than tune — that is the correct discipline. Just record the expectation up front so the flip is not read as a bug.

### MED-7 — The Task-6 inverse control is a single-seed coin flip.

`makeMatch()` hardcodes seed `20260720` (`phase6Acceptance.test.js:30`), which resolves to `SIDE_A = RIGHT`. Per CRIT-1 that is one of only two scenarios. "3 bots + idle human + no maze must lose" as a single-seed binary is exactly the kind of bar that flips chaotically — the failure mode this whole phase exists to escape. Express it as an N-scenario rate in `balanceSweep.js` ("loses in ≥8/10 scenarios") and keep a single-seed smoke test as the skipped in-suite marker.

**On question 11 specifically — is skipping it hiding a failure?** No. Recording a known-unmet bar as a `{ skip: '…' }` test with the reason inline, plus a spec amendment (Task 8) and a review-doc entry, is the honest pattern: it puts the bar in the codebase where a future session trips over it, and it does not falsely claim a green. The alternative (leave it out of code, note it in a doc) is strictly worse. The problems are the single seed above, and that nothing enforces the skip's removal — add it to the Phase 8C definition-of-done explicitly, which the plan does at L850. That part is fine.

### LOW-1 — Wall-clock leaks into "deterministic" state construction.

`state.js:138`: `seedStartingEconomy(state, Date.now())` → `placeSeedStructure(..., now)` → `createdAt: now` (`structures.js:194`). `createdAt` is read only by `dormancy.js:15`'s sort; all seed structures share one timestamp and V8's sort is stable, so behaviour is unaffected today. But it contradicts the "seeded run replays identically" claim and would bite the moment `createdAt` gains a second consumer. Pass `0`.

### LOW-2 — Task 5 step ordering.

The probe is written (Step 1) and wired (Step 2) before checking whether its second dial exists (Step 3). Given CRIT-3, reverse those.

---

## Ruling on the spawn-protection clause

**Ruling: adopt the flat window — the plan's conclusion is correct — but its stated reasoning is half wrong, and two amendments are mandatory.**

**Is argument (a) an argument about the harness rather than the game?** Partly, and the plan should stop making it in that form. "The harness hammers every action key so attack-clear is a no-op there" is, on its face, test convenience driving design, and you were right to be suspicious of it.

**But the argument survives when you restate it about the game, and that is what makes it decisive.** If protection ends the instant the player presses attack, then for the overwhelming majority of real humans — who mash the basic on respawn out of reflex, and whose bots do the same — the window is a no-op in *play*, not just in the harness. A feature that only functions for players who deliberately hold still is not a feature; it is a trap for the attentive. So the correct framing is: *an attack-clear clause makes the mechanic inert for typical play, and non-deterministic for the rest.* That is a game argument, and it is sufficient on its own.

**Argument (b) is sound and is the stronger of the two.** Phase 8A's entire thesis is that outcomes must stop being a function of combat micro-timing. A break condition — attack intent, damage dealt, or movement — makes the window's effective duration a function of the fight, which is precisely the coupling being removed. I worked through the three alternatives you asked about:

- **Break on dealing damage rather than input intent** — better ethics (no punishment for a whiffed swing), identical outcome: bots and humans land hits within ~500 ms (`P.MELEE.COOLDOWN_MS`, `balance.js:206`), so the window collapses to ~0.5 s and the coupling returns.
- **Break on movement** — appealing because it is combat-independent, but the harness's scripted human walks ~11 tiles from hall spawn to its post (`phase6Acceptance.test.js:91`), so it breaks within a tick or two. Worse in real play: it punishes the correct behaviour (walking back to the line) and rewards standing at the hall.
- **Decaying protection** (e.g. damage taken scales from 0 → 100 % over the window) — the most elegant on paper, but it reintroduces exactly the continuous timing coupling, and it does not survive `damagePlayer` cleanly (`players.js:47-60` is a hard threshold at `hp <= 0`; a partially-protected player still crosses it at a combat-determined moment).

**No break condition survives 8A's own requirement. Flat is not a compromise; it is the only option consistent with the phase's goal.** State that plainly in the spec amendment instead of the harness argument.

**Mandatory amendments to the flat window:**

1. **Say what it actually does.** As shown in HIGH-3, protection makes the player immune to all enemy damage, not merely untargetable. Write that in the amendment.
2. **Extend it to `revive`** (`players.js:81`) with its own shorter tunable, ~1000–1500 ms. A 40 %-HP player stood up inside the pack is the case that actually generates the feels-bad and the wasted 3 s channel; the 20 s-delayed hall respawn is the case that generates the least.
3. **Cut 2500 ms to ~1500 ms.** The measurable exploit is the free-swing opener: at a 500 ms basic cooldown, 2.5 s of immunity buys **five free hits** if a human sprints from the hall into the pack — a strictly dominant respawn opener with no counterplay. 1.5 s buys three, which is closer to "you got your footing back" than "you got a free rotation." Then sweep it — it is already tagged `[Phase 8C sweep]`.

**On the camping question (question 8):** deliberately dying to reset aggro is never profitable. Death costs `BLEED_OUT_MS` 15 s down plus `RESPAWN_BASE_MS` 20 s + 1 s/wave (`balance.js:208-213`) — 35 s+ of removal for 2.5 s of immunity, during which your team fights a man down and the hall takes the damage you were absorbing. Hall camping is likewise self-limiting: the enemy that ignores you attacks the hall instead, and the hall is the loss condition. No further guard needed beyond amendment 3.

---

## Is the diagnosis right?

**Probably not — or at least, it has never been tested, and there is a much better-supported explanation sitting in the evidence the plan itself cites.**

The plan asserts a shared root cause: unrouted chase beelining plus hall-adjacent respawn. That is a plausible mechanism and worth fixing on its own merits. But it does not explain the actual data.

**Look at what the Phase-6 stamp measured** (`docs/reviews/2026-07-19-checkpoint-phase6-designer-review.md:107-111`). Three interventions flipped the acceptance:

1. bot melee multiplier (0.7 → wave 9; 0.85 → wave 4; 1.0 → wave 4);
2. the one-reviver cap **alone**, with every balance magnitude reverted (10/10 → 0/8);
3. the anchor spread (10/10 → ~5/15).

**All three are bot-positioning changes. None of them touches enemy chase routing.** Item 2 is the tell: the reviver cap changes nothing about enemy steering, nothing about respawn timing, and *should* help — and it still collapsed the acceptance. A root cause in `enemies.js`'s chase branch cannot explain that. Whatever is flipping these runs is upstream of, and independent from, the mechanism 8A fixes.

**Here is what I think is actually happening, and it is three things compounding:**

**(1) The measurement is a binary threshold sampled from a two-point space (CRIT-1).** The seed does one thing: LEFT or RIGHT for the wave-4 side gate. Every "8–15 seed" result in the stamp is really two runs. "10/10" and "0/8" and "5/15" are not statistics; they are one or two scenarios flipping across a single hard boundary. A binary pass/fail on a deterministic threshold *always* looks non-monotonic when you perturb it, no matter what the underlying mechanism is. **The chaos may not exist as a property of the simulation at all — it may be an artefact of measuring a threshold crossing with a two-valued instrument.** That is the single most likely explanation, and it is also the cheapest to test: run the probe on the current unmodified code (CRIT-2) with genuinely varied scenarios and a *continuous* outcome (hall HP remaining, wave-at-loss, enemy-seconds-alive). If the continuous metric moves smoothly with the dial while the binary flips, there was never any chaos — only a badly chosen readout, and Phases 4 and 6 reverted good changes for nothing.

**(2) The threshold in question is wave 4, which is exactly when the second gate opens.** `GATE_OPEN_WAVE.SIDE_A` fires at wave 4 (`waves.js:29`, `balance.js` `GATE_OPEN_WAVE`), and the acceptance bar is "survive waves 1–4." So every one of these measurements is taken at the precise moment a brand-new lane opens on a side the lone scripted human is not covering, against three bots that are clumped on one tile at hall centre (HIGH-1 in the Phase-6 review, `bots.js:44-51` — all anchors are within ~64 px of each other) and that only drift toward the new stream once it enters `ENGAGE_RANGE_PX` (520 px). Whether the hall survives wave 4 is a race between the new lane's stream and the bot blob's drift latency. A perturbation that shifts bot arrival by a few hundred milliseconds flips it. **The one-reviver cap, the anchor spread, and the melee multiplier all do exactly that — they change when the bots get there.** This is a single, coherent, mechanistic explanation for all three measured flips. Chase-mode LoS explains none of them.

**(3) The genuine chaos amplifier, if you want one, is the wall-band quantiser — not the chase branch.** `hpToBand` (`costField.js:33-40`) quantises wall HP into three bands at 60 % and 25 %, and `WALL_ENTRY_COST` jumps `30 → 12 → 4` across them (`costField.js:29`). One point of chip damage can flip a band, which changes the **global** Dijkstra field on the next throttled recompute (`maybeRecompute`, ≤1 per 250 ms, `enemies.js:296`). That is a discontinuous, global, time-quantised state switch: the entire horde can re-route on a single tick boundary because one barricade lost one HP. Compared with that, a single chasing enemy walking into a wall is a local perturbation. If there is real sensitive dependence in this simulation, this is where I would look first — and note that `WALL_ENTRY_COST` is not even in `BALANCE`, so 8C could not sweep it (CRIT-5).

**Recommended re-sequencing.** Do 8A's LoS work — it is a genuine improvement and CRIT-4's fix makes it strictly better than today. But **do not build the phase on the claim that it removes the chaos**, and do not gate 8C on a probe that has never seen the baseline. Instead:

1. Build the probe first. Run it on `4fd9c0b`. Publish the baseline table.
2. Fix the instrument before the simulation: real scenario variation, continuous outcome metric, liveness-checked dials.
3. Re-run. If the baseline is already smooth under a continuous metric, the "chaos" was measurement error and the Phase-4/Phase-6 reverts should be revisited.
4. If it is genuinely rough, attack the wave-4 flank-coverage latency (`bots.js` shared anchor) and the wall-band quantiser before attributing anything to chase routing.

---

## What the plan gets right

Line references throughout are accurate against live source. The "STOP and report, do not tune to make it pass" rule in Tasks 2, 4 and 5 is the correct lesson from Phases 4 and 6 and should survive any rewrite. The `hasLineOfSight` implementation itself is correct and genuinely allocation-free. Skipping the inverse control rather than deleting it is the right call. The open-decision block on the spawn-protection clause is exactly how a contested design choice should be surfaced — even though I disagree with half its reasoning.
