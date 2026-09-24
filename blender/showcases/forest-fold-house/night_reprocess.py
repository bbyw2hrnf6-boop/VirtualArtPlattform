"""CPU-only repair of night delivery from retained 16-bit raw bakes; no rebake.

Run Blender --background --factory-startup --python-exit-code 1 --python this.py.
No source .blend or day artifact is opened/modified. PNG decoding uses Blender's
float image buffer so Pillow cannot silently discard the low eight bits.
"""
from pathlib import Path
import hashlib
import json
import runpy
import sys
import bpy
import numpy as np

H = Path(__file__).resolve().parent; sys.path.insert(0, str(H))
from night_contract import day_geometry_digest, validate_report
from night_rgbm import ENCODING, encode, decode, resize_linear, pixel_hash

STAGE = H.parents[2]/'artifacts/forest/night-v1'; MAP = H/'lightmaps/night-v1'
report_path = H/'night-bake-report.json'; report = json.loads(report_path.read_text())


def file_hash(path):
    with path.open('rb') as stream: return hashlib.file_digest(stream, 'sha256').hexdigest()


def save_report():
    temporary = report_path.with_suffix('.partial.json')
    temporary.write_text(json.dumps(report, indent=2)+'\n'); temporary.replace(report_path)


source_hash = file_hash(H/'forest-fold-house.blend')
validate_report(report, source_hash, day_geometry_digest(H.parents[2]/'public/assets/showcases/forest-fold-house'))
assert report['runtimeSha256'] == file_hash(H/'forest-runtime.blend')
pending = []
for group, entry in sorted(report['groups'].items()):
    raw = STAGE/'lightmaps/raw'/f'{group}.png'; final = MAP/f'{group}.png'
    if entry.get('retainedBitDepth') == 16 and entry.get('ditherIntensity') == 0 and file_hash(final) == entry['imageSha256']:
        assert final.read_bytes()[24] == 16, 'Retained night precision lost: '+group
        continue
    assert file_hash(raw) == entry['rawSha256'], 'Raw night bake changed: '+group
    assert raw.read_bytes()[24] == 16, 'Raw night bake lost 16-bit precision: '+group
    obj = bpy.data.objects.new(group, None)
    image = bpy.data.images.load(str(raw), check_existing=False); image.filepath_raw = str(final)
    pending.append((obj, image))


def denoised(obj):
    entry = report['groups'][obj.name]; final = MAP/f'{obj.name}.png'
    assert final.read_bytes()[24] == 16, 'Denoiser discarded precision'
    entry.update(retainedBitDepth=16, ditherIntensity=0, imageSha256=file_hash(final), denoised=True)
    save_report()


if pending:
    runpy.run_path(str(H/'denoise.py'))['apply'](pending, STAGE, on_done=denoised,
        reuse_raw=True, bit_depth=16, dither_intensity=0)
encoded_root = STAGE/'rgbm'; encoded_root.mkdir(exist_ok=True)
for group, entry in sorted(report['groups'].items()):
    image = bpy.data.images.load(str(MAP/f'{group}.png'), check_existing=False)
    # PNG16 becomes three 32-bit float channels in Blender (depth=96), not
    # a 48-bit image buffer. The PNG header above proves storage precision.
    assert image.is_float and image.depth == 96, 'Expected Blender native RGB float decode'
    values = np.empty(len(image.pixels), dtype=np.float32); image.pixels.foreach_get(values)
    # Blender pixels are bottom-up; Web images are top-down. The native float
    # PNG loader already performs the sRGB-to-scene-linear conversion.
    rgb = values.reshape(image.size[1], image.size[0], 4)[::-1, :, :3].copy()
    # OCIO's native sRGB white decodes to 1.000024 on this Blender build;
    # allow only that measured conversion roundoff, never HDR clipping.
    assert rgb.max() <= 1.00003, 'Unexpected normalized HDR overflow'
    rgb = np.clip(rgb, 0, 1); entry['rgbm'] = {}
    for tier in ['desktop', 'mobile']:
        linear = rgb if tier == 'desktop' else resize_linear(rgb, 1024)
        rgba = encode(linear); decoded = decode(rgba)
        error = np.abs(decoded-linear)
        assert float(error.max()) <= .0046, 'Unexpected RGBM reconstruction error'
        folder = encoded_root/tier; folder.mkdir(exist_ok=True)
        path = folder/f'{group}.npy'; temporary = folder/f'{group}.partial.npy'
        np.save(temporary, rgba); temporary.replace(path)
        entry['rgbm'][tier] = {'rgbaSha256': pixel_hash(rgba), 'width': rgba.shape[1], 'height': rgba.shape[0],
            'maxNormalizedLinearError': float(error.max()), 'meanNormalizedLinearError': float(error.mean())}
    bpy.data.images.remove(image); save_report()
    print('NIGHT RGBM', group, flush=True)
report['postprocess'] = {'encoding': ENCODING, 'retainedBitDepth': 16, 'ditherIntensity': 0,
    'mobileResize': 'scene-linear-area-before-rgbm',
    'pipelineSha256': {name: file_hash(H/name) for name in ['denoise.py', 'night_rgbm.py', 'night_reprocess.py']}}
save_report(); print('NIGHT REPROCESS COMPLETE', flush=True)
