"""Render-free checks for paving coverage and its continuous supporting bed."""


def paving_issues(tiles, perimeter, bed, joint=.002, tolerance=.0001):
    """Check actual bounds, allowing a visual mortar joint, not missing stones.

    Tiles/bed contain name, six world bounds and walk_surface. Expanding each
    tile by half the permitted joint must cover every cross-section of the
    exact plan rectangle. That detects a missing interior tile as well as an
    oversized gap, without fixing a particular tile count or arrangement.
    """
    issues = []
    x0,y0,x1,y1=perimeter
    if not bed:
        return ['Missing continuous paving foundation']
    foundation=bed['bounds']
    if any(abs(a-b)>tolerance for a,b in zip((foundation[0],foundation[1],foundation[3],foundation[4]),perimeter)):
        issues.append('Paving foundation leaves the exact plan perimeter')
    if bed['walk_surface']:
        issues.append('Buried paving foundation is tagged as a walk surface')
    if not tiles:
        return issues+['Missing paving stones']
    expanded=[]
    for tile in tiles:
        a=tile['bounds'];name=tile['name']
        if a[0]<x0-tolerance or a[1]<y0-tolerance or a[3]>x1+tolerance or a[4]>y1+tolerance:
            issues.append('Paving stone crosses plan perimeter: '+name)
        if abs(a[5])>tolerance:
            issues.append('Paving stone leaves the zero-level walking plane: '+name)
        if not tile['walk_surface']:
            issues.append('Paving stone missing walk surface tag: '+name)
        if foundation[5]<a[2]-tolerance or foundation[5]>=a[5]-tolerance or foundation[2]>=a[2]:
            issues.append('Paving stone lacks a recessed continuous support: '+name)
        expanded.append((max(x0,a[0]-joint/2),max(y0,a[1]-joint/2),min(x1,a[3]+joint/2),min(y1,a[4]+joint/2)))
    for i,tile in enumerate(tiles):
        a=tile['bounds']
        if any(min(a[3],other['bounds'][3])-max(a[0],other['bounds'][0])>tolerance and
               min(a[4],other['bounds'][4])-max(a[1],other['bounds'][1])>tolerance
               for other in tiles[i+1:]):
            issues.append('Overlapping paving top faces: '+tile['name'])
    cuts=sorted({x0,x1,*(v for a,b,c,d in expanded for v in (a,c))})
    for left,right in zip(cuts,cuts[1:]):
        if right-left<=tolerance:continue
        probe=(left+right)/2
        spans=sorted((b,d) for a,b,c,d in expanded if a<=probe<=c)
        reached=y0
        for bottom,top in spans:
            if bottom>reached+tolerance:break
            reached=max(reached,top)
        if reached<y1-tolerance:
            issues.append('Paving coverage contains a hole wider than the permitted joint')
            break
    return issues
