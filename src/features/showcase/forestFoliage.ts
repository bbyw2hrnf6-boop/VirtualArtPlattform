import { ShaderChunk, type MeshStandardMaterial } from 'three';

const installed = new WeakSet<MeshStandardMaterial>();

/** Restore a bounded thin-leaf response lost by the scanned shader export.
 * directLight.color already includes the sun's shadow visibility; this is
 * transmitted direct light, never emissive fill or an extra unshadowed sun. */
export function installForestFoliage(material: MeshStandardMaterial) {
  if (!['fern_02', 'periwinkle_plant', 'tree_small_02_leaves'].includes(material.name)
    || material.alphaTest <= 0 || material.transparent || material.userData.forest_irradiance
    || material.userData.baked_diffuse || installed.has(material)) return;
  installed.add(material);
  const compile = material.onBeforeCompile, key = material.customProgramCacheKey();
  material.onBeforeCompile = function(shader, renderer) {
    compile.call(this, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_pars_fragment>',
      ShaderChunk.lights_physical_pars_fragment.replace(/reflectedLight\.directDiffuse\s*\+=\s*irradiance\s*\*/,
        'reflectedLight.directDiffuse += (irradiance + .18 * saturate(dot(-geometryNormal, directLight.direction)) * directLight.color) *'));
  };
  material.customProgramCacheKey = () => `${key}:forest-leaf-v2`;
  material.needsUpdate = true;
}
