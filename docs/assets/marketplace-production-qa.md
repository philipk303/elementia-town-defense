# Marketplace production QA

Date: 2026-08-09

- Target branch: `codex/redesign-reconciliation`
- Source: `art/source/marketplace/marketplace-source-draft-v2-2x2.png`
- Runtime package: `client/public/art/marketplace.png`
- Runtime key: `marketplace`
- Footprint: 2 x 2 non-walkable

## Conversion checks

- Removed the flat magenta source background with `remove_chroma_key.py` using border auto-key sampling, soft matte, and despill.
- Downscaled the extracted source to the static 64 x 64 RGBA runtime package with Pillow nearest-neighbor sampling.
- Pillow inspection observed `64x64 RGBA`, alpha `0` at all four corners, and 1,847 non-transparent pixels (1,835 fully opaque).

## Focused validation

```powershell
node --test test/game/structures.test.js test/assetDelivery.test.js
```

Observed outcome: 32 tests passed, 0 failed. The focused tests prove the 2 x 2 placement/collision footprint and that the packaged `marketplace` image exists, is declared in the ledger, and is registered through `IMAGES` for Preload.

## Target-branch verification

- `npm test`: 669 passed, 0 failed, 2 skipped.
- `npm run build`: succeeded. Vite reported its existing large-chunk advisory; no build error occurred.

## Open visual gate

The static art is runtime-registered. A manual Phaser playtest for in-game scale and readability remains open; do not describe this asset as gameplay-integrated until that visual check is recorded.
