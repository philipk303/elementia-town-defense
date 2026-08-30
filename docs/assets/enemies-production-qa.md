# Enemies (Goblin/Orc/Troll) production QA

No dedicated QA record was recovered for these three assets from any source branch (unlike
`earth-production-qa.md`/`fire-production-qa.md`/`firepit-production-qa.md`/
`wind-vortex-production-qa.md`, all of which exist). This note is written fresh, against the
files actually landed in this branch, to satisfy the runtime-asset-integration-gate's evidence
requirement rather than leave these three assets QA-undocumented.

## Provenance

- Goblin: `art/source/enemies/goblin-source.png` -> `client/public/art/goblin.png`
- Orc: `art/source/enemies/orc-source.png` -> `client/public/art/orc.png`
- Troll: `art/source/enemies/troll-source.png` -> `client/public/art/troll.png`

All three recovered from `codex/asset-wiring-prep` (primary recovery source, per the
2026-08-08 recovery task). No conversion tool for these three was found in the repository —
the runtime PNGs are used as delivered, not regenerated.

`codex/orc-oni-art-integration` (commit `bc51c89`) independently produced a byte-different
`orc.png` (1932 bytes vs. this package's 1944 bytes, both 28x28 RGBA) with its own
asset-contract test and design doc (`docs/superpowers/specs/2026-08-08-orc-oni-asset-integration-design.md`,
pulled into this branch for provenance only). That version was **not** used here — the task's
designated primary recovery source is `codex/asset-wiring-prep`, and its `orc.png` is what's
registered.

## Verification performed (2026-08-08, this session)

Direct PNG decode (IHDR + zlib-inflated IDAT, Node, no external image library) confirmed for
each file:

| File | Dimensions | Color type | Corner alpha | Opaque pixels |
|---|---|---|---|---|
| `goblin.png` | 24x24 | RGBA (6) | 0,0,0,0 | 342 |
| `orc.png` | 28x28 | RGBA (6) | 0,0,0,0 | 404 |
| `troll.png` | 32x32 | RGBA (6) | 0,0,0,0 | 460 |

All three match their manifest-declared target dimensions exactly (24x24 / 28x28 / 32x32,
per `art/assets-manifest.json`'s `enemy_goblin`/`enemy_orc`/`enemy_troll` `pillow.contract`
fields), have a genuine alpha channel with fully transparent corners, and have a plausible
amount of opaque foreground content (not blank or fully-opaque canvases).

## Registration

`client/src/assets/manifest.js`'s `IMAGES` array now includes all three; `enemyArtKey(0/1/2)`
already mapped to `goblin`/`orc`/`troll` before this change, so no other code was touched —
`entitySprite()` picks up the real sprites automatically wherever the placeholder circles were
rendering, elites included (`reuse_base_scaled` policy, unchanged).

## What this does NOT verify

- No visual/aesthetic review — nobody has looked at these rendered at gameplay scale.
- No Phaser scale-spike: the combined Goblin/Orc/Troll gate from
  `docs/plans/2026-07-24-art-asset-generation-pipeline.md` ("Required calibration evidence")
  is still open. That gate requires a live screenshot at the real 1280x736/40x23/32px grid
  with HUD/grid overlap, elite scaling, and fallback behavior all demonstrated — none of
  which a static file check can prove.
- No confirmation that the visual direction (Karasu-tengu / Oni ashigaru / Mountain-oni)
  matches what was actually approved, beyond the source filenames' naming.
