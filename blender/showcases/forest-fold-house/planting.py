"""Licensed scanned woodland understory, metric placement outside visitor paths."""
import bpy, math, random
from pathlib import Path

H = Path(__file__).resolve().parent


def apply(terrain_z, occupied):
    rng = random.Random(712)
    collection = bpy.data.collections['08_PLANTING']
    prototypes = {}
    for slug in ['fern_02', 'periwinkle_plant', 'tree_small_02']:
        directory = H / 'materials' / slug
        old_images = set(bpy.data.images)
        with bpy.data.libraries.load(str(directory / (slug + '_2k.blend')), link=False) as (source, target):
            target.objects = ([name for name in source.objects if name == 'tree_small_02_LOD1'] if slug == 'tree_small_02' else [name for name in source.objects if slug == 'fern_02' or name.endswith(('_LOD1', '_LOD3'))])
        obs = [o for o in target.objects if o and o.type == 'MESH']
        for image in set(bpy.data.images) - old_images:
            candidate = directory / 'textures' / Path(image.filepath).name
            if candidate.exists(): image.filepath = str(candidate)
        for obj in obs:
            collection.objects.link(obj)
            obj['forest_group'] = 'planting'
        bpy.context.view_layer.update()
        if slug == 'tree_small_02':
            # The library LOD1 is still 376k polygons. Resolve a bounded 12%
            # derivative once, then share that mesh across understory trees.
            for obj in obs:
                decimate=obj.modifiers.new('Understory delivery detail','DECIMATE');decimate.ratio=.12
                decimate.use_collapse_triangulate=True
                deps=bpy.context.evaluated_depsgraph_get()
                mesh=bpy.data.meshes.new_from_object(obj.evaluated_get(deps),preserve_all_data_layers=True,depsgraph=deps)
                obj.modifiers.clear();obj.data=mesh
        prototypes[slug] = obs

    # Replace the coarse near-field procedural ferns. Keep actual roof plants
    # and fine sedges; photographed groundcover adds a second vegetation scale.
    for obj in list(collection.objects):
        if obj.name.startswith(('Woodland fern', 'Roof perennial')):
            bpy.data.objects.remove(obj, do_unlink=True)

    def place(slug, x, y, z, scale, distant=False):
        choices = prototypes[slug]
        if slug == 'periwinkle_plant':
            choices = [o for o in choices if o.name.endswith('_LOD3' if distant else '_LOD1')]
        # A library contains alternative plants / LODs, never a single clump.
        for proto in [rng.choice(choices)]:
            obj = proto.copy(); obj.data = proto.data
            collection.objects.link(obj)
            obj.location = (x, y, z)
            obj.rotation_euler.z = rng.random() * math.tau
            obj.scale = tuple(v * scale for v in proto.scale)
            obj.name = 'Scanned woodland ' + slug

    for i in range(1600):
        x, y = rng.uniform(-23, 23), rng.uniform(-20, 19)
        if occupied(x, y) or (-8.8 < x < -.6 and -5.8 < y < -3.6) or (2.6 < x < 8.5 and -2.8 < y < -1.2) or (-5.9 < x < -3.8 and 3.5 < y < 9):
            continue
        slug = 'fern_02' if i % 3 == 0 else 'periwinkle_plant'
        place(slug, x, y, terrain_z(x, y), rng.uniform(1.6, 2.8), math.hypot(x,y)>14)
    # Shorter shrub clusters on the ridge break the otherwise empty lower
    # canopy, while every authored window and the house paths remain clear.
    for i in range(800):
        angle = i * 2.399; radius = rng.uniform(23, 44)
        x, y = math.cos(angle) * radius, math.sin(angle) * radius
        place('fern_02' if i % 4 == 0 else 'periwinkle_plant', x, y, terrain_z(x, y), rng.uniform(1.8, 3.2), True)
    for a,b,c,d in [(-8,-4,-1,4),(3,-1.5,8,4)]:
        for i in range(155):
            place('fern_02' if i%2 else 'periwinkle_plant',rng.uniform(a+.45,c-.45),rng.uniform(b+.45,d-.45),7.03,rng.uniform(1.25,2.0))
    for x,y in [(-12,-9),(13,-8),(-13,3),(12,5),(-11,10),(9,12),(-17,-16),(14,-18),(-6,-25),(1,-28),(8,-25),(-12,-23),(19,-15),(.5,16),(9,17),(-12,14),(20,8),(-20,-6),(-17,17),(17,20)]:
        place('tree_small_02',x,y,terrain_z(x,y),rng.uniform(1.0,1.55),True)
    for obs in prototypes.values():
        for obj in obs: bpy.data.objects.remove(obj, do_unlink=True)
    # Portable relative paths are resolved against the final editable master.
    for image in bpy.data.images:
        if str(H / 'materials') in image.filepath:
            image.filepath = '//materials/' + str(Path(image.filepath).relative_to(H / 'materials'))
