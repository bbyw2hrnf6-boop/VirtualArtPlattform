import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { ObsidianControls, ObsidianMode } from './ObsidianScene';
import obsidian from './obsidian.json';
import pavilion from './sculpture-pavilion.json';
import { VisitorControls } from '../gallery/VisitorControls';
import { IDLE_VISITOR_TOUR } from '../gallery/visitorTourState';
import '../../styles/visitorControls.css';
import './obsidian.css';
import { useReducedMotion } from './useReducedMotion';
import { FlightControls } from './FlightControls';

const ObsidianScene = lazy(() => import('./ObsidianScene'));

const SculptureScene = lazy(() => import('./SculptureScene'));

export default function ObsidianPage({ sculpture = false }: { sculpture?: boolean }) {
  const data = sculpture ? pavilion : obsidian;
  const title = sculpture ? 'Sculpture Pavilion' : 'Obsidian';
  const Scene = sculpture ? SculptureScene : ObsidianScene;
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const controls = useRef<ObsidianControls | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState('idle');
  const [room, setRoom] = useState(0);
  const [mode, setMode] = useState<ObsidianMode>('walk');
  const [tour, setTour] = useState(IDLE_VISITOR_TOUR);
  const [flight, setFlight] = useState(IDLE_VISITOR_TOUR);
  const reduced = useReducedMotion();
  const [selected, setSelected] = useState<string | null>(null);
  const ready = useCallback(() => { setRoom(0); setMode('walk'); setStatus('ready'); controls.current?.flight('start'); }, []);
  const failed = useCallback(() => { setStatus('error'); setActive(false); }, []);
  const artwork = useCallback((id: string) => setSelected(id), []);
  const current = data.artworks.find(a => a.id === selected);
  const browseCollection = () => {
    setActive(false); setStatus('idle');
    document.getElementById('obsidian-collection')?.scrollIntoView();
  };
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
    <section className="obsidian__stage" aria-label={`${title} exhibition preview`} data-flight={flight.status}>
      {status !== 'ready' && <img className="obsidian__poster" src={`/assets/showcases/${sculpture ? "sculpture-pavilion" : "obsidian"}/cover.webp${sculpture ? "?v=2" : ""}`} alt={sculpture ? "Sculpture Pavilion: ivory atrium, bronze ribbons, carved stone and pale ash beneath an oval skylight." : "Obsidian: warm pools of light, botanical art, walnut portals and honed black limestone."} fetchPriority="high" />}
      {active && <Suspense fallback={null}><Scene controlsRef={controls} onReady={ready} onError={failed} onRoom={setRoom} onArtwork={artwork} onMode={setMode} onTour={setTour} onFlight={setFlight} /></Suspense>}
      {status !== 'ready' && <div className="obsidian__entrance">
        <p className="obsidian__eyebrow">A LIEUVA bespoke exhibition</p>
        <h1>{title}.</h1>
        <p>{sculpture ? "Three rooms. Five sculptural encounters." : "Three rooms. Eleven visions of nature."}<br />{sculpture ? "Stone, bronze, ash and glass. Nature in another form." : "An exhibition in light, stone and living matter."}</p>
        <button className="obsidian__enter" disabled={status === 'loading'} onClick={() => { setStatus('loading'); setActive(true); }}>{status === 'loading' ? 'Preparing your visit…' : status === 'error' ? 'Try the exhibition again ↗' : 'Enter the exhibition ↗'}</button>
        <p className="obsidian__status" role="status">{status === 'error' ? 'The 3D view could not load. You can still explore every artwork below.' : saver ? 'Data Saver is on. Browse the artworks below, or choose to load the 3D exhibition.' : reduced ? 'Explore freely on desktop or mobile.' : 'A short opening flight, then explore freely. Skip at any time.'}</p>
        <a href="#obsidian-collection" onClick={e => { e.preventDefault(); document.getElementById("obsidian-collection")?.scrollIntoView(); }}>View the collection ↓</a>
      </div>}
      {status === 'ready' && <>
        <div className="obsidian__room-label"><span>{String(room+1).padStart(2,'0')} / {title.toUpperCase()}</span><h1>{data.rooms[room].name}</h1></div>
        <label className="obsidian__room-picker">Room
          <select aria-label="Exhibition room" value={room} onChange={event => controls.current?.room(Number(event.target.value))}>
            {data.rooms.map((r, i) => <option key={r.id} value={i}>{String(i+1).padStart(2,'0')} / {r.name}</option>)}
          </select>
        </label>
        <VisitorControls<ObsidianMode>
          mode={mode}
          modeOptions={[{value:'walk',label:'Walk',icon:'↟'}, {value:'overview',label:'Overview',icon:'◇'}]}
          onModeChange={value => controls.current?.mode(value)}
          onResetView={() => controls.current?.reset()}
          tour={tour} tourAvailable={mode === 'walk'}
          onStartOrSkipTour={() => controls.current?.tour(tour.status === 'idle' ? 'start' : 'stop')}
          onPauseOrResumeTour={() => controls.current?.tour('pause')}
          onStepTour={direction => controls.current?.tour(direction)}
          onOpenArtworkDirectory={browseCollection}
          artworkCount={data.artworks.length}
          artworkDirectoryId="obsidian-collection"
          artworkDirectoryDialog={false}
          showHelp={false}
        />
        <FlightControls state={flight} controls={controls} duration={sculpture?28:26} reduced={reduced}/>
        <div className="arrange-zoom obsidian__zoom" role="group" aria-label="Camera zoom"><button aria-label="Zoom out" onClick={() => controls.current?.zoom(-1)}>−</button><button aria-label="Zoom in" onClick={() => controls.current?.zoom(1)}>+</button></div>
      </>}
    </section>
    <section className="obsidian__collection" id="obsidian-collection" aria-labelledby="obsidian-collection-heading">
      <div className="obsidian__collection-intro"><p className="obsidian__eyebrow">The collection / {data.artworks.length} works</p><h2 id="obsidian-collection-heading">Nature, imagined.</h2><p>{sculpture ? "Five sculptures modelled in Blender from the supplied AI-generated concepts. An exploration of organic form, daylight and gentle movement." : "A journey through botanical origins, living matter and future nature. The supplied collection consists of AI-generated artworks."}</p></div>
      {data.rooms.map(r => <section key={r.id} aria-labelledby={`collection-${r.id}`}><h3 id={`collection-${r.id}`}>{r.name}</h3><div className="obsidian__art-grid">{data.artworks.filter(a => a.room === r.id).map(a => <button key={a.id} onClick={() => setSelected(a.id)}><img src={a.image} alt={a.title} width={Math.round(a.width*400)} height={Math.round(a.height*400)} loading="lazy" /><span>{a.title}</span><small>{a.width.toFixed(1)} × {a.height.toFixed(1)} m · View artwork ↗</small></button>)}</div></section>)}
      <footer><p>{title} is an individually authored LIEUVA showcase.<br />This exhibition is separate from the room templates available in Studio.</p><a href="#/">Back to LIEUVA ↗</a></footer>
    </section>
    <dialog className="obsidian__art-dialog" ref={dialog} onCancel={() => setSelected(null)} onClose={() => setSelected(null)} aria-label={current?.title ?? 'Artwork'}>
      {current && <><button className="obsidian__close" onClick={() => setSelected(null)} autoFocus aria-label="Close artwork">×</button><img src={current.image} alt={current.title} /><div><p>{current.id} / {sculpture ? "3D reconstruction from an AI-generated concept" : "AI-generated artwork"}</p><h2>{current.title}</h2><p>{current.width.toFixed(1)} × {current.height.toFixed(1)} m</p></div></>}
    </dialog>
  </main>;
}
