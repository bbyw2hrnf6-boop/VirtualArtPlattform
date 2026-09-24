"""Promote only verified v6 outputs; retain old deployment inputs in artifacts.

This is local asset assembly, not a production deployment. The night bakes are
rebound only after the Node verifier proves every original mesh/UV byte matches.
"""
from pathlib import Path
import hashlib, json, shutil
from night_contract import day_geometry_digest

H = Path(__file__).resolve().parent
ROOT = H.parents[2]
OUT = ROOT/'public/assets/showcases/forest-fold-house'
STAGE = ROOT/'artifacts/forest/delivery-v6'
BACKUP = ROOT/'artifacts/forest/delivery-v5-baseline'
def sha(path):
    with path.open('rb') as f: return hashlib.file_digest(f, 'sha256').hexdigest()
report = json.loads((STAGE/'verification.json').read_text())
assert report['sourceSha256'] == sha(H/'forest-fold-house.blend')
night = json.loads((H/'night-bake-report.json').read_text())
assert night['dayGeometrySha256'] == day_geometry_digest(OUT), 'Changed base delivery'
for tier, entry in report['tiers'].items():
    original = OUT/('desktop-v5/forest-fold-house-desktop.gltf' if tier == 'desktop' else 'forest-fold-house-mobile.glb')
    assert sha(original) == entry['originalModelSha256']
    assert sha(STAGE/tier/'garden.json') == entry['gardenSha256']
    for name, expected in entry['files'].items():
        assert sha(STAGE/tier/name) == expected
        assert (STAGE/tier/name).stat().st_size < 100*1024**2
assert not BACKUP.exists() and not (OUT/'desktop-v6').exists(), 'Already promoted; do not overwrite a backup'
BACKUP.mkdir()
shutil.copytree(OUT/'desktop-v5', BACKUP/'desktop-v5')
shutil.copy2(OUT/'forest-fold-house-mobile.glb', BACKUP/'forest-fold-house-mobile.glb')
(OUT/'desktop-v6').mkdir()
for name in report['tiers']['desktop']['files']:
    shutil.copy2(STAGE/'desktop'/name, OUT/'desktop-v6'/name)
shutil.copy2(STAGE/'mobile/forest-fold-house-mobile.glb', OUT/'forest-fold-house-mobile.glb')
# Move the superseded deployment directory out of public, preserving recovery.
shutil.move(OUT/'desktop-v5', BACKUP/'original-directory')
report['previousNightGeometrySha256'] = night['dayGeometrySha256']
report['dayGeometrySha256'] = day_geometry_digest(OUT)
report['dayEncoding'] = 'RGBM sRGB WebP quality 100; lossless alpha'
report['sourceMastersIncludeDressing'] = False
shutil.copy2(STAGE/'desktop/garden.json', H/'garden-dressing.json')
(H/'delivery-refinement-report.json').write_text(json.dumps(report, indent=2)+'\n')
night['deliveryRebind'] = {'previousDayGeometrySha256': night['dayGeometrySha256'],
    'refinementReportSha256': sha(H/'delivery-refinement-report.json')}
night['dayGeometrySha256'] = report['dayGeometrySha256']
(H/'night-bake-report.json').write_text(json.dumps(night, indent=2)+'\n')
print('Local v6 assets promoted; v5 retained at', BACKUP)
