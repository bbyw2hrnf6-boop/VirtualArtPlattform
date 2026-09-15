import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { ObsidianControls, ObsidianMode } from './ObsidianScene';
import data from './obsidian.json';
import { VisitorWalkControls } from '../gallery/VisitorWalkControls';
import { VISITOR_KEYBOARD_HINT } from '../gallery/visitorKeyboard';
import '../../styles/visitorControls.css';
import './obsidian.css';

const Scene = lazy(() => import('./ObsidianScene'));

export default function ObsidianPage() {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const controls = useRef<ObsidianControls | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState('idle');
  const [room, setRoom] = useState(0);
  const [mode, setMode] = useState<ObsidianMode>('walk');
  const [help, setHelp] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const ready = useCallback(() => { setRoom(0); setMode('walk'); setStatus('ready'); }, []);
  const failed = useCallback(() => { setStatus('error'); setActive(false); }, []);
  const artwork = useCallback((id: string) => setSelected(id), []);
  const current = data.artworks.find(a => a.id === selected);
  useEffect(() => {
    controls.current?.pause(Boolean(selected));
    if (selected) dialog.current?.showModal(); else dialog.current?.close();
  }, [selected]);
  const saver = typeof navigator !== 'undefined' && (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  return <main className="obsidian">
    <header className="obsidian__header">
      <a href="#/" aria-label="LIEUVA home">LIEUVA <span>/ SHOWCASE</span></a>
      <a href="#/">← Back to LIEUVA</a>
    </header>
    <section className="obsidian__stage" aria-label="Obsidian exhibition preview">
      {status !== 'ready' && <img className="obsidian__poster" src="/assets/showcases/obsidian/cover.webp" alt="Obsidian: warm pools of light, botanical art, walnut portals and honed black limestone." fetchPriority="high" />}
      {active && <Suspense fallback={null}><Scene controlsRef={controls} onReady={ready} onError={failed} onRoom={setRoom} onArtwork={artwork} onMode={setMode} /></Suspense>}
      {status !== 'ready' && <div className="obsidian__entrance">
        <p className="obsidian__eyebrow">A LIEUVA bespoke exhibition</p>
        <h1>Obsidian.</h1>
        <p>Three rooms. Eleven visions of nature.<br />An exhibition in light, stone and living matter.</p>
        <button className="obsidian__enter" disabled={status === 'loading'} onClick={() => { setStatus('loading'); setActive(true); }}>{status === 'loading' ? 'Preparing your visit…' : status === 'error' ? 'Try the exhibition again ↗' : 'Enter the exhibition ↗'}</button>
        <p className="obsidian__status" role="status">{status === 'error' ? 'The 3D view could not load. You can still explore every artwork below.' : saver ? 'Data Saver is on. Browse the artworks below, or choose to load the 3D exhibition.' : 'Explore freely on desktop or mobile.'}</p>
        <a href="#obsidian-collection" onClick={e => { e.preventDefault(); document.getElementById("obsidian-collection")?.scrollIntoView(); }}>View the collection ↓</a>
      </div>}
      {status === 'ready' && <>
        <div className="obsidian__room-label"><span>{String(room+1).padStart(2,'0')} / OBSIDIAN</span><h1>{data.rooms[room].name}</h1></div>
        <div className="obsidian__visit-controls">
          <nav aria-label="Exhibition rooms">{data.rooms.map((r, i) => <button key={r.id} aria-current={room === i ? 'true' : undefined} onClick={() => { controls.current?.room(i); }}>{String(i+1).padStart(2,'0')}<span>{r.name}</span></button>)}</nav>
          <div className="obsidian__view-controls" role="group" aria-label="View mode">
            {(['walk', 'overview'] as const).map(value => <button key={value} aria-pressed={mode === value} onClick={() => controls.current?.mode(value)}>{value === 'walk' ? 'Walk' : 'Overview'}</button>)}
            <button onClick={() => controls.current?.reset()}>Reset view</button>
            <button aria-expanded={help} aria-controls="obsidian-controls-help" onClick={() => setHelp(value => !value)}>Controls</button>
          </div>
          {mode === 'walk' && <VisitorWalkControls onTouchMove={direction => controls.current?.move(direction)} />}
          {mode === 'overview' && <div className="obsidian__zoom" role="group" aria-label="Overview zoom"><button aria-label="Zoom out" onClick={() => controls.current?.zoom(-1)}>−</button><button aria-label="Zoom in" onClick={() => controls.current?.zoom(1)}>+</button></div>}
          {help && <aside id="obsidian-controls-help" className="obsidian__help"><button aria-label="Close control guide" onClick={() => setHelp(false)}>×</button><strong>Explore at your pace.</strong><span>{VISITOR_KEYBOARD_HINT}</span><p>Drag to look · Tap the floor to walk · Pinch or scroll to zoom.</p><p>Hold the arrows to walk on mobile. Overview lets you orbit and zoom out. Select any artwork to inspect it.</p></aside>}
          <a href="#obsidian-collection" onClick={e => { e.preventDefault(); setActive(false); setStatus('idle'); document.getElementById("obsidian-collection")?.scrollIntoView(); }}>Browse the collection ↓</a>
        </div>
      </>}
    </section>
    <section className="obsidian__collection" id="obsidian-collection" aria-labelledby="obsidian-collection-heading">
      <div className="obsidian__collection-intro"><p className="obsidian__eyebrow">The collection / 11 works</p><h2 id="obsidian-collection-heading">Nature, imagined.</h2><p>A journey through botanical origins, living matter and future nature. The supplied collection consists of AI-generated artworks.</p></div>
      {data.rooms.map(r => <section key={r.id} aria-labelledby={`collection-${r.id}`}><h3 id={`collection-${r.id}`}>{r.name}</h3><div className="obsidian__art-grid">{data.artworks.filter(a => a.room === r.id).map(a => <button key={a.id} onClick={() => setSelected(a.id)}><img src={a.image} alt={a.title} width={Math.round(a.width*400)} height={Math.round(a.height*400)} loading="lazy" /><span>{a.title}</span><small>{a.width.toFixed(1)} × {a.height.toFixed(1)} m · View artwork ↗</small></button>)}</div></section>)}
      <footer><p>OBSIDIAN is an individually authored LIEUVA showcase.<br />This exhibition is separate from the room templates available in Studio.</p><a href="#/">Back to LIEUVA ↗</a></footer>
    </section>
    <dialog className="obsidian__art-dialog" ref={dialog} onCancel={() => setSelected(null)} onClose={() => setSelected(null)} aria-label={current?.title ?? 'Artwork'}>
      {current && <><button className="obsidian__close" onClick={() => setSelected(null)} autoFocus aria-label="Close artwork">×</button><img src={current.image} alt={current.title} /><div><p>{current.id} / AI-generated artwork</p><h2>{current.title}</h2><p>{current.width.toFixed(1)} × {current.height.toFixed(1)} m</p></div></>}
    </dialog>
  </main>;
}
