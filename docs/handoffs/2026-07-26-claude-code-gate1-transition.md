# Claude Code Handoff — Gate 1 Redesign Reconciliation

Paste the prompt below into the current Claude Code Windows desktop session.

---

You are transitioning the current Elementia Town Defense session from unfinished implementation into the approved Claude Code executor + Codex reviewer workflow.

Repository: `C:\dev\Elementia-Town-Defense`

Accepted committed baseline: `2c220e3`

Your role: Claude Code executor and reconciliation owner. Codex reviews through OpenAI's official `openai/codex-plugin-cc`. Do not delegate implementation to Codex and do not enable the plugin's automatic Stop-hook review gate.

Read only these sources first:

1. `docs/plans/2026-07-18-slice1-implementation-plan.md` — current status and 2026-07-26 continuation amendment.
2. `docs/plans/2026-07-26-slice1-status-ledger.md`.
3. `docs/superpowers/plans/2026-07-26-staged-combat-redesign-program.md` — global constraints, lean review amendment, plugin workflow, and Task 1.
4. `docs/superpowers/specs/2026-07-25-combat-structure-redesign.md`, including Amendment A.
5. `docs/superpowers/specs/Character Class Attack Redesign.md`.
6. `docs/reviews/2026-07-26-character-and-tower-redesign-implementation-review.md`.

Do not continue feature development. Do not reset, stash, clean, delete, squash, rebase, merge, or modify existing source/art files during this transition.

## Step 1 — Capture the current session state

- Report the task this session was attempting.
- Report what is complete, partial, unstarted, or known incorrect.
- Record `git status --short`, the changed-file list, and a concise `git diff --stat` against `2c220e3`; do not paste the full diff into chat.
- Identify files that may contain unrelated user work.
- Run the focused tests already associated with the current work, then `npm test` and `npm run build`.
- Record exact pass/fail/skip counts and any untested behavior. Do not repair unrelated failures yet.

## Step 2 — Preserve branch identity

If the current branch is not already a dedicated redesign reconciliation branch, create `codex/redesign-reconciliation` from the current checkout without altering the working tree. Do not commit yet. If that branch already exists or branch creation is unsafe, stop and ask Philip rather than inventing another branch or moving changes.

## Step 3 — Set up the official Codex plugin

Check whether `codex@openai-codex` is installed and ready. If not, run these Claude Code commands interactively:

```text
/plugin marketplace add openai/codex-plugin-cc
/plugin install codex@openai-codex
/reload-plugins
/codex:setup
```

Do not run `/codex:setup --enable-review-gate`.

Confirm that the plugin uses local Codex authentication and that the effective Gate 1 model is `gpt-5.6-sol` with high reasoning or the closest available high-effort setting. Review commands do not accept a model flag, so inspect the effective Codex configuration before dispatch. If changing user/project Codex configuration is required, show Philip the exact proposed change and wait for approval. Do not change configuration while a Codex job is active.

## Step 4 — Run Gate 1 as one bounded adversarial review

Run in the background:

```text
/codex:adversarial-review --base 2c220e3 --background Review the entire current working-tree redesign candidate. Classify each changed area as accepted foundation, accept-after-rework, superseded experiment, incomplete-but-worth-retaining, unrelated user work, or reject. Focus on spec conflicts, Firepit continuous-vs-pulse behavior, multi-tile/walkable routing, enemy attacks on walkables, fusion geometry versus missing consent/permanence, static/dynamic snapshot gaps, harness validity, deterministic stable-ID behavior, cleanup, performance, and whether any current tests merely pin legacy placeholders. Do not modify files.
```

Use `/codex:status` sparingly, then `/codex:result` after completion. Do not launch a second review concurrently.

## Step 5 — Triage without implementation

- Validate every Codex finding against the actual code/spec before accepting it.
- Classify the result as `ACCEPT`, `REWORK`, or `USER DECISION REQUIRED`.
- Write a concise Gate 1 report to `docs/reviews/2026-07-26-gate1-wip-reconciliation.md` containing the base SHA, working-tree target, effective Codex model/effort, plugin job/session ID, findings, file classification, verification evidence, proposed remediation, and proposed commit split.
- Update only the Gate 1 status fields in `docs/plans/2026-07-26-slice1-status-ledger.md`.
- Do not implement remediation and do not create WIP commits until Philip reviews the Gate 1 report and proposed split.

## Stop condition

Stop and report:

- Plugin setup status.
- Gate 1 job/session ID.
- Review outcome.
- Test/build evidence.
- Proposed file/commit split.
- Decisions required from Philip.

Do not begin Phase 8D, character implementation, new structures, asset production, or audio work.

---
