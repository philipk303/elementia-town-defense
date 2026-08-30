#!/usr/bin/env python3
"""Package Blizzard target-effect source frames into a Phaser atlas."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'art' / 'source' / 'blizzard' / 'fx'
OUT = ROOT / 'client' / 'public' / 'art'
CANVAS = 64
GUTTER = 2
STATES = ('warning', 'spike', 'shatter')


def frame_from(path: Path) -> Image.Image:
    source = Image.open(path).convert('RGBA')
    bounds = source.getchannel('A').getbbox()
    if bounds is None:
        raise ValueError(f'empty source: {path}')
    subject = source.crop(bounds)
    scale = min(60 / subject.width, 60 / subject.height)
    size = (max(1, round(subject.width * scale)), max(1, round(subject.height * scale)))
    subject = subject.resize(size, Image.Resampling.LANCZOS)
    frame = Image.new('RGBA', (CANVAS, CANVAS))
    frame.alpha_composite(subject, ((CANVAS - subject.width) // 2, (CANVAS - subject.height) // 2))
    return frame


def package() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    structure = frame_from(ROOT / 'art' / 'source' / 'blizzard' / 'structure-source-v2.png')
    structure.save(OUT / 'blizzard.png')
    atlas = Image.new('RGBA', (len(STATES) * CANVAS + (len(STATES) - 1) * GUTTER, CANVAS))
    frames = {}
    for index, state in enumerate(STATES):
        frame = frame_from(SOURCE / f'{state}-source-v1.png')
        name = f'{state}_0.png'
        frame.save(SOURCE / name)
        x = index * (CANVAS + GUTTER)
        atlas.alpha_composite(frame, (x, 0))
        frames[name] = {
            'frame': {'x': x, 'y': 0, 'w': CANVAS, 'h': CANVAS},
            'rotated': False, 'trimmed': False,
            'spriteSourceSize': {'x': 0, 'y': 0, 'w': CANVAS, 'h': CANVAS},
            'sourceSize': {'w': CANVAS, 'h': CANVAS},
        }
    atlas.save(OUT / 'blizzard_fx.png')
    (OUT / 'blizzard_fx.json').write_text(json.dumps({
        'frames': frames,
        'meta': {'app': 'blizzard_pipeline.py', 'image': 'blizzard_fx.png',
                 'size': {'w': atlas.width, 'h': atlas.height}, 'scale': '1'},
    }, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    package()
