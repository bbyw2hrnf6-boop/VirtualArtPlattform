import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  normalizeDannyLight,
  selectDannyAuthoredLights,
} from "../gallery/scene/dannyLighting";
import {
  advanceStoryProgress,
  classifyDannyPart,
  isMarbleFloor,
  isMisplacedMarble,
  range,
  storyCamera,
  storyFrame,
  type StoryPart,
} from "./scrollStoryModel";
import {
  VISITOR_KEYBOARD_HINT,
  VISITOR_LOOK_CODES,
  visitorLookDirection,
} from "../gallery/visitorKeyboard";
import "./scrollGalleryStory.css";
import { usesCompactInteractionLayout } from "../../utils/mobileLayout";
import { trackTelemetry } from "../../services/telemetry";

const CHAPTERS = [
  {
    eyebrow: "01 · Blueprint",
    title: "Draw Danny Hirsch Arts.",
    body: "Scale, thresholds, sightlines, and visitor circulation establish this exhibition—not a random template.",
  },
  {
    eyebrow: "02 · Build",
    title: "Raise the room in layers.",
    body: "Floor, walls, ceiling, and thresholds establish the spatial rhythm one construction step at a time.",
  },
  {
    eyebrow: "03 · Material",
    title: "Give every surface one job.",
    body: "Black marble stays on the floor. Quiet plaster holds the art. Bronze guides the eye.",
  },
  {
    eyebrow: "04 · Artwork",
    title: "Compose the exhibition.",
    body: "Works arrive at a consistent eye line, then spacing and focus are tuned around the room.",
  },
  {
    eyebrow: "05 · Studio",
    title: "Arrange. Preview. Refine.",
    body: "The browser Studio keeps the room editable while a visitor-ready view remains one switch away.",
  },
  {
    eyebrow: "06 · Camera and visitor",
    title: "Check every angle.",
    body: "A continuous 360° flight checks circulation, artwork sightlines, and the arrival at visitor height.",
  },
  {
    eyebrow: "07 · Result",
    title: "Resolve one complete place.",
    body: "Architecture, artwork, light, and route settle into one sharp, stable browser experience.",
  },
  {
    eyebrow: "08 · DannyHirschArts",
    title: "Enter Danny Hirsch Arts.",
    body: "The live room resolves at visitor height. Drag to look, then walk the completed exhibition.",
  },
] as const;

const CONDENSED_CHAPTER_INDEXES = [0, 1, 3, 5, 7] as const;
const EMIL_COMPLETED_KEY = "lieuva-emil-story-completed";

function emilStoryCompleted() {
  try { return window.localStorage.getItem(EMIL_COMPLETED_KEY) === "true"; }
  catch { return false; }
}

function rememberEmilStory() {
  try { window.localStorage.setItem(EMIL_COMPLETED_KEY, "true"); }
  catch { /* Storage may be disabled; the full experience remains functional. */ }
}

type MaterialState = {
  material: THREE.Material;
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
};

type PreparedMesh = {
  mesh: THREE.Mesh;
  part: StoryPart;
  materials: MaterialState[];
};

const BUILD_COPY = {
  plan: "01 / 05 · Plan and circulation",
  floor: "02 / 05 · Black marble floor",
  walls: "03 / 05 · Matte plaster walls",
  ceiling: "04 / 05 · Ceiling and services",
  details: "05 / 05 · Details and lighting",
} as const;

function buildStage(progress: number): keyof typeof BUILD_COPY {
  if (progress < 0.1) return "plan";
  if (progress < 0.2) return "floor";
  if (progress < 0.29) return "walls";
  if (progress < 0.38) return "ceiling";
  return "details";
}

function materialList(material: THREE.Material | THREE.Material[]) {
  return Array.isArray(material) ? material : [material];
}

function cloneMaterials(material: THREE.Material | THREE.Material[]) {
  const clones = materialList(material).map((item) => item.clone());
  return Array.isArray(material) ? clones : clones[0];
}

function applyReveal(entry: PreparedMesh, reveal: number) {
  entry.mesh.visible = reveal > 0.002;
  entry.materials.forEach((state) => {
    state.material.opacity = state.opacity * reveal;
    state.material.transparent = reveal < 0.999 || state.transparent;
    state.material.depthWrite = reveal > 0.94 && state.depthWrite;
  });
}

function removeStoneMaps(material: THREE.MeshStandardMaterial, textures: Set<THREE.Texture>) {
  const maps = [
    material.map,
    material.normalMap,
    material.roughnessMap,
    material.metalnessMap,
    material.bumpMap,
    material.displacementMap,
    material.aoMap,
  ];
  maps.forEach((texture) => {
    if (texture) textures.add(texture);
  });
  material.map = null;
  material.normalMap = null;
  material.roughnessMap = null;
  material.metalnessMap = null;
  material.bumpMap = null;
  material.displacementMap = null;
  material.aoMap = null;
}

function setTextureQuality(material: THREE.Material, anisotropy: number, textures: Set<THREE.Texture>) {
  const standard = material as THREE.MeshStandardMaterial;
  if (!standard.map) return;
  standard.map.colorSpace = THREE.SRGBColorSpace;
  standard.map.anisotropy = anisotropy;
  standard.map.needsUpdate = true;
  textures.add(standard.map);
}

export function ScrollGalleryStory() {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chapterRefs = useRef<Array<HTMLElement | null>>([]);
  const visitorRef = useRef<HTMLDivElement>(null);
  const buildLabelRef = useRef<HTMLParagraphElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const [condensed] = useState(() => {
    if (typeof window === "undefined") return false;
    return usesCompactInteractionLayout() || emilStoryCompleted();
  });
  const storyChapters = useMemo(() => condensed
    ? CONDENSED_CHAPTER_INDEXES.map((sourceIndex) => ({ sourceIndex, chapter: CHAPTERS[sourceIndex] }))
    : CHAPTERS.map((chapter, sourceIndex) => ({ sourceIndex, chapter })), [condensed]);

  useEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    const visitor = visitorRef.current;
    if (!section || !canvas || !visitor) return undefined;

    const compact = usesCompactInteractionLayout();
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = reducedMotionQuery.matches;
    let disposed = false;
    let sectionVisible = true;
    let frameRequest = 0;
    let requestRender = () => undefined;
    let renderer: THREE.WebGLRenderer;

    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: !compact,
        alpha: false,
        depth: true,
        powerPreference: "high-performance",
      });
    } catch (error) {
      console.error("Danny Hirsch Arts scroll story could not start.", error);
      trackTelemetry("three_runtime_health", { runtime: "emil_scroll", outcome: "renderer_failed" });
      section.dataset.roomState = "error";
      section.dataset.motion = "reduced";
      visitor.setAttribute("aria-hidden", "false");
      const fallbackLink = visitor.querySelector<HTMLAnchorElement>("a");
      if (fallbackLink) fallbackLink.tabIndex = 0;
      if (statusRef.current) statusRef.current.textContent = "The 3D room is unavailable. Open the full room to continue.";
      return undefined;
    }

    section.dataset.roomState = "loading";
    section.dataset.motion = reducedMotion ? "reduced" : "full";
    section.dataset.interactive = "false";
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = compact ? 1 : 0.96;
    renderer.shadowMap.enabled = !compact;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0c0f0d");
    scene.fog = new THREE.Fog("#0c0f0d", 18, 34);
    const environmentGenerator = new THREE.PMREMGenerator(renderer);
    const environment = environmentGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = environment;
    scene.environmentIntensity = compact ? 0.52 : 0.66;

    const camera = new THREE.PerspectiveCamera(compact ? 52 : 43, 1, 0.1, 80);
    const cameraPosition = new THREE.Vector3();
    const cameraTarget = new THREE.Vector3();
    const visitorPosition = new THREE.Vector3(0, 1.75, compact ? 3.6 : 4.1);
    const visitorTarget = new THREE.Vector3();
    const worldPosition = new THREE.Vector3();
    let visitorYaw = 0;
    let visitorPitch = 0;
    let interactive = false;
    let looking = false;
    let lookPointerId = -1;
    let pointerMoved = false;
    let pointerX = 0;
    let pointerY = 0;
    let visitorFov = camera.fov;
    let visitorDestination: THREE.Vector3 | null = null;
    let previousVisitorFrame = 0;
    let lastPinchDistance = 0;
    const touchPointers = new Map<number, { x: number; y: number }>();
    const floorRaycaster = new THREE.Raycaster();
    const floorPointer = new THREE.Vector2();

    const ambient = new THREE.HemisphereLight("#eef3e9", "#28231d", 0.28);
    const key = new THREE.DirectionalLight("#fff0d5", 0.4);
    key.position.set(4.8, 8.5, 6.5);
    scene.add(ambient, key);

    const modelRoot = new THREE.Group();
    modelRoot.name = "DannyHirschArtsScrollRoom";
    scene.add(modelRoot);
    const blueprintRoot = new THREE.Group();
    blueprintRoot.name = "DannyHirschArtsBlueprint";
    scene.add(blueprintRoot);

    const preparedMeshes: PreparedMesh[] = [];
    const blueprintLines: THREE.LineSegments[] = [];
    const colliderBoxes: THREE.Box3[] = [];
    const activeLights = new Map<THREE.Light, number>();
    const trackedTextures = new Set<THREE.Texture>();
    let modelReady = false;

    const updateChapter = (sourceIndex: number) => {
      const visibleIndex = storyChapters.reduce((closest, item, index) => (
        Math.abs(item.sourceIndex - sourceIndex) < Math.abs(storyChapters[closest].sourceIndex - sourceIndex)
          ? index
          : closest
      ), 0);
      chapterRefs.current.forEach((chapter, chapterIndex) => {
        if (!chapter) return;
        const active = chapterIndex === visibleIndex;
        chapter.dataset.active = active ? "true" : "false";
        chapter.setAttribute("aria-hidden", active ? "false" : "true");
      });
    };

    const setInteractive = (enabled: boolean) => {
      if (interactive === enabled) return;
      interactive = enabled;
      section.dataset.interactive = enabled ? "true" : "false";
      canvas.tabIndex = enabled ? 0 : -1;
      canvas.setAttribute("aria-hidden", enabled ? "false" : "true");
      visitor.setAttribute("aria-hidden", enabled ? "false" : "true");
      visitor.querySelectorAll("button").forEach((button) => {
        button.tabIndex = enabled ? 0 : -1;
      });
      const fullRoomLink = visitor.querySelector<HTMLAnchorElement>("a");
      if (fullRoomLink) fullRoomLink.tabIndex = enabled ? 0 : -1;
      if (!enabled) {
        looking = false;
        visitorDestination = null;
        touchPointers.clear();
        canvas.classList.remove("is-looking");
      }
    };

    const renderVisitorCamera = () => {
      const horizontal = Math.cos(visitorPitch);
      visitorTarget.set(
        visitorPosition.x + Math.sin(visitorYaw) * horizontal,
        visitorPosition.y + Math.sin(visitorPitch),
        visitorPosition.z - Math.cos(visitorYaw) * horizontal,
      );
      camera.position.copy(visitorPosition);
      camera.lookAt(visitorTarget);
      camera.fov = visitorFov;
      camera.updateProjectionMatrix();
    };

    const segmentIsReachable = (from: THREE.Vector3, to: THREE.Vector3) => {
      const distance = from.distanceTo(to);
      const samples = Math.max(2, Math.ceil(distance / 0.18));
      const sample = new THREE.Vector3();
      for (let index = 1; index <= samples; index += 1) {
        sample.lerpVectors(from, to, index / samples);
        sample.y = 1.75;
        if (colliderBoxes.some((collider) => collider.containsPoint(sample)))
          return false;
      }
      return true;
    };

    const updateVisitorDestination = (frameAt: number) => {
      if (!interactive || !visitorDestination) {
        previousVisitorFrame = frameAt;
        return false;
      }
      const delta = Math.min(
        (frameAt - (previousVisitorFrame || frameAt)) / 1000,
        0.05,
      );
      previousVisitorFrame = frameAt;
      const offset = visitorDestination.clone().sub(visitorPosition);
      offset.y = 0;
      const distance = offset.length();
      if (distance < 0.08) {
        visitorDestination = null;
        return false;
      }
      const candidate = visitorPosition.clone().addScaledVector(
        offset.normalize(),
        Math.min(distance, 2.25 * Math.max(delta, 1 / 120)),
      );
      if (!segmentIsReachable(visitorPosition, candidate)) {
        visitorDestination = null;
        return false;
      }
      visitorPosition.copy(candidate);
      return true;
    };

    const moveVisitor = (
      direction: "forward" | "back" | "left" | "right" | "turn-left" | "turn-right",
    ) => {
      if (!interactive || !modelReady) return;
      visitorDestination = null;
      if (direction === "turn-left" || direction === "turn-right") {
        visitorYaw += direction === "turn-left" ? 0.14 : -0.14;
        requestRender();
        return;
      }
      const step = compact ? 0.3 : 0.38;
      const forward = new THREE.Vector3(Math.sin(visitorYaw), 0, -Math.cos(visitorYaw));
      const right = new THREE.Vector3(Math.cos(visitorYaw), 0, Math.sin(visitorYaw));
      const candidate = visitorPosition.clone();
      if (direction === "forward") candidate.addScaledVector(forward, step);
      if (direction === "back") candidate.addScaledVector(forward, -step);
      if (direction === "left") candidate.addScaledVector(right, -step);
      if (direction === "right") candidate.addScaledVector(right, step);
      candidate.x = THREE.MathUtils.clamp(candidate.x, -6.2, 6.2);
      candidate.z = THREE.MathUtils.clamp(candidate.z, -6.62, 15.3);
      if (!colliderBoxes.some((collider) => collider.containsPoint(candidate))) {
        visitorPosition.copy(candidate);
        requestRender();
      }
    };

    let width = 0;
    let height = 0;
    const resizeRenderer = () => {
      const bounds = canvas.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.round(bounds.width));
      const nextHeight = Math.max(1, Math.round(bounds.height));
      if (width === nextWidth && height === nextHeight) return;
      width = nextWidth;
      height = nextHeight;
      const lowPower = (navigator.hardwareConcurrency || 4) <= 4;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, compact || lowPower ? 1.15 : 1.6));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(
      compact ? "./assets/demo/danny-gallery-mobile.glb" : "./assets/demo/danny-gallery.glb",
      (gltf) => {
        if (disposed) {
          gltf.scene.traverse((object) => {
            const mesh = object as THREE.Mesh;
            if (!mesh.isMesh) return;
            mesh.geometry?.dispose();
            materialList(mesh.material).forEach((material) => material.dispose());
          });
          return;
        }

        const root = gltf.scene;
        root.updateMatrixWorld(true);
        const authoredLights: THREE.Light[] = [];
        const edgeLimit = compact ? 12 : 20;

        root.traverse((object) => {
          const metadata = object.userData as Record<string, unknown>;
          const navigationRole = String(metadata.navigation_role ?? "").toLowerCase();
          const isCollider = object.name.startsWith("COLLIDER_") || navigationRole === "collider";
          const hiddenHelper = isCollider || [
            "view_anchor",
            "clear_route_waypoint",
            "look_target",
            "walk_start",
            "bounds_min",
            "bounds_max",
          ].includes(navigationRole) || /^catalogue_label_/i.test(object.name);

          if (isCollider) {
            const collider = new THREE.Box3().setFromObject(object, true);
            if (!collider.isEmpty()) {
              collider.expandByVector(new THREE.Vector3(0.3, 0, 0.3));
              colliderBoxes.push(collider);
            }
          }
          if (hiddenHelper || (object as THREE.Camera).isCamera) object.visible = false;
          if ((object as THREE.Light).isLight) {
            const light = object as THREE.Light;
            normalizeDannyLight(light);
            light.visible = false;
            light.castShadow = false;
            authoredLights.push(light);
            return;
          }

          const mesh = object as THREE.Mesh;
          if (!mesh.isMesh || hiddenHelper) return;
          object.getWorldPosition(worldPosition);
          const assetRole = String(metadata.asset_role ?? "");
          const firstMaterial = materialList(mesh.material)[0];
          const role = String(metadata.theme_role ?? firstMaterial?.userData?.theme_role ?? "");
          const part = classifyDannyPart({
            objectName: object.name,
            themeRole: role,
            assetRole,
            localY: worldPosition.y,
          });

          mesh.material = cloneMaterials(mesh.material);
          const materials = materialList(mesh.material);
          materials.forEach((material) => {
            const standard = material as THREE.MeshStandardMaterial;
            const materialRole = String(metadata.theme_role ?? material.userData?.theme_role ?? role);
            const marbleFloor = isMarbleFloor(part, materialRole, material.name);
            const misplacedMarble = isMisplacedMarble(part, materialRole, material.name);

            if (standard.emissive) {
              standard.emissive.set("#000000");
              standard.emissiveIntensity = 0;
            }
            if (misplacedMarble || part === "wall") {
              removeStoneMaps(standard, trackedTextures);
              standard.color?.set(part === "wall" ? "#484944" : "#292a27");
              standard.roughness = 0.94;
              standard.metalness = 0;
              standard.envMapIntensity = 0.18;
              material.name = `${material.name}_Matte_Plaster`;
            } else if (part === "artwork") {
              standard.color?.set("#ffffff");
              standard.roughness = 0.72;
              standard.toneMapped = false;
            } else if (marbleFloor) {
              standard.color?.set("#ffffff");
              standard.roughness = compact ? 0.3 : 0.2;
              standard.metalness = 0.02;
              standard.envMapIntensity = compact ? 0.7 : 1;
              if (standard instanceof THREE.MeshPhysicalMaterial) {
                standard.clearcoat = compact ? 0.16 : 0.28;
                standard.clearcoatRoughness = 0.13;
              }
            } else if (part === "ceiling") {
              standard.color?.set("#292a27");
              standard.roughness = 0.74;
              standard.metalness = 0;
              standard.envMapIntensity = 0.18;
            }

            setTextureQuality(
              material,
              Math.min(renderer.capabilities.getMaxAnisotropy(), compact ? 2 : 6),
              trackedTextures,
            );
            material.needsUpdate = true;
          });

          preparedMeshes.push({
            mesh,
            part,
            materials: materials.map((material) => ({
              material,
              opacity: material.opacity,
              transparent: material.transparent,
              depthWrite: material.depthWrite,
            })),
          });
          mesh.visible = false;
          mesh.receiveShadow = true;
          mesh.castShadow = !compact && part === "detail" && /frame|bench|plant|sculpture|plaque/i.test(object.name);

          const positionCount = mesh.geometry?.getAttribute("position")?.count ?? 0;
          const architectureEdge = /^ARCH_/i.test(object.name) && ["floor", "wall", "ceiling"].includes(part);
          if (
            architectureEdge &&
            positionCount > 0 &&
            positionCount < (compact ? 36_000 : 60_000) &&
            blueprintLines.length < edgeLimit
          ) {
            const edges = new THREE.EdgesGeometry(mesh.geometry, 42);
            if ((edges.getAttribute("position")?.count ?? 0) > 0) {
              const lines = new THREE.LineSegments(
                edges,
                new THREE.LineBasicMaterial({
                  color: part === "floor" ? "#d9ff43" : "#9aa68f",
                  transparent: true,
                  opacity: 0,
                  depthWrite: false,
                }),
              );
              lines.matrixAutoUpdate = false;
              lines.matrix.copy(mesh.matrixWorld);
              lines.frustumCulled = false;
              lines.visible = false;
              blueprintLines.push(lines);
              blueprintRoot.add(lines);
            } else {
              edges.dispose();
            }
          }
        });

        const lightSelection = selectDannyAuthoredLights(authoredLights, compact ? "low" : "balanced");
        lightSelection.active.forEach((light, index) => {
          activeLights.set(light, light.intensity);
          light.visible = false;
          light.castShadow = !compact && index === 0;
          const shadow = (light as THREE.Light & { shadow?: THREE.LightShadow }).shadow;
          if (shadow && light.castShadow) {
            shadow.mapSize.set(1024, 1024);
            shadow.bias = -0.00035;
            shadow.normalBias = 0.028;
          }
        });
        authoredLights.filter((light) => !activeLights.has(light)).forEach((light) => {
          light.visible = false;
        });

        modelRoot.add(root);
        modelReady = true;
        section.dataset.roomState = "ready";
        trackTelemetry("three_milestone", { runtime: "emil_scroll", stage: "interactive", quality: compact ? "low" : "balanced" });
        if (statusRef.current) statusRef.current.textContent = "Danny Hirsch Arts is ready. Scroll to build and enter the exhibition.";
        requestRender();
      },
      (event) => {
        if (!event.total || !statusRef.current) return;
        statusRef.current.textContent = `Loading Danny Hirsch Arts: ${Math.round((event.loaded / event.total) * 100)}%.`;
      },
      (error) => {
        console.error("Danny Hirsch Arts scroll room could not load.", error);
        trackTelemetry("three_runtime_health", { runtime: "emil_scroll", outcome: "model_failed" });
        section.dataset.roomState = "error";
        visitor.setAttribute("aria-hidden", "false");
        const fallbackLink = visitor.querySelector<HTMLAnchorElement>("a");
        if (fallbackLink) fallbackLink.tabIndex = 0;
        if (statusRef.current) statusRef.current.textContent = "The 3D room could not load. Open the full room to continue.";
      },
    );

    const renderProgress = (rawProgress: number) => {
      const progress = reducedMotion ? 1 : THREE.MathUtils.clamp(rawProgress, 0, 1);
      const state = storyFrame(progress);
      const stage = buildStage(progress);
      section.style.setProperty("--sgs-progress", progress.toFixed(4));
      section.style.setProperty("--sgs-blueprint", state.blueprint.toFixed(4));
      section.style.setProperty(
        "--sgs-materials",
        (range(progress, 0.27, 0.34) * (1 - range(progress, 0.43, 0.49))).toFixed(4),
      );
      section.style.setProperty(
        "--sgs-curation",
        (range(progress, 0.41, 0.48) * (1 - range(progress, 0.51, 0.55))).toFixed(4),
      );
      section.style.setProperty(
        "--sgs-studio",
        (range(progress, 0.5, 0.54) * (1 - range(progress, 0.7, 0.76))).toFixed(4),
      );
      section.style.setProperty("--sgs-finale", state.finale.toFixed(4));
      section.dataset.buildStage = stage;
      section.dataset.panel = progress < 0.28
        ? "build"
        : progress < 0.45
          ? "materials"
          : progress < 0.52
            ? "curation"
            : progress < 0.74
              ? "studio"
              : "none";
      updateChapter(state.chapter);
      if (buildLabelRef.current) buildLabelRef.current.textContent = BUILD_COPY[stage];

      const blueprintDraw = range(progress + 0.04, 0, 0.2);
      blueprintRoot.visible = modelReady && state.blueprint > 0.002;
      blueprintLines.forEach((lines, index) => {
        const local = range(blueprintDraw, index * 0.018, 0.58 + index * 0.018);
        const count = lines.geometry.getAttribute("position")?.count ?? 0;
        lines.geometry.setDrawRange(0, Math.max(2, Math.floor((count * local) / 2) * 2));
        lines.visible = local * state.blueprint > 0.002;
        (lines.material as THREE.LineBasicMaterial).opacity = state.blueprint * (0.38 + local * 0.5);
      });

      preparedMeshes.forEach((entry) => {
        const reveal = entry.part === "floor"
          ? state.floor
          : entry.part === "wall"
            ? state.wall
            : entry.part === "ceiling"
              ? state.ceiling
              : entry.part === "artwork"
                ? state.artwork
                : state.detail;
        applyReveal(entry, reveal);
      });

      ambient.intensity = THREE.MathUtils.lerp(0.2, compact ? 0.48 : 0.6, state.lighting);
      key.intensity = THREE.MathUtils.lerp(0.16, compact ? 0.7 : 0.92, state.lighting);
      activeLights.forEach((intensity, light) => {
        light.visible = state.lighting > 0.02;
        light.intensity = intensity * state.lighting;
      });

      const pose = storyCamera(progress, compact);
      cameraPosition.fromArray(pose.position);
      cameraTarget.fromArray(pose.target);
      const shouldInteract = modelReady && progress >= 0.985;
      if (shouldInteract && !interactive) {
        visitorPosition.copy(cameraPosition);
        visitorPosition.y = 1.75;
        visitorFov = camera.fov;
        const direction = cameraTarget.clone().sub(cameraPosition).normalize();
        visitorYaw = Math.atan2(direction.x, -direction.z);
        visitorPitch = Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1));
        setInteractive(true);
      } else if (!shouldInteract && interactive) {
        setInteractive(false);
      }
      if (interactive) renderVisitorCamera();
      else {
        camera.position.copy(cameraPosition);
        camera.lookAt(cameraTarget);
      }
      renderer.render(scene, camera);
    };

    let storyTop = 0;
    let storyTravel = 1;
    let measuredViewportWidth = 0;
    let targetProgress = 0;
    let renderedProgress = 0;
    let hasProgress = false;
    let previousFrameAt = 0;

    const measureStory = (force = false) => {
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
      if (!force && compact && Math.abs(viewportWidth - measuredViewportWidth) < 2) return;
      measuredViewportWidth = viewportWidth;
      const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
      storyTop = section.getBoundingClientRect().top + window.scrollY;
      // Resolve the live Danny room exactly as the sticky story ends. The old
      // extra dwell consumed more than one viewport after every visual change
      // had completed, so the final scroll gesture appeared to do nothing.
      storyTravel = Math.max(1, section.offsetHeight - viewportHeight);
    };

    const renderFrame = (frameAt: number) => {
      frameRequest = 0;
      resizeRenderer();
      targetProgress = reducedMotion
        ? 1
        : THREE.MathUtils.clamp((window.scrollY - storyTop) / storyTravel, 0, 1);
      if (targetProgress >= 0.985) rememberEmilStory();
      if (!hasProgress) {
        renderedProgress = targetProgress;
        hasProgress = true;
      } else if (!interactive || targetProgress < 0.965) {
        const elapsed = previousFrameAt ? Math.min(64, frameAt - previousFrameAt) : 16.67;
        renderedProgress = advanceStoryProgress(
          renderedProgress,
          targetProgress,
          elapsed,
          compact,
        );
      }
      if (interactive && targetProgress < 0.92) setInteractive(false);
      previousFrameAt = frameAt;
      const walkingToPoint = updateVisitorDestination(frameAt);
      const holdVisitorCamera = interactive && targetProgress >= 0.965;
      renderProgress(holdVisitorCamera ? 1 : renderedProgress);
      if (
        walkingToPoint ||
        (!holdVisitorCamera && Math.abs(targetProgress - renderedProgress) >= 0.00035)
      ) {
        frameRequest = window.requestAnimationFrame(renderFrame);
      }
    };

    requestRender = () => {
      if (!disposed && sectionVisible && !frameRequest) frameRequest = window.requestAnimationFrame(renderFrame);
    };

    const handleResize = () => {
      measureStory(false);
      requestRender();
    };
    const handleMotionChange = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
      section.dataset.motion = reducedMotion ? "reduced" : "full";
      measureStory(true);
      requestRender();
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!interactive || event.button !== 0) return;
      canvas.focus({ preventScroll: true });
      visitorDestination = null;
      pointerMoved = false;
      if (event.pointerType === "touch") {
        touchPointers.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });
        if (touchPointers.size > 1) {
          const points = [...touchPointers.values()];
          lastPinchDistance = Math.hypot(
            points[0].x - points[1].x,
            points[0].y - points[1].y,
          );
          looking = false;
          pointerMoved = true;
          return;
        }
      }
      looking = true;
      lookPointerId = event.pointerId;
      pointerX = event.clientX;
      pointerY = event.clientY;
      canvas.classList.add("is-looking");
      canvas.setPointerCapture(event.pointerId);
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (!interactive) return;
      if (event.pointerType === "touch" && touchPointers.has(event.pointerId)) {
        touchPointers.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });
        if (touchPointers.size > 1) {
          const points = [...touchPointers.values()];
          const distance = Math.hypot(
            points[0].x - points[1].x,
            points[0].y - points[1].y,
          );
          if (lastPinchDistance)
            visitorFov = THREE.MathUtils.clamp(
              visitorFov + (lastPinchDistance - distance) * 0.075,
              38,
              72,
            );
          lastPinchDistance = distance;
          pointerMoved = true;
          requestRender();
          event.preventDefault();
          return;
        }
      }
      if (!looking || event.pointerId !== lookPointerId) return;
      const deltaX = event.clientX - pointerX;
      const deltaY = event.clientY - pointerY;
      if (Math.abs(deltaX) + Math.abs(deltaY) > 3) pointerMoved = true;
      visitorYaw -= deltaX * 0.0042;
      visitorPitch = THREE.MathUtils.clamp(
        visitorPitch - deltaY * 0.0036,
        -0.62,
        0.62,
      );
      pointerX = event.clientX;
      pointerY = event.clientY;
      requestRender();
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerType === "touch") {
        touchPointers.delete(event.pointerId);
        lastPinchDistance = 0;
      }
      const wasLookPointer = event.pointerId === lookPointerId;
      looking = false;
      lookPointerId = -1;
      canvas.classList.remove("is-looking");
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (!interactive || !wasLookPointer || pointerMoved) return;
      const bounds = canvas.getBoundingClientRect();
      floorPointer.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
      );
      floorRaycaster.setFromCamera(floorPointer, camera);
      const floorMeshes = preparedMeshes
        .filter((entry) => entry.part === "floor" && entry.mesh.visible)
        .map((entry) => entry.mesh);
      const floorHit = floorRaycaster.intersectObjects(floorMeshes, false)[0];
      if (!floorHit) return;
      const candidate = floorHit.point.clone();
      candidate.y = 1.75;
      candidate.x = THREE.MathUtils.clamp(candidate.x, -6.2, 6.2);
      candidate.z = THREE.MathUtils.clamp(candidate.z, -6.62, 15.3);
      if (!segmentIsReachable(visitorPosition, candidate)) return;
      visitorDestination = candidate;
      previousVisitorFrame = performance.now();
      requestRender();
    };
    const handleWheel = (event: WheelEvent) => {
      if (!interactive || document.activeElement !== canvas) return;
      visitorFov = THREE.MathUtils.clamp(
        visitorFov + event.deltaY * 0.012,
        38,
        72,
      );
      event.preventDefault();
      requestRender();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!interactive || document.activeElement !== canvas) return;
      const value = event.key.toLowerCase();
      if (value === "escape") {
        event.preventDefault();
        canvas.blur();
        setInteractive(false);
        return;
      }
      if (value === "arrowleft" || value === "arrowright") {
        event.preventDefault();
        visitorYaw += value === "arrowleft" ? 0.12 : -0.12;
        requestRender();
        return;
      }
      if (VISITOR_LOOK_CODES.has(event.code)) {
        event.preventDefault();
        visitorPitch = THREE.MathUtils.clamp(
          visitorPitch + visitorLookDirection(new Set([event.code])) * 0.09,
          -0.9,
          0.9,
        );
        requestRender();
        return;
      }
      const direction = value === "w"
        ? "forward"
        : value === "s"
          ? "back"
          : value === "a"
            ? "left"
            : value === "d"
              ? "right"
              : null;
      if (!direction) return;
      event.preventDefault();
      moveVisitor(direction);
    };
    const handleMoveControl = (event: Event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-story-move]");
      const direction = button?.dataset.storyMove as
        | "forward"
        | "back"
        | "turn-left"
        | "turn-right"
        | undefined;
      if (direction) moveVisitor(direction);
    };
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      setInteractive(false);
      section.dataset.roomState = "error";
      trackTelemetry("three_runtime_health", { runtime: "emil_scroll", outcome: "context_lost" });
      visitor.setAttribute("aria-hidden", "false");
      const fallbackLink = visitor.querySelector<HTMLAnchorElement>("a");
      if (fallbackLink) fallbackLink.tabIndex = 0;
      if (statusRef.current) statusRef.current.textContent = "The 3D preview stopped. Open the full room to continue.";
    };
    const handleContextRestored = () => {
      trackTelemetry("three_runtime_health", { runtime: "emil_scroll", outcome: "context_restored" });
      requestRender();
    };

    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(requestRender);
    resizeObserver?.observe(canvas);
    const visibilityObserver = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(
      ([entry]) => {
        sectionVisible = entry.isIntersecting;
        if (!sectionVisible && frameRequest) {
          window.cancelAnimationFrame(frameRequest);
          frameRequest = 0;
          return;
        }
        requestRender();
      },
      { rootMargin: "200px 0px" },
    );
    visibilityObserver?.observe(section);
    window.addEventListener("scroll", requestRender, { passive: true });
    window.addEventListener("resize", handleResize, { passive: true });
    window.addEventListener("keydown", handleKeyDown);
    reducedMotionQuery.addEventListener("change", handleMotionChange);
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerUp);
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvas.addEventListener("webglcontextrestored", handleContextRestored);
    visitor.addEventListener("click", handleMoveControl);
    measureStory(true);
    document.fonts?.ready.then(() => {
      if (!disposed) {
        measureStory(true);
        requestRender();
      }
    });
    requestRender();

    return () => {
      disposed = true;
      window.removeEventListener("scroll", requestRender);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("keydown", handleKeyDown);
      reducedMotionQuery.removeEventListener("change", handleMotionChange);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerUp);
      canvas.removeEventListener("wheel", handleWheel);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      visitor.removeEventListener("click", handleMoveControl);
      resizeObserver?.disconnect();
      visibilityObserver?.disconnect();
      if (frameRequest) window.cancelAnimationFrame(frameRequest);
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments)) return;
        object.geometry?.dispose();
        materialList(object.material).forEach((material) => material.dispose());
      });
      trackedTextures.forEach((texture) => texture.dispose());
      environment.dispose();
      environmentGenerator.dispose();
      renderer.dispose();
      delete section.dataset.roomState;
      delete section.dataset.motion;
      delete section.dataset.interactive;
      delete section.dataset.buildStage;
      delete section.dataset.panel;
    };
  }, [condensed, storyChapters]);

  return (
    <section className="sgs" ref={sectionRef} aria-labelledby="sgs-title" data-condensed={condensed ? "true" : "false"}>
      <h2 className="visually-hidden" id="sgs-title">Build and enter the Danny Hirsch Arts virtual exhibition</h2>
      <div className="sgs__sticky">
        <div className="sgs__visual">
          <div className="sgs__poster" aria-hidden="true">
            <picture>
              <source
                media="(max-width: 900px), (max-height: 520px) and (pointer: coarse)"
                srcSet="./assets/demo/danny-emil-finale-mobile-v2.webp"
              />
              <img src="./assets/demo/danny-emil-finale-v2.webp" alt="" />
            </picture>
          </div>
          <canvas
            ref={canvasRef}
            aria-hidden="true"
            aria-label="Danny Hirsch Arts room. At the end, drag to look, click or tap the floor to walk, and scroll or pinch to zoom."
            tabIndex={-1}
          />
          <div className="sgs__shade" aria-hidden="true" />
        </div>

        <div className="sgs__chrome" aria-hidden="true">
          <span>LIEUVA / DANNY HIRSCH ARTS</span>
          <i><b /></i>
          <span>SCROLL TO BUILD</span>
        </div>

        <div className="sgs__chapters">
          {storyChapters.map(({ chapter }, index) => (
            <article
              key={chapter.eyebrow}
              ref={(element) => { chapterRefs.current[index] = element; }}
              data-active={index === 0 ? "true" : "false"}
              aria-hidden={index === 0 ? "false" : "true"}
            >
              <p>{chapter.eyebrow}</p>
              <h2>{chapter.title}</h2>
              <span>{chapter.body}</span>
            </article>
          ))}
        </div>

        <div className="sgs__build-card" aria-hidden="true">
          <p ref={buildLabelRef}>01 / 05 · Plan and circulation</p>
          <ol>
            <li data-stage="plan">Plan</li>
            <li data-stage="floor">Floor</li>
            <li data-stage="walls">Walls</li>
            <li data-stage="ceiling">Ceiling</li>
            <li data-stage="details">Details</li>
          </ol>
          <dl>
            <div><dt>Width</dt><dd>12.40 m</dd></div>
            <div><dt>Visitor eye</dt><dd>1.75 m</dd></div>
          </dl>
        </div>

        <div className="sgs__material-card" aria-hidden="true">
          <p>Authored material contract</p>
          <ul>
            <li><i className="is-plaster" /><span>Walls</span><b>Matte plaster</b></li>
            <li><i className="is-marble" /><span>Floor only</span><b>Black marble</b></li>
            <li><i className="is-bronze" /><span>Details</span><b>Brushed bronze</b></li>
          </ul>
        </div>

        <div className="sgs__curate-card" aria-hidden="true">
          <p><span>Artwork sequence</span><b>360° flight</b></p>
          <div><i /><i /><i /></div>
          <dl>
            <div><dt>Eye line</dt><dd>1.75 m</dd></div>
            <div><dt>Spacing</dt><dd>Balanced</dd></div>
            <div><dt>Lights</dt><dd>Focused</dd></div>
          </dl>
        </div>

        <div className="sgs__studio-card" aria-hidden="true">
          <p>Browser Studio</p>
          <ol>
            <li><span>Arrange</span><b>Active</b></li>
            <li><span>Walk preview</span><b>Ready</b></li>
            <li><span>Share state</span><b>Draft</b></li>
          </ol>
          <small>No specialist 3D software required.</small>
        </div>

        <div className="sgs__visitor" ref={visitorRef} aria-hidden="true">
          <div>
            <p><i /> Live walk preview</p>
            <strong>
              <span className="sgs__desktop-controls">{VISITOR_KEYBOARD_HINT}</span>
              <span className="sgs__mobile-controls">Drag to look · Tap floor to walk · Pinch to zoom</span>
            </strong>
            <a
              href="#/demo"
              tabIndex={-1}
              onClick={() => trackTelemetry("landing_example_entered", { source: "emil_finale" })}
            >Open full room <span>→</span></a>
          </div>
          <div className="sgs__visitor-pad" aria-label="Walk controls">
            <button type="button" data-story-move="forward" aria-label="Move forward" tabIndex={-1}>↑</button>
            <button type="button" data-story-move="turn-left" aria-label="Turn left" tabIndex={-1}>←</button>
            <button type="button" data-story-move="back" aria-label="Move back" tabIndex={-1}>↓</button>
            <button type="button" data-story-move="turn-right" aria-label="Turn right" tabIndex={-1}>→</button>
          </div>
        </div>

        <p className="sgs__status visually-hidden" ref={statusRef}>
          Loading the Danny Hirsch Arts exhibition.
        </p>
      </div>

      <ol className="sgs__accessible-sequence">
        {storyChapters.map(({ chapter }) => (
          <li key={chapter.eyebrow}><strong>{chapter.title}</strong> {chapter.body}</li>
        ))}
      </ol>
    </section>
  );
}
