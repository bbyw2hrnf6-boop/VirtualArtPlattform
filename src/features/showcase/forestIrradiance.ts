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
      #ifdef USE_EMISSIVEMAP
        totalEmissiveRadiance *= emissiveColor.a;
      #endif
      totalEmissiveRadiance *= diffuseColor.rgb;`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
      material.diffuseContribution = vec3(0.0);`);
    // Day/night RGBM stores a per-texel multiplier in alpha, preserving dim
    // light beside bright fixtures. Legacy day JPEGs have opaque alpha.
    // Keep diffuseColor and material.diffuseColor: Three also uses the base
    // colour for metallic specular and environment multiscattering. Clearing
    // them turns baked metallic surfaces (including the mirrors) black.
  };
  material.customProgramCacheKey = () => `${key}:forest-irradiance-v3`;
  material.needsUpdate = true;
}
