"""Small, physically lit construction details from the supplied concept views.
Executed in the build namespace so fixtures share the authored material library.
"""
collection='06_JOINERY';group='W0_furniture'
# The old luminous kitchen line floated in air. Give it an oak shelf and a
# recessed bronze extrusion, with the real light mounted under that shelf.
box('Kitchen floating display shelf',(-2.7,1.78,1.69),(2.65,.34,.06),oak,.005)
box('Kitchen task extrusion',(-2.7,1.625,1.651),(2.5,.018,.014),bronze,.002)
for obj in list(s.objects):
 if obj.name.startswith('Concealed joinery diffuser') and abs(obj.location.x+3.1)<.01:
  obj.location=(-2.7,1.62,1.643);obj.scale.x=2.45/1.3
 if obj.name.startswith('Joinery task light') and abs(obj.location.x+3.1)<.01:
  obj.location=(-2.7,1.61,1.635)
books(-3.8,1.8,1.72,.5);vessel(-1.75,1.78,1.72,.10,.17)
# Two shallow bronze shades, actual thickness, cords and luminous underside.
for x in [-3.48,-2.64]:
 collection='10_LIGHTS';group='lights'
 rod('Island pendant cable',(x,.15,2.2),(x,.15,3.043),.003,black)
 cylinder('Island ceiling rose',(x,.15,3.032),.032,.02,bronze)
 vs=[];fs=[];segments=48;rings=10
 for j in range(rings+1):
  theta=.10+(math.pi/2-.10)*j/rings
  for i in range(segments):
   angle=i*math.tau/segments;vs.append((x+.155*math.sin(theta)*math.cos(angle),.15+.155*math.sin(theta)*math.sin(angle),2.17+.12*math.cos(theta)))
 for j in range(rings):
  for i in range(segments):
   k=j*segments+i;kn=j*segments+(i+1)%segments;fs.append((k,kn,kn+segments,k+segments))
 shade=mesh('Spun bronze island shade',vs,fs,bronze)
 for p in shade.data.polygons:p.use_smooth=True
 shade.modifiers.new('Shade metal thickness','SOLIDIFY').thickness=.0015
 cylinder('Island opal diffuser',(x,.15,2.172),.142,.003,lamp,48)
 light('Island pendant light',(x,.15,2.16),(x,.15,.91),20,size=.25)
# Warm grazing light gives the lounge stone real relief. The housing hides the
# LED itself at eye height and is kept clear of every door/window aperture.
collection='06_JOINERY';group='E0'
box('Lounge cove oak lip',(5.5,3.56,2.998),(4.15,.065,.054),oak,.003)
box('Lounge cove bronze channel',(5.5,3.62,3.027),(4.1,.032,.018),bronze,.002)
for obj in list(s.objects):
 if obj.name.startswith('Concealed joinery diffuser') and abs(obj.location.x-5.5)<.01:
  obj.location=(5.5,3.63,3.027);obj.scale.x=4.05/1.3
 if obj.name.startswith('Joinery task light') and abs(obj.location.x-5.5)<.01:
  obj.location=(5.5,3.61,3.018);obj.data.energy=46;obj.data.shape='RECTANGLE';obj.data.size=4.0;obj.data.size_y=.025
  obj.rotation_euler=(Vector((5.5,3.69,1.9))-obj.location).to_track_quat('-Z','Y').to_euler()
# Curated tabletop details, all inside existing furniture footprints.
collection='07_FURNITURE';group='E0_furniture'
for i,material in enumerate([bookmats[2],paper,bookmats[4]]):
 ob=box('Lounge folio', (5.2,1.1,.427+i*.027),(.30,.23,.024),material,.002);ob.rotation_euler.z=-.17
vessel(5.72,1.13,.40,.08,.095)
group='W0_furniture'
for i,material in enumerate([bookmats[0],paper,bookmats[3]]):
 ob=box('Living design journal',(-5.59,-1.9,.405+i*.024),(.28,.21,.022),material,.002);ob.rotation_euler.z=.12
