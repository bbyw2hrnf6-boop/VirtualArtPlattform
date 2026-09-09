import { useEffect, useRef, useState } from 'react';
import { GalleryScene, type GalleryPresentation, type ArtworkFocusInfo } from '../gallery/GalleryScene';
import { STORY_DRAFT } from './storyDraft';
import { storyPresentation, storyScrollProgress, advanceStoryProgress, STORY_CHAPTERS } from './scrollStoryModel';
import { saveGalleryDraft } from '../../services/draftStorage';
import { stageStudioHandoff } from '../../services/studioHandoff';
import './scrollGalleryStory.css';

/** Scroll directs the real Studio renderer. No parallel room or Walk controller. */
export function ScrollGalleryStory() {
  const sectionRef = useRef<HTMLElement>(null);
  const chapters = useRef<Array<HTMLElement | null>>([]);
  const presentation = useRef<GalleryPresentation>(storyPresentation(0));
  const [draft, setDraft] = useState(STORY_DRAFT);
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
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0, progress = 0, last = performance.now(), visible = true;
    const update = (now: number) => {
      frame = 0;
      if (!visible || document.hidden) return;
      const rect = section.getBoundingClientRect();
      const target = storyScrollProgress(-rect.top, 0, section.offsetHeight - innerHeight, motion.matches);
      progress = motion.matches ? 0 : advanceStoryProgress(progress, target, now - last);
      last = now;
      presentation.current = storyPresentation(progress, innerWidth < 700, motion.matches);
      presentation.current.interactive = explore.current && !motion.matches && progress >= .75;
      const chapter = motion.matches ? 0 : Math.min(3, Math.floor(progress * 4));
      section.dataset.chapter = String(chapter);
      section.dataset.interactive = String(presentation.current.interactive);
      section.dataset.motion = motion.matches ? 'reduced' : 'full';
      section.style.setProperty('--story-progress', String(progress));
      chapters.current.forEach((item, index) => { if (item) item.hidden = index !== chapter; });
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
      cancelAnimationFrame(frame); observer.disconnect();
      document.removeEventListener('visibilitychange', resume); motion.removeEventListener('change', resume);
    };
  }, []);
  return (
    <section className="sgs" ref={sectionRef} aria-label="From your collection to your own Space">
      <div className="sgs__sticky">
        <div className="sgs__room"><GalleryScene draft={draft} visitor presentation={presentation} onArtworkFocus={setFocus} /></div>
        <div className="sgs__masthead"><p>Immersive 3D presentation platform</p><a href="#/create">Create a Space <span>↗</span></a></div>
        <div className="sgs__chapters" aria-live="off">
          {STORY_CHAPTERS.map((chapter, index) => <article key={chapter.title} hidden={index !== 0} ref={(element) => { chapters.current[index] = element; }}>
            <p className="sgs__eyebrow">0{index + 1} / 04 <span>{chapter.label}</span></p>{index === 0 ? <h1>{chapter.title}</h1> : <h2>{chapter.title}</h2>}<p>{chapter.body}</p>
          </article>)}
        </div>
        <div className="sgs__finish" aria-label="Try a floor finish"><span>Make it yours</span>
          {(['concrete', 'oak', 'black-marble'] as const).map((floor) => <button key={floor} aria-label={`Preview ${floor.replace('-', ' ')} floor`} aria-pressed={draft.floor === floor} onClick={() => setDraft((current) => ({ ...current, floor }))}>
            <i className={`sgs__swatch sgs__swatch--${floor}`} />{floor === 'concrete' ? 'Mineral' : floor === 'oak' ? 'Oak' : 'Marble'}
          </button>)}
        </div>
        <button className="sgs__look" aria-pressed={exploring} onClick={() => { explore.current = !exploring; setExploring(!exploring); }}>{exploring ? "Back to story" : "Look around"}</button>
        <div className="sgs__footer"><span className="sgs__scroll-hint">Scroll to make it yours <b>↓</b></span><button type="button" disabled={opening} onClick={() => void openStudio()}>{opening ? "Opening your Studio…" : "Open this Space in Studio"} <span>↗</span></button><small>Sample collection · The White Cube</small></div>
        {openError && <p className="sgs__open-error" role="alert">{openError}</p>}
        <div className="sgs__timeline" aria-hidden="true"><i /></div>
        {focus && <aside className="sgs__art-info"><button onClick={() => setFocus(null)} aria-label="Close artwork information">×</button><strong>{focus.title}</strong><p>{focus.description}</p></aside>}
      </div>
      <ol className="sgs__accessible-sequence">{STORY_CHAPTERS.map((chapter) => <li key={chapter.title}><strong>{chapter.title}</strong> {chapter.body}</li>)}</ol>
    </section>
  );
}
