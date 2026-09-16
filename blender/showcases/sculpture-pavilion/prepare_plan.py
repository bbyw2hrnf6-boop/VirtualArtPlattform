"""Prepare the metric envelope and navigation from the supplied plan. Requires Shapely."""
import json, math
from pathlib import Path
from shapely.geometry import Point, box, Polygon
from shapely.affinity import scale
from shapely.ops import unary_union, triangulate
H=Path(__file__).resolve().parent
layout=json.loads((H/'source/planning/layout.json').read_text())
rooms={}
for r in layout['rooms']:
 x,y=r['center'];w,h=r['size']
 rooms[r['id']]=scale(Point(x,y).buffer(1,quad_segs=80),w/2,h/2) if r['shape']=='ellipse' else box(x-w/2+3,y-h/2+3,x+w/2-3,y+h/2-3).buffer(3,quad_segs=32)
connectors={c['id']:box(*c['bounds']) for c in layout['connectors']}
union=unary_union([*rooms.values(),*connectors.values()])
roof=layout['rooflights'];holes={'A':scale(Point(0,0).buffer(1,quad_segs=64),3,2),'B':box(*roof['B']['bounds']),'C':unary_union([box(x-.3,12,x+.3,18) for x in roof['C']['x_centers']])}
def faces(poly):
 out=[]
 for t in triangulate(poly):
  if poly.covers(t.representative_point()):
   clipped=t.intersection(poly)
   if clipped.geom_type=='Polygon' and clipped.area>1e-8:out.append(list(clipped.exterior.coords)[:-1])
 return out
result={'rooms':{},'connectors':{},'boundary':list(union.exterior.coords)}
for id,p in rooms.items():
 result['rooms'][id]={'boundary':list(p.exterior.coords),'floor':faces(p),'ceiling':faces(p.difference(holes[id])),'glass':faces(holes[id])}
for id,p in connectors.items():
 q=p.difference(unary_union(list(rooms.values())))
 # The room wall already contains the 300 mm portal return. Starting passage
 # boards at the inner room boundary duplicated that return and self-shadowed.
 shell=p.difference(unary_union([r.buffer(.3,join_style=2) for r in rooms.values()]))
 result['connectors'][id]={'floor':faces(q),'parts':[list(g.exterior.coords) for g in ([q] if q.geom_type=='Polygon' else q.geoms)],'shell_ceiling':faces(shell),'shell_parts':[list(g.exterior.coords) for g in ([shell] if shell.geom_type=='Polygon' else shell.geoms)]}
(H/'plan-mesh.json').write_text(json.dumps(result,separators=(',',':'))+'\n')
print('Prepared area',round(union.area),'m²')
