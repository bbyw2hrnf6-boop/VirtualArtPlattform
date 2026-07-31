import { memo, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { DecorPlacement, GalleryDraft, WallId } from './types';
import { getTemplate } from './templates';

type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };
const PAVILION_DIVIDER_WIDTH = 14;
const PAVILION_DIVIDER_Z = 0;
const VISITOR_EYE_HEIGHT = 1.75;

function disposeObjectTree(root: THREE.Object3D) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.filter(Boolean).forEach((raw) => {
      const material = raw as THREE.Material;
      Object.values(material).forEach((value) => {
        if (value instanceof THREE.Texture) value.dispose();
      });
      material.dispose();
    });
  });
}
const WALLS: Record<WallId, { position: (x: number, y: number, w: number, d: number) => [number, number, number]; rotation: [number, number, number] }> = {
  north: { position: (x, y, _w, d) => [x, y, -d / 2 + .035], rotation: [0, 0, 0] },
  south: { position: (x, y, _w, d) => [x, y, d / 2 - .035], rotation: [0, Math.PI, 0] },
  west: { position: (x, y, w) => [-w / 2 + .035, y, x], rotation: [0, Math.PI / 2, 0] },
  east: { position: (x, y, w) => [w / 2 - .035, y, x], rotation: [0, -Math.PI / 2, 0] },
  'divider-front': { position: (x, y) => [x, y, PAVILION_DIVIDER_Z + .13], rotation: [0, 0, 0] },
  'divider-back': { position: (x, y) => [x, y, PAVILION_DIVIDER_Z - .13], rotation: [0, Math.PI, 0] }
};
const wallColors = { chalk: '#dfdcd4', warm: '#ae9f8c', travertine: '#d7cbb6', linen: '#c8c0b3', charcoal: '#292b29' };
const floorColors = { concrete: '#777672', oak: '#49382b', terrazzo: '#a7a299', marble: '#d8d4cb', 'black-marble': '#101111', walnut: '#4b2c1d', 'dark-oak': '#26211d' };
type SurfaceKind = GalleryDraft['wall'] | GalleryDraft['floor'];
const surfaceAssets: Partial<Record<SurfaceKind, string>> = {
  marble: './assets/materials/carrara-marble.webp',
  'black-marble': './assets/materials/nero-marquina-v1.webp',
  walnut: './assets/materials/american-walnut-v1.webp',
  'dark-oak': './assets/materials/smoked-oak-v1.webp',
  oak: './assets/materials/american-walnut-v1.webp',
  travertine: './assets/materials/roman-travertine.webp'
};

function createSurfaceTexture(kind: SurfaceKind, base: string) {
  const asset = surfaceAssets[kind];
  if (asset) {
    const texture = new THREE.TextureLoader().load(asset); texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 8;
    if (kind === 'marble' || kind === 'black-marble') texture.repeat.set(1.45, 1.45);
    else if (kind === 'walnut' || kind === 'oak') texture.repeat.set(1.75, 2.4);
    else if (kind === 'dark-oak') { texture.rotation = Math.PI / 2; texture.center.set(.5, .5); texture.repeat.set(2.2, 1.65); }
    else texture.repeat.set(2.2, 1.8);
    return texture;
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
  } else if (kind === 'oak' || kind === 'walnut' || kind === 'dark-oak') {
    const rowHeight = 64;
    for (let row = 0; row < 8; row++) {
      const y = row * rowHeight; context.fillStyle = row % 2 ? '#f2c98d0b' : '#20140d12'; context.fillRect(0, y, size, rowHeight);
      context.fillStyle = '#21150f66'; context.fillRect(0, y, size, 1);
      const offset = row % 2 ? 128 : 0; for (let x = offset; x < size; x += 256) context.fillRect(x, y, 1, rowHeight);
      for (let grain = 0; grain < 12; grain++) { const grainY = y + 6 + random() * 50; context.strokeStyle = `rgba(27,15,9,${.025 + random() * .055})`; context.lineWidth = .7 + random(); context.beginPath(); context.moveTo(0, grainY); context.bezierCurveTo(130, grainY + random() * 7, 360, grainY - random() * 7, size, grainY + random() * 3); context.stroke(); }
    }
  } else if (kind === 'marble' || kind === 'black-marble') {
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
  if (kind === 'oak' || kind === 'walnut' || kind === 'dark-oak') texture.repeat.set(2.5, 3.5); else if (kind === 'marble' || kind === 'black-marble') texture.repeat.set(1.35, 1.15); else if (kind === 'chalk' || kind === 'warm' || kind === 'charcoal') texture.repeat.set(3, 2.5); else texture.repeat.set(4, 3);
  return texture;
}

function showSceneError(element: HTMLElement, message = 'This gallery needs WebGL. Please enable hardware acceleration or open it in a current browser.') {
  const notice = document.createElement('div'); const label = document.createElement('span'); const detail = document.createElement('p'); notice.className = 'scene-error'; label.textContent = '3D VIEW UNAVAILABLE'; detail.textContent = message; notice.append(label, detail); element.appendChild(notice);
  return () => notice.remove();
}

function createLeafGeometry(broad: boolean) {
  const shape = new THREE.Shape();
  if (broad) {
    const points: Array<[number, number]> = [[0,-.43],[-.13,-.3],[-.31,-.25],[-.21,-.11],[-.4,-.02],[-.23,.09],[-.42,.2],[-.2,.27],[-.29,.41],[-.1,.39],[0,.55],[.1,.39],[.29,.41],[.2,.27],[.42,.2],[.23,.09],[.4,-.02],[.21,-.11],[.31,-.25],[.13,-.3]];
    shape.moveTo(...points[0]); shape.splineThru(points.slice(1).map(([x, y]) => new THREE.Vector2(x, y))); shape.lineTo(...points[0]); shape.closePath();
    [[-.11,.12],[.12,.2],[-.08,.31]].forEach(([x, y], index) => { const hole = new THREE.Path(); hole.absellipse(x, y, .026 + index * .004, .062, 0, Math.PI * 2, false, index * .15); shape.holes.push(hole); });
  } else {
    shape.moveTo(0, -.32); shape.bezierCurveTo(-.14, -.2, -.14, .18, 0, .34); shape.bezierCurveTo(.14, .18, .14, -.2, 0, -.32); shape.closePath();
  }
  const geometry = new THREE.ShapeGeometry(shape, 3); geometry.computeVertexNormals(); return geometry;
}

function createPotTexture(light: boolean) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 192; const context = canvas.getContext('2d');
  if (!context) return null; context.fillStyle = light ? '#b9aa91' : '#29251f'; context.fillRect(0, 0, 192, 192);
  let seed = light ? 37 : 71; const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let index = 0; index < 950; index++) { const value = light ? (random() > .5 ? 255 : 62) : (random() > .5 ? 152 : 8); context.fillStyle = `rgba(${value},${value},${value},${.018 + random() * .055})`; const size = .35 + random() * 1.4; context.fillRect(random() * 192, random() * 192, size, size); }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(2, 1.5); return texture;
}

function createPlant(broad = false) {
  const group = new THREE.Group(); const potTexture = createPotTexture(broad);
  const ceramic = new THREE.MeshPhysicalMaterial({ color: '#ffffff', map: potTexture, bumpMap: potTexture, bumpScale: .012, roughness: broad ? .34 : .28, metalness: .03, clearcoat: broad ? .18 : .34, clearcoatRoughness: .45 });
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(.37, .26, .61, 48, 4), ceramic); pot.position.y = .32;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(.35, .047, 12, 48), ceramic); rim.rotation.x = Math.PI / 2; rim.position.y = .61;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(.27, .28, .055, 40), ceramic); foot.position.y = .028;
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, .04, 36), new THREE.MeshStandardMaterial({ color: '#17120e', roughness: 1 })); soil.position.y = .607;
  const saucer = new THREE.Mesh(new THREE.CylinderGeometry(.31, .33, .035, 44), ceramic); saucer.position.y = .012; group.add(pot, rim, foot, soil, saucer);
  const stemMaterial = new THREE.MeshStandardMaterial({ color: broad ? '#315035' : '#534a31', roughness: .88 });
  if (!broad) { const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.025, .066, 1.3, 14, 5), stemMaterial); trunk.position.y = 1.18; trunk.rotation.z = -.045; group.add(trunk); }
  const leafMaterials = ['#315e3c','#3f7048','#284d32'].map((color) => new THREE.MeshPhysicalMaterial({ color, roughness: .62, clearcoat: .08, clearcoatRoughness: .68, sheen: .28, sheenColor: new THREE.Color('#b8d5a5'), side: THREE.DoubleSide }));
  const veinMaterial = new THREE.LineBasicMaterial({ color: broad ? '#84a77a' : '#a9b176', transparent: true, opacity: .52 });
  const leafGeometry = createLeafGeometry(broad); const count = broad ? 10 : 24;
  for (let index = 0; index < count; index++) {
    const angle = index * (broad ? 2.19 : 2.41) + .28; const ring = broad ? index % 5 : index % 8; const reach = broad ? .37 + ring * .055 : .24 + ring * .027; const height = broad ? .92 + (index % 6) * .18 : .82 + (index % 9) * .145;
    const end = new THREE.Vector3(Math.sin(angle) * reach, height, Math.cos(angle) * reach);
    const stemCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, .6, 0), new THREE.Vector3(end.x * .48, .66 + (height - .6) * .58, end.z * .48), end);
    const stem = new THREE.Mesh(new THREE.TubeGeometry(stemCurve, 12, broad ? .014 : .008, 7, false), stemMaterial); group.add(stem);
    const leafGroup = new THREE.Group(); const leaf = new THREE.Mesh(leafGeometry, leafMaterials[index % leafMaterials.length]); leafGroup.add(leaf);
    const veinLength = broad ? .77 : .52; const vein = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, broad ? -.34 : -.25, .006), new THREE.Vector3(0, broad ? .43 : .27, .006)]), veinMaterial); vein.scale.y = veinLength / (broad ? .77 : .52); leafGroup.add(vein);
    leafGroup.position.copy(end); leafGroup.rotation.set(-.18 + (index % 3) * .12, -angle + Math.PI, (index % 2 ? 1 : -1) * (broad ? .62 : .44)); leafGroup.scale.setScalar(broad ? .72 + (index % 3) * .045 : .62 + (index % 4) * .035); group.add(leafGroup);
  }
  group.traverse((child) => { const mesh = child as THREE.Mesh; if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; } });
  return group;
}

function createDecor(item: DecorPlacement, selected: boolean) {
  const group = new THREE.Group(); group.userData.decorId = item.id;
  if (item.type === 'olive' || item.type === 'monstera') group.add(createPlant(item.type === 'monstera'));
  if (item.type === 'pedestal') {
    const marbleTexture = createSurfaceTexture('marble', floorColors.marble); const marble = new THREE.MeshPhysicalMaterial({ color: '#f5f2ea', map: marbleTexture, bumpMap: marbleTexture, bumpScale: .0025, roughness: .3, clearcoat: .34, clearcoatRoughness: .32, envMapIntensity: .88 });
    const shadow = new THREE.Mesh(new RoundedBoxGeometry(.75, .055, .75, 4, .018), new THREE.MeshStandardMaterial({ color: '#151513', roughness: .54 })); shadow.position.y = .028;
    const pedestal = new THREE.Mesh(new RoundedBoxGeometry(.84, 1.16, .84, 7, .045), marble); pedestal.position.y = .625;
    const top = new THREE.Mesh(new RoundedBoxGeometry(.94, .075, .94, 6, .025), marble); top.position.y = 1.235;
    const plaque = new THREE.Mesh(new RoundedBoxGeometry(.28, .12, .018, 3, .008), new THREE.MeshPhysicalMaterial({ color: '#9b8059', roughness: .28, metalness: .72, clearcoat: .26 })); plaque.position.set(0, .72, .432); group.add(shadow, pedestal, top, plaque);
  }
  if (item.type === 'arc-lamp') {
    const metal = new THREE.MeshPhysicalMaterial({ color: '#141512', metalness: .9, roughness: .19, clearcoat: .34, clearcoatRoughness: .22, envMapIntensity: 1.1 });
    const brass = new THREE.MeshPhysicalMaterial({ color: '#b08a53', metalness: .82, roughness: .24, clearcoat: .3 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(.37, .43, .085, 48), metal); base.position.y = .045;
    const baseRing = new THREE.Mesh(new THREE.TorusGeometry(.35, .018, 8, 48), brass); baseRing.rotation.x = Math.PI / 2; baseRing.position.y = .09; group.add(base, baseRing);
    const arc = new THREE.CatmullRomCurve3([new THREE.Vector3(0, .08, 0), new THREE.Vector3(0, 1.65, 0), new THREE.Vector3(.32, 2.55, 0), new THREE.Vector3(1.05, 2.75, 0)]);
    const stem = new THREE.Mesh(new THREE.TubeGeometry(arc, 52, .027, 12, false), metal); group.add(stem);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(.18, .39, .4, 48, 1, true), metal); shade.position.set(1.05, 2.56, 0);
    const shadeInner = new THREE.Mesh(new THREE.CylinderGeometry(.175, .375, .39, 48, 1, true), new THREE.MeshPhysicalMaterial({ color: '#d3ad70', metalness: .65, roughness: .3, side: THREE.BackSide })); shadeInner.position.copy(shade.position);
    const shadeRim = new THREE.Mesh(new THREE.TorusGeometry(.385, .018, 8, 48), brass); shadeRim.rotation.x = Math.PI / 2; shadeRim.position.set(1.05, 2.36, 0); group.add(shade, shadeInner, shadeRim);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(.11, 18, 12), new THREE.MeshStandardMaterial({ color: '#fff2d3', emissive: '#ffbf72', emissiveIntensity: 2.4, roughness: .25 })); bulb.position.set(1.05, 2.39, 0); group.add(bulb);
    const cordCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(1.05, 2.47, 0), new THREE.Vector3(1.07, 2.28, .008), new THREE.Vector3(1.06, 2.12, .012)]); const cordMaterial = new THREE.MeshStandardMaterial({ color: '#26241f', roughness: .8 }); group.add(new THREE.Mesh(new THREE.TubeGeometry(cordCurve, 14, .007, 6, false), cordMaterial)); const pull = new THREE.Mesh(new THREE.SphereGeometry(.018, 10, 8), brass); pull.position.set(1.06, 2.1, .012); group.add(pull);
    const glow = new THREE.PointLight('#ffd39a', 4.6, 5.2, 1.8); glow.position.copy(bulb.position); group.add(glow);
  }
  if (item.type === 'gallery-bench') {
    const frameMaterial = new THREE.MeshPhysicalMaterial({ color: '#171816', metalness: .76, roughness: .24, clearcoat: .24 }); const leather = new THREE.MeshPhysicalMaterial({ color: '#776a5b', roughness: .46, clearcoat: .12, clearcoatRoughness: .58, sheen: .25, sheenColor: new THREE.Color('#b5a48d') });
    const rail = new THREE.Mesh(new RoundedBoxGeometry(2.45, .1, .62, 4, .025), frameMaterial); rail.position.y = .42; group.add(rail);
    [-.92, .92].forEach((x) => { const leg = new THREE.Mesh(new RoundedBoxGeometry(.12, .46, .52, 4, .025), frameMaterial); leg.position.set(x, .23, 0); group.add(leg); });
    [-.79, 0, .79].forEach((x) => { const cushion = new THREE.Mesh(new RoundedBoxGeometry(.75, .22, .72, 7, .065), leather); cushion.position.set(x, .57, 0); group.add(cushion); });
  }
  if (item.type === 'stone-sculpture') {
    const stoneTexture = createSurfaceTexture('travertine', wallColors.travertine); const stone = new THREE.MeshPhysicalMaterial({ color: '#f2eadb', map: stoneTexture, bumpMap: stoneTexture, bumpScale: .012, roughness: .44, clearcoat: .1, envMapIntensity: .62 }); const bronze = new THREE.MeshPhysicalMaterial({ color: '#735c3e', metalness: .82, roughness: .27, clearcoat: .3 });
    const shadow = new THREE.Mesh(new THREE.CylinderGeometry(.48, .54, .075, 56), bronze); shadow.position.y = .04; const plinth = new THREE.Mesh(new THREE.CylinderGeometry(.36, .43, .58, 56), stone); plinth.position.y = .36;
    const sculpture = new THREE.Mesh(new THREE.TorusKnotGeometry(.38, .095, 128, 22, 2, 3), stone); sculpture.position.y = 1.15; sculpture.rotation.set(.42, .25, -.18); group.add(shadow, plinth, sculpture);
  }
  if (item.type === 'floor-vase') {
    const ceramicTexture = createPotTexture(true); const ceramic = new THREE.MeshPhysicalMaterial({ color: '#d8c9ad', map: ceramicTexture, bumpMap: ceramicTexture, bumpScale: .009, roughness: .31, clearcoat: .28, clearcoatRoughness: .4 });
    const profile = [new THREE.Vector2(.03, 0), new THREE.Vector2(.3, .03), new THREE.Vector2(.38, .18), new THREE.Vector2(.34, .58), new THREE.Vector2(.22, .9), new THREE.Vector2(.13, 1.12), new THREE.Vector2(.14, 1.2)]; const vase = new THREE.Mesh(new THREE.LatheGeometry(profile, 64), ceramic); group.add(vase);
    const branchMaterial = new THREE.MeshStandardMaterial({ color: '#5b4432', roughness: .9 }); const driedLeafMaterial = new THREE.MeshPhysicalMaterial({ color: '#a78b62', roughness: .72, side: THREE.DoubleSide, sheen: .16, sheenColor: new THREE.Color('#d4bd91') }); const driedLeaf = createLeafGeometry(false);
    [-.23, 0, .21].forEach((lean, index) => { const top = new THREE.Vector3(lean, 2.15 + index * .18, (index - 1) * .16); const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 1.13, 0), new THREE.Vector3(lean * .3, 1.65, top.z * .45), top); group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 14, .009, 6, false), branchMaterial)); for (let leafIndex = 0; leafIndex < 3; leafIndex++) { const leaf = new THREE.Mesh(driedLeaf, driedLeafMaterial); leaf.scale.setScalar(.42 - leafIndex * .04); leaf.position.copy(curve.getPoint(.45 + leafIndex * .2)); leaf.rotation.set(.15, index * 1.7 + leafIndex, (leafIndex % 2 ? 1 : -1) * .82); group.add(leaf); } });
  }
  if (selected) {
    const markerRadius = item.type === 'gallery-bench' ? 1.25 : item.type === 'stone-sculpture' ? .68 : item.type === 'floor-vase' ? .52 : .46; const marker = new THREE.Mesh(new THREE.RingGeometry(markerRadius, markerRadius + .07, 42), new THREE.MeshBasicMaterial({ color: '#d9ff43', side: THREE.DoubleSide })); marker.rotation.x = -Math.PI / 2; marker.position.y = .015; group.add(marker);
  }
  group.position.set(item.x, 0, item.z); group.rotation.y = item.rotation; group.scale.setScalar(item.scale);
  group.traverse((child) => { child.userData.decorId = item.id; const mesh = child as THREE.Mesh; if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; } });
  return group;
}

function buildRoom(scene: THREE.Scene, draft: GalleryDraft, selectedDecorId?: string, dollhouse = false, editorCutaway = false) {
  const template = getTemplate(draft.templateId); const [w, d] = template.dimensions; const h = template.height; const dividerWidth = template.dividerWidth ?? PAVILION_DIVIDER_WIDTH;
  const cutaway = dollhouse || editorCutaway;
  const ceilingFinish = draft.ceiling ?? 'gallery';
  const ceilingProfiles = {
    gallery: { surface: 'chalk' as const, color: '#ece9e1', roughness: .82, bump: .005, emissive: '#fffdf8', glow: .16 },
    warm: { surface: 'warm' as const, color: '#c7b292', roughness: .78, bump: .01, emissive: '#e3c79e', glow: .13 },
    dark: { surface: 'charcoal' as const, color: '#20231f', roughness: .7, bump: .007, emissive: '#363a34', glow: .09 }
  }[ceilingFinish];
  const wallTexture = createSurfaceTexture(draft.wall, wallColors[draft.wall]);
  const floorTexture = createSurfaceTexture(draft.floor, floorColors[draft.floor]);
  const ceilingTexture = createSurfaceTexture(ceilingProfiles.surface, ceilingProfiles.color);
  const roomTextureScale = Math.max(1, Math.max(w, d) / 18); floorTexture.repeat.multiplyScalar(roomTextureScale); wallTexture.repeat.multiplyScalar(Math.max(1, w / 25)); ceilingTexture.repeat.multiplyScalar(Math.max(1, Math.max(w, d) / 24));
  const wallProfile = {
    chalk: { bump: .009, roughness: .82, clearcoat: .025 }, warm: { bump: .015, roughness: .86, clearcoat: .015 },
    travertine: { bump: .02, roughness: .7, clearcoat: .035 }, linen: { bump: .024, roughness: .92, clearcoat: 0 }, charcoal: { bump: .008, roughness: .72, clearcoat: .05 }
  }[draft.wall];
  const wall = new THREE.MeshPhysicalMaterial({ color: '#ffffff', map: wallTexture, bumpMap: wallTexture, bumpScale: wallProfile.bump, roughness: wallProfile.roughness, clearcoat: wallProfile.clearcoat, clearcoatRoughness: .76, envMapIntensity: .28, emissive: '#ffffff', emissiveMap: wallTexture, emissiveIntensity: .2 });
  const ceiling = new THREE.MeshPhysicalMaterial({ color: '#ffffff', map: ceilingTexture, bumpMap: ceilingTexture, bumpScale: ceilingProfiles.bump, roughness: ceilingProfiles.roughness, envMapIntensity: .22, emissive: ceilingProfiles.emissive, emissiveMap: ceilingTexture, emissiveIntensity: ceilingProfiles.glow, side: THREE.FrontSide });
  const isMarble = draft.floor === 'marble' || draft.floor === 'black-marble';
  const isWood = draft.floor === 'oak' || draft.floor === 'walnut' || draft.floor === 'dark-oak';
  const floor = new THREE.MeshPhysicalMaterial({
    color: '#ffffff', map: floorTexture, bumpMap: floorTexture,
    bumpScale: isMarble ? .0032 : isWood ? .014 : .018,
    roughness: isMarble ? .27 : isWood ? .48 : .78,
    metalness: isMarble ? .035 : .008,
    clearcoat: isMarble ? .42 : isWood ? .16 : .025,
    clearcoatRoughness: isMarble ? .28 : isWood ? .52 : .82,
    envMapIntensity: isMarble ? 1.05 : isWood ? .62 : .38
  });
  const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floor); floorMesh.rotation.x = -Math.PI / 2; floorMesh.receiveShadow = true; floorMesh.userData.surface = 'floor'; scene.add(floorMesh);
  const wallSurfaces: THREE.Mesh[] = []; const exteriorWalls: THREE.Mesh[] = [];
  const addWall = (wallId: WallId, geometry: THREE.BufferGeometry, position: [number, number, number], rotation: [number, number, number] = [0, 0, 0]) => {
    const material = cutaway ? wall.clone() : wall; material.transparent = cutaway; material.opacity = 1; if (cutaway) { material.depthWrite = false; material.side = THREE.DoubleSide; } const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...position); mesh.rotation.set(...rotation); mesh.receiveShadow = true; mesh.userData.wallId = wallId; scene.add(mesh); wallSurfaces.push(mesh); exteriorWalls.push(mesh); return mesh;
  };
  addWall('north', new THREE.PlaneGeometry(w, h), [0, h / 2, -d / 2]);
  addWall('west', new THREE.PlaneGeometry(d, h), [-w / 2, h / 2, 0], [0, Math.PI / 2, 0]);
  addWall('east', new THREE.PlaneGeometry(d, h), [w / 2, h / 2, 0], [0, -Math.PI / 2, 0]);
  addWall('south', new THREE.PlaneGeometry(w, h), [0, h / 2, d / 2], [0, Math.PI, 0]);
  // The exterior roof is part of the architecture and always follows the walls.
  const roofMaterial = wall.clone(); roofMaterial.transparent = cutaway; const roof = new THREE.Mesh(new THREE.BoxGeometry(w + .12, .16, d + .12), roofMaterial); roof.position.set(0, h + .08, 0); roof.receiveShadow = true; roof.name = 'room-roof-wall-finish'; roof.visible = !cutaway; scene.add(roof);
  const ceilingPlane = new THREE.Mesh(new THREE.PlaneGeometry(w - .08, d - .08), ceiling); ceilingPlane.rotation.x = Math.PI / 2; ceilingPlane.position.y = h - .015; ceilingPlane.receiveShadow = true; ceilingPlane.name = `ceiling-design-${ceilingFinish}`; ceilingPlane.visible = !cutaway; scene.add(ceilingPlane);
  const ceilingDetails = new THREE.Group(); ceilingDetails.name = `room-ceiling-${ceilingFinish}`;
  const trimMaterial = new THREE.MeshPhysicalMaterial({ color: ceilingFinish === 'warm' ? '#8d7452' : '#252824', metalness: ceilingFinish === 'warm' ? .45 : .72, roughness: .3, clearcoat: .25 });
  if (ceilingFinish === 'gallery' && draft.templateId !== 'pavilion') {
    [-w * .2, w * .2].forEach((x) => { const track = new THREE.Mesh(new RoundedBoxGeometry(.055, .055, d * .64, 3, .012), trimMaterial); track.position.set(x, h - .07, 0); ceilingDetails.add(track); });
  }
  if (ceilingFinish === 'warm' && draft.templateId !== 'pavilion') {
    const bars: Array<[number, number, number, number]> = [[0, -d * .36, w * .72, .08], [0, d * .36, w * .72, .08], [-w * .36, 0, .08, d * .72], [w * .36, 0, .08, d * .72]];
    bars.forEach(([x, z, width, depth]) => { const bar = new THREE.Mesh(new RoundedBoxGeometry(width, .105, depth, 3, .018), trimMaterial); bar.position.set(x, h - .09, z); ceilingDetails.add(bar); });
    const glow = new THREE.PointLight('#ffd8a4', 3.2, Math.max(w, d) * .62, 1.8); glow.position.set(0, h - .34, 0); ceilingDetails.add(glow);
  }
  if (ceilingFinish === 'dark' && draft.templateId !== 'pavilion') {
    const ledMaterial = new THREE.MeshStandardMaterial({ color: '#fff4d7', emissive: '#ffd69b', emissiveIntensity: 5.2, roughness: .2 });
    [-w * .24, 0, w * .24].forEach((x) => { const strip = new THREE.Mesh(new RoundedBoxGeometry(.045, .035, d * .72, 3, .01), ledMaterial); strip.position.set(x, h - .08, 0); ceilingDetails.add(strip); });
    [-w * .24, 0, w * .24].forEach((x) => { const glow = new THREE.PointLight('#ffd9a3', 2.2, Math.min(w, d) * .6, 1.65); glow.position.set(x, h - .35, 0); ceilingDetails.add(glow); });
  }
  ceilingDetails.visible = !cutaway;
  scene.add(ceilingDetails);
  const architecture = new THREE.Group(); architecture.name = `architecture-${draft.templateId}`; scene.add(architecture);
  if (draft.templateId === 'white-cube') {
    const revealMaterial = wall.clone(); const glowMaterial = new THREE.MeshStandardMaterial({ color: '#f4f2e9', emissive: '#fff9df', emissiveIntensity: 1.8, roughness: .55 });
    [-1, 1].forEach((side) => {
      const wingDepth = d * .2; const wing = new THREE.Mesh(new RoundedBoxGeometry(.16, h * .72, wingDepth, 3, .02), revealMaterial); wing.position.set(side * w * .31, h * .36, -d / 2 + wingDepth / 2 + .18); architecture.add(wing);
      const reveal = new THREE.Mesh(new RoundedBoxGeometry(.035, h * .54, .05, 3, .012), glowMaterial); reveal.position.set(side * (w * .31 - .1), h * .39, -d / 2 + wingDepth + .17); architecture.add(reveal);
    });
  }
  if (draft.templateId === 'nocturne') {
    const mineral = new THREE.MeshPhysicalMaterial({ color: '#1a1b19', roughness: .64, metalness: .08, clearcoat: .12, envMapIntensity: .62 });
    const bronze = new THREE.MeshPhysicalMaterial({ color: '#8a6940', roughness: .3, metalness: .72, clearcoat: .25 });
    [-1, 1].forEach((side) => { const wing = new THREE.Mesh(new RoundedBoxGeometry(.18, h * .7, d * .31, 4, .035), mineral); wing.position.set(side * w * .34, h * .35, -d * .17); wing.rotation.y = side * -.34; architecture.add(wing); });
    const stage = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.65, .18, 64), mineral); stage.position.set(0, .09, .65); architecture.add(stage);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.85, .035, 10, 72), bronze); ring.rotation.x = Math.PI / 2; ring.position.set(0, h - .32, .35); architecture.add(ring);
  }
  if (draft.templateId === 'pavilion') {
    // A rational museum plan inspired by the supplied reference: a long central
    // gallery, four enclosed corner rooms, a broad cross-gallery, and one clean
    // freestanding exhibition wall. Every opening is centered and structural
    // elements terminate at wall junctions rather than crossing circulation.
    const partitionMaterial = wall.clone(); partitionMaterial.side = THREE.DoubleSide; partitionMaterial.emissiveIntensity = .08;
    if (dollhouse) { partitionMaterial.transparent = true; partitionMaterial.opacity = .34; partitionMaterial.depthWrite = false; }
    const partitionHeight = h - .08; const partitionThickness = .34;
    const sideBoundaryX = w * .25; const crossGalleryZ = d * .2; const sideRoomDepth = d / 2 - crossGalleryZ;
    const sideRoomCenterZ = crossGalleryZ + sideRoomDepth / 2; const doorwayWidth = 5.6; const doorwayHeight = 3.55;
    const doorwaySideLength = (sideRoomDepth - doorwayWidth) / 2;
    const addPartition = (width: number, depth: number, x: number, z: number, y = partitionHeight / 2, height = partitionHeight) => {
      const partition = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), partitionMaterial); partition.position.set(x, y, z); partition.castShadow = true; partition.receiveShadow = true; architecture.add(partition); return partition;
    };
    [-1, 1].forEach((xSide) => [-1, 1].forEach((zSide) => {
      const roomCenterZ = zSide * sideRoomCenterZ;
      [-1, 1].forEach((doorSide) => {
        const segmentZ = roomCenterZ + doorSide * (doorwayWidth / 2 + doorwaySideLength / 2);
        addPartition(partitionThickness, doorwaySideLength, xSide * sideBoundaryX, segmentZ);
      });
      const headerHeight = partitionHeight - doorwayHeight;
      addPartition(partitionThickness, doorwayWidth, xSide * sideBoundaryX, roomCenterZ, doorwayHeight + headerHeight / 2, headerHeight);
      const roomWidth = w / 2 - sideBoundaryX;
      addPartition(roomWidth, partitionThickness, xSide * (sideBoundaryX + roomWidth / 2), zSide * crossGalleryZ);
    }));
    // Square plaster piers reinforce the four wall junctions and stay fully out
    // of the centered 5.6 m door openings.
    [-1, 1].forEach((xSide) => [-1, 1].forEach((zSide) => {
      const pier = new THREE.Mesh(new RoundedBoxGeometry(.72, partitionHeight, .72, 4, .035), partitionMaterial); pier.position.set(xSide * sideBoundaryX, partitionHeight / 2, zSide * crossGalleryZ); pier.castShadow = true; pier.receiveShadow = true; architecture.add(pier);
    }));
    const dividerHeight = Math.min(4.55, h - .75); const dividerMaterial = partitionMaterial.clone();
    const divider = new THREE.Mesh(new RoundedBoxGeometry(dividerWidth, dividerHeight, .34, 6, .045), dividerMaterial); divider.position.set(0, dividerHeight / 2, PAVILION_DIVIDER_Z); divider.castShadow = true; divider.receiveShadow = true; architecture.add(divider);
    const raycastMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
    const addDividerSurface = (wallId: WallId, z: number, rotationY: number) => { const surface = new THREE.Mesh(new THREE.PlaneGeometry(dividerWidth, dividerHeight), raycastMaterial); surface.position.set(0, dividerHeight / 2, z); surface.rotation.y = rotationY; surface.userData.wallId = wallId; scene.add(surface); wallSurfaces.push(surface); };
    addDividerSurface('divider-front', PAVILION_DIVIDER_Z + .175, 0); addDividerSurface('divider-back', PAVILION_DIVIDER_Z - .175, Math.PI);
    const skylightWidth = 10.5; const skylightDepth = 6.5;
    const skyGlass = new THREE.MeshPhysicalMaterial({ color: '#e9f3f6', emissive: '#d8edff', emissiveIntensity: 1.65, roughness: .14, transmission: .28, transparent: true, opacity: .9, side: THREE.DoubleSide });
    [-1, 1].forEach((zone) => {
      const zoneZ = zone * d * .255;
      const panel = new THREE.Mesh(new RoundedBoxGeometry(skylightWidth, .055, skylightDepth, 5, .025), skyGlass); panel.position.set(0, h - .12, zoneZ); panel.visible = !cutaway; architecture.add(panel);
      const revealHeight = .48; const revealY = h - revealHeight / 2 - .14;
      [-1, 1].forEach((side) => { addPartition(skylightWidth + .7, .28, 0, zoneZ + side * (skylightDepth / 2 + .14), revealY, revealHeight).visible = !cutaway; addPartition(.28, skylightDepth, side * (skylightWidth / 2 + .14), zoneZ, revealY, revealHeight).visible = !cutaway; });
      const daylight = new THREE.RectAreaLight(zone > 0 ? '#fff3da' : '#e4efff', 4.2, skylightWidth * .8, skylightDepth * .8); daylight.position.set(0, h - .42, zoneZ); daylight.rotation.x = -Math.PI / 2; daylight.visible = !cutaway; architecture.add(daylight);
    });
    // A restrained central lighting spine follows the circulation axis without
    // crossing doors or pretending to be structural beams.
    const spineMaterial = new THREE.MeshStandardMaterial({ color: '#f8f4ea', emissive: ceilingFinish === 'dark' ? '#ffd59b' : '#fff4dc', emissiveIntensity: ceilingFinish === 'dark' ? 4.4 : 2.1, roughness: .3 });
    [-1, 1].forEach((side) => { const spine = new THREE.Mesh(new RoundedBoxGeometry(.045, .035, d * .78, 3, .01), spineMaterial); spine.position.set(side * 7.2, h - .1, 0); spine.visible = !cutaway; architecture.add(spine); });
  }
  if (draft.templateId === 'nocturne') { const plinth = new THREE.Mesh(new THREE.CylinderGeometry(.82, .82, .82, 48), new THREE.MeshStandardMaterial({ color: '#111210', roughness: .62 })); plinth.position.set(0, .5, .65); scene.add(plinth); }
  const decorObjects = draft.decor.map((item) => createDecor(item, selectedDecorId === item.id));
  decorObjects.forEach((item) => { item.position.x = THREE.MathUtils.clamp(item.position.x, -w / 2 + .45, w / 2 - .45); item.position.z = THREE.MathUtils.clamp(item.position.z, -d / 2 + .45, d / 2 - .45); scene.add(item); });
  return { w, d, h, decorObjects, floorMesh, wallSurfaces, exteriorWalls, architecture, roof, ceilingPlane, ceilingDetails };
}

function addLighting(scene: THREE.Scene, draft: GalleryDraft, w: number, d: number, h: number, dollhouse = false) {
  const settings = {
    daylight: { hemi: 1.1, ambient: .5, key: 2.25, spot: 38, color: '#fff8e9' },
    museum: { hemi: .48, ambient: .44, key: 2.1, spot: 58, color: '#ffe6bd' },
    evening: { hemi: .38, ambient: .34, key: 1.85, spot: 48, color: '#ffc987' }
  }[draft.lighting];
  // The environment stays neutral; only this room-owned rig changes presets.
  scene.background = new THREE.Color('#111310');
  const rig = new THREE.Group(); rig.name = `room-lighting-${draft.templateId}-${draft.lighting}`; scene.add(rig);
  rig.add(new THREE.AmbientLight('#fffdf8', settings.ambient), new THREE.HemisphereLight('#f4f2ea', '#d8d5cb', settings.hemi));
  const main = new THREE.DirectionalLight(settings.color, settings.key); main.position.set(0, h + .8, 0); main.castShadow = true; main.shadow.mapSize.set(2048, 2048); main.shadow.bias = .00012; main.shadow.normalBias = .025; const shadowExtent = Math.max(w, d) * .52; main.shadow.camera.left = -shadowExtent; main.shadow.camera.right = shadowExtent; main.shadow.camera.top = shadowExtent; main.shadow.camera.bottom = -shadowExtent; main.shadow.camera.far = h * 3; main.shadow.camera.updateProjectionMatrix(); rig.add(main);

  const artworkTargets = draft.artworks.slice(0, getTemplate(draft.templateId).maxArtworks).map((artwork) => {
    const [x, y, z] = WALLS[artwork.wall].position(artwork.x, artwork.y, w, d); const target = new THREE.Vector3(x, y, z);
    const source = target.clone(); source.y = h - .35;
    if (artwork.wall === 'north') source.z += 2.25;
    if (artwork.wall === 'south') source.z -= 2.25;
    if (artwork.wall === 'west') source.x += 2.25;
    if (artwork.wall === 'east') source.x -= 2.25;
    if (artwork.wall === 'divider-front') source.z += 2;
    if (artwork.wall === 'divider-back') source.z -= 2;
    source.x = THREE.MathUtils.clamp(source.x, -w / 2 + .5, w / 2 - .5); source.z = THREE.MathUtils.clamp(source.z, -d / 2 + .5, d / 2 - .5);
    return { source, target };
  });
  const lightTargets = artworkTargets.length ? artworkTargets : [-.27, 0, .27].map((ratio) => ({ source: new THREE.Vector3(w * ratio, h - .35, -d * .08), target: new THREE.Vector3(w * ratio, 0, -d * .08) }));
  const fixtureMaterial = new THREE.MeshStandardMaterial({ color: draft.lighting === 'daylight' ? '#deddd8' : '#171816', metalness: .72, roughness: .24 });
  const bulbMaterial = new THREE.MeshStandardMaterial({ color: '#fff7df', emissive: settings.color, emissiveIntensity: 3.2, roughness: .18 });
  const down = new THREE.Vector3(0, -1, 0);
  lightTargets.forEach(({ source, target }) => {
    const direction = target.clone().sub(source).normalize();
    const mount = new THREE.Mesh(new THREE.CylinderGeometry(.13, .13, .07, 24), fixtureMaterial); mount.position.set(source.x, h - .05, source.z);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(.026, .026, .15, 14), fixtureMaterial); stem.position.set(source.x, h - .16, source.z);
    const joint = new THREE.Mesh(new THREE.SphereGeometry(.075, 18, 12), fixtureMaterial); joint.position.set(source.x, h - .24, source.z);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(.09, .14, .3, 24), fixtureMaterial); head.position.copy(source); head.quaternion.setFromUnitVectors(down, direction);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(.075, 16, 10), bulbMaterial); bulb.position.copy(source).addScaledVector(direction, .16);
    mount.visible = stem.visible = joint.visible = head.visible = bulb.visible = !dollhouse;
    const spot = new THREE.SpotLight(settings.color, settings.spot, Math.max(12, h * 1.8), .33, .72, 1.55); spot.position.copy(bulb.position); spot.target.position.copy(target); spot.castShadow = false;
    rig.add(mount, stem, joint, head, bulb, spot, spot.target);
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
  let dragging = false; let dragged = false; let pointerId = -1; let lastX = 0; let lastY = 0; let yaw = camera.rotation.y; let pitch = camera.rotation.x; let eyeHeight = camera.position.y; let targetFov = camera.fov; let lastPinchDistance = 0;
  const touches = new Map<number, { x: number; y: number }>();
  const syncRotation = () => { const rotation = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ'); pitch = rotation.x; yaw = rotation.y; camera.rotation.set(pitch, yaw, 0, 'YXZ'); };
  const lookAt = (target: THREE.Vector3) => { eyeHeight = camera.position.y; camera.lookAt(target); syncRotation(); };
  const pinchDistance = () => { const points = [...touches.values()]; return points.length < 2 ? 0 : Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y); };
  const pointerDown = (event: PointerEvent) => { if (!enabled || event.button !== 0) return; if (event.pointerType === 'touch') { touches.set(event.pointerId, { x: event.clientX, y: event.clientY }); if (touches.size === 2) { dragging = false; pointerId = -1; dragged = true; lastPinchDistance = pinchDistance(); return; } } dragging = true; dragged = false; pointerId = event.pointerId; lastX = event.clientX; lastY = event.clientY; if (event.isTrusted) canvas.setPointerCapture(event.pointerId); canvas.classList.add('is-looking'); };
  const pointerMove = (event: PointerEvent) => { if (event.pointerType === 'touch' && touches.has(event.pointerId)) { touches.set(event.pointerId, { x: event.clientX, y: event.clientY }); if (touches.size >= 2) { const distance = pinchDistance(); if (lastPinchDistance) targetFov = THREE.MathUtils.clamp(targetFov + (lastPinchDistance - distance) * .075, 40, 72); lastPinchDistance = distance; dragged = true; event.preventDefault(); return; } } if (!dragging || event.pointerId !== pointerId) return; const dx = event.clientX - lastX; const dy = event.clientY - lastY; if (Math.abs(dx) + Math.abs(dy) > 2) dragged = true; yaw -= dx * .0032; pitch -= dy * .0032; pitch = THREE.MathUtils.clamp(pitch, -1.22, 1.22); camera.rotation.set(pitch, yaw, 0, 'YXZ'); lastX = event.clientX; lastY = event.clientY; };
  const pointerUp = (event: PointerEvent) => { if (event.pointerType === 'touch') { touches.delete(event.pointerId); lastPinchDistance = touches.size >= 2 ? pinchDistance() : 0; } if (event.pointerId !== pointerId) return; dragging = false; pointerId = -1; canvas.classList.remove('is-looking'); };
  const wheel = (event: WheelEvent) => { if (!enabled) return; targetFov = THREE.MathUtils.clamp(targetFov + event.deltaY * .012, 40, 72); event.preventDefault(); };
  const contextMenu = (event: Event) => event.preventDefault();
  canvas.addEventListener('pointerdown', pointerDown); canvas.addEventListener('pointermove', pointerMove); canvas.addEventListener('pointerup', pointerUp); canvas.addEventListener('pointercancel', pointerUp); canvas.addEventListener('wheel', wheel, { passive: false }); canvas.addEventListener('contextmenu', contextMenu);
  let previousTime = performance.now(); const forward = new THREE.Vector3(); const right = new THREE.Vector3(); const desired = new THREE.Vector3(); const velocity = new THREE.Vector3(); const previous = new THREE.Vector3();
  const update = () => {
    const now = performance.now(); const delta = Math.min((now - previousTime) / 1000, .05); previousTime = now; camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.exp(-11 * delta)); camera.updateProjectionMatrix(); if (!enabled) return;
    const turnDirection = (keys.has('ArrowLeft') ? 1 : 0) - (keys.has('ArrowRight') ? 1 : 0); if (turnDirection) { yaw += turnDirection * 1.72 * delta; camera.rotation.set(pitch, yaw, 0, 'YXZ'); }
    camera.getWorldDirection(forward); forward.y = 0; if (forward.lengthSq() < .001) forward.set(0, 0, -1); forward.normalize(); right.crossVectors(forward, camera.up).normalize(); desired.set(0, 0, 0);
    if (keys.has('KeyW') || keys.has('ArrowUp')) desired.add(forward);
    if (keys.has('KeyS') || keys.has('ArrowDown')) desired.sub(forward);
    if (keys.has('KeyD')) desired.add(right);
    if (keys.has('KeyA')) desired.sub(right);
    if (desired.lengthSq()) desired.normalize().multiplyScalar(2.75);
    else if (destination) { desired.subVectors(destination, camera.position); desired.y = 0; const distance = desired.length(); if (distance < .14) { destination = null; desired.set(0, 0, 0); } else desired.normalize().multiplyScalar(Math.min(2.6, Math.max(.7, distance * 1.5))); }
    velocity.lerp(desired, 1 - Math.exp(-9 * delta)); previous.copy(camera.position); camera.position.addScaledVector(velocity, delta);
    const current = bounds(); camera.position.x = THREE.MathUtils.clamp(camera.position.x, current.minX, current.maxX); camera.position.z = THREE.MathUtils.clamp(camera.position.z, current.minZ, current.maxZ); camera.position.y = eyeHeight; collision?.(camera.position, previous);
  };
  const moveTo = (point: THREE.Vector3) => { const current = bounds(); destination = point.clone(); destination.x = THREE.MathUtils.clamp(destination.x, current.minX, current.maxX); destination.z = THREE.MathUtils.clamp(destination.z, current.minZ, current.maxZ); destination.y = eyeHeight; };
  const setEnabled = (value: boolean) => { enabled = value; keys.clear(); velocity.set(0, 0, 0); if (!value) destination = null; };
  const consumeClick = () => { const isClick = !dragged && enabled; dragged = false; return isClick; };
  return { update, lookAt, moveTo, setEnabled, consumeClick, hasDestination: () => destination !== null, dispose: () => { window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); window.removeEventListener('blur', blur); canvas.removeEventListener('pointerdown', pointerDown); canvas.removeEventListener('pointermove', pointerMove); canvas.removeEventListener('pointerup', pointerUp); canvas.removeEventListener('pointercancel', pointerUp); canvas.removeEventListener('wheel', wheel); canvas.removeEventListener('contextmenu', contextMenu); } };
}

type WalkController = ReturnType<typeof createFirstPersonWalk>;

type CinematicTour = { positions: THREE.Vector3[]; looks: THREE.Vector3[]; finalLook: THREE.Vector3 };

function createCinematicIntro(camera: THREE.PerspectiveCamera, tour: CinematicTour, navigation: WalkController, element: HTMLElement, onComplete?: () => void, labelText = 'Private view', titleText = 'Entering exhibition') {
  const curve = new THREE.CatmullRomCurve3(tour.positions, false, 'centripetal', .38); const lookCurve = new THREE.CatmullRomCurve3(tour.looks, false, 'centripetal', .38); const desktopDuration = THREE.MathUtils.clamp(curve.getLength() * 410, 6400, 11500); const duration = innerWidth < 620 ? Math.min(desktopDuration, 7200) : desktopDuration; const startedAt = performance.now(); const baseFov = camera.fov; let complete = false; let phaseIndex = -1;
  const position = new THREE.Vector3(); const cinematicLook = new THREE.Vector3(); const phases = ['Arrival', 'The architecture', 'The collection', 'Your visit'];
  const overlay = document.createElement('div'); overlay.className = 'cinematic-intro'; overlay.setAttribute('aria-label', 'Cinematic gallery introduction'); const copy = document.createElement('div'); copy.className = 'cinematic-copy'; const label = document.createElement('span'); const title = document.createElement('strong'); const phase = document.createElement('small'); phase.setAttribute('aria-live', 'polite'); const line = document.createElement('i'); const skip = document.createElement('button'); skip.type = 'button'; skip.setAttribute('aria-label', 'Skip the gallery introduction and enter now'); label.textContent = labelText; title.textContent = titleText; phase.textContent = phases[0]; skip.textContent = 'Enter now'; copy.append(label, title, phase, line); overlay.append(copy, skip); element.appendChild(overlay); navigation.setEnabled(false);
  const finish = () => { if (complete) return; complete = true; camera.fov = baseFov; camera.updateProjectionMatrix(); camera.position.copy(tour.positions[tour.positions.length - 1]); navigation.lookAt(tour.finalLook); navigation.setEnabled(true); overlay.classList.add('is-finished'); window.setTimeout(() => overlay.remove(), 650); onComplete?.(); };
  const update = () => { if (complete) return; if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { finish(); return; } const raw = Math.min(1, (performance.now() - startedAt) / duration); const eased = raw * raw * raw * (raw * (raw * 6 - 15) + 10); curve.getPointAt(eased, position); lookCurve.getPointAt(eased, cinematicLook); camera.position.copy(position); camera.lookAt(cinematicLook); camera.fov = baseFov + Math.sin(raw * Math.PI) * 2.2; camera.updateProjectionMatrix(); const nextPhase = Math.min(phases.length - 1, Math.floor(raw * phases.length)); if (nextPhase !== phaseIndex) { phaseIndex = nextPhase; phase.textContent = phases[nextPhase]; } line.style.transform = `scaleX(${raw})`; overlay.style.setProperty('--cinematic-progress', String(raw)); if (raw >= 1) finish(); };
  skip.addEventListener('click', finish);
  return { update, skip: finish, isComplete: () => complete, dispose: () => { skip.removeEventListener('click', finish); overlay.remove(); } };
}

function galleryIntroTour(draft: GalleryDraft, w: number, d: number): CinematicTour {
  const finish = new THREE.Vector3(0, VISITOR_EYE_HEIGHT, d / 2 - 1); const finalLook = new THREE.Vector3(0, VISITOR_EYE_HEIGHT, -1);
  const artworkLooks = draft.artworks.slice(0, 8).map((artwork) => { const [x, y, z] = WALLS[artwork.wall].position(artwork.x, artwork.y, w, d); return new THREE.Vector3(x, y, z); });
  const focus = (index: number, fallback: THREE.Vector3) => artworkLooks.length ? artworkLooks[index % artworkLooks.length] : fallback;
  if (draft.templateId === 'pavilion') {
    const southRoomZ = d * .35; const northRoomZ = -southRoomZ;
    const positions = [
      new THREE.Vector3(0, 4.15, d / 2 - 1), new THREE.Vector3(0, 3.2, southRoomZ),
      new THREE.Vector3(w * .36, 2.75, southRoomZ), new THREE.Vector3(0, 3.15, southRoomZ),
      new THREE.Vector3(w * .38, 2.8, 0), new THREE.Vector3(0, 3.25, northRoomZ),
      new THREE.Vector3(-w * .36, 2.7, northRoomZ), new THREE.Vector3(0, 3.25, northRoomZ),
      new THREE.Vector3(-w * .38, 2.75, 0), finish
    ];
    const looks = [
      new THREE.Vector3(0, 2.25, 0), focus(0, new THREE.Vector3(w / 2, 2.4, southRoomZ)),
      focus(1, new THREE.Vector3(w / 2, 2.45, southRoomZ)), new THREE.Vector3(0, 2.4, PAVILION_DIVIDER_Z),
      focus(2, new THREE.Vector3(w / 2, 2.4, 0)), focus(3, new THREE.Vector3(w / 2, 2.4, northRoomZ)),
      focus(4, new THREE.Vector3(-w / 2, 2.4, northRoomZ)), new THREE.Vector3(0, 2.4, PAVILION_DIVIDER_Z),
      focus(5, new THREE.Vector3(-w / 2, 2.4, 0)), finalLook
    ]; return { positions, looks, finalLook };
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
  focusWall?: { wall: WallId; token: number };
  onSelect?: (id: string) => void; onSelectDecor?: (id: string) => void; onMoveDecor?: (id: string, x: number, z: number) => void;
  onMoveArtwork?: (id: string, wall: WallId, x: number, y: number) => void; onViewPlacementChange?: (x: number, z: number) => void;
  visitor?: boolean; viewMode?: GalleryViewMode;
  playIntro?: boolean; onIntroComplete?: () => void; onArtworkFocus?: (artwork: ArtworkFocusInfo | null) => void;
}

function sceneDraftKey(draft: GalleryDraft, visitor: boolean) {
  const artworks = draft.artworks.map((artwork) => [artwork.id, artwork.aspect, artwork.wall, artwork.x, artwork.y, artwork.scale, visitor ? artwork.title : '', visitor ? artwork.year : '', visitor ? artwork.description : ''].join('~')).join('|');
  const decor = draft.decor.map((item) => [item.id, item.type, item.x, item.z, item.rotation, item.scale].join('~')).join('|');
  return [visitor ? 'visitor' : 'editor', visitor ? draft.title : '', visitor ? draft.artist : '', draft.templateId, draft.wall, draft.floor, draft.ceiling ?? 'gallery', draft.lighting, artworks, decor].join('||');
}

function GallerySceneRenderer({ draft, selectedId, selectedDecorId, focusWall, onSelect, onSelectDecor, onMoveDecor, onMoveArtwork, onViewPlacementChange, visitor = false, viewMode = 'walk', playIntro = false, onIntroComplete, onArtworkFocus }: GallerySceneProps) {
  const host = useRef<HTMLDivElement>(null); const introPlayed = useRef(false);
  const cameraState = useRef<{ templateId: GalleryDraft['templateId']; position: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const roomTurn = useRef<((direction: -1 | 1) => void) | null>(null);
  const focusWallView = useRef<((wall: WallId) => void) | null>(null);
  const [editorCutaway, setEditorCutaway] = useState(true);
  useEffect(() => {
    if (!host.current) return; const element = host.current; const scene = new THREE.Scene(); const template = getTemplate(draft.templateId); const [templateW, templateD] = template.dimensions; const dividerWidth = template.dividerWidth ?? PAVILION_DIVIDER_WIDTH;
    const walk = visitor && viewMode === 'walk'; const overview = visitor && viewMode === 'overview'; const camera = new THREE.PerspectiveCamera(walk ? 62 : overview ? 46 : 48, 1, .1, 160); camera.position.set(...template.camera);
    if (overview) camera.position.set(templateW * .68, template.height + Math.max(5.2, templateW * .27), templateD * .78);
    let renderer: THREE.WebGLRenderer; try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); } catch { return showSceneError(element); } renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.03; element.appendChild(renderer.domElement);
    const roomEnvironment = new RoomEnvironment(); const pmremGenerator = new THREE.PMREMGenerator(renderer); const environment = pmremGenerator.fromScene(roomEnvironment, .04).texture; roomEnvironment.dispose(); pmremGenerator.dispose(); scene.environment = environment;
    const controls = walk ? null : new OrbitControls(camera, renderer.domElement); if (controls) {
      const largestDimension = Math.max(templateW, templateD); controls.enableDamping = true; controls.dampingFactor = .075; controls.target.set(0, overview ? template.height * .36 : 1.6, overview ? 0 : -1.5); controls.maxPolarAngle = Math.PI / 2 - .03; controls.minDistance = overview ? largestDimension * .52 : 1.45; controls.maxDistance = overview ? largestDimension * 1.75 : visitor ? Math.max(18, largestDimension * .68) : Math.max(20, largestDimension * 1.12); controls.enablePan = false; controls.enableZoom = true; controls.zoomSpeed = .7; controls.zoomToCursor = true; controls.touches.ONE = THREE.TOUCH.ROTATE; controls.touches.TWO = visitor ? THREE.TOUCH.DOLLY_ROTATE : THREE.TOUCH.ROTATE; controls.autoRotate = visitor; controls.autoRotateSpeed = overview ? .22 : .38;
      if (!visitor && cameraState.current?.templateId === draft.templateId) { camera.position.copy(cameraState.current.position); controls.target.copy(cameraState.current.target); }
    }
    const editorOpenTop = !visitor && editorCutaway; const cutaway = overview || editorOpenTop;
    const { w, d, h, decorObjects, floorMesh, wallSurfaces, exteriorWalls, architecture } = buildRoom(scene, draft, selectedDecorId, overview, editorOpenTop); const installedLights = addLighting(scene, draft, w, d, h, cutaway); element.dataset.roof = editorOpenTop ? 'open' : 'wall-finish'; element.dataset.ceiling = draft.ceiling ?? 'gallery'; element.dataset.artLights = String(installedLights); element.dataset.lightScope = 'room'; element.dataset.wall = draft.wall; element.dataset.floor = draft.floor; element.dataset.dollhouse = overview ? 'active' : 'inactive'; element.dataset.cutaway = cutaway ? 'active' : 'inactive'; element.dataset.roomDimensions = `${w} × ${d} × ${h}`; element.dataset.visitorEyeHeight = String(VISITOR_EYE_HEIGHT); element.dataset.architecture = draft.templateId === 'pavilion' ? 'central-axis-four-side-galleries' : draft.templateId; element.dataset.artworkLayout = draft.artworks.map((artwork) => [artwork.wall, artwork.x.toFixed(3), artwork.y.toFixed(3), artwork.scale.toFixed(3), artwork.aspect.toFixed(3)].join(':')).join('|'); element.dataset.decorLayout = draft.decor.map((item) => [item.type, item.x.toFixed(3), item.z.toFixed(3), item.rotation.toFixed(3), item.scale.toFixed(3)].join(':')).join('|');
    const roomBounds = { minX: -w / 2 + .45, maxX: w / 2 - .45, minZ: -d / 2 + .45, maxZ: d / 2 - .45 };
    const overviewCenter = new THREE.Vector3(0, h * .34, 0); const overviewDirection = new THREE.Vector3();
    const wallNormals: Record<string, THREE.Vector3> = { north: new THREE.Vector3(0, 0, -1), south: new THREE.Vector3(0, 0, 1), west: new THREE.Vector3(-1, 0, 0), east: new THREE.Vector3(1, 0, 0) };
    const updateCutaway = () => {
      if (!cutaway) return; overviewDirection.subVectors(camera.position, overviewCenter).setY(0).normalize();
      exteriorWalls.forEach((mesh) => { const material = mesh.material as THREE.MeshPhysicalMaterial; const facing = wallNormals[String(mesh.userData.wallId)]?.dot(overviewDirection) ?? -1; const targetOpacity = facing > .42 ? .045 : facing > -.16 ? .28 : overview ? .9 : .78; material.opacity = THREE.MathUtils.lerp(material.opacity, targetOpacity, .16); });
    };
    if (walk) camera.position.set(0, VISITOR_EYE_HEIGHT, d / 2 - 1);
    const pavilionCollision: WalkCollision | undefined = draft.templateId === 'pavilion' ? (next, previous) => {
      const wallClearance = .48; const sideBoundaryX = w * .25; const crossGalleryZ = d * .2; const sideRoomCenterZ = crossGalleryZ + (d / 2 - crossGalleryZ) / 2; const doorwayHalfWidth = 2.8;
      if (Math.abs(next.x) <= dividerWidth / 2 + wallClearance && Math.abs(next.z - PAVILION_DIVIDER_Z) <= wallClearance) next.z = previous.z;
      const atSideBoundary = Math.abs(Math.abs(next.x) - sideBoundaryX) <= wallClearance; const insideSideRoomDepth = Math.abs(next.z) >= crossGalleryZ - wallClearance;
      const insideDoorOpening = Math.abs(Math.abs(next.z) - sideRoomCenterZ) < doorwayHalfWidth - .18;
      if (atSideBoundary && insideSideRoomDepth && !insideDoorOpening) next.x = previous.x;
      const atCrossPartition = Math.abs(Math.abs(next.z) - crossGalleryZ) <= wallClearance;
      if (atCrossPartition && Math.abs(next.x) >= sideBoundaryX - wallClearance) next.z = previous.z;
    } : undefined;
    const navigation = walk ? createFirstPersonWalk(camera, renderer.domElement, () => roomBounds, pavilionCollision) : null; const finalLook = new THREE.Vector3(0, VISITOR_EYE_HEIGHT, -1); if (navigation) navigation.lookAt(finalLook);
    const walkMarker = new THREE.Mesh(new THREE.RingGeometry(.18, .25, 32), new THREE.MeshBasicMaterial({ color: '#d9ff43', transparent: true, opacity: .78, side: THREE.DoubleSide })); walkMarker.rotation.x = -Math.PI / 2; walkMarker.position.y = .018; walkMarker.visible = false; if (walk) scene.add(walkMarker);
    let intro = navigation && playIntro && !introPlayed.current ? createCinematicIntro(camera, galleryIntroTour(draft, w, d), navigation, element, () => { introPlayed.current = true; onIntroComplete?.(); }, 'Private view', draft.title) : null;
    let orbitAnimation: { start: number; from: number; to: number; radius: number; y: number; rotateInPlace?: boolean } | null = null;
    let wallCameraAnimation: { start: number; fromPosition: THREE.Vector3; fromTarget: THREE.Vector3; toPosition: THREE.Vector3; toTarget: THREE.Vector3 } | null = null;
    roomTurn.current = (direction) => {
      if (!controls || orbitAnimation) return;
      if (draft.templateId === 'pavilion') {
        const view = controls.target.clone().sub(camera.position); const from = Math.atan2(view.x, view.z);
        orbitAnimation = { start: performance.now(), from, to: from + direction * Math.PI / 4, radius: Math.max(8, view.length()), y: camera.position.y, rotateInPlace: true }; controls.enabled = false; return;
      }
      const offset = camera.position.clone().sub(controls.target); const from = Math.atan2(offset.x, offset.z);
      orbitAnimation = { start: performance.now(), from, to: from + direction * Math.PI / 4, radius: Math.hypot(offset.x, offset.z), y: camera.position.y };
      controls.enabled = false;
    };
    const artworkObjects: THREE.Object3D[] = []; const artworkById = new Map(draft.artworks.map((artwork) => [artwork.id, artwork])); let focusedArtwork: THREE.Object3D | null = null; let focusedArtworkId: string | null = null;
    draft.artworks.forEach((artwork) => {
      const texture = new THREE.TextureLoader().load(artwork.src); texture.colorSpace = THREE.SRGBColorSpace; const height = 1.5 * artwork.scale; const width = height * artwork.aspect;
      const group = new THREE.Group(); group.userData.artworkId = artwork.id; group.userData.wall = artwork.wall;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(width + .12, height + .12, .07), new THREE.MeshStandardMaterial({ color: selectedId === artwork.id ? '#b8945f' : '#1c1b19', metalness: .2, roughness: .45 }));
      const canvas = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map: texture, roughness: .72 })); canvas.position.z = .041; group.add(frame, canvas);
      const config = WALLS[artwork.wall]; const [px, py, pz] = config.position(artwork.x, artwork.y, w, d); group.position.set(px, py, pz); group.rotation.set(...config.rotation); group.traverse((item) => { item.userData.artworkId = artwork.id; }); scene.add(group); artworkObjects.push(group);
    });
    const inwardNormals: Record<WallId, THREE.Vector3> = {
      north: new THREE.Vector3(0, 0, 1), south: new THREE.Vector3(0, 0, -1), west: new THREE.Vector3(1, 0, 0), east: new THREE.Vector3(-1, 0, 0),
      'divider-front': new THREE.Vector3(0, 0, 1), 'divider-back': new THREE.Vector3(0, 0, -1)
    };
    focusWallView.current = (wall) => {
      if (!controls || visitor) return;
      const artwork = draft.artworks.find((item) => item.id === selectedId && item.wall === wall) ?? draft.artworks.find((item) => item.wall === wall);
      const x = artwork?.x ?? 0; const y = artwork?.y ?? Math.min(2.35, h * .48); const [px, py, pz] = WALLS[wall].position(x, y, w, d); const toTarget = new THREE.Vector3(px, py, pz);
      const distance = draft.templateId === 'pavilion' ? 8.2 : 5.4; const toPosition = toTarget.clone().addScaledVector(inwardNormals[wall], distance); toPosition.y = THREE.MathUtils.clamp(py + .55, 2.05, h - .45); toPosition.x = THREE.MathUtils.clamp(toPosition.x, roomBounds.minX, roomBounds.maxX); toPosition.z = THREE.MathUtils.clamp(toPosition.z, roomBounds.minZ, roomBounds.maxZ);
      wallCameraAnimation = { start: performance.now(), fromPosition: camera.position.clone(), fromTarget: controls.target.clone(), toPosition, toTarget }; orbitAnimation = null; controls.enabled = false;
    };
    const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2(); let draggedDecor: THREE.Group | null = null; let draggedArtwork: THREE.Group | null = null; let draggedArtworkPlacement: { id: string; wall: WallId; x: number; y: number } | null = null; let dragPointerId = -1; let pointerStartX = 0; let pointerStartY = 0; let pointerTravel = 0; let suppressSceneClick = false; let editorPinching = false; let editorPinchDistance = 0; let editorZoomDistance: number | null = null;
    const editorTouches = new Map<number, { x: number; y: number }>();
    const currentEditorPinchDistance = () => { const points = [...editorTouches.values()]; return points.length < 2 ? 0 : Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y); };
    const setPointer = (event: PointerEvent) => { const box = renderer.domElement.getBoundingClientRect(); pointer.set(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1); raycaster.setFromCamera(pointer, camera); };
    const closestVisibleWall = () => { const hit = raycaster.intersectObjects([...wallSurfaces, architecture], true)[0]; return hit?.object.userData.wallId ? hit : undefined; };
    const placementFromWallHit = (wallHit: THREE.Intersection<THREE.Object3D>, artwork: GalleryDraft['artworks'][number]) => {
      const wallId = wallHit.object.userData.wallId as WallId; const height = 1.5 * artwork.scale; const width = height * artwork.aspect; const availableWidth = wallId.startsWith('divider') ? dividerWidth : wallId === 'north' || wallId === 'south' ? w : d;
      const horizontal = wallId === 'west' || wallId === 'east' ? wallHit.point.z : wallHit.point.x; const maxX = Math.max(.15, availableWidth / 2 - width / 2 - .12); const wallHeight = wallId.startsWith('divider') ? h - .75 : h;
      return { wall: wallId, x: THREE.MathUtils.clamp(horizontal, -maxX, maxX), y: THREE.MathUtils.clamp(wallHit.point.y, height / 2 + .14, wallHeight - height / 2 - .12) };
    };
    const editorPointerDown = (event: PointerEvent) => {
      if (visitor || event.button !== 0) return;
      if (event.pointerType === 'touch') {
        editorTouches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (editorTouches.size >= 2) {
          editorPinching = true; editorPinchDistance = currentEditorPinchDistance(); editorZoomDistance = controls ? camera.position.distanceTo(controls.target) : null; draggedDecor = null; draggedArtwork = null; draggedArtworkPlacement = null; dragPointerId = -1; renderer.domElement.classList.remove('is-dragging-object', 'is-dragging-artwork'); if (controls) controls.enabled = false; suppressSceneClick = true; return;
        }
      }
      pointerStartX = event.clientX; pointerStartY = event.clientY; pointerTravel = 0; setPointer(event);
      const hit = raycaster.intersectObjects([...artworkObjects, ...decorObjects], true)[0]; const artworkId = hit?.object.userData.artworkId as string | undefined; const decorId = hit?.object.userData.decorId as string | undefined;
      if (artworkId) { draggedArtwork = (artworkObjects.find((item) => item.userData.artworkId === artworkId) as THREE.Group | undefined) ?? null; const artwork = artworkById.get(artworkId); if (draggedArtwork && artwork) draggedArtworkPlacement = { id: artworkId, wall: artwork.wall, x: artwork.x, y: artwork.y }; }
      else if (decorId) draggedDecor = decorObjects.find((item) => item.userData.decorId === decorId) ?? null;
      if (!draggedArtwork && !draggedDecor) return;
      dragPointerId = event.pointerId; if (controls) controls.enabled = false; renderer.domElement.classList.add(draggedArtwork ? 'is-dragging-artwork' : 'is-dragging-object'); if (event.isTrusted) renderer.domElement.setPointerCapture(event.pointerId);
    };
    const editorPointerMove = (event: PointerEvent) => {
      if (visitor) return;
      if (event.pointerType === 'touch' && editorTouches.has(event.pointerId)) {
        editorTouches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (editorPinching && controls && editorTouches.size >= 2) {
          const distance = currentEditorPinchDistance(); if (editorPinchDistance > 0 && distance > 0) editorZoomDistance = THREE.MathUtils.clamp((editorZoomDistance ?? camera.position.distanceTo(controls.target)) * (editorPinchDistance / distance), controls.minDistance, controls.maxDistance); editorPinchDistance = distance; suppressSceneClick = true; event.preventDefault(); return;
        }
      }
      pointerTravel = Math.max(pointerTravel, Math.hypot(event.clientX - pointerStartX, event.clientY - pointerStartY)); if (event.pointerId !== dragPointerId) return;
      setPointer(event);
      if (draggedDecor) { const floorHit = raycaster.intersectObject(floorMesh, false)[0]; if (!floorHit) return; draggedDecor.position.x = THREE.MathUtils.clamp(floorHit.point.x, roomBounds.minX, roomBounds.maxX); draggedDecor.position.z = THREE.MathUtils.clamp(floorHit.point.z, roomBounds.minZ, roomBounds.maxZ); suppressSceneClick = true; return; }
      if (draggedArtwork && draggedArtworkPlacement) {
        const wallHit = closestVisibleWall(); if (!wallHit) return; const artwork = artworkById.get(draggedArtworkPlacement.id); if (!artwork) return;
        const placement = placementFromWallHit(wallHit, artwork); const config = WALLS[placement.wall]; const [px, py, pz] = config.position(placement.x, placement.y, w, d);
        draggedArtwork.position.set(px, py, pz); draggedArtwork.rotation.set(...config.rotation); draggedArtwork.userData.wall = placement.wall; draggedArtworkPlacement = { id: artwork.id, ...placement }; suppressSceneClick = true;
      }
    };
    const editorPointerUp = (event: PointerEvent) => {
      if (!visitor && event.pointerType === 'touch') {
        editorTouches.delete(event.pointerId);
        if (editorPinching) { if (!editorTouches.size) { editorPinching = false; editorPinchDistance = 0; if (controls) controls.enabled = true; } suppressSceneClick = true; return; }
      }
      if (visitor || event.pointerId !== dragPointerId) { if (!visitor && pointerTravel > 5) suppressSceneClick = true; return; }
      if (draggedDecor) { const decorId = draggedDecor.userData.decorId as string; const { x, z } = draggedDecor.position; onSelectDecor?.(decorId); if (pointerTravel > 2) onMoveDecor?.(decorId, x, z); }
      if (draggedArtworkPlacement) { onSelect?.(draggedArtworkPlacement.id); if (pointerTravel > 2) onMoveArtwork?.(draggedArtworkPlacement.id, draggedArtworkPlacement.wall, draggedArtworkPlacement.x, draggedArtworkPlacement.y); }
      renderer.domElement.classList.remove('is-dragging-object', 'is-dragging-artwork'); if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId); if (controls) controls.enabled = true; draggedDecor = null; draggedArtwork = null; draggedArtworkPlacement = null; dragPointerId = -1; suppressSceneClick = pointerTravel > 2;
    };
    const handlePointer = (event: PointerEvent) => {
      setPointer(event);
      if (!visitor) { if (suppressSceneClick) { suppressSceneClick = false; return; } const hit = raycaster.intersectObjects([...artworkObjects, ...decorObjects], true)[0]; const artworkId = hit?.object.userData.artworkId as string | undefined; const decorId = hit?.object.userData.decorId as string | undefined; if (artworkId) onSelect?.(artworkId); else if (decorId) onSelectDecor?.(decorId); else if (selectedDecorId) { const floorHit = raycaster.intersectObject(floorMesh, false)[0]; if (floorHit) onMoveDecor?.(selectedDecorId, THREE.MathUtils.clamp(floorHit.point.x, roomBounds.minX, roomBounds.maxX), THREE.MathUtils.clamp(floorHit.point.z, roomBounds.minZ, roomBounds.maxZ)); } else if (selectedId) { const wallHit = closestVisibleWall(); const artwork = artworkById.get(selectedId); if (wallHit && artwork) { const placement = placementFromWallHit(wallHit, artwork); onMoveArtwork?.(selectedId, placement.wall, placement.x, placement.y); } } return; }
      if (!walk || !navigation?.consumeClick()) return;
      const artHit = raycaster.intersectObjects(artworkObjects, true)[0]; const artworkId = artHit?.object.userData.artworkId as string | undefined;
      if (artworkId) { const artwork = artworkById.get(artworkId); if (!artwork) return; focusedArtwork = artworkObjects.find((item) => item.userData.artworkId === artworkId) ?? artHit.object; focusedArtworkId = artworkId; onArtworkFocus?.({ id: artwork.id, title: artwork.title, artist: draft.artist, description: artwork.description, year: artwork.year, image: artwork.src }); return; }
      const floorHit = raycaster.intersectObject(floorMesh, false)[0]; if (floorHit) { focusedArtwork = null; focusedArtworkId = null; onArtworkFocus?.(null); navigation.moveTo(floorHit.point); walkMarker.position.set(floorHit.point.x, .018, floorHit.point.z); walkMarker.visible = true; }
    };
    renderer.domElement.addEventListener('pointerdown', editorPointerDown); renderer.domElement.addEventListener('pointermove', editorPointerMove); renderer.domElement.addEventListener('pointerup', editorPointerUp); renderer.domElement.addEventListener('pointercancel', editorPointerUp); renderer.domElement.addEventListener('click', handlePointer);
    let frame = 0; const resize = () => { const width = element.clientWidth; const height = element.clientHeight; renderer.setSize(width, height, false); camera.aspect = width / Math.max(height, 1); camera.updateProjectionMatrix(); }; const observer = new ResizeObserver(resize); observer.observe(element); resize();
    const cameraDirection = new THREE.Vector3(); const artworkDirection = new THREE.Vector3(); const artworkPosition = new THREE.Vector3(); const insertionDirection = new THREE.Vector3(); const insertionPoint = new THREE.Vector3(); let placementFrame = 0;
    const animate = () => {
      intro?.update(); navigation?.update(); updateCutaway();
      if (wallCameraAnimation && controls) {
        const raw = Math.min(1, (performance.now() - wallCameraAnimation.start) / 680); const eased = raw * raw * (3 - 2 * raw);
        camera.position.lerpVectors(wallCameraAnimation.fromPosition, wallCameraAnimation.toPosition, eased); controls.target.lerpVectors(wallCameraAnimation.fromTarget, wallCameraAnimation.toTarget, eased); camera.lookAt(controls.target);
        if (raw >= 1) { wallCameraAnimation = null; controls.enabled = true; }
      }
      if (orbitAnimation && controls) {
        const raw = Math.min(1, (performance.now() - orbitAnimation.start) / 520); const eased = raw * raw * (3 - 2 * raw); const angle = THREE.MathUtils.lerp(orbitAnimation.from, orbitAnimation.to, eased);
        if (orbitAnimation.rotateInPlace) controls.target.set(camera.position.x + Math.sin(angle) * orbitAnimation.radius, VISITOR_EYE_HEIGHT, camera.position.z + Math.cos(angle) * orbitAnimation.radius);
        else camera.position.set(controls.target.x + Math.sin(angle) * orbitAnimation.radius, orbitAnimation.y, controls.target.z + Math.cos(angle) * orbitAnimation.radius);
        camera.lookAt(controls.target);
        if (raw >= 1) { orbitAnimation = null; controls.enabled = true; }
      }
      if (editorZoomDistance !== null && controls) {
        const offset = camera.position.clone().sub(controls.target); const distance = offset.length(); const nextDistance = THREE.MathUtils.lerp(distance, editorZoomDistance, .2); if (distance > .0001) camera.position.copy(controls.target).add(offset.multiplyScalar(nextDistance / distance)); if (Math.abs(nextDistance - editorZoomDistance) < .004) editorZoomDistance = null;
      }
      controls?.update();
      if (controls && !visitor) {
        if (!cameraState.current || cameraState.current.templateId !== draft.templateId) cameraState.current = { templateId: draft.templateId, position: camera.position.clone(), target: controls.target.clone() };
        else { cameraState.current.position.copy(camera.position); cameraState.current.target.copy(controls.target); }
        if (onViewPlacementChange && placementFrame++ % 18 === 0) {
          camera.getWorldDirection(insertionDirection); const horizontal = insertionDirection.clone().setY(0); if (horizontal.lengthSq() < .001) horizontal.set(0, 0, -1); horizontal.normalize();
          const floorDistance = insertionDirection.y < -.08 ? THREE.MathUtils.clamp(-camera.position.y / insertionDirection.y, 1.8, 7) : 3.2;
          insertionPoint.copy(camera.position).addScaledVector(horizontal, floorDistance); onViewPlacementChange(THREE.MathUtils.clamp(insertionPoint.x, roomBounds.minX, roomBounds.maxX), THREE.MathUtils.clamp(insertionPoint.z, roomBounds.minZ, roomBounds.maxZ));
        }
      }
      if (!visitor) artworkObjects.forEach((object) => { if (object.userData.wall === 'south') object.visible = camera.position.z < d / 2 - .12; });
      if (walkMarker.visible) { walkMarker.rotation.z += .008; const material = walkMarker.material as THREE.MeshBasicMaterial; material.opacity = .5 + Math.sin(performance.now() * .006) * .25; if (!navigation?.hasDestination()) walkMarker.visible = false; }
      if (focusedArtwork && focusedArtworkId) { camera.getWorldDirection(cameraDirection); focusedArtwork.getWorldPosition(artworkPosition); artworkDirection.subVectors(artworkPosition, camera.position); const distance = artworkDirection.length(); const facing = cameraDirection.dot(artworkDirection.normalize()); if (facing < .48 || distance > 8) { focusedArtwork = null; focusedArtworkId = null; onArtworkFocus?.(null); } }
      element.dataset.cameraPosition = camera.position.toArray().map((value) => value.toFixed(2)).join(','); element.dataset.cameraYaw = camera.rotation.y.toFixed(3); element.dataset.intro = intro && !intro.isComplete() ? 'active' : 'complete'; renderer.render(scene, camera); frame = requestAnimationFrame(animate);
    }; animate();
    return () => { cancelAnimationFrame(frame); roomTurn.current = null; focusWallView.current = null; observer.disconnect(); renderer.domElement.removeEventListener('pointerdown', editorPointerDown); renderer.domElement.removeEventListener('pointermove', editorPointerMove); renderer.domElement.removeEventListener('pointerup', editorPointerUp); renderer.domElement.removeEventListener('pointercancel', editorPointerUp); renderer.domElement.removeEventListener('click', handlePointer); intro?.dispose(); intro = null; navigation?.dispose(); controls?.dispose(); environment.dispose(); disposeObjectTree(scene); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); };
  }, [draft, selectedId, selectedDecorId, onSelect, onSelectDecor, onMoveDecor, onMoveArtwork, onViewPlacementChange, visitor, viewMode, playIntro, onIntroComplete, onArtworkFocus, editorCutaway]);
  useEffect(() => { if (!visitor && focusWall) focusWallView.current?.(focusWall.wall); }, [focusWall, visitor]);
  return <div className={`gallery-scene gallery-scene--${visitor ? viewMode : 'edit'} ${selectedDecorId ? 'gallery-scene--placing' : ''} ${selectedId ? 'gallery-scene--placing-art' : ''}`} ref={host}>{!visitor && <><div className="builder-view-switch" role="group" aria-label="Editor roof view"><button type="button" className={editorCutaway ? 'active' : ''} aria-pressed={editorCutaway} onClick={() => setEditorCutaway(true)}>Open roof</button><button type="button" className={!editorCutaway ? 'active' : ''} aria-pressed={!editorCutaway} onClick={() => setEditorCutaway(false)}>Preview ceiling</button></div><button className="room-turn room-turn--left" type="button" onClick={() => roomTurn.current?.(-1)} aria-label="Rotate room 45 degrees left">←</button><button className="room-turn room-turn--right" type="button" onClick={() => roomTurn.current?.(1)} aria-label="Rotate room 45 degrees right">→</button></>}<div className="scene-hint">{visitor ? viewMode === 'walk' ? 'WASD to walk · ↑↓ move · ←→ turn · Drag to look' : 'Dollhouse overview · Walls fade as you orbit · Scroll or pinch to zoom' : selectedDecorId ? 'Drag object · Click floor to place · Camera stays here' : selectedId ? 'Choose wall → click to place → drag to refine' : 'Open-roof editor · Drag to look · Scroll or pinch to zoom'}</div></div>;
}

export const GalleryScene = memo(GallerySceneRenderer, (previous, next) =>
  sceneDraftKey(previous.draft, previous.visitor ?? false) === sceneDraftKey(next.draft, next.visitor ?? false)
  && previous.selectedId === next.selectedId && previous.selectedDecorId === next.selectedDecorId
  && previous.focusWall?.token === next.focusWall?.token && previous.focusWall?.wall === next.focusWall?.wall
  && previous.onSelect === next.onSelect && previous.onSelectDecor === next.onSelectDecor && previous.onMoveDecor === next.onMoveDecor
  && previous.onMoveArtwork === next.onMoveArtwork && previous.onViewPlacementChange === next.onViewPlacementChange
  && previous.visitor === next.visitor && previous.viewMode === next.viewMode && previous.playIntro === next.playIntro
  && previous.onIntroComplete === next.onIntroComplete && previous.onArtworkFocus === next.onArtworkFocus
);

export function DannyDemoScene({ viewMode = 'walk', playIntro = false, onIntroComplete, onArtworkFocus }: { viewMode?: GalleryViewMode; playIntro?: boolean; onIntroComplete?: () => void; onArtworkFocus?: (artwork: ArtworkFocusInfo | null) => void }) {
  const host = useRef<HTMLDivElement>(null); const introPlayed = useRef(false);
  useEffect(() => {
    if (!host.current) return; const element = host.current; const scene = new THREE.Scene(); scene.background = new THREE.Color('#080908'); const walk = viewMode === 'walk';
    const camera = new THREE.PerspectiveCamera(walk ? 62 : 46, 1, .04, 120); camera.position.set(0, VISITOR_EYE_HEIGHT, 4.8); if (!walk) camera.position.set(16.5, 14.5, 24);
    let renderer: THREE.WebGLRenderer; try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); } catch { return showSceneError(element); } renderer.setPixelRatio(Math.min(devicePixelRatio, 1.4)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .48; element.dataset.visitorEyeHeight = String(VISITOR_EYE_HEIGHT); element.appendChild(renderer.domElement);
    const controls = walk ? null : new OrbitControls(camera, renderer.domElement); if (controls) { controls.enableDamping = true; controls.dampingFactor = .075; controls.target.set(0, 2.35, 3.5); controls.maxPolarAngle = Math.PI / 2 - .04; controls.minDistance = 12; controls.maxDistance = 44; controls.enablePan = false; controls.enableZoom = true; controls.zoomSpeed = .7; controls.zoomToCursor = true; controls.touches.ONE = THREE.TOUCH.ROTATE; controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE; controls.autoRotate = true; controls.autoRotateSpeed = .18; }
    scene.add(new THREE.AmbientLight('#fff4df', .08), new THREE.HemisphereLight('#ffe6ba', '#111310', .2));
    let bounds: Bounds = { minX: -7, maxX: 7, minZ: -8, maxZ: 7 }; const navigation = walk ? createFirstPersonWalk(camera, renderer.domElement, () => bounds) : null; navigation?.setEnabled(!playIntro); let destroyed = false; let demoModel: THREE.Object3D | null = null; let intro: ReturnType<typeof createCinematicIntro> | null = null; let modelErrorCleanup: (() => void) | null = null; element.dataset.dollhouse = walk ? 'inactive' : 'active';
    const artworkObjects: THREE.Object3D[] = []; const floorObjects: THREE.Object3D[] = []; let artworkIndex = 0; let focusedArtwork: THREE.Object3D | null = null; const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2();
    const walkMarker = new THREE.Mesh(new THREE.RingGeometry(.18, .25, 32), new THREE.MeshBasicMaterial({ color: '#d9ff43', transparent: true, opacity: .78, side: THREE.DoubleSide })); walkMarker.rotation.x = -Math.PI / 2; walkMarker.visible = false; if (walk) scene.add(walkMarker);
    const handlePointer = (event: PointerEvent) => { if (!walk || !navigation?.consumeClick()) return; const box = renderer.domElement.getBoundingClientRect(); pointer.set(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1); raycaster.setFromCamera(pointer, camera); const artHit = raycaster.intersectObjects(artworkObjects, true)[0]; const info = artHit?.object.userData.focusInfo as ArtworkFocusInfo | undefined; if (artHit && info) { focusedArtwork = artHit.object; onArtworkFocus?.(info); return; } const floorHit = raycaster.intersectObjects(floorObjects, true)[0]; if (floorHit) { focusedArtwork = null; onArtworkFocus?.(null); navigation.moveTo(floorHit.point); walkMarker.position.copy(floorHit.point); walkMarker.position.y += .02; walkMarker.visible = true; } };
    renderer.domElement.addEventListener('click', handlePointer);
    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder); loader.load('./assets/demo/danny-gallery.glb', (gltf) => {
      if (destroyed) { disposeObjectTree(gltf.scene); return; } demoModel = gltf.scene; scene.add(demoModel); demoModel.updateMatrixWorld(true);
      gltf.scene.traverse((object) => {
        if ((object as THREE.Camera).isCamera || object.name.startsWith('COLLIDER_') || object.userData?.kind === 'aabb' || object.userData?.kind === 'view') object.visible = false;
        if ((object as THREE.Light).isLight) (object as THREE.Light).intensity *= .065;
        const mesh = object as THREE.Mesh; if (!mesh.isMesh) return; const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]; let clickableArtwork = false; let isFloor = false;
        materials.forEach((raw) => {
          const material = raw as THREE.MeshStandardMaterial; const name = `${object.name} ${material.name}`.toLowerCase(); const metadataRole = String(object.userData?.theme_role || material.userData?.theme_role || '').toLowerCase();
          const isCeiling = metadataRole === 'ceiling' || /ceiling|roof/.test(name); const isWall = metadataRole === 'wall' || /wall/.test(name); const isArtwork = metadataRole === 'artwork' || /artwork|surface|wartrobe/.test(name) || Boolean(object.userData?.artwork_id);
          clickableArtwork ||= metadataRole === 'artwork' || /artwork|painting|canvas|picture|wartrobe/.test(name) || Boolean(object.userData?.artwork_id); isFloor ||= metadataRole === 'floor' || /floor|marble|ground/.test(name);
          if (!walk && isCeiling) object.visible = false;
          if (!walk && isWall) { material.transparent = true; material.opacity = .12; material.depthWrite = false; material.side = THREE.DoubleSide; }
          if (material.emissive) { material.emissive.set('#000000'); material.emissiveIntensity = 0; }
          if (isArtwork) { material.color?.set('#ffffff'); material.roughness = .68; }
          else if (material.color) { const color = metadataRole === 'floor' || /floor|marble|stone/.test(name) ? '#101111' : isWall ? '#393631' : isCeiling ? '#1b1c1a' : metadataRole === 'bronze' || /bronze|frame|trim/.test(name) ? '#8e6c3e' : /leaf|stem|botanical/.test(name) ? '#29452a' : '#181916'; material.color.set(color); material.roughness = metadataRole === 'bronze' || /bronze|frame|trim/.test(name) ? .38 : .72; }
          material.needsUpdate = true;
        });
        if (clickableArtwork) { artworkIndex += 1; const info: ArtworkFocusInfo = { id: String(object.userData?.artwork_id || object.uuid), title: String(object.userData?.artwork_title || `Threshold — Study ${String(artworkIndex).padStart(2, '0')}`), artist: 'Danny Hirsch', description: 'An original work presented in the Threshold virtual exhibition.', year: '2026' }; object.userData.focusInfo = info; object.traverse((child) => { child.userData.focusInfo = info; }); artworkObjects.push(object); }
        if (isFloor) floorObjects.push(object);
      });
      const start = gltf.scene.getObjectByName('Walk_Start'); const target = gltf.scene.getObjectByName('Walk_LookTarget'); const minimum = gltf.scene.getObjectByName('Walk_Bounds_Min'); const maximum = gltf.scene.getObjectByName('Walk_Bounds_Max');
      if (walk && start) { camera.position.copy(start.getWorldPosition(new THREE.Vector3())); camera.position.y = VISITOR_EYE_HEIGHT; } const finalPosition = camera.position.clone(); const lookTarget = target?.getWorldPosition(new THREE.Vector3()) ?? new THREE.Vector3(0, 2.4, -2.8); navigation?.lookAt(lookTarget); if (controls) { camera.position.set(16.5, 14.5, 24); controls.target.set(0, 2.35, 3.5); }
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
    }, undefined, () => { if (destroyed) return; element.dataset.error = 'true'; modelErrorCleanup = showSceneError(element, 'The exhibition model could not be loaded. Please check your connection and try again.'); });
    let frame = 0; const resize = () => { const width = element.clientWidth; const height = element.clientHeight; renderer.setSize(width, height, false); camera.aspect = width / Math.max(height, 1); camera.updateProjectionMatrix(); }; const observer = new ResizeObserver(resize); observer.observe(element); resize();
    const cameraDirection = new THREE.Vector3(); const artworkDirection = new THREE.Vector3(); const artworkPosition = new THREE.Vector3();
    const animate = () => { intro?.update(); navigation?.update(); controls?.update(); if (walkMarker.visible) { walkMarker.rotation.z += .008; const material = walkMarker.material as THREE.MeshBasicMaterial; material.opacity = .5 + Math.sin(performance.now() * .006) * .25; if (!navigation?.hasDestination()) walkMarker.visible = false; } if (focusedArtwork) { camera.getWorldDirection(cameraDirection); focusedArtwork.getWorldPosition(artworkPosition); artworkDirection.subVectors(artworkPosition, camera.position); if (cameraDirection.dot(artworkDirection.normalize()) < .48) { focusedArtwork = null; onArtworkFocus?.(null); } } element.dataset.cameraPosition = camera.position.toArray().map((value) => value.toFixed(2)).join(','); element.dataset.cameraYaw = camera.rotation.y.toFixed(3); element.dataset.intro = intro && !intro.isComplete() ? 'active' : 'complete'; renderer.render(scene, camera); frame = requestAnimationFrame(animate); }; animate();
    return () => { destroyed = true; cancelAnimationFrame(frame); observer.disconnect(); renderer.domElement.removeEventListener('click', handlePointer); intro?.dispose(); modelErrorCleanup?.(); navigation?.dispose(); controls?.dispose(); if (demoModel) { scene.remove(demoModel); disposeObjectTree(demoModel); demoModel = null; } disposeObjectTree(walkMarker); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); };
  }, [viewMode, playIntro, onIntroComplete, onArtworkFocus]);
  return <div className={`gallery-scene gallery-scene--${viewMode}`} ref={host}><div className="scene-hint">{viewMode === 'walk' ? 'Danny Hirsch Arts · WASD to walk · ↑↓ move · ←→ turn' : 'Danny Hirsch Arts · Open-roof dollhouse overview'}</div></div>;
}
