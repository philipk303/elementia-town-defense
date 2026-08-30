#!/usr/bin/env python3
"""Convert the approved Snare Post concept into a two-state Phaser atlas."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw


CANVAS = 64
GUTTER = 2
STATES = ('idle', 'pulse')


def extract_subject(source: Image.Image) -> Image.Image:
    """Remove the flat magenta review background while retaining opaque art."""
    rgba = source.convert('RGBA')
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, _ = pixels[x, y]
            is_key = r > 220 and b > 180 and g < 70
            pixels[x, y] = (r, g, b, 0 if is_key else 255)
    bounds = rgba.getchannel('A').getbbox()
    if bounds is None:
        raise ValueError('concept source has no opaque subject')
    return rgba.crop(bounds)


def frame_for(subject: Image.Image, state: str) -> Image.Image:
    max_size = 58 if state == 'idle' else 62
    scale = min(max_size / subject.width, max_size / subject.height)
    size = (max(1, round(subject.width * scale)), max(1, round(subject.height * scale)))
    sprite = subject.resize(size, Image.Resampling.NEAREST)
    frame = Image.new('RGBA', (CANVAS, CANVAS))
    frame.alpha_composite(sprite, ((CANVAS - sprite.width) // 2, 60 - sprite.height))
    if state == 'pulse':
        draw = ImageDraw.Draw(frame)
        draw.ellipse((5, 48, 58, 62), outline=(218, 178, 84, 210), width=2)
    return frame


def write_atlas(concept: Path, source_dir: Path, atlas_png: Path, atlas_json: Path) -> None:
    subject = extract_subject(Image.open(concept))
    frames = {}
    atlas = Image.new('RGBA', (2 * CANVAS + GUTTER, CANVAS))
    source_dir.mkdir(parents=True, exist_ok=True)
    for index, state in enumerate(STATES):
        name = f'{state}_0.png'
        frame = frame_for(subject, state)
        if frame.getchannel('A').getbbox() is None:
            raise ValueError(f'empty generated frame: {name}')
        frame.save(source_dir / name)
        x = index * (CANVAS + GUTTER)
        atlas.alpha_composite(frame, (x, 0))
        frames[name] = {
            'frame': {'x': x, 'y': 0, 'w': CANVAS, 'h': CANVAS},
            'rotated': False, 'trimmed': False,
            'spriteSourceSize': {'x': 0, 'y': 0, 'w': CANVAS, 'h': CANVAS},
            'sourceSize': {'w': CANVAS, 'h': CANVAS},
        }
    atlas_png.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(atlas_png)
    atlas_json.write_text(json.dumps({
        'frames': frames,
        'meta': {'app': 'snare_post_pipeline.py', 'image': atlas_png.name,
                 'size': {'w': atlas.width, 'h': atlas.height}, 'scale': '1'},
    }, indent=2), encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('concept', type=Path)
    parser.add_argument('--source-dir', type=Path, required=True)
    parser.add_argument('--atlas-png', type=Path, required=True)
    parser.add_argument('--atlas-json', type=Path, required=True)
    args = parser.parse_args()
    write_atlas(args.concept, args.source_dir, args.atlas_png, args.atlas_json)
