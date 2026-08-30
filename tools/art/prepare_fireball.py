"""Normalize the generated Fireball source into the static runtime asset."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


CANVAS = 24
KEY = (0, 255, 0)


def remove_chroma(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            red, green, blue, alpha = pixels[x, y]
            # The source uses a bright green key; retain warm fire highlights.
            if green > 150 and green > red * 1.35 and green > blue * 1.35:
                pixels[x, y] = (red, green, blue, 0)
            else:
                pixels[x, y] = (red, green, blue, alpha)
    return rgba


def normalize(source: Path, output: Path) -> None:
    cutout = remove_chroma(Image.open(source))
    bounds = cutout.getbbox()
    if bounds is None:
        raise ValueError("Fireball source contained no non-key pixels")
    trimmed = cutout.crop(bounds)
    ratio = min(22 / trimmed.width, 18 / trimmed.height)
    size = (max(1, round(trimmed.width * ratio)), max(1, round(trimmed.height * ratio)))
    sprite = trimmed.resize(size, Image.Resampling.NEAREST)
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas.alpha_composite(sprite, ((CANVAS - size[0]) // 2, (CANVAS - size[1]) // 2))
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output, optimize=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    normalize(args.source, args.output)
