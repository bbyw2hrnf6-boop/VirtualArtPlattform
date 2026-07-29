import { memo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { DecorPlacement, GalleryDraft, WallId } from './types';
import { getTemplate } from './templates';

type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };
const WALLS: Record<WallId, { position: (x: number, y: number, w: number, d: number) => [number, number, number]; rotation: [number, number, number] }> = {
  north: { position: (x, y, _w, d) => [x, y, -d / 2 + .035], rotation: [0, 0, 0] },
  south: { position: (x, y, _w, d) => [x, y, d / 2 - .035], rotation: [0, Math.PI, 0] },
  west: { position: (x, y, w) => [-w / 2 + .035, y, x], rotation: [0, Math.PI / 2, 0] },
  east: { position: (x, y, w) => [w / 2 - .035, y, x], rotation: [0, -Math.PI / 2, 0] },
  'divider-front': { position: (x, y) => [x, y, -.395], rotation: [0, 0, 0] },
  'divider-back': { position: (x, y) => [x, y, -.605], rotation: [0, Math.PI, 0] }
};
const PAVILION_DIVIDER_WIDTH = 6.2;
const wallColors = { chalk: '#dfdcd4', warm: '#ae9f8c', travertine: '#d7cbb6', linen: '#c8c0b3', charcoal: '#292b29' };
const floorColors = { concrete: '#777672', oak: '#49382b', terrazzo: '#a7a299', marble: '#d8d4cb' };
type SurfaceKind = GalleryDraft['wall'] | GalleryDraft['floor'];
const surfaceAssets: Partial<Record<SurfaceKind, string>> = {
  marble: './assets/materials/carrara-marble.webp',
  travertine: './assets/materials/roman-travertine.webp'
};

function createSurfaceTexture(kind: SurfaceKind, base: string) {
  const asset = surfaceAssets[kind];
  if (asset) {
    const texture = new THREE.TextureLoader().load(asset); texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 8;
    texture.repeat.set(kind === 'marble' ? 1.25 : 2.2, kind === 'marble' ? 1.25 : 1.8); return texture;
  }
  const size = 512; const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
  const context = canvas.getContext('2d'); if (!context) throw new Error('Surface texture could not be created.');
  context.fillStyle = base; context.fillRect(0, 0, size, size);
  let seed = kind.split('').reduce((total, letter) => total + letter.charCodeAt(0), 17);
  const random = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  if (kind === 'linen') {
    for (let x = 0; x < size; x += 4) { context.fillStyle = x % 8 ? '#ffffff12' : '#332d2515'; context.fillRect(x, 0, 1, size); }
    for (let y = 0; y < size; y += 4) { context.fillStyle = y % 8 ? '#ffffff0e' : '#332d2512'; context.fillRect(0, y, size, 1); }
    for (let fibre = 0; fibre < 1800; fibre++) { context.fillStyle = random() > .5 ? '#fffdf50d' : '#312c2610'; context.fillRect(random() * size, random() * size, .4 + random() * 1.2, .4 + random() * 2); }
  } else if (kind === 'oak') {
    const rowHeight = 64;
    for (let row = 0; row < 8; row++) {
      const y = row * rowHeight; context.fillStyle = row % 2 ? '#f2c98d0b' : '#20140d12'; context.fillRect(0, y, size, rowHeight);
      context.fillStyle = '#21150f66'; context.fillRect(0, y, size, 1);
      const offset = row % 2 ? 128 : 0; for (let x = offset; x < size; x += 256) context.fillRect(x, y, 1, rowHeight);
      for (let grain = 0; grain < 12; grain++) { const grainY = y + 6 + random() * 50; context.strokeStyle = `rgba(27,15,9,${.025 + random() * .055})`; context.lineWidth = .7 + random(); context.beginPath(); context.moveTo(0, grainY); context.bezierCurveTo(130, grainY + random() * 7, 360, grainY - random() * 7, size, grainY + random() * 3); context.stroke(); }
    }
  } else if (kind === 'marble') {
    const wash = context.createLinearGradient(0, 0, size, size); wash.addColorStop(0, '#f4f1e9'); wash.addColorStop(.48, base); wash.addColorStop(1, '#bbb8b1'); context.fillStyle = wash; context.fillRect(0, 0, size, size);
    for (let vein = 0; vein < 16; vein++) {
      const startY = -80 + random() * 670; const drift = -150 + random() * 300; const dark = random() > .3;
      context.strokeStyle = dark ? `rgba(76,79,77,${.035 + random() * .09})` : `rgba(255,252,242,${.12 + random() * .16})`; context.lineWidth = 5 + random() * 18; context.beginPath(); context.moveTo(-30, startY); context.bezierCurveTo(120, startY + drift * .35, 330, startY + drift * .8, size + 30, startY + drift); context.stroke();
      context.strokeStyle = dark ? `rgba(65,69,68,${.11 + random() * .13})` : `rgba(255,255,251,${.26 + random() * .18})`; context.lineWidth = .6 + random() * 2.2; context.beginPath(); context.moveTo(-30, startY); context.bezierCurveTo(120, startY + drift * .35, 330, startY + drift * .8, size + 30, startY + drift); context.stroke();
    }
  } else if (kind === 'terrazzo') {
    const chips = ['#eee9dc', '#555652', '#b99a7d', '#8e8177', '#242624'];
    for (let index = 0; index < 900; index++) { const x = random() * size; const y = random() * size; const radius = 1 + random() * 4; context.fillStyle = `${chips[Math.floor(random() * chips.length)]}${Math.floor(80 + random() * 100).toString(16).padStart(2, '0')}`; context.beginPath(); context.moveTo(x + radius, y); context.lineTo(x - radius * .65, y + radius * .72); context.lineTo(x - radius * .35, y - radius); context.closePath(); context.fill(); }
  } else if (kind === 'concrete') {
    for (let index = 0; index < 2100; index++) { const light = random() > .48; const alpha = .012 + random() * .05; const grainSize = .4 + random() * 1.7; context.fillStyle = light ? `rgba(255,250,238,${alpha})` : `rgba(25,24,22,${alpha})`; context.fillRect(random() * size, random() * size, grainSize, grainSize); }
    for (let cloud = 0; cloud < 34; cloud++) { const gradient = context.createRadialGradient(random() * size, random() * size, 1, random() * size, random() * size, 25 + random() * 70); gradient.addColorStop(0, random() > .5 ? '#ffffff0a' : '#1818180c'); gradient.addColorStop(1, '#00000000'); context.fillStyle = gradient; context.fillRect(0, 0, size, size); }
  } else {
    for (let patch = 0; patch < 70; patch++) { const x = random() * size; const y = random() * size; const radius = 8 + random() * 40; const gradient = context.createRadialGradient(x, y, 0, x, y, radius); gradient.addColorStop(0, random() > .5 ? '#ffffff0a' : '#1515130b'); gradient.addColorStop(1, '#00000000'); context.fillStyle = gradient; context.fillRect(x - radius, y - radius, radius * 2, radius * 2); }
    for (let grain = 0; grain < 1350; grain++) { const light = random() > .5; context.fillStyle = light ? `rgba(255,252,242,${.012 + random() * .025})` : `rgba(20,20,18,${.012 + random() * .028})`; const grainSize = .35 + random(); context.fillRect(random() * size, random() * size, grainSize, grainSize); }
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 4;
  if (kind === 'oak') texture.repeat.set(2.5, 3.5); else if (kind === 'marble') texture.repeat.set(1.35, 1.15); else if (kind === 'chalk' || kind === 'warm' || kind === 'charcoal') texture.repeat.set(3, 2.5); else texture.repeat.set(4, 3);
  return texture;
}

function showSceneError(element: HTMLElement, message = 'This gallery needs WebGL. Please enable hardware acceleration or open it in a current browser.') {
  const notice = document.createElement('div'); const label = document.createElement('span'); const detail = document.createElement('p'); notice.className = 'scene-error'; label.textContent = '3D VIEW UNAVAILABLE'; detail.textContent = message; notice.append(label, detail); element.appendChild(notice);
  return () => notice.remove();
}

function createPlant(broad = false) {
  const group = new THREE.Group();
  const ceramic = new THREE.MeshStandardMaterial({ color: broad ? '#c7bda9' : '#3b342c', roughness: .42, metalness: .04 });
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(.36, .27, .58, 32), ceramic); pot.position.y = .3;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(.345, .045, 10, 32), ceramic); rim.rotation.x = Math.PI / 2; rim.position.y = .59;
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, .035, 28), new THREE.MeshStandardMaterial({ color: '#17120e', roughness: 1 })); soil.position.y = .585;
  group.add(pot, rim, soil);
  const stemMaterial = new THREE.MeshStandardMaterial({ color: broad ? '#395235' : '#51472f', roughness: .82 });
  const leafMaterials = [
    new THREE.MeshStandardMaterial({ color: broad ? '#2e5637' : '#506640', roughness: .68 }),
    new THREE.MeshStandardMaterial({ color: broad ? '#3e6946' : '#68764b', roughness: .74 })
  ];
  const count = broad ? 8 : 13;
  for (let index = 0; index < count; index++) {
    const angle = index * 2.35 + (broad ? .25 : 0); const reach = broad ? .46 : .32; const height = .82 + (index % 5) * (broad ? .18 : .2);
    const end = new THREE.Vector3(Math.sin(angle) * reach, height, Math.cos(angle) * reach);
    const stemCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, .59, 0), new THREE.Vector3(end.x * .3, height * .8, end.z * .3), end);
    const stem = new THREE.Mesh(new THREE.TubeGeometry(stemCurve, 8, broad ? .018 : .012, 6, false), stemMaterial); group.add(stem);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(broad ? .3 : .145, 16, 10), leafMaterials[index % 2]);
    leaf.scale.set(broad ? .72 : .5, broad ? 1.55 : 2.15, broad ? .14 : .18); leaf.position.copy(end);
    leaf.rotation.set(Math.cos(angle) * .28, -angle, (index % 2 ? 1 : -1) * (broad ? .65 : .45)); group.add(leaf);
  }
  group.traverse((child) => { const mesh = child as THREE.Mesh; if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; } });
  return group;
}

function createDecor(item: DecorPlacement, selected: boolean) {
  const group = new THREE.Group(); group.userData.decorId = item.id;
  if (item.type === 'olive' || item.type === 'monstera') group.add(createPlant(item.type === 'monstera'));
  if (item.type === 'pedestal') {
    const plaster = new THREE.MeshStandardMaterial({ color: '#d8d4cb', roughness: .68 });
    const pedestal = new THREE.Mesh(new RoundedBoxGeometry(.84, 1.15, .84, 5, .035), plaster); pedestal.position.y = .575;
    const top = new THREE.Mesh(new RoundedBoxGeometry(.91, .075, .91, 4, .025), new THREE.MeshStandardMaterial({ color: '#e5e1d8', roughness: .58 })); top.position.y = 1.16; group.add(pedestal, top);
  }
  if (item.type === 'arc-lamp') {
    const metal = new THREE.MeshStandardMaterial({ color: '#171816', metalness: .82, roughness: .22 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(.37, .43, .085, 32), metal); base.position.y = .045; group.add(base);
    const arc = new THREE.CatmullRomCurve3([new THREE.Vector3(0, .08, 0), new THREE.Vector3(0, 1.65, 0), new THREE.Vector3(.32, 2.55, 0), new THREE.Vector3(1.05, 2.75, 0)]);
    const stem = new THREE.Mesh(new THREE.TubeGeometry(arc, 28, .028, 9, false), metal); group.add(stem);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(.2, .38, .4, 32, 1, true), metal); shade.position.set(1.05, 2.56, 0); group.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(.11, 18, 12), new THREE.MeshStandardMaterial({ color: '#fff2d3', emissive: '#ffbf72', emissiveIntensity: 2.4, roughness: .25 })); bulb.position.set(1.05, 2.39, 0); group.add(bulb);
    const glow = new THREE.PointLight('#ffd39a', 5.5, 5.5, 1.7); glow.position.copy(bulb.position); group.add(glow);
  }
  if (selected) {
    const marker = new THREE.Mesh(new THREE.RingGeometry(.46, .53, 32), new THREE.MeshBasicMaterial({ color: '#d9ff43', side: THREE.DoubleSide })); marker.rotation.x = -Math.PI / 2; marker.position.y = .015; group.add(marker);
  }
  group.position.set(item.x, 0, item.z); group.rotation.y = item.rotation; group.scale.setScalar(item.scale);
  group.traverse((child) => { child.userData.decorId = item.id; const mesh = child as THREE.Mesh; if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; } });
  return group;
}

function buildRoom(scene: THREE.Scene, draft: GalleryDraft, selectedDecorId?: string) {
  const [w, d] = getTemplate(draft.templateId).dimensions;
  const ceilingFinish = draft.ceiling ?? 'gallery';
  const ceilingProfiles = {
    gallery: { surface: 'chalk' as const, color: '#e9e6df', roughness: .88, bump: .005, emissive: '#fffdf7', glow: .3 },
    warm: { surface: 'warm' as const, color: '#a58d70', roughness: .9, bump: .012, emissive: '#d2ae80', glow: .22 },
    dark: { surface: 'charcoal' as const, color: '#202320', roughness: .78, bump: .009, emissive: '#343834', glow: .075 }
  }[ceilingFinish];
  const wallTexture = createSurfaceTexture(draft.wall, wallColors[draft.wall]); const floorTexture = createSurfaceTexture(draft.floor, floorColors[draft.floor]); const ceilingTexture = createSurfaceTexture(ceilingProfiles.surface, ceilingProfiles.color);
  const wallProfile = {
    chalk: { bump: .008, roughness: .84, clearcoat: .02 }, warm: { bump: .014, roughness: .88, clearcoat: .01 },
    travertine: { bump: .018, roughness: .72, clearcoat: .025 }, linen: { bump: .026, roughness: .94, clearcoat: 0 }, charcoal: { bump: .007, roughness: .76, clearcoat: .035 }
  }[draft.wall];
  // Texture-matched emissive fill approximates indirect bounce light. It keeps
  // one chosen wall finish visually consistent without flattening spotlights.
  const wall = new THREE.MeshPhysicalMaterial({ color: '#ffffff', map: wallTexture, bumpMap: wallTexture, bumpScale: wallProfile.bump, roughness: wallProfile.roughness, clearcoat: wallProfile.clearcoat, clearcoatRoughness: .82, emissive: '#ffffff', emissiveMap: wallTexture, emissiveIntensity: .22 });
  const ceiling = new THREE.MeshPhysicalMaterial({ color: '#ffffff', map: ceilingTexture, bumpMap: ceilingTexture, bumpScale: ceilingProfiles.bump, roughness: ceilingProfiles.roughness, emissive: ceilingProfiles.emissive, emissiveMap: ceilingTexture, emissiveIntensity: ceilingProfiles.glow });
  const floor = new THREE.MeshPhysicalMaterial({ color: '#ffffff', map: floorTexture, bumpMap: floorTexture, bumpScale: draft.floor === 'oak' ? .018 : draft.floor === 'marble' ? .0025 : .018, roughness: draft.floor === 'marble' ? .31 : draft.floor === 'oak' ? .58 : .8, metalness: draft.floor === 'marble' ? .025 : .01, clearcoat: draft.floor === 'marble' ? .32 : .018, clearcoatRoughness: draft.floor === 'marble' ? .38 : .82 });
  const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floor); floorMesh.rotation.x = -Math.PI / 2; floorMesh.receiveShadow = true; scene.add(floorMesh);
  const addWall = (geometry: THREE.BufferGeometry, position: [number, number, number], rotation: [number, number, number] = [0, 0, 0], material: THREE.Material = wall) => { const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...position); mesh.rotation.set(...rotation); mesh.receiveShadow = true; scene.add(mesh); };
  addWall(new THREE.PlaneGeometry(w, 4.8), [0, 2.4, -d / 2]);
  addWall(new THREE.PlaneGeometry(d, 4.8), [-w / 2, 2.4, 0], [0, Math.PI / 2, 0]);
  addWall(new THREE.PlaneGeometry(d, 4.8), [w / 2, 2.4, 0], [0, -Math.PI / 2, 0]);
  addWall(new THREE.PlaneGeometry(w, 4.8), [0, 2.4, d / 2], [0, Math.PI, 0]);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + .12, .16, d + .12), ceiling); roof.position.set(0, 4.88, 0); roof.receiveShadow = true; scene.add(roof);
  if (draft.templateId === 'pavilion') {
    const divider = new THREE.Mesh(new THREE.BoxGeometry(PAVILION_DIVIDER_WIDTH, 4.1, .18), wall); divider.position.set(0, 2.05, -.5); divider.receiveShadow = true; scene.add(divider);
    const bench = new THREE.Mesh(new RoundedBoxGeometry(2.8, .42, .72, 5, .08), new THREE.MeshStandardMaterial({ color: '#26231f', roughness: .55 })); bench.position.set(0, .34, 3.15); bench.castShadow = true; scene.add(bench);
  }
  if (draft.templateId === 'nocturne') { const plinth = new THREE.Mesh(new THREE.CylinderGeometry(.75, .75, .7, 32), new THREE.MeshStandardMaterial({ color: '#151615', roughness: .75 })); plinth.position.set(0, .35, 1); scene.add(plinth); }
  const decorObjects = draft.decor.map((item) => createDecor(item, selectedDecorId === item.id));
  decorObjects.forEach((item) => { item.position.x = THREE.MathUtils.clamp(item.position.x, -w / 2 + .45, w / 2 - .45); item.position.z = THREE.MathUtils.clamp(item.position.z, -d / 2 + .45, d / 2 - .45); scene.add(item); });
  return { w, d, decorObjects, floorMesh };
}

function addLighting(scene: THREE.Scene, draft: GalleryDraft, w: number, d: number) {
  const settings = {
    daylight: { bg: '#d2d4d0', hemi: 1.1, ambient: .5, key: 2.25, spot: 38, color: '#fff8e9' },
    museum: { bg: '#101210', hemi: .48, ambient: .44, key: 2.1, spot: 58, color: '#ffe6bd' },
    evening: { bg: '#171416', hemi: .38, ambient: .34, key: 1.85, spot: 48, color: '#ffc987' }
  }[draft.lighting];
  scene.background = new THREE.Color(settings.bg);
  scene.add(new THREE.AmbientLight('#fffdf8', settings.ambient), new THREE.HemisphereLight('#f4f2ea', '#d8d5cb', settings.hemi));
  const main = new THREE.DirectionalLight(settings.color, settings.key); main.position.set(0, 7, 0); main.castShadow = true; main.shadow.mapSize.set(1536, 1536); main.shadow.bias = .00012; main.shadow.normalBias = .025; scene.add(main);

  const artworkTargets = draft.artworks.slice(0, 8).map((artwork) => {
    const [x, y, z] = WALLS[artwork.wall].position(artwork.x, artwork.y, w, d); const target = new THREE.Vector3(x, y, z);
    const source = target.clone(); source.y = 4.45;
    if (artwork.wall === 'north') source.z += 2.25;
    if (artwork.wall === 'south') source.z -= 2.25;
    if (artwork.wall === 'west') source.x += 2.25;
    if (artwork.wall === 'east') source.x -= 2.25;
    if (artwork.wall === 'divider-front') source.z += 2;
    if (artwork.wall === 'divider-back') source.z -= 2;
    source.x = THREE.MathUtils.clamp(source.x, -w / 2 + .5, w / 2 - .5); source.z = THREE.MathUtils.clamp(source.z, -d / 2 + .5, d / 2 - .5);
    return { source, target };
  });
  const lightTargets = artworkTargets.length ? artworkTargets : [-.27, 0, .27].map((ratio) => ({ source: new THREE.Vector3(w * ratio, 4.45, -d * .08), target: new THREE.Vector3(w * ratio, 0, -d * .08) }));
  const fixtureMaterial = new THREE.MeshStandardMaterial({ color: draft.lighting === 'daylight' ? '#deddd8' : '#171816', metalness: .72, roughness: .24 });
  const bulbMaterial = new THREE.MeshStandardMaterial({ color: '#fff7df', emissive: settings.color, emissiveIntensity: 3.2, roughness: .18 });
  const down = new THREE.Vector3(0, -1, 0);
  lightTargets.forEach(({ source, target }) => {
    const direction = target.clone().sub(source).normalize();
    const mount = new THREE.Mesh(new THREE.CylinderGeometry(.13, .13, .07, 24), fixtureMaterial); mount.position.set(source.x, 4.75, source.z);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(.026, .026, .15, 14), fixtureMaterial); stem.position.set(source.x, 4.64, source.z);
    const joint = new THREE.Mesh(new THREE.SphereGeometry(.075, 18, 12), fixtureMaterial); joint.position.set(source.x, 4.56, source.z);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(.09, .14, .3, 24), fixtureMaterial); head.position.copy(source); head.quaternion.setFromUnitVectors(down, direction);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(.075, 16, 10), bulbMaterial); bulb.position.copy(source).addScaledVector(direction, .16);
    const spot = new THREE.SpotLight(settings.color, settings.spot, 12, .33, .72, 1.55); spot.position.copy(bulb.position); spot.target.position.copy(target); spot.castShadow = false;
    scene.add(mount, stem, joint, head, bulb, spot, spot.target);
  });
  return lightTargets.length;
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

type CinematicTour = { positions: THREE.Vector3[]; looks: THREE.Vector3[]; finalLook: THREE.Vector3 };

function createCinematicIntro(camera: THREE.PerspectiveCamera, tour: CinematicTour, navigation: WalkController, element: HTMLElement, onComplete?: () => void, labelText = 'Private view', titleText = 'Entering exhibition') {
  const curve = new THREE.CatmullRomCurve3(tour.positions, false, 'centripetal', .38); const lookCurve = new THREE.CatmullRomCurve3(tour.looks, false, 'centripetal', .38); const desktopDuration = THREE.MathUtils.clamp(curve.getLength() * 410, 6200, 8400); const duration = innerWidth < 620 ? Math.min(desktopDuration, 6400) : desktopDuration; const startedAt = performance.now(); const baseFov = camera.fov; let complete = false; let phaseIndex = -1;
  const position = new THREE.Vector3(); const cinematicLook = new THREE.Vector3(); const phases = ['Arrival', 'The architecture', 'The collection', 'Your visit'];
  const overlay = document.createElement('div'); overlay.className = 'cinematic-intro'; overlay.setAttribute('aria-label', 'Cinematic gallery introduction'); const copy = document.createElement('div'); copy.className = 'cinematic-copy'; const label = document.createElement('span'); const title = document.createElement('strong'); const phase = document.createElement('small'); phase.setAttribute('aria-live', 'polite'); const line = document.createElement('i'); const skip = document.createElement('button'); skip.type = 'button'; skip.setAttribute('aria-label', 'Skip the gallery introduction and enter now'); label.textContent = labelText; title.textContent = titleText; phase.textContent = phases[0]; skip.textContent = 'Enter now'; copy.append(label, title, phase, line); overlay.append(copy, skip); element.appendChild(overlay); navigation.setEnabled(false);
  const finish = () => { if (complete) return; complete = true; camera.fov = baseFov; camera.updateProjectionMatrix(); camera.position.copy(tour.positions[tour.positions.length - 1]); navigation.lookAt(tour.finalLook); navigation.setEnabled(true); overlay.classList.add('is-finished'); window.setTimeout(() => overlay.remove(), 650); onComplete?.(); };
  const update = () => { if (complete) return; if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { finish(); return; } const raw = Math.min(1, (performance.now() - startedAt) / duration); const eased = raw * raw * raw * (raw * (raw * 6 - 15) + 10); curve.getPointAt(eased, position); lookCurve.getPointAt(eased, cinematicLook); camera.position.copy(position); camera.lookAt(cinematicLook); camera.fov = baseFov + Math.sin(raw * Math.PI) * 2.2; camera.updateProjectionMatrix(); const nextPhase = Math.min(phases.length - 1, Math.floor(raw * phases.length)); if (nextPhase !== phaseIndex) { phaseIndex = nextPhase; phase.textContent = phases[nextPhase]; } line.style.transform = `scaleX(${raw})`; overlay.style.setProperty('--cinematic-progress', String(raw)); if (raw >= 1) finish(); };
  skip.addEventListener('click', finish);
  return { update, skip: finish, isComplete: () => complete, dispose: () => { skip.removeEventListener('click', finish); overlay.remove(); } };
}

function galleryIntroTour(draft: GalleryDraft, w: number, d: number): CinematicTour {
  const finish = new THREE.Vector3(0, 1.68, d / 2 - 1); const finalLook = new THREE.Vector3(0, 1.68, -1);
  const artworkLooks = draft.artworks.slice(0, 5).map((artwork) => { const [x, y, z] = WALLS[artwork.wall].position(artwork.x, artwork.y, w, d); return new THREE.Vector3(x, y, z); });
  const focus = (index: number, fallback: THREE.Vector3) => artworkLooks.length ? artworkLooks[index % artworkLooks.length] : fallback;
  if (draft.templateId === 'pavilion') {
    const positions = [new THREE.Vector3(0, 3.5, d / 2 - .8), new THREE.Vector3(-w * .31, 2.75, d * .2), new THREE.Vector3(-w * .32, 2.35, -d * .3), new THREE.Vector3(0, 2.25, -d * .36), new THREE.Vector3(w * .32, 2.3, -d * .26), new THREE.Vector3(w * .31, 2, d * .24), finish];
    const looks = [new THREE.Vector3(0, 1.8, -.5), focus(0, new THREE.Vector3(-w * .18, 1.9, -d / 2)), focus(1, new THREE.Vector3(0, 1.9, -.5)), focus(2, new THREE.Vector3(w * .2, 1.9, -d / 2)), focus(3, new THREE.Vector3(w / 2, 1.8, 0)), focus(4, new THREE.Vector3(0, 1.75, -.5)), finalLook]; return { positions, looks, finalLook };
  }
  const height = draft.templateId === 'nocturne' ? 3.15 : 3.35;
  const positions = [new THREE.Vector3(0, height, d / 2 - .8), new THREE.Vector3(-w * .29, 2.55, d * .14), new THREE.Vector3(-w * .27, 2.2, -d * .31), new THREE.Vector3(0, 2.05, -d * .38), new THREE.Vector3(w * .27, 2.1, -d * .29), new THREE.Vector3(w * .28, 1.9, d * .2), finish];
  const looks = [new THREE.Vector3(0, 1.8, -d * .15), focus(0, new THREE.Vector3(-w / 2, 1.8, -d * .1)), focus(1, new THREE.Vector3(0, 1.9, -d / 2)), focus(2, new THREE.Vector3(w * .2, 1.9, -d / 2)), focus(3, new THREE.Vector3(w / 2, 1.8, 0)), focus(4, new THREE.Vector3(0, 1.75, -d * .2)), finalLook];
  return { positions, looks, finalLook };
}

export interface ArtworkFocusInfo { id: string; title: string; artist: string; description?: string; year?: string; image?: string }

export type GalleryViewMode = 'walk' | 'overview';

interface GallerySceneProps {
  draft: GalleryDraft; selectedId?: string; selectedDecorId?: string;
  onSelect?: (id: string) => void; onSelectDecor?: (id: string) => void; onMoveDecor?: (id: string, x: number, z: number) => void; visitor?: boolean; viewMode?: GalleryViewMode;
  playIntro?: boolean; onIntroComplete?: () => void; onArtworkFocus?: (artwork: ArtworkFocusInfo | null) => void;
}

function sceneDraftKey(draft: GalleryDraft, visitor: boolean) {
  const artworks = draft.artworks.map((artwork) => [artwork.id, artwork.aspect, artwork.wall, artwork.x, artwork.y, artwork.scale, visitor ? artwork.title : '', visitor ? artwork.year : '', visitor ? artwork.description : ''].join('~')).join('|');
  const decor = draft.decor.map((item) => [item.id, item.type, item.x, item.z, item.rotation, item.scale].join('~')).join('|');
  return [visitor ? 'visitor' : 'editor', visitor ? draft.title : '', visitor ? draft.artist : '', draft.templateId, draft.wall, draft.floor, draft.ceiling ?? 'gallery', draft.lighting, artworks, decor].join('||');
}

function GallerySceneRenderer({ draft, selectedId, selectedDecorId, onSelect, onSelectDecor, onMoveDecor, visitor = false, viewMode = 'walk', playIntro = false, onIntroComplete, onArtworkFocus }: GallerySceneProps) {
  const host = useRef<HTMLDivElement>(null); const introPlayed = useRef(false);
  useEffect(() => {
    if (!host.current) return; const element = host.current; const scene = new THREE.Scene(); const template = getTemplate(draft.templateId);
    const walk = visitor && viewMode === 'walk'; const camera = new THREE.PerspectiveCamera(walk ? 62 : 48, 1, .1, 70); camera.position.set(...template.camera);
    let renderer: THREE.WebGLRenderer; try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); } catch { return showSceneError(element); } renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.03; element.appendChild(renderer.domElement);
    const controls = walk ? null : new OrbitControls(camera, renderer.domElement); if (controls) { controls.enableDamping = true; controls.target.set(0, 1.6, -1.5); controls.maxPolarAngle = Math.PI / 2 - .03; controls.minDistance = 2.1; controls.maxDistance = visitor ? 18 : 15; controls.enablePan = false; controls.autoRotate = visitor; controls.autoRotateSpeed = .38; }
    const { w, d, decorObjects, floorMesh } = buildRoom(scene, draft, selectedDecorId); const installedLights = addLighting(scene, draft, w, d); element.dataset.roof = 'installed'; element.dataset.ceiling = draft.ceiling ?? 'gallery'; element.dataset.artLights = String(installedLights); element.dataset.wall = draft.wall; element.dataset.floor = draft.floor;
    const roomBounds = { minX: -w / 2 + .45, maxX: w / 2 - .45, minZ: -d / 2 + .45, maxZ: d / 2 - .45 };
    if (walk) camera.position.set(0, 1.68, d / 2 - 1);
    const dividerCollision: WalkCollision | undefined = draft.templateId === 'pavilion' ? (next, previous) => { if (Math.abs(next.x) > PAVILION_DIVIDER_WIDTH / 2 + .35 || Math.abs(next.z + .5) > .4) return; next.z = previous.z > -.5 ? -.09 : -.91; } : undefined;
    const navigation = walk ? createFirstPersonWalk(camera, renderer.domElement, () => roomBounds, dividerCollision) : null; const finalLook = new THREE.Vector3(0, 1.68, -1); if (navigation) navigation.lookAt(finalLook);
    const walkMarker = new THREE.Mesh(new THREE.RingGeometry(.18, .25, 32), new THREE.MeshBasicMaterial({ color: '#d9ff43', transparent: true, opacity: .78, side: THREE.DoubleSide })); walkMarker.rotation.x = -Math.PI / 2; walkMarker.position.y = .018; walkMarker.visible = false; if (walk) scene.add(walkMarker);
    let intro = navigation && playIntro && !introPlayed.current ? createCinematicIntro(camera, galleryIntroTour(draft, w, d), navigation, element, () => { introPlayed.current = true; onIntroComplete?.(); }, 'Private view', draft.title) : null;
    const artworkObjects: THREE.Object3D[] = []; const artworkById = new Map(draft.artworks.map((artwork) => [artwork.id, artwork])); let focusedArtwork: THREE.Object3D | null = null; let focusedArtworkId: string | null = null;
    draft.artworks.forEach((artwork) => {
      const texture = new THREE.TextureLoader().load(artwork.src); texture.colorSpace = THREE.SRGBColorSpace; const height = 1.5 * artwork.scale; const width = height * artwork.aspect;
      const group = new THREE.Group(); group.userData.artworkId = artwork.id; group.userData.wall = artwork.wall;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(width + .12, height + .12, .07), new THREE.MeshStandardMaterial({ color: selectedId === artwork.id ? '#b8945f' : '#1c1b19', metalness: .2, roughness: .45 }));
      const canvas = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map: texture, roughness: .72 })); canvas.position.z = .041; group.add(frame, canvas);
      const config = WALLS[artwork.wall]; const [px, py, pz] = config.position(artwork.x, artwork.y, w, d); group.position.set(px, py, pz); group.rotation.set(...config.rotation); group.traverse((item) => { item.userData.artworkId = artwork.id; }); scene.add(group); artworkObjects.push(group);
    });
    const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2(); let draggedDecor: THREE.Group | null = null; let dragPointerId = -1; let pointerStartX = 0; let pointerStartY = 0; let pointerTravel = 0; let suppressFloorClick = false;
    const setPointer = (event: PointerEvent) => { const box = renderer.domElement.getBoundingClientRect(); pointer.set(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1); raycaster.setFromCamera(pointer, camera); };
    const editorPointerDown = (event: PointerEvent) => {
      if (visitor || event.button !== 0) return; pointerStartX = event.clientX; pointerStartY = event.clientY; pointerTravel = 0; setPointer(event);
      const decorId = raycaster.intersectObjects(decorObjects, true)[0]?.object.userData.decorId as string | undefined; if (!decorId) return;
      draggedDecor = decorObjects.find((item) => item.userData.decorId === decorId) ?? null; if (!draggedDecor) return; dragPointerId = event.pointerId; if (controls) controls.enabled = false; renderer.domElement.classList.add('is-dragging-object'); if (event.isTrusted) renderer.domElement.setPointerCapture(event.pointerId);
    };
    const editorPointerMove = (event: PointerEvent) => {
      if (visitor) return; pointerTravel = Math.max(pointerTravel, Math.hypot(event.clientX - pointerStartX, event.clientY - pointerStartY)); if (!draggedDecor || event.pointerId !== dragPointerId) return;
      setPointer(event); const floorHit = raycaster.intersectObject(floorMesh, false)[0]; if (!floorHit) return; draggedDecor.position.x = THREE.MathUtils.clamp(floorHit.point.x, roomBounds.minX, roomBounds.maxX); draggedDecor.position.z = THREE.MathUtils.clamp(floorHit.point.z, roomBounds.minZ, roomBounds.maxZ); suppressFloorClick = true;
    };
    const editorPointerUp = (event: PointerEvent) => {
      if (visitor || event.pointerId !== dragPointerId || !draggedDecor) { if (!visitor) suppressFloorClick = pointerTravel > 5; return; }
      const decorId = draggedDecor.userData.decorId as string; const { x, z } = draggedDecor.position; renderer.domElement.classList.remove('is-dragging-object'); if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId); if (controls) controls.enabled = true; draggedDecor = null; dragPointerId = -1; suppressFloorClick = true; onSelectDecor?.(decorId); onMoveDecor?.(decorId, x, z);
    };
    const handlePointer = (event: PointerEvent) => {
      setPointer(event);
      if (!visitor) { const hit = raycaster.intersectObjects([...artworkObjects, ...decorObjects], true)[0]; const artworkId = hit?.object.userData.artworkId as string | undefined; const decorId = hit?.object.userData.decorId as string | undefined; if (artworkId) onSelect?.(artworkId); else if (decorId) onSelectDecor?.(decorId); else if (selectedDecorId && !suppressFloorClick) { const floorHit = raycaster.intersectObject(floorMesh, false)[0]; if (floorHit) onMoveDecor?.(selectedDecorId, THREE.MathUtils.clamp(floorHit.point.x, roomBounds.minX, roomBounds.maxX), THREE.MathUtils.clamp(floorHit.point.z, roomBounds.minZ, roomBounds.maxZ)); } suppressFloorClick = false; return; }
      if (!walk || !navigation?.consumeClick()) return;
      const artHit = raycaster.intersectObjects(artworkObjects, true)[0]; const artworkId = artHit?.object.userData.artworkId as string | undefined;
      if (artworkId) { const artwork = artworkById.get(artworkId); if (!artwork) return; focusedArtwork = artworkObjects.find((item) => item.userData.artworkId === artworkId) ?? artHit.object; focusedArtworkId = artworkId; onArtworkFocus?.({ id: artwork.id, title: artwork.title, artist: draft.artist, description: artwork.description, year: artwork.year, image: artwork.src }); return; }
      const floorHit = raycaster.intersectObject(floorMesh, false)[0]; if (floorHit) { focusedArtwork = null; focusedArtworkId = null; onArtworkFocus?.(null); navigation.moveTo(floorHit.point); walkMarker.position.set(floorHit.point.x, .018, floorHit.point.z); walkMarker.visible = true; }
    };
    renderer.domElement.addEventListener('pointerdown', editorPointerDown); renderer.domElement.addEventListener('pointermove', editorPointerMove); renderer.domElement.addEventListener('pointerup', editorPointerUp); renderer.domElement.addEventListener('pointercancel', editorPointerUp); renderer.domElement.addEventListener('click', handlePointer);
    let frame = 0; const resize = () => { const width = element.clientWidth; const height = element.clientHeight; renderer.setSize(width, height, false); camera.aspect = width / Math.max(height, 1); camera.updateProjectionMatrix(); }; const observer = new ResizeObserver(resize); observer.observe(element); resize();
    const cameraDirection = new THREE.Vector3(); const artworkDirection = new THREE.Vector3(); const artworkPosition = new THREE.Vector3();
    const animate = () => { intro?.update(); navigation?.update(); controls?.update(); if (!visitor) artworkObjects.forEach((object) => { if (object.userData.wall === 'south') object.visible = camera.position.z < d / 2 - .12; }); if (walkMarker.visible) { walkMarker.rotation.z += .008; const material = walkMarker.material as THREE.MeshBasicMaterial; material.opacity = .5 + Math.sin(performance.now() * .006) * .25; if (!navigation?.hasDestination()) walkMarker.visible = false; } if (focusedArtwork && focusedArtworkId) { camera.getWorldDirection(cameraDirection); focusedArtwork.getWorldPosition(artworkPosition); artworkDirection.subVectors(artworkPosition, camera.position); const distance = artworkDirection.length(); const facing = cameraDirection.dot(artworkDirection.normalize()); if (facing < .48 || distance > 8) { focusedArtwork = null; focusedArtworkId = null; onArtworkFocus?.(null); } } element.dataset.cameraPosition = camera.position.toArray().map((value) => value.toFixed(2)).join(','); element.dataset.intro = intro && !intro.isComplete() ? 'active' : 'complete'; renderer.render(scene, camera); frame = requestAnimationFrame(animate); }; animate();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); renderer.domElement.removeEventListener('pointerdown', editorPointerDown); renderer.domElement.removeEventListener('pointermove', editorPointerMove); renderer.domElement.removeEventListener('pointerup', editorPointerUp); renderer.domElement.removeEventListener('pointercancel', editorPointerUp); renderer.domElement.removeEventListener('click', handlePointer); intro?.dispose(); intro = null; navigation?.dispose(); controls?.dispose(); scene.traverse((object) => { const mesh = object as THREE.Mesh; mesh.geometry?.dispose(); const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]; materials.filter(Boolean).forEach((raw) => { const material = raw as THREE.MeshStandardMaterial; material.map?.dispose(); if (material.bumpMap && material.bumpMap !== material.map) material.bumpMap.dispose(); material.dispose(); }); }); renderer.dispose(); renderer.domElement.remove(); };
  }, [draft, selectedId, selectedDecorId, onSelect, onSelectDecor, onMoveDecor, visitor, viewMode, playIntro, onIntroComplete, onArtworkFocus]);
  return <div className={`gallery-scene gallery-scene--${visitor ? viewMode : 'edit'} ${selectedDecorId ? 'gallery-scene--placing' : ''}`} ref={host}><div className="scene-hint">{visitor ? viewMode === 'walk' ? 'WASD / arrows to walk · Drag to look' : 'Overview · Drag to orbit · Scroll to zoom' : selectedDecorId ? 'Drag object · Click floor to place · Scroll to move' : 'Drag to look · Scroll to move'}</div></div>;
}

export const GalleryScene = memo(GallerySceneRenderer, (previous, next) =>
  sceneDraftKey(previous.draft, previous.visitor ?? false) === sceneDraftKey(next.draft, next.visitor ?? false)
  && previous.selectedId === next.selectedId && previous.selectedDecorId === next.selectedDecorId
  && previous.onSelect === next.onSelect && previous.onSelectDecor === next.onSelectDecor && previous.onMoveDecor === next.onMoveDecor
  && previous.visitor === next.visitor && previous.viewMode === next.viewMode && previous.playIntro === next.playIntro
  && previous.onIntroComplete === next.onIntroComplete && previous.onArtworkFocus === next.onArtworkFocus
);

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
      if (navigation && playIntro && !introPlayed.current) {
        const width = bounds.maxX - bounds.minX; const depth = bounds.maxZ - bounds.minZ; const centerX = lookTarget.x; const centerZ = (finalPosition.z + lookTarget.z) / 2; const radiusX = Math.min(width * .28, 4.6); const radiusZ = Math.min(Math.abs(finalPosition.z - lookTarget.z) * .46, depth * .24);
        const tour = [
          finalPosition.clone().add(new THREE.Vector3(0, 1.15, 0)),
          new THREE.Vector3(centerX - radiusX, finalPosition.y + .95, centerZ + radiusZ),
          new THREE.Vector3(centerX - radiusX, finalPosition.y + .78, centerZ - radiusZ),
          new THREE.Vector3(centerX, finalPosition.y + .88, centerZ - radiusZ * 1.08),
          new THREE.Vector3(centerX + radiusX, finalPosition.y + .68, centerZ - radiusZ),
          new THREE.Vector3(centerX + radiusX, finalPosition.y + .48, centerZ + radiusZ),
          finalPosition
        ];
        const tourLooks = [lookTarget.clone(), new THREE.Vector3(centerX, 2.2, centerZ - radiusZ), new THREE.Vector3(centerX + radiusX * .35, 2.1, centerZ), new THREE.Vector3(centerX, 2.15, centerZ + radiusZ), new THREE.Vector3(centerX - radiusX * .35, 2.05, centerZ), lookTarget.clone(), lookTarget.clone()];
        intro = createCinematicIntro(camera, { positions: tour, looks: tourLooks, finalLook: lookTarget }, navigation, element, () => { introPlayed.current = true; onIntroComplete?.(); }, 'Featured exhibition', 'Threshold — Danny Hirsch');
      } else navigation?.setEnabled(true);
      controls?.update();
    }, undefined, () => { element.dataset.error = 'true'; modelErrorCleanup = showSceneError(element, 'The exhibition model could not be loaded. Please check your connection and try again.'); });
    let frame = 0; const resize = () => { const width = element.clientWidth; const height = element.clientHeight; renderer.setSize(width, height, false); camera.aspect = width / Math.max(height, 1); camera.updateProjectionMatrix(); }; const observer = new ResizeObserver(resize); observer.observe(element); resize();
    const cameraDirection = new THREE.Vector3(); const artworkDirection = new THREE.Vector3(); const artworkPosition = new THREE.Vector3();
    const animate = () => { intro?.update(); navigation?.update(); controls?.update(); if (walkMarker.visible) { walkMarker.rotation.z += .008; const material = walkMarker.material as THREE.MeshBasicMaterial; material.opacity = .5 + Math.sin(performance.now() * .006) * .25; if (!navigation?.hasDestination()) walkMarker.visible = false; } if (focusedArtwork) { camera.getWorldDirection(cameraDirection); focusedArtwork.getWorldPosition(artworkPosition); artworkDirection.subVectors(artworkPosition, camera.position); if (cameraDirection.dot(artworkDirection.normalize()) < .48) { focusedArtwork = null; onArtworkFocus?.(null); } } element.dataset.cameraPosition = camera.position.toArray().map((value) => value.toFixed(2)).join(','); element.dataset.intro = intro && !intro.isComplete() ? 'active' : 'complete'; renderer.render(scene, camera); frame = requestAnimationFrame(animate); }; animate();
    return () => { destroyed = true; cancelAnimationFrame(frame); observer.disconnect(); renderer.domElement.removeEventListener('click', handlePointer); intro?.dispose(); modelErrorCleanup?.(); navigation?.dispose(); controls?.dispose(); renderer.dispose(); renderer.domElement.remove(); };
  }, [viewMode, playIntro, onIntroComplete, onArtworkFocus]);
  return <div className={`gallery-scene gallery-scene--${viewMode}`} ref={host}><div className="scene-hint">{viewMode === 'walk' ? 'Danny Hirsch Arts · WASD / arrows · Drag to look' : 'Danny Hirsch Arts · Overview orbit'}</div></div>;
}
