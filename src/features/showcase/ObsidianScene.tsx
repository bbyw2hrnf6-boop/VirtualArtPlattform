import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createFirstPersonWalk } from '../gallery/scene/firstPersonWalk';
import { fitArrangeCamera, arrangeZoomLimit } from '../gallery/scene/arrangeCamera';
import { defaultWalkFov } from '../gallery/scene/walkPreferences';
import { VISITOR_KEYBOARD_HINT } from '../gallery/visitorKeyboard';
import { createObsidianNavigation, obsidianBounds } from './navigation';
import { createFloorReflection, installOverviewCutaway } from './floorReflection';
import data from './obsidian.json';
import { createShowcaseDirector } from './showcaseDirector';
import { ENTRY_FLIGHTS, WORLD_FLIGHTS, SHOWCASE_STOPS } from './showcaseFlights';
import { forestRooms } from './forestRooms';
import { createWorldPortal } from './worldPortal';
import { createShowcaseQuality } from './showcaseQuality';
import { installForestIrradiance } from './forestIrradiance';
import { prepareForestWater } from './forestWater';
import { createForestMirrors } from './forestMirrors';
import { createForestSky } from './forestSky';
import { installForestFoliage } from './forestFoliage';
import { createForestNight } from './forestNight';
import type { VisitorTourState } from '../gallery/visitorTourState';

export interface ShowcaseSceneConfig {
  id: string; title: string;
  rooms: { start: number[]; look?: number[] }[];
  bounds: typeof obsidianBounds;
  size: [number, number, number]; center: [number, number, number];
  navigation: () => Pick<ReturnType<typeof createObsidianNavigation>, 'resolve' | 'findPath'>;
  roomAt: (position: THREE.Vector3) => number;
  sculpture?: boolean;
  architecture?: boolean;
  eyeHeight?: number;
  assetVersion?: string;
}
const obsidianConfig: ShowcaseSceneConfig = {
  id: 'obsidian', title: 'Obsidian', rooms: data.rooms, bounds: obsidianBounds,
  size: [34,8,4.5], center: [17,0,-4], navigation: createObsidianNavigation,
  roomAt: position => position.x < 12 ? 0 : position.x < 22 ? 1 : 2,
};
export type ObsidianMode = 'walk' | 'overview';
export interface ObsidianControls {
  room(index: number): void;
  mode(value: ObsidianMode): void;
  reset(): void;
  zoom(direction: -1 | 1): void;
  pause(value: boolean): void;
  lighting?(night: boolean): Promise<void>;
  tour(command: 'start' | 'stop' | 'pause' | number): void;
  flight(command: 'start' | 'stop' | 'pause' | number): void;
  seekFilm(progress: number): void;
}

export default function ObsidianScene({ controlsRef, onReady, onError, onRoom, onArtwork, onMode, onTour, onFlight, cinematic = false, config = obsidianConfig }: {
  config?: ShowcaseSceneConfig;
  controlsRef: { current: ObsidianControls | null };
  onReady: () => void;
  onError: () => void;
  onRoom: (index: number) => void;
  onArtwork: (id: string) => void;
  onMode: (mode: ObsidianMode) => void;
  onTour?: (state: VisitorTourState) => void;
  onFlight?: (state: VisitorTourState) => void;
  cinematic?: boolean;
}) {
  const mount = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = mount.current!;
    let disposed = false;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); }
    catch { onError(); return; }
    const compact = matchMedia('(max-width: 767px), (pointer: coarse)').matches;
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = 1;
    const canvas = renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', `Explore ${config.title}. ${VISITOR_KEYBOARD_HINT}. Drag to look, tap the floor to walk, pinch or scroll to zoom.`);
    host.append(canvas);
    const scene = new THREE.Scene();
    const forestSky = config.id === 'forest-fold-house' ? createForestSky() : undefined;
    if (forestSky) renderer.toneMappingExposure = Math.SQRT2;
    scene.background = new THREE.Color(config.architecture ? '#acb7bb' : config.sculpture ? '#cac2b2' : '#100e0b');
    if (forestSky) scene.background = forestSky.day;
    const walkMarker = new THREE.Mesh(new THREE.RingGeometry(.18, .25, 32), new THREE.MeshBasicMaterial({
      color: '#d9ff43', transparent: true, opacity: .78, side: THREE.DoubleSide, depthWrite: false,
    }));
    walkMarker.rotation.x = -Math.PI / 2;
    walkMarker.visible = false;
    scene.add(walkMarker);
    const portal=cinematic?createWorldPortal(config.id,compact,renderer,()=>schedule()):null;
    let filmProgress=0;
    if(portal)scene.add(portal.mesh);
    const camera = new THREE.PerspectiveCamera(defaultWalkFov(compact), 1, .04, 180);
    camera.position.fromArray(config.rooms[0].start);
    camera.lookAt(new THREE.Vector3().fromArray(config.rooms[0].look ?? [5,1.75,-3.6]));
    let currentRoom = 0, raf = 0, frames = 0, paused = false, scheduledAt = 0, gpuTimer = 0;
    const gl = renderer.getContext() as WebGL2RenderingContext;
    let gpuFence: WebGLSync | null = null;
    let mode: ObsidianMode = 'walk';
    let model: THREE.Group | undefined;
    let reflection: ReturnType<typeof createFloorReflection> | undefined;
    let mirrors: ReturnType<typeof createForestMirrors> | undefined;
    let forestNight: ReturnType<typeof createForestNight> | undefined;
    const overview = { value: false };
    const savedWalk = { position: camera.position.clone(), quaternion: camera.quaternion.clone() };
    const ray = new THREE.Raycaster();
    const schedule = () => { if (!disposed && !raf && !gpuFence && !document.hidden) { scheduledAt = performance.now(); raf = requestAnimationFrame(render); } };
    const navigation = config.navigation();
    const walk = createFirstPersonWalk(camera, canvas, () => config.bounds,
      navigation.resolve, navigation.findPath, schedule, () => canvas.blur(), true, 1, config.eyeHeight);
    walk.setEnabled(false);
    const orbit = new OrbitControls(camera, canvas);
    // OrbitControls initializes toward its default target even while disabled.
    camera.quaternion.copy(savedWalk.quaternion);
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
      const fit = fitArrangeCamera(...config.size, camera.aspect, direction);
      const center = new THREE.Vector3(...config.center);
      camera.fov = 48;
      camera.clearViewOffset();
      camera.position.copy(fit.position).sub(fit.target).multiplyScalar(camera.aspect < .8 ? 1.25 : 1).add(fit.target).add(center);
      if (camera.aspect < .8) camera.setViewOffset(host.clientWidth, host.clientHeight, 0, host.clientHeight * .06, host.clientWidth, host.clientHeight);
      orbit.target.copy(fit.target).add(center);
      orbit.maxDistance = arrangeZoomLimit(config.size[0], config.size[1], fit.distance);
      camera.far = Math.max(180, orbit.maxDistance + 50);
      camera.updateProjectionMatrix();
      orbit.update();
    };
    const switchMode = (next: ObsidianMode) => {
      if (director?.active()) director.stop();
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
      canvas.focus({ preventScroll: true });
    };
    const resetWalk = (index: number) => {
      const room = config.rooms[index]; if (!room) return;
      switchMode('walk'); walk.setEnabled(false);
      camera.position.fromArray(room.start);
      if (config.eyeHeight === undefined) camera.position.y = 1.75;
      camera.fov = walk.preferredFov();
      camera.lookAt(room.look ? new THREE.Vector3().fromArray(room.look) : camera.position.clone().add(new THREE.Vector3(3.5, 0, -2.1)));
      walk.syncFromCamera(); walk.setEnabled(!paused);
      currentRoom = index; onRoom(index); schedule();
      canvas.focus({ preventScroll: true });
    };
    const pause = (value: boolean) => {
      paused = value;
      if (value) director?.pause(true);
      walk.setEnabled(!value && !cinematic && !director?.active() && mode === 'walk' && Boolean(model));
      orbit.enabled = !value && mode === 'overview';
      schedule();
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
    let mixer: THREE.AnimationMixer | undefined, environment: THREE.WebGLRenderTarget | undefined;
    const environments = new Map<boolean, THREE.WebGLRenderTarget>();
    const captureEnvironment = (size: number, position: number[]) => {
      // Capture authored surfaces and current lighting, never the previous IBL
      // or recursive planar passes. Only initial load / a new light state does this.
      scene.environment = null;
      const peers: THREE.Object3D[] = [walkMarker, ...(reflection ? [reflection] : []), ...(mirrors?.mirrors ?? [])];
      const visibility = peers.map(o => o.visible);
      peers.forEach(o => { o.visible = false; });
      const cube = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType });
      const probe = new THREE.CubeCamera(.1,160,cube); probe.position.fromArray(position);
      const pmrem = new THREE.PMREMGenerator(renderer);
      try { probe.update(renderer,scene); return pmrem.fromCubemap(cube.texture); }
      finally { pmrem.dispose(); cube.dispose(); peers.forEach((o,i) => { o.visible = visibility[i]; }); }
    };
    let architecturalSky: THREE.HemisphereLight | undefined, architecturalSun: THREE.DirectionalLight | undefined;
    let lightingRequest = 0;
    const setArchitectureLighting = async (night: boolean) => {
      if (!config.architecture || !architecturalSky || !architecturalSun) return;
      const request = ++lightingRequest;
      await forestNight?.set(night);
      if (disposed || request !== lightingRequest) return;
      scene.background = forestSky ? night ? forestSky.night : forestSky.day : new THREE.Color(night ? '#08111a' : '#acb7bb');
      // Match the source master's AgX exposure: +0.5 EV day / +1.3 EV night.
      renderer.toneMappingExposure = night ? 2 ** 1.3 : Math.SQRT2;
      architecturalSky.color.set(night ? '#4c6688' : '#e4edf1');
      architecturalSky.groundColor.set(night ? '#101914' : '#333b28');
      architecturalSky.intensity = night ? .08 : .85;
      architecturalSun.color.set(night ? '#9ebfff' : '#ffebc5');
      architecturalSun.intensity = night ? 0 : 3;
      if (!environments.has(night)) environments.set(night, captureEnvironment(compact ? 128 : 256, [0,3,4]));
      scene.environment = environments.get(night)!.texture;
      host.dataset.lighting = night ? 'night' : 'day';
      schedule();
    };
    controlsRef.current = {
      room: resetWalk,
      mode: switchMode,
      reset: () => { if (mode === 'overview') fitOverview(); else resetWalk(currentRoom); schedule(); },
      zoom: direction => { if (director.active()) director.stop(); if (mode === 'walk') { walk.zoom(direction); canvas.focus({ preventScroll: true }); schedule(); return; }
        const offset = camera.position.clone().sub(orbit.target);
        offset.setLength(THREE.MathUtils.clamp(offset.length() * (direction > 0 ? 1 / 1.3 : 1.3), orbit.minDistance, orbit.maxDistance));
        camera.position.copy(orbit.target).add(offset); orbit.update(); schedule();
      },
      pause,
      lighting: setArchitectureLighting,
      tour: command => {
        if (!model) return;
        if (typeof command === 'number') director?.stepTour(command);
        else if (command === 'start') director?.startTour();
        else if (command === 'pause') director?.pause();
        else director?.stop();
      },
      flight: command => {
        if (!model) return;
        if (typeof command === 'number') director?.seekFlight(command);
        else if (command === 'start') director?.startFlight();
        else if (command === 'pause') director?.pause();
        else { director?.stop(); canvas.focus({preventScroll:true}); }
      },
      seekFilm: progress => { filmProgress=progress; if (model) director?.seekWorld(progress); },
    };
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const director = createShowcaseDirector({
      camera, navigation, reduced: () => motion.matches, schedule, onTour, onFlight,
      flight: ENTRY_FLIGHTS[config.id], world: WORLD_FLIGHTS[config.id],
      stops: config.architecture ? [0,1,6,2,3,4,7,5].map(i => ({
        label: forestRooms[i].name, position: forestRooms[i].start, target: forestRooms[i].look,
      })) : SHOWCASE_STOPS[config.id],
      acquire: () => {
        switchMode('walk'); walk.setEnabled(false); orbit.enabled=false;
        camera.clearViewOffset(); camera.updateProjectionMatrix();
      },
      release: () => {
        walk.syncFromCamera(); walk.setEnabled(!paused && !cinematic && mode==='walk');
        orbit.enabled=!paused && !cinematic && mode==='overview';
      },
    });
    let animationTime = performance.now();
    let renderCost = 0, readyNotified = false;
    const resolution = createShowcaseQuality();
    const balancedPixelRatio = () => Math.min(devicePixelRatio, 1, Math.sqrt(600_000 / Math.max(1, host.clientWidth * host.clientHeight)));
    const fullPixelRatio = () => Math.min(Math.max(devicePixelRatio, compact ? 1 : 1.5), 2);
    const quality = (full: boolean) => {
      renderer.setPixelRatio(full ? fullPixelRatio() : balancedPixelRatio());
      mirrors?.quality(full);
      const size = full ? compact ? 1024 : 2048 : 512;
      if (reflection) {
        reflection.getRenderTarget().samples = full && !compact ? 2 : 0;
        reflection.getRenderTarget().setSize(size, size);
        (reflection.material as THREE.ShaderMaterial).uniforms.texel.value.set(1 / size, 1 / size);
      }
    };
    function render() {
      const now = performance.now();
      // Calibrate with two bounded frames before supersampling. A full-size
      // first reflection can block a software GPU before adaptation can run.
      // Include synchronous drawing as well as queued GPU latency. Measuring
      // only the next RAF wait misses software renderers that block render().
      // Idle time stays excluded; the same measurement applies to every device.
      if (model) {
        const workload = Math.max((fullPixelRatio() / balancedPixelRatio()) ** 2, reflection ? compact ? 4 : 16 : 1);
        const change = resolution.sample(now, now - scheduledAt + renderCost, renderCost, workload);
        if (change !== undefined) quality(change);
      }
      raf = 0;
      if (disposed || document.hidden) return;
      // Orbit owns the camera in Overview; Walk must not apply its FOV easing.
      if (!paused) director?.update(now);
      if (mode === 'walk' && !paused && !director?.active() && !cinematic) walk.update();
      const orbitMoving = orbit.enabled && orbit.update();
      const room = config.roomAt(camera.position);
      if (mode === 'walk' && room !== currentRoom) { currentRoom = room; onRoom(room); }
      host.dataset.position = camera.position.toArray().map(v => v.toFixed(3)).join(',');
      host.dataset.fov = camera.fov.toFixed(2);
      host.dataset.pitch = camera.rotation.x.toFixed(4);
      host.dataset.yaw = camera.rotation.y.toFixed(4);
      host.dataset.mode = mode;
      host.dataset.cameraOwner = director?.kind() ?? 'visitor';
      host.dataset.flightProgress = director.progress().toFixed(3);
      host.dataset.destination = String(walk.hasDestination());
      walkMarker.visible = mode === 'walk' && walk.hasDestination();
      host.dataset.frames = String(++frames);
      host.dataset.reflection = reflection?.visible ? 'planar' : 'off';
      const animate = Boolean(mixer && !motion.matches && !paused && room === 2 && mode === 'walk');
      if (animate) mixer!.update(Math.min((now-animationTime)/1000,.1));
      animationTime = now; host.dataset.animation = animate ? 'playing' : 'paused';
      if(mixer)host.dataset.animationTime=mixer.time.toFixed(3);
      portal?.update(filmProgress);
      mirrors?.update(overview.value);
      renderer.render(scene, camera);
      const moving = Boolean(resolution.warming() && model) || animate || (!paused && (director?.moving() || (!director?.active() && !cinematic && (mode === 'walk' ? walk.needsUpdate() : orbitMoving))));
      host.dataset.idle = String(!moving);
      host.dataset.resolution = resolution.warming() ? 'warming' : resolution.full() ? 'full' : 'balanced';
      // RAF and render() can return before queued GPU work completes. Measure
      // actual completion of the bounded warm-up draws before supersampling.
      // Poll without blocking input; full-quality assets and fast-GPU output
      // stay unchanged. Never queue another draw while this sample is pending.
      if (model && resolution.warming()) {
        gpuFence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
      }
      const complete = () => {
        if (gpuFence && gl.clientWaitSync(gpuFence, 0, 0) === gl.TIMEOUT_EXPIRED) {
          gpuTimer = window.setTimeout(complete, 8);
          return;
        }
        if (gpuFence) gl.deleteSync(gpuFence);
        gpuFence = null;
        renderCost = performance.now() - now;
        if (!disposed && model && !resolution.warming() && !readyNotified) {
          readyNotified = true; host.dataset.ready = 'true'; onReady();
          if (!cinematic) canvas.focus({ preventScroll: true });
        }
        if (moving) schedule();
      };
      complete();
    }
    const resize = new ResizeObserver(() => {
      if (!host.clientWidth || !host.clientHeight) return;
      if (resolution.warming() || !resolution.full()) renderer.setPixelRatio(balancedPixelRatio());
      renderer.setSize(host.clientWidth, host.clientHeight); camera.aspect = host.clientWidth / host.clientHeight;
      if (mode === 'overview') fitOverview();
      camera.updateProjectionMatrix(); schedule();
    });
    resize.observe(host);
    let lastTouchActivationAt = -Infinity;
    const click = (event: MouseEvent | PointerEvent) => {
      // Match Space touch activation: use pointerup, then suppress the browser's
      // compatibility click. A pinch/drag is consumed once by the controller.
      if (event.type === 'pointerup') {
        if (!(event instanceof PointerEvent) || event.pointerType !== 'touch') return;
        lastTouchActivationAt = performance.now();
      } else if (performance.now() - lastTouchActivationAt < 700) return;
      if (cinematic || director?.active() || event.button !== 0 || paused || !model || mode !== 'walk' || !walk.consumeClick()) return;
      const rect = canvas.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
      const hit = ray.intersectObject(model, true)[0];
      if (hit?.object.userData.artwork_id) { pause(true); onArtwork(hit.object.userData.artwork_id); }
      else if (hit && (config.architecture ? hit.object.userData.walk_surface && Boolean(hit.face && hit.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).y > .65) : hit.object.userData.reflective_floor && hit.point.y < .02)) {
        // Include the recessed grout at -5 cm; it belongs to the same walkable
        // floor and must not turn a visible joint into an unresponsive target.
        if (walk.moveTo(hit.point)) {
          // Display the reachable endpoint, including the visitor's wall clearance.
          const target = walk.destination()!;
          target.y = config.eyeHeight === undefined ? .018 : target.y - config.eyeHeight + .018;
          walkMarker.position.copy(target);
          host.dataset.target = target.toArray().map(v => v.toFixed(3)).join(',');
        }
        schedule();
      }
    };
    const lost = (event: Event) => { event.preventDefault(); pause(true); onError(); };
    const blur = () => { walk.setEnabled(false); if (!paused && !cinematic && !director?.active() && mode === 'walk' && model) walk.setEnabled(true); schedule(); };
    const visibility = () => { if (document.hidden) director?.pause(true); blur(); if (!document.hidden) schedule(); };
    const windowBlur = () => { director?.pause(true); blur(); };
    const interrupt = (event: Event) => {
      if (cinematic || !director?.active()) return;
      if (event instanceof KeyboardEvent && !['Escape','w','a','s','d','q','e','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)) return;
      director.stop();
    };
    // Pointer look and pinch mutate camera state inside the shared controller.
    canvas.addEventListener('pointermove', schedule); canvas.addEventListener('click', click);
    canvas.addEventListener('pointerup', click);
    canvas.addEventListener('pointercancel', blur); canvas.addEventListener('blur', blur);
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('pointerdown', interrupt, true); canvas.addEventListener('keydown', interrupt, true); canvas.addEventListener('wheel', interrupt, {capture:true,passive:true});
    motion.addEventListener('change', schedule);
    window.addEventListener('blur', windowBlur); document.addEventListener('visibilitychange', visibility);
    const abort = new AbortController();
    const separate = config.architecture && !compact;
    const assetRoot = `/assets/showcases/${config.id}/${separate ? 'desktop-v5/' : ''}`;
    fetch(`${assetRoot}${config.id}-${compact ? 'mobile' : 'desktop'}.${separate ? 'gltf' : 'glb'}${config.assetVersion ?? ''}`, { signal: abort.signal })
      .then(response => { if (!response.ok) throw new Error('Missing showcase'); return response.arrayBuffer(); })
      .then(buffer => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buffer, assetRoot))
      .then(gltf => {
        if (disposed) { disposeModel(gltf.scene); return; }
        model = gltf.scene;
        const materials = new Set<THREE.Material>(), artworkMaterials = new Set<THREE.Material>();
        model.traverse(object => {
          // glTF multi-material nodes become Groups with untagged child meshes.
          object.userData.artwork_id ??= object.parent?.userData.artwork_id;
          object.userData.walk_surface ??= object.parent?.userData.walk_surface;
          object.userData.baked_diffuse ??= object.parent?.userData.baked_diffuse;
          if (!(object instanceof THREE.Mesh)) return;
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            materials.add(material);
            if (object.userData.artwork_id) artworkMaterials.add(material);
          }
        });
        materials.forEach(material => {
          // Set samplers before the reflection probe uploads textures. Changing
          // anisotropy afterwards needs a texture re-upload; raster adaptation
          // should never repeatedly re-upload the house's large material set.
          Object.values(material).forEach(value => {
            if (value instanceof THREE.Texture) value.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
          });
          if (config.architecture && material instanceof THREE.MeshStandardMaterial) {
            installForestIrradiance(material);
            if (forestSky) installForestFoliage(material);
          }
          // Cut roofs, glazing and coves together; retain full-height sculptures.
          if (!config.architecture && (!config.sculpture || !artworkMaterials.has(material))) installOverviewCutaway(material, overview, config.sculpture ? 1 : undefined);
        });
        if (forestSky) forestNight = createForestNight([...materials].filter((m): m is THREE.MeshStandardMaterial => m instanceof THREE.MeshStandardMaterial), compact);
        scene.add(model);
        if (config.architecture) {
          renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
          model.traverse(o=>{if(o instanceof THREE.Mesh){
            const ms=Array.isArray(o.material)?o.material:[o.material];
            o.castShadow=!ms.some(m=>m.transparent);o.receiveShadow=!o.userData.baked_diffuse;
            if(config.id==='forest-fold-house')prepareForestWater(o);
          }});
          architecturalSky=new THREE.HemisphereLight('#e4edf1','#333b28',.85);scene.add(architecturalSky);
          // Same source direction as the Blender afternoon: Z-up to Y-up.
          architecturalSun = new THREE.DirectionalLight('#ffebc5',3);architecturalSun.position.set(-14,15,16);
          architecturalSun.castShadow=true;architecturalSun.shadow.mapSize.set(compact?2048:4096,compact?2048:4096);architecturalSun.shadow.camera.left=-24;architecturalSun.shadow.camera.right=24;architecturalSun.shadow.camera.top=24;architecturalSun.shadow.camera.bottom=-24;architecturalSun.shadow.camera.far=100;architecturalSun.shadow.normalBias=.012;scene.add(architecturalSun);
          architecturalSun.shadow.camera.updateProjectionMatrix();
          // Static house/woodland: render this detailed map once, not on each
          // walking frame. Camera movement does not change sun-space shadows.
          renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
          // Capture the actual house/woodland once for bronze and glass. Baked
          // diffuse transport remains independent of this specular environment.
          environments.set(false,captureEnvironment(compact?128:256,[0,3,4]));
          scene.environment=environments.get(false)!.texture;
          const shape=new THREE.Shape([[-1.1,-6.8],[6.9,-6.8],[8.5,-5.4],[8.5,-1.6],[3,-1.6],[3,0],[.4,0],[.4,-3.8],[-1.1,-3.8]].map(([x,y])=>new THREE.Vector2(x,y)));
          reflection=createFloorReflection(compact,{geometry:new THREE.ShapeGeometry(shape),center:new THREE.Vector3(0,-.176,0),seamless:true,water:config.id==='forest-fold-house'});
        } else if (config.sculpture) {
          // Capture the actual baked architecture once. No external HDRI and no
          // repeated environment rebuild while the visitor changes views.
          const hidden: THREE.Mesh[] = [];
          model.traverse(object => { if(object instanceof THREE.Mesh && object.userData.artwork_id){object.visible=false;hidden.push(object);} });
          environment=captureEnvironment(128,[0,2.6,0]);scene.environment=environment.texture;hidden.forEach(o=>{o.visible=true;});
          scene.add(new THREE.HemisphereLight('#eef4ff','#9c8563',2.4));
          for (const [x,y,z] of [[-4,8,3],[17,6,-5],[8,8,-15]]) {
            const light=new THREE.DirectionalLight('#fff2da',2.2);light.position.set(x,y,z);light.target.position.set(x,0,z-2);scene.add(light,light.target);
          }
          const positions:number[]=[];model.updateMatrixWorld(true);
          model.traverse(object=>{if(!(object instanceof THREE.Mesh) || !object.userData.reflective_floor)return;
            const p=object.geometry.attributes.position,idx=object.geometry.index;
            for(let i=0;i<(idx?.count??p.count);i+=3){const vs=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(p,idx?idx.getX(i+j):i+j).applyMatrix4(object.matrixWorld));
              if(vs.every(v=>Math.abs(v.y)<.001)) for(const v of vs)positions.push(v.x,-v.z,0);
            }
          });
          const floor=new THREE.BufferGeometry();floor.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));floor.computeVertexNormals();
          reflection=createFloorReflection(compact,{geometry:floor,center:new THREE.Vector3(0,.002,0),seamless:true});
          if(gltf.animations.length){mixer=new THREE.AnimationMixer(model);gltf.animations.forEach(clip=>mixer!.clipAction(clip).play());}
        } else reflection = createFloorReflection(compact);
        if (reflection) scene.add(reflection);
        if (forestSky && reflection) {
          mirrors = createForestMirrors(compact,camera,reflection);
          scene.add(...mirrors.mirrors);
        }
        quality(false);
        walk.setEnabled(!cinematic); schedule();
      }).catch(error => { if (!disposed && error.name !== 'AbortError') onError(); });
    return () => {
      disposed = true; abort.abort(); cancelAnimationFrame(raf); clearTimeout(gpuTimer);
      if (gpuFence) gl.deleteSync(gpuFence);
      resize.disconnect(); controlsRef.current = null;
      canvas.removeEventListener('pointermove', schedule); canvas.removeEventListener('click', click);
      canvas.removeEventListener('pointerup', click);
      canvas.removeEventListener('pointercancel', blur); canvas.removeEventListener('blur', blur);
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('pointerdown', interrupt, true); canvas.removeEventListener('keydown', interrupt, true); canvas.removeEventListener('wheel', interrupt, true);
      window.removeEventListener('blur', windowBlur); document.removeEventListener('visibilitychange', visibility);
      motion.removeEventListener('change', schedule);
      mixer?.stopAllAction(); if(model)mixer?.uncacheRoot(model);environment?.dispose();
      environments.forEach(target => target.dispose()); forestSky?.dispose(); mirrors?.dispose(); forestNight?.dispose();
      walk.dispose(); orbit.dispose();
      if (model) disposeModel(model);
      walkMarker.geometry.dispose(); walkMarker.material.dispose(); portal?.dispose();
      reflection?.geometry.dispose(); reflection?.dispose(); renderer.dispose(); canvas.remove();
    };
  }, [controlsRef, onReady, onError, onRoom, onArtwork, onMode, onTour, onFlight, cinematic, config]);
  return <div ref={mount} className="obsidian__scene" data-showcase={config.id} role="region" aria-label={`${config.title} gallery`} />;
}
