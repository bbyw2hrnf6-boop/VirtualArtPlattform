"""Exact ground boundaries and a planted, dry watercourt from the metric plan.

The path remains at +0.00 m. Small gaps between individual paving stones are
visual joints over a continuous bed, never holes in the walking envelope.
"""
import bpy, math, random
from mathutils import Vector


def apply(plan, terrain_z, occupied, box, mesh, rect):
    rng = random.Random(230926)
    terrain = bpy.data.collections['01_TERRAIN']
    planting = bpy.data.collections['08_PLANTING']
    stone = next(m for m in bpy.data.materials if m.name.startswith('M01'))
    paving = stone.copy(); paving.name = 'Honed courtyard gneiss'
    soil = bpy.data.materials['Forest soil and humus']
    moss = bpy.data.materials['Moss cushions']

    def place_in(obj, collection, group):
        for old in list(obj.users_collection): old.objects.unlink(obj)
        collection.objects.link(obj)
        obj['forest_group'] = group
        return obj

    # Align the terrain grid to EVERY excavation edge. Testing the centre of
    # a coarse cell alone formerly left half-metre notches at walls and paths.
    xs = {-22 + i * .5 for i in range(89)}
    ys = {-22 + i * .5 for i in range(81)}
    boundaries = [w['bounds_xy'] for w in plan['wings']]
    boundaries += [[-1.3, .1, 3.2, 1.5], plan['landscape']['west_terrace_bounds'],
                   plan['landscape']['lounge_threshold_bounds']]
    for a, b, c, d in boundaries:
        xs.update([a, c]); ys.update([b, d])
    for x, y in plan['landscape']['pond_polygon']:
        xs.add(x); ys.add(y)
    xs, ys = sorted(xs), sorted(ys)
    vertices, faces, indices = [], [], {}
    for a, c in zip(xs, xs[1:]):
        for b, d in zip(ys, ys[1:]):
            if occupied((a+c)/2, (b+d)/2): continue
            face = []
            for x, y in [(a,b), (c,b), (c,d), (a,d)]:
                if (x,y) not in indices:
                    indices[x,y] = len(vertices)
                    vertices.append((x,y,terrain_z(x,y)))
                face.append(indices[x,y])
            faces.append(tuple(face))
    old = bpy.data.objects['Excavated woodland terrain']
    data = bpy.data.meshes.new('Exact excavated woodland ground')
    data.from_pydata(vertices, [], faces); data.update()
    old.data = data; data.materials.append(soil)
    for face in data.polygons: face.use_smooth = True

    # A continuous recessed foundation hides the underside of the dry route.
    for name in ['DRY_COURT', 'WEST_TERRACE', 'LOUNGE_SILL']:
        base = bpy.data.objects[name]
        base.location.z -= .045
        base['walk_surface'] = False
    paths = [('Court', [-1.3,.1,3.2,1.5], .75,.70),
             ('Terrace', plan['landscape']['west_terrace_bounds'], 1.25,.70),
             ('Lounge threshold', plan['landscape']['lounge_threshold_bounds'], 1.0,.90)]
    for name,(a,b,c,d),dx,dy in paths:
        nx,ny=math.ceil((c-a)/dx),math.ceil((d-b)/dy)
        for ix in range(nx):
            for iy in range(ny):
                gap=.002
                bounds=[a+ix*(c-a)/nx+gap/2,b+iy*(d-b)/ny+gap/2,
                        a+(ix+1)*(c-a)/nx-gap/2,b+(iy+1)*(d-b)/ny-gap/2]
                obj=rect(name+' honed gneiss paving',bounds,0,.06,paving,True)
                place_in(obj,terrain,'courtyard')
    # Soil beds abut exact paving edges and foundations, instead of meeting a
    # flat tiled plane with an exposed black or saw-toothed seam.
    for name,bounds in [('North court planting bed',[-.9,1.5,2.9,2.6]),
                        ('South court planting bed',[.4,-.45,2.9,.1])]:
        obj=rect(name,bounds,-.095,.36,soil)
        place_in(obj,terrain,'landscape')

    # Reuse the existing CC0 scanned meshes. Clusters near the path use smaller
    # plants and a gradual edge; the full-bounds clearance pass remains final.
    prototypes={}
    for obj in planting.objects:
        if obj.name.startswith('Scanned woodland'):
            slug='fern_02' if 'fern_02' in obj.name else 'periwinkle_plant' if 'periwinkle_plant' in obj.name else None
            if slug and slug not in prototypes: prototypes[slug]=obj
    clusters=[(-.25,2.4,.45),(1.15,2.6,.65),(2.2,2.55,.38),
              (.95,-.65,.35),(2.35,-.5,.30),(-2.3,-5.85,.75),
              (-6.7,-6.0,.65),(5.0,-2.95,.5),(8.65,.8,.7)]
    for cx,cy,radius in clusters:
        for i in range(25):
            angle=rng.random()*math.tau;r=radius*math.sqrt(rng.random())
            x,y=cx+math.cos(angle)*r,cy+math.sin(angle)*r
            if occupied(x,y): continue
            slug='fern_02' if i%4==0 else 'periwinkle_plant'
            proto=prototypes[slug];obj=proto.copy();obj.data=proto.data
            planting.objects.link(obj);obj.name='Courtyard grouped '+slug
            obj.location=(x,y,max(terrain_z(x,y),-.095) if -.9<x<2.9 and -.45<y<2.6 else terrain_z(x,y))
            obj.rotation_euler.z=rng.random()*math.tau
            # Existing prototypes are enlarged woodland plants. Scale a copy
            # down for a credible low edge along the human-scale stone path.
            obj.scale=tuple(v*rng.uniform(.32,.48) for v in proto.scale)

    # Low, partly buried stones define the bank at three scales. Shared mesh
    # data permits GPU instancing; no new texture set or downloaded asset.
    prototype=None
    for i in range(65):
        x=rng.uniform(-.7,2.65); y=rng.choice([rng.uniform(1.72,2.65),rng.uniform(-.65,-.08)])
        if occupied(x,y):continue
        z=terrain_z(x,y)
        if -.9<x<2.9 and -.45<y<2.6:z=max(z,-.095)
        if prototype is None:
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1)
            obj=bpy.context.object;obj.name='Court bank stone'
            for v in obj.data.vertices:v.co*=rng.uniform(.88,1.10)
            obj.data.materials.append(stone);obj.data.materials.append(moss)
            for p in obj.data.polygons:p.use_smooth=True;p.material_index=1 if p.normal.z>.65 else 0
            prototype=obj
        else:
            obj=prototype.copy();obj.data=prototype.data;terrain.objects.link(obj)
        place_in(obj,terrain,'landscape')
        obj.name='Gneiss woodland boulder court'
        scale=rng.uniform(.055,.17);obj.scale=(scale*1.35,scale,scale*.58)
        obj.location=(x,y,z+scale*.10);obj.rotation_euler.z=rng.random()*math.tau

    # Layer the valley behind the crossing with partially buried rock, so the
    # planted ravine has volume rather than reading as a flat ground texture.
    for x,y,scale in [(-.35,2.7,.42),(.4,3.2,.65),(1.3,3.7,.78),(2.2,3.0,.52),
                       (.2,4.5,.68),(2.0,4.6,.85),(-.1,5.6,.76),(1.3,5.6,.58)]:
        obj=prototype.copy();obj.data=prototype.data;terrain.objects.link(obj)
        obj.name='Gneiss woodland boulder ravine';obj.location=(x,y,terrain_z(x,y)+scale*.15)
        obj.scale=(scale,scale*.72,scale*.85);obj.rotation_euler.z=rng.random()*math.tau

    # Mid-height canopy screens the bare distant berm visible from the lounge.
    # Copies share scanned geometry and textures and are spatially culled in
    # delivery; the near-house openings and authored walk routes stay clear.
    tree=next(o for o in planting.objects if o.name.startswith('Scanned woodland tree_small_02'))
    for i in range(124):
        angle=i*2.399;radius=17+(i%5)*5+rng.uniform(-1.8,1.8)
        x,y=math.cos(angle)*radius,math.sin(angle)*radius
        obj=tree.copy();obj.data=tree.data;planting.objects.link(obj)
        obj.name='Scanned woodland mid-canopy';obj.location=(x,y,terrain_z(x,y))
        obj.rotation_euler.z=rng.random()*math.tau
        factor=rng.uniform(.85,1.35);obj.scale=tuple(v*factor for v in tree.scale)
    groundcover=prototypes['periwinkle_plant']
    for i in range(2400):
        angle=rng.random()*math.tau;radius=rng.uniform(15,48)
        x,y=math.cos(angle)*radius,math.sin(angle)*radius
        obj=groundcover.copy();obj.data=groundcover.data;planting.objects.link(obj)
        obj.name='Scanned woodland ridge groundcover';obj.location=(x,y,terrain_z(x,y))
        obj.rotation_euler.z=rng.random()*math.tau
        factor=rng.uniform(1.2,2.1);obj.scale=tuple(v*factor for v in groundcover.scale)

    # Keep a fixed diagnostic camera on the exact reported lower crossing.
    camera=bpy.data.objects['C02'].copy();camera.data=camera.data.copy();camera.name='C90'
    bpy.data.collections['11_CAMERAS'].objects.link(camera)
    camera.location=(2.6,.73,1.65)
    target=Vector((-1.5,.7,1.15))
    camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.lens=24
