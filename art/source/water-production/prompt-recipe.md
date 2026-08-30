# Water production source recipe

## Stable references

- Identity authority: `art/source/calibration/water-reference-v1.png`
- Pose/camera authority: the same-named accepted Wind production frame
- Technical authority: `docs/superpowers/specs/2026-07-31-wind-production-atlas-and-basic-fx-design.md`

## Base generation prompt

Use case: stylized-concept  
Asset type: individual game-character animation source frame  
Primary request: preserve the Water heroine's exact identity while changing only direction, pose, and motion for the named frame.  
Subject: young chibi martial artist; bright sapphire hair in one high ponytail; aqua eyes when visible; fitted blue-and-white crossover tunic; short split overskirt panels; deep-navy tapered martial trousers; wrapped forearms and ankles; blue cloth shoes; broad sash with one circular spiral-water buckle and small gold fasteners; unarmed.  
Style: polished 2D chibi anime game art with cozy hand-painted storybook warmth, clean dark-blue linework, soft cel shading, lightly textured brush finish, and compact readable proportions.  
Composition: one full-body character centered on the same square canvas, orthographic game-sprite presentation, complete ponytail/hands/feet visible, generous consistent padding, feet aligned to one shared visual ground line.  
Backdrop: perfectly flat solid `#ff00ff` chroma background; no shadow, gradient, texture, reflection, floor, scenery, or lighting variation.  
Constraints: exactly one character, two arms, two hands, two legs; anatomically coherent fingers; one high ponytail, never twin tails; no weapon, fan, sword, staff, armor, text, border, watermark, aura, detached water, projectile, impact effect, scenery, motion blur, or extra props. Do not crop any body part or costume panel.

## Direction rules

- `down`: front-facing game view; face, buckle, tunic closure, both hands, and both feet readable.
- `up`: true rear-facing game view; no front face or chest/buckle details; ponytail must not hide the feet.
- `right`: strict right-facing side/three-quarter game view with consistent screen-right travel and attack intent.
- `left`: separate source file made by validated mirroring of accepted right sources; regenerate independently if tunic closure, hand action, or ponytail motion becomes misleading.

## State progression

- `idle` 00-01: relaxed ready stance; subtle breathing/weight shift; empty hands.
- `run` 00-03: contact, passing, opposite contact, opposite passing; compact stride; ponytail secondary motion; feet remain readable.
- `attack` 00-03: Water Palm preparation, forward open-palm release, follow-through, recovery. Water itself is never baked into the hero frame.
- `cast` 00-03: centered two-hand whirlpool-channel pose, energy-gather, controlled release gesture, recovery. No detached water or aura in the hero frame.
- `hurt` 00-01: readable recoil then partial recovery; no gore.
- `death` 00-03: stagger, controlled fall, ground contact, still resting pose; non-graphic and cozy.

## Review gates per frame

- Identity, costume geometry, palette, ponytail tie, and spiral buckle match the identity authority.
- Direction and state read at 64 x 64 nearest-neighbor scale.
- Hands remain unarmed; attack frames show an open-palm strike.
- No water effect is baked into the hero source.
- Full silhouette stays inside the canvas with generous magenta separation.
- Flat magenta border samples remain removable by the Pillow pipeline.

## Accepted source normalization

The generator framed thirteen grounded idle/run sources below the shared production scale target. Their untouched outputs are preserved in `art/source/water-production-raw-scale-drift/`. `normalize_source_subject` scales only the isolated subject to 1000 source pixels tall, preserves the original ground contact and square canvas, and writes the accepted derivatives into this directory. Exact lineage is recorded in `source-normalization.json`.
