# Elementia Town Defense — Slice 1 Status Ledger

**Purpose:** Compact source of truth for completed phases, current work, accepted SHAs, review gates, and the next authorized action. Update this ledger at each gate; do not restate full implementation instructions here.

## Authoritative plans

- Master roadmap: `docs/plans/2026-07-18-slice1-implementation-plan.md`
- Combat redesign: `docs/superpowers/plans/2026-07-26-staged-combat-redesign-program.md`
- Graphics pipeline: `docs/plans/2026-07-24-art-asset-generation-pipeline.md`
- Audio pipeline: `docs/plans/2026-07-26-audio-asset-pipeline.md`

## Current status

| Phase | Status | Accepted/anchor SHA | Review | Notes |
|---|---|---|---|---|
| 0 — Spikes | Complete | committed history | CP0 accepted | Both spikes GO |
| 1 — Foundation | Complete | committed history | CP1 accepted | Server/net foundation |
| 2 — Original placement | Complete, partly superseded | committed history | folded into CP2 | Redesign replaces footprints/fusion lifecycle |
| 3 — Enemies/waves/aggro | Complete | committed history | CP2 accepted | Foundation retained |
| 4 — Original characters | Complete, partly superseded | committed history | CP3 accepted | Class-basic redesign pending |
| 5 — Economy | Complete | `69ffb1c` | suite accepted | Fusion ownership will extend it |
| 6 — Bots | Complete, partly superseded | `67cc4b1`–`9484d33` | CP3 conditional GO/remediated | Range policy redesign pending |
| 7 — Art/audio/UI architecture | Complete | `4fd9c0b` | programmer GO with notes | Production assets pending |
| 8A — Measurement baseline | Complete | `ce47280`–`944ea63` | plan/baseline reviews | Instrument exists; redesign metrics pending |
| 8B — Tower baseline | Complete | `2c220e3` | baseline published | Clean committed anchor |
| 8C — Redesign reconciliation | Tasks 1-9 of the staged combat redesign program complete (contract approval, tick-order freeze, measurement substrate, character-basic modules, Wind fan/Fireball retune, bot range policy, attack presentation events, structure wire channels, directional placement) | `2c220e3` -> ... -> `8b7179e` (Gate 4 findings fixed) on branch `codex/redesign-reconciliation` — see `elementia-phase8-plan` memory for the full per-task commit list (session log is the detailed record; not restated here) | Gate 1 run against WIP, verdict `needs-attention`, Codex Sol/medium — Task 1's approval gate cleared 2026-07-29. **Gates 2 and 3 formally dropped 2026-08-01 (Philip's ruling)**. **Gate 4 (structure wire ABI + fusion direction, Sol) run and findings fixed at `8b7179e`.** | Finding 2.2 (fusion consent gate) remains open, scoped as A5 step 5/Task 13 — since resolved (see 8F row). Row last fully reconciled here 2026-08-02 (see 2026-08-02 checklist sync). |
| 8D — Character redesign | Superseded — folded into 8C's Task 4-7 delivery (class-basic modules, Wind fan, bot range policy, attack presentation), never run as its own gated phase | — | Gate 3 formally dropped 2026-08-01 (see 8C row); no separate 8D gate ever scheduled or needed | Row kept only for numbering continuity with the original plan; treat 8C as authoritative |
| 8E — Structure substrate/individuals | Complete. Tasks 10-12 landed: Snare Post (aura), Rock Trap + Water Geyser (target-impact/displacement), Wind Vortex (bounded cycle) | `17579df` -> `b20f56d` -> `28c94c4` -> `d353a89` on `codex/redesign-reconciliation` | **Gate 5 (individual structures through Wind Vortex, Sol) run 2026-08-01, verdict `needs-attention`.** 2 findings: [high] Rock Trap's locked telegraph point wasn't on the wire, [medium] Vortex suction impulses bypassed combatStats. Both fixed same day (`28c94c4`, `d353a89`); hang gate re-verified 0/144 both mazes after the fix. | — |
| 8F — Fusion lifecycle/behaviors | Complete. Task 13 (proposal/consent/lifecycle), Task 14 (Firestorm, Volcano, Blizzard), Task 15 (Muddy Bog, Grinder), Task 16 (Steam Vent — last of six fusions) all landed | `3202d81` -> `d28498b` -> `076251a`/`a8a29ec`/`d0f8495` -> `66afa71`/`fa71282`/`9a3c69c` -> `d62bf8a`/`ff00567` on `codex/redesign-reconciliation` | **Gate 6 (fusion lifecycle + first five fusions, Sol) run 2026-08-01, verdict `needs-attention`** on `3202d81` — 2 blocking + 1 non-blocking, fixed at `d28498b`; a further Bog-specific finding fixed at `9a3c69c`. **Gate 7 (Steam Vent + complete combat simulation) was NOT run as Codex** — an Opus 5 adversarial subagent review substituted for Task 16 instead (6 findings, all fixed at `ff00567`), same undocumented-substitution pattern as Gates 2/3. No formal ruling on record dropping Gate 7 the way Philip explicitly dropped 2/3 — flagging, not deciding. | Tower baseline (`docs/reviews/2026-08-01-tower-baseline-retake.md`) predates Task 14/15/16 — the full six-fusion + Volcano/Firestorm/Blizzard/Bog/Grinder roster has never been measured together. Worth doing as part of the next 8H sweep. |
| 8G — Graphics/audio production | Task 17 (reusable animation controller + effect pool, the client-side plumbing Task 18/19 render into) complete and reviewed. Calibration/WIP art otherwise only | `c08194a` (Task 17) -> `8644417`/`7db1880` (Opus review fixes); untracked `art/` sources | Task 17 reviewed by Opus 5 subagent (2 real defects found and fixed: unreachable `CHARGED` state, frame-rate-dependent run/idle threshold) — see `elementia-phase8-plan` memory session 16 | GPT Image→Pillow and free-library→FFmpeg pipelines approved; Task 18 (first real art, vertical-slice gate) is next and blocks 19-20 |
| 8H — Integrated balance/profile | Not started | — | Gate 8 planned — Sol | Task 20's harness-only balance sweep (probe.js matrices, hang gates, structure-vs-Watchtower comparisons) needs no art and could start now in parallel with 8G, ahead of its plan-file sequencing after Task 19 — Philip's call, not yet ruled on |
| 8.9 — Final asset integration | Not started | — | user visual/audio approval | Narrow final production gate |
| 9 — E2E/deploy | Not started | — | Gate 8/final release | Includes real Render budgets |

## Current working-tree warning

The repository contains substantial user/uncommitted changes after `2c220e3`, including combat-structure foundations, specifications/reviews, calibration art, and tests. Before execution:

1. Inventory the exact diff without modifying it.
2. Separate unrelated user work from redesign candidate work.
3. Review the candidate base-to-working-tree range at Gate 1.
4. Have Claude Code remediate accepted findings.
5. Commit narrowly accepted foundations before beginning new character work.

## Lean review gates

| Gate | Scope | Codex model | Status |
|---|---|---|---|
| 1 | Current WIP reconciliation | GPT-5.6 Sol (medium effort — Philip's explicit override of the handoff's "high") | Run; verdict `needs-attention`. Task 1's contract rulings (the user-decision gate) cleared 2026-07-29. Findings 2.1 and 2.8 fixed same day (see 8C row). Finding 2.2 remains open, scoped separately as A5 step 5. |
| 2 | Measurement substrate | GPT-5.6 Terra | **Formally dropped, 2026-08-01 (Philip's ruling).** Task 3 landed 2026-07-30 with an Opus 5 subagent review substituted (hot-loop CC-seconds hook) instead of this gate; that review is accepted as sufficient, no retroactive Codex pass. |
| 3 | Complete character slice | GPT-5.6 Terra | **Formally dropped, 2026-08-01 (Philip's ruling).** Tasks 4-7 landed 2026-07-31 without this gate; accepted as-is. Codex schedule resumes at Gate 4. |
| 4 | Dynamic structure wire + placement | GPT-5.6 Sol | **Run and findings fixed at `8b7179e`** ("fix: address Codex Gate 4 findings on structure wire ABI and fusion direction"). |
| 5 | Individual structures through Vortex | GPT-5.6 Sol | **Run 2026-08-01, verdict `needs-attention`, base `8b7179e`.** 2 findings, both fixed same day: [high] Rock Trap telegraph point missing from wire ABI (`d353a89`), [medium] Vortex suction impulses uninstrumented (`28c94c4`). |
| 6 | Fusion lifecycle + first five fusions | GPT-5.6 Sol | **Run 2026-08-01, verdict `needs-attention`, base `3202d81`.** 2 blocking + 1 non-blocking finding, fixed at `d28498b`; a further Bog-specific finding (surfaced building Task 15, same review lineage) fixed at `9a3c69c`. |
| 7 | Steam Vent + complete combat simulation | GPT-5.6 Sol | **Not run as Codex.** An Opus 5 adversarial subagent review substituted for Task 16 (Steam Vent) instead — 6 findings, all fixed at `ff00567`. No formal ruling dropping this gate exists on record (unlike Gates 2/3, which Philip explicitly dropped 2026-08-01) — needs the same explicit ruling, not an assumption. |
| 8 | Final balance/performance/release | GPT-5.6 Sol | Pending |

Graphics and audio each receive one Terra pipeline/runtime review. The user approves calibration and final creative output. Add unscheduled reviews only for the risk triggers listed in the combat redesign plan.

## Review transport

Reviews run from Claude Code through OpenAI's official `openai/codex-plugin-cc` against the same checkout. Use background `/codex:review --base <sha>` for Terra gates and one focused `/codex:adversarial-review --base <sha> --background <focus>` for Sol gates. Keep the automatic Stop-hook review gate disabled.

For each completed gate, append:

- Effective Codex model and reasoning effort.
- Base SHA and reviewed head SHA.
- Plugin job ID and Codex session ID when returned.
- Review result: `ACCEPT`, `REWORK`, or `USER DECISION REQUIRED`.
- Remediation SHA and whether a second blocking-finding review was necessary.
- Focused/full test and task-specific gate evidence.

## Next authorized planning action

**All 17 gameplay tasks of the staged combat redesign program are complete**
(`docs/superpowers/plans/2026-07-26-staged-combat-redesign-program.md`) on
branch `codex/redesign-reconciliation`, most recently Task 17 (reusable
animation controller, `c08194a`, 2026-08-02, Opus-reviewed and remediated at
`8644417`/`7db1880`). **Task 18** (first real art, vertical-slice gate) is
next per the program's sequence and is blocked on the art pipeline
(`elementia-art-pipeline` memory) rather than more gameplay code — see the
`elementia-phase8-plan` memory file for full per-task detail; this ledger
intentionally stays a summary.

**Two review-gate items still need Philip's ruling, not an assumption:**
1. Gate 7 (Steam Vent + complete combat simulation) never ran as Codex; an
   Opus 5 review substituted, same pattern as the Gates 2/3 substitution —
   but unlike 2/3, no explicit ruling dropping it exists on record.
2. Finding 2.2's resolution (fusion consent gate, closed by Task 13) and the
   tower baseline are now stale against Task 14/15/16's five additional
   fusion behaviors — the full six-fusion roster has never been measured
   together in one baseline retake.

Task 20's balance sweep (structure-vs-Watchtower matrices, hang gates,
split-half analysis) is entirely harness-side and needs no art. The program
plan sequences it after Task 19, but the stated reason for that order — wait
until the sim's defense resembles the played one — is already satisfied now
that Tasks 1-17 are done. Running it now, in parallel with the Task 18/19 art
pipeline, would not violate the plan's intent, but reordering the documented
sequence is still Philip's call, not assumed here.

**Review-gate debt, discovered and resolved 2026-08-01 while building a
handoff**: the program's own 8-gate Codex schedule had fallen behind — only
Gate 1 had actually run. Gates 2 (measurement substrate, due after Task 3)
and 3 (character slice, due after Tasks 4-7) landed with Opus 5 subagent
reviews substituted instead of the scheduled Codex pass, with no record of
that being a deliberate call. **Philip's ruling, 2026-08-01: formally drop
Gates 2 and 3** — the Opus 5 reviews already done are accepted as sufficient
for Tasks 3-7; no retroactive Codex pass. The Codex schedule then ran clean
through **Gate 6** (fusion lifecycle, `3202d81`); **Gate 7 has the same
undocumented-substitution shape and is unresolved** (see above).

Test baseline going forward: **611 tests, 609 pass, 0 fail, 2 skipped**
(402/400/2 was the baseline the last time this section was detailed —
see the `elementia-phase8-plan` memory file for the intervening Task
9-17 increments).
