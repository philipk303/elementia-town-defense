# Wind Production Atlas and Basic FX Design

**Date:** 2026-07-31  
**Status:** Approved for implementation planning

## Purpose

Complete the Wind hero's production source set and atlas while preserving the approved calibration identity, then complete the Wind basic visual slice with a shared fan projectile/effect atlas. Validate both in the isolated Phaser preview without registering them in gameplay or changing gameplay behavior, networking, balance, or audio.

## Authoritative inputs

- `art/assets-manifest.json` is the authoritative graphics ledger.
- `art/source/calibration/wind.png` is the stable Wind identity reference.
- The 14 accepted down-facing files in `art/source/wind-vertical-slice/` are immutable calibration sources.
- `tools/art/wind_pipeline.py` owns chroma removal, normalization, baseline placement, validation, and atlas packing.
- `client/wind-preview.html` is the engine-faithful isolated review surface.
- The inherited hard pipeline contract remains 64 x 64 untrimmed RGBA hero frames, nearest-neighbor display, and a shared standing foot baseline at y=56. The 28-32 px wide by 40-46 px tall standing target is an architecture-derived occupancy target tied to the 32 px tile and 14 px player radius, not a Phaser or atlas-format limit.

## Approaches considered

1. **Recommended: bounded production atlas plus shared FX atlas.** Preserve the accepted cadence, author only the required frames, permit left mirroring only when handedness remains visually valid, and use one shared FX atlas for projectile flight, impact, and dissipation. This minimizes drift and duplication while satisfying the current contracts.
2. **Minimal frame atlas.** Reduce locomotion and action states to two or three frames. This lowers generation cost but weakens motion readability and discards the approved four-frame cadence.
3. **Expanded high-frame atlas.** Use six or more frames for most actions. This adds generation cost, atlas size, and identity-drift risk without a clear benefit at the game's 64 px source and normal display scale.

## Hero source and frame contract

The production Wind atlas contains 80 frames. Each direction has the following fixed budget:

| State | Frames | Playback intent |
| --- | ---: | --- |
| `idle` | 2 | loop |
| `run` | 4 | loop |
| `attack` | 4 | one-shot basic wind-up and release pose |
| `cast` | 4 | one-shot special cast |
| `hurt` | 2 | one-shot reaction |
| `death` | 4 | one-shot transition ending in a settled pose |

Directions are `down`, `up`, `left`, and `right`. Names are exactly `<state>_<direction>_<idx>.png` with zero-based, two-digit indices. Existing accepted down-facing idle, run, attack, and cast files are reused byte-for-byte. New source files live outside `client/public/` in a production Wind source directory. Generation references the stable identity image and the nearest accepted pose; it must retain pale-cyan flowing hair, off-white/pale-cyan robe, dark local outline, navy-and-gold belt details, compact paired fans, chibi proportions, and magenta chroma background.

Standing frames share the y=56 foot baseline after conversion. `hurt` and `death` may extend above that baseline only during airborne motion, but their grounded/contact frames use it. Directional silhouettes must read at normal game scale. Right-facing sources may be mirrored into separate, non-destructive left-facing source files only when fan handedness, robe closure, and asymmetric ornaments remain acceptable; otherwise left is authored independently.

### Production scale interpretation

The accepted calibration atlas used a shared scale of `0.04890829694323144` and produced 32-46 px wide by 50-56 px tall opaque bounds. That preview established identity, motion, chroma removal, and baseline behavior, but its 3x display did not pass the locked gameplay-scale occupancy gate. Production conversion therefore uses a fixed scale of approximately `0.0402`, chosen to bring the calibration set's maximum opaque height to about 46 px while preserving the y=56 baseline.

At actual 1x gameplay scale, grounded idle/run body height must remain 40-46 px. The 28-32 px width target describes the collision-footprint/body read; flowing hair, robe hems, and open fans may exceed it as controlled visual overhang when they do not obscure feet, tile edges, labels, nearby actors, or placement affordances. Automated validation hard-fails wrong canvas, alpha crop, baseline drift, inconsistent scale, and idle/run height outside the target. Overall opaque width is reported as a warning and resolved by the engine-faithful 1x visual gate because pixel bounds cannot distinguish body mass from intentional hair, robe, or fan overhang.

## Wind basic projectile and effect contract

The hero `attack` animation supplies wind-up and release body motion. A separate shared Wind FX atlas supplies ten frames:

- `flight_00` through `flight_03`: centered rotating fan-blade/projectile loop.
- `impact_00` through `impact_02`: one-shot contact burst.
- `dissipation_00` through `dissipation_02`: one-shot fading wind curl.

Flight art is velocity-aligned at runtime, so four directional copies are not created. The projectile uses a stable centered origin; impact and dissipation remain centered on the terminal projectile position. The `wind_basic_effect` ledger entry references the hero attack frames for wind-up/release and the shared FX atlas for flight/impact/dissipation. The `wind_fan_blade` entry references the same FX sources and output rather than duplicating art.

## Pipeline architecture

The existing converter gains an explicit production profile rather than replacing calibration behavior. It discovers and validates an exact expected frame matrix, rejects missing, duplicate, malformed, or unexpected names, preserves one shared scale and baseline, and reports per-frame opaque bounds. Atlas packing is deterministic and includes transparent separation sufficient to prevent nearest-neighbor sampling bleed. Texture metadata remains untrimmed 64 x 64 with stable `spriteSourceSize` and `sourceSize` values.

Hero and FX outputs are distinct:

- `client/public/art/chibi_wind.png` and `client/public/art/chibi_wind.json`
- `client/public/art/wind_basic_fx.png` and `client/public/art/wind_basic_fx.json`

Intermediate converted frames and validation metadata remain in clearly named calibration or build-output directories and do not overwrite accepted sources. Failed validation must stop before replacing a previously valid atlas. Atlas writes use temporary files followed by replacement only after both PNG and JSON are complete.

## Isolated Phaser preview

The standalone Wind preview loads the production hero and FX atlases without adding them to the gameplay asset manifest. It presents a four-direction by six-state review matrix with baseline guides, state/direction labels, nearest-neighbor scaling, looping idle/run, and replayed one-shot attack/cast/hurt/death animations. It includes an actual 1x gameplay-scale view for acceptance and a 3x inspection view for pixel/identity review. A separate lane shows the complete Wind basic sequence: hero attack, velocity-aligned projectile flight, impact, and dissipation.

The preview must make these failures visible: identity drift, direction errors, fan handedness errors, anchor jumps, cropping, atlas bleed, incorrect one-shot looping, and projectile-origin movement. It retains the actual 1280 x 736 canvas and shared grid constants. No camera, gameplay scene, input, networking, or combat behavior changes are authorized.

## Tests and validation

Pipeline tests are written first and must prove:

- the exact 80-frame hero matrix and 10-frame FX matrix;
- malformed, missing, duplicate, and unexpected frame rejection;
- deterministic ordering and atlas metadata;
- 64 x 64 RGBA output, shared y=56 standing baseline, and no cropped opaque pixels;
- opaque-bound reporting and configured standing-size validation;
- atlas separation and atomic output replacement;
- calibration mode remains backward compatible.

Client tests are written first and must prove the preview declarations cover all states and directions, use the correct loop/one-shot policies, and reference every generated frame exactly once. Completion requires the focused Python and Node tests, the full existing test suite, the production client build, and browser inspection of the isolated preview with no console or asset-loading errors.

## Ledger and inventory truth

`art/assets-manifest.json` records all new source lineage and distinguishes source-complete, converted, preview-loaded, visually verified, and gameplay-integrated states. The readable graphics inventory mirrors those facts. The work must not claim gameplay integration because `ATLASES` remains unchanged and production animation-state wiring is outside this task.

## Non-goals

- No gameplay asset registration or animation-controller changes.
- No changes to combat timing, projectile behavior, collision, networking, balance, camera, layout, or audio.
- No Wind Vortex production in this slice.
- No Fire, Earth, Water, enemy, or structure asset generation.
- No trimmed hero frames until a separate Phaser anchor proof authorizes trimming.

## Reuse for future hero classes

Fire, Water, and Earth reuse this pipeline architecture, frame matrix, fixed-canvas metadata, baseline rules, atlas separation, preview structure, automated gates, and ledger stages. Their implementation begins from a short class-specific delta covering identity reference, palette, silhouette, asymmetric equipment/handedness, attack pose, and effects. A new full design cycle is required only when a future hero changes frame states/counts, canvas or origin rules, runtime animation behavior, atlas schema, or another shared technical contract.
