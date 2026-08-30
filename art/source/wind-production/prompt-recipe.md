# Wind production source recipe

## Stable references

- Identity reference: `art/source/calibration/wind.png`
- Accepted motion references: the nearest matching files in `art/source/wind-vertical-slice/`
- Output: one square, full-body source illustration per call; never request a sprite sheet or pose grid.

## Base generation prompt

Use case: identity-preserve  
Asset type: individual game-character animation source frame  
Input images: Image 1 is the immutable Wind identity reference; Image 2 is the nearest accepted pose/style reference.  
Primary request: render the same Wind heroine in the requested direction, animation state, and pose phase.  
Scene/backdrop: perfectly flat solid `#ff00ff` chroma-key background.  
Subject: the same chibi young adult Wind heroine with pale-cyan flowing hair, large cyan eyes when visible, an off-white and pale-cyan flowing robe, navy-and-gold belt and diamond ornament, white boots with gold/navy trim, and compact paired folding fans.  
Style/medium: polished anime/chibi game-character illustration matching the references exactly; crisp dark local outlines and clean cel shading.  
Composition/framing: one character only, full body visible, centered, consistent apparent scale, generous padding, feet or contact point clearly visible.  
Constraints: preserve facial identity, chibi proportions, hair mass and color, robe construction, belt geometry, ornament placement, boots, paired-fan design, palette, outline weight, and rendering style. Change only camera-facing direction and the requested pose phase. The background must be one perfectly uniform color with no shadows, gradients, texture, floor plane, reflections, wind particles, scenery, text, logo, border, or watermark. Do not use `#ff00ff` within the subject.  
Avoid: identity drift; older or younger appearance; realistic anatomy; extra limbs, fingers, fans, ornaments, or fabric panels; cropped hair, sleeves, robe, fans, or feet; detached accessories; motion blur; aura; projectile; impact effect; sprite sheet; multiple poses.

## Direction rules

- `down`: direct front view matching the accepted calibration slice.
- `up`: direct rear view; no front-facing eyes or facial features; preserve recognizable hair, robe back, belt, boots, and paired fans.
- `right`: clear right-facing profile/three-quarter game direction with consistent body axis and contact point.
- `left`: derive non-destructively from accepted right sources when mirrored handedness remains readable; otherwise author independently with the same constraints.

## State progression

- `idle` 00-01: subtle grounded breathing and hair/robe settling.
- `run` 00-03: contact, passing, opposite contact, passing; readable alternating legs; no floating cycle.
- `attack` 00-03: compact fan-blade basic wind-up, release, follow-through, recovery. The projectile is never baked into the hero frame.
- `cast` 00-03: larger special-cast preparation, peak fan/arm gesture, release, recovery; no detached FX.
- `hurt` 00-01: readable recoil and guarded recovery; no gore or injury marks.
- `death` 00-03: loss of balance, controlled fall, contact, settled downed pose; non-graphic and fully contained.

## Review gates per frame

- One character and one pose only.
- Identity and costume match the stable reference.
- Direction and state phase read without labels.
- Full silhouette and contact point are inside the source image.
- Flat magenta border samples remain removable by the Pillow pipeline.
- Source is saved non-destructively under its exact production filename.

## Reuse for future heroes

Reuse the individual-frame workflow, naming matrix, source separation, 64 x 64 conversion, baseline/origin handling, atlas padding, 1x/3x preview, tests, and ledger stages. Substitute only the approved class identity, palette, asymmetric equipment/handedness rules, attack silhouette, and effect recipe. Reopen architecture design only when states/counts, canvas/origin rules, runtime behavior, or atlas schema changes.
