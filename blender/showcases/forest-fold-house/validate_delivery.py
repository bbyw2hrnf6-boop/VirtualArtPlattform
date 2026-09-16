"""Keep delivered stair geometry aligned with the metric navigation contract."""
import bpy
from mathutils import Vector


def validate():
    bpy.context.view_layer.update()
    stairs = bpy.data.objects['stairs_walk_transport']
    corners = [stairs.matrix_world @ Vector(corner) for corner in stairs.bound_box]
    actual = [(min(p[i] for p in corners), max(p[i] for p in corners)) for i in range(3)]
    expected = [(-7.7, -5.5), (-0.8, 2.7), (0.0, 3.4)]
    assert all(abs(a - b) < 0.002 for pair, target in zip(actual, expected)
               for a, b in zip(pair, target)), f'Stair export left its navigation envelope: {actual}'
