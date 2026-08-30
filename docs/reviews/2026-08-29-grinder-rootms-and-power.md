# Grinder rootMs sweep, the maze split, and a power problem behind all of it

Date: 2026-08-29. Continues `docs/reviews/2026-08-29-grinder-root-position.md`.
Three questions were open: sweep `rootMs` (never swept, 2000 was simply the
requested value), check whether the maze split is really the control's swing,
and work out what a registered sweep would need.

**Headline: the maze split IS the control's and was never widened by these
changes. `rootMs` shows no resolvable dose-response above ~500ms. And the
reason so much of this session reads "positive but not resolvable" is that
every probe ran at n=144 against a project standard of n≈2990 — on maze A the
detection floor is ~0.20 and the measured effect is +0.201, i.e. sitting
exactly ON the floor. Maze A was never resolvable by these probes at all.**

## 1. The maze split is the control's, and predates the changes

Absolute hallHpAuc, shipped config:

| | maze A | maze B | drop A→B |
|---|---|---|---|
| control (two ingredients) | 7.843 | 6.652 | **-1.191** |
| Grinder (shipped) | 8.044 | 7.438 | **-0.606** |
| advantage | +0.201 | +0.786 | |

The Grinder is **worse** on maze B in absolute terms (7.438 vs 8.044). Its
advantage is larger there only because the control degrades roughly twice as
hard on the harder maze. That is a ROBUSTNESS result, not a "maze B
specialist" result, and the two get treated very differently.

The split also predates this session's work:

| config | Grinder A | Grinder B | own swing | split |
|---|---|---|---|---|
| base (pre-2026-08-29) | 7.803 | 7.184 | 0.619 | 0.571 |
| shipped (core root) | 8.044 | 7.438 | 0.606 | 0.585 |
| rejected (edge root) | 7.834 | 7.834 | **0.000** | **1.191** |

Base split 0.571 vs shipped 0.585 — unchanged. **These changes did not widen
the split.**

The rejected edge-root config is the interesting row: it scored *identically*
on both mazes, so its own swing was exactly zero and its entire apparent
split (1.191) was the control's swing and nothing else. The configuration
that produced this session's most eye-catching number (+1.182) was the one
whose advantage was purely an artifact of the control collapsing. It was
rejected on other grounds (`docs/reviews/2026-08-29-grinder-root-position.md`);
this is a second, independent reason it was the wrong pick.

## 2. rootMs sweep — no resolvable dose-response above ~500ms

`test/harness/archive/grinderRootMs.js`, shipped geometry (rootRadiusPx 55,
contactDps 20 @160), 72 seeds x 2 postGaps x 2 mazes:

| rootMs | maze A | maze B | landing A / B |
|---|---|---|---|
| 0 | +0.107 (t 0.93) | +0.738 (t 4.88) | 11.3% / 40.1% |
| 500 | +0.170 (t 1.42) | +0.805 (t 5.27) | 10.7% / 43.9% |
| 1000 | +0.201 (t 1.74) | +0.800 (t 5.30) | 10.9% / 44.7% |
| **2000 (shipped)** | +0.201 (t 1.73) | +0.786 (t 5.22) | 11.0% / 43.8% |
| 3000 | +0.206 (t 1.77) | +0.765 (t 5.04) | 10.9% / 43.0% |
| 4000 | +0.209 (t 1.79) | +0.779 (t 5.16) | 10.8% / 43.3% |

**Zero hangs at every dose, including 4000ms** — double the shipped hold. The
soft-lock concern that justified the one-root-per-crossing rule is cleared
with real margin, which is worth having on record.

The point estimates plateau immediately: everything from 500 to 4000 is flat
within 0.04 (maze B) and 0.04 (maze A). **2000ms measures identically to
1000ms.** It is not harmful, it is simply not doing more.

CAVEAT, and it is the important one: every dose-to-dose difference here is
BELOW the detection floor of this n (see §3). "Plateau" describes the shape
of the point estimates. It is not a resolved finding, and nobody should
retune `rootMs` off this table.

## 3. The power problem behind the whole session

The registered prereg this project already keeps for this exact family
(`test/harness/prereg/fusion-r2-grinder.json`) declares `nRequired: 2990`,
from measured paired-delta sigmas of ~0.87 (maze A) and ~1.41 (maze B).
**Every probe in this session ran at n=144.**

Unadjusted paired-t detection floor, MDE = 2.80 x sigma / sqrt(n):

| | sigma | floor at n=144 | floor at n=2990 | measured effect |
|---|---|---|---|---|
| maze A | ~0.87 | **~0.203** | ~0.045 | **+0.201** |
| maze B | ~1.41 | ~0.329 | ~0.072 | +0.786 |

(The prereg's own 2990 is higher than a naive calculation because it also
carries the BH multiplicity correction across a declared family of 36. These
floors are therefore optimistic, not conservative.)

Maze A's measured effect is +0.201 against a floor of ~0.203. **It sits
exactly on the detection limit.** "Positive but t 1.73, not resolvable" was
never weak evidence — the probe was structurally incapable of resolving an
effect that size, real or not. Maze B at +0.786 clears its floor by 2.4x,
which is why it came back clean at the same n.

The same arithmetic condemns two smaller claims made earlier in the session:

- **The root's marginal value on top of contact damage is UNRESOLVED.**
  Contact alone reads +0.107 (A) / +0.738 (B); both together +0.201 / +0.786.
  Root's marginal contribution is +0.094 (A) and +0.048 (B), both far below
  their floors. Contact damage is doing the visible work; the root is
  positive in point estimate and unproven.
- The rootMs plateau in §2, as already noted.

## 4. What this means for the shipped config

Nothing changes, and that is deliberate:

- `rootMs: 2000` stays. It sits on a plateau, it is Philip's requested value,
  and there is no resolvable evidence any other value is better. **1000ms
  measures identically** — worth knowing if a shorter hold is ever wanted for
  feel rather than for numbers.
- Everything else stands: `rootRadiusPx: 55`, `contactDps: 20`,
  `contactRadiusPx: 160`. Suite 914/0/2.

## 5. The one thing worth doing next, and how

A registered sweep at n=3000 would settle maze A and the root's marginal
value, and by the existing prereg's own note it costs roughly **4 minutes**
of compute (12,000 runs). That is a far better use of time than any further
n=144 probing, which cannot resolve either question no matter how many times
it is repeated.

Hard constraint, confirmed at `test/harness/bench/analyze.mjs:171`:
`registeredAt` must be strictly EARLIER than the earliest run's `startedAt`,
or `loadRegistration` returns `post-registered` and the verdict does not
count. It does not throw — an invalid or late prereg degrades quietly into a
descriptives dump. **Write the prereg, commit it, then run.** Never the
reverse.

A new family is needed rather than reusing `fusion-r2-grinder`: that prereg
registers the OLD mechanic, and its `registeredAt` (2026-08-16) predates
these changes, so running new records against it would be comparing a
retuned structure to a question asked about a different one.
