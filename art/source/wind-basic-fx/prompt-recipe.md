# Wind basic FX source recipe

## Stable references

- Wind identity and palette: `art/source/calibration/wind.png`
- Fan silhouette: nearest accepted Wind attack source
- Output: one isolated effect per square source image; never include the hero body or a sprite sheet.

## Base prompt

Use case: identity-preserve game-effect source. Render one polished chibi-game Wind fan projectile, impact burst, or fading wind curl using pale cyan, white, navy, and restrained gold accents from the approved Wind heroine and compact folding fans. Center the visible mass at the exact image center with generous, symmetric padding on a perfectly flat solid `#ff00ff` chroma background. Preserve crisp dark local outlines and clean cel shading. No hero, hands, body, scenery, floor, cast shadow, text, logo, border, watermark, motion blur, or unrelated particles. Do not use `#ff00ff` in the effect.

## Sequence contract

- `flight_00..03`: one coherent centered rotating fan-blade loop. Orientation changes; center and visible mass do not travel.
- `impact_00..02`: centered contact burst progressing from compact strike to broad peak to contracting release.
- `dissipation_00..02`: centered wind curl that becomes smaller, thinner, and visibly fainter each frame.
- Velocity alignment is applied at runtime, so no directional copies are authored.

## Review gates

- Exactly one isolated effect and no hero body.
- Fixed center and stable flight mass across the four loop frames.
- Complete silhouette with ample chroma border and no crop.
- Impact expands around the same terminal center.
- Dissipation fades monotonically and remains readable after 64 px conversion.
