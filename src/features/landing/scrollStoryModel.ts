export type StoryPart = "floor" | "wall" | "ceiling" | "detail" | "artwork";

export type StoryFrame = {
  chapter: number;
  blueprint: number;
  floor: number;
  wall: number;
  ceiling: number;
  detail: number;
  artwork: number;
  lighting: number;
  finale: number;
};

export type CameraPose = {
  position: [number, number, number];
  target: [number, number, number];
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export const smoothstep = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

export const range = (value: number, start: number, end: number) =>
  smoothstep((value - start) / (end - start));

const CHAPTER_CENTERS = [0.04, 0.2, 0.39, 0.58, 0.74, 0.93] as const;

export function storyFrame(rawProgress: number): StoryFrame {
  const progress = clamp01(rawProgress);
  let chapter = 0;
  let closest = Number.POSITIVE_INFINITY;
  CHAPTER_CENTERS.forEach((center, index) => {
    const distance = Math.abs(progress - center);
    if (distance < closest) {
      chapter = index;
      closest = distance;
    }
  });
  return {
    chapter,
    blueprint: range(progress, 0.04, 0.24) * (1 - range(progress, 0.34, 0.47)),
    floor: range(progress, 0.2, 0.31),
    wall: range(progress, 0.29, 0.41),
    ceiling: range(progress, 0.39, 0.5),
    detail: range(progress, 0.47, 0.6),
    artwork: range(progress, 0.57, 0.7),
    lighting: range(progress, 0.5, 0.67),
    finale: range(progress, 0.88, 0.95),
  };
}

const mix = (start: number, end: number, amount: number) => start + (end - start) * amount;

function mixPose(from: CameraPose, to: CameraPose, amount: number): CameraPose {
  return {
    position: from.position.map((value, index) => mix(value, to.position[index], amount)) as CameraPose["position"],
    target: from.target.map((value, index) => mix(value, to.target[index], amount)) as CameraPose["target"],
  };
}

const DESKTOP_BUILD: Array<{ at: number; pose: CameraPose }> = [
  { at: 0, pose: { position: [10.2, 9.6, 14.6], target: [0, 0.7, -0.8] } },
  { at: 0.22, pose: { position: [8.8, 8.8, 13.2], target: [0, 0.9, -0.8] } },
  { at: 0.42, pose: { position: [0, 3.55, 6.15], target: [0, 1.35, -1.8] } },
  { at: 0.64, pose: { position: [0, 2.75, 4.1], target: [0, 1.75, -1] } },
];

const MOBILE_BUILD: Array<{ at: number; pose: CameraPose }> = [
  { at: 0, pose: { position: [8.7, 8.2, 13.8], target: [0, 1.2, -0.8] } },
  { at: 0.22, pose: { position: [7.4, 7.6, 12.4], target: [0, 1, -0.8] } },
  { at: 0.42, pose: { position: [0, 3.35, 6.15], target: [0, 1.35, -1.8] } },
  { at: 0.64, pose: { position: [0, 2.9, 3.6], target: [0, 1.75, -1.2] } },
];

/** A continuous build-to-orbit camera. The 360-degree flight starts and ends
 * on the same axis, avoiding the old left/right target jump. */
export function storyCamera(rawProgress: number, compact = false): CameraPose {
  const progress = clamp01(rawProgress);
  const build = compact ? MOBILE_BUILD : DESKTOP_BUILD;
  if (progress < 0.64) {
    const nextIndex = Math.max(1, build.findIndex(({ at }) => at >= progress));
    const previous = build[nextIndex - 1];
    const next = build[nextIndex];
    return mixPose(previous.pose, next.pose, range(progress, previous.at, next.at));
  }

  const orbitEnd = 0.88;
  const orbit = range(progress, 0.64, orbitEnd);
  const angle = orbit * Math.PI * 2;
  const radius = compact ? 4.8 : 5.1;
  const centerZ = compact ? -1.2 : -1;
  return {
    position: [
      Math.sin(angle) * radius,
      (compact ? 2.9 : 2.75) + Math.sin(angle * 2) * 0.22,
      centerZ + Math.cos(angle) * radius,
    ],
    target: [0, 1.75, centerZ],
  };
}

type DannyPartInput = {
  objectName: string;
  themeRole?: string;
  assetRole?: string;
  localY?: number;
};

export function classifyDannyPart({
  objectName,
  themeRole = "",
  assetRole = "",
  localY = 0,
}: DannyPartInput): StoryPart {
  const name = objectName.toLowerCase();
  const role = themeRole.toLowerCase();
  const asset = assetRole.toLowerCase();
  if (
    asset.includes("genuine_artwork") ||
    asset.includes("genuine_wartrobe") ||
    role.includes("surface_detail_locked") ||
    role.includes("wartrobe_surface_locked") ||
    /^surface_detail_|^wartrobe_genuine/.test(name)
  ) {
    return "artwork";
  }

  // The Blender file historically labels this vertical back-wall insert as
  // floor_alt. Geometry position wins over that legacy material label: marble
  // belongs to horizontal floor meshes only.
  if (name === "arch_floor_alt" || (role === "floor_alt" && localY > 1)) {
    return "wall";
  }
  if (role === "wall" || /(^|_)wall($|_)/.test(name)) return "wall";
  if (role === "ceiling" || /ceiling|roof/.test(name)) return "ceiling";
  if (
    role === "floor" ||
    role === "floor_tile_a" ||
    role === "floor_tile_b" ||
    (/floor/.test(name) && !/floor_alt/.test(name))
  ) {
    return "floor";
  }
  return "detail";
}

export function isMarbleFloor(part: StoryPart, themeRole = "", materialName = "") {
  if (part !== "floor") return false;
  const value = `${themeRole} ${materialName}`.toLowerCase();
  return /floor_alt|floor_tile|marble|polished/.test(value);
}

export function isMisplacedMarble(part: StoryPart, themeRole = "", materialName = "") {
  if (part === "floor") return false;
  return /marble|polished|floor_alt/.test(`${themeRole} ${materialName}`.toLowerCase());
}
