"""Bake authored night transport onto the exact retained daytime UV charts.

Run with the ORIGINAL master open, never forest-runtime.blend. No .blend, day
atlas, master image or geometry delivery is changed. --prepare-only validates
all source/runtime topology and writes layout evidence without a GPU bake.
"""
import argparse
import hashlib
import json
import runpy
import sys
import time
from pathlib import Path

import bpy
import numpy as np

H = Path(__file__).resolve().parent
sys.path.insert(0, str(H))
from night_contract import (EXPECTED_GROUPS, PROFILE, digest, resolution,
                            day_geometry_digest, validate_group_set, validate_layout, validate_report, valid_cached_group)

parser = argparse.ArgumentParser(); parser.add_argument('--prepare-only', action='store_true')
args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
MASTER = H/'forest-fold-house.blend'; RUNTIME = H/'forest-runtime.blend'
STAGE = H.parents[2]/'artifacts/forest/night-v1'; MAP = H/'lightmaps/night-v1'
RAW = STAGE/'lightmaps/raw'
for folder in [STAGE, MAP, RAW]: folder.mkdir(parents=True, exist_ok=True)


def file_hash(path):
    if not path.is_file(): return None
    with path.open('rb') as stream: return hashlib.file_digest(stream, 'sha256').hexdigest()


def write_json(path, value):
    temporary = path.with_suffix('.partial.json')
    temporary.write_text(json.dumps(value, indent=2)+'\n'); temporary.replace(path)


assert Path(bpy.data.filepath).resolve() == MASTER.resolve(), 'Night export must open the unchanged source master'
source_hash = file_hash(MASTER); runtime_hash = file_hash(RUNTIME)
day_root = H.parents[2]/'public/assets/showcases/forest-fold-house'
day_geometry_hash = day_geometry_digest(day_root)
assert runtime_hash, 'Retained day runtime is required for exact UV transfer'
day = json.loads((H/'bake-report.json').read_text()); validate_group_set(record['group'] for record in day)
assert all(record['sourceSha256'] == source_hash for record in day), 'Day bake is from a different master'
runpy.run_path(str(H/'validate_source.py'))['validate']()
scene = bpy.context.scene


def select(objects):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects: obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


# Same modifier evaluation and material grouping as the proven day export.
deps = bpy.context.evaluated_depsgraph_get(); converted = []
for obj in list(scene.objects):
    if obj.type in ['MESH', 'CURVE'] and (obj.modifiers or obj.type == 'CURVE'):
        converted.append((obj, bpy.data.meshes.new_from_object(obj.evaluated_get(deps), preserve_all_data_layers=True, depsgraph=deps)))
for obj, data in converted:
    if obj.type == 'CURVE':
        replacement = bpy.data.objects.new(obj.name+'_mesh', data); replacement.matrix_world = obj.matrix_world
        for key in obj.keys(): replacement[key] = obj[key]
        scene.collection.objects.link(replacement); bpy.data.objects.remove(obj, do_unlink=True)
    else: obj.modifiers.clear(); obj.data = data
bpy.data.orphans_purge(do_recursive=True)
groups = {}
for obj in list(scene.objects):
    if obj.type != 'MESH' or any(mat.name.startswith(('M04', 'M08', 'M09', 'Blackened', '3000K')) for mat in obj.data.materials): continue
    group = obj.get('forest_group', '')
    if group in ['planting', 'landscape', 'water', 'lights']: continue
    if '_CEILING' in obj.name: group += '_ceiling'
    if obj.get('walk_surface'): group += '_walk'
    groups.setdefault(group, []).append(obj)
validate_group_set(groups)
joined = {}
for group, objects in groups.items():
    select(objects); bpy.ops.object.join(); obj = bpy.context.object
    obj.name = group+'_night_transport'; joined[group] = obj
print('NIGHT SOURCE GROUPS EVALUATED', flush=True)


def array(collection, property_name, width, dtype):
    values = np.empty(len(collection)*width, dtype=dtype)
    collection.foreach_get(property_name, values)
    return values


def layout(obj, include_uv=False):
    mesh = obj.data; topology = hashlib.sha256()
    for values in [array(mesh.vertices, 'co', 3, '<f4'), array(mesh.loops, 'vertex_index', 1, '<i4'),
                   array(mesh.polygons, 'loop_start', 1, '<i4'), array(mesh.polygons, 'loop_total', 1, '<i4'),
                   array(mesh.polygons, 'material_index', 1, '<i4')]:
        topology.update(str(values.shape).encode()); topology.update(values.tobytes())
    # Appended-but-unlinked objects have an unevaluated identity matrix_world.
    # Forest bake groups are unparented: their serialized basis is their exact
    # world transform, without linking the duplicate meshes into the scene.
    assert obj.parent is None, 'Unexpected parent on night bake group: '+obj.name
    result = {'topologySha256': topology.hexdigest(), 'loopCount': len(mesh.loops),
              'transform': [value for row in obj.matrix_basis for value in row]}
    if include_uv:
        chart = mesh.uv_layers.get('Lightmap'); assert chart, 'Retained object has no Lightmap: '+obj.name
        values = array(chart.data, 'uv', 2, '<f4')
        assert np.isfinite(values).all(), 'Non-finite retained lightmap UV'
        result.update(uvCount=len(chart.data), uvSha256=hashlib.sha256(values.tobytes()).hexdigest())
        return result, values
    return result


# Append only the twenty uncompressed group objects. They remain unlinked and
# are removed after transfer; source shaders and evaluated geometry stay active.
names = sorted(groups)
with bpy.data.libraries.load(str(RUNTIME), link=False) as (available, loaded):
    expected = [name+'_transport' for name in names]
    assert all(name in available.objects for name in expected), 'Retained runtime group missing'
    loaded.objects = expected
layouts = {}
for group, retained in zip(names, loaded.objects):
    assert retained and retained.get('baked_diffuse'), 'Not a retained bake object: '+group
    original = joined[group]
    evidence, values = layout(retained, include_uv=True)
    original_layout = layout(original)
    if original_layout['transform'] != evidence['transform']:
        print('NIGHT TRANSFORM CHECK', group, original_layout['transform'], evidence['transform'], flush=True)
    validate_layout(group, original_layout, evidence)
    chart = original.data.uv_layers.get('Lightmap') or original.data.uv_layers.new(name='Lightmap')
    chart.data.foreach_set('uv', values); original.data.uv_layers.active = chart; chart.active_render = True
    layouts[group] = evidence
    bpy.data.objects.remove(retained, do_unlink=True)
bpy.data.orphans_purge(do_recursive=True)
identity = {'sourceSha256': source_hash, 'runtimeSha256': runtime_hash,
            'dayGeometrySha256': day_geometry_hash,
            'lightingProfileSha256': digest(PROFILE), 'layoutsSha256': digest(layouts),
            'pipelineSha256': digest({name: file_hash(H/name) for name in ['night_export.py', 'night_contract.py', 'denoise.py', 'surface_delivery.py']})}
write_json(STAGE/'layout-report.json', {**identity, 'groups': layouts})
print('NIGHT RETAINED UV CONTRACT PASSED: 20 groups', flush=True)
if args.prepare_only: sys.exit(0)

# The established source evening profile, without changing or saving source.
sun = bpy.data.objects['Southwest afternoon sun']; sun.data.energy = PROFILE['sunEnergy']
background = scene.world.node_tree.nodes['Background']
for link in list(background.inputs['Color'].links): scene.world.node_tree.links.remove(link)
background.inputs['Color'].default_value = (*PROFILE['worldColorLinear'], 1)
background.inputs['Strength'].default_value = PROFILE['worldStrength']
for obj in scene.objects:
    if obj.type == 'LIGHT' and obj.data.type != 'SUN': obj.data.energy *= PROFILE['practicalEnergyMultiplier']

prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'METAL'; prefs.get_devices()
for device in prefs.devices: device.use = device.type == 'METAL'
scene.cycles.device = 'GPU'; scene.cycles.samples = PROFILE['samples']; scene.cycles.use_adaptive_sampling = False
scene.cycles.use_auto_tile = True; scene.cycles.tile_size = 512
scene.render.bake.margin = 16; scene.render.bake.margin_type = 'EXTEND'; scene.render.bake.use_clear = True
scene.render.bake.use_pass_color = False; scene.render.bake.use_pass_direct = True; scene.render.bake.use_pass_indirect = True
surfaces = runpy.run_path(str(H/'surface_delivery.py'))
cache_path = STAGE/'cache.json'
cache = json.loads(cache_path.read_text()) if cache_path.is_file() else {}
if cache.get('identity') != identity: cache = {'identity': identity, 'groups': {}}
pending = []
for group, obj in joined.items():
    final = MAP/(group+'.png'); raw = RAW/(group+'.png'); size = resolution(group)
    entry = cache['groups'].get(group, {}); start = time.monotonic()
    if not valid_cached_group(entry, layouts[group], file_hash(raw)):
        select([obj]); image = bpy.data.images.new('Night '+group, width=size, height=size, alpha=False, float_buffer=True)
        for slot in obj.material_slots:
            slot.material = slot.material.copy(); material = slot.material
            for node in material.node_tree.nodes: node.select = False
            node = material.node_tree.nodes.new('ShaderNodeTexImage'); node.image = image; node.select = True
            material.node_tree.nodes.active = node
        print('NIGHT BAKE', group, size, PROFILE['samples'], flush=True)
        bpy.ops.object.bake(type='DIFFUSE')
        scale = surfaces['normalize_irradiance'](image)
        temporary = raw.with_suffix('.partial.png'); image.filepath_raw = str(temporary); image.file_format = 'PNG'; image.save(); temporary.replace(raw)
        entry = {**layouts[group], 'resolution': size, 'samples': PROFILE['samples'],
                 'irradianceScale': scale, 'rawSha256': file_hash(raw), 'denoised': False,
                 'seconds': round(time.monotonic()-start, 2)}
        cache['groups'][group] = entry; write_json(cache_path, cache)
        # Use a file-backed encoded image for both fresh and resumed denoising.
        bpy.data.images.remove(image)
    completed = entry.get('denoised') and entry.get('imageSha256') == file_hash(final)
    if not completed:
        image = bpy.data.images.load(str(raw), check_existing=False); image.filepath_raw = str(final)
        pending.append((obj, image)); entry['denoised'] = False
    else: print('NIGHT REUSED', group, flush=True)


def denoised(obj):
    group = obj.name.removesuffix('_night_transport'); final = MAP/(group+'.png')
    cache['groups'][group].update(denoised=True, imageSha256=file_hash(final))
    write_json(cache_path, cache)


if pending:
    runpy.run_path(str(H/'denoise.py'))['apply'](pending, STAGE, on_done=denoised, reuse_raw=True)
assert file_hash(MASTER) == source_hash and file_hash(RUNTIME) == runtime_hash, 'Source/runtime changed during night bake'
assert day_geometry_digest(day_root) == day_geometry_hash, 'Day geometry changed during night bake'
report = {**identity, 'revision': 1, 'profile': PROFILE, 'groups': cache['groups']}
validate_report(report, source_hash, day_geometry_hash); write_json(H/'night-bake-report.json', report)
print('NIGHT IRRADIANCE COMPLETE', flush=True)
