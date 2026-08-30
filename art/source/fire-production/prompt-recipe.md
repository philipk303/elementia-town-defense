# Fire production source recipe

## Stable references

- Identity reference: `art/source/calibration/fire.png`
- Preserved calibration history: `art/source/calibration/fire-reference-v*.png` and matching `*-chroma.png` files
- Output: one square, full-body source illustration per generation; never request a sprite sheet or pose grid.

## Base generation prompt

Use case: identity-preserve  
Asset type: individual game-character animation source frame  
Input images: Image 1 is the immutable accepted Fire identity reference.  
Primary request: render the same Fire hero in the requested direction, animation state, and pose phase.  
Scene/backdrop: perfectly flat solid `#ff00ff` chroma-key background.  
Subject: the same chibi young adult Fire samurai with vivid orange flame-shaped topknot, amber eyes when visible, orange-gold lamellar shoulder and waist armor, dark olive-brown under-robe and sleeves, gold-edged bracers and shin guards, flame crest on the front apron, and one slightly curved saber with orange wave detail.  
Style/medium: polished anime/chibi game-character illustration matching the accepted reference exactly; crisp dark local outlines and clean cel shading.  
Composition/framing: one character only, full body visible, centered, consistent apparent scale, generous padding, feet or contact point clearly visible.  
Constraints: preserve facial identity, chibi proportions, topknot silhouette, armor construction, flame crest, saber geometry, palette, outline weight, and rendering style. The character is anatomically right-handed in every authored down-, up-, and right-facing frame: the right hand is always the primary hand on the saber hilt, while the left hand may support a two-handed pose. In a front/down view, the character's right hand appears on the viewer's left; in a rear/up view it appears on the viewer's right. Change only camera-facing direction and the requested pose phase. The background must be one perfectly uniform color with no shadows, gradients, texture, floor plane, reflections, fire particles, scenery, text, logo, border, or watermark. Do not use `#ff00ff` within the subject.  
Avoid: identity drift; older or younger appearance; realistic anatomy; extra limbs, fingers, swords, armor plates, crests, or scabbards; cropped hair, armor, saber, or feet; detached accessories; motion blur; aura; flame extension; projectile; impact effect; sprite sheet; multiple poses.

## Direction rules

- `down`: direct front view matching the accepted identity reference.
- `up`: direct rear view with no front-facing eyes or facial features; preserve the topknot, rear armor construction, belt, boots, and single saber.
- `right`: clear right-facing profile/three-quarter game direction with a consistent body axis and contact point.
- `left`: derive non-destructively from accepted right sources. Mirrored saber handedness is accepted for this production scope.

## State progression

- `idle` 00-01: grounded ready stance and subtle breathing/armor settling; saber held safely, no swing.
- `run` 00-03: contact, passing, opposite contact, passing; readable alternating legs and counter-swing; no floating cycle.
- `attack` 00-03: compact saber basic wind-up, slash/release, follow-through, recovery; no detached flame extension or impact FX.
- `cast` 00-03: larger special-cast preparation, raised saber/guard gesture, release, recovery; no detached flames, projectile, or impact FX.
- `hurt` 00-01: readable recoil and guarded recovery; no gore or injury marks.
- `death` 00-03: loss of balance, controlled fall, contact, settled downed pose; non-graphic and fully contained.

## Review gates per frame

- Exactly one Fire hero and one pose.
- Identity, armor, topknot, crest, and saber match the accepted source.
- Saber remains in the character's anatomical right hand; the left hand may only support the grip. The separately derived left-facing mirror set is the sole accepted handedness reversal.
- Direction and state phase read without labels.
- Full silhouette and feet/contact point remain inside the source image.
- Flat magenta border remains removable by the Pillow pipeline.
- No detached Fire attack FX is baked into the hero frame.
- Source is saved non-destructively under its exact production filename.
