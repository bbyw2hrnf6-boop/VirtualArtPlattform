"""Record final public-file hashes and progressive-playback atom ordering."""
from pathlib import Path
import struct, json, hashlib
ROOT=Path(__file__).resolve().parents[3]
report_path=Path(__file__).with_name('delivery-report.json')
report=json.loads(report_path.read_text())
for item in report:
 path=ROOT/item['path'];atoms=[]
 with path.open('rb') as stream:
  while stream.tell()<path.stat().st_size:
   offset=stream.tell();header=stream.read(8)
   if len(header)<8:break
   size,kind=struct.unpack('>I4s',header)
   if size==1:size=struct.unpack('>Q',stream.read(8))[0]
   if size==0:size=path.stat().st_size-offset
   atoms.append({'type':kind.decode('ascii'),'offset':offset,'bytes':size})
   stream.seek(offset+size)
 item['atoms']=atoms;item['sha256']=hashlib.sha256(path.read_bytes()).hexdigest()
 kinds=[atom['type'] for atom in atoms];item['fastStart']=kinds.index('moov')<kinds.index('mdat')
 print(path.name,item['durationSeconds'],'seconds',item['bytes'],'bytes','fast-start',item['fastStart'])
report_path.write_text(json.dumps(report,indent=2)+'\n')
