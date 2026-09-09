"""Pack the three v3 material inputs into an editable Blender study library.
No render or runtime export; room geometry and lights stay in their own sources.
"""
from pathlib import Path
import bpy
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).resolve().parent/'v3'
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.unit_settings.system='METRIC'
for index,(name,tile,roughness) in enumerate([
 ('honed-concrete',3,.52),('honed-limestone',3,.44),('natural-oak',2.4,.46),
]):
 material=bpy.data.materials.new(name);material.use_nodes=True;material.use_fake_user=True
 material['tile_metres']=tile
 material['lieuva_source']='public/assets/materials/premium-v3/'+name+'.webp'
 material['lieuva_map_role']='Generated albedo only; procedural microstructure is independent.'
 nodes=material.node_tree.nodes;links=material.node_tree.links
 shader=nodes.get('Principled BSDF');shader.inputs['Roughness'].default_value=roughness
 texture=nodes.new('ShaderNodeTexImage');texture.location=(-600,150)
 texture.image=bpy.data.images.load(str(ROOT/'public/assets/materials/premium-v3'/(name+'.webp')))
 texture.image.colorspace_settings.name='sRGB';texture.image.pack()
 links.new(texture.outputs['Color'],shader.inputs['Base Color'])
 noise=nodes.new('ShaderNodeTexNoise');noise.location=(-600,-160)
 noise.inputs['Scale'].default_value=180;noise.inputs['Detail'].default_value=2
 bump=nodes.new('ShaderNodeBump');bump.location=(-270,-130)
 bump.inputs['Distance'].default_value=.0015;bump.inputs['Strength'].default_value=.18
 links.new(noise.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],shader.inputs['Normal'])
 bpy.ops.mesh.primitive_plane_add(size=tile,location=(index*3.5,0,0))
 plane=bpy.context.object;plane.name=name+' · one metric repeat';plane.data.materials.append(material)
scene['lieuva_note']='Three editable material studies; not an illumination bake or a marketed 4K texture set.'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'material-library.blend'),compress=True)
