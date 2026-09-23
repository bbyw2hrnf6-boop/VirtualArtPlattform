"""Fail before expensive rendering when a shell/plant regression reappears."""
import bpy, json, math, runpy
from collections import Counter
from pathlib import Path
from mathutils import Vector

H = Path(__file__).resolve().parent
clearance = runpy.run_path(str(H / 'clearance.py'))
bounds, overlaps = clearance['bounds'], clearance['overlaps']
paving_issues = runpy.run_path(str(H / 'courtyard_geometry_checks.py'))['paving_issues']


def shell_and_joinery_issues():
    """Geometry checks, not naming-only checks, for the reported defects."""
    issues = []
    plan = json.loads((H/'source/data/scene.json').read_text())
    for obj in bpy.context.scene.objects:
        if not obj.get('continuous_shell'):
            continue
        edges = Counter(tuple(sorted((a, b))) for face in obj.data.polygons
                        for a, b in zip(tuple(face.vertices), tuple(face.vertices[1:])+tuple(face.vertices[:1])))
        if not edges or set(edges.values()) != {2}:
            issues.append('Open/non-manifold wall: ' + obj.name)
        if any(mod.type == 'BEVEL' and mod.limit_method != 'ANGLE' for mod in obj.modifiers):
            issues.append('Bevel would expose planar wall subdivisions: ' + obj.name)
    for wing in plan['wings']:
        wid = wing['id']; x0,y0,x1,y1 = wing['bounds_xy']
        for level, base in [('L0', 0), ('L1', 3.4)]:
            for side in ['N', 'S', 'E', 'W']:
                name = f'{wid}_{level}_WALL_{side}'
                obj = bpy.data.objects.get(name)
                if not obj or not obj.get('continuous_shell'):
                    issues.append('Missing continuous wall: ' + name); continue
                a = bounds(obj)
                if abs(a[2]-base) > .001 or abs(a[5]-(base+3.4)) > .001:
                    issues.append('Unclosed floor/roof band: ' + name)
                horizontal = side in ['N','S']
                wall = (y1-.15 if side=='N' else y0+.15) if horizontal else (x1-.15 if side=='E' else x0+.15)
                along = (x0+x1)/2 if horizontal else (y0+y1)/2
                origin = Vector((along,wall-1,base+3.225) if horizontal else (wall-1,along,base+3.225))
                direction = Vector((0,1,0) if horizontal else (1,0,0))
                if not obj.ray_cast(origin,direction,distance=2)[0]:
                    issues.append('See-through story band: ' + name)
                for opening in plan['openings']:
                    if (opening['wing'],opening['level'],opening['side']) != (wid,level,side):continue
                    u=(opening['along_start']+opening['along_end'])/2;z=(opening['z_bottom']+opening['z_top'])/2
                    origin=Vector((u,wall-1,z) if horizontal else (wall-1,u,z))
                    if obj.ray_cast(origin,direction,distance=2)[0]:
                        issues.append('Blocked supplied aperture: ' + opening['id'])
    for name in ['PARTITION_00','PARTITION_03']:
        obj=bpy.data.objects.get(name)
        if not obj or abs(bounds(obj)[2])>.001 or abs(bounds(obj)[5]-6.45)>.001:
            issues.append('Stair enclosure split at floor datum: ' + name)

    # Actual generated contents share their furniture's allowed footprint.
    # This catches shelf books/vases as well as carcasses, even after rotation.
    furniture=[o for o in bpy.context.scene.objects if o.get('forest_furniture_id') and o.type in {'MESH','CURVE'}]
    for obj in furniture:
        a=bounds(obj);footprint=obj.get('joinery_footprint')
        if footprint and any((a[0]<footprint[0]-.001,a[1]<footprint[1]-.001,a[3]>footprint[2]+.001,a[4]>footprint[3]+.001)):
            issues.append('Joinery contents overhang: ' + obj.name)
        if obj.get('forest_furniture_id') in ['F07','F08','F12','F18','F24'] or obj.name.startswith('Bedside table'):
            wing=next(w for w in plan['wings'] if w['id']==('E' if obj['forest_group'].startswith('E') else 'W'))
            x0,y0,x1,y1=wing['bounds_xy']
            if a[0]<x0+.311 or a[1]<y0+.311 or a[3]>x1-.311 or a[4]>y1-.311:
                issues.append('Furniture penetrates interior wall face: ' + obj.name)
    bedroom_door=(-4.5,-.85,3.4,-3.5,.6,5.8)
    north_slit=(6.7,3.55,3.6,7.1,4.05,6.25)
    for obj in furniture:
        if obj.get('forest_furniture_id')=='F12' and overlaps(bounds(obj),bedroom_door):
            issues.append('Wardrobe blocks bedroom entrance: ' + obj.name)
        if obj.get('forest_furniture_id')=='F18' and overlaps(bounds(obj),north_slit):
            issues.append('Library blocks north slit window: ' + obj.name)
    chair=[bounds(o) for o in furniture if o.get('forest_furniture_id')=='F23']
    for obj in furniture:
        if obj.get('forest_furniture_id')=='F24' and any(overlaps(bounds(obj),a,.001) for a in chair):
            issues.append('Lounge shelf intersects reading chair: ' + obj.name)
    return issues


def courtyard_issues():
    """Keep the plan's dry crossing supported and its excavation edges exact."""
    issues=[]
    plan=json.loads((H/'source/data/scene.json').read_text())
    landscape=plan['landscape'];dry=landscape['dry_path_polygon']
    dry_bounds=(min(p[0] for p in dry),min(p[1] for p in dry),max(p[0] for p in dry),max(p[1] for p in dry))
    paths=[('Court','DRY_COURT',dry_bounds),('Terrace','WEST_TERRACE',landscape['west_terrace_bounds']),
           ('Lounge threshold','LOUNGE_SILL',landscape['lounge_threshold_bounds'])]
    def record(obj):
        return {'name':obj.name,'bounds':bounds(obj),'walk_surface':bool(obj.get('walk_surface'))}
    for label,name,perimeter in paths:
        bed=bpy.data.objects.get(name)
        tiles=[record(o) for o in bpy.context.scene.objects if o.name.startswith(label+' honed gneiss paving')]
        issues += [label+': '+issue for issue in paving_issues(tiles,perimeter,record(bed) if bed else None)]

    terrain=bpy.data.objects.get('Excavated woodland terrain')
    if not terrain:return issues+['Missing excavated woodland ground']
    pond=bpy.data.objects.get('Shallow pond bed')
    def surface_at(obj,x,y):
        if obj is None:return None
        inverse=obj.matrix_world.inverted()
        direction=(inverse.to_3x3() @ Vector((0,0,-1))).normalized()
        hit,point,_,_=obj.ray_cast(inverse @ Vector((x,y,30)),direction,distance=60)
        return obj.matrix_world @ point if hit else None
    plinths=[bounds(o) for o in bpy.context.scene.objects if o.name.startswith('Foundation plinth')]
    for wing in plan['wings']:
        x0,y0,x1,y1=wing['bounds_xy']
        foundation=next((p for p in plinths if all(abs(a-b)<.001 for a,b in zip((p[0],p[1],p[3],p[4]),(x0,y0,x1,y1)))),None)
        if not foundation:
            issues.append('Missing full-footprint foundation: '+wing['id']);continue
        if abs(foundation[5])>.001:
            issues.append('Foundation does not meet ground floor: '+wing['id'])
        for side,start,end,outward in [
            ('S',(x0,y0),(x1,y0),(0,-1)),('N',(x0,y1),(x1,y1),(0,1)),
            ('W',(x0,y0),(x0,y1),(-1,0)),('E',(x1,y0),(x1,y1),(1,0)),
        ]:
            count=math.ceil(math.dist(start,end)/.2)
            for i in range(count):
                t=(i+.5)/count;x=start[0]+(end[0]-start[0])*t;y=start[1]+(end[1]-start[1])*t
                outside=(x+outward[0]*.002,y+outward[1]*.002)
                inside=(x-outward[0]*.002,y-outward[1]*.002)
                # Paving intentionally occupies some foundation edges; its
                # continuous support was checked above. Soil must meet all
                # remaining edges to within 2 mm, regardless of garden slope.
                paved=any(a<=outside[0]<=c and b<=outside[1]<=d for _,_,(a,b,c,d) in paths)
                point=surface_at(terrain,*outside)
                # Both wings also touch the deliberate watercourt excavation.
                # Its actual bed must meet the foundation above the sole.
                if point is None:point=surface_at(pond,*outside)
                if not paved and point is None:
                    issues.append(f'Terrain leaves foundation notch: {wing["id"]}/{side}');break
                if not paved and point.z<foundation[2]-.001:
                    issues.append(f'Terrain falls below foundation sole: {wing["id"]}/{side}');break
                if surface_at(terrain,*inside) is not None:
                    issues.append(f'Terrain crosses excavation boundary: {wing["id"]}/{side}');break
    return issues


def validate():
    bpy.context.view_layer.update()
    issues = []
    ceilings = [o for o in bpy.context.scene.objects if '_CEILING' in o.name]
    slabs = [o for o in bpy.context.scene.objects if '_SLAB' in o.name]
    for ceiling in ceilings:
        a = bounds(ceiling)
        expected = 6.45 if '_L1_' in ceiling.name else 3.05
        if abs(a[2] - expected) > .001:
            issues.append('Finished ceiling height: ' + ceiling.name)
        for slab in slabs:
            b = bounds(slab)
            if all(min(a[i+3],b[i+3])-max(a[i],b[i])>.001 for i in [0,1]) and abs(b[2]-a[2])<.1:
                if b[2]-a[5] < .009:
                    issues.append('Concrete/finish overlap: ' + ceiling.name + ' / ' + slab.name)
    for wing in ['W', 'E']:
        for kind in ['PARAPET', 'COPING']:
            pieces=[o for o in bpy.context.scene.objects if o.name.startswith(f'{wing}_{kind}_')]
            for i,a in enumerate(pieces):
                for b in pieces[i+1:]:
                    if overlaps(bounds(a),bounds(b),.0001):
                        issues.append('Overlapping roof corner: ' + a.name + ' / ' + b.name)
        for level in ['L0','L1']:
            for kind in ['WALL','LINING']:
                prefix=f'{wing}_{level}_{kind}_'
                walls=[o for o in bpy.context.scene.objects if o.name.startswith(prefix)]
                for i,a in enumerate(walls):
                    for b in walls[i+1:]:
                        if overlaps(bounds(a),bounds(b),.0001):
                            issues.append('Overlapping shell faces: ' + a.name + ' / ' + b.name)
    issues += shell_and_joinery_issues()
    issues += courtyard_issues()
    issues += ['Plant/rock crosses envelope: ' + o.name for o in clearance['conflicts']()]
    assert not issues, '\n'.join(issues[:30]) + f'\n{len(issues)} total defects'
    print('SOURCE VALID: continuous manifold walls, closed story bands, clear apertures, fitted joinery, supported paving, exact terrain edges, ceiling/slab separation and plant bounds',flush=True)

if __name__ == '__main__': validate()
