import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createFirstPersonWalk } from './firstPersonWalk';

vi.mock('./walkPreferences', async importOriginal => {
  const actual = await importOriginal<typeof import('./walkPreferences')>();
  return { ...actual, createWalkPreferences: () => {
    let fov = 62;
    return { fov: () => fov, pace: () => 1, setFov: (value: number) => { fov = value; }, show: vi.fn(), dispose: vi.fn() };
  } };
});
afterEach(() => vi.restoreAllMocks());

function harness() {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const canvas = Object.assign(new EventTarget(), {
    focus: vi.fn(), setPointerCapture: vi.fn(),
    classList: { add: vi.fn(), remove: vi.fn() },
  }) as unknown as HTMLCanvasElement;
  const camera = new THREE.PerspectiveCamera(62);
  camera.position.set(0, 1.75, 0);
  const onIntent = vi.fn(), onEscape = vi.fn();
  const walk = createFirstPersonWalk(camera, canvas, () => ({ minX: -20, maxX: 20, minZ: -20, maxZ: 20 }), undefined, undefined, onIntent, onEscape);
  const event = (type: string, values: Record<string, unknown> = {}) => {
    const e = Object.assign(new Event(type, { cancelable: true }), values);
    canvas.dispatchEvent(e); return e;
  };
  const frames = (count: number) => { for (let i = 0; i < count; i++) { now += 1000 / 60; walk.update(); } };
  return { canvas, camera, walk, event, frames, onIntent, onEscape };
}

describe('shared first-person visitor movement', () => {
  it('reaches a floor target while arrow keys, E/Q and pointer drag independently change the view', () => {
    const { camera, walk, event, frames } = harness();
    walk.moveTo(new THREE.Vector3(0, 0, -5));
    event('keydown', { code: 'KeyE' }); frames(15); event('keyup', { code: 'KeyE' });
    expect(camera.rotation.x).toBeGreaterThan(.2);
    expect(walk.hasDestination()).toBe(true);
    expect(walk.destination()?.toArray()).toEqual([0, 1.75, -5]);
    event('keydown', { code: 'KeyQ' }); frames(30); event('keyup', { code: 'KeyQ' });
    expect(camera.rotation.x).toBeLessThan(-.2);
    event('keydown', { code: 'ArrowLeft' }); frames(15); event('keyup', { code: 'ArrowLeft' });
    expect(camera.rotation.y).toBeGreaterThan(.3);
    event('pointerdown', { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    event('pointermove', { pointerId: 1, clientX: 180, clientY: 60 });
    event('pointerup', { pointerId: 1 });
    expect(walk.consumeClick()).toBe(false);
    expect(walk.hasDestination()).toBe(true);
    frames(300);
    expect(walk.hasDestination()).toBe(false);
    expect(camera.position.distanceTo(new THREE.Vector3(0, 1.75, -5))).toBeLessThan(.2);
    expect(walk.needsUpdate()).toBe(false);
    walk.dispose();
  });

  it('tolerates touch jitter, consumes taps once and rejects cumulative drags and cancellations', () => {
    const { walk, event, camera } = harness();
    const down = () => event('pointerdown', { button: 0, pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 });
    const move = (x: number) => event('pointermove', { pointerId: 1, pointerType: 'touch', clientX: x, clientY: 100 });
    down(); move(103);
    event('pointerup', { pointerId: 1, pointerType: 'touch' });
    expect(camera.rotation.y).toBe(0);
    expect(walk.consumeClick()).toBe(true);
    expect(walk.consumeClick()).toBe(false);
    down(); for (let x = 101; x <= 112; x++) move(x);
    event('pointerup', { pointerId: 1, pointerType: 'touch' });
    expect(camera.rotation.y).toBeLessThan(-.02);
    expect(walk.consumeClick()).toBe(false);
    down(); event('pointercancel', { pointerId: 1, pointerType: 'touch' });
    expect(walk.consumeClick()).toBe(false);
    walk.dispose();
  });

  it('accelerates, brakes to an idle frame, and keeps arrow-look distinct from walking', () => {
    const { camera, walk, event, frames, onIntent, onEscape } = harness();
    expect(event('keydown', { code: 'KeyW' }).defaultPrevented).toBe(true);
    frames(1); const firstStep = -camera.position.z;
    frames(59); expect(-camera.position.z).toBeGreaterThan(firstStep * 60);
    event('keyup', { code: 'KeyW' });
    const release = camera.position.z;
    frames(1); expect(camera.position.z).toBeLessThan(release);
    frames(100); expect(walk.needsUpdate()).toBe(false);
    const position = camera.position.clone();
    event('keydown', { code: 'ArrowUp' }); frames(30);
    event('keyup', { code: 'ArrowUp' });
    expect(camera.rotation.x).toBeGreaterThan(.4);
    expect(camera.position.distanceTo(position)).toBeLessThan(.001);
    expect(camera.position.y).toBe(1.75);
    event('keydown', { code: 'Escape' }); expect(onEscape).toHaveBeenCalledOnce();
    expect(onIntent).toHaveBeenCalled();
    walk.dispose();
    event('keydown', { code: 'KeyW' });
    expect(walk.needsUpdate()).toBe(false);
  });

  it('shares lateral touch walking, target cancellation and session zoom limits', () => {
    const { camera, walk, event, frames } = harness();
    expect(walk.moveTo(new THREE.Vector3(0, 1.75, -5))).toBe(true);
    expect(walk.hasDestination()).toBe(true);
    walk.setTouchMovement('right'); frames(30);
    expect(camera.position.x).toBeGreaterThan(.7);
    expect(walk.hasDestination()).toBe(false);
    walk.setTouchMovement(); frames(100);
    expect(walk.needsUpdate()).toBe(false);
    event('wheel', { deltaY: 10000 }); frames(1);
    expect(camera.fov).toBeGreaterThan(62);
    expect(camera.fov).toBeLessThan(90);
    frames(100); expect(camera.fov).toBeCloseTo(90, 2);
    expect(walk.preferredFov()).toBe(90);
    event('wheel', { deltaY: -10000 }); frames(100);
    expect(camera.fov).toBeCloseTo(40, 2);
    walk.setEnabled(false);
    const position = camera.position.clone();
    walk.setTouchMovement('forward'); frames(30);
    expect(camera.position.equals(position)).toBe(true);
    walk.dispose();
  });

  it('keeps drag and pinch gestures out of tap-to-walk and synchronizes restored cameras', () => {
    const { camera, walk, event, frames } = harness();
    event('pointerdown', { button: 0, pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 });
    event('pointermove', { pointerId: 1, pointerType: 'touch', clientX: 160, clientY: 120 });
    expect(camera.rotation.y).toBeCloseTo(-60 * .00245);
    event('pointerdown', { button: 0, pointerId: 2, pointerType: 'touch', clientX: 260, clientY: 120 });
    event('pointermove', { pointerId: 2, pointerType: 'touch', clientX: 360, clientY: 120 });
    event('pointerup', { pointerId: 2, pointerType: 'touch' });
    event('pointerup', { pointerId: 1, pointerType: 'touch' });
    expect(walk.consumeClick()).toBe(false);
    frames(100); expect(walk.preferredFov()).toBeCloseTo(54.5);
    camera.position.set(5, 1.75, -5); camera.lookAt(9, 1.75, -5);
    walk.syncFromCamera(); walk.setTouchMovement('forward'); frames(30);
    expect(camera.position.x).toBeGreaterThan(5.7);
    expect(camera.position.z).toBeCloseTo(-5);
    walk.dispose();
  });
});
