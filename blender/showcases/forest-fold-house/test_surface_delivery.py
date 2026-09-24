"""Small, render-free Blender regression for Forest's material export.

Blender -b --factory-startup --python blender/showcases/forest-fold-house/test_surface_delivery.py
Creates only 8 px textures and two material-bearing quads in a temporary directory.
"""
import bpy
import json
import runpy
import struct
import tempfile
from pathlib import Path
from urllib.parse import unquote


assert bpy.app.background, 'Run this isolated fixture in background Blender'
surface = runpy.run_path(str(Path(__file__).with_name('surface_delivery.py')))
bpy.ops.wm.read_factory_settings(use_empty=True)


def image(name, rgb, space='sRGB', floating=False):
    result = bpy.data.images.new(name, width=8, height=8, alpha=False,
                                 float_buffer=floating)
    result.colorspace_settings.name = space
    result.pixels[:] = [*rgb, 1] * 64
    return result


def linear(value):
    return value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4


with tempfile.TemporaryDirectory(prefix='lieuva-surface-test-') as directory:
    root = Path(directory)
    irradiance = image('Test irradiance', [.25, 2, 4], 'Linear Rec.709', True)
    scale = surface['normalize_irradiance'](irradiance)
    irradiance.filepath_raw = str(root / 'irradiance.png')
    irradiance.file_format = 'PNG'
    irradiance.save()
    restored = bpy.data.images.load(irradiance.filepath_raw, check_existing=False)
    actual = [value * scale for value in restored.pixels[:3]]
    assert scale == 4
    assert all(abs(a - b) < .0002 for a, b in zip(actual, [.25, 2, 4])), actual
    # Match the denoiser's generated-to-file transition. PNG stores sRGB;
    # Blender exposes its float pixels in linear light after reloading it.
    irradiance.source = 'FILE'
    irradiance.colorspace_settings.name = 'sRGB'
    irradiance.reload()
    actual = [value * scale for value in irradiance.pixels[:3]]
    assert all(abs(a - b) < .0002 for a, b in zip(actual, [.25, 2, 4])), actual

    source = bpy.data.materials.new('M01 test stone')
    source.use_nodes = True
    source['scanned_asset'] = 'rock_08'
    source['surface_tile_m'] = 1.5
    source['delivery_normal_strength'] = .45
    diffuse = image('rock_08_diff_4k.jpg', [.25, .5, 1])
    normal = image('rock_08_nor_gl_2k.jpg', [.5, .5, 1], 'Non-Color')
    roughness = image('rock_08_rough_2k.jpg', [.5, .5, .5], 'Non-Color')
    for bitmap in [diffuse, normal, roughness]:
        node = source.node_tree.nodes.new('ShaderNodeTexImage')
        node.image = bitmap
    material = surface['create_material'](source, 'test', irradiance,
                                          normal.copy(), roughness.copy(), scale, root)

    procedural = bpy.data.materials.new('M05 test procedural limestone')
    procedural.use_nodes = True
    shader = procedural.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (.12, .21, .33, 1)
    shader.inputs['Metallic'].default_value = .2
    shader.inputs['Roughness'].default_value = .3
    baked_albedo = image('Test baked albedo', [.5, .4, .25])
    baked_normal = image('Test baked normal', [.45, .55, 1], 'Non-Color')
    baked_roughness = image('Test baked roughness', [.63, .63, .63], 'Non-Color')
    procedural_material = surface['create_material'](
        procedural, 'test', irradiance, baked_normal, baked_roughness,
        scale, root, baked_albedo)

    mesh = bpy.data.meshes.new('Two surface primitives')
    mesh.from_pydata([(-2, 0, 0), (0, 0, 0), (0, 2, 0), (-2, 2, 0),
                      (0, 0, 0), (2, 0, 0), (2, 2, 0), (0, 2, 0)],
                     [], [(0, 1, 2, 3), (4, 5, 6, 7)])
    mesh.materials.append(material)
    mesh.materials.append(procedural_material)
    mesh.polygons[1].material_index = 1
    uv0 = mesh.uv_layers.new(name='SurfaceUV')
    uv1 = mesh.uv_layers.new(name='Lightmap')
    uv1.active_render = True
    for face in mesh.polygons:
        offset = .5 * face.material_index
        for loop, tile, chart in zip(face.loop_indices,
                                    [(0, 0), (3, 0), (3, 2), (0, 2)],
                                    [(.05, .05), (.45, .05), (.45, .95), (.05, .95)]):
            uv0.data[loop].uv = tile
            uv1.data[loop].uv = (chart[0] + offset, chart[1])
    plane = bpy.data.objects.new('Joined surfaces', mesh)
    bpy.context.scene.collection.objects.link(plane)
    target = root / 'surface.gltf'
    bpy.ops.export_scene.gltf(filepath=str(target), export_format='GLTF_SEPARATE',
                              export_extras=True, export_image_format='JPEG',
                              export_jpeg_quality=93)
    document = json.loads(target.read_text())
    assert len(document['materials']) == 2
    exported = next(m for m in document['materials'] if 'forest_surface_tile_m' in m['extras'])
    procedural_exported = next(m for m in document['materials'] if 'forest_surface_tile_m' not in m['extras'])
    pbr = exported['pbrMetallicRoughness']
    assert exported['emissiveTexture'].get('texCoord', 0) == 1
    assert pbr['baseColorTexture'].get('texCoord', 0) == 0
    assert exported['normalTexture'].get('texCoord', 0) == 0
    assert abs(exported['normalTexture']['scale'] - .45) < .0001
    assert exported['extras']['forest_irradiance'] is True
    assert exported['extensions']['KHR_materials_emissive_strength']['emissiveStrength'] == scale

    def sample(texture, colour=True):
        bitmap = document['textures'][texture['index']]['source']
        path = root / unquote(document['images'][bitmap]['uri'])
        loaded = bpy.data.images.load(str(path), check_existing=False)
        pixels = list(loaded.pixels[:3])
        return pixels if loaded.is_float or not colour else [linear(value) for value in pixels]

    energy = [value * scale for value in sample(exported['emissiveTexture'])]
    assert all(abs(a - b) < .04 for a, b in zip(energy, [.25, 2, 4])), energy
    source_linear = [linear(value) for value in diffuse.pixels[:3]]
    expected = [(value * .30 + max(source_linear) * .70) * .88 for value in source_linear]
    albedo = sample(pbr['baseColorTexture'])
    assert all(abs(a - b) < .025 for a, b in zip(albedo, expected)), (albedo, expected)

    procedural_pbr = procedural_exported['pbrMetallicRoughness']
    for texture in [procedural_exported['emissiveTexture'], procedural_exported['normalTexture'],
                    procedural_pbr['baseColorTexture'], procedural_pbr['metallicRoughnessTexture']]:
        assert texture.get('texCoord', 0) == 1, texture
    scan_light = document['textures'][exported['emissiveTexture']['index']]
    procedural_light = document['textures'][procedural_exported['emissiveTexture']['index']]
    assert procedural_light['source'] == scan_light['source'], (procedural_light, scan_light)
    assert document['samplers'][procedural_light['sampler']] == document['samplers'][scan_light['sampler']]
    assert procedural_exported['extras']['forest_atlas_group'] == 'test'
    assert procedural_exported['extras']['forest_irradiance'] is True
    assert procedural_pbr.get('baseColorFactor', [1, 1, 1, 1]) == [1, 1, 1, 1]
    assert abs(procedural_pbr['metallicFactor'] - .2) < .0001
    assert procedural_pbr.get('roughnessFactor', 1) == 1
    albedo = sample(procedural_pbr['baseColorTexture'])
    expected = [linear(value) for value in baked_albedo.pixels[:3]]
    assert all(abs(a - b) < .02 for a, b in zip(albedo, expected)), (albedo, expected)
    normal_pixels = sample(procedural_exported['normalTexture'], colour=False)
    assert all(abs(a - b) < .02 for a, b in zip(normal_pixels, baked_normal.pixels[:3])), normal_pixels
    orm = sample(procedural_pbr['metallicRoughnessTexture'], colour=False)
    assert abs(orm[1] - baked_roughness.pixels[1]) < .02, orm

    def texcoords(accessor_index):
        accessor = document['accessors'][accessor_index]
        assert accessor['type'] == 'VEC2' and accessor['componentType'] == 5126
        view = document['bufferViews'][accessor['bufferView']]
        binary = (root / unquote(document['buffers'][view['buffer']]['uri'])).read_bytes()
        start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
        stride = view.get('byteStride', 8)
        return [struct.unpack_from('<2f', binary, start + i * stride)
                for i in range(accessor['count'])]

    assert len(document['meshes']) == 1
    primitives = document['meshes'][0]['primitives']
    assert len(primitives) == 2
    for primitive in primitives:
        exported_material = document['materials'][primitive['material']]
        coords = texcoords(primitive['attributes']['TEXCOORD_1'])
        tiled = 'forest_surface_tile_m' in exported_material['extras']
        expected_u = .25 if tiled else .75
        assert abs(sum(u for u, _ in coords) / len(coords) - expected_u) < .0001, coords
        if tiled:
            tiled_coords = texcoords(primitive['attributes']['TEXCOORD_0'])
            assert abs(max(u for u, _ in tiled_coords) - 3) < .0001, tiled_coords
    print('PASS: HDR PNG/JPEG energy, linear finish, two-material UV0/UV1 geometry, procedural albedo and non-colour normal/roughness')
