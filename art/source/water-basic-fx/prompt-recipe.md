# Water Palm basic FX source recipe

## Stable references

- Character palette/style: `art/source/calibration/water-reference-v1.png`
- Release timing anchor: `art/source/water-production/attack_down_01.png`
- Technical frame/canvas authority: `art/source/wind-basic-fx/`

## Base generation prompt

Create one isolated Water Palm effect on a square canvas. The effect is a compact, hand-launched crescent of translucent aqua water with a bright cyan-white core, rounded storybook droplets, clean dark-cyan accent lines, soft cel shading, and lightly painted cozy texture. No hero body, hands, scenery, text, border, watermark, shadow, reflection, or floor plane.

Use a perfectly uniform solid `#ff00ff` chroma background with generous padding. Keep the effect centered on one stable origin and fully inside the canvas. Do not use magenta within the effect.

## State progression

- `flight_00-03` (presented as `release`): palm-sized water curl gathers, forms a forward crescent, reaches maximum compact extension, then narrows into contact. The hero body is never included.
- `impact_00-02`: centered splash contact, rounded radial crown at maximum size, then collapsing droplets.
- `dissipation_00-02`: small suspended droplets and fading spiral mist diminish monotonically to a nearly empty final frame.

## Review gates

- Stable center and readable visible mass at 64 x 64.
- No cropped splash or droplet.
- No character anatomy or environmental element.
- Release direction is horizontal and may be velocity-aligned at runtime.
- Final dissipation frame is visibly lighter than every prior frame.
