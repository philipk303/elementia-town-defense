#!/usr/bin/env python3
"""Package Volcano's approved source states as a Phaser atlas."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageEnhance


CANVAS = 128
GUTTER = 2
FRAME_SOURCES = (
    ('idle', 'volcano-magma-trap-crater-draft-v3.png'),
    ('telegraph', 'volcano-magma-trap-charge-source-v1.png'),
    ('charged', 'volcano-magma-trap-charge-source-v1.png'),
    ('active', 'volcano-magma-trap-eruption-source-v1.png'),
    ('recovery', 'volcano-magma-trap-crater-draft-v3.png'),
)


def extract_subject(image: Image.Image) -> Image.Image:
    """Remove the flat magenta review background while retaining soft edges."""
    rgba = image.convert('RGBA')
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            red, green, blue, alpha = pixels[x, y]
            distance = ((red - 255) ** 2 + green ** 2 + (blue - 255) ** 2) ** 0.5
            matte = max(0, min(255, round((distance - 30) * 255 / 100)))
            pixels[x, y] = (red, green, blue, alpha * matte // 255)
    bounds = rgba.getchannel('A').getbbox()
    if bounds is None:
        raise ValueError('source has no non-magenta subject')
    return rgba.crop(bounds)


def render_frame(source: Path, state: str) -> Image.Image:
    if not source.is_file():
        raise ValueError(f'missing Volcano state source: {source}')
    subject = extract_subject(Image.open(source))
    max_edge = CANVAS - 4
    scale = min(max_edge / subject.width, max_edge / subject.height)
    size = (max(1, round(subject.width * scale)), max(1, round(subject.height * scale)))
    rendered = subject.resize(size, Image.Resampling.LANCZOS)
    if state == 'recovery':
        rgb = ImageEnhance.Brightness(rendered.convert('RGB')).enhance(0.8)
        rgb.putalpha(rendered.getchannel('A'))
        rendered = rgb
    frame = Image.new('RGBA', (CANVAS, CANVAS))
    frame.alpha_composite(rendered, ((CANVAS - rendered.width) // 2, (CANVAS - rendered.height) // 2))
    return frame


def write_atlas(source: Path, frame_dir: Path, atlas_png: Path, atlas_json: Path) -> None:
    atlas = Image.new('RGBA', (len(FRAME_SOURCES) * CANVAS + (len(FRAME_SOURCES) - 1) * GUTTER, CANVAS))
    frames = {}
    frame_dir.mkdir(parents=True, exist_ok=True)
    atlas_png.parent.mkdir(parents=True, exist_ok=True)
    for index, (state, filename) in enumerate(FRAME_SOURCES):
        name = f'{state}_0.png'
        frame = render_frame(source / filename if source.is_dir() else source, state)
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
    atlas.save(atlas_png)
    atlas_json.write_text(json.dumps({
        'frames': frames,
        'meta': {'app': 'volcano_pipeline.py', 'image': atlas_png.name, 'format': 'RGBA8888', 'size': {'w': atlas.width, 'h': atlas.height}, 'scale': '1'},
    }, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-dir', type=Path, required=True)
    parser.add_argument('--frame-dir', type=Path, required=True)
    parser.add_argument('--atlas-png', type=Path, required=True)
    parser.add_argument('--atlas-json', type=Path, required=True)
    args = parser.parse_args()
    write_atlas(args.source_dir, args.frame_dir, args.atlas_png, args.atlas_json)
