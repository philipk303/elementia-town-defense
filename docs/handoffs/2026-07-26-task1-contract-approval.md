# Handoff — Task 1: Approve the Combat Contract and Reconcile the Specs

Paste the prompt below into a new Claude Code session. **Model: Opus 5** (the
2026-07-26 continuation amendment assigns WIP reconciliation and spec/protocol
work to Opus, not Sonnet).

---

You are closing out Phase 8C of Elementia Town Defense by completing Task 1 of
the staged combat redesign program.

Repository: `C:\dev\Elementia-Town-Defense`
Branch: `codex/redesign-reconciliation` (already checked out; do not create or
switch branches)
Accepted anchor: `2c220e3`. Two commits sit on top: `c985563` (decision record)
and `a69a82c` (walkable structures, footprints, fusion geometry, Firepit).

**Task 1 is a hard gate:** *"The user explicitly approves these rulings. No
gameplay implementation before approval."* Phase 8C is otherwise complete —
inventory, classification, Gate 1, and the accepted-foundation commits are all
done. Task 1's rulings are the only thing left.

Read these first, in order:

1. `docs/plans/2026-07-26-task1-decision-sheet.md` — the 19 merged decisions,
   with a recommendation and a blank Ruling column for each. This is your agenda.
2. `docs/superpowers/plans/2026-07-26-staged-combat-redesign-program.md` §Task 1
   and §Global constraints.
3. `docs/superpowers/specs/2026-07-25-combat-structure-redesign.md` — including
   Amendments A and B.
4. `docs/superpowers/specs/Character Class Attack Redesign.md` — §3, §4, §7, §9.
5. `docs/reviews/2026-07-26-gate1-wip-reconciliation.md` — the eight open Gate 1
   findings, so you do not accidentally treat one as resolved.

## Step 1 — Get the rulings

Walk Philip through the decision sheet. Do not re-derive it; it is already
researched. Be efficient:

- Present the **seven bolded rows** (A1, A2, A3, A6, A10, B2, B4) for real
  decisions. Lead with **B2 (Firestorm) and B4 (Blizzard)** — they are the only
  two that *overwrite* text already committed in Amendment A, so they change the
  plan of record rather than clarifying it.
- Confirm the remaining twelve in a single batch. A5, A7 and A8 codify behaviour
  that already ships (verified: `players.js:119` consumes cooldown before target
  acquisition; `players.js:126` already uses edge distance) and cost nothing.
- A blank ruling is **undecided, not approved.** Stop and ask.

## Step 2 — Reconcile both specifications

Only after Philip has ruled on every row:

- Write the approved rulings into **both** specs as dated amendments. The
  character spec has had no amendment yet; the structure spec continues from
  Amendment B.
- Where a ruling supersedes existing text (B2 over §6.3 and A3.3; B3 over §5.2's
  impact resolution; B4 over Amendment A §6.5), **strike or explicitly mark the
  superseded text.** Do not leave two contradictory statements in one document —
  that is the exact failure Gate 1 caught with Firepit.
- Carry forward the one part of A3.3 that survives B2: a structure-owned effect
  still needs a null/structure path through `triggerAggro`.
- Tick Task 1's eleven checkboxes in the program plan.
- Reconcile the stated test baseline (plan says 346/344; actual is 347/345, from
  an edit to `test/game/firepit.test.js` outside the redesign changes).
- Update the ledger's 8C row and Gate 1 row in
  `docs/plans/2026-07-26-slice1-status-ledger.md`. Note honestly that Firepit was
  committed while Gate 1 classified it accept-after-rework, and that Amendment B
  resolved that retroactively — the sequence was rulings-after-commit.
- Record the rulings in the decision sheet's Ruling column so it becomes the
  audit trail.

## Step 3 — Commit documentation only

Stage each file by name. **Never `git add -A`** — the tree holds substantial
unrelated user work (`art/`, `audio/`, `tools/`, `client/public/`, wind-preview
files, `client/vite.config.js`, and several docs). Commit message prefix `docs:`.

## Hard constraints

- **No gameplay code.** Not one line. That includes the tempting small fixes:
  Gate 1's no-build-arc footprint bug (finding 2.8) and the per-state structure-ID
  allocator (finding 2.1) are the *first remediation batch after* this gate lifts,
  not part of it.
- **Do not run any Codex review.** Philip's subscription is out of weekly tokens.
  Gate 2 waits for quota. The plugin is installed and authenticated; leave it
  alone.
- Do not modify a specification to accommodate implementation. If a ruling seems
  to require a code change to make sense, say so and stop.
- Run `npm test` before committing to confirm you changed no behaviour: expect
  **347 tests, 345 pass, 0 fail, 2 skipped.**

## Stop condition

Report: the ruling on each of the 19 decisions, the amendments written to each
spec, what superseded text was struck, the ledger updates, the commit SHA, and
anything Philip left undecided.

Then stop. The next authorized work is the Gate 1 remediation batch (findings 2.1
and 2.8), followed by Task 2 (freeze tick-order, limits, performance budgets).
