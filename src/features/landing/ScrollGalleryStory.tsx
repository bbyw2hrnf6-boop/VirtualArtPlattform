import { StoryPosterImage } from "./StoryPoster";
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { GalleryScene, type GalleryPresentation, type ArtworkFocusInfo } from '../gallery/GalleryScene';
import { STORY_DRAFT } from './storyDraft';
import { storyPresentation, storyScrollProgress, advanceStoryProgress, filmProgress, storyFinishes, STORY_FINISHES, STORY_CHAPTERS, STORY_DURATION_MS } from './scrollStoryModel';
import { saveGalleryDraft } from '../../services/draftStorage';
import { stageStudioHandoff } from '../../services/studioHandoff';
import './scrollGalleryStory.css';

/** Scroll directs the real Studio renderer. No parallel room or Walk controller. */
export function ScrollGalleryStory() {
  const sectionRef = useRef<HTMLElement>(null);
  const chapters = useRef<Array<HTMLElement | null>>([]);
  const seek = useRef<((progress: number) => void) | null>(null);
  const presentation = useRef<GalleryPresentation>(storyPresentation(0));
  const [arrival, setArrival] = useState<'loading' | 'ready' | 'error'>('loading');
  const playing = useRef(false);
  const [isPlaying, setPlaying] = useState(false);
  const [draft, setDraft] = useState(STORY_DRAFT);
  const manualStage = useRef<number | null>(null);
  const demonstratedStage = useRef(-1);
  const playStart = useRef(0);
  const [finishesReady, setFinishesReady] = useState(false);
  useEffect(() => {
    let active = true;
    // Decode the six demonstration images before enabling timed playback.
    void Promise.all(Object.values(STORY_FINISHES).flat().map(([, , asset]) => {
      const image = new Image(); image.src = `./assets/materials/${asset}`;
      return image.decode().catch(() => undefined);
    })).then(() => { if (active) setFinishesReady(true); });
    return () => { active = false; };
  }, []);
  const [shot, setShot] = useState(0);
  const [surface, setSurface] = useState<'floor' | 'wall'>('floor');
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState('');
  const openStudio = async () => {
    setOpening(true); setOpenError('');
    try {
      const projectId = `story-${crypto.randomUUID()}`;
      await saveGalleryDraft(projectId, draft, 1);
      stageStudioHandoff(projectId);
      location.hash = `/create/white-cube/${projectId}`;
    } catch { setOpenError('Your browser could not save this study. Try again or choose a fresh Space.'); }
    finally { setOpening(false); }
  };
  const explore = useRef(false);
  const [exploring, setExploring] = useState(false);
  const [focus, setFocus] = useState<ArtworkFocusInfo | null>(null);
  const stopFilm = () => { playing.current = false; setPlaying(false); };
  const goTo = (progress: number) => {
    stopFilm(); explore.current = false; setExploring(false);
    const section = sectionRef.current;
    if (section) {
      window.scrollTo({ top: scrollY + section.getBoundingClientRect().top + (progress > 1 ? section.offsetHeight : progress * (section.offsetHeight - innerHeight)), behavior: 'instant' });
      // An explicit chapter selection is immediate; it must not wait for WebGL.
      seek.current?.(progress);
    }
  };
  useEffect(() => {
    const stop = (event: Event) => {
      // A pause tap/Space activation must reach the button with its current state.
      if (event.target instanceof Element && event.target.closest('.sgs__play') &&
        (event.type === 'touchstart' || (event instanceof KeyboardEvent && [' ', 'Enter'].includes(event.key)))) return;
      playing.current = false; setPlaying(false);
    };
    window.addEventListener('wheel', stop, { passive: true });
    window.addEventListener('touchstart', stop, { passive: true });
    window.addEventListener('keydown', stop);
    return () => { window.removeEventListener('wheel', stop); window.removeEventListener('touchstart', stop); window.removeEventListener('keydown', stop); };
  }, []);
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0, progress = 0, last = performance.now(), visible = true;
    const publish = () => {
      presentation.current = storyPresentation(progress, innerWidth < 700, motion.matches);
      presentation.current.playing = playing;
      presentation.current.interactive = explore.current && !motion.matches && progress >= .95;
      const nextShot = motion.matches ? 23 : Math.min(23, Math.floor(progress * 24));
      setShot(nextShot);
      const finishes = storyFinishes(motion.matches ? 1 : progress);
      if (manualStage.current !== finishes.stage && demonstratedStage.current !== finishes.stage) {
        manualStage.current = null;
        demonstratedStage.current = finishes.stage;
        // Commit each demonstrated finish before the next WebGL frame. A deferred
        // React update can otherwise be coalesced past Oak on a busy software GPU.
        flushSync(() => {
          setSurface(finishes.group);
          setDraft(current => ({ ...current, floor: finishes.floor, wall: finishes.wall }));
        });
      }
      const chapter = motion.matches ? 0 : Math.min(3, Math.floor(progress * 4));
      section.dataset.chapter = String(chapter);
      section.dataset.interactive = String(presentation.current.interactive);
      section.dataset.motion = motion.matches ? 'reduced' : 'full';
      section.style.setProperty('--story-progress', String(progress));
      chapters.current.forEach((item, index) => { if (item) item.hidden = index !== chapter; });
    };
    seek.current = (target) => {
      progress = motion.matches ? 0 : Math.max(0, Math.min(1, target));
      last = performance.now();
      publish();
    };
    const update = (now: number) => {
      frame = 0;
      if (!visible || document.hidden) { playing.current = false; setPlaying(false); return; }
      const rect = section.getBoundingClientRect();
      let target = storyScrollProgress(-rect.top, 0, section.offsetHeight - innerHeight, motion.matches);
      if (playing.current && !motion.matches) {
        // Use a monotonic deadline, independent of stale RAF timestamps or scroll
        // observer callbacks. Material stops survive a temporarily blocked GPU.
        target = filmProgress(progress, (performance.now() - playStart.current) / STORY_DURATION_MS);
        window.scrollTo({ top: scrollY + rect.top + target * (section.offsetHeight - innerHeight), behavior: 'instant' });
      }
      progress = motion.matches ? 0 : playing.current ? target : advanceStoryProgress(progress, target, now - last);
      if (playing.current && target === 1) { playing.current = false; setPlaying(false); }
      last = now;
      publish();
      frame = requestAnimationFrame(update);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !frame) { last = performance.now(); frame = requestAnimationFrame(update); }
    });
    const resume = () => { last = performance.now(); if (!frame) frame = requestAnimationFrame(update); };
    observer.observe(section);
    document.addEventListener('visibilitychange', resume);
    motion.addEventListener('change', resume);
    frame = requestAnimationFrame(update);
    return () => {
      seek.current = null;
      cancelAnimationFrame(frame); observer.disconnect();
      document.removeEventListener('visibilitychange', resume); motion.removeEventListener('change', resume);
    };
  }, []);
  return (
    <section className="sgs" data-arrival={arrival} data-shot={shot + 1} ref={sectionRef} aria-label="From your collection to your own Space">
      <div className="sgs__sticky">
        <div className="sgs__room"><GalleryScene draft={draft} visitor presentation={presentation} onArrivalChange={setArrival} onArtworkFocus={setFocus} /></div>
        <StoryPosterImage className="sgs__poster" />
        <div className="sgs__masthead"><p>Immersive 3D presentation platform</p><button className="sgs__play" disabled={arrival !== 'ready' || !finishesReady} aria-pressed={isPlaying} onClick={() => {
          if (isPlaying) stopFilm(); else { if (Number(sectionRef.current?.style.getPropertyValue('--story-progress')) > .97) goTo(0); manualStage.current = null; demonstratedStage.current = -2; playStart.current = performance.now() - presentation.current.progress * STORY_DURATION_MS; explore.current = false; setExploring(false); playing.current = true; setPlaying(true); }
        }}>{isPlaying ? 'Pause film' : 'Play the film · 20 sec'} <span aria-hidden="true">{isPlaying ? 'Ⅱ' : '▷'}</span></button></div>
        {shot >= 6 && shot < 9 && <aside className="sgs__demo" aria-label="Illustrated Studio steps">
          <small>In the Studio</small><strong>{['Upload artwork', 'Choose a wall', 'Frame & scale'][shot - 6]}</strong>
          <div>{STORY_DRAFT.artworks.map((art, index) => <img key={art.id} src={art.src} alt={art.title} className={index === shot - 6 ? 'is-selected' : ''} />)}</div>
          <span>{['Three works. One collection.', 'Back wall · eye level 1.75 m', 'Thin black frame · no mat'][shot - 6]}</span>
        </aside>}
        <div className="sgs__chapters" aria-live="off">
          {STORY_CHAPTERS.map((chapter, index) => <article key={chapter.title} hidden={index !== 0} ref={(element) => { chapters.current[index] = element; }}>
            <p className="sgs__eyebrow">0{index + 1} / 04 <span>{chapter.label}</span></p>{index === 0 ? <h1>{chapter.title}</h1> : <h2>{chapter.title}</h2>}<p>{chapter.body}</p>
          </article>)}
        </div>
        <div className="sgs__finish" data-surface={surface} aria-label="Material demonstration">
          <span>{isPlaying ? 'Auto styling' : 'Scroll to style'} · {surface === 'floor' ? 'Floor' : 'Walls'}</span>
          <div className="sgs__finish-tabs">{(['floor','wall'] as const).map(kind => <button key={kind} aria-label={`Show ${kind} finishes`} aria-pressed={surface === kind} onClick={() => { stopFilm(); setSurface(kind); }}>{kind === 'floor' ? 'Floor' : 'Walls'}</button>)}</div>
          {(['floor', 'wall'] as const).map(kind => <div className="sgs__finish-options" key={kind} hidden={kind !== surface}>
            {STORY_FINISHES[kind].map(([finish, label, asset]) => <button key={finish}
              aria-label={`Preview ${finish.replace('-', ' ')} ${kind}`} aria-pressed={draft[kind] === finish}
              onClick={() => { stopFilm(); manualStage.current = storyFinishes(presentation.current.progress).stage; setDraft(current => ({ ...current, [kind]: finish })); }}>
              <i className="sgs__swatch" style={{backgroundImage:`url('./assets/materials/${asset}')`}} />{label}
            </button>)}
          </div>)}
        </div>
        <button className="sgs__look" aria-pressed={exploring} onClick={() => { stopFilm(); if (!exploring) goTo(.965); explore.current = !exploring; setExploring(!exploring); }}>{exploring ? "Back to story" : "Look around"}</button>
        {exploring && <p className="sgs__walk-hint">Tap floor to move · Drag to look</p>}
        <div className="sgs__footer"><nav className="sgs__navigation" aria-label="Space story chapters">{STORY_CHAPTERS.map((chapter, index) => <button key={chapter.label} aria-label={`Chapter ${index + 1}: ${chapter.label}`} onClick={() => goTo(index / 4 + .005)}>0{index + 1}</button>)}<button onClick={() => goTo(1.04)} aria-label="Continue below the story">Skip ↓</button></nav><button type="button" disabled={opening} onClick={() => void openStudio()}>{opening ? "Opening your Studio…" : "Open this Space in Studio"} <span>↗</span></button><small>Sample collection · The White Cube <a href="#/create">Choose a room ↗</a></small></div>
        {openError && <p className="sgs__open-error" role="alert">{openError}</p>}
        <div className="sgs__timeline" aria-hidden="true"><i /></div>
        {focus && <aside className="sgs__art-info"><button onClick={() => setFocus(null)} aria-label="Close artwork information">×</button><strong>{focus.title}</strong><p>{focus.description}</p></aside>}
      </div>
      <ol className="sgs__accessible-sequence">{STORY_CHAPTERS.map((chapter) => <li key={chapter.title}><strong>{chapter.title}</strong> {chapter.body}</li>)}</ol>
    </section>
  );
}
