import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
PIPELINE = ROOT / 'tools' / 'art' / 'generic_structures_pipeline.py'


def load_pipeline():
    spec = importlib.util.spec_from_file_location('generic_structures_pipeline', PIPELINE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class GenericStructuresPipelineTest(unittest.TestCase):
    def test_converts_calibration_sources_into_static_and_animated_packages(self):
        pipeline = load_pipeline()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'source.png'
            image = Image.new('RGB', (256, 256), '#ff00ff')
            ImageDraw.Draw(image).rectangle((64, 32, 192, 224), fill='#714226')
            image.save(source)
            barricade = root / 'barricade.png'
            tower_png, tower_json = root / 'watchtower.png', root / 'watchtower.json'
            pipeline.write_barricade(source, barricade)
            pipeline.write_watchtower(source, root / 'tower-frames', tower_png, tower_json)
            with Image.open(barricade) as image:
                self.assertEqual(image.size, (32, 32))
            metadata = json.loads(tower_json.read_text(encoding='utf-8'))
            self.assertEqual(set(metadata['frames']), {'idle_0.png', 'recoil_0.png'})
            with Image.open(tower_png) as image:
                self.assertEqual(image.size, (98, 64))


if __name__ == '__main__':
    unittest.main()
