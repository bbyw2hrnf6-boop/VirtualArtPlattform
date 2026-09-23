import { describe, expect, it, vi } from 'vitest';
import { MeshStandardMaterial, ShaderLib, type WebGLRenderer } from 'three';
import { installForestIrradiance } from './forestIrradiance';

function compile(material: MeshStandardMaterial) {
  const shader = {
    vertexShader: ShaderLib.standard.vertexShader,
    fragmentShader: ShaderLib.standard.fragmentShader,
    uniforms: {},
  } as Parameters<MeshStandardMaterial['onBeforeCompile']>[0];
  material.onBeforeCompile(shader, {} as WebGLRenderer);
  return shader.fragmentShader;
}

describe('Forest irradiance delivery', () => {
  it('keeps existing combined bakes and unbaked materials untouched', () => {
    const material = new MeshStandardMaterial();
    const key = material.customProgramCacheKey();
    installForestIrradiance(material);
    expect(compile(material)).toBe(ShaderLib.standard.fragmentShader);
    expect(material.customProgramCacheKey()).toBe(key);
  });

  it('combines tiled linear albedo with baked light before suppressing live diffuse', () => {
    const material = new MeshStandardMaterial({ emissiveIntensity: .42, roughness: .7 });
    material.userData.forest_irradiance = true;
    installForestIrradiance(material);
    const shader = compile(material);
    const albedo = shader.indexOf('#include <map_fragment>');
    const bake = shader.indexOf('#include <emissivemap_fragment>');
    const multiply = shader.indexOf('totalEmissiveRadiance *= diffuseColor.rgb;');
    const disable = shader.indexOf('diffuseColor.rgb = vec3(0.0);');
    const lighting = shader.indexOf('#include <lights_physical_fragment>');
    expect(albedo).toBeLessThan(bake);
    expect(bake).toBeLessThan(multiply);
    expect(multiply).toBeLessThan(disable);
    expect(disable).toBeLessThan(lighting);
    expect(shader).toContain('totalDiffuse + totalSpecular + totalEmissiveRadiance');
    expect(shader).toContain('#include <normal_fragment_maps>');
    expect(material.emissiveIntensity).toBe(.42);
    expect(material.roughness).toBe(.7);
  });

  it('composes existing hooks, avoids duplicate multiplication and marks its program', () => {
    const material = new MeshStandardMaterial();
    material.userData.forest_irradiance = true;
    const previous = vi.fn();
    material.onBeforeCompile = previous;
    material.customProgramCacheKey = () => 'existing-hook';
    installForestIrradiance(material);
    installForestIrradiance(material);
    expect(compile(material).match(/totalEmissiveRadiance \*= diffuseColor\.rgb;/g)).toHaveLength(1);
    expect(previous).toHaveBeenCalledOnce();
    expect(material.customProgramCacheKey()).toBe('existing-hook:forest-irradiance-v1');
  });

  it('installs on material clones that retain extras but not shader callbacks', () => {
    const material = new MeshStandardMaterial();
    material.userData.forest_irradiance = true;
    installForestIrradiance(material);
    const clone = material.clone();
    installForestIrradiance(clone);
    expect(compile(clone)).toContain('totalEmissiveRadiance *= diffuseColor.rgb;');
    expect(compile(material)).toBe(compile(clone));
  });
});
