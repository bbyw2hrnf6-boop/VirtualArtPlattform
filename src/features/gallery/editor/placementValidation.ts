import { getTemplate, type GalleryTemplate } from "../templates";
import type {
  Artwork,
  DecorId,
  DecorPlacement,
  GalleryDraft,
  WallId,
} from "../types";

const ARTWORK_HEIGHT_METRES = 1.5;
const ARTWORK_EDGE_CLEARANCE = 0.22;
const ARTWORK_GAP_X = 0.3;
const ARTWORK_GAP_Y = 0.22;
const FLOOR_EDGE_CLEARANCE = 0.2;
const DECOR_GAP = 0.18;
export const PLACEMENT_GRID_STEP_METRES = 0.03;
export const DEFAULT_ARTWORK_EYE_LINE_METRES = 1.75;

export type PlacementTarget = "artwork" | "decor";

export interface PlacementIssue {
  code:
    | "invalid-number"
    | "invalid-wall"
    | "scale"
    | "out-of-bounds"
    | "opening"
    | "architecture"
    | "overlap"
    | "locked";
  target: PlacementTarget;
  targetId: string;
  message: string;
  relatedId?: string;
}

export type PlacementResult =
  | { ok: true; draft: GalleryDraft }
  | { ok: false; draft: GalleryDraft; issue: PlacementIssue };

type Point = { x: number; z: number };
type OrientedRectangle = {
  center: Point;
  halfWidth: number;
  halfDepth: number;
  rotation: number;
};

const finite = (...values: number[]) => values.every(Number.isFinite);
export const snapToPlacementGrid = (value: number, origin = 0) =>
  Number(
    (
      origin +
      Math.round((value - origin) / PLACEMENT_GRID_STEP_METRES) *
        PLACEMENT_GRID_STEP_METRES
    ).toFixed(6),
  );
const snap = (value: number) => snapToPlacementGrid(value);
// The vertical grid is anchored at the curatorial eye line so 1.75 m remains
// an exact snap target while every adjustment around it still moves by 3 cm.
const snapToEyeLineGrid = (value: number) =>
  snapToPlacementGrid(value, DEFAULT_ARTWORK_EYE_LINE_METRES);
const minimumGridValue = (minimum: number, origin = 0) =>
  Number(
    (
      origin +
      Math.ceil((minimum - origin) / PLACEMENT_GRID_STEP_METRES) *
        PLACEMENT_GRID_STEP_METRES
    ).toFixed(6),
  );
const maximumGridValue = (maximum: number, origin = 0) =>
  Number(
    (
      origin +
      Math.floor((maximum - origin) / PLACEMENT_GRID_STEP_METRES) *
        PLACEMENT_GRID_STEP_METRES
    ).toFixed(6),
  );
const snapWithinGridBounds = (
  value: number,
  minimum: number,
  maximum: number,
  origin = 0,
) =>
  Math.min(
    maximumGridValue(maximum, origin),
    Math.max(
      minimumGridValue(minimum, origin),
      snapToPlacementGrid(value, origin),
    ),
  );

export function galleryWalls(templateId: GalleryDraft["templateId"]): WallId[] {
  return templateId === "pavilion"
    ? ["north", "south", "west", "east", "divider-front", "divider-back"]
    : ["north", "south", "west", "east"];
}

export function artworkSize(artwork: Pick<Artwork, "aspect" | "scale">) {
  const height = ARTWORK_HEIGHT_METRES * artwork.scale;
  return { width: height * artwork.aspect, height };
}

function wallDimensions(template: GalleryTemplate, wall: WallId) {
  return {
    width: wall.startsWith("divider")
      ? (template.dividerWidth ?? 6.2)
      : wall === "north" || wall === "south"
        ? template.dimensions[0]
        : template.dimensions[1],
    height: wall.startsWith("divider")
      ? Math.min(4.55, template.height - 0.75)
      : template.height,
  };
}

export function artworkHorizontalBounds(draft: GalleryDraft, artwork: Artwork) {
  const surface = wallDimensions(getTemplate(draft.templateId), artwork.wall);
  const { width } = artworkSize(artwork);
  return {
    min: minimumGridValue(
      -surface.width / 2 + width / 2 + ARTWORK_EDGE_CLEARANCE,
    ),
    max: maximumGridValue(
      surface.width / 2 - width / 2 - ARTWORK_EDGE_CLEARANCE,
    ),
  };
}

export function distributeArtworksOnWall(
  draft: GalleryDraft,
  wall: WallId,
): PlacementResult {
  const artworks = draft.artworks
    .filter((artwork) => artwork.wall === wall && !artwork.hidden)
    .sort((left, right) => left.x - right.x);
  if (artworks.length < 2) return { ok: true, draft };
  const locked = artworks.find((artwork) => artwork.locked);
  if (locked)
    return {
      ok: false,
      draft,
      issue: {
        code: "locked",
        target: "artwork",
        targetId: locked.id,
        message:
          "Unlock every visible artwork on this wall before distributing the group.",
      },
    };
  const surface = wallDimensions(getTemplate(draft.templateId), wall);
  const spread = surface.width * Math.min(0.44, 0.25 + artworks.length * 0.025);
  let working: GalleryDraft = {
    ...draft,
    artworks: draft.artworks.filter(
      (artwork) => !artworks.some((item) => item.id === artwork.id),
    ),
  };
  const placements = new Map<string, Artwork>();
  for (let index = 0; index < artworks.length; index += 1) {
    const artwork = artworks[index];
    const bounds = artworkHorizontalBounds(draft, artwork);
    const ratio = artworks.length === 1 ? 0 : index / (artworks.length - 1);
    const preferred = snap(lerp(-spread, spread, ratio));
    const offsets = [0];
    for (
      let distance = PLACEMENT_GRID_STEP_METRES;
      distance <= surface.width;
      distance += PLACEMENT_GRID_STEP_METRES
    )
      offsets.push(distance, -distance);
    const candidate = offsets
      .map((offset) => ({
        ...artwork,
        x: snap(Math.min(bounds.max, Math.max(bounds.min, preferred + offset))),
      }))
      .find(
        (item) =>
          !validateArtworkPlacement(
            { ...working, artworks: [...working.artworks, item] },
            item,
          ),
      );
    if (!candidate)
      return {
        ok: false,
        draft,
        issue: {
          code: "overlap",
          target: "artwork",
          targetId: artwork.id,
          message:
            "These artworks cannot be distributed safely on this wall at their current sizes.",
        },
      };
    placements.set(candidate.id, candidate);
    working = { ...working, artworks: [...working.artworks, candidate] };
  }
  return {
    ok: true,
    draft: {
      ...draft,
      artworks: draft.artworks.map(
        (artwork) => placements.get(artwork.id) ?? artwork,
      ),
    },
  };
}

function lerp(start: number, end: number, alpha: number) {
  return start + (end - start) * alpha;
}

type WallExclusion = {
  wall: WallId;
  centerX: number;
  width: number;
  bottom: number;
  top: number;
  label: string;
};

/**
 * Places where authored room architecture meets an editable wall. These are
 * deliberately described in metres beside the procedural room contract so the
 * editor never presents a valid-looking slot that is hidden by architecture.
 */
function wallExclusions(template: GalleryTemplate): WallExclusion[] {
  if (template.id === "white-cube") {
    return [-1, 1].map((side) => ({
      wall: "north" as const,
      centerX: side * template.dimensions[0] * 0.31,
      width: 0.5,
      bottom: 0,
      top: template.height * 0.76,
      label: "the illuminated wall reveal",
    }));
  }
  if (template.id === "pavilion") {
    const [width, depth] = template.dimensions;
    return [
      ...[-1, 1].flatMap((side) => [
        {
          wall: "north" as const,
          centerX: side * width * 0.25,
          width: 0.82,
          bottom: 0,
          top: template.height,
          label: "a gallery partition",
        },
        {
          wall: "south" as const,
          centerX: side * width * 0.25,
          width: 0.82,
          bottom: 0,
          top: template.height,
          label: "a gallery partition",
        },
      ]),
      ...[-1, 1].flatMap((side) => [
        {
          wall: "west" as const,
          centerX: side * depth * 0.2,
          width: 0.82,
          bottom: 0,
          top: template.height,
          label: "a cross-gallery partition",
        },
        {
          wall: "east" as const,
          centerX: side * depth * 0.2,
          width: 0.82,
          bottom: 0,
          top: template.height,
          label: "a cross-gallery partition",
        },
      ]),
    ];
  }
  return [];
}

function rectanglesOverlap(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
  gapX = 0,
  gapY = 0,
) {
  return (
    Math.abs(left.x - right.x) < (left.width + right.width) / 2 + gapX &&
    Math.abs(left.y - right.y) < (left.height + right.height) / 2 + gapY
  );
}

export function validateArtworkPlacement(
  draft: GalleryDraft,
  artwork: Artwork,
): PlacementIssue | null {
  const template = getTemplate(draft.templateId);
  if (
    !finite(artwork.aspect, artwork.x, artwork.y, artwork.scale) ||
    artwork.aspect <= 0
  ) {
    return {
      code: "invalid-number",
      target: "artwork",
      targetId: artwork.id,
      message: "Artwork position and size must use finite positive values.",
    };
  }
  if (!galleryWalls(draft.templateId).includes(artwork.wall)) {
    return {
      code: "invalid-wall",
      target: "artwork",
      targetId: artwork.id,
      message: "That wall is not available in this room.",
    };
  }
  if (artwork.scale < 0.45 || artwork.scale > 1.65) {
    return {
      code: "scale",
      target: "artwork",
      targetId: artwork.id,
      message: "Artwork size must stay between 0.45× and 1.65×.",
    };
  }
  const surface = wallDimensions(template, artwork.wall);
  const size = artworkSize(artwork);
  const rectangle = { x: artwork.x, y: artwork.y, ...size };
  if (
    size.width + ARTWORK_EDGE_CLEARANCE * 2 > surface.width ||
    size.height + ARTWORK_EDGE_CLEARANCE * 2 > surface.height ||
    artwork.x - size.width / 2 < -surface.width / 2 + ARTWORK_EDGE_CLEARANCE ||
    artwork.x + size.width / 2 > surface.width / 2 - ARTWORK_EDGE_CLEARANCE ||
    artwork.y - size.height / 2 < ARTWORK_EDGE_CLEARANCE ||
    artwork.y + size.height / 2 > surface.height - ARTWORK_EDGE_CLEARANCE
  ) {
    return {
      code: "out-of-bounds",
      target: "artwork",
      targetId: artwork.id,
      message:
        "The complete artwork must stay clear of the wall edges, floor, and ceiling.",
    };
  }
  const exclusion = wallExclusions(template).find(
    (item) =>
      item.wall === artwork.wall &&
      rectanglesOverlap(
        rectangle,
        {
          x: item.centerX,
          y: (item.bottom + item.top) / 2,
          width: item.width,
          height: item.top - item.bottom,
        },
        0.12,
        0.12,
      ),
  );
  if (exclusion) {
    return {
      code: "opening",
      target: "artwork",
      targetId: artwork.id,
      message: `Move the artwork clear of ${exclusion.label}.`,
    };
  }
  const neighbor = draft.artworks.find(
    (item) =>
      item.id !== artwork.id &&
      item.wall === artwork.wall &&
      rectanglesOverlap(
        rectangle,
        { x: item.x, y: item.y, ...artworkSize(item) },
        ARTWORK_GAP_X,
        ARTWORK_GAP_Y,
      ),
  );
  if (neighbor) {
    return {
      code: "overlap",
      target: "artwork",
      targetId: artwork.id,
      relatedId: neighbor.id,
      message: `Leave more space around “${neighbor.title || "Untitled artwork"}”.`,
    };
  }
  return null;
}

export function updateArtworkPlacement(
  draft: GalleryDraft,
  artworkId: string,
  change: Partial<Pick<Artwork, "wall" | "x" | "y" | "scale">>,
): PlacementResult {
  const artwork = draft.artworks.find((item) => item.id === artworkId);
  if (!artwork)
    return {
      ok: false,
      draft,
      issue: {
        code: "invalid-wall",
        target: "artwork",
        targetId: artworkId,
        message: "This artwork is no longer in the draft.",
      },
    };
  const normalizedChange = {
    ...change,
    ...(typeof change.x === "number" && Number.isFinite(change.x)
      ? { x: snap(change.x) }
      : {}),
    ...(typeof change.y === "number" && Number.isFinite(change.y)
      ? { y: snapToEyeLineGrid(change.y) }
      : {}),
  };
  const changesPlacement = Object.entries(normalizedChange).some(
    ([key, value]) => artwork[key as keyof Artwork] !== value,
  );
  if (artwork.locked && changesPlacement)
    return {
      ok: false,
      draft,
      issue: {
        code: "locked",
        target: "artwork",
        targetId: artworkId,
        message: "Unlock this artwork before changing its placement.",
      },
    };
  const candidate = { ...artwork, ...normalizedChange };
  const issue = validateArtworkPlacement(draft, candidate);
  if (issue) return { ok: false, draft, issue };
  return {
    ok: true,
    draft: {
      ...draft,
      artworks: draft.artworks.map((item) =>
        item.id === artworkId ? candidate : item,
      ),
    },
  };
}

export function findAvailableArtworkPlacement(
  draft: GalleryDraft,
  artworkId: string,
  wall: WallId,
  preferredX = 0,
  preferredY = DEFAULT_ARTWORK_EYE_LINE_METRES,
): Pick<Artwork, "wall" | "x" | "y" | "scale"> | null {
  const artwork = draft.artworks.find((item) => item.id === artworkId);
  if (!artwork || !galleryWalls(draft.templateId).includes(wall)) return null;
  const template = getTemplate(draft.templateId);
  const surface = wallDimensions(template, wall);
  const size = artworkSize(artwork);
  if (
    size.width + ARTWORK_EDGE_CLEARANCE * 2 > surface.width ||
    size.height + ARTWORK_EDGE_CLEARANCE * 2 > surface.height
  )
    return null;
  const minX = -surface.width / 2 + size.width / 2 + ARTWORK_EDGE_CLEARANCE;
  const maxX = surface.width / 2 - size.width / 2 - ARTWORK_EDGE_CLEARANCE;
  const minY = size.height / 2 + ARTWORK_EDGE_CLEARANCE;
  const maxY = surface.height - size.height / 2 - ARTWORK_EDGE_CLEARANCE;
  const targetX = snapWithinGridBounds(preferredX, minX, maxX);
  const targetY = snapWithinGridBounds(
    preferredY,
    minY,
    maxY,
    DEFAULT_ARTWORK_EYE_LINE_METRES,
  );
  const candidates: Array<{ x: number; y: number; distance: number }> = [
    { x: targetX, y: targetY, distance: -1 },
  ];
  for (let y = minY; y <= maxY + 0.001; y += 0.2) {
    for (let x = minX; x <= maxX + 0.001; x += 0.2) {
      candidates.push({
        x: snapWithinGridBounds(x, minX, maxX),
        y: snapWithinGridBounds(
          y,
          minY,
          maxY,
          DEFAULT_ARTWORK_EYE_LINE_METRES,
        ),
        distance: (x - targetX) ** 2 + (y - targetY) ** 2 * 1.45,
      });
    }
  }
  candidates.sort((left, right) => left.distance - right.distance);
  for (const candidate of candidates) {
    const placed = { ...artwork, wall, x: candidate.x, y: candidate.y };
    if (!validateArtworkPlacement(draft, placed))
      return { wall, x: candidate.x, y: candidate.y, scale: artwork.scale };
  }
  return null;
}

const DECOR_FOOTPRINTS: Record<DecorId, [number, number]> = {
  olive: [1.25, 1.25],
  monstera: [1.55, 1.55],
  "arc-lamp": [2.05, 0.9],
  pedestal: [1.05, 1.05],
  "gallery-bench": [2.65, 0.9],
  "stone-sculpture": [1.2, 1.2],
  "floor-vase": [0.85, 0.85],
};

function decorRectangle(
  item: DecorPlacement,
  clearance = 0,
): OrientedRectangle {
  const [width, depth] = DECOR_FOOTPRINTS[item.type];
  const offset = item.type === "arc-lamp" ? 0.5 * item.scale : 0;
  const cosine = Math.cos(item.rotation);
  const sine = Math.sin(item.rotation);
  return {
    center: { x: item.x + cosine * offset, z: item.z + sine * offset },
    halfWidth: (width * item.scale) / 2 + clearance,
    halfDepth: (depth * item.scale) / 2 + clearance,
    rotation: item.rotation,
  };
}

function rectangleAxes(rectangle: OrientedRectangle): [Point, Point] {
  const cosine = Math.cos(rectangle.rotation);
  const sine = Math.sin(rectangle.rotation);
  return [
    { x: cosine, z: sine },
    { x: -sine, z: cosine },
  ];
}

function projectionRadius(rectangle: OrientedRectangle, axis: Point) {
  const [right, forward] = rectangleAxes(rectangle);
  return (
    rectangle.halfWidth * Math.abs(right.x * axis.x + right.z * axis.z) +
    rectangle.halfDepth * Math.abs(forward.x * axis.x + forward.z * axis.z)
  );
}

function orientedRectanglesOverlap(
  left: OrientedRectangle,
  right: OrientedRectangle,
) {
  const delta = {
    x: right.center.x - left.center.x,
    z: right.center.z - left.center.z,
  };
  return [...rectangleAxes(left), ...rectangleAxes(right)].every((axis) => {
    const distance = Math.abs(delta.x * axis.x + delta.z * axis.z);
    return (
      distance < projectionRadius(left, axis) + projectionRadius(right, axis)
    );
  });
}

function architectureFootprints(
  template: GalleryTemplate,
): Array<OrientedRectangle & { label: string }> {
  const [width, depth] = template.dimensions;
  if (template.id === "white-cube") {
    return [-1, 1].map((side) => ({
      center: { x: side * width * 0.31, z: -depth / 2 + depth * 0.1 + 0.18 },
      halfWidth: 0.08,
      halfDepth: depth * 0.1,
      rotation: 0,
      label: "the illuminated wall reveal",
    }));
  }
  if (template.id === "nocturne") {
    return [
      ...[-1, 1].map((side) => ({
        center: { x: side * width * 0.34, z: -depth * 0.17 },
        halfWidth: 0.09,
        halfDepth: depth * 0.155,
        rotation: side * -0.34,
        label: "an angled gallery wing",
      })),
      {
        center: { x: 0, z: 0.65 },
        halfWidth: 1.72,
        halfDepth: 1.72,
        rotation: 0,
        label: "the sculptural stage",
      },
    ];
  }
  const sideBoundaryX = width * 0.25;
  const crossGalleryZ = depth * 0.2;
  const sideRoomDepth = depth / 2 - crossGalleryZ;
  const sideRoomCenterZ = crossGalleryZ + sideRoomDepth / 2;
  const doorwayWidth = 5.6;
  const doorwaySideLength = (sideRoomDepth - doorwayWidth) / 2;
  const footprints: Array<OrientedRectangle & { label: string }> = [
    {
      center: { x: 0, z: 0 },
      halfWidth: (template.dividerWidth ?? 14) / 2,
      halfDepth: 0.17,
      rotation: 0,
      label: "the central exhibition wall",
    },
  ];
  for (const xSide of [-1, 1])
    for (const zSide of [-1, 1]) {
      const roomCenterZ = zSide * sideRoomCenterZ;
      for (const doorSide of [-1, 1]) {
        footprints.push({
          center: {
            x: xSide * sideBoundaryX,
            z:
              roomCenterZ +
              doorSide * (doorwayWidth / 2 + doorwaySideLength / 2),
          },
          halfWidth: 0.17,
          halfDepth: doorwaySideLength / 2,
          rotation: 0,
          label: "a side-gallery wall",
        });
      }
      const roomWidth = width / 2 - sideBoundaryX;
      footprints.push({
        center: {
          x: xSide * (sideBoundaryX + roomWidth / 2),
          z: zSide * crossGalleryZ,
        },
        halfWidth: roomWidth / 2,
        halfDepth: 0.17,
        rotation: 0,
        label: "a cross-gallery wall",
      });
      footprints.push({
        center: { x: xSide * sideBoundaryX, z: zSide * crossGalleryZ },
        halfWidth: 0.38,
        halfDepth: 0.38,
        rotation: 0,
        label: "a structural pier",
      });
    }
  return footprints;
}

function roomContains(rectangle: OrientedRectangle, template: GalleryTemplate) {
  const [right, forward] = rectangleAxes(rectangle);
  const extentX =
    rectangle.halfWidth * Math.abs(right.x) +
    rectangle.halfDepth * Math.abs(forward.x);
  const extentZ =
    rectangle.halfWidth * Math.abs(right.z) +
    rectangle.halfDepth * Math.abs(forward.z);
  return (
    rectangle.center.x - extentX >=
      -template.dimensions[0] / 2 + FLOOR_EDGE_CLEARANCE &&
    rectangle.center.x + extentX <=
      template.dimensions[0] / 2 - FLOOR_EDGE_CLEARANCE &&
    rectangle.center.z - extentZ >=
      -template.dimensions[1] / 2 + FLOOR_EDGE_CLEARANCE &&
    rectangle.center.z + extentZ <=
      template.dimensions[1] / 2 - FLOOR_EDGE_CLEARANCE
  );
}

export function validateDecorPlacement(
  draft: GalleryDraft,
  decor: DecorPlacement,
): PlacementIssue | null {
  if (!finite(decor.x, decor.z, decor.rotation, decor.scale)) {
    return {
      code: "invalid-number",
      target: "decor",
      targetId: decor.id,
      message: "Object position, rotation, and size must use finite values.",
    };
  }
  if (decor.scale < 0.5 || decor.scale > 1.8) {
    return {
      code: "scale",
      target: "decor",
      targetId: decor.id,
      message: "Object size must stay between 0.50× and 1.80×.",
    };
  }
  const template = getTemplate(draft.templateId);
  const footprint = decorRectangle(decor);
  if (!roomContains(footprint, template)) {
    return {
      code: "out-of-bounds",
      target: "decor",
      targetId: decor.id,
      message: "The complete object footprint must stay inside the room.",
    };
  }
  const architecture = architectureFootprints(template).find((item) =>
    orientedRectanglesOverlap(decorRectangle(decor, DECOR_GAP), item),
  );
  if (architecture) {
    return {
      code: "architecture",
      target: "decor",
      targetId: decor.id,
      message: `Move the object clear of ${architecture.label}.`,
    };
  }
  const neighbor = draft.decor.find(
    (item) =>
      item.id !== decor.id &&
      orientedRectanglesOverlap(
        decorRectangle(decor, DECOR_GAP),
        decorRectangle(item),
      ),
  );
  if (neighbor) {
    return {
      code: "overlap",
      target: "decor",
      targetId: decor.id,
      relatedId: neighbor.id,
      message: `This object overlaps the ${neighbor.type.replaceAll("-", " ")}.`,
    };
  }
  return null;
}

export function updateDecorPlacement(
  draft: GalleryDraft,
  decorId: string,
  change: Partial<Pick<DecorPlacement, "x" | "z" | "rotation" | "scale">>,
): PlacementResult {
  const decor = draft.decor.find((item) => item.id === decorId);
  if (!decor)
    return {
      ok: false,
      draft,
      issue: {
        code: "out-of-bounds",
        target: "decor",
        targetId: decorId,
        message: "This object is no longer in the draft.",
      },
    };
  const normalizedChange = {
    ...change,
    ...(typeof change.x === "number" && Number.isFinite(change.x)
      ? { x: snap(change.x) }
      : {}),
    ...(typeof change.z === "number" && Number.isFinite(change.z)
      ? { z: snap(change.z) }
      : {}),
  };
  const candidate = { ...decor, ...normalizedChange };
  const issue = validateDecorPlacement(draft, candidate);
  if (issue) return { ok: false, draft, issue };
  return {
    ok: true,
    draft: {
      ...draft,
      decor: draft.decor.map((item) =>
        item.id === decorId ? candidate : item,
      ),
    },
  };
}

export function findAvailableDecorPlacement(
  draft: GalleryDraft,
  decor: DecorPlacement,
  preferredX = decor.x,
  preferredZ = decor.z,
): DecorPlacement | null {
  const template = getTemplate(draft.templateId);
  const step = template.id === "pavilion" ? 0.5 : 0.3;
  const candidates: Array<{ x: number; z: number; distance: number }> = [
    { x: snap(preferredX), z: snap(preferredZ), distance: -1 },
  ];
  for (
    let z = -template.dimensions[1] / 2;
    z <= template.dimensions[1] / 2;
    z += step
  ) {
    for (
      let x = -template.dimensions[0] / 2;
      x <= template.dimensions[0] / 2;
      x += step
    ) {
      candidates.push({
        x: snap(x),
        z: snap(z),
        distance: (x - preferredX) ** 2 + (z - preferredZ) ** 2,
      });
    }
  }
  candidates.sort((left, right) => left.distance - right.distance);
  for (const candidate of candidates) {
    const placed = { ...decor, x: candidate.x, z: candidate.z };
    if (!validateDecorPlacement(draft, placed)) return placed;
  }
  return null;
}

export function validateDraftPlacements(draft: GalleryDraft): PlacementIssue[] {
  return [
    ...draft.artworks.map((item) => validateArtworkPlacement(draft, item)),
    ...draft.decor.map((item) => validateDecorPlacement(draft, item)),
  ].filter((issue): issue is PlacementIssue => Boolean(issue));
}

export function repairDraftPlacements(draft: GalleryDraft) {
  let repaired: GalleryDraft = { ...draft, artworks: [], decor: [] };
  const unresolved: PlacementIssue[] = [];
  for (const artwork of draft.artworks) {
    const withArtwork = {
      ...repaired,
      artworks: [...repaired.artworks, artwork],
    };
    const issue = validateArtworkPlacement(withArtwork, artwork);
    if (!issue) {
      repaired = withArtwork;
      continue;
    }
    const placement = artwork.locked
      ? null
      : findAvailableArtworkPlacement(
          withArtwork,
          artwork.id,
          artwork.wall,
          artwork.x,
          artwork.y,
        );
    if (placement)
      repaired = {
        ...repaired,
        artworks: [...repaired.artworks, { ...artwork, ...placement }],
      };
    else {
      unresolved.push(issue);
      repaired = withArtwork;
    }
  }
  for (const decor of draft.decor) {
    const withDecor = { ...repaired, decor: [...repaired.decor, decor] };
    const issue = validateDecorPlacement(withDecor, decor);
    if (!issue) {
      repaired = withDecor;
      continue;
    }
    const placement = findAvailableDecorPlacement(withDecor, decor);
    if (placement)
      repaired = { ...repaired, decor: [...repaired.decor, placement] };
    else {
      unresolved.push(issue);
      repaired = withDecor;
    }
  }
  return { draft: repaired, unresolved };
}
