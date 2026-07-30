import type { GalleryTemplate } from './templates';
import type {
  Artwork, CeilingFinish, DecorId, DecorPlacement, FloorFinish,
  GalleryDraft, LightingPreset, WallFinish, WallId
} from './types';

export type CurationPhase = 'palette' | 'composition' | 'atmosphere';

export interface CurationReport {
  mood: string;
  palette: string;
  placementCount: number;
  decorCount: number;
}

type PaletteAnalysis = { luminance: number; saturation: number; warmth: number };
type CuratedAtmosphere = {
  wall: WallFinish; floor: FloorFinish; ceiling: CeilingFinish;
  lighting: LightingPreset; mood: string; palette: string;
};

const pause = (duration: number) => new Promise<void>((resolve) => window.setTimeout(resolve, duration));
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

async function imagePalette(source: string): Promise<PaletteAnalysis | null> {
  const image = new Image(); image.decoding = 'async'; image.src = source;
  try { await image.decode(); } catch { return null; }
  const canvas = document.createElement('canvas'); canvas.width = 36; canvas.height = 36;
  const context = canvas.getContext('2d', { willReadFrequently: true }); if (!context) return null;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  let pixels: Uint8ClampedArray; try { pixels = context.getImageData(0, 0, canvas.width, canvas.height).data; } catch { return null; }
  let luminance = 0; let saturation = 0; let warmth = 0; let samples = 0;
  for (let index = 0; index < pixels.length; index += 16) {
    const alpha = pixels[index + 3] / 255; if (alpha < .35) continue;
    const r = pixels[index] / 255; const g = pixels[index + 1] / 255; const b = pixels[index + 2] / 255;
    const maximum = Math.max(r, g, b); const minimum = Math.min(r, g, b);
    luminance += r * .2126 + g * .7152 + b * .0722; saturation += maximum ? (maximum - minimum) / maximum : 0; warmth += r - b; samples += 1;
  }
  return samples ? { luminance: luminance / samples, saturation: saturation / samples, warmth: warmth / samples } : null;
}

async function analyzeCollection(artworks: Artwork[]): Promise<PaletteAnalysis> {
  const readings = (await Promise.all(artworks.map((artwork) => imagePalette(artwork.src)))).filter((item): item is PaletteAnalysis => Boolean(item));
  if (!readings.length) return { luminance: .55, saturation: .25, warmth: 0 };
  return readings.reduce((total, item) => ({ luminance: total.luminance + item.luminance / readings.length, saturation: total.saturation + item.saturation / readings.length, warmth: total.warmth + item.warmth / readings.length }), { luminance: 0, saturation: 0, warmth: 0 });
}

type Random = () => number;
type ScoredAtmosphere = CuratedAtmosphere & { score: (analysis: PaletteAnalysis) => number };

function createRandom(): Random {
  const values = new Uint32Array(1); crypto.getRandomValues(values); let seed = values[0] || Date.now();
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let value = Math.imul(seed ^ seed >>> 15, 1 | seed); value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value; return ((value ^ value >>> 14) >>> 0) / 4294967296; };
}

function shuffled<T>(items: T[], random: Random) {
  const result = [...items]; for (let index = result.length - 1; index > 0; index--) { const target = Math.floor(random() * (index + 1)); [result[index], result[target]] = [result[target], result[index]]; } return result;
}

function chooseAtmosphere(analysis: PaletteAnalysis, templateId: GalleryDraft['templateId'], current: GalleryDraft, random: Random): CuratedAtmosphere {
  const collections: Record<GalleryDraft['templateId'], ScoredAtmosphere[]> = {
    'white-cube': [
      { wall: 'chalk', floor: 'marble', ceiling: 'gallery', lighting: 'daylight', mood: 'Luminous restraint', palette: 'Plaster · white marble · daylight', score: (item) => 1.2 - item.luminance + (1 - item.saturation) * .25 },
      { wall: 'linen', floor: 'concrete', ceiling: 'gallery', lighting: 'museum', mood: 'Quiet modernism', palette: 'Linen · mineral concrete · museum light', score: (item) => .6 + (1 - item.saturation) * .4 },
      { wall: 'warm', floor: 'walnut', ceiling: 'warm', lighting: 'evening', mood: 'Warm minimalism', palette: 'Limewash · walnut · evening light', score: (item) => .55 + Math.max(0, item.warmth) * 3 },
      { wall: 'charcoal', floor: 'black-marble', ceiling: 'dark', lighting: 'museum', mood: 'Graphic contrast', palette: 'Charcoal · black marble · museum light', score: (item) => .4 + item.saturation + item.luminance * .25 }
    ],
    nocturne: [
      { wall: 'charcoal', floor: 'walnut', ceiling: 'warm', lighting: 'evening', mood: 'Warm nocturne', palette: 'Charcoal · walnut · amber light', score: (item) => .8 + Math.max(0, item.warmth) * 3 },
      { wall: 'charcoal', floor: 'black-marble', ceiling: 'dark', lighting: 'museum', mood: 'Cinematic contrast', palette: 'Charcoal · black marble · focused light', score: (item) => .7 + item.saturation * .7 },
      { wall: 'warm', floor: 'dark-oak', ceiling: 'dark', lighting: 'evening', mood: 'Bronze dusk', palette: 'Limewash · smoked oak · low light', score: (item) => .55 + Math.abs(item.warmth) },
      { wall: 'linen', floor: 'black-marble', ceiling: 'gallery', lighting: 'museum', mood: 'Gallery chiaroscuro', palette: 'Linen · nero marble · museum light', score: (item) => .55 + (1 - item.luminance) * .35 }
    ],
    pavilion: [
      { wall: 'travertine', floor: 'dark-oak', ceiling: 'warm', lighting: 'museum', mood: 'Sculptural warmth', palette: 'Travertine · dark oak · museum light', score: (item) => .7 + item.saturation * .65 },
      { wall: 'warm', floor: 'marble', ceiling: 'warm', lighting: 'evening', mood: 'Soft monumentality', palette: 'Limewash · white marble · evening light', score: (item) => .65 + Math.max(0, item.warmth) * 2 },
      { wall: 'linen', floor: 'walnut', ceiling: 'gallery', lighting: 'daylight', mood: 'Natural atrium', palette: 'Linen · walnut · daylight', score: (item) => .6 + item.luminance * .35 },
      { wall: 'chalk', floor: 'black-marble', ceiling: 'dark', lighting: 'museum', mood: 'Monumental monochrome', palette: 'Plaster · nero marble · halo light', score: (item) => .5 + item.saturation * .5 },
      { wall: 'travertine', floor: 'marble', ceiling: 'gallery', lighting: 'daylight', mood: 'Daylight forum', palette: 'Travertine · carrara · sky light', score: (item) => .5 + (1 - item.saturation) * .35 }
    ]
  };
  const currentSignature = [current.wall, current.floor, current.ceiling, current.lighting].join('|');
  const candidates = collections[templateId].filter((item) => [item.wall, item.floor, item.ceiling, item.lighting].join('|') !== currentSignature).map((item) => ({ item, value: item.score(analysis) + random() * .42 })).sort((a, b) => b.value - a.value);
  const chosen = candidates[Math.min(candidates.length - 1, Math.floor(random() * Math.min(2, candidates.length)))].item;
  return { wall: chosen.wall, floor: chosen.floor, ceiling: chosen.ceiling, lighting: chosen.lighting, mood: chosen.mood, palette: chosen.palette };
}

function wallWidth(wall: WallId, template: GalleryTemplate) {
  if (wall.startsWith('divider')) return template.dividerWidth ?? 6.2;
  return wall === 'north' || wall === 'south' ? template.dimensions[0] : template.dimensions[1];
}

function curateArtworkPlacement(artworks: Artwork[], template: GalleryTemplate, random: Random): Artwork[] {
  const walls: WallId[] = template.id === 'pavilion' ? ['north', 'south', 'west', 'east', 'divider-front', 'divider-back'] : ['north', 'south', 'west', 'east'];
  const groups = new Map<WallId, number[]>(walls.map((wall) => [wall, []])); const loads = new Map<WallId, number>(walls.map((wall) => [wall, 0])); const indices = shuffled(artworks.map((_, index) => index), random); const wallSeed = shuffled(walls, random);
  indices.forEach((artworkIndex, position) => {
    const artwork = artworks[artworkIndex]; const estimate = 1.35 * artworkWidthFactor(artwork.aspect); let wall: WallId;
    if (position < wallSeed.length) wall = wallSeed[position];
    else wall = walls.map((candidate) => ({ candidate, score: ((loads.get(candidate) ?? 0) + estimate) / Math.max(1, wallWidth(candidate, template) - 2.2) + random() * .075 })).sort((a, b) => a.score - b.score)[0].candidate;
    groups.get(wall)!.push(artworkIndex); loads.set(wall, (loads.get(wall) ?? 0) + estimate);
  });
  const placements = artworks.map((artwork) => ({ ...artwork }));
  groups.forEach((indices, wall) => {
    if (!indices.length) return; const ordered = shuffled(indices, random); const padding = template.id === 'pavilion' ? 2.2 : 1.25; const available = wallWidth(wall, template) - padding * 2; const gap = ordered.length > 1 ? .62 + random() * (template.id === 'pavilion' ? .68 : .32) : 0;
    const requested = ordered.map((index) => { const aspect = artworks[index].aspect; const aspectFactor = aspect < .78 ? 1.08 : aspect > 1.7 ? .76 : 1; return clamp((.82 + random() * .42) * aspectFactor, .56, 1.42); });
    const requestedWidth = requested.reduce((total, scale, position) => total + 1.5 * scale * artworks[ordered[position]].aspect, 0) + gap * Math.max(0, ordered.length - 1); const fit = Math.min(1, available / Math.max(requestedWidth, .1));
    const scales = requested.map((scale) => Math.max(.45, scale * fit)); const widths = scales.map((scale, position) => 1.5 * scale * artworks[ordered[position]].aspect); const compositionWidth = widths.reduce((total, width) => total + width, 0) + gap * Math.max(0, ordered.length - 1); const spare = Math.max(0, available - compositionWidth); let cursor = -compositionWidth / 2 + (random() - .5) * spare * .72;
    ordered.forEach((artworkIndex, position) => {
      const scale = scales[position]; const width = widths[position]; const artwork = placements[artworkIndex]; const artHeight = 1.5 * scale; const wallHeight = wall.startsWith('divider') ? template.height - .65 : template.height; const baseY = template.id === 'pavilion' ? 3.05 + random() * .8 : 2.12 + random() * .46;
      artwork.wall = wall; artwork.x = cursor + width / 2; artwork.y = clamp(baseY + (position % 2 ? .08 : -.08), artHeight / 2 + .35, wallHeight - artHeight / 2 - .4); artwork.scale = scale; cursor += width + gap;
    });
  });
  return placements;
}

function artworkWidthFactor(aspect: number) { return Math.min(2.4, Math.max(.72, aspect)); }

function curatedDecor(template: GalleryTemplate, artworkCount: number, current: DecorPlacement[], random: Random): DecorPlacement[] {
  const [width, depth] = template.dimensions; const count = template.id === 'pavilion' ? (artworkCount > 10 ? 6 : 5) : artworkCount > 5 ? 4 : 3;
  const pools: Record<GalleryDraft['templateId'], DecorId[]> = {
    'white-cube': ['monstera', 'olive', 'gallery-bench', 'arc-lamp', 'pedestal', 'floor-vase', 'stone-sculpture'],
    nocturne: ['olive', 'floor-vase', 'arc-lamp', 'stone-sculpture', 'gallery-bench', 'pedestal', 'monstera'],
    pavilion: ['monstera', 'olive', 'gallery-bench', 'stone-sculpture', 'floor-vase', 'arc-lamp', 'pedestal']
  };
  let types = shuffled(pools[template.id], random).slice(0, count); const currentTypes = current.map((item) => item.type).sort().join('|'); if (types.slice().sort().join('|') === currentTypes) types = [...types.slice(1), pools[template.id].find((item) => !types.includes(item)) ?? types[0]];
  const points: Array<[number, number]> = template.id === 'pavilion' ? [
    [-.42,.38],[.42,.37],[-.42,-.38],[.42,-.37],[-.27,.31],[.27,.3],[-.3,-.4],[.3,-.4]
  ] : [[-.4,.35],[.4,.34],[-.38,-.35],[.38,-.34],[-.16,.28],[.18,-.28]];
  return shuffled(points, random).slice(0, count).map(([xRatio, zRatio], index) => {
    const type = types[index]; const x = xRatio * width + (random() - .5) * width * .035; const z = zRatio * depth + (random() - .5) * depth * .035; const scaleBase = type === 'floor-vase' ? .9 : type === 'gallery-bench' ? 1.04 : type === 'stone-sculpture' ? .95 : 1;
    return { id: crypto.randomUUID(), type, x, z, rotation: Math.atan2(-x, -z) + (random() - .5) * .5, scale: scaleBase * (.9 + random() * .22) };
  });
}

export async function autoCurateGallery(draft: GalleryDraft, template: GalleryTemplate, onPhase?: (phase: CurationPhase) => void): Promise<{ draft: GalleryDraft; report: CurationReport }> {
  if (!draft.artworks.length) throw new Error('Upload at least one artwork before using AI Curator.');
  const random = createRandom();
  onPhase?.('palette'); const analysis = await analyzeCollection(draft.artworks); await pause(280);
  onPhase?.('composition'); const artworks = curateArtworkPlacement(draft.artworks, template, random); await pause(320);
  onPhase?.('atmosphere'); const atmosphere = chooseAtmosphere(analysis, template.id, draft, random); const decor = curatedDecor(template, artworks.length, draft.decor, random); await pause(320);
  return {
    draft: { ...draft, artworks, decor, wall: atmosphere.wall, floor: atmosphere.floor, ceiling: atmosphere.ceiling, lighting: atmosphere.lighting },
    report: { mood: atmosphere.mood, palette: atmosphere.palette, placementCount: artworks.length, decorCount: decor.length }
  };
}
