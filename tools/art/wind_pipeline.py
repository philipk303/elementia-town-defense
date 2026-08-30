#!/usr/bin/env python3
"""Convert Wind calibration sources into baseline-aligned preview frames."""

from __future__ import annotations

import argparse
from collections import Counter
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageStat


HERO_DIRECTIONS = ("down", "up", "left", "right")
HERO_STATE_COUNTS = (
    ("idle", 2),
    ("run", 4),
    ("attack", 4),
    ("cast", 4),
    ("hurt", 2),
    ("death", 4),
)
FX_STATE_COUNTS = (("flight", 4), ("impact", 3), ("dissipation", 3))
HERO_PRODUCTION_SCALE = 0.0402


def expected_frame_names(profile: str) -> tuple[str, ...]:
    if profile == "hero":
        return tuple(
            f"{state}_{direction}_{index:02d}.png"
            for direction in HERO_DIRECTIONS
            for state, count in HERO_STATE_COUNTS
            for index in range(count)
        )
    if profile == "fx":
        return tuple(
            f"{state}_{index:02d}.png"
            for state, count in FX_STATE_COUNTS
            for index in range(count)
        )
    if profile == "calibration":
        return ()
    raise ValueError(f"Unknown Wind atlas profile: {profile}")


def validate_sources(sources: list[Path], profile: str) -> list[Path]:
    if profile == "calibration":
        return sorted(sources, key=lambda source: source.name)
    expected = expected_frame_names(profile)
    counts = Counter(source.name for source in sources)
    duplicates = sorted(name for name, count in counts.items() if count > 1)
    if duplicates:
        raise ValueError(f"duplicate source frame names: {', '.join(duplicates)}")
    missing = [name for name in expected if name not in counts]
    if missing:
        raise ValueError(f"missing source frames: {', '.join(missing)}")
    unexpected = sorted(name for name in counts if name not in expected)
    if unexpected:
        raise ValueError(f"unexpected source frames: {', '.join(unexpected)}")
    by_name = {source.name: source for source in sources}
    return [by_name[name] for name in expected]


def sample_border_key(image: Image.Image) -> tuple[int, int, int]:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    edge = max(1, min(width, height) // 32)
    samples = [
        rgba.crop((0, 0, edge, edge)),
        rgba.crop((width - edge, 0, width, edge)),
        rgba.crop((0, height - edge, edge, height)),
        rgba.crop((width - edge, height - edge, width, height)),
    ]
    pixels = [pixel[:3] for sample in samples for pixel in sample.get_flattened_data()]
    return tuple(sorted(channel)[len(channel) // 2] for channel in zip(*pixels))


def remove_chroma(image: Image.Image, transparent_threshold: int = 36, opaque_threshold: int = 96) -> Image.Image:
    rgba = image.convert("RGBA")
    key = sample_border_key(rgba)
    pixels = np.asarray(rgba, dtype=np.uint8)
    color_delta = pixels[..., :3].astype(np.int32) - np.asarray(key, dtype=np.int32)
    distance = np.sqrt(np.square(color_delta).sum(axis=2))
    matte = np.clip(np.rint(255 * (distance - transparent_threshold) / (opaque_threshold - transparent_threshold)), 0, 255).astype(np.uint16)
    output = pixels.copy()
    output[..., 3] = ((pixels[..., 3].astype(np.uint16) * matte) // 255).astype(np.uint8)
    return Image.fromarray(output, "RGBA")


def subject_bounds(image: Image.Image) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A")
    bounds = alpha.point(lambda value: 255 if value > 32 else 0).getbbox()
    if bounds is None:
        raise ValueError("No opaque subject remains after chroma removal")
    return bounds


def place_subject(
    subject: Image.Image,
    output: Path,
    scale: float,
    canvas_size: int,
    baseline_y: int,
    centered: bool = False,
) -> dict:
    target_size = (max(1, round(subject.width * scale)), max(1, round(subject.height * scale)))
    scaled = subject.resize(target_size, Image.Resampling.NEAREST)
    frame = Image.new("RGBA", (canvas_size, canvas_size))
    x = (canvas_size - scaled.width) // 2
    y = (canvas_size - scaled.height) // 2 if centered else baseline_y - scaled.height + 1
    if x < 0 or y < 0 or x + scaled.width > canvas_size or y + scaled.height > canvas_size:
        raise ValueError(
            f"Subject would crop on {canvas_size}x{canvas_size} canvas: "
            f"scaled={scaled.width}x{scaled.height}, position=({x}, {y})"
        )
    frame.alpha_composite(scaled, (x, y))
    output.parent.mkdir(parents=True, exist_ok=True)
    frame.save(output)
    return {"output": str(output), "scale": scale, "baseline_y": baseline_y}


def mirror_source(source: Path, output: Path) -> dict:
    with Image.open(source) as image:
        mirrored = image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        output.parent.mkdir(parents=True, exist_ok=True)
        mirrored.save(output)
    return {"output": str(output), "derived_from": str(source), "transform": "horizontal_mirror"}


def normalize_source_subject(source: Path, output: Path, target_height: int) -> dict:
    with Image.open(source) as image:
        original = image.convert("RGBA")
        key_color = sample_border_key(original)
        cleaned = remove_chroma(original)
        left, top, right, bottom = subject_bounds(cleaned)
        subject = cleaned.crop((left, top, right, bottom))
        scale = target_height / subject.height
        target_width = max(1, round(subject.width * scale))
        resized = subject.resize((target_width, target_height), Image.Resampling.LANCZOS)
        x = (original.width - target_width) // 2
        y = bottom - target_height
        if x < 0 or y < 0 or x + target_width > original.width or y + target_height > original.height:
            raise ValueError(f"Normalized subject would crop: {source}")
        canvas = Image.new("RGBA", original.size, (*key_color, 255))
        canvas.alpha_composite(resized, (x, y))
        output.parent.mkdir(parents=True, exist_ok=True)
        canvas.save(output)
    return {
        "output": str(output),
        "derived_from": str(source),
        "transform": "source_subject_scale",
        "target_height": target_height,
        "scale": scale,
    }


def convert_frame(source: Path, output: Path, canvas_size: int = 64, baseline_y: int = 56, padding: int = 4) -> dict:
    cleaned = remove_chroma(Image.open(source))
    bounds = subject_bounds(cleaned)
    subject = cleaned.crop(bounds)
    max_dimension = canvas_size - 2 * padding
    scale = min(max_dimension / subject.width, max_dimension / subject.height)
    metadata = place_subject(subject, output, scale, canvas_size, baseline_y)
    return {"source": str(source), **metadata, "source_bounds": bounds, "key_color": sample_border_key(Image.open(source))}


def convert_sequence(
    sources: list[Path],
    output_dir: Path,
    canvas_size: int = 64,
    baseline_y: int = 56,
    padding: int = 4,
    scale: float | None = None,
    centered: bool = False,
) -> dict:
    prepared = []
    for source in sources:
        original = Image.open(source)
        cleaned = remove_chroma(original)
        bounds = subject_bounds(cleaned)
        prepared.append((source, cleaned.crop(bounds), bounds, sample_border_key(original)))
    if not prepared:
        raise ValueError("At least one source frame is required")
    max_dimension = canvas_size - 2 * padding
    max_width = max(subject.width for _, subject, _, _ in prepared)
    max_height = max(subject.height for _, subject, _, _ in prepared)
    sequence_scale = scale if scale is not None else min(max_dimension / max_width, max_dimension / max_height)
    frames = []
    for source, subject, bounds, key_color in prepared:
        frame_metadata = place_subject(
            subject,
            output_dir / source.name,
            sequence_scale,
            canvas_size,
            baseline_y,
            centered=centered,
        )
        frames.append({"source": str(source), **frame_metadata, "source_bounds": bounds, "key_color": key_color})
    return {"canvas_size": canvas_size, "baseline_y": baseline_y, "scale": sequence_scale, "frames": frames}


def validate_frame_geometry(sequence: dict, profile: str) -> dict:
    canvas_size = sequence["canvas_size"]
    baseline_y = sequence["baseline_y"]
    warnings = []
    if profile == "hero" and not math.isclose(sequence["scale"], HERO_PRODUCTION_SCALE, rel_tol=0, abs_tol=1e-9):
        raise ValueError(f"hero scale must be {HERO_PRODUCTION_SCALE}, got {sequence['scale']}")
    for frame_metadata in sequence["frames"]:
        if not math.isclose(frame_metadata["scale"], sequence["scale"], rel_tol=0, abs_tol=1e-9):
            raise ValueError(f"inconsistent scale for {frame_metadata['source']}")
        with Image.open(frame_metadata["output"]) as image:
            rgba = image.convert("RGBA")
            if rgba.size != (canvas_size, canvas_size):
                raise ValueError(f"wrong canvas size for {frame_metadata['source']}: {rgba.size}")
            bounds = subject_bounds(rgba)
        left, top, right, bottom = bounds
        if left == 0 or top == 0 or right == canvas_size or bottom == canvas_size:
            raise ValueError(f"opaque pixels touch canvas edge and may crop: {frame_metadata['source']}")
        width = right - left
        height = bottom - top
        frame_metadata["opaque_bounds"] = bounds
        frame_metadata["opaque_width"] = width
        frame_metadata["opaque_height"] = height
        if profile != "hero":
            continue
        state = Path(frame_metadata["source"]).name.split("_", 1)[0]
        if state in {"idle", "run"}:
            if bottom - 1 != baseline_y:
                raise ValueError(f"baseline drift for {frame_metadata['source']}: {bottom - 1} != {baseline_y}")
            if not 40 <= height <= 46:
                raise ValueError(f"grounded frame height outside 40-46 for {frame_metadata['source']}: {height}")
            if not 28 <= width <= 32:
                warnings.append(f"body-width review for {frame_metadata['source']}: {width}px")
    sequence["warnings"] = warnings
    return sequence


def build_preview_atlas(
    sources: list[Path],
    atlas_png: Path,
    atlas_json: Path,
    canvas_size: int = 64,
    profile: str = "calibration",
    gutter: int = 0,
) -> dict:
    ordered_sources = validate_sources(sources, profile)
    sequence = convert_sequence(
        ordered_sources,
        atlas_png.parent / "frames",
        canvas_size=canvas_size,
        scale=HERO_PRODUCTION_SCALE if profile == "hero" else None,
        centered=profile == "fx",
    )
    validate_frame_geometry(sequence, profile)
    columns = min(10 if profile != "calibration" else 4, len(sequence["frames"]))
    rows = math.ceil(len(sequence["frames"]) / columns)
    atlas_width = columns * canvas_size + (columns - 1) * gutter
    atlas_height = rows * canvas_size + (rows - 1) * gutter
    atlas = Image.new("RGBA", (atlas_width, atlas_height))
    frames = {}
    for index, frame_metadata in enumerate(sequence["frames"]):
        x = (index % columns) * (canvas_size + gutter)
        y = (index // columns) * (canvas_size + gutter)
        frame_name = Path(frame_metadata["source"]).name
        frame = Image.open(frame_metadata["output"]).convert("RGBA")
        atlas.alpha_composite(frame, (x, y))
        frames[frame_name] = {
            "frame": {"x": x, "y": y, "w": canvas_size, "h": canvas_size},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": canvas_size, "h": canvas_size},
            "sourceSize": {"w": canvas_size, "h": canvas_size},
        }
    metadata = {
        "frames": frames,
        "meta": {"app": "wind_pipeline.py", "image": atlas_png.name, "size": {"w": atlas.width, "h": atlas.height}, "scale": "1"},
    }
    atlas_png.parent.mkdir(parents=True, exist_ok=True)
    atlas_json.parent.mkdir(parents=True, exist_ok=True)
    temporary_png = atlas_png.with_name(f".{atlas_png.name}.tmp")
    temporary_json = atlas_json.with_name(f".{atlas_json.name}.tmp")
    try:
        atlas.save(temporary_png, format="PNG")
        temporary_json.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
        temporary_png.replace(atlas_png)
        temporary_json.replace(atlas_json)
    finally:
        temporary_png.unlink(missing_ok=True)
        temporary_json.unlink(missing_ok=True)
    return {**sequence, "atlas_png": str(atlas_png), "atlas_json": str(atlas_json)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path, nargs="?")
    parser.add_argument("output", type=Path, nargs="?")
    parser.add_argument("--metadata", type=Path)
    parser.add_argument("--sources-dir", type=Path, action="append")
    parser.add_argument("--atlas-png", type=Path)
    parser.add_argument("--atlas-json", type=Path)
    parser.add_argument("--profile", choices=("calibration", "hero", "fx"), default="calibration")
    args = parser.parse_args()
    if args.sources_dir:
        if not args.atlas_png or not args.atlas_json:
            parser.error("--sources-dir requires --atlas-png and --atlas-json")
        sources = validate_sources(
            [source for source_dir in args.sources_dir for source in source_dir.glob("*.png")],
            args.profile,
        )
        metadata = build_preview_atlas(
            sources,
            args.atlas_png,
            args.atlas_json,
            profile=args.profile,
            gutter=2 if args.profile != "calibration" else 0,
        )
        if args.metadata:
            args.metadata.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
        return
    if not args.source or not args.output:
        parser.error("source and output are required outside atlas mode")
    metadata = convert_frame(args.source, args.output)
    if args.metadata:
        args.metadata.write_text(json.dumps(metadata, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
