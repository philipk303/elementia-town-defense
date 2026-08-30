#!/usr/bin/env python3
"""Convert Barricade and Watchtower calibration sources into runtime packages."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image


def extract_subject(source: Image.Image) -> Image.Image:
    rgba = source.convert('RGBA')
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, _ = pixels[x, y]
            pixels[x, y] = (r, g, b, 0 if r > 220 and b > 180 and g < 70 else 255)
    bounds = rgba.getchannel('A').getbbox()
    if bounds is None:
        raise ValueError('calibration source has no opaque subject')
    return rgba.crop(bounds)


def fit(subject: Image.Image, width: int, height: int, baseline: int) -> Image.Image:
    scale = min(width / subject.width, height / subject.height)
    size = (max(1, round(subject.width * scale)), max(1, round(subject.height * scale)))
    sprite = subject.resize(size, Image.Resampling.LANCZOS)
    frame = Image.new('RGBA', (width, height))
    frame.alpha_composite(sprite, ((width - sprite.width) // 2, baseline - sprite.height))
    return frame


def write_barricade(source: Path, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    fit(extract_subject(Image.open(source)), 32, 32, 30).save(output)


def write_watchtower(source: Path, frame_dir: Path, atlas_png: Path, atlas_json: Path) -> None:
    subject = extract_subject(Image.open(source))
    frame_dir.mkdir(parents=True, exist_ok=True)
    frames = {}
    atlas = Image.new('RGBA', (98, 64))
    for index, state in enumerate(('idle', 'recoil')):
        frame = fit(subject, 48, 64, 60 if state == 'idle' else 58)
        name = f'{state}_0.png'
        frame.save(frame_dir / name)
        x = index * 50
        atlas.alpha_composite(frame, (x, 0))
        frames[name] = {'frame': {'x': x, 'y': 0, 'w': 48, 'h': 64}, 'rotated': False, 'trimmed': False,
                        'spriteSourceSize': {'x': 0, 'y': 0, 'w': 48, 'h': 64}, 'sourceSize': {'w': 48, 'h': 64}}
    atlas_png.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(atlas_png)
    atlas_json.write_text(json.dumps({'frames': frames, 'meta': {'app': 'generic_structures_pipeline.py',
                         'image': atlas_png.name, 'size': {'w': 98, 'h': 64}, 'scale': '1'}}, indent=2), encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--barricade-source', type=Path, required=True)
    parser.add_argument('--watchtower-source', type=Path, required=True)
    parser.add_argument('--source-root', type=Path, required=True)
    parser.add_argument('--output-root', type=Path, required=True)
    args = parser.parse_args()
    write_barricade(args.barricade_source, args.output_root / 'barricade.png')
    write_watchtower(args.watchtower_source, args.source_root / 'watchtower' / 'frames',
                     args.output_root / 'watchtower.png', args.output_root / 'watchtower.json')
