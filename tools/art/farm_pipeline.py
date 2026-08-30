#!/usr/bin/env python3
"""Convert the approved Farm calibration source into a runtime image."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


CANVAS = 32
BASELINE = 30
MAX_SUBJECT_SIZE = 30


def extract_subject(source: Image.Image) -> Image.Image:
    """Remove the flat magenta review background and crop to the subject."""
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


def fit(subject: Image.Image) -> Image.Image:
    scale = min(MAX_SUBJECT_SIZE / subject.width, MAX_SUBJECT_SIZE / subject.height)
    size = (max(1, round(subject.width * scale)), max(1, round(subject.height * scale)))
    sprite = subject.resize(size, Image.Resampling.NEAREST)
    frame = Image.new('RGBA', (CANVAS, CANVAS))
    frame.alpha_composite(sprite, ((CANVAS - sprite.width) // 2, BASELINE - sprite.height))
    return frame


def write_farm(source: Path, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    fit(extract_subject(Image.open(source))).save(output)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    write_farm(args.source, args.output)
