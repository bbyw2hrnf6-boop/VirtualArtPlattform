"""Check complete transformed plant bounds, including leaves, against the house."""
import bpy
from mathutils import Vector

# Z-up source coordinates. Roof planting above the shell remains intentional.
ENVELOPES = [
    (-8.08, -4.08, -.7, -.92, 4.08, 6.85),
    (2.92, -1.58, -.7, 8.08, 4.08, 6.85),
    (-1.08, -.18, 3.15, 3.08, 1.58, 6.16),
    (-1.3, .1, -.1, 3.2, 1.5, 2.4),
    (-5.45, 3.8, 3.3, -4.1, 8.5, 5.8),
]


def bounds(obj):
    points = [obj.matrix_world @ Vector(p) for p in obj.bound_box]
    return tuple(min(p[i] for p in points) for i in range(3)) + tuple(max(p[i] for p in points) for i in range(3))


def overlaps(a, b, tolerance=0):
    return all(min(a[i+3], b[i+3]) - max(a[i], b[i]) > tolerance for i in range(3))


def conflicts():
    bpy.context.view_layer.update()
    plants = list(bpy.data.collections['08_PLANTING'].objects)
    plants += [o for o in bpy.data.collections['01_TERRAIN'].objects if o.name.startswith('Gneiss woodland boulder')]
    return [o for o in plants if o.type in {'MESH', 'CURVE'} and any(overlaps(bounds(o), box) for box in ENVELOPES)]


def apply():
    invalid = conflicts()
    names = [o.name for o in invalid]
    for obj in invalid:
        bpy.data.objects.remove(obj, do_unlink=True)
    print('FULL PLANT CLEARANCE:', len(names), 'intersecting plants/rocks removed', flush=True)
    assert not conflicts(), 'Plant or boulder still intersects the house or circulation'
    return names
