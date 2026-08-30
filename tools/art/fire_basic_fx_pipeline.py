#!/usr/bin/env python3
"""Package generated Fire saber concepts as a centered Phaser FX atlas."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageEnhance


CANVAS = 64
GUTTER = 2
EXTEND_FRAMES = 6
IMPACT_FRAMES = 4
FRAME_NAMES = tuple(
    [f"extend_{index:02d}.png" for index in range(EXTEND_FRAMES)]
    + [f"impact_{index:02d}.png" for index in range(IMPACT_FRAMES)]
)


def extract_subject(image: Image.Image) -> Image.Image:
    """Remove the flat magenta source background and crop to visible pixels."""
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            red, green, blue, _ = pixels[x, y]
            is_magenta = red > 220 and blue > 180 and green < 70
            pixels[x, y] = (red, green, blue, 0 if is_magenta else 255)
    bounds = rgba.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError("concept has no non-magenta subject")
    return rgba.crop(bounds)


def centered_frame(subject: Image.Image, scale: float, alpha: float = 1.0) -> Image.Image:
    max_edge = round((CANVAS - 4) * scale)
    ratio = min(max_edge / subject.width, max_edge / subject.height)
    size = (max(1, round(subject.width * ratio)), max(1, round(subject.height * ratio)))
    resized = subject.resize(size, Image.Resampling.NEAREST)
    if alpha != 1.0:
        resized.putalpha(ImageEnhance.Brightness(resized.getchannel("A")).enhance(alpha))
    frame = Image.new("RGBA", (CANVAS, CANVAS))
    frame.alpha_composite(resized, ((CANVAS - resized.width) // 2, (CANVAS - resized.height) // 2))
    return frame


def build_frames(extend: Image.Image, impact: Image.Image) -> list[Image.Image]:
    extend_scales = (0.38, 0.52, 0.66, 0.80, 0.92, 1.00)
    impact_phases = ((0.54, 0.75), (0.76, 0.92), (1.00, 1.00), (0.68, 0.55))
    return [centered_frame(extend, scale) for scale in extend_scales] + [
        centered_frame(impact, scale, alpha) for scale, alpha in impact_phases
    ]


def write_atlas(
    extend_concept: Path,
    impact_concept: Path,
    source_dir: Path,
    atlas_png: Path,
    atlas_json: Path,
) -> None:
    extend = extract_subject(Image.open(extend_concept))
    impact = extract_subject(Image.open(impact_concept))
    generated = build_frames(extend, impact)
    atlas = Image.new("RGBA", (len(FRAME_NAMES) * CANVAS + (len(FRAME_NAMES) - 1) * GUTTER, CANVAS))
    frames = {}
    source_dir.mkdir(parents=True, exist_ok=True)
    atlas_png.parent.mkdir(parents=True, exist_ok=True)
    for index, (name, frame) in enumerate(zip(FRAME_NAMES, generated, strict=True)):
        if frame.getchannel("A").getbbox() is None:
            raise ValueError(f"empty generated frame: {name}")
        frame.save(source_dir / name)
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
    atlas_json.write_text(
        json.dumps(
            {
                "frames": frames,
                "meta": {
                    "app": "fire_basic_fx_pipeline.py",
                    "image": atlas_png.name,
                    "size": {"w": atlas.width, "h": atlas.height},
                    "scale": "1",
                    "orientation": "actor_facing",
                    "authoredDirection": "right",
                    "directions": ["down", "up", "left", "right"],
                },
            },
            indent=2,
        ),
        encoding="utf-8",
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("extend_concept", type=Path)
    parser.add_argument("impact_concept", type=Path)
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--atlas-png", type=Path, required=True)
    parser.add_argument("--atlas-json", type=Path, required=True)
    args = parser.parse_args()
    write_atlas(args.extend_concept, args.impact_concept, args.source_dir, args.atlas_png, args.atlas_json)
