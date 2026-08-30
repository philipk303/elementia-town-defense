# Water & Wind special-cast FX — GPT Image prompt recipe

Fills the last gap noted in `docs/assets/graphics-inventory.md`: Water's Whirlpool/Tidal Wave
and Wind's Wind Blast/Gale Dash currently play only a generic color ring (no dedicated sprite).
This generates one shared burst effect per element for the special-cast animation state
(`CHARACTER_STATE.SPECIAL`, `client/src/render/AnimationController.js`) — both Q and its L4
second currently trigger the same `SPECIAL_CAST` event, so one atlas per element covers both.

Same technical contract as the existing basic-attack FX (`art/source/water-basic-fx/`,
`art/source/wind-basic-fx/`) — copy their `flight_00-03` / `impact_00-02` / `dissipation_00-02`
frame-count and canvas conventions exactly so no new code is needed to load or play them.

## Stable references to attach

- Water: `art/source/calibration/water-reference-v1.png`, `art/source/water-basic-fx/` (style match)
- Wind: `art/source/calibration/wind.png`, `art/source/wind-basic-fx/` (style match)

## Prompt — Water special (`water_special_fx`)

> Create one isolated Whirlpool water-special effect on a square canvas, matching the painted
> storybook cel-shaded style of the reference Water Palm basic-attack effect. The effect is a
> swirling vortex of translucent aqua water with a bright cyan-white core and rounded droplets
> orbiting inward, clean dark-cyan accent lines, soft cel shading. No hero body, hands, scenery,
> text, border, watermark, shadow, reflection, or floor plane.
>
> Use a perfectly uniform solid `#ff00ff` chroma background with generous padding. Keep the
> effect centered on one stable origin (the caster's own position, not a thrown/aimed effect)
> and fully inside the canvas. Do not use magenta within the effect.
>
> State progression (match this exactly):
> - `flight_00` through `flight_03`: the vortex spins up from a small central swirl to its
>   maximum radial extent, water visibly pulling inward toward center.
> - `impact_00` through `impact_02`: the vortex collapses to a bright compact splash at center,
>   peak brightness, then begins settling.
> - `dissipation_00` through `dissipation_02`: residual droplets and mist fade outward and
>   thin, monotonically lighter each frame, ending nearly empty.
>
> 10 frames total, each a separate 64x64 (or larger square, downscaled later) image, stable
> center, no cropped mass in any frame.

## Prompt — Wind special (`wind_special_fx`)

> Create one isolated Wind Blast wind-special effect on a square canvas, matching the painted
> storybook cel-shaded style of the reference Wind fan-blade basic-attack effect. The effect is
> a radial burst of pale wind wisps and curved gust-lines exploding outward from a bright
> white-blue core, soft cel shading, light painted texture. No hero body, hands, scenery, text,
> border, watermark, shadow, reflection, or floor plane.
>
> Use a perfectly uniform solid `#ff00ff` chroma background with generous padding. Keep the
> effect centered on one stable origin (the caster's own position, radial/omnidirectional, not
> aimed) and fully inside the canvas. Do not use magenta within the effect.
>
> State progression (match this exactly):
> - `flight_00` through `flight_03`: the burst expands from a tight bright core to its maximum
>   radial extent, wisps trailing outward in all directions.
> - `impact_00` through `impact_02`: the outer wisps reach peak spread and brightness, then
>   begin thinning.
> - `dissipation_00` through `dissipation_02`: wisps fade and scatter, monotonically lighter
>   each frame, ending nearly empty.
>
> 10 frames total, each a separate 64x64 (or larger square, downscaled later) image, stable
> center, no cropped mass in any frame.

## After generation — registering in the game

Run the frames through the same Pillow conversion the basic FX used
(`tools/art/wind_pipeline.py` / the water-basic-fx conversion script — reuse the existing
chroma-key-to-alpha, trim, and atlas-pack steps unmodified) to produce:

- `client/public/art/water_special_fx.png` + `.json`
- `client/public/art/wind_special_fx.png` + `.json`

Then two small code changes complete the wiring (same pattern as `water_basic_fx`/
`wind_basic_fx` in this session's work):

1. Add both keys to `ATLASES` in `client/src/assets/manifest.js`.
2. In `GameScene._playAtk`'s `SPECIAL_CAST` branch, call
   `this._spawnAttackFx(ELEMENT_ATLAS_KEY[element] === 'chibi_water' ? 'water_special_fx' : 'wind_special_fx', a.x, a.y)`
   (or an explicit per-element map) instead of doing nothing after `onSpecial`.

Bring the generated frames back and I'll do that wiring pass.
