import { Mesh, Texture, TextureLoader, type Object3D } from 'three';

const pending = new WeakMap<Texture, Promise<void>>();

/** Track each mounted image without sharing a global LoadingManager across
 * independent Studio, homepage and visitor scenes. Errors settle as fallbacks. */
export function loadSceneTexture(url: string, onLoad?: (texture: Texture) => void, onError?: () => void) {
  let settle!: () => void;
  const ready = new Promise<void>((resolve) => { settle = resolve; });
  const texture = new TextureLoader().load(url, (loaded) => {
    try { onLoad?.(loaded); } finally { settle(); }
  }, undefined, () => {
    try { onError?.(); } finally { settle(); }
  });
  pending.set(texture, ready);
  return texture;
}

export function sceneTextures(root: Object3D) {
  const textures = new Set<Texture>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials)
      for (const value of Object.values(material))
        if (value instanceof Texture) textures.add(value);
  });
  return textures;
}

/** A stalled image must lead to a retry affordance, never an endless spinner. */
export async function waitForSceneTextures(root: Object3D, signal?: AbortSignal) {
  signal?.throwIfAborted();
  let onAbort: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      new Promise<never>((_, reject) => {
        onAbort = () => reject(signal?.reason ?? new Error('Scene preparation superseded'));
        signal?.addEventListener('abort', onAbort, { once: true });
      }),
      Promise.all([...sceneTextures(root)].map((texture) => pending.get(texture))),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Scene texture timeout')), 45_000); }),
    ]);
  } finally { clearTimeout(timer); if (onAbort) signal?.removeEventListener('abort', onAbort); }
}
