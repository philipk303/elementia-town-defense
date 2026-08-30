# Gate 1 — Current Working-Tree Redesign Reconciliation

**Date:** 2026-07-26
**Handoff:** `docs/handoffs/2026-07-26-claude-code-gate1-transition.md`
**Base SHA:** `2c220e3` (Phase 8B tower baseline, clean committed anchor)
**Reviewed target:** working tree on `codex/redesign-reconciliation` (created from `2c220e3`, no commits — the diff below is the uncommitted tree)
**Effective Codex model/effort:** `gpt-5.6-sol`, reasoning `medium` — **deliberate deviation from the handoff's specified `high`, by Philip's explicit instruction**, set as the global `~/.codex/config.toml` default (not project-scoped, since no project-level Codex config existed)
**Plugin/session:** `codex@openai-codex` v1.0.6; job `review-ms5gjm6x-nshuuw`; thread `019fabac-94db-7ea3-92c5-ad69e2ec4b8a`; turn `019fabac-9f87-7a30-aa90-8e669ee1183d`
**Codex verdict:** `needs-attention` — **"NO-SHIP. All 345 runnable tests pass, but they miss two critical lifecycle/identity failures and frequently validate legacy placeholders rather than the redesign contract."**

**Operational note:** immediately after this review completed, Philip reported the ChatGPT/Codex subscription is out of weekly tokens. **No further Codex dispatches occurred or will occur this session.** Every finding below was independently verified by reading the actual source, not by a second Codex pass — which Step 5 of the handoff requires regardless of Codex availability.

---

## 1. Scope of this diff

```
16 files changed, 348 insertions(+), 126 deletions(-)   (code/test/config only; docs excluded)
```

`server/game/{combos,enemies,phaseMachine,structures,towers}.js`, `server/net/encode.js`, `shared/{balance,constants}.js`, `client/src/scenes/GameScene.js`, `client/vite.config.js`, and matching test files. Plus untracked: `test/game/{walkableStructures,footprint,firepit}.test.js` (new), and unrelated user work — `art/`, `audio/`, `tools/`, `client/public/`, `client/src/windPreview.js`, `client/wind-preview.html`, `test/art/`, `test/client/windPreview.test.js`, and several docs.

This covers roughly the first two steps of Amendment A5's implementation order: walkable structures + the enemy-vs-walkable attack rule (step 1), multi-tile footprints and fusion geometry (pulled forward, forced by footprints), the L2 gate removal (ruling A1.3), and Firepit (step 2, partial — see finding 3).

## 2. Findings, verified against source

Ranked as Codex ranked them. Each was independently confirmed by reading the file/line cited before acceptance — none taken on Codex's word alone.

### 2.1 [CRITICAL] Concurrent rooms can generate duplicate structure IDs — CONFIRMED, pre-existing, not from this session's diff

`server/game/structures.js:23-24` — `nextStructureId` is module-global; `resetStructureIds()` zeroes it. `server/game/state.js:67` calls `resetStructureIds()` inside `createGameState`, which runs on every room creation. Two concurrently live rooms will hand out colliding structure IDs the instant the second room is created while the first has structures standing.

**This predates this session's changes** — the allocator pattern is unchanged by anything in this diff. It is flagged here because it is a real, verified defect that any structure-identity work (fusion consent, dynamic snapshots) will build on top of if not fixed first.

**Classification: ACCEPT AS FINDING, REWORK REQUIRED — not blocking this diff, but should land before Gate 4 (dynamic structure wire).**

### 2.2 [CRITICAL] Fusion destroys another player's structure without consent or permanence — CONFIRMED, mine, already self-documented

`server/game/combos.js:37-64` — `resolveCombosAt` calls `destroyStructure(state, neighbor)` and mutates `structure` in place, unconditionally, at build time. My own comment at lines 16-18 states consent/ownership/permanence are "still to come" (A5 step 5) — but the destructive call is live now, on a WIP branch, with the resulting fusion under ordinary sellable ownership (`sellStructure` at `structures.js:187-197` never checks `ownerId`).

I documented the gap in Amendment A5 without gating the code behind it. That is the actual process failure, not the existence of the geometry code (which Amendment A5 step-ordered deliberately ahead of consent, since 2x1 footprints forced the geometry rewrite early).

**Classification: REWORK REQUIRED before any further fusion work. Keep the geometry (`fusionSquare`), gate the mutation behind a proposal/accept/reject/expiry state machine per A5 step 5 (already planned, not yet built).**

### 2.3 [HIGH] Firepit implements the opposite cadence from the authoritative spec — CONFIRMED; USER DECISION, not yet reconciled to the document

Spec §3, §5.1, and the global constraint at line 19 ("Recurring work uses fixed pulses... rather than per-tick area processing") are unambiguous: fixed pulses, `nextPulseAt`. The shipped code (`server/game/towers.js:48-90`) is continuous, elapsed-time-scaled damage, scanning every enemy against every AoE structure every tick.

**This was Philip's explicit instruction mid-session** ("let's have the aoe 'pulse' always on"), not a unilateral implementation choice. The actual defect is procedural: the program plan's global constraint states *"Claude Code may not modify a specification to accommodate its implementation. Proposed design or scope changes return to the user before code changes continue."* I implemented the instruction but never wrote the ruling back into the spec document, so the code and the spec now disagree in a way any future reader (or reviewer) correctly flags as a conflict.

**Classification: USER DECISION REQUIRED (already made — needs to be RECORDED). Two remaining options:**
1. **Write the always-on ruling back into `2026-07-25-combat-structure-redesign.md` §5.1 as a dated amendment**, superseding the pulse language, and keep the current code.
2. **Revert to fixed pulses**, matching the spec as written.

I recommend (1) — the always-on model was chosen specifically to fix a real defect the pulse model had (output depending on phase alignment with enemy transit, measured 0.073→1.30 targets/activation in `docs/reviews/2026-07-25-firepit-falsification-test.md`) — but this is explicitly your call, not mine, per the plan's own constraint.

On the performance claim: `O(firepits × enemies × 60Hz)` is accurate but the multiplier is small in this project's regime (enemy cap ~200, firepit count single digits per match) — worth a profiling note in the amendment, not necessarily a redesign.

### 2.4 [HIGH] Multi-tile orientation is unreachable and mis-rendered — CONFIRMED, mine, incomplete

`client/src/scenes/GameScene.js:115-140` (now ~125-141 after my edit) — `BUILD_STRUCTURE` emits only `{ type, gx, gy }`; `server/index.js:179` destructures the same three fields. No `orient` field exists on the wire in either direction, so `placeStructure`'s `opts.orient` always defaults to `'H'`. Vertical placement is exercised only by direct unit-test calls that bypass the socket path entirely.

Separately: I fixed the **hit-test** half (`_structureContains` now reads `w`/`h`) but never touched the **render** half — the sprite/rectangle draw still centers on the anchor tile at a fixed 1×1 size, so a 2×1 Firepit or 2×2 fusion is visually indistinguishable from a 1×1 structure even though clicking anywhere on its true footprint now correctly resolves it. I should have caught this in the same pass; it's the same class of oversight, just the other half of it.

**Classification: ACCEPT-AFTER-REWORK. Orientation UI, socket field, and footprint-aware rendering are all client-side UX work that A5's plan already schedules (A3.4) but had not yet reached.**

### 2.5 [HIGH] Damaged structures remain stale on the wire — CONFIRMED, pre-existing, made load-bearing by this session's work

`server/net/encode.js:82-84` sends the structures array only `if (state.placedVersion !== lastSentPv)`. `damageStructure` (`structures.js:222-231`) mutates `hp` and calls `syncFieldBand`, but **never bumps `placedVersion`** unless the structure dies (which routes through `destroyStructure`, which does bump it). Nonlethal damage is therefore invisible to already-connected clients until some unrelated placement/sale event happens to bump the version.

This bug predates this session, but it was largely dormant before: damage used to mostly matter at kill-time. My walkable-attack work (A1.1/A3.1) made this **load-bearing** — an enemy standing on a Snare Post or Firepit now deals **continuous nonlethal chip damage every tick**, which is exactly the case this gap was blind to. This is a real consequence of my own earlier work that I didn't trace far enough forward.

**Classification: REWORK REQUIRED before Gate 4 (dynamic structure wire), which is already scoped to fix exactly this (A3.2: "no dynamic per-structure state channel exists"). Not new scope — the finding correctly identifies it's more urgent now than the amendment implied.**

### 2.6 [HIGH] Most redesigned structures remain legacy nearest-slot placeholders — CONFIRMED as accurate, but severity is contextual, not a regression

`server/game/towers.js` — `EARTH_SPECIAL`, `WATER_SPECIAL`, `WIND_SPECIAL`, and all six fusion types still resolve through the generic `nearestInRange` + `applyEffects` path. True. But this is **exactly the state Amendment A5's own staged order describes**: step 2 is Firepit alone, deliberately, specifically so the falsification test (`docs/reviews/2026-07-25-firepit-falsification-test.md`) could run on one structure before nine more were built on an unverified assumption. The existing `towers.test.js` assertions on those types were never claiming spec completeness — they pin pre-redesign Phase-3 behavior that A5 hasn't reached yet.

Codex's point about test *labeling* is fair: nothing currently marks these as "known placeholder, not yet redesigned," so a future reader could mistake "the suite is green" for "the structures are done." That's a real documentation gap.

**Classification: ACCEPT AS ACCURATE INVENTORY, NOT A DEFECT TO FIX NOW. Action: label the pending structures' tests explicitly as pinning legacy behavior (a comment, not a rewrite) so Gate 5 has an honest starting inventory. No code change required at Gate 1.**

### 2.7 [HIGH] The harness validates an auto-fusion lifecycle that must be removed — CONFIRMED, already known and recorded

`test/harness/matchRunner.js:183-195` — the build policy places a partner special and relies on `combos.js`'s automatic mutation; it cannot express two-player consent, rejection, timeout, ownership, or orientation. This is precisely what Amendment A6 already states: *"The harness build policy breaks at step 5... Every existing fusion number is void the moment this lands."*

**Classification: ALREADY ACCEPTED AND SCHEDULED (A5 step 5, A6). No new action — restating existing scope. Flag as confirmation, not a new finding.**

### 2.8 [MEDIUM] Multi-tile structures can partially enter the no-build zone — CONFIRMED, mine, real gap

`server/game/structures.js:145-154` (now ~153) — `inNoBuildArc(state, gx, gy)` is called once against the anchor tile only. A legal anchor can place a 2×1 or 2×2 structure's far tile(s) inside the hall's protected no-build ring. I added multi-tile placement without extending this check to the full footprint.

**Classification: REWORK REQUIRED, small fix. Loop `inNoBuildArc` over every occupied tile (or test the footprint's bounding box against the arc), add horizontal + vertical boundary tests.**

## 3. File/change classification

Per the handoff's required categories:

- **Accepted foundation:** footprint math and occupancy (`structures.js` `footprint`/`tilesOf`/`tilesOfStructure`), exact-2×2 fusion geometry (`combos.js` `fusionSquare`), walkable cost-field exclusion (`isWalkable`, `syncFieldBand` early return), walkable-structure destruction and revalidation (the mid-tick stale-index fix in `enemies.js`), w/h wire defaults (`encode.js` static channel).
- **Incomplete-but-worth-retaining:** fusion geometry (2.2 — keep the math, gate the mutation), walkable enemy-attack rule (sound, load-bearing, needs the dynamic-wire fix at 2.5 to be fully correct), footprint serialization (needs the orientation wire field at 2.4 to be reachable).
- **Accept-after-rework:** Firepit cadence (2.3 — pending your ruling on which side of the spec conflict wins), dynamic structure snapshots (2.5, already A3.2/Gate-4 scope), client placement/rendering (2.4, already A3.4 scope), no-build validation (2.8, small fix).
- **Superseded experiment:** none — I disagree with Codex's blanket classification of the generic tower resolvers as "superseded" (2.6); they are pre-redesign Phase-3 code A5 hasn't reached, not a discarded experiment from this session.
- **Unrelated user work:** `art/`, `audio/`, `tools/`, `client/public/`, `client/src/windPreview.js`, `client/wind-preview.html`, `client/vite.config.js`, `test/art/`, `test/client/windPreview.test.js`, associated docs. Not reviewed here; do not attribute to the redesign candidate.
- **Reject from the candidate:** `test/art/__pycache__`, `tools/art/__pycache__` — verified present, both under the unrelated art/tools tracks. Should be `.gitignore`d or removed before any commit touches those directories; not part of the redesign diff itself.

## 4. Verification evidence

- Full suite: **347 tests, 345 pass, 0 fail, 2 skipped** (program's stated expected baseline is 346/344 — the one-test delta traces to an external edit to `test/game/firepit.test.js` noted by a prior system reminder, not yet reconciled; worth a second look before any commit).
- `npm run build`: succeeds, 5.45s (phaser chunk 1.48 MB / 340 kB gzip triggers the standard >500 kB warning, unrelated to this diff).
- Branch `codex/redesign-reconciliation` created from `2c220e3`; working tree preserved exactly (41 entries at creation); **no commits made**.

## 5. Proposed commit split (NOT executed — awaiting Philip's review)

1. **`walkable structures + footprints + fusion geometry`** — `structures.js`, `constants.js` (`WALKABLE_TYPES`, `STRUCTURE_SIZE`), `combos.js` geometry only, `enemies.js` walkable-attack rule + stale-index fix, `encode.js` w/h fields, plus their tests. Blocked on 2.8 (no-build-arc footprint fix) landing first, small addition.
2. **`Firepit (pending spec reconciliation per 2.3)`** — `towers.js`, `balance.js` Firepit/Watchtower entries, `firepit.test.js`. Held until you rule on writing the always-on decision back into the spec vs. reverting to pulses.
3. **NOT bundled — separately scoped, not yet built:** fusion consent/permanence (2.2), structure-ID per-state allocator (2.1), dynamic structure wire (2.5), client orientation UI + footprint rendering (2.4).

## 6. Decisions required from Philip

1. **Firepit cadence (2.3):** write the always-on ruling into the spec as a dated amendment (my recommendation), or revert to fixed pulses to match the spec as written?
2. **Commit split approval:** proceed with the two-commit split above, or hold everything as one reconciliation commit?
3. **Structure-ID allocator (2.1) and fusion consent (2.2):** both pre-date or extend beyond this session's scope — confirm these become their own tracked follow-up work (2.1 before Gate 4, 2.2 as A5 step 5) rather than blocking this Gate 1 commit.
4. **Codex quota:** confirmed no further dispatches this session. Gate 2+ reviews will need to wait for quota to refresh — should I schedule/flag that, or will you ping when it's available?
