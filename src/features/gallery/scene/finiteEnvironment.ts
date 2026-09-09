import * as THREE from 'three';

/** Repair non-finite HDR samples before mip generation can spread them through
 * every roughness level. Valid radiance, resolution and room lighting are kept.
 * This runs only during reflection baking, never during ordinary scene frames. */
export function finiteEnvironmentCapture(
  renderer: THREE.WebGLRenderer,
  source: THREE.WebGLCubeRenderTarget,
) {
  const size = source.width;
  const target = new THREE.WebGLCubeRenderTarget(size, {
    type: THREE.HalfFloatType,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  const material = new THREE.ShaderMaterial({
    uniforms: { source: { value: source.texture }, texel: { value: 2 / size } },
    vertexShader: `varying vec3 direction;
      void main() { direction = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform samplerCube source; uniform float texel; varying vec3 direction;
      bool finiteColor(vec3 c) { return !any(isnan(c)) && !any(isinf(c)); }
      void main() {
        vec3 ray = direction / max(max(abs(direction.x), abs(direction.y)), abs(direction.z));
        vec3 color = textureCube(source, ray).rgb;
        if (!finiteColor(color)) {
          vec3 sum = vec3(0.0); float count = 0.0;
          for (int axis = 0; axis < 3; axis++) {
            for (int sign = -1; sign <= 1; sign += 2) {
              vec3 offset = vec3(0.0); offset[axis] = float(sign) * texel;
              vec3 neighbor = textureCube(source, ray + offset).rgb;
              if (finiteColor(neighbor)) { sum += neighbor; count += 1.0; }
            }
          }
          color = sum / max(count, 1.0);
        }
        gl_FragColor = vec4(color, 1.0);
      }`,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const geometry = new THREE.BoxGeometry(2, 2, 2);
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(geometry, material));
  const camera = new THREE.CubeCamera(.1, 10, target);
  try {
    camera.update(renderer, scene);
    return target;
  } catch (error) {
    target.dispose();
    throw error;
  } finally {
    geometry.dispose(); material.dispose();
  }
}
