# Earth production source recipe

## Stable reference

- Identity reference: `art/source/calibration/earth-reference-v1.png`
- Output: one square, full-body source illustration per call; never request a sprite sheet or pose grid.
- Authored directions: `down`, `up`, and `right`.
- Derived direction: every `left` source is a non-destructive horizontal mirror of the accepted matching `right` source.

## Identity-locked base prompt

Use case: stylized-concept  
Asset type: individual game-character animation source frame  
Input images: Image 1 is the immutable Earth identity reference; any additional image is the nearest accepted Earth pose reference.  
Scene/backdrop: perfectly flat solid `#ff00ff` chroma-key background.  
Subject: the same friendly, determined male Earth hero with darker warm tan skin; bald head; wide tied dark-chocolate-brown cloth headband with two short tails; oversized-head compact chibi proportions; extremely broad shoulders, thick bare arms, large hands, sturdy legs; sleeveless deep-brown and warm-umber crossover worker-monk tunic; knee-length brown shorts; tan arm wraps; muted ochre trim; and sturdy tan leather lace-up hiking boots with dark soles. He holds the same huge two-handed wood-and-stone warhammer with a broad squared stone head, dark iron bands, and rope binding.  
Style/medium: polished 2D chibi-anime game-character illustration matching the identity reference exactly; crisp dark local outlines, clean cel shading, subtle cozy hand-painted storybook warmth.  
Composition/framing: one full-body figure centered with all headband tails, hammer, hands, shorts, knees, boots, and contact point visible. The opaque subject fills approximately 86-90% of the source-image height so fixed `0.0402` conversion lands at 40-46 px tall. Keep the hammer diagonally tight to or behind the body and keep the source silhouette within the square.  
Constraints: preserve facial identity, skin tone, bald head, headband color and tails, chibi proportions, build, tunic construction, shorts, boots, palette, hammer construction, outline weight, lighting, and rendering style. Brown remains the dominant costume/player color. Use a coherent two-handed facing-relative power grip: forward hand near the hammer head, rear hand lower on the haft. Change only facing direction and requested pose phase. Background is one uniform color with no shadow, gradient, texture, floor, reflection, or lighting variation. Do not use `#ff00ff` in the subject.  
Avoid: identity drift; hair; beard; black headband; long trousers; sandals; exposed toes; realistic anatomy; heavy armor; extra limbs, fingers, straps, weapons, or hammer heads; cropped silhouette; hidden feet; detached stone, dust, crack, projectile, impact, aura, or attack FX; motion blur; scenery; text; logo; border; watermark; sprite sheet; multiple poses.

## Direction rules

- `down`: three-quarter/down-facing combat view with eyes and expression readable; both boots share a grounded contact line in idle/run.
- `up`: true rear three-quarter/up-facing view; no front-facing eyes or facial features; preserve bald scalp, back of headband and tails, tunic back, shorts, boot heels, hammer, and readable contact point.
- `right`: right-facing profile/three-quarter view; preserve the facing-relative two-handed grip and compact hammer overhang.
- `left`: mirror the matching accepted `right` source with `mirror_source()`; do not regenerate or overwrite the right source.

## State phases per direction

- `idle` 00-01: grounded ready stance; subtle breathing compression then release; hammer held close; identical foot baseline.
- `run` 00-03: compact heavy run cycle: contact, passing, opposite contact, opposite passing; hammer controlled close to the torso; no airborne exaggeration; identical grounded baseline.
- `attack` 00-03: compact hammer wind-up, downward/forward release, contact follow-through, recovery. No detached impact or shockwave.
- `cast` 00-03: brace, plant/press hammer toward ground, held channel, guarded recovery. No cracks, particles, or aura.
- `hurt` 00-01: short recoil and guarded recovery; no detached sweat, stars, dust, or impact marks.
- `death` 00-03: stagger, buckle, grounded side collapse, final still pose; keep the whole body and hammer inside the frame.

## Review gates per authored frame

- Same face, skin, headband, costume, shorts, boots, hammer, palette, and rendering family as the identity reference.
- Correct direction and requested state phase; up-facing frames contain no face leakage.
- Exactly two coherent hands on one hammer; no malformed or extra limbs or gear.
- Brown remains the dominant costume mass at thumbnail scale.
- Full opaque silhouette and contact point remain inside the source with uniform magenta corners.
- No detached effect art appears in hero sources.
- Save non-destructively under the exact production filename.
