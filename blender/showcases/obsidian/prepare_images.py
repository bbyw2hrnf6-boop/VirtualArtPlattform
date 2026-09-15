"""Encode web delivery copies. Requires Pillow; never changes source PNGs."""
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent
OUT = HERE.parents[2] / 'public/assets/showcases/obsidian'
for original in sorted((HERE / 'source/artworks').glob('*.png')):
    with Image.open(original) as image:
        image.convert('RGB').save(OUT / 'artworks' / (original.stem + '.webp'), quality=94, method=6)
with Image.open(HERE / 'masters/R1-SW.png') as image:
    image = image.convert('RGB')
    image.thumbnail((1920, 1280), Image.Resampling.LANCZOS)
    image.save(OUT / 'cover.webp', quality=92, method=6)
