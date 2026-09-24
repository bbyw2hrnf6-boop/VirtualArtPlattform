"""Recover smooth daylight from retained raw bakes without changing UVs/model.

Blender background script. Denoise raw transport into PNG16, then encode RGBM
before packaging: JPEG errors otherwise become visible after the group HDR gain.
The raw day bake is only PNG8; this cannot recover unrecorded source precision.
"""
from pathlib import Path
import hashlib, json, runpy, sys
import bpy
import numpy as np

H = Path(__file__).resolve().parent
sys.path.insert(0, str(H))
from night_rgbm import encode, decode, resize_linear, pixel_hash

STAGE = H.parents[2]/'artifacts/forest/day-v6'
STAGE.mkdir(parents=True, exist_ok=True)
report = json.loads((H/'bake-report.json').read_text())
source_hash = hashlib.sha256((H/'forest-fold-house.blend').read_bytes()).hexdigest()
fingerprint = {'source': source_hash, 'denoiser': hashlib.sha256((H/'denoise.py').read_bytes()).hexdigest(),
    'raw': {entry['group']: hashlib.sha256((H/'lightmaps/raw'/f"{entry['group']}.png").read_bytes()).hexdigest() for entry in report}}
cache_path = STAGE/'inputs.json'
cached = json.loads(cache_path.read_text()) if cache_path.exists() else None
pending = []
for entry in report:
    assert entry['sourceSha256'] == source_hash
    group = entry['group']
    raw = H/'lightmaps/raw'/f'{group}.png'
    final = STAGE/f'{group}.png'
    if cached == fingerprint and final.exists(): continue
    obj = bpy.data.objects.new(group, None)
    im = bpy.data.images.load(str(raw), check_existing=False)
    im.filepath_raw = str(final)
    pending.append((obj, im))
if pending:
    # The original day denoise provenance remains authoritative for v5.
    prior_report = (H/'lightmaps/denoise-report.json').read_bytes()
    try:
        runpy.run_path(str(H/'denoise.py'))['apply'](pending, H, reuse_raw=True,
            bit_depth=16, dither_intensity=0)
        (STAGE/'denoise-report.json').write_bytes((H/'lightmaps/denoise-report.json').read_bytes())
    finally:
        (H/'lightmaps/denoise-report.json').write_bytes(prior_report)
    cache_path.write_text(json.dumps(fingerprint, indent=2)+'\n')
result = {'sourceSha256': source_hash, 'inputs': fingerprint, 'groups': {}}
for entry in report:
    group = entry['group']
    im = bpy.data.images.load(str(STAGE/f'{group}.png'), check_existing=False)
    assert im.is_float and im.depth == 96
    values = np.empty(len(im.pixels), dtype=np.float32)
    im.pixels.foreach_get(values)
    rgb = np.clip(values.reshape(im.size[1], im.size[0], 4)[::-1,:,:3], 0, 1)
    result['groups'][group] = {}
    for tier in ['desktop', 'mobile']:
        linear = rgb if tier == 'desktop' else resize_linear(rgb, 1024)
        rgba = encode(linear)
        folder = STAGE/tier; folder.mkdir(exist_ok=True)
        np.save(folder/f'{group}.npy', rgba)
        result['groups'][group][tier] = {'sha256': pixel_hash(rgba),
            'maxLinearError': float(np.abs(decode(rgba)-linear).max())}
    bpy.data.images.remove(im)
    print('DAY RGBM', group, flush=True)
(STAGE/'report.json').write_text(json.dumps(result, indent=2)+'\n')
