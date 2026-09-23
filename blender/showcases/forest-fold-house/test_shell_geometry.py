"""Fast topology regression for the authoring wall generator; no Blender needed."""
import json
from collections import Counter
from pathlib import Path
import unittest

from shell_geometry import aperture_prism, interior_bounds


class ShellGeometryTests(unittest.TestCase):
    def assert_solid(self, vertices, faces, expected_volume):
        edges = Counter(tuple(sorted((a, b))) for face in faces
                        for a, b in zip(face, face[1:]+face[:1]))
        self.assertTrue(edges)
        self.assertEqual(set(edges.values()), {2}, 'Wall is not a closed manifold')
        self.assertEqual(len(vertices), len(set(vertices)), 'Disconnected duplicate wall vertices')
        volume = 0
        for face in faces:
            a = vertices[face[0]]
            for i in range(1, len(face)-1):
                b, c = vertices[face[i]], vertices[face[i+1]]
                volume += (a[0]*(b[1]*c[2]-b[2]*c[1]) + a[1]*(b[2]*c[0]-b[0]*c[2]) + a[2]*(b[0]*c[1]-b[1]*c[0])) / 6
        self.assertAlmostEqual(volume, expected_volume, places=7)

    def test_door_and_high_window_keep_exact_voids(self):
        vertices, faces = aperture_prism(0, 7, 0, 3.4, .3, [(1, 2, 0, 2.5), (4, 6, 1.8, 2.8)])
        self.assert_solid(vertices, faces, (7*3.4-2.5-2)*.3)
        # No perpendicular internal cap may create the old artificial panel joints.
        for face in faces:
            points = [vertices[i] for i in face]
            if len({p[1] for p in points}) == 1:
                continue
            u, z = sum(p[0] for p in points)/4, sum(p[2] for p in points)/4
            self.assertTrue(u in (0, 7) or z in (0, 3.4) or
                            ((u in (1, 2) and 0 <= z <= 2.5) or (z == 2.5 and 1 <= u <= 2)) or
                            ((u in (4, 6) and 1.8 <= z <= 2.8) or (z in (1.8, 2.8) and 4 <= u <= 6)))

    def test_all_supplied_shell_apertures_are_manifold(self):
        plan = json.loads((Path(__file__).parent/'source/data/scene.json').read_text())
        for wing in plan['wings']:
            x0, y0, x1, y1 = wing['bounds_xy']
            for level, base in [('L0', 0), ('L1', 3.4)]:
                for side in ('N', 'S', 'E', 'W'):
                    lo, hi = (x0, x1) if side in ('N', 'S') else (y0+.3, y1-.3)
                    apertures = [(o['along_start'], o['along_end'], o['z_bottom'], o['z_top'])
                                 for o in plan['openings'] if (o['wing'], o['level'], o['side']) == (wing['id'], level, side)]
                    volume = ((hi-lo)*3.4 - sum((min(hi,b)-max(lo,a))*(d-c) for a,b,c,d in apertures))*.3
                    with self.subTest(wing=wing['id'], level=level, side=side):
                        self.assert_solid(*aperture_prism(lo, hi, base, base+3.4, .3, apertures), volume)

    def test_slab_clip_keeps_stair_open_and_removes_wall_sliver(self):
        envelope = (-8, -4, -1, 4)
        self.assertIsNone(interior_bounds((-8, -.85, -7.7, 2.7), envelope, .3))
        self.assertEqual(interior_bounds((-5.45, -.85, -1, 4), envelope, .3), (-5.45, -.85, -1.3, 3.7))


if __name__ == '__main__':
    unittest.main()
