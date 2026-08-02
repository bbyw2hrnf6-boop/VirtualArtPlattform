export const PAVILION_ZONE_IDS = [
  'north-west',
  'central-axis',
  'north-east',
  'south-west',
  'south-east'
] as const;

export type PavilionZoneId = typeof PAVILION_ZONE_IDS[number];

export interface PavilionZoneDefinition {
  id: PavilionZoneId;
  label: string;
  shortLabel: string;
}

export interface PavilionZoneCamera {
  position: [number, number, number];
  target: [number, number, number];
}

/**
 * Camera zones mirror the procedural Grand Forum plan: one long central axis
 * and four connected corner rooms. They are navigation aids, not separate
 * drafts or a claim that every internal partition is an artwork surface.
 */
export const PAVILION_ZONES: readonly PavilionZoneDefinition[] = [
  { id: 'north-west', label: 'North-west room', shortLabel: 'NW' },
  { id: 'central-axis', label: 'Central axis', shortLabel: 'Axis' },
  { id: 'north-east', label: 'North-east room', shortLabel: 'NE' },
  { id: 'south-west', label: 'South-west room', shortLabel: 'SW' },
  { id: 'south-east', label: 'South-east room', shortLabel: 'SE' }
];

export function pavilionZoneCamera(
  zoneId: PavilionZoneId,
  dimensions: readonly [number, number],
  height: number
): PavilionZoneCamera {
  const [width, depth] = dimensions;
  const cameraY = Math.min(height - .7, 3.9);
  const targetY = Math.min(height - 1.2, 1.7);
  if (zoneId === 'central-axis') {
    return {
      position: [0, Math.min(height - .55, 4.25), depth * .25],
      target: [0, targetY, 0]
    };
  }
  const xSide = zoneId.endsWith('west') ? -1 : 1;
  const zSide = zoneId.startsWith('north') ? -1 : 1;
  return {
    position: [xSide * width * .375, cameraY, zSide * depth * .25],
    target: [xSide * width * .375, targetY, zSide * depth * .4]
  };
}
