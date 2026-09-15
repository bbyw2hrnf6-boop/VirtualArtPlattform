"""Render named cameras from the unchanged packed scene (proofs or native 4K masters)."""
import bpy,sys,argparse,json,time
from pathlib import Path
H=Path(__file__).resolve().parent;p=argparse.ArgumentParser();p.add_argument('--cameras',default='Cover,B-SW,C-SW');p.add_argument('--width',type=int,default=1600);p.add_argument('--samples',type=int,default=128);p.add_argument('--out',default='artifacts/sculpture');a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);s=bpy.context.scene
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='METAL';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='METAL'
s.cycles.device='GPU';s.cycles.samples=a.samples;s.render.resolution_x=a.width;s.render.resolution_y=round(a.width*9/16);s.render.resolution_percentage=100
out=H.parents[2]/a.out;out.mkdir(parents=True,exist_ok=True);names=[c.name for c in s.objects if c.type=='CAMERA'] if a.cameras=='all' else a.cameras.split(',');report=[]
for name in names:
 s.render.resolution_y=round(a.width*1.35) if 'Portrait' in name and 'S05' not in name else round(a.width*9/16);s.camera=bpy.data.objects[name];s.render.filepath=str(out/(name+'.png'));start=time.monotonic();bpy.ops.render.render(write_still=True);report.append({'camera':name,'width':a.width,'height':s.render.resolution_y,'samples':a.samples,'seconds':round(time.monotonic()-start,2)})
report_path=out/'render-report.json'
previous=json.loads(report_path.read_text()) if report_path.exists() else []
report=[r for r in previous if r['camera'] not in names]+report
report_path.write_text(json.dumps(report,indent=2)+'\n')
