#!/usr/bin/env python3
"""Package approved Steam Vent source states into a fixed Phaser atlas."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

STATES = {
    "idle": "steam-vent-concept-v2-reference-aligned.png",
    "pressure": "steam-vent-concept-v3-steam-gate.png",
    "confusion": "steam-vent-concept-v4-overflowing-steam.png",
}
FRAME = 128


def frame_for(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    background = image.getpixel((0, 0))[:3]
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            distance = max(abs(r - background[0]), abs(g - background[1]), abs(b - background[2]))
            if distance < 18:
                pixels[x, y] = (r, g, b, 0)
    image.thumbnail((FRAME, FRAME), Image.Resampling.LANCZOS)
    frame = Image.new("RGBA", (FRAME, FRAME))
    frame.alpha_composite(image, ((FRAME - image.width) // 2, FRAME - image.height))
    return frame


def package(source_dir: Path, output_png: Path, output_json: Path) -> None:
    atlas = Image.new("RGBA", (FRAME * len(STATES), FRAME))
    frames = {}
    for index, (state, filename) in enumerate(STATES.items()):
        name = f"{state}_0.png"
        frame = frame_for(source_dir / filename)
        atlas.alpha_composite(frame, (index * FRAME, 0))
        frames[name] = {
            "frame": {"x": index * FRAME, "y": 0, "w": FRAME, "h": FRAME},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": FRAME, "h": FRAME},
            "sourceSize": {"w": FRAME, "h": FRAME},
        }
    output_png.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(output_png)
    output_json.write_text(json.dumps({"frames": frames, "meta": {"app": "steam_vent_pipeline.py", "image": output_png.name, "size": {"w": atlas.width, "h": FRAME}, "scale": "1"}}, indent=2), encoding="utf-8")


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[2]
    package(root / "art/source/steam-vent", root / "client/public/art/steam_vent.png", root / "client/public/art/steam_vent.json")
