import { LinearMipmapLinearFilter, PlaneGeometry, type Camera, type Object3D, type ShaderMaterial } from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';

/** F10/F15 front faces, converted from the authored Blender Z-up coordinates.
 * The original bevels remain visible around these inset, silvered surfaces. */
export function createForestMirrors(compact: boolean, camera: Camera, pond: Object3D) {
  const mirrors = [[-3.3, 1.55, .45], [-3.45, 4.95, 1]].map(([x, y, width], i) => {
    const mirror = new Reflector(new PlaneGeometry(width - .02, .78), {
      textureWidth: 128, textureHeight: 128, multisample: 0, clipBias: .001,
    });
    const material = mirror.material as ShaderMaterial;
    material.fragmentShader = material.fragmentShader.replace('blendOverlay( base.rgb, color )', 'base.rgb * .94');
    const texture = mirror.getRenderTarget().texture;
    texture.generateMipmaps = true;
    texture.minFilter = LinearMipmapLinearFilter;
    mirror.name = `Forest ${i ? 'upper' : 'lower'} bathroom mirror`;
    mirror.position.set(x, y, -3.641);
    mirror.visible = false;
    return mirror;
  });
  const peers = [pond, ...mirrors];
  mirrors.forEach(mirror => {
    const capture = mirror.onBeforeRender;
    mirror.onBeforeRender = (...args) => {
      // A pond/other reflection camera may draw this surface, but must not
      // recursively capture it. Only the visitor's ordinary draw owns updates.
      if (args[2] !== camera) return;
      const visibility = peers.map(peer => peer.visible);
      peers.forEach(peer => { peer.visible = false; });
      try { capture.apply(mirror, args); }
      finally { peers.forEach((peer, i) => { peer.visible = visibility[i]; }); }
    };
  });
  return {
    mirrors,
    update(overview: boolean) {
      const { x, y, z } = camera.position;
      // Only a nearby visitor can see into these enclosed bathrooms. Native
      // frustum culling then suppresses capture when the mirror is off-screen.
      mirrors.forEach(mirror => { mirror.visible = !overview && x > -4.3 && x < -1.2 && z > -3.641 && z < -1.25 && Math.abs(y - mirror.position.y) < 1.5; });
    },
    quality(full: boolean) {
      // Keep a readable reflected image after a transient atlas-upload spike.
      // Capture still occurs only for the nearby, in-frustum bathroom mirror.
      const size = (compact ? 256 : 512) * (full ? 2 : 1);
      mirrors.forEach(mirror => {
        const target = mirror.getRenderTarget();
        target.samples = full && !compact ? 2 : 0;
        target.setSize(size, size);
      });
    },
    dispose() {
      mirrors.forEach(mirror => { mirror.removeFromParent(); mirror.geometry.dispose(); mirror.dispose(); });
    },
  };
}
