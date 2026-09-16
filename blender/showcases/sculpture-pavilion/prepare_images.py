"""Encode actual Cycles renders for the preview and non-WebGL sculpture directory."""
from pathlib import Path
from PIL import Image
import argparse
p=argparse.ArgumentParser();p.add_argument('--preserve-glass',action='store_true');args=p.parse_args()
H=Path(__file__).resolve().parent;out=H.parents[2]/'public/assets/showcases/sculpture-pavilion'
(out/'objects').mkdir(exist_ok=True)
im=Image.open(H/'masters/Cover.png').convert('RGB');im.resize((1920,1080),Image.Resampling.LANCZOS).save(out/'cover.webp',quality=92,method=6)
for i in range(1,6):
 if i==4 and args.preserve_glass:continue
 name=f'S{i:02d}';im=Image.open(H/f'masters/objects/{name}-Portrait.png').convert('RGB');im.save(out/f'objects/{name}.webp',quality=94,method=6)
