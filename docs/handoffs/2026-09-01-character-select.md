# Handoff — character-select screen (spec §5)

Date: 2026-09-01. Written at the end of a session that shipped and published
the build-palette thumbnails (§2). That closes item 2 of the playtest UI
backlog; this handoff starts item 5, the last unstarted item besides theming.

---

## READ THIS FIRST

`docs/plans/2026-08-30-playtest-ui-specs.md` §5 (lines 352-396) is the source
of truth. It already scopes the work down to something buildable — read it in
full before writing any code.

**Do not start coding before Philip answers two questions.** Both are called
out in the spec itself, not invented by this handoff:

1. **Scope.** "Selectable character" could mean picking an **element**
   (small — what the spec assumes and specs in full) or a full class/loadout
   system (much bigger, touches balance numbers, needs its own spec written
   first). Confirm elements-only before starting.
2. **Wire-protocol change.** Sending a preferred element means adding a field
   to `CREATE_ROOM`/`JOIN_ROOM`. This project has a standing "no wire-protocol
   change" rule; it was deliberately broken once already for `RESTART_MATCH`
   (2026-08-31), and that handoff says explicitly: breaking it again needs the
   same kind of sign-off. Ask before doing it a second time.

## What is DONE and committed

Local and public `master` are in sync as of 2026-09-01: local `0b532fc`,
published `573c29d` (verified live on Render — the deployed JS bundle contains
the new palette-thumbnail code). Playtest backlog status:

| item | status |
|---|---|
| 6. structure/actor art sizing | DONE, live (2026-08-30) |
| 3. controls list | DONE, live — shipped inside the MENU panel (2026-08-31) |
| 4. pause | DROPPED — replaced with RESTART MATCH (2026-08-31) |
| 2. build-palette thumbnails | DONE, live (2026-09-01) |
| 5. character select | **NOT STARTED — this handoff** |
| 6 [renumbered]. theming | NOT STARTED — do LAST, after character select |

## Next work: character select (§5)

### What's there now

Element is auto-assigned, never chosen. `firstFreeElement()`
(`server/rooms/index.js`, roughly lines 41-45) hands out the first element in
canonical order not already taken, and the same function fills bot seats. The
client just gets told which one it got (`client/src/main.js`, around line 57,
reading `payload.element`). The lobby (`client/index.html`, lines 47-74) is
a name box, timing dropdown, friendly-fire checkbox, and create/join buttons —
its own comment calls it a "Minimal Phase-1 lobby overlay."

### The shape of it, per the spec

- Client sends a **preferred** element alongside `CREATE_ROOM`/`JOIN_ROOM`.
- Server honors it when free; otherwise falls back to `firstFreeElement()` and
  tells the client what it actually got. **Never fail a join over a taken
  pick** — degrade silently to an assigned element with clear feedback.
- The four-element-slots-always-full invariant is load-bearing and must not
  change: bots keep filling whatever the humans didn't take.
- Mid-match bot promotion (`server/rooms/index.js`, around line 108) inherits
  the bot's element and must keep doing so — a human's preference cannot
  apply retroactively to a takeover.
- Presentation: this is the first screen a player sees, so it's the natural
  home for the later theming pass (§6) — but don't theme it yet, theming
  comes after this ships, so the same surface isn't styled twice.
- Show each element with its `chibi_*` atlas art (already shipped, already
  wired for the in-match hero sprites) and its special structure, so the pick
  is informative, not just four labeled buttons.

### Done when

A player can pick an element and get it when free; a taken pick degrades
silently to an assigned one with clear feedback; bots still fill all four
slots; mid-match bot promotion is untouched; no change to how elements map
to abilities.

---

## Method — do not skip

**Verify before claiming.** `npm test` baseline going in is **942 tests, 940
pass, 2 pre-existing skips**.

**Sandbox browser cannot render.** `document.hidden` means no screenshots,
ever, and `window.innerWidth`/`innerHeight` read 0. Verification is
state-level: pump `window.__game.loop.step(t)` with a monotonically
increasing `t` to advance scenes and phases, drive lobby buttons with
`element.click()` from `javascript_tool` (the browser pane's own click tool
refuses on a 0-size viewport), and read DOM/game state directly with
`javascript_tool`. See the 2026-09-01 palette-thumbnails session transcript
for the exact recipe if needed — same pattern applies here for driving the
lobby through element selection into a running match.

**Publishing is a separate step from committing, and is Philip's call.**
This repo can never take a plain `git push` — `test/harness/store/` holds
~1.6GB of balance data with files over GitHub's 100MB hard limit. Use the
plumbing recipe recorded in memory
(`elementia-publish-to-render-recipe.md`): build a throwaway index, read the
target tree, strip `test/harness/store`, write a new tree, `commit-tree` on
top of `origin/master`, push the resulting SHA. Never `git checkout` in this
repo for any reason — switching branches with the store tracked vs untracked
makes git refuse to move ~29 huge files.

---

## Key files

```
docs/plans/2026-08-30-playtest-ui-specs.md   §5, lines 352-396 — READ FIRST
server/rooms/index.js                        firstFreeElement(), ~lines 41-45 and ~108 (bot promotion)
client/index.html                            lobby markup, lines 47-74
client/src/main.js                           ~line 57, reads payload.element
shared/constants.js                          CREATE_ROOM / JOIN_ROOM event names
client/src/assets/manifest.js                ELEMENT_ATLAS_KEY — chibi_* art already wired
```

---

## Recommended setup

- **Model: Opus 5.** This touches the wire protocol and a load-bearing server
  invariant (all 4 element slots always filled, bots covering the rest) —
  the kind of work where a wrong assumption is expensive, not routine
  client-only implementation like the palette thumbnails were.
- **Subagents: none for the scoping/open-question phase.** Once scope is
  confirmed, the client (lobby screen) and server (message handling) halves
  could run as two Sonnet 5 subagents if the session wants to parallelize —
  but they share one wire contract, so keep them synchronized rather than
  fully independent; a cold subagent on either side would need the same
  CREATE_ROOM/JOIN_ROOM field spelled out explicitly.
- **Review before merge, two roles:**
  - **Front-end (Sonnet 5)** for the new lobby screen itself.
  - **Engineer (Opus 5)**, specifically on the wire-protocol change and the
    fallback-when-taken logic — a race on element assignment (two players
    picking the same element at once) is exactly the kind of thing that's
    easy to get subtly wrong.

---

## Remaining playtest items after this one

Only theming (§6) is left after character select ships. Per the backlog's own
sequencing note: theming must not lighten the board (the ground was rendered
at a deliberate dusk value so sprites read against it — see
`elementia-map-tile-theme-decision` in memory) and should be done last so it
styles the final set of surfaces, including whatever character select adds,
exactly once.

---

## Session state

The pre-existing, unrelated WIP is still sitting in the working tree,
untouched, for a fourth session running: `tools/art/ground_pipeline.py`
modified, plus 20 untracked PNGs under `art/source/water_special_fx/` and
`art/source/wind_special_fx/`. Nobody has said whether to keep or discard
these. Worth asking Philip directly rather than leaving it a fifth time.
