# Art asset generation pipeline (Nano Banana 2 → Pillow → game)

**Status:** planning only — no generation or pipeline code written yet. Written to hand off to a
new session for the art-generation phase.

**Status amendment (2026-07-26):** the pipeline design is approved and calibration sources are work in progress; production conversion and runtime integration are not complete.

**Amendment (2026-07-25):** [`../superpowers/specs/2026-07-25-art-direction-and-runtime-asset-integration.md`](../superpowers/specs/2026-07-25-art-direction-and-runtime-asset-integration.md) is the approved visual and runtime-integration authority. Its 1280 x 736 Phaser playfield (40 x 23 tiles at 32 px) overrides any ambiguous source-art sizing choice in this plan.

## Context

Phase 7 (`docs/reviews/2026-07-24-phase7-programmer-review.md`, commit `4fd9c0b`) shipped the
art-loading architecture with an empty asset manifest: `client/src/assets/manifest.js` documents the
intended keys, `client/src/scenes/Preload.js` loads whatever's listed there, and
`client/src/render/sprites.js`'s `entitySprite()`/`styleable()` fallback means dropping real PNG+JSON
atlases in requires **no other code change** — GameScene's render loops already branch correctly.

Philip will generate source art with **Nano Banana 2** (external, not part of any Claude session),
then a Claude Code session builds a **Pillow (Python PIL)** pipeline to convert that art into the
PNG+JSON atlas format the loader expects — a hybrid of the spec's "AI art tool + pixelation/atlas
pipeline" line (§6) and the reference project's pipeline architecture (`C:\dev\ez-ctf\tools\art\` —
fully procedural there via `class_anim.py`/`palette.py`/`pose_cycles.py`, but the atlas-packing +
frame-naming machinery is directly reusable even though the source images are AI-generated here
instead of hand-coded).

## Generation guidance: separate images, edited from one reference — not a multi-pose grid

### Feudal-Asia visual amendment (2026-07-25)

All generated sources follow the approved cozy feudal-Japan/China storybook direction: friendly village-life warmth, chibi-anime proportions, handmade natural materials, and readable fantasy abstractions rather than grim realism. The theme affects source art only. Runtime asset keys, enemy behavior, balance, collision, pathing, wave data, structure logic, and placement footprints remain unchanged.

The existing enemy keys are technical identifiers, not literal Western-fantasy art requirements. `Goblin` is authored as a dirty-mustard Karasu-tengu light runner, `Orc` as a burnt-saffron Oni ashigaru medium bruiser, and `Troll` as a deep-ochre Mountain-oni heavy. Structure sources use compact timber, bamboo, plaster, tile, stone, rope, and cloth forms derived from Japanese and Chinese building language while preserving every locked runtime footprint.

A single image containing multiple poses in a grid is unreliable at game-sprite scale: image models
don't hold strict grid alignment, cells bleed/vary in scale, and fixing one bad pose means
regenerating the whole sheet and risking drift in the poses that were already good.

Instead: generate **one clean reference pose** per element (e.g. idle-front), then generate every
other pose as an **edit of that reference** ("same character, now mid-swing," "same character from the
side") rather than an independent fresh prompt. Nano Banana's strength is character-consistent
editing — using it for edits keeps proportions/colors/style locked across poses, which is the same
consistency ez-ctf got for free from a shared palette + one drawing function, achieved here through
the generation method instead of code.

Each source image can be full-resolution/clean; Pillow does the pixelation/downscale/palette-reduction
step afterward, so there's no need to generate at final pixel-art resolution.

## Asset inventory (from code, not the spec's prose)

| Category | Assets | Count | Source |
|---|---|---|---|
| Enemies | Goblin, Orc, Troll | 3 | `client/src/theme.js` `ENEMY_BASE` |
| Structures (generic) | Hall/castle (visible princess), Barricade, Snare Post, Watchtower, Farm, Marketplace | 6 | `STRUCTURE_COLORS` + spec §6 |
| Element specials | Earth/Fire/Water/Wind special structure | 4 | `STRUCTURE_COLORS` `*_SPECIAL` |
| Combo structures | Magma Trap, Firestorm, Muddy Bog, Blizzard, Steam Vent, Grinder | 6 | `STRUCTURE_COLORS` |
| Projectile | Fireball | 1 | `server/game/abilities.js` — only call site of `spawnProjectile` in slice 1; no other special spawns a projectile |
| Characters | 4 elements × chibi rig | see tiers below | `manifest.js` `ELEMENT_ATLAS_KEY` |

Elite enemies reuse the base enemy image scaled up in code (spec: "no new rig") — not a separate asset.
Static assets (enemies/structures/projectile) need **no animation frames** — 20 single images total.

### Historical character pose tiers (superseded)

- **Minimal — 12 images.** 1 pose × {idle, attack, downed} × 4 elements, no directional facing
  (matches today's non-directional placeholder circle).
- **Standard (recommended) — ~48 images.** {idle, walk, attack, special-cast, downed} × 2 directions
  (left/right, mirror for the flip) × 4 elements.
- **Full ez-ctf parity — ~80+ images.** Same 5 poses × full 4-directional (down/up/left/right) × 4
  elements, matching `Preload.js`'s existing `<anim>_<dir>_<idx>.png` frame-naming convention exactly.

**Tier not yet decided** — Philip wants to see Nano Banana's edit-consistency on one element before
committing.

## Pipeline stages (to build in the art-generation session)

1. **Ingest** — source images (Nano Banana output) land in a working directory, one per pose/element.
2. **Pixelate/downscale** — reduce to the chibi rig's target sprite resolution; palette-reduce for a
   consistent pixel-art look across all elements (avoid ad hoc per-image color counts).
3. **Background removal / trim** — transparent background, trimmed bounding box per frame (matches
   TexturePacker's `trimmed`/`spriteSourceSize` fields already read by `Preload.js`).
4. **Atlas pack** — assemble each element's frames into one PNG + a TexturePacker-hash JSON, frame keys
   following `<anim>_<dir>_<idx>.png` so `Preload.js`'s `buildAnimsForAtlas()` auto-generates the
   Phaser animations with no further code change.
5. **Drop-in** — output to `client/public/art/`, add the 4 entries to `ATLASES` in
   `client/src/assets/manifest.js` (and `IMAGES` entries for the 20 static assets). This is the only
   code touched — per Phase 7's design, GameScene needs no changes.

## Approved animation integration amendment (2026-07-25)

The former pose-tier choice is resolved in favor of the full runtime contract: `{idle, run, cast, hurt, death}` x 4 directions x 4 hero variants, with 2–6 frames per state. Frame keys are exactly `<state>_<down|up|left|right>_<idx>.png`. Generate individual, consistent pose edits from a per-element reference pose; do not request AI-generated sprite sheets.

Stages 4–5 must preserve a common foot baseline, 64 x 64 frame canvas, nearest-neighbor pixels, frame padding, and trim metadata; no frame may crop or shift its runtime anchor. The earlier “only code touched” constraint is superseded by Phase 8.9: wire Phaser animation-state selection in `GameScene` from authoritative/interpolated runtime state while preserving the fallback-shape path and existing status rendering.

Before the batch pass, run an **engine-faithful scale spike** in a disposable Phaser scene on the actual 1280 x 736 / 40 x 23 / 32 px grid. Load representative Fire, Wind, and all three yokai/oni enemy visuals through their unchanged `Goblin`/`Orc`/`Troll` runtime keys; drive idle/run/cast/downed/dead from fixture runtime state; inspect atlas anchors, HUD/grid overlap, elite scaling, and missing-asset fallback at desktop and landscape-phone presentation. Record the accepted scale/origin and real canvas captures. AI-generated scene mockups are not runtime previews and cannot pass this gate.

## Locked source, scale, and static-asset amendment (2026-07-25)

**Generator decision:** GPT Image is the primary source generator because its transparent-PNG and high-fidelity edit workflow reduces conversion risk. Nano Banana remains optional for concept/reference variants. Neither is a runtime-art substitute: all output is source material, normalized and reviewed by the Pillow pipeline.

**Scale gate:** start the Phaser spike with the calibration set before generating the production batch: Fire and Wind hero frames (64 x 64 canvas; 28-32 px wide by 40-46 px tall opaque target); the unchanged Goblin/Orc/Troll runtime slots, visually authored as Karasu-tengu/Oni ashigaru/Mountain-oni, at 24 x 24 / 28 x 28 / 32 x 32; Barricade/wall and Farm at 32 x 32; Watchtower at 32 x 48 over a 1 x 1 tile base; and Town Hall at exactly 64 x 64 over its current 2 x 2 footprint. `elementia-scale-calibration.png` is a scale-study reference only; Phaser screenshots are the acceptance evidence.

**Conversion contract:** normalize hero sources to untrimmed 64 x 64 RGBA canvases, retain a shared source baseline, and prove one explicit Phaser origin mapping against collision-center world coordinates. Final runtime pixels use nearest-neighbor filtering. Pack the first spike without trim; only enable TexturePacker trimming after Phaser proves its metadata preserves the exact anchor across all frames.

**Scope boundary:** all player-buildable structures remain 1 x 1 and the Hall remains 2 x 2. The Watchtower gets visual height, not a 2-tile gameplay footprint. A 2 x 2 tower or a 3-4-tile Hall is separate gameplay/UI architecture work: shared footprint data, placement and overlap, client hit-testing/centering, HP bars, hall placement/respawn formulas, and tests.

## Redesign inventory amendment (2026-07-26)

This amendment supersedes the fixed “20 static images,” five-state hero atlas, static-structure, and all-buildables-are-1x1 assumptions above.

`art/assets-manifest.json` becomes the authoritative production ledger. It records runtime key, source/reference paths, GPT Image prompt/edit lineage, license where applicable, footprint, visual bounds, anchor/origin, orientation/direction support, animation/effect states, Pillow-conversion status, runtime-integration status, and visual-QA evidence.

### Updated inventory

- **Characters:** four atlases with `{idle, run, attack, cast, hurt, death}` in four directions. `attack` is the distinct class basic; `cast` is initially reused for both specials.
- **Character effects:** Earth sweep, Water palm, Fire saber extension, and Wind wind-up/release/fan/impact.
- **Enemies:** Goblin/Orc/Troll runtime slots, visually authored as Karasu-tengu/Oni ashigaru/Mountain-oni; elites reuse and scale the base assets.
- **Generic/economy structures:** Hall, Barricade, Snare Post, Watchtower, Farm, Marketplace.
- **Element structures:** Rock Trap, Firepit, Water Geyser, Wind Vortex, using unchanged `*_SPECIAL` runtime IDs and display aliases.
- **Fusions:** Volcano (`MAGMA_TRAP`), Firestorm, Muddy Bog, Blizzard, Steam Vent, Grinder.
- **Projectiles:** Fireball and Wind fan blade.
- **Shared presentation:** placement/footprint/range/direction/cooldown/charge/fusion/status indicators plus reusable elemental particles and telegraphs.

### Footprint contract

- Barricade and Watchtower: blocking 1x1.
- Snare Post: walkable 1x1.
- Element combat structures: walkable 2x1 or 1x2.
- Fusions: walkable 2x2.
- Hall: 2x2.

Source art declares gameplay footprint separately from visual overhang. Pillow output and Phaser origins keep HP bars, selection, direction, and effect geometry aligned with those footprints.

### Animation and effect split

- Bake character and mechanical structure motion into atlases.
- Use pooled runtime particles for repeatable fire, steam, wind, water, snow, smoke, and debris.
- Use procedural client geometry for exact ranges, footprints, direction, cooldown, charge, and confirmation state.
- Give each structure a static base plus only gameplay-critical states: Watchtower recoil; Snare pulse; Firepit flame/flare; Rock warning/fall/impact; Geyser compress/launch; Vortex idle/suction/release; Steam pressure/confusion; Volcano charge/eruption; Firestorm charge/volley; Bog entry/root; Blizzard warning/spike/shatter; Grinder intake/crush/release.

### Revised calibration gate

Retain the existing Fire/Wind hero, enemy, Barricade, Farm, Watchtower, and Hall scale set. Add three complete presentation slices before batch production:

1. Wind basic — locomotion plus wind-up/release/projectile/impact.
2. Rock Trap — locked telegraph, fall, and impact.
3. Wind Vortex — multi-tile orientation, idle/suction/release phases, and directional effects.

These slices establish scale, palette, frame count, origins, effect density, animation timing, and worst-case performance in the real Phaser playfield. The user approves them before production batching.

## Model recommendation

**Sonnet 5** for the Pillow pipeline itself — well-specified port of `tools/art/class_anim.py`'s
atlas-packing/frame-naming machinery, adapted to post-process externally-generated images instead of
drawing from scratch. Same risk profile as Phases 2/5/7 (data/pipeline work with a proven template).
Prompt-crafting for Nano Banana happens outside Claude Code entirely, so no Claude model choice
applies there.

Use **Claude Opus 5 if selectable, otherwise the current `opus` alias**, only for difficult animation-controller integration or calibration failures surviving two disciplined Sonnet attempts. Use **Codex GPT-5.6 Terra** for one batched pipeline/runtime review after the three calibration slices. The user approves visual direction and production batching; Codex Sol is not scheduled for routine asset work.

## Parallel with Phase 8?

**Yes.** Phase 8 (`docs/plans/2026-07-18-slice1-implementation-plan.md` — Opus 4.8) touches
`server/game/*` (balance tunables), `shared/balance.js`, `test/`, `client/test/e2e_smoke.mjs`
(Playwright), and `render.yaml`. The art pipeline touches a new `tools/art/**` directory,
`client/public/art/**` (new files), and a narrow, additive edit to `client/src/assets/manifest.js`.
Zero file overlap except that one manifest edit, which Phase 7 specifically architected to be a safe,
isolated drop-in (the fallback path degrades gracefully regardless of manifest state) — the same
"disjoint files → safe to run as two parallel sessions" reasoning the implementation plan already uses
for "Phase 5 ∥ Phase 7 asset-pipeline prep" (line ~182 of that doc).

Practical recommendation: run them as two separate sessions (optionally separate git worktrees to avoid
any commit-ordering friction), and do one `npm test` + browser smoke pass after both land, since
neither session's automated tests will exercise the other's changes.
