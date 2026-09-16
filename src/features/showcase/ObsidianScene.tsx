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
}

export default function ObsidianScene({ controlsRef, onReady, onError, onRoom, onArtwork, onMode, config = obsidianConfig }: {
  config?: ShowcaseSceneConfig;
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
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = 1;
    const canvas = renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', `Explore ${config.title}. ${VISITOR_KEYBOARD_HINT}. Drag to look, tap the floor to walk, pinch or scroll to zoom.`);
    host.append(canvas);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(config.architecture ? '#acb7bb' : config.sculpture ? '#cac2b2' : '#100e0b');
    const walkMarker = new THREE.Mesh(new THREE.RingGeometry(.18, .25, 32), new THREE.MeshBasicMaterial({
      color: '#d9ff43', transparent: true, opacity: .78, side: THREE.DoubleSide, depthWrite: false,
    }));
    walkMarker.rotation.x = -Math.PI / 2;
    walkMarker.visible = false;
    scene.add(walkMarker);
    const camera = new THREE.PerspectiveCamera(defaultWalkFov(compact), 1, .04, 180);
    camera.position.fromArray(config.rooms[0].start);
    camera.lookAt(new THREE.Vector3().fromArray(config.rooms[0].look ?? [5,1.75,-3.6]));
    let currentRoom = 0, raf = 0, frames = 0, paused = false, scheduledAt = 0;
    let mode: ObsidianMode = 'walk';
    let model: THREE.Group | undefined;
    const modelTextures = new Set<THREE.Texture>();
    let reflection: ReturnType<typeof createFloorReflection> | undefined;
    const overview = { value: false };
    const savedWalk = { position: camera.position.clone(), quaternion: camera.quaternion.clone() };
    const ray = new THREE.Raycaster();
    const schedule = () => { if (!disposed && !raf && !document.hidden) { scheduledAt = performance.now(); raf = requestAnimationFrame(render); } };
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
      walk.setEnabled(!value && mode === 'walk' && Boolean(model));
      orbit.enabled = !value && mode === 'overview';
      schedule();
    };
    controlsRef.current = {
      room: resetWalk,
      mode: switchMode,
      reset: () => { if (mode === 'overview') fitOverview(); else resetWalk(currentRoom); schedule(); },
      zoom: direction => { if (mode === 'walk') { walk.zoom(direction); canvas.focus({ preventScroll: true }); schedule(); return; }
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
    let mixer: THREE.AnimationMixer | undefined, environment: THREE.WebGLRenderTarget | undefined;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let animationTime = performance.now();
    let slowFrames = 0, reducedResolution = false, warmupFrames = 3, renderCost = 0;
    const balancedPixelRatio = () => Math.min(devicePixelRatio, 1, Math.sqrt(600_000 / Math.max(1, host.clientWidth * host.clientHeight)));
    const quality = (full: boolean) => {
      renderer.setPixelRatio(full ? Math.min(Math.max(devicePixelRatio, compact ? 1 : 1.5), 2) : balancedPixelRatio());
      const size = full ? compact ? 1024 : 2048 : 512;
      if (reflection) {
        reflection.getRenderTarget().samples = full && !compact ? 2 : 0;
        reflection.getRenderTarget().setSize(size, size);
        (reflection.material as THREE.ShaderMaterial).uniforms.texel.value.set(1 / size, 1 / size);
      }
      const anisotropy = Math.min(full ? 16 : 4, renderer.capabilities.getMaxAnisotropy());
      modelTextures.forEach(texture => { texture.anisotropy = anisotropy; });
    };
    function render() {
      const now = performance.now();
      // Calibrate with two bounded frames before supersampling. A full-size
      // first reflection can block a software GPU before adaptation can run.
      // Include synchronous drawing as well as queued GPU latency. Measuring
      // only the next RAF wait misses software renderers that block render().
      // Idle time stays excluded; the same measurement applies to every device.
      const slow = now - scheduledAt + renderCost > 150;
      if (model && warmupFrames) {
        // The first draw also compiles shaders/uploads textures. Measure the
        // second bounded draw so one-time preparation does not demote fast GPUs.
        if (warmupFrames < 2 && slow) slowFrames++;
        if (--warmupFrames === 0) {
          reducedResolution = slowFrames > 0;
          if (!reducedResolution) quality(true);
          slowFrames = 0;
        }
      } else if (!reducedResolution && model && slow) {
        if (++slowFrames >= 2) { reducedResolution = true; quality(false); }
      } else slowFrames = 0;
      raf = 0;
      if (disposed || document.hidden) return;
      // Orbit owns the camera in Overview; Walk must not apply its FOV easing.
      if (mode === 'walk' && !paused) walk.update();
      const orbitMoving = orbit.enabled && orbit.update();
      const room = config.roomAt(camera.position);
      if (mode === 'walk' && room !== currentRoom) { currentRoom = room; onRoom(room); }
      host.dataset.position = camera.position.toArray().map(v => v.toFixed(3)).join(',');
      host.dataset.fov = camera.fov.toFixed(2);
      host.dataset.pitch = camera.rotation.x.toFixed(4);
      host.dataset.yaw = camera.rotation.y.toFixed(4);
      host.dataset.mode = mode;
      host.dataset.destination = String(walk.hasDestination());
      walkMarker.visible = mode === 'walk' && walk.hasDestination();
      host.dataset.frames = String(++frames);
      host.dataset.reflection = reflection?.visible ? 'planar' : 'off';
      const animate = Boolean(mixer && !motion.matches && !paused && room === 2 && mode === 'walk');
      if (animate) mixer!.update(Math.min((now-animationTime)/1000,.1));
      animationTime = now; host.dataset.animation = animate ? 'playing' : 'paused';
      if(mixer)host.dataset.animationTime=mixer.time.toFixed(3);
      renderer.render(scene, camera);
      renderCost = performance.now() - now;
      const moving = Boolean(warmupFrames && model) || animate || (!paused && (mode === 'walk' ? walk.needsUpdate() : orbitMoving));
      host.dataset.idle = String(!moving);
      host.dataset.resolution = warmupFrames ? 'warming' : reducedResolution ? 'balanced' : 'full';
      if (moving) schedule();
    }
    const resize = new ResizeObserver(() => {
      if (!host.clientWidth || !host.clientHeight) return;
      if (warmupFrames || reducedResolution) renderer.setPixelRatio(balancedPixelRatio());
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
      if (event.button !== 0 || paused || !model || mode !== 'walk' || !walk.consumeClick()) return;
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
    const blur = () => { walk.setEnabled(false); if (!paused && mode === 'walk' && model) walk.setEnabled(true); schedule(); };
    const visibility = () => { blur(); if (!document.hidden) schedule(); };
    // Pointer look and pinch mutate camera state inside the shared controller.
    canvas.addEventListener('pointermove', schedule); canvas.addEventListener('click', click);
    canvas.addEventListener('pointerup', click);
    canvas.addEventListener('pointercancel', blur); canvas.addEventListener('blur', blur);
    canvas.addEventListener('webglcontextlost', lost);
    motion.addEventListener('change', schedule);
    window.addEventListener('blur', blur); document.addEventListener('visibilitychange', visibility);
    const abort = new AbortController();
    fetch(`/assets/showcases/${config.id}/${config.id}-${compact ? 'mobile' : 'desktop'}.glb${config.assetVersion ?? ''}`, { signal: abort.signal })
      .then(response => { if (!response.ok) throw new Error('Missing showcase'); return response.arrayBuffer(); })
      .then(buffer => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buffer, `/assets/showcases/${config.id}/`))
      .then(gltf => {
        if (disposed) { disposeModel(gltf.scene); return; }
        model = gltf.scene;
        const materials = new Set<THREE.Material>(), artworkMaterials = new Set<THREE.Material>();
        model.traverse(object => {
          // glTF multi-material nodes become Groups with untagged child meshes.
          object.userData.artwork_id ??= object.parent?.userData.artwork_id;
          object.userData.walk_surface ??= object.parent?.userData.walk_surface;
          if (!(object instanceof THREE.Mesh)) return;
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            materials.add(material);
            if (object.userData.artwork_id) artworkMaterials.add(material);
          }
        });
        materials.forEach(material => {
          Object.values(material).forEach(value => { if (value instanceof THREE.Texture) modelTextures.add(value); });
          // Cut roofs, glazing and coves together; retain full-height sculptures.
          if (!config.architecture && (!config.sculpture || !artworkMaterials.has(material))) installOverviewCutaway(material, overview, config.sculpture ? 1 : undefined);
        });
        scene.add(model);
        if (config.architecture) {
          renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
          model.traverse(o=>{if(o instanceof THREE.Mesh){
            const ms=Array.isArray(o.material)?o.material:[o.material];
            o.castShadow=!ms.some(m=>m.transparent);o.receiveShadow=!o.userData.baked_diffuse;
          }});
          scene.add(new THREE.HemisphereLight('#f1f4e9','#6c7256',2));
          const sun = new THREE.DirectionalLight('#ffebc5',2.5);sun.position.set(-12,18,14);
          sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-24;sun.shadow.camera.right=24;sun.shadow.camera.top=24;sun.shadow.camera.bottom=-24;sun.shadow.camera.far=80;sun.shadow.normalBias=.025;scene.add(sun);
          // Capture the actual house/woodland once for bronze and glass. Baked
          // diffuse transport remains independent of this specular environment.
          const cube=new THREE.WebGLCubeRenderTarget(128,{type:THREE.HalfFloatType});
          const probe=new THREE.CubeCamera(.1,160,cube);probe.position.set(0,3,4);probe.update(renderer,scene);
          const pmrem=new THREE.PMREMGenerator(renderer);environment=pmrem.fromCubemap(cube.texture);scene.environment=environment.texture;pmrem.dispose();cube.dispose();
          const shape=new THREE.Shape([[-1.1,-6.8],[6.9,-6.8],[8.5,-5.4],[8.5,-1.6],[3,-1.6],[3,0],[.4,0],[.4,-3.8],[-1.1,-3.8]].map(([x,y])=>new THREE.Vector2(x,y)));
          reflection=createFloorReflection(compact,{geometry:new THREE.ShapeGeometry(shape),center:new THREE.Vector3(0,-.176,0),seamless:true});
        } else if (config.sculpture) {
          // Capture the actual baked architecture once. No external HDRI and no
          // repeated environment rebuild while the visitor changes views.
          const hidden: THREE.Mesh[] = [];
          model.traverse(object => { if(object instanceof THREE.Mesh && object.userData.artwork_id){object.visible=false;hidden.push(object);} });
          const cube = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
          const probe = new THREE.CubeCamera(.1,100,cube);probe.position.set(0,2.6,0);probe.update(renderer,scene);
          const pmrem=new THREE.PMREMGenerator(renderer);environment=pmrem.fromCubemap(cube.texture);scene.environment=environment.texture;pmrem.dispose();cube.dispose();hidden.forEach(o=>{o.visible=true;});
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
        quality(false);
        host.dataset.ready = 'true'; walk.setEnabled(true); schedule(); onReady();
        canvas.focus({ preventScroll: true });
      }).catch(error => { if (!disposed && error.name !== 'AbortError') onError(); });
    return () => {
      disposed = true; abort.abort(); cancelAnimationFrame(raf); resize.disconnect(); controlsRef.current = null;
      canvas.removeEventListener('pointermove', schedule); canvas.removeEventListener('click', click);
      canvas.removeEventListener('pointerup', click);
      canvas.removeEventListener('pointercancel', blur); canvas.removeEventListener('blur', blur);
      canvas.removeEventListener('webglcontextlost', lost);
      window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility);
      motion.removeEventListener('change', schedule);
      mixer?.stopAllAction(); if(model)mixer?.uncacheRoot(model);environment?.dispose();
      walk.dispose(); orbit.dispose();
      if (model) disposeModel(model);
      walkMarker.geometry.dispose(); walkMarker.material.dispose();
      reflection?.geometry.dispose(); reflection?.dispose(); renderer.dispose(); canvas.remove();
    };
  }, [controlsRef, onReady, onError, onRoom, onArtwork, onMode, config]);
  return <div ref={mount} className="obsidian__scene" role="region" aria-label={`${config.title} gallery`} />;
}
