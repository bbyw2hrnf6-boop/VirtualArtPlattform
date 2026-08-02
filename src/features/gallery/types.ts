export type TemplateId = "white-cube" | "nocturne" | "pavilion";
export type WallId =
  | "north"
  | "south"
  | "west"
  | "east"
  | "divider-front"
  | "divider-back";
export type WallFinish = "chalk" | "warm" | "travertine" | "linen" | "charcoal";
export type FloorFinish =
  | "concrete"
  | "oak"
  | "terrazzo"
  | "marble"
  | "black-marble"
  | "walnut"
  | "dark-oak";
export type CeilingFinish = "gallery" | "warm" | "dark";
export type LightingPreset = "daylight" | "museum" | "evening";
export type DecorId =
  | "olive"
  | "monstera"
  | "arc-lamp"
  | "pedestal"
  | "gallery-bench"
  | "stone-sculpture"
  | "floor-vase";
export type ArtworkFrame = "black" | "white" | "oak" | "none";

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
  frame?: ArtworkFrame;
  locked?: boolean;
  hidden?: boolean;
}

export interface GalleryDraft {
  title: string;
  artist: string;
  templateId: TemplateId;
  wall: WallFinish;
  floor: FloorFinish;
  ceiling?: CeilingFinish;
  lighting: LightingPreset;
  decor: DecorPlacement[];
  artworks: Artwork[];
}

export const EMPTY_DRAFT: GalleryDraft = {
  title: "Untitled exhibition",
  artist: "Your name",
  templateId: "white-cube",
  wall: "chalk",
  floor: "concrete",
  ceiling: "gallery",
  lighting: "daylight",
  decor: [],
  artworks: [],
};
