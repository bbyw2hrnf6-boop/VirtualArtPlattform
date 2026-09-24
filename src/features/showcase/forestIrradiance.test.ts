import { describe, expect, it, vi } from 'vitest';
import { MeshStandardMaterial, ShaderChunk, ShaderLib, type WebGLRenderer } from 'three';
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
    const disable = shader.indexOf('material.diffuseContribution = vec3(0.0);');
    const lighting = shader.indexOf('#include <lights_physical_fragment>');
    expect(albedo).toBeLessThan(bake);
    expect(bake).toBeLessThan(multiply);
    expect(shader).toContain('totalEmissiveRadiance *= emissiveColor.a;');
    expect(ShaderChunk.emissivemap_fragment).toContain('vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );');
    expect(multiply).toBeLessThan(lighting);
    expect(lighting).toBeLessThan(disable);
    expect(disable).toBeLessThan(shader.indexOf('#include <lights_fragment_begin>'));
    expect(shader).toContain('totalDiffuse + totalSpecular + totalEmissiveRadiance');
    expect(shader).toContain('#include <normal_fragment_maps>');
    expect(material.emissiveIntensity).toBe(.42);
    expect(material.roughness).toBe(.7);
  });

  it.each([0, .65, 1])('preserves dielectric and metallic specular colour (metalness=%s)', metalness => {
    const material = new MeshStandardMaterial({ color: '#d3d7d3', metalness, roughness: .04 });
    material.userData.forest_irradiance = true;
    const original = material.color.clone();
    installForestIrradiance(material);
    const shader = compile(material);
    expect(shader).not.toMatch(/(?:diffuseColor\.rgb|material\.diffuseColor)\s*=\s*vec3\(0\.0\)/);
    expect(shader.match(/material\.diffuseContribution = vec3\(0\.0\);/g)).toHaveLength(1);
    // Verify the current Three contract, including the environment path: these
    // are the colour terms that the old pre-physical zeroing erased.
    expect(ShaderChunk.lights_physical_fragment).toContain('material.diffuseColor = diffuseColor.rgb;');
    expect(ShaderChunk.lights_physical_fragment).toContain('mix( material.specularColor, diffuseColor.rgb, metalnessFactor )');
    expect(ShaderChunk.lights_physical_pars_fragment).toContain('computeMultiscattering( geometryNormal, geometryViewDir, material.diffuseColor,');
    expect(ShaderChunk.lights_physical_pars_fragment).toContain('BRDF_Lambert( material.diffuseContribution )');
    expect(material.color.equals(original)).toBe(true);
    expect(material.metalness).toBe(metalness);
    expect(material.roughness).toBe(.04);
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
    expect(material.customProgramCacheKey()).toBe('existing-hook:forest-irradiance-v3');
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
