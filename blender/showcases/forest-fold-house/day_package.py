"""Encode reprocessed day arrays as lossless WebP for glTF packaging."""
from pathlib import Path
import json
import numpy as np
from PIL import Image
from night_rgbm import pixel_hash

H = Path(__file__).resolve().parent
STAGE = H.parents[2]/'artifacts/forest/day-v6'
report = json.loads((STAGE/'report.json').read_text())
for group, tiers in report['groups'].items():
    for tier, expected in tiers.items():
        path = STAGE/tier/group
        rgba = np.load(path.with_suffix('.npy'), allow_pickle=False)
        assert pixel_hash(rgba) == expected['sha256']
        image = Image.fromarray(rgba)
        image.save(path.with_suffix('.webp'), lossless=True, quality=100, method=4)
        assert Image.open(path.with_suffix('.webp')).convert('RGBA').tobytes() == rgba.tobytes()
    print('DAY PACKAGED', group, flush=True)
