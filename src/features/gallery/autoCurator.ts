import type { GalleryTemplate } from "./templates";
import {
  FORUM_INTERIOR_WALLS,
  isShortGalleryWall,
  type Artwork,
  type CeilingFinish,
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
} from "./editor/placementValidation";

export type CurationPhase = "palette" | "composition" | "atmosphere";

export interface CurationReport {
  mood: string;
  palette: string;
  placementCount: number;
  decorCount: number;
}

type PaletteAnalysis = {
  luminance: number;
  saturation: number;
  warmth: number;
};
type CuratedAtmosphere = {
  wall: WallFinish;
  floor: FloorFinish;
  ceiling: CeilingFinish;
  lighting: LightingPreset;
  mood: string;
  palette: string;
};

const pause = (duration: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, duration));
const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

async function imagePalette(source: string): Promise<PaletteAnalysis | null> {
  const image = new Image();
  image.decoding = "async";
  image.src = source;
  try {
    await image.decode();
  } catch {
    return null;
  }
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
type ScoredAtmosphere = CuratedAtmosphere & {
  score: (analysis: PaletteAnalysis) => number;
};

function createRandom(): Random {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  let seed = values[0] || Date.now();
  return () => {
    seed |= 0;
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

function chooseAtmosphere(
  analysis: PaletteAnalysis,
  templateId: GalleryDraft["templateId"],
  current: GalleryDraft,
  random: Random,
): CuratedAtmosphere {
  const collections: Record<GalleryDraft["templateId"], ScoredAtmosphere[]> = {
    "white-cube": [
      {
        wall: "chalk",
        floor: "marble",
        ceiling: "gallery",
        lighting: "daylight",
        mood: "Luminous restraint",
        palette: "Plaster · white marble · daylight",
        score: (item) => 1.2 - item.luminance + (1 - item.saturation) * 0.25,
      },
      {
        wall: "linen",
        floor: "concrete",
        ceiling: "gallery",
        lighting: "museum",
        mood: "Quiet modernism",
        palette: "Linen · mineral concrete · museum light",
        score: (item) => 0.6 + (1 - item.saturation) * 0.4,
      },
      {
        wall: "warm",
        floor: "walnut",
        ceiling: "warm",
        lighting: "evening",
        mood: "Warm minimalism",
        palette: "Limewash · walnut · evening light",
        score: (item) => 0.55 + Math.max(0, item.warmth) * 3,
      },
      {
        wall: "charcoal",
        floor: "black-marble",
        ceiling: "dark",
        lighting: "museum",
        mood: "Graphic contrast",
        palette: "Charcoal · black marble · museum light",
        score: (item) => 0.4 + item.saturation + item.luminance * 0.25,
      },
    ],
    nocturne: [
      {
        wall: "charcoal",
        floor: "walnut",
        ceiling: "warm",
        lighting: "evening",
        mood: "Warm nocturne",
        palette: "Charcoal · walnut · amber light",
        score: (item) => 0.8 + Math.max(0, item.warmth) * 3,
      },
      {
        wall: "charcoal",
        floor: "black-marble",
        ceiling: "dark",
        lighting: "museum",
        mood: "Cinematic contrast",
        palette: "Charcoal · black marble · focused light",
        score: (item) => 0.7 + item.saturation * 0.7,
      },
      {
        wall: "warm",
        floor: "dark-oak",
        ceiling: "dark",
        lighting: "evening",
        mood: "Bronze dusk",
        palette: "Limewash · smoked oak · low light",
        score: (item) => 0.55 + Math.abs(item.warmth),
      },
      {
        wall: "linen",
        floor: "black-marble",
        ceiling: "gallery",
        lighting: "museum",
        mood: "Gallery chiaroscuro",
        palette: "Linen · nero marble · museum light",
        score: (item) => 0.55 + (1 - item.luminance) * 0.35,
      },
    ],
    pavilion: [
      {
        wall: "travertine",
        floor: "dark-oak",
        ceiling: "warm",
        lighting: "museum",
        mood: "Sculptural warmth",
        palette: "Travertine · dark oak · museum light",
        score: (item) => 0.7 + item.saturation * 0.65,
      },
      {
        wall: "warm",
        floor: "marble",
        ceiling: "warm",
        lighting: "evening",
        mood: "Soft monumentality",
        palette: "Limewash · white marble · evening light",
        score: (item) => 0.65 + Math.max(0, item.warmth) * 2,
      },
      {
        wall: "linen",
        floor: "walnut",
        ceiling: "gallery",
        lighting: "daylight",
        mood: "Natural atrium",
        palette: "Linen · walnut · daylight",
        score: (item) => 0.6 + item.luminance * 0.35,
      },
      {
        wall: "chalk",
        floor: "black-marble",
        ceiling: "dark",
        lighting: "museum",
        mood: "Monumental monochrome",
        palette: "Plaster · nero marble · halo light",
        score: (item) => 0.5 + item.saturation * 0.5,
      },
      {
        wall: "travertine",
        floor: "marble",
        ceiling: "gallery",
        lighting: "daylight",
        mood: "Daylight forum",
        palette: "Travertine · carrara · sky light",
        score: (item) => 0.5 + (1 - item.saturation) * 0.35,
      },
    ],
  };
  const currentSignature = [
    current.wall,
    current.floor,
    current.ceiling,
    current.lighting,
  ].join("|");
  const candidates = collections[templateId]
    .filter(
      (item) =>
        [item.wall, item.floor, item.ceiling, item.lighting].join("|") !==
        currentSignature,
    )
    .map((item) => ({ item, value: item.score(analysis) + random() * 0.42 }))
    .sort((a, b) => b.value - a.value);
  const chosen =
    candidates[
      Math.min(
        candidates.length - 1,
        Math.floor(random() * Math.min(2, candidates.length)),
      )
    ].item;
  return {
    wall: chosen.wall,
    floor: chosen.floor,
    ceiling: chosen.ceiling,
    lighting: chosen.lighting,
    mood: chosen.mood,
    palette: chosen.palette,
  };
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

function curatedDecor(
  template: GalleryTemplate,
  artworkCount: number,
  current: DecorPlacement[],
  random: Random,
): DecorPlacement[] {
  const [width, depth] = template.dimensions;
  const count =
    template.id === "pavilion"
      ? artworkCount > 10
        ? 6
        : 5
      : artworkCount > 5
        ? 4
        : 3;
  const pools: Record<GalleryDraft["templateId"], DecorId[]> = {
    "white-cube": [
      "olive",
      "snake-plant",
      "arc-lamp",
      "pedestal",
      "stone-sculpture",
      "leather-bench",
    ],
    nocturne: [
      "olive",
      "snake-plant",
      "arc-lamp",
      "stone-sculpture",
      "leather-bench",
      "pedestal",
    ],
    pavilion: [
      "olive",
      "snake-plant",
      "leather-bench",
      "stone-sculpture",
      "arc-lamp",
      "pedestal",
    ],
  };
  let types = shuffled(pools[template.id], random).slice(0, count);
  const currentTypes = current
    .map((item) => item.type)
    .sort()
    .join("|");
  if (types.slice().sort().join("|") === currentTypes)
    types = [
      ...types.slice(1),
      pools[template.id].find((item) => !types.includes(item)) ?? types[0],
    ];
  const points: Array<[number, number]> =
    template.id === "pavilion"
      ? [
          [-0.37, 0.34],
          [0.37, 0.34],
          [-0.37, -0.34],
          [0.37, -0.34],
          [-0.37, 0],
          [0.37, 0],
          [-0.12, 0.36],
          [0.12, -0.36],
        ]
      : [
          [-0.4, 0.35],
          [0.4, 0.34],
          [-0.38, -0.35],
          [0.38, -0.34],
          [-0.16, 0.28],
          [0.18, -0.28],
        ];
  return shuffled(points, random)
    .slice(0, count)
    .map(([xRatio, zRatio], index) => {
      const type = types[index];
      const x = xRatio * width + (random() - 0.5) * width * 0.035;
      const z = zRatio * depth + (random() - 0.5) * depth * 0.035;
      const scaleBase =
        type === "floor-vase" || type === "snake-plant" || type === "wood-stool"
          ? 0.9
          : type === "gallery-bench" || type === "leather-bench"
            ? 1.04
            : type === "stone-sculpture"
              ? 0.95
              : 1;
      return {
        id: crypto.randomUUID(),
        type,
        x: snapToPlacementGrid(x),
        z: snapToPlacementGrid(z),
        rotation: Math.atan2(-x, -z) + (random() - 0.5) * 0.5,
        scale: scaleBase * (0.9 + random() * 0.22),
      };
    });
}

export async function autoCurateGallery(
  draft: GalleryDraft,
  template: GalleryTemplate,
  onPhase?: (phase: CurationPhase) => void,
): Promise<{ draft: GalleryDraft; report: CurationReport }> {
  const curatable = draft.artworks.filter(
    (artwork) => !artwork.hidden && !artwork.locked,
  );
  if (!draft.artworks.length)
    throw new Error("Upload at least one artwork before using AI Curator.");
  if (!curatable.length)
    throw new Error(
      "Show or unlock at least one artwork before using AI Curator.",
    );
  const random = createRandom();
  onPhase?.("palette");
  const analysis = await analyzeCollection(curatable);
  await pause(280);
  onPhase?.("composition");
  const curated = curateArtworkPlacement(curatable, template, random);
  const curatedById = new Map(curated.map((artwork) => [artwork.id, artwork]));
  const artworks = draft.artworks.map(
    (artwork) => curatedById.get(artwork.id) ?? artwork,
  );
  await pause(320);
  onPhase?.("atmosphere");
  const atmosphere = chooseAtmosphere(analysis, template.id, draft, random);
  const decor = curatedDecor(template, curatable.length, draft.decor, random);
  await pause(320);
  const candidate = {
    ...draft,
    artworks,
    decor,
    wall: atmosphere.wall,
    floor: atmosphere.floor,
    ceiling: atmosphere.ceiling,
    lighting: atmosphere.lighting,
  };
  const repaired = repairDraftPlacements(candidate);
  if (repaired.unresolved.length)
    throw new Error(
      `AI Curator could not make every placement safe. ${repaired.unresolved[0].message}`,
    );
  return {
    draft: repaired.draft,
    report: {
      mood: atmosphere.mood,
      palette: atmosphere.palette,
      placementCount: repaired.draft.artworks.length,
      decorCount: repaired.draft.decor.length,
    },
  };
}
