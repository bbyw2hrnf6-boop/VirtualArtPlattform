import { memo, useEffect, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { isShortGalleryWall, type DecorPlacement, type GalleryDraft, type WallId } from "./types";
import { artworkPresentationMetrics } from "./artworkPresentation";
import { getTemplate } from "./templates";
import {
  createAdaptiveDpr,
  createPlanarCollisionSystem,
  getRenderQuality,
  planarCollidersFromAuthoredNodes,
  planarCollidersFromObjects,
  type PlanarCollisionSystem,
  type SceneBounds as Bounds,
} from "./scene/runtimeQuality";
import {
  PAVILION_ZONES,
  pavilionZoneCamera,
  type PavilionZoneId,
} from "./scene/pavilionZones";
import {
  normalizeDannyLight,
  selectDannyAuthoredLights,
} from "./scene/dannyLighting";
import { roomLightingProfile } from "./scene/roomLighting";
import { premiumQualityForTier } from "./scene/premiumQuality";
import { VisitorControls } from "./VisitorControls";
import { publicAssetUrl } from "../../services/publicAssetUrl";
import { trackTelemetry } from "../../services/telemetry";
import {
  IDLE_VISITOR_TOUR,
  type VisitorTourState,
} from "./visitorTourState";
import {
  VISITOR_KEYBOARD_CODES,
  VISITOR_KEYBOARD_HINT,
  visitorLookDirection,
} from "./visitorKeyboard";

const PAVILION_DIVIDER_WIDTH = 14;
const PAVILION_DIVIDER_Z = 0;
const VISITOR_EYE_HEIGHT = 1.75;
const configureMeshoptWorkers = MeshoptDecoder.useWorkers;
let meshoptWorkerCount = 0;

function ensureMeshoptWorkers() {
  if (meshoptWorkerCount) return meshoptWorkerCount;
  try {
    meshoptWorkerCount = Math.max(
      1,
      Math.min(2, (navigator.hardwareConcurrency || 4) - 1),
    );
    configureMeshoptWorkers(meshoptWorkerCount);
  } catch {
    meshoptWorkerCount = 0;
  }
  return meshoptWorkerCount;
}

function disposeObjectTree(root: THREE.Object3D) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    materials.filter(Boolean).forEach((raw) => {
      const material = raw as THREE.Material;
      Object.values(material).forEach((value) => {
        if (value instanceof THREE.Texture) value.dispose();
      });
      material.dispose();
    });
  });
}
const WALLS: Record<
  WallId,
  {
    position: (
      x: number,
      y: number,
      w: number,
      d: number,
    ) => [number, number, number];
    rotation: [number, number, number];
  }
> = {
  north: {
    position: (x, y, _w, d) => [x, y, -d / 2 + 0.035],
    rotation: [0, 0, 0],
  },
  south: {
    position: (x, y, _w, d) => [x, y, d / 2 - 0.035],
    rotation: [0, Math.PI, 0],
  },
  west: {
    position: (x, y, w) => [-w / 2 + 0.035, y, x],
    rotation: [0, Math.PI / 2, 0],
  },
  east: {
    position: (x, y, w) => [w / 2 - 0.035, y, x],
    rotation: [0, -Math.PI / 2, 0],
  },
  "divider-front": {
    position: (x, y) => [x, y, PAVILION_DIVIDER_Z + 0.13],
    rotation: [0, 0, 0],
  },
  "divider-back": {
    position: (x, y) => [x, y, PAVILION_DIVIDER_Z - 0.13],
    rotation: [0, Math.PI, 0],
  },
  "north-cross-west": { position: (x, y, w, d) => [-w * .375 + x, y, -d * .2 + .175], rotation: [0, 0, 0] },
  "north-room-west": { position: (x, y, w, d) => [-w * .375 + x, y, -d * .2 - .175], rotation: [0, Math.PI, 0] },
  "north-cross-east": { position: (x, y, w, d) => [w * .375 + x, y, -d * .2 + .175], rotation: [0, 0, 0] },
  "north-room-east": { position: (x, y, w, d) => [w * .375 + x, y, -d * .2 - .175], rotation: [0, Math.PI, 0] },
  "south-cross-west": { position: (x, y, w, d) => [-w * .375 + x, y, d * .2 - .175], rotation: [0, Math.PI, 0] },
  "south-room-west": { position: (x, y, w, d) => [-w * .375 + x, y, d * .2 + .175], rotation: [0, 0, 0] },
  "south-cross-east": { position: (x, y, w, d) => [w * .375 + x, y, d * .2 - .175], rotation: [0, Math.PI, 0] },
  "south-room-east": { position: (x, y, w, d) => [w * .375 + x, y, d * .2 + .175], rotation: [0, 0, 0] },
};

function artworkLightPose(
  artwork: GalleryDraft["artworks"][number],
  w: number,
  d: number,
  h: number,
) {
  const [x, y, z] = WALLS[artwork.wall].position(
    artwork.x,
    artwork.y,
    w,
    d,
  );
  const target = new THREE.Vector3(x, y, z);
  const source = target.clone();
  const wallRotation = WALLS[artwork.wall].rotation[1];
  const wallOffset = isShortGalleryWall(artwork.wall) ? 2 : 2.25;
  source.x += Math.sin(wallRotation) * wallOffset;
  source.y = h - 0.35;
  source.z += Math.cos(wallRotation) * wallOffset;
  source.x = THREE.MathUtils.clamp(source.x, -w / 2 + 0.5, w / 2 - 0.5);
  source.z = THREE.MathUtils.clamp(source.z, -d / 2 + 0.5, d / 2 - 0.5);
  return { source, target };
}
const wallColors = {
  chalk: "#dfdcd4",
  warm: "#b86f58",
  travertine: "#d7cbb6",
  linen: "#c8c0b3",
  charcoal: "#292b29",
  microcement: "#8f8a80",
  limestone: "#d2a257",
  "oak-slats": "#b89162",
  "light-concrete": "#c8c9c7",
  "black-slats": "#252625",
  "marble-wall": "#e8e6df",
  "dark-stone": "#24332d",
};

function createWoodFrameTexture(dark = false) {
  const surface = document.createElement("canvas");
  surface.width = 192;
  surface.height = 48;
  const context = surface.getContext("2d");
  if (!context) return null;
  context.fillStyle = dark ? "#33241c" : "#8b6748";
  context.fillRect(0, 0, surface.width, surface.height);
  for (let line = 0; line < 18; line += 1) {
    const y = 2 + line * 2.7;
    context.beginPath();
    for (let x = 0; x <= surface.width; x += 4) {
      const wave = Math.sin(x * 0.055 + line * 1.7) * (0.7 + (line % 3) * 0.35);
      if (x === 0) context.moveTo(x, y + wave);
      else context.lineTo(x, y + wave);
    }
    context.strokeStyle = dark
      ? `rgba(15, 8, 5, ${0.12 + (line % 4) * 0.018})`
      : `rgba(58, 31, 16, ${0.1 + (line % 4) * 0.018})`;
    context.lineWidth = line % 5 === 0 ? 1.2 : 0.65;
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(surface);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3.5, 1);
  return texture;
}
const floorColors = {
  concrete: "#777672",
  oak: "#49382b",
  terrazzo: "#a7a299",
  marble: "#d8d4cb",
  "black-marble": "#101111",
  walnut: "#4b2c1d",
  "dark-oak": "#26211d",
  microcement: "#afa18d",
  slate: "#262927",
  "dark-concrete": "#444644",
  "travertine-floor": "#d7c5a8",
};
type SurfaceKind = GalleryDraft["wall"] | GalleryDraft["floor"];
const surfaceAssets: Partial<Record<SurfaceKind, string>> = {
  chalk: "./assets/materials/aura-chalk-plaster-v5.webp",
  warm: "./assets/materials/aura-clay-limewash-v5.webp",
  charcoal: "./assets/materials/aura-graphite-concrete-v5.webp",
  marble: "./assets/materials/aura-calacatta-marble-v4.webp",
  "black-marble": "./assets/materials/aura-nero-marquina-v2.webp",
  walnut: "./assets/materials/aura-american-walnut-v2.webp",
  "dark-oak": "./assets/materials/aura-smoked-oak-v2.webp",
  oak: "./assets/materials/aura-natural-oak-v3.webp",
  terrazzo: "./assets/materials/aura-light-terrazzo-v3.webp",
  concrete: "./assets/materials/aura-light-concrete-v5.webp",
  travertine: "./assets/materials/aura-roman-travertine-v2.webp",
  microcement: "./assets/materials/aura-greige-microcement-v5.webp",
  limestone: "./assets/materials/aura-golden-sandstone-v4.webp",
  "oak-slats": "./assets/materials/aura-light-oak-slats-v3.webp",
  slate: "./assets/materials/aura-black-slate-v3.webp",
  "dark-concrete": "./assets/materials/aura-graphite-concrete-v5.webp",
  "travertine-floor": "./assets/materials/aura-roman-travertine-v2.webp",
  "light-concrete": "./assets/materials/aura-light-concrete-v5.webp",
  "black-slats": "./assets/materials/aura-black-oak-slats-v3.webp",
  "marble-wall": "./assets/materials/aura-calacatta-marble-v4.webp",
  "dark-stone": "./assets/materials/aura-green-stone-v4.webp",
};

function createSurfaceTexture(kind: SurfaceKind, base: string, anisotropy = 8) {
  const asset = surfaceAssets[kind];
  if (asset) {
    const texture = new THREE.TextureLoader().load(publicAssetUrl(asset));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = anisotropy;
    if (kind === "marble" || kind === "black-marble" || kind === "marble-wall")
      texture.repeat.set(1.45, 1.45);
    else if (kind === "walnut" || kind === "oak") texture.repeat.set(1.75, 2.4);
    else if (kind === "oak-slats" || kind === "black-slats")
      texture.repeat.set(2.2, 1.05);
    else if (
      kind === "chalk" ||
      kind === "warm" ||
      kind === "charcoal" ||
      kind === "microcement" ||
      kind === "limestone" ||
      kind === "light-concrete" ||
      kind === "dark-concrete"
    )
      texture.repeat.set(1.6, 1.6);
    else if (kind === "slate" || kind === "dark-stone")
      texture.repeat.set(2.1, 2.1);
    else if (kind === "dark-oak") {
      texture.rotation = Math.PI / 2;
      texture.center.set(0.5, 0.5);
      texture.repeat.set(2.2, 1.65);
    } else texture.repeat.set(2.2, 1.8);
    return texture;
  }
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Surface texture could not be created.");
  context.fillStyle = base;
  context.fillRect(0, 0, size, size);
  let seed = kind
    .split("")
    .reduce((total, letter) => total + letter.charCodeAt(0), 17);
  const random = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  if (kind === "linen") {
    for (let x = 0; x < size; x += 4) {
      context.fillStyle = x % 8 ? "#ffffff12" : "#332d2515";
      context.fillRect(x, 0, 1, size);
    }
    for (let y = 0; y < size; y += 4) {
      context.fillStyle = y % 8 ? "#ffffff0e" : "#332d2512";
      context.fillRect(0, y, size, 1);
    }
    for (let fibre = 0; fibre < 1800; fibre++) {
      context.fillStyle = random() > 0.5 ? "#fffdf50d" : "#312c2610";
      context.fillRect(
        random() * size,
        random() * size,
        0.4 + random() * 1.2,
        0.4 + random() * 2,
      );
    }
  } else if (kind === "oak" || kind === "walnut" || kind === "dark-oak") {
    const rowHeight = 64;
    for (let row = 0; row < 8; row++) {
      const y = row * rowHeight;
      context.fillStyle = row % 2 ? "#f2c98d0b" : "#20140d12";
      context.fillRect(0, y, size, rowHeight);
      context.fillStyle = "#21150f66";
      context.fillRect(0, y, size, 1);
      const offset = row % 2 ? 128 : 0;
      for (let x = offset; x < size; x += 256)
        context.fillRect(x, y, 1, rowHeight);
      for (let grain = 0; grain < 12; grain++) {
        const grainY = y + 6 + random() * 50;
        context.strokeStyle = `rgba(27,15,9,${0.025 + random() * 0.055})`;
        context.lineWidth = 0.7 + random();
        context.beginPath();
        context.moveTo(0, grainY);
        context.bezierCurveTo(
          130,
          grainY + random() * 7,
          360,
          grainY - random() * 7,
          size,
          grainY + random() * 3,
        );
        context.stroke();
      }
    }
  } else if (kind === "marble" || kind === "black-marble") {
    const wash = context.createLinearGradient(0, 0, size, size);
    wash.addColorStop(0, "#f4f1e9");
    wash.addColorStop(0.48, base);
    wash.addColorStop(1, "#bbb8b1");
    context.fillStyle = wash;
    context.fillRect(0, 0, size, size);
    for (let vein = 0; vein < 16; vein++) {
      const startY = -80 + random() * 670;
      const drift = -150 + random() * 300;
      const dark = random() > 0.3;
      context.strokeStyle = dark
        ? `rgba(76,79,77,${0.035 + random() * 0.09})`
        : `rgba(255,252,242,${0.12 + random() * 0.16})`;
      context.lineWidth = 5 + random() * 18;
      context.beginPath();
      context.moveTo(-30, startY);
      context.bezierCurveTo(
        120,
        startY + drift * 0.35,
        330,
        startY + drift * 0.8,
        size + 30,
        startY + drift,
      );
      context.stroke();
      context.strokeStyle = dark
        ? `rgba(65,69,68,${0.11 + random() * 0.13})`
        : `rgba(255,255,251,${0.26 + random() * 0.18})`;
      context.lineWidth = 0.6 + random() * 2.2;
      context.beginPath();
      context.moveTo(-30, startY);
      context.bezierCurveTo(
        120,
        startY + drift * 0.35,
        330,
        startY + drift * 0.8,
        size + 30,
        startY + drift,
      );
      context.stroke();
    }
  } else if (kind === "terrazzo") {
    const chips = ["#eee9dc", "#555652", "#b99a7d", "#8e8177", "#242624"];
    for (let index = 0; index < 900; index++) {
      const x = random() * size;
      const y = random() * size;
      const radius = 1 + random() * 4;
      context.fillStyle = `${chips[Math.floor(random() * chips.length)]}${Math.floor(
        80 + random() * 100,
      )
        .toString(16)
        .padStart(2, "0")}`;
      context.beginPath();
      context.moveTo(x + radius, y);
      context.lineTo(x - radius * 0.65, y + radius * 0.72);
      context.lineTo(x - radius * 0.35, y - radius);
      context.closePath();
      context.fill();
    }
  } else if (kind === "concrete") {
    for (let index = 0; index < 2100; index++) {
      const light = random() > 0.48;
      const alpha = 0.012 + random() * 0.05;
      const grainSize = 0.4 + random() * 1.7;
      context.fillStyle = light
        ? `rgba(255,250,238,${alpha})`
        : `rgba(25,24,22,${alpha})`;
      context.fillRect(random() * size, random() * size, grainSize, grainSize);
    }
    for (let cloud = 0; cloud < 34; cloud++) {
      const x = random() * size;
      const y = random() * size;
      const radius = 25 + random() * 70;
      const gradient = context.createRadialGradient(x, y, 1, x, y, radius);
      gradient.addColorStop(0, random() > 0.5 ? "#ffffff08" : "#18181809");
      gradient.addColorStop(1, "#00000000");
      context.fillStyle = gradient;
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  } else {
    for (let patch = 0; patch < 70; patch++) {
      const x = random() * size;
      const y = random() * size;
      const radius = 8 + random() * 40;
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, random() > 0.5 ? "#ffffff0a" : "#1515130b");
      gradient.addColorStop(1, "#00000000");
      context.fillStyle = gradient;
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    for (let grain = 0; grain < 1350; grain++) {
      const light = random() > 0.5;
      context.fillStyle = light
        ? `rgba(255,252,242,${0.012 + random() * 0.025})`
        : `rgba(20,20,18,${0.012 + random() * 0.028})`;
      const grainSize = 0.35 + random();
      context.fillRect(random() * size, random() * size, grainSize, grainSize);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  if (kind === "oak" || kind === "walnut" || kind === "dark-oak")
    texture.repeat.set(2.5, 3.5);
  else if (kind === "marble" || kind === "black-marble")
    texture.repeat.set(1.35, 1.15);
  else if (kind === "chalk" || kind === "warm" || kind === "charcoal")
    texture.repeat.set(3, 2.5);
  else texture.repeat.set(4, 3);
  return texture;
}

function createSurfaceDetailMaps(kind: SurfaceKind) {
  const size = 256;
  const heightCanvas = document.createElement("canvas");
  const roughnessCanvas = document.createElement("canvas");
  heightCanvas.width = heightCanvas.height = size;
  roughnessCanvas.width = roughnessCanvas.height = size;
  const height = heightCanvas.getContext("2d");
  const roughness = roughnessCanvas.getContext("2d");
  if (!height || !roughness)
    throw new Error("Surface detail maps could not be created.");
  const wood = ["oak", "walnut", "dark-oak", "oak-slats", "black-slats"].includes(kind);
  const stone = ["travertine", "limestone", "slate", "dark-stone", "travertine-floor"].includes(kind);
  const marble = ["marble", "black-marble", "marble-wall"].includes(kind);
  const textile = kind === "linen";
  let seed = kind.split("").reduce((total, letter) => total * 31 + letter.charCodeAt(0), 97) >>> 0;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const image = height.createImageData(size, size);
  const roughnessImage = roughness.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const wave = wood
        ? Math.sin(y * .19 + Math.sin(x * .035) * 2.4) * 18
        : textile
          ? ((x % 5 === 0 ? 11 : 0) + (y % 5 === 0 ? 11 : 0))
          : stone
            ? Math.sin(x * .07) * 5 + Math.cos(y * .09) * 5
            : marble
              ? Math.sin((x + y * .42) * .055) * 8
              : Math.sin(x * .032) * 3 + Math.cos(y * .041) * 3;
      const grain = (random() - .5) * (stone ? 28 : wood ? 18 : 14);
      const heightValue = Math.max(0, Math.min(255, 128 + wave + grain));
      const roughBase = marble ? 205 : wood ? 218 : stone ? 234 : textile ? 242 : 228;
      const roughValue = Math.max(24, Math.min(245, roughBase + grain * .7 - wave * .25));
      image.data.set([heightValue, heightValue, heightValue, 255], index);
      roughnessImage.data.set([roughValue, roughValue, roughValue, 255], index);
    }
  }
  height.putImageData(image, 0, 0);
  roughness.putImageData(roughnessImage, 0, 0);
  const bumpMap = new THREE.CanvasTexture(heightCanvas);
  const roughnessMap = new THREE.CanvasTexture(roughnessCanvas);
  [bumpMap, roughnessMap].forEach((texture) => {
    texture.colorSpace = THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 2;
  });
  return { bumpMap, roughnessMap };
}

function showSceneError(
  element: HTMLElement,
  message = "This Space needs WebGL. Please enable hardware acceleration or open it in a current browser.",
) {
  const notice = document.createElement("div");
  const label = document.createElement("span");
  const detail = document.createElement("p");
  notice.className = "scene-error";
  label.textContent = "3D VIEW UNAVAILABLE";
  detail.textContent = message;
  notice.append(label, detail);
  element.appendChild(notice);
  return () => notice.remove();
}

function createLeafGeometry(broad: boolean) {
  const shape = new THREE.Shape();
  if (broad) {
    const points: Array<[number, number]> = [
      [0, -0.43],
      [-0.13, -0.3],
      [-0.31, -0.25],
      [-0.21, -0.11],
      [-0.4, -0.02],
      [-0.23, 0.09],
      [-0.42, 0.2],
      [-0.2, 0.27],
      [-0.29, 0.41],
      [-0.1, 0.39],
      [0, 0.55],
      [0.1, 0.39],
      [0.29, 0.41],
      [0.2, 0.27],
      [0.42, 0.2],
      [0.23, 0.09],
      [0.4, -0.02],
      [0.21, -0.11],
      [0.31, -0.25],
      [0.13, -0.3],
    ];
    shape.moveTo(...points[0]);
    shape.splineThru(points.slice(1).map(([x, y]) => new THREE.Vector2(x, y)));
    shape.lineTo(...points[0]);
    shape.closePath();
    [
      [-0.11, 0.12],
      [0.12, 0.2],
      [-0.08, 0.31],
    ].forEach(([x, y], index) => {
      const hole = new THREE.Path();
      hole.absellipse(
        x,
        y,
        0.026 + index * 0.004,
        0.062,
        0,
        Math.PI * 2,
        false,
        index * 0.15,
      );
      shape.holes.push(hole);
    });
  } else {
    shape.moveTo(0, -0.32);
    shape.bezierCurveTo(-0.14, -0.2, -0.14, 0.18, 0, 0.34);
    shape.bezierCurveTo(0.14, 0.18, 0.14, -0.2, 0, -0.32);
    shape.closePath();
  }
  const geometry = new THREE.ShapeGeometry(shape, 3);
  geometry.computeVertexNormals();
  return geometry;
}

function createPotTexture(light: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 192;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = light ? "#b9aa91" : "#29251f";
  context.fillRect(0, 0, 192, 192);
  let seed = light ? 37 : 71;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let index = 0; index < 950; index++) {
    const value = light
      ? random() > 0.5
        ? 255
        : 62
      : random() > 0.5
        ? 152
        : 8;
    context.fillStyle = `rgba(${value},${value},${value},${0.018 + random() * 0.055})`;
    const size = 0.35 + random() * 1.4;
    context.fillRect(random() * 192, random() * 192, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 1.5);
  return texture;
}

function createPlant(broad = false, potColor: DecorPlacement["potColor"] = "light") {
  const group = new THREE.Group();
  const darkPot = potColor === "black";
  const potTexture = darkPot ? null : createPotTexture(true);
  const ceramic = new THREE.MeshPhysicalMaterial({
    color: darkPot ? "#171817" : "#ffffff",
    map: potTexture,
    roughness: darkPot ? 0.52 : 0.36,
    metalness: 0.03,
    clearcoat: darkPot ? 0.07 : 0.18,
    clearcoatRoughness: 0.45,
  });
  ceramic.name = "plant-pot";
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.37, 0.26, 0.61, 48, 4),
    ceramic,
  );
  pot.position.y = 0.32;
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.35, 0.047, 12, 48),
    ceramic,
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.61;
  const foot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.27, 0.28, 0.055, 40),
    ceramic,
  );
  foot.position.y = 0.028;
  const soil = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 0.04, 36),
    new THREE.MeshStandardMaterial({ color: "#17120e", roughness: 1 }),
  );
  soil.position.y = 0.607;
  const saucer = new THREE.Mesh(
    new THREE.CylinderGeometry(0.31, 0.33, 0.035, 44),
    ceramic,
  );
  saucer.position.y = 0.012;
  group.add(pot, rim, foot, soil, saucer);
  const stemMaterial = new THREE.MeshStandardMaterial({
    color: broad ? "#315035" : "#534a31",
    roughness: 0.88,
  });
  if (!broad) {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.066, 1.3, 14, 5),
      stemMaterial,
    );
    trunk.position.y = 1.18;
    trunk.rotation.z = -0.045;
    group.add(trunk);
  }
  const leafMaterials = ["#315e3c", "#3f7048", "#284d32"].map(
    (color) =>
      new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.62,
        clearcoat: 0.08,
        clearcoatRoughness: 0.68,
        sheen: 0.28,
        sheenColor: new THREE.Color("#b8d5a5"),
        side: THREE.DoubleSide,
      }),
  );
  const veinMaterial = new THREE.LineBasicMaterial({
    color: broad ? "#84a77a" : "#a9b176",
    transparent: true,
    opacity: 0.52,
  });
  const leafGeometry = createLeafGeometry(broad);
  const count = broad ? 10 : 24;
  for (let index = 0; index < count; index++) {
    const angle = index * (broad ? 2.19 : 2.41) + 0.28;
    const ring = broad ? index % 5 : index % 8;
    const reach = broad ? 0.37 + ring * 0.055 : 0.24 + ring * 0.027;
    const height = broad
      ? 0.92 + (index % 6) * 0.18
      : 0.82 + (index % 9) * 0.145;
    const end = new THREE.Vector3(
      Math.sin(angle) * reach,
      height,
      Math.cos(angle) * reach,
    );
    const stemCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0.6, 0),
      new THREE.Vector3(
        end.x * 0.48,
        0.66 + (height - 0.6) * 0.58,
        end.z * 0.48,
      ),
      end,
    );
    const stem = new THREE.Mesh(
      new THREE.TubeGeometry(stemCurve, 12, broad ? 0.014 : 0.008, 7, false),
      stemMaterial,
    );
    group.add(stem);
    const leafGroup = new THREE.Group();
    const leaf = new THREE.Mesh(
      leafGeometry,
      leafMaterials[index % leafMaterials.length],
    );
    leafGroup.add(leaf);
    const veinLength = broad ? 0.77 : 0.52;
    const vein = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, broad ? -0.34 : -0.25, 0.006),
        new THREE.Vector3(0, broad ? 0.43 : 0.27, 0.006),
      ]),
      veinMaterial,
    );
    vein.scale.y = veinLength / (broad ? 0.77 : 0.52);
    leafGroup.add(vein);
    leafGroup.position.copy(end);
    leafGroup.rotation.set(
      -0.18 + (index % 3) * 0.12,
      -angle + Math.PI,
      (index % 2 ? 1 : -1) * (broad ? 0.62 : 0.44),
    );
    leafGroup.scale.setScalar(
      broad ? 0.72 + (index % 3) * 0.045 : 0.62 + (index % 4) * 0.035,
    );
    group.add(leafGroup);
  }
  group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  return group;
}

function createSnakePlant(potColor: DecorPlacement["potColor"] = "light") {
  const group = new THREE.Group();
  const darkPot = potColor === "black";
  const potTexture = darkPot ? null : createPotTexture(true);
  const potMaterial = new THREE.MeshPhysicalMaterial({
    color: darkPot ? "#171817" : "#ffffff",
    map: potTexture,
    roughness: darkPot ? 0.52 : 0.36,
    clearcoat: darkPot ? 0.07 : 0.18,
    clearcoatRoughness: 0.45,
  });
  potMaterial.name = "plant-pot";
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.2, 0.42, 40),
    potMaterial,
  );
  pot.position.y = 0.21;
  group.add(pot);
  const leafMaterial = new THREE.MeshPhysicalMaterial({
    color: "#426244",
    roughness: 0.62,
    sheen: 0.2,
    sheenColor: new THREE.Color("#a8bc80"),
    side: THREE.DoubleSide,
  });
  for (let index = 0; index < 13; index++) {
    const height = 0.56 + (index % 5) * 0.1;
    const leaf = new THREE.Mesh(
      new RoundedBoxGeometry(0.07, height, 0.018, 5, 0.018),
      leafMaterial,
    );
    const angle = (index / 13) * Math.PI * 2;
    leaf.position.set(
      Math.cos(angle) * (0.05 + (index % 3) * 0.035),
      0.4 + height / 2,
      Math.sin(angle) * (0.05 + (index % 3) * 0.035),
    );
    leaf.rotation.set(Math.sin(angle) * 0.13, -angle, Math.cos(angle) * 0.13);
    group.add(leaf);
  }
  return group;
}

function createLeatherBench() {
  const group = new THREE.Group();
  const leather = new THREE.MeshPhysicalMaterial({
    color: "#72513c",
    roughness: 0.36,
    clearcoat: 0.18,
    clearcoatRoughness: 0.5,
    sheen: 0.35,
    sheenColor: new THREE.Color("#bd8a64"),
  });
  const steel = new THREE.MeshPhysicalMaterial({
    color: "#242422",
    metalness: 0.78,
    roughness: 0.26,
    clearcoat: 0.22,
  });
  const seat = new THREE.Mesh(
    new RoundedBoxGeometry(2.25, 0.26, 0.78, 8, 0.075),
    leather,
  );
  seat.position.y = 0.58;
  group.add(seat);
  [-0.86, 0.86].forEach((x) => {
    [-0.26, 0.26].forEach((z) => {
      const leg = new THREE.Mesh(
        new RoundedBoxGeometry(0.07, 0.5, 0.07, 4, 0.018),
        steel,
      );
      leg.position.set(x, 0.27, z);
      group.add(leg);
    });
  });
  return group;
}

function createWoodStool() {
  const group = new THREE.Group();
  const woodTexture = createSurfaceTexture("walnut", floorColors.walnut);
  const wood = new THREE.MeshPhysicalMaterial({
    color: "#8a5b35",
    map: woodTexture,
    roughness: 0.48,
    clearcoat: 0.15,
  });
  const seat = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.36, 0.1, 48),
    wood,
  );
  seat.position.y = 0.58;
  group.add(seat);
  [0, 1, 2].forEach((index) => {
    const angle = (index / 3) * Math.PI * 2;
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.055, 0.54, 16),
      wood,
    );
    leg.position.set(Math.cos(angle) * 0.21, 0.29, Math.sin(angle) * 0.21);
    leg.rotation.z = Math.cos(angle) * 0.12;
    leg.rotation.x = Math.sin(angle) * 0.12;
    group.add(leg);
  });
  return group;
}

function createRopeBarrier() {
  const group = new THREE.Group();
  const brass = new THREE.MeshPhysicalMaterial({
    color: "#a7834f",
    metalness: 0.84,
    roughness: 0.24,
    clearcoat: 0.3,
  });
  [-0.92, 0.92].forEach((x) => {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.26, 0.07, 40),
      brass,
    );
    base.position.set(x, 0.035, 0);
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.045, 0.92, 24),
      brass,
    );
    post.position.set(x, 0.5, 0);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.085, 24, 16), brass);
    cap.position.set(x, 0.98, 0);
    group.add(base, post, cap);
  });
  const ropeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.92, 0.94, 0),
    new THREE.Vector3(0, 0.69, 0),
    new THREE.Vector3(0.92, 0.94, 0),
  ]);
  group.add(
    new THREE.Mesh(
      new THREE.TubeGeometry(ropeCurve, 36, 0.045, 12, false),
      new THREE.MeshPhysicalMaterial({
        color: "#6c2825",
        roughness: 0.72,
        sheen: 0.25,
        sheenColor: new THREE.Color("#bd6d5b"),
      }),
    ),
  );
  return group;
}

function createDecor(item: DecorPlacement, selected: boolean) {
  const group = new THREE.Group();
  group.userData.decorId = item.id;
  if (item.type === "olive" || item.type === "monstera")
    group.add(createPlant(item.type === "monstera", item.potColor));
  if (item.type === "ficus") {
    const ficus = createPlant(true, item.potColor);
    ficus.scale.set(1.08, 1.18, 1.08);
    group.add(ficus);
  }
  if (item.type === "snake-plant") group.add(createSnakePlant(item.potColor));
  if (item.type === "leather-bench") group.add(createLeatherBench());
  if (item.type === "wood-stool") group.add(createWoodStool());
  if (item.type === "rope-barrier") group.add(createRopeBarrier());
  if (item.type === "pedestal") {
    const marbleTexture = createSurfaceTexture("marble", floorColors.marble);
    const marble = new THREE.MeshPhysicalMaterial({
      color: "#f5f2ea",
      map: marbleTexture,
      roughness: 0.3,
      clearcoat: 0.34,
      clearcoatRoughness: 0.32,
      envMapIntensity: 0.72,
    });
    const shadow = new THREE.Mesh(
      new RoundedBoxGeometry(0.75, 0.055, 0.75, 4, 0.018),
      new THREE.MeshStandardMaterial({ color: "#151513", roughness: 0.54 }),
    );
    shadow.position.y = 0.028;
    const pedestal = new THREE.Mesh(
      new RoundedBoxGeometry(0.84, 1.16, 0.84, 7, 0.045),
      marble,
    );
    pedestal.position.y = 0.625;
    const top = new THREE.Mesh(
      new RoundedBoxGeometry(0.94, 0.075, 0.94, 6, 0.025),
      marble,
    );
    top.position.y = 1.235;
    const plaque = new THREE.Mesh(
      new RoundedBoxGeometry(0.28, 0.12, 0.018, 3, 0.008),
      new THREE.MeshPhysicalMaterial({
        color: "#9b8059",
        roughness: 0.28,
        metalness: 0.72,
        clearcoat: 0.26,
      }),
    );
    plaque.position.set(0, 0.72, 0.432);
    group.add(shadow, pedestal, top, plaque);
  }
  if (item.type === "arc-lamp") {
    const metal = new THREE.MeshPhysicalMaterial({
      color: "#141512",
      metalness: 0.9,
      roughness: 0.19,
      clearcoat: 0.34,
      clearcoatRoughness: 0.22,
      envMapIntensity: 1.1,
    });
    const brass = new THREE.MeshPhysicalMaterial({
      color: "#b08a53",
      metalness: 0.82,
      roughness: 0.24,
      clearcoat: 0.3,
    });
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.37, 0.43, 0.085, 48),
      metal,
    );
    base.position.y = 0.045;
    const baseRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.35, 0.018, 8, 48),
      brass,
    );
    baseRing.rotation.x = Math.PI / 2;
    baseRing.position.y = 0.09;
    group.add(base, baseRing);
    const arc = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.08, 0),
      new THREE.Vector3(0, 1.65, 0),
      new THREE.Vector3(0.32, 2.55, 0),
      new THREE.Vector3(1.05, 2.75, 0),
    ]);
    const stem = new THREE.Mesh(
      new THREE.TubeGeometry(arc, 52, 0.027, 12, false),
      metal,
    );
    group.add(stem);
    const shade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.39, 0.4, 48, 1, true),
      metal,
    );
    shade.position.set(1.05, 2.56, 0);
    const shadeInner = new THREE.Mesh(
      new THREE.CylinderGeometry(0.175, 0.375, 0.39, 48, 1, true),
      new THREE.MeshPhysicalMaterial({
        color: "#d3ad70",
        metalness: 0.65,
        roughness: 0.3,
        side: THREE.BackSide,
      }),
    );
    shadeInner.position.copy(shade.position);
    const shadeRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.385, 0.018, 8, 48),
      brass,
    );
    shadeRim.rotation.x = Math.PI / 2;
    shadeRim.position.set(1.05, 2.36, 0);
    group.add(shade, shadeInner, shadeRim);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 18, 12),
      new THREE.MeshStandardMaterial({
        color: "#fff2d3",
        emissive: "#ffbf72",
        emissiveIntensity: 2.4,
        roughness: 0.25,
      }),
    );
    bulb.position.set(1.05, 2.39, 0);
    group.add(bulb);
    const cordCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(1.05, 2.47, 0),
      new THREE.Vector3(1.07, 2.28, 0.008),
      new THREE.Vector3(1.06, 2.12, 0.012),
    ]);
    const cordMaterial = new THREE.MeshStandardMaterial({
      color: "#26241f",
      roughness: 0.8,
    });
    group.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(cordCurve, 14, 0.007, 6, false),
        cordMaterial,
      ),
    );
    const pull = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), brass);
    pull.position.set(1.06, 2.1, 0.012);
    group.add(pull);
    const glow = new THREE.PointLight("#ffd39a", 4.6, 5.2, 1.8);
    glow.position.copy(bulb.position);
    group.add(glow);
  }
  if (item.type === "gallery-bench") {
    const frameMaterial = new THREE.MeshPhysicalMaterial({
      color: "#171816",
      metalness: 0.76,
      roughness: 0.24,
      clearcoat: 0.24,
    });
    const leather = new THREE.MeshPhysicalMaterial({
      color: "#776a5b",
      roughness: 0.46,
      clearcoat: 0.12,
      clearcoatRoughness: 0.58,
      sheen: 0.25,
      sheenColor: new THREE.Color("#b5a48d"),
    });
    const rail = new THREE.Mesh(
      new RoundedBoxGeometry(2.45, 0.1, 0.62, 4, 0.025),
      frameMaterial,
    );
    rail.position.y = 0.42;
    group.add(rail);
    [-0.92, 0.92].forEach((x) => {
      const leg = new THREE.Mesh(
        new RoundedBoxGeometry(0.12, 0.46, 0.52, 4, 0.025),
        frameMaterial,
      );
      leg.position.set(x, 0.23, 0);
      group.add(leg);
    });
    [-0.79, 0, 0.79].forEach((x) => {
      const cushion = new THREE.Mesh(
        new RoundedBoxGeometry(0.75, 0.22, 0.72, 7, 0.065),
        leather,
      );
      cushion.position.set(x, 0.57, 0);
      group.add(cushion);
    });
  }
  if (item.type === "stone-sculpture") {
    const stoneTexture = createSurfaceTexture(
      "travertine",
      wallColors.travertine,
    );
    const stone = new THREE.MeshPhysicalMaterial({
      color: "#f2eadb",
      map: stoneTexture,
      roughness: 0.5,
      clearcoat: 0.08,
      envMapIntensity: 0.5,
    });
    const bronze = new THREE.MeshPhysicalMaterial({
      color: "#735c3e",
      metalness: 0.82,
      roughness: 0.27,
      clearcoat: 0.3,
    });
    const shadow = new THREE.Mesh(
      new THREE.CylinderGeometry(0.48, 0.54, 0.075, 56),
      bronze,
    );
    shadow.position.y = 0.04;
    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.43, 0.58, 56),
      stone,
    );
    plinth.position.y = 0.36;
    const sculpture = new THREE.Mesh(
      new THREE.TorusKnotGeometry(0.38, 0.095, 128, 22, 2, 3),
      stone,
    );
    sculpture.position.y = 1.15;
    sculpture.rotation.set(0.42, 0.25, -0.18);
    group.add(shadow, plinth, sculpture);
  }
  if (item.type === "floor-vase") {
    const ceramicTexture = createPotTexture(true);
    const ceramic = new THREE.MeshPhysicalMaterial({
      color: "#d8c9ad",
      map: ceramicTexture,
      roughness: 0.36,
      clearcoat: 0.22,
      clearcoatRoughness: 0.46,
    });
    const profile = [
      new THREE.Vector2(0.03, 0),
      new THREE.Vector2(0.3, 0.03),
      new THREE.Vector2(0.38, 0.18),
      new THREE.Vector2(0.34, 0.58),
      new THREE.Vector2(0.22, 0.9),
      new THREE.Vector2(0.13, 1.12),
      new THREE.Vector2(0.14, 1.2),
    ];
    const vase = new THREE.Mesh(new THREE.LatheGeometry(profile, 64), ceramic);
    group.add(vase);
    const branchMaterial = new THREE.MeshStandardMaterial({
      color: "#5b4432",
      roughness: 0.9,
    });
    const driedLeafMaterial = new THREE.MeshPhysicalMaterial({
      color: "#a78b62",
      roughness: 0.72,
      side: THREE.DoubleSide,
      sheen: 0.16,
      sheenColor: new THREE.Color("#d4bd91"),
    });
    const driedLeaf = createLeafGeometry(false);
    [-0.23, 0, 0.21].forEach((lean, index) => {
      const top = new THREE.Vector3(
        lean,
        2.15 + index * 0.18,
        (index - 1) * 0.16,
      );
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(0, 1.13, 0),
        new THREE.Vector3(lean * 0.3, 1.65, top.z * 0.45),
        top,
      );
      group.add(
        new THREE.Mesh(
          new THREE.TubeGeometry(curve, 14, 0.009, 6, false),
          branchMaterial,
        ),
      );
      for (let leafIndex = 0; leafIndex < 3; leafIndex++) {
        const leaf = new THREE.Mesh(driedLeaf, driedLeafMaterial);
        leaf.scale.setScalar(0.42 - leafIndex * 0.04);
        leaf.position.copy(curve.getPoint(0.45 + leafIndex * 0.2));
        leaf.rotation.set(
          0.15,
          index * 1.7 + leafIndex,
          (leafIndex % 2 ? 1 : -1) * 0.82,
        );
        group.add(leaf);
      }
    });
  }
  const markerRadius =
    item.type === "gallery-bench" || item.type === "leather-bench"
      ? 1.25
      : item.type === "rope-barrier"
        ? 1.08
      : item.type === "stone-sculpture"
        ? 0.68
        : item.type === "floor-vase" || item.type === "snake-plant"
          ? 0.52
          : 0.46;
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(markerRadius, markerRadius + 0.07, 42),
    new THREE.MeshBasicMaterial({ color: "#d9ff43", side: THREE.DoubleSide }),
  );
  marker.name = "decor-selection-marker";
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = 0.015;
  marker.visible = selected;
  marker.userData.noWalkCollision = true;
  group.add(marker);
  group.position.set(item.x, 0, item.z);
  group.rotation.y = item.rotation;
  group.scale.setScalar(item.scale);
  group.traverse((child) => {
    child.userData.decorId = item.id;
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  return group;
}

function rebuildCeilingDetails(
  group: THREE.Group,
  finish: NonNullable<GalleryDraft["ceiling"]>,
  templateId: GalleryDraft["templateId"],
  w: number,
  d: number,
  h: number,
) {
  [...group.children].forEach((child) => {
    group.remove(child);
    disposeObjectTree(child);
  });
  group.name = `room-ceiling-${finish}`;
  if (templateId === "pavilion") return;
  const trimMaterial = new THREE.MeshPhysicalMaterial({
    color: finish === "warm" ? "#8d7452" : "#252824",
    metalness: finish === "warm" ? 0.45 : 0.72,
    roughness: 0.3,
    clearcoat: 0.25,
  });
  if (finish === "gallery") {
    [-w * 0.2, w * 0.2].forEach((x) => {
      const track = new THREE.Mesh(
        new RoundedBoxGeometry(0.055, 0.055, d * 0.64, 3, 0.012),
        trimMaterial,
      );
      track.position.set(x, h - 0.07, 0);
      group.add(track);
    });
  }
  if (finish === "warm") {
    const bars: Array<[number, number, number, number]> = [
      [0, -d * 0.36, w * 0.72, 0.08],
      [0, d * 0.36, w * 0.72, 0.08],
      [-w * 0.36, 0, 0.08, d * 0.72],
      [w * 0.36, 0, 0.08, d * 0.72],
    ];
    bars.forEach(([x, z, width, depth]) => {
      const bar = new THREE.Mesh(
        new RoundedBoxGeometry(width, 0.105, depth, 3, 0.018),
        trimMaterial,
      );
      bar.position.set(x, h - 0.09, z);
      group.add(bar);
    });
    const glow = new THREE.PointLight("#ffd8a4", 3.2, Math.max(w, d) * 0.62, 1.8);
    glow.position.set(0, h - 0.34, 0);
    group.add(glow);
  }
  if (finish === "dark") {
    const ledMaterial = new THREE.MeshStandardMaterial({
      color: "#fff4d7",
      emissive: "#ffd69b",
      emissiveIntensity: 5.2,
      roughness: 0.2,
    });
    [-w * 0.24, 0, w * 0.24].forEach((x) => {
      const strip = new THREE.Mesh(
        new RoundedBoxGeometry(0.045, 0.035, d * 0.72, 3, 0.01),
        ledMaterial,
      );
      strip.position.set(x, h - 0.08, 0);
      group.add(strip);
      const glow = new THREE.PointLight("#ffd9a3", 2.2, Math.min(w, d) * 0.6, 1.65);
      glow.position.set(x, h - 0.35, 0);
      group.add(glow);
    });
  }
  if (finish === "skylight") {
    const glass = new THREE.Mesh(
      new RoundedBoxGeometry(w * 0.58, 0.045, d * 0.46, 5, 0.02),
      new THREE.MeshPhysicalMaterial({
        color: "#e7f3f6",
        emissive: "#d8edff",
        emissiveIntensity: 1.35,
        roughness: 0.12,
        transmission: 0.3,
        transparent: true,
        opacity: 0.92,
      }),
    );
    glass.position.set(0, h - 0.065, 0);
    group.add(glass);
    const frameWidth = w * 0.58;
    const frameDepth = d * 0.46;
    [
      [0, -frameDepth / 2, frameWidth + 0.18, 0.08],
      [0, frameDepth / 2, frameWidth + 0.18, 0.08],
      [-frameWidth / 2, 0, 0.08, frameDepth],
      [frameWidth / 2, 0, 0.08, frameDepth],
    ].forEach(([x, z, width, depth]) => {
      const frame = new THREE.Mesh(
        new RoundedBoxGeometry(width, 0.09, depth, 3, 0.015),
        trimMaterial,
      );
      frame.position.set(x, h - 0.09, z);
      group.add(frame);
    });
    const daylight = new THREE.RectAreaLight("#e8f4ff", 3.4, frameWidth * 0.8, frameDepth * 0.8);
    daylight.position.set(0, h - 0.22, 0);
    daylight.rotation.x = -Math.PI / 2;
    group.add(daylight);
  }
  if (finish === "vaulted") {
    const width = w * 0.96;
    const depth = d * 0.94;
    const springY = h - Math.min(1.35, h * 0.3);
    const rise = h - 0.09 - springY;
    const xSegments = 32;
    const zSegments = 12;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let zIndex = 0; zIndex <= zSegments; zIndex++) {
      const zRatio = zIndex / zSegments;
      for (let xIndex = 0; xIndex <= xSegments; xIndex++) {
        const xRatio = xIndex / xSegments;
        const x = (xRatio - 0.5) * width;
        const y = springY + Math.sin(xRatio * Math.PI) * rise;
        positions.push(x, y, (zRatio - 0.5) * depth);
        uvs.push(xRatio * 3, zRatio * 3);
      }
    }
    for (let zIndex = 0; zIndex < zSegments; zIndex++) {
      for (let xIndex = 0; xIndex < xSegments; xIndex++) {
        const a = zIndex * (xSegments + 1) + xIndex;
        const b = a + 1;
        const c = a + xSegments + 1;
        const dIndex = c + 1;
        indices.push(a, c, b, b, c, dIndex);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const vaultTexture = createSurfaceTexture("limestone", wallColors.limestone);
    vaultTexture.repeat.set(2.6, 2.2);
    const vault = new THREE.Mesh(
      geometry,
      new THREE.MeshPhysicalMaterial({
        color: "#eee7d9",
        map: vaultTexture,
        roughness: 0.82,
        clearcoat: 0.01,
        side: THREE.DoubleSide,
      }),
    );
    vault.receiveShadow = true;
    group.add(vault);
    const ribMaterial = new THREE.MeshPhysicalMaterial({
      color: "#c7b79d",
      roughness: 0.68,
      clearcoat: 0.025,
    });
    [-0.34, 0, 0.34].forEach((zRatio) => {
      const points = Array.from({ length: 17 }, (_, index) => {
        const ratio = index / 16;
        return new THREE.Vector3(
          (ratio - 0.5) * width,
          springY + Math.sin(ratio * Math.PI) * rise - 0.025,
          zRatio * depth,
        );
      });
      group.add(
        new THREE.Mesh(
          new THREE.TubeGeometry(
            new THREE.CatmullRomCurve3(points),
            48,
            0.045,
            10,
            false,
          ),
          ribMaterial,
        ),
      );
    });
  }
}

function buildRoom(
  scene: THREE.Scene,
  draft: GalleryDraft,
  selectedDecorId?: string,
  dollhouse = false,
  editorCutaway = false,
  qualityTier: ReturnType<typeof getRenderQuality>["tier"] = "balanced",
) {
  const template = getTemplate(draft.templateId);
  const [w, d] = template.dimensions;
  const h = template.height;
  const dividerWidth = template.dividerWidth ?? PAVILION_DIVIDER_WIDTH;
  const cutaway = dollhouse || editorCutaway;
  const premiumQuality = premiumQualityForTier(qualityTier);
  const ceilingFinish = draft.ceiling ?? "gallery";
  const ceilingProfiles = {
    gallery: {
      surface: "chalk" as const,
      color: "#ece9e1",
      roughness: 0.82,
      bump: 0.005,
      emissive: "#fffdf8",
      glow: 0.16,
    },
    warm: {
      surface: "warm" as const,
      color: "#c7b292",
      roughness: 0.78,
      bump: 0.01,
      emissive: "#e3c79e",
      glow: 0.13,
    },
    dark: {
      surface: "charcoal" as const,
      color: "#20231f",
      roughness: 0.7,
      bump: 0.007,
      emissive: "#363a34",
      glow: 0.09,
    },
    skylight: {
      surface: "chalk" as const,
      color: "#e7ecea",
      roughness: 0.76,
      bump: 0.004,
      emissive: "#dceeff",
      glow: 0.18,
    },
    vaulted: {
      surface: "limestone" as const,
      color: "#ded3c1",
      roughness: 0.83,
      bump: 0.018,
      emissive: "#ede6d9",
      glow: 0.04,
    },
  }[ceilingFinish];
  const wallTexture = createSurfaceTexture(
    draft.wall,
    wallColors[draft.wall],
    premiumQuality.surfaceAnisotropy,
  );
  const floorTexture = createSurfaceTexture(
    draft.floor,
    floorColors[draft.floor],
    premiumQuality.surfaceAnisotropy,
  );
  const ceilingTexture = createSurfaceTexture(
    ceilingProfiles.surface,
    ceilingProfiles.color,
    premiumQuality.surfaceAnisotropy,
  );
  const roomTextureScale = Math.max(1, Math.max(w, d) / 18);
  floorTexture.repeat.multiplyScalar(roomTextureScale);
  wallTexture.repeat.multiplyScalar(Math.max(1, w / 25));
  ceilingTexture.repeat.multiplyScalar(Math.max(1, Math.max(w, d) / 24));
  const wallDetails = createSurfaceDetailMaps(draft.wall);
  const floorDetails = createSurfaceDetailMaps(draft.floor);
  const ceilingDetailsMaps = createSurfaceDetailMaps(ceilingProfiles.surface);
  [wallDetails.bumpMap, wallDetails.roughnessMap].forEach((texture) =>
    texture.repeat.copy(wallTexture.repeat),
  );
  [floorDetails.bumpMap, floorDetails.roughnessMap].forEach((texture) =>
    texture.repeat.copy(floorTexture.repeat),
  );
  [ceilingDetailsMaps.bumpMap, ceilingDetailsMaps.roughnessMap].forEach((texture) =>
    texture.repeat.copy(ceilingTexture.repeat),
  );
  const wallProfile = {
    chalk: { color: "#ffffff", bump: 0.009, roughness: 0.82, clearcoat: 0.025 },
    warm: { color: "#ffffff", bump: 0.015, roughness: 0.86, clearcoat: 0.015 },
    travertine: { color: "#ffffff", bump: 0.02, roughness: 0.7, clearcoat: 0.035 },
    linen: { color: "#ddd6ca", bump: 0.024, roughness: 0.92, clearcoat: 0 },
    charcoal: { color: "#ffffff", bump: 0.008, roughness: 0.72, clearcoat: 0.05 },
    microcement: { color: "#ffffff", bump: 0.012, roughness: 0.76, clearcoat: 0.018 },
    limestone: { color: "#ffffff", bump: 0.022, roughness: 0.81, clearcoat: 0.008 },
    "oak-slats": { color: "#ffffff", bump: 0.016, roughness: 0.68, clearcoat: 0.055 },
    "light-concrete": { color: "#ffffff", bump: 0.01, roughness: 0.8, clearcoat: 0.018 },
    "black-slats": { color: "#ffffff", bump: 0.016, roughness: 0.7, clearcoat: 0.04 },
    "marble-wall": { color: "#ffffff", bump: 0.006, roughness: 0.34, clearcoat: 0.26 },
    "dark-stone": { color: "#ffffff", bump: 0.02, roughness: 0.73, clearcoat: 0.025 },
  }[draft.wall];
  const wall = new THREE.MeshPhysicalMaterial({
    color: wallProfile.color,
    map: wallTexture,
    bumpMap: wallDetails.bumpMap,
    bumpScale: wallProfile.bump,
    roughnessMap: wallDetails.roughnessMap,
    roughness: wallProfile.roughness,
    clearcoat: wallProfile.clearcoat,
    clearcoatRoughness: 0.76,
    envMapIntensity: 0.2,
  });
  wall.userData.surfaceRole = "wall";
  const ceiling = new THREE.MeshPhysicalMaterial({
    color: ceilingProfiles.color,
    map: ceilingTexture,
    bumpMap: ceilingDetailsMaps.bumpMap,
    bumpScale: ceilingProfiles.bump,
    roughnessMap: ceilingDetailsMaps.roughnessMap,
    roughness: ceilingProfiles.roughness,
    envMapIntensity: 0.18,
    emissive: ceilingProfiles.emissive,
    emissiveIntensity: ceilingProfiles.glow * 0.3,
    side: THREE.FrontSide,
  });
  ceiling.userData.surfaceRole = "ceiling";
  const isMarble = draft.floor === "marble" || draft.floor === "black-marble";
  const isWood =
    draft.floor === "oak" ||
    draft.floor === "walnut" ||
    draft.floor === "dark-oak";
  const isSlate = draft.floor === "slate";
  const isPolishedConcrete = draft.floor === "dark-concrete";
  const floor = new THREE.MeshPhysicalMaterial({
    color: draft.templateId === "pavilion" ? "#d0cbc1" : "#f2efe7",
    map: floorTexture,
    bumpMap: floorDetails.bumpMap,
    bumpScale: isMarble ? .008 : isWood ? .022 : isSlate ? .035 : .018,
    roughnessMap: floorDetails.roughnessMap,
    roughness: isMarble
      ? draft.templateId === "pavilion"
        ? 0.42
        : 0.22
      : isWood
        ? 0.48
        : isSlate
          ? 0.7
          : isPolishedConcrete
            ? 0.52
            : 0.78,
    metalness: isMarble ? 0.035 : 0.008,
    clearcoat: isMarble
      ? draft.templateId === "pavilion"
        ? 0.24
        : 0.48
      : isWood
        ? 0.16
      : isSlate
        ? 0.045
        : isPolishedConcrete
          ? 0.1
          : 0.025,
    clearcoatRoughness: isMarble
      ? draft.templateId === "pavilion"
        ? 0.42
        : 0.2
      : isWood
        ? 0.52
        : 0.82,
    envMapIntensity: isMarble
      ? draft.templateId === "pavilion"
        ? 0.48
        : 0.9
      : isWood
        ? 0.46
        : 0.25,
  });
  floor.userData.surfaceRole = "floor";
  const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floor);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.receiveShadow = true;
  floorMesh.userData.surface = "floor";
  scene.add(floorMesh);
  const wallSurfaces: THREE.Mesh[] = [];
  const exteriorWalls: THREE.Mesh[] = [];
  const addWall = (
    wallId: WallId,
    geometry: THREE.BufferGeometry,
    position: [number, number, number],
    rotation: [number, number, number] = [0, 0, 0],
  ) => {
    const material = wall.clone();
    material.transparent = cutaway;
    material.opacity = 1;
    if (cutaway) {
      material.depthWrite = false;
      material.side = THREE.DoubleSide;
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.receiveShadow = true;
    mesh.userData.wallId = wallId;
    scene.add(mesh);
    wallSurfaces.push(mesh);
    exteriorWalls.push(mesh);
    return mesh;
  };
  addWall("north", new THREE.PlaneGeometry(w, h), [0, h / 2, -d / 2]);
  addWall(
    "west",
    new THREE.PlaneGeometry(d, h),
    [-w / 2, h / 2, 0],
    [0, Math.PI / 2, 0],
  );
  addWall(
    "east",
    new THREE.PlaneGeometry(d, h),
    [w / 2, h / 2, 0],
    [0, -Math.PI / 2, 0],
  );
  addWall(
    "south",
    new THREE.PlaneGeometry(w, h),
    [0, h / 2, d / 2],
    [0, Math.PI, 0],
  );
  // The exterior roof is part of the architecture and always follows the walls.
  const roofMaterial = wall.clone();
  roofMaterial.transparent = cutaway;
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.12, 0.16, d + 0.12),
    roofMaterial,
  );
  roof.position.set(0, h + 0.08, 0);
  roof.receiveShadow = true;
  roof.name = "room-roof-wall-finish";
  roof.visible = !cutaway;
  scene.add(roof);
  const ceilingPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(w - 0.08, d - 0.08),
    ceiling,
  );
  ceilingPlane.rotation.x = Math.PI / 2;
  ceilingPlane.position.y = h - 0.015;
  ceilingPlane.receiveShadow = true;
  ceilingPlane.name = `ceiling-design-${ceilingFinish}`;
  ceilingPlane.visible = !cutaway;
  scene.add(ceilingPlane);
  const ceilingDetails = new THREE.Group();
  rebuildCeilingDetails(
    ceilingDetails,
    ceilingFinish,
    draft.templateId,
    w,
    d,
    h,
  );
  ceilingDetails.visible = !cutaway;
  scene.add(ceilingDetails);
  const architecture = new THREE.Group();
  architecture.name = `architecture-${draft.templateId}`;
  scene.add(architecture);
  const portalMaterial = new THREE.MeshPhysicalMaterial({
    color: template.materialIdentity.accentColor,
    roughness: draft.templateId === "nocturne" ? 0.42 : 0.72,
    metalness: draft.templateId === "nocturne" ? 0.06 : 0.01,
    clearcoat: draft.templateId === "nocturne" ? 0.12 : 0.025,
    envMapIntensity: 0.34,
  });
  const portalDepth = template.architecture.portalDepth;
  const portalWidth = template.architecture.entranceWidth;
  const portalHeight = Math.min(h - 0.55, draft.templateId === "pavilion" ? 4.35 : 3.72);
  // Seat the trim into the south wall instead of floating in front of it.
  const portalZ = d / 2 - portalDepth / 2 - 0.018;
  [-1, 1].forEach((side) => {
    const jamb = new THREE.Mesh(
      new RoundedBoxGeometry(
        template.architecture.trimScale,
        portalHeight,
        portalDepth,
        4,
        0.018,
      ),
      portalMaterial,
    );
    jamb.position.set(side * portalWidth / 2, portalHeight / 2, portalZ);
    jamb.name = `${draft.templateId}-entrance-jamb-${side < 0 ? "left" : "right"}`;
    jamb.castShadow = true;
    jamb.receiveShadow = true;
    architecture.add(jamb);
  });
  const portalHeader = new THREE.Mesh(
    new RoundedBoxGeometry(
      portalWidth + template.architecture.trimScale,
      template.architecture.trimScale,
      portalDepth,
      4,
      0.018,
    ),
    portalMaterial,
  );
  portalHeader.position.set(0, portalHeight, portalZ);
  portalHeader.name = `${draft.templateId}-entrance-header`;
  portalHeader.castShadow = true;
  portalHeader.receiveShadow = true;
  architecture.add(portalHeader);
  const thresholdMaterial = new THREE.MeshPhysicalMaterial({
    color: template.materialIdentity.floorColor,
    roughness: draft.templateId === "nocturne" ? 0.48 : 0.64,
    clearcoat: 0.08,
    envMapIntensity: 0.32,
  });
  const threshold = new THREE.Mesh(
    new RoundedBoxGeometry(portalWidth + 0.7, 0.035, portalDepth + 0.72, 3, 0.012),
    thresholdMaterial,
  );
  threshold.position.set(0, 0.0175, portalZ);
  threshold.name = `${draft.templateId}-entrance-threshold`;
  threshold.receiveShadow = true;
  threshold.userData.noWalkCollision = true;
  architecture.add(threshold);
  const exitPortal = new THREE.Mesh(
    new THREE.PlaneGeometry(
      Math.max(1, portalWidth - template.architecture.trimScale * 1.3),
      Math.max(1, portalHeight - template.architecture.trimScale * 0.75),
    ),
    new THREE.MeshStandardMaterial({
      color: "#10110f",
      roughness: 0.88,
      emissive: "#11130f",
      emissiveIntensity: 0.12,
      side: THREE.DoubleSide,
    }),
  );
  exitPortal.position.set(0, portalHeight / 2, d / 2 - 0.028);
  exitPortal.rotation.y = Math.PI;
  exitPortal.name = "lieuva-exit-portal";
  exitPortal.userData.exitPortal = true;
  architecture.add(exitPortal);
  if (draft.templateId === "white-cube") {
    const revealMaterial = wall.clone();
    const glowMaterial = new THREE.MeshStandardMaterial({
      color: "#f4f2e9",
      emissive: "#fff9df",
      emissiveIntensity: 1.8,
      roughness: 0.55,
    });
    [-1, 1].forEach((side) => {
      const wingDepth = d * 0.2;
      const wing = new THREE.Mesh(
        new RoundedBoxGeometry(0.16, h * 0.72, wingDepth, 3, 0.02),
        revealMaterial,
      );
      wing.position.set(
        side * w * 0.31,
        h * 0.36,
        -d / 2 + wingDepth / 2 + 0.18,
      );
      architecture.add(wing);
      const reveal = new THREE.Mesh(
        new RoundedBoxGeometry(0.035, h * 0.54, 0.05, 3, 0.012),
        glowMaterial,
      );
      reveal.position.set(
        side * (w * 0.31 - 0.1),
        h * 0.39,
        -d / 2 + wingDepth + 0.17,
      );
      architecture.add(reveal);
    });
    // A restrained shadow-gap and skirting profile gives the procedural room
    // the readable wall thickness and floor contact of an authored interior.
    const skirtingMaterial = new THREE.MeshPhysicalMaterial({
      color: "#e8e5dc",
      roughness: 0.58,
      clearcoat: 0.09,
      clearcoatRoughness: 0.62,
      envMapIntensity: 0.34,
    });
    const shadowGapMaterial = new THREE.MeshPhysicalMaterial({
      color: "#5a5c56",
      roughness: 0.78,
      envMapIntensity: 0.12,
    });
    const addTrim = (
      width: number,
      height: number,
      depth: number,
      x: number,
      y: number,
      z: number,
      material: THREE.Material,
      name: string,
    ) => {
      const trim = new THREE.Mesh(
        new RoundedBoxGeometry(width, height, depth, 3, 0.012),
        material,
      );
      trim.position.set(x, y, z);
      trim.name = name;
      trim.castShadow = true;
      trim.receiveShadow = true;
      architecture.add(trim);
    };
    addTrim(w - 0.12, 0.13, 0.055, 0, 0.065, -d / 2 + 0.028, skirtingMaterial, "white-cube-skirting-north");
    addTrim(w - 0.12, 0.13, 0.055, 0, 0.065, d / 2 - 0.028, skirtingMaterial, "white-cube-skirting-south");
    addTrim(0.055, 0.13, d - 0.12, -w / 2 + 0.028, 0.065, 0, skirtingMaterial, "white-cube-skirting-west");
    addTrim(0.055, 0.13, d - 0.12, w / 2 - 0.028, 0.065, 0, skirtingMaterial, "white-cube-skirting-east");
    addTrim(w - 0.18, 0.035, 0.045, 0, h - 0.085, -d / 2 + 0.024, shadowGapMaterial, "white-cube-shadow-gap-north");
    addTrim(w - 0.18, 0.035, 0.045, 0, h - 0.085, d / 2 - 0.024, shadowGapMaterial, "white-cube-shadow-gap-south");
    addTrim(0.045, 0.035, d - 0.18, -w / 2 + 0.024, h - 0.085, 0, shadowGapMaterial, "white-cube-shadow-gap-west");
    addTrim(0.045, 0.035, d - 0.18, w / 2 - 0.024, h - 0.085, 0, shadowGapMaterial, "white-cube-shadow-gap-east");
    architecture.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
  }
  if (draft.templateId === "nocturne") {
    const mineral = new THREE.MeshPhysicalMaterial({
      color: "#1a1b19",
      roughness: 0.64,
      metalness: 0.08,
      clearcoat: 0.12,
      envMapIntensity: 0.62,
    });
    const bronze = new THREE.MeshPhysicalMaterial({
      color: "#8a6940",
      roughness: 0.3,
      metalness: 0.72,
      clearcoat: 0.25,
    });
    [-1, 1].forEach((side) => {
      const wing = new THREE.Mesh(
        new RoundedBoxGeometry(0.18, h * 0.7, d * 0.31, 4, 0.035),
        mineral,
      );
      wing.position.set(side * w * 0.34, h * 0.35, -d * 0.17);
      wing.rotation.y = side * -0.34;
      architecture.add(wing);
    });
    const architecturalSegments = qualityTier === "low" ? 28 : qualityTier === "balanced" ? 44 : 64;
    const stage = new THREE.Mesh(
      new THREE.CylinderGeometry(1.55, 1.65, 0.18, architecturalSegments),
      mineral,
    );
    stage.position.set(0, 0.09, 0.65);
    architecture.add(stage);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.85, 0.035, qualityTier === "low" ? 6 : 10, architecturalSegments),
      bronze,
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, h - 0.32, 0.35);
    architecture.add(ring);
    const cove = new THREE.MeshStandardMaterial({
      color: "#4b3827",
      emissive: "#c78d52",
      emissiveIntensity: ceilingFinish === "dark" ? 2.2 : 0.72,
      roughness: 0.48,
    });
    [-1, 1].forEach((side) => {
      const ceilingLine = new THREE.Mesh(
        new RoundedBoxGeometry(w * 0.62, 0.04, 0.05, 3, 0.01),
        cove,
      );
      ceilingLine.position.set(0, h - 0.12, side * d * 0.31);
      ceilingLine.visible = !cutaway;
      ceilingLine.userData.hideInCutaway = true;
      architecture.add(ceilingLine);
      const innerPortal = new THREE.Mesh(
        new RoundedBoxGeometry(w * 0.54, 0.12, portalDepth, 4, 0.025),
        bronze,
      );
      innerPortal.position.set(0, h * 0.73, side * d * 0.24);
      innerPortal.castShadow = true;
      architecture.add(innerPortal);
    });
  }
  if (draft.templateId === "pavilion") {
    // A rational museum plan inspired by the supplied reference: a long central
    // gallery, four enclosed corner rooms, a broad cross-gallery, and one clean
    // freestanding exhibition wall. Every opening is centered and structural
    // elements terminate at wall junctions rather than crossing circulation.
    const partitionMaterial = wall.clone();
    partitionMaterial.side = THREE.DoubleSide;
    partitionMaterial.emissiveIntensity = 0.08;
    if (dollhouse) {
      partitionMaterial.transparent = true;
      partitionMaterial.opacity = 0.34;
      partitionMaterial.depthWrite = false;
    }
    const partitionHeight = h - 0.08;
    const partitionThickness = 0.34;
    const sideBoundaryX = w * 0.25;
    const crossGalleryZ = d * 0.2;
    const sideRoomDepth = d / 2 - crossGalleryZ;
    const sideRoomCenterZ = crossGalleryZ + sideRoomDepth / 2;
    const doorwayWidth = 5.6;
    const doorwayHeight = 3.55;
    const doorwaySideLength = (sideRoomDepth - doorwayWidth) / 2;
    const addPartition = (
      width: number,
      depth: number,
      x: number,
      z: number,
      y = partitionHeight / 2,
      height = partitionHeight,
    ) => {
      const partition = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        partitionMaterial,
      );
      partition.position.set(x, y, z);
      partition.castShadow = true;
      partition.receiveShadow = true;
      partition.userData.roomPartition = true;
      architecture.add(partition);
      return partition;
    };
    [-1, 1].forEach((xSide) =>
      [-1, 1].forEach((zSide) => {
        const roomCenterZ = zSide * sideRoomCenterZ;
        [-1, 1].forEach((doorSide) => {
          const segmentZ =
            roomCenterZ + doorSide * (doorwayWidth / 2 + doorwaySideLength / 2);
          addPartition(
            partitionThickness,
            doorwaySideLength,
            xSide * sideBoundaryX,
            segmentZ,
          );
        });
        const headerHeight = partitionHeight - doorwayHeight;
        addPartition(
          partitionThickness,
          doorwayWidth,
          xSide * sideBoundaryX,
          roomCenterZ,
          doorwayHeight + headerHeight / 2,
          headerHeight,
        );
        const roomWidth = w / 2 - sideBoundaryX;
        addPartition(
          roomWidth,
          partitionThickness,
          xSide * (sideBoundaryX + roomWidth / 2),
          zSide * crossGalleryZ,
        );
      }),
    );
    // Square plaster piers reinforce the four wall junctions and stay fully out
    // of the centered 5.6 m door openings.
    [-1, 1].forEach((xSide) =>
      [-1, 1].forEach((zSide) => {
        const pier = new THREE.Mesh(
          new RoundedBoxGeometry(0.72, partitionHeight, 0.72, 4, 0.035),
          partitionMaterial,
        );
        pier.position.set(
          xSide * sideBoundaryX,
          partitionHeight / 2,
          zSide * crossGalleryZ,
        );
        pier.castShadow = true;
        pier.receiveShadow = true;
        architecture.add(pier);
      }),
    );
    const dividerHeight = Math.min(4.55, h - 0.75);
    const dividerMaterial = partitionMaterial.clone();
    const divider = new THREE.Mesh(
      new RoundedBoxGeometry(dividerWidth, dividerHeight, 0.34, 6, 0.045),
      dividerMaterial,
    );
    divider.position.set(0, dividerHeight / 2, PAVILION_DIVIDER_Z);
    divider.castShadow = true;
    divider.receiveShadow = true;
    divider.userData.roomPartition = true;
    architecture.add(divider);
    const raycastMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      colorWrite: false,
    });
    const addDividerSurface = (
      wallId: WallId,
      z: number,
      rotationY: number,
    ) => {
      const surface = new THREE.Mesh(
        new THREE.PlaneGeometry(dividerWidth, dividerHeight),
        raycastMaterial,
      );
      surface.position.set(0, dividerHeight / 2, z);
      surface.rotation.y = rotationY;
      surface.userData.wallId = wallId;
      scene.add(surface);
      wallSurfaces.push(surface);
    };
    addDividerSurface("divider-front", PAVILION_DIVIDER_Z + 0.175, 0);
    addDividerSurface("divider-back", PAVILION_DIVIDER_Z - 0.175, Math.PI);
    const addCrossSurface = (wallId: WallId, x: number, z: number, rotationY: number) => {
      const surface = new THREE.Mesh(
        new THREE.PlaneGeometry(w / 4, partitionHeight),
        raycastMaterial,
      );
      surface.position.set(x, partitionHeight / 2, z);
      surface.rotation.y = rotationY;
      surface.userData.wallId = wallId;
      scene.add(surface);
      wallSurfaces.push(surface);
    };
    [-1, 1].forEach((xSide) => {
      const x = xSide * w * .375;
      addCrossSurface(xSide < 0 ? "north-cross-west" : "north-cross-east", x, -crossGalleryZ + .175, 0);
      addCrossSurface(xSide < 0 ? "north-room-west" : "north-room-east", x, -crossGalleryZ - .175, Math.PI);
      addCrossSurface(xSide < 0 ? "south-cross-west" : "south-cross-east", x, crossGalleryZ - .175, Math.PI);
      addCrossSurface(xSide < 0 ? "south-room-west" : "south-room-east", x, crossGalleryZ + .175, 0);
    });
    const skylightWidth = 10.5;
    const skylightDepth = 6.5;
    const skyGlass = new THREE.MeshPhysicalMaterial({
      color: "#e9f3f6",
      emissive: "#d8edff",
      emissiveIntensity: 1.65,
      roughness: 0.14,
      transmission: 0.28,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    });
    [-1, 1].forEach((zone) => {
      const zoneZ = zone * d * 0.255;
      const panel = new THREE.Mesh(
        new RoundedBoxGeometry(skylightWidth, 0.055, skylightDepth, 5, 0.025),
        skyGlass,
      );
      panel.position.set(0, h - 0.12, zoneZ);
      panel.visible = !cutaway;
      panel.userData.hideInCutaway = true;
      architecture.add(panel);
      const revealHeight = 0.48;
      const revealY = h - revealHeight / 2 - 0.14;
      [-1, 1].forEach((side) => {
        const longReveal = addPartition(
          skylightWidth + 0.7,
          0.28,
          0,
          zoneZ + side * (skylightDepth / 2 + 0.14),
          revealY,
          revealHeight,
        );
        longReveal.visible = !cutaway;
        longReveal.userData.hideInCutaway = true;
        const shortReveal = addPartition(
          0.28,
          skylightDepth,
          side * (skylightWidth / 2 + 0.14),
          zoneZ,
          revealY,
          revealHeight,
        );
        shortReveal.visible = !cutaway;
        shortReveal.userData.hideInCutaway = true;
      });
      const daylight = new THREE.RectAreaLight(
        zone > 0 ? "#fff3da" : "#e4efff",
        1.75,
        skylightWidth * 0.8,
        skylightDepth * 0.8,
      );
      daylight.position.set(0, h - 0.42, zoneZ);
      daylight.rotation.x = -Math.PI / 2;
      daylight.visible = !cutaway;
      daylight.userData.hideInCutaway = true;
      architecture.add(daylight);
    });
    // A restrained central lighting spine follows the circulation axis without
    // crossing doors or pretending to be structural beams.
    const spineMaterial = new THREE.MeshStandardMaterial({
      color: "#eee9dc",
      emissive: ceilingFinish === "dark" ? "#ffd59b" : "#fff4dc",
      emissiveIntensity: ceilingFinish === "dark" ? 3.6 : 1.25,
      roughness: 0.34,
    });
    [-1, 1].forEach((side) => {
      const spine = new THREE.Mesh(
        new RoundedBoxGeometry(0.045, 0.035, d * 0.78, 3, 0.01),
        spineMaterial,
      );
      spine.position.set(side * 7.2, h - 0.1, 0);
      spine.visible = !cutaway;
      spine.userData.hideInCutaway = true;
      architecture.add(spine);
    });
    const datumMaterial = new THREE.MeshPhysicalMaterial({
      color: "#b8aa93",
      roughness: 0.66,
      clearcoat: 0.035,
      envMapIntensity: 0.28,
    });
    [-1, 1].forEach((xSide) => {
      const datum = new THREE.Mesh(
        new RoundedBoxGeometry(0.1, 0.16, d * 0.88, 3, 0.014),
        datumMaterial,
      );
      datum.position.set(xSide * sideBoundaryX, 0.08, 0);
      datum.receiveShadow = true;
      datum.userData.noWalkCollision = true;
      architecture.add(datum);
    });
  }
  if (draft.templateId === "nocturne") {
    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(0.82, 0.82, 0.82, 48),
      new THREE.MeshStandardMaterial({ color: "#111210", roughness: 0.62 }),
    );
    plinth.position.set(0, 0.5, 0.65);
    architecture.add(plinth);
  }
  architecture.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
  const decorObjects = draft.decor.map((item) =>
    createDecor(item, selectedDecorId === item.id),
  );
  decorObjects.forEach((item) => {
    item.position.x = THREE.MathUtils.clamp(
      item.position.x,
      -w / 2 + 0.45,
      w / 2 - 0.45,
    );
    item.position.z = THREE.MathUtils.clamp(
      item.position.z,
      -d / 2 + 0.45,
      d / 2 - 0.45,
    );
    scene.add(item);
  });
  return {
    w,
    d,
    h,
    decorObjects,
    floorMesh,
    wallSurfaces,
    exteriorWalls,
    architecture,
    roof,
    ceilingPlane,
    ceilingDetails,
  };
}

type RoomSurfaceRole = "wall" | "floor" | "ceiling";

function roomSurfaceMaterials(scene: THREE.Scene, role: RoomSurfaceRole) {
  const materials = new Set<THREE.MeshPhysicalMaterial>();
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const candidates = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    candidates.forEach((material) => {
      if (material.userData.surfaceRole === role)
        materials.add(material as THREE.MeshPhysicalMaterial);
    });
  });
  return materials;
}

function replaceRoomSurfaceTexture(
  materials: Set<THREE.MeshPhysicalMaterial>,
  texture: THREE.Texture,
  details: { bumpMap: THREE.Texture; roughnessMap: THREE.Texture },
) {
  const previous = new Set<THREE.Texture>();
  materials.forEach((material) => {
    if (material.map && material.map !== texture) previous.add(material.map);
    if (material.bumpMap && material.bumpMap !== details.bumpMap) previous.add(material.bumpMap);
    if (material.roughnessMap && material.roughnessMap !== details.roughnessMap) previous.add(material.roughnessMap);
    material.map = texture;
    material.bumpMap = details.bumpMap;
    material.normalMap = null;
    material.roughnessMap = details.roughnessMap;
    material.needsUpdate = true;
  });
  previous.forEach((item) => item.dispose());
}

function updateRoomSurface(
  scene: THREE.Scene,
  draft: GalleryDraft,
  w: number,
  d: number,
  role: RoomSurfaceRole,
) {
  const materials = roomSurfaceMaterials(scene, role);
  if (!materials.size) return;
  if (role === "wall") {
    const texture = createSurfaceTexture(draft.wall, wallColors[draft.wall]);
    texture.repeat.multiplyScalar(Math.max(1, w / 25));
    const details = createSurfaceDetailMaps(draft.wall);
    [details.bumpMap, details.roughnessMap].forEach((item) => item.repeat.copy(texture.repeat));
    replaceRoomSurfaceTexture(materials, texture, details);
    const profile = {
      chalk: { color: "#ffffff", roughness: 0.84, clearcoat: 0.015 },
      warm: { color: "#ffffff", roughness: 0.88, clearcoat: 0.01 },
      travertine: { color: "#ffffff", roughness: 0.72, clearcoat: 0.025 },
      linen: { color: "#ddd6ca", roughness: 0.93, clearcoat: 0 },
      charcoal: { color: "#ffffff", roughness: 0.76, clearcoat: 0.025 },
      microcement: { color: "#ffffff", roughness: 0.78, clearcoat: 0.012 },
      limestone: { color: "#ffffff", roughness: 0.82, clearcoat: 0.006 },
      "oak-slats": { color: "#ffffff", roughness: 0.7, clearcoat: 0.045 },
      "light-concrete": { color: "#ffffff", roughness: 0.81, clearcoat: 0.012 },
      "black-slats": { color: "#ffffff", roughness: 0.72, clearcoat: 0.035 },
      "marble-wall": { color: "#ffffff", roughness: 0.36, clearcoat: 0.24 },
      "dark-stone": { color: "#ffffff", roughness: 0.75, clearcoat: 0.02 },
    }[draft.wall];
    materials.forEach((material) => {
      material.color.set(profile.color);
      material.roughness = profile.roughness;
      material.bumpScale = {
        chalk: .009, warm: .015, travertine: .02, linen: .024,
        charcoal: .008, microcement: .012, limestone: .022,
        "oak-slats": .016, "light-concrete": .01, "black-slats": .016,
        "marble-wall": .006, "dark-stone": .02,
      }[draft.wall];
      material.clearcoat = profile.clearcoat;
      material.envMapIntensity = 0.2;
      material.emissive.set("#000000");
      material.emissiveIntensity = 0;
    });
    return;
  }
  if (role === "floor") {
    const texture = createSurfaceTexture(draft.floor, floorColors[draft.floor]);
    texture.repeat.multiplyScalar(Math.max(1, Math.max(w, d) / 18));
    const details = createSurfaceDetailMaps(draft.floor);
    [details.bumpMap, details.roughnessMap].forEach((item) => item.repeat.copy(texture.repeat));
    replaceRoomSurfaceTexture(materials, texture, details);
    const marble = draft.floor === "marble" || draft.floor === "black-marble";
    const wood =
      draft.floor === "oak" ||
      draft.floor === "walnut" ||
      draft.floor === "dark-oak";
    const slate = draft.floor === "slate";
    const polishedConcrete = draft.floor === "dark-concrete";
    materials.forEach((material) => {
      material.color.set("#eeeae1");
      material.roughness = marble
        ? 0.24
        : wood
          ? 0.54
          : slate
            ? 0.7
            : polishedConcrete
              ? 0.52
              : 0.82;
      material.bumpScale = marble ? .008 : wood ? .022 : slate ? .035 : .018;
      material.metalness = marble ? 0.02 : 0.005;
      material.clearcoat = marble
        ? 0.44
        : wood
          ? 0.1
          : slate
            ? 0.035
            : polishedConcrete
              ? 0.1
              : 0.01;
      material.clearcoatRoughness = marble ? 0.22 : 0.72;
      material.envMapIntensity = marble ? 0.88 : wood ? 0.46 : 0.24;
    });
    return;
  }
  const finish = draft.ceiling ?? "gallery";
  const profile = {
    gallery: {
      surface: "chalk" as const,
      color: "#e8e5dc",
      roughness: 0.84,
      emissive: "#fffaf0",
      glow: 0.035,
    },
    warm: {
      surface: "warm" as const,
      color: "#c6b498",
      roughness: 0.8,
      emissive: "#e3c79e",
      glow: 0.04,
    },
    dark: {
      surface: "charcoal" as const,
      color: "#272a27",
      roughness: 0.74,
      emissive: "#363a34",
      glow: 0.025,
    },
    skylight: {
      surface: "chalk" as const,
      color: "#e7ecea",
      roughness: 0.76,
      emissive: "#dceeff",
      glow: 0.055,
    },
    vaulted: {
      surface: "limestone" as const,
      color: "#ded3c1",
      roughness: 0.83,
      emissive: "#ede6d9",
      glow: 0.018,
    },
  }[finish];
  const texture = createSurfaceTexture(profile.surface, profile.color);
  texture.repeat.multiplyScalar(Math.max(1, Math.max(w, d) / 24));
  const details = createSurfaceDetailMaps(profile.surface);
  [details.bumpMap, details.roughnessMap].forEach((item) => item.repeat.copy(texture.repeat));
  replaceRoomSurfaceTexture(materials, texture, details);
  materials.forEach((material) => {
    material.color.set(profile.color);
    material.roughness = profile.roughness;
    material.bumpScale = finish === "vaulted" ? .018 : finish === "warm" ? .01 : .006;
    material.envMapIntensity = 0.16;
    material.emissive.set(profile.emissive);
    material.emissiveIntensity = profile.glow;
  });
  const ceilingPlane = scene.children.find((object) =>
    object.name.startsWith("ceiling-design-"),
  );
  if (ceilingPlane) ceilingPlane.name = `ceiling-design-${finish}`;
  const ceilingGroup = scene.children.find((object) =>
    object.name.startsWith("room-ceiling-"),
  );
  if (ceilingGroup instanceof THREE.Group) {
    const visible = ceilingGroup.visible;
    rebuildCeilingDetails(
      ceilingGroup,
      finish,
      draft.templateId,
      w,
      d,
      getTemplate(draft.templateId).height,
    );
    ceilingGroup.visible = visible;
  }
}

type EnvironmentCard = {
  position: [number, number, number];
  scale: [number, number];
  rotation: [number, number, number];
  color: [number, number, number];
};

function createGalleryEnvironment(
  renderer: THREE.WebGLRenderer,
  templateId: GalleryDraft["templateId"],
) {
  const environmentScene = new THREE.Scene();
  environmentScene.background = new THREE.Color(
    templateId === "nocturne" ? "#050605" : "#161713",
  );
  const geometry = new THREE.PlaneGeometry(1, 1);
  const shared: EnvironmentCard[] = [
    {
      position: [-4.2, 3.5, -0.8],
      scale: [5.2, 2.5],
      rotation: [0, Math.PI / 2, 0],
      color: [5.6, 4.5, 3.2],
    },
    {
      position: [4.1, 2.9, 1.2],
      scale: [4.1, 2.2],
      rotation: [0, -Math.PI / 2, 0],
      color: [2.1, 2.8, 4.2],
    },
    {
      position: [0, 5.2, -2.8],
      scale: [6.4, 2.5],
      rotation: [Math.PI / 2, 0, 0],
      color: [4.8, 4.5, 3.9],
    },
    {
      position: [0, 1.25, 4.6],
      scale: [5.2, 2.2],
      rotation: [-Math.PI / 2, 0, 0],
      color: [0.9, 1, 1.25],
    },
  ];
  const templateAccent: EnvironmentCard =
    templateId === "nocturne"
      ? {
          position: [0.8, 2.4, -4.4],
          scale: [2.6, 1.25],
          rotation: [Math.PI / 2, 0, 0],
          color: [5.8, 2.5, 0.9],
        }
      : templateId === "pavilion"
        ? {
            position: [-1.4, 4.8, 3.2],
            scale: [5.8, 1.8],
            rotation: [-Math.PI / 2, 0, 0],
            color: [3.8, 3.25, 2.4],
          }
        : {
            position: [1.1, 4.6, -3.5],
            scale: [5.6, 1.9],
            rotation: [Math.PI / 2, 0, 0],
            color: [4.2, 5, 5.8],
          };
  [...shared, templateAccent].forEach((cardData) => {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setRGB(...cardData.color),
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const card = new THREE.Mesh(geometry, material);
    card.position.set(...cardData.position);
    card.scale.set(...cardData.scale, 1);
    card.rotation.set(...cardData.rotation);
    environmentScene.add(card);
  });
  const generator = new THREE.PMREMGenerator(renderer);
  generator.compileCubemapShader();
  const target = generator.fromScene(environmentScene, 0.04, 0.1, 60);
  generator.dispose();
  environmentScene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    materials.forEach((material) => material.dispose());
  });
  geometry.dispose();
  return target;
}

function captureRoomEnvironment(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  baseEnvironment: THREE.Texture,
  position: THREE.Vector3,
  far: number,
  probeSize: 64 | 128 | 256 = 128,
) {
  const previousEnvironment = scene.environment;
  const cubeTarget = new THREE.WebGLCubeRenderTarget(probeSize, {
    type: THREE.HalfFloatType,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  const probe = new THREE.CubeCamera(0.2, far, cubeTarget);
  probe.position.copy(position);
  scene.environment = baseEnvironment;
  scene.add(probe);
  try {
    probe.update(renderer, scene);
    const generator = new THREE.PMREMGenerator(renderer);
    const target = generator.fromCubemap(cubeTarget.texture);
    generator.dispose();
    return target;
  } finally {
    scene.remove(probe);
    scene.environment = previousEnvironment;
    cubeTarget.dispose();
  }
}

function roomReflectionSignature(draft: GalleryDraft) {
  return [
    draft.wall,
    draft.floor,
    draft.ceiling ?? "gallery",
    draft.lighting,
    // Artwork streaming and transforms do not invalidate the room probe. Their
    // color remains unlit/tone-map neutral, while rebaking per image or slider
    // step caused the largest editor latency spikes.
    ...draft.decor.map((item) =>
      [
        item.id,
        item.type,
        item.x,
        item.z,
        item.rotation,
        item.scale,
        item.potColor ?? "light",
      ].join(":"),
    ),
  ].join("|");
}

function addLighting(
  scene: THREE.Scene,
  draft: GalleryDraft,
  w: number,
  d: number,
  h: number,
  dollhouse = false,
  shadowMapSize = 1024,
  qualityTier: ReturnType<typeof getRenderQuality>["tier"] = "balanced",
) {
  const settings = roomLightingProfile(
    draft.templateId,
    draft.lighting,
    qualityTier,
  );
  // The environment stays neutral; only this room-owned rig changes presets.
  scene.background = new THREE.Color(
    draft.templateId === "nocturne"
      ? "#090a09"
      : draft.templateId === "pavilion"
        ? "#302e2a"
        : "#343732",
  );
  const rig = new THREE.Group();
  rig.name = `room-lighting-${draft.templateId}-${draft.lighting}`;
  scene.add(rig);
  const hemisphereGround =
    draft.templateId === "nocturne"
      ? "#070807"
      : draft.templateId === "pavilion"
        ? "#81796d"
        : "#77746b";
  rig.add(
    new THREE.AmbientLight(
      "#fffdf8",
      settings.ambient,
    ),
    new THREE.HemisphereLight(
      "#f4f2ea",
      hemisphereGround,
      settings.hemi,
    ),
  );
  const main = new THREE.DirectionalLight(
    settings.color,
    settings.key,
  );
  // This is an interior rig. Keeping the key above a closed ceiling made the
  // published visitor view shadow the whole room while Arrange's cutaway
  // looked correctly exposed. Place it just below the ceiling so both modes
  // resolve the same authored light without disabling architectural shadows.
  main.position.set(-w * 0.28, Math.max(1.8, h - 0.32), d * 0.22);
  main.target.position.set(w * 0.05, 0.35, -d * 0.08);
  main.castShadow = true;
  main.shadow.mapSize.set(shadowMapSize, shadowMapSize);
  main.shadow.bias = -0.00018;
  main.shadow.normalBias = 0.035;
  main.shadow.radius = shadowMapSize >= 1024 ? 3 : 1.5;
  const shadowExtent = Math.max(w, d) * 0.52;
  main.shadow.camera.left = -shadowExtent;
  main.shadow.camera.right = shadowExtent;
  main.shadow.camera.top = shadowExtent;
  main.shadow.camera.bottom = -shadowExtent;
  main.shadow.camera.near = 0.5;
  main.shadow.camera.far = Math.max(h * 4, 24);
  main.shadow.camera.updateProjectionMatrix();
  rig.add(main, main.target);

  const bounceStrength = settings.bounce;
  const bounceLights = [
    new THREE.RectAreaLight(
      draft.lighting === "evening" ? "#ffd2a4" : "#edf5ff",
      bounceStrength,
      Math.min(7, d * 0.42),
      Math.min(3.4, h * 0.72),
    ),
    new THREE.RectAreaLight(
      draft.lighting === "daylight" ? "#fff2d8" : "#e7ddcf",
      bounceStrength * 0.62,
      Math.min(6, d * 0.34),
      Math.min(3, h * 0.62),
    ),
  ];
  bounceLights[0].position.set(-w * 0.43, h * 0.56, -d * 0.12);
  bounceLights[0].lookAt(0, h * 0.34, 0);
  bounceLights[1].position.set(w * 0.4, h * 0.48, d * 0.17);
  bounceLights[1].lookAt(0, h * 0.3, -d * 0.08);
  rig.add(...bounceLights);

  const artworkTargets = draft.artworks
    .filter((artwork) => !artwork.hidden)
    .slice(0, getTemplate(draft.templateId).maxArtworks)
    .map((artwork) => ({
      artworkId: artwork.id,
      ...artworkLightPose(artwork, w, d, h),
    }));
  const lightTargets = artworkTargets.length
    ? artworkTargets
    : [-0.27, 0, 0.27].map((ratio) => ({
        artworkId: undefined,
        source: new THREE.Vector3(w * ratio, h - 0.35, -d * 0.08),
        target: new THREE.Vector3(w * ratio, 0, -d * 0.08),
      }));
  const fixtureMaterial = new THREE.MeshStandardMaterial({
    color: draft.lighting === "daylight" ? "#deddd8" : "#171816",
    metalness: 0.72,
    roughness: 0.24,
  });
  const bulbMaterial = new THREE.MeshStandardMaterial({
    color: "#fff7df",
    emissive: settings.color,
    emissiveIntensity: 3.2,
    roughness: 0.18,
  });
  const down = new THREE.Vector3(0, -1, 0);
  const installations: Array<{
    artworkId?: string;
    mount: THREE.Mesh;
    stem: THREE.Mesh;
    joint: THREE.Mesh;
    head: THREE.Mesh;
    bulb: THREE.Mesh;
    spot: THREE.SpotLight;
    target: THREE.Object3D;
  }> = [];
  const shadowBudget = shadowMapSize >= 2048 ? 3 : shadowMapSize >= 1024 ? 2 : 1;
  lightTargets.forEach(({ artworkId, source, target }, index) => {
    const direction = target.clone().sub(source).normalize();
    const mount = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.13, 0.07, 24),
      fixtureMaterial,
    );
    mount.position.set(source.x, h - 0.05, source.z);
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.026, 0.026, 0.15, 14),
      fixtureMaterial,
    );
    stem.position.set(source.x, h - 0.16, source.z);
    const joint = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 18, 12),
      fixtureMaterial,
    );
    joint.position.set(source.x, h - 0.24, source.z);
    const head = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.14, 0.3, 24),
      fixtureMaterial,
    );
    head.position.copy(source);
    head.quaternion.setFromUnitVectors(down, direction);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 16, 10),
      bulbMaterial,
    );
    bulb.position.copy(source).addScaledVector(direction, 0.16);
    [mount, stem, joint, head, bulb].forEach((object) => {
      object.userData.hideInCutaway = true;
      object.visible = !dollhouse;
    });
    const spot = new THREE.SpotLight(
      settings.color,
      settings.spot,
      Math.max(12, h * 1.8),
      0.33,
      0.72,
      1.55,
    );
    spot.position.copy(bulb.position);
    spot.target.position.copy(target);
    spot.castShadow = index < shadowBudget;
    if (spot.castShadow) {
      const spotShadowSize = Math.min(1024, shadowMapSize);
      spot.shadow.mapSize.set(spotShadowSize, spotShadowSize);
      spot.shadow.bias = -0.0003;
      spot.shadow.normalBias = 0.025;
      spot.shadow.radius = shadowMapSize >= 1024 ? 3 : 1;
      spot.shadow.camera.near = 0.2;
      spot.shadow.camera.far = Math.max(12, h * 1.8);
    }
    rig.add(mount, stem, joint, head, bulb, spot, spot.target);
    installations.push({
      artworkId,
      mount,
      stem,
      joint,
      head,
      bulb,
      spot,
      target: spot.target,
    });
  });
  return { count: lightTargets.length, rig, installations };
}

function updateLightingLayout(
  lighting: ReturnType<typeof addLighting>,
  draft: GalleryDraft,
  w: number,
  d: number,
  h: number,
) {
  const down = new THREE.Vector3(0, -1, 0);
  lighting.installations.forEach((installation, index) => {
    const artwork = installation.artworkId
      ? draft.artworks.find((item) => item.id === installation.artworkId)
      : undefined;
    const fallbackTarget = new THREE.Vector3(
      w * [-0.27, 0, 0.27][index % 3],
      0,
      -d * 0.08,
    );
    const { source, target } = artwork
      ? artworkLightPose(artwork, w, d, h)
      : {
          source: fallbackTarget.clone().setY(h - 0.35),
          target: fallbackTarget,
        };
    const direction = target.clone().sub(source).normalize();
    installation.mount.position.set(source.x, h - 0.05, source.z);
    installation.stem.position.set(source.x, h - 0.16, source.z);
    installation.joint.position.set(source.x, h - 0.24, source.z);
    installation.head.position.copy(source);
    installation.head.quaternion.setFromUnitVectors(down, direction);
    installation.bulb.position.copy(source).addScaledVector(direction, 0.16);
    installation.spot.position.copy(installation.bulb.position);
    installation.target.position.copy(target);
  });
}

type WalkCollision = (
  next: THREE.Vector3,
  previous: THREE.Vector3,
) => boolean | void;

function createFirstPersonWalk(
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  bounds: () => Bounds,
  collision?: WalkCollision,
  findPath?: (from: THREE.Vector3, to: THREE.Vector3) => THREE.Vector3[] | null,
  onUserIntent?: () => void,
  onEscape?: () => void,
) {
  const keys = new Set<string>();
  let enabled = true;
  let destinations: THREE.Vector3[] = [];
  let blockedFrames = 0;
  const keyDown = (event: KeyboardEvent) => {
    if (event.code === "Escape") {
      event.preventDefault();
      onEscape?.();
      return;
    }
    if (VISITOR_KEYBOARD_CODES.has(event.code)) {
      if (!enabled) {
        onUserIntent?.();
        return;
      }
      destinations = [];
      keys.add(event.code);
      onUserIntent?.();
      event.preventDefault();
    }
  };
  const keyUp = (event: KeyboardEvent) => keys.delete(event.code);
  const blur = () => keys.clear();
  canvas.addEventListener("keydown", keyDown);
  canvas.addEventListener("keyup", keyUp);
  canvas.addEventListener("blur", blur);
  camera.rotation.order = "YXZ";
  let dragging = false;
  let dragged = false;
  let pointerId = -1;
  let lastX = 0;
  let lastY = 0;
  let yaw = camera.rotation.y;
  let pitch = camera.rotation.x;
  let eyeHeight = camera.position.y;
  let targetFov = camera.fov;
  let lastPinchDistance = 0;
  const touches = new Map<number, { x: number; y: number }>();
  const syncRotation = () => {
    const rotation = new THREE.Euler().setFromQuaternion(
      camera.quaternion,
      "YXZ",
    );
    pitch = rotation.x;
    yaw = rotation.y;
    camera.rotation.set(pitch, yaw, 0, "YXZ");
  };
  const lookAt = (target: THREE.Vector3) => {
    eyeHeight = camera.position.y;
    camera.lookAt(target);
    syncRotation();
  };
  const pinchDistance = () => {
    const points = [...touches.values()];
    return points.length < 2
      ? 0
      : Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  };
  const pointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    onUserIntent?.();
    if (!enabled) return;
    canvas.focus({ preventScroll: true });
    if (event.pointerType === "touch") {
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touches.size === 2) {
        dragging = false;
        pointerId = -1;
        dragged = true;
        lastPinchDistance = pinchDistance();
        return;
      }
    }
    dragging = true;
    dragged = false;
    pointerId = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    if (event.isTrusted) canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("is-looking");
  };
  const pointerMove = (event: PointerEvent) => {
    if (event.pointerType === "touch" && touches.has(event.pointerId)) {
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touches.size >= 2) {
        const distance = pinchDistance();
        if (lastPinchDistance)
          targetFov = THREE.MathUtils.clamp(
            targetFov + (lastPinchDistance - distance) * 0.075,
            40,
            72,
          );
        lastPinchDistance = distance;
        dragged = true;
        event.preventDefault();
        return;
      }
    }
    if (!dragging || event.pointerId !== pointerId) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    if (Math.abs(dx) + Math.abs(dy) > 2) dragged = true;
    const lookSensitivity = event.pointerType === "touch" ? 0.00245 : 0.0028;
    yaw -= dx * lookSensitivity;
    pitch -= dy * lookSensitivity;
    pitch = THREE.MathUtils.clamp(pitch, -1.22, 1.22);
    camera.rotation.set(pitch, yaw, 0, "YXZ");
    lastX = event.clientX;
    lastY = event.clientY;
  };
  const pointerUp = (event: PointerEvent) => {
    if (event.pointerType === "touch") {
      touches.delete(event.pointerId);
      lastPinchDistance = touches.size >= 2 ? pinchDistance() : 0;
    }
    if (event.pointerId !== pointerId) return;
    dragging = false;
    pointerId = -1;
    canvas.classList.remove("is-looking");
  };
  const wheel = (event: WheelEvent) => {
    if (!enabled) return;
    onUserIntent?.();
    targetFov = THREE.MathUtils.clamp(targetFov + event.deltaY * 0.012, 40, 72);
    event.preventDefault();
  };
  const contextMenu = (event: Event) => event.preventDefault();
  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerup", pointerUp);
  canvas.addEventListener("pointercancel", pointerUp);
  canvas.addEventListener("wheel", wheel, { passive: false });
  canvas.addEventListener("contextmenu", contextMenu);
  let previousTime = performance.now();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  const previous = new THREE.Vector3();
  const update = () => {
    const now = performance.now();
    const delta = Math.min((now - previousTime) / 1000, 0.05);
    previousTime = now;
    camera.fov = THREE.MathUtils.lerp(
      camera.fov,
      targetFov,
      1 - Math.exp(-11 * delta),
    );
    camera.updateProjectionMatrix();
    if (!enabled) return;
    const turnDirection =
      (keys.has("ArrowLeft") ? 1 : 0) - (keys.has("ArrowRight") ? 1 : 0);
    if (turnDirection) {
      yaw += turnDirection * 1.72 * delta;
      camera.rotation.set(pitch, yaw, 0, "YXZ");
    }
    const lookDirection = visitorLookDirection(keys);
    if (lookDirection) {
      pitch = THREE.MathUtils.clamp(pitch + lookDirection * 1.15 * delta, -1.22, 1.22);
      camera.rotation.set(pitch, yaw, 0, "YXZ");
    }
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
    forward.normalize();
    right.crossVectors(forward, camera.up).normalize();
    desired.set(0, 0, 0);
    if (keys.has("KeyW")) desired.add(forward);
    if (keys.has("KeyS")) desired.sub(forward);
    if (keys.has("KeyD")) desired.add(right);
    if (keys.has("KeyA")) desired.sub(right);
    if (desired.lengthSq()) desired.normalize().multiplyScalar(2.3);
    else if (destinations.length) {
      desired.subVectors(destinations[0], camera.position);
      desired.y = 0;
      const distance = desired.length();
      if (distance < 0.14) {
        destinations.shift();
        desired.set(0, 0, 0);
      } else
        desired
          .normalize()
          .multiplyScalar(Math.min(2.2, Math.max(0.55, distance * 1.35)));
    }
    const response = desired.lengthSq() > velocity.lengthSq() ? 7.4 : 10.8;
    velocity.lerp(desired, 1 - Math.exp(-response * delta));
    previous.copy(camera.position);
    camera.position.addScaledVector(velocity, delta);
    const current = bounds();
    camera.position.x = THREE.MathUtils.clamp(
      camera.position.x,
      current.minX,
      current.maxX,
    );
    camera.position.z = THREE.MathUtils.clamp(
      camera.position.z,
      current.minZ,
      current.maxZ,
    );
    camera.position.y = eyeHeight;
    const moved = collision?.(camera.position, previous);
    if (moved === false && camera.position.distanceToSquared(previous) < 1e-7)
      velocity.multiplyScalar(0.18);
    if (
      destinations.length &&
      moved === false &&
      camera.position.distanceToSquared(previous) < 1e-7
    ) {
      blockedFrames += 1;
      if (blockedFrames > 8) {
        destinations = [];
        velocity.set(0, 0, 0);
      }
    } else blockedFrames = 0;
  };
  const moveTo = (point: THREE.Vector3) => {
    const current = bounds();
    const candidate = point.clone();
    candidate.x = THREE.MathUtils.clamp(
      candidate.x,
      current.minX,
      current.maxX,
    );
    candidate.z = THREE.MathUtils.clamp(
      candidate.z,
      current.minZ,
      current.maxZ,
    );
    candidate.y = eyeHeight;
    const path = findPath ? findPath(camera.position, candidate) : [candidate];
    if (!path?.length) return false;
    destinations = path;
    blockedFrames = 0;
    return true;
  };
  const setEnabled = (value: boolean) => {
    enabled = value;
    keys.clear();
    velocity.set(0, 0, 0);
    if (!value) destinations = [];
  };
  const consumeClick = () => {
    const isClick = !dragged && enabled;
    dragged = false;
    return isClick;
  };
  const syncFromCamera = () => {
    targetFov = camera.fov;
    lookAt(
      camera.position
        .clone()
        .add(new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)),
    );
  };
  return {
    update,
    lookAt,
    moveTo,
    setEnabled,
    syncFromCamera,
    consumeClick,
    hasDestination: () => destinations.length > 0,
    dispose: () => {
      canvas.removeEventListener("keydown", keyDown);
      canvas.removeEventListener("keyup", keyUp);
      canvas.removeEventListener("blur", blur);
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("pointercancel", pointerUp);
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("contextmenu", contextMenu);
    },
  };
}

type WalkController = ReturnType<typeof createFirstPersonWalk>;

type CinematicTour = {
  positions: THREE.Vector3[];
  looks: THREE.Vector3[];
  finalLook: THREE.Vector3;
};

function createCinematicIntro(
  camera: THREE.PerspectiveCamera,
  tour: CinematicTour,
  navigation: WalkController,
  element: HTMLElement,
  onComplete?: () => void,
  labelText = "Private view",
  titleText = "Entering Space",
) {
  const curve = new THREE.CatmullRomCurve3(
    tour.positions,
    false,
    "centripetal",
    0.38,
  );
  const lookCurve = new THREE.CatmullRomCurve3(
    tour.looks,
    false,
    "centripetal",
    0.38,
  );
  const duration = THREE.MathUtils.clamp(
    curve.getLength() * (innerWidth < 620 ? 600 : 560),
    innerWidth < 620 ? 10_500 : 10_000,
    innerWidth < 620 ? 22_000 : 24_000,
  );
  const baseFov = camera.fov;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let complete = false;
  let phaseIndex = -1;
  const position = new THREE.Vector3();
  const cinematicLook = new THREE.Vector3();
  const orientation = new THREE.PerspectiveCamera();
  let playhead = 0;
  let previousUpdateAt = performance.now();
  const phases = [
    "Arrival",
    "The architecture",
    "The collection",
    "Your visit",
  ];
  const overlay = document.createElement("div");
  overlay.className = "cinematic-intro";
  overlay.setAttribute("aria-label", "Cinematic Space introduction");
  const copy = document.createElement("div");
  copy.className = "cinematic-copy";
  const label = document.createElement("span");
  const title = document.createElement("strong");
  const phase = document.createElement("small");
  phase.setAttribute("aria-live", "polite");
  const line = document.createElement("i");
  const skip = document.createElement("button");
  skip.type = "button";
  skip.setAttribute(
    "aria-label",
    "Skip the Space introduction and enter now",
  );
  label.textContent = labelText;
  title.textContent = titleText;
  phase.textContent = phases[0];
  skip.textContent = "Enter now";
  copy.append(label, title, phase, line);
  overlay.append(copy, skip);
  element.appendChild(overlay);
  element.dataset.introDuration = String(Math.round(duration));
  element.dataset.introMotion = "capped-smooth";
  camera.position.copy(tour.positions[0]);
  camera.lookAt(tour.looks[0]);
  navigation.setEnabled(false);
  const finish = () => {
    if (complete) return;
    complete = true;
    camera.fov = baseFov;
    camera.updateProjectionMatrix();
    camera.position.copy(tour.positions[tour.positions.length - 1]);
    navigation.lookAt(tour.finalLook);
    navigation.setEnabled(true);
    overlay.classList.add("is-finished");
    window.setTimeout(() => overlay.remove(), 650);
    onComplete?.();
  };
  const update = () => {
    if (complete) return;
    if (reducedMotion.matches) {
      finish();
      return;
    }
    const now = performance.now();
    const frameDelta = THREE.MathUtils.clamp(now - previousUpdateAt, 0, 34);
    previousUpdateAt = now;
    playhead = Math.min(duration, playhead + frameDelta);
    const raw = playhead / duration;
    const eased = raw * raw * raw * (raw * (raw * 6 - 15) + 10);
    curve.getPointAt(eased, position);
    lookCurve.getPointAt(eased, cinematicLook);
    camera.position.copy(position);
    orientation.position.copy(position);
    orientation.lookAt(cinematicLook);
    camera.quaternion.slerp(
      orientation.quaternion,
      1 - Math.exp((-8 * frameDelta) / 1000),
    );
    camera.fov = baseFov + Math.sin(raw * Math.PI) * 2.2;
    camera.updateProjectionMatrix();
    const nextPhase = Math.min(
      phases.length - 1,
      Math.floor(raw * phases.length),
    );
    if (nextPhase !== phaseIndex) {
      phaseIndex = nextPhase;
      phase.textContent = phases[nextPhase];
    }
    line.style.transform = `scaleX(${raw})`;
    overlay.style.setProperty("--cinematic-progress", String(raw));
    if (raw >= 1) finish();
  };
  skip.addEventListener("click", finish);
  return {
    update,
    skip: finish,
    isComplete: () => complete,
    dispose: () => {
      skip.removeEventListener("click", finish);
      overlay.remove();
    },
  };
}

function galleryIntroTour(
  draft: GalleryDraft,
  w: number,
  d: number,
): CinematicTour {
  const finish = new THREE.Vector3(0, VISITOR_EYE_HEIGHT, d / 2 - 1);
  const finalLook = new THREE.Vector3(0, VISITOR_EYE_HEIGHT, -1);
  const artworkLooks = draft.artworks
    .filter((artwork) => !artwork.hidden)
    .slice(0, 8)
    .map((artwork) => {
      const [x, y, z] = WALLS[artwork.wall].position(
        artwork.x,
        artwork.y,
        w,
        d,
      );
      return new THREE.Vector3(x, y, z);
    });
  const focus = (index: number, fallback: THREE.Vector3) =>
    artworkLooks.length ? artworkLooks[index % artworkLooks.length] : fallback;
  if (draft.templateId === "pavilion") {
    const southRoomZ = d * 0.35;
    const northRoomZ = -southRoomZ;
    const positions = [
      new THREE.Vector3(0, 4.15, d / 2 - 1),
      new THREE.Vector3(0, 3.2, southRoomZ),
      new THREE.Vector3(w * 0.36, 2.75, southRoomZ),
      new THREE.Vector3(0, 3.15, southRoomZ),
      new THREE.Vector3(w * 0.38, 2.8, 0),
      new THREE.Vector3(0, 3.25, northRoomZ),
      new THREE.Vector3(-w * 0.36, 2.7, northRoomZ),
      new THREE.Vector3(0, 3.25, northRoomZ),
      new THREE.Vector3(-w * 0.38, 2.75, 0),
      finish,
    ];
    const looks = [
      new THREE.Vector3(0, 2.25, 0),
      focus(0, new THREE.Vector3(w / 2, 2.4, southRoomZ)),
      focus(1, new THREE.Vector3(w / 2, 2.45, southRoomZ)),
      new THREE.Vector3(0, 2.4, PAVILION_DIVIDER_Z),
      focus(2, new THREE.Vector3(w / 2, 2.4, 0)),
      focus(3, new THREE.Vector3(w / 2, 2.4, northRoomZ)),
      focus(4, new THREE.Vector3(-w / 2, 2.4, northRoomZ)),
      new THREE.Vector3(0, 2.4, PAVILION_DIVIDER_Z),
      focus(5, new THREE.Vector3(-w / 2, 2.4, 0)),
      finalLook,
    ];
    return { positions, looks, finalLook };
  }
  const height = draft.templateId === "nocturne" ? 3.15 : 3.35;
  const positions = [
    new THREE.Vector3(0, height, d / 2 - 0.8),
    new THREE.Vector3(-w * 0.29, 2.55, d * 0.14),
    new THREE.Vector3(-w * 0.27, 2.2, -d * 0.31),
    new THREE.Vector3(0, 2.05, -d * 0.38),
    new THREE.Vector3(w * 0.27, 2.1, -d * 0.29),
    new THREE.Vector3(w * 0.28, 1.9, d * 0.2),
    finish,
  ];
  const looks = [
    new THREE.Vector3(0, 1.8, -d * 0.15),
    focus(0, new THREE.Vector3(-w / 2, 1.8, -d * 0.1)),
    focus(1, new THREE.Vector3(0, 1.9, -d / 2)),
    focus(2, new THREE.Vector3(w * 0.2, 1.9, -d / 2)),
    focus(3, new THREE.Vector3(w / 2, 1.8, 0)),
    focus(4, new THREE.Vector3(0, 1.75, -d * 0.2)),
    finalLook,
  ];
  return { positions, looks, finalLook };
}

export interface ArtworkFocusInfo {
  id: string;
  title: string;
  artist: string;
  description?: string;
  year?: string;
  image?: string;
  medium?: string;
  dimensions?: string;
  availability?: string;
}

export type GalleryViewMode = "walk" | "overview";
export type GalleryEditorMode = "arrange" | "walk";
export type GallerySceneMode = GalleryViewMode | GalleryEditorMode;

export interface GallerySceneCaptureOptions {
  maxWidth?: number;
  maxHeight?: number;
  mimeType?: "image/webp" | "image/jpeg" | "image/png";
  quality?: number;
}

export interface GallerySceneCaptureResult {
  dataUrl: string;
  width: number;
  height: number;
  mimeType: string;
  mode: GallerySceneMode;
}

export type GallerySceneCapture = (
  options?: GallerySceneCaptureOptions,
) => Promise<GallerySceneCaptureResult>;

export interface GallerySceneProps {
  draft: GalleryDraft;
  selectedId?: string;
  selectedDecorId?: string;
  focusWall?: { wall: WallId; token: number };
  focusArtwork?: { id: string; token: number };
  onSelect?: (id: string) => void;
  onSelectDecor?: (id: string) => void;
  onMoveDecor?: (id: string, x: number, z: number) => void;
  onMoveArtwork?: (id: string, wall: WallId, x: number, y: number) => void;
  onViewPlacementChange?: (x: number, z: number) => void;
  visitor?: boolean;
  viewMode?: GalleryViewMode;
  playIntro?: boolean;
  onIntroComplete?: () => void;
  onArtworkFocus?: (artwork: ArtworkFocusInfo | null) => void;
  onCaptureReady?: (capture: GallerySceneCapture | null) => void;
  onViewModeChange?: (mode: GalleryViewMode) => void;
  onEditorModeChange?: (mode: GalleryEditorMode) => void;
  artworkCount?: number;
  artworkDirectoryExpanded?: boolean;
  artworkDirectoryUnavailable?: boolean;
  artworkButtonRef?: RefObject<HTMLButtonElement | null>;
  onOpenArtworkDirectory?: () => void;
  onExitSpace?: () => void;
}

function observeRenderActivity(
  element: HTMLElement,
  onChange: (active: boolean) => void,
) {
  let pageVisible = !document.hidden;
  let intersecting = true;
  const publish = () => onChange(pageVisible && intersecting);
  const visibility = () => {
    pageVisible = !document.hidden;
    publish();
  };
  document.addEventListener("visibilitychange", visibility);
  const intersection = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => {
        intersecting = entries[0]?.isIntersecting ?? true;
        publish();
      }, { threshold: 0.01 })
    : undefined;
  intersection?.observe(element);
  return {
    active: () => pageVisible && intersecting,
    dispose: () => {
      document.removeEventListener("visibilitychange", visibility);
      intersection?.disconnect();
    },
  };
}

function sceneDraftKey(draft: GalleryDraft, visitor: boolean) {
  const artworks = draft.artworks
    .map((artwork) =>
      [
        artwork.id,
        artwork.aspect,
        artwork.wall,
        artwork.x,
        artwork.y,
        artwork.scale,
        artwork.frame ?? "black",
        artwork.locked ? 1 : 0,
        artwork.hidden ? 1 : 0,
        visitor ? artwork.title : "",
        visitor ? artwork.year : "",
        visitor ? artwork.description : "",
      ].join("~"),
    )
    .join("|");
  const decor = draft.decor
    .map((item) =>
      [
        item.id,
        item.type,
        item.x,
        item.z,
        item.rotation,
        item.scale,
        item.potColor ?? "light",
      ].join("~"),
    )
    .join("|");
  return [
    visitor ? "visitor" : "editor",
    visitor ? draft.title : "",
    visitor ? draft.artist : "",
    draft.templateId,
    draft.wall,
    draft.floor,
    draft.ceiling ?? "gallery",
    draft.lighting,
    artworks,
    decor,
  ].join("||");
}

function configureSceneCanvas(canvas: HTMLCanvasElement, label: string) {
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "application");
  canvas.setAttribute("aria-label", label);
}

function createSceneStatus(element: HTMLElement, initial: string) {
  const status = document.createElement("div");
  status.className = "scene-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.textContent = initial;
  element.appendChild(status);
  return {
    update(message: string, progress?: number) {
      status.textContent = message;
      if (progress === undefined) delete element.dataset.loadProgress;
      else element.dataset.loadProgress = String(Math.round(progress));
    },
    ready(message = "3D Space ready") {
      status.textContent = message;
      status.dataset.ready = "true";
      element.dataset.loadProgress = "100";
    },
    remove() {
      status.remove();
    },
  };
}

type ArtworkObject = THREE.Group & {
  userData: {
    artworkId: string;
    wall: WallId;
    source?: string;
    aspect?: number;
    scale?: number;
    presentationKey?: string;
    frameStyle?: string;
    locked?: boolean;
  };
};

function createArtworkObject(
  artwork: GalleryDraft["artworks"][number],
  selected: boolean,
  w: number,
  d: number,
  anisotropy = 8,
) {
  const group = new THREE.Group() as ArtworkObject;
  group.userData.artworkId = artwork.id;
  group.name = `artwork-${artwork.id}`;
  const frame = new THREE.Mesh(
    new RoundedBoxGeometry(1, 1, 0.085, 4, 0.018),
    new THREE.MeshPhysicalMaterial({
      color: "#1c1b19",
      metalness: 0.12,
      roughness: 0.38,
      clearcoat: 0.18,
      clearcoatRoughness: 0.52,
      envMapIntensity: 0.58,
    }),
  );
  frame.name = "artwork-frame";
  frame.castShadow = true;
  frame.receiveShadow = true;
  const mat = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshStandardMaterial({
      color: "#f1efe8",
      roughness: 0.88,
      metalness: 0,
      envMapIntensity: 0.24,
      side: THREE.FrontSide,
    }),
  );
  mat.name = "artwork-mat";
  mat.receiveShadow = true;
  const canvas = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      color: "#ffffff",
      toneMapped: false,
      transparent: true,
      alphaTest: 0.002,
      depthWrite: true,
      side: THREE.FrontSide,
    }),
  );
  canvas.name = "artwork-canvas";
  // Keep the print surface just proud of the physical frame so thicker,
  // bevelled frames never occlude or z-fight with the artwork.
  canvas.position.z = 0.047;
  group.add(frame, mat, canvas);
  group.traverse((item) => {
    item.userData.artworkId = artwork.id;
  });
  syncArtworkObject(group, artwork, selected, w, d, anisotropy);
  return group;
}

function syncArtworkObject(
  group: ArtworkObject,
  artwork: GalleryDraft["artworks"][number],
  selected: boolean,
  w: number,
  d: number,
  anisotropy = 8,
) {
  const frame = group.getObjectByName("artwork-frame") as THREE.Mesh<
    RoundedBoxGeometry,
    THREE.MeshPhysicalMaterial
  >;
  const canvas = group.getObjectByName("artwork-canvas") as THREE.Mesh<
    THREE.PlaneGeometry,
    THREE.MeshBasicMaterial
  >;
  const mat = group.getObjectByName("artwork-mat") as THREE.Mesh<
    THREE.PlaneGeometry,
    THREE.MeshStandardMaterial
  >;
  const metrics = artworkPresentationMetrics(artwork);
  const presentationKey = [
    artwork.aspect,
    artwork.scale,
    artwork.frame ?? "black",
    artwork.mat ?? "none",
  ].join(":");
  if (group.userData.presentationKey !== presentationKey) {
    frame.geometry.dispose();
    frame.geometry = new RoundedBoxGeometry(
      metrics.outerWidth,
      metrics.outerHeight,
      metrics.depth,
      4,
      Math.min(0.018, metrics.frameBorder * 0.42),
    );
    mat.geometry.dispose();
    mat.geometry = new THREE.PlaneGeometry(
      metrics.imageWidth + metrics.matBorder * 2,
      metrics.imageHeight + metrics.matBorder * 2,
    );
    canvas.geometry.dispose();
    canvas.geometry = new THREE.PlaneGeometry(
      metrics.imageWidth,
      metrics.imageHeight,
    );
    mat.position.z = metrics.depth / 2 + 0.001;
    canvas.position.z = metrics.depth / 2 + 0.003;
    group.userData.aspect = artwork.aspect;
    group.userData.scale = artwork.scale;
    group.userData.presentationKey = presentationKey;
  }
  if (group.userData.source !== artwork.src) {
    const previous = canvas.material.map;
    group.userData.source = artwork.src;
    if (!artwork.src) {
      canvas.material.map = null;
      canvas.material.needsUpdate = true;
      previous?.dispose();
      return;
    }
    const texture = new THREE.TextureLoader().load(
      publicAssetUrl(artwork.src),
      (loadedTexture) => {
        if (group.userData.source !== artwork.src) {
          loadedTexture.dispose();
          return;
        }
        loadedTexture.colorSpace = THREE.SRGBColorSpace;
        loadedTexture.needsUpdate = true;
        canvas.material.needsUpdate = true;
      },
      undefined,
      () => {
        if (group.userData.source !== artwork.src) return;
        group.userData.source = undefined;
        if (canvas.material.map === texture) canvas.material.map = null;
        canvas.material.needsUpdate = true;
        texture.dispose();
      },
    );
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = anisotropy;
    canvas.material.map = texture;
    canvas.material.needsUpdate = true;
    previous?.dispose();
  }
  const frameColor =
    artwork.frame === "white"
      ? "#eeeae0"
      : artwork.frame === "oak"
        ? "#d8c4aa"
        : artwork.frame === "dark-wood"
          ? "#8b7a70"
          : artwork.frame === "metal"
            ? "#a9aaa7"
        : "#1c1b19";
  const frameStyle = artwork.frame ?? "black";
  if (group.userData.frameStyle !== frameStyle) {
    frame.material.map?.dispose();
    frame.material.map =
      frameStyle === "oak"
        ? createWoodFrameTexture(false)
        : frameStyle === "dark-wood"
          ? createWoodFrameTexture(true)
          : null;
    group.userData.frameStyle = frameStyle;
  }
  frame.visible = true;
  frame.material.color.set(frameColor);
  frame.material.emissive.set(selected ? "#282414" : "#000000");
  frame.material.emissiveIntensity = selected ? 0.2 : 0;
  frame.material.metalness = frameStyle === "metal" ? 0.74 : frameStyle === "black" ? 0.15 : 0.02;
  frame.material.roughness =
    frameStyle === "metal"
      ? 0.27
      : frameStyle === "oak" || frameStyle === "dark-wood"
        ? 0.5
        : frameStyle === "none"
          ? 0.62
          : 0.36;
  frame.material.clearcoat =
    frameStyle === "metal" ? 0.28 : frameStyle === "oak" || frameStyle === "dark-wood" ? 0.1 : 0.2;
  frame.material.clearcoatRoughness = frameStyle === "metal" ? 0.32 : 0.52;
  frame.material.envMapIntensity = frameStyle === "metal" ? 0.92 : 0.48;
  const matStyle = artwork.mat ?? "none";
  mat.visible = matStyle !== "none";
  mat.material.color.set(
    matStyle === "black"
      ? "#171815"
      : matStyle === "warm-white"
        ? "#e8e0d1"
        : "#f2f0e9",
  );
  mat.material.roughness = matStyle === "black" ? 0.8 : 0.9;
  mat.material.needsUpdate = true;
  frame.material.needsUpdate = true;
  group.visible = !artwork.hidden;
  group.userData.locked = Boolean(artwork.locked);
  const config = WALLS[artwork.wall];
  const [px, py, pz] = config.position(artwork.x, artwork.y, w, d);
  group.position.set(px, py, pz);
  group.rotation.set(...config.rotation);
  group.userData.wall = artwork.wall;
}

function syncDecorObject(
  group: THREE.Group,
  item: DecorPlacement,
  selected: boolean,
) {
  group.position.set(item.x, 0, item.z);
  group.rotation.y = item.rotation;
  group.scale.setScalar(item.scale);
  const marker = group.getObjectByName("decor-selection-marker");
  if (marker) marker.visible = selected;
}

function disposeAndRemove(parent: THREE.Object3D, object: THREE.Object3D) {
  parent.remove(object);
  disposeObjectTree(object);
}

type ModeTransition = {
  startedAt: number;
  durationMs?: number;
  fromPosition: THREE.Vector3;
  toPosition: THREE.Vector3;
  fromQuaternion: THREE.Quaternion;
  toQuaternion: THREE.Quaternion;
  fromFov: number;
  toFov: number;
  finish: () => void;
};

type GalleryRuntime = {
  sync: (
    draft: GalleryDraft,
    selectedId?: string,
    selectedDecorId?: string,
  ) => void;
  setViewMode: (mode: GalleryViewMode) => void;
  setEditorMode: (mode: GalleryEditorMode) => void;
  setEditorCutaway: (open: boolean) => void;
  resetView: () => void;
  focusWall: (wall: WallId) => void;
  focusArtwork: (id: string) => void;
  focusPavilionZone: (zone: PavilionZoneId) => void;
  startGuidedTour: () => void;
  skipGuidedTour: () => void;
  pauseOrResumeGuidedTour: () => void;
  stepGuidedTour: (direction: -1 | 1) => void;
  smartView: () => void;
  capture: GallerySceneCapture;
};

type GalleryTourPose = {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  label: string;
  artworkId?: string;
  isStop?: boolean;
};

type GalleryActiveTour = {
  poses: GalleryTourPose[];
  startedAt: number;
  duration: number;
  segment: number;
  pausedAt?: number;
  lastUiUpdate: number;
};

function GallerySceneRenderer({
  draft,
  selectedId,
  selectedDecorId,
  focusWall,
  focusArtwork,
  onSelect,
  onSelectDecor,
  onMoveDecor,
  onMoveArtwork,
  onViewPlacementChange,
  visitor = false,
  viewMode = "walk",
  playIntro = false,
  onIntroComplete,
  onArtworkFocus,
  onCaptureReady,
  onViewModeChange,
  onEditorModeChange,
  artworkCount,
  artworkDirectoryExpanded,
  artworkDirectoryUnavailable,
  artworkButtonRef,
  onOpenArtworkDirectory,
  onExitSpace,
}: GallerySceneProps) {
  const host = useRef<HTMLDivElement>(null);
  const introPlayed = useRef(false);
  const cameraState = useRef<{
    templateId: GalleryDraft["templateId"];
    position: THREE.Vector3;
    target: THREE.Vector3;
  } | null>(null);
  const roomTurn = useRef<((direction: -1 | 1) => void) | null>(null);
  const runtime = useRef<GalleryRuntime | null>(null);
  const [editorMode, setEditorMode] = useState<GalleryEditorMode>("arrange");
  const [editorCutaway, setEditorCutaway] = useState(true);
  const [activePavilionZone, setActivePavilionZone] =
    useState<PavilionZoneId>("central-axis");
  const [tourState, setTourState] = useState<VisitorTourState>(IDLE_VISITOR_TOUR);
  const [smartViewLabel, setSmartViewLabel] = useState("Artwork views");
  const latest = useRef({
    draft,
    selectedId,
    selectedDecorId,
    onSelect,
    onSelectDecor,
    onMoveDecor,
    onMoveArtwork,
    onViewPlacementChange,
    visitor,
    viewMode,
    editorMode,
    editorCutaway,
    playIntro,
    onIntroComplete,
    onArtworkFocus,
    onViewModeChange,
    onExitSpace,
  });
  const runtimeKey = `${draft.templateId}:${visitor ? "visitor" : "editor"}`;
  useEffect(() => {
    latest.current = {
      draft,
      selectedId,
      selectedDecorId,
      onSelect,
      onSelectDecor,
      onMoveDecor,
      onMoveArtwork,
      onViewPlacementChange,
      visitor,
      viewMode,
      editorMode,
      editorCutaway,
      playIntro,
      onIntroComplete,
      onArtworkFocus,
      onViewModeChange,
      onExitSpace,
    };
  }, [
    draft,
    selectedId,
    selectedDecorId,
    onSelect,
    onSelectDecor,
    onMoveDecor,
    onMoveArtwork,
    onViewPlacementChange,
    visitor,
    viewMode,
    editorMode,
    editorCutaway,
    playIntro,
    onIntroComplete,
    onArtworkFocus,
    onViewModeChange,
    onExitSpace,
  ]);
  useEffect(() => {
    if (!host.current) return;
    const element = host.current;
    const sceneStartedAt = performance.now();
    const initial = latest.current;
    let currentDraft = initial.draft;
    let currentSelectedId = initial.selectedId;
    let currentSelectedDecorId = initial.selectedDecorId;
    let mode: GallerySceneMode = initial.visitor
      ? initial.viewMode
      : initial.editorMode;
    let editorCutawayOpen = initial.editorCutaway;
    let disposed = false;
    const scene = new THREE.Scene();
    const template = getTemplate(currentDraft.templateId);
    const [templateW, templateD] = template.dimensions;
    const dividerWidth = template.dividerWidth ?? PAVILION_DIVIDER_WIDTH;
    const quality = getRenderQuality();
    const premiumQuality = premiumQualityForTier(quality.tier);
    const camera = new THREE.PerspectiveCamera(
      mode === "walk" ? 62 : initial.visitor ? 46 : 48,
      1,
      0.1,
      160,
    );
    camera.position.set(...template.camera);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: quality.antialias,
        powerPreference:
          quality.tier === "low" ? "default" : "high-performance",
      });
    } catch {
      trackTelemetry("three_runtime_health", { runtime: "studio_viewer", outcome: "renderer_failed" });
      return showSceneError(element);
    }
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      trackTelemetry("three_runtime_health", { runtime: "studio_viewer", outcome: "context_lost" });
    };
    const handleContextRestored = () =>
      trackTelemetry("three_runtime_health", { runtime: "studio_viewer", outcome: "context_restored" });
    renderer.domElement.addEventListener("webglcontextlost", handleContextLost);
    renderer.domElement.addEventListener("webglcontextrestored", handleContextRestored);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => {
      element.dataset.motion = reducedMotion.matches ? "reduced" : "full";
    };
    reducedMotion.addEventListener("change", updateMotionPreference);
    renderer.setPixelRatio(quality.dpr);
    renderer.shadowMap.enabled = quality.shadows;
    // PCFSoftShadowMap is deprecated in current Three.js and aliases to PCF.
    // Keep one supported filtered path; tier differences live in map size,
    // light count and material/probe resolution instead.
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const initialLightingProfile = roomLightingProfile(
      currentDraft.templateId,
      currentDraft.lighting,
      quality.tier,
    );
    renderer.toneMappingExposure = initialLightingProfile.toneMappingExposure;
    configureSceneCanvas(
      renderer.domElement,
      initial.visitor
        ? "Interactive virtual Space. Focus this view to use keyboard movement."
        : mode === "walk"
          ? "Space Walk Preview. Focus this view to use keyboard movement."
          : "Interactive Studio arranger.",
    );
    renderer.domElement.dataset.sceneCanvas = "room";
    renderer.domElement.dataset.interaction = mode === "walk" ? "walk" : mode;
    element.dataset.quality = quality.tier;
    element.dataset.shadowFiltering = "pcf";
    element.dataset.surfaceAnisotropy = String(premiumQuality.surfaceAnisotropy);
    element.dataset.artworkAnisotropy = String(premiumQuality.artworkAnisotropy);
    element.dataset.reflectionProbeSize = String(premiumQuality.reflectionProbeSize);
    updateMotionPreference();
    element.dataset.sceneMode = mode;
    element.dataset.editing =
      !initial.visitor && mode === "arrange" ? "enabled" : "disabled";
    element.dataset.transition = "idle";
    element.dataset.rendererPersistent = "true";
    element.dataset.lightingPreset = currentDraft.lighting;
    element.dataset.toneMappingExposure =
      renderer.toneMappingExposure.toFixed(2);
    if (currentDraft.templateId === "pavilion")
      element.dataset.pavilionZone = "central-axis";
    element.appendChild(renderer.domElement);
    const focusCanvas = () =>
      renderer.domElement.focus({ preventScroll: true });
    renderer.domElement.addEventListener("pointerdown", focusCanvas);
    const baseEnvironmentTarget = createGalleryEnvironment(
      renderer,
      currentDraft.templateId,
    );
    const baseEnvironment = baseEnvironmentTarget.texture;
    scene.environment = baseEnvironment;
    scene.environmentIntensity = initialLightingProfile.environmentIntensity;
    element.dataset.environmentIntensity =
      scene.environmentIntensity.toFixed(2);
    const controls = new OrbitControls(camera, renderer.domElement);
    const largestDimension = Math.max(templateW, templateD);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.target.set(
      0,
      initial.visitor ? template.height * 0.36 : 1.6,
      initial.visitor ? 0 : -1.5,
    );
    controls.maxPolarAngle = Math.PI / 2 - 0.03;
    controls.minDistance = initial.visitor ? largestDimension * 0.42 : 1.45;
    controls.maxDistance = initial.visitor
      ? largestDimension * 1.75
      : Math.max(20, largestDimension * 1.12);
    controls.enablePan =
      initial.visitor || currentDraft.templateId === "pavilion";
    controls.screenSpacePanning = true;
    controls.enableZoom = true;
    controls.zoomSpeed = 0.7;
    controls.zoomToCursor = true;
    controls.touches.ONE = THREE.TOUCH.ROTATE;
    controls.touches.TWO = initial.visitor
      ? THREE.TOUCH.DOLLY_PAN
      : THREE.TOUCH.ROTATE;
    controls.autoRotate = false;
    if (
      !initial.visitor &&
      cameraState.current?.templateId === currentDraft.templateId
    ) {
      camera.position.copy(cameraState.current.position);
      controls.target.copy(cameraState.current.target);
    }
    const editorOpenTop =
      !initial.visitor && mode === "arrange" && editorCutawayOpen;
    const {
      w,
      d,
      h,
      decorObjects,
      floorMesh,
      wallSurfaces,
      exteriorWalls,
      architecture,
      roof,
      ceilingPlane,
      ceilingDetails,
    } = buildRoom(
      scene,
      currentDraft,
      mode === "arrange" ? currentSelectedDecorId : undefined,
      initial.visitor && mode === "overview",
      editorOpenTop,
      quality.tier,
    );
    const isCutawayActive = () =>
      initial.visitor
        ? mode === "overview"
        : mode === "arrange" && editorCutawayOpen;
    let lighting = addLighting(
      scene,
      currentDraft,
      w,
      d,
      h,
      isCutawayActive(),
      quality.shadowMapSize,
      quality.tier,
    );
    const roomBounds = {
      minX: -w / 2 + 0.45,
      maxX: w / 2 - 0.45,
      minZ: -d / 2 + 0.45,
      maxZ: d / 2 - 0.45,
    };
    const artworkObjects: ArtworkObject[] = [];
    const artworkById = new Map<string, GalleryDraft["artworks"][number]>();
    const decorById = new Map<string, THREE.Group>();
    currentDraft.decor.forEach((item, index) => {
      const object = decorObjects[index];
      if (object) decorById.set(item.id, object);
    });
    let collision: PlanarCollisionSystem = createPlanarCollisionSystem([]);
    const rebuildCollision = () => {
      collision = createPlanarCollisionSystem(
        planarCollidersFromObjects(
          [architecture, ...decorById.values()],
          VISITOR_EYE_HEIGHT,
        ),
        .36,
        roomBounds,
      );
    };
    let onWalkIntent = () => undefined;
    let onWalkEscape = () => undefined;
    const navigation = createFirstPersonWalk(
      camera,
      renderer.domElement,
      () => roomBounds,
      (next, previous) => collision.resolve(next, previous),
      (from, to) => collision.findPath(from, to),
      () => onWalkIntent(),
      () => onWalkEscape(),
    );
    const walkMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.18, 0.25, 32),
      new THREE.MeshBasicMaterial({
        color: "#d9ff43",
        transparent: true,
        opacity: 0.78,
        side: THREE.DoubleSide,
      }),
    );
    walkMarker.rotation.x = -Math.PI / 2;
    walkMarker.position.y = 0.018;
    walkMarker.visible = false;
    walkMarker.userData.noWalkCollision = true;
    scene.add(walkMarker);
    const cameraQuaternionFor = (
      position: THREE.Vector3,
      target: THREE.Vector3,
    ) => {
      const probe = camera.clone();
      probe.position.copy(position);
      probe.lookAt(target);
      return probe.quaternion.clone();
    };
    const arrangeState = {
      position: camera.position.clone(),
      quaternion: cameraQuaternionFor(camera.position, controls.target),
      target: controls.target.clone(),
      fov: 48,
    };
    const finalLook = new THREE.Vector3(0, VISITOR_EYE_HEIGHT, -1);
    const walkPosition = new THREE.Vector3(0, VISITOR_EYE_HEIGHT, d / 2 - 1);
    const walkState = {
      position: walkPosition,
      quaternion: cameraQuaternionFor(walkPosition, finalLook),
      fov: 62,
    };
    const overviewTarget = new THREE.Vector3(0, h * 0.34, 0);
    const overviewPosition = new THREE.Vector3(
      templateW * 0.68,
      h + Math.max(5.2, templateW * 0.27),
      templateD * 0.78,
    );
    const overviewState = {
      position: overviewPosition.clone(),
      quaternion: cameraQuaternionFor(overviewPosition, overviewTarget),
      fov: 46,
    };
    if (mode === "walk") {
      camera.position.copy(walkState.position);
      camera.quaternion.copy(walkState.quaternion);
      camera.fov = walkState.fov;
    } else if (mode === "overview") {
      camera.position.copy(overviewState.position);
      camera.quaternion.copy(overviewState.quaternion);
      camera.fov = overviewState.fov;
      controls.target.copy(overviewTarget);
    } else {
      camera.position.copy(arrangeState.position);
      camera.quaternion.copy(arrangeState.quaternion);
      camera.fov = arrangeState.fov;
      controls.target.copy(arrangeState.target);
    }
    camera.updateProjectionMatrix();
    controls.enabled = mode !== "walk";
    controls.enablePan =
      mode === "overview" ||
      (mode === "arrange" && currentDraft.templateId === "pavilion");
    navigation.setEnabled(mode === "walk" && !initial.playIntro);
    const status = createSceneStatus(element, "Preparing 3D Space…");
    let intro =
      navigation && initial.playIntro && mode === "walk" && !introPlayed.current
        ? createCinematicIntro(
            camera,
            galleryIntroTour(currentDraft, w, d),
            navigation,
            element,
            () => {
              introPlayed.current = true;
              latest.current.onIntroComplete?.();
            },
            "Private view",
            currentDraft.title,
          )
        : null;
    let activeGuidedTour: GalleryActiveTour | null = null;
    let smartGalleryViewIndex = -1;
    const applyCutawayMode = () => {
      const active = isCutawayActive();
      roof.visible = ceilingPlane.visible = ceilingDetails.visible = !active;
      exteriorWalls.forEach((mesh) => {
        const material = mesh.material as THREE.MeshPhysicalMaterial;
        material.transparent = active;
        material.depthWrite = !active;
        material.side = active ? THREE.DoubleSide : THREE.FrontSide;
        if (!active) material.opacity = 1;
        material.needsUpdate = true;
      });
      architecture.traverse((object) => {
        if (object.userData.hideInCutaway) object.visible = !active;
        if (object.userData.roomPartition) {
          const mesh = object as THREE.Mesh;
          const material = mesh.material as THREE.MeshPhysicalMaterial;
          material.transparent = active;
          material.opacity = active ? 0.38 : 1;
          material.depthWrite = !active;
          material.needsUpdate = true;
        }
      });
      lighting.rig.traverse((object) => {
        if (object.userData.hideInCutaway) object.visible = !active;
      });
      element.dataset.cutaway = active ? "active" : "inactive";
      element.dataset.roofPreference = editorCutawayOpen ? "open" : "ceiling";
    };
    applyCutawayMode();
    let reflectionEnvironmentTarget: THREE.WebGLRenderTarget | null = null;
    let reflectionTimer = 0;
    let reflectionFrame = 0;
    let reflectionIdle = 0;
    const idleWindow = window as Window & {
      requestIdleCallback?: (
        callback: IdleRequestCallback,
        options?: IdleRequestOptions,
      ) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const cancelScheduledRoomReflection = () => {
      window.clearTimeout(reflectionTimer);
      reflectionTimer = 0;
      if (reflectionFrame) cancelAnimationFrame(reflectionFrame);
      reflectionFrame = 0;
      if (reflectionIdle && idleWindow.cancelIdleCallback)
        idleWindow.cancelIdleCallback(reflectionIdle);
      reflectionIdle = 0;
    };
    const bakeRoomReflection = () => {
      reflectionFrame = 0;
      if (disposed || quality.tier === "low") return;
      const visibility = new Map<THREE.Object3D, boolean>();
      const materialStates = new Map<
        THREE.Material,
        {
          transparent: boolean;
          opacity: number;
          depthWrite: boolean;
          side: THREE.Side;
        }
      >();
      const rememberVisibility = (object: THREE.Object3D, visible: boolean) => {
        if (!visibility.has(object)) visibility.set(object, object.visible);
        object.visible = visible;
      };
      const closeSurface = (mesh: THREE.Mesh) => {
        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        materials.forEach((material) => {
          if (!materialStates.has(material))
            materialStates.set(material, {
              transparent: material.transparent,
              opacity: material.opacity,
              depthWrite: material.depthWrite,
              side: material.side,
            });
          material.transparent = false;
          material.opacity = 1;
          material.depthWrite = true;
          material.side = THREE.FrontSide;
          material.needsUpdate = true;
        });
      };
      [roof, ceilingPlane, ceilingDetails].forEach((object) =>
        rememberVisibility(object, true),
      );
      exteriorWalls.forEach(closeSurface);
      architecture.traverse((object) => {
        if (object.userData.hideInCutaway) rememberVisibility(object, true);
        if (object.userData.roomPartition && (object as THREE.Mesh).isMesh)
          closeSurface(object as THREE.Mesh);
      });
      lighting.rig.traverse((object) => {
        if (object.userData.hideInCutaway) rememberVisibility(object, true);
      });
      scene.traverse((object) => {
        if (
          object === walkMarker ||
          object.name === "decor-selection-marker" ||
          object.name === "artwork-selection-marker"
        )
          rememberVisibility(object, false);
      });
      let nextTarget: THREE.WebGLRenderTarget | null = null;
      try {
        nextTarget = captureRoomEnvironment(
          renderer,
          scene,
          baseEnvironment,
          new THREE.Vector3(0, h * 0.48, 0),
          Math.max(w, d) * 1.8,
          premiumQuality.reflectionProbeSize,
        );
      } catch {
        element.dataset.reflections = "light-card-pmrem";
      } finally {
        visibility.forEach((visible, object) => {
          object.visible = visible;
        });
        materialStates.forEach((state, material) => {
          material.transparent = state.transparent;
          material.opacity = state.opacity;
          material.depthWrite = state.depthWrite;
          material.side = state.side;
          material.needsUpdate = true;
        });
      }
      if (!nextTarget) return;
      const previous = reflectionEnvironmentTarget;
      reflectionEnvironmentTarget = nextTarget;
      scene.environment = nextTarget.texture;
      previous?.dispose();
      renderer.shadowMap.needsUpdate = true;
      element.dataset.reflections = "room-probe";
    };
    const scheduleRoomReflection = () => {
      if (quality.tier === "low") {
        element.dataset.reflections = "light-card-pmrem";
        return;
      }
      cancelScheduledRoomReflection();
      element.dataset.reflections = "room-probe-pending";
      reflectionTimer = window.setTimeout(() => {
        reflectionTimer = 0;
        const queueBake = () => {
          reflectionIdle = 0;
          reflectionFrame = requestAnimationFrame(bakeRoomReflection);
        };
        if (idleWindow.requestIdleCallback)
          reflectionIdle = idleWindow.requestIdleCallback(queueBake, {
            timeout: 1_200,
          });
        else queueBake();
      }, 650);
    };
    scheduleRoomReflection();
    let modeTransition: ModeTransition | null = null;
    let orbitAnimation: {
      start: number;
      from: number;
      to: number;
      radius: number;
      y: number;
      rotateInPlace?: boolean;
    } | null = null;
    let wallCameraAnimation: {
      start: number;
      fromPosition: THREE.Vector3;
      fromTarget: THREE.Vector3;
      toPosition: THREE.Vector3;
      toTarget: THREE.Vector3;
    } | null = null;
    const inwardNormals: Record<WallId, THREE.Vector3> = {
      north: new THREE.Vector3(0, 0, 1),
      south: new THREE.Vector3(0, 0, -1),
      west: new THREE.Vector3(1, 0, 0),
      east: new THREE.Vector3(-1, 0, 0),
      "divider-front": new THREE.Vector3(0, 0, 1),
      "divider-back": new THREE.Vector3(0, 0, -1),
      "north-cross-west": new THREE.Vector3(0, 0, 1),
      "north-room-west": new THREE.Vector3(0, 0, -1),
      "north-cross-east": new THREE.Vector3(0, 0, 1),
      "north-room-east": new THREE.Vector3(0, 0, -1),
      "south-cross-west": new THREE.Vector3(0, 0, -1),
      "south-room-west": new THREE.Vector3(0, 0, 1),
      "south-cross-east": new THREE.Vector3(0, 0, -1),
      "south-room-east": new THREE.Vector3(0, 0, 1),
    };
    const setWalkPoseForSelected = () => {
      if (initial.visitor) return false;
      const artwork = currentDraft.artworks.find(
        (item) => item.id === currentSelectedId && !item.hidden,
      );
      if (!artwork) return false;
      const target = new THREE.Vector3(
        ...WALLS[artwork.wall].position(artwork.x, artwork.y, w, d),
      );
      const position = target
        .clone()
        .addScaledVector(
          inwardNormals[artwork.wall],
          currentDraft.templateId === "pavilion" ? 4.2 : 2.8,
        );
      position.set(
        THREE.MathUtils.clamp(position.x, roomBounds.minX, roomBounds.maxX),
        VISITOR_EYE_HEIGHT,
        THREE.MathUtils.clamp(position.z, roomBounds.minZ, roomBounds.maxZ),
      );
      walkState.position.copy(position);
      walkState.quaternion.copy(cameraQuaternionFor(position, target));
      walkState.fov = 58;
      return true;
    };
    const setMode = (nextMode: GallerySceneMode) => {
      if (
        nextMode === mode ||
        (initial.visitor && nextMode === "arrange") ||
        (!initial.visitor && nextMode === "overview")
      )
        return;
      if (activeGuidedTour) stopGuidedTour("mode-change");
      intro?.skip();
      intro = null;
      latest.current.onArtworkFocus?.(null);
      walkMarker.visible = false;
      wallCameraAnimation = null;
      orbitAnimation = null;
      editorZoomDistance = null;
      if (mode === "arrange") {
        arrangeState.position.copy(camera.position);
        arrangeState.quaternion.copy(camera.quaternion);
        arrangeState.target.copy(controls.target);
        arrangeState.fov = camera.fov;
      } else if (mode === "walk") {
        walkState.position.copy(camera.position);
        walkState.quaternion.copy(camera.quaternion);
        walkState.fov = camera.fov;
        if (initial.visitor && nextMode === "overview") {
          overviewTarget.set(
            THREE.MathUtils.clamp(
              camera.position.x,
              roomBounds.minX,
              roomBounds.maxX,
            ),
            h * 0.34,
            THREE.MathUtils.clamp(
              camera.position.z - d * 0.08,
              roomBounds.minZ,
              roomBounds.maxZ,
            ),
          );
          overviewState.position
            .copy(overviewTarget)
            .add(
              new THREE.Vector3(
                templateW * 0.68,
                h + Math.max(5.2, templateW * 0.27),
                templateD * 0.58,
              ),
            );
          overviewState.quaternion.copy(
            cameraQuaternionFor(overviewState.position, overviewTarget),
          );
        }
      } else {
        overviewState.position.copy(camera.position);
        overviewState.quaternion.copy(camera.quaternion);
        overviewState.fov = camera.fov;
      }
      if (!initial.visitor && nextMode === "walk") setWalkPoseForSelected();
      mode = nextMode;
      applyCutawayMode();
      artworkObjects.forEach((object) => {
        const artwork = artworkById.get(object.userData.artworkId);
        if (artwork)
          syncArtworkObject(
            object,
            artwork,
            mode === "arrange" && currentSelectedId === artwork.id,
            w,
            d,
            premiumQuality.artworkAnisotropy,
          );
      });
      decorById.forEach((object, id) => {
        const item = currentDraft.decor.find(
          (candidate) => candidate.id === id,
        );
        if (item)
          syncDecorObject(
            object,
            item,
            mode === "arrange" && currentSelectedDecorId === id,
          );
      });
      element.dataset.sceneMode = mode;
      element.dataset.editorMode = initial.visitor
        ? "visitor"
        : mode === "walk"
          ? "walk-preview"
          : "arrange";
      element.dataset.editing =
        !initial.visitor && mode === "arrange" ? "enabled" : "disabled";
      element.dataset.dollhouse = mode === "overview" ? "active" : "inactive";
      element.dataset.transition = `to-${mode === "walk" && !initial.visitor ? "walk-preview" : mode}`;
      renderer.domElement.dataset.interaction = mode === "walk" ? "walk" : mode;
      renderer.domElement.setAttribute(
        "aria-label",
        initial.visitor
          ? "Interactive virtual Space. Focus this view to use keyboard movement."
          : mode === "walk"
            ? "Space Walk Preview. Focus this view to use keyboard movement."
            : "Interactive Studio arranger.",
      );
      controls.enabled = false;
      navigation.setEnabled(false);
      const targetState =
        mode === "walk"
          ? walkState
          : mode === "overview"
            ? overviewState
            : arrangeState;
      const finish = () => {
        camera.position.copy(targetState.position);
        camera.quaternion.copy(targetState.quaternion);
        camera.fov = targetState.fov;
        camera.updateProjectionMatrix();
        if (mode === "overview") {
          controls.target.copy(overviewTarget);
          controls.enablePan = true;
          controls.enabled = true;
          controls.update();
        } else if (mode === "arrange") {
          controls.target.copy(arrangeState.target);
          controls.enablePan = currentDraft.templateId === "pavilion";
          controls.enabled = true;
          controls.update();
        } else {
          controls.enabled = false;
          navigation.syncFromCamera();
          navigation.setEnabled(true);
          renderer.domElement.focus({ preventScroll: true });
        }
        modeTransition = null;
        element.dataset.transition = "idle";
        status.ready(
          mode === "walk" && !initial.visitor
            ? "Walk preview ready. Editing is locked."
            : mode === "arrange"
              ? "Arrange view ready."
              : mode === "overview"
                ? "Overview ready."
                : "Space Walk Preview ready.",
        );
      };
      modeTransition = {
        startedAt: performance.now(),
        fromPosition: camera.position.clone(),
        toPosition: targetState.position.clone(),
        fromQuaternion: camera.quaternion.clone(),
        toQuaternion: targetState.quaternion.clone(),
        fromFov: camera.fov,
        toFov: targetState.fov,
        finish,
      };
      if (reducedMotion.matches) finish();
    };
    const resetSceneView = () => {
      if (activeGuidedTour) stopGuidedTour("reset");
      wallCameraAnimation = null;
      orbitAnimation = null;
      modeTransition = null;
      navigation.setEnabled(false);
      if (mode === "arrange") {
        arrangeState.position.set(...template.camera);
        arrangeState.target.set(0, 1.6, -1.5);
        arrangeState.quaternion.copy(
          cameraQuaternionFor(arrangeState.position, arrangeState.target),
        );
        arrangeState.fov = 48;
        camera.position.copy(arrangeState.position);
        camera.quaternion.copy(arrangeState.quaternion);
        camera.fov = arrangeState.fov;
        controls.target.copy(arrangeState.target);
        controls.enabled = true;
        controls.update();
      } else if (mode === "walk") {
        if (!setWalkPoseForSelected()) {
          walkState.position.set(0, VISITOR_EYE_HEIGHT, d / 2 - 1);
          walkState.quaternion.copy(
            cameraQuaternionFor(walkState.position, finalLook),
          );
          walkState.fov = 62;
        }
        camera.position.copy(walkState.position);
        camera.quaternion.copy(walkState.quaternion);
        camera.fov = walkState.fov;
        navigation.syncFromCamera();
        navigation.setEnabled(true);
        renderer.domElement.focus({ preventScroll: true });
      } else {
        overviewTarget.set(0, h * 0.34, 0);
        overviewState.position.set(
          templateW * 0.68,
          h + Math.max(5.2, templateW * 0.27),
          templateD * 0.78,
        );
        overviewState.quaternion.copy(
          cameraQuaternionFor(overviewState.position, overviewTarget),
        );
        camera.position.copy(overviewState.position);
        camera.quaternion.copy(overviewState.quaternion);
        camera.fov = overviewState.fov;
        controls.target.copy(overviewTarget);
        controls.enabled = true;
        controls.update();
      }
      camera.updateProjectionMatrix();
      element.dataset.transition = "idle";
      status.ready(
        mode === "walk" && currentSelectedId
          ? "View reset in front of the selected artwork."
          : "View reset.",
      );
    };
    const setEditorCutawayMode = (open: boolean) => {
      if (initial.visitor || editorCutawayOpen === open) return;
      editorCutawayOpen = open;
      applyCutawayMode();
      status.ready(
        open ? "Open-roof arrange view ready." : "Ceiling preview ready.",
      );
    };
    const focusWallView = (wall: WallId) => {
      if (initial.visitor || mode !== "arrange") return;
      const artwork =
        currentDraft.artworks.find(
          (item) => item.id === currentSelectedId && item.wall === wall,
        ) ?? currentDraft.artworks.find((item) => item.wall === wall);
      const x = artwork?.x ?? 0;
      const y = artwork?.y ?? Math.min(2.35, h * 0.48);
      const [px, py, pz] = WALLS[wall].position(x, y, w, d);
      const toTarget = new THREE.Vector3(px, py, pz);
      const distance = currentDraft.templateId === "pavilion" ? 8.2 : 5.4;
      const toPosition = toTarget
        .clone()
        .addScaledVector(inwardNormals[wall], distance);
      toPosition.y = THREE.MathUtils.clamp(py + 0.55, 2.05, h - 0.45);
      toPosition.x = THREE.MathUtils.clamp(
        toPosition.x,
        roomBounds.minX,
        roomBounds.maxX,
      );
      toPosition.z = THREE.MathUtils.clamp(
        toPosition.z,
        roomBounds.minZ,
        roomBounds.maxZ,
      );
      if (reducedMotion.matches) {
        camera.position.copy(toPosition);
        controls.target.copy(toTarget);
        camera.lookAt(toTarget);
        controls.update();
      } else {
        wallCameraAnimation = {
          start: performance.now(),
          fromPosition: camera.position.clone(),
          fromTarget: controls.target.clone(),
          toPosition,
          toTarget,
        };
        orbitAnimation = null;
        controls.enabled = false;
      }
    };
    const focusPavilionZoneView = (zoneId: PavilionZoneId) => {
      if (
        (initial.visitor ? mode !== "overview" : mode !== "arrange") ||
        currentDraft.templateId !== "pavilion"
      )
        return;
      const zone = PAVILION_ZONES.find((item) => item.id === zoneId);
      const view = pavilionZoneCamera(zoneId, template.dimensions, h);
      const toPosition = new THREE.Vector3(...view.position);
      const toTarget = new THREE.Vector3(...view.target);
      orbitAnimation = null;
      element.dataset.pavilionZone = zoneId;
      status.ready(`${zone?.label ?? "Forum zone"} ready.`);
      if (reducedMotion.matches) {
        camera.position.copy(toPosition);
        controls.target.copy(toTarget);
        camera.lookAt(toTarget);
        controls.update();
      } else {
        wallCameraAnimation = {
          start: performance.now(),
          fromPosition: camera.position.clone(),
          fromTarget: controls.target.clone(),
          toPosition,
          toTarget,
        };
        controls.enabled = false;
      }
    };
    const focusArtworkView = (id: string) => {
      if (!initial.visitor || mode !== "walk" || activeGuidedTour) return;
      const pose = galleryTourPoses().find((item) => item.artworkId === id);
      if (!pose) return;
      navigation.setEnabled(false);
      const finish = () => {
        camera.position.copy(pose.position);
        camera.quaternion.copy(pose.quaternion);
        camera.fov = 58;
        camera.updateProjectionMatrix();
        navigation.syncFromCamera();
        navigation.setEnabled(true);
        setSmartViewLabel(pose.label);
        modeTransition = null;
        element.dataset.transition = "idle";
      };
      modeTransition = {
        startedAt: performance.now(),
        durationMs: 560,
        fromPosition: camera.position.clone(),
        fromQuaternion: camera.quaternion.clone(),
        fromFov: camera.fov,
        toPosition: pose.position.clone(),
        toQuaternion: pose.quaternion.clone(),
        toFov: 58,
        finish,
      };
      element.dataset.transition = "active";
      if (reducedMotion.matches) finish();
      status.ready(`${pose.label} ready.`);
    };
    roomTurn.current = (direction) => {
      if (!controls || mode !== "arrange" || orbitAnimation) return;
      const offset = camera.position.clone().sub(controls.target);
      const from = Math.atan2(offset.x, offset.z);
      const animation = {
        start: performance.now(),
        from,
        to: from + (direction * Math.PI) / 4,
        radius: Math.max(
          currentDraft.templateId === "pavilion" ? 8 : 0,
          Math.hypot(offset.x, offset.z),
        ),
        y: camera.position.y,
        rotateInPlace: currentDraft.templateId === "pavilion",
      };
      if (reducedMotion.matches) {
        const angle = animation.to;
        if (animation.rotateInPlace)
          controls.target.set(
            camera.position.x + Math.sin(angle) * animation.radius,
            VISITOR_EYE_HEIGHT,
            camera.position.z + Math.cos(angle) * animation.radius,
          );
        else
          camera.position.set(
            controls.target.x + Math.sin(angle) * animation.radius,
            animation.y,
            controls.target.z + Math.cos(angle) * animation.radius,
          );
        camera.lookAt(controls.target);
        controls.update();
      } else {
        orbitAnimation = animation;
        controls.enabled = false;
      }
    };
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let focusedArtwork: THREE.Object3D | null = null;
    let focusedArtworkId: string | null = null;
    let draggedDecor: THREE.Group | null = null;
    let draggedArtwork: ArtworkObject | null = null;
    let draggedArtworkPlacement: {
      id: string;
      wall: WallId;
      x: number;
      y: number;
    } | null = null;
    let dragPointerId = -1;
    let pointerStartX = 0;
    let pointerStartY = 0;
    let pointerTravel = 0;
    let suppressSceneClick = false;
    let editorPinching = false;
    let editorPinchDistance = 0;
    let editorZoomDistance: number | null = null;
    const editorTouches = new Map<number, { x: number; y: number }>();
    const isArranging = () => !initial.visitor && mode === "arrange";
    const setPointer = (event: PointerEvent) => {
      const box = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - box.left) / box.width) * 2 - 1,
        -((event.clientY - box.top) / box.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
    };
    const closestVisibleWall = () => {
      const hit = raycaster.intersectObjects(
        [...wallSurfaces, architecture],
        true,
      )[0];
      return hit?.object.userData.wallId ? hit : undefined;
    };
    const placementFromWallHit = (
      wallHit: THREE.Intersection<THREE.Object3D>,
      artwork: GalleryDraft["artworks"][number],
    ) => {
      const wallId = wallHit.object.userData.wallId as WallId;
      const height = 1.5 * artwork.scale;
      const width = height * artwork.aspect;
      const availableWidth = isShortGalleryWall(wallId)
        ? wallId.startsWith("divider") ? dividerWidth : w / 4
        : wallId === "north" || wallId === "south"
          ? w
          : d;
      const horizontal =
        wallId === "west" || wallId === "east"
          ? wallHit.point.z
          : wallHit.point.x;
      const maxX = Math.max(0.15, availableWidth / 2 - width / 2 - 0.12);
      const wallHeight = isShortGalleryWall(wallId) ? h - 0.75 : h;
      return {
        wall: wallId,
        x: THREE.MathUtils.clamp(horizontal, -maxX, maxX),
        y: THREE.MathUtils.clamp(
          wallHit.point.y,
          height / 2 + 0.14,
          wallHeight - height / 2 - 0.12,
        ),
      };
    };
    const pinchDistance = () => {
      const points = [...editorTouches.values()];
      return points.length < 2
        ? 0
        : Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    };
    const editorPointerDown = (event: PointerEvent) => {
      if (!isArranging() || event.button !== 0) return;
      if (event.pointerType === "touch") {
        editorTouches.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });
        if (editorTouches.size >= 2) {
          editorPinching = true;
          editorPinchDistance = pinchDistance();
          editorZoomDistance = camera.position.distanceTo(controls.target);
          draggedDecor = null;
          draggedArtwork = null;
          draggedArtworkPlacement = null;
          dragPointerId = -1;
          renderer.domElement.classList.remove(
            "is-dragging-object",
            "is-dragging-artwork",
          );
          controls.enabled = false;
          suppressSceneClick = true;
          return;
        }
      }
      pointerStartX = event.clientX;
      pointerStartY = event.clientY;
      pointerTravel = 0;
      setPointer(event);
      const hit = raycaster.intersectObjects(
        [...artworkObjects, ...decorById.values()],
        true,
      )[0];
      const artworkId = hit?.object.userData.artworkId as string | undefined;
      const decorId = hit?.object.userData.decorId as string | undefined;
      if (artworkId) {
        draggedArtwork =
          artworkObjects.find(
            (item) => item.userData.artworkId === artworkId,
          ) ?? null;
        const artwork = artworkById.get(artworkId);
        if (draggedArtwork && artwork)
          draggedArtworkPlacement = {
            id: artworkId,
            wall: artwork.wall,
            x: artwork.x,
            y: artwork.y,
          };
      } else if (decorId) draggedDecor = decorById.get(decorId) ?? null;
      if (!draggedArtwork && !draggedDecor) return;
      dragPointerId = event.pointerId;
      controls.enabled = false;
      renderer.domElement.classList.add(
        draggedArtwork ? "is-dragging-artwork" : "is-dragging-object",
      );
      if (event.isTrusted)
        renderer.domElement.setPointerCapture(event.pointerId);
    };
    const editorPointerMove = (event: PointerEvent) => {
      if (!isArranging()) return;
      if (event.pointerType === "touch" && editorTouches.has(event.pointerId)) {
        editorTouches.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });
        if (editorPinching && editorTouches.size >= 2) {
          const distance = pinchDistance();
          if (editorPinchDistance > 0 && distance > 0)
            editorZoomDistance = THREE.MathUtils.clamp(
              (editorZoomDistance ??
                camera.position.distanceTo(controls.target)) *
                (editorPinchDistance / distance),
              controls.minDistance,
              controls.maxDistance,
            );
          editorPinchDistance = distance;
          suppressSceneClick = true;
          event.preventDefault();
          return;
        }
      }
      pointerTravel = Math.max(
        pointerTravel,
        Math.hypot(
          event.clientX - pointerStartX,
          event.clientY - pointerStartY,
        ),
      );
      if (event.pointerId !== dragPointerId) return;
      setPointer(event);
      if (draggedDecor) {
        const floorHit = raycaster.intersectObject(floorMesh, false)[0];
        if (!floorHit) return;
        draggedDecor.position.x = THREE.MathUtils.clamp(
          floorHit.point.x,
          roomBounds.minX,
          roomBounds.maxX,
        );
        draggedDecor.position.z = THREE.MathUtils.clamp(
          floorHit.point.z,
          roomBounds.minZ,
          roomBounds.maxZ,
        );
        suppressSceneClick = true;
        return;
      }
      if (draggedArtwork && draggedArtworkPlacement) {
        const wallHit = closestVisibleWall();
        const artwork = artworkById.get(draggedArtworkPlacement.id);
        if (!wallHit || !artwork) return;
        const placement = placementFromWallHit(wallHit, artwork);
        const config = WALLS[placement.wall];
        const [px, py, pz] = config.position(placement.x, placement.y, w, d);
        draggedArtwork.position.set(px, py, pz);
        draggedArtwork.rotation.set(...config.rotation);
        draggedArtwork.userData.wall = placement.wall;
        draggedArtworkPlacement = { id: artwork.id, ...placement };
        suppressSceneClick = true;
      }
    };
    const editorPointerUp = (event: PointerEvent) => {
      if (isArranging() && event.pointerType === "touch") {
        editorTouches.delete(event.pointerId);
        if (editorPinching) {
          if (!editorTouches.size) {
            editorPinching = false;
            editorPinchDistance = 0;
            controls.enabled = true;
          }
          suppressSceneClick = true;
          return;
        }
      }
      if (!isArranging() || event.pointerId !== dragPointerId) {
        if (isArranging() && pointerTravel > 5) suppressSceneClick = true;
        return;
      }
      if (draggedDecor) {
        const decorId = draggedDecor.userData.decorId as string;
        const { x, z } = draggedDecor.position;
        const persisted = currentDraft.decor.find(
          (item) => item.id === decorId,
        );
        if (persisted)
          syncDecorObject(
            draggedDecor,
            persisted,
            currentSelectedDecorId === decorId,
          );
        latest.current.onSelectDecor?.(decorId);
        if (pointerTravel > 2) latest.current.onMoveDecor?.(decorId, x, z);
      }
      if (draggedArtworkPlacement) {
        const placement = draggedArtworkPlacement;
        const persisted = artworkById.get(placement.id);
        if (draggedArtwork && persisted)
          syncArtworkObject(
            draggedArtwork,
            persisted,
            currentSelectedId === placement.id,
            w,
            d,
            premiumQuality.artworkAnisotropy,
          );
        latest.current.onSelect?.(placement.id);
        if (pointerTravel > 2)
          latest.current.onMoveArtwork?.(
            placement.id,
            placement.wall,
            placement.x,
            placement.y,
          );
      }
      renderer.domElement.classList.remove(
        "is-dragging-object",
        "is-dragging-artwork",
      );
      if (renderer.domElement.hasPointerCapture(event.pointerId))
        renderer.domElement.releasePointerCapture(event.pointerId);
      controls.enabled = true;
      draggedDecor = null;
      draggedArtwork = null;
      draggedArtworkPlacement = null;
      dragPointerId = -1;
      suppressSceneClick = pointerTravel > 2;
    };
    const handlePointer = (event: PointerEvent) => {
      setPointer(event);
      const artHit = raycaster.intersectObjects(artworkObjects, true)[0];
      const artworkId = artHit?.object.userData.artworkId as string | undefined;
      if (isArranging()) {
        if (suppressSceneClick) {
          suppressSceneClick = false;
          return;
        }
        const objectHit =
          artHit ??
          raycaster.intersectObjects([...decorById.values()], true)[0];
        const decorId = objectHit?.object.userData.decorId as
          | string
          | undefined;
        if (artworkId) latest.current.onSelect?.(artworkId);
        else if (decorId) latest.current.onSelectDecor?.(decorId);
        else if (currentSelectedDecorId) {
          const floorHit = raycaster.intersectObject(floorMesh, false)[0];
          if (floorHit)
            latest.current.onMoveDecor?.(
              currentSelectedDecorId,
              THREE.MathUtils.clamp(
                floorHit.point.x,
                roomBounds.minX,
                roomBounds.maxX,
              ),
              THREE.MathUtils.clamp(
                floorHit.point.z,
                roomBounds.minZ,
                roomBounds.maxZ,
              ),
            );
        } else if (currentSelectedId) {
          const wallHit = closestVisibleWall();
          const artwork = artworkById.get(currentSelectedId);
          if (wallHit && artwork) {
            const placement = placementFromWallHit(wallHit, artwork);
            latest.current.onMoveArtwork?.(
              currentSelectedId,
              placement.wall,
              placement.x,
              placement.y,
            );
          }
        }
        return;
      }
      const exitPortal = scene.getObjectByName("lieuva-exit-portal");
      if (
        mode === "walk" &&
        exitPortal &&
        raycaster.intersectObject(exitPortal, false).length > 0 &&
        latest.current.onExitSpace
      ) {
        latest.current.onExitSpace();
        return;
      }
      if (artworkId) {
        const artwork = artworkById.get(artworkId);
        if (!artwork) return;
        focusedArtwork =
          artworkObjects.find(
            (item) => item.userData.artworkId === artworkId,
          ) ?? artHit.object;
        focusedArtworkId = artworkId;
        latest.current.onArtworkFocus?.({
          id: artwork.id,
          title: artwork.title,
          artist: currentDraft.artist,
          description: artwork.description,
          year: artwork.year,
          image: artwork.src,
          medium: artwork.medium,
          dimensions: artwork.dimensions,
        });
        return;
      }
      if (mode !== "walk" || !navigation.consumeClick()) return;
      const floorHit = raycaster.intersectObject(floorMesh, false)[0];
      if (floorHit) {
        focusedArtwork = null;
        focusedArtworkId = null;
        latest.current.onArtworkFocus?.(null);
        if (navigation.moveTo(floorHit.point)) {
          walkMarker.position.set(floorHit.point.x, 0.018, floorHit.point.z);
          walkMarker.visible = true;
        }
      }
    };
    renderer.domElement.addEventListener("pointerdown", editorPointerDown);
    renderer.domElement.addEventListener("pointermove", editorPointerMove);
    renderer.domElement.addEventListener("pointerup", editorPointerUp);
    renderer.domElement.addEventListener("pointercancel", editorPointerUp);
    renderer.domElement.addEventListener("click", handlePointer);
    const syncDraft = (
      next: GalleryDraft,
      nextSelectedId?: string,
      nextSelectedDecorId?: string,
    ) => {
      const reflectionChanged =
        roomReflectionSignature(currentDraft) !== roomReflectionSignature(next);
      const previousCollisionKey = currentDraft.decor
        .map(
          (item) =>
            `${item.id}:${item.type}:${item.x}:${item.z}:${item.rotation}:${item.scale}`,
        )
        .join("|");
      const nextCollisionKey = next.decor
        .map(
          (item) =>
            `${item.id}:${item.type}:${item.x}:${item.z}:${item.rotation}:${item.scale}`,
        )
        .join("|");
      if (next.wall !== currentDraft.wall)
        updateRoomSurface(scene, next, w, d, "wall");
      if (next.floor !== currentDraft.floor)
        updateRoomSurface(scene, next, w, d, "floor");
      if ((next.ceiling ?? "gallery") !== (currentDraft.ceiling ?? "gallery"))
        updateRoomSurface(scene, next, w, d, "ceiling");
      const nextArtworkIds = new Set(next.artworks.map((item) => item.id));
      artworkObjects.slice().forEach((object) => {
        if (nextArtworkIds.has(object.userData.artworkId)) return;
        disposeAndRemove(scene, object);
        artworkObjects.splice(artworkObjects.indexOf(object), 1);
        artworkById.delete(object.userData.artworkId);
      });
      next.artworks.forEach((artwork) => {
        let object = artworkObjects.find(
          (item) => item.userData.artworkId === artwork.id,
        );
        if (!object) {
          object = createArtworkObject(
            artwork,
            isArranging() && nextSelectedId === artwork.id,
            w,
            d,
            premiumQuality.artworkAnisotropy,
          );
          scene.add(object);
          artworkObjects.push(object);
        } else
          syncArtworkObject(
            object,
            artwork,
            isArranging() && nextSelectedId === artwork.id,
            w,
            d,
            premiumQuality.artworkAnisotropy,
          );
        artworkById.set(artwork.id, artwork);
      });
      const nextDecorIds = new Set(next.decor.map((item) => item.id));
      [...decorById].forEach(([id, object]) => {
        if (!nextDecorIds.has(id)) {
          disposeAndRemove(scene, object);
          decorById.delete(id);
        }
      });
      next.decor.forEach((item) => {
        let object = decorById.get(item.id);
        const previousItem = currentDraft.decor.find(
          (candidate) => candidate.id === item.id,
        );
        if (
          !object ||
          previousItem?.type !== item.type ||
          previousItem?.potColor !== item.potColor
        ) {
          if (object) disposeAndRemove(scene, object);
          object = createDecor(
            item,
            isArranging() && nextSelectedDecorId === item.id,
          );
          scene.add(object);
          decorById.set(item.id, object);
        } else
          syncDecorObject(
            object,
            item,
            isArranging() && nextSelectedDecorId === item.id,
          );
      });
      const previousStructureKey = [
        currentDraft.lighting,
        ...currentDraft.artworks.map(
          (item) => `${item.id}:${item.hidden ? 1 : 0}`,
        ),
      ].join("|");
      const nextStructureKey = [
        next.lighting,
        ...next.artworks.map((item) => `${item.id}:${item.hidden ? 1 : 0}`),
      ].join("|");
      const previousLayoutKey = currentDraft.artworks
        .map((item) => `${item.id}:${item.wall}:${item.x}:${item.y}`)
        .join("|");
      const nextLayoutKey = next.artworks
        .map((item) => `${item.id}:${item.wall}:${item.x}:${item.y}`)
        .join("|");
      if (previousStructureKey !== nextStructureKey) {
        disposeAndRemove(scene, lighting.rig);
        lighting = addLighting(
          scene,
          next,
          w,
          d,
          h,
          isCutawayActive(),
          quality.shadowMapSize,
          quality.tier,
        );
        applyCutawayMode();
      } else if (previousLayoutKey !== nextLayoutKey)
        updateLightingLayout(lighting, next, w, d, h);
      currentDraft = next;
      currentSelectedId = nextSelectedId;
      currentSelectedDecorId = nextSelectedDecorId;
      if (previousCollisionKey !== nextCollisionKey) rebuildCollision();
      if (reflectionChanged) scheduleRoomReflection();
      element.dataset.ceiling = next.ceiling ?? "gallery";
      element.dataset.lightingPreset = next.lighting;
      element.dataset.artLights = String(lighting.count);
      element.dataset.lightScope = "room";
      element.dataset.wall = next.wall;
      element.dataset.floor = next.floor;
      element.dataset.sceneMode = mode;
      element.dataset.editorMode = initial.visitor
        ? "visitor"
        : mode === "walk"
          ? "walk-preview"
          : "arrange";
      element.dataset.editing =
        !initial.visitor && mode === "arrange" ? "enabled" : "disabled";
      element.dataset.dollhouse = mode === "overview" ? "active" : "inactive";
      element.dataset.cutaway = isCutawayActive() ? "active" : "inactive";
      element.dataset.roomDimensions = `${w} × ${d} × ${h}`;
      element.dataset.visitorEyeHeight = String(VISITOR_EYE_HEIGHT);
      element.dataset.architecture =
        next.templateId === "pavilion"
          ? "central-axis-four-side-galleries"
          : next.templateId;
      element.dataset.artworkLayout = next.artworks
        .map((artwork) =>
          [
            artwork.wall,
            artwork.x.toFixed(3),
            artwork.y.toFixed(3),
            artwork.scale.toFixed(3),
            artwork.aspect.toFixed(3),
            artwork.frame ?? "black",
            artwork.locked ? "locked" : "free",
            artwork.hidden ? "hidden" : "visible",
          ].join(":"),
        )
        .join("|");
      element.dataset.decorLayout = next.decor
        .map((item) =>
          [
            item.type,
            item.x.toFixed(3),
            item.z.toFixed(3),
            item.rotation.toFixed(3),
            item.scale.toFixed(3),
          ].join(":"),
        )
        .join("|");
    };
    syncDraft(currentDraft, currentSelectedId, currentSelectedDecorId);
    rebuildCollision();
    status.ready();
    element.dataset.sceneReadyMs = String(Math.round(performance.now() - sceneStartedAt));
    const capture: GallerySceneCapture = async (options = {}) => {
      if (disposed) throw new Error("The 3D Space is no longer available.");
      const sourceWidth = Math.max(1, renderer.domElement.width);
      const sourceHeight = Math.max(1, renderer.domElement.height);
      const maxWidth = THREE.MathUtils.clamp(
        Math.round(options.maxWidth ?? 1280),
        64,
        4096,
      );
      const maxHeight = THREE.MathUtils.clamp(
        Math.round(options.maxHeight ?? 960),
        64,
        4096,
      );
      const scale = Math.min(
        1,
        maxWidth / sourceWidth,
        maxHeight / sourceHeight,
      );
      const width = Math.max(1, Math.round(sourceWidth * scale));
      const height = Math.max(1, Math.round(sourceHeight * scale));
      const output = document.createElement("canvas");
      output.width = width;
      output.height = height;
      const context = output.getContext("2d");
      if (!context)
        throw new Error(
          "The Space cover could not be prepared in this browser.",
        );
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      context.drawImage(renderer.domElement, 0, 0, width, height);
      const requestedType = options.mimeType ?? "image/webp";
      const qualityValue = THREE.MathUtils.clamp(
        options.quality ?? 0.82,
        0.35,
        1,
      );
      let dataUrl = output.toDataURL(requestedType, qualityValue);
      if (
        requestedType === "image/webp" &&
        !dataUrl.startsWith("data:image/webp")
      )
        dataUrl = output.toDataURL("image/jpeg", qualityValue);
      const mimeType = dataUrl.slice(5, dataUrl.indexOf(";"));
      element.dataset.lastCapture = `${width}x${height}`;
      return { dataUrl, width, height, mimeType, mode };
    };
    element.dataset.captureReady = "true";
    const galleryTourPoses = () => {
      const entranceTarget = new THREE.Vector3(0, VISITOR_EYE_HEIGHT, -1);
      const entrance = new THREE.Vector3(0, VISITOR_EYE_HEIGHT, d / 2 - 1);
      const center = new THREE.Vector3(0, VISITOR_EYE_HEIGHT, 0);
      const poses: GalleryTourPose[] = [
        {
          position: entrance,
          quaternion: cameraQuaternionFor(entrance, entranceTarget),
          label: "Entrance",
          isStop: true,
        },
        {
          position: center,
          quaternion: cameraQuaternionFor(center, new THREE.Vector3(0, VISITOR_EYE_HEIGHT, -d * 0.34)),
          label: "Room overview",
          isStop: true,
        },
      ];
      currentDraft.artworks
        .filter((artwork) => !artwork.hidden)
        .slice(0, 12)
        .forEach((artwork) => {
          const target = new THREE.Vector3(
            ...WALLS[artwork.wall].position(artwork.x, artwork.y, w, d),
          );
          const distance = THREE.MathUtils.clamp(2.5 + artwork.scale * 0.45, 2.7, 4.8);
          const position = target.clone().addScaledVector(inwardNormals[artwork.wall], distance);
          position.set(
            THREE.MathUtils.clamp(position.x, roomBounds.minX, roomBounds.maxX),
            VISITOR_EYE_HEIGHT,
            THREE.MathUtils.clamp(position.z, roomBounds.minZ, roomBounds.maxZ),
          );
          const previous = poses.at(-1)?.position ?? entrance;
          collision.resolve(position, previous);
          poses.push({
            position,
            quaternion: cameraQuaternionFor(position, target),
            label: artwork.title || "Untitled artwork",
            artworkId: artwork.id,
            isStop: true,
          });
        });
      if (poses.length === 2)
        poses.push({
          position: entrance.clone(),
          quaternion: cameraQuaternionFor(entrance, entranceTarget),
          label: "Visitor view",
          isStop: true,
        });
      const routed: GalleryTourPose[] = [poses[0]];
      for (const destination of poses.slice(1)) {
        const from = routed.at(-1)?.position ?? poses[0].position;
        const path = collision.findPath(from, destination.position);
        if (path?.length) {
          path.slice(0, -1).forEach((point, index) => {
            if (point.distanceToSquared(from) < 0.04) return;
            const next = path[index + 1] ?? destination.position;
            routed.push({
              position: point.clone().setY(VISITOR_EYE_HEIGHT),
              quaternion: cameraQuaternionFor(point, next.clone().setY(VISITOR_EYE_HEIGHT)),
              label: destination.label,
              isStop: false,
            });
          });
        }
        routed.push(destination);
      }
      return routed;
    };
    const publishGalleryTourState = (
      status: VisitorTourState["status"],
      progress: number,
      pose: GalleryTourPose,
      index: number,
      poses: GalleryTourPose[],
    ) => {
      if (disposed) return;
      const stops = poses.filter((item) => item.isStop !== false);
      const currentStop = poses
        .slice(0, index + 1)
        .filter((item) => item.isStop !== false).length;
      setTourState({
        status,
        progress,
        currentLabel: pose.label,
        currentStop: Math.max(1, Math.min(stops.length, currentStop)),
        stopCount: stops.length,
      });
      element.dataset.guidedTour = status;
      element.dataset.tourStop = pose.label;
    };
    const stopGuidedTour = (
      result: "skipped" | "completed" | "mode-change" | "reset" = "skipped",
    ) => {
      if (!activeGuidedTour) return;
      activeGuidedTour = null;
      element.dataset.guidedTour = "idle";
      element.dataset.lastTourResult = result;
      setTourState(IDLE_VISITOR_TOUR);
      if (mode === "walk") {
        walkState.position.copy(camera.position);
        walkState.quaternion.copy(camera.quaternion);
        walkState.fov = camera.fov;
        navigation.syncFromCamera();
        navigation.setEnabled(true);
      }
    };
    const pauseOrResumeGuidedTour = () => {
      if (!activeGuidedTour) return;
      const now = performance.now();
      if (activeGuidedTour.pausedAt !== undefined) {
        activeGuidedTour.startedAt += now - activeGuidedTour.pausedAt;
        activeGuidedTour.pausedAt = undefined;
        navigation.setEnabled(false);
        const pose = activeGuidedTour.poses[Math.max(0, activeGuidedTour.segment + 1)];
        publishGalleryTourState(
          "playing",
          THREE.MathUtils.clamp((now - activeGuidedTour.startedAt) / activeGuidedTour.duration, 0, 1),
          pose,
          Math.max(0, activeGuidedTour.segment + 1),
          activeGuidedTour.poses,
        );
      } else {
        activeGuidedTour.pausedAt = now;
        navigation.syncFromCamera();
        navigation.setEnabled(true);
        const pose = activeGuidedTour.poses[Math.max(0, activeGuidedTour.segment + 1)];
        publishGalleryTourState(
          "paused",
          THREE.MathUtils.clamp((now - activeGuidedTour.startedAt) / activeGuidedTour.duration, 0, 1),
          pose,
          Math.max(0, activeGuidedTour.segment + 1),
          activeGuidedTour.poses,
        );
      }
    };
    const stepGuidedTour = (direction: -1 | 1) => {
      if (!activeGuidedTour) return;
      const tour = activeGuidedTour;
      const stopIndexes = tour.poses.flatMap((pose, poseIndex) =>
        pose.isStop === false ? [] : [poseIndex],
      );
      const current = stopIndexes.findIndex((poseIndex) => poseIndex >= tour.segment + 1);
      const stopIndex = THREE.MathUtils.clamp(
        (current < 0 ? stopIndexes.length - 1 : current) + direction,
        0,
        stopIndexes.length - 1,
      );
      const index = stopIndexes[stopIndex];
      const pose = tour.poses[index];
      const progress = index / Math.max(1, tour.poses.length - 1);
      tour.segment = Math.max(-1, index - 1);
      tour.startedAt = performance.now() - progress * tour.duration;
      tour.pausedAt = performance.now();
      navigation.setEnabled(false);
      const finish = () => {
        camera.position.copy(pose.position);
        camera.quaternion.copy(pose.quaternion);
        camera.fov = 58;
        camera.updateProjectionMatrix();
        modeTransition = null;
        navigation.syncFromCamera();
        navigation.setEnabled(true);
      };
      modeTransition = {
        startedAt: performance.now(),
        durationMs: 520,
        fromPosition: camera.position.clone(),
        toPosition: pose.position.clone(),
        fromQuaternion: camera.quaternion.clone(),
        toQuaternion: pose.quaternion.clone(),
        fromFov: camera.fov,
        toFov: 58,
        finish,
      };
      if (reducedMotion.matches) finish();
      publishGalleryTourState("paused", progress, pose, index, tour.poses);
    };
    const startGuidedTour = () => {
      if (disposed || mode !== "walk" || activeGuidedTour) return;
      intro?.dispose();
      intro = null;
      latest.current.onArtworkFocus?.(null);
      walkMarker.visible = false;
      const poses = galleryTourPoses();
      const featured = poses.find((pose) => pose.artworkId) ?? poses[1];
      if (reducedMotion.matches) {
        camera.position.copy(featured.position);
        camera.quaternion.copy(featured.quaternion);
        camera.fov = 58;
        camera.updateProjectionMatrix();
        navigation.syncFromCamera();
        navigation.setEnabled(true);
        element.dataset.lastTourResult = "reduced-instant";
        setSmartViewLabel(featured.label);
        setTourState(IDLE_VISITOR_TOUR);
        return;
      }
      camera.position.copy(poses[0].position);
      camera.quaternion.copy(poses[0].quaternion);
      camera.fov = 58;
      camera.updateProjectionMatrix();
      navigation.setEnabled(false);
      activeGuidedTour = {
        poses,
        startedAt: performance.now(),
        duration: THREE.MathUtils.clamp((poses.length - 1) * 4_500, 20_000, 45_000),
        segment: -1,
        lastUiUpdate: 0,
      };
      publishGalleryTourState("playing", 0, poses[0], 0, poses);
    };
    const smartView = () => {
      if (mode !== "walk" || activeGuidedTour) return;
      const poses = galleryTourPoses().filter((pose) => pose.artworkId);
      if (!poses.length) return;
      smartGalleryViewIndex = (smartGalleryViewIndex + 1) % poses.length;
      const pose = poses[smartGalleryViewIndex];
      camera.position.copy(pose.position);
      camera.quaternion.copy(pose.quaternion);
      camera.fov = 58;
      camera.updateProjectionMatrix();
      navigation.syncFromCamera();
      navigation.setEnabled(true);
      setSmartViewLabel(pose.label);
      element.dataset.smartViewLabel = pose.label;
    };
    onWalkIntent = () => {
      if (activeGuidedTour && activeGuidedTour.pausedAt === undefined)
        pauseOrResumeGuidedTour();
    };
    onWalkEscape = () => {
      if (activeGuidedTour) stopGuidedTour("skipped");
      else if (initial.visitor) latest.current.onViewModeChange?.("overview");
      else setEditorMode("arrange");
    };
    runtime.current = {
      sync: syncDraft,
      setViewMode: (next) => {
        if (initial.visitor) setMode(next);
      },
      setEditorMode: (next) => {
        if (!initial.visitor) setMode(next);
      },
      setEditorCutaway: setEditorCutawayMode,
      resetView: resetSceneView,
      focusWall: focusWallView,
      focusArtwork: focusArtworkView,
      focusPavilionZone: focusPavilionZoneView,
      startGuidedTour,
      skipGuidedTour: () => stopGuidedTour("skipped"),
      pauseOrResumeGuidedTour,
      stepGuidedTour,
      smartView,
      capture,
    };
    trackTelemetry("three_milestone", {
      runtime: initial.visitor ? "published_viewer" : "studio",
      stage: "interactive",
      template: currentDraft.templateId,
      quality: quality.tier,
    });
    const overviewCenter = new THREE.Vector3(0, h * 0.34, 0);
    const overviewDirection = new THREE.Vector3();
    const wallNormals: Record<string, THREE.Vector3> = {
      north: new THREE.Vector3(0, 0, -1),
      south: new THREE.Vector3(0, 0, 1),
      west: new THREE.Vector3(-1, 0, 0),
      east: new THREE.Vector3(1, 0, 0),
    };
    const updateCutaway = () => {
      if (!isCutawayActive()) return;
      overviewDirection
        .subVectors(camera.position, overviewCenter)
        .setY(0)
        .normalize();
      exteriorWalls.forEach((mesh) => {
        const material = mesh.material as THREE.MeshPhysicalMaterial;
        const facing =
          wallNormals[String(mesh.userData.wallId)]?.dot(overviewDirection) ??
          -1;
        const targetOpacity =
          facing > 0.42
            ? 0.045
            : facing > -0.16
              ? 0.28
              : mode === "overview"
                ? 0.9
                : 0.78;
        material.opacity = THREE.MathUtils.lerp(
          material.opacity,
          targetOpacity,
          0.16,
        );
      });
    };
    let frame = 0;
    const resize = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    const adaptiveDpr = createAdaptiveDpr(renderer, quality, () => {
      trackTelemetry("three_runtime_health", { runtime: "studio_viewer", outcome: "quality_downgrade", quality: "low" });
      // Preserve the room's directional contact shadow when performance drops.
      // Removing every shadow made the procedural rooms look flat precisely on
      // the devices that already receive the lowest material/reflection budget.
      lighting.installations.forEach((installation, index) => {
        installation.spot.castShadow = index === 0;
      });
      renderer.shadowMap.needsUpdate = true;
      element.dataset.quality = "low";
    }, () => {
      trackTelemetry("three_runtime_health", { runtime: "studio_viewer", outcome: "quality_recovery", quality: "balanced" });
      lighting.installations.forEach((installation, index) => {
        installation.spot.castShadow = index < 2;
      });
      renderer.shadowMap.needsUpdate = true;
      element.dataset.quality = "balanced";
    });
    const cameraDirection = new THREE.Vector3();
    const artworkDirection = new THREE.Vector3();
    const artworkPosition = new THREE.Vector3();
    const insertionDirection = new THREE.Vector3();
    const insertionPoint = new THREE.Vector3();
    const insertionHorizontal = new THREE.Vector3();
    const editorCameraOffset = new THREE.Vector3();
    let placementFrame = 0;
    let lastDiagnosticsAt = Number.NEGATIVE_INFINITY;
    let lastPerformanceDiagnosticsAt = Number.NEGATIVE_INFINITY;
    let renderRunning = false;
    const renderActivity: ReturnType<typeof observeRenderActivity> = {
      active: () => true,
      dispose: () => undefined,
    };
    const wakeRender = () => {
      if (renderRunning || !renderActivity.active()) return;
      renderRunning = true;
      frame = requestAnimationFrame(animate);
    };
    const animate = (now = performance.now()) => {
      if (!renderActivity.active()) {
        renderRunning = false;
        return;
      }
      intro?.update();
      if (activeGuidedTour && activeGuidedTour.pausedAt === undefined) {
        const tour = activeGuidedTour;
        const raw = THREE.MathUtils.clamp((now - tour.startedAt) / tour.duration, 0, 1);
        const scaled = raw * Math.max(1, tour.poses.length - 1);
        const segment = Math.min(tour.poses.length - 2, Math.floor(scaled));
        const localRaw = scaled - segment;
        const local = localRaw * localRaw * (3 - 2 * localRaw);
        const from = tour.poses[segment];
        const to = tour.poses[segment + 1];
        camera.position.lerpVectors(from.position, to.position, local);
        camera.quaternion.slerpQuaternions(from.quaternion, to.quaternion, local);
        camera.fov = 58 + Math.sin(local * Math.PI) * 1.2;
        camera.updateProjectionMatrix();
        if (tour.segment !== segment || now - tour.lastUiUpdate > 120) {
          tour.segment = segment;
          tour.lastUiUpdate = now;
          publishGalleryTourState("playing", raw, to, segment + 1, tour.poses);
        }
        if (raw >= 1) stopGuidedTour("completed");
      } else if (mode === "walk" && !modeTransition) navigation.update();
      updateCutaway();
      if (modeTransition) {
        const raw = Math.min(1, (now - modeTransition.startedAt) / (modeTransition.durationMs ?? 320));
        const eased = raw * raw * (3 - 2 * raw);
        camera.position.lerpVectors(
          modeTransition.fromPosition,
          modeTransition.toPosition,
          eased,
        );
        camera.quaternion.slerpQuaternions(
          modeTransition.fromQuaternion,
          modeTransition.toQuaternion,
          eased,
        );
        camera.fov = THREE.MathUtils.lerp(
          modeTransition.fromFov,
          modeTransition.toFov,
          eased,
        );
        camera.updateProjectionMatrix();
        if (raw >= 1) modeTransition.finish();
      }
      if (wallCameraAnimation) {
        const raw = Math.min(1, (now - wallCameraAnimation.start) / 680);
        const eased = raw * raw * (3 - 2 * raw);
        camera.position.lerpVectors(
          wallCameraAnimation.fromPosition,
          wallCameraAnimation.toPosition,
          eased,
        );
        controls.target.lerpVectors(
          wallCameraAnimation.fromTarget,
          wallCameraAnimation.toTarget,
          eased,
        );
        camera.lookAt(controls.target);
        if (raw >= 1) {
          wallCameraAnimation = null;
          controls.enabled = true;
        }
      }
      if (orbitAnimation) {
        const raw = Math.min(1, (now - orbitAnimation.start) / 520);
        const eased = raw * raw * (3 - 2 * raw);
        const angle = THREE.MathUtils.lerp(
          orbitAnimation.from,
          orbitAnimation.to,
          eased,
        );
        if (orbitAnimation.rotateInPlace)
          controls.target.set(
            camera.position.x + Math.sin(angle) * orbitAnimation.radius,
            VISITOR_EYE_HEIGHT,
            camera.position.z + Math.cos(angle) * orbitAnimation.radius,
          );
        else
          camera.position.set(
            controls.target.x + Math.sin(angle) * orbitAnimation.radius,
            orbitAnimation.y,
            controls.target.z + Math.cos(angle) * orbitAnimation.radius,
          );
        camera.lookAt(controls.target);
        if (raw >= 1) {
          orbitAnimation = null;
          controls.enabled = true;
        }
      }
      if (editorZoomDistance !== null) {
        editorCameraOffset.copy(camera.position).sub(controls.target);
        const distance = editorCameraOffset.length();
        const nextDistance = THREE.MathUtils.lerp(
          distance,
          editorZoomDistance,
          0.2,
        );
        if (distance > 0.0001)
          camera.position
            .copy(controls.target)
            .add(editorCameraOffset.multiplyScalar(nextDistance / distance));
        if (Math.abs(nextDistance - editorZoomDistance) < 0.004)
          editorZoomDistance = null;
      }
      if (!modeTransition && mode !== "walk") controls.update();
      if (!initial.visitor && mode === "arrange" && !modeTransition) {
        if (
          !cameraState.current ||
          cameraState.current.templateId !== currentDraft.templateId
        )
          cameraState.current = {
            templateId: currentDraft.templateId,
            position: camera.position.clone(),
            target: controls.target.clone(),
          };
        else {
          cameraState.current.position.copy(camera.position);
          cameraState.current.target.copy(controls.target);
        }
        if (
          latest.current.onViewPlacementChange &&
          placementFrame++ % 18 === 0
        ) {
          camera.getWorldDirection(insertionDirection);
          insertionHorizontal.copy(insertionDirection).setY(0);
          if (insertionHorizontal.lengthSq() < 0.001)
            insertionHorizontal.set(0, 0, -1);
          insertionHorizontal.normalize();
          const floorDistance =
            insertionDirection.y < -0.08
              ? THREE.MathUtils.clamp(
                  -camera.position.y / insertionDirection.y,
                  1.8,
                  7,
                )
              : 3.2;
          insertionPoint
            .copy(camera.position)
            .addScaledVector(insertionHorizontal, floorDistance);
          latest.current.onViewPlacementChange(
            THREE.MathUtils.clamp(
              insertionPoint.x,
              roomBounds.minX,
              roomBounds.maxX,
            ),
            THREE.MathUtils.clamp(
              insertionPoint.z,
              roomBounds.minZ,
              roomBounds.maxZ,
            ),
          );
        }
        artworkObjects.forEach((object) => {
          if (object.userData.wall === "south")
            object.visible = camera.position.z < d / 2 - 0.12;
        });
      }
      if (walkMarker.visible) {
        walkMarker.rotation.z += 0.008;
        const material = walkMarker.material as THREE.MeshBasicMaterial;
        material.opacity = 0.5 + Math.sin(now * 0.006) * 0.25;
        if (!navigation.hasDestination()) walkMarker.visible = false;
      }
      if (focusedArtwork && focusedArtworkId && mode === "walk") {
        camera.getWorldDirection(cameraDirection);
        focusedArtwork.getWorldPosition(artworkPosition);
        artworkDirection.subVectors(artworkPosition, camera.position);
        const distance = artworkDirection.length();
        const facing = cameraDirection.dot(artworkDirection.normalize());
        if (facing < 0.48 || distance > 8) {
          focusedArtwork = null;
          focusedArtworkId = null;
          latest.current.onArtworkFocus?.(null);
        }
      }
      // These attributes are observability hooks, not rendering inputs. Updating
      // them at 60 fps created strings, DOM mutations and avoidable GC pauses.
      if (now - lastDiagnosticsAt >= 120) {
        lastDiagnosticsAt = now;
        element.dataset.cameraPosition = camera.position
          .toArray()
          .map((value) => value.toFixed(3))
          .join(",");
        element.dataset.cameraYaw = camera.rotation.y.toFixed(3);
        if (mode === "arrange" || mode === "overview")
          element.dataset.cameraTarget = controls.target
            .toArray()
            .map((value) => value.toFixed(3))
            .join(",");
        else delete element.dataset.cameraTarget;
        element.dataset.intro =
          intro && !intro.isComplete() ? "active" : "complete";
      }
      if (now - lastPerformanceDiagnosticsAt >= 1000) {
        lastPerformanceDiagnosticsAt = now;
        element.dataset.drawCalls = String(renderer.info.render.calls);
        element.dataset.triangles = String(renderer.info.render.triangles);
        element.dataset.textureCount = String(renderer.info.memory.textures);
      }
      adaptiveDpr.update(now);
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    const observedRenderActivity = observeRenderActivity(element, (active) => {
      if (!active) {
        cancelAnimationFrame(frame);
        renderRunning = false;
      } else wakeRender();
    });
    renderActivity.active = observedRenderActivity.active;
    renderActivity.dispose = observedRenderActivity.dispose;
    wakeRender();
    return () => {
      disposed = true;
      runtime.current = null;
      cancelAnimationFrame(frame);
      renderActivity.dispose();
      roomTurn.current = null;
      observer.disconnect();
      reducedMotion.removeEventListener("change", updateMotionPreference);
      renderer.domElement.removeEventListener("pointerdown", focusCanvas);
      renderer.domElement.removeEventListener("pointerdown", editorPointerDown);
      renderer.domElement.removeEventListener("pointermove", editorPointerMove);
      renderer.domElement.removeEventListener("pointerup", editorPointerUp);
      renderer.domElement.removeEventListener("pointercancel", editorPointerUp);
      renderer.domElement.removeEventListener("click", handlePointer);
      renderer.domElement.removeEventListener("webglcontextlost", handleContextLost);
      renderer.domElement.removeEventListener("webglcontextrestored", handleContextRestored);
      intro?.dispose();
      navigation.dispose();
      controls.dispose();
      status.remove();
      cancelScheduledRoomReflection();
      reflectionEnvironmentTarget?.dispose();
      baseEnvironmentTarget.dispose();
      disposeObjectTree(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [runtimeKey]);
  useEffect(() => {
    runtime.current?.sync(draft, selectedId, selectedDecorId);
  }, [draft, selectedId, selectedDecorId]);
  useEffect(() => {
    if (visitor) runtime.current?.setViewMode(viewMode);
  }, [viewMode, visitor]);
  useEffect(() => {
    if (!visitor) runtime.current?.setEditorMode(editorMode);
  }, [editorMode, visitor]);
  useEffect(() => {
    if (!visitor) onEditorModeChange?.(editorMode);
  }, [editorMode, onEditorModeChange, visitor]);
  useEffect(() => {
    if (!visitor) runtime.current?.setEditorCutaway(editorCutaway);
  }, [editorCutaway, visitor]);
  useEffect(() => {
    if (!visitor && focusWall) runtime.current?.focusWall(focusWall.wall);
  }, [focusWall, visitor]);
  useEffect(() => {
    if (visitor && focusArtwork) runtime.current?.focusArtwork(focusArtwork.id);
  }, [focusArtwork, visitor]);
  useEffect(() => {
    onCaptureReady?.(runtime.current?.capture ?? null);
    return () => {
      onCaptureReady?.(null);
    };
  }, [onCaptureReady, runtimeKey]);
  const arranging = !visitor && editorMode === "arrange";
  const sceneClass = visitor
    ? `gallery-scene--${viewMode}`
    : editorMode === "walk"
      ? "gallery-scene--edit gallery-scene--walk gallery-scene--editor-walk"
      : "gallery-scene--edit gallery-scene--editor-arrange";
  return (
    <div
      className={`gallery-scene ${sceneClass} ${arranging && selectedDecorId ? "gallery-scene--placing" : ""} ${arranging && selectedId ? "gallery-scene--placing-art" : ""}`}
      data-editor-view={
        visitor ? undefined : editorMode === "walk" ? "walk-preview" : "arrange"
      }
      ref={host}
    >
      {(visitor || editorMode === "walk") && (
        <VisitorControls
          mode={visitor ? viewMode : editorMode}
          modeOptions={
            visitor
              ? [
                  { value: "walk", label: "Walk", icon: "⌖" },
                  { value: "overview", label: "Overview", icon: "◫" },
                ]
              : [
                  { value: "arrange", label: "Arrange", icon: "◇" },
                  { value: "walk", label: "Walk preview", icon: "⌖" },
                ]
          }
          onModeChange={(next) => {
            if (visitor) onViewModeChange?.(next as GalleryViewMode);
            else setEditorMode(next as GalleryEditorMode);
          }}
          tour={tourState}
          tourAvailable={(visitor ? viewMode : editorMode) === "walk"}
          onStartOrSkipTour={() =>
            tourState.status === "idle"
              ? runtime.current?.startGuidedTour()
              : runtime.current?.skipGuidedTour()
          }
          onPauseOrResumeTour={() => runtime.current?.pauseOrResumeGuidedTour()}
          onStepTour={(direction) => runtime.current?.stepGuidedTour(direction)}
          onSmartView={() => runtime.current?.smartView()}
          smartViewLabel={smartViewLabel}
          onResetView={() => runtime.current?.resetView()}
          artworkCount={artworkCount ?? draft.artworks.filter((item) => !item.hidden).length}
          artworkDirectoryExpanded={artworkDirectoryExpanded}
          artworkDirectoryUnavailable={artworkDirectoryUnavailable}
          artworkButtonRef={artworkButtonRef}
          onOpenArtworkDirectory={onOpenArtworkDirectory}
          compactLabel={visitor ? "Space controls" : "Walk Preview controls"}
          firstEntryHint={visitor}
        />
      )}
      {!visitor && arranging && (
        <>
          <div
            className="builder-scene-controls"
            data-editor-view-switch="true"
          >
            <div
              className="builder-scene-switch builder-scene-switch--primary"
              role="group"
              aria-label="Editor view"
            >
              <button
                type="button"
                data-scene-mode-option="arrange"
                className={editorMode === "arrange" ? "active" : ""}
                aria-pressed={editorMode === "arrange"}
                onClick={() => setEditorMode("arrange")}
              >
                Arrange
              </button>
              <button
                type="button"
                data-scene-mode-option="walk-preview"
                className=""
                aria-pressed={false}
                onClick={() => setEditorMode("walk")}
              >
                Walk preview
              </button>
            </div>
            <div
              className="builder-scene-switch builder-scene-switch--secondary"
              role="group"
              aria-label="Arrange roof view"
            >
              <button
                type="button"
                data-roof-option="open"
                className={editorCutaway ? "active" : ""}
                aria-pressed={editorCutaway}
                onClick={() => setEditorCutaway(true)}
              >
                Open roof
              </button>
              <button
                type="button"
                data-roof-option="ceiling"
                className={!editorCutaway ? "active" : ""}
                aria-pressed={!editorCutaway}
                onClick={() => setEditorCutaway(false)}
              >
                Preview ceiling
              </button>
            </div>
            <button
              type="button"
              className="builder-reset-view"
              data-builder-reset-view
              onClick={() => runtime.current?.resetView()}
            >
              Reset view
            </button>
          </div>
          <>
            <button
              className="room-turn room-turn--left"
              type="button"
              onClick={() => roomTurn.current?.(-1)}
              aria-label="Rotate room 45 degrees left"
            >
              ←
            </button>
            <button
              className="room-turn room-turn--right"
              type="button"
              onClick={() => roomTurn.current?.(1)}
              aria-label="Rotate room 45 degrees right"
            >
              →
            </button>
          </>
        </>
      )}
      {draft.templateId === "pavilion" &&
        (arranging || (visitor && viewMode === "overview")) && (
          <nav
            className="pavilion-zone-nav"
            aria-label="Grand Forum camera zones"
          >
            <div className="pavilion-zone-nav__heading">
              <span>Grand Forum map</span>
              <small>Jump to zone</small>
            </div>
            <div
              className="pavilion-zone-map"
              role="group"
              aria-label="Choose a Forum camera zone"
            >
              {PAVILION_ZONES.map((zone) => (
                <button
                  key={zone.id}
                  type="button"
                  data-zone={zone.id}
                  className={activePavilionZone === zone.id ? "active" : ""}
                  aria-pressed={activePavilionZone === zone.id}
                  aria-label={`Jump camera to ${zone.label}`}
                  title={zone.label}
                  onClick={() => {
                    setActivePavilionZone(zone.id);
                    runtime.current?.focusPavilionZone(zone.id);
                  }}
                >
                  <span>{zone.shortLabel}</span>
                </button>
              ))}
            </div>
            <p>Five camera zones · one Project</p>
          </nav>
        )}
      <div className="scene-hint">
        <span className="movement-hint__desktop">
          {visitor
            ? viewMode === "walk"
              ? `${VISITOR_KEYBOARD_HINT} · Drag to look`
              : "Dollhouse overview · Walls fade as you orbit · Scroll or pinch to zoom"
            : editorMode === "walk"
              ? `Walk preview · ${VISITOR_KEYBOARD_HINT} · Click floor to move`
              : selectedDecorId
                ? "Drag object · Click floor to place · Camera stays here"
                : selectedId
                  ? "Choose wall → click to place → drag to refine"
                  : draft.templateId === "pavilion"
                    ? "Forum arrange · Use map to jump · Right-drag to pan · Scroll to zoom"
                    : editorCutaway
                      ? "Open-roof arrange view · Drag to orbit · Scroll or pinch to zoom"
                      : "Ceiling preview · Drag to orbit · Scroll or pinch to zoom"}
        </span>
        <span className="movement-hint__mobile">
          {visitor || editorMode === "walk"
            ? "Drag to look · Tap floor to walk · Pinch to zoom"
            : selectedDecorId
              ? "Drag object · Tap floor to place"
              : selectedId
                ? "Choose wall · Tap to place · Drag to refine"
                : draft.templateId === "pavilion"
                  ? "Use map to jump · Drag to orbit · Pinch to zoom"
                  : "Drag to orbit · Pinch to zoom"}
        </span>
      </div>
    </div>
  );
}

export const GalleryScene = memo(
  GallerySceneRenderer,
  (previous, next) =>
    sceneDraftKey(previous.draft, previous.visitor ?? false) ===
      sceneDraftKey(next.draft, next.visitor ?? false) &&
    previous.selectedId === next.selectedId &&
    previous.selectedDecorId === next.selectedDecorId &&
    previous.focusWall?.token === next.focusWall?.token &&
    previous.focusWall?.wall === next.focusWall?.wall &&
    previous.focusArtwork?.token === next.focusArtwork?.token &&
    previous.focusArtwork?.id === next.focusArtwork?.id &&
    previous.onSelect === next.onSelect &&
    previous.onSelectDecor === next.onSelectDecor &&
    previous.onMoveDecor === next.onMoveDecor &&
    previous.onMoveArtwork === next.onMoveArtwork &&
    previous.onViewPlacementChange === next.onViewPlacementChange &&
    previous.visitor === next.visitor &&
    previous.viewMode === next.viewMode &&
    previous.playIntro === next.playIntro &&
    previous.onIntroComplete === next.onIntroComplete &&
    previous.onArtworkFocus === next.onArtworkFocus &&
    previous.onCaptureReady === next.onCaptureReady &&
    previous.onViewModeChange === next.onViewModeChange &&
    previous.onEditorModeChange === next.onEditorModeChange &&
    previous.artworkCount === next.artworkCount &&
    previous.artworkDirectoryExpanded === next.artworkDirectoryExpanded &&
    previous.artworkDirectoryUnavailable === next.artworkDirectoryUnavailable &&
    previous.artworkButtonRef === next.artworkButtonRef &&
    previous.onOpenArtworkDirectory === next.onOpenArtworkDirectory,
);

export interface DannyDemoSceneProps {
  viewMode?: GalleryViewMode;
  playIntro?: boolean;
  onIntroComplete?: () => void;
  onArtworkFocus?: (artwork: ArtworkFocusInfo | null) => void;
  onLoadProgress?: (progress: number) => void;
  onViewModeChange?: (mode: GalleryViewMode) => void;
  artworkCount?: number;
  artworkDirectoryExpanded?: boolean;
  artworkDirectoryUnavailable?: boolean;
  artworkButtonRef?: RefObject<HTMLButtonElement | null>;
  onOpenArtworkDirectory?: () => void;
}

type DannyViewAnchor = {
  object: THREE.Object3D;
  id: string;
  label: string;
  kind: string;
  order: number;
  targetName?: string;
};

type DannyRouteWaypoint = {
  object: THREE.Object3D;
  routeId: string;
  order: number;
};
type DannyTourPose = {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  label: string;
  isView: boolean;
};
type DannyActiveTour = {
  startedAt: number;
  duration: number;
  poses: DannyTourPose[];
  weights: number[];
  totalWeight: number;
  segment: number;
  pausedAt?: number;
  lastUiUpdate: number;
};
type DannyDemoRuntime = {
  setMode: (mode: GalleryViewMode) => void;
  startGuidedTour: () => void;
  skipGuidedTour: () => void;
  pauseOrResumeGuidedTour: () => void;
  stepGuidedTour: (direction: -1 | 1) => void;
  smartView: () => void;
  resetView: () => void;
};

const DANNY_GUIDED_TOUR_DURATION_MS = 45_000;

export function DannyDemoScene({
  viewMode = "walk",
  playIntro = false,
  onIntroComplete,
  onArtworkFocus,
  onLoadProgress,
  onViewModeChange,
  artworkCount,
  artworkDirectoryExpanded,
  artworkDirectoryUnavailable,
  artworkButtonRef,
  onOpenArtworkDirectory,
}: DannyDemoSceneProps) {
  const host = useRef<HTMLDivElement>(null);
  const introPlayed = useRef(false);
  const modeRuntime = useRef<DannyDemoRuntime | null>(null);
  const latest = useRef({
    viewMode,
    playIntro,
    onIntroComplete,
    onArtworkFocus,
    onLoadProgress,
    onViewModeChange,
  });
  const [sceneReady, setSceneReady] = useState(false);
  const [tourState, setTourState] = useState<VisitorTourState>(IDLE_VISITOR_TOUR);
  const [smartViewLabel, setSmartViewLabel] = useState("Authored views");
  useEffect(() => {
    latest.current = {
      viewMode,
      playIntro,
      onIntroComplete,
      onArtworkFocus,
      onLoadProgress,
      onViewModeChange,
    };
  }, [
    viewMode,
    playIntro,
    onIntroComplete,
    onArtworkFocus,
    onLoadProgress,
    onViewModeChange,
  ]);
  useEffect(() => {
    if (!host.current) return;
    const element = host.current;
    const initial = latest.current;
    let mode = initial.viewMode;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0e100e");
    const quality = getRenderQuality();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const camera = new THREE.PerspectiveCamera(
      mode === "walk" ? 62 : 46,
      1,
      0.04,
      120,
    );
    camera.position.set(0, VISITOR_EYE_HEIGHT, 4.8);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: quality.antialias,
        powerPreference:
          quality.tier === "low" ? "default" : "high-performance",
      });
    } catch {
      trackTelemetry("three_runtime_health", { runtime: "danny", outcome: "renderer_failed" });
      return showSceneError(element);
    }
    const handleDannyContextLost = (event: Event) => {
      event.preventDefault();
      trackTelemetry("three_runtime_health", { runtime: "danny", outcome: "context_lost" });
    };
    const handleDannyContextRestored = () =>
      trackTelemetry("three_runtime_health", { runtime: "danny", outcome: "context_restored" });
    renderer.domElement.addEventListener("webglcontextlost", handleDannyContextLost);
    renderer.domElement.addEventListener("webglcontextrestored", handleDannyContextRestored);
    renderer.setPixelRatio(quality.dpr);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure =
      quality.tier === "low" ? 1.04 : quality.tier === "high" ? 0.96 : 1;
    renderer.shadowMap.enabled = quality.tier !== "low";
    renderer.shadowMap.type = THREE.PCFShadowMap;
    configureSceneCanvas(
      renderer.domElement,
      "Danny Hirsch virtual exhibition. Focus this view to use keyboard movement.",
    );
    renderer.domElement.dataset.sceneCanvas = "danny";
    element.dataset.visitorEyeHeight = String(VISITOR_EYE_HEIGHT);
    element.dataset.quality = quality.tier;
    element.dataset.motion = reducedMotion.matches ? "reduced" : "full";
    element.dataset.rendererPersistent = "true";
    element.dataset.guidedTour = "idle";
    element.dataset.tourAutoplay =
      quality.tier === "low" ? "disabled-low-tier" : "disabled";
    element.dataset.tourDuration = String(DANNY_GUIDED_TOUR_DURATION_MS);
    element.dataset.lightingPreset = "pitch-neutral-v3";
    element.dataset.toneMappingExposure =
      renderer.toneMappingExposure.toFixed(2);
    element.appendChild(renderer.domElement);

    const roomEnvironment = new RoomEnvironment();
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const environment = pmremGenerator.fromScene(roomEnvironment, 0.04).texture;
    roomEnvironment.dispose();
    pmremGenerator.dispose();
    scene.environment = environment;
    scene.environmentIntensity =
      quality.tier === "low" ? 0.58 : quality.tier === "high" ? 0.74 : 0.68;
    element.dataset.environmentIntensity =
      scene.environmentIntensity.toFixed(2);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.target.set(0, 2.35, 3.5);
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.minDistance = 8;
    controls.maxDistance = 44;
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.zoomSpeed = 0.7;
    controls.zoomToCursor = true;
    controls.touches.ONE = THREE.TOUCH.ROTATE;
    controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    controls.autoRotate = false;
    scene.add(
      new THREE.AmbientLight(
        "#fffdf8",
        quality.tier === "low" ? 0.46 : 0.38,
      ),
      new THREE.HemisphereLight(
        "#f5f2ea",
        "#242622",
        quality.tier === "low" ? 0.64 : 0.55,
      ),
    );

    let bounds: Bounds = { minX: -7, maxX: 7, minZ: -8, maxZ: 16 };
    let collision = createPlanarCollisionSystem([]);
    let onDannyWalkIntent = () => undefined;
    let onDannyWalkEscape = () => undefined;
    const navigation = createFirstPersonWalk(
      camera,
      renderer.domElement,
      () => bounds,
      (next, previous) => collision.resolve(next, previous),
      (from, to) => collision.findPath(from, to),
      () => onDannyWalkIntent(),
      () => onDannyWalkEscape(),
    );
    navigation.setEnabled(false);
    let destroyed = false;
    let loaded = false;
    let demoModel: THREE.Object3D | null = null;
    let intro: ReturnType<typeof createCinematicIntro> | null = null;
    let modelErrorCleanup: (() => void) | null = null;
    let mixer: THREE.AnimationMixer | null = null;
    let previousFrame = performance.now();
    let modeTransition: ModeTransition | null = null;
    let activeTour: DannyActiveTour | null = null;
    let smartViewIndex = -1;
    let viewAnchors: DannyViewAnchor[] = [];
    let routeWaypoints: DannyRouteWaypoint[] = [];
    let tourPoses: DannyTourPose[] = [];
    let effectiveQualityTier = quality.tier;
    let authoredLights: THREE.Light[] = [];
    element.dataset.dollhouse = mode === "walk" ? "inactive" : "active";

    type MaterialSnapshot = {
      transparent: boolean;
      opacity: number;
      depthWrite: boolean;
      side: THREE.Side;
    };
    const status = createSceneStatus(element, "Loading exhibition — 0%");
    const artworkHitObjects: THREE.Object3D[] = [];
    const artworkHotspots: Array<{
      object: THREE.Object3D;
      focusAnchor: THREE.Object3D;
      info: ArtworkFocusInfo;
    }> = [];
    const floorObjects: THREE.Object3D[] = [];
    const artworkTargets: THREE.Object3D[] = [];
    const colliderNodes: THREE.Object3D[] = [];
    const viewNodes: THREE.Object3D[] = [];
    const routeNodes: THREE.Object3D[] = [];
    const applyAuthoredLightBudget = () => {
      const selection = selectDannyAuthoredLights(
        authoredLights,
        effectiveQualityTier,
      );
      authoredLights.forEach((light) => {
        light.castShadow = false;
      });
      const shadowLight =
        effectiveQualityTier === "low"
          ? undefined
          : selection.active.find(
              (light) =>
                (light as THREE.SpotLight).isSpotLight ||
                (light as THREE.DirectionalLight).isDirectionalLight,
            );
      if (shadowLight) {
        shadowLight.castShadow = true;
        const shadow = (
          shadowLight as THREE.Light & { shadow?: THREE.LightShadow }
        ).shadow;
        if (shadow) {
          const size = effectiveQualityTier === "high" ? 1024 : 512;
          shadow.mapSize.set(size, size);
          shadow.bias = -0.00035;
          shadow.normalBias = 0.028;
        }
      }
      element.dataset.activeAuthoredLights = String(selection.active.length);
      element.dataset.authoredLightBudget = String(selection.budget);
      element.dataset.shadowLight = shadowLight?.name || "environment-only";
      return selection.active.length;
    };
    const ceilingObjects = new Set<THREE.Object3D>();
    const wallMaterials = new Map<THREE.Material, MaterialSnapshot>();
    const overviewOccluderMaterials = new Map<
      THREE.Material,
      MaterialSnapshot
    >();
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const lookMatrix = new THREE.Matrix4();
    const walkMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.18, 0.25, 32),
      new THREE.MeshBasicMaterial({
        color: "#d9ff43",
        transparent: true,
        opacity: 0.78,
        side: THREE.DoubleSide,
      }),
    );
    walkMarker.rotation.x = -Math.PI / 2;
    walkMarker.visible = false;
    walkMarker.userData.noWalkCollision = true;
    scene.add(walkMarker);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(34, 42),
      new THREE.MeshBasicMaterial({
        color: "#171a17",
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.045, 4);
    ground.visible = mode === "overview";
    ground.userData.noWalkCollision = true;
    scene.add(ground);
    const walkState = {
      position: new THREE.Vector3(0, VISITOR_EYE_HEIGHT, 4.8),
      quaternion: camera.quaternion.clone(),
      fov: 62,
    };
    const overviewState = {
      position: new THREE.Vector3(16.5, 14.5, 24),
      quaternion: new THREE.Quaternion(),
      fov: 46,
    };
    const overviewTarget = new THREE.Vector3(0, 2.35, 3.5);
    camera.position.copy(overviewState.position);
    camera.lookAt(overviewTarget);
    overviewState.quaternion.copy(camera.quaternion);
    camera.position.copy(walkState.position);
    camera.quaternion.copy(walkState.quaternion);

    const quaternionForLook = (
      position: THREE.Vector3,
      target: THREE.Vector3,
    ) =>
      new THREE.Quaternion().setFromRotationMatrix(
        lookMatrix.lookAt(position, target, camera.up),
      );
    const applyPresentation = () => {
      const overview = mode === "overview";
      ground.visible = overview;
      ceilingObjects.forEach((object) => {
        object.visible = !overview;
      });
      wallMaterials.forEach((snapshot, material) => {
        material.transparent = overview ? true : snapshot.transparent;
        material.opacity = overview ? 0.09 : snapshot.opacity;
        material.depthWrite = overview ? false : snapshot.depthWrite;
        material.side = snapshot.side;
        material.needsUpdate = true;
      });
      overviewOccluderMaterials.forEach((snapshot, material) => {
        material.transparent = overview ? true : snapshot.transparent;
        material.opacity = overview ? 0.16 : snapshot.opacity;
        material.depthWrite = overview ? false : snapshot.depthWrite;
        material.side = overview ? THREE.DoubleSide : snapshot.side;
        material.needsUpdate = true;
      });
    };
    const resumeInteraction = () => {
      if (mode === "overview") {
        navigation.setEnabled(false);
        controls.target.copy(overviewTarget);
        controls.enabled = loaded;
        controls.update();
      } else {
        controls.enabled = false;
        navigation.syncFromCamera();
        navigation.setEnabled(loaded);
        renderer.domElement.focus({ preventScroll: true });
      }
    };
    const setGuidedTourState = (
      playing: boolean,
      result = playing ? "playing" : "idle",
    ) => {
      element.dataset.guidedTour = playing ? "playing" : "idle";
      element.dataset.lastTourResult = result;
      if (!destroyed) {
        if (!playing) setTourState(IDLE_VISITOR_TOUR);
      }
    };
    const publishDannyTourState = (
      status: VisitorTourState["status"],
      progress: number,
      poseIndex: number,
    ) => {
      if (destroyed || !tourPoses.length) return;
      const pose = tourPoses[THREE.MathUtils.clamp(poseIndex, 0, tourPoses.length - 1)];
      const viewPoses = tourPoses.filter((candidate) => candidate.isView);
      const currentStop = Math.max(
        1,
        tourPoses.slice(0, poseIndex + 1).filter((candidate) => candidate.isView).length,
      );
      setTourState({
        status,
        progress,
        currentLabel: pose.label,
        currentStop: Math.min(viewPoses.length, currentStop),
        stopCount: viewPoses.length,
      });
      element.dataset.guidedTour = status;
      element.dataset.tourStop = pose.label;
    };
    const stopGuidedTour = (
      result: "skipped" | "completed" | "mode-change" | "reset" = "skipped",
    ) => {
      if (!activeTour) return;
      activeTour = null;
      if (mode === "walk") {
        walkState.position.copy(camera.position);
        walkState.quaternion.copy(camera.quaternion);
        walkState.fov = camera.fov;
      }
      setGuidedTourState(false, result);
      resumeInteraction();
    };
    const progressForDannyPose = (poseIndex: number) => {
      if (!activeTour || poseIndex <= 0) return 0;
      const distance = activeTour.weights
        .slice(0, Math.min(poseIndex, activeTour.weights.length))
        .reduce((sum, weight) => sum + weight, 0);
      return distance / Math.max(activeTour.totalWeight, 0.001);
    };
    const pauseOrResumeGuidedTour = () => {
      if (!activeTour) return;
      const now = performance.now();
      if (activeTour.pausedAt !== undefined) {
        activeTour.startedAt += now - activeTour.pausedAt;
        activeTour.pausedAt = undefined;
        navigation.setEnabled(false);
        controls.enabled = false;
        publishDannyTourState(
          "playing",
          THREE.MathUtils.clamp((now - activeTour.startedAt) / activeTour.duration, 0, 1),
          Math.max(0, activeTour.segment + 1),
        );
      } else {
        activeTour.pausedAt = now;
        resumeInteraction();
        publishDannyTourState(
          "paused",
          THREE.MathUtils.clamp((now - activeTour.startedAt) / activeTour.duration, 0, 1),
          Math.max(0, activeTour.segment + 1),
        );
      }
    };
    const stepGuidedTour = (direction: -1 | 1) => {
      if (!activeTour) return;
      const viewIndices = activeTour.poses
        .map((pose, index) => (pose.isView ? index : -1))
        .filter((index) => index >= 0);
      if (!viewIndices.length) return;
      const currentPose = Math.max(0, activeTour.segment + 1);
      const currentView = Math.max(
        0,
        viewIndices.findIndex((index) => index >= currentPose),
      );
      const targetView = THREE.MathUtils.clamp(currentView + direction, 0, viewIndices.length - 1);
      const poseIndex = viewIndices[targetView];
      const pose = activeTour.poses[poseIndex];
      const progress = progressForDannyPose(poseIndex);
      camera.position.copy(pose.position);
      camera.quaternion.copy(pose.quaternion);
      camera.fov = 58;
      camera.updateProjectionMatrix();
      activeTour.segment = Math.max(-1, poseIndex - 1);
      activeTour.startedAt = performance.now() - progress * activeTour.duration;
      activeTour.pausedAt = performance.now();
      resumeInteraction();
      publishDannyTourState("paused", progress, poseIndex);
    };
    const transitionToPose = (
      position: THREE.Vector3,
      quaternion: THREE.Quaternion,
      fov: number,
      overviewFocus?: THREE.Vector3,
    ) => {
      element.dataset.motion = reducedMotion.matches ? "reduced" : "full";
      controls.enabled = false;
      navigation.setEnabled(false);
      modeTransition = null;
      const finish = () => {
        camera.position.copy(position);
        camera.quaternion.copy(quaternion);
        camera.fov = fov;
        camera.updateProjectionMatrix();
        if (overviewFocus) overviewTarget.copy(overviewFocus);
        if (mode === "walk") {
          walkState.position.copy(camera.position);
          walkState.quaternion.copy(camera.quaternion);
          walkState.fov = camera.fov;
        } else {
          overviewState.position.copy(camera.position);
          overviewState.quaternion.copy(camera.quaternion);
          overviewState.fov = camera.fov;
        }
        modeTransition = null;
        resumeInteraction();
      };
      if (reducedMotion.matches) {
        finish();
        return;
      }
      modeTransition = {
        startedAt: performance.now(),
        fromPosition: camera.position.clone(),
        toPosition: position.clone(),
        fromQuaternion: camera.quaternion.clone(),
        toQuaternion: quaternion.clone(),
        fromFov: camera.fov,
        toFov: fov,
        finish,
      };
    };
    const anchorPosition = (anchor: DannyViewAnchor) => {
      const position = anchor.object.getWorldPosition(new THREE.Vector3());
      if (mode === "walk")
        position.y = Number(
          anchor.object.userData.eye_height || position.y || VISITOR_EYE_HEIGHT,
        );
      return position;
    };
    const anchorQuaternion = (
      anchor: DannyViewAnchor,
      position: THREE.Vector3,
    ) => {
      const target = anchor.targetName
        ? demoModel?.getObjectByName(anchor.targetName)
        : anchor.kind === "entrance"
          ? demoModel?.getObjectByName("Walk_LookTarget")
          : null;
      if (target)
        return quaternionForLook(
          position,
          target.getWorldPosition(new THREE.Vector3()),
        );
      return anchor.object.getWorldQuaternion(new THREE.Quaternion());
    };
    const focusAnchor = (anchor: DannyViewAnchor) => {
      const authoredPosition = anchorPosition(anchor);
      if (mode === "overview") {
        const focus = authoredPosition.clone();
        focus.y = Math.max(0.8, focus.y);
        const offset = camera.position.clone().sub(controls.target);
        if (offset.lengthSq() < 16) offset.set(16.5, 12.6, 20.5);
        const distance = THREE.MathUtils.clamp(offset.length(), 11, 34);
        offset.normalize().multiplyScalar(distance);
        const position = focus.clone().add(offset);
        transitionToPose(
          position,
          quaternionForLook(position, focus),
          46,
          focus,
        );
      } else {
        transitionToPose(
          authoredPosition,
          anchorQuaternion(anchor, authoredPosition),
          58,
        );
      }
      element.dataset.smartView = anchor.id;
      element.dataset.smartViewLabel = anchor.label;
      setSmartViewLabel(anchor.label);
    };
    const smartView = () => {
      if (!loaded || !viewAnchors.length) return;
      intro?.skip();
      intro = null;
      stopGuidedTour("skipped");
      latest.current.onArtworkFocus?.(null);
      walkMarker.visible = false;
      const candidates = viewAnchors.filter(
        (anchor) => anchor.kind !== "entrance" && anchor.kind !== "overview",
      );
      if (!candidates.length) return;
      smartViewIndex = (smartViewIndex + 1) % candidates.length;
      focusAnchor(candidates[smartViewIndex]);
    };
    const resetView = () => {
      if (!loaded) return;
      intro?.skip();
      intro = null;
      stopGuidedTour("reset");
      latest.current.onArtworkFocus?.(null);
      walkMarker.visible = false;
      smartViewIndex = -1;
      setSmartViewLabel("Authored views");
      element.dataset.smartView = "reset";
      if (mode === "walk") {
        const entrance = viewAnchors.find(
          (anchor) => anchor.kind === "entrance" || anchor.id === "entrance",
        );
        if (entrance) {
          focusAnchor(entrance);
          return;
        }
        transitionToPose(walkState.position, walkState.quaternion, 62);
        return;
      }
      const overviewAnchor = viewAnchors.find(
        (anchor) => anchor.kind === "overview" || anchor.id === "overview",
      );
      const focus = overviewAnchor
        ? overviewAnchor.object.getWorldPosition(new THREE.Vector3())
        : new THREE.Vector3(0, 2.35, 3.5);
      overviewTarget.copy(focus);
      const position = new THREE.Vector3(16.5, 14.5, 24);
      transitionToPose(position, quaternionForLook(position, focus), 46, focus);
    };
    const startGuidedTour = () => {
      if (!loaded || mode !== "walk" || tourPoses.length < 2 || activeTour)
        return;
      element.dataset.motion = reducedMotion.matches ? "reduced" : "full";
      intro?.skip();
      intro = null;
      latest.current.onArtworkFocus?.(null);
      walkMarker.visible = false;
      navigation.setEnabled(false);
      controls.enabled = false;
      modeTransition = null;
      if (reducedMotion.matches) {
        const featured =
          tourPoses.find((pose) => /wARTrobe/i.test(pose.label)) ??
          tourPoses[tourPoses.length - 1];
        camera.position.copy(featured.position);
        camera.quaternion.copy(featured.quaternion);
        camera.fov = 58;
        camera.updateProjectionMatrix();
        walkState.position.copy(camera.position);
        walkState.quaternion.copy(camera.quaternion);
        walkState.fov = camera.fov;
        element.dataset.smartViewLabel = featured.label;
        element.dataset.lastTourResult = "reduced-instant";
        setSmartViewLabel(featured.label);
        setGuidedTourState(false, "reduced-instant");
        resumeInteraction();
        return;
      }
      camera.position.copy(tourPoses[0].position);
      camera.quaternion.copy(tourPoses[0].quaternion);
      camera.fov = 58;
      camera.updateProjectionMatrix();
      const weights = tourPoses
        .slice(1)
        .map(
          (pose, index) =>
            Math.max(
              0.65,
              pose.position.distanceTo(tourPoses[index].position),
            ) + (pose.isView ? 1.45 : 0),
        );
      activeTour = {
        startedAt: performance.now(),
        duration: DANNY_GUIDED_TOUR_DURATION_MS,
        poses: tourPoses,
        weights,
        totalWeight: weights.reduce((sum, weight) => sum + weight, 0),
        segment: -1,
        lastUiUpdate: 0,
      };
      setGuidedTourState(true);
      publishDannyTourState("playing", 0, 0);
    };
    const setMode = (nextMode: GalleryViewMode) => {
      if (nextMode === mode) return;
      intro?.skip();
      intro = null;
      stopGuidedTour("mode-change");
      latest.current.onArtworkFocus?.(null);
      walkMarker.visible = false;
      if (mode === "walk") {
        walkState.position.copy(camera.position);
        walkState.quaternion.copy(camera.quaternion);
        walkState.fov = camera.fov;
      } else {
        overviewState.position.copy(camera.position);
        overviewState.quaternion.copy(camera.quaternion);
        overviewState.fov = camera.fov;
      }
      mode = nextMode;
      applyPresentation();
      element.dataset.dollhouse = mode === "overview" ? "active" : "inactive";
      controls.enabled = false;
      navigation.setEnabled(false);
      const target = mode === "walk" ? walkState : overviewState;
      const finish = () => {
        camera.position.copy(target.position);
        camera.quaternion.copy(target.quaternion);
        camera.fov = target.fov;
        camera.updateProjectionMatrix();
        modeTransition = null;
        resumeInteraction();
      };
      if (reducedMotion.matches) {
        finish();
        return;
      }
      modeTransition = {
        startedAt: performance.now(),
        fromPosition: camera.position.clone(),
        toPosition: target.position.clone(),
        fromQuaternion: camera.quaternion.clone(),
        toQuaternion: target.quaternion.clone(),
        fromFov: camera.fov,
        toFov: target.fov,
        finish,
      };
    };
    onDannyWalkIntent = () => {
      if (activeTour && activeTour.pausedAt === undefined)
        pauseOrResumeGuidedTour();
    };
    onDannyWalkEscape = () => {
      if (activeTour) stopGuidedTour("skipped");
      else latest.current.onViewModeChange?.("overview");
    };
    modeRuntime.current = {
      setMode,
      startGuidedTour,
      skipGuidedTour: () => stopGuidedTour("skipped"),
      pauseOrResumeGuidedTour,
      stepGuidedTour,
      smartView,
      resetView,
    };
    if (mode === "overview") {
      camera.position.copy(overviewState.position);
      camera.quaternion.copy(overviewState.quaternion);
      camera.fov = 46;
      controls.enabled = true;
    } else controls.enabled = false;
    camera.updateProjectionMatrix();

    const screenSpaceArtworkHit = (
      event: PointerEvent,
      canvasBounds: DOMRect,
    ) => {
      const padding =
        event.pointerType === "touch" ||
        window.matchMedia("(pointer: coarse)").matches
          ? 34
          : 20;
      let best: {
        object: THREE.Object3D;
        focusAnchor: THREE.Object3D;
        info: ArtworkFocusInfo;
        score: number;
      } | null = null;
      const worldBounds = new THREE.Box3();
      const worldCenter = new THREE.Vector3();
      const projected = new THREE.Vector3();
      const corner = new THREE.Vector3();
      for (const hotspot of artworkHotspots) {
        worldBounds.setFromObject(hotspot.object, true);
        if (worldBounds.isEmpty()) continue;
        worldBounds.getCenter(worldCenter);
        projected.copy(worldCenter).project(camera);
        if (projected.z < -1 || projected.z > 1) continue;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (let x = 0; x < 2; x += 1)
          for (let y = 0; y < 2; y += 1)
            for (let z = 0; z < 2; z += 1) {
              corner
                .set(
                  x ? worldBounds.max.x : worldBounds.min.x,
                  y ? worldBounds.max.y : worldBounds.min.y,
                  z ? worldBounds.max.z : worldBounds.min.z,
                )
                .project(camera);
              const screenX =
                (corner.x + 1) * 0.5 * canvasBounds.width + canvasBounds.left;
              const screenY =
                (1 - corner.y) * 0.5 * canvasBounds.height + canvasBounds.top;
              minX = Math.min(minX, screenX);
              maxX = Math.max(maxX, screenX);
              minY = Math.min(minY, screenY);
              maxY = Math.max(maxY, screenY);
            }
        if (
          event.clientX < minX - padding ||
          event.clientX > maxX + padding ||
          event.clientY < minY - padding ||
          event.clientY > maxY + padding
        )
          continue;
        const edgeX = Math.max(minX - event.clientX, 0, event.clientX - maxX);
        const edgeY = Math.max(minY - event.clientY, 0, event.clientY - maxY);
        const score =
          (edgeX * edgeX + edgeY * edgeY) * 10 +
          camera.position.distanceToSquared(worldCenter);
        if (!best || score < best.score) best = { ...hotspot, score };
      }
      return best;
    };
    const handlePointer = (event: PointerEvent) => {
      if (activeTour || modeTransition) return;
      const box = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - box.left) / box.width) * 2 - 1,
        -((event.clientY - box.top) / box.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const artHit = raycaster.intersectObjects(artworkHitObjects, true)[0];
      let focusNode: THREE.Object3D | null = artHit?.object ?? null;
      while (focusNode && !focusNode.userData.focusInfo)
        focusNode = focusNode.parent;
      const fallback = focusNode ? null : screenSpaceArtworkHit(event, box);
      const info =
        (focusNode?.userData.focusInfo as ArtworkFocusInfo | undefined) ??
        fallback?.info;
      if (info) {
        latest.current.onArtworkFocus?.(info);
        element.dataset.artworkHitMode = focusNode
          ? "raycast"
          : "screen-fallback";
        element.dataset.lastArtworkHit = info.id;
        return;
      }
      element.dataset.artworkHitMode = "none";
      if (mode !== "walk" || !navigation.consumeClick()) return;
      const floorHit = raycaster.intersectObjects(floorObjects, true)[0];
      if (floorHit) {
        latest.current.onArtworkFocus?.(null);
        if (navigation.moveTo(floorHit.point)) {
          walkMarker.position.copy(floorHit.point);
          walkMarker.position.y += 0.02;
          walkMarker.visible = true;
        }
      }
    };
    renderer.domElement.addEventListener("click", handlePointer);

    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const dannyMarbleTexture = new THREE.TextureLoader().load(
      publicAssetUrl("./assets/materials/aura-nero-marquina-v2.webp"),
    );
    dannyMarbleTexture.flipY = false;
    dannyMarbleTexture.wrapS = dannyMarbleTexture.wrapT = THREE.RepeatWrapping;
    dannyMarbleTexture.colorSpace = THREE.SRGBColorSpace;
    dannyMarbleTexture.anisotropy = Math.min(
      renderer.capabilities.getMaxAnisotropy(),
      quality.tier === "low" ? 2 : 4,
    );
    const modelUrl =
      quality.tier === "low"
        ? publicAssetUrl("./assets/demo/danny-gallery-mobile.glb")
        : publicAssetUrl("./assets/demo/danny-gallery.glb");
    element.dataset.modelVariant = quality.tier === "low" ? "mobile" : "full";
    element.dataset.meshoptWorkers = String(ensureMeshoptWorkers());
    loader.load(
      modelUrl,
      (gltf) => {
        if (destroyed) {
          disposeObjectTree(gltf.scene);
          return;
        }
        demoModel = gltf.scene;
        scene.add(demoModel);
        demoModel.updateMatrixWorld(true);
        let hiddenCatalogueLabels = 0;
        let maxAuthoredLightIntensity = 0;
        authoredLights = [];
        const detectedArtworks: Array<{
          object: THREE.Object3D;
          info: ArtworkFocusInfo;
        }> = [];
        gltf.scene.traverse((object) => {
          const metadata = object.userData as Record<string, unknown>;
          const navigationRole = String(
            metadata.navigation_role ?? "",
          ).toLowerCase();
          const assetRole = String(metadata.asset_role ?? "").toLowerCase();
          const isCollider =
            object.name.startsWith("COLLIDER_") ||
            navigationRole === "collider" ||
            metadata.kind === "aabb";
          const isViewAnchor =
            navigationRole === "view_anchor" || metadata.kind === "view";
          const isRouteWaypoint =
            navigationRole === "clear_route_waypoint" ||
            /^route_/i.test(object.name);
          const isViewNode = isViewAnchor || isRouteWaypoint;
          if (isViewAnchor) viewNodes.push(object);
          if (isRouteWaypoint) routeNodes.push(object);
          const isCatalogueLabel = /^catalogue_label_/i.test(object.name);
          if (
            (object as THREE.Camera).isCamera ||
            isCollider ||
            isViewNode ||
            isCatalogueLabel
          )
            object.visible = false;
          if (isCatalogueLabel) hiddenCatalogueLabels += 1;
          if (isCollider && metadata.demo_hidden !== true)
            colliderNodes.push(object);
          if ((object as THREE.Light).isLight) {
            const light = object as THREE.Light;
            authoredLights.push(light);
            light.visible = false;
            normalizeDannyLight(light);
            maxAuthoredLightIntensity = Math.max(
              maxAuthoredLightIntensity,
              light.intensity,
            );
          }
          const mesh = object as THREE.Mesh;
          if (!mesh.isMesh || isCatalogueLabel) return;
          const materials = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material];
          let isArtwork =
            assetRole.includes("genuine_artwork") ||
            assetRole.includes("genuine_wartrobe") ||
            /^surface_detail_|^wartrobe_genuine/i.test(object.name);
          let isFloor = false;
          materials.forEach((raw) => {
            const material = raw as THREE.MeshStandardMaterial;
            const name = `${object.name} ${material.name}`.toLowerCase();
            const metadataRole = String(
              metadata.theme_role || material.userData?.theme_role || "",
            ).toLowerCase();
            const isCeiling =
              metadataRole === "ceiling" || /ceiling|roof/.test(name);
            const isWall = metadataRole === "wall" || /(^|_)wall/.test(name);
            const isOverviewOccluder = /door|backing|recess|partition/.test(
              `${name} ${metadataRole}`,
            );
            isArtwork ||=
              metadataRole === "artwork" ||
              /surface_detail|artwork|wartrobe_genuine/.test(name);
            isFloor ||= metadataRole === "floor" || /floor|ground/.test(name);
            if (isCeiling) ceilingObjects.add(object);
            const snapshot = {
              transparent: material.transparent,
              opacity: material.opacity,
              depthWrite: material.depthWrite,
              side: material.side,
            };
            if (isWall && !wallMaterials.has(material))
              wallMaterials.set(material, snapshot);
            else if (
              isOverviewOccluder &&
              !isArtwork &&
              !overviewOccluderMaterials.has(material)
            )
              overviewOccluderMaterials.set(material, snapshot);
            if (material.emissive) {
              material.emissive.set("#000000");
              material.emissiveIntensity = 0;
            }
            if (isArtwork) {
              material.color?.set("#ffffff");
              if (material.map) {
                material.map.colorSpace = THREE.SRGBColorSpace;
                material.map.needsUpdate = true;
              }
              material.roughness = 0.72;
              material.toneMapped = false;
            } else if (material.color) {
              const floorLike =
                metadataRole === "floor" || /floor|marble|stone/.test(name);
              const polishedMarble =
                /marble|floor_tile|floor_alt|polished/.test(name);
              const bronze =
                metadataRole === "bronze" || /bronze|frame|trim/.test(name);
              material.color.set(
                polishedMarble
                  ? "#ffffff"
                  : floorLike && material.map
                    ? "#0f100f"
                  : floorLike
                    ? "#171817"
                  : isWall
                    ? "#423e38"
                    : isCeiling
                      ? "#22231f"
                      : bronze
                        ? "#896a42"
                        : /leaf|stem|botanical/.test(name)
                          ? "#2b482d"
                          : "#1b1c19",
              );
              if (polishedMarble) material.map = dannyMarbleTexture;
              material.roughness = polishedMarble
                ? quality.tier === "low"
                  ? 0.28
                  : 0.18
                : floorLike
                  ? 0.58
                  : bronze
                    ? 0.34
                    : 0.72;
              material.metalness = polishedMarble
                ? 0.02
                : bronze
                  ? 0.62
                  : material.metalness;
              material.envMapIntensity = polishedMarble
                ? quality.tier === "low"
                  ? 0.72
                  : 1.05
                : bronze
                  ? 1.1
                  : floorLike
                    ? 0.48
                    : 0.28;
              if (
                polishedMarble &&
                material instanceof THREE.MeshPhysicalMaterial
              ) {
                material.clearcoat = quality.tier === "low" ? 0.18 : 0.3;
                material.clearcoatRoughness = 0.12;
              }
              if (material.map) {
                material.map.colorSpace = THREE.SRGBColorSpace;
                material.map.anisotropy = Math.min(
                  renderer.capabilities.getMaxAnisotropy(),
                  quality.tier === "low" ? 2 : 4,
                );
                material.map.needsUpdate = true;
              }
            }
            material.needsUpdate = true;
          });
          mesh.receiveShadow = true;
          mesh.castShadow =
            quality.tier !== "low" &&
            !isArtwork &&
            /frame|bench|vessel|plant|botanical|sculpture|plaque/.test(
              object.name.toLowerCase(),
            );
          if (isArtwork) {
            const info: ArtworkFocusInfo = {
              id: String(metadata.asset_id || object.uuid),
              title: String(
                metadata.title ||
                  metadata.display_label ||
                  object.name.replaceAll("_", " "),
              ),
              artist: "Danny Hirsch",
              description: metadata.description
                ? String(metadata.description)
                : undefined,
              year: metadata.year ? String(metadata.year) : undefined,
              medium: metadata.medium ? String(metadata.medium) : undefined,
              dimensions: metadata.dimensions
                ? String(metadata.dimensions)
                : undefined,
              availability: metadata.availability
                ? String(metadata.availability)
                : undefined,
            };
            object.userData.focusInfo = info;
            detectedArtworks.push({ object, info });
            artworkTargets.push(object);
          }
          if (isFloor) floorObjects.push(object);
        });
        applyAuthoredLightBudget();
        detectedArtworks.forEach(({ object, info }) => {
          const box = new THREE.Box3().setFromObject(object, true);
          if (box.isEmpty()) {
            object.userData.focusAnchor = object;
            artworkHotspots.push({ object, focusAnchor: object, info });
            artworkHitObjects.push(object);
            return;
          }
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          const hitTarget = new THREE.Mesh(
            new THREE.BoxGeometry(
              Math.max(0.44, size.x + 0.46),
              Math.max(0.44, size.y + 0.46),
              Math.max(0.24, size.z + 0.32),
            ),
            new THREE.MeshBasicMaterial({
              transparent: true,
              opacity: 0,
              depthWrite: false,
              colorWrite: false,
            }),
          );
          hitTarget.position.copy(center);
          hitTarget.userData.focusInfo = info;
          hitTarget.userData.focusTarget = object;
          hitTarget.userData.focusAnchor = hitTarget;
          hitTarget.userData.hotspot = "authored-artwork";
          hitTarget.name = `artwork-hit-${info.id}`;
          scene.add(hitTarget);
          artworkHotspots.push({ object, focusAnchor: hitTarget, info });
          artworkHitObjects.push(hitTarget);
        });

        const start =
          gltf.scene.getObjectByName("Walk_Start") ??
          gltf.scene.getObjectByName("VIEW_Entrance");
        const target = gltf.scene.getObjectByName("Walk_LookTarget");
        const minimum = gltf.scene.getObjectByName("Walk_Bounds_Min");
        const maximum = gltf.scene.getObjectByName("Walk_Bounds_Max");
        const overviewAnchor = gltf.scene.getObjectByName("VIEW_Overview");
        if (minimum && maximum) {
          const a = minimum.getWorldPosition(new THREE.Vector3());
          const b = maximum.getWorldPosition(new THREE.Vector3());
          bounds = {
            minX: Math.min(a.x, b.x) + 0.35,
            maxX: Math.max(a.x, b.x) - 0.35,
            minZ: Math.min(a.z, b.z) + 0.35,
            maxZ: Math.max(a.z, b.z) - 0.35,
          };
        }
        collision = createPlanarCollisionSystem(
          planarCollidersFromAuthoredNodes(colliderNodes),
          .36,
          bounds,
        );
        if (start) {
          walkState.position.copy(start.getWorldPosition(new THREE.Vector3()));
          walkState.position.y = Number(
            start.userData.eye_height || VISITOR_EYE_HEIGHT,
          );
        }
        const lookTarget =
          target?.getWorldPosition(new THREE.Vector3()) ??
          new THREE.Vector3(0, 2.4, -2.8);
        const savedPosition = camera.position.clone();
        const savedQuaternion = camera.quaternion.clone();
        camera.position.copy(walkState.position);
        camera.lookAt(lookTarget);
        walkState.quaternion.copy(camera.quaternion);
        if (overviewAnchor)
          overviewTarget.copy(
            overviewAnchor.getWorldPosition(new THREE.Vector3()),
          );
        camera.position.copy(overviewState.position);
        camera.lookAt(overviewTarget);
        overviewState.quaternion.copy(camera.quaternion);
        camera.position.copy(savedPosition);
        camera.quaternion.copy(savedQuaternion);

        viewAnchors = viewNodes
          .map((object) => {
            const metadata = object.userData as Record<string, unknown>;
            const kind = String(metadata.view_kind || "authored");
            const surfaceOrder = Number(metadata.surface_index || 0);
            const authoredOrder = Number(metadata.order);
            const order = Number.isFinite(authoredOrder)
              ? 40 + authoredOrder
              : kind === "surface_detail"
                ? 10 + surfaceOrder
                : kind === "focal_object"
                  ? 20
                  : kind === "demo_room"
                    ? 30
                    : kind === "site_panel"
                      ? 60 +
                        Number(
                          String(metadata.view_id || "").replace(/\D/g, "") ||
                            0,
                        )
                      : kind === "entrance"
                        ? 0
                        : 90;
            return {
              object,
              id: String(
                metadata.view_id ||
                  object.name.replace(/^VIEW_/i, "").toLowerCase(),
              ),
              label: String(
                metadata.view_label || object.name.replaceAll("_", " "),
              ),
              kind,
              order,
              targetName: metadata.target_node
                ? String(metadata.target_node)
                : undefined,
            };
          })
          .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
        routeWaypoints = routeNodes
          .map((object) => ({
            object,
            routeId: String(object.userData.route_id || "route"),
            order: Number(object.userData.route_order || 0),
          }))
          .sort(
            (a, b) => a.routeId.localeCompare(b.routeId) || a.order - b.order,
          );
        const tourSequence: Array<{
          object: THREE.Object3D;
          label: string;
          isView: boolean;
          targetName?: string;
        }> = [];
        const anchorById = new Map(
          viewAnchors.map((anchor) => [anchor.id, anchor]),
        );
        const pushAnchor = (id: string) => {
          const anchor = anchorById.get(id);
          if (anchor)
            tourSequence.push({
              object: anchor.object,
              label: anchor.label,
              isView: true,
              targetName: anchor.targetName,
            });
        };
        const route = (id: string) =>
          routeWaypoints.filter((waypoint) => waypoint.routeId === id);
        const pushRoute = (waypoints: DannyRouteWaypoint[], reverse = false) =>
          (reverse ? [...waypoints].reverse() : waypoints).forEach((waypoint) =>
            tourSequence.push({
              object: waypoint.object,
              label:
                waypoint.routeId === "private-room"
                  ? "Privacy Room"
                  : "Info & Contact Room",
              isView: false,
            }),
          );
        const privateRoute = route("private-room");
        const contactRoute = route("contact-room");
        pushAnchor("entrance");
        pushAnchor("demo_gallery_hall");
        pushAnchor("surface_01");
        pushAnchor("surface_02");
        pushAnchor("surface_03");
        pushAnchor("wartrobe");
        pushAnchor("surface_04");
        pushAnchor("surface_05");
        pushAnchor("surface_06");
        pushAnchor("entrance");
        if (privateRoute.length) {
          pushRoute(privateRoute);
          pushAnchor("demo_private_room");
          pushAnchor("site_03");
          pushRoute(privateRoute, true);
          pushAnchor("entrance");
        }
        if (contactRoute.length) {
          pushRoute(contactRoute);
          pushAnchor("demo_contact_room");
          pushAnchor("site_01");
          pushAnchor("site_02");
          pushAnchor("site_04");
          pushRoute(contactRoute, true);
          pushAnchor("entrance");
        }
        tourPoses = tourSequence.map((step, index) => {
          const position = step.object.getWorldPosition(new THREE.Vector3());
          position.y = step.isView
            ? Number(
                step.object.userData.eye_height ||
                  position.y ||
                  VISITOR_EYE_HEIGHT,
              )
            : VISITOR_EYE_HEIGHT;
          const next =
            tourSequence[
              Math.min(index + 1, tourSequence.length - 1)
            ]?.object.getWorldPosition(new THREE.Vector3()) ?? lookTarget;
          next.y = Math.max(VISITOR_EYE_HEIGHT, next.y);
          const authoredTarget = step.targetName
            ? gltf.scene
                .getObjectByName(step.targetName)
                ?.getWorldPosition(new THREE.Vector3())
            : null;
          const look =
            authoredTarget ??
            (step.object.userData.view_kind === "entrance" ? lookTarget : next);
          return {
            position,
            quaternion: quaternionForLook(position, look),
            label: step.label,
            isView: step.isView,
          };
        });
        loaded = true;
        element.dataset.colliders = String(colliderNodes.length);
        element.dataset.artworkTargets = String(artworkHitObjects.length);
        element.dataset.artworkHotspots = String(artworkHotspots.length);
        element.dataset.artworkHitStrategy = "raycast+screen-space";
        element.dataset.catalogueLabelsHidden = String(hiddenCatalogueLabels);
        element.dataset.overviewOccluders = String(
          overviewOccluderMaterials.size,
        );
        element.dataset.maxAuthoredLightIntensity =
          maxAuthoredLightIntensity.toFixed(2);
        element.dataset.authoredLights = String(authoredLights.length);
        element.dataset.viewAnchors = String(viewAnchors.length);
        element.dataset.routeWaypoints = String(routeWaypoints.length);
        element.dataset.smartViewCount = String(
          viewAnchors.filter(
            (anchor) =>
              anchor.kind !== "entrance" && anchor.kind !== "overview",
          ).length,
        );
        element.dataset.tourStops = String(
          tourPoses.filter((pose) => pose.isView).length,
        );
        applyPresentation();
        if (!reducedMotion.matches && gltf.animations.length) {
          mixer = new THREE.AnimationMixer(gltf.scene);
          gltf.animations
            .filter((clip) => /botanical|water/i.test(clip.name))
            .forEach((clip) => mixer?.clipAction(clip).play());
        }
        if (mode === "walk") {
          camera.position.copy(walkState.position);
          camera.quaternion.copy(walkState.quaternion);
          camera.fov = 62;
          camera.updateProjectionMatrix();
          navigation.syncFromCamera();
          if (
            latest.current.playIntro &&
            quality.tier !== "low" &&
            !introPlayed.current
          ) {
            const width = bounds.maxX - bounds.minX;
            const depth = bounds.maxZ - bounds.minZ;
            const centerX = lookTarget.x;
            const centerZ = (walkState.position.z + lookTarget.z) / 2;
            const radiusX = Math.min(width * 0.28, 4.6);
            const radiusZ = Math.min(
              Math.abs(walkState.position.z - lookTarget.z) * 0.46,
              depth * 0.24,
            );
            const tour = [
              walkState.position.clone().add(new THREE.Vector3(0, 1.15, 0)),
              new THREE.Vector3(
                centerX - radiusX,
                walkState.position.y + 0.95,
                centerZ + radiusZ,
              ),
              new THREE.Vector3(
                centerX - radiusX,
                walkState.position.y + 0.78,
                centerZ - radiusZ,
              ),
              new THREE.Vector3(
                centerX,
                walkState.position.y + 0.88,
                centerZ - radiusZ * 1.08,
              ),
              new THREE.Vector3(
                centerX + radiusX,
                walkState.position.y + 0.68,
                centerZ - radiusZ,
              ),
              new THREE.Vector3(
                centerX + radiusX,
                walkState.position.y + 0.48,
                centerZ + radiusZ,
              ),
              walkState.position.clone(),
            ];
            const tourLooks = [
              lookTarget.clone(),
              new THREE.Vector3(centerX, 2.2, centerZ - radiusZ),
              new THREE.Vector3(centerX + radiusX * 0.35, 2.1, centerZ),
              new THREE.Vector3(centerX, 2.15, centerZ + radiusZ),
              new THREE.Vector3(centerX - radiusX * 0.35, 2.05, centerZ),
              lookTarget.clone(),
              lookTarget.clone(),
            ];
            intro = createCinematicIntro(
              camera,
              { positions: tour, looks: tourLooks, finalLook: lookTarget },
              navigation,
              element,
              () => {
                introPlayed.current = true;
                latest.current.onIntroComplete?.();
              },
              "Featured exhibition",
              "Threshold — Danny Hirsch",
            );
          } else navigation.setEnabled(true);
        } else {
          camera.position.copy(overviewState.position);
          camera.quaternion.copy(overviewState.quaternion);
          camera.fov = 46;
          camera.updateProjectionMatrix();
          controls.target.copy(overviewTarget);
          controls.enabled = true;
          controls.update();
        }
        status.ready("Danny Hirsch exhibition ready");
        setSceneReady(true);
        trackTelemetry("three_milestone", { runtime: "danny", stage: "interactive", quality: quality.tier });
        latest.current.onLoadProgress?.(100);
      },
      (event) => {
        if (!event.total) {
          status.update("Loading exhibition…");
          return;
        }
        const progress = Math.min(99, (event.loaded / event.total) * 100);
        status.update(
          `Loading exhibition — ${Math.round(progress)}%`,
          progress,
        );
        latest.current.onLoadProgress?.(progress);
      },
      () => {
        if (destroyed) return;
        element.dataset.error = "true";
        trackTelemetry("three_runtime_health", { runtime: "danny", outcome: "model_failed" });
        status.update("Exhibition failed to load");
        modelErrorCleanup = showSceneError(
          element,
          "The exhibition model could not be loaded. Please check your connection and try again.",
        );
      },
    );

    const updateMotionPreference = () => {
      element.dataset.motion = reducedMotion.matches ? "reduced" : "full";
      if (!reducedMotion.matches) return;
      intro?.skip();
      if (activeTour && activeTour.pausedAt === undefined) {
        const featured =
          activeTour.poses.find((pose) => /wARTrobe/i.test(pose.label)) ??
          activeTour.poses[activeTour.poses.length - 1];
        camera.position.copy(featured.position);
        camera.quaternion.copy(featured.quaternion);
        camera.fov = 58;
        camera.updateProjectionMatrix();
        activeTour = null;
        setGuidedTourState(false, "reduced-instant");
        resumeInteraction();
      }
      modeTransition?.finish();
    };
    reducedMotion.addEventListener("change", updateMotionPreference);
    let frame = 0;
    const resize = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    const adaptiveDpr = createAdaptiveDpr(renderer, quality, () => {
      trackTelemetry("three_runtime_health", { runtime: "danny", outcome: "quality_downgrade", quality: "low" });
      effectiveQualityTier = "low";
      applyAuthoredLightBudget();
      element.dataset.quality = "low";
      element.dataset.tourAutoplay = "disabled-low-tier";
    }, () => {
      trackTelemetry("three_runtime_health", { runtime: "danny", outcome: "quality_recovery", quality: "balanced" });
      effectiveQualityTier = "balanced";
      applyAuthoredLightBudget();
      element.dataset.quality = "balanced";
      delete element.dataset.tourAutoplay;
    });
    let lastDannyDiagnosticsAt = Number.NEGATIVE_INFINITY;
    let renderRunning = false;
    const renderActivity: ReturnType<typeof observeRenderActivity> = {
      active: () => true,
      dispose: () => undefined,
    };
    const wakeRender = () => {
      if (renderRunning || !renderActivity.active()) return;
      renderRunning = true;
      frame = requestAnimationFrame(animate);
    };
    const animate = (now = performance.now()) => {
      if (!renderActivity.active()) {
        renderRunning = false;
        return;
      }
      const delta = Math.min((now - previousFrame) / 1000, 0.05);
      previousFrame = now;
      intro?.update();
      if (!reducedMotion.matches) mixer?.update(delta);
      if (activeTour && activeTour.pausedAt === undefined) {
        const raw = Math.min(
          1,
          (now - activeTour.startedAt) / activeTour.duration,
        );
        const distance = raw * activeTour.totalWeight;
        let cumulative = 0;
        let segment = activeTour.weights.length - 1;
        for (let index = 0; index < activeTour.weights.length; index += 1) {
          if (distance <= cumulative + activeTour.weights[index]) {
            segment = index;
            break;
          }
          cumulative += activeTour.weights[index];
        }
        const local = activeTour.weights[segment]
          ? THREE.MathUtils.clamp(
              (distance - cumulative) / activeTour.weights[segment],
              0,
              1,
            )
          : 1;
        const from = activeTour.poses[segment];
        const to = activeTour.poses[segment + 1];
        camera.position.lerpVectors(from.position, to.position, local);
        camera.quaternion.slerpQuaternions(
          from.quaternion,
          to.quaternion,
          local,
        );
        camera.fov = 58 + Math.sin(local * Math.PI) * 1.25;
        camera.updateProjectionMatrix();
        if (activeTour.segment !== segment || now - activeTour.lastUiUpdate > 120) {
          activeTour.segment = segment;
          activeTour.lastUiUpdate = now;
          element.dataset.tourStop = to.label;
          setSmartViewLabel(to.label);
          publishDannyTourState("playing", raw, segment + 1);
        }
        if (raw >= 1) stopGuidedTour("completed");
      } else {
        if (mode === "walk" && !modeTransition) navigation.update();
        if (mode === "overview" && !modeTransition) controls.update();
      }
      if (modeTransition) {
        const raw = Math.min(1, (now - modeTransition.startedAt) / 320);
        const eased = raw * raw * (3 - 2 * raw);
        camera.position.lerpVectors(
          modeTransition.fromPosition,
          modeTransition.toPosition,
          eased,
        );
        camera.quaternion.slerpQuaternions(
          modeTransition.fromQuaternion,
          modeTransition.toQuaternion,
          eased,
        );
        camera.fov = THREE.MathUtils.lerp(
          modeTransition.fromFov,
          modeTransition.toFov,
          eased,
        );
        camera.updateProjectionMatrix();
        if (raw >= 1) modeTransition.finish();
      }
      if (walkMarker.visible) {
        walkMarker.rotation.z += 0.008;
        const material = walkMarker.material as THREE.MeshBasicMaterial;
        material.opacity = 0.5 + Math.sin(now * 0.006) * 0.25;
        if (!navigation.hasDestination()) walkMarker.visible = false;
      }
      if (now - lastDannyDiagnosticsAt >= 120) {
        lastDannyDiagnosticsAt = now;
        element.dataset.cameraPosition = camera.position
          .toArray()
          .map((value) => value.toFixed(2))
          .join(",");
        element.dataset.cameraYaw = camera.rotation.y.toFixed(3);
        element.dataset.intro =
          intro && !intro.isComplete() ? "active" : "complete";
      }
      adaptiveDpr.update(now);
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    const observedRenderActivity = observeRenderActivity(element, (active) => {
      if (!active) {
        cancelAnimationFrame(frame);
        renderRunning = false;
      } else wakeRender();
    });
    renderActivity.active = observedRenderActivity.active;
    renderActivity.dispose = observedRenderActivity.dispose;
    wakeRender();
    return () => {
      destroyed = true;
      modeRuntime.current = null;
      cancelAnimationFrame(frame);
      renderActivity.dispose();
      observer.disconnect();
      reducedMotion.removeEventListener("change", updateMotionPreference);
      renderer.domElement.removeEventListener("click", handlePointer);
      renderer.domElement.removeEventListener("webglcontextlost", handleDannyContextLost);
      renderer.domElement.removeEventListener("webglcontextrestored", handleDannyContextRestored);
      intro?.dispose();
      mixer?.stopAllAction();
      modelErrorCleanup?.();
      navigation.dispose();
      controls.dispose();
      status.remove();
      if (demoModel) {
        scene.remove(demoModel);
        disposeObjectTree(demoModel);
        demoModel = null;
      }
      artworkHitObjects.forEach((object) => {
        if (object.parent === scene) disposeAndRemove(scene, object);
      });
      disposeObjectTree(walkMarker);
      disposeObjectTree(ground);
      environment.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);
  useEffect(() => {
    modeRuntime.current?.setMode(viewMode);
  }, [viewMode]);
  return (
    <div className={`gallery-scene gallery-scene--${viewMode}`} ref={host}>
      <VisitorControls
        mode={viewMode}
        modeOptions={[
          { value: "walk", label: "Walk", icon: "⌖" },
          { value: "overview", label: "Overview", icon: "◫" },
        ]}
        onModeChange={(next) => onViewModeChange?.(next)}
        tour={tourState}
        tourAvailable={sceneReady && viewMode === "walk"}
        onStartOrSkipTour={() =>
          tourState.status !== "idle"
            ? modeRuntime.current?.skipGuidedTour()
            : modeRuntime.current?.startGuidedTour()
        }
        onPauseOrResumeTour={() => modeRuntime.current?.pauseOrResumeGuidedTour()}
        onStepTour={(direction) => modeRuntime.current?.stepGuidedTour(direction)}
        onSmartView={() => modeRuntime.current?.smartView()}
        smartViewLabel={smartViewLabel}
        onResetView={() => modeRuntime.current?.resetView()}
        artworkCount={artworkCount}
        artworkDirectoryExpanded={artworkDirectoryExpanded}
        artworkDirectoryUnavailable={artworkDirectoryUnavailable}
        artworkButtonRef={artworkButtonRef}
        onOpenArtworkDirectory={onOpenArtworkDirectory}
      />
      <div className="scene-hint">
        <span className="movement-hint__desktop">
          {viewMode === "walk"
            ? `Danny Hirsch Arts · ${VISITOR_KEYBOARD_HINT}`
            : "Danny Hirsch Arts · Open-roof dollhouse overview"}
        </span>
        <span className="movement-hint__mobile">
          {viewMode === "walk"
            ? "Drag to look · Tap floor to walk · Pinch to zoom"
            : "Drag to orbit · Pinch to zoom"}
        </span>
      </div>
    </div>
  );
}
