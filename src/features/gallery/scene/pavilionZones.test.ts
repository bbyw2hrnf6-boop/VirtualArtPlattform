import { describe, expect, it } from 'vitest';
import { PAVILION_ZONE_IDS, PAVILION_ZONES, pavilionZoneCamera } from './pavilionZones';

const dimensions = [40, 60] as const;
const height = 5.6;

describe('Grand Forum camera zones', () => {
  it('defines one central axis and four uniquely named corner-room jumps', () => {
    expect(PAVILION_ZONES.map((zone) => zone.id)).toEqual(PAVILION_ZONE_IDS);
    expect(new Set(PAVILION_ZONES.map((zone) => zone.label)).size).toBe(5);
    expect(PAVILION_ZONES.find((zone) => zone.id === 'central-axis')?.label).toBe('Central axis');
  });

  it.each(PAVILION_ZONE_IDS)('keeps the %s camera and target inside the procedural room', (zoneId) => {
    const camera = pavilionZoneCamera(zoneId, dimensions, height);
    for (const point of [camera.position, camera.target]) {
      expect(Math.abs(point[0])).toBeLessThan(dimensions[0] / 2);
      expect(Math.abs(point[2])).toBeLessThan(dimensions[1] / 2);
      expect(point[1]).toBeGreaterThan(0);
      expect(point[1]).toBeLessThan(height);
    }
  });

  it('aims each room jump into the correct plan quadrant', () => {
    expect(pavilionZoneCamera('north-west', dimensions, height).target).toMatchObject([-15, 1.7, -24]);
    expect(pavilionZoneCamera('north-east', dimensions, height).target).toMatchObject([15, 1.7, -24]);
    expect(pavilionZoneCamera('south-west', dimensions, height).target).toMatchObject([-15, 1.7, 24]);
    expect(pavilionZoneCamera('south-east', dimensions, height).target).toMatchObject([15, 1.7, 24]);
  });
});
