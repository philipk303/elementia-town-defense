# Handoff — Muddy Bog: decouple its damage from its own root

Date: 2026-08-28. Written at the end of the session that retuned the whole fusion
roster (`2df06eb`). Suite at handoff: **895 pass, 0 fail, 2 skipped.** Working
tree clean except `tools/art/ground_pipeline.py`, which is unrelated art work.

---

## READ THIS FIRST

**Muddy Bog is the one fusion that no dial fixes, and the reason is structural,
not numerical.** Do not open this by turning another number. Five separate levers
were measured to exhaustion in the previous session and the write-up
(`docs/reviews/2026-08-28-fusion-roster-worth-retune.md`) records every one.

**A second warning, about a wrong idea that will come back.** A research pass
suggested our metric is "structurally blind" to Bog's value, on the theory that
Bog's real contribution is helping *neighbouring* towers land hits, and that a
per-structure damage ledger cannot see that. **That is false for this project.**
`hallHpAuc` is a global measure — hall HP integrated over the waves — not
per-source attribution. If Bog helped its neighbours kill things, the hall would
take less damage and the metric would show it. Bog's assist value is already
being measured, and it is already negative on maze B. Do not build an
"enabled damage" metric to rescue Bog. (Per-source damage ledgers were separately
proven invalid here anyway — damage is conserved.)

---

## The defect, and its mechanism

Against the two structures it consumes (an unfused Rock Trap + Water Geyser),
Muddy Bog measures:

| | maze A | maze B |
|---|---|---|
| before the roster retune | +0.028 | **−0.473** |
| after (`pulse.damage` 3 → 12, shipped) | +0.079 (t 4.1) | **−0.147** (t −5.3) |

Still a penalty on maze B. Building it there is a mistake for the player.

**The mechanism, found by reading the code rather than guessing.** In
`server/game/structureBehaviors/areaEntry.js`, an enemy only enters the pulse
list (`s.bgRooted`) if **this structure** actually rooted it:

```js
applyRoot(status, baseMs, speedTier, s.id)
if (status.rootSourceId === s.id && status.rootMs > 0) {
  s.bgRooted.set(id, now)
}
```

The pulse loop then damages only what is in `s.bgRooted`, and drops an enemy the
moment `rootSourceId !== s.id || rootMs <= 0`. So:

- **With root disabled the bog deals literally zero damage.** This was measured,
  not inferred: the `bog-root0` and `bog-dmg12root0` arms differ only by a 4x
  pulse-damage increase and produced **bit-identical results in all 3000 cells**,
  on differing config hashes. Quadrupling its damage changed nothing, because
  with no root the damage code never runs.
- Therefore `total damage ≈ root uptime × tick damage`, and **both factors
  saturate independently**, which is exactly what the sweeps found.

## What was already tried, and must not be re-tried

| lever | result |
|---|---|
| `pulse.damage` 3 → 6 / 12 / 18 | maze B −0.186 / −0.147 / −0.177 — saturates, and 18 is worse than 12 |
| `root.msByWeight` 2x / 3x | maze B −0.228 / −0.184 / −0.183 — saturates too |
| removing `lingerSlow` | bought 0.014 |
| removing root entirely | maze B −0.383, and damage stops completely |
| the four roster-wide hypotheses (throughput, coverage, control-effects, footprint/sites) | all refuted, see the review |

## The change to make

**Decouple the pulse damage from the root.** Let the bog's tick damage apply to
everything inside its footprint, rooted or not; leave the root as pure crowd
control. This removes the multiplicative ceiling rather than tuning around it.

Design decisions the next session must actually make, not assume:

1. **Does the root stay at all?** Recommended yes — removing it was measured and
   was much worse (−0.383). It is doing real work; it just should not be the
   gate on damage.
2. **What happens to `bgRooted`?** It currently serves double duty: the pulse
   list *and* the bookkeeping that applies `lingerSlow` when a root expires.
   Decoupling damage must not accidentally delete the linger-slow behaviour.
3. **Does an enemy rooted by a *different* bog take this bog's damage?** Under
   the current code, no. After decoupling it would, if it is inside the
   footprint. That is probably correct, but it is a behaviour change worth
   stating in the commit rather than discovering later.
4. **Re-tune `pulse.damage` afterwards.** 12 was chosen under the old gating and
   will almost certainly be too strong once every enemy in the footprint takes
   it continuously. See the playtest note below — 12 already one-shots a goblin.

## How to measure it

Copy the existing spec pattern. The arms you need are a `bog-unfused` control
(`fuse: false, partnerSpecial: "WATER"`, `humanElement: "EARTH"`) and one fused
arm per candidate damage value. Protocol used throughout this work:

```
spendDown: true, maxWaves: 10, humanElement: "EARTH", defence: "WATCHTOWER",
defenceCap: null, legacySiting: false, specialSiting: "funnel",
freeSpecial: true, fuse: true, fuseWith: "WATER", fuseWave: 4
```

750 seeds x 2 mazes x 2 postGaps = 1500 cells per arm. Read it as a **paired
contrast on identical seeds**: fused minus unfused, per maze, with a t statistic.
Do not use `analyze.mjs --option-set` for this; it is a plain two-arm question and
the option-set estimator is under a registered hold.

**The bar to beat: maze B better than −0.147, ideally ≥ 0, without maze A
regressing below +0.079.**

## Five traps that cost time in the previous session

1. **`resolveDial` refuses to create new balance keys** (a typo guard). A dial is
   only sweepable via `balanceOverrides` if it already exists in
   `shared/balance.js`.
2. **`test/harness/matchRunner.test.js` wraps `runMatch` with
   `legacySiting: true`** to reproduce the historical instrument. A probe script
   that omits it gets different numbers and looks like a phantom test failure.
3. **`configHash` includes the git sha.** Committing between sweeps invalidates
   exact resume, and appending two engine identities into one store silently
   pools them. Commit *before* sweeping, and use a fresh store file after a
   commit.
4. **Launch sweeps from a clean tree.** A dirty tree stamps every record
   `dirty: true` permanently and the standard analyser then refuses without
   `--allow-mixed`.
5. **When a balance change makes a test fixture non-viable** (enemies now die too
   fast to observe the mechanic), wrap the damage-*independent* mechanic tests in
   a `withHistoricDamage(...)` helper that always restores, and add a separate
   test pinning the shipped dial. **Never relax an assertion to make it pass.**
   `test/game/muddyBog.test.js` already does this; follow the existing pattern —
   six of its tests are wrapped and will need re-checking after this change.

## Status of everything else

- **Five of six fusions are done** and committed at `2df06eb`. Magma Trap
  +0.291/+0.381, Steam Vent +0.061/+0.409, Firestorm +0.009/+0.321, Blizzard
  −0.064/+0.801, Grinder unchanged at −0.035/+0.546. **Leave Grinder alone** —
  every intervention measured worse.
- All of it is **exploratory and unregistered**: no prereg, no BH correction, no
  verdict gates. It carries no registered claim, and the write-ups say so.
- **The option-set / A1.4(a) thread is parked**, with `option-set-pilot`'s maze-A
  estimator numbers formally held as unread after the positive control failed
  twice. See `docs/reviews/2026-08-27-option-set-procedure-check-result.md`.
  Nothing in the Bog work depends on it.

## The playtest that keeps not happening

Six structures changed materially in two days and **no human has played any of
it**. Bog's pulse damage is now exactly a goblin's HP (12), so the basic enemy
dies to its first pulse — a large change in feel that no metric here can judge.
Every simulated run still ends in a loss, and that loss rate is a property of the
scripted bot, not a readout on difficulty. Consider playtesting *before* or
*immediately after* this change rather than continuing to tune blind.

---

## Recommended setup

- **Model: Opus 5.** The edit is small but the session must decide whether the
  mechanism should change, handle the `bgRooted` double duty without dropping
  `lingerSlow`, and then read a result that five previous hypotheses got wrong.
  Counter-argument, stated fairly: with a spec this tight, Sonnet 5 could execute
  it and save budget. Your call.
- **Subagents: none.** One sequential thread — edit, sweep, read.
- **Review: yes, engineer/code, Opus 5.** This changes shipped combat behaviour
  and invalidates tests that encode the current contract. **Tell the reviewer to
  recompute the headline numbers independently from the raw records rather than
  trusting any probe script** — that exact instruction caught a fatal error twice
  in the previous session.

## Next-session prompt

```
Resume the Elementia balance work. Read these first, in order:
  docs/handoffs/2026-08-28-muddy-bog-decouple.md   (this file — read the
    "READ THIS FIRST" section before anything else)
  docs/reviews/2026-08-28-fusion-roster-worth-retune.md   (what was tried)
  server/game/structureBehaviors/areaEntry.js             (the mechanism)

Goal: Muddy Bog is the one fusion no dial fixes. It measures -0.147 (t -5.3) on
maze B against the two structures it consumes, so building it there is a mistake.
Its damage is entirely gated behind its own root, so total damage = root uptime x
tick damage and both factors saturate.

Do: decouple the pulse damage from the root — let it damage everything inside its
footprint, keep the root as pure crowd control — then re-tune pulse.damage (12 was
chosen under the old gating and will likely be too strong). Preserve the
lingerSlow behaviour, which currently rides on the same bgRooted bookkeeping.

Measure it as a plain paired contrast, fused minus unfused on identical seeds,
750 seeds x 2 mazes x 2 postGaps, per the spec pattern in the handoff. The bar:
maze B better than -0.147 and ideally >= 0, without maze A dropping below +0.079.
Do NOT use analyze.mjs --option-set; that estimator is under a registered hold.

Do not re-try damage scaling, root-duration scaling, removing lingerSlow, or
removing the root — all four are measured and recorded in the review. And note:
hallHpAuc is a GLOBAL hall-HP measure, not per-source attribution, so Bog's
"assist" value is already visible to it. Do not build a new metric to rescue Bog.

Setup: Opus 5 (the edit is small but the mechanism decision and the result-reading
are judgement-heavy; Sonnet 5 could execute it if you prefer). No subagents — one
sequential thread. Adversarial code review afterwards with Opus 5, and tell the
reviewer to recompute the headline numbers independently from the raw records
rather than trusting any probe script.
```
