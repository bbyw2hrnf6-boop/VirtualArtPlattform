import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';

/** One clipped planar pass for the continuous floor. Diffuse transport and
 * contact shadows stay in the Cycles bake; only the moving glossy lobe is added. */
export function createFloorReflection(compact: boolean, options?: { geometry: THREE.BufferGeometry; center: THREE.Vector3; seamless: boolean }) {
  const size = compact ? 1024 : 2048;
  const floor = new Reflector(options?.geometry ?? new THREE.PlaneGeometry(33.98, 7.98), {
    textureWidth: size, textureHeight: size, multisample: compact ? 0 : 2,
    clipBias: .001,
    shader: {
      name: 'Obsidian honed stone reflection',
      uniforms: {
        color: { value: new THREE.Color(1, 1, 1) },
        seamless: { value: Boolean(options?.seamless) },
        tDiffuse: { value: null }, textureMatrix: { value: new THREE.Matrix4() },
        texel: { value: new THREE.Vector2(1 / size, 1 / size) },
      },
      vertexShader: `
        uniform mat4 textureMatrix;
        varying vec4 reflectionUv;
        varying vec3 floorWorld;
        void main() {
          reflectionUv = textureMatrix * vec4(position, 1.0);
          floorWorld = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      // World-anchored polishing variation keeps highlights attached to stone.
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform bool seamless;
        uniform vec2 texel;
        varying vec4 reflectionUv;
        varying vec3 floorWorld;
        void main() {
          vec2 uv = reflectionUv.xy / reflectionUv.w;
          vec3 eye = normalize(cameraPosition - floorWorld);
          float grazing = 1.0 - clamp(eye.y, 0.0, 1.0);
          float polish = .5 + .5 * sin(floorWorld.x * 3.7 + sin(floorWorld.z * 2.1)) * sin(floorWorld.z * 4.3);
          vec2 radius = texel * mix(2.0, 5.0, grazing) * mix(.8, 1.2, polish);
          vec3 light = texture2D(tDiffuse, uv).rgb * .28;
          light += texture2D(tDiffuse, uv + vec2(radius.x, 0.0)).rgb * .12;
          light += texture2D(tDiffuse, uv - vec2(radius.x, 0.0)).rgb * .12;
          light += texture2D(tDiffuse, uv + vec2(0.0, radius.y)).rgb * .12;
          light += texture2D(tDiffuse, uv - vec2(0.0, radius.y)).rgb * .12;
          light += texture2D(tDiffuse, uv + radius).rgb * .06;
          light += texture2D(tDiffuse, uv - radius).rgb * .06;
          light += texture2D(tDiffuse, uv + vec2(radius.x, -radius.y)).rgb * .06;
          light += texture2D(tDiffuse, uv + vec2(-radius.x, radius.y)).rgb * .06;
          vec2 grid = abs(fract(floorWorld.xz + .5) - .5);
          float joint = smoothstep(.0008, .002 + max(fwidth(grid.x), fwidth(grid.y)), min(grid.x, grid.y));
          float fresnel = (.08 + .65 * pow(grazing, 4.0)) * mix(.94, 1.0, polish);
          gl_FragColor = vec4(light, fresnel * (seamless ? .72 : joint));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    },
  });
  floor.name = 'Obsidian planar floor reflection';
  floor.rotation.x = -Math.PI / 2;
  floor.position.copy(options?.center ?? new THREE.Vector3(17,.002,-4));
  const material = floor.material as THREE.ShaderMaterial;
  material.transparent = true;
  material.depthWrite = false;
  return floor;
}

/** The overview cuts away the ceiling and only the exterior sides facing the
 * camera. Walking uses the original closed Blender envelope and its baked light. */
export function installOverviewCutaway(material: THREE.Material, overview: { value: boolean }, cutHeight?: number) {
  const exterior = cutHeight === undefined ? ` ||
    (cameraPosition.z > -4. ? obsidianWorld.z > -.2 : obsidianWorld.z < -7.8) ||
    (cameraPosition.x > 17. ? obsidianWorld.x > 33.8 : obsidianWorld.x < .2)` : '';
  material.onBeforeCompile = shader => {
    shader.uniforms.obsidianOverview = overview;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 obsidianWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nobsidianWorld = (modelMatrix * vec4(transformed, 1.)).xyz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform bool obsidianOverview;\nvarying vec3 obsidianWorld;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if (obsidianOverview && (obsidianWorld.y > ${(cutHeight ?? 3.7).toFixed(2)}${exterior})) discard;`);
  };
  material.customProgramCacheKey = () => `showcase-cutaway-${cutHeight ?? 'obsidian'}`;
}
