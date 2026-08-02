import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import './scrollGalleryStory.css';

const CHAPTERS = [
  {
    eyebrow: 'Act I · First light',
    title: 'Your art deserves more than a page.',
    body: 'A room begins as one precise line of light.'
  },
  {
    eyebrow: '01 · Blueprint',
    title: 'Start without 3D knowledge.',
    body: 'Dimensions, axes, and real placement surfaces make the space legible.'
  },
  {
    eyebrow: '02 · Architecture',
    title: 'An idea becomes a real room.',
    body: 'Floor, walls, opening, and ceiling grow from one connected plan.'
  },
  {
    eyebrow: '03 · Atmosphere',
    title: 'Curate atmosphere, not just walls.',
    body: 'Three distinct material and light directions resolve into one exhibition.'
  },
  {
    eyebrow: 'Act II · Artwork',
    title: 'Every work finds its place.',
    body: 'A floating collection settles to eye line with measured spacing and snap guides.'
  },
  {
    eyebrow: '04 · Arrange',
    title: 'Precise. Direct. Safe.',
    body: 'Drag, scale, align, and undo without losing the room or the work.'
  },
  {
    eyebrow: '05 · Responsive space',
    title: 'The room works for your art.',
    body: 'Spots find each work while sculpture, pedestal, and shadow settle together.'
  },
  {
    eyebrow: 'Act III · Walk preview',
    title: 'Experience it as a visitor.',
    body: 'The tool recedes as the camera arrives at a true 1.75 metre eye level.'
  },
  {
    eyebrow: '06 · Live product',
    title: 'Enter the exhibition.',
    body: 'You are already inside: look around, move, and select an artwork.'
  }
] as const;

const CHAPTER_CENTERS = [0.04, 0.13, 0.25, 0.38, 0.51, 0.63, 0.73, 0.83, 0.95] as const;
const STORY_ARTWORKS = [
  {
    src: './assets/artworks/aura-cliffs-study.webp',
    title: 'Cliff Study',
    medium: 'AURA sample artwork · 2026',
    note: 'Mineral colour and atmosphere held at a deliberate visitor eye line.'
  },
  {
    src: './assets/artworks/aura-forest-study.webp',
    title: 'Forest Study',
    medium: 'AURA sample artwork · 2026',
    note: 'A dark botanical field balanced against the room’s warmer material register.'
  },
  {
    src: './assets/artworks/aura-pigment-study.webp',
    title: 'Pigment Study',
    medium: 'AURA sample artwork · 2026',
    note: 'A charged pigment cloud used to demonstrate scale, spacing, and focused light.'
  }
] as const;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};
const easeOut = (value: number) => 1 - (1 - clamp01(value)) ** 3;
const between = (value: number, start: number, end: number) => clamp01((value - start) / (end - start));

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
  const blueprintUiRef = useRef<HTMLDivElement>(null);
  const materialUiRef = useRef<HTMLDivElement>(null);
  const materialLabelRef = useRef<HTMLElement>(null);
  const arrangeUiRef = useRef<HTMLDivElement>(null);
  const arrangeStatusRef = useRef<HTMLElement>(null);
  const viewUiRef = useRef<HTMLDivElement>(null);
  const visitorUiRef = useRef<HTMLDivElement>(null);
  const visitorControlsRef = useRef<HTMLDivElement>(null);
  const artworkCardRef = useRef<HTMLElement>(null);
  const artworkTitleRef = useRef<HTMLHeadingElement>(null);
  const artworkMediumRef = useRef<HTMLParagraphElement>(null);
  const artworkNoteRef = useRef<HTMLParagraphElement>(null);
  const artworkCloseRef = useRef<HTMLButtonElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    if (!section || !canvas) return undefined;

    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const compactQuery = window.matchMedia('(max-width: 720px)');
    const compact = compactQuery.matches;
    let reducedMotion = reducedMotionQuery.matches;
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
      if (statusRef.current) statusRef.current.textContent = 'The 3D preview is unavailable. The complete workflow is described below.';
      return undefined;
    }

    section.dataset.webgl = 'ready';
    section.dataset.motion = reducedMotion ? 'reduced' : 'full';
    section.dataset.interactive = 'false';
    canvas.tabIndex = -1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
    renderer.shadowMap.enabled = !compact;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      section.dataset.webgl = 'unavailable';
      section.dataset.motion = 'reduced';
      setInteractive(false);
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

    const ceiling = new THREE.Group();
    ceiling.name = 'CeilingOpening';
    const ceilingGeometry = new THREE.BoxGeometry(5.35, 0.14, 10);
    const ceilingLeft = new THREE.Mesh(ceilingGeometry, wallMaterial);
    ceilingLeft.position.set(-4.325, 5.02, 0);
    ceilingLeft.receiveShadow = true;
    const ceilingRight = ceilingLeft.clone();
    ceilingRight.position.x = 4.325;
    ceiling.add(ceilingLeft, ceilingRight);
    shell.add(ceiling);

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

    const nocturneMaterial = new THREE.MeshStandardMaterial({
      color: '#252825',
      roughness: 0.78,
      transparent: true,
      opacity: 0
    });
    const nocturne = new THREE.Group();
    nocturne.name = 'NocturneStudy';
    const nocturneWingGeometry = new THREE.BoxGeometry(0.18, 4.35, 5.4);
    const nocturneLeft = new THREE.Mesh(nocturneWingGeometry, nocturneMaterial);
    nocturneLeft.position.set(-4.75, 2.18, -1.35);
    nocturneLeft.rotation.y = -0.31;
    const nocturneRight = nocturneLeft.clone();
    nocturneRight.position.x = 4.75;
    nocturneRight.rotation.y = 0.31;
    const nocturneStage = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.22, 2.1), nocturneMaterial);
    nocturneStage.position.set(0, 0.11, -3.72);
    nocturne.add(nocturneLeft, nocturneRight, nocturneStage);
    room.add(nocturne);

    const forumMaterial = new THREE.MeshStandardMaterial({
      color: '#cab89e',
      roughness: 0.88,
      transparent: true,
      opacity: 0
    });
    const forum = new THREE.Group();
    forum.name = 'GrandForumStudy';
    const forumDivider = new THREE.Mesh(new THREE.BoxGeometry(5.8, 3.75, 0.24), forumMaterial);
    forumDivider.position.set(0, 1.875, -1.5);
    const forumColumnGeometry = new THREE.BoxGeometry(0.34, 4.8, 0.34);
    const forumColumnLeft = new THREE.Mesh(forumColumnGeometry, forumMaterial);
    forumColumnLeft.position.set(-5.3, 2.4, -1.2);
    const forumColumnRight = forumColumnLeft.clone();
    forumColumnRight.position.x = 5.3;
    const forumBeam = new THREE.Mesh(new THREE.BoxGeometry(11, 0.24, 0.38), forumMaterial);
    forumBeam.position.set(0, 4.72, -1.2);
    forum.add(forumDivider, forumColumnLeft, forumColumnRight, forumBeam);
    room.add(forum);

    const artGroup = new THREE.Group();
    artGroup.name = 'ArtAnchors';
    room.add(artGroup);
    const artworkSpecs = compact
      ? [
          { x: -3.7, y: 1.75, width: 2.1, height: 2.7 },
          { x: 0, y: 1.75, width: 1.8, height: 2.45 },
          { x: 3.6, y: 1.75, width: 2.25, height: 2.9 }
        ]
      : [
          { x: -4.25, y: 1.75, width: 1.9, height: 2.72 },
          { x: 0, y: 1.75, width: 2.25, height: 3.02 },
          { x: 4.2, y: 1.75, width: 2.05, height: 2.82 }
        ];
    const artworkObjects: THREE.Group[] = [];
    const snapMaterials: THREE.MeshBasicMaterial[] = [];
    const artworkTextures: THREE.Texture[] = [];
    let requestStoryRender: () => void = () => undefined;

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
      artwork.userData.artworkIndex = index;
      const texture = new THREE.TextureLoader().load(
        STORY_ARTWORKS[index].src,
        requestStoryRender,
        undefined,
        requestStoryRender
      );
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      artworkTextures.push(texture);
      const imageMaterial = new THREE.MeshBasicMaterial({ map: texture, color: '#ffffff', toneMapped: false });
      const image = new THREE.Mesh(new THREE.PlaneGeometry(spec.width, spec.height), imageMaterial);
      image.name = `ArtworkImage_${index + 1}`;
      image.userData.artworkIndex = index;
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
    const sculptureInstall = new THREE.Group();
    sculptureInstall.name = 'SculptureInstallation';
    room.add(decor, sculptureInstall);
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
    const contactShadowMaterial = new THREE.MeshBasicMaterial({
      color: '#11120f',
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    const contactShadow = new THREE.Mesh(new THREE.CircleGeometry(0.78, 40), contactShadowMaterial);
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.set(3.8, 0.012, 1.15);
    decor.add(benchSeat, leftLeg, rightLeg);
    sculptureInstall.add(pedestal, sculpture, contactShadow);

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

    const stylePalettes = [
      {
        at: 0,
        label: 'Raw shell',
        wall: new THREE.Color('#697069'),
        floor: new THREE.Color('#3e4540'),
        trim: new THREE.Color('#181b18'),
        background: new THREE.Color('#111411'),
        ambient: 0.28,
        key: 0.2
      },
      {
        at: 0.28,
        label: 'White Cube',
        wall: new THREE.Color('#e6e3da'),
        floor: new THREE.Color('#aaa398'),
        trim: new THREE.Color('#292b27'),
        background: new THREE.Color('#161915'),
        ambient: 0.9,
        key: 1.45
      },
      {
        at: 0.52,
        label: 'Nocturne',
        wall: new THREE.Color('#747a70'),
        floor: new THREE.Color('#3c413c'),
        trim: new THREE.Color('#111310'),
        background: new THREE.Color('#121612'),
        ambient: 0.82,
        key: 1.42
      },
      {
        at: 0.76,
        label: 'Grand Forum',
        wall: new THREE.Color('#d2c0a5'),
        floor: new THREE.Color('#b9b1a4'),
        trim: new THREE.Color('#736653'),
        background: new THREE.Color('#181713'),
        ambient: 0.76,
        key: 1.22
      },
      {
        at: 1,
        label: 'White Cube',
        wall: new THREE.Color('#ded8ca'),
        floor: new THREE.Color('#786e60'),
        trim: new THREE.Color('#181b18'),
        background: new THREE.Color('#111411'),
        ambient: 0.92,
        key: 1.47
      }
    ] as const;
    const applyStylePalette = (value: number) => {
      let nextIndex = stylePalettes.findIndex((palette) => palette.at >= value);
      if (nextIndex < 0) nextIndex = stylePalettes.length - 1;
      const previous = stylePalettes[Math.max(0, nextIndex - 1)];
      const next = stylePalettes[nextIndex];
      const local = previous === next ? 0 : smooth(between(value, previous.at, next.at));
      wallMaterial.color.lerpColors(previous.wall, next.wall, local);
      floorMaterial.color.lerpColors(previous.floor, next.floor, local);
      trimMaterial.color.lerpColors(previous.trim, next.trim, local);
      const background = scene.background as THREE.Color;
      background.lerpColors(previous.background, next.background, local);
      (scene.fog as THREE.Fog).color.copy(background);
      return {
        label: local < 0.5 ? previous.label : next.label,
        ambient: THREE.MathUtils.lerp(previous.ambient, next.ambient, local),
        key: THREE.MathUtils.lerp(previous.key, next.key, local)
      };
    };
    const cameraPosition = new THREE.Vector3();
    const cameraTarget = new THREE.Vector3();
    const cameraKeyframes: CameraKeyframe[] = [
      { at: 0, position: new THREE.Vector3(9.8, 10.5, 14.8), target: new THREE.Vector3(0, 0.25, -0.8) },
      { at: 0.08, position: new THREE.Vector3(9.2, 9.4, 14.2), target: new THREE.Vector3(0, 0.4, -0.8) },
      { at: 0.18, position: new THREE.Vector3(8.8, 7.3, 13.8), target: new THREE.Vector3(0, 1.1, -1) },
      { at: 0.32, position: new THREE.Vector3(7.5, 4.15, 12.3), target: new THREE.Vector3(0, 2.05, -1.3) },
      { at: 0.44, position: new THREE.Vector3(6.7, 3.8, 11.1), target: new THREE.Vector3(0, 2.2, -2) },
      { at: 0.58, position: new THREE.Vector3(5.9, 3.45, 9.9), target: new THREE.Vector3(0, 2.2, -2.55) },
      { at: 0.68, position: new THREE.Vector3(5.6, 3.2, 9.4), target: new THREE.Vector3(0, 2.15, -2.8) },
      { at: 0.78, position: new THREE.Vector3(4.6, 2.8, 8.1), target: new THREE.Vector3(0, 2.15, -3.15) },
      { at: 0.88, position: new THREE.Vector3(0.25, 1.75, 4.55), target: new THREE.Vector3(0, 2.05, -4.1) },
      { at: 1, position: new THREE.Vector3(0, 1.75, 3.55), target: new THREE.Vector3(0, 2.1, -4.4) }
    ];

    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const visitorPosition = new THREE.Vector3(0, 1.75, 3.55);
    let visitorYaw = 0;
    let visitorPitch = 0;
    let storyInteractive = false;
    let pointerActive = false;
    let pointerDragged = false;
    let pointerX = 0;
    let pointerY = 0;

    const hideArtworkCard = () => {
      const card = artworkCardRef.current;
      if (!card) return;
      card.setAttribute('aria-hidden', 'true');
      if (artworkCloseRef.current) artworkCloseRef.current.tabIndex = -1;
    };

    const showArtworkCard = (index: number) => {
      const artwork = STORY_ARTWORKS[index];
      const card = artworkCardRef.current;
      if (!artwork || !card) return;
      if (artworkTitleRef.current) artworkTitleRef.current.textContent = artwork.title;
      if (artworkMediumRef.current) artworkMediumRef.current.textContent = artwork.medium;
      if (artworkNoteRef.current) artworkNoteRef.current.textContent = artwork.note;
      card.setAttribute('aria-hidden', 'false');
      if (artworkCloseRef.current) artworkCloseRef.current.tabIndex = 0;
    };

    const setInteractive = (enabled: boolean) => {
      if (enabled === storyInteractive) return;
      storyInteractive = enabled;
      section.dataset.interactive = enabled ? 'true' : 'false';
      canvas.tabIndex = enabled ? 0 : -1;
      canvas.setAttribute('aria-hidden', enabled ? 'false' : 'true');
      visitorUiRef.current?.setAttribute('aria-hidden', enabled ? 'false' : 'true');
      visitorControlsRef.current?.querySelectorAll('button').forEach((button) => {
        button.tabIndex = enabled ? 0 : -1;
      });
      if (!enabled) {
        pointerActive = false;
        canvas.classList.remove('is-looking');
        hideArtworkCard();
      }
    };

    const visitorLookTarget = new THREE.Vector3();
    const renderVisitorCamera = () => {
      const horizontal = Math.cos(visitorPitch);
      visitorLookTarget.set(
        visitorPosition.x + Math.sin(visitorYaw) * horizontal,
        visitorPosition.y + Math.sin(visitorPitch),
        visitorPosition.z - Math.cos(visitorYaw) * horizontal
      );
      camera.position.copy(visitorPosition);
      camera.lookAt(visitorLookTarget);
    };

    const moveVisitor = (direction: 'forward' | 'back' | 'left' | 'right') => {
      if (!storyInteractive) return;
      const step = compact ? 0.3 : 0.36;
      const forwardX = Math.sin(visitorYaw);
      const forwardZ = -Math.cos(visitorYaw);
      const rightX = Math.cos(visitorYaw);
      const rightZ = Math.sin(visitorYaw);
      const candidate = visitorPosition.clone();
      if (direction === 'forward') candidate.add(new THREE.Vector3(forwardX * step, 0, forwardZ * step));
      if (direction === 'back') candidate.add(new THREE.Vector3(-forwardX * step, 0, -forwardZ * step));
      if (direction === 'left') candidate.add(new THREE.Vector3(-rightX * step, 0, -rightZ * step));
      if (direction === 'right') candidate.add(new THREE.Vector3(rightX * step, 0, rightZ * step));
      candidate.x = THREE.MathUtils.clamp(candidate.x, -6.35, 6.35);
      candidate.z = THREE.MathUtils.clamp(candidate.z, -4.35, 4.25);
      const hitsBench = candidate.x > -3.85 && candidate.x < -0.65 && candidate.z > 0.55 && candidate.z < 1.95;
      const hitsSculpture = candidate.x > 3.05 && candidate.x < 4.55 && candidate.z > 0.4 && candidate.z < 1.9;
      if (!hitsBench && !hitsSculpture) visitorPosition.copy(candidate);
      requestStoryRender();
    };

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
        const radius = index === CHAPTER_CENTERS.length - 1 ? 0.085 : 0.075;
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

      const edgeReveal = easeOut(between(progress, 0, 0.08));
      const blueprintIn = smooth(between(progress, 0.08, 0.13));
      const blueprintOut = 1 - smooth(between(progress, 0.26, 0.34));
      const blueprintOpacity = blueprintIn * blueprintOut;
      const outlineCount = outlineGeometry.getAttribute('position').count;
      outlineGeometry.setDrawRange(0, Math.max(2, Math.floor((outlineCount * edgeReveal) / 2) * 2));
      blueprint.visible = edgeReveal * blueprintOut > 0.002;
      outlineMaterial.opacity = edgeReveal * blueprintOut * 0.86;
      gridMaterial.opacity = blueprintOpacity * 0.52;
      setUiVisibility(blueprintUiRef.current, blueprintOpacity, 14);

      const floorBuild = smooth(between(progress, 0.18, 0.235));
      const backBuild = smooth(between(progress, 0.205, 0.285));
      const sideBuild = smooth(between(progress, 0.235, 0.315));
      const ceilingBuild = smooth(between(progress, 0.265, 0.32));
      floor.scale.set(Math.max(0.002, floorBuild), 1, Math.max(0.002, floorBuild));
      floor.position.z = -5 + 5 * floorBuild;
      backWall.scale.set(Math.max(0.002, backBuild), Math.max(0.002, backBuild), 1);
      backWall.position.y = 2.5 * backBuild;
      leftWall.scale.set(1, Math.max(0.002, sideBuild), Math.max(0.002, sideBuild));
      rightWall.scale.copy(leftWall.scale);
      leftWall.position.set(-7, 2.5 * sideBuild, -5 + 5 * sideBuild);
      rightWall.position.set(7, 2.5 * sideBuild, -5 + 5 * sideBuild);
      ceiling.scale.set(Math.max(0.002, ceilingBuild), Math.max(0.002, ceilingBuild), Math.max(0.002, ceilingBuild));
      ceiling.visible = ceilingBuild > 0.002;
      const ribFade = 1 - smooth(between(progress, 0.325, 0.37));
      ribs.scale.set(
        Math.max(0.002, ceilingBuild),
        Math.max(0.002, ceilingBuild * ribFade),
        Math.max(0.002, ceilingBuild)
      );
      ribs.visible = ceilingBuild * ribFade > 0.01;
      baseboard.scale.x = Math.max(0.002, backBuild);

      const materialProgress = progress < 0.32 ? 0 : smooth(between(progress, 0.32, 0.44));
      const palette = applyStylePalette(materialProgress);
      wallMaterial.roughness = THREE.MathUtils.lerp(0.98, 0.9, materialProgress);
      floorMaterial.roughness = THREE.MathUtils.lerp(0.96, 0.82, materialProgress);
      hemisphere.intensity = palette.ambient;
      keyLight.intensity = palette.key;
      galleryLight.intensity = THREE.MathUtils.lerp(0.15, 2.7, Math.max(backBuild, materialProgress));
      if (materialLabelRef.current) materialLabelRef.current.textContent = palette.label;
      const materialUiIn = smooth(between(progress, 0.315, 0.345));
      const materialUiOut = 1 - smooth(between(progress, 0.445, 0.49));
      setUiVisibility(materialUiRef.current, materialUiIn * materialUiOut, 14);
      const nocturneIn = smooth(between(materialProgress, 0.25, 0.43));
      const nocturneOut = 1 - smooth(between(materialProgress, 0.54, 0.69));
      const nocturneOpacity = nocturneIn * nocturneOut;
      nocturne.visible = nocturneOpacity > 0.002;
      nocturneMaterial.opacity = nocturneOpacity * 0.92;
      const forumIn = smooth(between(materialProgress, 0.58, 0.73));
      const forumOut = 1 - smooth(between(materialProgress, 0.84, 0.98));
      const forumOpacity = forumIn * forumOut;
      forum.visible = forumOpacity > 0.002;
      forumMaterial.opacity = forumOpacity * 0.94;

      artworkObjects.forEach((artwork, index) => {
        const artProgress = easeOut(between(progress, 0.44 + index * 0.018, 0.545 + index * 0.012));
        artwork.visible = artProgress > 0.001;
        const finalX = Number(artwork.userData.finalX);
        const finalY = Number(artwork.userData.finalY);
        const entryDirection = index % 2 ? 1 : -1;
        artwork.position.x = finalX + entryDirection * (1 - artProgress) * (1.4 + index * 0.2);
        artwork.position.y = finalY + (1 - artProgress) * (1.05 + index * 0.16);
        artwork.position.z = -4.82 + (1 - artProgress) * (5.8 + index * 0.28);
        artwork.rotation.set(
          (1 - artProgress) * (index - 1) * 0.06,
          entryDirection * (1 - artProgress) * 0.13,
          entryDirection * (1 - artProgress) * 0.075
        );
        artwork.scale.setScalar(0.82 + artProgress * 0.18);
        const guideIn = smooth(between(progress, 0.49 + index * 0.018, 0.555 + index * 0.016));
        const guideOut = 1 - smooth(between(progress, 0.585, 0.615));
        snapMaterials[index].opacity = guideIn * guideOut * 0.72;
      });

      const arrangeProgress = smooth(between(progress, 0.58, 0.68));
      const arrangeSettle = smooth(between(progress, 0.64, 0.68));
      const selectedArtwork = artworkObjects[1];
      if (selectedArtwork?.visible) {
        const dragOffset = arrangeProgress * (1 - arrangeSettle) * 0.52;
        selectedArtwork.position.x = Number(selectedArtwork.userData.finalX) + dragOffset;
        selectedArtwork.scale.setScalar(1 + arrangeProgress * (1 - arrangeSettle) * 0.055);
        snapMaterials[1].opacity = Math.max(snapMaterials[1].opacity, arrangeProgress * (1 - smooth(between(progress, 0.665, 0.69))) * 0.9);
      }
      if (arrangeStatusRef.current) {
        arrangeStatusRef.current.textContent = progress < 0.615
          ? 'Drag to refine · 3 cm snap'
          : progress < 0.655
            ? 'Aligned · eye line 1.75 m'
            : 'Saved · Undo available';
      }

      const decorProgress = easeOut(between(progress, 0.68, 0.75));
      decor.visible = decorProgress > 0.002;
      decor.scale.setScalar(Math.max(0.002, decorProgress));
      decor.position.y = -(1 - decorProgress) * 0.22;
      const sculptureProgress = easeOut(between(progress, 0.71, 0.78));
      sculptureInstall.visible = sculptureProgress > 0.002;
      sculptureInstall.scale.setScalar(Math.max(0.002, sculptureProgress));
      sculptureInstall.position.y = -(1 - sculptureProgress) * 0.3;
      contactShadowMaterial.opacity = sculptureProgress * 0.42;
      sculpture.rotation.y = -0.5 + (1 - sculptureProgress) * 0.8;

      const lightFocus = smooth(between(progress, 0.68, 0.77));
      artLights.forEach((light, index) => {
        const spec = artworkSpecs[index];
        light.color.set('#fffdf5');
        light.position.x = THREE.MathUtils.lerp(0, spec.x * 0.76, lightFocus);
        light.intensity = 0.25 * materialProgress + lightFocus * (compact ? 3.4 : 4.8);
      });
      galleryLight.intensity *= 1 - lightFocus * 0.3;

      const arrangeIn = smooth(between(progress, 0.565, 0.6));
      const arrangeOut = 1 - smooth(between(progress, 0.68, 0.73));
      setUiVisibility(arrangeUiRef.current, arrangeIn * arrangeOut, 16);
      const viewIn = smooth(between(progress, 0.56, 0.6));
      const viewOut = 1 - smooth(between(progress, 0.82, 0.88));
      setUiVisibility(viewUiRef.current, viewIn * viewOut, -10);
      if (viewUiRef.current) viewUiRef.current.dataset.mode = progress >= 0.78 ? 'walk' : 'arrange';
      const visitorIn = smooth(between(progress, 0.88, 0.93));
      setUiVisibility(visitorUiRef.current, visitorIn, 14);

      cameraPose(progress, cameraKeyframes, cameraPosition, cameraTarget);
      const shouldInteract = progress >= 0.91 && !reducedMotion && section.dataset.webgl === 'ready';
      if (shouldInteract && !storyInteractive) {
        visitorPosition.copy(cameraPosition);
        visitorPosition.y = 1.75;
        const direction = cameraTarget.clone().sub(cameraPosition).normalize();
        visitorYaw = Math.atan2(direction.x, -direction.z);
        visitorPitch = Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1));
        setInteractive(true);
      } else if (!shouldInteract && storyInteractive) {
        setInteractive(false);
      }
      if (storyInteractive) {
        renderVisitorCamera();
      } else {
        camera.position.copy(cameraPosition);
        camera.lookAt(cameraTarget);
      }
      renderer.render(scene, camera);
    };

    let frame = 0;
    let disposed = false;
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
      if (!disposed && !frame) frame = window.requestAnimationFrame(readProgress);
    };
    requestStoryRender = requestRender;

    const handleMotionChange = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
      section.dataset.motion = reducedMotion ? 'reduced' : 'full';
      requestRender();
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!storyInteractive || event.button !== 0) return;
      canvas.focus({ preventScroll: true });
      pointerActive = true;
      pointerDragged = false;
      pointerX = event.clientX;
      pointerY = event.clientY;
      canvas.classList.add('is-looking');
      canvas.setPointerCapture(event.pointerId);
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (!pointerActive || !storyInteractive) return;
      const deltaX = event.clientX - pointerX;
      const deltaY = event.clientY - pointerY;
      if (Math.abs(deltaX) + Math.abs(deltaY) > 2) pointerDragged = true;
      visitorYaw -= deltaX * 0.0042;
      visitorPitch = THREE.MathUtils.clamp(visitorPitch - deltaY * 0.0036, -0.62, 0.62);
      pointerX = event.clientX;
      pointerY = event.clientY;
      requestRender();
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (!pointerActive) return;
      pointerActive = false;
      canvas.classList.remove('is-looking');
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (pointerDragged || !storyInteractive) return;
      const bounds = canvas.getBoundingClientRect();
      pointerNdc.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1
      );
      raycaster.setFromCamera(pointerNdc, camera);
      const hit = raycaster.intersectObjects(artworkObjects, true)[0];
      let candidate: THREE.Object3D | null = hit?.object ?? null;
      while (candidate && typeof candidate.userData.artworkIndex !== 'number') candidate = candidate.parent;
      if (candidate && typeof candidate.userData.artworkIndex === 'number') {
        showArtworkCard(candidate.userData.artworkIndex);
      } else {
        hideArtworkCard();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        hideArtworkCard();
        canvas.blur();
        return;
      }
      if (!storyInteractive || document.activeElement !== canvas) return;
      const key = event.key.toLowerCase();
      const direction = key === 'w' || key === 'arrowup'
        ? 'forward'
        : key === 's' || key === 'arrowdown'
          ? 'back'
          : key === 'a' || key === 'arrowleft'
            ? 'left'
            : key === 'd' || key === 'arrowright'
              ? 'right'
              : null;
      if (!direction) return;
      event.preventDefault();
      moveVisitor(direction);
    };
    const handleMoveControl = (event: Event) => {
      const control = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-story-move]');
      const direction = control?.dataset.storyMove as 'forward' | 'back' | 'left' | 'right' | undefined;
      if (direction) moveVisitor(direction);
    };
    const handleCloseArtwork = () => {
      hideArtworkCard();
      canvas.focus({ preventScroll: true });
    };

    const visitorControls = visitorControlsRef.current;
    const artworkClose = artworkCloseRef.current;
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(requestRender);
    resizeObserver?.observe(canvas);
    window.addEventListener('scroll', requestRender, { passive: true });
    window.addEventListener('resize', requestRender, { passive: true });
    window.addEventListener('keydown', handleKeyDown);
    reducedMotionQuery.addEventListener('change', handleMotionChange);
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);
    visitorControls?.addEventListener('click', handleMoveControl);
    artworkClose?.addEventListener('click', handleCloseArtwork);
    readProgress();

    return () => {
      disposed = true;
      requestStoryRender = () => undefined;
      window.removeEventListener('scroll', requestRender);
      window.removeEventListener('resize', requestRender);
      window.removeEventListener('keydown', handleKeyDown);
      reducedMotionQuery.removeEventListener('change', handleMotionChange);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerUp);
      visitorControls?.removeEventListener('click', handleMoveControl);
      artworkClose?.removeEventListener('click', handleCloseArtwork);
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
      delete section.dataset.interactive;
    };
  }, []);

  return (
    <section className="sgs" ref={sectionRef} aria-labelledby="sgs-title">
      <h2 className="visually-hidden" id="sgs-title">Build a browser-based virtual exhibition</h2>
      <div className="sgs__sticky">
        <div className="sgs__visual">
          <canvas
            ref={canvasRef}
            aria-hidden="true"
            aria-label="Interactive AURA exhibition. Drag to look, use W A S D to move, and select an artwork."
            tabIndex={-1}
          />
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

        <div className="sgs__blueprint-ui" ref={blueprintUiRef} aria-hidden="true">
          <div><span>X</span><span>Y</span><span>Z</span></div>
          <p>Room envelope</p>
          <dl><div><dt>Width</dt><dd>14.00 m</dd></div><div><dt>Depth</dt><dd>10.00 m</dd></div></dl>
          <ul><li>White Cube</li><li>Nocturne</li><li>Grand Forum</li></ul>
        </div>

        <div className="sgs__material-ui" ref={materialUiRef} aria-hidden="true">
          <p>Atmosphere study</p>
          <div><i /><i /><i /></div>
          <span>Stone · wood · light</span>
          <em ref={materialLabelRef}>Raw shell</em>
        </div>

        <div className="sgs__arrange-ui" ref={arrangeUiRef} aria-hidden="true">
          <div className="sgs__arrange-head"><span>Artwork 02</span><i>Autosaved</i></div>
          <div className="sgs__wall-row"><b>Back wall</b><span>02 / 03</span></div>
          <div className="sgs__control"><span>Horizontal</span><i><b /></i><em>1.65 m</em></div>
          <div className="sgs__control"><span>Eye line</span><i><b /></i><em>1.75 m</em></div>
          <div className="sgs__control"><span>Scale</span><i><b /></i><em>100%</em></div>
          <p><b>↶</b><span ref={arrangeStatusRef}>Drag to refine · 3 cm snap</span></p>
        </div>

        <div className="sgs__view-ui" ref={viewUiRef} data-mode="arrange" aria-hidden="true">
          <span>Arrange</span><span>Walk preview</span>
        </div>

        <div className="sgs__visitor-ui" ref={visitorUiRef} aria-hidden="true">
          <p><i /> Live visitor mode</p>
          <span>Drag to look · W A S D to move · select an artwork</span>
          <div className="sgs__visitor-controls" ref={visitorControlsRef}>
            <button type="button" data-story-move="forward" aria-label="Move forward" tabIndex={-1}>↑</button>
            <button type="button" data-story-move="left" aria-label="Move left" tabIndex={-1}>←</button>
            <button type="button" data-story-move="back" aria-label="Move back" tabIndex={-1}>↓</button>
            <button type="button" data-story-move="right" aria-label="Move right" tabIndex={-1}>→</button>
          </div>
        </div>

        <aside className="sgs__artwork-card" ref={artworkCardRef} aria-hidden="true" aria-live="polite">
          <button ref={artworkCloseRef} type="button" aria-label="Close artwork details" tabIndex={-1}>×</button>
          <p>Selected work</p>
          <h3 ref={artworkTitleRef}>Artwork</h3>
          <p ref={artworkMediumRef}>AURA sample artwork</p>
          <span ref={artworkNoteRef}>Select a work to read its details.</span>
        </aside>

        <p className="sgs__status visually-hidden" ref={statusRef}>
          Scroll-linked preview of an AURA room moving from first outline to a visitor-ready exhibition.
        </p>
      </div>

      <ol className="sgs__accessible-sequence">
        {CHAPTERS.map((chapter) => <li key={chapter.eyebrow}><strong>{chapter.title}</strong> {chapter.body}</li>)}
      </ol>
    </section>
  );
}
