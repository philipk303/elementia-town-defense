# Task 20 balance sweep, step 1 — paste this into a new session

Branch `codex/redesign-reconciliation`, current HEAD `e35dd27`. Suite
611/609/2 skipped, `npm run build` clean.

## Why this session exists

The staged combat redesign program (`docs/superpowers/plans/
2026-07-26-staged-combat-redesign-program.md`) has all 17 gameplay tasks
complete — every character basic, every structure, all six fusions
(Firestorm/Volcano/Blizzard/Muddy Bog/Grinder/Steam Vent), and the client
animation controller. Task 18-19 (real art/audio) are next in the plan's
file order but are blocked on the art pipeline, not on you. Task 20 (balance,
profile, ship by evidence) is sequenced *after* 18-19 in the plan file, but
its own stated reason for that order — "once the sim's defence resembles the
played one" — is already true now that Tasks 1-17 are done. Balance numbers
don't depend on sprite art.

**This is a scope/sequencing call, not yet ruled on.** Confirm with Philip
before starting that running Task 20's harness-only work now, ahead of its
plan-file position, is wanted. Don't assume silence means yes.

## What's actually stale

The last tower baseline (`docs/reviews/2026-08-01-tower-baseline-retake.md`)
was taken right after Task 13 (fusion *consent/lifecycle*) landed — before
Tasks 14, 15, and 16 gave the fusions their real behaviors. That baseline
measured fusion as an inert placeholder, not as Firestorm/Volcano/Blizzard/
Muddy Bog/Grinder/Steam Vent actually doing anything. **The complete six-
fusion roster has never been measured together.** That is the actual gap
this session should close first, before any broader Task 20 matrix work.

## Scope for this session — step 1 only

Do NOT attempt Task 20's full checklist in one pass (it spans open/packed/
split-lane matrices, elite mixes, per-character output metrics, bandwidth/
frame-time profiling, and a four-player readability session that needs real
humans). That's the whole remaining program, not one session's work. Do this
first increment:

1. **Hang-gate regression, full roster.** Run the hard maze A and maze B
   144-match hang gates with the harness able to reach every fusion, not
   just the EARTH-human default (which always builds MAGMA_TRAP/Volcano).
   `test/harness/matchRunner.js`'s `fuseWith` option (opt-in, default null)
   pins which partner element is tried — read the comment above its use
   (~line 241) before driving it; `comboFormed` on the result record tells
   you which fusion actually landed, so you can confirm you measured what
   you intended, not silently fell through to the default.
   ```
   npm run probe -- --dial __NULL_DIAL --values 0 --maze A --profile shipped
   npm run probe -- --dial __NULL_DIAL --values 0 --maze B --profile shipped
   ```
   Report per-fusion hang counts, not just an aggregate 0/144 — an aggregate
   can hide one fusion at 0/144 masking another at 12/144, the same
   "acceptance CONTROL measuring the wrong thing" failure mode this project
   has hit before (see `elementia-spawn-grid-artifact` memory).

2. **Tower baseline retake, full roster.** Follow the same protocol as the
   2026-08-01 retake (`docs/reviews/2026-08-01-tower-baseline-retake.md`) —
   read it first, reuse its method, don't reinvent it. Extend it to cover
   all six fusions, not just the one the default policy reaches. Compare
   each fusion at equal gold against the Watchtower anchor, per Amendment
   A1.4's two clauses (niche floor >= 1.0 *in its designed scenario*,
   declared in advance; no strict domination on every axis at once) — not
   "every tower should be equivalent."

3. **Declare scenario and skill dependency BEFORE measuring**, per Philip's
   explicit ruling on this exact point (session 7, `elementia-phase8-plan`
   memory): the scripted human never re-sites, so for any structure whose
   value depends on positioning (most of them — Snare Post, Geyser, Vortex,
   Rock Trap, Blizzard, Grinder), a sub-1.0 number measures the POLICY, not
   the structure. Write down each structure's intended scenario and whether
   this harness can honestly test it before running the sweep, not after
   seeing a bad number.

4. **Hang imputation + split-half on every claim.** This project's
   instrument has been wrong in exactly this spot four separate times
   (see `elementia-baseline-review-lessons` memory) — a result that doesn't
   survive worst-case hang imputation or doesn't replicate split-half is not
   a result. `probe.js`'s `METRICS` table already does this generically;
   don't hand-roll a shortcut.

## What NOT to do

- Don't tune any balance numbers. This step is measurement only. If a
  structure fails Amendment A1.4, report it — the ranked-options-then-ask
  pattern this project has used every time a falsification test fired
  (Firepit, session 7) is the model to follow, not a unilateral fix.
- Don't touch client/art code. Nothing in this step needs it.
- Don't skip declaring skill dependency to save time — the Firepit
  falsification test (`docs/reviews/2026-07-25-firepit-falsification-test.md`)
  is the cautionary example of what happens when a scenario claim goes
  unverified: two instrument defects had to be found and fixed before that
  verdict could be trusted at all.

## Context you'll need

- `docs/superpowers/plans/2026-07-26-staged-combat-redesign-program.md` —
  Task 20's full checklist (only step 1 above is in scope this session).
- `docs/reviews/2026-08-01-tower-baseline-retake.md` — the baseline this
  session extends; reuse its method.
- `docs/reviews/2026-07-25-firepit-falsification-test.md` — the precedent
  for what a rigorous single-structure falsification test looks like, and
  the two instrument defects that had to be fixed first.
- `elementia-phase8-plan` and `elementia-baseline-review-lessons` memory
  files — the accumulated instrument lessons; don't re-derive them, read them.
- `test/harness/probe.js` header comment — full CLI flag reference.
- `test/harness/matchRunner.js` ~line 200-260 — the fusion-build policy,
  `fuseWith`/`fuseWave` options, and why the default is deliberately dumb.

## Output

A dated review doc under `docs/reviews/`, same format as the existing
baseline retake: per-fusion hang counts (both mazes), per-fusion power-unit
comparison against Watchtower with hang-imputed t and split-half rho, and an
explicit list of which structures' numbers are trustworthy vs. which are
policy-confounded per point 3 above. End with ranked recommendations, not a
unilateral balance change — same pattern as every prior sweep in this
project. If nothing needs fixing, say so plainly.

**Recommended model: Sonnet 5** — this is harness-driven measurement work,
same tier as Tasks 1-16's non-hot-loop increments, not new instrumentation
design. Escalate to Opus only if a genuinely ambiguous instrument question
comes up that the existing lessons don't already answer.
