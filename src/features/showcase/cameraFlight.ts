import { MathUtils, PerspectiveCamera, Vector3 } from 'three';

export type FlightKey = { at: number; position: number[]; target: number[]; fov?: number; label: string };
export type CameraFlight = { duration: number; keys: FlightKey[]; landAtEnd?: boolean };
export const smooth = (t: number) => t * t * (3 - 2 * t);

/** Time-aware Hermite rails keep velocity continuous across authored shots.
 * Position and subject have independent rails; the horizon remains level.
 * Endpoint derivatives vanish, avoiding a hard launch or abrupt last frame. */
export function sampleFlight(flight: CameraFlight, progress: number) {
  const time = MathUtils.clamp(progress, 0, 1) * flight.duration;
  const keys = flight.keys;
  let i = 0;
  while (i < keys.length - 2 && time > keys[i + 1].at) i++;
  const a = keys[i], b = keys[i + 1], dt = b.at - a.at;
  const t = MathUtils.clamp((time - a.at) / dt, 0, 1);
  const scalar = (read: (k: FlightKey) => number) => {
    const slope = (n: number) => n === 0 || n === keys.length - 1 ? 0 :
      (() => {
        const h0=keys[n].at-keys[n-1].at, h1=keys[n+1].at-keys[n].at;
        const a=(read(keys[n])-read(keys[n-1]))/h0, b=(read(keys[n+1])-read(keys[n]))/h1;
        // Monotone tangents: no overshoot into a wall after a narrow doorway.
        if(a*b<=0)return 0;
        return 3*(h0+h1)/((2*h1+h0)/a+(h1+2*h0)/b);
      })();
    return (2*t*t*t-3*t*t+1)*read(a)+(t*t*t-2*t*t+t)*dt*slope(i)
      +(-2*t*t*t+3*t*t)*read(b)+(t*t*t-t*t)*dt*slope(i+1);
  };
  return {
    position: new Vector3(...[0,1,2].map(n => scalar(k => k.position[n]))),
    target: new Vector3(...[0,1,2].map(n => scalar(k => k.target[n]))),
    fov: MathUtils.clamp(scalar(k => k.fov ?? 55), 38, 74),
    label: a.label, stop: i + 1,
  };
}

export function applyFlight(camera: PerspectiveCamera, flight: CameraFlight, progress: number) {
  const pose = sampleFlight(flight, progress);
  camera.position.copy(pose.position);
  camera.up.set(0, 1, 0);
  camera.lookAt(pose.target);
  const fov = pose.fov + (camera.aspect < .8 ? 8 : 0);
  if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
  return pose;
}
