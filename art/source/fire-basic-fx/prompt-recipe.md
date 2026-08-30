# Fire saber extension basic FX source recipe

## Stable references

- Fire palette and saber identity: `art/source/calibration/fire.png`
- Shared FX silhouette, outline, and 64 px readability: `client/public/art/earth_basic_fx.png`, `water_basic_fx.png`, and `wind_basic_fx.png`
- Output: two isolated source concepts on perfectly flat solid `#ff00ff`; never include the hero body or a sprite sheet.

## Extension prompt

Use case: stylized-concept  
Asset type: individual game VFX animation source frame  
Input images: Fire hero palette/saber identity plus Earth, Water, and Wind basic-FX style references.  
Scene/backdrop: perfectly flat solid `#ff00ff` chroma-key background with no gradient, texture, shadow, reflection, glow spill, or floor.  
Primary request: one isolated Fire hero saber-extension effect, a compact horizontal flame blade pointing right from a tight origin at center-left toward a clean tapered tip.  
Subject: white-hot cream core, saturated golden-yellow inner flame, vivid orange-red outer flame tongues, restrained ember flecks, and crisp dark burnt-orange local outlines. It reads as a magical short saber extension, not a thrown fireball or generic explosion.  
Style/medium: polished 2D chibi-anime game VFX matching Elementia's crisp outlined, clean cel-shaded, subtly hand-painted storybook art.  
Composition/framing: exactly one horizontally centered effect with generous symmetric padding, stable straight directional axis, complete silhouette, compact enough for centered 64 x 64 conversion, and no edge contact.  
Avoid: hero; body parts; hands; sword hardware; hilt; scenery; ground; smoke cloud; text; logo; border; watermark; sprite sheet; multiple effects; magenta inside the effect.

## Impact prompt

Use the same references, backdrop, palette, medium, padding, and exclusions. Create one isolated compact Fire saber impact burst: a tight radial star-shaped contact flash with a white-hot cream center, golden-yellow spokes, orange-red flame-petal rim, six restrained ember flecks, and burnt-orange local outlines. It reads as a small melee contact burst, not a fireball, bonfire, smoke cloud, or large explosion.

## Sequence and direction contract

- `extend_00..05`: centered right-facing source grows monotonically from ignition to full short saber reach.
- `impact_00..03`: centered radial contact flash grows to peak and contracts/fades.
- The atlas is authored once facing right and declares `orientation: actor_facing`; runtime rotates the centered effect for `down`, `up`, `left`, and `right`, matching the existing basic-FX practice without quadrupling the fixed 10-frame contract.

## Review gates

- Exactly one isolated effect per source and no hero anatomy or weapon hardware.
- Fire palette and shared crisp outlined/cel-shaded rendering family.
- Complete silhouette, uniform magenta corners, no crop, and readable mass after 64 px conversion.
- Ten centered, untrimmed RGBA frames with 2 px horizontal gutters; final impact frame visibly lighter than peak.
