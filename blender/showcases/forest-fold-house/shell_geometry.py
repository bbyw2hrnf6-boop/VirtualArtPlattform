"""Welded metric wall solids with rectangular apertures (no Blender dependency)."""


def aperture_prism(lo, hi, bottom, top, depth, openings=()):
    """Return one manifold wall, with shared planar faces and no internal caps.

    Coordinates are (along wall, through wall, height). Openings are
    (along_start, along_end, z_bottom, z_top), including doors at the base.
    A grid retains the exact supplied apertures; only its exposed perimeter
    receives return faces. Coplanar grid edges are therefore never bevelled.
    """
    if hi <= lo or top <= bottom or depth <= 0:
        raise ValueError('Wall dimensions must be positive')
    apertures = [(max(lo, a), min(hi, b), max(bottom, c), min(top, d))
                 for a, b, c, d in openings
                 if min(hi, b) > max(lo, a) and min(top, d) > max(bottom, c)]
    us = sorted({lo, hi, *(v for a, b, _, _ in apertures for v in (a, b))})
    zs = sorted({bottom, top, *(v for _, _, c, d in apertures for v in (c, d))})
    solid = {(i, j) for i in range(len(us) - 1) for j in range(len(zs) - 1)
             if not any(a < (us[i] + us[i+1]) / 2 < b and
                        c < (zs[j] + zs[j+1]) / 2 < d for a, b, c, d in apertures)}
    vertices, faces, indices = [], [], {}

    def vertex(i, side, j):
        key = (i, side, j)
        if key not in indices:
            indices[key] = len(vertices)
            vertices.append((us[i], (-.5 if side == 0 else .5) * depth, zs[j]))
        return indices[key]

    for i, j in sorted(solid):
        # Front/back rectangles share their boundary vertices with neighbours.
        faces.append(tuple(vertex(*p) for p in [(i, 0, j), (i+1, 0, j), (i+1, 0, j+1), (i, 0, j+1)]))
        faces.append(tuple(vertex(*p) for p in [(i, 1, j+1), (i+1, 1, j+1), (i+1, 1, j), (i, 1, j)]))
        for neighbour, corners in [
            ((i-1, j), [(i, 0, j), (i, 0, j+1), (i, 1, j+1), (i, 1, j)]),
            ((i+1, j), [(i+1, 0, j+1), (i+1, 0, j), (i+1, 1, j), (i+1, 1, j+1)]),
            ((i, j-1), [(i+1, 0, j), (i, 0, j), (i, 1, j), (i+1, 1, j)]),
            ((i, j+1), [(i, 0, j+1), (i+1, 0, j+1), (i+1, 1, j+1), (i, 1, j+1)]),
        ]:
            if neighbour not in solid:
                faces.append(tuple(vertex(*p) for p in corners))
    return vertices, faces


def interior_bounds(bounds, envelope, inset):
    """Clip a slab or finish to the inner wall face, retaining the stair void."""
    a, b, c, d = bounds
    x0, y0, x1, y1 = envelope
    result = (max(a, x0+inset), max(b, y0+inset), min(c, x1-inset), min(d, y1-inset))
    return result if result[2] > result[0] and result[3] > result[1] else None
