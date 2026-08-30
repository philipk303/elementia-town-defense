# Handoff — Task 15 complete, Gate 6 ready to close; Task 16 (Steam Vent) is next

**Recommended model: GPT-5.6 Sol per the program plan's own table
(`docs/superpowers/plans/2026-07-26-staged-combat-redesign-program.md:60`),
Opus 4.8 if that model isn't selectable.** This is the last fusion and shares
the same hot-loop/soft-lock caution as every prior structure task — see the
open item below before touching `enemies.js`'s per-tick loop.

---

You are continuing Phase 8C of Elementia Town Defense — the staged combat
redesign program — with **Task 16: Steam Vent confusion**.

Repository: `C:\dev\Elementia-Town-Defense`
Branch: `codex/redesign-reconciliation` (already checked out; do not create or
switch branches)

## Where we are

Task 15 (Muddy Bog + Grinder) is fully landed, reviewed, and remediated —
four commits: `66afa71` (Muddy Bog), `fa71282` (Grinder), `cc47fde` (harness
`fuseWith` fix), `9a3c69c` (Gate 6 review fixes). Suite **540/538/2 skipped**,
`npm run build` clean. Full detail in memory: read
`elementia-phase8-plan.md`'s "Session 24" entries (parts 1-3) before doing
anything — they cover the two structures' designs and the review findings in
depth that this handoff only summarizes.

**Gate 6 can now be declared closed** — both remaining fusions from the
combat-structure redesign are implemented, and the mandatory hang gate
(144 matches x 2 mazes, per structure, with the fusion confirmed built each
time via the new `fuseWith` harness param) passed 0/144 throughout.

**The adversarial review caught one real defect worth internalizing before
writing Steam Vent's confusion logic**: Muddy Bog's pulse loop originally had
no position check, justified by an invariant ("a rooted enemy can't walk, so
inside/owned track together for free") that a file I'd already read
(`status.js`'s own header) explicitly contradicts — root and displacement are
INDEPENDENT axes. A Water Geyser/Vortex/Grinder eject can shove a rooted enemy
out of the mud while its root keeps running, and the Bog kept hitting it at
unbounded range. **Fixed, but the lesson generalizes directly to Steam Vent**:
confusion also gates behavior (target acquisition/heading), not displacement —
verify against the CURRENT code, not against what a comment claims, whether a
confused-but-displaced enemy is handled correctly everywhere the confusion
system touches it.

## Key files

- Program plan: `docs/superpowers/plans/2026-07-26-staged-combat-redesign-program.md`
  — Task 16's checklist is at line 487.
- Combat-structure spec: `docs/superpowers/specs/2026-07-25-combat-structure-redesign.md`
  — Steam Vent is §6.x (grep it fresh; this handoff's context did not include
  the exact section). Amendment A2.2 already scoped Steam Vent's confusion
  timing/heading/immunity fields alongside Muddy Bog's `rootSourceId` — both
  described as additions to the SAME preallocated per-slot status object.
- `server/game/status.js` — where `rootSourceId`/`NO_ROOT_SOURCE` just landed;
  confusion's fields belong here too, per the plan's file list.
- `server/game/structureBehaviors/areaEntry.js` — Muddy Bog, the freshest
  worked example of a persistent-area-status structure with source-owned
  status tracking; read it before designing confusion's ownership model.
- Memory: `elementia-phase8-plan.md` (this repo's project memory) — read
  Session 24 parts 1-3 first.

## Next concrete step

Start Task 16 exactly as the plan's checklist orders it
(`docs/superpowers/plans/2026-07-26-staged-combat-redesign-program.md:487-503`):
write the adversarial test matrix FIRST (navigation suspension, target
acquisition, heading changes, immunity, overlapping vents, hall ring,
destruction, reconnect) before writing any confusion code. The hall-ring
soft-lock precedent (`docs/reviews/2026-07-25-hall-ring-softlock-fix.md`) is
exactly the failure class confusion could reintroduce if navigation state is
left inconsistent — this is the hard gate named in the plan, not optional.

**Hard gate**: 144 maze A + 144 maze B matches, PLUS the hall-ring adversarial
cases, before committing. Use `fuseWith: 'FIRE'` → `STEAM_VENT` in
`test/harness/matchRunner.js` (added in `cc47fde`) so the gate actually builds
a Steam Vent — a gate that doesn't confirm `comboFormed === 'STEAM_VENT'`
proves nothing, per this session's own harness-blindness finding.

## Open items / blockers

- **One item deliberately left unresolved in Task 15, not a Task 16
  blocker but worth knowing about**: an enemy displaced out of a Muddy Bog
  and back in while still rooted gets a fresh full-duration root (spec-
  compliant per §6.4's literal wording, but could chain-root next to a
  displacement source). Never observed in testing; the reviewer labelled it
  UNVERIFIED SUSPICION. Confirming it needs a harness that builds TWO
  structures adjacent to each other, which `fuseWith` doesn't support today.
  Resolve before the 8C balance sweep, not before Gate 6.
- No other open decisions. Task 16 is unambiguously the next authorized work
  per the program plan's own sequencing (Steam Vent is explicitly gated last:
  "deferred until every other fusion passes its gates").

## Recommended setup for this session

- **Model: GPT-5.6 Sol** per the program plan's model-assignment table
  (line 60); **Opus 4.8** if Sol isn't selectable in your environment. Not
  Sonnet — this task touches `enemies.js`'s hot per-tick loop and navigation
  state, the same class of risk Task 3b/Task 6 flagged for elevated care.
- **Subagents**: not needed for the implementation (single sequential TDD
  thread, per the plan's own file list). DO use a subagent for the mandatory
  post-landing adversarial review, same as Task 14/15 — Opus 4.8, reviewing
  the confusion commit(s) against the spec's confusion section and the
  hall-ring soft-lock precedent specifically.
- **Review**: mandatory before Gate 6's final "complete fusion gameplay"
  claim (Task 16 IS the last fusion). Engineer/code-reviewer role, Opus 4.8,
  same adversarial-subagent pattern used for Task 15 — it found a real defect
  last time and should be treated as standard practice, not optional
  ceremony.
