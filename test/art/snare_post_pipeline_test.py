import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
PIPELINE = ROOT / 'tools' / 'art' / 'snare_post_pipeline.py'


def load_pipeline():
    spec = importlib.util.spec_from_file_location('snare_post_pipeline', PIPELINE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class SnarePostPipelineTest(unittest.TestCase):
    def test_writes_idle_and_pulse_phaser_atlas_from_approved_source(self):
        pipeline = load_pipeline()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'snare-post-concept-v1.png'
            image = Image.new('RGB', (512, 512), '#ff00ff')
            draw = ImageDraw.Draw(image)
            draw.rectangle((170, 90, 340, 400), fill='#55351e')
            draw.ellipse((80, 340, 420, 465), outline='#c89648', width=18)
            image.save(source)

            atlas_png, atlas_json = root / 'snare_post.png', root / 'snare_post.json'
            pipeline.write_atlas(source, root / 'frames', atlas_png, atlas_json)

            metadata = json.loads(atlas_json.read_text(encoding='utf-8'))
            self.assertEqual(set(metadata['frames']), {'idle_0.png', 'pulse_0.png'})
            with Image.open(atlas_png) as atlas:
                self.assertEqual(atlas.size, (130, 64))
            self.assertTrue(all((root / 'frames' / name).exists() for name in metadata['frames']))


if __name__ == '__main__':
    unittest.main()
