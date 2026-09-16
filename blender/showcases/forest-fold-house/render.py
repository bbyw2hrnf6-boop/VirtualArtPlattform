"""Real Cycles proofs/masters from the single source. Never upscale concept images."""
import bpy, argparse, sys, time, json, math
from pathlib import Path
H=Path(__file__).resolve().parent
p=argparse.ArgumentParser();p.add_argument('--cameras',default='C01,C07,C12');p.add_argument('--width',type=int,default=1920);p.add_argument('--samples',type=int,default=96);p.add_argument('--out',default='artifacts/forest/proof');p.add_argument('--lighting',choices=['afternoon','overcast','evening'],default='afternoon')
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);s=bpy.context.scene
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='METAL';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='METAL'
s.cycles.device='GPU';s.cycles.samples=a.samples
# Bound Cycles' live path-state memory on the 16 GB authoring Mac. This changes
# scheduling only: each tile retains the native resolution and sample target.
s.cycles.use_auto_tile=True;s.cycles.tile_size=512
s.render.resolution_x=a.width;s.render.resolution_y=round(a.width*9/16);s.render.resolution_percentage=100
sun=bpy.data.objects['Southwest afternoon sun'];bg=s.world.node_tree.nodes['Background']
if a.lighting=='overcast':sun.data.energy=.15;bg.inputs['Strength'].default_value=.4
if a.lighting=='evening':
 sun.data.energy=0
 s.world.node_tree.links.remove(bg.inputs['Color'].links[0]);bg.inputs['Color'].default_value=(.08,.16,.35,1);bg.inputs['Strength'].default_value=.22
 for o in s.objects:
  if o.type=='LIGHT' and o.data.type!='SUN':o.data.energy*=2.5
 s.view_settings.exposure=1.3
out=H.parents[2]/a.out;out.mkdir(parents=True,exist_ok=True);report=[]
for name in a.cameras.split(','):
 s.camera=bpy.data.objects[name];s.render.filepath=str(out/f'{name}-{a.lighting}.png');start=time.monotonic();bpy.ops.render.render(write_still=True)
 record={'camera':name,'lighting':a.lighting,'width':a.width,'height':s.render.resolution_y,'samples':a.samples,'seconds':round(time.monotonic()-start,2)}
 report.append(record);(out/f'{name}-{a.lighting}.json').write_text(json.dumps(record,indent=2)+'\n')
(out/f'render-{a.lighting}.json').write_text(json.dumps([json.loads(path.read_text()) for path in sorted(out.glob(f'C*-{a.lighting}.json'))],indent=2)+'\n')
