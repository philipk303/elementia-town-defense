#!/usr/bin/env python3
"""Build the approved Wind Vortex concept into a directional Phaser atlas."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageOps


STATES = ('idle', 'telegraph', 'active', 'recovery', 'charged')
DIRECTIONS = ('N', 'E', 'S', 'W')
CANVAS = 64
GUTTER = 2


def extract_subject(panel: Image.Image) -> Image.Image:
    """Remove the white concept-sheet ground while retaining runes and vortex."""
    rgba = panel.convert('RGBA')
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, _ = pixels[x, y]
            saturation = max(r, g, b) - min(r, g, b)
            alpha = 255 if min(r, g, b) < 210 or saturation > 55 else 0
            pixels[x, y] = (r, g, b, alpha)
    bounds = rgba.getchannel('A').point(lambda value: 255 if value > 32 else 0).getbbox()
    if bounds is None:
        raise ValueError('concept panel has no usable opaque subject')
    return rgba.crop(bounds)


def panel_for_state(image: Image.Image, state: str) -> Image.Image:
    width, height = image.size
    content_bottom = round(height * 0.67)  # Excludes the concept labels.
    panels = [image.crop((index * width // 3, 0, (index + 1) * width // 3, content_bottom)) for index in range(3)]
    return {'idle': panels[0], 'telegraph': panels[1], 'charged': panels[1], 'active': panels[2], 'recovery': panels[0]}[state]


def orient(image: Image.Image, direction: str) -> Image.Image:
    return {
        'N': image.rotate(90, expand=True),
        'E': image,
        'S': image.rotate(270, expand=True),
        'W': ImageOps.mirror(image),
    }[direction]


def frame_for(subject: Image.Image, state: str, direction: str) -> Image.Image:
    image = orient(subject, direction)
    max_height = 62 if state == 'active' else 48
    scale = min(60 / image.width, max_height / image.height)
    size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    resized = image.resize(size, Image.Resampling.NEAREST)
    frame = Image.new('RGBA', (CANVAS, CANVAS))
    frame.alpha_composite(resized, ((CANVAS - resized.width) // 2, 56 - resized.height + 1))
    return frame


def write_atlas(concept: Path, source_dir: Path, atlas_png: Path, atlas_json: Path) -> None:
    image = Image.open(concept)
    subjects = {state: extract_subject(panel_for_state(image, state)) for state in STATES}
    names = [f'{state}_{direction}_0.png' for state in STATES for direction in DIRECTIONS]
    frames = {}
    atlas = Image.new('RGBA', (5 * CANVAS + 4 * GUTTER, 4 * CANVAS + 3 * GUTTER))
    for index, name in enumerate(names):
        state, direction, _ = name.removesuffix('.png').split('_')
        frame = frame_for(subjects[state], state, direction)
        if frame.getchannel('A').getbbox() is None:
            raise ValueError(f'empty generated frame: {name}')
        output = source_dir / name
        output.parent.mkdir(parents=True, exist_ok=True)
        frame.save(output)
        x, y = (index % 5) * (CANVAS + GUTTER), (index // 5) * (CANVAS + GUTTER)
        atlas.alpha_composite(frame, (x, y))
        frames[name] = {'frame': {'x': x, 'y': y, 'w': CANVAS, 'h': CANVAS}, 'rotated': False, 'trimmed': False,
                        'spriteSourceSize': {'x': 0, 'y': 0, 'w': CANVAS, 'h': CANVAS}, 'sourceSize': {'w': CANVAS, 'h': CANVAS}}
    atlas_png.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(atlas_png)
    atlas_json.write_text(json.dumps({'frames': frames, 'meta': {'app': 'wind_vortex_pipeline.py', 'image': atlas_png.name, 'size': {'w': atlas.width, 'h': atlas.height}, 'scale': '1'}}, indent=2), encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('concept', type=Path)
    parser.add_argument('--source-dir', type=Path, required=True)
    parser.add_argument('--atlas-png', type=Path, required=True)
    parser.add_argument('--atlas-json', type=Path, required=True)
    args = parser.parse_args()
    write_atlas(args.concept, args.source_dir, args.atlas_png, args.atlas_json)
