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

function buildRoom(scene: THREE.Scene, draft: GalleryDraft, selectedDecorId?: string) {
  const [w, d] = getTemplate(draft.templateId).dimensions;
  const wall = new THREE.MeshStandardMaterial({ color: wallColors[draft.wall], roughness: .83 });
  const floor = new THREE.MeshStandardMaterial({ color: floorColors[draft.floor], roughness: draft.floor === 'oak' ? .55 : .88, metalness: .03 });
  const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floor); floorMesh.rotation.x = -Math.PI / 2; floorMesh.receiveShadow = true; scene.add(floorMesh);
  const addWall = (geometry: THREE.BufferGeometry, position: [number, number, number]) => { const mesh = new THREE.Mesh(geometry, wall); mesh.position.set(...position); mesh.receiveShadow = true; scene.add(mesh); };
  addWall(new THREE.BoxGeometry(w, 4.8, .12), [0, 2.4, -d / 2]);
  addWall(new THREE.BoxGeometry(.12, 4.8, d), [-w / 2, 2.4, 0]);
  addWall(new THREE.BoxGeometry(.12, 4.8, d), [w / 2, 2.4, 0]);
  if (draft.templateId === 'pavilion') {
    const divider = new THREE.Mesh(new THREE.BoxGeometry(4.4, 3.5, .18), wall); divider.position.set(0, 1.75, -.5); scene.add(divider);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.2, .4, .65), new THREE.MeshStandardMaterial({ color: '#26231f', roughness: .6 })); bench.position.set(0, .35, 2.4); bench.castShadow = true; scene.add(bench);
  }
  if (draft.templateId === 'nocturne') { const plinth = new THREE.Mesh(new THREE.CylinderGeometry(.75, .75, .7, 32), new THREE.MeshStandardMaterial({ color: '#151615', roughness: .75 })); plinth.position.set(0, .35, 1); scene.add(plinth); }
  const decorObjects = draft.decor.map((item) => createDecor(item, selectedDecorId === item.id));
  decorObjects.forEach((item) => { item.position.x = THREE.MathUtils.clamp(item.position.x, -w / 2 + .45, w / 2 - .45); item.position.z = THREE.MathUtils.clamp(item.position.z, -d / 2 + .45, d / 2 - .45); scene.add(item); });
  return { w, d, decorObjects };
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

function createBoundedWalk(camera: THREE.PerspectiveCamera, controls: OrbitControls, bounds: () => Bounds) {
  const keys = new Set<string>();
  const keyDown = (event: KeyboardEvent) => { if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code)) { keys.add(event.code); event.preventDefault(); } };
  const keyUp = (event: KeyboardEvent) => keys.delete(event.code);
  window.addEventListener('keydown', keyDown); window.addEventListener('keyup', keyUp);
  const clock = new THREE.Clock(); const forward = new THREE.Vector3(); const right = new THREE.Vector3(); const move = new THREE.Vector3();
  const update = () => {
    const delta = Math.min(clock.getDelta(), .05); forward.subVectors(controls.target, camera.position); forward.y = 0; if (forward.lengthSq() < .001) forward.set(0, 0, -1); forward.normalize(); right.crossVectors(forward, camera.up).normalize(); move.set(0, 0, 0);
    if (keys.has('KeyW') || keys.has('ArrowUp')) move.add(forward);
    if (keys.has('KeyS') || keys.has('ArrowDown')) move.sub(forward);
    if (keys.has('KeyD') || keys.has('ArrowRight')) move.add(right);
    if (keys.has('KeyA') || keys.has('ArrowLeft')) move.sub(right);
    if (move.lengthSq()) { move.normalize().multiplyScalar(delta * 2.6); camera.position.add(move); controls.target.add(move); }
    const current = bounds(); const oldX = camera.position.x; const oldZ = camera.position.z;
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, current.minX, current.maxX); camera.position.z = THREE.MathUtils.clamp(camera.position.z, current.minZ, current.maxZ);
    controls.target.x += camera.position.x - oldX; controls.target.z += camera.position.z - oldZ;
  };
  return { update, dispose: () => { window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); } };
}

interface GallerySceneProps {
  draft: GalleryDraft; selectedId?: string; selectedDecorId?: string;
  onSelect?: (id: string) => void; onSelectDecor?: (id: string) => void; visitor?: boolean;
}

export function GalleryScene({ draft, selectedId, selectedDecorId, onSelect, onSelectDecor, visitor = false }: GallerySceneProps) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return; const element = host.current; const scene = new THREE.Scene(); const template = getTemplate(draft.templateId);
    const camera = new THREE.PerspectiveCamera(visitor ? 62 : 48, 1, .1, 70); camera.position.set(...template.camera);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05; element.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.target.set(0, 1.6, -1.5); controls.maxPolarAngle = Math.PI / 2 - .03; controls.minDistance = visitor ? .3 : 2.1; controls.maxDistance = visitor ? 25 : 15; controls.enablePan = false;
    const { w, d, decorObjects } = buildRoom(scene, draft, selectedDecorId); addLighting(scene, draft.lighting);
    const roomBounds = { minX: -w / 2 + .45, maxX: w / 2 - .45, minZ: -d / 2 + .45, maxZ: d / 2 - .45 };
    if (visitor) { camera.position.set(0, 1.68, d / 2 - 1); controls.target.set(0, 1.68, -1); }
    const navigation = visitor ? createBoundedWalk(camera, controls, () => roomBounds) : null;
    const artworkObjects: THREE.Object3D[] = [];
    draft.artworks.forEach((artwork) => {
      const texture = new THREE.TextureLoader().load(artwork.src); texture.colorSpace = THREE.SRGBColorSpace; const height = 1.5 * artwork.scale; const width = height * artwork.aspect;
      const group = new THREE.Group(); group.userData.artworkId = artwork.id;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(width + .12, height + .12, .07), new THREE.MeshStandardMaterial({ color: selectedId === artwork.id ? '#b8945f' : '#1c1b19', metalness: .2, roughness: .45 }));
      const canvas = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map: texture, roughness: .72 })); canvas.position.z = .041; group.add(frame, canvas);
      const config = WALLS[artwork.wall]; const [px, py, pz] = config.position(artwork.x, artwork.y, w, d); group.position.set(px, py, pz); group.rotation.set(...config.rotation); group.traverse((item) => { item.userData.artworkId = artwork.id; }); scene.add(group); artworkObjects.push(group);
    });
    const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2();
    const handlePointer = (event: PointerEvent) => { if (visitor) return; const box = renderer.domElement.getBoundingClientRect(); pointer.set(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1); raycaster.setFromCamera(pointer, camera); const hit = raycaster.intersectObjects([...artworkObjects, ...decorObjects], true)[0]; const artworkId = hit?.object.userData.artworkId as string | undefined; const decorId = hit?.object.userData.decorId as string | undefined; if (artworkId) onSelect?.(artworkId); else if (decorId) onSelectDecor?.(decorId); };
    renderer.domElement.addEventListener('click', handlePointer);
    let frame = 0; const resize = () => { const width = element.clientWidth; const height = element.clientHeight; renderer.setSize(width, height, false); camera.aspect = width / Math.max(height, 1); camera.updateProjectionMatrix(); }; const observer = new ResizeObserver(resize); observer.observe(element); resize();
    const animate = () => { navigation?.update(); controls.update(); element.dataset.cameraPosition = camera.position.toArray().map((value) => value.toFixed(2)).join(','); renderer.render(scene, camera); frame = requestAnimationFrame(animate); }; animate();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); renderer.domElement.removeEventListener('click', handlePointer); navigation?.dispose(); controls.dispose(); scene.traverse((object) => { const mesh = object as THREE.Mesh; mesh.geometry?.dispose(); const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]; materials.filter(Boolean).forEach((raw) => { const material = raw as THREE.MeshStandardMaterial; material.map?.dispose(); material.dispose(); }); }); renderer.dispose(); renderer.domElement.remove(); };
  }, [draft, selectedId, selectedDecorId, onSelect, onSelectDecor, visitor]);
  return <div className="gallery-scene" ref={host}><div className="scene-hint">{visitor ? 'WASD / arrows to walk · Drag to look' : 'Drag to look · Scroll to move'}</div></div>;
}

export function DannyDemoScene() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return; const element = host.current; const scene = new THREE.Scene(); scene.background = new THREE.Color('#080908');
    const camera = new THREE.PerspectiveCamera(62, 1, .04, 120); camera.position.set(0, 1.68, 4.8);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.4)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .48; element.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.target.set(0, 2.4, -2.8); controls.maxPolarAngle = Math.PI / 2; controls.minDistance = .3; controls.maxDistance = 30; controls.enablePan = false;
    scene.add(new THREE.AmbientLight('#fff4df', .08), new THREE.HemisphereLight('#ffe6ba', '#111310', .2));
    let bounds: Bounds = { minX: -7, maxX: 7, minZ: -8, maxZ: 7 }; const navigation = createBoundedWalk(camera, controls, () => bounds); let destroyed = false;
    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder); loader.load('./assets/demo/danny-gallery.glb', (gltf) => {
      if (destroyed) return; scene.add(gltf.scene); gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((object) => {
        if ((object as THREE.Camera).isCamera || object.name.startsWith('COLLIDER_') || object.userData?.kind === 'aabb' || object.userData?.kind === 'view') object.visible = false;
        if ((object as THREE.Light).isLight) (object as THREE.Light).intensity *= .065;
        const mesh = object as THREE.Mesh; if (!mesh.isMesh) return; const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((raw) => { const material = raw as THREE.MeshStandardMaterial; const name = `${object.name} ${material.name}`.toLowerCase(); const metadataRole = String(object.userData?.theme_role || material.userData?.theme_role || '').toLowerCase(); const isArtwork = metadataRole === 'artwork' || /artwork|surface|wartrobe/.test(name) || Boolean(object.userData?.artwork_id); if (material.emissive) { material.emissive.set('#000000'); material.emissiveIntensity = 0; } if (isArtwork) { material.color?.set('#ffffff'); material.roughness = .68; } else if (material.color) { const color = metadataRole === 'floor' || /floor|marble|stone/.test(name) ? '#101111' : metadataRole === 'wall' || /wall/.test(name) ? '#393631' : metadataRole === 'ceiling' || /ceiling/.test(name) ? '#1b1c1a' : metadataRole === 'bronze' || /bronze|frame|trim/.test(name) ? '#8e6c3e' : /leaf|stem|botanical/.test(name) ? '#29452a' : '#181916'; material.color.set(color); material.roughness = metadataRole === 'bronze' || /bronze|frame|trim/.test(name) ? .38 : .72; } material.needsUpdate = true; });
      });
      const start = gltf.scene.getObjectByName('Walk_Start'); const target = gltf.scene.getObjectByName('Walk_LookTarget'); const minimum = gltf.scene.getObjectByName('Walk_Bounds_Min'); const maximum = gltf.scene.getObjectByName('Walk_Bounds_Max');
      if (start) camera.position.copy(start.getWorldPosition(new THREE.Vector3())); if (target) controls.target.copy(target.getWorldPosition(new THREE.Vector3()));
      if (minimum && maximum) { const a = minimum.getWorldPosition(new THREE.Vector3()); const b = maximum.getWorldPosition(new THREE.Vector3()); bounds = { minX: Math.min(a.x,b.x) + .35, maxX: Math.max(a.x,b.x) - .35, minZ: Math.min(a.z,b.z) + .35, maxZ: Math.max(a.z,b.z) - .35 }; }
      controls.update();
    }, undefined, () => { element.dataset.error = 'true'; });
    let frame = 0; const resize = () => { const width = element.clientWidth; const height = element.clientHeight; renderer.setSize(width, height, false); camera.aspect = width / Math.max(height, 1); camera.updateProjectionMatrix(); }; const observer = new ResizeObserver(resize); observer.observe(element); resize();
    const animate = () => { navigation.update(); controls.update(); element.dataset.cameraPosition = camera.position.toArray().map((value) => value.toFixed(2)).join(','); renderer.render(scene, camera); frame = requestAnimationFrame(animate); }; animate();
    return () => { destroyed = true; cancelAnimationFrame(frame); observer.disconnect(); navigation.dispose(); controls.dispose(); renderer.dispose(); renderer.domElement.remove(); };
  }, []);
  return <div className="gallery-scene" ref={host}><div className="scene-hint">Danny Hirsch Arts · WASD / arrows to walk</div></div>;
}
