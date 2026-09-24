import { describe, expect, it, vi } from 'vitest';
import { DataTexture, DataUtils, EquirectangularReflectionMapping, HalfFloatType, LinearFilter, LinearSRGBColorSpace, Vector3 } from 'three';
import { createForestSky } from './forestSky';

function sample(texture: DataTexture, direction: Vector3) {
  const d = direction.clone().normalize(), { width, height, data } = texture.image;
  const u = Math.atan2(d.z, d.x) / (Math.PI * 2) + .5, v = Math.asin(d.y) / Math.PI + .5;
  const index = (Math.min(height - 1, Math.floor(v * height)) * width + Math.min(width - 1, Math.floor(u * width))) * 4;
  return Array.from(data!.slice(index, index + 3), value => DataUtils.fromHalfFloat(value));
}
const luminance = (rgb: number[]) => rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;

describe('Forest static sky', () => {
  it('provides small linear HDR backgrounds for the scene and reflection capture', () => {
    const sky = createForestSky();
    for (const texture of [sky.day, sky.night]) {
      expect(texture.image.width).toBe(256); expect(texture.image.height).toBe(128);
      expect(texture.image.data).toBeInstanceOf(Uint16Array);
      expect(texture.mapping).toBe(EquirectangularReflectionMapping);
      expect(texture.colorSpace).toBe(LinearSRGBColorSpace);
      expect(texture.type).toBe(HalfFloatType);
      expect(texture.minFilter).toBe(LinearFilter); expect(texture.magFilter).toBe(LinearFilter);
      expect(texture.flipY).toBe(false); expect(texture.generateMipmaps).toBe(false);
      expect(texture.version).toBe(1);
      expect(Array.from(texture.image.data!).every((half, i) => {
        const value = DataUtils.fromHalfFloat(half);
        return Number.isFinite(value) && value >= 0 && (i % 4 !== 3 || value === 1);
      })).toBe(true);
    }
    sky.dispose();
  });

  it('keeps blue overhead daylight and a brighter warm glow at the authored sun direction', () => {
    const sky = createForestSky(), sun = new Vector3(-14, 15, 16);
    const overhead = sample(sky.day, new Vector3(0, 1, 0));
    const sunny = sample(sky.day, sun), opposite = sample(sky.day, new Vector3(14, 15, -16));
    expect(overhead[2]).toBeGreaterThan(overhead[0]);
    expect(luminance(sunny)).toBeGreaterThan(luminance(opposite) * 1.8);
    expect(Math.max(...sunny)).toBeGreaterThan(1);
    expect(luminance(sample(sky.night, sun))).toBeLessThan(luminance(opposite) * .1);
    expect(luminance(sample(sky.day, new Vector3(0, -1, 0)))).toBeLessThan(luminance(overhead));
    sky.dispose();
  });

  it('is deterministic and disposes both texture resources', () => {
    const a = createForestSky(), b = createForestSky();
    expect(a.day.image.data).toEqual(b.day.image.data);
    expect(a.night.image.data).toEqual(b.night.image.data);
    expect(a.day).not.toBe(b.day);
    const dayDisposed = vi.fn(), nightDisposed = vi.fn();
    a.day.addEventListener('dispose', dayDisposed); a.night.addEventListener('dispose', nightDisposed);
    a.dispose();
    expect(dayDisposed).toHaveBeenCalledOnce(); expect(nightDisposed).toHaveBeenCalledOnce();
    b.dispose();
  });
});
