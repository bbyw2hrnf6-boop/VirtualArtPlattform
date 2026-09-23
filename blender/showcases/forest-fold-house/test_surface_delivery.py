"""Small, render-free Blender regression for Forest's material export.

Blender -b --factory-startup --python blender/showcases/forest-fold-house/test_surface_delivery.py
Creates only an 8 px fixture and a plane in a temporary directory.
"""
import bpy
import json
import runpy
import tempfile
from pathlib import Path


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
    diffuse = image('rock_08_diff_4k.jpg', [.25, .5, 1])
    normal = image('rock_08_nor_gl_2k.jpg', [.5, .5, 1], 'Non-Color')
    roughness = image('rock_08_rough_2k.jpg', [.5, .5, .5], 'Non-Color')
    for bitmap in [diffuse, normal, roughness]:
        node = source.node_tree.nodes.new('ShaderNodeTexImage')
        node.image = bitmap
    material = surface['create_material'](source, 'test', irradiance,
                                          normal.copy(), roughness.copy(), scale, root)

    bpy.ops.mesh.primitive_plane_add()
    plane = bpy.context.object
    plane.data.uv_layers[0].name = 'SurfaceUV'
    plane.data.uv_layers.new(name='Lightmap').active_render = True
    plane.data.materials.append(material)
    target = root / 'surface.gltf'
    bpy.ops.export_scene.gltf(filepath=str(target), export_format='GLTF_SEPARATE',
                              export_extras=True, export_image_format='JPEG',
                              export_jpeg_quality=93)
    document = json.loads(target.read_text())
    exported = document['materials'][0]
    pbr = exported['pbrMetallicRoughness']
    assert exported['emissiveTexture'].get('texCoord', 0) == 1
    assert pbr['baseColorTexture'].get('texCoord', 0) == 0
    assert exported['normalTexture'].get('texCoord', 0) == 0
    assert exported['extras']['forest_irradiance'] is True
    assert exported['extensions']['KHR_materials_emissive_strength']['emissiveStrength'] == scale

    def sample(texture):
        bitmap = document['textures'][texture['index']]['source']
        path = root / document['images'][bitmap]['uri']
        loaded = bpy.data.images.load(str(path), check_existing=False)
        pixels = list(loaded.pixels[:3])
        return pixels if loaded.is_float else [linear(value) for value in pixels]

    energy = [value * scale for value in sample(exported['emissiveTexture'])]
    assert all(abs(a - b) < .04 for a, b in zip(energy, [.25, 2, 4])), energy
    source_linear = [linear(value) for value in diffuse.pixels[:3]]
    expected = [(value * .30 + max(source_linear) * .70) * .88 for value in source_linear]
    albedo = sample(pbr['baseColorTexture'])
    assert all(abs(a - b) < .025 for a, b in zip(albedo, expected)), (albedo, expected)
    print('PASS: Forest irradiance PNG/JPEG energy, linear finish correction and UV channels')
