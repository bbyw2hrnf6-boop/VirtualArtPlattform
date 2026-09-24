"""Release master completeness and provenance, independent of Blender/Pillow."""

NATIVE_SIZE = (3840, 2160)
EXPECTED_MASTERS = {
    **{f'C01-{lighting}.png': ('C01', lighting, 512 if lighting == 'afternoon' else 256)
       for lighting in ['afternoon', 'overcast', 'evening']},
    **{f'C{camera:02d}-afternoon.png': (f'C{camera:02d}', 'afternoon', 256)
       for camera in range(7, 14)},
}


def validate_master_set(names):
    actual = set(names)
    expected = set(EXPECTED_MASTERS)
    assert actual == expected, (
        f'Release master set mismatch; missing: {sorted(expected - actual)}; '
        f'unexpected: {sorted(actual - expected)}')


def validate_master(name, evidence, image_size, source_hash):
    assert name in EXPECTED_MASTERS, f'Unexpected release master: {name}'
    camera, lighting, samples = EXPECTED_MASTERS[name]
    assert tuple(image_size) == NATIVE_SIZE, f'Non-native master resolution: {name}: {image_size}'
    assert (evidence.get('width'), evidence.get('height')) == NATIVE_SIZE, f'Wrong resolution metadata: {name}'
    assert (evidence.get('camera'), evidence.get('lighting')) == (camera, lighting), f'Camera/lighting metadata mismatch: {name}'
    assert evidence.get('samples') == samples, f'Wrong release sample count: {name}: expected {samples}'
    assert evidence.get('sourceSha256') == source_hash, f'Stale master from another model revision: {name}'
