# Earth basic FX source recipe

## Contract

- Output: one square, centered effect source per call on perfectly flat solid `#ff00ff`.
- Matrix: `flight` 4, `impact` 3, `dissipation` 3.
- The existing `flight` schema name visually represents a short ground-hugging pressure ripple, not a boulder projectile.
- Hero, body parts, hammer, clothing, text, scenery, and floor planes never appear.

## Base prompt

Use case: stylized-concept  
Asset type: individual game VFX animation source frame  
Scene/backdrop: perfectly flat solid `#ff00ff` chroma-key background with no gradient, texture, shadow, reflection, or floor.  
Subject: one compact Earth-element basic-attack effect centered in frame, using deep earth brown, muted ochre, warm dust tan, restrained gray stone chips, and dark local outlines.  
Style/medium: polished 2D chibi-anime game VFX matching Elementia's crisp outlined, clean cel-shaded, subtly hand-painted storybook art.  
Composition/framing: effect centered with generous padding; compact enough for a 64 x 64 centered conversion; no edge contact.  
Constraints: preserve a readable low horizontal ground-ripple silhouette and restrained particle count. The background must remain exactly uniform and must not appear inside the effect.  
Avoid: hero; character; hands; hammer; weapon; large detached rock; meteor; realistic explosion; fire; water; wind; lightning; aura; scenery; ground plane; text; logo; border; watermark; sprite sheet; multiple effects.

## Frame phases

- `flight_00`: tight ochre-brown pressure knot beginning to spread horizontally with two tiny stone flecks.
- `flight_01`: short low crescent ripple extending outward, still compact and centered.
- `flight_02`: widest ground-hugging ripple with restrained gray chips and no large boulder.
- `flight_03`: ripple compressing toward the contact point before impact.
- `impact_00`: compact squared-stone contact burst beginning, with a strong dark-brown core.
- `impact_01`: peak compact impact with muted ochre rim, several small gray chips, and no screen-filling dust.
- `impact_02`: impact collapsing inward; chips descending.
- `dissipation_00`: small chips and warm dust falling toward center.
- `dissipation_01`: fewer, smaller fragments with reduced opacity and mass.
- `dissipation_02`: final faint brown-ochre dust flecks almost fully gone.

## Review gates

- Correct phase and compact centered bounds.
- Exact Earth palette and shared outline/rendering family.
- No hero art, hammer art, detached boulder, scenery, floor, or unrelated element motif.
- Uniform magenta corners and no cropped effect pixels.
- Save under the exact requested filename.
