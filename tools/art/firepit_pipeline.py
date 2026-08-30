#!/usr/bin/env python3
"""Build the approved Firepit source into a deterministic Phaser atlas."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageEnhance


CANVAS = (96, 64)
BASELINE_Y = 55
GUTTER = 2
SOURCE_NAME = "approved.png"
FRAME_NAMES = tuple(
    [f"idle_{index:02d}.png" for index in range(4)]
    + [f"active_{index:02d}.png" for index in range(4)]
)


def chroma_to_alpha(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            red, green, blue, alpha = pixels[x, y]
            if green >= 180 and red <= 80 and blue <= 80:
                pixels[x, y] = (red, green, blue, 0)
                continue
            distance = ((red - 0) ** 2 + (green - 255) ** 2 + (blue - 0) ** 2) ** 0.5
            matte = max(0, min(255, round((distance - 12) * 255 / 120)))
            pixels[x, y] = (red, green, blue, alpha * matte // 255)
    return rgba


def opaque_bounds(image: Image.Image) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A").point(lambda value: 255 if value > 32 else 0)
    bounds = alpha.getbbox()
    if bounds is None:
        raise ValueError("no opaque subject remained after chroma removal")
    return bounds


def source_subject(source: Path) -> Image.Image:
    if not source.is_file():
        raise ValueError(f"missing approved Firepit source: {source}")
    cleaned = chroma_to_alpha(Image.open(source))
    return cleaned.crop(opaque_bounds(cleaned))


def make_frame(subject: Image.Image, index: int, active: bool) -> Image.Image:
    # Keep a four-pixel safety border above the flame silhouette while the
    # authoritative bottom baseline remains at y=55.
    max_width, max_height = CANVAS[0] - 4, BASELINE_Y - 3
    scale = min(max_width / subject.width, max_height / subject.height)
    size = (round(subject.width * scale), round(subject.height * scale))
    rendered = subject.resize(size, Image.Resampling.NEAREST)
    if active:
        rgb = ImageEnhance.Brightness(rendered.convert("RGB")).enhance(1.12 + index * 0.03)
        rgb.putalpha(rendered.getchannel("A"))
        rendered = rgb
    frame = Image.new("RGBA", CANVAS)
    bob = 0 if active else (0, 1, 0, -1)[index]
    x = (CANVAS[0] - rendered.width) // 2
    y = BASELINE_Y - rendered.height + 1 + bob
    frame.alpha_composite(rendered, (x, y))
    bounds = opaque_bounds(frame)
    if bounds[0] == 0 or bounds[1] == 0 or bounds[2] == CANVAS[0] or bounds[3] == CANVAS[1]:
        raise ValueError(f"frame {index} touches canvas edge")
    return frame


def pack(frames: dict[str, Image.Image], out_dir: Path) -> None:
    ordered = list(FRAME_NAMES)
    width = len(ordered) * (CANVAS[0] + GUTTER) + GUTTER
    height = CANVAS[1] + GUTTER * 2
    atlas = Image.new("RGBA", (width, height))
    metadata = {}
    for index, name in enumerate(ordered):
        x = GUTTER + index * (CANVAS[0] + GUTTER)
        atlas.alpha_composite(frames[name], (x, GUTTER))
        metadata[name] = {
            "frame": {"x": x, "y": GUTTER, "w": CANVAS[0], "h": CANVAS[1]},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": CANVAS[0], "h": CANVAS[1]},
            "sourceSize": {"w": CANVAS[0], "h": CANVAS[1]},
        }
    out_dir.mkdir(parents=True, exist_ok=True)
    atlas.save(out_dir / "fire_special.png")
    (out_dir / "fire_special.json").write_text(json.dumps({"frames": metadata, "meta": {"image": "fire_special.png", "format": "RGBA8888", "size": {"w": width, "h": height}, "scale": "1"}}, indent=2) + "\n", encoding="utf-8")


def build(source_dir: Path, out_dir: Path) -> None:
    subject = source_subject(source_dir / SOURCE_NAME)
    frames = {}
    for index in range(4):
        frames[f"idle_{index:02d}.png"] = make_frame(subject, index, active=False)
        frames[f"active_{index:02d}.png"] = make_frame(subject, index, active=True)
    pack(frames, out_dir)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    build(args.source, args.out)


if __name__ == "__main__":
    main()
