"""Encode real Cycles masters for delivery. Never generates or upscales imagery."""
from pathlib import Path
from PIL import Image
import argparse,json,hashlib
H=Path(__file__).resolve().parent;OUT=H.parents[2]/'public/assets/showcases/forest-fold-house'
p=argparse.ArgumentParser();p.add_argument('--cover',default='C01');a=p.parse_args();OUT.mkdir(parents=True,exist_ok=True)
report=[]
for name in sorted(set(['C07','C08','C09','C10','C11','C12','C13',a.cover])):
 source=H/'masters'/f'{name}-afternoon.png'
 assert source.is_file(), f'Missing required room photograph: {source}'
 im=Image.open(source).convert('RGB')
 # A blocked/incomplete camera is not a deliverable photograph.
 assert max(im.resize((1,1)).getpixel((0,0)))>=10, f'Black/incomplete render: {source}'
 assert im.size==(3840,2160),(source,im.size)
 im=im.resize((1920,1080),Image.Resampling.LANCZOS)
 name=source.name.split('-')[0];dest=OUT/('cover.webp' if name==a.cover else name+'.webp');im.save(dest,'WEBP',quality=92,method=6)
 report.append({'source':source.name,'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'output':dest.name,'bytes':dest.stat().st_size,'width':1920,'height':1080})
(H/'image-report.json').write_text(json.dumps(report,indent=2)+'\n')
