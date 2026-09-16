"""Remove denoiser boundary noise from architecture transport, never artwork.

Build-only Pillow/NumPy/SciPy operation called by polish.py. Filtering is confined
to a 32 px UV boundary, in linear light, with no sampling across separate islands.
The unfiltered Cycles inputs remain in lightmaps/raw.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd

path, coordinates = map(Path, sys.argv[1:])
if not path.name.endswith('_architecture_transport.png'):
    raise ValueError('Only architectural transport atlases may be edge-filtered')
image = Image.open(path).convert('RGB')
width, height = image.size
mask = Image.new('L', image.size)
draw = ImageDraw.Draw(mask)
for triangle in json.loads(coordinates.read_text()):
    draw.polygon([(round(u * width - .5), round((1 - v) * height - .5)) for u, v in triangle], fill=255)
valid = np.array(mask) > 0
labels, count = nd.label(valid)
srgb = np.array(image).astype('float32') / 255
linear = np.where(srgb <= .04045, srgb / 12.92, ((srgb + .055) / 1.055) ** 2.4)
distance = nd.distance_transform_edt(valid)
for identity, bounds in enumerate(nd.find_objects(labels), 1):
    if bounds is None:
        continue
    island = labels[bounds] == identity
    sigma = 8 if island.sum() > 1024 else 2
    weights = nd.gaussian_filter(island.astype('float32'), sigma, mode='constant')
    blend = np.clip((32 - distance[bounds]) / 16, 0, 1) * island
    for channel in range(3):
        source = linear[bounds][:, :, channel]
        filtered = nd.gaussian_filter(source * island, sigma, mode='constant') / np.maximum(weights, .00001)
        source[:] = source * (1 - blend) + filtered * blend
# Dilation must happen AFTER denoising: retaining the original noisy margin
# reintroduces its grain through bilinear/trilinear texture sampling.
distance, nearest = nd.distance_transform_edt(~valid, return_indices=True)
padding = (~valid) & (distance <= 32)
linear[padding] = linear[nearest[0][padding], nearest[1][padding]]
srgb = np.where(linear <= .0031308, linear * 12.92, 1.055 * np.maximum(linear, 0) ** (1 / 2.4) - .055)
Image.fromarray(np.round(np.clip(srgb, 0, 1) * 255).astype('uint8')).save(path)
print(f'Filtered {count} architectural UV islands: {path.name}', flush=True)
