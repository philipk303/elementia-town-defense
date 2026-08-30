# Spec — a difficulty-scale metric for balance verdicts

Date: 2026-08-26. Author: Opus 5. Status: PROPOSED, not implemented.
Supersedes nothing. Extends the v2 harness (`test/harness/`), does not replace it.

---

## 0. A correction to my own framing, up front

I first pitched this as "the outcome metric is censored, so replace it with a
staircase." **The censoring half of that is out of date and I am withdrawing
it.** It described `score` on the v1 corpus (`docs/reviews/2026-08-14-metric-selection-v1-result.md`,
all 2880 runs lost, `hallHpFrac` 0.000 everywhere). Under **R2**
(`spendDown: true`, `maxWaves: 10`, `fuse: false`) with `hallHpAuc`,
`docs/reviews/2026-08-15-regime-r2-adoption.md` reports **0% of control runs at
the observed maximum on either maze**, a monotone four-rung ladder, and
resolvable deltas in both directions. That instrument is uncensored and live.

So this spec is **not** a rescue. The defect it targets is narrower and real:

> `hallHpAuc` has no units anybody can make a design decision in, and it is only
> comparable inside one frozen regime. "Magma Trap is +0.222 hallHpAuc" does not
> tell you whether to ship it, cut it, or buff it by how much. Every regime change
> re-bases every number, which is a large part of why this project's verdicts keep
> being re-derived.

The fix is a **change of units, not a change of instrument**: express every
effect as "how much extra enemy HP the defence can now absorb." That number is
regime-portable, designer-legible, and derived from the corpus you already know
how to produce.

---

## 1. The one engine change

A single global difficulty dial. `shared/balance.js`, inside the existing
`BALANCE.ENEMY` block:

```js
ENEMY: {
  // ...
  HP_MULT: 1,   // global difficulty dial. 1 = shipped. Measurement-only knob.
}
```

Applied at exactly one site, `server/game/enemies.js:84`:

```js
this.hp[i] = this.maxHp[i] = cat.hp * (elite ? E.ELITE.hpMult : 1) * E.HP_MULT
```

**Why inside `BALANCE.ENEMY` and not a new top-level `BALANCE.DIFFICULTY`:**
`enemies.js:34` aliases `const E = BALANCE.ENEMY` at module load. Child processes
in `run.mjs` apply `balanceOverrides` in the `init` handler *before* the dynamic
`import('../matchRunner.js')`, so either placement happens to work today — but
putting the dial on an object that is already aliased keeps it correct if that
import order is ever changed. `resolveDial(BALANCE, 'ENEMY.HP_MULT')` resolves
against the existing path machinery with no change to `scenarios.js`.

**Why HP only, and not HP + damage:** the dial must be one-dimensional or the
"exchange rate" in §2 is not a rate. Scaling damage as well would move both the
defence's workload and the hall's clock at once, and the resulting slope would
not be attributable. HP alone raises time-to-kill, which is what a defence is
being asked to supply. This is a deliberate limitation — see §6.1.

**Why `1` and not absent:** an absent dial defaulting to 1 inside a `??` is a
dial `resolveDial` cannot see, and `resolveDial` throwing on an unresolvable
path is the guard that stops a typo'd sweep from silently measuring the shipped
value. The default must be a real key.

Cost: one line of engine, one key, plus guard tests. `balanceHash` changes,
which correctly marks every prior corpus as pre-dial — no old record is
invalidated, but none may be pooled with new ones.

---

## 2. Mechanism A (PRIMARY) — the calibration slope

Measure once how much `hallHpAuc` one point of difficulty is worth. Then every
existing and future paired delta divides through by it.

### 2.1 The family

Family `difficulty-calibration-v1`. One arm per rung, control configuration
only (pure Watchtower, R2, `fuse: false`, `humanElement: EARTH`, isolated
siting), fresh seeds.

| arm | `ENEMY.HP_MULT` |
|---|---|
| `hp-085` | 0.85 |
| `hp-0925` | 0.925 |
| `hp-100` | 1.00 (registered reference) |
| `hp-1075` | 1.075 |
| `hp-115` | 1.15 |

Mazes A and B. n = 1500 paired seeds per cell (both `postGap` values, per the
existing scenario matrix). **15,000 runs**, roughly 7 minutes at 11 workers.

Rungs are deliberately tight and symmetric around 1.0. This is a *local* slope;
it is not trying to reach the breaking point.

### 2.2 The estimator

Per maze, per seed-cell, regress that cell's `hallHpAuc` on `HP_MULT` — a
**within-seed** slope, so the seed pairing this project has already been burned
by losing once (`classify()`, 2026-08-04) is preserved by construction. Then:

- `beta` = mean of the within-cell slopes, in hallHpAuc per unit HP_MULT.
  Report per 1% as `beta / 100`.
- 95% CI on `beta` by bootstrap over seed-cells, reusing `stats.js:bootstrapCI`.
- Report `R2_lin`, the share of within-cell variance the linear fit explains, and
  the mean residual at each rung.

### 2.3 The exchange rate

For any arm already measured against a control under R2 with `hallHpAuc`:

```
difficultyEquivalent%  =  100 * delta_hallHpAuc / beta
CI                     =  propagated from both bootstrap CIs (delta and beta)
```

Read as: *"this fusion lets the defence survive X% more enemy HP."*

This is a **pure post-hoc transform of an already-registered number.** It adds no
comparison, no test, no multiplicity. It must be reported *beside* the raw delta,
never instead of it, exactly as `analyze.mjs` already reports raw p beside BH q.

### 2.4 What this immediately buys

- The five `fusion-r2-*` families and `maze-split-mechanism` (36,000 runs,
  engine `5005dc1`) become re-readable in difficulty units **with no new runs**,
  provided `beta` is measured on the same engine or the engine delta is shown to
  be inert. Register that check before claiming it.
- `stats.js:mde` becomes a design statement: "at n = 3000 this harness can see a
  2.1% difficulty change" is a sentence a designer can act on. "sigma 1.1 on
  hallHpAuc" is not.
- Regime portability: re-measuring `beta` under a new regime re-bases everything
  in one 15,000-run family instead of re-running every verdict family.

---

## 3. Mechanism B (SECONDARY) — the staircase, and its precondition

Mechanism A assumes local linearity. Mechanism B does not, and gives the
headline number — the **critical difficulty** `d*`, the `HP_MULT` at which a
configuration is at the edge of failing.

### 3.1 Gate this behind a probe. Do not build it first.

`d*` needs a *threshold* to bisect on. The obvious one is a 50% loss rate, and
**I do not know the control's loss rate under R2 at `HP_MULT = 1`.** No published
review reports it; the R2 adoption review reports `hallHpAuc` ladders, not win
rates. If the control loses ~100% of runs at 1.0 (the v1 corpus did, under a
different regime), a win-rate bisection is degenerate at the shipped value and
`d*` would land far below 1.0, measuring a game nobody plays.

**Precondition probe, 600 runs, roughly 15 seconds:** control config, R2, both
mazes, `HP_MULT` in {0.7, 1.0, 1.4}, n = 100. Report `won` / `lost` / `stalled` /
`timedOut` share per cell.

- Loss rate at 1.0 strictly inside **[0.15, 0.85]** — build the win-rate
  staircase as specified below.
- Outside that band — **do not build the staircase.** Switch the bisection
  target to "median `hallHpAuc` equals the registered reference cell's median",
  which is well-defined at any win rate, and record that substitution in the
  prereg as a pre-committed branch, not a post-hoc rescue.

### 3.2 The staircase, if the probe allows it

Bisection on `HP_MULT` over `[0.5, 3.0]`, 7 steps, final bracket width about
0.02 (2% difficulty). n = 300 paired seeds per step. **2,100 runs per
configuration per maze**, versus 3,000 for one fixed-difficulty cell today.
Steps are sequential (adaptive), but the 300 runs inside a step parallelise
normally.

`d*` is reported with a CI from the binomial uncertainty at the final two
brackets. Two configurations are compared by the difference of their `d*`, which
requires a paired seed set shared across both staircases — register that.

### 3.3 Which to build

**Build A. Treat B as optional.** A is a 15,000-run family plus an analyser
function, and it re-reads 36,000 existing runs; B is new orchestration
(adaptive, stateful, resumable — the store is append-only with exact resume, and
a half-finished staircase is a resume case that does not exist today). A
delivers most of the interpretability at a small fraction of the build risk.
Build B only if A's residuals show the response is materially non-linear across
the rungs.

---

## 4. Files touched

| file | change |
|---|---|
| `shared/balance.js` | `ENEMY.HP_MULT: 1` |
| `server/game/enemies.js:84` | multiply by `E.HP_MULT` |
| `test/harness/bench/analyze.mjs` | `--calibration <beta>` flag; prints a difficulty-equivalent column beside every delta. No new comparison, no new test. |
| `test/harness/prereg/difficulty-calibration-v1.json` | the family, its five adoption criteria (§5), and the §3.1 branch |
| `test/game/` | dial-default guard test (shipped value is 1); a red-green test that `HP_MULT = 2` doubles spawned `maxHp` for both base and elite |
| `docs/reviews/2026-08-26-difficulty-calibration-v1-result.md` | the result |

**Not touched:** `matchRunner.js`, `protocol.js`, `record.js`, `store.js`,
`stats.js`. The dial is a `balanceOverrides` value, which those layers already
carry, hash, and persist. If this spec starts requiring changes there, something
has been mis-scoped.

---

## 5. Adoption criteria for `beta` (pre-register before running)

1. **Monotone** — mean `hallHpAuc` strictly decreasing across all five rungs on
   both mazes, no inversions.
2. **Resolvable at the extremes** — `hp-085` and `hp-115` both differ from
   `hp-100` at BH q < 0.05 with the sign test agreeing.
3. **Linear enough to divide by** — `R2_lin` at or above 0.9 within-cell, and no
   rung's mean residual exceeding 20% of the total rung-to-rung step.
4. **Uncensored** — under 10% of runs at the observed `hallHpAuc` max or min in
   every cell, per the R2 adoption bar.
5. **Precise enough to be worth having** — `beta`'s 95% CI half-width under 15%
   of `beta`. A slope known to plus-or-minus 40% turns every converted delta into
   a range too wide to decide on, and would be worse than the raw number it
   replaces.

`beta` is measured and reported **per maze**. Pooling the two mazes is
prohibited: `maze-split-mechanism` established that the control's own maze swing
is large, and a pooled slope would smear exactly that.

### `whatWouldRefute`

If criterion 1 or 3 fails, the response is not linear and Mechanism A is dead —
go to Mechanism B or keep raw `hallHpAuc`. If criterion 5 fails, raise n before
raising the rung spacing; wider rungs buy precision by assuming more linearity,
which is the assumption under test.

---

## 6. Known limitations, stated before anyone finds them

1. **HP-only is not "difficulty."** It does not touch spawn rate, composition,
   elite share, or enemy damage. A fusion whose value is about crowd control
   rather than time-to-kill will convert at a slope that flatters or penalises
   it. The unit must always be written as **"% enemy HP," never "% difficulty."**
2. **The slope is measured on the control and applied to arms.** If an arm's
   response to difficulty has a different slope, the conversion is first-order
   only. This is checkable later — run the calibration ladder inside one fusion
   arm and compare slopes — and is not checked by this spec.
3. **This does not fix the arbitrary-control problem.** The 2026-08-16 finding —
   that 58–96% of each fusion's maze split is its control's swing — is a *design*
   defect, not a units defect, and survives this spec untouched. It needs the
   option-set / best-response framing, which is a separate spec and is the larger
   of the two pieces of work.
4. **It cannot say whether anything is fun.** Viability and dominance only.

---

## 7. Success criteria

Done when, in one sitting:

- `ENEMY.HP_MULT` exists, is guarded by a red-green test, and defaults to shipped.
- `difficulty-calibration-v1` has run (15,000 runs), registered `valid`, and is
  graded against all five criteria of §5 in a committed review.
- `analyze.mjs --calibration` prints a difficulty-equivalent column beside the
  raw delta on the existing `fusion-r2-*` store, and at least one previously
  published fusion verdict is restated in "% enemy HP."
- The §3.1 probe has run and the staircase branch is decided in writing.

Failing the criteria is a valid outcome and must be published as one. This
project's recurring failure mode is a number adopted before its instrument was
graded; §5 exists to make that impossible here.
