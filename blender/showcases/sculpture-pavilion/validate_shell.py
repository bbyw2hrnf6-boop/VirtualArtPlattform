"""Check real evaluated doorway surfaces, including duplicate faces and light gaps.

Run with Blender against sculpture-pavilion.blend before baking/exporting.
"""
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

depsgraph = bpy.context.evaluated_depsgraph_get()
walls = [
    (obj.name, BVHTree.FromObject(obj, depsgraph))
    for obj in bpy.context.scene.objects
    if obj.type == 'MESH' and ('envelope' in obj.name or 'continuous passage' in obj.name)
]

cases = [
    ('AB north return', (9.85, 0, 2), (0, 1, 0), 2),
    ('AB south return', (9.85, 0, 2), (0, -1, 0), 2),
    ('AB lintel', (9.85, 0, 2), (0, 0, 1), 2.2),
    ('AC east jamb', (3.5, 8.3, 2), (1, 0, 0), 2),
    ('AC west jamb', (3.5, 8.3, 2), (-1, 0, 0), 2),
    ('AC ceiling', (3.5, 8.3, 2), (0, 0, 1), 2.5),
    ('BC east jamb', (17, 8, 2), (1, 0, 0), 2),
    ('BC west jamb', (17, 8, 2), (-1, 0, 0), 2),
    ('BC ceiling', (17, 8, 2), (0, 0, 1), 2.5),
    ('Entry ceiling', (-11, 0, 2), (0, 0, 1), 1.5),
    ('Entry north corner', (-11, 1.49, 3), (0, 0, 1), .5),
    ('Entry south corner', (-11, -1.49, 3), (0, 0, 1), .5),
    ('Entry north wall', (-11, 0, 2), (0, 1, 0), 1.5),
    ('Entry south wall', (-11, 0, 2), (0, -1, 0), 1.5),
]
for name, origin, direction, distance in cases:
    hits = []
    for object_name, tree in walls:
        point, normal, face, length = tree.ray_cast(Vector(origin), Vector(direction), distance + .01)
        if point is not None:
            hits.append((object_name, length, normal))
    assert len(hits) == 1, f'{name}: expected one surface, got {hits}'
    assert abs(hits[0][1] - distance) < .002, f'{name}: shifted surface {hits}'
    assert hits[0][2].dot(Vector(direction)) < -.98, f'{name}: incorrect surface normal {hits}'
    print('PASS', name)
print(f'{len(cases)} architectural ray checks passed')
