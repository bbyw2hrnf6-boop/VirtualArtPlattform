import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import type { VisitorTourState } from '../gallery/visitorTourState';
import { IDLE_VISITOR_TOUR } from '../gallery/visitorTourState';
import { applyFlight, smooth, type CameraFlight } from './cameraFlight';
import type { TourStop } from './showcaseFlights';

type Navigation = { findPath: (from: Vector3, to: Vector3) => Vector3[] | null };
type Options = {
  camera: PerspectiveCamera; navigation: Navigation; stops: TourStop[];
  flight: CameraFlight; world: CameraFlight; reduced: () => boolean;
  acquire: () => void; release: () => void; schedule: () => void;
  onTour?: (state: VisitorTourState) => void; onFlight?: (state: VisitorTourState) => void;
};

/** One owner for the camera. Tour routes are solved through the walking graph;
 * authored film rails follow openings; explicit world portals cross surfaces. */
export function createShowcaseDirector(o: Options) {
  let kind: 'tour' | 'flight' | 'world' | null = null, paused = false;
  let elapsed = 0, last = 0, stop = 0, duration = 0, lastPublish = -Infinity;
  let route: Vector3[] = [], distances: number[] = [], routeLength = 0;
  let saved: { position: Vector3; target: Vector3; fov: number } | null = null;
  const initialLook = new Vector3(), direction = new Vector3(), ahead = new Vector3();
  const aim = o.camera.clone();
  const publish = (now = 0, force = false) => {
    if (!force && now - lastPublish < 120) return;
    lastPublish = now;
    const state: VisitorTourState = {
      status: paused ? 'paused' : 'playing',
      progress: kind === 'tour' ? (stop + Math.min(1, elapsed / duration)) / o.stops.length : Math.min(1, elapsed / o.flight.duration),
      currentLabel: kind === 'tour' ? o.stops[stop].label : o.flight.keys[Math.min(o.flight.keys.length-1,stop)].label,
      currentStop: stop + 1, stopCount: kind === 'tour' ? o.stops.length : o.flight.keys.length - 1,
    };
    if (kind === 'tour') o.onTour?.(state);
    if (kind === 'flight') o.onFlight?.(state);
  };
  const finish = (completed = false) => {
    const previous = kind;
    kind = null; paused = false;
    if (previous === 'flight' && saved && !(completed && o.flight.landAtEnd && o.navigation.findPath(saved.position,o.camera.position))) {
      o.camera.position.copy(saved.position); o.camera.lookAt(saved.target);
      o.camera.fov = saved.fov; o.camera.updateProjectionMatrix();
    }
    saved = null;
    o.onTour?.({ ...IDLE_VISITOR_TOUR, progress: completed ? 1 : 0 });
    o.onFlight?.({ ...IDLE_VISITOR_TOUR, progress: completed ? 1 : 0 });
    o.release(); o.schedule();
  };
  const sampleRoute = (distance: number, result: Vector3) => {
    let i = 1;
    while (i < route.length-1 && distances[i] < distance) i++;
    const span = distances[i] - distances[i-1];
    return result.copy(route[i-1]).lerp(route[i], span ? MathUtils.clamp((distance-distances[i-1])/span,0,1) : 1);
  };
  const targetStop = (index: number) => {
    stop = MathUtils.clamp(index, 0, o.stops.length-1);
    const dest = new Vector3().fromArray(o.stops[stop].position);
    const path = o.navigation.findPath(o.camera.position, dest);
    if (!path) { finish(); return false; }
    route = [o.camera.position.clone(), ...path];
    distances = [0]; routeLength = 0;
    for (let i=1;i<route.length;i++) { routeLength += route[i].distanceTo(route[i-1]); distances.push(routeLength); }
    duration = Math.max(3, routeLength / 1.1) + 3;
    elapsed = 0; last = performance.now();
    o.camera.getWorldDirection(direction); initialLook.copy(o.camera.position).addScaledVector(direction,3);
    if (o.reduced()) {
      o.camera.position.copy(dest); o.camera.lookAt(new Vector3().fromArray(o.stops[stop].target));
      elapsed = duration; paused = true;
    }
    publish(last,true); o.schedule(); return true;
  };
  return {
    active: () => kind !== null,
    moving: () => kind !== null && kind !== 'world' && !paused,
    kind: () => kind,
    progress: () => kind === 'flight' ? Math.min(1,elapsed/o.flight.duration) : 0,
    stop: finish,
    startTour() {
      if (!o.stops.length) return;
      if (kind) finish();
      o.acquire(); kind = 'tour'; paused = false;
      targetStop(0);
    },
    stepTour(delta: number) {
      if (kind !== 'tour') return;
      // Explicit stepping chooses a still stop, also useful with reduced motion.
      const next = MathUtils.clamp(stop+delta,0,o.stops.length-1);
      if (!targetStop(next)) return;
      o.camera.position.fromArray(o.stops[next].position);
      o.camera.lookAt(new Vector3().fromArray(o.stops[next].target));
      paused = true; elapsed = duration; publish(performance.now(),true); o.schedule();
    },
    startFlight() {
      if (o.reduced()) return;
      if (kind) finish();
      o.acquire();
      o.camera.getWorldDirection(direction);
      saved = {position:o.camera.position.clone(),target:o.camera.position.clone().add(direction),fov:o.camera.fov};
      kind='flight';paused=false;elapsed=0;last=performance.now();stop=0;
      applyFlight(o.camera,o.flight,0); publish(last,true);o.schedule();
    },
    seekWorld(progress: number) {
      if (kind !== 'world') { if (kind) finish(); o.acquire(); kind='world'; }
      applyFlight(o.camera,o.world,progress); o.schedule();
    },
    seekFlight(progress: number) {
      if (o.reduced()) return;
      if (kind !== 'flight') this.startFlight();
      elapsed=MathUtils.clamp(progress,0,1)*o.flight.duration;paused=true;
      stop=applyFlight(o.camera,o.flight,progress).stop-1;
      publish(performance.now(),true);o.schedule();
    },
    pause(value?: boolean) {
      if (!kind || kind === 'world') return;
      paused = value ?? !paused;
      if (o.reduced()) paused = true;
      last=performance.now();publish(last,true);o.schedule();
    },
    update(now: number) {
      if (!kind || kind === 'world' || paused) return;
      if (o.reduced()) { this.pause(true); return; }
      const delta = Math.max(0,(now-last)/1000);last=now;elapsed+=delta;
      if (kind === 'flight') {
        const pose=applyFlight(o.camera,o.flight,elapsed/o.flight.duration);stop=pose.stop-1;
        publish(now); if(elapsed>=o.flight.duration)finish(true);
        return;
      }
      const travel=duration-3, t=MathUtils.clamp(elapsed/travel,0,1);
      sampleRoute(smooth(t)*routeLength,o.camera.position);
      sampleRoute(Math.min(routeLength,smooth(t)*routeLength+1.5),ahead);
      ahead.y=o.camera.position.y;
      ahead.lerp(new Vector3().fromArray(o.stops[stop].target),smooth(MathUtils.clamp((t-.45)/.55,0,1)));
      if(t<.18)ahead.lerp(initialLook,1-smooth(t/.18));
      if(ahead.distanceToSquared(o.camera.position)>.01){
        aim.position.copy(o.camera.position);aim.lookAt(ahead);
        o.camera.quaternion.slerp(aim.quaternion,1-Math.exp(-Math.min(delta,.2)*5));
      }
      publish(now);
      if(elapsed>=duration){if(stop===o.stops.length-1)finish(true);else targetStop(stop+1);}
    },
  };
}
