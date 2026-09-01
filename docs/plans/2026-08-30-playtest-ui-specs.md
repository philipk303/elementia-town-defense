# Playtest UI/UX Specs — 2026-08-30

Six items from the first human playtest (tablet, touch, hosted build). Each is
specified independently so they can be picked up, deferred, or dropped without
touching the others.

Ordering recommendation is in §7. Facts below were read out of the code on
2026-08-30, not assumed; file:line references are to that state.

## Status — updated 2026-08-31

| item | state |
|---|---|
| §1 structure art sizing | **DONE** 2026-08-30 (`0ac69f2` and the four commits before it) |
| §3 controls list | **DONE** 2026-08-31 (`6303f31`, folded into the MENU in `3898c85`) |
| §4a pause overlay | **SUPERSEDED** — became the MENU (`3898c85`) |
| §4b real pause | **WILL NOT DO** — dropped 2026-08-31 |
| restart | **DONE** 2026-08-31 (`3898c85`) — restart the MATCH, same room, anyone may press |
| §2 build palette thumbnails | open — next per §7 |
| §5 character select | open |
| §6 theming | open, deliberately last |

### What shipped instead of a pause

Pause was dropped. In its place, `client/src/ui/menuPanel.js` is a **MENU**
holding the controls list and a RESTART MATCH button, opened from two doors: a
MENU button in the build palette's control row, and a docked MENU button that
replaces it during the action phase. The action-phase button sits in the same
`--ep-dock` strip as the palette rather than floating over the board, because
every canvas corner is already occupied; docking makes overlap impossible by
construction. `visibleMenuDoor()` on the palette is the seam between them.

The two §8 decisions were taken on 2026-08-31:

- **Restart the MATCH, in the same room** — not the wave. Adds one wire event,
  `RESTART_MATCH`. This is the protocol change the touch work froze; it has
  sign-off.
- **Anyone in the room may press it.** The griefing tradeoff was put and
  accepted explicitly. The client requires a confirm step, so a misclick is not
  enough; the server does not gate on identity, only on a 3s per-room cooldown
  so a held button cannot make it rebuild the world repeatedly.

Two things the spec did not anticipate, both found by building it:

1. A phase can turn over while the panel is open, which swaps which door
   exists, so the button that opened it may be gone by the time it closes.
   `close()` falls back to whichever door is on screen.
2. **A finished run used to destroy its room instantly** (`loop.js` onEnd →
   `destroyRoom`), which would have made a restart button useless at the exact
   moment a player most wants one. A finished room now waits out a five-minute
   grace window with its loop stopped, and its cleanup timer is cleared on
   every teardown path — room codes are reusable, so a stray timer could
   otherwise destroy a different room later.

Verified live and in tests: 941 tests, 939 pass, 2 pre-existing skips,
including four end-to-end netcode assertions in `test/net/restart.test.js`.

---

## 1. Structure art is squashed and undersized on the map

**Status: this is a real rendering defect, not just an art-quality opinion.**
Measured, not guessed.

### What's actually wrong

`GameScene.js:2201-2202` sizes every structure sprite by calling
`setDisplaySize(w * TILE_SIZE - 4, h * TILE_SIZE - 4)` — the footprint
rectangle. `structureDisplaySize()` (`client/src/render/structureVisuals.js`)
passes that straight through for every type except an active Water Geyser.

`setDisplaySize` does **not** preserve aspect ratio. Art authored taller than
its footprint gets vertically crushed:

| Structure | Art frame | Drawn at | Aspect skew |
|---|---|---|---|
| BARRICADE | 32×32 | 28×28 | 0% |
| FARM | 32×32 | 28×28 | 0% |
| MARKETPLACE | 64×64 | 60×60 | 0% |
| MAGMA_TRAP | 128×128 | 60×60 | 0% |
| BLIZZARD | 64×64 | 60×60 | 0% |
| EARTH_SPECIAL | 64×32 | 60×28 | +7% |
| **WATCHTOWER** | **48×64** | **28×28** | **+33%** |
| **FIRE_SPECIAL** | **96×64** | **60×28** | **+43%** |
| **WATER_SPECIAL** | **64×64** | **60×28** | **+114%** |

The Water Geyser is drawn at less than half its authored height. The existing
`WATER_SPECIAL && state === 'active'` special-case in `structureVisuals.js`
that force-returns `height: 64` is a band-aid over exactly this bug — it fixes
the one state someone noticed and leaves the idle state crushed.

Separately, opaque-pixel coverage within each frame was measured. Most art
fills its frame acceptably (76–91%). One outlier:

- **`farm.png` occupies only 22×22 of its 32×32 frame** — 69% of the width,
  69% of the height, 47% of the area. It is genuinely drawn small.
- Everything else: barricade 100%W/91%H, marketplace 97%/75%,
  blizzard 94%/84%, watchtower 81%/94%, earth_special 94%/75%,
  magma_trap 88%/74%.

### Third factor: absolute size

`TILE_SIZE = 32` (`server/game/grid.js:4`), map is 40×23 tiles = 1280×736,
FIT-scaled to the viewport. On a tablet the map scales *down*, so a 1×1
structure lands around 25–28 CSS px. Most structure art is authored at exactly
1 tile = 32px native (barricade, farm, marketplace, blizzard), so it cannot be
scaled up without going soft. Magma Trap and Firepit are already authored at 2×.

### Proposed work, in order of cost

1. **Fix the aspect crush (code only, no new art).** Change
   `structureDisplaySize()` to fit-inside-footprint while preserving the art's
   own aspect, anchored to the footprint's bottom edge so a tall building
   overhangs upward the way the Geyser's active state already does. This alone
   corrects Watchtower, Firepit and Geyser.
   - Risk: overhanging art can occlude the tile above it. Depth ordering
     within `structureLayer` must sort by `gy` or tall structures will render
     in front of things that are in front of them.
   - The `WATER_SPECIAL` active special-case should be deleted as part of this,
     not kept alongside it.
2. **Re-crop `farm.png`** so the barn fills its tile like Barricade does.
   Cheap; one asset.
3. **Decide the resolution policy.** Either accept 1× art (fast, stays soft on
   large screens) or re-author the 1× assets at 2× (64px per tile) to match
   Magma Trap/Firepit. This is the expensive option and should be a separate
   decision, not bundled into 1 or 2.

### Explicitly out of scope

Changing `TILE_SIZE` or the footprints themselves. Footprints are gameplay
constants shared with the server (`shared/constants.js:113`), wired into
balance, pathing, and the harness corpus. Making structures "bigger" must be a
**rendering** change, not a footprint change, or every balance number retires.

### Done when

Watchtower, Firepit and Geyser render at their authored aspect ratio; farm
fills its tile; no structure overlaps another's footprint art; existing tests
still pass.

---

## 2. Build palette has no structure thumbnails

*Rewritten 2026-08-31 with measurements taken from the shipped art and the
generated content-box table. The frame-picking question §7 flagged is resolved
below — it needs no build step and no new art.*

### What's there now

`client/src/ui/buildPalette.js` builds one DOM button per buildable type. Each
button holds three text spans: `shortLabel(type)` (e.g. `ROCK TRAP`, `GEYSER`),
the gold cost, and a disabled-reason line. No image element anywhere.

The DOM-not-Phaser decision is deliberate and documented (`buildPalette.js`
header): Phaser-drawn UI shipped 7.6px touch targets under `Scale.FIT`, so this
panel is authored in real CSS pixels with a 44px minimum target. **Thumbnail
work stays inside DOM and must not shrink that target.**

### The nine buildables and their art, measured 2026-08-31

`BUILDABLE_TYPES` is nine entries. Fusions are NOT among them — they are
created by combining placed structures, never picked from the palette — so they
are out of scope here.

| type | art key | kind | file | frame |
|---|---|---|---|---|
| BARRICADE | `barricade` | image | `art/barricade.png` | 32x32 |
| SNARE_POST | `snare_post` | atlas | `art/snare_post.png` | 64x64, 2 frames |
| WATCHTOWER | `watchtower` | atlas | `art/watchtower.png` | 48x64, 2 frames |
| FARM | `farm` | image | `art/farm.png` | 32x32 |
| MARKETPLACE | `marketplace` | image | `art/marketplace.png` | 64x64 |
| EARTH_SPECIAL | `earth_special` | atlas | `art/earth_special.png` | 64x32, 3 frames |
| FIRE_SPECIAL | `fire_special` | atlas | `art/fire_special.png` | 96x64, 8 frames |
| WATER_SPECIAL | `water_special` | atlas | `art/water_special.png` | 64x64, 20 frames |
| WIND_SPECIAL | `wind_special` | atlas | **`art/wind_vortex.png`** | 64x64, 20 frames |

Note the last row. The `wind_special` key loads `wind_vortex.png`/`.json`.
**Resolve every file through the manifest (`client/src/assets/manifest.js`,
`structureArtKey()`), never by guessing from the key** — that exact mistake
measured a stale unregistered file earlier in this project.

### Resolved: slice the sheet in CSS, do not export thumbnails

Everything needed already exists at runtime, so there is no build step:

- **Which rectangle to show.** `client/src/render/contentBoxes.js` (GENERATED —
  regenerate with `tools/art/measure_content_boxes.mjs`, never hand-edit)
  already holds `CONTENT_BOX[key] = {x, y, w, h, frameW, frameH}`: the box the
  visible pixels occupy inside the frame. Showing the content box rather than
  the frame is what stops a thumbnail rendering as mostly blank — `farm` fills
  22x22 of its 32x32 frame, `barricade` 32x29 of 32x32.
- **Where that frame sits on the sheet.** For an atlas, add the frame's
  position on the sheet to the frame-local content box. Read it from Phaser's
  texture manager, which has it loaded by the time the palette is built:
  `scene.textures.get(key).get(frameName)` gives `cutX/cutY/cutWidth/cutHeight`.
  For a plain image the frame IS the file, so the offset is zero.
- **Keep the palette Phaser-free.** `buildPalette.js` owns DOM and holds no
  game state by design. GameScene should compute the rects and pass plain
  numbers in at creation — the palette must not import Phaser to do this.

Then each thumbnail is a `<span>` with `background-image`, `background-size`
scaled by `targetPx / box.w`, and `background-position` at the negative offset
of the box's absolute position. Add `image-rendering: pixelated` or the
upscaled pixel art blurs.

### Which frame: prefer the south-facing idle

Use the first frame whose name starts with `idle`, **except** take `idle_S*`
when a south variant exists, so directional structures face the viewer rather
than away. Measured picks:

```
snare_post     idle_0.png
watchtower     idle_0.png
earth_special  idle_down_0.png
fire_special   idle_00.png        (4 idle frames, first)
water_special  idle_S_0.png       sheet rect x=132 y=0 64x64
wind_special   idle_S_0.png       sheet rect x=132 y=0 64x64
```

This is the same "fit on the RESTING pose" rule `measure_content_boxes.mjs`
already applies (`/^idle/`), for the same reason: an active or telegraph frame
sizes a structure by its loudest moment. The `idle_S` preference is the one new
judgement call and is cosmetic — change it in one place if it looks wrong.

### Constraints that must not be regressed

- **44px minimum on every target.** A thumbnail makes buttons TALLER, which is
  safe; it must never make them narrower.
- **The dock grows with the buttons.** The palette publishes its height as
  `--ep-dock` and the canvas is fitted above it, capped at 40% of viewport
  height. Taller buttons over nine wrapped entries eat board space on a phone —
  measure the dock at 375px wide before and after, and if it approaches the cap
  the thumbnail is too big.
- **Disabled state is an explicit dimmed palette, not opacity.** Opacity
  compounded with `.ep-why`'s own and dropped the reason text to 2.67:1. Dim
  the thumbnail with a filter or a second background layer that does not stack
  with it.
- **`aria-label` already carries name, cost and refusal reason.** The thumbnail
  must be `aria-hidden="true"` (or `alt=""`) so a screen reader does not
  double-read the button.
- **Selection is carried by border weight plus background, not hue alone.**
  Do not let a thumbnail become the only selected-state signal.

### Done when

Every buildable button shows its own art, sliced from the shipped sheets with
no new asset files; targets stay >=44px; the palette still fits at 375px wide
and the dock has not grown into the cap; the accessible names are unchanged;
and the disabled dimming still leaves the reason text legible.

---

## 3. No controls list anywhere

> **SHIPPED 2026-08-31** as part of the MENU (`client/src/ui/menuPanel.js`).
> The section below is the original problem statement, kept for context.

### What's there now

There is no controls/help surface in the game at all. The bindings exist only
in code:

- Movement `W/A/S/D`, special `Q`, second `E`, repair `F` (`GameScene.js:493-503`)
- `1`–`9` select buildable, `R` rotate, arrows set output direction
  (`GameScene.js:529-557`)
- `Y`/`N` answer a fusion proposal (`GameScene.js:542`)
- `M` mute, `[` / `]` resize HUD (`GameScene.js:516-528`)
- Touch: twin sticks + DOM build palette + tap-to-ghost confirm
  (`client/src/input/touchControls.js`)

`inputHints` is already exported from `touchControls.js` — check whether it
already holds usable strings before writing new ones.

### Proposed work

One shared "Controls" panel, authored in DOM for the same reason the build
palette is, reachable from two places:

- a button in the build palette's control row (build phase), and
- the pause overlay from §4 (action phase).

It must render the **touch** scheme or the **keyboard** scheme depending on
what the player is actually using. `GameScene` already tracks this:
`_noteSchemeUsed('desktop')` flips a hybrid device back to the desktop scheme
on any real keypress (`GameScene.js:510`), and `prefersTouchFirst` picks the
initial scheme. Reuse that state — do not add a second notion of input mode.

### Done when

Both schemes are documented, the panel opens and closes from both entry points,
it reads the live input scheme rather than a guess, and it never covers the
build palette's own controls.

---

## 4. No pause button in the action phase

> **RESOLVED 2026-08-31 — pause was DROPPED.** 4a became the MENU; 4b is
> will-not-do. Restart shipped instead: restart the MATCH, same room, anyone
> may press. See the status table at the top. The "needs a decision" text
> below is stale.

### The constraint that shapes this

The sim is **server-authoritative at 60 Hz** (`server/game/loop.js`) and a room
is **always 4 slots**, with bots filling every seat a human isn't in
(`server/rooms/index.js:173-186`). There is no offline/solo mode — even a
single-player game is a networked room.

So "pause" cannot be a client-side freeze; the server would keep simulating and
the client would snap forward on resume. A real pause means the server stops
ticking that room.

### Recommendation: split it into two features

**4a. Pause overlay that does NOT stop the sim (do this first).**
A button that opens the §3 controls panel over the running game. Safe,
useful, no protocol change, no multiplayer semantics. This alone covers most of
the value — the stated reason for wanting pause was to read the controls.

**4b. Real pause (needs a decision before it's specified further).**
Stopping the tick is a server feature and raises questions this spec cannot
answer alone:
- Who may pause — anyone, or the host only?
- What happens to other humans in the room? (Being frozen by a stranger is a
  grief vector.)
- Gate it to rooms with exactly one human, and just refuse otherwise?
- New wire events are needed (`PAUSE_REQUEST`/`PAUSED`/`RESUMED`), which is a
  protocol change — the standing rule from the touch work was *no wire-protocol
  change*, so this deliberately breaks that and needs sign-off.

**Recommendation: build 4a now, decide 4b separately.** Do not let 4b block it.

### "Restart wave"

Also a server action, and more invasive than pause: it must roll back wave
state, gold spent, structures built and destroyed during the wave, or else
define itself as "restart the whole match" instead. Cheapest honest version is
**restart the match**, not the wave. Worth confirming which one is actually
wanted before any implementation — they are very different jobs.

### Done when (4a only)

A visible, ≥44px pause/help control exists during the action phase; tapping it
opens the controls panel; the game keeps running behind it; closing it returns
cleanly; no server or wire change.

---

## 5. No character/class select screen

### What's there now

Element is **auto-assigned, never chosen**. `firstFreeElement()`
(`server/rooms/index.js:41-45`) hands out the first element in canonical order
not already taken; the same function fills bot seats. The client is simply told
which one it got (`main.js:57`, `payload.element`).

The lobby (`client/index.html:47-74`) is a name box, a timing dropdown, a
friendly-fire checkbox, and create/join buttons — described in its own comment
as the "Minimal Phase-1 lobby overlay (full UI is a later phase)."

### Proposed work

Let the player pick an element before creating/joining, with the server as the
authority on conflicts.

- Client sends a *preferred* element with `CREATE_ROOM`/`JOIN_ROOM`.
- Server honours it when free, otherwise falls back to `firstFreeElement()` and
  tells the client what it actually got. Never fail the join over a taken pick.
- The four element slots stay unique and bots keep filling the rest — that
  invariant ("the team is always all 4 elements") is load-bearing and must not
  change.
- Mid-match bot promotion (`server/rooms/index.js:108`) inherits the bot's
  element and must keep doing so; a preference cannot apply there.

Presentation: this is the first screen a player sees, so it is also the natural
home for the §6 theming. Show each element's art (the `chibi_*` atlases already
ship) and its special structure.

### Open question

"Selectable character" may mean elements (what exists) or a broader
class/loadout system (what doesn't). This spec assumes **elements**. If loadouts
are wanted, that is a much larger design job touching balance, and needs its own
spec.

### Done when

A player can pick an element and get it when free; a taken pick degrades
silently to an assigned one with clear feedback; bots still fill all four slots;
no change to how elements map to abilities.

---

## 6. Feudal-Asian theming across title, build screen, and HUD

### What's there now

Everything is programmer-art dark blue. `client/index.html:9-42` is inline CSS
with hardcoded hex (`#0a0e14` background, `#16202c` inputs, `#dfe8f0` text,
monospace everywhere). The build palette repeats the same values in its own CSS
string (`buildPalette.js:30+`). The HUD is Phaser-drawn text and bars inside
`GameScene`. **There is no shared theme layer — colours are hardcoded in at
least three places.**

### Hard constraint from prior work

The map ground layer was deliberately rendered at a **dusk value** so sprites
read against it, and the recorded lesson was that *props must read dark, not
light* (see the map-ground-layer decision). A theming pass that lightens the
board or shifts its value breaks sprite legibility that was tuned on purpose.
**Theme the UI chrome; leave the board's value alone.**

### Proposed work, in order

1. **Extract a theme first.** Pull the hardcoded colours into CSS custom
   properties in one place, consumed by `index.html` and `buildPalette.js`, plus
   a matching JS palette object for the Phaser-drawn HUD. Without this step
   every later change is a three-place edit.
2. **Restyle the chrome:** title screen, lobby/character select, build palette,
   HUD frame. Type choice matters more than ornament here — the whole UI is
   `monospace` today.
3. **Check contrast after, not before.** The palette's disabled state and the
   fusion/HUD colours were explicitly tuned against WCAG failures
   (`buildPalette.js:57-72` cites 1.4.1 and a 2.67:1 regression). Re-run those
   checks on the new palette; a theme pass is exactly how that regresses.

### Sequencing note

Do this **after** §2 and §5, not before. Theming a build palette that is about
to grow thumbnails, and a lobby that is about to become a character select,
means styling the same surfaces twice.

### Done when

One theme source drives HTML, palette and HUD; the title/lobby/build/HUD read as
one deliberate style; board value and sprite legibility are unchanged; contrast
ratios are no worse than today's.

---

## 7. Recommended order

1. **§1 aspect-crush fix** — smallest change, most visible, pure code, no new art.
2. **§4a pause→controls overlay** + **§3 controls list** — one piece of work;
   the panel is the payload and the pause button is one of its two doors.
3. **§2 palette thumbnails** — self-contained, needs the frame-picking decision.
4. **§5 character select** — touches the wire and the server; do it while the
   lobby is still unthemed.
5. **§6 theming** — last, so it styles the final set of surfaces once.
6. **§1 step 3 (2× art re-author)** and **§4b (real pause / restart)** — both are
   separate decisions, not blockers, and either can be dropped.

## 8. Things that need a decision before implementation

- §4b: who may pause, and what happens to other humans in the room.
- §4: "restart wave" vs "restart match" — very different jobs.
- §5: elements only, or a broader class/loadout system.
- §1 step 3: accept 1× art, or pay to re-author at 2×.
