import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { ObsidianControls } from '../showcase/ObsidianScene';
import { useReducedMotion } from '../showcase/useReducedMotion';
import { WORLD_CHAPTERS, WORLD_STORY_DURATION, worldFrame } from './threeWorldStoryModel';
import './threeWorldStory.css';
import { portalPreview, WORLD_PORTALS } from '../showcase/worldPortals';

const Scenes=[lazy(()=>import('../showcase/ObsidianScene')),lazy(()=>import('../showcase/SculptureScene')),lazy(()=>import('../showcase/ForestScene'))];
const noop=()=>{};

/** One lazy 3D world at a time. Scroll and Play sample the same reversible rail.
 * Loading freezes the film clock; no skipped chapter on a slower connection. */
export default function ThreeWorldStory() {
  const reduced=useReducedMotion();
  const [active,setActive]=useState(false),[index,setIndex]=useState(0),[ready,setReady]=useState(false),[error,setError]=useState(false),[playing,setPlaying]=useState(false),[progress,setProgress]=useState(0);
  const host=useRef<HTMLElement>(null), controls=useRef<ObsidianControls|null>(null);
  const progressRef=useRef(0), indexRef=useRef(0), readyRef=useRef(false), playingRef=useRef(false);
  const requested=useRef<number|null>(null);
  const [incomingPortal,setIncomingPortal]=useState<string>();

  const onReady=useCallback(()=>{readyRef.current=true;setReady(true);setProgress(progressRef.current);controls.current?.seekFilm(worldFrame(progressRef.current).local);},[]);
  const onError=useCallback(()=>{readyRef.current=false;playingRef.current=false;setReady(false);setPlaying(false);setError(true);},[]);
  const stop=useCallback(()=>{playingRef.current=false;setPlaying(false);},[]);

  useEffect(()=>{
    const section=host.current;if(!section||!active)return;
    let raf=0,last=performance.now(),lastUi=0,visible=true,dirty=true;
    const publish=(value:number,force=false)=>{
      let p=Math.max(0,Math.min(1,value)),frame=worldFrame(p);
      if(playingRef.current&&frame.index>indexRef.current){p=frame.chapter.start/WORLD_STORY_DURATION;frame=worldFrame(p);}
      progressRef.current=p;
      section.style.setProperty('--world-progress',String(p));
      section.style.setProperty('--world-portal',String(frame.portal));
      section.dataset.chapter=String(frame.index);section.dataset.progress=p.toFixed(4);
      if(frame.index!==indexRef.current){
        setIncomingPortal(frame.index>indexRef.current?frame.chapter.id:undefined);
        indexRef.current=frame.index;readyRef.current=false;setReady(false);setError(false);setIndex(frame.index);
        force=true;
      }else if(readyRef.current&&!reduced)controls.current?.seekFilm(frame.local);
      if(force||performance.now()-lastUi>100||p===1){lastUi=performance.now();setProgress(p);}
    };
    const scrollToProgress=(p:number)=>{
      const top=scrollY+section.getBoundingClientRect().top;
      window.scrollTo({top:top+p*Math.max(1,section.offsetHeight-innerHeight),behavior:'instant'});
    };
    const tick=(now:number)=>{
      raf=0;
      if(!visible||document.hidden){last=now;return;}
      if(reduced&&playingRef.current)stop();
      const dt=Math.min(.1,Math.max(0,(now-last)/1000));last=now;
      if(requested.current!==null){const p=requested.current;requested.current=null;publish(p,true);if(!reduced)scrollToProgress(p);dirty=false;}
      else if(playingRef.current&&!reduced){
        if(readyRef.current){const p=Math.min(1,progressRef.current+dt/WORLD_STORY_DURATION);publish(p);scrollToProgress(p);if(p===1)stop();}
      }else if(dirty&&!reduced){
        const distance=Math.max(1,section.offsetHeight-innerHeight),offset=-section.getBoundingClientRect().top;
        publish(offset>=distance-1?1:offset<=1?0:offset/distance);dirty=false;
      }
      if(playingRef.current)raf=requestAnimationFrame(tick);
    };
    const schedule=()=>{if(!raf&&visible&&!document.hidden){last=performance.now();raf=requestAnimationFrame(tick);}};
    const scroll=()=>{if(!playingRef.current)dirty=true;schedule();};
    const interrupt=(event:Event)=>{
      if(event instanceof KeyboardEvent&&!['Escape','ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(event.key))return;
      if(event.target instanceof Element&&event.target.closest('.world-story__controls')&&event.type!=='wheel')return;
      stop();
    };
    const visibility=()=>{if(document.hidden)stop();else schedule();};
    const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(!visible)stop();else schedule();});observer.observe(section);
    window.addEventListener('scroll',scroll,{passive:true});window.addEventListener('resize',scroll);
    window.addEventListener('wheel',interrupt,{passive:true});window.addEventListener('touchstart',interrupt,{passive:true});window.addEventListener('keydown',interrupt);
    document.addEventListener('visibilitychange',visibility);
    window.addEventListener('blur',stop);
    // A user action can wake the RAF without registering a second clock.
    section.addEventListener('world-seek',schedule);schedule();
    return()=>{cancelAnimationFrame(raf);observer.disconnect();window.removeEventListener('scroll',scroll);window.removeEventListener('resize',scroll);window.removeEventListener('wheel',interrupt);window.removeEventListener('touchstart',interrupt);window.removeEventListener('keydown',interrupt);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('blur',stop);section.removeEventListener('world-seek',schedule);};
  },[active,reduced,stop]);

  const wake=()=>host.current?.dispatchEvent(new Event('world-seek'));
  const seek=(p:number)=>{stop();requested.current=p;if(!active)setActive(true);wake();};
  const play=()=>{
    if(playingRef.current){stop();return;}
    if(!active)host.current?.scrollIntoView({behavior:'instant'});
    if(!active||progressRef.current>=.999){requested.current=0;setActive(true);}
    playingRef.current=true;setPlaying(true);wake();
  };
  const exit=()=>{stop();setActive(false);readyRef.current=false;setReady(false);setError(false);setIncomingPortal(undefined);indexRef.current=0;progressRef.current=0;setIndex(0);setProgress(0);host.current?.scrollIntoView({behavior:'instant'});};
  const Scene=Scenes[index],chapter=WORLD_CHAPTERS[index],next=WORLD_PORTALS[chapter.id]?.next;
  const preview=(id:string,className:string)=><picture><source media="(max-width:767px)" srcSet={portalPreview(id,true)}/><img className={className} src={portalPreview(id,false)} alt="" aria-hidden="true"/></picture>;
  return <section id="three-worlds" ref={host} className={`world-story${active&&!reduced?' is-active':''}`} aria-label="Three worlds cinematic story" data-playing={playing} data-motion={reduced?'reduced':'full'}>
    <div className="world-story__stage">
      <img className="world-story__poster" src={chapter.cover} alt={`${chapter.name} — an authored LIEUVA world`} loading="lazy"/>
      {active&&!reduced&&!error&&<div className={`world-story__scene${ready?' is-ready':''}`}><Suspense fallback={null}><Scene key={index} controlsRef={controls} onReady={onReady} onError={onError} onRoom={noop} onArtwork={noop} onMode={noop} cinematic/></Suspense></div>}
      {active&&!reduced&&next&&preview(next,"world-story__portal")}
      {active&&!reduced&&incomingPortal&&preview(incomingPortal,`world-story__arrival${ready?' is-ready':''}`)}
      <div className="world-story__shade"/>
      <div className="world-story__caption">
        <span>THREE WORLDS / ONE POSSIBILITY</span>
        <h3>{active?chapter.heading:'Step beyond the familiar.'}</h3>
        <p>{active?chapter.copy:'Through a painting, beyond sculpture, into a home. Three worlds. One journey.'}</p>
        {active&&<a href={`#/showcase/${chapter.id}`}>Explore {chapter.name} ↗</a>}
        {active&&index===2&&<p className="world-story__boundary">Bespoke showcases. Separate from the three editable Studio templates.</p>}
      </div>
      <div className="world-story__controls">
        <div className="world-story__actions">
          {!reduced&&<button onClick={play} aria-pressed={playing}>{playing?'Pause journey':active?'Play journey':'Watch the journey · 48 sec'} <span aria-hidden="true">{playing?'Ⅱ':'↗'}</span></button>}
          {!active&&<button onClick={()=>{requested.current=0;setActive(true);}}> {reduced?'Explore still views':'Explore by scrolling'} ↓</button>}
          {active&&<button onClick={exit}>Close journey ×</button>}
          <span role="status">{error?'3D unavailable. Try another chapter.':active&&!ready&&!reduced?`Entering ${chapter.name}…`:reduced?'Still views · Reduced motion':active?'Scroll to direct the camera.':'Art → Sculpture → Architecture'}</span>
        </div>
        {active&&<>
          <label className="world-story__scrub">Journey position<input type="range" min={0} max={1000} value={Math.round(progress*1000)} onChange={e=>seek(Number(e.target.value)/1000)} aria-label="Journey position"/></label>
          <nav aria-label="Journey chapters">{WORLD_CHAPTERS.map((c,i)=><button key={c.id} aria-current={i===index?'step':undefined} onClick={()=>seek((c.start+.01)/WORLD_STORY_DURATION)}><small>0{i+1}</small>{c.name}</button>)}</nav>
        </>}
      </div>
    </div>
  </section>;
}
