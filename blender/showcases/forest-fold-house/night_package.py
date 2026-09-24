"""Package validated night-only irradiance; run after night_export.py with Pillow."""
from pathlib import Path
import hashlib
import json
from PIL import Image
import numpy as np
from night_contract import day_geometry_digest, validate_report, validate_manifest
from night_rgbm import ENCODING, pixel_hash

H = Path(__file__).resolve().parent
OUT = H.parents[2]/'public/assets/showcases/forest-fold-house/night-v1'
report = json.loads((H/'night-bake-report.json').read_text())


def file_hash(path):
    with path.open('rb') as stream: return hashlib.file_digest(stream, 'sha256').hexdigest()


source_hash = file_hash(H/'forest-fold-house.blend')
validate_report(report, source_hash, day_geometry_digest(OUT.parent))
assert report['runtimeSha256'] == file_hash(H/'forest-runtime.blend'), 'Retained day runtime changed after night bake'
manifest = {key: report[key] for key in ['revision', 'sourceSha256', 'lightingProfileSha256']}
assert report.get('postprocess', {}).get('encoding') == ENCODING, 'Run night_reprocess.py before packaging'
manifest.update(colorSpace='srgb', textureChannel=1, flipY=False, encoding=ENCODING, groups={})
assets = {}
for group, entry in sorted(report['groups'].items()):
    source = H/'lightmaps/night-v1'/f'{group}.png'
    assert file_hash(source) == entry['imageSha256'], 'Corrupt or incomplete night atlas: '+group
    size = entry['resolution']
    assert Image.open(source).size == (size, size) and source.read_bytes()[24] == 16, 'Wrong source night atlas dimensions/precision: '+group
    manifest['groups'][group] = {key: entry[key] for key in ['irradianceScale', 'uvSha256']}
    for tier in ['desktop', 'mobile']:
        folder = OUT/tier; folder.mkdir(parents=True, exist_ok=True)
        rgba = np.load(H.parents[2]/'artifacts/forest/night-v1/rgbm'/tier/f'{group}.npy', allow_pickle=False)
        assert pixel_hash(rgba) == entry['rgbm'][tier]['rgbaSha256'], 'Stale RGBM cache: '+group
        delivery = Image.fromarray(rgba, 'RGBA')
        # No alpha premultiplication: alpha is an irradiance multiplier, not
        # opacity. Lossless WebP must preserve every RGBM byte exactly.
        path = folder/f'{group}.webp'; temporary = path.with_suffix('.partial.webp')
        current = False
        if path.is_file():
            with Image.open(path) as existing:
                current = existing.format == 'WEBP' and existing.size == delivery.size and existing.convert('RGBA').tobytes() == delivery.tobytes()
        if not current:
            delivery.save(temporary, format='WEBP', lossless=True, quality=100, method=4)
            temporary.replace(path)
        manifest['groups'][group][tier] = {
            'url': f'/assets/showcases/forest-fold-house/night-v1/{tier}/{group}.webp',
            'width': delivery.width, 'height': delivery.height,
            'sha256': file_hash(path), 'bytes': path.stat().st_size,
        }
        with Image.open(path) as actual:
            lossless = actual.format == 'WEBP' and actual.convert('RGBA').tobytes() == delivery.tobytes()
            assert lossless, 'Lossy night irradiance encoding: '+group
            assets[manifest['groups'][group][tier]['url']] = {
                'width': actual.width, 'height': actual.height,
                'sha256': file_hash(path), 'bytes': path.stat().st_size,
                'losslessSourceMatch': lossless,
            }
    print('NIGHT PACKAGED', group, flush=True)
totals = validate_manifest(manifest, report, source_hash, assets)
temporary = OUT/'manifest.partial.json'; temporary.write_text(json.dumps(manifest, indent=2)+'\n')
temporary.replace(OUT/'manifest.json')
print('NIGHT PACKAGE COMPLETE', json.dumps(totals))
