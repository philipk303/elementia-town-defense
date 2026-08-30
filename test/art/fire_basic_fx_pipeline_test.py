import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
PIPELINE = ROOT / "tools" / "art" / "fire_basic_fx_pipeline.py"


def load_pipeline():
    spec = importlib.util.spec_from_file_location("fire_basic_fx_pipeline", PIPELINE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FireBasicFxPipelineTest(unittest.TestCase):
    def test_writes_ten_centered_untrimmed_64px_frames_and_atlas(self):
        pipeline = load_pipeline()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            extend = Image.new("RGB", (256, 256), "#ff00ff")
            ImageDraw.Draw(extend).polygon(((40, 118), (216, 128), (40, 138)), fill="#ff7a00")
            impact = Image.new("RGB", (256, 256), "#ff00ff")
            ImageDraw.Draw(impact).ellipse((68, 68, 188, 188), fill="#ffd23f")
            extend_path, impact_path = root / "extend.png", root / "impact.png"
            extend.save(extend_path)
            impact.save(impact_path)
            atlas_png, atlas_json = root / "fire_saber_extension.png", root / "fire_saber_extension.json"

            pipeline.write_atlas(extend_path, impact_path, root / "frames", atlas_png, atlas_json)

            metadata = json.loads(atlas_json.read_text(encoding="utf-8"))
            self.assertEqual(list(metadata["frames"]), list(pipeline.FRAME_NAMES))
            self.assertEqual(metadata["meta"]["directions"], ["down", "up", "left", "right"])
            self.assertEqual(metadata["meta"]["authoredDirection"], "right")
            with Image.open(atlas_png) as atlas:
                self.assertEqual(atlas.size, (658, 64))
                self.assertEqual(atlas.mode, "RGBA")
            for name in pipeline.FRAME_NAMES:
                with Image.open(root / "frames" / name) as frame:
                    self.assertEqual(frame.size, (64, 64))
                    self.assertEqual(frame.mode, "RGBA")
                    bounds = frame.getchannel("A").getbbox()
                    self.assertIsNotNone(bounds)
                    self.assertGreater(bounds[0], 0)
                    self.assertGreater(bounds[1], 0)
                    self.assertLess(bounds[2], 64)
                    self.assertLess(bounds[3], 64)
                    self.assertFalse(metadata["frames"][name]["trimmed"])


if __name__ == "__main__":
    unittest.main()
