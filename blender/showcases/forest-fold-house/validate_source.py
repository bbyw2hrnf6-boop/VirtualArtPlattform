"""Fail before expensive rendering when a shell/plant regression reappears."""
import bpy, runpy
from pathlib import Path

H = Path(__file__).resolve().parent
clearance = runpy.run_path(str(H / 'clearance.py'))
bounds, overlaps = clearance['bounds'], clearance['overlaps']


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
    issues += ['Plant/rock crosses envelope: ' + o.name for o in clearance['conflicts']()]
    assert not issues, '\n'.join(issues[:30]) + f'\n{len(issues)} total defects'
    print('SOURCE VALID: finished ceiling heights, separated structural slabs, wall corners and complete plant bounds',flush=True)

if __name__ == '__main__': validate()
