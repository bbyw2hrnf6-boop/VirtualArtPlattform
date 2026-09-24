import { describe, expect, it } from 'vitest';
import { LinearFilter, LinearMipmapLinearFilter, PlaneGeometry, ShaderMaterial, Vector3 } from 'three';
import { createFloorReflection } from './floorReflection';

describe('planar reflection surface isolation', () => {
  it.each([false, true])('keeps existing stone filtering unchanged (compact=%s)', compact => {
    for (const seamless of [false, true]) {
      const reflection = createFloorReflection(compact, { geometry: new PlaneGeometry(), center: new Vector3(), seamless });
      const texture = reflection.getRenderTarget().texture;
      expect(texture.generateMipmaps).toBe(false);
      expect(texture.minFilter).toBe(LinearFilter);
      expect((reflection.material as ShaderMaterial).uniforms.water.value).toBe(false);
      reflection.dispose(); reflection.geometry.dispose();
    }
  });

  it.each([false, true])('mip-filters only water with its own Fresnel (compact=%s)', compact => {
    const reflection = createFloorReflection(compact, { geometry: new PlaneGeometry(), center: new Vector3(0, -.176, 0), seamless: true, water: true });
    const texture = reflection.getRenderTarget().texture;
    expect(texture.generateMipmaps).toBe(true);
    expect(texture.minFilter).toBe(LinearMipmapLinearFilter);
    expect((reflection.material as ShaderMaterial).uniforms.water.value).toBe(true);
    expect(reflection.getRenderTarget().width).toBe(compact ? 1024 : 2048);
    expect(reflection.position.y).toBe(-.176);
    reflection.dispose(); reflection.geometry.dispose();
  });
});
