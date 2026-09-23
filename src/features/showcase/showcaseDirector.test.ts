import { describe, expect, it, vi, afterEach } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { sampleFlight } from './cameraFlight';
import { ENTRY_FLIGHTS, HOUSE_FLIGHT, SHOWCASE_STOPS, WORLD_FLIGHTS } from './showcaseFlights';
import { createShowcaseDirector } from './showcaseDirector';
import { createObsidianNavigation, canStand } from './navigation';
import { createPavilionNavigation, pavilionCanStand } from './pavilionNavigation';
import { createForestNavigation } from './forestNavigation';
import { forestRooms } from './forestRooms';
import type { VisitorTourState } from '../gallery/visitorTourState';
import colliders from './forest-colliders.json';
import { worldFrame } from '../landing/threeWorldStoryModel';

afterEach(()=>vi.restoreAllMocks());

describe('cinematic rails',()=>{
  for(const [name,flight] of Object.entries({...Object.fromEntries(Object.entries(ENTRY_FLIGHTS).map(([k,v])=>[`entry-${k}`,v])),...WORLD_FLIGHTS})){
    it(`${name} has continuous velocity and a level, finite view throughout`,()=>{
      for(let n=0;n<=1000;n++){
        const p=sampleFlight(flight,n/1000);
        expect([...p.position.toArray(),...p.target.toArray(),p.fov].every(Number.isFinite)).toBe(true);
        expect(p.position.distanceTo(p.target)).toBeGreaterThan(.1);
      }
      for(const key of flight.keys.slice(1,-1)){
        const t=key.at/flight.duration,h=.00001;
        const center=sampleFlight(flight,t).position;
        const before=center.clone().sub(sampleFlight(flight,t-h).position).divideScalar(h*flight.duration);
        const after=sampleFlight(flight,t+h).position.sub(center).divideScalar(h*flight.duration);
        expect(before.distanceTo(after)).toBeLessThan(.05);
      }
      expect(sampleFlight(flight,0).position.toArray()).toEqual(flight.keys[0].position);
      expect(sampleFlight(flight,1).position.toArray()).toEqual(flight.keys.at(-1)!.position);
    });
  }
  it('keeps entry rails clear of gallery partitions, plinths and house colliders',()=>{
    for(let i=0;i<=1000;i++){
      const p=i/1000,a=sampleFlight(ENTRY_FLIGHTS.obsidian,p).position,b=sampleFlight(ENTRY_FLIGHTS['sculpture-pavilion'],p).position;
      expect(canStand(a.x,-a.z),`Obsidian ${p}`).toBe(true);
      expect(pavilionCanStand(b.x,-b.z),`Pavilion ${p}`).toBe(true);
      for(const f of [HOUSE_FLIGHT,WORLD_FLIGHTS['forest-fold-house']]){
        const c=sampleFlight(f,p).position;
        expect(colliders.obstacles.some(o=>c.y>o.level+.1&&c.y<o.level+2.35&&c.x>o.bounds[0]-.06&&c.x<o.bounds[2]+.06&&-c.z>o.bounds[1]-.06&&-c.z<o.bounds[3]+.06),`House ${p}`).toBe(false);
      }
    }
  },30_000);
  it('reverses through exact world boundaries, including the final frame',()=>{
    expect([0,12/48,26/48,1,25/48,11/48,0].map(p=>worldFrame(p).index)).toEqual([0,1,2,2,1,0,0]);
    expect(worldFrame(1).local).toBe(1);
    expect(worldFrame(-2).local).toBe(0);
  });
});

describe('guided showcase visits',()=>{
  it('connects every authored stop through the actual three navigation graphs',()=>{
    const all=[
      {nav:createObsidianNavigation(),start:[1.5,1.75,-1.5],stops:SHOWCASE_STOPS.obsidian},
      {nav:createPavilionNavigation(),start:[-7,1.75,-1.8],stops:SHOWCASE_STOPS['sculpture-pavilion']},
      {nav:createForestNavigation(),start:forestRooms[0].start,stops:[0,1,6,2,3,4,7,5].map(i=>({position:forestRooms[i].start,label:forestRooms[i].name}))},
    ];
    for(const {nav,start,stops} of all){
      let from=new Vector3().fromArray(start);
      for(const stop of stops){const to=new Vector3().fromArray(stop.position);expect(nav.findPath(from,to),stop.label).not.toBeNull();from=to;}
    }
  });
  function setup(reduced=false,flight=HOUSE_FLIGHT){
    let now=0;vi.spyOn(performance,'now').mockImplementation(()=>now);
    const camera=new PerspectiveCamera(55);camera.position.set(1.5,1.75,-1.5);camera.lookAt(6,1.8,-7.97);
    const states:VisitorTourState[]=[],release=vi.fn();
    const director=createShowcaseDirector({camera,navigation:createObsidianNavigation(),stops:SHOWCASE_STOPS.obsidian,flight,world:WORLD_FLIGHTS.obsidian,reduced:()=>reduced,acquire:()=>{},release,schedule:()=>{},onTour:s=>states.push(s)});
    return {camera,director,states,release,tick:(ms:number)=>{now+=ms;director.update(now);}};
  }
  it('pauses without clock drift, visits collision-safe positions and releases control',()=>{
    const x=setup();x.director.startTour();
    for(let i=0;i<100;i++){x.tick(40);expect(canStand(x.camera.position.x,-x.camera.position.z)).toBe(true);}
    x.director.pause();const p=x.camera.position.clone();x.tick(100_000);expect(x.camera.position.equals(p)).toBe(true);
    x.director.pause();x.tick(16);expect(x.camera.position.distanceTo(p)).toBeLessThan(.1);
    x.director.stop();expect(x.director.active()).toBe(false);expect(x.release).toHaveBeenCalled();
  });
  it('uses explicit still stops for reduced motion',()=>{
    const x=setup(true);x.director.startTour();expect(x.states.at(-1)?.status).toBe('paused');
    const p=x.camera.position.clone();x.tick(9000);expect(x.camera.position.equals(p)).toBe(true);
    x.director.stepTour(1);expect(x.camera.position.toArray()).toEqual(SHOWCASE_STOPS.obsidian[1].position);
    x.director.startFlight();expect(x.director.kind()).toBe('tour');
  });
  it('lands a completed gallery opening at a reachable final view and restores on skip',()=>{
    const x=setup(false,ENTRY_FLIGHTS.obsidian),start=x.camera.position.clone();
    x.director.startFlight();x.tick(8000);x.director.stop();
    expect(x.camera.position.equals(start)).toBe(true);
    x.director.startFlight();x.tick(26_000);
    expect(x.director.active()).toBe(false);
    expect(x.camera.position.toArray()).toEqual(ENTRY_FLIGHTS.obsidian.keys.at(-1)!.position);
    expect(canStand(x.camera.position.x,-x.camera.position.z)).toBe(true);
  });
  it('finishes a flight on time and restores the preflight walking camera',()=>{
    const x=setup(),before=x.camera.position.clone(),rotation=x.camera.quaternion.clone();
    x.director.startFlight();x.tick(5000);expect(x.camera.position.equals(before)).toBe(false);
    x.tick(HOUSE_FLIGHT.duration*1000-5000);expect(x.director.active()).toBe(false);expect(x.camera.position.equals(before)).toBe(true);
    expect(x.camera.quaternion.angleTo(rotation)).toBeLessThan(.0001);
  });
});
