import importlib.util
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
PIPELINE = ROOT / 'tools' / 'art' / 'farm_pipeline.py'


def load_pipeline():
    spec = importlib.util.spec_from_file_location('farm_pipeline', PIPELINE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FarmPipelineTest(unittest.TestCase):
    def test_writes_transparent_32px_farm_with_subject_on_baseline(self):
        pipeline = load_pipeline()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'farm-source-v3.png'
            image = Image.new('RGB', (256, 256), '#ff00ff')
            draw = ImageDraw.Draw(image)
            draw.rectangle((40, 30, 215, 225), fill='#714226')
            draw.rectangle((128, 30, 215, 225), fill='#274f36')
            image.save(source)

            output = root / 'farm.png'
            pipeline.write_farm(source, output)

            with Image.open(output) as packaged:
                self.assertEqual(packaged.size, (32, 32))
                self.assertEqual(packaged.mode, 'RGBA')
                self.assertEqual(packaged.getpixel((0, 0))[3], 0)
                self.assertEqual(packaged.getchannel('A').getbbox()[3], 30)
                self.assertEqual(
                    set(packaged.get_flattened_data()),
                    {(0, 0, 0, 0), (113, 66, 38, 255), (39, 79, 54, 255)},
                )


if __name__ == '__main__':
    unittest.main()
