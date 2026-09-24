import { describe, expect, it, vi } from 'vitest';
import { MeshStandardMaterial, ShaderChunk, ShaderLib, type WebGLRenderer } from 'three';
import { installForestFoliage } from './forestFoliage';

function leaf(name = 'fern_02') {
  const material = new MeshStandardMaterial({ alphaTest: .5, color: '#496831', roughness: .6 });
  material.name = name;
  return material;
}
function compile(material: MeshStandardMaterial) {
  const shader = { vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader, uniforms: {} } as Parameters<MeshStandardMaterial['onBeforeCompile']>[0];
  material.onBeforeCompile(shader, {} as WebGLRenderer);
  return shader.fragmentShader;
}

describe('Forest scanned foliage transmission', () => {
  it.each(['fern_02', 'periwinkle_plant', 'tree_small_02_leaves'])('adds only bounded direct backlighting to %s', name => {
    const material = leaf(name), color = material.color.clone();
    installForestFoliage(material);
    const shader = compile(material);
    expect(shader).toContain('reflectedLight.directDiffuse += (irradiance + .18 * saturate(dot(-geometryNormal, directLight.direction)) * directLight.color) * BRDF_Lambert( material.diffuseContribution );');
    expect(shader.match(/\.18 \* saturate/g)).toHaveLength(1);
    expect(shader).toContain('reflectedLight.directSpecular += irradiance * BRDF_GGX_Multiscatter');
    expect(shader).toContain('vec3 diffuse = irradiance * BRDF_Lambert( material.diffuseContribution );');
    expect(shader).toContain('#include <alphatest_fragment>');
    expect(shader).toContain('#include <emissivemap_fragment>');
    expect(material.color.equals(color)).toBe(true);
    expect(material.emissive.getHex()).toBe(0);
    expect(material.alphaTest).toBe(.5); expect(material.roughness).toBe(.6);
    // Guard the installed Three contract: the directional shadow lookup is
    // applied to the same directLight.color before RE_Direct consumes it.
    const directional = ShaderChunk.lights_fragment_begin.slice(ShaderChunk.lights_fragment_begin.indexOf('#if ( NUM_DIR_LIGHTS'));
    expect(directional.indexOf('directLight.color *=')).toBeGreaterThan(-1);
    expect(directional.indexOf('directLight.color *=')).toBeLessThan(directional.indexOf('RE_Direct( directLight'));
    expect(directional).toContain('getShadow( directionalShadowMap[ i ]');
  });

  it.each(['tree_small_02_trunk', 'tree_small_02_branches', 'Beech leaf', 'M09 Pond water', 'M08 Glazing', 'fern_02_copy'])('leaves unrecognized material %s untouched', name => {
    const material = leaf(name), key = material.customProgramCacheKey(), version = material.version;
    installForestFoliage(material);
    expect(compile(material)).toBe(ShaderLib.standard.fragmentShader);
    expect(material.customProgramCacheKey()).toBe(key);
    expect(material.version).toBe(version);
  });

  it.each(['opaque', 'transparent', 'irradiance', 'baked'])('rejects a known name with %s rendering semantics', kind => {
    const material = leaf();
    if (kind === 'opaque') material.alphaTest = 0;
    if (kind === 'transparent') material.transparent = true;
    if (kind === 'irradiance') material.userData.forest_irradiance = true;
    if (kind === 'baked') material.userData.baked_diffuse = true;
    const version = material.version;
    installForestFoliage(material);
    expect(compile(material)).toBe(ShaderLib.standard.fragmentShader);
    expect(material.version).toBe(version);
  });

  it('composes hooks, remains repeat-safe, and installs on separately cloned materials', () => {
    const material = leaf(), previous = vi.fn();
    material.onBeforeCompile = previous; material.customProgramCacheKey = () => 'custom';
    installForestFoliage(material);
    const version = material.version;
    installForestFoliage(material);
    expect(compile(material).match(/\.18 \* saturate/g)).toHaveLength(1);
    expect(previous).toHaveBeenCalledOnce();
    expect(material.customProgramCacheKey()).toBe('custom:forest-leaf-v2');
    expect(material.version).toBe(version);
    const clone = material.clone();
    installForestFoliage(clone);
    expect(compile(clone)).toBe(compile(material));
  });

  it('also patches the installed chunk after production whitespace compaction', () => {
    const original = ShaderChunk.lights_physical_pars_fragment;
    // The production shader compactor removes whitespace beside operators.
    // Exercise its equivalent token layout, not only Three's source spacing.
    ShaderChunk.lights_physical_pars_fragment = original.replace(/\s*([+=*(),;])\s*/g, '$1');
    try {
      expect(ShaderChunk.lights_physical_pars_fragment).toContain('reflectedLight.directDiffuse+=irradiance*');
      const material = leaf(); installForestFoliage(material);
      const shader = compile(material);
      expect(shader.match(/\.18 \* saturate/g)).toHaveLength(1);
      expect(shader).toContain('directLight.color) *BRDF_Lambert(material.diffuseContribution);');
      expect(shader).not.toContain('reflectedLight.directDiffuse+=irradiance*');
    } finally { ShaderChunk.lights_physical_pars_fragment = original; }
  });
});
