import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
PIPELINE = ROOT / 'tools' / 'art' / 'wind_vortex_pipeline.py'


def load_pipeline():
    spec = importlib.util.spec_from_file_location('wind_vortex_pipeline', PIPELINE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class WindVortexPipelineTest(unittest.TestCase):
    def test_writes_complete_directional_phaser_atlas(self):
        pipeline = load_pipeline()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            concept = root / 'concept.png'
            Image.new('RGB', (900, 640), 'white').save(concept)
            # Deliberately include a dark, saturated subject in every panel.
            image = Image.open(concept).convert('RGB')
            for index, color in enumerate(((30, 180, 230), (20, 150, 220), (10, 100, 200))):
                x = 90 + index * 300
                for xx in range(x, x + 140):
                    for yy in range(120, 360):
                        image.putpixel((xx, yy), color)
            image.save(concept)
            atlas_png, atlas_json = root / 'wind_vortex.png', root / 'wind_vortex.json'
            pipeline.write_atlas(concept, root / 'frames', atlas_png, atlas_json)
            metadata = json.loads(atlas_json.read_text(encoding='utf-8'))
            self.assertEqual(len(metadata['frames']), 20)
            self.assertEqual(set(metadata['frames']), {
                f'{state}_{direction}_0.png'
                for state in pipeline.STATES for direction in pipeline.DIRECTIONS
            })
            with Image.open(atlas_png) as atlas:
                self.assertEqual(atlas.size, (328, 262))
            self.assertTrue(all((root / 'frames' / name).exists() for name in metadata['frames']))


if __name__ == '__main__':
    unittest.main()
