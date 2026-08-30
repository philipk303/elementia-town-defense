#!/usr/bin/env python3
"""Convert approved Muddy Bog state sources into a three-state Phaser atlas."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image


CANVAS = 64
GUTTER = 2
STATES = ('idle', 'entry', 'root')


def extract_subject(source: Image.Image) -> Image.Image:
    """Remove the flat magenta review background."""
    rgba = source.convert('RGBA')
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            red, green, blue, _ = pixels[x, y]
            is_key = red > 220 and blue > 180 and green < 70
            pixels[x, y] = (red, green, blue, 0 if is_key else 255)
    bounds = rgba.getchannel('A').getbbox()
    if bounds is None:
        raise ValueError('state source has no opaque subject')
    return rgba.crop(bounds)


def frame_for(subject: Image.Image) -> Image.Image:
    scale = min(60 / subject.width, 60 / subject.height)
    size = (max(1, round(subject.width * scale)), max(1, round(subject.height * scale)))
    sprite = subject.resize(size, Image.Resampling.NEAREST)
    frame = Image.new('RGBA', (CANVAS, CANVAS))
    frame.alpha_composite(sprite, ((CANVAS - sprite.width) // 2, 60 - sprite.height))
    return frame


def write_atlas(state_dir: Path, frame_dir: Path, atlas_png: Path, atlas_json: Path) -> None:
    frames = {}
    atlas = Image.new('RGBA', (len(STATES) * CANVAS + (len(STATES) - 1) * GUTTER, CANVAS))
    frame_dir.mkdir(parents=True, exist_ok=True)
    for index, state in enumerate(STATES):
        name = f'{state}_0.png'
        source = state_dir / name
        if not source.exists():
            raise ValueError(f'missing state source: {source}')
        frame = frame_for(extract_subject(Image.open(source)))
        if frame.getchannel('A').getbbox() is None:
            raise ValueError(f'empty generated frame: {name}')
        frame.save(frame_dir / name)
        x = index * (CANVAS + GUTTER)
        atlas.alpha_composite(frame, (x, 0))
        frames[name] = {
            'frame': {'x': x, 'y': 0, 'w': CANVAS, 'h': CANVAS},
            'rotated': False,
            'trimmed': False,
            'spriteSourceSize': {'x': 0, 'y': 0, 'w': CANVAS, 'h': CANVAS},
            'sourceSize': {'w': CANVAS, 'h': CANVAS},
        }
    atlas_png.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(atlas_png)
    atlas_json.write_text(json.dumps({
        'frames': frames,
        'meta': {'app': 'muddy_bog_pipeline.py', 'image': atlas_png.name,
                 'size': {'w': atlas.width, 'h': atlas.height}, 'scale': '1'},
    }, indent=2), encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('state_dir', type=Path)
    parser.add_argument('--frame-dir', type=Path, required=True)
    parser.add_argument('--atlas-png', type=Path, required=True)
    parser.add_argument('--atlas-json', type=Path, required=True)
    args = parser.parse_args()
    write_atlas(args.state_dir, args.frame_dir, args.atlas_png, args.atlas_json)
