import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { GalleryDraft, WallId } from './types';
import { getTemplate } from './templates';

const WALLS: Record<WallId, { position: (x: number, y: number, w: number, d: number) => [number, number, number]; rotation: [number, number, number] }> = {
  north: { position: (x, y, _w, d) => [x, y, -d / 2 + 0.035], rotation: [0, 0, 0] },
  west: { position: (x, y, w) => [-w / 2 + 0.035, y, x], rotation: [0, Math.PI / 2, 0] },
  east: { position: (x, y, w) => [w / 2 - 0.035, y, x], rotation: [0, -Math.PI / 2, 0] }
};

const wallColors = { chalk: '#e7e4dc', warm: '#b9a993', charcoal: '#30312f' };
const floorColors = { concrete: '#777672', oak: '#5c4633', terrazzo: '#a7a299' };

function addPlant(scene: THREE.Scene, x: number, z: number, broad = false) {
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(.35, .27, .65, 18), new THREE.MeshStandardMaterial({ color: '#282521', roughness: .8 }));
  pot.position.set(x, .34, z); scene.add(pot);
  const stemMaterial = new THREE.MeshStandardMaterial({ color: '#3c573a', roughness: .75 });
  for (let i = 0; i < (broad ? 6 : 9); i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(broad ? .34 : .18, 12, 8), stemMaterial);
    leaf.scale.set(broad ? .7 : .45, broad ? 1.5 : 2.8, .18);
    leaf.rotation.z = (i % 2 ? 1 : -1) * (.25 + i * .04);
    leaf.position.set(x + Math.sin(i * 1.9) * .3, .82 + i * .11, z + Math.cos(i * 2.1) * .22);
    scene.add(leaf);
  }
}

function buildRoom(scene: THREE.Scene, draft: GalleryDraft) {
  const template = getTemplate(draft.templateId);
  const [w, d] = template.dimensions;
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
  if (draft.templateId === 'nocturne') {
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(.75, .75, .7, 32), new THREE.MeshStandardMaterial({ color: '#151615', roughness: .75 })); plinth.position.set(0, .35, 1); scene.add(plinth);
  }
  if (draft.decor.includes('olive')) addPlant(scene, -w / 2 + .8, -d / 2 + .8);
  if (draft.decor.includes('monstera')) addPlant(scene, w / 2 - .8, -d / 2 + .8, true);
  if (draft.decor.includes('pedestal')) { const p = new THREE.Mesh(new THREE.BoxGeometry(.8, 1.15, .8), new THREE.MeshStandardMaterial({ color: '#d8d4cb' })); p.position.set(w / 2 - 1.5, .575, 1); scene.add(p); }
  if (draft.decor.includes('arc-lamp')) {
    const metal = new THREE.MeshStandardMaterial({ color: '#181818', metalness: .7, roughness: .3 });
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, 2.8, 12), metal); stem.position.set(-w / 2 + 1.2, 1.4, 1.5); scene.add(stem);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(.32, .42, 20, 1, true), metal); shade.rotation.x = Math.PI; shade.position.set(-w / 2 + 1.2, 2.65, 1.5); scene.add(shade);
  }
  return [w, d] as const;
}

function addLighting(scene: THREE.Scene, preset: GalleryDraft['lighting']) {
  const settings = {
    daylight: { bg: '#d6d8d5', hemi: 2.2, key: 3.2, color: '#fff7e8' },
    museum: { bg: '#111311', hemi: 1.0, key: 5.4, color: '#ffe6bd' },
    evening: { bg: '#171516', hemi: .7, key: 4.2, color: '#ffca8d' }
  }[preset];
  scene.background = new THREE.Color(settings.bg);
  scene.add(new THREE.HemisphereLight('#eef3ff', '#3b342e', settings.hemi));
  const main = new THREE.DirectionalLight(settings.color, settings.key); main.position.set(-3, 7, 5); main.castShadow = true; main.shadow.mapSize.set(1024, 1024); scene.add(main);
  [-3, 0, 3].forEach((x) => { const spot = new THREE.SpotLight(settings.color, 18, 9, .45, .8, 1.5); spot.position.set(x, 4.25, -1); spot.target.position.set(x, 1.6, -4); scene.add(spot, spot.target); });
}

export function GalleryScene({ draft, selectedId, onSelect, visitor = false }: { draft: GalleryDraft; selectedId?: string; onSelect?: (id: string) => void; visitor?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    const element = host.current;
    const scene = new THREE.Scene();
    const template = getTemplate(draft.templateId);
    const camera = new THREE.PerspectiveCamera(48, 1, .1, 70); camera.position.set(...template.camera);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05; element.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.target.set(0, 1.6, -1.5); controls.maxPolarAngle = Math.PI / 2 - .03; controls.minDistance = 2.1; controls.maxDistance = 15; controls.enablePan = visitor;
    const [w, d] = buildRoom(scene, draft); addLighting(scene, draft.lighting);
    const clickable: THREE.Object3D[] = [];
    draft.artworks.forEach((artwork) => {
      const texture = new THREE.TextureLoader().load(artwork.src); texture.colorSpace = THREE.SRGBColorSpace;
      const height = 1.5 * artwork.scale; const width = height * artwork.aspect;
      const group = new THREE.Group(); group.userData.artworkId = artwork.id;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(width + .12, height + .12, .07), new THREE.MeshStandardMaterial({ color: selectedId === artwork.id ? '#b8945f' : '#1c1b19', metalness: .2, roughness: .45 }));
      const canvas = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map: texture, roughness: .72 })); canvas.position.z = .041; group.add(frame, canvas);
      const config = WALLS[artwork.wall]; const [px, py, pz] = config.position(artwork.x, artwork.y, w, d); group.position.set(px, py, pz); group.rotation.set(...config.rotation); group.traverse((item) => { item.userData.artworkId = artwork.id; }); scene.add(group); clickable.push(group);
    });
    const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2();
    const handlePointer = (event: PointerEvent) => { if (visitor || !onSelect) return; const box = renderer.domElement.getBoundingClientRect(); pointer.set(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1); raycaster.setFromCamera(pointer, camera); const hit = raycaster.intersectObjects(clickable, true)[0]; const id = hit?.object.userData.artworkId as string | undefined; if (id) onSelect(id); };
    renderer.domElement.addEventListener('pointerdown', handlePointer);
    let frame = 0; const resize = () => { const width = element.clientWidth; const height = element.clientHeight; renderer.setSize(width, height, false); camera.aspect = width / Math.max(height, 1); camera.updateProjectionMatrix(); }; const observer = new ResizeObserver(resize); observer.observe(element); resize();
    const animate = () => { controls.update(); renderer.render(scene, camera); frame = requestAnimationFrame(animate); }; animate();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); renderer.domElement.removeEventListener('pointerdown', handlePointer); controls.dispose(); scene.traverse((object) => { const mesh = object as THREE.Mesh; mesh.geometry?.dispose(); const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]; materials.filter(Boolean).forEach((material) => { const m = material as THREE.MeshStandardMaterial; m.map?.dispose(); m.dispose(); }); }); renderer.dispose(); renderer.domElement.remove(); };
  }, [draft, selectedId, onSelect, visitor]);
  return <div className="gallery-scene" ref={host}><div className="scene-hint">Drag to look · Scroll to move</div></div>;
}

export function DannyDemoScene() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return; const element = host.current; const scene = new THREE.Scene(); scene.background = new THREE.Color('#080908');
    const camera = new THREE.PerspectiveCamera(62, 1, .04, 120); camera.position.set(0, 1.68, 4.8);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.4)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .9; element.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.target.set(0, 2.4, -2.8); controls.maxPolarAngle = Math.PI / 2; controls.minDistance = 1; controls.maxDistance = 20;
    scene.add(new THREE.AmbientLight('#fff4df', .12), new THREE.HemisphereLight('#ffe6ba', '#111310', .32));
    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder); loader.load('./assets/demo/danny-gallery.glb', (gltf) => {
      scene.add(gltf.scene); gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((object) => {
        if ((object as THREE.Camera).isCamera || object.name.startsWith('COLLIDER_') || object.userData?.kind === 'aabb' || object.userData?.kind === 'view') object.visible = false;
        if ((object as THREE.Light).isLight) (object as THREE.Light).intensity *= .18;
        const mesh = object as THREE.Mesh; if (!mesh.isMesh) return;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((raw) => {
          const material = raw as THREE.MeshStandardMaterial; const name = `${object.name} ${material.name}`.toLowerCase();
          const isArtwork = /artwork|surface|wartrobe/.test(name) || Boolean(object.userData?.artwork_id);
          if (!isArtwork && material.color) {
            const color = /floor|marble|stone/.test(name) ? '#101111' : /wall/.test(name) ? '#393631' : /ceiling/.test(name) ? '#1b1c1a' : /bronze|frame|trim/.test(name) ? '#8e6c3e' : /leaf|stem|botanical/.test(name) ? '#29452a' : '#181916';
            material.color.set(color); material.roughness = /bronze|frame|trim/.test(name) ? .38 : .72; material.needsUpdate = true;
          }
        });
      });
      const start = gltf.scene.getObjectByName('Walk_Start'); const target = gltf.scene.getObjectByName('Walk_LookTarget');
      if (start) camera.position.copy(start.getWorldPosition(new THREE.Vector3()));
      if (target) controls.target.copy(target.getWorldPosition(new THREE.Vector3()));
      controls.update();
    }, undefined, () => { element.dataset.error = 'true'; });
    let frame = 0; const resize = () => { const width = element.clientWidth; const height = element.clientHeight; renderer.setSize(width, height, false); camera.aspect = width / Math.max(height, 1); camera.updateProjectionMatrix(); }; const observer = new ResizeObserver(resize); observer.observe(element); resize(); const animate = () => { controls.update(); renderer.render(scene, camera); frame = requestAnimationFrame(animate); }; animate();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); controls.dispose(); renderer.dispose(); renderer.domElement.remove(); };
  }, []);
  return <div className="gallery-scene" ref={host}><div className="scene-hint">Danny Hirsch Arts · Interactive room</div></div>;
}
