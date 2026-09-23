"""Build the original 20-second homepage film from retained LIEUVA renders.
Dependencies: Python 3, Pillow and NumPy. No source image is overwritten.
Run from the repository root. Exactly 600 frames are written to a dedicated build.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np
import hashlib, json, math, wave
ROOT=Path(__file__).resolve().parents[3]
BUILD=ROOT/'artifacts/lieuva-homepage-film/20s';FRAMES=BUILD/'frames';OUT=ROOT/'public/assets/films'
FRAMES.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
W,H,FPS,DURATION=1920,1080,30,20
INK=(17,21,17);PAPER=(240,238,230);ACID=(217,255,67)
SOURCES={
 'whitecube':'blender/production/v3/white-cube-r5-3840.png',
 'forum':'blender/production/v3/pavilion-r5-3840.png',
 'obsidian1':'blender/showcases/obsidian/masters/R1-SW.png',
 'obsidianReverse':'blender/showcases/three-world-film/masters/obsidian-R1-NE.png',
 'atrium':'blender/showcases/sculpture-pavilion/masters/Cover.png',
 'glass':'blender/showcases/sculpture-pavilion/masters/B-SW.png',
 'kinetic':'blender/showcases/sculpture-pavilion/masters/C-SE.png',
 'house':'blender/showcases/forest-fold-house/masters/C01-afternoon.png',
 'bridge':'blender/showcases/forest-fold-house/masters/C12-afternoon.png',
 'dining':'blender/showcases/forest-fold-house/masters/C10-afternoon.png',
}
# start/end, source, zoom endpoints, centre endpoints, motion curve.
# This is a new edit with fewer views, not a time-compressed 42-second film.
SHOTS=[
 (0,1.9,'whitecube',1.015,1.075,.47,.50,.51,.51,'smooth'),
 (1.9,3.7,'forum',1.015,1.08,.50,.50,.50,.51,'smooth'),
 (3.7,5.4,'obsidian1',1.025,1.09,.47,.50,.51,.52,'smooth'),
 (5.4,7,'obsidianReverse',1.09,1.025,.52,.48,.51,.50,'smooth'),
 (7,9.1,'atrium',1.025,1.10,.50,.52,.51,.53,'smooth'),
 (9.1,10.5,'glass',1.025,1.075,.50,.51,.46,.48,'smooth'),
 (10.5,13,'kinetic',1.025,1.12,.49,.51,.52,.52,'smooth'),
 (13,15,'house',1.01,1.17,.50,.50,.49,.55,'accelerate'),
 (15,16.5,'bridge',1.02,1.19,.51,.51,.52,.52,'accelerate'),
 (16.5,18.8,'dining',1.08,1.17,.49,.52,.51,.53,'linear'),
]
TEASERS=[
 {'start':1.0,'end':3.2,'text':'Art, in a new light.','colour':'ink'},
 {'start':9.2,'end':11.4,'text':'Beyond the frame.','colour':'ink'},
 {'start':14.0,'end':16.2,'text':'Step inside.','colour':'paper'},
]
images={k:Image.open(ROOT/v).convert('RGB') for k,v in SOURCES.items()}
brandfont=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',160)
teaserfont=ImageFont.truetype('/System/Library/Fonts/Supplemental/Baskerville.ttc',80)
def smooth(x):
 x=max(0,min(1,x));return x*x*(3-2*x)
def shot_image(shot,t):
 a,b,key,z0,z1,x0,x1,y0,y1,curve=shot;u=max(0,min(1,(t-a)/(b-a)))
 if curve=='smooth':u=.6*u+.4*smooth(u)
 elif curve=='accelerate':u=.2*u+.8*u*u
 z=z0+(z1-z0)*u;cx=x0+(x1-x0)*u;cy=y0+(y1-y0)*u
 im=images[key];iw,ih=im.size;rh=min(ih,iw*H/W)/z;rw=rh*W/H
 x=max(0,min(iw-rw,cx*iw-rw/2));y=max(0,min(ih-rh,cy*ih-rh/2))
 return im.resize((W,H),Image.Resampling.LANCZOS,box=(x,y,x+rw,y+rh))
def tracked(draw,text,center,y,font,spacing,fill):
 widths=[draw.textlength(c,font=font) for c in text];x=center-(sum(widths)+spacing*(len(text)-1))/2
 for c,wd in zip(text,widths):draw.text((x,y),c,font=font,fill=fill,anchor='lt');x+=wd+spacing
# Static optical falloff. No generated content or added grain.
yy,xx=np.mgrid[0:H,0:W];radius=((xx-W*.50)/(W*.73))**2+((yy-H*.48)/(H*.82))**2
vignette=Image.fromarray(np.uint8(np.clip(radius*.14,0,.21)*255),'L')
proof_times=[1.5,2.7,4.5,6.2,8.6,9.7,11.8,14.5,15.7,17.5,19.5]
proof_indices={round(v*FPS) for v in proof_times}
for i in range(FPS*DURATION):
 t=i/FPS
 if t<18.8:
  shot=next(s for s in SHOTS if s[0]<=t<s[1]);im=shot_image(shot,t)
  im=Image.composite(Image.new('RGB',(W,H),(0,0,0)),im,vignette)
  if t<.4:
   aperture=smooth(t/.4);mask=Image.new('L',(W,H),0);d=ImageDraw.Draw(mask);ext=int(W*aperture);d.rectangle(((W-ext)//2,0,(W+ext)//2,H),fill=255)
   im=Image.composite(im,Image.new('RGB',(W,H),INK),mask)
  if t>18.25:im=Image.blend(im,Image.new('RGB',(W,H),INK),smooth((t-18.25)/.55))
 else:im=Image.new('RGB',(W,H),INK)
 # Export the clean White Cube poster before any film typography is applied.
 if i==30:im.save(OUT/'lieuva-three-worlds-poster.webp',quality=88,method=6)
 for teaser in TEASERS:
  if teaser['start']<=t<teaser['end']:
   alpha=smooth((t-teaser['start'])/.32)*smooth((teaser['end']-t)/.36)
   layer=Image.new('RGBA',(W,H));draw=ImageDraw.Draw(layer);colour=INK if teaser['colour']=='ink' else PAPER
   # Only the brighter white text receives a local soft shadow; no label box.
   shadow=Image.new('RGBA',(W,H));sd=ImageDraw.Draw(shadow)
   shadowcolour=(240,238,230,int(60*alpha)) if teaser['colour']=='ink' else (0,0,0,int(165*alpha))
   sd.text((120,829),teaser['text'],font=teaserfont,anchor='lt',fill=shadowcolour,stroke_width=2)
   shadow=shadow.filter(ImageFilter.GaussianBlur(9 if teaser['colour']=='paper' else 5))
   draw.text((120,824),teaser['text'],font=teaserfont,anchor='lt',fill=(*colour,int(255*alpha)))
   im=Image.alpha_composite(Image.alpha_composite(im.convert('RGBA'),shadow),layer).convert('RGB')
 if t>=18.6:
  overlay=Image.new('RGBA',(W,H));d=ImageDraw.Draw(overlay);a=smooth((t-18.6)/.45)
  tracked(d,'LIEUVA',W/2,428+int((1-a)*14),brandfont,23,(*PAPER,int(255*a)))
  line=smooth((t-19.0)/.3);d.line((W/2-65*line,646,W/2+65*line,646),fill=(*ACID,int(255*a)),width=3)
  im=Image.alpha_composite(im.convert('RGBA'),overlay).convert('RGB')
 im.save(FRAMES/f'{i:05d}.jpg',quality=91,subsampling=0)
 if i in proof_indices:im.save(BUILD/f'proof-{i:05d}.jpg',quality=94)
 if i%150==0:print('frame',i,flush=True)
# Original welcoming score in A major: soft struck tones, a gently breathing
# chord pad and quiet wooden ticks. No sub drone, booms, rolls or rising impacts.
sr=48000;n=sr*DURATION;ts=np.arange(n)/sr;stereo=np.zeros((n,2),dtype=np.float64)
def add(t,tone,pan=0):
 start=int(round(t*sr));l=min(len(tone),n-start)
 if l<=0:return
 angle=(pan+1)*np.pi/4
 stereo[start:start+l,0]+=tone[:l]*np.cos(angle)
 stereo[start:start+l,1]+=tone[:l]*np.sin(angle)
def pluck(t,freq,velocity=.13,pan=0,decay=.50):
 x=np.arange(int(2.1*sr))/sr;attack=1-np.exp(-x/.007)
 tone=attack*(np.sin(2*np.pi*freq*x)*np.exp(-x/decay)+.18*np.sin(2*np.pi*2*freq*x)*np.exp(-x/.24)+.095*np.sin(2*np.pi*4*freq*x)*np.exp(-x/.075))*velocity
 add(t,tone,pan)
 for delay,gain in [(.17,.12),(.31,.065),(.49,.03)]:add(t+delay,tone*gain,-pan*.7)
# Bright, close voicings; the lowest sustained note is A3 (220 Hz).
for a,b,freqs in [(0,7,[220,277.1826,329.6276]),(7,13,[293.6648,369.9944,440]),(13,18.5,[246.9417,329.6276,415.3047]),(18.5,20,[220,277.1826,329.6276,440])]:
 x=np.arange(round((b-a)*sr))/sr;env=np.minimum(x/.7,1)*np.clip((b-a-x)/.85,0,1)
 for channel,detune in [(0,-.19),(1,.19)]:
  pad=sum(np.sin(2*np.pi*(f+detune)*x+.015*np.sin(2*np.pi*.4*x)) for f in freqs)/len(freqs)
  start=round(a*sr);stereo[start:start+len(x),channel]+=pad*env*(.036+.004*np.sin(2*np.pi*.27*x))
notes=[
 (.15,440),(.78,554.365),(1.41,659.255),(2.04,554.365),(2.67,493.883),(3.30,440),
 (3.93,369.994),(4.56,440),(5.19,554.365),(5.82,493.883),(6.45,440),
 (7.08,587.330),(7.71,554.365),(8.34,440),(8.97,493.883),(9.60,587.330),
 (10.23,554.365),(10.86,440),(11.49,369.994),(12.12,440),
 (13.02,493.883),(13.65,659.255),(14.28,554.365),(14.91,493.883),(15.54,440),
 (16.17,554.365),(16.80,659.255),(17.43,554.365),(18.06,440),
]
for j,(t,freq) in enumerate(notes):pluck(t,freq,.108 if j%3 else .13,(-.18,.14,0)[j%3],.43)
# Very light, pitched wood taps mark an easy pulse without a drum impact.
for j,t in enumerate(np.arange(.47,18.2,.63)):
 x=np.arange(int(.12*sr))/sr;tone=np.sin(2*np.pi*980*x)*(1-np.exp(-x/.002))*np.exp(-x/.020)*.012
 add(t,tone,.22 if j%2 else -.22)
for j,f in enumerate([220,277.1826,329.6276,440]):pluck(18.65+j*.045,f,.085,(-.12,.10,-.04,.04)[j],.75)
# Smooth start and a complete gentle release to silence at exactly 20 seconds.
envelope=np.minimum(ts/.08,1)*np.clip((20-ts)/1.10,0,1)
stereo*=envelope[:,None];peak=float(np.max(np.abs(stereo)));stereo*=.56/max(peak,.001)
pcm=np.int16(np.clip(stereo,-1,1)*32767)
with wave.open(str(BUILD/'original-sound.wav'),'wb') as f:f.setnchannels(2);f.setsampwidth(2);f.setframerate(sr);f.writeframes(pcm.tobytes())
manifest={
 'title':'LIEUVA — Three worlds','durationSeconds':20,'frameCount':600,'fps':30,
 'chapters':[{'id':'art-spaces','start':0,'end':7,'rooms':[{'id':'white-cube','start':0,'end':1.9},{'id':'grand-forum','start':1.9,'end':3.7},{'id':'obsidian','start':3.7,'end':7}]},{'id':'sculpture-pavilion','start':7,'end':13},{'id':'forest-fold-house','start':13,'end':20}],
 'method':'New edit of animated crops from actual Cycles renders. Not a speed-up of the prior film, a real-time browser recording, or a continuous 3D camera path.',
 'audio':{'method':'Original deterministic synthesis only. Warm major-key struck tones, gentle chord pad and light wooden ticks; no voice, samples, external music or recordings.','harmony':'A major / D major / E major / A major','durationSeconds':20,'sampleRate':sr,'channels':2,'peakLinear':float(np.max(np.abs(stereo)))},
 'sources':[{'id':k,'path':v,'sha256':hashlib.sha256((ROOT/v).read_bytes()).hexdigest(),'size':list(images[k].size)} for k,v in SOURCES.items()],
 'shots':[{'start':s[0],'end':s[1],'source':s[2],'zoom':[s[3],s[4]],'centreX':[s[5],s[6]],'centreY':[s[7],s[8]],'motion':s[9]} for s in SHOTS],
 'teasers':TEASERS,'teaserPlacement':{'x':120,'y':824,'fontSize':80,'font':'Baskerville'},
 'endTitle':{'start':18.6,'text':'LIEUVA'},'poster':{'time':1.0,'source':'whitecube','text':False},
 'fonts':'System Arial and Baskerville rasterized into frames; no font files distributed.',
}
(Path(__file__).parent/'manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n')
print('600 frames and friendly original soundtrack ready',flush=True)
