export type TemplateId = 'white-cube' | 'nocturne' | 'pavilion';
export type WallId = 'north' | 'west' | 'east';
export type WallFinish = 'chalk' | 'warm' | 'charcoal';
export type FloorFinish = 'concrete' | 'oak' | 'terrazzo';
export type LightingPreset = 'daylight' | 'museum' | 'evening';
export type DecorId = 'olive' | 'monstera' | 'arc-lamp' | 'pedestal';

export interface DecorPlacement {
  id: string;
  type: DecorId;
  x: number;
  z: number;
  rotation: number;
  scale: number;
}

export interface Artwork {
  id: string;
  assetId?: string;
  title: string;
  year?: string;
  description?: string;
  src: string;
  aspect: number;
  wall: WallId;
  x: number;
  y: number;
  scale: number;
}

export interface GalleryDraft {
  title: string;
  artist: string;
  templateId: TemplateId;
  wall: WallFinish;
  floor: FloorFinish;
  lighting: LightingPreset;
  decor: DecorPlacement[];
  artworks: Artwork[];
}

export const EMPTY_DRAFT: GalleryDraft = {
  title: 'Untitled exhibition', artist: 'Your name', templateId: 'white-cube',
  wall: 'chalk', floor: 'concrete', lighting: 'museum', decor: [], artworks: []
};
