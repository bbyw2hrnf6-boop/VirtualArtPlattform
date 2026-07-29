import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { DecorPlacement, GalleryDraft, WallId } from './types';
import { getTemplate } from './templates';

type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };
const WALLS: Record<WallId, { position: (x: number, y: number, w: number, d: number) => [number, number, number]; rotation: [number, number, number] }> = {
  north: { position: (x, y, _w, d) => [x, y, -d / 2 + .035], rotation: [0, 0, 0] },
  west: { position: (x, y, w) => [-w / 2 + .035, y, x], rotation: [0, Math.PI / 2, 0] },
  east: { position: (x, y, w) => [w / 2 - .035, y, x], rotation: [0, -Math.PI / 2, 0] }
};
const wallColors = { chalk: '#e7e4dc', warm: '#b9a993', charcoal: '#30312f' };
const floorColors = { concrete: '#777672', oak: '#5c4633', terrazzo: '#a7a299' };

function showSceneError(element: HTMLElement, message = 'This gallery needs WebGL. Please enable hardware acceleration or open it in a current browser.') {
  const notice = document.createElement('div'); const label = document.createElement('span'); const detail = document.createElement('p'); notice.className = 'scene-error'; label.textContent = '3D VIEW UNAVAILABLE'; detail.textContent = message; notice.append(label, detail); element.appendChild(notice);
  return () => notice.remove();
}

function createPlant(broad = false) {
  const group = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(.35, .27, .65, 18), new THREE.MeshStandardMaterial({ color: '#282521', roughness: .8 }));
  pot.position.y = .34; group.add(pot);
  const leafMaterial = new THREE.MeshStandardMaterial({ color: broad ? '#365d39' : '#3c573a', roughness: .75 });
  for (let index = 0; index < (broad ? 6 : 9); index++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(broad ? .34 : .18, 12, 8), leafMaterial);
    leaf.scale.set(broad ? .7 : .45, broad ? 1.5 : 2.8, .18);
    leaf.rotation.z = (index % 2 ? 1 : -1) * (.25 + index * .04);
    leaf.position.set(Math.sin(index * 1.9) * .3, .82 + index * .11, Math.cos(index * 2.1) * .22);
    group.add(leaf);
  }
  return group;
}

function createDecor(item: DecorPlacement, selected: boolean) {
  const group = new THREE.Group(); group.userData.decorId = item.id;
  if (item.type === 'olive' || item.type === 'monstera') group.add(createPlant(item.type === 'monstera'));
  if (item.type === 'pedestal') {
    const pedestal = new THREE.Mesh(new THREE.BoxGeometry(.8, 1.15, .8), new THREE.MeshStandardMaterial({ color: '#d8d4cb', roughness: .76 })); pedestal.position.y = .575; group.add(pedestal);
  }
  if (item.type === 'arc-lamp') {
    const metal = new THREE.MeshStandardMaterial({ color: '#181818', metalness: .7, roughness: .3 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(.35, .42, .08, 18), metal); base.position.y = .04; group.add(base);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, 2.8, 12), metal); stem.position.y = 1.4; group.add(stem);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(.32, .42, 20, 1, true), metal); shade.rotation.x = Math.PI; shade.position.y = 2.65; group.add(shade);
    const glow = new THREE.PointLight('#ffd9a0', 4, 4); glow.position.y = 2.45; group.add(glow);
  }
  if (selected) {
    const marker = new THREE.Mesh(new THREE.RingGeometry(.46, .53, 32), new THREE.MeshBasicMaterial({ color: '#d9ff43', side: THREE.DoubleSide })); marker.rotation.x = -Math.PI / 2; marker.position.y = .015; group.add(marker);
  }
  group.position.set(item.x, 0, item.z); group.rotation.y = item.rotation; group.scale.setScalar(item.scale);
  group.traverse((child) => { child.userData.decorId = item.id; });
  return group;
}

function buildRoom(scene: THREE.Scene, draft: GalleryDraft, selectedDecorId?: string, enclosed = false) {
  const [w, d] = getTemplate(draft.templateId).dimensions;
  const wall = new THREE.MeshStandardMaterial({ color: wallColors[draft.wall], roughness: .83 });
  const floor = new THREE.MeshStandardMaterial({ color: floorColors[draft.floor], roughness: draft.floor === 'oak' ? .55 : .88, metalness: .03 });
  const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floor); floorMesh.rotation.x = -Math.PI / 2; floorMesh.receiveShadow = true; scene.add(floorMesh);
  const addWall = (geometry: THREE.BufferGeometry, position: [number, number, number]) => { const mesh = new THREE.Mesh(geometry, wall); mesh.position.set(...position); mesh.receiveShadow = true; scene.add(mesh); };
  addWall(new THREE.BoxGeometry(w, 4.8, .12), [0, 2.4, -d / 2]);
  addWall(new THREE.BoxGeometry(.12, 4.8, d), [-w / 2, 2.4, 0]);
  addWall(new THREE.BoxGeometry(.12, 4.8, d), [w / 2, 2.4, 0]);
  if (enclosed) {
    addWall(new THREE.BoxGeometry(w, 4.8, .12), [0, 2.4, d / 2]);
    addWall(new THREE.BoxGeometry(w, .12, d), [0, 4.8, 0]);
  }
  if (draft.templateId === 'pavilion') {
    const divider = new THREE.Mesh(new THREE.BoxGeometry(4.4, 3.5, .18), wall); divider.position.set(0, 1.75, -.5); scene.add(divider);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.2, .4, .65), new THREE.MeshStandardMaterial({ color: '#26231f', roughness: .6 })); bench.position.set(0, .35, 2.4); bench.castShadow = true; scene.add(bench);
  }
  if (draft.templateId === 'nocturne') { const plinth = new THREE.Mesh(new THREE.CylinderGeometry(.75, .75, .7, 32), new THREE.MeshStandardMaterial({ color: '#151615', roughness: .75 })); plinth.position.set(0, .35, 1); scene.add(plinth); }
  const decorObjects = draft.decor.map((item) => createDecor(item, selectedDecorId === item.id));
  decorObjects.forEach((item) => { item.position.x = THREE.MathUtils.clamp(item.position.x, -w / 2 + .45, w / 2 - .45); item.position.z = THREE.MathUtils.clamp(item.position.z, -d / 2 + .45, d / 2 - .45); scene.add(item); });
  return { w, d, decorObjects, floorMesh };
}

function addLighting(scene: THREE.Scene, preset: GalleryDraft['lighting']) {
  const settings = {
    daylight: { bg: '#d6d8d5', hemi: 2.2, key: 3.2, color: '#fff7e8' },
    museum: { bg: '#111311', hemi: 1, key: 5.4, color: '#ffe6bd' },
    evening: { bg: '#171516', hemi: .7, key: 4.2, color: '#ffca8d' }
  }[preset];
  scene.background = new THREE.Color(settings.bg); scene.add(new THREE.HemisphereLight('#eef3ff', '#3b342e', settings.hemi));
  const main = new THREE.DirectionalLight(settings.color, settings.key); main.position.set(-3, 7, 5); main.castShadow = true; main.shadow.mapSize.set(1024, 1024); scene.add(main);
  [-3, 0, 3].forEach((x) => { const spot = new THREE.SpotLight(settings.color, 18, 9, .45, .8, 1.5); spot.position.set(x, 4.25, -1); spot.target.position.set(x, 1.6, -4); scene.add(spot, spot.target); });
}

type WalkCollision = (next: THREE.Vector3, previous: THREE.Vector3) => void;

function createFirstPersonWalk(camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement, bounds: () => Bounds, collision?: WalkCollision) {
  const keys = new Set<string>(); let enabled = true; let destination: THREE.Vector3 | null = null;
  const movementKeys = ['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
  const keyDown = (event: KeyboardEvent) => { if (movementKeys.includes(event.code) && enabled) { destination = null; keys.add(event.code); event.preventDefault(); } };
  const keyUp = (event: KeyboardEvent) => keys.delete(event.code);
  const blur = () => keys.clear(); window.addEventListener('keydown', keyDown); window.addEventListener('keyup', keyUp); window.addEventListener('blur', blur);
  camera.rotation.order = 'YXZ';
  let dragging = false; let dragged = false; let pointerId = -1; let lastX = 0; let lastY = 0; let yaw = camera.rotation.y; let pitch = camera.rotation.x; let eyeHeight = camera.position.y;
  const syncRotation = () => { const rotation = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ'); pitch = rotation.x; yaw = rotation.y; camera.rotation.set(pitch, yaw, 0, 'YXZ'); };
  const lookAt = (target: THREE.Vector3) => { eyeHeight = camera.position.y; camera.lookAt(target); syncRotation(); };
  const pointerDown = (event: PointerEvent) => { if (!enabled || event.button !== 0) return; dragging = true; dragged = false; pointerId = event.pointerId; lastX = event.clientX; lastY = event.clientY; if (event.isTrusted) canvas.setPointerCapture(event.pointerId); canvas.classList.add('is-looking'); };
  const pointerMove = (event: PointerEvent) => { if (!dragging || event.pointerId !== pointerId) return; const dx = event.clientX - lastX; const dy = event.clientY - lastY; if (Math.abs(dx) + Math.abs(dy) > 2) dragged = true; yaw -= dx * .0032; pitch -= dy * .0032; pitch = THREE.MathUtils.clamp(pitch, -1.22, 1.22); camera.rotation.set(pitch, yaw, 0, 'YXZ'); lastX = event.clientX; lastY = event.clientY; };
  const pointerUp = (event: PointerEvent) => { if (event.pointerId !== pointerId) return; dragging = false; pointerId = -1; canvas.classList.remove('is-looking'); };
  const contextMenu = (event: Event) => event.preventDefault();
  canvas.addEventListener('pointerdown', pointerDown); canvas.addEventListener('pointermove', pointerMove); canvas.addEventListener('pointerup', pointerUp); canvas.addEventListener('pointercancel', pointerUp); canvas.addEventListener('contextmenu', contextMenu);
  let previousTime = performance.now(); const forward = new THREE.Vector3(); const right = new THREE.Vector3(); const desired = new THREE.Vector3(); const velocity = new THREE.Vector3(); const previous = new THREE.Vector3();
  const update = () => {
    const now = performance.now(); const delta = Math.min((now - previousTime) / 1000, .05); previousTime = now; if (!enabled) return; camera.getWorldDirection(forward); forward.y = 0; if (forward.lengthSq() < .001) forward.set(0, 0, -1); forward.normalize(); right.crossVectors(forward, camera.up).normalize(); desired.set(0, 0, 0);
    if (keys.has('KeyW') || keys.has('ArrowUp')) desired.add(forward);
    if (keys.has('KeyS') || keys.has('ArrowDown')) desired.sub(forward);
    if (keys.has('KeyD') || keys.has('ArrowRight')) desired.add(right);
    if (keys.has('KeyA') || keys.has('ArrowLeft')) desired.sub(right);
    if (desired.lengthSq()) desired.normalize().multiplyScalar(2.75);
    else if (destination) { desired.subVectors(destination, camera.position); desired.y = 0; const distance = desired.length(); if (distance < .14) { destination = null; desired.set(0, 0, 0); } else desired.normalize().multiplyScalar(Math.min(2.6, Math.max(.7, distance * 1.5))); }
    velocity.lerp(desired, 1 - Math.exp(-9 * delta)); previous.copy(camera.position); camera.position.addScaledVector(velocity, delta);
    const current = bounds(); camera.position.x = THREE.MathUtils.clamp(camera.position.x, current.minX, current.maxX); camera.position.z = THREE.MathUtils.clamp(camera.position.z, current.minZ, current.maxZ); camera.position.y = eyeHeight; collision?.(camera.position, previous);
  };
  const moveTo = (point: THREE.Vector3) => { const current = bounds(); destination = point.clone(); destination.x = THREE.MathUtils.clamp(destination.x, current.minX, current.maxX); destination.z = THREE.MathUtils.clamp(destination.z, current.minZ, current.maxZ); destination.y = eyeHeight; };
  const setEnabled = (value: boolean) => { enabled = value; keys.clear(); velocity.set(0, 0, 0); if (!value) destination = null; };
  const consumeClick = () => { const isClick = !dragged && enabled; dragged = false; return isClick; };
  return { update, lookAt, moveTo, setEnabled, consumeClick, hasDestination: () => destination !== null, dispose: () => { window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); window.removeEventListener('blur', blur); canvas.removeEventListener('pointerdown', pointerDown); canvas.removeEventListener('pointermove', pointerMove); canvas.removeEventListener('pointerup', pointerUp); canvas.removeEventListener('pointercancel', pointerUp); canvas.removeEventListener('contextmenu', contextMenu); } };
}

type WalkController = ReturnType<typeof createFirstPersonWalk>;

function createCinematicIntro(camera: THREE.PerspectiveCamera, points: THREE.Vector3[], lookTarget: THREE.Vector3, navigation: WalkController, element: HTMLElement, onComplete?: () => void) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', .38); const duration = 4800; const startedAt = performance.now(); let complete = false;
  const overlay = document.createElement('div'); overlay.className = 'cinematic-intro'; const copy = document.createElement('div'); const label = document.createElement('span'); const line = document.createElement('i'); const skip = document.createElement('button'); label.textContent = 'Entering exhibition'; skip.textContent = 'Skip intro'; copy.append(label, line); overlay.append(copy, skip); element.appendChild(overlay); navigation.setEnabled(false);
  const finish = () => { if (complete) return; complete = true; camera.position.copy(points[points.length - 1]); navigation.lookAt(lookTarget); navigation.setEnabled(true); overlay.classList.add('is-finished'); window.setTimeout(() => overlay.remove(), 450); onComplete?.(); };
  const update = () => { if (complete) return; if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { finish(); return; } const raw = Math.min(1, (performance.now() - startedAt) / duration); const eased = raw < .5 ? 4 * raw * raw * raw : 1 - Math.pow(-2 * raw + 2, 3) / 2; camera.position.copy(curve.getPointAt(eased)); camera.lookAt(lookTarget); line.style.transform = `scaleX(${raw})`; if (raw >= 1) finish(); };
  skip.addEventListener('click', finish);
  return { update, skip: finish, isComplete: () => complete, dispose: () => { skip.removeEventListener('click', finish); overlay.remove(); } };
}

export interface ArtworkFocusInfo { id: string; title: string; artist: string; description?: string; year?: string; image?: string }

export type GalleryViewMode = 'walk' | 'overview';

interface GallerySceneProps {
  draft: GalleryDraft; selectedId?: string; selectedDecorId?: string;
  onSelect?: (id: string) => void; onSelectDecor?: (id: string) => void; visitor?: boolean; viewMode?: GalleryViewMode;
  playIntro?: boolean; onIntroComplete?: () => void; onArtworkFocus?: (artwork: ArtworkFocusInfo | null) => void;
}

export function GalleryScene({ draft, selectedId, selectedDecorId, onSelect, onSelectDecor, visitor = false, viewMode = 'walk', playIntro = false, onIntroComplete, onArtworkFocus }: GallerySceneProps) {
  const host = useRef<HTMLDivElement>(null); const introPlayed = useRef(false);
  useEffect(() => {
    if (!host.current) return; const element = host.current; const scene = new THREE.Scene(); const template = getTemplate(draft.templateId);
    const walk = visitor && viewMode === 'walk'; const camera = new THREE.PerspectiveCamera(walk ? 62 : 48, 1, .1, 70); camera.position.set(...template.camera);
    let renderer: THREE.WebGLRenderer; try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); } catch { return showSceneError(element); } renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05; element.appendChild(renderer.domElement);
    const controls = walk ? null : new OrbitControls(camera, renderer.domElement); if (controls) { controls.enableDamping = true; controls.target.set(0, 1.6, -1.5); controls.maxPolarAngle = Math.PI / 2 - .03; controls.minDistance = 2.1; controls.maxDistance = visitor ? 18 : 15; controls.enablePan = false; controls.autoRotate = visitor; controls.autoRotateSpeed = .38; }
    const { w, d, decorObjects, floorMesh } = buildRoom(scene, draft, selectedDecorId, walk); addLighting(scene, draft.lighting);
    const roomBounds = { minX: -w / 2 + .45, maxX: w / 2 - .45, minZ: -d / 2 + .45, maxZ: d / 2 - .45 };
    if (walk) camera.position.set(0, 1.68, d / 2 - 1);
    const dividerCollision: WalkCollision | undefined = draft.templateId === 'pavilion' ? (next, previous) => { if (Math.abs(next.x) > 2.55 || Math.abs(next.z + .5) > .4) return; next.z = previous.z > -.5 ? -.09 : -.91; } : undefined;
    const navigation = walk ? createFirstPersonWalk(camera, renderer.domElement, () => roomBounds, dividerCollision) : null; const finalLook = new THREE.Vector3(0, 1.68, -1); if (navigation) navigation.lookAt(finalLook);
    const walkMarker = new THREE.Mesh(new THREE.RingGeometry(.18, .25, 32), new THREE.MeshBasicMaterial({ color: '#d9ff43', transparent: true, opacity: .78, side: THREE.DoubleSide })); walkMarker.rotation.x = -Math.PI / 2; walkMarker.position.y = .018; walkMarker.visible = false; if (walk) scene.add(walkMarker);
    let intro = navigation && playIntro && !introPlayed.current ? createCinematicIntro(camera, [new THREE.Vector3(0, 3.35, d / 2 - .75), new THREE.Vector3(-w * .22, 2.45, .3), new THREE.Vector3(w * .2, 2.15, -d / 2 + 1.25), new THREE.Vector3(0, 1.68, d / 2 - 1)], finalLook, navigation, element, () => { introPlayed.current = true; onIntroComplete?.(); }) : null;
    const artworkObjects: THREE.Object3D[] = []; const artworkById = new Map(draft.artworks.map((artwork) => [artwork.id, artwork])); let focusedArtwork: THREE.Object3D | null = null; let focusedArtworkId: string | null = null;
    draft.artworks.forEach((artwork) => {
      const texture = new THREE.TextureLoader().load(artwork.src); texture.colorSpace = THREE.SRGBColorSpace; const height = 1.5 * artwork.scale; const width = height * artwork.aspect;
      const group = new THREE.Group(); group.userData.artworkId = artwork.id;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(width + .12, height + .12, .07), new THREE.MeshStandardMaterial({ color: selectedId === artwork.id ? '#b8945f' : '#1c1b19', metalness: .2, roughness: .45 }));
      const canvas = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map: texture, roughness: .72 })); canvas.position.z = .041; group.add(frame, canvas);
      const config = WALLS[artwork.wall]; const [px, py, pz] = config.position(artwork.x, artwork.y, w, d); group.position.set(px, py, pz); group.rotation.set(...config.rotation); group.traverse((item) => { item.userData.artworkId = artwork.id; }); scene.add(group); artworkObjects.push(group);
    });
    const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2();
    const setPointer = (event: PointerEvent) => { const box = renderer.domElement.getBoundingClientRect(); pointer.set(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1); raycaster.setFromCamera(pointer, camera); };
    const handlePointer = (event: PointerEvent) => {
      setPointer(event);
      if (!visitor) { const hit = raycaster.intersectObjects([...artworkObjects, ...decorObjects], true)[0]; const artworkId = hit?.object.userData.artworkId as string | undefined; const decorId = hit?.object.userData.decorId as string | undefined; if (artworkId) onSelect?.(artworkId); else if (decorId) onSelectDecor?.(decorId); return; }
      if (!walk || !navigation?.consumeClick()) return;
      const artHit = raycaster.intersectObjects(artworkObjects, true)[0]; const artworkId = artHit?.object.userData.artworkId as string | undefined;
      if (artworkId) { const artwork = artworkById.get(artworkId); if (!artwork) return; focusedArtwork = artworkObjects.find((item) => item.userData.artworkId === artworkId) ?? artHit.object; focusedArtworkId = artworkId; onArtworkFocus?.({ id: artwork.id, title: artwork.title, artist: draft.artist, description: artwork.description, year: artwork.year, image: artwork.src }); return; }
      const floorHit = raycaster.intersectObject(floorMesh, false)[0]; if (floorHit) { focusedArtwork = null; focusedArtworkId = null; onArtworkFocus?.(null); navigation.moveTo(floorHit.point); walkMarker.position.set(floorHit.point.x, .018, floorHit.point.z); walkMarker.visible = true; }
    };
    renderer.domElement.addEventListener('click', handlePointer);
    let frame = 0; const resize = () => { const width = element.clientWidth; const height = element.clientHeight; renderer.setSize(width, height, false); camera.aspect = width / Math.max(height, 1); camera.updateProjectionMatrix(); }; const observer = new ResizeObserver(resize); observer.observe(element); resize();
    const cameraDirection = new THREE.Vector3(); const artworkDirection = new THREE.Vector3(); const artworkPosition = new THREE.Vector3();
    const animate = () => { intro?.update(); navigation?.update(); controls?.update(); if (walkMarker.visible) { walkMarker.rotation.z += .008; const material = walkMarker.material as THREE.MeshBasicMaterial; material.opacity = .5 + Math.sin(performance.now() * .006) * .25; if (!navigation?.hasDestination()) walkMarker.visible = false; } if (focusedArtwork && focusedArtworkId) { camera.getWorldDirection(cameraDirection); focusedArtwork.getWorldPosition(artworkPosition); artworkDirection.subVectors(artworkPosition, camera.position); const distance = artworkDirection.length(); const facing = cameraDirection.dot(artworkDirection.normalize()); if (facing < .48 || distance > 8) { focusedArtwork = null; focusedArtworkId = null; onArtworkFocus?.(null); } } element.dataset.cameraPosition = camera.position.toArray().map((value) => value.toFixed(2)).join(','); element.dataset.intro = intro && !intro.isComplete() ? 'active' : 'complete'; renderer.render(scene, camera); frame = requestAnimationFrame(animate); }; animate();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); renderer.domElement.removeEventListener('click', handlePointer); intro?.dispose(); intro = null; navigation?.dispose(); controls?.dispose(); scene.traverse((object) => { const mesh = object as THREE.Mesh; mesh.geometry?.dispose(); const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]; materials.filter(Boolean).forEach((raw) => { const material = raw as THREE.MeshStandardMaterial; material.map?.dispose(); material.dispose(); }); }); renderer.dispose(); renderer.domElement.remove(); };
  }, [draft, selectedId, selectedDecorId, onSelect, onSelectDecor, visitor, viewMode, playIntro, onIntroComplete, onArtworkFocus]);
  return <div className={`gallery-scene gallery-scene--${visitor ? viewMode : 'edit'}`} ref={host}><div className="scene-hint">{visitor ? viewMode === 'walk' ? 'WASD / arrows to walk · Drag to look' : 'Overview · Drag to orbit · Scroll to zoom' : 'Drag to look · Scroll to move'}</div></div>;
}

export function DannyDemoScene({ viewMode = 'walk', playIntro = false, onIntroComplete, onArtworkFocus }: { viewMode?: GalleryViewMode; playIntro?: boolean; onIntroComplete?: () => void; onArtworkFocus?: (artwork: ArtworkFocusInfo | null) => void }) {
  const host = useRef<HTMLDivElement>(null); const introPlayed = useRef(false);
  useEffect(() => {
    if (!host.current) return; const element = host.current; const scene = new THREE.Scene(); scene.background = new THREE.Color('#080908');
    const camera = new THREE.PerspectiveCamera(62, 1, .04, 120); camera.position.set(0, 1.68, 4.8);
    let renderer: THREE.WebGLRenderer; try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); } catch { return showSceneError(element); } renderer.setPixelRatio(Math.min(devicePixelRatio, 1.4)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .48; element.appendChild(renderer.domElement);
    const walk = viewMode === 'walk'; const controls = walk ? null : new OrbitControls(camera, renderer.domElement); if (controls) { controls.enableDamping = true; controls.target.set(0, 2.4, -2.8); controls.maxPolarAngle = Math.PI / 2; controls.minDistance = 2.5; controls.maxDistance = 22; controls.enablePan = false; controls.autoRotate = true; controls.autoRotateSpeed = .32; }
    scene.add(new THREE.AmbientLight('#fff4df', .08), new THREE.HemisphereLight('#ffe6ba', '#111310', .2));
    let bounds: Bounds = { minX: -7, maxX: 7, minZ: -8, maxZ: 7 }; const navigation = walk ? createFirstPersonWalk(camera, renderer.domElement, () => bounds) : null; navigation?.setEnabled(!playIntro); let destroyed = false; let intro: ReturnType<typeof createCinematicIntro> | null = null; let modelErrorCleanup: (() => void) | null = null;
    const artworkObjects: THREE.Object3D[] = []; const floorObjects: THREE.Object3D[] = []; let artworkIndex = 0; let focusedArtwork: THREE.Object3D | null = null; const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2();
    const walkMarker = new THREE.Mesh(new THREE.RingGeometry(.18, .25, 32), new THREE.MeshBasicMaterial({ color: '#d9ff43', transparent: true, opacity: .78, side: THREE.DoubleSide })); walkMarker.rotation.x = -Math.PI / 2; walkMarker.visible = false; if (walk) scene.add(walkMarker);
    const handlePointer = (event: PointerEvent) => { if (!walk || !navigation?.consumeClick()) return; const box = renderer.domElement.getBoundingClientRect(); pointer.set(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1); raycaster.setFromCamera(pointer, camera); const artHit = raycaster.intersectObjects(artworkObjects, true)[0]; const info = artHit?.object.userData.focusInfo as ArtworkFocusInfo | undefined; if (artHit && info) { focusedArtwork = artHit.object; onArtworkFocus?.(info); return; } const floorHit = raycaster.intersectObjects(floorObjects, true)[0]; if (floorHit) { focusedArtwork = null; onArtworkFocus?.(null); navigation.moveTo(floorHit.point); walkMarker.position.copy(floorHit.point); walkMarker.position.y += .02; walkMarker.visible = true; } };
    renderer.domElement.addEventListener('click', handlePointer);
    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder); loader.load('./assets/demo/danny-gallery.glb', (gltf) => {
      if (destroyed) return; scene.add(gltf.scene); gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((object) => {
        if ((object as THREE.Camera).isCamera || object.name.startsWith('COLLIDER_') || object.userData?.kind === 'aabb' || object.userData?.kind === 'view') object.visible = false;
        if ((object as THREE.Light).isLight) (object as THREE.Light).intensity *= .065;
        const mesh = object as THREE.Mesh; if (!mesh.isMesh) return; const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]; let clickableArtwork = false; let isFloor = false;
        materials.forEach((raw) => { const material = raw as THREE.MeshStandardMaterial; const name = `${object.name} ${material.name}`.toLowerCase(); const metadataRole = String(object.userData?.theme_role || material.userData?.theme_role || '').toLowerCase(); const isArtwork = metadataRole === 'artwork' || /artwork|surface|wartrobe/.test(name) || Boolean(object.userData?.artwork_id); clickableArtwork ||= metadataRole === 'artwork' || /artwork|painting|canvas|picture|wartrobe/.test(name) || Boolean(object.userData?.artwork_id); isFloor ||= metadataRole === 'floor' || /floor|marble|ground/.test(name); if (material.emissive) { material.emissive.set('#000000'); material.emissiveIntensity = 0; } if (isArtwork) { material.color?.set('#ffffff'); material.roughness = .68; } else if (material.color) { const color = metadataRole === 'floor' || /floor|marble|stone/.test(name) ? '#101111' : metadataRole === 'wall' || /wall/.test(name) ? '#393631' : metadataRole === 'ceiling' || /ceiling/.test(name) ? '#1b1c1a' : metadataRole === 'bronze' || /bronze|frame|trim/.test(name) ? '#8e6c3e' : /leaf|stem|botanical/.test(name) ? '#29452a' : '#181916'; material.color.set(color); material.roughness = metadataRole === 'bronze' || /bronze|frame|trim/.test(name) ? .38 : .72; } material.needsUpdate = true; });
        if (clickableArtwork) { artworkIndex += 1; const info: ArtworkFocusInfo = { id: String(object.userData?.artwork_id || object.uuid), title: String(object.userData?.artwork_title || `Threshold — Study ${String(artworkIndex).padStart(2, '0')}`), artist: 'Danny Hirsch', description: 'An original work presented in the Threshold virtual exhibition.', year: '2026' }; object.userData.focusInfo = info; object.traverse((child) => { child.userData.focusInfo = info; }); artworkObjects.push(object); }
        if (isFloor) floorObjects.push(object);
      });
      const start = gltf.scene.getObjectByName('Walk_Start'); const target = gltf.scene.getObjectByName('Walk_LookTarget'); const minimum = gltf.scene.getObjectByName('Walk_Bounds_Min'); const maximum = gltf.scene.getObjectByName('Walk_Bounds_Max');
      if (start) camera.position.copy(start.getWorldPosition(new THREE.Vector3())); const finalPosition = camera.position.clone(); const lookTarget = target?.getWorldPosition(new THREE.Vector3()) ?? new THREE.Vector3(0, 2.4, -2.8); navigation?.lookAt(lookTarget); if (controls) controls.target.copy(lookTarget);
      if (minimum && maximum) { const a = minimum.getWorldPosition(new THREE.Vector3()); const b = maximum.getWorldPosition(new THREE.Vector3()); bounds = { minX: Math.min(a.x,b.x) + .35, maxX: Math.max(a.x,b.x) - .35, minZ: Math.min(a.z,b.z) + .35, maxZ: Math.max(a.z,b.z) - .35 }; }
      if (navigation && playIntro && !introPlayed.current) { const width = bounds.maxX - bounds.minX; const depth = bounds.maxZ - bounds.minZ; intro = createCinematicIntro(camera, [finalPosition.clone().add(new THREE.Vector3(0, 1.05, 0)), new THREE.Vector3(bounds.minX + width * .28, finalPosition.y + .45, bounds.maxZ - depth * .35), new THREE.Vector3(bounds.maxX - width * .3, finalPosition.y + .25, bounds.minZ + depth * .3), finalPosition], lookTarget, navigation, element, () => { introPlayed.current = true; onIntroComplete?.(); }); } else navigation?.setEnabled(true);
      controls?.update();
    }, undefined, () => { element.dataset.error = 'true'; modelErrorCleanup = showSceneError(element, 'The exhibition model could not be loaded. Please check your connection and try again.'); });
    let frame = 0; const resize = () => { const width = element.clientWidth; const height = element.clientHeight; renderer.setSize(width, height, false); camera.aspect = width / Math.max(height, 1); camera.updateProjectionMatrix(); }; const observer = new ResizeObserver(resize); observer.observe(element); resize();
    const cameraDirection = new THREE.Vector3(); const artworkDirection = new THREE.Vector3(); const artworkPosition = new THREE.Vector3();
    const animate = () => { intro?.update(); navigation?.update(); controls?.update(); if (walkMarker.visible) { walkMarker.rotation.z += .008; const material = walkMarker.material as THREE.MeshBasicMaterial; material.opacity = .5 + Math.sin(performance.now() * .006) * .25; if (!navigation?.hasDestination()) walkMarker.visible = false; } if (focusedArtwork) { camera.getWorldDirection(cameraDirection); focusedArtwork.getWorldPosition(artworkPosition); artworkDirection.subVectors(artworkPosition, camera.position); if (cameraDirection.dot(artworkDirection.normalize()) < .48) { focusedArtwork = null; onArtworkFocus?.(null); } } element.dataset.cameraPosition = camera.position.toArray().map((value) => value.toFixed(2)).join(','); element.dataset.intro = intro && !intro.isComplete() ? 'active' : 'complete'; renderer.render(scene, camera); frame = requestAnimationFrame(animate); }; animate();
    return () => { destroyed = true; cancelAnimationFrame(frame); observer.disconnect(); renderer.domElement.removeEventListener('click', handlePointer); intro?.dispose(); modelErrorCleanup?.(); navigation?.dispose(); controls?.dispose(); renderer.dispose(); renderer.domElement.remove(); };
  }, [viewMode, playIntro, onIntroComplete, onArtworkFocus]);
  return <div className={`gallery-scene gallery-scene--${viewMode}`} ref={host}><div className="scene-hint">{viewMode === 'walk' ? 'Danny Hirsch Arts · WASD / arrows · Drag to look' : 'Danny Hirsch Arts · Overview orbit'}</div></div>;
}
