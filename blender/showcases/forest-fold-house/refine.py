"""Authored camera clearance and practical circulation lighting, applied by build.py."""
import bpy
from mathutils import Vector

def apply():
 s=bpy.context.scene
 # The supplied lower LX03 sits in the U-stair void, where there is no ceiling.
 # The upper circulation diffuser already lights this flight and landing.
 for name in ['LX03','LX03_recess','LX03_lens']:
  o=bpy.data.objects.get(name)
  if o:bpy.data.objects.remove(o,do_unlink=True)
 for name,pos,target,lens in [('C01',(-3,-18,8),(0,.2,3.1),30),('C02',(8,-12,4.6),(0,.5,3),26),('C08',(-1.8,-1.4,5.1),(-6,-2.1,4.3),24),('C13',(-6.05,3.35,5.1),(-6.25,.3,2.7),22)]:
  c=bpy.data.objects[name];c.location=pos;c.rotation_euler=(Vector(target)-c.location).to_track_quat('-Z','Y').to_euler();c.data.lens=lens
 # Practical diffusers over the dark hall, stair and compact bathrooms.
 for i,(x,y,z) in enumerate([(-4.65,2.7,6.42),(-4.65,.55,6.42),(-3,2.4,6.42),(-3,2.8,3.02),(-6.1,1.4,6.42)]):
  name=f'Circulation downlight {i}'
  if name in bpy.data.objects:continue
  d=bpy.data.lights.new(name,'AREA');d.energy=65;d.color=(1,.78,.55);d.shape='DISK';d.size=.20
  o=bpy.data.objects.new(name,d);bpy.data.collections['10_LIGHTS'].objects.link(o);o.location=(x,y,z-.04);o['forest_group']='lights'
  bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=.105,depth=.009,location=(x,y,z))
  o=bpy.context.object;o.name=name+' diffuser';o.data.materials.append(bpy.data.materials['3000K diffuser']);o['forest_group']='lights'
  for c in list(o.users_collection):c.objects.unlink(o)
  bpy.data.collections['10_LIGHTS'].objects.link(o)

if __name__=='__main__':
 from pathlib import Path
 apply();bpy.context.preferences.filepaths.save_version=0
 bpy.ops.wm.save_as_mainfile(filepath=str(Path(__file__).resolve().parent/'forest-fold-house.blend'))
