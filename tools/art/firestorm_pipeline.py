#!/usr/bin/env python3
"""Build Firestorm's approved state sources into a deterministic Phaser atlas."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageEnhance


CANVAS = 96
GUTTER = 2
FRAME_STATES = (
    ("idle", "firestorm_idle_source_chromakey.png"),
    ("telegraph", "firestorm_charge_source_chromakey.png"),
    ("charged", "firestorm_charge_source_chromakey.png"),
    ("active", "firestorm_volley_source_chromakey.png"),
    ("recovery", "firestorm_idle_source_chromakey.png"),
)


def chroma_to_alpha(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    key_samples = [pixels[x, y][:3] for x, y in ((0, 0), (rgba.width - 1, 0), (0, rgba.height - 1), (rgba.width - 1, rgba.height - 1))]
    key = tuple(round(sum(sample[channel] for sample in key_samples) / len(key_samples)) for channel in range(3))
    for y in range(rgba.height):
        for x in range(rgba.width):
            red, green, blue, alpha = pixels[x, y]
            distance = ((red - key[0]) ** 2 + (green - key[1]) ** 2 + (blue - key[2]) ** 2) ** 0.5
            # The generated key edge is anti-aliased. Contract the soft matte
            # enough to eliminate its green/magenta halo before downsampling.
            matte = max(0, min(255, round((distance - 48) * 255 / 96)))
            pixels[x, y] = (red, green, blue, alpha * matte // 255)
    return rgba


def render_source(path: Path, index: int, state: str) -> Image.Image:
    if not path.is_file():
        raise ValueError(f"missing Firestorm state source: {path}")
    image = chroma_to_alpha(Image.open(path))
    bounds = image.getchannel("A").point(lambda alpha: 255 if alpha > 32 else 0).getbbox()
    if bounds is None:
        raise ValueError(f"no Firestorm subject remained after chroma removal: {path}")
    subject = image.crop(bounds)
    scale = min((CANVAS - 8) / subject.width, (CANVAS - 8) / subject.height)
    rendered = subject.resize((round(subject.width * scale), round(subject.height * scale)), Image.Resampling.LANCZOS)
    if index:
        rgb = ImageEnhance.Brightness(rendered.convert("RGB")).enhance(1.06 if state in {"telegraph", "charged", "active"} else 0.94)
        rgb.putalpha(rendered.getchannel("A"))
        rendered = rgb
    frame = Image.new("RGBA", (CANVAS, CANVAS))
    offset_x = (CANVAS - rendered.width) // 2
    offset_y = (CANVAS - rendered.height) // 2 + (1 if index else 0)
    frame.alpha_composite(rendered, (offset_x, offset_y))
    return frame


def build(source: Path, png: Path, metadata_path: Path) -> None:
    frame_names = [(state, index, source / file_name) for state, file_name in FRAME_STATES for index in range(2)]
    columns, rows = 5, 2
    atlas = Image.new("RGBA", (columns * CANVAS + (columns + 1) * GUTTER, rows * CANVAS + (rows + 1) * GUTTER))
    frames = {}
    for order, (state, index, path) in enumerate(frame_names):
        column, row = order % columns, order // columns
        x, y = GUTTER + column * (CANVAS + GUTTER), GUTTER + row * (CANVAS + GUTTER)
        atlas.alpha_composite(render_source(path, index, state), (x, y))
        frames[f"{state}_{index:02d}.png"] = {
            "frame": {"x": x, "y": y, "w": CANVAS, "h": CANVAS},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": CANVAS, "h": CANVAS},
            "sourceSize": {"w": CANVAS, "h": CANVAS},
        }
    png.parent.mkdir(parents=True, exist_ok=True)
    metadata_path.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(png)
    metadata_path.write_text(json.dumps({"frames": frames, "meta": {"app": "firestorm_pipeline.py", "image": png.name, "format": "RGBA8888", "size": {"w": atlas.width, "h": atlas.height}, "scale": "1"}}, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--png", type=Path, required=True)
    parser.add_argument("--json", type=Path, required=True)
    args = parser.parse_args()
    build(args.source, args.png, args.json)


if __name__ == "__main__":
    main()
