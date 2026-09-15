import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createFirstPersonWalk } from '../gallery/scene/firstPersonWalk';
import { fitArrangeCamera, arrangeZoomLimit } from '../gallery/scene/arrangeCamera';
import { defaultWalkFov } from '../gallery/scene/walkPreferences';
import { VISITOR_KEYBOARD_HINT } from '../gallery/visitorKeyboard';
import type { WalkDirection } from '../gallery/VisitorWalkControls';
import { createObsidianNavigation, obsidianBounds } from './navigation';
import { createFloorReflection, installOverviewCutaway } from './floorReflection';
import data from './obsidian.json';

export type ObsidianMode = 'walk' | 'overview';
export interface ObsidianControls {
  room(index: number): void;
  move(direction?: WalkDirection): void;
  mode(value: ObsidianMode): void;
  reset(): void;
  zoom(direction: -1 | 1): void;
  pause(value: boolean): void;
}

export default function ObsidianScene({ controlsRef, onReady, onError, onRoom, onArtwork, onMode }: {
  controlsRef: { current: ObsidianControls | null };
  onReady: () => void;
  onError: () => void;
  onRoom: (index: number) => void;
  onArtwork: (id: string) => void;
  onMode: (mode: ObsidianMode) => void;
}) {
  const mount = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = mount.current!;
    let disposed = false;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); }
    catch { onError(); return; }
    const compact = matchMedia('(max-width: 767px), (pointer: coarse)').matches;
    // Retain detail on high-density phones; desktop supersampling also sharpens
    // thin bronze frames on ordinary 1× displays. Assets stay lazy and separate.
    renderer.setPixelRatio(Math.min(Math.max(devicePixelRatio, compact ? 1 : 1.5), 2));
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = 1;
    const canvas = renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', `Explore Obsidian. ${VISITOR_KEYBOARD_HINT}. Drag to look, tap the floor to walk, pinch or scroll to zoom.`);
    host.append(canvas);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#100e0b');
    const camera = new THREE.PerspectiveCamera(defaultWalkFov(compact), 1, .04, 180);
    camera.position.set(1.5, 1.75, -1.5);
    camera.lookAt(5, 1.75, -3.6);
    let currentRoom = 0, raf = 0, frames = 0, paused = false;
    let mode: ObsidianMode = 'walk';
    let model: THREE.Group | undefined;
    let reflection: ReturnType<typeof createFloorReflection> | undefined;
    const overview = { value: false };
    const savedWalk = { position: camera.position.clone(), quaternion: camera.quaternion.clone() };
    const ray = new THREE.Raycaster();
    const schedule = () => { if (!disposed && !raf && !document.hidden) raf = requestAnimationFrame(render); };
    const navigation = createObsidianNavigation();
    const walk = createFirstPersonWalk(camera, canvas, () => obsidianBounds,
      navigation.resolve, navigation.findPath, schedule, () => canvas.blur());
    walk.setEnabled(false);
    const initialLook = camera.quaternion.clone();
    const orbit = new OrbitControls(camera, canvas);
    // OrbitControls initializes toward its default target even while disabled.
    camera.quaternion.copy(initialLook);
    walk.syncFromCamera();
    orbit.enabled = false;
    orbit.enableDamping = true;
    orbit.dampingFactor = .075;
    orbit.minDistance = 5;
    orbit.maxPolarAngle = Math.PI / 2 - .04;
    orbit.zoomSpeed = .7;
    orbit.zoomToCursor = true;
    orbit.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    orbit.addEventListener('change', schedule);
    const fitOverview = () => {
      // View along the long axis in portrait, so three galleries occupy the
      // available height instead of shrinking into a thin horizontal strip.
      const direction = camera.aspect < .8 ? new THREE.Vector3(1, 2.4, .15) : new THREE.Vector3(.5, 1.25, 1);
      const fit = fitArrangeCamera(34, 8, 4.5, camera.aspect, direction);
      const center = new THREE.Vector3(17, 0, -4);
      camera.fov = 48;
      camera.clearViewOffset();
      camera.position.copy(fit.position).sub(fit.target).multiplyScalar(camera.aspect < .8 ? 1.25 : 1).add(fit.target).add(center);
      if (camera.aspect < .8) camera.setViewOffset(host.clientWidth, host.clientHeight, 0, host.clientHeight * .06, host.clientWidth, host.clientHeight);
      orbit.target.copy(fit.target).add(center);
      orbit.maxDistance = arrangeZoomLimit(34, 8, fit.distance);
      camera.far = Math.max(180, orbit.maxDistance + 50);
      camera.updateProjectionMatrix();
      orbit.update();
    };
    const switchMode = (next: ObsidianMode) => {
      if (next === mode) return;
      if (next === 'overview') {
        savedWalk.position.copy(camera.position); savedWalk.quaternion.copy(camera.quaternion);
        walk.setEnabled(false);
        fitOverview();
      } else {
        camera.clearViewOffset();
        camera.position.copy(savedWalk.position); camera.quaternion.copy(savedWalk.quaternion);
        camera.fov = walk.preferredFov(); camera.updateProjectionMatrix(); walk.syncFromCamera();
      }
      mode = next; overview.value = next === 'overview';
      orbit.enabled = !paused && overview.value; walk.setEnabled(!paused && !overview.value);
      if (reflection) reflection.visible = !overview.value;
      onMode(next); schedule();
    };
    const resetWalk = (index: number) => {
      const room = data.rooms[index]; if (!room) return;
      switchMode('walk'); walk.setEnabled(false);
      camera.position.fromArray(room.start); camera.position.y = 1.75;
      camera.fov = walk.preferredFov();
      camera.lookAt(camera.position.clone().add(new THREE.Vector3(3.5, 0, -2.1)));
      walk.syncFromCamera(); walk.setEnabled(!paused);
      currentRoom = index; onRoom(index); schedule();
    };
    const pause = (value: boolean) => {
      paused = value;
      walk.setEnabled(!value && mode === 'walk' && Boolean(model));
      orbit.enabled = !value && mode === 'overview';
      schedule();
    };
    controlsRef.current = {
      room: resetWalk,
      move: direction => { walk.setTouchMovement(direction); schedule(); },
      mode: switchMode,
      reset: () => { if (mode === 'overview') fitOverview(); else resetWalk(currentRoom); schedule(); },
      zoom: direction => { if (mode !== 'overview') return;
        const offset = camera.position.clone().sub(orbit.target);
        offset.setLength(THREE.MathUtils.clamp(offset.length() * (direction > 0 ? 1 / 1.3 : 1.3), orbit.minDistance, orbit.maxDistance));
        camera.position.copy(orbit.target).add(offset); orbit.update(); schedule();
      },
      pause,
    };
    const disposeModel = (root: THREE.Object3D) => {
      const mats = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
      root.traverse(o => { if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) mats.add(m);
      } });
      mats.forEach(m => { Object.values(m).forEach(v => { if (v instanceof THREE.Texture) textures.add(v); }); m.dispose(); });
      textures.forEach(t => t.dispose());
    };
    function render() {
      raf = 0;
      if (disposed || document.hidden) return;
      // Orbit owns the camera in Overview; Walk must not apply its FOV easing.
      if (mode === 'walk' && !paused) walk.update();
      const orbitMoving = orbit.enabled && orbit.update();
      const room = camera.position.x < 12 ? 0 : camera.position.x < 22 ? 1 : 2;
      if (mode === 'walk' && room !== currentRoom) { currentRoom = room; onRoom(room); }
      host.dataset.position = camera.position.toArray().map(v => v.toFixed(3)).join(',');
      host.dataset.fov = camera.fov.toFixed(2);
      host.dataset.mode = mode;
      host.dataset.destination = String(walk.hasDestination());
      host.dataset.frames = String(++frames);
      host.dataset.reflection = reflection?.visible ? 'planar' : 'off';
      renderer.render(scene, camera);
      const moving = !paused && (mode === 'walk' ? walk.needsUpdate() : orbitMoving);
      host.dataset.idle = String(!moving);
      if (moving) schedule();
    }
    const resize = new ResizeObserver(() => {
      if (!host.clientWidth || !host.clientHeight) return;
      renderer.setSize(host.clientWidth, host.clientHeight); camera.aspect = host.clientWidth / host.clientHeight;
      if (mode === 'overview') fitOverview();
      camera.updateProjectionMatrix(); schedule();
    });
    resize.observe(host);
    const click = (event: MouseEvent) => {
      if (event.button !== 0 || paused || !model || mode !== 'walk' || !walk.consumeClick()) return;
      const rect = canvas.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
      const hit = ray.intersectObject(model, true)[0];
      if (hit?.object.userData.artwork_id) { pause(true); onArtwork(hit.object.userData.artwork_id); }
      else if (hit?.object.userData.reflective_floor && Math.abs(hit.point.y) < .02) {
        walk.moveTo(hit.point); schedule();
      }
    };
    const lost = (event: Event) => { event.preventDefault(); pause(true); onError(); };
    const blur = () => { walk.setEnabled(false); if (!paused && mode === 'walk' && model) walk.setEnabled(true); schedule(); };
    const visibility = () => { blur(); if (!document.hidden) schedule(); };
    // Pointer look and pinch mutate camera state inside the shared controller.
    canvas.addEventListener('pointermove', schedule); canvas.addEventListener('click', click);
    canvas.addEventListener('pointercancel', blur); canvas.addEventListener('blur', blur);
    canvas.addEventListener('webglcontextlost', lost);
    window.addEventListener('blur', blur); document.addEventListener('visibilitychange', visibility);
    const abort = new AbortController();
    fetch(`/assets/showcases/obsidian/obsidian-${compact ? 'mobile' : 'desktop'}.glb`, { signal: abort.signal })
      .then(response => { if (!response.ok) throw new Error('Missing showcase'); return response.arrayBuffer(); })
      .then(buffer => new GLTFLoader().parseAsync(buffer, '/assets/showcases/obsidian/'))
      .then(gltf => {
        if (disposed) { disposeModel(gltf.scene); return; }
        model = gltf.scene;
        const materials = new Set<THREE.Material>();
        model.traverse(object => {
          if (!(object instanceof THREE.Mesh)) return;
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
        });
        materials.forEach(material => {
          installOverviewCutaway(material, overview);
          Object.values(material).forEach(value => { if (value instanceof THREE.Texture) value.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy()); });
        });
        scene.add(model);
        reflection = createFloorReflection(compact); scene.add(reflection);
        host.dataset.ready = 'true'; walk.setEnabled(true); schedule(); onReady();
      }).catch(error => { if (!disposed && error.name !== 'AbortError') onError(); });
    return () => {
      disposed = true; abort.abort(); cancelAnimationFrame(raf); resize.disconnect(); controlsRef.current = null;
      canvas.removeEventListener('pointermove', schedule); canvas.removeEventListener('click', click);
      canvas.removeEventListener('pointercancel', blur); canvas.removeEventListener('blur', blur);
      canvas.removeEventListener('webglcontextlost', lost);
      window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility);
      walk.dispose(); orbit.dispose();
      if (model) disposeModel(model);
      reflection?.geometry.dispose(); reflection?.dispose(); renderer.dispose(); canvas.remove();
    };
  }, [controlsRef, onReady, onError, onRoom, onArtwork, onMode]);
  return <div ref={mount} className="obsidian__scene" role="region" aria-label="Obsidian gallery" />;
}
