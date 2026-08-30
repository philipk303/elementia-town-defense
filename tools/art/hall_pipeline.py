#!/usr/bin/env python3
"""Convert the approved Town Hall calibration source into a runtime image."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


CANVAS_SIZE = (64, 64)
CONTENT_SIZE = (60, 60)
BASELINE = 62


def extract_subject(source: Image.Image) -> Image.Image:
    rgba = source.convert('RGBA')
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            red, green, blue, _ = pixels[x, y]
            pixels[x, y] = (
                red,
                green,
                blue,
                0 if red > 220 and blue > 180 and green < 70 else 255,
            )
    bounds = rgba.getchannel('A').getbbox()
    if bounds is None:
        raise ValueError('calibration source has no opaque subject')
    return rgba.crop(bounds)


def fit(subject: Image.Image) -> Image.Image:
    scale = min(CONTENT_SIZE[0] / subject.width, CONTENT_SIZE[1] / subject.height)
    size = (max(1, round(subject.width * scale)), max(1, round(subject.height * scale)))
    sprite = subject.resize(size, Image.Resampling.NEAREST)
    frame = Image.new('RGBA', CANVAS_SIZE)
    frame.alpha_composite(sprite, ((CANVAS_SIZE[0] - sprite.width) // 2, BASELINE - sprite.height))
    return frame


def write_hall(source: Path, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    fit(extract_subject(Image.open(source))).save(output)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    write_hall(args.source, args.output)
