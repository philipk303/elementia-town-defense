import importlib.util
import inspect
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
PIPELINE = ROOT / "tools" / "art" / "wind_pipeline.py"


def load_pipeline():
    spec = importlib.util.spec_from_file_location("wind_pipeline", PIPELINE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class WindPipelineTest(unittest.TestCase):
    def test_expected_production_frame_names(self):
        pipeline = load_pipeline()
        expected_frame_names = getattr(pipeline, "expected_frame_names", lambda _profile: ())

        self.assertEqual(
            expected_frame_names("hero"),
            (
                "idle_down_00.png", "idle_down_01.png",
                "run_down_00.png", "run_down_01.png", "run_down_02.png", "run_down_03.png",
                "attack_down_00.png", "attack_down_01.png", "attack_down_02.png", "attack_down_03.png",
                "cast_down_00.png", "cast_down_01.png", "cast_down_02.png", "cast_down_03.png",
                "hurt_down_00.png", "hurt_down_01.png",
                "death_down_00.png", "death_down_01.png", "death_down_02.png", "death_down_03.png",
                "idle_up_00.png", "idle_up_01.png",
                "run_up_00.png", "run_up_01.png", "run_up_02.png", "run_up_03.png",
                "attack_up_00.png", "attack_up_01.png", "attack_up_02.png", "attack_up_03.png",
                "cast_up_00.png", "cast_up_01.png", "cast_up_02.png", "cast_up_03.png",
                "hurt_up_00.png", "hurt_up_01.png",
                "death_up_00.png", "death_up_01.png", "death_up_02.png", "death_up_03.png",
                "idle_left_00.png", "idle_left_01.png",
                "run_left_00.png", "run_left_01.png", "run_left_02.png", "run_left_03.png",
                "attack_left_00.png", "attack_left_01.png", "attack_left_02.png", "attack_left_03.png",
                "cast_left_00.png", "cast_left_01.png", "cast_left_02.png", "cast_left_03.png",
                "hurt_left_00.png", "hurt_left_01.png",
                "death_left_00.png", "death_left_01.png", "death_left_02.png", "death_left_03.png",
                "idle_right_00.png", "idle_right_01.png",
                "run_right_00.png", "run_right_01.png", "run_right_02.png", "run_right_03.png",
                "attack_right_00.png", "attack_right_01.png", "attack_right_02.png", "attack_right_03.png",
                "cast_right_00.png", "cast_right_01.png", "cast_right_02.png", "cast_right_03.png",
                "hurt_right_00.png", "hurt_right_01.png",
                "death_right_00.png", "death_right_01.png", "death_right_02.png", "death_right_03.png",
            ),
        )
        self.assertEqual(
            expected_frame_names("fx"),
            (
                "flight_00.png", "flight_01.png", "flight_02.png", "flight_03.png",
                "impact_00.png", "impact_01.png", "impact_02.png",
                "dissipation_00.png", "dissipation_01.png", "dissipation_02.png",
            ),
        )

    def test_validate_sources_rejects_incomplete_or_ambiguous_sets(self):
        pipeline = load_pipeline()
        expected_frame_names = getattr(pipeline, "expected_frame_names", lambda _profile: ())
        validate_sources = getattr(pipeline, "validate_sources", lambda sources, _profile: sources)
        hero_names = expected_frame_names("hero") or ("idle_down_00.png", "death_right_03.png")
        complete = [Path("first") / name for name in hero_names]

        self.assertEqual(validate_sources(list(reversed(complete)), "hero"), complete)
        with self.assertRaisesRegex(ValueError, "missing.*death_right_03.png"):
            validate_sources(complete[:-1], "hero")
        with self.assertRaisesRegex(ValueError, "unexpected.*surprise.png"):
            validate_sources([*complete, Path("first/surprise.png")], "hero")
        with self.assertRaisesRegex(ValueError, "duplicate.*idle_down_00.png"):
            validate_sources([*complete, Path("second/idle_down_00.png")], "hero")

    def test_mirror_source_is_non_destructive(self):
        pipeline = load_pipeline()
        self.assertTrue(hasattr(pipeline, "mirror_source"), "mirror_source must be implemented")
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            source = tmp_path / "right.png"
            output = tmp_path / "left.png"
            image = Image.new("RGBA", (3, 1))
            image.putdata([(255, 0, 0, 255), (0, 255, 0, 255), (0, 0, 255, 255)])
            image.save(source)
            original_bytes = source.read_bytes()

            metadata = pipeline.mirror_source(source, output)

            self.assertEqual(source.read_bytes(), original_bytes)
            self.assertEqual(
                list(Image.open(output).convert("RGBA").get_flattened_data()),
                [(0, 0, 255, 255), (0, 255, 0, 255), (255, 0, 0, 255)],
            )
            self.assertEqual(metadata["derived_from"], str(source))
            self.assertEqual(metadata["transform"], "horizontal_mirror")

    def test_normalize_source_subject_preserves_raw_source_and_ground_contact(self):
        pipeline = load_pipeline()
        self.assertTrue(hasattr(pipeline, "normalize_source_subject"))
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            source = tmp_path / "raw.png"
            output = tmp_path / "normalized.png"
            image = Image.new("RGB", (40, 40), "#ff00ff")
            ImageDraw.Draw(image).rectangle((15, 10, 24, 29), fill="#0088ff")
            image.save(source)
            original_bytes = source.read_bytes()

            metadata = pipeline.normalize_source_subject(source, output, target_height=24)

            cleaned = pipeline.remove_chroma(Image.open(output))
            left, top, right, bottom = pipeline.subject_bounds(cleaned)
            self.assertEqual(source.read_bytes(), original_bytes)
            with Image.open(output) as normalized:
                self.assertEqual(normalized.size, (40, 40))
            self.assertEqual(bottom - top, 24)
            self.assertEqual(bottom, 30)
            self.assertEqual(metadata["derived_from"], str(source))
            self.assertEqual(metadata["target_height"], 24)

    def test_production_atlas_is_deterministic_and_separated(self):
        pipeline = load_pipeline()
        parameters = inspect.signature(pipeline.build_preview_atlas).parameters
        self.assertIn("profile", parameters)
        self.assertIn("gutter", parameters)
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            sources = []
            for index, name in enumerate(pipeline.expected_frame_names("fx")):
                source = tmp_path / "sources" / name
                source.parent.mkdir(parents=True, exist_ok=True)
                image = Image.new("RGBA", (100, 100), "#ef0aed")
                ImageDraw.Draw(image).rectangle((35, 30, 65, 80), fill=(20 + index, 190, 240, 255))
                image.save(source)
                sources.append(source)

            first_dir = tmp_path / "first"
            second_dir = tmp_path / "second"
            pipeline.build_preview_atlas(sources, first_dir / "atlas.png", first_dir / "atlas.json", profile="fx", gutter=2)
            pipeline.build_preview_atlas(list(reversed(sources)), second_dir / "atlas.png", second_dir / "atlas.json", profile="fx", gutter=2)

            self.assertEqual((first_dir / "atlas.png").read_bytes(), (second_dir / "atlas.png").read_bytes())
            first_json = json.loads((first_dir / "atlas.json").read_text(encoding="utf-8"))
            second_json = json.loads((second_dir / "atlas.json").read_text(encoding="utf-8"))
            self.assertEqual(first_json, second_json)
            self.assertEqual(first_json["frames"]["flight_00.png"]["frame"]["x"], 0)
            self.assertEqual(first_json["frames"]["flight_01.png"]["frame"]["x"], 66)
            atlas = Image.open(first_dir / "atlas.png").convert("RGBA")
            self.assertTrue(all(atlas.getpixel((x, y))[3] == 0 for x in (64, 65) for y in range(64)))

    def test_fx_profile_centers_effect_origin(self):
        pipeline = load_pipeline()
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            sources = []
            for name in pipeline.expected_frame_names("fx"):
                source = tmp_path / "sources" / name
                source.parent.mkdir(parents=True, exist_ok=True)
                image = Image.new("RGBA", (100, 100), "#ef0aed")
                ImageDraw.Draw(image).rectangle((30, 40, 70, 60), fill="#66d9ff")
                image.save(source)
                sources.append(source)

            metadata = pipeline.build_preview_atlas(
                sources,
                tmp_path / "atlas.png",
                tmp_path / "atlas.json",
                profile="fx",
                gutter=2,
            )

            for frame in metadata["frames"]:
                left, top, right, bottom = pipeline.subject_bounds(Image.open(frame["output"]).convert("RGBA"))
                self.assertAlmostEqual((left + right) / 2, 32, delta=0.5)
                self.assertAlmostEqual((top + bottom) / 2, 32, delta=0.5)

    def test_invalid_build_preserves_existing_outputs(self):
        pipeline = load_pipeline()
        parameters = inspect.signature(pipeline.build_preview_atlas).parameters
        self.assertIn("profile", parameters)
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            atlas_png = tmp_path / "atlas.png"
            atlas_json = tmp_path / "atlas.json"
            atlas_png.write_bytes(b"existing png")
            atlas_json.write_text("existing json", encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "missing"):
                pipeline.build_preview_atlas([], atlas_png, atlas_json, profile="fx", gutter=2)

            self.assertEqual(atlas_png.read_bytes(), b"existing png")
            self.assertEqual(atlas_json.read_text(encoding="utf-8"), "existing json")

    def test_hero_conversion_uses_fixed_scale_and_accepts_grounded_height(self):
        pipeline = load_pipeline()
        self.assertIn("scale", inspect.signature(pipeline.convert_sequence).parameters)
        self.assertTrue(hasattr(pipeline, "validate_frame_geometry"), "geometry validation must be implemented")
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            source = tmp_path / "idle_down_00.png"
            image = Image.new("RGBA", (1254, 1254), "#ef0aed")
            ImageDraw.Draw(image).rectangle((327, 130, 926, 1224), fill="#66d9ff")
            image.save(source)

            metadata = pipeline.convert_sequence(
                [source],
                tmp_path / "output",
                scale=pipeline.HERO_PRODUCTION_SCALE,
            )
            pipeline.validate_frame_geometry(metadata, "hero")

            self.assertAlmostEqual(metadata["scale"], 0.0402, places=4)
            self.assertEqual(metadata["frames"][0]["opaque_bounds"][3], 57)
            self.assertIn(metadata["frames"][0]["opaque_height"], range(40, 47))
            self.assertIn("opaque_width", metadata["frames"][0])

    def test_hero_geometry_rejects_grounded_height_outside_target(self):
        pipeline = load_pipeline()
        self.assertTrue(hasattr(pipeline, "validate_frame_geometry"), "geometry validation must be implemented")
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            source = tmp_path / "run_up_00.png"
            image = Image.new("RGBA", (1254, 1254), "#ef0aed")
            ImageDraw.Draw(image).rectangle((327, 300, 926, 1199), fill="#66d9ff")
            image.save(source)
            metadata = pipeline.convert_sequence(
                [source],
                tmp_path / "output",
                scale=pipeline.HERO_PRODUCTION_SCALE,
            )

            with self.assertRaisesRegex(ValueError, "height"):
                pipeline.validate_frame_geometry(metadata, "hero")

    def test_fixed_scale_rejects_subject_that_would_crop(self):
        pipeline = load_pipeline()
        self.assertIn("scale", inspect.signature(pipeline.convert_sequence).parameters)
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            source = tmp_path / "attack_right_00.png"
            image = Image.new("RGBA", (2200, 1254), "#ef0aed")
            ImageDraw.Draw(image).rectangle((100, 130, 2099, 1224), fill="#66d9ff")
            image.save(source)

            with self.assertRaisesRegex(ValueError, "crop"):
                pipeline.convert_sequence(
                    [source],
                    tmp_path / "output",
                    scale=pipeline.HERO_PRODUCTION_SCALE,
                )

    def test_hero_geometry_rejects_grounded_baseline_drift(self):
        pipeline = load_pipeline()
        self.assertTrue(hasattr(pipeline, "validate_frame_geometry"), "geometry validation must be implemented")
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            output = tmp_path / "idle_left_00.png"
            frame = Image.new("RGBA", (64, 64))
            ImageDraw.Draw(frame).rectangle((17, 12, 46, 55), fill="#66d9ff")
            frame.save(output)
            metadata = {
                "canvas_size": 64,
                "baseline_y": 56,
                "scale": 0.0402,
                "frames": [{"source": "idle_left_00.png", "output": str(output), "scale": 0.0402}],
            }

            with self.assertRaisesRegex(ValueError, "baseline"):
                pipeline.validate_frame_geometry(metadata, "hero")

    def test_convert_frame_removes_sampled_chroma_and_locks_baseline(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "source.png"
            output = Path(tmp) / "frame.png"
            image = Image.new("RGBA", (100, 100), "#ef0aed")
            draw = ImageDraw.Draw(image)
            draw.rectangle((35, 30, 65, 80), fill="#66d9ff")
            image.save(source)

            metadata = load_pipeline().convert_frame(source, output, canvas_size=64, baseline_y=56)

            frame = Image.open(output).convert("RGBA")
            self.assertEqual(frame.size, (64, 64))
            self.assertEqual(frame.getpixel((0, 0))[3], 0)
            self.assertEqual(metadata["baseline_y"], 56)
            opaque_rows = [y for y in range(64) if any(frame.getpixel((x, y))[3] for x in range(64))]
            self.assertEqual(max(opaque_rows), 56)

    def test_convert_sequence_uses_one_scale_and_shared_baseline(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            sources = []
            for name, bounds in (("wide", (20, 25, 80, 80)), ("narrow", (40, 45, 60, 80))):
                source = tmp_path / f"{name}.png"
                image = Image.new("RGBA", (100, 100), "#ef0aed")
                ImageDraw.Draw(image).rectangle(bounds, fill="#66d9ff")
                image.save(source)
                sources.append(source)

            metadata = load_pipeline().convert_sequence(sources, tmp_path / "output", canvas_size=64, baseline_y=56)

            self.assertEqual(len(metadata["frames"]), 2)
            self.assertEqual(len({frame["scale"] for frame in metadata["frames"]}), 1)
            for frame_metadata in metadata["frames"]:
                frame = Image.open(frame_metadata["output"]).convert("RGBA")
                opaque_rows = [y for y in range(64) if any(frame.getpixel((x, y))[3] for x in range(64))]
                self.assertEqual(max(opaque_rows), 56)

    def test_build_preview_atlas_writes_phaser_frame_metadata(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            sources = []
            for name in ("idle_down_00", "idle_down_01"):
                source = tmp_path / f"{name}.png"
                image = Image.new("RGBA", (100, 100), "#ef0aed")
                ImageDraw.Draw(image).rectangle((35, 30, 65, 80), fill="#66d9ff")
                image.save(source)
                sources.append(source)

            atlas_png = tmp_path / "wind_preview.png"
            atlas_json = tmp_path / "wind_preview.json"
            load_pipeline().build_preview_atlas(sources, atlas_png, atlas_json)

            metadata = json.loads(atlas_json.read_text(encoding="utf-8"))
            self.assertEqual(set(metadata["frames"]), {"idle_down_00.png", "idle_down_01.png"})
            self.assertEqual(metadata["frames"]["idle_down_00.png"]["sourceSize"], {"w": 64, "h": 64})
            self.assertTrue(atlas_png.exists())

    def test_cli_atlas_mode_needs_no_single_frame_arguments(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            source = tmp_path / "idle_down_00.png"
            image = Image.new("RGBA", (100, 100), "#ef0aed")
            ImageDraw.Draw(image).rectangle((35, 30, 65, 80), fill="#66d9ff")
            image.save(source)
            result = subprocess.run(
                [sys.executable, str(PIPELINE), "--sources-dir", str(tmp_path), "--atlas-png", str(tmp_path / "atlas.png"), "--atlas-json", str(tmp_path / "atlas.json")],
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue((tmp_path / "atlas.png").exists())

    def test_wind_manifest_records_production_without_gameplay_integration(self):
        manifest = json.loads((ROOT / "art" / "assets-manifest.json").read_text(encoding="utf-8"))
        assets = {asset["id"]: asset for asset in manifest["assets"]}

        hero = assets["hero_wind_atlas"]
        self.assertEqual(
            hero["source"]["source_directories"],
            ["art/source/wind-vertical-slice", "art/source/wind-production"],
        )
        self.assertEqual(hero["pillow"]["frame_count"], 80)
        self.assertEqual(hero["runtime"]["atlas_key"], "chibi_wind")
        self.assertFalse(hero["runtime"]["gameplay_integrated"])

        for asset_id in ("wind_basic_effect", "wind_fan_blade"):
            effect = assets[asset_id]
            self.assertEqual(effect["source"]["source_directory"], "art/source/wind-basic-fx")
            self.assertEqual(effect["pillow"]["frame_count"], 10)
            self.assertEqual(effect["runtime"]["atlas_key"], "wind_basic_fx")
            self.assertFalse(effect["runtime"]["gameplay_integrated"])

    def test_water_manifest_records_production_without_gameplay_integration(self):
        manifest = json.loads((ROOT / "art" / "assets-manifest.json").read_text(encoding="utf-8"))
        assets = {asset["id"]: asset for asset in manifest["assets"]}

        hero = assets["hero_water_atlas"]
        self.assertEqual(hero["source"]["reference_path"], "art/source/calibration/water-reference-v1.png")
        self.assertEqual(hero["source"]["source_directories"], ["art/source/water-production"])
        self.assertEqual(hero["pillow"]["frame_count"], 80)
        self.assertEqual(hero["runtime"]["atlas_key"], "chibi_water")
        self.assertEqual(hero["runtime"]["preview_page"], "client/water-preview.html")
        self.assertFalse(hero["runtime"]["gameplay_integrated"])

        effect = assets["water_palm_effect"]
        self.assertEqual(effect["source"]["source_directory"], "art/source/water-basic-fx")
        self.assertEqual(effect["pillow"]["frame_count"], 10)
        self.assertEqual(effect["runtime"]["atlas_key"], "water_basic_fx")
        self.assertEqual(effect["runtime"]["hero_atlas_key"], "chibi_water")
        self.assertFalse(effect["runtime"]["gameplay_integrated"])


if __name__ == "__main__":
    unittest.main()
