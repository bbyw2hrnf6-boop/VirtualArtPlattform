import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import './scrollGalleryStory.css';

const CHAPTERS = [
  {
    eyebrow: '01 · Blueprint',
    title: 'Begin with a room.',
    body: 'Choose a considered architecture. AURA builds the working space directly in your browser.'
  },
  {
    eyebrow: '02 · Architecture',
    title: 'The shell takes shape.',
    body: 'Floor, walls, sightlines, and real placement surfaces arrive before a single work is hung.'
  },
  {
    eyebrow: '03 · Atmosphere',
    title: 'Curate the mood.',
    body: 'Tune material, floor, and light from a restrained set of exhibition-ready choices.'
  },
  {
    eyebrow: '04 · Artwork',
    title: 'Place with confidence.',
    body: 'Works land on clear wall positions, while scale and spacing stay visible and deliberate.'
  },
  {
    eyebrow: '05 · Arrange',
    title: 'Precise. Still simple.',
    body: 'Arrange from an overview, then refine the wall, height, and scale without leaving the room.'
  },
  {
    eyebrow: '06 · Walk preview',
    title: 'See what visitors see.',
    body: 'Switch to eye level and move through the exhibition before it leaves your studio.'
  },
  {
    eyebrow: '07 · Publish',
    title: 'One room. One link.',
    body: 'Review the finished gallery, publish it, and share a browser-based exhibition.'
  }
] as const;

const CHAPTER_CENTERS = [0.055, 0.205, 0.38, 0.565, 0.735, 0.85, 0.965] as const;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};
const easeOut = (value: number) => 1 - (1 - clamp01(value)) ** 3;
const between = (value: number, start: number, end: number) => clamp01((value - start) / (end - start));

function createArtworkTexture(index: number, compact: boolean) {
  const canvas = document.createElement('canvas');
  canvas.width = compact ? 256 : 512;
  canvas.height = compact ? 352 : 704;
  const context = canvas.getContext('2d');
  if (!context) return null;

  const width = canvas.width;
  const height = canvas.height;
  const palettes = [
    ['#d7c09a', '#6f422d', '#1e3231', '#eee4cd'],
    ['#c9d1c4', '#294d4b', '#b06d43', '#f0e9d8'],
    ['#c8b18d', '#222623', '#8b4838', '#e8dfc8'],
    ['#9aa7a0', '#343c3b', '#d9af68', '#eee5d2']
  ] as const;
  const [base, dark, accent, light] = palettes[index % palettes.length];
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, light);
  gradient.addColorStop(0.52, base);
  gradient.addColorStop(1, dark);
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.globalAlpha = 0.92;
  context.fillStyle = accent;
  context.beginPath();
  context.ellipse(width * (0.35 + index * 0.05), height * 0.36, width * 0.31, height * 0.18, -0.45 + index * 0.16, 0, Math.PI * 2);
  context.fill();

  context.globalAlpha = 0.78;
  context.fillStyle = light;
  context.beginPath();
  context.moveTo(width * 0.08, height * 0.72);
  context.bezierCurveTo(width * 0.3, height * 0.48, width * 0.58, height * 0.94, width * 0.94, height * 0.59);
  context.lineTo(width, height);
  context.lineTo(0, height);
  context.closePath();
  context.fill();

  context.globalAlpha = 0.5;
  context.strokeStyle = dark;
  context.lineWidth = Math.max(2, width * 0.012);
  for (let line = 0; line < 5; line += 1) {
    const offset = line * width * 0.13;
    context.beginPath();
    context.moveTo(-width * 0.1 + offset, height * 0.08);
    context.lineTo(width * 0.48 + offset, height * 0.95);
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  return texture;
}

type CameraKeyframe = {
  at: number;
  position: THREE.Vector3;
  target: THREE.Vector3;
};

function cameraPose(progress: number, keyframes: CameraKeyframe[], position: THREE.Vector3, target: THREE.Vector3) {
  let nextIndex = keyframes.findIndex((keyframe) => keyframe.at >= progress);
  if (nextIndex < 0) nextIndex = keyframes.length - 1;
  if (nextIndex === 0) {
    position.copy(keyframes[0].position);
    target.copy(keyframes[0].target);
    return;
  }
  const previous = keyframes[nextIndex - 1];
  const next = keyframes[nextIndex];
  const local = smooth(between(progress, previous.at, next.at));
  position.lerpVectors(previous.position, next.position, local);
  target.lerpVectors(previous.target, next.target, local);
}

export function ScrollGalleryStory() {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chapterRefs = useRef<Array<HTMLElement | null>>([]);
  const arrangeUiRef = useRef<HTMLDivElement>(null);
  const viewUiRef = useRef<HTMLDivElement>(null);
  const publishUiRef = useRef<HTMLDivElement>(null);
  const createLinkRef = useRef<HTMLAnchorElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    if (!section || !canvas) return undefined;

    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const compactQuery = window.matchMedia('(max-width: 720px)');
    const compact = compactQuery.matches;
    const reducedMotion = reducedMotionQuery.matches;
    let renderer: THREE.WebGLRenderer;

    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: !compact,
        alpha: false,
        depth: true,
        powerPreference: 'high-performance'
      });
    } catch (error) {
      console.error('Landing gallery preview could not start.', error);
      section.dataset.webgl = 'unavailable';
      section.dataset.motion = 'reduced';
      publishUiRef.current?.setAttribute('aria-hidden', 'false');
      if (createLinkRef.current) createLinkRef.current.tabIndex = 0;
      if (statusRef.current) statusRef.current.textContent = 'The 3D preview is unavailable. The complete workflow is described below.';
      return undefined;
    }

    section.dataset.webgl = 'ready';
    section.dataset.motion = reducedMotion ? 'reduced' : 'full';
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
    renderer.shadowMap.enabled = !compact;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      section.dataset.webgl = 'unavailable';
      section.dataset.motion = 'reduced';
      publishUiRef.current?.setAttribute('aria-hidden', 'false');
      if (createLinkRef.current) createLinkRef.current.tabIndex = 0;
      if (statusRef.current) statusRef.current.textContent = 'The 3D preview stopped. The complete workflow remains available below.';
    };
    canvas.addEventListener('webglcontextlost', handleContextLost);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#111411');
    scene.fog = new THREE.Fog('#111411', 16, 31);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
    const room = new THREE.Group();
    room.name = 'LandingStoryRoom';
    scene.add(room);

    const blueprint = new THREE.Group();
    blueprint.name = 'Blueprint';
    room.add(blueprint);
    const grid = new THREE.GridHelper(20, compact ? 12 : 24, '#d9ff43', '#526052');
    grid.position.y = 0.012;
    blueprint.add(grid);
    const gridMaterial = grid.material as THREE.Material;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.52;
    gridMaterial.depthWrite = false;

    const outlineGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-7, 0.03, -5), new THREE.Vector3(7, 0.03, -5),
      new THREE.Vector3(7, 0.03, -5), new THREE.Vector3(7, 0.03, 5),
      new THREE.Vector3(7, 0.03, 5), new THREE.Vector3(-7, 0.03, 5),
      new THREE.Vector3(-7, 0.03, 5), new THREE.Vector3(-7, 0.03, -5),
      new THREE.Vector3(-7, 0.03, -5), new THREE.Vector3(-7, 5, -5),
      new THREE.Vector3(7, 0.03, -5), new THREE.Vector3(7, 5, -5),
      new THREE.Vector3(-7, 5, -5), new THREE.Vector3(7, 5, -5),
      new THREE.Vector3(-7, 5, -5), new THREE.Vector3(-7, 5, 5),
      new THREE.Vector3(7, 5, -5), new THREE.Vector3(7, 5, 5)
    ]);
    const outlineMaterial = new THREE.LineBasicMaterial({ color: '#d9ff43', transparent: true, opacity: 0.86 });
    const outline = new THREE.LineSegments(outlineGeometry, outlineMaterial);
    blueprint.add(outline);

    const wallMaterial = new THREE.MeshStandardMaterial({ color: '#70756c', roughness: 0.98, metalness: 0 });
    const floorMaterial = new THREE.MeshStandardMaterial({ color: '#4c514b', roughness: 0.96, metalness: 0 });
    const trimMaterial = new THREE.MeshStandardMaterial({ color: '#181b18', roughness: 0.62, metalness: 0.12 });
    const shell = new THREE.Group();
    shell.name = 'Shell';
    room.add(shell);

    const floor = new THREE.Mesh(new THREE.BoxGeometry(14, 0.16, 10), floorMaterial);
    floor.name = 'Floor';
    floor.receiveShadow = true;
    floor.position.set(0, -0.08, 0);
    shell.add(floor);

    const backWall = new THREE.Mesh(new THREE.BoxGeometry(14.25, 5, 0.22), wallMaterial);
    backWall.name = 'WallBack';
    backWall.position.set(0, 2.5, -5);
    backWall.receiveShadow = true;
    shell.add(backWall);

    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.22, 5, 10.2), wallMaterial);
    leftWall.name = 'WallLeft';
    leftWall.position.set(-7, 2.5, 0);
    leftWall.receiveShadow = true;
    shell.add(leftWall);

    const rightWall = leftWall.clone();
    rightWall.name = 'WallRight';
    rightWall.position.x = 7;
    shell.add(rightWall);

    const ribs = new THREE.Group();
    ribs.name = 'CeilingRibs';
    for (let ribIndex = 0; ribIndex < (compact ? 3 : 5); ribIndex += 1) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(14.2, 0.12, 0.18), trimMaterial);
      rib.position.set(0, 4.94, -4 + ribIndex * (compact ? 3.5 : 2));
      // Repeated ceiling ribs read as oversized jagged bands on the wall at
      // scroll-story camera distances. The architectural frame still catches
      // light, while the key objects retain contact shadows.
      rib.castShadow = false;
      ribs.add(rib);
    }
    shell.add(ribs);

    const baseboard = new THREE.Mesh(new THREE.BoxGeometry(14.05, 0.13, 0.12), trimMaterial);
    baseboard.position.set(0, 0.08, -4.84);
    shell.add(baseboard);

    const artGroup = new THREE.Group();
    artGroup.name = 'ArtAnchors';
    room.add(artGroup);
    const artworkSpecs = compact
      ? [
          { x: -3.7, y: 2.45, width: 2.1, height: 2.7 },
          { x: 0, y: 2.5, width: 1.8, height: 2.45 },
          { x: 3.6, y: 2.35, width: 2.25, height: 2.9 }
        ]
      : [
          { x: -4.85, y: 2.42, width: 1.85, height: 2.65 },
          { x: -1.75, y: 2.5, width: 2.35, height: 3.05 },
          { x: 1.65, y: 2.35, width: 1.7, height: 2.35 },
          { x: 4.75, y: 2.5, width: 2.15, height: 2.9 }
        ];
    const artworkObjects: THREE.Group[] = [];
    const snapMaterials: THREE.MeshBasicMaterial[] = [];
    const artworkTextures: THREE.Texture[] = [];

    artworkSpecs.forEach((spec, index) => {
      const artwork = new THREE.Group();
      artwork.name = `ArtAnchor_${String(index + 1).padStart(2, '0')}`;
      artwork.userData.finalX = spec.x;
      artwork.userData.finalY = spec.y;
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(spec.width + 0.14, spec.height + 0.14, 0.1),
        trimMaterial
      );
      frame.castShadow = !compact;
      const texture = createArtworkTexture(index, compact);
      if (texture) artworkTextures.push(texture);
      const imageMaterial = new THREE.MeshBasicMaterial({ map: texture, color: texture ? '#ffffff' : '#8f7254', toneMapped: false });
      const image = new THREE.Mesh(new THREE.PlaneGeometry(spec.width, spec.height), imageMaterial);
      image.position.z = 0.056;
      artwork.add(frame, image);

      const guideMaterial = new THREE.MeshBasicMaterial({ color: '#d9ff43', transparent: true, opacity: 0 });
      snapMaterials.push(guideMaterial);
      const horizontalGuide = new THREE.Mesh(new THREE.PlaneGeometry(spec.width + 0.54, 0.018), guideMaterial);
      horizontalGuide.position.z = 0.063;
      const verticalGuide = new THREE.Mesh(new THREE.PlaneGeometry(0.018, spec.height + 0.54), guideMaterial);
      verticalGuide.position.z = 0.064;
      artwork.add(horizontalGuide, verticalGuide);
      artwork.position.set(spec.x, spec.y, -4.82);
      artwork.visible = false;
      artworkObjects.push(artwork);
      artGroup.add(artwork);
    });

    const decor = new THREE.Group();
    decor.name = 'CuratedObjects';
    room.add(decor);
    const stoneMaterial = new THREE.MeshStandardMaterial({ color: '#bcb4a3', roughness: 0.88, metalness: 0.02 });
    const bronzeMaterial = new THREE.MeshStandardMaterial({ color: '#765538', roughness: 0.36, metalness: 0.55 });
    const pedestal = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.25, 1.05), stoneMaterial);
    pedestal.position.set(3.8, 0.62, 1.15);
    pedestal.castShadow = !compact;
    pedestal.receiveShadow = true;
    const sculpture = new THREE.Mesh(new THREE.TorusKnotGeometry(0.38, 0.105, compact ? 44 : 72, 9), bronzeMaterial);
    sculpture.position.set(3.8, 1.65, 1.15);
    sculpture.rotation.set(0.18, -0.5, 0.32);
    sculpture.castShadow = !compact;
    const benchSeat = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.22, 0.8), trimMaterial);
    benchSeat.position.set(-2.25, 0.58, 1.25);
    benchSeat.castShadow = !compact;
    const benchLegGeometry = new THREE.BoxGeometry(0.18, 0.5, 0.62);
    const leftLeg = new THREE.Mesh(benchLegGeometry, trimMaterial);
    leftLeg.position.set(-3.25, 0.28, 1.25);
    const rightLeg = leftLeg.clone();
    rightLeg.position.x = -1.25;
    decor.add(pedestal, sculpture, benchSeat, leftLeg, rightLeg);

    const hemisphere = new THREE.HemisphereLight('#e9eff0', '#27251f', 0.38);
    scene.add(hemisphere);
    const keyLight = new THREE.DirectionalLight('#fff3db', 1.2);
    keyLight.position.set(-3.5, 8, 7);
    keyLight.castShadow = !compact;
    keyLight.shadow.mapSize.set(compact ? 512 : 1024, compact ? 512 : 1024);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 30;
    keyLight.shadow.camera.left = -10;
    keyLight.shadow.camera.right = 10;
    keyLight.shadow.camera.top = 9;
    keyLight.shadow.camera.bottom = -9;
    keyLight.shadow.bias = -0.00045;
    keyLight.shadow.normalBias = 0.035;
    keyLight.shadow.radius = 2;
    scene.add(keyLight);

    const galleryLight = new THREE.RectAreaLight('#fff0d6', 3.4, 7, 4);
    galleryLight.position.set(0, 4.72, 0.8);
    galleryLight.rotation.x = -Math.PI / 2;
    scene.add(galleryLight);

    const artLights: THREE.SpotLight[] = [];
    artworkSpecs.forEach((spec, index) => {
      const spot = new THREE.SpotLight('#fff1d8', compact ? 5 : 8, 12, 0.42, 0.6, 1.5);
      spot.position.set(spec.x * 0.76, 4.72, -1.9);
      spot.target.position.set(spec.x, spec.y, -5);
      spot.castShadow = false;
      spot.name = `ArtworkLight_${index + 1}`;
      scene.add(spot, spot.target);
      artLights.push(spot);
    });

    const wallStart = new THREE.Color('#697069');
    const wallEnd = new THREE.Color('#ded8ca');
    const floorStart = new THREE.Color('#3e4540');
    const floorEnd = new THREE.Color('#786e60');
    const cameraPosition = new THREE.Vector3();
    const cameraTarget = new THREE.Vector3();
    const cameraKeyframes: CameraKeyframe[] = [
      { at: 0, position: new THREE.Vector3(9.8, 10.5, 14.8), target: new THREE.Vector3(0, 0.25, -0.8) },
      { at: 0.3, position: new THREE.Vector3(8.2, 6.7, 13.2), target: new THREE.Vector3(0, 2.15, -1.2) },
      { at: 0.58, position: new THREE.Vector3(6.1, 4.9, 10.2), target: new THREE.Vector3(0, 2.15, -2.4) },
      { at: 0.79, position: new THREE.Vector3(4.8, 4.15, 8.5), target: new THREE.Vector3(0, 2.25, -3.1) },
      { at: 0.9, position: new THREE.Vector3(0.2, 1.75, 4.5), target: new THREE.Vector3(0, 2.05, -4.1) },
      { at: 1, position: new THREE.Vector3(0, 1.75, 3.55), target: new THREE.Vector3(0, 2.1, -4.4) }
    ];

    let width = 0;
    let height = 0;
    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.round(bounds.width));
      const nextHeight = Math.max(1, Math.round(bounds.height));
      if (nextWidth === width && nextHeight === height) return;
      width = nextWidth;
      height = nextHeight;
      const lowPower = (navigator.hardwareConcurrency || 4) <= 4;
      const dprCap = compact || lowPower ? 1.2 : 1.65;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const updateChapterCopy = (progress: number) => {
      chapterRefs.current.forEach((chapter, index) => {
        if (!chapter) return;
        const center = CHAPTER_CENTERS[index];
        const radius = index === CHAPTER_CENTERS.length - 1 ? 0.105 : 0.115;
        let opacity = clamp01(1 - Math.abs(progress - center) / radius);
        opacity = smooth(opacity);
        if (index === 0 && progress < center) opacity = 1;
        if (index === CHAPTER_CENTERS.length - 1 && progress > center) opacity = 1;
        chapter.style.opacity = opacity.toFixed(3);
        chapter.style.transform = `translate3d(0, ${(1 - opacity) * 18}px, 0)`;
      });
    };

    const setUiVisibility = (element: HTMLElement | null, opacity: number, y = 12) => {
      if (!element) return;
      element.style.opacity = opacity.toFixed(3);
      const x = element === viewUiRef.current ? '-50%' : '0';
      element.style.transform = `translate3d(${x}, ${(1 - opacity) * y}px, 0)`;
    };

    const renderProgress = (rawProgress: number) => {
      const progress = reducedMotion ? 1 : clamp01(rawProgress);
      section.style.setProperty('--sgs-progress', progress.toFixed(4));
      updateChapterCopy(progress);

      const floorBuild = smooth(between(progress, 0.1, 0.2));
      const backBuild = smooth(between(progress, 0.145, 0.255));
      const sideBuild = smooth(between(progress, 0.19, 0.305));
      floor.scale.set(Math.max(0.002, floorBuild), 1, Math.max(0.002, floorBuild));
      floor.position.z = -5 + 5 * floorBuild;
      backWall.scale.set(Math.max(0.002, backBuild), Math.max(0.002, backBuild), 1);
      backWall.position.y = 2.5 * backBuild;
      leftWall.scale.set(1, Math.max(0.002, sideBuild), Math.max(0.002, sideBuild));
      rightWall.scale.copy(leftWall.scale);
      leftWall.position.set(-7, 2.5 * sideBuild, -5 + 5 * sideBuild);
      rightWall.position.set(7, 2.5 * sideBuild, -5 + 5 * sideBuild);
      ribs.scale.set(Math.max(0.002, sideBuild), Math.max(0.002, sideBuild), Math.max(0.002, sideBuild));
      ribs.visible = sideBuild > 0.01;
      baseboard.scale.x = Math.max(0.002, backBuild);

      const materialProgress = smooth(between(progress, 0.3, 0.48));
      wallMaterial.color.lerpColors(wallStart, wallEnd, materialProgress);
      wallMaterial.roughness = 0.98 - materialProgress * 0.08;
      floorMaterial.color.lerpColors(floorStart, floorEnd, materialProgress);
      floorMaterial.roughness = 0.96 - materialProgress * 0.2;
      hemisphere.intensity = 0.3 + materialProgress * 0.62;
      keyLight.intensity = 0.22 + materialProgress * 1.25;
      galleryLight.intensity = materialProgress * 3.4;
      artLights.forEach((light) => { light.intensity = materialProgress * (compact ? 5 : 8); });

      const blueprintFade = 1 - smooth(between(progress, 0.1, 0.34));
      blueprint.visible = blueprintFade > 0.002;
      gridMaterial.opacity = blueprintFade * 0.52;
      outlineMaterial.opacity = blueprintFade * 0.86;

      artworkObjects.forEach((artwork, index) => {
        const artProgress = easeOut(between(progress, 0.47 + index * 0.034, 0.6 + index * 0.025));
        artwork.visible = artProgress > 0.001;
        const finalX = Number(artwork.userData.finalX);
        const finalY = Number(artwork.userData.finalY);
        const entryDirection = index % 2 ? 1 : -1;
        artwork.position.x = finalX + entryDirection * (1 - artProgress) * 1.05;
        artwork.position.y = finalY + (1 - artProgress) * 0.42;
        artwork.position.z = -4.82 + (1 - artProgress) * 0.55;
        artwork.rotation.z = entryDirection * (1 - artProgress) * 0.055;
        artwork.scale.setScalar(0.94 + artProgress * 0.06);
        const guideIn = smooth(between(progress, 0.5 + index * 0.025, 0.57 + index * 0.025));
        const guideOut = 1 - smooth(between(progress, 0.63, 0.69));
        snapMaterials[index].opacity = guideIn * guideOut * 0.76;
      });

      const decorProgress = easeOut(between(progress, 0.57, 0.71));
      decor.visible = decorProgress > 0.002;
      decor.scale.setScalar(Math.max(0.002, decorProgress));
      decor.position.y = -(1 - decorProgress) * 0.22;

      const arrangeIn = smooth(between(progress, 0.66, 0.72));
      const arrangeOut = 1 - smooth(between(progress, 0.79, 0.825));
      setUiVisibility(arrangeUiRef.current, arrangeIn * arrangeOut, 16);
      const viewIn = smooth(between(progress, 0.765, 0.82));
      const viewOut = 1 - smooth(between(progress, 0.895, 0.925));
      setUiVisibility(viewUiRef.current, viewIn * viewOut, -10);
      if (viewUiRef.current) viewUiRef.current.dataset.mode = progress >= 0.84 ? 'walk' : 'arrange';
      const publishIn = smooth(between(progress, 0.895, 0.955));
      setUiVisibility(publishUiRef.current, publishIn, 18);
      if (publishUiRef.current) publishUiRef.current.setAttribute('aria-hidden', publishIn > 0.55 ? 'false' : 'true');
      if (createLinkRef.current) createLinkRef.current.tabIndex = publishIn > 0.55 ? 0 : -1;

      cameraPose(progress, cameraKeyframes, cameraPosition, cameraTarget);
      camera.position.copy(cameraPosition);
      camera.lookAt(cameraTarget);
      renderer.render(scene, camera);
    };

    let frame = 0;
    const readProgress = () => {
      frame = 0;
      resize();
      if (reducedMotion) {
        renderProgress(1);
        return;
      }
      const bounds = section.getBoundingClientRect();
      const travel = Math.max(1, bounds.height - window.innerHeight);
      renderProgress(-bounds.top / travel);
    };
    const requestRender = () => {
      if (!frame) frame = window.requestAnimationFrame(readProgress);
    };

    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(requestRender);
    resizeObserver?.observe(canvas);
    window.addEventListener('scroll', requestRender, { passive: true });
    window.addEventListener('resize', requestRender, { passive: true });
    readProgress();

    return () => {
      window.removeEventListener('scroll', requestRender);
      window.removeEventListener('resize', requestRender);
      resizeObserver?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      });
      artworkTextures.forEach((texture) => texture.dispose());
      renderer.dispose();
      delete section.dataset.webgl;
      delete section.dataset.motion;
    };
  }, []);

  return (
    <section className="sgs" ref={sectionRef} aria-labelledby="sgs-title">
      <h2 className="visually-hidden" id="sgs-title">Build a browser-based virtual exhibition</h2>
      <div className="sgs__sticky">
        <div className="sgs__visual">
          <canvas ref={canvasRef} aria-hidden="true" />
          <div className="sgs__fallback" aria-hidden="true">
            <div className="sgs__fallback-room"><i /><i /><i /></div>
          </div>
          <div className="sgs__vignette" aria-hidden="true" />
        </div>

        <div className="sgs__topline" aria-hidden="true">
          <span>AURA / REAL-TIME WEBGL BUILDER</span>
          <span className="sgs__progress-track"><i /></span>
          <span>SCROLL TO BUILD</span>
        </div>

        <div className="sgs__chapters" aria-hidden="true">
          {CHAPTERS.map((chapter, index) => (
            <article key={chapter.eyebrow} ref={(element) => { chapterRefs.current[index] = element; }}>
              <p>{chapter.eyebrow}</p>
              <h2>{chapter.title}</h2>
              <span>{chapter.body}</span>
            </article>
          ))}
        </div>

        <div className="sgs__arrange-ui" ref={arrangeUiRef} aria-hidden="true">
          <div className="sgs__arrange-head"><span>Artwork 03</span><i>Saved</i></div>
          <div className="sgs__wall-row"><b>Back wall</b><span>03 / 08</span></div>
          <div className="sgs__control"><span>Horizontal</span><i><b /></i><em>1.65 m</em></div>
          <div className="sgs__control"><span>Height</span><i><b /></i><em>2.35 m</em></div>
          <div className="sgs__control"><span>Scale</span><i><b /></i><em>100%</em></div>
          <p><b>+</b> Drag to refine · aligned to wall</p>
        </div>

        <div className="sgs__view-ui" ref={viewUiRef} data-mode="arrange" aria-hidden="true">
          <span>Arrange</span><span>Walk preview</span>
        </div>

        <div className="sgs__publish-ui" ref={publishUiRef} aria-hidden="true">
          <p><i>✓</i> Gallery ready</p>
          <h3>Make space for your art.</h3>
          <span>Choose a room and add your artwork. No 3D software required.</span>
          <a ref={createLinkRef} href="#/create/white-cube/demo" tabIndex={-1}>Try with demo art <b>↗</b></a>
        </div>

        <p className="sgs__status visually-hidden" ref={statusRef}>
          Scroll-linked preview of an AURA room moving from blueprint to a published exhibition.
        </p>
      </div>

      <ol className="sgs__accessible-sequence visually-hidden">
        {CHAPTERS.map((chapter) => <li key={chapter.eyebrow}><strong>{chapter.title}</strong> {chapter.body}</li>)}
      </ol>
    </section>
  );
}
