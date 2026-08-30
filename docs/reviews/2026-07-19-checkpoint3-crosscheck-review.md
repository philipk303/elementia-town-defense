# CP3 Cross-Check Review — Phase 4 (Player Characters, Abilities, Lifecycle, Netcode)

<!-- REMEDIATION STAMP -->
<!-- ─────────────────────────────────────────────────────────────────── -->

> **REMEDIATION — 2026-07-19 (auto-applied, Opus 4.8 executor; TDD, suite 220/220 green).**
> - **H1 (Fireball self-damage under FF) — FIXED**, independently raised by all three CP3 reviewers. Owner now excluded in `detonate` (`server/game/projectiles.js:62`); regression test added.
> - **M1 (L3 area boost dropped for the Fire projectile) — FIXED.** `spawnProjectile` gained an `areaBoost` that scales AoE+range; the Fire special threads the L3 boost. Regression test added.
> - **LOWs** (in-flight projectile persisting through waveEnd/build until next `initFight`; parked non-acting bot entities distorting playtests — Phase 6; revive-on-exact-bleed-out-tick losing to death) — triaged non-gating / Phase 6/8; not addressed.


---

- **Date:** 2026-07-19
- **Reviewer profile:** Opus 4.8 — independent cross-check (senior multiplayer systems programmer, adversarial mandate)
- **Scope / commit range:** Phase 4 diff `git diff 4cfb1e2..8416bbd` (27 files, +2284). Player entities, WASD+aim input, movement/pushout, down→revive→death→respawn, enemy→player melee, projectiles, 4 specials + 4 L4 seconds, friendly-fire matrix, synchronized leveling L1–L4, wire-format extensions, client SnapshotBuffer/GameScene port.
- **Method:** read spec (incl. all amendments), full diff + underlying modules, tests under `test/`; ran the suite (**217/217 green**) and wrote a throwaway probe to confirm the HIGH finding. No production/test files modified.
- **Verdict:** **CONDITIONAL GO** — one HIGH correctness bug (caster self-damage from own Fireball under FF, violating the module's own stated invariant; confirmed by probe), one MEDIUM spec divergence (L3 area boost silently dropped for the Fire special), plus minor LOW items. No CRITICAL. All findings are contained and cheap to fix; none block the CP3 designer playtest, but the HIGH should land before any FF-on balance session.

---

## CRITICAL

None found. The tunneling-safety discipline (velocity-over-ticks + `MAX_STEP_PX` clamp on knockback, projectiles, and player movement), the pre-move pushout anchor, the `alive`-only aggro predicate, the swap-remove `i--` revisit in every enemy loop, and the leveling threshold arithmetic (waves 1/3/6/8, `milestone > teamLevel` guard) are all sound (see "Checked and sound").

## HIGH

### H1 — A Fire player takes damage from their own Fireball under friendly fire
**`server/game/projectiles.js:60-67`** (`detonate`).

The module docstring in `abilities.js:13` states the invariant **"The caster is always excluded from their own ability."** Every *direct* ability honors it via `forFFTeammates` (`abilities.js:46-52`, `if (p === caster ... ) continue`). But the projectile detonation FF loop excludes only *dead* players, never the owner:

```js
if (state.settings.friendlyFire) {
  for (const p of state.players) {
    if (!p.alive) continue                 // <-- no ownerId check
    const dx = p.x - pr.x, dy = p.y - pr.y
    if (dx * dx + dy * dy > r2) continue
    damagePlayer(state, p, pr.damage, now)
  }
}
```

**Failure scenario (confirmed by probe):** FF on, an enemy in a melee scrum ~30px from the Fire player. The Fireball spawns at the caster, travels ~7px on tick 1, immediately overlaps the adjacent enemy (`hitsEnemy`), and detonates ~7–30px from the caster — inside `aoeRadiusPx = 44`. The caster eats the full `pr.damage`. Probe result: owner HP 100 → 78 from their own cast. Repeated point-blank casts can self-down the Fire player. This is exactly the point-blank melee-support pattern the kit encourages, so it will surface in real FF play.

**Why the tests miss it:** `test/game/projectiles.test.js` parks the owner `p1` at (1200,700) (`makeState`, line 20) and only asserts *teammate* splash (line 76). Caster exclusion for the projectile path is untested.

**Recommended fix:** in the FF loop, `if (!p.alive || p.id === pr.ownerId) continue`. (The enemy loop needs no change — enemies are never the owner.) Add a regression test placing the owner inside the blast radius under FF and asserting HP unchanged.

## MEDIUM

### M1 — L3 "global power boost" does not scale the Fireball's area/range
**`server/game/abilities.js:107-114`** (FIRE special) + **`shared/balance.js` `PROJECTILE.FIREBALL`**.

The Phase-4 amendment (spec line ~726) defines L3 as **"×1.3 damage AND area/range on the L1 specials."** For Earth/Water/Wind the code multiplies both the damage and the radius/range by `specialBoost(state)`. But Fire's special hands off to `spawnProjectile`, passing only `damage: Math.round(spec.damage * boost)`. `maxRangePx`, `hitRadiusPx`, and `aoeRadiusPx` are read straight from `BALANCE.PROJECTILE` inside `spawnProjectile` and are **never boosted**. So at L3 the Fireball hits harder but its blast radius and throw range stay at L1 size — a silent divergence that under-powers Fire relative to the other three at L3, and contradicts the spec's own "AND area/range" wording.

**Recommended fix:** thread the boost into the projectile spawn — e.g. pass a `boost`/`aoeRadiusPx`/`maxRangePx` override into `spawnProjectile` and apply it, or multiply `aoeRadiusPx` (and optionally `maxRangePx`) at the call site. Add a test asserting the L3 Fireball's effective AoE radius > the L1 radius.

## LOW

### L1 — An in-flight projectile freezes on screen through waveEnd + build until the next fight
**`server/game/tick.js:20` (`initFight` clears `state.projectiles`) vs `runFightSim`.**

`tickProjectiles` runs only inside `runFightSim` (FIGHT phase). Projectiles are cleared only at the *start of the next fight* (`initFight`), not at wave clear. If a Fireball is airborne when the last enemy dies (e.g. a shot that missed, or a second shot fired the same instant the killing blow lands), it stops being ticked but remains in `state.projectiles`, so it is encoded into every snapshot and the client renders a **stationary fireball dot for the whole ~8s waveEnd + ~45s build**, vanishing only when the next fight's `initFight` wipes it. Cosmetic, but visible.

**Recommended fix:** also clear `state.projectiles.length = 0` on `enterWaveEnd` (phaseMachine), or stop encoding projectiles outside FIGHT.

### L2 — Parked, non-acting bot player-entities distort Phase-4/5 playtesting (deferred-by-plan, flagged for awareness)
Bots are created as full player entities (`state.js makePlayer`, all `room.players`), but **no code drives their input** — bot AI is explicitly **Phase 6** (plan line 106-109). That is correct sequencing, *not* a Phase-4 defect. The interaction worth flagging for the CP3 designer pass: in any room with bot-filled slots, the bots stand clustered in front of the hall (`x = hallCenterX + (index-1.5)*TILE`, `y = hallTopY - 2·TILE`) as valid `alive` aggro targets that never move, never fight, and can never be revived (no teammate acts on them). Enemies will aggro onto and camp these free bodies near the hall, acting as unintended meat-shields / aggro sinks that make the undefended-town baseline *easier* than the real Phase-6 behavior. Any difficulty read taken now against a <4-human room will not transfer. No action required in Phase 4; just don't calibrate balance against bot rooms until Phase 6.

### L3 — A revive completing on the same tick as bleed-out loses to death
**`server/game/players.js:95-105`** (`tickLifecycle`). The `now >= p.downUntil → die()` check runs *before* the revive-progress check, so an enemy revive that would cross `REVIVE_CHANNEL_MS` on the exact tick the 15s bleed-out expires is preempted by death. A one-tick unfairness at the boundary; spec doesn't pin the tie. Note only — leave as-is or resolve revive-first if designers prefer.

---

## Checked and sound

I specifically tried to break the following and could not:

- **Tunneling safety.** Player movement (`moveAndCollide`), knockback (`enemyMove.integrate` / `applyKnockback`), Gale-Dash self-launch, and projectile flight all integrate velocity-over-ticks and clamp per-tick displacement to `MAX_STEP_PX` (31px < one tile). Player pushout reuses the pre-move anchor `(ax,ay)` (CP2 H1 discipline), so a knockback into a wall can't pop a body through the far face. The Gale-Dash launch-speed derivation (`dashPx·60·0.15`) is internally consistent with the 0.85 decay geometric sum.
- **Aggro / downed-player correctness.** Enemy aggro trigger, target retention, and the new contact-melee branch all gate on `p.alive === false`; `damagePlayer` independently guards `life !== 'up'`. A player downed mid-enemy-loop is immediately invisible to later enemies in the same tick (tickPlayers runs before tickEnemies). Melee priority chased-player > hall > structure matches the amendment; commit-mode enemies correctly ignore players and beeline the hall.
- **Swap-remove determinism.** Every enemy-iterating ability (`abilities.js` EARTH/WATER/WIND, `projectiles.detonate`) and `tickEnemies` decrement `store.count` on kill and `i--` to revisit the swapped-in slot; the swapped enemy always comes from an unprocessed tail index, so no enemy is hit twice or skipped. Player iteration for FF and the revive channel is over the fixed `state.players` array — deterministic.
- **Leveling thresholds.** `BALANCE.WAVES` carries `level` only at waves 1/3/6/8; `startBuildPhase` bumps `teamLevel` only when `milestone > teamLevel`, so wave 1 (L1==L1) is a no-op, `pendingLevelUp` latches only for L≥2, and `rescanCombos` fires exactly at L2. `trySecond` correctly hard-gates on `teamLevel < 4`; `specialBoost` on `>= 3`. Diagonal-combo gating (`DIAGONAL_COMBO_TYPES`, combos.js) defers Steam Vent/Grinder below L2 and retro-resolves standing pairs on the L2 milestone without a sell-and-rebuild tax.
- **Wire format & client.** `encode`/`decode` round-trip players `[id,x,y,hp,flags]`, projectiles `[id,type,x,y]`, `hh`/`lv` scalars; HP `Math.ceil`, hall `max(0,…)`. `PLAYER_FLAG` bits agree between server (`playerFlags`) and client (`SnapshotBuffer.playerSnapRule`, GameScene overlay). SnapshotBuffer interpolation never extrapolates (clamps to newest), snaps across DEAD→alive respawn and teleport-sized jumps, and interpolates local vs remote at the two delays. Input is sanitized at the socket (non-finite aim → default) and latest-wins per tick with a per-tick buffer clear.
- **Two-axis CC on players.** `ELEMENT_KIT` maps the spec's weight/speed ranks onto tiers 0–3 so Earth is displacement-immune (`KB_WEIGHT_SCALE[3]=0`) and Wind is flung far under FF; FF transmits damage + weight-scaled displacement but not statuses, per the amendment.
