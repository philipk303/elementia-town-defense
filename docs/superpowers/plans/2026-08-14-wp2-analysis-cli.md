# WP2 Analysis CLI Implementation Plan

> **For agentic workers:** Execute inline with strict red/green TDD. Do not commit; the WP2 brief explicitly requires a dirty tree for review.

**Goal:** Add deterministic inferential primitives and a store-only analysis CLI whose verdict gates cannot be bypassed and whose power diagnostics cannot be omitted.

**Architecture:** Extend `stats.js` additively, then build `analyze.mjs` as an importable analysis module with a thin command-line entry point. Validate and deduplicate records before grouping; analyze each immutable engine/balance band independently; render the same structured result as terminal text or JSON.

**Tech Stack:** Node.js 20 ESM, built-in `node:test`, built-in filesystem/process modules, existing `mulberry32` RNG.

**Spec:** `docs/plans/2026-08-14-balance-harness-v2-spec.md` sections 0–3 plus the approved WP2 brief.

## Global Constraints

- Do not modify the simulation, runner contract, protocol, scenarios, or archived files.
- `stats.js` changes are additive only and use known-answer tests.
- Analysis imports `record.js` and `stats.js`, never `matchRunner.js`, and never runs a simulation.
- Missing/invalid/post-dated preregistration, undeclared cells, mixed data, corrupt duplicates, or asymmetric pairs cannot silently receive a verdict.
- BH uses the preregistered `familySize`; missing tests are represented by `p=1` so the correction cannot narrow post hoc.
- Synthetic fixtures only; no benchmark simulation in tests.

---

### Task 1: Deterministic statistics primitives

**Files:** Modify `test/harness/stats.test.js` and `test/harness/stats.js`.

**Interfaces:** Produce `benjaminiHochberg(pValues)`, `bootstrapCI(deltas, options)`, `mde(sigma, n, options)`, and `splitHalfRho({ first, second })`.

- [x] Add literal known-answer tests for BH, a constant bootstrap interval, default MDE, and replicated/scrambled split halves; add deterministic bootstrap and `requiredN` round-trip assertions.
- [x] Run `node --test test/harness/stats.test.js` and confirm failure because the exports do not exist.
- [x] Implement only the four additive exports, importing `mulberry32` from `shared/rng.js` and citing archived `probe.js` for split-half logic.
- [x] Re-run the focused statistics tests and confirm they pass.

### Task 2: Store analysis and safety gates

**Files:** Create `test/harness/bench/analyze.test.js` and `test/harness/bench/analyze.mjs`.

**Interfaces:** Produce `analyzeRecords(records, options)`, `analyzeStore(path, options)`, `renderText(result)`, and the CLI flags `--store`, `--family`, `--metric`, `--json`, `--allow-mixed`.

- [x] Add synthetic fixture tests for missing preregistration, undeclared metrics, post-registration, corrupt duplicate IDs, mixed versions, and a known paired effect whose deterministic CI brackets the truth.
- [x] Run `node --test test/harness/bench/analyze.test.js` and confirm failure because the analyzer is absent.
- [x] Implement JSONL parsing, record validation, schema-driven prereg validation, timestamp checks, metric derivation, dedupe/integrity diagnostics, immutable version bands, explicit pairing, Student-t p-values, BH padding, bootstrap intervals, hang imputation, split halves, MDE, and gate evaluation.
- [x] Implement 120-column text rendering with raw p/q side by side, loud exploratory/version/corruption/power/ceiling warnings, verbatim decision rules, and explicit unavailable declared metrics.
- [x] Re-run the focused analyzer tests and fix only observed failures.

### Task 3: End-to-end verification

**Files:** No new production interfaces.

- [x] Run the CLI against a scratch unregistered store and assert the text contains `EXPLORATORY — NO VERDICT` and no `PASS`/`FAIL` token.
- [x] Run the CLI against a scratch registered store and assert it prints every standard gate plus their conjunction.
- [x] Run `npm test` and require zero failures after the final review fixes.
- [x] Inspect the final diff for forbidden-file changes and report all judgment calls and any unresolved specification defect.
