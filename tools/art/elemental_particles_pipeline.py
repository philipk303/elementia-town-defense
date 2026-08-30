#!/usr/bin/env python3
"""Package approved elemental particle sources into a Phaser atlas."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image


CANVAS = 64
GUTTER = 2
STATES = ("fire", "steam", "wind", "water", "snow", "smoke", "debris")


def extract_subject(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            red, green, blue, alpha = pixels[x, y]
            if red > 220 and blue > 180 and green < 70:
                pixels[x, y] = (red, green, blue, 0)
            else:
                pixels[x, y] = (red, green, blue, alpha)
    bounds = rgba.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError("source has no visible particle")
    return rgba.crop(bounds)


def fit(subject: Image.Image) -> Image.Image:
    ratio = min((CANVAS - 4) / subject.width, (CANVAS - 4) / subject.height)
    size = (max(1, round(subject.width * ratio)), max(1, round(subject.height * ratio)))
    resized = subject.resize(size, Image.Resampling.NEAREST)
    frame = Image.new("RGBA", (CANVAS, CANVAS))
    frame.alpha_composite(resized, ((CANVAS - resized.width) // 2, (CANVAS - resized.height) // 2))
    return frame


def write_atlas(source_dir: Path, frame_dir: Path, atlas_png: Path, atlas_json: Path) -> None:
    atlas = Image.new("RGBA", (len(STATES) * CANVAS + (len(STATES) - 1) * GUTTER, CANVAS))
    frames = {}
    frame_dir.mkdir(parents=True, exist_ok=True)
    atlas_png.parent.mkdir(parents=True, exist_ok=True)
    for index, state in enumerate(STATES):
        source = source_dir / f"{state}.png"
        if not source.exists():
            raise FileNotFoundError(source)
        frame = fit(extract_subject(Image.open(source)))
        name = f"{state}_0.png"
        frame.save(frame_dir / name)
        x = index * (CANVAS + GUTTER)
        atlas.alpha_composite(frame, (x, 0))
        frames[name] = {
            "frame": {"x": x, "y": 0, "w": CANVAS, "h": CANVAS},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": CANVAS, "h": CANVAS},
            "sourceSize": {"w": CANVAS, "h": CANVAS},
        }
    atlas.save(atlas_png)
    atlas_json.write_text(json.dumps({
        "frames": frames,
        "meta": {"app": "elemental_particles_pipeline.py", "image": atlas_png.name,
                 "format": "RGBA8888", "size": {"w": atlas.width, "h": atlas.height}, "scale": "1"},
    }, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--frame-dir", type=Path, required=True)
    parser.add_argument("--atlas-png", type=Path, required=True)
    parser.add_argument("--atlas-json", type=Path, required=True)
    args = parser.parse_args()
    write_atlas(args.source_dir, args.frame_dir, args.atlas_png, args.atlas_json)
