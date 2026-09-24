import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useReducedMotion } from '../showcase/useReducedMotion';
import { WORLD_STORY_DURATION, worldFrame } from './threeWorldStoryModel';
import './threeWorldStory.css';

const FILM = '/assets/films/lieuva-three-worlds-20s.mp4';
const MOBILE_FILM = '/assets/films/lieuva-three-worlds-20s-720.mp4';
const POSTER = '/assets/films/lieuva-three-worlds-poster.webp?v=3';
const timestamp = (seconds: number) => `0:${String(Math.floor(seconds)).padStart(2, '0')}`;

/** A user-started film. Interactive worlds load only after an Explore link. */
export default function ThreeWorldStory() {
  const reduced = useReducedMotion();
  const host = useRef<HTMLElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const pendingSeek = useRef<number | null>(null);
  const playRequest = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [hasFrame, setHasFrame] = useState(false);
  const [muted, setMuted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
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
    const changed = () => setFullscreen(document.fullscreenElement === frame.current);
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);

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
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement === frame.current) await document.exitFullscreen();
      else await frame.current?.requestFullscreen();
    } catch {
      setError('Full screen is unavailable in this browser.');
    }
  };
  const playLabel = playing ? 'Pause film' : finished ? 'Replay film' : started ? 'Resume film' : `Play film with sound · ${WORLD_STORY_DURATION} sec`;
  const status = error || (reduced ? 'Still view · Explore the worlds below' : loading ? 'Loading film…' : '');

  return <section id="three-worlds" ref={host} className="world-story" aria-label="Three worlds cinematic story" data-playing={playing} data-motion={reduced ? 'reduced' : 'full'} data-chapter={index}>
    <div className="world-story__stage" ref={frame} data-started={showFrame}>
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
      <div className="world-story__shade" aria-hidden="true" />
      <div className="world-story__topline">
        <div className="world-story__chapter-name"><span>{chapter.label}</span><small>0{index + 1} / 03</small></div>
        {!reduced && <button type="button" className="world-story__fullscreen" onClick={() => { void toggleFullscreen(); }} aria-label={fullscreen ? 'Exit film full screen' : 'Enter film full screen'} title={fullscreen ? 'Exit full screen' : 'Full screen'}><svg viewBox="0 0 24 24" aria-hidden="true"><path d={fullscreen ? 'M4 10h6V4m4 0v6h6m0 4h-6v6m-4 0v-6H4' : 'M9 4H4v5m11-5h5v5m0 6v5h-5m-6 0H4v-5'} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></button>}
      </div>
      {!reduced && !playing && <button type="button" className="world-story__hero-play" data-film-play aria-pressed={false} aria-label={playLabel} onClick={() => { void play(); }} disabled={loading}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" fill="currentColor" /></svg></button>}
      {!reduced ? <div className="world-story__controls">
        <button type="button" className="world-story__transport" onClick={() => { void play(); }} aria-label={playing ? 'Pause film' : finished ? 'Replay from controls' : 'Play from controls'}><svg viewBox="0 0 24 24" aria-hidden="true"><path d={playing ? 'M6 4h4v16H6zm8 0h4v16h-4z' : 'M6 3.5v17l14-8.5z'} fill="currentColor" /></svg></button>
        <span className="world-story__time" aria-hidden="true">{timestamp(time)} / {timestamp(WORLD_STORY_DURATION)}</span>
        <label className="world-story__scrub"><span className="world-story__visually-hidden">Film position</span><input type="range" min={0} max={WORLD_STORY_DURATION} step={0.1} value={time} onChange={event => seek(Number(event.target.value))} aria-label="Film position" aria-valuetext={`${timestamp(time)} of ${timestamp(WORLD_STORY_DURATION)}`} style={{ '--film-progress': `${time / WORLD_STORY_DURATION * 100}%` } as CSSProperties} /></label>
        <button type="button" className="world-story__sound" onClick={toggleSound} aria-label={muted ? 'Unmute film' : 'Mute film'}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" /><path d={muted ? 'M17 9l5 6m0-6l-5 6' : 'M17 8c2 2 2 6 0 8m3-11c4 4 4 10 0 14'} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></button>
      </div> : null}
      <span className="world-story__status" role="status">{status}</span>
    </div>
    <p id="world-film-description" className="world-story__visually-hidden">A twenty-second film of art, sculpture and architecture with an original instrumental soundtrack. Explore each world below the player.</p>
  </section>;
}
