import { FLOOR_OPTIONS, WALL_OPTIONS } from "./designCatalog";
import type { GalleryTemplate } from "./templates";
import {
  FORUM_INTERIOR_WALLS,
  isShortGalleryWall,
  type Artwork,
  type DecorId,
  type DecorPlacement,
  type FloorFinish,
  type GalleryDraft,
  type LightingPreset,
  type WallFinish,
  type WallId,
} from "./types";
import {
  DEFAULT_ARTWORK_EYE_LINE_METRES,
  repairDraftPlacements,
  snapToPlacementGrid,
  DECOR_FOOTPRINTS,
  validateDecorPlacement,
  validateDraftPlacements,
} from "./editor/placementValidation";

export type CurationPhase = "palette" | "composition" | "atmosphere";

export interface CurationReport {
  mood: string;
  palette: string;
  placementCount: number;
  decorCount: number;
  signature: string;
  rationale: string;
}

type PaletteAnalysis = {
  luminance: number;
  saturation: number;
  warmth: number;
};
export type CurationStyle = "auto" | "quiet" | "warm" | "bold";
export type CurationScope = "room" | "all" | "objects";
export interface CurationOptions {
  style?: CurationStyle;
  scope?: CurationScope;
  seed?: number;
  recent?: string[];
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

async function imagePalette(source: string): Promise<PaletteAnalysis | null> {
  const image = new Image();
  image.decoding = "async";
  image.crossOrigin = "anonymous";
  image.src = source;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([image.decode(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Image unavailable")), 3000);
    })]);
  } catch {
    return null;
  } finally { clearTimeout(timer); }
  const canvas = document.createElement("canvas");
  canvas.width = 36;
  canvas.height = 36;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  let pixels: Uint8ClampedArray;
  try {
    pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  } catch {
    return null;
  }
  let luminance = 0;
  let saturation = 0;
  let warmth = 0;
  let samples = 0;
  for (let index = 0; index < pixels.length; index += 16) {
    const alpha = pixels[index + 3] / 255;
    if (alpha < 0.35) continue;
    const r = pixels[index] / 255;
    const g = pixels[index + 1] / 255;
    const b = pixels[index + 2] / 255;
    const maximum = Math.max(r, g, b);
    const minimum = Math.min(r, g, b);
    luminance += r * 0.2126 + g * 0.7152 + b * 0.0722;
    saturation += maximum ? (maximum - minimum) / maximum : 0;
    warmth += r - b;
    samples += 1;
  }
  return samples
    ? {
        luminance: luminance / samples,
        saturation: saturation / samples,
        warmth: warmth / samples,
      }
    : null;
}

async function analyzeCollection(
  artworks: Artwork[],
): Promise<PaletteAnalysis> {
  const readings = (
    await Promise.all(artworks.map((artwork) => imagePalette(artwork.src)))
  ).filter((item): item is PaletteAnalysis => Boolean(item));
  if (!readings.length) return { luminance: 0.55, saturation: 0.25, warmth: 0 };
  return readings.reduce(
    (total, item) => ({
      luminance: total.luminance + item.luminance / readings.length,
      saturation: total.saturation + item.saturation / readings.length,
      warmth: total.warmth + item.warmth / readings.length,
    }),
    { luminance: 0, saturation: 0, warmth: 0 },
  );
}

type Random = () => number;
function createRandom(initial?: number): Random {
  let seed = initial ?? crypto.getRandomValues(new Uint32Array(1))[0];
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], random: Random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

const atmospheres: Record<Exclude<CurationStyle, "auto">, {
  walls: WallFinish[]; floors: FloorFinish[]; lights: LightingPreset[]; mood: string;
}> = {
  quiet: {
    walls: ["chalk", "linen", "sage", "light-concrete", "sand"],
    floors: ["concrete", "oak", "terrazzo", "cork", "marble"],
    lights: ["daylight", "museum"], mood: "Quiet modernism",
  },
  warm: {
    walls: ["travertine", "sand", "dusty-rose", "warm", "linen"],
    floors: ["walnut", "dark-oak", "terracotta", "parquet", "travertine-floor"],
    lights: ["museum", "evening"], mood: "Earth & timber",
  },
  bold: {
    walls: ["ink-blue", "charcoal", "dark-stone", "microcement"],
    floors: ["marble", "black-marble", "basalt-terrazzo", "walnut"],
    lights: ["museum", "evening"], mood: "Sculptural contrast",
  },
};

const pick = <T,>(items: T[], random: Random): T => items[Math.floor(random() * items.length)];
function chooseAtmosphere(analysis: PaletteAnalysis, draft: GalleryDraft, options: CurationOptions, random: Random) {
  const preferred = analysis.warmth > .08 ? "warm" : analysis.saturation > .45 ? "bold" : "quiet";
  const style = options.style && options.style !== "auto" ? options.style
    : pick(["quiet", "warm", "bold", preferred, draft.templateId === "nocturne" ? "warm" : "quiet"] as Array<Exclude<CurationStyle, "auto">>, random);
  const family = atmospheres[style];
  // Enumerate compatible pairings, then sample without returning the active pairing.
  const pairs = family.walls.flatMap(wall => family.floors.map(floor => ({ wall, floor })))
    .filter(pair => pair.wall !== draft.wall || pair.floor !== draft.floor);
  const pair = pick(pairs, random);
  const lighting = pick(family.lights, random);
  const palette = `${WALL_OPTIONS.find(item => item[0] === pair.wall)?.[2]} · ${FLOOR_OPTIONS.find(item => item[0] === pair.floor)?.[2]} · ${lighting}`;
  return { ...pair, lighting, mood: family.mood, palette };
}

function wallWidth(wall: WallId, template: GalleryTemplate) {
  if (isShortGalleryWall(wall))
    return wall.startsWith("divider") ? (template.dividerWidth ?? 6.2) : template.dimensions[0] / 4;
  return wall === "north" || wall === "south"
    ? template.dimensions[0]
    : template.dimensions[1];
}

function curateArtworkPlacement(
  artworks: Artwork[],
  template: GalleryTemplate,
  random: Random,
): Artwork[] {
  const walls: WallId[] =
    template.id === "pavilion"
      ? ["north", "south", "west", "east", "divider-front", "divider-back", ...FORUM_INTERIOR_WALLS]
      : ["north", "south", "west", "east"];
  const groups = new Map<WallId, number[]>(walls.map((wall) => [wall, []]));
  const loads = new Map<WallId, number>(walls.map((wall) => [wall, 0]));
  const indices = shuffled(
    artworks.map((_, index) => index),
    random,
  );
  const wallSeed = shuffled(walls, random);
  indices.forEach((artworkIndex, position) => {
    const artwork = artworks[artworkIndex];
    const estimate = 1.35 * artworkWidthFactor(artwork.aspect);
    let wall: WallId;
    if (position < wallSeed.length) wall = wallSeed[position];
    else
      wall = walls
        .map((candidate) => ({
          candidate,
          score:
            ((loads.get(candidate) ?? 0) + estimate) /
              Math.max(1, wallWidth(candidate, template) - 2.2) +
            random() * 0.075,
        }))
        .sort((a, b) => a.score - b.score)[0].candidate;
    groups.get(wall)!.push(artworkIndex);
    loads.set(wall, (loads.get(wall) ?? 0) + estimate);
  });
  const placements = artworks.map((artwork) => ({ ...artwork }));
  groups.forEach((indices, wall) => {
    if (!indices.length) return;
    const ordered = shuffled(indices, random);
    const padding = template.id === "pavilion" ? 2.2 : 1.25;
    const available = wallWidth(wall, template) - padding * 2;
    const gap =
      ordered.length > 1
        ? 0.62 + random() * (template.id === "pavilion" ? 0.68 : 0.32)
        : 0;
    const requested = ordered.map((index) => {
      const aspect = artworks[index].aspect;
      const aspectFactor = aspect < 0.78 ? 1.08 : aspect > 1.7 ? 0.76 : 1;
      return clamp((0.82 + random() * 0.42) * aspectFactor, 0.56, 1.42);
    });
    const requestedWidth =
      requested.reduce(
        (total, scale, position) =>
          total + 1.5 * scale * artworks[ordered[position]].aspect,
        0,
      ) +
      gap * Math.max(0, ordered.length - 1);
    const fit = Math.min(1, available / Math.max(requestedWidth, 0.1));
    const scales = requested.map((scale) => Math.max(0.45, scale * fit));
    const widths = scales.map(
      (scale, position) => 1.5 * scale * artworks[ordered[position]].aspect,
    );
    const compositionWidth =
      widths.reduce((total, width) => total + width, 0) +
      gap * Math.max(0, ordered.length - 1);
    const spare = Math.max(0, available - compositionWidth);
    let cursor = -compositionWidth / 2 + (random() - 0.5) * spare * 0.72;
    ordered.forEach((artworkIndex, position) => {
      const scale = scales[position];
      const width = widths[position];
      const artwork = placements[artworkIndex];
      const artHeight = 1.5 * scale;
      const wallHeight = isShortGalleryWall(wall)
        ? template.height - 0.65
        : template.height;
      artwork.wall = wall;
      artwork.x = snapToPlacementGrid(cursor + width / 2);
      artwork.y = snapToPlacementGrid(
        clamp(
          DEFAULT_ARTWORK_EYE_LINE_METRES,
          artHeight / 2 + 0.35,
          wallHeight - artHeight / 2 - 0.4,
        ),
        DEFAULT_ARTWORK_EYE_LINE_METRES,
      );
      artwork.scale = scale;
      cursor += width + gap;
    });
  });
  return placements;
}

function artworkWidthFactor(aspect: number) {
  return Math.min(2.4, Math.max(0.72, aspect));
}

// Furniture occupies the edges of a gallery, with a continuous 2.4 m main aisle.
// In the Forum, side-room doors at z = ±21 also keep a 2.4 m corridor.
export function curationCirculationClear(item: DecorPlacement, template: GalleryTemplate) {
  const [w, d] = DECOR_FOOTPRINTS[item.type];
  const xExtent = (Math.abs(Math.cos(item.rotation)) * w + Math.abs(Math.sin(item.rotation)) * d) * item.scale / 2;
  const zExtent = (Math.abs(Math.sin(item.rotation)) * w + Math.abs(Math.cos(item.rotation)) * d) * item.scale / 2;
  const lampOffset = item.type === "arc-lamp" ? .5 * item.scale : 0;
  if (Math.abs(item.x) - xExtent - lampOffset < 1.2) return false;
  if (template.id === "pavilion" && Math.abs(Math.abs(item.z) - 21) - zExtent - lampOffset < 1.2) return false;
  // Leave a viewing strip in front of the perimeter artworks.
  return Math.abs(item.x) + xExtent + lampOffset < template.dimensions[0] / 2 - 1.45
    && Math.abs(item.z) + zExtent + lampOffset < template.dimensions[1] / 2 - 1.45;
}

function curatedDecor(draft: GalleryDraft, template: GalleryTemplate, random: Random): DecorPlacement[] {
  const categories: DecorId[][] = [
    ["leather-bench", "lounge-chair", "wood-stool"],
    ["olive", "monstera", "snake-plant"],
    ["stone-sculpture", "pedestal", "floor-vase"],
    ["stone-table", "light-column", "arc-lamp"],
  ];
  const types = categories.map(items => pick(items, random));
  if (template.id === "pavilion") {
    types.push(...shuffled(categories.flat().filter(type => !types.includes(type)), random).slice(0, 1 + Math.floor(random() * 2)));
  } else if (random() < .35) types.pop();
  const [width, depth] = template.dimensions;
  const points: Array<[number, number]> = template.id === "pavilion"
    ? [-.36, -.15, .15, .36].flatMap(x => [-.41, -.27, -.09, .09, .27, .41].map(z => [x, z] as [number, number]))
    : [-.27, .27].flatMap(x => [-.24, 0, .24].map(z => [x, z] as [number, number]));
  const decor: DecorPlacement[] = [];
  for (const type of types) {
    const seat = decor[0];
    const candidates = shuffled(points, random);
    if (type === "stone-table" && seat) candidates.unshift([
      (seat.x + Math.sin(seat.rotation) * 1.65) / width,
      (seat.z + Math.cos(seat.rotation) * 1.65) / depth,
    ]);
    for (const [x, z] of candidates) {
      const item: DecorPlacement = {
        id: crypto.randomUUID(), type,
        x: snapToPlacementGrid(x * width + (random() - .5) * .65),
        z: snapToPlacementGrid(z * depth + (random() - .5) * .65),
        // Seats face the collection across the room; objects align to architecture.
        rotation: type === "lounge-chair" ? (x < 0 ? Math.PI / 2 : Math.PI * 1.5) : pick([0, Math.PI / 2, Math.PI], random),
        scale: snapToPlacementGrid(.88 + random() * .2),
        ...(["olive", "monstera", "snake-plant"].includes(type) ? { potColor: pick(["light", "black"] as Array<"light" | "black">, random) } : {}),
      };
      if (!curationCirculationClear(item, template) || validateDecorPlacement({ ...draft, decor }, item)) continue;
      decor.push(item);
      break;
    }
  }
  return decor;
}

/** Content signature excludes generated object IDs, so a fresh UUID cannot disguise repetition. */
export function curationSignature(draft: GalleryDraft) {
  return JSON.stringify([draft.wall, draft.floor, draft.ceiling, draft.lighting,
    draft.artworks.map(({ id, wall, x, y, scale }) => [id, wall, x, y, scale]),
    draft.decor.map(({ type, x, z, rotation, scale, potColor }) => [type, x, z, rotation, scale, potColor]),
  ]);
}

export function composeGallery(
  draft: GalleryDraft, template: GalleryTemplate, options: CurationOptions = {},
  analysis: PaletteAnalysis = { luminance: .55, saturation: .25, warmth: 0 },
): { draft: GalleryDraft; report: CurationReport } {
  const random = createRandom(options.seed);
  const scope = options.scope ?? "room";
  const excluded = new Set([curationSignature(draft), ...(options.recent ?? [])]);
  for (let attempt = 0; attempt < 12; attempt++) {
    const atmosphere = chooseAtmosphere(analysis, draft, options, random);
    let candidate: GalleryDraft = { ...draft, ...(scope === "objects" ? {} : {
      wall: atmosphere.wall, floor: atmosphere.floor, lighting: atmosphere.lighting,
    }) };
    if (scope === "all") {
      const movable = draft.artworks.filter(item => !item.locked && !item.hidden);
      const fixed = draft.artworks.filter(item => item.locked || item.hidden);
      const repaired = repairDraftPlacements({ ...candidate, decor: [], artworks: [
        ...fixed, ...curateArtworkPlacement(movable, template, random),
      ] });
      if (repaired.unresolved.length) continue;
      candidate = { ...candidate, artworks: draft.artworks.map(item =>
        fixed.includes(item) ? item : repaired.draft.artworks.find(art => art.id === item.id)!),
      };
    }
    candidate = { ...candidate, decor: curatedDecor(candidate, template, random) };
    if (candidate.decor.length < 3 || validateDraftPlacements(candidate).length) continue;
    const signature = curationSignature(candidate);
    if (excluded.has(signature)) continue;
    return { draft: candidate, report: {
      mood: scope === "objects" ? "A new composition" : atmosphere.mood,
      palette: scope === "objects" ? "Your surfaces and lighting retained" : atmosphere.palette,
      placementCount: scope === "all" ? candidate.artworks.filter(item => !item.locked && !item.hidden).length : 0,
      decorCount: candidate.decor.length, signature,
      rationale: `${scope === "all" ? "Locked and hidden works retained." : "Artwork positions retained."} Clear main aisle; no repeated objects.`,
    } };
  }
  throw new Error("No safe new composition fits this draft. Check the highlighted placements or free some wall space.");
}

export async function autoCurateGallery(
  draft: GalleryDraft, template: GalleryTemplate,
  onPhase?: (phase: CurationPhase) => void, options: CurationOptions = {},
): Promise<{ draft: GalleryDraft; report: CurationReport }> {
  onPhase?.("palette");
  const analysis = await analyzeCollection(draft.artworks.filter(item => !item.hidden));
  onPhase?.("composition");
  const result = composeGallery(draft, template, options, analysis);
  onPhase?.("atmosphere");
  return result;
}
