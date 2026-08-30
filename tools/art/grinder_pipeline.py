#!/usr/bin/env python3
"""Package the approved Grinder source concept as a four-state Phaser atlas."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageEnhance


CANVAS = 128
GUTTER = 2
STATES = ('idle', 'intake', 'crush', 'release')


def extract_subject(image: Image.Image) -> Image.Image:
    """Remove the flat magenta review background and retain the asset."""
    rgba = image.convert('RGBA')
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            red, green, blue, _ = pixels[x, y]
            is_magenta = red > 180 and blue > 130 and green < 90
            pixels[x, y] = (red, green, blue, 0 if is_magenta else 255)
    bounds = rgba.getchannel('A').getbbox()
    if bounds is None:
        raise ValueError('concept has no non-magenta subject')
    return rgba.crop(bounds)


def scale_to_canvas(subject: Image.Image, scale: float) -> Image.Image:
    max_edge = round((CANVAS - 4) * scale)
    ratio = min(max_edge / subject.width, max_edge / subject.height)
    size = (max(1, round(subject.width * ratio)), max(1, round(subject.height * ratio)))
    resized = subject.resize(size, Image.Resampling.LANCZOS)
    frame = Image.new('RGBA', (CANVAS, CANVAS))
    frame.alpha_composite(resized, ((CANVAS - resized.width) // 2, (CANVAS - resized.height) // 2))
    return frame


def frame_for(subject: Image.Image, state: str) -> Image.Image:
    scale = {'idle': 1.0, 'intake': 0.95, 'crush': 1.04, 'release': 1.0}[state]
    frame = scale_to_canvas(subject, scale)
    brightness = {'idle': 1.0, 'intake': 0.88, 'crush': 1.12, 'release': 1.22}[state]
    return ImageEnhance.Brightness(frame).enhance(brightness)


def write_atlas(concept: Path, source_dir: Path, atlas_png: Path, atlas_json: Path) -> None:
    subject = extract_subject(Image.open(concept))
    frames = {}
    atlas = Image.new('RGBA', (len(STATES) * CANVAS + (len(STATES) - 1) * GUTTER, CANVAS))
    source_dir.mkdir(parents=True, exist_ok=True)
    atlas_png.parent.mkdir(parents=True, exist_ok=True)
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
            'rotated': False,
            'trimmed': False,
            'spriteSourceSize': {'x': 0, 'y': 0, 'w': CANVAS, 'h': CANVAS},
            'sourceSize': {'w': CANVAS, 'h': CANVAS},
        }
    atlas.save(atlas_png)
    atlas_json.write_text(json.dumps({
        'frames': frames,
        'meta': {'app': 'grinder_pipeline.py', 'image': atlas_png.name, 'size': {'w': atlas.width, 'h': atlas.height}, 'scale': '1'},
    }, indent=2), encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('concept', type=Path)
    parser.add_argument('--source-dir', type=Path, required=True)
    parser.add_argument('--atlas-png', type=Path, required=True)
    parser.add_argument('--atlas-json', type=Path, required=True)
    args = parser.parse_args()
    write_atlas(args.concept, args.source_dir, args.atlas_png, args.atlas_json)
