import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { VisitorControls } from '../gallery/VisitorControls';
import type { ObsidianControls, ObsidianMode } from './ObsidianScene';
import { forestRooms } from './forestRooms';
import './obsidian.css';
const Scene=lazy(()=>import('./ForestScene'));
const asset='/assets/showcases/forest-fold-house/';
export default function ForestPage(){
  useEffect(()=>{window.scrollTo({top:0,behavior:'instant'});},[]);
  const [status,setStatus]=useState<'idle'|'loading'|'ready'|'error'>('idle');
  const [active,setActive]=useState(false),[room,setRoom]=useState(0),[mode,setMode]=useState<ObsidianMode>('walk');
  const controls=useRef<ObsidianControls|null>(null);
  const ready=useCallback(()=>setStatus('ready'),[]),failed=useCallback(()=>{setActive(false);setStatus('error');},[]),artwork=useCallback(()=>{},[]);
  useEffect(()=>{const title=document.title;document.title='Forest Fold House — LIEUVA';return()=>{document.title=title;};},[]);
  const saver=Boolean((navigator as Navigator & {connection?:{saveData?:boolean}}).connection?.saveData);
  return <main className="obsidian forest-house">
    <header className="obsidian__header"><a href="#/">LIEUVA <span>/ ARCHITECTURE</span></a><a href="#/">← Back to LIEUVA</a></header>
    <section className="obsidian__stage" aria-label="Forest Fold House preview">
      {status!=='ready'&&<img className="obsidian__poster" src={`${asset}cover.webp?v=3`} alt="Two stone and oak wings joined by a glass bridge, overlooking a shallow woodland watercourt." fetchPriority="high"/>}
      {active&&<Suspense fallback={null}><Scene controlsRef={controls} onReady={ready} onError={failed} onRoom={setRoom} onArtwork={artwork} onMode={setMode}/></Suspense>}
      {status!=='ready'&&<div className="obsidian__entrance">
        <p className="obsidian__eyebrow">A LIEUVA architecture showcase</p><h1>Forest Fold<br/>House.</h1>
        <p>Two wings. One glass bridge.<br/>A small home, folded into the woodland.</p>
        <button className="obsidian__enter" disabled={status==='loading'} onClick={()=>{setStatus('loading');setActive(true);}}>{status==='loading'?'Preparing your visit…':status==='error'?'Try the house again ↗':'Enter the house ↗'}</button>
        <p className="obsidian__status" role="status">{status==='error'?'The 3D view could not load. Explore the house in the photographs below.':saver?'Data Saver is on. Browse the photographs below, or choose to load the house.':'Explore freely on desktop or mobile.'}</p>
        <a href="#forest-rooms" onClick={e=>{e.preventDefault();document.getElementById('forest-rooms')?.scrollIntoView();}}>Discover the house ↓</a>
      </div>}
      {status==='ready'&&<>
        <div className="obsidian__room-label"><span>FOREST FOLD HOUSE</span><h1>{forestRooms[room].name}</h1></div>
        <label className="obsidian__room-picker">Room<select aria-label="House room" value={room} onChange={e=>controls.current?.room(Number(e.target.value))}>{forestRooms.map((r,i)=><option key={r.id} value={i}>{r.name}</option>)}</select></label>
        <VisitorControls<ObsidianMode> mode={mode} modeOptions={[{value:'walk',label:'Walk',icon:'↟'},{value:'overview',label:'Overview',icon:'◇'}]} onModeChange={m=>controls.current?.mode(m)} onResetView={()=>controls.current?.reset()} showHelp={false}/>
        <div className="arrange-zoom obsidian__zoom" role="group" aria-label="Camera zoom"><button aria-label="Zoom out" onClick={()=>controls.current?.zoom(-1)}>−</button><button aria-label="Zoom in" onClick={()=>controls.current?.zoom(1)}>+</button></div>
      </>}
    </section>
    <section id="forest-rooms" className="obsidian__collection" aria-labelledby="forest-heading">
      <div className="obsidian__collection-intro"><p className="obsidian__eyebrow">173.4 m² / Two levels / One bridge</p><h2 id="forest-heading">At home in<br/>the forest.</h2><p>Oak, linen and quiet stone. A planted roof above, a sheltered watercourt below. Follow the stairs from the upper entrance to the living rooms, then cross the courtyard to the water lounge.</p></div>
      <div className="forest-house__photos">{forestRooms.map(r=><figure key={r.id}><a href={`${asset}${r.image}.webp?v=3`} target="_blank" rel="noreferrer"><img src={`${asset}${r.image}.webp?v=3`} alt={`${r.name} — rendered from the Forest Fold House model`} loading="lazy" width="1920" height="1080"/></a><figcaption>{r.name}</figcaption></figure>)}</div>
      <footer><p>An individually authored architectural concept, modelled in Blender.<br/>Separate from the room templates available in Studio. Concept dimensions, not construction documents.</p><a href="#/">Back to LIEUVA ↗</a></footer>
    </section>
  </main>;
}
