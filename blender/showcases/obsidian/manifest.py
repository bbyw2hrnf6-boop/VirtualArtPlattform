"""Verify supplied art identity and record the current delivery assets (stdlib).
Run from any directory with Python 3. Outputs asset-manifest.json beside this file.
"""
import hashlib
import json
import struct
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
PUBLIC = ROOT / 'public/assets/showcases/obsidian'


def identity(path):
    return {'path': str(path.relative_to(ROOT)), 'bytes': path.stat().st_size,
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


def jpeg_size(data):
    cursor = 2
    while cursor < len(data):
        assert data[cursor] == 255
        marker = data[cursor + 1]
        length = int.from_bytes(data[cursor + 2:cursor + 4], 'big')
        if marker in {192, 193, 194}:
            return [int.from_bytes(data[cursor + 7:cursor + 9], 'big'),
                    int.from_bytes(data[cursor + 5:cursor + 7], 'big')]
        cursor += length + 2
    raise ValueError('No JPEG dimensions')


def glb(path):
    payload = path.read_bytes()
    assert payload[:4] == b'glTF'
    length = struct.unpack_from('<I', payload, 12)[0]
    doc = json.loads(payload[20:20 + length])
    binary = payload[28 + length:]
    sizes = []
    for image in doc['images']:
        view = doc['bufferViews'][image['bufferView']]
        start = view.get('byteOffset', 0)
        sizes.append(jpeg_size(binary[start:start + view['byteLength']]))
    arts = [n['extras']['artwork_id'] for n in doc['nodes'] if n.get('extras', {}).get('artwork_id')]
    assert sorted(arts) == sorted(a['id'] for a in source['artworks'])
    assert len(arts) == 11
    return {**identity(path), 'meshes': len(doc['meshes']), 'materials': len(doc['materials']),
            'triangles': sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives']),
            'artwork_ids': sorted(arts), 'image_dimensions': sizes,
            'estimated_RGBA_texture_bytes_with_mips': round(sum(w*h*4*4/3 for w, h in sizes))}


source = json.loads((HERE / 'source/asset-index.json').read_text())
artwork = []
for item in source['artworks']:
    original = HERE / 'source' / item['path']
    record = identity(original)
    assert record['sha256'] == item['sha256'], f'Changed supplied artwork: {original}'
    artwork.append({'id': item['id'], 'original': record, 'delivery': identity(PUBLIC / 'artworks' / (item['id'] + '.webp'))})
layout = json.loads((HERE / 'source/layout.json').read_text())
assert len(layout['cameras']) == 30
assert all((HERE / 'proofs' / (camera['id'] + '.png')).exists() for camera in layout['cameras'])
report = {'showcase': 'Obsidian', 'studio_template': False, 'source_version': source['version'],
          'exports': [glb(PUBLIC / ('obsidian-' + size + '.glb')) for size in ['desktop', 'mobile']],
          'cover': identity(PUBLIC / 'cover.webp'), 'artworks': artwork,
          'proof_camera_count': 30,
          'masters': [identity(path) for path in sorted((HERE / 'masters').glob('*.png'))]}
(HERE / 'asset-manifest.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({e['path']: {'bytes': e['bytes'], 'triangles': e['triangles'], 'texture_bytes': e['estimated_RGBA_texture_bytes_with_mips']} for e in report['exports']}, indent=2))
