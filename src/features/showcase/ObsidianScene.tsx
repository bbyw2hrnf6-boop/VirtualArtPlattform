import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { moveSafely } from './navigation';
import data from './obsidian.json';

export interface ObsidianControls {
  room(index: number): void;
  move(direction: string, pressed: boolean): void;
}

export default function ObsidianScene({ controlsRef, onReady, onError, onRoom, onArtwork }: {
  controlsRef: { current: ObsidianControls | null };
  onReady: () => void;
  onError: () => void;
  onRoom: (index: number) => void;
  onArtwork: (id: string) => void;
}) {
  const mount = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = mount.current!;
    let disposed = false;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); }
    catch { onError(); return; }
    const compact = matchMedia('(max-width: 700px), (pointer: coarse)').matches;
    renderer.setPixelRatio(Math.min(devicePixelRatio, compact ? 1.5 : 2));
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = 1;
    host.append(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#100e0b');
    const camera = new THREE.PerspectiveCamera(compact ? 78 : 62, 1, .04, 90);
    camera.position.set(1.5, 1.65, -1.5);
    let yaw = 1.03, pitch = 0, currentRoom = 0, raf = 0, previous = 0;
    let model: THREE.Group | undefined;
    const keys = new Set<string>();
    const reflections: THREE.WebGLCubeRenderTarget[] = [];
    const floors: THREE.Mesh[] = [];
    const ray = new THREE.Raycaster();
    let pressed: { x: number; y: number; px: number; py: number; id: number } | undefined;
    const disposeModel = (root: THREE.Object3D) => {
      const mats = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
      root.traverse(o => { if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) mats.add(m);
      } });
      mats.forEach(m => { Object.values(m).forEach(v => { if (v instanceof THREE.Texture) textures.add(v); }); m.dispose(); });
      textures.forEach(t => t.dispose());
    };
    const render = (time: number) => {
      raf = 0;
      if (disposed || document.hidden) return;
      const dt = Math.min(.05, (time - (previous || time)) / 1000); previous = time;
      if (keys.has('arrowleft')) yaw -= dt * 1.15;
      if (keys.has('arrowright')) yaw += dt * 1.15;
      const f = Number(keys.has('w') || keys.has('arrowup')) - Number(keys.has('s') || keys.has('arrowdown'));
      const side = Number(keys.has('d')) - Number(keys.has('a'));
      const speed = dt * 2 / Math.max(1, Math.hypot(f, side));
      const [x, y] = moveSafely(camera.position.x, -camera.position.z, (Math.sin(yaw) * f + Math.cos(yaw) * side) * speed, (Math.cos(yaw) * f - Math.sin(yaw) * side) * speed);
      camera.position.set(x, 1.65, -y);
      camera.lookAt(x + Math.sin(yaw) * Math.cos(pitch), 1.65 + Math.sin(pitch), -y - Math.cos(yaw) * Math.cos(pitch));
      const room = x < 12 ? 0 : x < 22 ? 1 : 2;
      if (room !== currentRoom) { currentRoom = room; onRoom(room); }
      host.dataset.position = camera.position.toArray().map(v => v.toFixed(2)).join(',');
      renderer.render(scene, camera);
      if (keys.size) schedule();
    };
    const schedule = () => { if (!disposed && !raf) raf = requestAnimationFrame(render); };
    const stop = () => { keys.clear(); pressed = undefined; previous = 0; };
    controlsRef.current = {
      room(index) {
        stop(); const r = data.rooms[index]; if (!r) return;
        camera.position.fromArray(r.start); yaw = 1.03; pitch = 0; schedule();
      },
      move(direction, active) { if (active) keys.add(direction); else keys.delete(direction); schedule(); },
    };
    const resize = new ResizeObserver(() => {
      if (!host.clientWidth || !host.clientHeight) return;
      renderer.setSize(host.clientWidth, host.clientHeight); camera.aspect = host.clientWidth / host.clientHeight; camera.updateProjectionMatrix(); schedule();
    });
    resize.observe(host);
    const keydown = (e: KeyboardEvent) => {
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) {
        e.preventDefault(); keys.add(e.key.toLowerCase()); schedule();
      }
    };
    const keyup = (e: KeyboardEvent) => { keys.delete(e.key.toLowerCase()); };
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      host.focus({ preventScroll: true }); host.setPointerCapture(e.pointerId);
      pressed = { x: e.clientX, y: e.clientY, px: e.clientX, py: e.clientY, id: e.pointerId };
    };
    const move = (e: PointerEvent) => {
      if (!pressed || e.pointerId !== pressed.id) return;
      yaw -= (e.clientX - pressed.px) * .0035;
      pitch = THREE.MathUtils.clamp(pitch + (e.clientY - pressed.py) * .003, -.9, .9);
      pressed.px = e.clientX; pressed.py = e.clientY; schedule();
    };
    const up = (e: PointerEvent) => {
      if (pressed && Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) < 5 && model) {
        const r = host.getBoundingClientRect();
        ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1, -(e.clientY-r.top)/r.height*2+1), camera);
        const hit = ray.intersectObject(model, true)[0];
        if (hit?.object.userData.artwork_id) onArtwork(hit.object.userData.artwork_id);
      }
      pressed = undefined;
    };
    const lost = (e: Event) => { e.preventDefault(); stop(); onError(); };
    const visibility = () => { stop(); if (!document.hidden) schedule(); };
    host.addEventListener('keydown', keydown); host.addEventListener('keyup', keyup);
    host.addEventListener('pointerdown', down); host.addEventListener('pointermove', move); host.addEventListener('pointerup', up);
    host.addEventListener('pointercancel', stop); host.addEventListener('blur', stop);
    renderer.domElement.addEventListener('webglcontextlost', lost);
    window.addEventListener('blur', stop); document.addEventListener('visibilitychange', visibility);
    const abort = new AbortController();
    fetch(`/assets/showcases/obsidian/obsidian-${compact ? 'mobile' : 'desktop'}.glb`, { signal: abort.signal })
      .then(r => { if (!r.ok) throw new Error('Missing showcase'); return r.arrayBuffer(); })
      .then(buffer => new GLTFLoader().parseAsync(buffer, '/assets/showcases/obsidian/'))
      .then(gltf => {
        if (disposed) { disposeModel(gltf.scene); return; }
        model = gltf.scene;
        model.traverse(o => {
          if (!(o instanceof THREE.Mesh)) return;
          const materials = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of materials) Object.values(m).forEach(v => { if (v instanceof THREE.Texture) v.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); });
          if (o.userData.reflective_floor) floors.push(o);
        });
        scene.add(model);
        // Three local probes preserve parallax between rooms; baked diffuse is
        // retained. Only the specular floor lobe is evaluated in real time.
        for (let i = 0; i < 3; i++) {
          const target = new THREE.WebGLCubeRenderTarget(compact ? 128 : 256, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
          const probe = new THREE.CubeCamera(.05, 60, target); probe.position.set([6,17,28][i], 1.8, -4); probe.update(renderer, scene); reflections.push(target);
        }
        for (const floor of floors) {
          const original = floor.material as THREE.MeshStandardMaterial;
          const m = new THREE.MeshStandardMaterial({ color: '#080908', map: null, emissive: 0xffffff, emissiveMap: original.emissiveMap ?? original.map, roughness: .4, metalness: .05, envMap: reflections[Number(floor.userData.obsidian_room.slice(1))-1].texture, envMapIntensity: .5 });
          original.dispose(); floor.material = m;
        }
        host.dataset.ready = 'true'; schedule(); onReady();
      }).catch(error => { if (!disposed && error.name !== 'AbortError') onError(); });
    return () => {
      disposed = true; abort.abort(); cancelAnimationFrame(raf); resize.disconnect(); controlsRef.current = null;
      host.removeEventListener('keydown', keydown); host.removeEventListener('keyup', keyup);
      host.removeEventListener('pointerdown', down); host.removeEventListener('pointermove', move); host.removeEventListener('pointerup', up);
      host.removeEventListener('pointercancel', stop); host.removeEventListener('blur', stop);
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      window.removeEventListener('blur', stop); document.removeEventListener('visibilitychange', visibility);
      if (model) disposeModel(model); reflections.forEach(t => t.dispose()); renderer.dispose(); renderer.domElement.remove();
    };
  }, [controlsRef, onReady, onError, onRoom, onArtwork]);
  return <div ref={mount} className="obsidian__scene" tabIndex={0} role="region" aria-label="Obsidian gallery. Drag to look, use W A S D or arrow keys to walk. Select an artwork to inspect it." />;
}
