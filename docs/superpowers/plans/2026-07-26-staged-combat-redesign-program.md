# Staged Combat Redesign Program — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Execution assignment:** Claude Code is the primary executor: Sonnet 5 by default and Claude Opus 5 if selectable (otherwise the current `opus` alias) for the explicitly high-risk work below. Codex is the independent architecture and acceptance reviewer at risk-tiered gates. The user remains the final authority for gameplay, scope, visual direction, and audio direction.

**Goal:** Deliver the approved character-attack and combat-structure redesigns in playable vertical slices without exceeding the server, network, client-rendering, animation, audio, or balance architecture.

**Architecture:** Preserve server authority and deterministic simulation. Implement explicit behavior families instead of a universal tower DSL, keep gameplay state separate from presentation state, and gate every high-risk navigation/displacement feature with full-match harness runs. Use accurate placeholders before producing final animation and audio assets.

**Tech Stack:** Node.js 20+, ES modules, Socket.IO, Phaser 3.87, Vite 5, Howler 2, Node test runner.

## Global constraints

- This program modifies no gameplay until the decisions in Task 1 are approved.
- Treat `docs/superpowers/specs/Character Class Attack Redesign.md` and `docs/superpowers/specs/2026-07-25-combat-structure-redesign.md` Amendment A as authoritative, except for explicitly approved simplifications recorded in Task 1.
- Preserve server authority for targeting, damage, statuses, displacement, cooldowns, phase timing, and destruction.
- Never retain dense enemy-store indices across ticks; retain stable enemy IDs and resolve them at use time.
- Bound projectile count, FX count, displacement velocity, status duration, activation cadence, and recurring scans.
- Do not balance from raw DPS alone or from a policy that cannot use a structure's direction/placement mechanics.
- Do not create production art/audio until accurate placeholder presentation passes readability and performance gates.
- Run `npm test` after every task. Expected baseline: 346 tests, 344 pass, 0 fail, 2 skipped.
- Preserve the user's existing dirty working tree. Before implementation, create an isolated worktree or obtain explicit approval for the current working tree.
- One task, one green commit. Codex reviews bounded commit batches at scheduled or triggered gates; do not bundle multiple runtime families into one task.
- Claude Code owns implementation changes in the assigned worktree. Codex remains read-only during implementation review unless the user explicitly assigns Codex a fix.
- Do not let Claude Code and Codex modify the same worktree concurrently.
- A task may be implementation-complete after its own green verification, but a phase is not accepted until its scheduled Codex gate independently reviews the bounded diff and evidence.
- Claude Code may not modify a specification to accommodate its implementation. Proposed design or scope changes return to the user before code changes continue.
- Codex may reject a task for specification, architecture, determinism, bounded-work, lifecycle, networking, performance, readability, or test-evidence failures even when the unit suite passes.
- Graphics production follows `docs/plans/2026-07-24-art-asset-generation-pipeline.md` and its manifest-driven redesign amendment.
- Audio production follows `docs/plans/2026-07-26-audio-asset-pipeline.md`.
- Initial audio is capped at 3 MB, total audio at 10 MB, and the complete initial game payload at 8 MB until the measured free-tier budget is revised.

---

## Program boundaries

This roadmap intentionally decomposes into five implementation plans. Claude Code should execute them in order and stop at every approval gate:

1. Combat contracts and measurement substrate.
2. Character attacks and Fireball.
3. Structure protocol, placement UX, and low-risk structures.
4. Displacement, fusion lifecycle, and fusion behaviors.
5. Animation, audio, profiling, balance, and final polish.

Each phase below is independently playable. Do not begin a later phase because an earlier phase is “mostly done.” Its acceptance gates must pass.

## Execution governance

### Lean review amendment

The earlier per-task mandatory Codex acceptance language below is superseded by this risk-tiered schedule. Claude still performs the full red/green and regression loop for every task, but Codex reviews batches at eight planned gates rather than rereading the project twenty times:

1. Current working-tree redesign reconciliation — GPT-5.6 Sol.
2. Measurement substrate — GPT-5.6 Terra.
3. Complete character slice — GPT-5.6 Terra.
4. Dynamic structure wire state plus placement — GPT-5.6 Sol.
5. Individual structures through Wind Vortex — GPT-5.6 Sol.
6. Fusion lifecycle plus the first five fusions — GPT-5.6 Terra.
7. Steam Vent and complete combat simulation — GPT-5.6 Sol.
8. Final balance, performance, and release evidence — GPT-5.6 Sol.

Add an unscheduled review only for a wire/tick-order/navigation/displacement change outside those gates, retained enemy IDs, new persistent source-owned status, unexpected test/performance result, proposed spec change, or a bug surviving two disciplined attempts. Graphics and audio receive one Terra pipeline/runtime review each; the user provides creative approval. Sol is not used for routine assets, manifests, or mechanical tests.

For token efficiency, review packets contain only the relevant plan/spec sections, base/head SHAs, changed-file list, actual diff, focused evidence, and known gaps. Full-project rereads occur only at Sol phase gates and final release.

### Codex Plugin for Claude Code workflow

Use OpenAI's official `openai/codex-plugin-cc` inside the active Claude Code session. It delegates through the local Codex CLI/app server, uses the same local authentication/configuration/checkout, and keeps reviews read-only.

Initial setup in Claude Code:

```text
/plugin marketplace add openai/codex-plugin-cc
/plugin install codex@openai-codex
/reload-plugins
/codex:setup
```

Do **not** enable `/codex:setup --enable-review-gate` for this project. The automatic Stop hook can create Claude↔Codex loops and consume both subscriptions rapidly. Reviews are manually launched only at scheduled/triggered gates.

At a normal Terra gate, configure the trusted project's Codex model to `gpt-5.6-terra`, then run:

```text
/codex:review --base <accepted-base-sha> --background
/codex:status
/codex:result
```

At a Sol architecture/soft-lock gate, configure `gpt-5.6-sol` and run one steerable review:

```text
/codex:adversarial-review --base <accepted-base-sha> --background <gate-specific focus>
/codex:status
/codex:result
```

Review commands do not take a model flag; the plugin reads the local Codex configuration. Before dispatch, Claude records the effective model and reasoning effort in the evidence packet. Do not edit project Codex configuration concurrently with an active background review.

Claude triages findings into `ACCEPT`, `REWORK`, or `USER DECISION REQUIRED`, but may not dismiss a blocking finding silently. After remediation, rerun a review only for blocking/high-risk corrections; low-risk mechanical corrections use focused tests plus diff inspection to conserve tokens. Store the Codex job/session ID and accepted SHA in the status ledger.

Use `/codex:transfer` only when the user intentionally wants to move the active problem into Codex. Routine reviews remain inside Claude Code and do not transfer implementation ownership.

### Model assignment

- **Sonnet 5:** Tasks 2, 4, 6, 7, 9, 10, 11 initially, 14 initially, Muddy Bog in Task 15, Tasks 18–19, mechanical harness runs, and precise remediation.
- **Claude Opus 5 if selectable, otherwise current `opus`:** current WIP reconciliation, Tasks 3, 5, 8, 12, 13, Grinder in Task 15, Task 16, difficult Task 17 integration, and Task 20 interpretation.
- Escalate a Sonnet task to Opus only when its architecture changes materially or a defect survives two systematic attempts. Record the resolved Claude model/version in the handoff.

### Roles

- **Claude Code / current `opus` alias — executor:** creates the isolated implementation worktree, writes tests and production code, runs required verification, prepares the handoff packet, addresses accepted findings, and creates the task commit only after acceptance.
- **Codex — reviewer:** reviews scope before implementation, then reviews the real base-to-head diff and independently verifies relevant evidence. Codex does not rely on the executor's summary as proof and does not rewrite the implementation during review.
- **User — product owner:** approves gameplay contracts, material simplifications, visual direction, scope changes, and disputed reviewer findings.

Use the `opus` alias rather than hard-coding an assumed Anthropic version name. Record the resolved model and Claude Code version in the first task handoff for reproducibility.

### Required reviewed-gate lifecycle

Every scheduled or triggered review gate follows this lifecycle. Tasks between gates remain separate green commits prepared by Claude Code, then are reviewed together as one bounded base-to-head range.

1. **Preflight review:** Codex checks the task against the approved specs, preceding interfaces, dirty-worktree boundary, and acceptance criteria. Any ambiguity returns to the user before implementation.
2. **Isolated execution:** Claude Code works only in its assigned branch/worktree and implements only the accepted task.
3. **Executor verification:** Claude Code runs the focused red/green test cycle, full `npm test`, and every task-specific build, harness, network, visual, audio, or performance gate.
4. **Handoff:** Claude Code provides the exact base commit, head commit or uncommitted diff target, changed-file list, commands run, concise results, known limitations, and any divergence from the task.
5. **Independent review:** Codex reads the actual diff and relevant source/tests, runs proportionate verification independently, and issues `ACCEPT`, `REWORK`, or `USER DECISION REQUIRED` with file/line evidence.
6. **Rework:** Claude Code addresses accepted findings in the same task branch and returns a new handoff. Codex verifies the correction rather than accepting a prose explanation.
7. **Advance:** After `ACCEPT`, the accepted gate SHA is recorded in the status ledger. Routine commits inside the batch may precede review; no subsequent high-risk phase begins before gate acceptance.

### Review evidence packet

Each handoff must contain:

- Task number and acceptance criteria.
- Base SHA and review SHA, or an exact statement that the review target is the current uncommitted diff.
- `git diff --stat` and the changed-file list, summarized rather than pasted as raw output.
- Focused test commands and pass/fail counts.
- Full-suite result.
- Required build, smoke, harness, reconnect, performance, visual, or audio evidence.
- Explicit list of skipped, flaky, or untested requirements.
- Explicit confirmation that unrelated user changes were not modified.

Claude Code's narrative is context, not evidence. Codex must inspect the diff and test behavior directly.

### Codex review checklist

Codex evaluates every task for:

- Approved specification behavior and absence of silent scope changes.
- Minimum implementation without unrelated refactoring.
- Server authority and tested tick-order implications.
- Stable-ID use and deterministic tie-breaking.
- Bounded scans, allocations, statuses, displacement, projectiles, and FX.
- Destruction, cancellation, disconnect, reconnect, and swap-removal cleanup.
- Static/dynamic wire compatibility and defaults.
- Tests that fail for the intended reason before the implementation and exercise behavior rather than internals.
- Animation/VFX geometry and timing matching authoritative gameplay.
- Audio aggregation, concurrency limits, and cleanup.
- Balance conclusions supported by a capable policy and the declared scenario.

Codex must name blocking findings precisely. It must also reject technically unnecessary review suggestions rather than forcing churn.

### Superseded phase-review list

In addition to task reviews, Codex performs broader integration reviews after:

- Task 3: measurement substrate.
- Task 7: complete character-attack slice.
- Task 12: individual structures and displacement substrate.
- Task 16: complete fusion gameplay.
- Task 19: animation/audio production.
- Task 20: final balance and release evidence.

This older six-point list is retained as historical context but is replaced by the eight lean gates above. Gate review still examines cross-task architecture, full-match behavior, network budgets, reconnects, client readability, and accumulated complexity.

## Task 1: Approve the simplified combat contract

**Files:**
- Modify: `docs/superpowers/specs/Character Class Attack Redesign.md`
- Modify: `docs/superpowers/specs/2026-07-25-combat-structure-redesign.md`
- Reference: `docs/reviews/2026-07-26-character-and-tower-redesign-implementation-review.md`

**Produces:** Exact constants and lifecycle rules that later tests can pin.

- [x] Record Wind basic as 125 ms wind-up, full movement, cooldown consumed at wind-up start, cancelled by down/death, and not cancelled by input release. — Character spec Amendment A, A1-A2 (2026-07-29).
- [x] Record Wind fan as enemy-only collision plus arena/range/lifetime termination; no wall or structure collision in the first version. — Character spec Amendment A, A3.
- [x] Record Earth as a 90-degree cone, distance then stable-ID order, cap three; multi-target contact is the first-version aggro advantage, with no threat-intensity subsystem. — Character spec Amendment A, A4-A5.
- [x] Record all basic ranges as edge distances and all misses as consuming cooldown. — Character spec Amendment A, A7-A8.
- [x] Resolve Firepit conflict: retain continuous elapsed-time DPS or restore fixed pulses. Recommendation: retain continuous DPS and amend the shared "fixed pulse" rule with a Firepit exception. — Closed 2026-07-26 as Amendment B, committed `c985563`.
- [x] Record Firestorm as one authoritative radial volley resolution with eight cosmetic client projectiles, not eight server projectiles. — Combat-structure spec Amendment C, C1 (2026-07-29).
- [x] Record Rock Trap as locking a world impact point at telegraph start. Decide separately whether Blizzard also locks a point or tracks a stable target ID; recommendation: lock a point so its telegraph is meaningful. — Combat-structure spec Amendment C, C2-C3: both lock a world point (2026-07-29).
- [x] Keep fusion consent, permanence, team ownership, and destruction-only removal. — Combat-structure spec Amendment C, C5 (reaffirmed unchanged; Gate 1 finding 2.2 remains open remediation).
- [x] Keep Steam Vent confusion deferred until every other fusion passes its gates; do not silently substitute a different mechanic. — Combat-structure spec Amendment C, C5 (reaffirmed unchanged).
- [x] Review both specs for contradictions and ambiguous timing terms. — Superseded text in §5.2/§6.3/§6.5 and Amendment A3.3 struck 2026-07-29; qualitative timing terms left qualitative per Task 1 decision sheet C1, no load-bearing ambiguity found.
- [x] Commit documentation only after user approval. — This session; see ledger 8C row for commit SHA.

**Gate:** The user explicitly approves these rulings. No gameplay implementation before approval.

## Task 2: Freeze tick-order, limits, and performance budgets

**Files:**
- Modify: `shared/balance.js`
- Modify: `server/game/tick.js`
- Test: `test/game/tickIntegration.test.js`
- Test: `test/game/balanceLiveness.test.js`
- Create: `test/game/simulationBudgets.test.js`

**Interfaces:**
- Produces: Named limits under `BALANCE.LIMITS` and a tested simulation-order contract.

- [x] Add failing tests that assert players resolve before enemies, projectiles, structures, then phase transition. — `test/game/tickIntegration.test.js`, opt-in `state.tickOrderLog` (2026-07-30).
- [x] Add failing tests for explicit maximum active structure-owned effects, projectiles, and per-tick FX emissions. — `test/game/simulationBudgets.test.js` (2026-07-30).
- [x] Add named limits only; do not alter current behavior yet. — `BALANCE.LIMITS` in `shared/balance.js`.
- [x] Run focused tests and confirm the new assertions pass.
- [x] Run `npm test`. — 355/353/2 (was 349/347/2).
- [x] Commit as `test: define combat simulation safety budgets`.

**Gate:** No current test regressions; all future runtime tasks consume named limits rather than magic numbers. — Cleared 2026-07-30.

## Task 3: Build measurement primitives before redesign tuning

**Files:**
- Modify: `test/harness/matchRunner.js`
- Modify: `test/harness/profile.js`
- Modify: `test/harness/stats.js`
- Modify: `test/harness/matchRunner.test.js`
- Modify: `test/harness/profile.test.js`

**Interfaces:**
- Produces: Source-tagged combat accounting for players and structures.

- [x] Add failing reconciliation tests for damage by source and ability/basic/structure category. — landed alongside the implementation (`server/game/combatStats.js`, single choke point in `damageEnemy`); see 2026-07-30 commit.
- [x] Add attempts, hits, misses, useful activations, unique targets, deaths by class. — DONE for basic/ability/structure damage+hits+kills+targets, and attempts/misses/useful for basic and ability (discrete per-cooldown casts). Structure attempts/misses deliberately NOT tracked (towers.js point-target fire has no meaningful "miss"; the aoe field is continuous, not discrete — see combatStats.js header; this boundary is permanent, not deferred). CC-seconds, displacement, cooldown utilization and peak-active-effects landed in Task 3b (2026-07-30): `server/game/combatStats.js` (ccSeconds/displacement accounting), `server/game/enemies.js` (CC-seconds hook in `tickEnemies`), `server/game/enemyMove.js` (`applyKnockback` returns its applied magnitude), `server/game/abilities.js`/`towers.js` (displacement recorded at the 5 knockback/pull call sites), `test/harness/matchRunner.js` (`cooldownUtilization()` post-processing, `peakProjectiles`/`peakStructureEffects` per-tick tracking).
- [x] Ensure aggregate totals reconcile with per-wave and per-source totals. — for damage (per-wave, Task 3) and for CC-seconds/displacement (run-level, Task 3b — see the scoping note in `matchRunner.test.js`: these two are run-level aggregates only, not per-wave, a deliberately smaller reconciliation claim than damage's).
- [x] Add hang imputation and split-half checks to every redesign sweep output. — `probe.js`'s `METRICS` table (Task 3b) generalizes the treatment `score` always had to `enemySeconds` (previously classify-only) plus three Task 3 combat metrics (ccSeconds, displacement, structure damage): every metric in the table gets hang-imputed-t and split-half rho printed. Adding a further combat metric to the sweep is now a one-line `get(m)` accessor, not a new pattern.
- [x] Keep instrumentation inert: a null instrumentation dial must remain byte-identical. — `combatStats` is opt-in (`if (state.combatStats)` idiom, matching `tickOrderLog`/`aoeStats`); every record* call is a no-op without it. Tested directly (`INSTRUMENT: source-tagged accounting is inert when combatStats is absent`) and indirectly (the whole non-harness suite never sets it). Task 3b's `state.aoeStats.heldNow` follows the same `if (state.aoeStats)` guard already governing `activeTicks`/`enemySeconds`.
- [x] Run harness tests, then `npm test`. — 365/363/2 (was 361/359/2; +4 Task 3b reconciliation tests, 0 regressions).
- [x] Commit as `test: instrument redesigned combat sources`. — first increment (`dc585a8`); Task 3b (CC-seconds/displacement/cooldown-utilization/peak-effects + probe.js generalization) lands as a follow-up commit, closing Task 3.

**Gate: MET.** The harness can answer whether a basic attack, an ability, or a structure is effective (damage, hit rate, useful-activation rate, unique targets, kills, CC-seconds contributed, displacement applied, cooldown utilization) without relying only on DPS, and a redesign sweep can attribute a moved metric to a source and check that the movement survives hang-imputation and replicates split-half. Two permanent (not deferred) scope boundaries remain, both documented at their source: structure attempts/misses have no discrete-cast analogue to measure (combatStats.js header), and CC-seconds/displacement are population-wide/impulse-proxy figures rather than fully caster-attributed or measured-travel-distance figures (status.js has no caster reference; knockback distance is confounded by decay/clamping/flow-field overlap — see combatStats.js header for both).

## Task 4: Introduce focused character-basic modules

**Files:**
- Create: `server/game/basicAttacks.js`
- Modify: `shared/balance.js`
- Modify: `server/game/state.js`
- Modify: `server/game/players.js`
- Modify: `server/game/aggro.js`
- Test: `test/game/players.test.js`
- Create: `test/game/basicAttacks.test.js`

**Interfaces:**
- Produces: `tryBasicAttack(state, player, now)` and `tickPendingBasics(state, now)`.
- Consumes: Stable enemy IDs and the approved Task 1 combat contract.

- [x] Write failing tests for exact Earth, Water, and Fire damage/range/cooldown behavior.
- [x] Write Earth tests for cone orientation, cap three, distance/stable-ID ordering, miss cooldown, and swap-removal safety.
- [x] Move shared-melee resolution into `basicAttacks.js` and dispatch by element.
- [x] Rename melee configuration/state/multiplier to basic-attack terminology without changing level scaling.
- [x] Keep the implementation limited to Earth, Water, and Fire; Wind remains a failing/skipped contract until Task 5.
- [x] Run character tests and `npm test`.
- [x] Commit as `feat: add class-specific basic attacks`.

**Gate:** Earth, Water, and Fire identities work server-side with placeholders and no network changes.

## Task 5: Add the Wind fan projectile and Fireball retune

**Files:**
- Modify: `server/game/basicAttacks.js`
- Modify: `server/game/projectiles.js`
- Modify: `shared/balance.js`
- Modify: `server/net/encode.js`
- Test: `test/game/projectiles.test.js`
- Test: `test/game/abilities.test.js`
- Test: `test/net/encode.test.js`
- Test: `test/client/snapshotBuffer.test.js`

**Interfaces:**
- Produces: Append-only `FAN_BLADE` projectile type and pending 125 ms Wind release.

- [x] Write failing tests for wind-up timing, cancellation on down/death, full movement, single hit/no pierce, range/lifetime/bounds termination, and no miss detonation.
- [x] Refactor projectile collision to return a selected enemy slot for immediate use only.
- [x] Add `FAN_BLADE` append-only to the projectile ABI and preserve old decode defaults.
- [x] Apply Fireball values: 5,000 ms cooldown, 300 px range, 12 direct damage, 5 DPS for 2.5 seconds, 44 px explosion.
- [x] Preserve all Fireball AoE, burn, friendly-fire, L3 boost, and aggro regressions.
- [x] Run projectile/network/client tests and `npm test`.
- [x] Commit as `feat: add Wind fan and retune Fireball`.

## Task 6: Make bots and harness policies understand attack ranges

**Files:**
- Modify: `server/game/bots.js`
- Modify: `shared/balance.js`
- Modify: `test/harness/matchRunner.js`
- Test: `test/game/bots.test.js`
- Test: `test/harness/matchRunner.test.js`

- [x] Write failing tests showing Earth/Water close, Fire holds near 65 px, and Wind holds/kites near 100 px.
- [x] Replace universal contact distance with per-class preferred bands.
- [x] Preserve revive, retreat, anchor, and special priorities.
- [x] Teach the scripted combat policy to generate real attempts and misses rather than holding all actions blindly.
- [x] Run bot/harness tests and `npm test`.
- [x] Commit as `feat: position bots for class attack ranges`.

**Gate:** Run full ten-wave character matrices and record, but do not yet tune, class/source metrics.

**Recorded 2026-07-31** (`test/harness/probe.js --dial __NULL_DIAL --values 0 --maze A|B --profile shipped`,
144 matches/maze): hang gate holds, **0/144 on both mazes**. Win rate dropped from the
pre-Task-6 baseline (maze A 9.7% → **1%**, maze B 1.4% → **0%**) — real fallout, not tuned here.
Root cause: the old universal `actions.basic = true` (bots) / `actions: {basic: true, ...}`
(scripted human) pressed basic every tick whenever ANY enemy existed within `ENGAGE_RANGE_PX`
(520px), so cooldown cycled on a fixed cadence regardless of true reach; gating it to real reach
means fewer "free" cooldown resets while approaching, and Fire/Wind now hold at 65px/100px
instead of closing to a universal 30px, changing how much damage lands before an enemy reaches
the wall. A first attempt gated firing on the same positioning band (`holdRangePx`) directly,
which was a correctness bug, not a balance choice — it silently withheld swings whenever the
target's edge (attacker radius + target radius) put it within true reach but outside the tighter
band, at the band-to-reach margin computed by `attackReachPx`. Caught via `phase4Acceptance.test.js`
failing outright (`lost` instead of `won`) before the fix. Per the program plan's own instruction,
this drop is recorded, NOT tuned — 8C balance sweep is where win% gets addressed.

## Task 7: Add attack presentation events and accurate placeholders

**Files:**
- Modify: `server/game/basicAttacks.js`
- Modify: `server/net/encode.js`
- Modify: `client/src/scenes/GameScene.js`
- Modify: `client/src/audio.js`
- Test: `test/net/encode.test.js`
- Test: `test/client/audioMap.test.js`

**Interfaces:**
- Produces: Bounded attack events containing source ID, attack type, position, aim, and sequence.

- [x] Write wire tests for richer attack events and FX-family caps. — new `atk` channel in `encode.js` (`ATTACK_KINDS`, srcId/kind/x/y/aim/seq), capped per KIND (FX-family cap, same budget as `fx`'s per-type cap); `test/net/encode.test.js`.
- [x] Render exact Earth cone, Water contact area, Fire reach, Wind wind-up, fan flight, and impact using geometric placeholders. — `GameScene._playAtk`/`_drawArcTelegraph`/`_drawWindTelegraph`; Earth's cone uses the real `coneDeg`/`rangePx`, Water/Fire use real `rangePx` with a wide/narrow placeholder angle; Wind's ring+tick fades over the real `windUpMs`; fan-blade projectile now renders as a distinct ellipse, not Fireball's circle. Impact was already covered by the existing `dmg` fx (unchanged).
- [x] Add immediate local animation feedback while treating server impact events as authoritative. — `GameScene._sendInput` edge-detects the local player's own basic press and calls `_playAtk` immediately (cosmetic only); server `atk`/`dmg`/`fx` events in `_onSnapshot` remain the sole source of truth for what landed.
- [x] Aggregate multi-target impacts into one logical sound. — already achieved by `audio.js`'s existing `SAME_NAME_FLOOR_MS` play-rate floor (documented in place); pinned with a new test in `test/client/audioMap.test.js` (Earth's 3-target cone → one `enemy_hit` play).
- [x] Run network/audio tests, `npm run build`, and `npm test`. — 393/391/2 (was 386/386/2, +7 net, 0 regressions); `npm run build` succeeds.
- [x] Commit as `feat: visualize class attack contracts`.

**Gate:** A player can understand reach, timing, miss, and impact without reading numbers.

## Task 8: Add static/dynamic structure wire channels

**Files:**
- Modify: `server/net/encode.js`
- Modify: `server/game/emitGate.js`
- Modify: `server/game/structures.js`
- Modify: `client/src/scenes/GameScene.js`
- Test: `test/net/encode.test.js`
- Test: `test/client/snapshotBuffer.test.js`

**Interfaces:**
- Produces: Static `s` records with orientation/direction and dynamic `ds` records keyed by structure ID.

- [x] Write round-trip tests for orientation, direction, HP, phase, deadline, charge, and cycle sequence. — `test/net/encode.test.js`, `test/client/snapshotBuffer.test.js`.
- [x] Keep static placement versioned; never bump `placedVersion` for phase transitions. — static `s` (id/type/geometry/orientation/direction) only changes on `placedVersion`; dynamic `ds` (hp/phase/deadline/charge/cycle) rides every emit.
- [x] Send current dynamic state in reconnect/full snapshots. — verified by this task's own reconnect test and reused by every later structure task (Vortex, Volcano, etc.) with no further wire change.
- [x] Resolve nonlethal structure HP staleness through `ds`, not full static resend. — the original defect this task fixed: hp previously needed a `placedVersion` bump to reach the client.
- [x] Add missing-field defaults for compatibility. — `ds`'s decode gained per-field defaults after Gate 4 found a truncated tuple produced NaN/undefined (`8b7179e`).
- [x] Run network tests and `npm test`. — clean at commit time; re-verified at Gate 4.
- [x] Commit as `feat: stream dynamic structure state`. — `deeab6c`; Gate 4 findings (wire ABI break, missing defaults) fixed at `8b7179e`.

## Task 9: Complete orientation, direction, and placement UX

**Files:**
- Modify: `shared/constants.js`
- Modify: `server/index.js`
- Modify: `server/game/economy.js`
- Modify: `server/game/structures.js`
- Modify: `client/src/scenes/GameScene.js`
- Test: `test/game/structures.test.js`
- Test: `test/net/smoke.test.js`

- [x] Write validation tests for orientation and independent cardinal direction. — `test/game/structures.test.js`, `test/net/smoke.test.js`.
- [x] Forward both fields end-to-end and reject invalid combinations server-side. — `BUILD_STRUCTURE -> economy.buildStructure -> placeStructure`; rejects bad orientation, missing/garbage direction on Water Geyser/Wind Vortex, or a direction supplied for a non-directional type, instead of silently coercing.
- [x] Add rotate and direction controls, multi-tile ghost, validity state, range/area preview, and correct sprite center/size. — rotate (R) / direction (arrow keys); footprint-aware validity-colored ghost; fixed placed-structure sprite center/size, previously pinned to a single tile regardless of 2x1/2x2 footprint.
- [x] Ensure walkable structures read as traversable and directional structures show locked output direction. — walkable-vs-blocking opacity plus a locked-direction arrow on the ghost.
- [x] Run server/client build, smoke tests, and `npm test`. — clean at commit time; re-verified at Gate 4.
- [x] Commit as `feat: add directional structure placement`. — `e030844`; Gate 4 also found the client-side validity ghost only checked geometry (missed element-lock/farm-ratio rejections) and fusion silently inheriting a stale `dir` from whichever ingredient triggered `resolveCombosAt` — both fixed at `8b7179e`.

## Task 10: Preserve Watchtower and implement true Snare Post

**Files:**
- Create: `server/game/structureBehaviors/aura.js`
- Modify: `server/game/towers.js`
- Modify: `shared/balance.js`
- Test: `test/game/towers.test.js`
- Create: `test/game/snarePost.test.js`

- [x] Pin Watchtower nearest/distance/stable-ID behavior with tests. — `test/game/towers.test.js`; distance ties break by stable enemy ID, matching `basicAttacks.js`'s convention.
- [x] Write failing Snare tests for all enemies inside, none outside, zero damage, linger, resistance, strongest slow, and destruction stopping refresh. — `test/game/snarePost.test.js`.
- [x] Implement a bounded 200-250 ms aura cadence. — `server/game/structureBehaviors/aura.js`; every enemy in `radiusPx` gets its slow refreshed every `cadenceMs`, no damage, no target search.
- [x] Preserve existing slow semantics; do not redesign global status stacking. — existing slow/status stacking rules untouched.
- [x] Run focused tests and `npm test`. — clean at commit time.
- [x] Commit as `feat: add Snare Post group aura`. — `17579df`.

## Task 11: Implement Rock Trap and Water Geyser

**Files:**
- Create: `server/game/structureBehaviors/targetImpact.js`
- Create: `server/game/structureBehaviors/displacement.js`
- Modify: `server/game/towers.js`
- Modify: `shared/balance.js`
- Create: `test/game/rockTrap.test.js`
- Create: `test/game/waterGeyser.test.js`

- [x] Test Rock Trap max-HP/distance/stable-ID selection, locked world point, primary/splash accounting, target departure, cooldown, and destruction. — `test/game/rockTrap.test.js` (2026-08-01).
- [x] Test Geyser footprint-only selection, stable ties, damage, weight scaling, direction, wall/bound safety, and Geyser distance exceeding Vortex release. — `test/game/waterGeyser.test.js`; Vortex comparison uses a named placeholder (`ASSUMED_VORTEX_RELEASE_POWER` in `displacement.js`) since Vortex doesn't exist until Task 12.
- [x] Implement only the shared primitives these two structures require. — `targetImpact.js` (Rock Trap's telegraph cycle), `displacement.js` (Water Geyser's footprint launch).
- [x] Add exact placeholder telegraphs and direction effects. — magnitudes in `shared/balance.js`'s `EARTH_SPECIAL`/`WATER_SPECIAL` entries, flagged first-pass like the rest of `BALANCE.TOWER`.
- [x] Run focused tests, `npm run build`, and `npm test`. — suite 443/441/2, build clean.
- [x] Commit each structure separately. — `a195c35` (Rock Trap), `523e5a5` (Water Geyser).

## Task 12: Implement bounded structure cycles and Wind Vortex

**Files:**
- Create: `server/game/structureBehaviors/cycle.js`
- Modify: `server/game/structureBehaviors/displacement.js`
- Modify: `server/game/towers.js`
- Modify: `server/net/encode.js`
- Create: `test/game/windVortex.test.js`

- [x] Test phase deadlines, suction cadence, one release, direction, weight immunity, per-source recapture immunity, destruction cancellation, reconnect, and overlap with other displacement. — `test/game/windVortex.test.js` (12 tests); overlap test also required a new `MAX_KB_VELOCITY` global cap in `enemyMove.js`'s `applyKnockback` (spec §5.4: "multiple displacement sources cannot produce invalid velocity or permanent capture").
- [x] Implement sequence/deadline-based cycles with no catch-up activation storm. — `structureBehaviors/cycle.js`: every check is "has `now` passed the stored deadline", firing at most one phase transition and one suction pulse per `tickCycle` call regardless of how far behind `now` is.
- [x] Use stable IDs only if tracking is unavoidable; prefer phase-time spatial queries. — suction/release both re-query the live store by position/id each call; the only IDs retained are `s.vxTracked`/`s.vxImmune`, both scoped to the structure instance (not the enemy store), for exactly the two things a spatial query can't reconstruct after the enemy has moved: "who did this cycle already catch" and "who did I just release."
- [x] Render idle, suction, and release placeholders from `ds` and effect events. — no `encode.js` change needed: Task 8 already wires `s.phase`/`s.phaseDeadline`/`s.charge`/`s.cycleSeq` unconditionally for every structure (verified via `test/net/encode.test.js` and this task's own reconnect test); `cycle.js` just populates them. Actual client rendering is deferred to the art/runtime integration pass, consistent with Tasks 10-11.
- [x] Run `npm test`, then the hard 144-run maze A and 144-run maze B hang gates. — suite 455/453/2 pass/skip; `npm run build` clean; probe hang gate 0/144 on both maze A and maze B (`npm run probe -- --dial __NULL_DIAL --values 0 --maze A|B --profile shipped`). `matchRunner.test.js`'s scripted 10-wave-clear seed needed a refresh (20260843 -> 20260850) since WIND_SPECIAL losing its damage is the intended trade for Task 12's redesign — same precedent as five prior seed swaps in that file.
- [x] Commit as `feat: add bounded Wind Vortex cycle`.

**Hard gate:** 0/144 hangs on both mazes. Stop and investigate any regression.

## Task 13: Implement fusion proposal, consent, and lifecycle

**Files:**
- Modify: `shared/constants.js`
- Modify: `server/index.js`
- Modify: `server/game/combos.js`
- Modify: `server/game/structures.js`
- Modify: `server/game/repair.js`
- Modify: `client/src/scenes/GameScene.js`
- Modify: `test/harness/matchRunner.js`
- Test: `test/game/combos.test.js`
- Test: `test/rooms/rooms.test.js`

- [x] Test proposal creation without mutation, two-human consent, human-on-behalf-of-bot consent, rejection, timeout, disconnect, stale ingredient, duplicate response, and concurrent proposal. — `test/game/combos.test.js` (18 new tests); the socket-level two-human round trip is in `test/net/smoke.test.js` rather than `rooms.test.js`, which is a RoomManager unit file with no game state.
- [x] Test team ownership, unsellability, teammate repair, destruction-only removal, and no ingredient restoration. — same file. Repair needed no ownership gate: `repair.js` deliberately has none, which is what makes a team-owned fusion teammate-repairable without a special case.
- [x] Replace auto-fusion atomically with pending proposals and explicit server events. — `combos.js` rewritten around propose/respond/expire/invalidate; `EVENTS.RESPOND_FUSION` + `FUSION_PROPOSED`/`FUSION_UPDATED`/`FUSION_RESOLVED`; endings queue onto `state.fusionEvents`, drained by `loop.js` (the `pendingLevelUp` idiom) so there is exactly one resolution path.
- [x] Add client preview/accept/reject/expiry UI. — `GameScene.js`: proposed-square outline, a prompt naming both ingredients, the result and its permanence, `[Y]`/`[N]` (only sent by a player in `requiredIds`), and a display-only countdown; the server owns expiry.
- [x] Teach the harness to complete valid proposals and choose orientation/direction. — `matchRunner.js` answers its own proposal, passes `orient` explicitly and supplies a cardinal for a directional partner (without which placement is now rejected outright).
- [x] Run `npm test`, both maze gates, then retake the tower baseline. — suite 483/481/2, `npm run build` clean, hang gate 0/144 on both mazes (and 0/144 in all three baseline arms). Retake published: `docs/reviews/2026-08-01-tower-baseline-retake.md` — fusion now measures NEUTRAL at every timing on both mazes; the old wave-1 penalty (−0.228 / −0.391) is gone.
- [x] Commit as `feat: add consensual permanent fusions`.

## Task 14: Implement Firestorm, Volcano, and Blizzard separately

**Files:**
- Create: `server/game/structureBehaviors/volley.js`
- Create: `server/game/structureBehaviors/entryTrigger.js`
- Modify: `server/game/structureBehaviors/targetImpact.js`
- Create: `test/game/firestorm.test.js`
- Create: `test/game/volcano.test.js`
- Create: `test/game/blizzard.test.js`

- [x] Firestorm: test one authoritative activation, bounded targets/range, one hit per enemy per volley, cosmetic eight-shot event, FX/audio aggregation, caps, and destruction. — `test/game/firestorm.test.js`; one `tickTowers` pass hits every enemy in range once, `cycleSeq` is the wire cue for the eight cosmetic client projectiles. Also closed a pre-existing Amendment A3.3 gap found while writing this: `triggerAggro` had no null/structure path, so a team-owned structure's damage (`ownerId` null post-fusion) bypassed the sticky-lock guard.
- [x] Volcano: test per-enemy entry counting, charges, eruption, passive burn below Firepit, caps, and destruction cleanup. — `test/game/volcano.test.js`; MAGMA_TRAP moved onto the entry-count trigger family (spec §6.2) — third charge fires one eruption, then a recharge window where crossings still burn but bank no further pressure. State mirrors onto the generic `phase/phaseDeadline/charge/cycleSeq` wire fields Task 8 already streams.
- [x] Blizzard: test densest-cluster selection, stable ties, locked world point, one AoE damage/freeze, visual overlap immunity, destruction, and reconnect. — `test/game/blizzard.test.js`; joined Rock Trap's target-impact family, largest cluster wins (ties by distance then stable ID), point committed at telegraph start.
- [x] Implement and review one structure at a time; run `npm test` and commit after each. — `076251a` (Firestorm), `a8a29ec` (Volcano), `d0f8495` (Blizzard); reviewed together with Task 13/15 at Gate 6 (`d28498b`, `9a3c69c`).

## Task 15: Implement Muddy Bog and Grinder

**Files:**
- Create: `server/game/structureBehaviors/areaEntry.js`
- Modify: `server/game/status.js`
- Modify: `server/game/structureBehaviors/cycle.js`
- Create: `test/game/muddyBog.test.js`
- Create: `test/game/grinder.test.js`

- [x] Bog: test one root per crossing, weight duration/caps, damage during owned root only, lingering slow, re-entry, overlapping Bogs, swap removal, and destruction cleanup. — `test/game/muddyBog.test.js`; new `areaEntry.js` family (spec §3 family 4), `status.js` gained `rootSourceId` (Amendment A2.2) so Bog destruction ends only the root it owns.
- [x] Grinder: test outer pull, inner-only crush once, survivor ejection, direction, weight immunity, destruction cancellation, reconnect, and overlap caps. — `test/game/grinder.test.js`; joins Wind Vortex in `structureBehaviors/cycle.js`, but crushes by POSITION AT CRUSH TIME rather than a tracked-release set, so only what the intake actually dragged inward is hit.
- [x] Add only compact source/cycle fields required by these mechanics; no general effect graph. — `rootSourceId` plus the existing `cycle.js` phase skeleton; no new general-purpose effect graph added.
- [x] Run `npm test` after each structure. — clean at each commit.
- [x] Run both hard maze gates after Grinder. — 0/144 both mazes; re-verified again after Task 16 (Steam Vent) landed on top.
- [x] Commit each structure separately. — `66afa71` (Muddy Bog), `fa71282` (Grinder); reviewed with Task 13/14 at Gate 6, with a further Bog-specific fix at `9a3c69c` (a rooted enemy displaced out of the mud by another structure's knockback kept taking Bog damage at unbounded range; a longer root from another source silently cancelled the Bog's lingering slow; `rootSourceId`'s "no owner" sentinel moved 0 -> `NO_ROOT_SOURCE` (-1) since structure id 0 is reachable).

## Task 16: Implement Steam Vent confusion last

**Files:**
- Modify: `server/game/status.js`
- Modify: `server/game/enemyTypes.js`
- Modify: `server/game/enemies.js`
- Create: `server/game/structureBehaviors/confusion.js`
- Create: `test/game/steamVent.test.js`

- [x] Before coding, write an adversarial test matrix for navigation suspension, target acquisition, heading changes, immunity, overlapping vents, hall ring, destruction, and reconnect. — `docs/plans/2026-08-01-steam-vent-adversarial-test-matrix.md`, written before any confusion code.
- [x] Add preallocated confusion timing/heading/immunity fields and one status flag. — `status.js`; `FLAG.CONFUSED = 1 << 7`, appended so no existing bit moved.
- [x] Bound duration and refresh; never allocate per tick or stack unbounded sources. — episode budget (`confuseCapMs`), so N overlapping vents buy one episode; confused fraction of a permanent occupant provably <= cap/(cap+immunity).
- [x] Implement server-authoritative behavior with explicit cleanup. — `structureBehaviors/confusion.js`; no per-enemy state to clean up, and the wire carries a flag only.
- [x] Run focused tests and `npm test`. — 574 / 572 pass / 2 skipped; `npm run build` clean.
- [x] Run 144 maze A and 144 maze B matches plus hall-ring adversarial cases. — 0/144 both mazes, `comboFormed === 'STEAM_VENT'` in all 288 cells; confusion confirmed to have fired in 144/144 (A) and 139/144 (B).
- [x] Commit as `feat: add bounded Steam Vent confusion` only if every gate passes. — `d62bf8a`, plus `4b91d5e` (harness) and `ff00567` (review remediation).

**Hard gate:** Any hang or unresolved navigation state blocks acceptance.

## Task 17: Build the reusable animation controller

**Files:**
- Create: `client/src/render/AnimationController.js`
- Create: `client/src/render/EffectPool.js`
- Modify: `client/src/scenes/Preload.js`
- Modify: `client/src/scenes/GameScene.js`
- Modify: `client/src/assets/manifest.js`
- Create: `test/client/animationController.test.js`

**Interfaces:**
- Produces: Character priorities `death/downed > hurt > attack/cast > run/idle`; structure states `idle/telegraph/active/recovery/charged`.

- [x] Test state priority, timed action completion, cancellation, remote event sequencing, stale event rejection, and destruction cleanup. — 34 headless tests in `test/client/animationController.test.js`; sequencing/staleness ride the existing per-caster `atk.seq` and the structure `cycleSeq` (a seq that repeats or regresses is refused). **Correction 2026-08-02:** the original entry also claimed an event "arriving after its own duration elapsed" is refused. That gate exists in `onAttack` but is INERT in production — `GameScene._playAtk` passes no `tMs`, so the event's start always defaults to `nowMs` and the deadline is never in the past. It must not be wired naively: remote entities render `INTERP_DELAY_MS` (100ms) behind, against 120ms cast durations, so an honest server-derived timestamp would leave ~20ms of a remote cast and would reject it outright under jitter. Duplicate/out-of-order delivery is already covered by the `seq` gate; if the staleness gate is ever made live it must compare against the render timeline, not the wall clock.
- [x] Keep animation playback client-owned; never transmit frame numbers. — no wire change at all: character states come from PLAYER_FLAG bits, hp deltas, the interpolated displacement, and `atk` events; structure states come from Task 8's generic `phase/deadline/charge/cycleSeq`, with the behavior family read off the same `BALANCE.TOWER` spec keys `towers.js` dispatches on.
- [x] Support continued movement during Wind's full-body attack and accept limited foot sliding initially. — `cast` outranks `run`, and facing keeps tracking movement mid-cast.
- [x] Pool frequent effects and cap simultaneous instances. — `EffectPool` backs the damage/callout text (cap 64) and impact rings (cap 32); over the cap the effect is dropped rather than allocated.
- [x] Run client tests, `npm run build`, and `npm test`. — suite 608 / 606 pass / 0 fail / 2 skipped at commit time (611 / 609 / 0 / 2 after the Opus review fixes in `8644417`); build clean; verified live in the browser through a full wave: 4 character animators reached `idle`/`run`/`cast` off real bot casts, pools peaked 5 text / 2 rings and returned to 0 live, and a placed Wind Vortex / Rock Trap resolved the `cycle` / `targetImpact` families with directional keys.
- [x] Commit as `feat: add bounded combat animation controller`.

## Task 18: Produce animation and VFX vertical slices

**Files:**
- Modify: `client/src/assets/manifest.js`
- Modify: `client/src/scenes/Preload.js`
- Modify: `client/src/scenes/GameScene.js`
- Add generated/source assets under the project's approved art pipeline paths.

**Authority:** Execute the manifest, GPT Image source-generation, Pillow conversion, footprint/origin, and Phaser scale contracts in `docs/plans/2026-07-24-art-asset-generation-pipeline.md`.

- [ ] Complete Wind basic: wind-up, release, fan flight, impact/dissipation.
- [ ] Complete Rock Trap: warning shadow, fall, impact.
- [ ] Complete Vortex: idle swirl, suction, directional release.
- [ ] Verify authoritative geometry alignment at arena center and boundaries.
- [ ] Revisit `hurtMs` against the real cast frames. Task 17 set hit reaction to 220ms with `hurt` outranking `cast` unconditionally, but every cast is shorter (120ms; Wind 245ms), so a hit landing during a cast suppresses the remainder of that cast entirely for 3 of 4 classes. The sim still resolves the attack, so the visual reads "interrupted" while the game says it landed. Deferred from Task 17 because the right answer (shorten `hurtMs`, cap it at the remaining cast, or let an active cast outrank hurt) is only judgeable against real animation frames.
- [ ] Profile worst-case effects and confirm stable client frame time.
- [ ] Obtain visual approval before producing the remaining roster.
- [ ] Commit approved calibration assets and manifest changes.

**Gate:** The three slices establish scale, frame count, palette, timing, readability, and performance for production.

## Task 19: Complete restrained production animation and audio

**Files:**
- Modify: `client/src/assets/manifest.js`
- Modify: `client/src/audio.js`
- Modify: `client/src/scenes/Preload.js`
- Test: `test/client/audioMap.test.js`

**Authority:** Graphics follow `docs/plans/2026-07-24-art-asset-generation-pipeline.md`; audio follows `docs/plans/2026-07-26-audio-asset-pipeline.md`. `art/assets-manifest.json` and `audio/assets-manifest.json` are the production ledgers.

- [ ] Character basics: Earth sweep, Water palm, Fire saber extension, Wind fan. Reuse one cast animation per character for specials initially.
- [ ] Add hand-anchored elemental aura overlays to basic-attack release frames: Water swirl/droplets, Wind ribbons, and Fire flame. Keep these as reusable, transparent runtime FX layers (behind/optionally in front of the hero), with per-direction/frame hand-anchor metadata; do not rebake or regenerate the character frames. Use pixel-art highlights/additive accents sparingly rather than blur-based lighting.
- [ ] Structures: static sprite plus only the gameplay-critical activation states defined in the approved visual slice.
- [ ] Add shared fusion creation and destruction treatments with element variants.
- [ ] Add semantic audio families: attack/release, impact, telegraph, activation, control, heavy payoff, and fusion UI.
- [ ] Source audio from individually verified CC0/public-domain or CC-BY library assets; generate attribution from the manifest and reject incompatible/ambiguous licenses.
- [ ] Process every shipped asset through the FFmpeg/ffprobe pipeline; ship no source WAV/library downloads.
- [ ] Add progressive `build_calm`, `build_light`, `build_tense`, and `build_final` mixes plus distinct build-lock, attack-start, and wave-clear stingers.
- [ ] Add modest stereo pan/distance attenuation to world combat sounds while UI, phase cues, downed alerts, and music remain centered.
- [ ] Aggregate multi-target and Firestorm sounds; cap concurrent structure sounds; stop loops/scheduled sounds on destruction; never replay historical audio on reconnect.
- [ ] Ensure every emitted FX type maps to a declared logical sound and every logical sound has an asset or deliberate fallback.
- [ ] Enforce 3 MB initial audio, 10 MB total audio, 8 MB complete initial payload, 12 combat voices, 4 structure voices, and 2 music tracks during crossfade.
- [ ] Run audio tests, client build, full tests, and visual/audio QA.

## Task 20: Balance, profile, and ship by evidence

**Files:**
- Modify: `shared/balance.js`
- Modify: `test/harness/scenarios.js`
- Modify: `test/harness/profile.js`
- Add dated reports under `docs/reviews/`.

- [ ] Declare each structure's intended scenario and skill dependency before measurement.
- [ ] Run open lane, packed choke, split lane, and light/heavy/mixed elite matrices.
- [ ] Compare one ingredient, two separated ingredients, and fusion at equal gold against the Watchtower anchor inside a defense.
- [ ] Measure character single-target/cluster output, attack uptime/miss rate, deaths, control, Wind versus every speed tier, and Fireball useful-hit rate.
- [ ] Verify no strict domination and that a rational policy sometimes chooses fusion and sometimes keeps ingredients separate.
- [ ] Profile 60 Hz server tick cost, snapshot/FX bandwidth, peak projectiles/effects, client frame time, and memory stability.
- [ ] Change one numeric family per sweep; rerun split-half and hang-imputed analysis.
- [ ] Run `npm test`, both hard maze gates, build, smoke/e2e tests, and a manual four-player readability session.
- [ ] Publish results and remaining known limits; do not claim final balance from harness data alone.

## Claude Code operating instructions

Use this exact loop for every task:

1. Read only the task, its referenced spec section, preceding interfaces, and named files.
2. Confirm the assigned branch/worktree and preserve unrelated user changes.
3. Write the smallest failing test that proves one behavior.
4. Run the focused test and record the expected failure.
5. Implement the minimum behavior; avoid unrelated cleanup.
6. Run the focused test, then `npm test`.
7. For client changes, also run `npm run build`.
8. For displacement/navigation tasks, run the required harness gate before claiming completion.
9. Review the diff for scope, deterministic behavior, bounded work, stable IDs, cleanup, and wire compatibility.
10. Commit the green task boundary and record its SHA without entering the next high-risk phase.
11. At a scheduled/triggered gate, produce the bounded evidence packet for Codex.
12. Address `REWORK` findings or stop for `USER DECISION REQUIRED`; record `ACCEPT` and the accepted SHA in the status ledger.

Never let an agent implement more than one runtime family without an intervening review. A passing unit suite does not override a failed hang, frame-time, bandwidth, or readability gate.

## Completion criteria

The program is complete only when:

- Every approved character and structure identity is implemented or explicitly deferred in the specs.
- All simulation and reconnect behavior is deterministic and bounded.
- Both maze hard gates remain clean for every navigation/displacement feature.
- Presentation accurately communicates authoritative ranges, directions, telegraphs, and phases.
- Worst-case server, network, client, audio, and effect budgets are measured and acceptable.
- Balance reports include source attribution, utility, misses/waste, and skill-dependent scenarios.
- The full automated suite, production build, network smoke test, and manual multiplayer readability pass succeed.
- Every scheduled or triggered review gate has a recorded Codex acceptance against the reviewed SHA.
