import type { LightingPreset, TemplateId, WallId } from './types';

export type EnvironmentScale = 'focused' | 'architectural' | 'institutional';
export type EnvironmentMaterialIdentity = {
  wall: string;
  wallColor: string;
  floor: string;
  floorColor: string;
  metal: string;
  metalColor: string;
  accent: string;
  accentColor: string;
};

export type EnvironmentArchitecture = {
  entranceWidth: number;
  thresholdDepth: number;
  portalDepth: number;
  trimScale: number;
  ceilingRhythm: 'shadow-gap' | 'coffered' | 'skylight-spine';
};

export type EnvironmentPlacementAnchor = {
  id: string;
  label: string;
  wall: WallId;
  x: number;
  y: number;
  maxWidth: number;
};

export type EnvironmentPerformanceBudget = {
  low: number;
  balanced: number;
  high: number;
};

export interface GalleryTemplate {
  id: TemplateId; index: string; name: string; label: string; description: string;
  dimensions: [number, number]; height: number; maxArtworks: number; dividerWidth?: number; accent: string; camera: [number, number, number];
  scale: EnvironmentScale;
  bestFor: string;
  defaultLighting: LightingPreset;
  materialIdentity: EnvironmentMaterialIdentity;
  architecture: EnvironmentArchitecture;
  placementAnchors: EnvironmentPlacementAnchor[];
  drawCallBudget: EnvironmentPerformanceBudget;
}

export const TEMPLATES: GalleryTemplate[] = [
  {
    id: 'white-cube', index: '01', name: 'The White Cube', label: 'Contemporary · Daylit',
    description: 'A precise contemporary gallery with deep entrance reveals, quiet shadow gaps and an uninterrupted exhibition axis.',
    dimensions: [16, 12], height: 5.3, maxArtworks: 8, accent: '#d9d7ce', camera: [0, 3.9, 14.2],
    scale: 'focused', bestFor: 'Solo shows, portfolios and product narratives', defaultLighting: 'daylight',
    materialIdentity: { wall: 'Mineral plaster', wallColor: '#e8e5dc', floor: 'Honed pale concrete', floorColor: '#cbc9c1', metal: 'Brushed aluminium', metalColor: '#9c9d99', accent: 'Soft white', accentColor: '#f2f0e8' },
    architecture: { entranceWidth: 3.2, thresholdDepth: 1.15, portalDepth: 0.32, trimScale: 0.13, ceilingRhythm: 'shadow-gap' },
    placementAnchors: [
      { id: 'hero-north', label: 'Hero wall', wall: 'north', x: 0, y: 2.42, maxWidth: 4.8 },
      { id: 'pair-west', label: 'West pair', wall: 'west', x: 0, y: 2.25, maxWidth: 3.2 },
      { id: 'pair-east', label: 'East pair', wall: 'east', x: 0, y: 2.25, maxWidth: 3.2 },
    ],
    drawCallBudget: { low: 78, balanced: 92, high: 108 },
  },
  {
    id: 'nocturne', index: '02', name: 'Warm Gallery', label: 'Architectural · Intimate',
    description: 'A warm architectural room with layered portals, tactile wall planes, a sculptural centre and concentrated pools of light.',
    dimensions: [15.5, 11.5], height: 5.8, maxArtworks: 8, accent: '#8f7656', camera: [0, 4.05, 13.8],
    scale: 'architectural', bestFor: 'Private views, design launches and intimate collections', defaultLighting: 'evening',
    materialIdentity: { wall: 'Warm limewash', wallColor: '#8e7865', floor: 'Smoked oak', floorColor: '#392a20', metal: 'Aged bronze', metalColor: '#8b6845', accent: 'Dark mineral stone', accentColor: '#292824' },
    architecture: { entranceWidth: 2.6, thresholdDepth: 1.5, portalDepth: 0.48, trimScale: 0.18, ceilingRhythm: 'coffered' },
    placementAnchors: [
      { id: 'stage-north', label: 'Stage axis', wall: 'north', x: 0, y: 2.58, maxWidth: 4.2 },
      { id: 'salon-west', label: 'West salon', wall: 'west', x: -0.55, y: 2.3, maxWidth: 3 },
      { id: 'salon-east', label: 'East salon', wall: 'east', x: 0.55, y: 2.3, maxWidth: 3 },
    ],
    drawCallBudget: { low: 82, balanced: 98, high: 116 },
  },
  {
    id: 'pavilion', index: '03', name: 'The Grand Forum', label: 'Museum · Skylit',
    description: 'A 40 × 60 metre museum plan with a ceremonial central axis, four connected galleries, deep portals and controlled skylight halls.',
    dimensions: [40, 60], height: 5.6, maxArtworks: 14, dividerWidth: 14, accent: '#aa9372', camera: [0, 3.35, 28.2],
    scale: 'institutional', bestFor: 'Museums, institutions, schools and brand archives', defaultLighting: 'museum',
    materialIdentity: { wall: 'Cut limestone', wallColor: '#d8cdbb', floor: 'Honed travertine', floorColor: '#b7a78f', metal: 'Dark bronze', metalColor: '#4c4034', accent: 'Museum ivory', accentColor: '#e7dfd0' },
    architecture: { entranceWidth: 5.6, thresholdDepth: 2.2, portalDepth: 0.72, trimScale: 0.2, ceilingRhythm: 'skylight-spine' },
    placementAnchors: [
      { id: 'forum-axis', label: 'Central axis', wall: 'divider-front', x: 0, y: 2.45, maxWidth: 7.5 },
      { id: 'north-west', label: 'North-west gallery', wall: 'north-room-west', x: 0, y: 2.32, maxWidth: 4.8 },
      { id: 'north-east', label: 'North-east gallery', wall: 'north-room-east', x: 0, y: 2.32, maxWidth: 4.8 },
      { id: 'south-west', label: 'South-west gallery', wall: 'south-room-west', x: 0, y: 2.32, maxWidth: 4.8 },
      { id: 'south-east', label: 'South-east gallery', wall: 'south-room-east', x: 0, y: 2.32, maxWidth: 4.8 },
    ],
    drawCallBudget: { low: 132, balanced: 168, high: 210 },
  }
];

export const getTemplate = (id: TemplateId) => TEMPLATES.find((item) => item.id === id) ?? TEMPLATES[0];
