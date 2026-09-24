"""Night-only transport evidence; independent of Blender and Pillow."""
import hashlib
import json
import math
from urllib.parse import unquote, urlsplit

EXPECTED_GROUPS = {
    room + suffix for room in ['W0', 'W1', 'E0', 'E1']
    for suffix in ['', '_walk', '_ceiling', '_furniture']
} | {'exterior', 'bridge_walk', 'stairs_walk', 'courtyard_walk'}
PROFILE = {
    'name': 'authored-blue-hour-v1', 'sunEnergy': 0,
    'worldColorLinear': [.08, .16, .35], 'worldStrength': .22,
    'practicalEnergyMultiplier': 2.5, 'samples': 256,
    'bake': 'DIFFUSE', 'passColor': False, 'direct': True, 'indirect': True,
}


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def day_geometry_digest(root):
    """Bind UV evidence to a complete delivery, including its dependency bytes."""
    revision = 'desktop-v6' if (root/'desktop-v6').exists() else 'desktop-v5'
    desktop = root/revision/'forest-fold-house-desktop.gltf'
    paths = [desktop, root/'forest-fold-house-mobile.glb']
    for buffer in json.loads(desktop.read_text())['buffers']:
        if 'uri' not in buffer:
            # Meshopt's virtual decoded fallback has no file of its own. Its
            # definition is hashed with the glTF; compressed bytes live in bin.
            assert buffer.get('extensions', {}).get('EXT_meshopt_compression', {}).get('fallback') is True, 'Missing day geometry buffer URI'
            continue
        parsed = urlsplit(buffer['uri'])
        assert not (parsed.scheme or parsed.netloc or parsed.query or parsed.fragment), 'External day geometry dependency'
        path = (desktop.parent/unquote(parsed.path)).resolve()
        assert path.is_relative_to(desktop.parent.resolve()), 'Day geometry escapes package'
        paths.append(path)
    hashes = {}
    for path in paths:
        with path.open('rb') as stream:
            hashes[str(path.resolve().relative_to(root.resolve()))] = hashlib.file_digest(stream, 'sha256').hexdigest()
    return digest(hashes)


def resolution(group):
    return 4096 if group in {'W0', 'W1', 'E0', 'E1', 'exterior'} else 2048


def validate_group_set(groups):
    actual = set(groups)
    assert actual == EXPECTED_GROUPS, f'Night group mismatch: {sorted(actual ^ EXPECTED_GROUPS)}'


def validate_layout(group, original, retained):
    assert original['topologySha256'] == retained['topologySha256'], f'Night topology mismatch: {group}'
    assert len(original['transform']) == len(retained['transform']) == 16, f'Invalid transform: {group}'
    assert all(math.isfinite(a) and math.isfinite(b) and abs(a-b) < 1e-6
               for a, b in zip(original['transform'], retained['transform'])), f'Night transform mismatch: {group}'
    assert retained.get('uvCount') == retained['loopCount'] == original['loopCount'] > 0, f'Missing/incomplete night UV chart: {group}'
    assert len(retained.get('uvSha256', '')) == 64, f'Missing night UV hash: {group}'


def valid_cached_group(entry, layout, raw_hash):
    """An incomplete or stale group is rebaked, never accepted by filename."""
    scale = entry.get('irradianceScale', 0) if entry else 0
    return bool(entry and raw_hash and entry.get('rawSha256') == raw_hash
                and entry.get('uvSha256') == layout['uvSha256']
                and entry.get('topologySha256') == layout['topologySha256']
                and entry.get('samples') == PROFILE['samples']
                and math.isfinite(scale) and scale >= 1 and math.log2(scale).is_integer())


def validate_report(report, source_hash, day_geometry_hash=None):
    assert report.get('revision') == 1, 'Unexpected night revision'
    assert report.get('sourceSha256') == source_hash, 'Stale night master'
    assert report.get('lightingProfileSha256') == digest(PROFILE), 'Stale night lighting profile'
    assert report.get('profile') == PROFILE, 'Incorrect night lighting settings'
    assert len(report.get('runtimeSha256', '')) == 64, 'Missing retained runtime provenance'
    assert len(report.get('dayGeometrySha256', '')) == 64, 'Missing day geometry provenance'
    if day_geometry_hash is not None:
        assert report['dayGeometrySha256'] == day_geometry_hash, 'Day geometry changed since night UV transfer'
    groups = report['groups']; validate_group_set(groups)
    layouts = {name: {key: group[key] for key in ['topologySha256', 'loopCount', 'transform', 'uvCount', 'uvSha256']}
               for name, group in groups.items()}
    assert report.get('layoutsSha256') == digest(layouts), 'Stale night topology/UV layout evidence'
    for name, group in groups.items():
        assert group['resolution'] == resolution(name) and group['samples'] == PROFILE['samples'], f'Incorrect night quality: {name}'
        scale = group['irradianceScale']
        assert math.isfinite(scale) and scale >= 1 and math.log2(scale).is_integer(), f'Invalid night normalization: {name}'
        for key in ['uvSha256', 'topologySha256', 'rawSha256', 'imageSha256']:
            assert len(group.get(key, '')) == 64, f'Missing {key}: {name}'
        assert group.get('denoised') is True, f'Incomplete night denoising: {name}'


def validate_manifest(manifest, report, source_hash, assets):
    """Validate decoded file evidence supplied by the Pillow release checker."""
    validate_report(report, source_hash)
    for key in ['revision', 'sourceSha256', 'lightingProfileSha256']:
        assert manifest.get(key) == report[key], f'Stale night manifest {key}'
    assert (manifest.get('colorSpace'), manifest.get('textureChannel'), manifest.get('flipY')) == ('srgb', 1, False), 'Incorrect night texture sampling'
    assert manifest.get('encoding') == 'rgbm-srgb-lossless-webp', 'Night irradiance requires high-precision RGBM lossless encoding'
    postprocess = report.get('postprocess', {})
    assert (postprocess.get('encoding'), postprocess.get('retainedBitDepth'), postprocess.get('ditherIntensity')) == ('rgbm-srgb-lossless-webp', 16, 0), 'Night precision provenance missing'
    validate_group_set(manifest['groups'])
    totals = {'desktop': 0, 'mobile': 0}
    for name, group in manifest['groups'].items():
        evidence = report['groups'][name]
        assert (evidence.get('retainedBitDepth'), evidence.get('ditherIntensity')) == (16, 0), 'Insufficient night retained precision: '+name
        assert group.get('uvSha256') == evidence['uvSha256'], 'Night UV mismatch: '+name
        assert group.get('irradianceScale') == evidence['irradianceScale'], 'Night intensity mismatch: '+name
        for tier in totals:
            texture = group[tier]
            expected_url = f'/assets/showcases/forest-fold-house/night-v1/{tier}/{name}.webp'
            assert texture['url'] == expected_url, 'Unexpected night asset path: '+name
            assert expected_url in assets, 'Missing night asset: '+expected_url
            actual = assets[expected_url]
            assert actual.get('losslessSourceMatch') is True, 'Lossy night irradiance: '+expected_url
            assert len(evidence.get('rgbm', {}).get(tier, {}).get('rgbaSha256', '')) == 64, 'Missing RGBM source evidence: '+name
            size = resolution(name) if tier == 'desktop' else 1024
            assert (texture['width'], texture['height']) == (size, size), 'Wrong declared night dimensions: '+name
            for key in ['width', 'height', 'sha256', 'bytes']:
                assert texture[key] == actual[key], f'Corrupt night {key}: {expected_url}'
            assert 0 < actual['bytes'] < 100*1024**2, 'Invalid night payload size'
            totals[tier] += actual['bytes']
    return totals
