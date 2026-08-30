# Elementia Town Defense Art Direction & Runtime Asset Integration

**Status:** approved direction for Slice 1. This document is the visual source of truth for the asset pass and the Phase 8.9 integration work; it refines, but does not expand, the Slice-1 gameplay scope.

## Visual north star

Elementia is a **cozy East Asian storybook fantasy** drawing from feudal Japanese and Chinese clothing, architecture, folklore, and craft. Its proportions and warmth follow a friendly village-life visual language: rounded forms, handmade details, inviting natural materials, and expressive chibi-anime characters rather than historical realism or grim warfare. The rendered pixel art uses clear silhouettes, restrained texture, and bright elemental accents against a soft natural world. Heroes have oversized heads, compact bodies, expressive hair, and easily legible weapons. Pixel treatment must preserve intentional clusters and strong outlines rather than simulate low resolution with blur or noisy dithering.

This theme amendment is visual only. Existing runtime identifiers, enemy roles, stats, movement, collision, pathing, waves, abilities, structure behavior, placement footprints, and networking contracts do not change to match the art. Names such as `Goblin`, `Orc`, and `Troll` remain stable technical keys even when their authored visuals become East Asian yokai or oni.

Gameplay readability wins every tie: element, facing, state, targetability, and tile occupancy must remain clear at a landscape-phone scale. AI-generated images are source material only. They are not scene mockups, layout references, or evidence that the Phaser game is ready to ship.

## Canonical runtime space and scale

The runtime authority is Phaser's existing playfield: **1280 x 736 px = 40 x 23 tiles at 32 px per tile**. The whole map remains visible with no scrolling camera. All scale and animation decisions are validated in this coordinate system, not in an image generator's composition.

| Asset class | Runtime rule |
| --- | --- |
| Players | 64 x 64 atlas frame canvas; opaque hero silhouette approximately 28–36 px wide and 36–46 px tall; feet anchored at the authoritative world position. A hero may overlap neighboring tiles visually but does not change its gameplay radius. |
| Goblin / Orc / Troll | Distinct 24–36 px-wide silhouettes, each centered on its authoritative position. Elite presentation uses the existing runtime scale multiplier only; it does not alter collision radius or add a new rig. |
| Single-tile structures | 32 x 32 px tile footprint, with controlled decorative overhang only where it cannot obscure build-state or adjacent placement. |
| Town hall | 64 x 64 px gameplay footprint (2 x 2 tiles); a roof/banner may overhang, while the visible princess remains readable. |
| Projectiles and effects | Sized to their existing gameplay contact/readability needs; they must not hide player feet, tile edges, health bars, or nearby enemies. |

Nearest-neighbor scaling only. No smoothing, fractional source scaling, or source-image crop that moves a frame's foot anchor. Texture padding and frame bounds must prevent atlas bleed.

## Character direction

All four heroes share one chibi human proportion language, but each is a baked, authored variant rather than a generic tint.

- **Fire:** male hero with saturated orange hair in a topknot, orange armor with ember detail, and a long saber. His silhouette leads with the saber and topknot, not a generic fire aura.
- **Wind:** female hero with pale-cyan flowing hair, a pale-cyan/off-white robe with a dark outline, and compact fans. Her robe and hair flow should read without making her footprint ambiguous.
- **Water:** blue hair and small droplet/flow accents; keep the silhouette grounded and distinct from Wind's flowing robe.
- **Earth:** brown hair and stone-fleck accents; favor a compact, grounded silhouette distinct from Fire's saber and Wind's fans.

Fire's orange, Water's blue, Earth's brown, and Wind's pale-cyan-white token retain their existing UI/FX roles. Wind is never bare pure white: its sprite, badge, and effects need a dark outline or dark local contrast.

## Feudal-Asia yokai enemy family

The three existing gameplay slots become a related yokai/oni raiding force. They differ first by silhouette and weight, then costume and weapon, then dominant unit color. Their yellow-to-ochre body palettes must separate clearly from the muted sage battlefield, while vermilion, indigo, straw, wood, and dark-umber equipment tie them to the shared feudal-Asia setting.

| Runtime slot | Authored visual | Silhouette and role | Gear | Weapon |
| --- | --- | --- | --- | --- |
| `Goblin` | Karasu-tengu runner | Low, manic, spring-loaded square crouch with compact folded wings and taloned feet | Tokin cap, light yamabushi layers, leggings, straw sandals, courier pouch; dirty mustard feathers | Short straight blade held close and horizontal |
| `Orc` | Oni ashigaru bruiser | Broad shoulders and squared medium-weight stance; small horns must not add height | Partial shoulder armor, sash, cropped feudal field clothing; burnt-saffron hide | Heavy ono axe or cleaver held inside the 28 x 28 envelope |
| `Troll` | Mountain-oni heavy | Tallest, bulkiest square silhouette with long arms and a grounded stance | Crude wood-and-rope harness over simple yamabushi/worker layers; deep-ochre hide | Oversized kanabo or stone maul contained inside the 32 x 32 envelope |

Do not solve the family difference through color alone or give all three near-identical swords. Each costume is a readable fantasy abstraction, not a claim of strict historical reconstruction and not a mixture of random pan-Asian motifs. Elite status is communicated by the current scale treatment plus a readable gold/bright accent, never by changing the base slot into an unrelated creature.

## Feudal-Asia structure language

Structures use warm timber, bamboo, plaster, fired tile, stone footings, rope lashings, paper or cloth accents, and restrained Japanese/Chinese roof profiles. Barricades remain compact timber/bamboo defenses; Farms use an unmistakable cultivated-field or rice-growing read without adding scenery outside the tile; Watchtowers use a narrow timber yagura-inspired vertical silhouette over the existing 1 x 1 base; and the Town Hall reads as a welcoming fortified magistrate/manor hall with the visible princess retained. Decorative roofs, banners, eaves, stairs, crops, and fences never imply a larger placement footprint than the locked gameplay base.

## Animation contract

Generate 4-direction frames for every hero: `idle`, `run`, `cast`, `hurt`, and `death`, named exactly `<state>_<down|up|left|right>_<frame>.png`. Use 2–4 frames for idle/hurt/death and 4–6 for run/cast; the existing atlas loader determines the final Phaser rate. The lowest opaque pixels in every standing frame share the same foot baseline. Left-facing frames may mirror right only when weapon/handedness and costume detail remain acceptable; otherwise author them.

Runtime integration must select an animation state from real game state, not from asset metadata or a staged GIF:

1. `death` has priority when the player is dead; `hurt` represents downed/revive feedback without hiding its current tint/alpha semantics.
2. A server-confirmed ability/action event selects `cast` for its bounded duration.
3. Movement direction comes from the interpolated authoritative displacement; retain the last non-zero facing while idle.
4. `run` plays while moving, otherwise `idle` loops.
5. Existing status tint, alpha, health bars, depth, interpolation, and fallback shapes remain valid with real sprites loaded.

The asset pass may add the minimal snapshot/event fields required to make these states deterministic for every client. It must not infer attack or cast from client input alone, and it must not modify collision, pathing, or combat timing to fit a visual asset.

## Engine-faithful asset-scale spike

Before batch generation, build a disposable in-engine Phaser test scene using the actual 1280 x 736 canvas, shared `TILE_SIZE`, map grid, camera settings, player/enemy positions, hall, and HUD/bar depths. It loads one representative Fire hero, one Wind hero, and one each of Goblin/Orc/Troll from the candidate atlas/image pipeline.

The spike is a scale and integration check, not a visual mockup. It must exercise idle/run/cast/downed/dead states from fixture snapshots/events and capture the actual game canvas at desktop 1280 x 736 and the supported landscape-phone presentation. Review these conditions in the engine:

- Fire's topknot and saber, Wind's hair/robe/fans, and each greenskin's weapon read in motion at normal play scale.
- Player feet, enemy centers, hall footprint, health bars, build grid, and click/placement affordances remain unobscured.
- Atlas frames do not shimmer, crop, bleed, or jump at their foot anchor; direction and state transitions do not restart every snapshot.
- Elite scaling preserves the 1-tile corridor visual read and the pre-existing gameplay radius cap.
- Placeholder fallback still works if an atlas/image fails to load.

Record the selected frame scale, anchors/origins, source files, build command, and screenshots in the asset-pass result. Reject and adjust source/crop/scale if any criterion fails; do not tune the scene composition in an AI tool to make a still image look acceptable.

## Locked calibration amendment (2026-07-25)

The following dimensions are locked for the first real Phaser scale spike: hero frames use a 64 x 64 canvas with a 28-32 px wide by 40-46 px tall opaque target; the `Goblin`/Karasu-tengu, `Orc`/Oni ashigaru, and `Troll`/Mountain-oni slots are 24 x 24 / 28 x 28 / 32 x 32; Barricade/wall and Farm are 32 x 32; Watchtower is 32 x 48 visually over a 32 x 32, 1 x 1 gameplay base; and Town Hall is exactly 64 x 64 over its existing 2 x 2 footprint. The Hall and Watchtower must be loaded in the spike alongside Fire, Wind, and all three enemy slots.

GPT Image is the primary source generator for its transparent PNG and high-fidelity editing workflow. Nano Banana is optional for concept/reference variants. Pillow owns normalization to RGBA, fixed canvas placement, palette/pixel conversion, and validation. The initial spike uses untrimmed hero frames; TexturePacker trimming is permitted only after a Phaser proof confirms that metadata keeps every anchor unchanged.

No multi-tile construction change is authorized by this asset pass. All player-buildables remain 1 x 1, and the Hall remains 2 x 2. A 2 x 2 tower or 3-4-tile Hall requires a separate gameplay/UI architecture amendment covering footprint data, placement, hit-testing, render centering, health bars, hall positioning/respawn formulas, and tests.

## Deliverables and non-goals

Deliver: an art bible-compliant prompt/reference pack, four hero atlases, the 20 static Slice-1 images, reproducible Pillow conversion/packing, manifest registration, runtime animation-state wiring, and the spike record. Retain source art outside the public runtime directory; only final optimized PNG/JSON ships under `client/public/art/`.

Out of scope: AI-generated full-map screenshots, camera/layout changes, new enemy rigs for elites, animation-driven gameplay, and changes to the authoritative 40 x 23 / 32 px grid.
