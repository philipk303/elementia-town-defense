# Fireball asset record

## Deliverable

- Runtime asset: `client/public/art/fireball.png`
- Type: static 24 x 24 RGBA PNG; no atlas metadata (the asset inventory defines projectiles as static single images).
- Source: `art/source/fireball-gpt-image-chromakey.png`
- Converter: `tools/art/prepare_fireball.py`

## Reproduction

```powershell
python tools/art/prepare_fireball.py art/source/fireball-gpt-image-chromakey.png client/public/art/fireball.png
```

The converter removes the source's green chroma key, tight-crops non-transparent pixels, nearest-neighbor scales the result within a 22 x 18 limit, centers it on an untrimmed 24 x 24 RGBA canvas, and writes an optimized PNG.

## Generation prompt

Generated with the built-in image tool using a compact side-on pixel-art Fireball: pale-yellow/white hot core, saturated orange body, deep red-orange outline and three small trailing embers on a flat `#00ff00` chroma-key background. Constraints excluded smoke, shadows, text, scenery, HUD, characters, and full-map mockups.

## QA acceptance criteria

- Transparent corners and a true alpha channel.
- Exact 24 x 24 untrimmed runtime canvas.
- Warm high-contrast core and dark warm outline remain readable at projectile scale.
- Static PNG only; no atlas JSON required or supplied.
- Does not modify `client/src/assets/manifest.js` or gameplay/runtime logic; parent integration registers the asset later.

## Validation evidence

Validated after conversion with Pillow on 2026-08-08:

- `mode=RGBA`; `size=24x24`; alpha bounding box `(1, 5, 23, 18)`.
- All four corners have alpha `0`.
- File size: `644` bytes.
- SHA-256: `a7f45f48fa3fc8a645e6dee1d762c6576fbeb58f6b8c29247d64c5d5177c4add`.
