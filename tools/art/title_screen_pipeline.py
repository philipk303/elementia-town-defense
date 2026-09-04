#!/usr/bin/env python3
"""Normalize the approved Nano Banana 2 title-screen render into the lobby
background asset.

Source: art/source/title_screen/approved.jpg (2752x1536, Nano Banana 2 output
-- see art/source/title_screen/nano_banana_prompt.txt for the prompt used).
Center-crops to exactly 16:9 (the source is already ~1.792:1, very close) and
downscales to 1920x1080 so it loads quickly as a full-viewport CSS background
in client/index.html's #lobby overlay.

Run:  uv run --with pillow python tools/art/title_screen_pipeline.py
"""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'art' / 'source' / 'title_screen' / 'approved.jpg'
OUT = ROOT / 'client' / 'public' / 'art' / 'title_screen.jpg'
TARGET_W, TARGET_H = 1920, 1080


def render(source: Path) -> Image.Image:
    im = Image.open(source).convert('RGB')
    target_ratio = TARGET_W / TARGET_H
    w, h = im.size
    src_ratio = w / h
    if src_ratio > target_ratio:
        # Source is wider than 16:9 -- crop the sides.
        new_w = round(h * target_ratio)
        left = (w - new_w) // 2
        im = im.crop((left, 0, left + new_w, h))
    elif src_ratio < target_ratio:
        # Source is taller than 16:9 -- crop top/bottom.
        new_h = round(w / target_ratio)
        top = (h - new_h) // 2
        im = im.crop((0, top, w, top + new_h))
    return im.resize((TARGET_W, TARGET_H), Image.Resampling.LANCZOS)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--source', type=Path, default=SOURCE)
    ap.add_argument('--out', type=Path, default=OUT)
    args = ap.parse_args()

    if not args.source.is_file():
        raise SystemExit(f'missing source: {args.source}')

    im = render(args.source)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    im.save(args.out, quality=88, optimize=True)
    kb = args.out.stat().st_size / 1024
    print(f'wrote {args.out.relative_to(ROOT)} {im.size[0]}x{im.size[1]} {kb:.0f}KB')


if __name__ == '__main__':
    main()
