import { lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Logo } from './components/Logo';
import { TEMPLATES } from './features/gallery/templates';
import { autoCurateGallery, type CurationPhase, type CurationReport } from './features/gallery/autoCurator';
import {
  EMPTY_DRAFT, type Artwork, type DecorId, type DecorPlacement,
  type GalleryDraft, type TemplateId, type WallId
} from './features/gallery/types';
import { galleryRepository, type GalleryRecord } from './services/galleryRepository';

const GalleryScene = lazy(() => import('./features/gallery/GalleryScene').then((module) => ({ default: module.GalleryScene })));
const DannyDemoScene = lazy(() => import('./features/gallery/GalleryScene').then((module) => ({ default: module.DannyDemoScene })));

type Route = { page: 'home' | 'create' | 'demo' | 'gallery'; id?: string };
type ViewMode = 'walk' | 'overview';
type ArtworkFocus = { id: string; title: string; artist: string; description?: string; year?: string; image?: string };
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

function HeroGalleryVisual() {
  return <button className="hero-gallery-visual" onClick={() => navigate('/demo')} aria-label="Enter the Danny Hirsch live gallery"><img src="./assets/demo/aura-hero-gallery.webp" alt="Atmospheric AURA gallery with contemporary artworks"/><span className="hero-gallery-shade"/><span className="hero-gallery-label"><i>Live space · 01</i><strong>Enter the exhibition ↗</strong></span></button>;
}

function DiscoverGalleries() {
  const [galleries, setGalleries] = useState<GalleryRecord[]>([]);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string>();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [page, setPage] = useState(0);
  const [discoveredAt] = useState(Date.now);
  const load = useCallback(() => { setStatus('loading'); galleryRepository.discover().then((items) => { setGalleries(items); setStatus('ready'); }).catch((error) => { console.error('Discover unavailable', error); setStatus('error'); }); }, []);
  useEffect(() => { galleryRepository.discover().then((items) => { setGalleries(items); setStatus('ready'); }).catch((error) => { console.error('Discover unavailable', error); setStatus('error'); }); galleryRepository.currentUserId().then(setOwnerId).catch(() => setOwnerId(null)); }, []);
  const pageCount = Math.max(1, Math.ceil(galleries.length / 3));
  const visiblePage = Math.min(page, pageCount - 1);
  const visibleGalleries = galleries.slice(visiblePage * 3, visiblePage * 3 + 3);
  const removeGallery = async (gallery: GalleryRecord) => {
    if (!window.confirm(`Remove “${gallery.title}” from Discover? This cannot be undone.`)) return;
    setRemovingId(gallery.id);
    try { await galleryRepository.delete(gallery.id); setGalleries((current) => current.filter((item) => item.id !== gallery.id)); }
    catch (error) { console.error('Gallery deletion failed', error); alert('The gallery could not be removed. Deploy the updated Firestore rules, then try again.'); }
    finally { setRemovingId(undefined); }
  };
  return <section className="discover">
    <div className="discover-heading"><div><p className="eyebrow">Open for ten days</p><h2>Discover<br/><em>galleries.</em></h2></div><div className="discover-intro"><p>New spaces created by artists using AURA. Enter while the exhibition is live.</p>{galleries.length > 3 && <div className="discover-controls" role="group" aria-label="Browse open galleries"><span>{String(visiblePage + 1).padStart(2, '0')} / {String(pageCount).padStart(2, '0')}</span><button onClick={() => setPage(Math.max(0, visiblePage - 1))} disabled={visiblePage === 0} aria-label="Previous galleries">←</button><button onClick={() => setPage(Math.min(pageCount - 1, visiblePage + 1))} disabled={visiblePage === pageCount - 1} aria-label="Next galleries">→</button></div>}</div></div>
    <div className={`discover-grid ${!galleries.length ? 'discover-grid--empty' : ''}`}>{!galleries.length && <div className="discover-empty"><span>{status === 'loading' ? 'Looking for open exhibitions…' : status === 'error' ? 'Discover is temporarily unavailable.' : 'No exhibitions are open yet.'}</span><p>{status === 'error' ? 'Your published gallery is safe. Please retry the connection.' : 'Publish the first gallery and it will appear here for ten days.'}</p><button className="text-link" onClick={status === 'error' ? load : () => navigate('/create')}>{status === 'error' ? 'Try again →' : 'Create a gallery →'}</button></div>}{visibleGalleries.map((gallery) => {
      const cover = gallery.coverSrc || gallery.artworks[0]?.src;
      const days = Math.max(1, Math.ceil((new Date(gallery.expiresAt).getTime() - discoveredAt) / 86400000));
      return <article key={gallery.id} className={`discover-card template-card--${gallery.templateId}`}>
        <button className="discover-card-main" onClick={() => navigate(`/g/${gallery.id}`)}>
          <div className="discover-cover">{cover ? <img src={cover} alt=""/> : <div className="mini-room"><i/><i/><i/></div>}<span>{days} days left</span></div>
          <p>{gallery.artist}</p><h3>{gallery.title}</h3><small>Enter exhibition →</small>
        </button>
        {gallery.ownerId === ownerId && <button className="discover-delete" disabled={removingId === gallery.id} onClick={() => removeGallery(gallery)} aria-label={`Remove ${gallery.title}`}>{removingId === gallery.id ? 'Removing…' : 'Remove'}</button>}
      </article>;
    })}</div>
  </section>;
}

function Landing() {
  return <main className="landing"><Header />
    <section className="hero"><div className="hero-copy"><p className="eyebrow">Art should be experienced</p><h1>Your art.<br/><em>Beyond walls.</em></h1><p className="hero-intro">Create a cinematic, shareable 3D exhibition in minutes. No code. No downloads. No 3D software. Just your work, in a space it deserves.</p><div className="hero-actions"><button className="button button--light" onClick={() => navigate('/create')}>Create your gallery <span>↗</span></button><button className="text-link" onClick={() => navigate('/demo')}>Experience a live gallery <span>→</span></button></div><div className="hero-note"><span>01</span><p>Premium spaces<br/>Effortless creation</p></div></div><HeroGalleryVisual /><p className="vertical-word">AURA / THE DIGITAL HOME FOR ARTISTS</p></section>
    <section className="manifesto"><p className="eyebrow">Our mission</p><blockquote>We are not building another place to upload images.<br/><em>We are building a place where art is experienced.</em></blockquote><div><p>Social feeds move on. Static portfolios flatten the work. AURA gives every exhibition atmosphere, presence, and a space of its own.</p><span>Browser-based · No technical knowledge required</span></div></section>
    <DiscoverGalleries />
    <section className="promise"><p className="eyebrow">Quality over quantity</p><div><h2>From studio to<br/><em>space</em> in minutes.</h2><p>A small collection of carefully designed, Blender-based environments gives artists cinematic light and premium materials without the complexity of 3D software.</p></div><div className="steps">{['Choose a gallery','Upload artwork','Customize','Publish & share'].map((step, i) => <article key={step}><span>0{i+1}</span><h3>{step}</h3><p>{['Begin with one of three considered, photorealistic spaces.','Add up to eight works and compose them directly on the walls.','Set the mood with curated finishes, lighting, and objects.','Open your exhibition and share one simple link with the world.'][i]}</p></article>)}</div></section>
    <section className="difference"><div><p className="eyebrow">Why AURA</p><h2>Not another<br/><em>portfolio.</em></h2></div><div className="difference-list"><article><span>01</span><h3>Presence over posts</h3><p>Artwork is not buried beneath an endless feed. It receives time, scale, and attention.</p></article><article><span>02</span><h3>Atmosphere over pages</h3><p>Visitors move through light, material, and space instead of scrolling through a static grid.</p></article><article><span>03</span><h3>Simplicity by design</h3><p>Every decision is curated so an artist can build a premium exhibition in minutes.</p></article></div></section>
    <section className="demo-tease"><div><p className="eyebrow">Featured exhibition</p><h2>Danny Hirsch<br/><em>Threshold</em></h2><p>A working gallery made with AURA, adapted from Danny Hirsch Arts’ original Blender space.</p><button className="button button--light" onClick={() => navigate('/demo')}>Enter the gallery <span>→</span></button></div><button className="demo-image" onClick={() => navigate('/demo')} aria-label="Open Danny Hirsch demo"><img src="./assets/demo/danny-cover.webp" alt="Dark contemporary gallery showing abstract art"/><span>Explore in 3D ↗</span></button></section>
    <section className="audience"><p className="eyebrow">Built first for independent artists</p><div>{['Painters','Digital artists','Photographers','Illustrators','Fine artists'].map((item) => <span key={item}>{item}</span>)}</div></section>
    <section className="horizon"><div><p className="eyebrow">The long-term vision</p><h2>The digital home<br/><em>for artists worldwide.</em></h2></div><div><p>The gallery builder is the beginning. AURA is designed to grow into a global creative platform—without ever compromising simplicity or visual quality.</p><div className="roadmap"><span className="now">Now · Create exhibitions</span><span>Discover artists</span><span>Live events</span><span>Community</span><span>Marketplace</span><span>AI-assisted creation</span></div></div></section>
    <section className="closing"><p className="eyebrow">Your next exhibition starts here</p><h2>Make space<br/><em>for your art.</em></h2><button className="button button--dark" onClick={() => navigate('/create')}>Create a gallery <span>↗</span></button></section><Footer />
  </main>;
}

function Footer() { return <footer><Logo /><p>Virtual galleries for independent artists.</p><span>© 2026 AURA</span></footer>; }

function TemplatePicker({ onChoose }: { onChoose: (id: TemplateId) => void }) {
  return <main className="picker"><Header light/><div className="picker-heading"><p className="eyebrow">Create gallery · Step 1 of 3</p><h1>Choose your <em>space.</em></h1><p>Three considered architectures. Each is fully customizable, beautifully lit, and ready for your work.</p></div><div className="template-grid">{TEMPLATES.map((template) => <button className={`template-card template-card--${template.id}`} key={template.id} onClick={() => onChoose(template.id)}><span className="template-number">{template.index}</span><div className="template-preview"><div className="mini-room"><i/><i/><i/></div><span>Use this space ↗</span></div><p>{template.label}</p><h2>{template.name}</h2><small>{template.description}</small></button>)}</div><p className="picker-footnote">All spaces are optimized for desktop, tablet, and mobile.</p></main>;
}

async function imageFromFile(file: File): Promise<Pick<Artwork, 'src' | 'aspect'>> {
  if (file.size > 30 * 1024 * 1024) throw new Error(`${file.name} is larger than 30 MB.`);
  const url = URL.createObjectURL(file); const image = new Image(); image.decoding = 'async';
  try {
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error(`${file.name} could not be opened. Please export it as JPG, PNG, or WebP.`)); image.src = url; });
    const max = 1200; const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale)); const context = canvas.getContext('2d'); if (!context) throw new Error('Your browser could not prepare this image.'); context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let quality = .78; let src = canvas.toDataURL('image/webp', quality); if (!src.startsWith('data:image/webp')) src = canvas.toDataURL('image/jpeg', .82);
    while (src.length > 720000 && quality > .38) { quality -= .08; src = canvas.toDataURL(src.startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg', quality); }
    if (src.length > 780000) throw new Error(`${file.name} could not be compressed below the gallery limit.`);
    return { src, aspect: canvas.width / canvas.height };
  } finally { URL.revokeObjectURL(url); }
}

function initialArtworkPlacement(templateId: TemplateId, slot: number): Pick<Artwork, 'wall' | 'x' | 'y' | 'scale'> {
  if (templateId === 'pavilion') {
    const placements: Array<[WallId, number, number]> = [
      ['divider-front', -7, 3], ['divider-front', -2.35, 3], ['divider-front', 2.35, 3], ['divider-front', 7, 3],
      ['north', -11, 3.2], ['north', 0, 3.2], ['north', 11, 3.2],
      ['divider-back', -6, 3], ['divider-back', 0, 3], ['divider-back', 6, 3],
      ['south', -8, 3.1], ['south', 8, 3.1], ['west', -5, 3.1], ['east', 5, 3.1]
    ];
    const [wall, x, y] = placements[slot % placements.length]; return { wall, x, y, scale: .9 };
  }
  const placements: Array<[WallId, number]> = [
    ['north', -3], ['north', 0], ['north', 3], ['west', -1.7],
    ['east', 1.7], ['south', -2.1], ['south', 2.1], ['north', 0]
  ];
  const [wall, x] = placements[slot % placements.length]; return { wall, x, y: 2.2, scale: .9 };
}

function Studio({ initialTemplate }: { initialTemplate: TemplateId }) {
  const [draft, setDraft] = useState<GalleryDraft>({ ...EMPTY_DRAFT, templateId: initialTemplate });
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedDecorId, setSelectedDecorId] = useState<string>();
  const [published, setPublished] = useState<GalleryRecord>();
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>();
  const [curating, setCurating] = useState(false);
  const [curationPhase, setCurationPhase] = useState<CurationPhase>('palette');
  const [curationReport, setCurationReport] = useState<CurationReport>();
  const [curationSnapshot, setCurationSnapshot] = useState<GalleryDraft>();
  const [curationError, setCurationError] = useState<string>();
  const decorInsertion = useRef({ x: 0, z: 1 });
  const selected = draft.artworks.find((item) => item.id === selectedId);
  const selectedDecor = draft.decor.find((item) => item.id === selectedDecorId);
  const roomTemplate = TEMPLATES.find((item) => item.id === draft.templateId) ?? TEMPLATES[0];
  const roomDimensions = roomTemplate.dimensions;
  const maxArtworks = roomTemplate.maxArtworks;
  const decorLimitX = roomDimensions[0] / 2 - .5; const decorLimitZ = roomDimensions[1] / 2 - .5;
  const wallLimit = (wall: WallId) => wall.startsWith('divider') ? (roomTemplate.dividerWidth ?? 6.2) / 2 - .55 : wall === 'north' || wall === 'south' ? roomDimensions[0] / 2 - .8 : roomDimensions[1] / 2 - .8;
  const artworkLimit = selected ? wallLimit(selected.wall) : 3.5;
  const selectArtwork = useCallback((id: string) => { setSelectedId(id); setSelectedDecorId(undefined); }, []);
  const selectDecor = useCallback((id: string) => { setSelectedDecorId(id); setSelectedId(undefined); }, []);
  const update = <K extends keyof GalleryDraft>(key: K, value: GalleryDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const updateArtwork = (value: Partial<Artwork>) => setDraft((current) => ({ ...current, artworks: current.artworks.map((item) => item.id === selectedId ? { ...item, ...value } : item) }));
  const changeArtworkWall = (wall: WallId) => updateArtwork({ wall, x: selected ? Math.max(-wallLimit(wall), Math.min(wallLimit(wall), selected.x)) : 0 });
  const updateDecor = (value: Partial<DecorPlacement>) => setDraft((current) => ({ ...current, decor: current.decor.map((item) => item.id === selectedDecorId ? { ...item, ...value } : item) }));
  const placeDecor = useCallback((id: string, x: number, z: number) => setDraft((current) => ({ ...current, decor: current.decor.map((item) => item.id === id ? { ...item, x, z } : item) })), []);
  const placeArtwork = useCallback((id: string, wall: WallId, x: number, y: number) => setDraft((current) => ({ ...current, artworks: current.artworks.map((item) => item.id === id ? { ...item, wall, x, y } : item) })), []);
  const rememberDecorInsertion = useCallback((x: number, z: number) => { decorInsertion.current = { x, z }; }, []);
  const addDecor = (type: DecorId) => { const item: DecorPlacement = { id: crypto.randomUUID(), type, x: decorInsertion.current.x, z: decorInsertion.current.z, rotation: 0, scale: 1 }; update('decor', [...draft.decor, item]); setSelectedDecorId(item.id); setSelectedId(undefined); };
  const curateWithAi = async () => {
    if (!draft.artworks.length || curating) return;
    setCurationSnapshot(draft); setCurationReport(undefined); setCurationError(undefined); setSelectedId(undefined); setSelectedDecorId(undefined); setCurating(true); setCurationPhase('palette');
    try { const result = await autoCurateGallery(draft, roomTemplate, setCurationPhase); setDraft(result.draft); setCurationReport(result.report); }
    catch (error) { setCurationError(error instanceof Error ? error.message : 'AI Curator could not prepare this exhibition.'); }
    finally { setCurating(false); }
  };
  const undoCuration = () => { if (!curationSnapshot) return; setDraft(curationSnapshot); setCurationSnapshot(undefined); setCurationReport(undefined); setCurationError(undefined); setSelectedId(undefined); setSelectedDecorId(undefined); };
  const curationPhaseCopy = { palette: 'Reading the collection', composition: 'Composing the walls', atmosphere: 'Balancing atmosphere and objects' }[curationPhase];
  const upload = async (files: FileList | null) => {
    if (!files?.length) return; const remaining = Math.max(0, maxArtworks - draft.artworks.length); const supported = Array.from(files).filter((item) => item.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(item.name)).slice(0, remaining); const next: Artwork[] = []; const failures: string[] = [];
    setUploading(true); setUploadError(undefined);
    try {
      for (const file of supported) { try { const image = await imageFromFile(file); const slot = draft.artworks.length + next.length; next.push({ id: crypto.randomUUID(), title: file.name.replace(/\.[^.]+$/, ''), ...image, ...initialArtworkPlacement(draft.templateId, slot) }); } catch (error) { failures.push(error instanceof Error ? error.message : `${file.name} could not be prepared.`); } }
      if (!remaining) failures.push(`This gallery already contains the maximum of ${maxArtworks} artworks.`);
      else if (!supported.length) failures.push('This file is not recognized as an image. Please choose JPG, PNG, WebP, HEIC, or HEIF.');
      if (next.length) { setDraft((current) => ({ ...current, artworks: [...current.artworks, ...next] })); setCurationReport(undefined); setCurationSnapshot(undefined); selectArtwork(next[0].id); }
      if (failures.length) setUploadError(failures.join(' '));
    } finally { setUploading(false); }
  };
  const publish = async () => {
    const title = draft.title.trim(); const artist = draft.artist.trim();
    if (!title || !artist || title === EMPTY_DRAFT.title || artist === EMPTY_DRAFT.artist) { setPublishError('Give your exhibition a title and replace “Your name” with the artist name.'); return; }
    if (!draft.artworks.length) { setPublishError('Upload at least one artwork before publishing your exhibition.'); return; }
    setPublishError(undefined);
    setPublishing(true);
    try { setPublished(await galleryRepository.publish({ ...draft, title, artist })); }
    catch (error) { console.error(error); setPublishError('Publishing could not connect to Firebase. Please check the connection and try again.'); }
    finally { setPublishing(false); }
  };

  if (published) {
    const url = `${location.href.split('#')[0]}#/g/${published.id}`;
    return <main className="publish-success"><div><Logo/><p className="eyebrow">Gallery published · Live for 10 days</p><h1>Your space is<br/><em>ready to share.</em></h1><p>Anyone with this link can enter your exhibition. It also appears in Discover for ten days.</p><div className="share-field"><input readOnly value={url}/><button onClick={() => { const copy = navigator.clipboard?.writeText(url) ?? Promise.reject(); void copy.then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1800); }).catch(() => window.prompt('Copy your gallery link:', url)); }}>{copied ? 'Copied ✓' : 'Copy link'}</button></div><div className="success-actions"><button className="button button--light" onClick={() => navigate(`/g/${published.id}`)}>Open gallery ↗</button><button className="text-link" onClick={() => navigate('/')}>View in Discover</button><button className="text-link" onClick={() => setPublished(undefined)}>Back to editor</button></div></div><GalleryScene draft={published} visitor/></main>;
  }

  return <main className="studio"><header className="studio-header"><Logo/><div className="studio-title"><input aria-label="Gallery title" maxLength={100} value={draft.title} onChange={(event) => update('title', event.target.value)}/><span>by</span><input aria-label="Artist name" maxLength={100} value={draft.artist} onChange={(event) => update('artist', event.target.value)}/></div><div className="studio-actions"><button className="ai-curate-button" onClick={() => void curateWithAi()} disabled={!draft.artworks.length || curating || uploading} title={draft.artworks.length ? 'Automatically curate this exhibition' : 'Upload artwork first'}><span>✦</span>{curating ? 'Curating…' : 'AI Curator'}</button><button className="publish-button" onClick={publish} disabled={publishing || uploading || curating}>{publishing ? 'Publishing…' : 'Publish'} <span>↗</span></button></div></header>{publishError && <div className="studio-alert" role="alert"><span>Before publishing</span>{publishError}<button onClick={() => setPublishError(undefined)} aria-label="Dismiss publishing message">×</button></div>}
    <div className="studio-body"><aside className="tool-panel"><section className="mobile-exhibition"><p className="tool-label">Exhibition details</p><label>Gallery title<input maxLength={100} value={draft.title} onChange={(event) => update('title', event.target.value)}/></label><label>Artist name<input maxLength={100} value={draft.artist} onChange={(event) => update('artist', event.target.value)}/></label></section><section><p className="tool-label">01 · Artwork</p><label className={`upload ${uploading ? 'is-uploading' : ''}`}><input type="file" accept="image/*,.heic,.heif" multiple disabled={uploading} onChange={(event) => { const input = event.currentTarget; void upload(input.files).finally(() => { input.value = ''; }); }}/><span>{uploading ? '◌' : '＋'}</span><strong>{uploading ? 'Preparing artwork…' : 'Upload artwork'}</strong><small>{uploading ? 'Optimizing for the gallery' : `JPG, PNG, WebP or HEIC · up to ${maxArtworks}`}</small></label>{uploadError && <p className="upload-error" role="alert">{uploadError}</p>}<div className="artwork-list">{draft.artworks.map((artwork, index) => <button key={artwork.id} className={selectedId === artwork.id ? 'active' : ''} onClick={() => selectArtwork(artwork.id)}><img src={artwork.src} alt=""/><span>{String(index + 1).padStart(2,'0')} · {artwork.title}</span></button>)}</div>{selected && <div className="placement"><label>Title<input type="text" value={selected.title} maxLength={80} onChange={(event) => updateArtwork({ title: event.target.value })}/></label><label>Year<input type="text" value={selected.year ?? ''} maxLength={12} placeholder="2026" onChange={(event) => updateArtwork({ year: event.target.value })}/></label><label className="placement-note">Artwork note<textarea value={selected.description ?? ''} maxLength={240} placeholder="A short note visitors can read…" onChange={(event) => updateArtwork({ description: event.target.value })}/></label><label>Wall<select value={selected.wall} onChange={(event) => changeArtworkWall(event.target.value as WallId)}><option value="north">Back wall</option><option value="south">Entrance wall · Behind you</option><option value="west">Left wall</option><option value="east">Right wall</option>{draft.templateId === 'pavilion' && <><option value="divider-front">Center wall · Front</option><option value="divider-back">Center wall · Back</option></>}</select></label>{selected.wall === 'south' && <p className="wall-preview-note">Rotate the room to preview this wall from inside.</p>}<Range label="Horizontal" min={-artworkLimit} max={artworkLimit} step={.1} value={selected.x} onChange={(x) => updateArtwork({ x })}/><Range label="Height" min={1} max={Math.max(3.6, roomTemplate.height - (selected.wall.startsWith('divider') ? 1.25 : .75))} step={.1} value={selected.y} onChange={(y) => updateArtwork({ y })}/><Range label="Size" min={.45} max={1.65} step={.05} value={selected.scale} onChange={(scale) => updateArtwork({ scale })}/><button className="remove" onClick={() => { update('artworks', draft.artworks.filter((item) => item.id !== selectedId)); setSelectedId(undefined); }}>Remove artwork</button></div>}</section>
      <Accordion title="02 · Walls"><p className="object-help">Five architectural finishes, tuned to remain calm behind the artwork.</p><Swatches options={[['chalk','linear-gradient(135deg,#f1eee6,#cfcac0)','plaster'],['warm','linear-gradient(135deg,#c7b6a0,#978977)','limewash'],['travertine','repeating-linear-gradient(0deg,#cfc4af 0 2px,#e1d7c4 3px 7px)'],['linen','repeating-linear-gradient(90deg,#bbb2a4 0 1px,#d4ccbf 1px 3px)'],['charcoal','linear-gradient(135deg,#3a3c39,#202220)']]} value={draft.wall} onChange={(value) => update('wall', value as GalleryDraft['wall'])}/></Accordion>
      <Accordion title="03 · Floor"><p className="object-help">Five gallery-grade surfaces with calibrated grain and natural reflections.</p><Swatches options={[['concrete','linear-gradient(135deg,#777672,#a7a39a)','mineral concrete'],['marble','linear-gradient(135deg,#ece9e1 35%,#8c8f8c 37%,#e2ded4 40%)','white marble'],['black-marble','linear-gradient(135deg,#111 35%,#b8b8b3 37%,#191919 40%)','black marble'],['walnut','repeating-linear-gradient(0deg,#392116 0 8px,#6b4028 9px 16px)','walnut'],['dark-oak','repeating-linear-gradient(90deg,#171411 0 7px,#332b25 8px 15px)','dark oak']]} value={draft.floor} onChange={(value) => update('floor', value as GalleryDraft['floor'])}/></Accordion>
      <Accordion title="04 · Ceiling design"><p className="object-help">The roof follows the wall finish automatically. Choose one considered interior ceiling system.</p><Swatches options={[['gallery','linear-gradient(135deg,#f3f1ea,#d8d5cd)','modern'],['warm','linear-gradient(135deg,#d5c2a5,#8b7456)','luxury coffers'],['dark','linear-gradient(135deg,#20231f 38%,#e3c183 42%,#1a1c19 47%)','LED light strips']]} value={draft.ceiling ?? 'gallery'} onChange={(value) => update('ceiling', value as NonNullable<GalleryDraft['ceiling']>)}/></Accordion>
      <Accordion title="05 · Lighting"><p className="object-help">Ceiling ambience is installed automatically. Every spotlight follows an artwork when you reposition it.</p><Choice options={['daylight','museum','evening']} value={draft.lighting} onChange={(value) => update('lighting', value as GalleryDraft['lighting'])}/></Accordion>
      <Accordion title="06 · Objects"><p className="object-help">Add an object, then drag it directly in the room or click an empty floor position. Sliders remain available for fine tuning.</p><div className="object-grid">{(['olive','monstera','arc-lamp','pedestal','gallery-bench','stone-sculpture','floor-vase'] as DecorId[]).map((item) => <button key={item} onClick={() => addDecor(item)}>＋ {item.replaceAll('-', ' ')}</button>)}</div><div className="decor-list">{draft.decor.map((item, index) => <button key={item.id} className={selectedDecorId === item.id ? 'active' : ''} onClick={() => selectDecor(item.id)}>{String(index + 1).padStart(2,'0')} · {item.type.replaceAll('-', ' ')}</button>)}</div>{selectedDecor && <div className="placement"><p className="direct-place-note"><span>Direct placement active</span>Drag the selected object in the room or click the floor.</p><Range label="Left / right" min={-decorLimitX} max={decorLimitX} step={.1} value={selectedDecor.x} onChange={(x) => updateDecor({ x })}/><Range label="Forward / back" min={-decorLimitZ} max={decorLimitZ} step={.1} value={selectedDecor.z} onChange={(z) => updateDecor({ z })}/><Range label="Rotation" min={0} max={Math.PI * 2} step={.1} value={selectedDecor.rotation} onChange={(rotation) => updateDecor({ rotation })}/><Range label="Size" min={.5} max={1.8} step={.05} value={selectedDecor.scale} onChange={(scale) => updateDecor({ scale })}/><button className="remove" onClick={() => { update('decor', draft.decor.filter((item) => item.id !== selectedDecorId)); setSelectedDecorId(undefined); }}>Remove object</button></div>}</Accordion>
    </aside><section className="canvas-wrap"><GalleryScene draft={draft} selectedId={selectedId} selectedDecorId={selectedDecorId} onSelect={selectArtwork} onSelectDecor={selectDecor} onMoveDecor={placeDecor} onMoveArtwork={placeArtwork} onViewPlacementChange={rememberDecorInsertion}/><div className="canvas-badge"><span>Editing</span>{TEMPLATES.find((item) => item.id === draft.templateId)?.name}</div>{curating && <div className="ai-curation-overlay" role="status" aria-live="polite"><div className="ai-orbit"><i/><i/><i/><span>✦</span></div><p>AI Curator</p><h2>{curationPhaseCopy}</h2><small>Your images stay in this browser.</small><div className={`ai-progress ai-progress--${curationPhase}`}><i/><i/><i/></div></div>}{(curationReport || curationError) && !curating && <div className={`ai-curation-result ${curationError ? 'is-error' : ''}`} role="status"><button className="ai-result-close" onClick={() => { setCurationReport(undefined); setCurationError(undefined); }} aria-label="Close AI Curator result">×</button><span>{curationError ? 'AI Curator' : 'Curated automatically ✦'}</span>{curationError ? <p>{curationError}</p> : <><h3>{curationReport?.mood}</h3><p>{curationReport?.placementCount} artworks composed · {curationReport?.decorCount} objects placed<br/>{curationReport?.palette}</p></>}{curationSnapshot && !curationError && <button className="ai-undo" onClick={undoCuration}>Undo AI curation</button>}</div>}</section></div>
  </main>;
}

function Range({ label, min, max, step, value, onChange }: { label: string; min: number; max: number; step: number; value: number; onChange: (value: number) => void }) { return <label>{label}<input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(+event.target.value)}/></label>; }
function Accordion({ title, children }: { title: string; children: React.ReactNode }) { return <details><summary>{title}<span>＋</span></summary><div className="detail-content">{children}</div></details>; }
function Swatches({ options, value, onChange }: { options: [string,string,string?][]; value: string; onChange: (value: string) => void }) { return <div className="swatches">{options.map(([name,color,label]) => <button key={name} className={value === name ? 'active' : ''} onClick={() => onChange(name)}><i style={{ background: color }}/><span>{label || name}</span></button>)}</div>; }
function Choice({ options, value, onChange }: { options: string[]; value: string; onChange: (value: string) => void }) { return <div className="choices">{options.map((item) => <button key={item} className={value === item ? 'active' : ''} onClick={() => onChange(item)}>{item}</button>)}</div>; }

function ViewSwitch({ value, onChange }: { value: ViewMode; onChange: (value: ViewMode) => void }) {
  return <div className="view-switch" role="group" aria-label="Gallery view"><button className={value === 'walk' ? 'active' : ''} onClick={() => onChange('walk')} aria-pressed={value === 'walk'}><span>⌖</span> Walk</button><button className={value === 'overview' ? 'active' : ''} onClick={() => onChange('overview')} aria-pressed={value === 'overview'}><span>◫</span> Overview</button></div>;
}

function ArtworkInfoCard({ artwork, onClose }: { artwork: ArtworkFocus; onClose: () => void }) {
  return <aside className="artwork-info" aria-live="polite">{artwork.image && <img src={artwork.image} alt=""/>}<div><p className="eyebrow">Selected artwork</p><button onClick={onClose} aria-label="Close artwork information">×</button><h2>{artwork.title}</h2><span>{artwork.artist}{artwork.year ? ` · ${artwork.year}` : ''}</span><p>{artwork.description || 'Presented as part of this virtual exhibition.'}</p></div></aside>;
}

function Demo() {
  const [viewMode, setViewMode] = useState<ViewMode>('walk');
  const [artworkFocus, setArtworkFocus] = useState<ArtworkFocus | null>(null);
  const changeView = (value: ViewMode) => { setArtworkFocus(null); setViewMode(value); };
  return <main className="viewer"><header className="viewer-header"><Logo/><div><p>Danny Hirsch Arts</p><span>Threshold · 2026</span></div><button onClick={() => navigate('/create')}>Create your own ↗</button></header><DannyDemoScene viewMode={viewMode} playIntro onArtworkFocus={setArtworkFocus}/><ViewSwitch value={viewMode} onChange={changeView}/>{artworkFocus && <ArtworkInfoCard artwork={artworkFocus} onClose={() => setArtworkFocus(null)}/>}<div className="viewer-caption"><p className="eyebrow">Public demo gallery</p><h1>Threshold</h1><p>Material, movement, and atmosphere by Danny Hirsch.</p></div><div className="movement-hint">{viewMode === 'walk' ? 'WASD to walk · ↑↓ move · ←→ turn · Click floor to move' : 'Drag to orbit · Scroll to zoom'}</div></main>;
}

function PublishedGallery({ id }: { id: string }) {
  const [gallery, setGallery] = useState<GalleryRecord | null | undefined>();
  const [viewMode, setViewMode] = useState<ViewMode>('walk');
  const [artworkFocus, setArtworkFocus] = useState<ArtworkFocus | null>(null);
  useEffect(() => { galleryRepository.find(id).then(setGallery); }, [id]);
  if (gallery === undefined) return <div className="loading">Loading space…</div>;
  if (!gallery) return <main className="not-found"><Logo/><h1>This gallery isn't available.</h1><p>The exhibition may have reached the end of its ten-day run.</p><button className="button button--light" onClick={() => navigate('/create')}>Create a gallery</button></main>;
  const changeView = (value: ViewMode) => { setArtworkFocus(null); setViewMode(value); };
  return <main className="viewer"><header className="viewer-header"><Logo/><div><p>{gallery.title}</p><span>{gallery.artist}</span></div><button onClick={() => navigate('/create')}>Create your own ↗</button></header><GalleryScene draft={gallery} visitor viewMode={viewMode} playIntro onArtworkFocus={setArtworkFocus}/><ViewSwitch value={viewMode} onChange={changeView}/>{artworkFocus && <ArtworkInfoCard artwork={artworkFocus} onClose={() => setArtworkFocus(null)}/>}<div className="viewer-caption"><p className="eyebrow">Virtual exhibition</p><h1>{gallery.title}</h1><p>by {gallery.artist}</p></div><div className="movement-hint">{viewMode === 'walk' ? 'WASD to walk · ↑↓ move · ←→ turn · Click floor to move' : 'Drag to orbit · Scroll to zoom'}</div></main>;
}

export default function App() {
  const [route, setRoute] = useState(routeFromHash); const [template, setTemplate] = useState<TemplateId>();
  useEffect(() => { const handler = () => { setRoute(routeFromHash()); setTemplate(undefined); }; addEventListener('hashchange', handler); return () => removeEventListener('hashchange', handler); }, []);
  return useMemo(() => { if (route.page === 'create') return template ? <Studio initialTemplate={template}/> : <TemplatePicker onChoose={setTemplate}/>; if (route.page === 'demo') return <Demo/>; if (route.page === 'gallery' && route.id) return <PublishedGallery id={route.id}/>; return <Landing/>; }, [route, template]);
}
