import type { MeshStandardMaterial } from 'three';

const installed = new WeakSet<MeshStandardMaterial>();

/** Forest's emission atlas contains Cycles irradiance; its separately tiled
 * base colour retains the original scan detail. Keep only live specular light. */
export function installForestIrradiance(material: MeshStandardMaterial) {
  if (material.userData.forest_irradiance !== true || installed.has(material)) return;
  installed.add(material);
  const compile = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = function(shader, renderer) {
    compile.call(this, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance *= diffuseColor.rgb;
      diffuseColor.rgb = vec3(0.0);`);
  };
  material.customProgramCacheKey = () => `${key}:forest-irradiance-v1`;
  material.needsUpdate = true;
}
