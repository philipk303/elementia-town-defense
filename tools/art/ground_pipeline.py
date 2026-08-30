#!/usr/bin/env python3
"""Deterministically draw the map ground layer: one pre-rendered 1280x736 image.

Why a single pre-rendered image rather than a tile set (decision, 2026-08-14):
the brief is ONE continuous north-to-south blend from village outskirts at the
enemy gates to village courtyard at the Hall. Discrete tiles band at every
boundary at 32px, and per-tile tint can only shift colour, not the texture that
distinguishes grass from packed earth. A single image blends natively and costs
the renderer one `add.image(...).setDepth(GROUND_DEPTH)`.

Why procedural rather than generated art: the binding constraint here is VALUE,
not subject matter. Every existing sprite was authored dark against the old
near-black field -- the enemies mean luminance 59-67, the Hall 79, the Farm 94.
A daylight ground (luminance 90-160) sits BRIGHTER than the enemies and erases
their silhouettes. Drawing this procedurally lets the script assert its own
luminance ceiling (see `verify`), which no external generator can promise. The
village therefore reads at dusk. Same approach as generate_rock_trap.py.

The layer is composed as REGIONS rather than an even sprinkle, because evenly
scattered props read as noise while clustered ones read as landscape:

    paddy      far north   flooded rice parcels divided by earth bunds
    treeline   north       cedar copses, boulders, grass tufts
    scrub      midfield    thinning tufts and stones -- the transition
    courtyard  south       flagstone apron, lantern-lined approach, goods,
                           raked gravel and drifted blossom around the Hall

Props are drawn almost entirely BELOW the ground's own value -- silhouette and
shadow, not highlight -- so they add depth without spending contrast the
sprites need. Scatter is excluded from the worn routes, the Hall footprint and
the gate mouths, so it never sits where gameplay reads.

Run:  uv run --with pillow python tools/art/ground_pipeline.py
"""
from __future__ import annotations

import argparse
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'client' / 'public' / 'art' / 'ground.png'

# Mirrors shared/constants.js. Asserted against it by test/groundLayer.test.js.
TILE_SIZE, TILES_W, TILES_H = 32, 40, 23
W, H = TILES_W * TILE_SIZE, TILES_H * TILE_SIZE   # 1280 x 736
HALL_GX, HALL_GY, HALL_W, HALL_H = 19, 21, 2, 2
GATE_GX = (20, 2, 37)                              # CENTER, LEFT, RIGHT

HALL_CX = (HALL_GX + HALL_W / 2) * TILE_SIZE
HALL_CY = (HALL_GY + HALL_H / 2) * TILE_SIZE

SEED = 20260814

# The dusk band. Both endpoints sit near luminance 47-51, below the darkest
# enemy (goblin, 59), so every sprite keeps a light-on-dark silhouette.
# The outskirts are grass, not dirt. Green is held deliberately far down the
# map (see GRADIENT_START/END) and kept green-dominant with the red channel
# well below it, because the enemies and the Earth palette are brown-ochre:
# separating the ground from them by HUE buys legibility that luminance alone
# cannot, given how little luminance range this dusk band has to spend.
NORTH = (30, 52, 32)   # outskirts: damp meadow grass
SOUTH = (59, 45, 33)   # courtyard: warm packed earth, tatami-adjacent
PADDY = (34, 50, 47)   # standing water in the rice parcels, cool against the field

# Grass holds through the top fifth of the map at full strength, and the blend
# to packed earth is compressed into the lower two thirds so the courtyard
# still arrives fully earthen at the Hall.
GRADIENT_START, GRADIENT_END = 0.20, 0.92

# Blotch endpoints, per band. The north pair is green-to-green; only the south
# pair is allowed to reach brown.
N_DARK,  N_LIGHT = (22, 44, 26), (44, 66, 40)   # deep moss / dry bleached grass
S_DARK,  S_LIGHT = (44, 36, 27), (62, 52, 39)   # damp earth / dry dust

# The worn route is DARKER than the field it crosses, not lighter. A smooth
# brighter stripe on a flat ground reads as a light beam no matter how it is
# shaped -- two earlier passes proved that. Damp trodden earth at dusk is
# genuinely darker than the grass around it, so this is both the truthful
# choice and the one that cannot be mistaken for a sunbeam. It also spends
# none of the contrast budget.
PATH  = (42, 36, 29)
RUT   = (33, 28, 23)   # cart ruts cut into the route
COURT = (64, 51, 38)   # swept ground immediately around the Hall

# Props are silhouettes first. At 10-25px inside a ~20-unit luminance band a
# prop that tries to model form just turns into a pale smudge -- an earlier
# pass had lanterns reading as candles and paving reading as a brick wall.
# Everything here sits at or below the ground it stands on, with highlights
# used sparingly and only as a single edge.
PROP = {
    'shadow':    (17, 21, 19),
    'canopy':    (23, 32, 25),   # cedar mass
    'canopy_hi': (31, 41, 31),
    'trunk':     (30, 24, 18),
    # Rocks and shrubs read by being DARKER than the ground, never lighter.
    # At a ~20-unit band a prop 4 units above the field is invisible while one
    # 15 units below it reads instantly. Every light-valued prop tried in this
    # layer had to be darkened; none survived as a highlight.
    'rock':      (34, 33, 30),
    'rock_hi':   (50, 48, 43),
    'tuft':      (27, 37, 28),   # low shrub clump, not grass blades
    'post':      (44, 40, 31),   # paddy bunds
    'stone':     (57, 48, 38),   # warm granite -- barely above the packed earth
    'stone_hi':  (68, 59, 48),
    'joint':     (42, 35, 28),   # mortar line between paving slabs
    'timber':    (50, 38, 27),   # crates and bales
    'timber_hi': (62, 47, 33),
    'ember':     (78, 60, 34),   # lantern flame -- the only warm accent
    'petal':     (70, 49, 50),
}

LUM_CEILING = 72.0     # no pixel brighter than this (goblin's mean is 59)
LUM_MEAN_MAX = 55.0    # whole-image mean stays inside the agreed dusk band
LUM_MEAN_MIN = 30.0
BRIGHT_PIXEL_BUDGET = 0.006  # <=0.6% of pixels may exceed the goblin's mean


def luminance(rgb) -> float:
    r, g, b = rgb[:3]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


# ---------------------------------------------------------------------------
# Ground masks
# ---------------------------------------------------------------------------

def value_noise(w: int, h: int, cells: int, rng: random.Random) -> Image.Image:
    """One octave of smooth value noise as an 'L' image, mean ~128."""
    small = Image.new('L', (max(2, cells), max(2, round(cells * h / w))))
    small.putdata([rng.randrange(256) for _ in range(small.width * small.height)])
    return small.resize((w, h), Image.Resampling.BICUBIC)


def fractal_noise(rng: random.Random) -> list[float]:
    """Multi-octave noise flattened to a list of signed floats in ~[-1, 1]."""
    octaves = [(6, 1.0), (14, 0.5), (34, 0.25), (90, 0.14)]
    layers = [(list(value_noise(W, H, c, rng).getdata()), a) for c, a in octaves]
    total = sum(a for _, a in octaves)
    return [
        sum((data[i] - 128) / 128.0 * amp for data, amp in layers) / total
        for i in range(W * H)
    ]


def blotch_field(rng: random.Random) -> list[float]:
    """Very low-frequency field driving large mossy/dusty patches.

    This is what actually stops a low-contrast gradient reading as flat. Broad
    tonal patches are far cheaper in contrast than props are -- they can vary
    the ground by four or five luminance units over a couple of hundred pixels
    and register clearly, where a 12px object at the same delta disappears.
    """
    octaves = [(5, 1.0), (11, 0.55)]
    layers = [(list(value_noise(W, H, c, rng).getdata()), a) for c, a in octaves]
    total = sum(a for _, a in octaves)
    return [
        sum((data[i] - 128) / 128.0 * amp for data, amp in layers) / total
        for i in range(W * H)
    ]


def route_points(gx: int) -> list[tuple[float, float]]:
    """Centreline from one gate down to the Hall. A gentle S-curve rather than
    a straight run, so three converging routes do not read as a drawn triangle."""
    x0 = gx * TILE_SIZE + TILE_SIZE / 2
    bow = (x0 - HALL_CX) * 0.32
    return [
        (x0 + (HALL_CX - x0) * (i / 64) - bow * math.sin(math.pi * (i / 64)),
         HALL_CY * (i / 64))
        for i in range(65)
    ]


def path_mask(rng: random.Random) -> tuple[Image.Image, Image.Image]:
    """The worn routes and the cart ruts cut into them.

    Width is modulated along the run instead of tapering smoothly: an even
    taper is exactly what made earlier passes read as a beam. Returns
    (wear, ruts).
    """
    wear = Image.new('L', (W, H), 0)
    ruts = Image.new('L', (W, H), 0)
    dw, dr = ImageDraw.Draw(wear), ImageDraw.Draw(ruts)

    for gx in GATE_GX:
        pts = route_points(gx)
        phase = rng.uniform(0, math.tau)
        for i in range(len(pts) - 1):
            t = i / (len(pts) - 1)
            wobble = 1.0 + 0.30 * math.sin(t * 9.0 + phase) + 0.16 * math.sin(t * 23.0)
            dw.line([pts[i], pts[i + 1]], fill=200,
                    width=max(4, int(round((21 - 7 * t) * wobble))))
        # Two ruts riding the centreline, offset either side.
        for side in (-1, 1):
            off = [(x + side * 4.5, y) for x, y in pts]
            for i in range(len(off) - 1):
                if rng.random() < 0.14:   # ruts break up rather than run clean
                    continue
                dr.line([off[i], off[i + 1]], fill=190, width=2)

    return (wear.filter(ImageFilter.GaussianBlur(4.5)),
            ruts.filter(ImageFilter.GaussianBlur(1.6)))


def plaza_mask() -> Image.Image:
    """The swept courtyard immediately around the Hall."""
    mask = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(mask)
    d.ellipse([HALL_CX - 210, HALL_CY - 132, HALL_CX + 210, HALL_CY + 132], fill=205)
    return mask.filter(ImageFilter.GaussianBlur(26))


def paddy_mask(rng: random.Random) -> tuple[Image.Image, Image.Image]:
    """Flooded rice parcels across the far north, plus their raised bunds.

    Gives the outskirts real structure -- rectangular field geometry the eye
    can parse -- instead of relying on scattered props alone. Returns
    (water, bunds); both are soft masks in 'L'.
    """
    water = Image.new('L', (W, H), 0)
    bunds = Image.new('L', (W, H), 0)
    dw, db = ImageDraw.Draw(water), ImageDraw.Draw(bunds)

    # Parcels are deliberately COARSE. An earlier finer grid read as brickwork
    # at the top of the map for exactly the same reason the courtyard did:
    # small repeated outlined rectangles are masonry, whatever colour they are.
    y = 18
    row = 0
    while y < H * 0.30:
        rh = rng.randint(62, 88)
        x = -rng.randint(0, 120)
        while x < W:
            pw = rng.randint(210, 340)
            skew = rng.uniform(-5, 5)
            box = [x + 4, y + 3, x + pw - 4, y + rh - 3]
            # Fade the whole system out as it approaches the midfield.
            fade = max(0.0, 1.0 - (y / (H * 0.30)) ** 1.4)
            if fade > 0.06 and rng.random() < 0.86:
                dw.polygon(
                    [(box[0], box[1] + skew), (box[2], box[1] - skew),
                     (box[2], box[3] - skew), (box[0], box[3] + skew)],
                    fill=int(200 * fade),
                )
                db.polygon(
                    [(box[0], box[1] + skew), (box[2], box[1] - skew),
                     (box[2], box[3] - skew), (box[0], box[3] + skew)],
                    outline=int(210 * fade), width=3,
                )
            x += pw
        y += rh
        row += 1

    return (water.filter(ImageFilter.GaussianBlur(2.2)),
            bunds.filter(ImageFilter.GaussianBlur(1.4)))


def paved_apron(rng: random.Random) -> Image.Image:
    """A real flagstone court around the Hall, as an RGBA overlay.

    Scattered individual slabs read as puddles; a laid, jointed paving field
    reads as built ground, and it is what actually distinguishes "courtyard"
    from "browner dirt". Slabs fade and drop out toward the edge so the apron
    dissolves into the packed earth instead of ending on a hard rim.
    """
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    rx, ry = 232.0, 148.0
    cw, ch = 30, 21

    # Irregular polygonal flagstones (nobedan), not a rectangular bond. A grid
    # of same-size rectangles reads unmistakably as a brick wall lying flat, no
    # matter how the alpha and joint colour are tuned -- that was tried. Broken
    # polygon edges are what make stone read as stone.
    y = HALL_CY - ry
    row = 0
    while y < HALL_CY + ry:
        x = HALL_CX - rx + (row % 2) * cw * 0.5
        while x < HALL_CX + rx:
            cx = x + cw / 2 + rng.uniform(-3.5, 3.5)
            cy = y + ch / 2 + rng.uniform(-2.5, 2.5)
            r = math.hypot((cx - HALL_CX) / rx, (cy - HALL_CY) / ry)
            if r < 1.0:
                # Solid at the centre, ragged and translucent at the rim.
                fall = min(1.0, (1.0 - r) / 0.42)
                if rng.random() < fall * 0.92:
                    a = int(round(110 * (0.4 + 0.6 * fall)))
                    n = rng.randint(5, 7)
                    pts = []
                    for i in range(n):
                        ang = math.tau * i / n + rng.uniform(-0.25, 0.25)
                        pts.append((
                            cx + math.cos(ang) * (cw * 0.46) * rng.uniform(0.72, 1.0),
                            cy + math.sin(ang) * (ch * 0.50) * rng.uniform(0.72, 1.0),
                        ))
                    d.polygon(pts, fill=PROP['stone'] + (a,),
                              outline=PROP['joint'] + (int(a * 1.4),))
            x += cw
        y += ch
        row += 1

    # The Hall stands on the paving, not under it.
    d.rectangle([HALL_GX * TILE_SIZE - 3, HALL_GY * TILE_SIZE - 3,
                 (HALL_GX + HALL_W) * TILE_SIZE + 3, H], fill=(0, 0, 0, 0))
    return layer


def furrows(rng: random.Random) -> Image.Image:
    """Faint planting rows inside the paddy band. Near the visibility floor by
    design -- they should register as texture, never as stripes."""
    band = Image.new('L', (W, H), 128)
    d = ImageDraw.Draw(band)
    # Wide spacing: at 9px these read as scanlines rather than planting rows.
    for y in range(8, int(H * 0.34), 17):
        fade = 1.0 - (y / (H * 0.34))
        amp = int(round(11 * fade))
        if amp <= 0:
            continue
        wobble = rng.uniform(0, math.tau)
        prev = None
        for x in range(0, W + 8, 8):
            yy = y + 1.8 * math.sin(x / 110.0 + wobble)
            if prev:
                d.line([prev, (x, yy)], fill=128 + amp, width=1)
            prev = (x, yy)
    return band.filter(ImageFilter.GaussianBlur(1.1))


def vignette() -> Image.Image:
    """Corner falloff -- pulls the eye to the centre lane and keeps the map
    edges from competing with HUD text drawn over them."""
    v = Image.new('L', (W, H))
    cx, cy = W / 2, H / 2
    maxd = math.hypot(cx, cy)
    v.putdata([
        int(round(255 * (1.0 - 0.28 * (math.hypot(x - cx, y - cy) / maxd) ** 2.2)))
        for y in range(H) for x in range(W)
    ])
    return v


# ---------------------------------------------------------------------------
# Scatter props
# ---------------------------------------------------------------------------

def _shadow(d, cx: float, cy: float, rx: float, ry: float) -> None:
    """Every standing prop gets one, so the layer reads as objects ON ground
    rather than stains IN it. The cheapest depth cue that costs no brightness."""
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=PROP['shadow'])


def draw_cedar(d, x: float, y: float, s: float, rng: random.Random) -> None:
    """Conical cedar -- the outskirts' main silhouette. Drawn in copses."""
    h, w = 14 * s, 6.4 * s
    _shadow(d, x + 2.0 * s, y, w * 0.9, w * 0.32)
    d.rectangle([x - 1.2 * s, y - 4 * s, x + 1.2 * s, y + 1], fill=PROP['trunk'])
    for i in range(3):
        t = i / 3
        ty = y - 3 * s - h * t
        tw = w * (1.0 - 0.28 * t)
        d.polygon([(x, ty - h * 0.50), (x - tw, ty + 1.7 * s), (x + tw, ty + 1.7 * s)],
                  fill=PROP['canopy'])
    # One lit edge, north-west, matching the Hall's key light.
    d.polygon([(x - 0.7 * s, y - h - 3.0 * s), (x - w * 0.60, y - h * 0.34),
               (x - w * 0.28, y - h * 0.34)], fill=PROP['canopy_hi'])


def draw_broadleaf(d, x: float, y: float, s: float, rng: random.Random) -> None:
    """Rounded deciduous tree, for variety inside a copse."""
    r = 6.4 * s
    _shadow(d, x + 1.6 * s, y, r * 0.95, r * 0.30)
    d.rectangle([x - 1.2 * s, y - 6 * s, x + 1.2 * s, y + 1], fill=PROP['trunk'])
    for dx, dy, rr in ((0, -10, 1.0), (-4.5, -6.5, 0.72), (4.5, -7, 0.66)):
        d.ellipse([x + dx * s - r * rr, y + dy * s - r * rr,
                   x + dx * s + r * rr, y + dy * s + r * rr * 0.86],
                  fill=PROP['canopy'])
    d.ellipse([x - r * 0.8, y - 13.5 * s, x - r * 0.15, y - 10 * s],
              fill=PROP['canopy_hi'])


def draw_rock(d, x: float, y: float, s: float, rng: random.Random) -> None:
    r = 4.6 * s
    _shadow(d, x + 0.9 * s, y + 0.5 * s, r * 1.1, r * 0.40)
    pts = []
    n = rng.randint(5, 7)
    for i in range(n):
        a = math.tau * i / n + rng.uniform(-0.22, 0.22)
        rr = r * rng.uniform(0.72, 1.08)
        pts.append((x + math.cos(a) * rr, y + math.sin(a) * rr * 0.70))
    d.polygon(pts, fill=PROP['rock'])
    d.polygon([(px - r * 0.20, py - r * 0.32) for px, py in pts[: max(3, n - 2)]],
              fill=PROP['rock_hi'])


def draw_tuft(d, x: float, y: float, s: float, rng: random.Random) -> None:
    """Low shrub clump. Drawn as a dark mass rather than as blades: individual
    1px grass strokes at this contrast simply did not appear."""
    _shadow(d, x + 1.2 * s, y + 0.5 * s, 5.5 * s, 1.8 * s)
    for _ in range(rng.randint(3, 5)):
        dx, dy = rng.uniform(-4.5, 4.5) * s, rng.uniform(-1.5, 0.5) * s
        r = rng.uniform(2.6, 4.4) * s
        d.ellipse([x + dx - r, y + dy - r * 0.9, x + dx + r, y + dy + r * 0.6],
                  fill=PROP['tuft'])



def draw_lantern(d, x: float, y: float, s: float, rng: random.Random) -> None:
    """Stone toro. Placed deliberately in pairs along the Hall approach --
    lantern-lining is what makes the south read as a kept courtyard rather
    than just browner dirt. Carries the only warm accent on the layer."""
    _shadow(d, x + 1.4 * s, y, 5.6 * s, 2.1 * s)
    d.rectangle([x - 2.6 * s, y - 9 * s, x + 2.6 * s, y], fill=PROP['stone'])
    d.rectangle([x - 2.6 * s, y - 9 * s, x - 1.2 * s, y], fill=PROP['stone_hi'])
    d.rectangle([x - 4.4 * s, y - 15 * s, x + 4.4 * s, y - 9 * s], fill=PROP['stone'])
    d.polygon([(x - 6.2 * s, y - 15 * s), (x + 6.2 * s, y - 15 * s), (x, y - 20 * s)],
              fill=PROP['stone'])
    d.ellipse([x - 1.7 * s, y - 13.5 * s, x + 1.7 * s, y - 10.5 * s], fill=PROP['ember'])


def draw_slab(d, x: float, y: float, s: float, rng: random.Random) -> None:
    """One set paving slab. The apron lays these out in a ring, not at random --
    scattered slabs read as puddles, a ring reads as built ground."""
    w_, h_ = rng.uniform(13, 21) * s, rng.uniform(8, 12) * s
    d.rounded_rectangle([x, y, x + w_, y + h_], radius=2, fill=PROP['stone'])
    d.line([(x + 1, y + 1), (x + w_ - 1, y + 1)], fill=PROP['stone_hi'])


def draw_crate(d, x: float, y: float, s: float, rng: random.Random) -> None:
    """Market goods -- rice bales and crates, the Marketplace's neighbours."""
    w_, h_ = rng.uniform(9, 13) * s, rng.uniform(8, 12) * s
    _shadow(d, x + w_ * 0.5, y, w_ * 0.62, 2.0 * s)
    d.rectangle([x, y - h_, x + w_, y], fill=PROP['timber'])
    d.rectangle([x, y - h_, x + w_, y - h_ + 2.0 * s], fill=PROP['timber_hi'])
    d.line([(x, y - h_ * 0.48), (x + w_, y - h_ * 0.48)], fill=PROP['timber_hi'])
    d.line([(x, y - h_), (x, y)], fill=PROP['timber_hi'])


def draw_petals(d, x: float, y: float, s: float, rng: random.Random) -> None:
    """Drifted blossom on the packed earth. Two-pixel flecks; pure warmth."""
    for _ in range(rng.randint(6, 13)):
        px = x + rng.uniform(-19, 19) * s
        py = y + rng.uniform(-13, 13) * s
        d.ellipse([px, py, px + 1.7 * s, py + 1.3 * s], fill=PROP['petal'])


def draw_well(d, x: float, y: float, s: float, rng: random.Random) -> None:
    """Stone well with a timber frame -- the courtyard's one landmark prop."""
    r = 11 * s
    _shadow(d, x + 1.5 * s, y, r * 1.15, r * 0.42)
    d.ellipse([x - r, y - r * 0.52, x + r, y + r * 0.52], fill=PROP['stone'])
    d.ellipse([x - r * 0.62, y - r * 0.34, x + r * 0.62, y + r * 0.34],
              fill=PROP['shadow'])
    d.arc([x - r, y - r * 0.52, x + r, y + r * 0.52], start=180, end=360,
          fill=PROP['stone_hi'])
    for sx in (-1, 1):
        d.rectangle([x + sx * r * 0.78 - 1.4 * s, y - 15 * s,
                     x + sx * r * 0.78 + 1.4 * s, y - r * 0.2], fill=PROP['timber'])
    d.polygon([(x - r * 1.15, y - 15 * s), (x + r * 1.15, y - 15 * s),
               (x, y - 21 * s)], fill=PROP['timber'])
    d.line([(x - r * 1.05, y - 15.5 * s), (x, y - 20.5 * s)], fill=PROP['timber_hi'])



def draw_raked(d, x: float, y: float, s: float, rng: random.Random) -> None:
    """Karesansui gravel arcs beside the Hall -- quiet, almost subliminal."""
    for i in range(rng.randint(3, 5)):
        r = (9 + i * 5.5) * s
        d.arc([x - r, y - r * 0.5, x + r, y + r * 0.5], start=200, end=340,
              fill=PROP['stone'])


# ---------------------------------------------------------------------------
# Placement
# ---------------------------------------------------------------------------

class Placer:
    """Rejection sampler with the gameplay exclusions baked in."""

    def __init__(self, im: Image.Image, paths, plaza, rng: random.Random):
        self.d = ImageDraw.Draw(im)
        self.paths, self.plaza, self.rng = paths, plaza, rng
        self.placed: list[tuple[float, float, float]] = []

    def free(self, x: float, y: float, clear: float, top: float = 26,
             ignore_paths: bool = False) -> bool:
        if not (12 <= x < W - 12 and top <= y < H - 10):
            return False
        # Worn routes stay clear -- props must never sit where enemies walk.
        # Courtyard furniture opts out: all three routes converge on the Hall,
        # so honouring the mask there rejects everything and leaves the south
        # empty. Paving and lanterns belong beside an approach by definition.
        if not ignore_paths and self.paths[int(y) * W + int(x)] > 40:
            return False
        # Hall footprint, generously padded.
        if (HALL_GX * TILE_SIZE - 30 < x < (HALL_GX + HALL_W) * TILE_SIZE + 30
                and HALL_GY * TILE_SIZE - 34 < y < (HALL_GY + HALL_H) * TILE_SIZE + 14):
            return False
        # Gate mouths: the spawn columns must read unobstructed.
        if y < 110 and any(abs(x - (gx + 0.5) * TILE_SIZE) < 50 for gx in GATE_GX):
            return False
        return all((x - px) ** 2 + (y - py) ** 2 >= (clear + pc) ** 2
                   for px, py, pc in self.placed)

    def put(self, fn, x: float, y: float, s: float, clear: float, top: float = 26,
            ignore_paths: bool = False) -> bool:
        if not self.free(x, y, clear, top, ignore_paths):
            return False
        fn(self.d, x, y, s, self.rng)
        self.placed.append((x, y, clear))
        return True

    def copse(self, cx: float, cy: float, n: int, spread: float, table, scale, clear, top=26):
        """Cluster n props around a centre. Clustering is the whole difference
        between 'landscape' and 'polka dots'."""
        out = []
        for _ in range(n * 4):
            if len(out) >= n:
                break
            x = cx + self.rng.gauss(0, spread)
            y = cy + self.rng.gauss(0, spread * 0.55)
            out.append((y, x))
        # Painter's order: nearer (lower) props drawn last so they overlap.
        for y, x in sorted(out):
            fn = self.rng.choice(table)
            if self.put(fn, x, y, self.rng.uniform(*scale), clear, top):
                pass


def scatter(im: Image.Image, paths, plaza, rng: random.Random) -> None:
    p = Placer(im, paths, plaza, rng)

    # --- paddy band --------------------------------------------------------
    # No props here at all. The parcels and their bunds are drawn into the
    # ground itself; fence runs were tried and read as hazard tape, because a
    # regular horizontal tick pattern is a very loud mark at 32px.

    # --- treeline: cedar copses banded across the north --------------------
    for _ in range(17):
        cx, cy = rng.uniform(36, W - 36), rng.uniform(H * 0.13, H * 0.45)
        p.copse(cx, cy, rng.randint(4, 9), 44,
                [draw_cedar, draw_cedar, draw_cedar, draw_broadleaf],
                (0.95, 1.5), 19, top=52)
    # Boulder fields and grass, also clustered.
    for _ in range(13):
        cx, cy = rng.uniform(30, W - 30), rng.uniform(H * 0.09, H * 0.52)
        p.copse(cx, cy, rng.randint(3, 7), 34, [draw_rock, draw_tuft, draw_tuft],
                (0.8, 1.25), 16, top=34)

    # --- scrub midfield: thinning, mostly grass ----------------------------
    for _ in range(14):
        cx, cy = rng.uniform(30, W - 30), rng.uniform(H * 0.42, H * 0.72)
        p.copse(cx, cy, rng.randint(2, 6), 40, [draw_tuft, draw_tuft, draw_rock],
                (0.7, 1.05), 19)

    # --- courtyard ---------------------------------------------------------
    # The paving itself is drawn by paved_apron(); what follows is furniture
    # standing on it. All of it opts out of the route mask -- see Placer.free.
    # Lantern-lined approach: pairs flanking the Hall, receding north.
    for i, dy in enumerate((58, 132, 210, 290)):
        off = 104 + i * 22
        for sx in (-1, 1):
            p.put(draw_lantern, HALL_CX + sx * off, HALL_CY - dy,
                  rng.uniform(0.95, 1.15), 20, ignore_paths=True)

    # Loose slabs spilling past the apron's rim, so it does not end abruptly.
    for _ in range(26):
        a, rr = rng.uniform(0, math.tau), rng.uniform(1.0, 1.30)
        p.put(draw_slab, HALL_CX + math.cos(a) * 232 * rr,
              HALL_CY + math.sin(a) * 148 * rr, rng.uniform(0.7, 1.0), 15,
              ignore_paths=True)

    # The well, and raked gravel tucked to the Hall's flanks. One each -- they
    # are landmarks, and a landmark repeated is just texture.
    p.put(draw_well, HALL_CX - rng.uniform(258, 288), HALL_CY - rng.uniform(30, 70),
          rng.uniform(1.05, 1.25), 26, ignore_paths=True)
    p.put(draw_raked, HALL_CX + rng.uniform(252, 286), HALL_CY - rng.uniform(20, 60),
          rng.uniform(1.1, 1.4), 26, ignore_paths=True)

    # Stacked goods around the courtyard edge, in yards rather than singly.
    for _ in range(6):
        cx, cy = rng.uniform(90, W - 90), rng.uniform(H * 0.70, H * 0.95)
        p.copse(cx, cy, rng.randint(3, 5), 22, [draw_crate], (0.85, 1.2), 13)

    # Drifted blossom, densest where the courtyard is swept.
    for _ in range(26):
        x, y = rng.uniform(40, W - 40), rng.uniform(H * 0.60, H - 20)
        if plaza[int(y) * W + int(x)] > 20 or rng.random() < 0.45:
            p.put(draw_petals, x, y, rng.uniform(0.8, 1.1), 11, ignore_paths=True)


# ---------------------------------------------------------------------------
# Composite
# ---------------------------------------------------------------------------

def render() -> Image.Image:
    rng = random.Random(SEED)
    noise = fractal_noise(rng)
    blotch = blotch_field(rng)
    wear_im, ruts_im = path_mask(rng)
    paths, ruts = list(wear_im.getdata()), list(ruts_im.getdata())
    plaza = list(plaza_mask().getdata())
    water, bunds = paddy_mask(rng)
    water, bunds = list(water.getdata()), list(bunds.getdata())
    furr = list(furrows(rng).getdata())

    out = []
    for y in range(H):
        # Gradient axis: gates (y=0) -> Hall (y=H), held at pure grass until
        # GRADIENT_START and fully earthen by GRADIENT_END, then eased.
        t = (y / (H - 1) - GRADIENT_START) / (GRADIENT_END - GRADIENT_START)
        t = max(0.0, min(1.0, t))
        t = t * t * (3 - 2 * t)
        base = tuple(NORTH[c] + (SOUTH[c] - NORTH[c]) * t for c in range(3))

        for x in range(W):
            i = y * W + x

            # Broad patches, following the same north-south axis as the base.
            # In the outskirts BOTH patch targets are green -- deep moss and
            # dry sun-bleached grass. An earlier version used a single brown
            # "dust" target across the whole map, which dragged dirt up into
            # the grass band and undid the hue separation the north relies on.
            b = blotch[i]
            dark = [N_DARK[c] + (S_DARK[c] - N_DARK[c]) * t for c in range(3)]
            light = [N_LIGHT[c] + (S_LIGHT[c] - N_LIGHT[c]) * t for c in range(3)]
            tgt = dark if b < 0 else light
            k = min(1.0, abs(b) * 0.62)
            rgb = [base[c] + (tgt[c] - base[c]) * k for c in range(3)]

            # Rice parcels: cool standing water, then the raised earth bunds.
            wv = (water[i] / 255.0) * 0.55
            if wv > 0.004:
                rgb = [rgb[c] + (PADDY[c] - rgb[c]) * wv for c in range(3)]
            bv = (bunds[i] / 255.0) * 0.42
            if bv > 0.004:
                rgb = [rgb[c] + (PROP['post'][c] - rgb[c]) * bv for c in range(3)]

            # Swept courtyard first, then the darker trodden routes over it,
            # then the ruts cut into those.
            zv = (plaza[i] / 255.0) * 0.42
            rgb = [rgb[c] + (COURT[c] - rgb[c]) * zv for c in range(3)]
            pv = (paths[i] / 255.0) * 0.62
            rgb = [rgb[c] + (PATH[c] - rgb[c]) * pv for c in range(3)]
            rv = (ruts[i] / 255.0) * 0.45 * pv
            rgb = [rgb[c] + (RUT[c] - rgb[c]) * rv for c in range(3)]

            # Texture. Grain is stronger off the paths (untrodden ground is
            # rougher); planting rows only touch the northern field.
            grain = noise[i] * 5.5 * (1.0 - 0.45 * pv)
            fur = (furr[i] - 128) * 0.45 * (1.0 - pv)

            out.append(tuple(
                max(0, min(255, int(round(rgb[c] + grain + fur))))
                for c in range(3)
            ))

    im = Image.new('RGB', (W, H))
    im.putdata(out)

    # The court is paving laid ON the ground, so it composites over the
    # gradient but under every standing prop.
    im = Image.alpha_composite(im.convert('RGBA'), paved_apron(rng)).convert('RGB')

    # Props go on before the vignette so the corner falloff settles them into
    # the ground rather than floating them above it.
    scatter(im, paths, plaza, rng)

    vg = vignette().load()
    px = im.load()
    for y in range(H):
        for x in range(W):
            f = vg[x, y] / 255.0
            r, g, b = px[x, y]
            px[x, y] = (int(r * f), int(g * f), int(b * f))
    return im


def verify(im: Image.Image) -> dict:
    """The readability contract, checked in the script that produces the art."""
    lums = [luminance(p) for p in im.getdata()]
    mean = sum(lums) / len(lums)
    peak = max(lums)
    bright = sum(1 for l in lums if l > 59.0) / len(lums)
    stats = {'mean': mean, 'peak': peak, 'bright_frac': bright, 'size': im.size}

    assert im.size == (W, H), f'ground must be {W}x{H}, got {im.size}'
    assert peak <= LUM_CEILING, (
        f'brightest pixel luminance {peak:.1f} exceeds ceiling {LUM_CEILING} '
        '-- sprites would lose their silhouette'
    )
    assert LUM_MEAN_MIN <= mean <= LUM_MEAN_MAX, (
        f'mean luminance {mean:.1f} outside the agreed dusk band '
        f'[{LUM_MEAN_MIN}, {LUM_MEAN_MAX}]'
    )
    assert bright <= BRIGHT_PIXEL_BUDGET, (
        f"{bright * 100:.2f}% of pixels are brighter than the goblin's mean "
        f'luminance (59), over the {BRIGHT_PIXEL_BUDGET * 100:.1f}% budget'
    )
    return stats


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--out', type=Path, default=OUT)
    args = ap.parse_args()

    im = render()
    stats = verify(im)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    im.save(args.out, optimize=True)
    kb = args.out.stat().st_size / 1024
    print(
        f'wrote {args.out.relative_to(ROOT)} {stats["size"][0]}x{stats["size"][1]} '
        f'{kb:.0f}KB  mean_lum={stats["mean"]:.1f} peak_lum={stats["peak"]:.1f} '
        f'bright={stats["bright_frac"] * 100:.2f}%'
    )


if __name__ == '__main__':
    main()
