import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../showcase/useReducedMotion';
import { WORLD_CHAPTERS, WORLD_STORY_DURATION, worldFrame } from './threeWorldStoryModel';
import './threeWorldStory.css';

const FILM = '/assets/films/lieuva-three-worlds-20s.mp4';
const MOBILE_FILM = '/assets/films/lieuva-three-worlds-20s-720.mp4';
const POSTER = '/assets/films/lieuva-three-worlds-poster.webp?v=3';
const timestamp = (seconds: number) => `0:${String(Math.floor(seconds)).padStart(2, '0')}`;

/** A user-started film. Interactive worlds load only after an Explore link. */
export default function ThreeWorldStory() {
  const reduced = useReducedMotion();
  const host = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const pendingSeek = useRef<number | null>(null);
  const playRequest = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [hasFrame, setHasFrame] = useState(false);
  const [muted, setMuted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [time, setTime] = useState(0);
  const { chapter, index } = worldFrame(time / WORLD_STORY_DURATION);
  const finished = time >= WORLD_STORY_DURATION - 0.05;
  const showFrame = hasFrame && !reduced && !error && (playing || time > 0.2);

  const pause = useCallback(() => {
    playRequest.current += 1;
    video.current?.pause();
    setPlaying(false);
    setLoading(false);
  }, []);

  // No scroll coupling: leaving the film or hiding the tab silences playback.
  useEffect(() => {
    const section = host.current;
    if (!section) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || entry.intersectionRatio < 0.15) pause();
    }, { threshold: [0, 0.15] });
    observer.observe(section);
    const hidden = () => { if (document.hidden) pause(); };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('blur', pause);
    const media = video.current;
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('blur', pause);
      playRequest.current += 1;
      media?.pause();
    };
  }, [pause]);

  useEffect(() => {
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => {
      if (!motion.matches) return;
      pause();
      const media = video.current;
      if (media) {
        media.removeAttribute('src');
        media.load();
      }
      setHasFrame(false);
      setStarted(false);
    };
    motion.addEventListener('change', changed);
    return () => motion.removeEventListener('change', changed);
  }, [pause]);

  const play = async () => {
    const media = video.current;
    if (!media || reduced) return;
    if (!media.paused) { pause(); return; }
    const request = ++playRequest.current;
    setError('');
    setLoading(true);
    setStarted(true);
    pendingSeek.current = finished ? 0 : time;
    // Setting src within the click keeps both download and sound opt-in.
    if (!media.getAttribute('src')) {
      media.src = matchMedia('(max-width: 767px)').matches ? MOBILE_FILM : FILM;
      media.load();
    } else if (media.readyState >= HTMLMediaElement.HAVE_METADATA) {
      media.currentTime = pendingSeek.current;
      pendingSeek.current = null;
    }
    media.muted = muted;
    media.volume = 0.8;
    try {
      await media.play();
    } catch (reason) {
      if (request !== playRequest.current) return;
      setPlaying(false);
      setLoading(false);
      // A user pause or source teardown is not a playback failure.
      if (reason instanceof DOMException && reason.name === 'AbortError') return;
      setError('Playback could not start. Try Play again or explore a world below.');
    }
  };

  const seek = (seconds: number) => {
    pause();
    const next = Math.max(0, Math.min(WORLD_STORY_DURATION, seconds));
    setTime(next);
    pendingSeek.current = next;
    const media = video.current;
    if (!reduced && media?.getAttribute('src') && media.readyState >= HTMLMediaElement.HAVE_METADATA) {
      media.currentTime = next;
      pendingSeek.current = null;
    }
  };

  const syncTime = () => {
    const media = video.current;
    if (media?.getAttribute('src') && pendingSeek.current === null) {
      setTime(Math.min(WORLD_STORY_DURATION, media.currentTime));
    }
  };
  const toggleSound = () => {
    const next = !muted;
    if (video.current) video.current.muted = next;
    setMuted(next);
  };
  const playLabel = playing ? 'Pause film' : finished ? 'Replay film' : started ? 'Resume film' : `Play film with sound · ${WORLD_STORY_DURATION} sec`;
  const status = error || (reduced ? 'Still views · Reduced motion' : loading ? 'Loading film…' : 'Art. Sculpture. Architecture.');

  return <section id="three-worlds" ref={host} className="world-story" aria-label="Three worlds cinematic story" data-playing={playing} data-motion={reduced ? 'reduced' : 'full'} data-chapter={index}>
    <div className="world-story__stage" data-started={showFrame}>
      <img className="world-story__poster" src={time > 0 || reduced ? chapter.cover : POSTER} alt={`${time > 0 || reduced ? chapter.name : 'Art spaces'} in LIEUVA`} loading="lazy" />
      <video
        ref={video}
        className={`world-story__video${showFrame ? ' is-ready' : ''}`}
        preload="none"
        playsInline
        aria-label="LIEUVA: art, sculpture and architecture"
        aria-describedby="world-film-description"
        onLoadedMetadata={() => {
          if (video.current && pendingSeek.current !== null) {
            video.current.currentTime = pendingSeek.current;
            pendingSeek.current = null;
          }
        }}
        onLoadedData={() => setHasFrame(true)}
        onPlay={() => setPlaying(true)}
        onPlaying={() => { setLoading(false); setHasFrame(true); }}
        onPause={() => { setPlaying(false); setLoading(false); }}
        onWaiting={() => { if (video.current && !video.current.paused) setLoading(true); }}
        onTimeUpdate={syncTime}
        onEnded={() => { pause(); setTime(WORLD_STORY_DURATION); }}
        onError={() => {
          if (!video.current?.getAttribute('src')) return;
          pause();
          setHasFrame(false);
          setError('The film is unavailable. You can still explore every world below.');
          video.current.removeAttribute('src');
        }}
      />
      <div className="world-story__shade" />
      <div className={`world-story__caption${showFrame ? ' is-hidden' : ''}`}>
        <span>THREE WORLDS / ONE POSSIBILITY</span>
        <h3>{time > 0 || reduced ? chapter.heading : 'Step into another world.'}</h3>
        <p>{time > 0 || reduced ? chapter.copy : 'Art spaces. Sculptural worlds. A house in the forest.'}</p>
      </div>
      {started && !reduced && <span className="world-story__now">0{index + 1} / {chapter.label}</span>}
    </div>
    <div className="world-story__controls">
      <div className="world-story__actions">
        {!reduced && <button type="button" data-film-play onClick={() => { void play(); }} aria-pressed={playing}>{playLabel}<span aria-hidden="true">{playing ? 'Ⅱ' : '↗'}</span></button>}
        {!reduced && started && <button type="button" className="world-story__sound" onClick={toggleSound} aria-label={muted ? 'Unmute film' : 'Mute film'}>{muted ? 'Sound off' : 'Sound on'}<span aria-hidden="true">{muted ? '○' : '◉'}</span></button>}
        <span className="world-story__status" role="status">{status}</span>
        {!reduced && <span className="world-story__time" aria-hidden="true">{timestamp(time)} / {timestamp(WORLD_STORY_DURATION)}</span>}
      </div>
      {!reduced && <label className="world-story__scrub">Film position<input type="range" min={0} max={WORLD_STORY_DURATION} step={0.1} value={time} onChange={event => seek(Number(event.target.value))} aria-label="Film position" aria-valuetext={`${timestamp(time)} of ${timestamp(WORLD_STORY_DURATION)}`} /></label>}
      <nav className="world-story__chapters" aria-label="Film chapters">
        {WORLD_CHAPTERS.map((world, i) => <div className="world-story__chapter" key={world.id} data-current={index === i}>
          <button type="button" aria-current={index === i ? 'step' : undefined} onClick={() => seek(world.start)}><small>0{i + 1}</small>{world.label}</button>
          <a href={`#/showcase/${world.id}`} aria-label={`Explore ${world.name}`}>{i === 0 ? 'Explore Obsidian' : 'Explore'} <span aria-hidden="true">↗</span></a>
        </div>)}
      </nav>
      <p id="world-film-description" className="world-story__description">Art previews include Studio rooms. Explore the three bespoke worlds below. Original instrumental soundtrack.</p>
    </div>
  </section>;
}
