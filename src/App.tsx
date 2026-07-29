import { lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { Logo } from './components/Logo';
import { TEMPLATES } from './features/gallery/templates';
import {
  EMPTY_DRAFT, type Artwork, type DecorId, type DecorPlacement,
  type GalleryDraft, type TemplateId, type WallId
} from './features/gallery/types';
import { galleryRepository, type GalleryRecord } from './services/galleryRepository';

const GalleryScene = lazy(() => import('./features/gallery/GalleryScene').then((module) => ({ default: module.GalleryScene })));
const DannyDemoScene = lazy(() => import('./features/gallery/GalleryScene').then((module) => ({ default: module.DannyDemoScene })));

type Route = { page: 'home' | 'create' | 'demo' | 'gallery'; id?: string };
const routeFromHash = (): Route => {
  const hash = location.hash.replace(/^#/, '');
  if (hash === '/create') return { page: 'create' };
  if (hash === '/demo') return { page: 'demo' };
  if (hash.startsWith('/g/')) return { page: 'gallery', id: hash.slice(3) };
  return { page: 'home' };
};
const navigate = (path: string) => { location.hash = path; window.scrollTo(0, 0); };

function Header({ light = false }: { light?: boolean }) {
  return <header className={`site-header ${light ? 'site-header--light' : ''}`}>
    <Logo dark={light} />
    <nav><button onClick={() => navigate('/demo')}>Live demo</button><button onClick={() => navigate('/create')}>Create gallery <span>↗</span></button></nav>
  </header>;
}

function RoomIllustration() {
  return <div className="room-illustration" aria-hidden="true"><div className="room-ceiling"/><div className="room-wall room-wall--left"/><div className="room-wall room-wall--back"><i/><i/><i/></div><div className="room-wall room-wall--right"/><div className="room-floor"/><div className="artwork artwork--a"/><div className="artwork artwork--b"/><div className="artwork artwork--c"/><div className="plinth"/></div>;
}

function DiscoverGalleries() {
  const [galleries, setGalleries] = useState<GalleryRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { galleryRepository.discover().then(setGalleries).catch((error) => console.warn('Discover unavailable', error)).finally(() => setLoaded(true)); }, []);
  return <section className="discover">
    <div className="discover-heading"><div><p className="eyebrow">Open for ten days</p><h2>Discover<br/><em>galleries.</em></h2></div><p>New spaces created by artists using AURA. Enter while the exhibition is live.</p></div>
    <div className={`discover-grid ${!galleries.length ? 'discover-grid--empty' : ''}`}>{!galleries.length && <div className="discover-empty"><span>{loaded ? 'No exhibitions are open yet.' : 'Looking for open exhibitions…'}</span><p>Publish the first gallery and it will appear here for ten days.</p><button className="text-link" onClick={() => navigate('/create')}>Create a gallery →</button></div>}{galleries.map((gallery) => {
      const cover = gallery.artworks[0]?.src;
      const days = Math.max(1, Math.ceil((new Date(gallery.expiresAt).getTime() - Date.now()) / 86400000));
      return <button key={gallery.id} className={`discover-card template-card--${gallery.templateId}`} onClick={() => navigate(`/g/${gallery.id}`)}>
        <div className="discover-cover">{cover ? <img src={cover} alt=""/> : <div className="mini-room"><i/><i/><i/></div>}<span>{days} days left</span></div>
        <p>{gallery.artist}</p><h3>{gallery.title}</h3><small>Enter exhibition →</small>
      </button>;
    })}</div>
  </section>;
}

function Landing() {
  return <main className="landing"><Header />
    <section className="hero"><div className="hero-copy"><p className="eyebrow">Virtual exhibitions, beautifully simple</p><h1>Your art.<br/><em>Beyond walls.</em></h1><p className="hero-intro">Create immersive, shareable 3D galleries in minutes. No code. No downloads. Just your work, in a space it deserves.</p><div className="hero-actions"><button className="button button--light" onClick={() => navigate('/create')}>Create your gallery <span>↗</span></button><button className="text-link" onClick={() => navigate('/demo')}>Explore a live gallery <span>→</span></button></div><div className="hero-note"><span>01</span><p>Built for artists<br/>Designed for everyone</p></div></div><RoomIllustration /><p className="vertical-word">AURA / VIRTUAL SPACE</p></section>
    <DiscoverGalleries />
    <section className="promise"><p className="eyebrow">One idea, beautifully realized</p><div><h2>From studio to<br/><em>space</em> in minutes.</h2><p>A focused set of considered tools gives you everything you need to compose, customize, and publish an exhibition—without learning 3D software.</p></div><div className="steps">{['Choose a space','Add your work','Set the atmosphere','Share it'].map((step, i) => <article key={step}><span>0{i+1}</span><h3>{step}</h3><p>{['Start with one of three architect-designed gallery blueprints.','Upload images and place each piece on the walls.','Choose from a curated palette of finishes, light, and objects.','Publish instantly and invite anyone with a link.'][i]}</p></article>)}</div></section>
    <section className="demo-tease"><div><p className="eyebrow">Featured exhibition</p><h2>Danny Hirsch<br/><em>Threshold</em></h2><p>A working gallery made with AURA, adapted from Danny Hirsch Arts’ original Blender space.</p><button className="button button--light" onClick={() => navigate('/demo')}>Enter the gallery <span>→</span></button></div><button className="demo-image" onClick={() => navigate('/demo')} aria-label="Open Danny Hirsch demo"><img src="./assets/demo/danny-cover.png" alt="Dark contemporary gallery showing abstract art"/><span>Explore in 3D ↗</span></button></section>
    <section className="closing"><p className="eyebrow">Your next exhibition starts here</p><h2>Make space<br/><em>for your art.</em></h2><button className="button button--dark" onClick={() => navigate('/create')}>Create a gallery <span>↗</span></button></section><Footer />
  </main>;
}

function Footer() { return <footer><Logo /><p>Virtual galleries for independent artists.</p><span>© 2026 AURA</span></footer>; }

function TemplatePicker({ onChoose }: { onChoose: (id: TemplateId) => void }) {
  return <main className="picker"><Header light/><div className="picker-heading"><p className="eyebrow">Create gallery · Step 1 of 3</p><h1>Choose your <em>space.</em></h1><p>Three considered architectures. Each is fully customizable, beautifully lit, and ready for your work.</p></div><div className="template-grid">{TEMPLATES.map((template) => <button className={`template-card template-card--${template.id}`} key={template.id} onClick={() => onChoose(template.id)}><span className="template-number">{template.index}</span><div className="template-preview"><div className="mini-room"><i/><i/><i/></div><span>Use this space ↗</span></div><p>{template.label}</p><h2>{template.name}</h2><small>{template.description}</small></button>)}</div><p className="picker-footnote">All spaces are optimized for desktop, tablet, and mobile.</p></main>;
}

async function imageFromFile(file: File): Promise<Pick<Artwork, 'src' | 'aspect'>> {
  const url = URL.createObjectURL(file); const image = new Image(); image.src = url; await image.decode();
  const max = 1400; const scale = Math.min(1, max / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale); canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height); URL.revokeObjectURL(url);
  return { src: canvas.toDataURL('image/jpeg', .82), aspect: canvas.width / canvas.height };
}

function Studio({ initialTemplate }: { initialTemplate: TemplateId }) {
  const [draft, setDraft] = useState<GalleryDraft>({ ...EMPTY_DRAFT, templateId: initialTemplate });
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedDecorId, setSelectedDecorId] = useState<string>();
  const [published, setPublished] = useState<GalleryRecord>();
  const [publishing, setPublishing] = useState(false);
  const selected = draft.artworks.find((item) => item.id === selectedId);
  const selectedDecor = draft.decor.find((item) => item.id === selectedDecorId);
  const roomDimensions = TEMPLATES.find((item) => item.id === draft.templateId)?.dimensions ?? [10, 7];
  const decorLimitX = roomDimensions[0] / 2 - .5; const decorLimitZ = roomDimensions[1] / 2 - .5;
  const selectArtwork = useCallback((id: string) => { setSelectedId(id); setSelectedDecorId(undefined); }, []);
  const selectDecor = useCallback((id: string) => { setSelectedDecorId(id); setSelectedId(undefined); }, []);
  const update = <K extends keyof GalleryDraft>(key: K, value: GalleryDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const updateArtwork = (value: Partial<Artwork>) => setDraft((current) => ({ ...current, artworks: current.artworks.map((item) => item.id === selectedId ? { ...item, ...value } : item) }));
  const updateDecor = (value: Partial<DecorPlacement>) => setDraft((current) => ({ ...current, decor: current.decor.map((item) => item.id === selectedDecorId ? { ...item, ...value } : item) }));
  const addDecor = (type: DecorId) => { const item: DecorPlacement = { id: crypto.randomUUID(), type, x: (draft.decor.length % 3 - 1) * 1.4, z: 1 - Math.floor(draft.decor.length / 3) * 1.2, rotation: 0, scale: 1 }; update('decor', [...draft.decor, item]); setSelectedDecorId(item.id); setSelectedId(undefined); };
  const upload = async (files: FileList | null) => {
    if (!files) return; const remaining = Math.max(0, 8 - draft.artworks.length); const next: Artwork[] = [];
    for (const file of Array.from(files).filter((item) => item.type.startsWith('image/')).slice(0, remaining)) { const image = await imageFromFile(file); next.push({ id: crypto.randomUUID(), title: file.name.replace(/\.[^.]+$/, ''), ...image, wall: 'north', x: (next.length - 1) * 1.7, y: 2.2, scale: .9 }); }
    setDraft((current) => ({ ...current, artworks: [...current.artworks, ...next] })); if (next[0]) selectArtwork(next[0].id);
  };
  const publish = async () => {
    setPublishing(true);
    try { setPublished(await galleryRepository.publish(draft)); }
    catch (error) { console.error(error); alert('Publishing could not connect to Firebase. Enable Anonymous Authentication and deploy the included Firestore and Storage rules.'); }
    finally { setPublishing(false); }
  };

  if (published) {
    const url = `${location.href.split('#')[0]}#/g/${published.id}`;
    return <main className="publish-success"><div><Logo/><p className="eyebrow">Gallery published · Live for 10 days</p><h1>Your space is<br/><em>ready to share.</em></h1><p>Anyone with this link can enter your exhibition. It also appears in Discover for ten days.</p><div className="share-field"><input readOnly value={url}/><button onClick={() => navigator.clipboard.writeText(url)}>Copy link</button></div><div className="success-actions"><button className="button button--light" onClick={() => navigate(`/g/${published.id}`)}>Open gallery ↗</button><button className="text-link" onClick={() => setPublished(undefined)}>Back to editor</button></div></div><GalleryScene draft={published} visitor/></main>;
  }

  return <main className="studio"><header className="studio-header"><Logo/><div className="studio-title"><input aria-label="Gallery title" value={draft.title} onChange={(event) => update('title', event.target.value)}/><span>by</span><input aria-label="Artist name" value={draft.artist} onChange={(event) => update('artist', event.target.value)}/></div><button className="publish-button" onClick={publish} disabled={publishing}>{publishing ? 'Publishing…' : 'Publish'} <span>↗</span></button></header>
    <div className="studio-body"><aside className="tool-panel"><section><p className="tool-label">01 · Artwork</p><label className="upload"><input type="file" accept="image/*" multiple onChange={(event) => upload(event.target.files)}/><span>＋</span><strong>Upload artwork</strong><small>JPG, PNG or WebP · up to 8</small></label><div className="artwork-list">{draft.artworks.map((artwork, index) => <button key={artwork.id} className={selectedId === artwork.id ? 'active' : ''} onClick={() => selectArtwork(artwork.id)}><img src={artwork.src} alt=""/><span>{String(index + 1).padStart(2,'0')} · {artwork.title}</span></button>)}</div>{selected && <div className="placement"><label>Wall<select value={selected.wall} onChange={(event) => updateArtwork({ wall: event.target.value as WallId })}><option value="north">Back wall</option><option value="west">Left wall</option><option value="east">Right wall</option></select></label><Range label="Horizontal" min={-3.5} max={3.5} step={.1} value={selected.x} onChange={(x) => updateArtwork({ x })}/><Range label="Height" min={1} max={3.6} step={.1} value={selected.y} onChange={(y) => updateArtwork({ y })}/><Range label="Size" min={.45} max={1.65} step={.05} value={selected.scale} onChange={(scale) => updateArtwork({ scale })}/><button className="remove" onClick={() => { update('artworks', draft.artworks.filter((item) => item.id !== selectedId)); setSelectedId(undefined); }}>Remove artwork</button></div>}</section>
      <Accordion title="02 · Walls"><Swatches options={[['chalk','#e7e4dc'],['warm','#b9a993'],['charcoal','#30312f']]} value={draft.wall} onChange={(value) => update('wall', value as GalleryDraft['wall'])}/></Accordion>
      <Accordion title="03 · Floor"><Swatches options={[['concrete','#777672'],['oak','#5c4633'],['terrazzo','#a7a299']]} value={draft.floor} onChange={(value) => update('floor', value as GalleryDraft['floor'])}/></Accordion>
      <Accordion title="04 · Lighting"><Choice options={['daylight','museum','evening']} value={draft.lighting} onChange={(value) => update('lighting', value as GalleryDraft['lighting'])}/></Accordion>
      <Accordion title="05 · Objects"><p className="object-help">Add an object, then position it anywhere on the floor.</p><div className="object-grid">{(['olive','monstera','arc-lamp','pedestal'] as DecorId[]).map((item) => <button key={item} onClick={() => addDecor(item)}>＋ {item.replace('-', ' ')}</button>)}</div><div className="decor-list">{draft.decor.map((item, index) => <button key={item.id} className={selectedDecorId === item.id ? 'active' : ''} onClick={() => selectDecor(item.id)}>{String(index + 1).padStart(2,'0')} · {item.type.replace('-', ' ')}</button>)}</div>{selectedDecor && <div className="placement"><Range label="Left / right" min={-decorLimitX} max={decorLimitX} step={.1} value={selectedDecor.x} onChange={(x) => updateDecor({ x })}/><Range label="Forward / back" min={-decorLimitZ} max={decorLimitZ} step={.1} value={selectedDecor.z} onChange={(z) => updateDecor({ z })}/><Range label="Rotation" min={0} max={Math.PI * 2} step={.1} value={selectedDecor.rotation} onChange={(rotation) => updateDecor({ rotation })}/><Range label="Size" min={.5} max={1.8} step={.05} value={selectedDecor.scale} onChange={(scale) => updateDecor({ scale })}/><button className="remove" onClick={() => { update('decor', draft.decor.filter((item) => item.id !== selectedDecorId)); setSelectedDecorId(undefined); }}>Remove object</button></div>}</Accordion>
    </aside><section className="canvas-wrap"><GalleryScene draft={draft} selectedId={selectedId} selectedDecorId={selectedDecorId} onSelect={selectArtwork} onSelectDecor={selectDecor}/><div className="canvas-badge"><span>Editing</span>{TEMPLATES.find((item) => item.id === draft.templateId)?.name}</div></section></div>
  </main>;
}

function Range({ label, min, max, step, value, onChange }: { label: string; min: number; max: number; step: number; value: number; onChange: (value: number) => void }) { return <label>{label}<input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(+event.target.value)}/></label>; }
function Accordion({ title, children }: { title: string; children: React.ReactNode }) { return <details><summary>{title}<span>＋</span></summary><div className="detail-content">{children}</div></details>; }
function Swatches({ options, value, onChange }: { options: [string,string][]; value: string; onChange: (value: string) => void }) { return <div className="swatches">{options.map(([name,color]) => <button key={name} className={value === name ? 'active' : ''} onClick={() => onChange(name)}><i style={{ background: color }}/><span>{name}</span></button>)}</div>; }
function Choice({ options, value, onChange }: { options: string[]; value: string; onChange: (value: string) => void }) { return <div className="choices">{options.map((item) => <button key={item} className={value === item ? 'active' : ''} onClick={() => onChange(item)}>{item}</button>)}</div>; }

function Demo() { return <main className="viewer"><header className="viewer-header"><Logo/><div><p>Danny Hirsch Arts</p><span>Threshold · 2026</span></div><button onClick={() => navigate('/create')}>Create your own ↗</button></header><DannyDemoScene/><div className="viewer-caption"><p className="eyebrow">Public demo gallery</p><h1>Threshold</h1><p>Material, movement, and atmosphere by Danny Hirsch.</p></div><div className="movement-hint">WASD / Arrow keys · Drag to look</div></main>; }

function PublishedGallery({ id }: { id: string }) {
  const [gallery, setGallery] = useState<GalleryRecord | null | undefined>();
  useEffect(() => { galleryRepository.find(id).then(setGallery); }, [id]);
  if (gallery === undefined) return <div className="loading">Loading space…</div>;
  if (!gallery) return <main className="not-found"><Logo/><h1>This gallery isn't available.</h1><p>The exhibition may have reached the end of its ten-day run.</p><button className="button button--light" onClick={() => navigate('/create')}>Create a gallery</button></main>;
  return <main className="viewer"><header className="viewer-header"><Logo/><div><p>{gallery.title}</p><span>{gallery.artist}</span></div><button onClick={() => navigate('/create')}>Create your own ↗</button></header><GalleryScene draft={gallery} visitor/><div className="viewer-caption"><p className="eyebrow">Virtual exhibition</p><h1>{gallery.title}</h1><p>by {gallery.artist}</p></div><div className="movement-hint">WASD / Arrow keys · Drag to look</div></main>;
}

export default function App() {
  const [route, setRoute] = useState(routeFromHash); const [template, setTemplate] = useState<TemplateId>();
  useEffect(() => { const handler = () => { setRoute(routeFromHash()); setTemplate(undefined); }; addEventListener('hashchange', handler); return () => removeEventListener('hashchange', handler); }, []);
  return useMemo(() => { if (route.page === 'create') return template ? <Studio initialTemplate={template}/> : <TemplatePicker onChoose={setTemplate}/>; if (route.page === 'demo') return <Demo/>; if (route.page === 'gallery' && route.id) return <PublishedGallery id={route.id}/>; return <Landing/>; }, [route, template]);
}
