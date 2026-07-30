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

function chooseAtmosphere(analysis: PaletteAnalysis, templateId: GalleryDraft['templateId']): CuratedAtmosphere {
  if (templateId === 'nocturne') {
    if (analysis.warmth > .045) return { wall: 'charcoal', floor: 'walnut', ceiling: 'warm', lighting: 'evening', mood: 'Warm nocturne', palette: 'Charcoal · walnut · amber light' };
    return { wall: 'charcoal', floor: 'black-marble', ceiling: 'dark', lighting: 'museum', mood: 'Cinematic contrast', palette: 'Charcoal · black marble · focused light' };
  }
  if (templateId === 'pavilion') {
    if (analysis.saturation > .31) return { wall: 'travertine', floor: 'dark-oak', ceiling: 'warm', lighting: 'museum', mood: 'Sculptural warmth', palette: 'Travertine · dark oak · museum light' };
    if (analysis.luminance < .46) return { wall: 'warm', floor: 'marble', ceiling: 'warm', lighting: 'evening', mood: 'Soft monumentality', palette: 'Limewash · white marble · evening light' };
    return { wall: 'linen', floor: 'walnut', ceiling: 'gallery', lighting: 'daylight', mood: 'Natural pavilion', palette: 'Linen · walnut · daylight' };
  }
  if (analysis.saturation > .34 || analysis.luminance > .72) return { wall: 'charcoal', floor: 'black-marble', ceiling: 'dark', lighting: 'museum', mood: 'Graphic contrast', palette: 'Charcoal · black marble · museum light' };
  if (analysis.warmth > .055) return { wall: 'warm', floor: 'walnut', ceiling: 'warm', lighting: 'evening', mood: 'Warm minimalism', palette: 'Limewash · walnut · evening light' };
  if (analysis.luminance < .42) return { wall: 'chalk', floor: 'marble', ceiling: 'gallery', lighting: 'daylight', mood: 'Luminous contrast', palette: 'Plaster · white marble · daylight' };
  return { wall: 'linen', floor: 'concrete', ceiling: 'gallery', lighting: 'museum', mood: 'Quiet modernism', palette: 'Linen · mineral concrete · museum light' };
}

function wallOrder(templateId: GalleryDraft['templateId'], count: number): WallId[] {
  const orders: Record<GalleryDraft['templateId'], WallId[]> = {
    'white-cube': ['north', 'north', 'west', 'east', 'north', 'south', 'west', 'east'],
    nocturne: ['north', 'west', 'east', 'north', 'south', 'west', 'east', 'south'],
    pavilion: ['divider-front', 'divider-front', 'north', 'divider-back', 'west', 'east', 'north', 'divider-back']
  };
  return orders[templateId].slice(0, count);
}

function wallWidth(wall: WallId, template: GalleryTemplate) {
  if (wall.startsWith('divider')) return template.dividerWidth ?? 6.2;
  return wall === 'north' || wall === 'south' ? template.dimensions[0] : template.dimensions[1];
}

function curateArtworkPlacement(artworks: Artwork[], template: GalleryTemplate): Artwork[] {
  const assignments = wallOrder(template.id, artworks.length); const groups = new Map<WallId, number[]>();
  assignments.forEach((wall, index) => groups.set(wall, [...(groups.get(wall) ?? []), index]));
  const placements = artworks.map((artwork) => ({ ...artwork }));
  groups.forEach((indices, wall) => {
    const available = wallWidth(wall, template) - 1.4; const gap = indices.length > 1 ? Math.min(.75, available * .055) : 0;
    const requested = indices.map((index, position) => {
      const artwork = artworks[index]; const portraitBoost = artwork.aspect < .8 ? 1.08 : artwork.aspect > 1.65 ? .82 : 1;
      return Math.min(1.38, Math.max(.68, portraitBoost * (position === 0 && index === 0 ? 1.16 : .96)));
    });
    const requestedWidth = requested.reduce((total, scale, position) => total + 1.5 * scale * artworks[indices[position]].aspect, 0) + gap * Math.max(0, indices.length - 1);
    const fit = Math.min(1, available * .88 / Math.max(requestedWidth, .1));
    const widths = requested.map((scale, position) => 1.5 * Math.max(.55, scale * fit) * artworks[indices[position]].aspect);
    const compositionWidth = widths.reduce((total, width) => total + width, 0) + gap * Math.max(0, indices.length - 1); let cursor = -compositionWidth / 2;
    indices.forEach((artworkIndex, position) => {
      const scale = Math.max(.55, requested[position] * fit); const width = widths[position]; const artwork = placements[artworkIndex];
      artwork.wall = wall; artwork.x = cursor + width / 2; artwork.y = Math.min(template.height - .85, artwork.aspect < .82 ? 2.55 : artwork.aspect > 1.65 ? 2.2 : 2.38); artwork.scale = scale; cursor += width + gap;
    });
  });
  return placements;
}

function curatedDecor(template: GalleryTemplate, artworkCount: number): DecorPlacement[] {
  const [width, depth] = template.dimensions; const make = (type: DecorId, x: number, z: number, rotation: number, scale = 1): DecorPlacement => ({ id: crypto.randomUUID(), type, x, z, rotation, scale });
  if (template.id === 'nocturne') return [make('olive', -width * .39, depth * .31, .45, 1.05), make('arc-lamp', width * .35, depth * .27, -.75, .95), ...(artworkCount > 5 ? [make('pedestal', width * .31, -depth * .3, .25, .9)] : [])];
  if (template.id === 'pavilion') return [make('monstera', -width * .41, depth * .34, .3, 1.12), make('olive', width * .41, -depth * .33, -.35, 1.06), ...(artworkCount > 4 ? [make('pedestal', 0, depth * .18, 0, .92)] : [])];
  return [make('monstera', -width * .4, depth * .34, .35, 1.08), make('arc-lamp', width * .38, depth * .25, -.7, .94), ...(artworkCount > 5 ? [make('pedestal', width * .34, -depth * .31, 0, .9)] : [])];
}

export async function autoCurateGallery(draft: GalleryDraft, template: GalleryTemplate, onPhase?: (phase: CurationPhase) => void): Promise<{ draft: GalleryDraft; report: CurationReport }> {
  if (!draft.artworks.length) throw new Error('Upload at least one artwork before using AI Curator.');
  onPhase?.('palette'); const analysis = await analyzeCollection(draft.artworks); await pause(280);
  onPhase?.('composition'); const artworks = curateArtworkPlacement(draft.artworks, template); await pause(320);
  onPhase?.('atmosphere'); const atmosphere = chooseAtmosphere(analysis, template.id); const decor = curatedDecor(template, artworks.length); await pause(320);
  return {
    draft: { ...draft, artworks, decor, wall: atmosphere.wall, floor: atmosphere.floor, ceiling: atmosphere.ceiling, lighting: atmosphere.lighting },
    report: { mood: atmosphere.mood, palette: atmosphere.palette, placementCount: artworks.length, decorCount: decor.length }
  };
}
