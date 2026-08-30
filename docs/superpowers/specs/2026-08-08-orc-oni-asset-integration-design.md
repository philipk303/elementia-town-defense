# Orc Oni Asset Integration Design

## Goal

Integrate the approved Japanese oni reinterpretation as the game's static Orc
enemy art without changing gameplay, rendering behavior, collision, or elite
handling.

## Scope

- Convert the approved source candidate into one 28 x 28 RGBA runtime PNG.
- Place only the optimized runtime PNG in `client/public/art/`.
- Register the `orc` image in the existing static-image manifest.
- Add an asset-contract test that verifies the Orc key, manifest entry, and
  runtime file.
- Commit the source-independent runtime asset and its narrow integration.

## Asset contract

`client/public/art/orc.png` is a static 28 x 28 RGBA PNG. Its opaque artwork
is centered with a one-pixel bottom margin so the existing sprite origin can
continue to represent the enemy's authoritative world position. It depicts a
green-skinned, broad-shouldered oni with a squared stance, red robe, indigo
shoulder guard, and a legible heavy axe.

`client/src/assets/manifest.js` adds the existing manifest-shaped record for
the `orc` key. `enemyArtKey(1)` therefore resolves through the existing Orc
mapping without any code-path changes.

## Validation

The asset-contract test verifies that the manifest contains the `orc` key and
that its declared PNG exists under `client/public/art/`, is 28 x 28 RGBA, has
a transparent corner, and has non-transparent foreground pixels.

## Deferred integration gate

The required Phaser scale spike remains a combined Goblin/Orc/Troll gate. The
Goblin and Troll assets are being produced in separate sessions, so this
change deliberately does not create an Orc-only spike or alter the shared
scene. Once all three static assets are integrated, the combined pass must
validate enemy centers, tile readability, HUD overlap, and elite scaling on
the real 1280 x 736 / 32 px tile canvas.

## Non-goals

- No new enemy animations or rigs.
- No elite-specific art or gameplay changes.
- No changes to `theme.js`, collision radii, enemy movement, or combat timing.
- No registration of source images outside the one final runtime PNG.
