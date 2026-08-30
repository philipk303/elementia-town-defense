#!/usr/bin/env python3
"""Build the approved Water Geyser concept into a directional Phaser atlas."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageOps


STATES = ("idle", "telegraph", "active", "recovery", "charged")
DIRECTIONS = ("N", "E", "S", "W")
CANVAS = 64
GUTTER = 2


def extract_subject(panel: Image.Image) -> Image.Image:
    rgba = panel.convert("RGBA")
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, _ = pixels[x, y]
            saturation = max(r, g, b) - min(r, g, b)
            # The concept is composited over a pale aqua field. Keep only
            # saturated magical water or materially dark structure pixels;
            # this deliberately rejects the faint tile-guide rectangles.
            alpha = 255 if min(r, g, b) < 210 or saturation > 60 else 0
            pixels[x, y] = (r, g, b, alpha)
    bounds = rgba.getchannel("A").point(lambda value: 255 if value > 32 else 0).getbbox()
    if bounds is None:
        raise ValueError("concept panel has no usable opaque subject")
    return rgba.crop(bounds)


def orient(image: Image.Image, direction: str) -> Image.Image:
    # Direction remains explicit in the atlas key and the renderer's locked
    # cardinal arrow. Keep the physical geyser upright in every direction so
    # its pool stays grounded rather than rotating its surface into a wall.
    return ImageOps.mirror(image) if direction == "W" else image


def frame_for(subject: Image.Image, name: str) -> Image.Image:
    state, direction, _ = name.removesuffix(".png").split("_")
    image = orient(subject, direction) if state == "active" else subject
    max_height = 60 if state == "active" else 38
    scale = min(60 / image.width, max_height / image.height)
    resized = image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.Resampling.NEAREST)
    frame = Image.new("RGBA", (CANVAS, CANVAS))
    x = (CANVAS - resized.width) // 2
    y = 56 - resized.height + 1
    frame.alpha_composite(resized, (x, y))
    return frame


def panel_for_state(image: Image.Image, state: str) -> Image.Image:
    width, height = image.size
    content_bottom = round(height * 0.77)
    thirds = [image.crop((index * width // 3, 0, (index + 1) * width // 3, content_bottom)) for index in range(3)]
    return {"idle": thirds[0], "telegraph": thirds[1], "charged": thirds[1], "active": thirds[2], "recovery": thirds[0]}[state]


def write_atlas(concept: Path, source_dir: Path, atlas_png: Path, atlas_json: Path) -> None:
    image = Image.open(concept)
    subjects = {state: extract_subject(panel_for_state(image, state)) for state in STATES}
    names = [f"{state}_{direction}_0.png" for state in STATES for direction in DIRECTIONS]
    frames = {}
    atlas = Image.new("RGBA", (5 * CANVAS + 4 * GUTTER, 4 * CANVAS + 3 * GUTTER))
    for index, name in enumerate(names):
        source = frame_for(subjects[name.split("_", 1)[0]], name)
        if source.size != (CANVAS, CANVAS) or source.getchannel("A").getbbox() is None:
            raise ValueError(f"invalid generated frame: {name}")
        source_path = source_dir / name
        source_path.parent.mkdir(parents=True, exist_ok=True)
        source.save(source_path)
        x = (index % 5) * (CANVAS + GUTTER)
        y = (index // 5) * (CANVAS + GUTTER)
        atlas.alpha_composite(source, (x, y))
        frames[name] = {
            "frame": {"x": x, "y": y, "w": CANVAS, "h": CANVAS},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": CANVAS, "h": CANVAS},
            "sourceSize": {"w": CANVAS, "h": CANVAS},
        }
    atlas_png.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(atlas_png)
    atlas_json.write_text(json.dumps({"frames": frames, "meta": {"app": "water_geyser_pipeline.py", "image": atlas_png.name, "size": {"w": atlas.width, "h": atlas.height}, "scale": "1"}}, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("concept", type=Path)
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--atlas-png", type=Path, required=True)
    parser.add_argument("--atlas-json", type=Path, required=True)
    args = parser.parse_args()
    write_atlas(args.concept, args.source_dir, args.atlas_png, args.atlas_json)


if __name__ == "__main__":
    main()
