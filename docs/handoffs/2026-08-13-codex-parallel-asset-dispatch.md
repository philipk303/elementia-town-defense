# Codex parallel-session dispatch — remaining graphics assets

Written 2026-08-13, after merging `codex/redesign-reconciliation` into `master` (`6e5b367`), which landed ~97 commits of previously-stranded asset work. **Read this before spawning anything**: that merge took an entire session to untangle because parallel sessions forked from a shared branch and never merged back promptly. This doc exists to stop that from happening again.

## Full technical spec

The per-asset technical spec (canvas sizes, states, directions, output contracts, existing source art to reuse) lives in [`docs/assets/2026-08-13-missing-assets-chatgpt-brief.md`](../assets/2026-08-13-missing-assets-chatgpt-brief.md). Read that first — this doc only covers the **parallel-session workflow rules**. Do not duplicate the technical spec here; if it drifts, that file is authoritative.

## What's actually left (confirmed 2026-08-13, no other gaps found)

Checked `art/source/` across all 19 `codex/*` branches and 5 detached-HEAD worktrees for anything not already on `master` — nothing found beyond these 4. (Several detached worktrees contained second attempts at Troll/Fireball/Wind Vortex/Marketplace art, all superseded by what's already merged and wired — ignore those, do not resume them.)

| # | Asset | Session type | Priority |
|---|---|---|---|
| 1 | Hall | **Packaging only** — source art already exists at `art/source/calibration/town-hall-source-v1.png` | High |
| 2 | Farm | **Packaging only** — source art already exists at `art/source/calibration/farm-source-v3.png` (also v1/v2/base, eyeball and confirm v3 first) | High |
| 3 | Fire hero basic-attack FX | **Generation + packaging** — no source exists, follow Earth/Water/Wind's basic-FX pattern | Medium |
| 4 | Elemental particle library | **Generation + packaging** — no source exists, nothing in-game depends on it yet | Low / optional, do last if spawning 3 not 4 |

## Why the last round produced 19 orphaned branches — do not repeat this

Multiple sessions forked from the same shared, evolving branch (`codex/redesign-reconciliation`) at different points in time instead of from a stable base, then none of them merged back promptly. The branches diverged, nobody reconciled them, and 97 commits of finished, tested work sat invisible for days until this session found and merged it by hand. The rules below exist specifically to prevent that.

## Rules for every parallel session

1. **Branch from `master`'s current tip, not from any other `codex/*` branch.** Before creating your worktree/branch: `git fetch origin && git checkout -b codex/<asset>-package origin/master`. Never branch off another in-progress asset branch, even if it looks related.

2. **One session, one asset.** Do not let a session drift into touching a second asset "while it's in there." Keeps branches small and merges trivial.

3. **Edit only your own ledger fragment — never the aggregated file.** As of 2026-08-13 the ledger's editable source is `art/manifest/<id>.json`, one file per asset (this is the fix for the exact merge pain described above: `art/assets-manifest.json` used to be a single JSON array every delivery edited, which is what turned parallel branches into conflicts). Edit **only** `art/manifest/<your-asset-id>.json`. **Do not run `npm run build:manifest` and do not touch `art/assets-manifest.json` yourself** — regenerating the aggregated ledger is Claude's job at merge time, after your branch (and possibly others) have landed. Since each session's fragment is a distinct file, parallel branches editing different assets should never conflict on the ledger at all, even if merged together in one sitting.

4. **Leave `runtime.status` as `"planned"`/`"not_registered"`/`"unregistered"` and do not touch gameplay code.** No edits to `client/src/assets/manifest.js`, `client/src/scenes/Preload.js`, or any renderer. That integration step is deliberately left to Claude Code — see the brief doc's step-by-step ledger/QA/handoff-doc template.

5. **Commit and push as soon as the pipeline test + `npm test` + `npm run build` pass — same session, not queued for later.** A pushed-but-unmerged branch that sits for days is exactly the failure mode from last round. If you're not confident the work is finished, push anyway and say so in the handoff doc's "Reason integration is blocked" line — a visible, honestly-labeled in-progress branch is infinitely better than an invisible local one.

6. **Write the handoff doc** (`docs/handoffs/<date>-<asset>-integration-handoff.md`, exact template in the brief doc) as your last step, always, even if you think the work is incomplete. This is the only thing that makes your branch findable by the next session — a branch with no handoff doc is functionally the same as a branch that doesn't exist.

## Spawn plan

Spawn up to 4 parallel Codex sessions, one per row below. If only spawning 3, drop #4 (lowest priority, nothing depends on it).

1. **Session A — Hall packaging.** Branch `codex/hall-package`. Use `art/source/calibration/town-hall-source-v1.png` as-is (already chroma-keyed, already approved quality — visually confirmed 2026-08-13, shows the pagoda hall with the seated princess matching the ledger's display alias). Write `tools/art/hall_pipeline.py` following `tools/art/generic_structures_pipeline.py`'s `extract_subject`/`fit` pattern. Output: `client/public/art/hall.png`, 64×64, single static image (no atlas needed — `states: ["static"]`, `directions: []`).

2. **Session B — Farm packaging.** Branch `codex/farm-package`. Compare `farm-source.png`, `farm-source-v1.png`, `farm-source-v2.png`, `farm-source-v3.png` in `art/source/calibration/` — `v3` is the leading candidate (highest iteration, visually confirmed complete: farmhouse plus rice-paddy fields, matches the ledger's economy-structure framing) but eyeball all four before committing. Same pipeline pattern as Hall. Output: `client/public/art/farm.png`, 32×32, single static image.

3. **Session C — Fire basic-attack FX generation.** Branch `codex/fire-basic-fx-package`. No existing source — read `art/source/earth-basic-fx/`, `art/source/water-basic-fx/`, `art/source/wind-basic-fx/` and their `prompt-recipe.md` files first for the established visual/prompt style, then generate a "saber extension" concept consistent with those three. States: `extend`, `impact`; 4 directions. Output contract: 10 untrimmed 64×64 RGBA frames, 2px gutters — `client/public/art/fire_saber_extension.png` + `.json`. This replaces the current `fireball`-sprite substitute wiring (do not touch the wiring itself — that's Claude's job once your art lands).

4. **Session D — Elemental particle library generation (optional, do last).** Branch `codex/particle-library-package`. No existing source, nothing blocks on it. 7 states: `fire`, `steam`, `wind`, `water`, `snow`, `smoke`, `debris`. No fixed canvas size in the ledger yet — propose one (recommend matching the established 64×64 / 2px-gutter convention) and document your choice in the QA doc.

## What Claude Code will do once a branch lands

Fetch, review the handoff doc, register the runtime key in `manifest.js`, wire any renderer/gameplay consumption, run `npm run build:manifest` to fold your fragment into the aggregated ledger, run the full test suite plus the asset-delivery gate, and merge into `master` — same day, not batched. If you finish a session and don't hear back, that's a prompt to ping, not a reason to keep working on the same branch unprompted.
