import { Source, type MeshStandardMaterial, type Texture } from 'three';

export const FOREST_NIGHT_SOURCE_SHA256 = '329276010ea565017be453356c9e41bed35ca2458b7162132910429fe4e0fbbb';
const directory = '/assets/showcases/forest-fold-house/night-v1/';
type ImageAsset = { url: string; width: number; height: number; sha256: string };
type NightGroup = { irradianceScale: number; uvSha256: string; desktop: ImageAsset; mobile: ImageAsset };
type NightManifest = { revision: number; encoding: string; sourceSha256: string; lightingProfileSha256: string; groups: Record<string, NightGroup> };
type NightImage = ImageBitmap | HTMLImageElement;
const close = (image: NightImage) => { if ('close' in image) image.close(); };
const abortError = () => new DOMException('Forest night loading cancelled', 'AbortError');

async function decode(blob: Blob, signal: AbortSignal): Promise<NightImage> {
  if (typeof createImageBitmap === 'function') {
    // GLTFLoader uses unflipped, non-premultiplied bitmaps and flipY=false.
    return createImageBitmap(blob, { imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  }
  return new Promise((resolve, reject) => {
    const image = new Image(), url = URL.createObjectURL(blob);
    const finish = (error?: unknown) => {
      signal.removeEventListener('abort', cancel);
      image.onload = image.onerror = null; URL.revokeObjectURL(url);
      if (error) { image.src = ''; reject(error); } else resolve(image);
    };
    const cancel = () => finish(abortError());
    image.onload = () => finish(); image.onerror = () => finish(new Error('Forest night image could not be decoded'));
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel(); else image.src = url;
  });
}

/** Construct before the first render/probe. Only a Night request downloads
 * maps. All atlases change together; the Texture objects, UV channels, samplers
 * and color spaces stay intact. Shared day Sources are detached once so other
 * glTF maps cannot change, then one GPU allocation is reused for both states. */
export function createForestNight(materials: Iterable<MeshStandardMaterial>, compact: boolean) {
  const bindings: { material: MeshStandardMaterial; group: string; intensity: number }[] = [];
  const slots = new Map<Source<unknown>, { group: string; source: Source<unknown>; image: { width: number; height: number }; textures: Set<Texture> }>();
  const groups = new Set<string>(), all = [...materials];
  for (const material of all) {
    if (material.userData.forest_irradiance !== true) continue;
    const group = material.userData.forest_atlas_group, texture = material.emissiveMap;
    const image = texture?.image as { width: number; height: number } | undefined;
    if (typeof group !== 'string' || !texture || texture.flipY || !image?.width || !image?.height)
      throw new Error('Forest night requires the original glTF irradiance atlases');
    let slot = slots.get(texture.source);
    if (slot && slot.group !== group) throw new Error('Forest night atlas groups share an incompatible source');
    if (!slot) { slot = { group, source: new Source(image), image, textures: new Set() }; slots.set(texture.source, slot); }
    slot.textures.add(texture); groups.add(group);
    bindings.push({ material, group, intensity: material.emissiveIntensity });
  }
  if (groups.size !== 20) throw new Error('Forest night requires all 20 atlas groups');
  const targetTextures = new Set([...slots.values()].flatMap(slot => [...slot.textures]));
  if (all.some(material => Object.entries(material).some(([key, value]) => key !== 'emissiveMap' && targetTextures.has(value))))
    throw new Error('Forest night irradiance textures cannot also supply another material channel');
  slots.forEach(slot => slot.textures.forEach(texture => {
    // Three's GPU source cache must be released before changing Source, even
    // if a caller has already uploaded this texture. No Texture is replaced.
    texture.dispose(); texture.source = slot.source; texture.needsUpdate = true;
  }));

  let disposed = false, generation = 0, active = false, controller: AbortController | undefined;
  type Loaded = { manifest: NightManifest; images: Map<string, NightImage> };
  let loaded: Loaded | undefined, pending: Promise<Loaded> | undefined;
  const apply = (night: boolean) => {
    if (active === night) return;
    slots.forEach(slot => {
      slot.source.data = night ? loaded!.images.get(slot.group)! : slot.image;
      slot.textures.forEach(texture => { texture.needsUpdate = true; });
    });
    bindings.forEach(({ material, group, intensity }) => {
      material.emissiveIntensity = night ? loaded!.manifest.groups[group].irradianceScale : intensity;
    });
    active = night;
  };
  const load = async (): Promise<Loaded> => {
    const request = controller = new AbortController(), images = new Map<string, NightImage>();
    const base = new URL(directory, location.href);
    const fetchAsset = async (url: string) => {
      const response = await fetch(url, { signal: request.signal });
      if (!response.ok) throw new Error(`Forest night asset unavailable (${response.status})`);
      return response;
    };
    try {
      const manifest = await (await fetchAsset(new URL('manifest.json', base).href)).json() as NightManifest;
      const hash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
      if (!manifest || manifest.revision !== 1 || manifest.encoding !== 'rgbm-srgb-lossless-webp' || manifest.sourceSha256 !== FOREST_NIGHT_SOURCE_SHA256
        || !hash(manifest.lightingProfileSha256) || !manifest.groups || typeof manifest.groups !== 'object'
        || Object.keys(manifest.groups).length !== 20 || Object.keys(manifest.groups).some(group => !groups.has(group)))
        throw new Error('Forest night manifest does not match this house');
      const assets = [...groups].map(group => {
        const entry = manifest.groups[group], asset = entry?.[compact ? 'mobile' : 'desktop'];
        if (!entry || !Number.isFinite(entry.irradianceScale) || entry.irradianceScale <= 0 || entry.irradianceScale > 65536 || !hash(entry.uvSha256)
          || !asset || typeof asset.url !== 'string' || !hash(asset.sha256)
          || !Number.isInteger(asset.width) || !Number.isInteger(asset.height) || asset.width <= 0 || asset.height <= 0)
          throw new Error('Forest night manifest has invalid atlas metadata');
        const url = new URL(asset.url, base);
        if (url.origin !== base.origin || !url.pathname.startsWith(directory)
          || [...slots.values()].some(slot => slot.group === group && (slot.image.width !== asset.width || slot.image.height !== asset.height)))
          throw new Error('Forest night atlas does not match this delivery');
        return { group, asset, url };
      });
      const results = await Promise.allSettled(assets.map(async ({ group, asset, url }) => {
        try {
          const image = await decode(await (await fetchAsset(url.href)).blob(), request.signal);
          if (request.signal.aborted || disposed || image.width !== asset.width || image.height !== asset.height) {
            close(image); throw new Error('Forest night atlas decode was cancelled or has the wrong dimensions');
          }
          images.set(group, image);
        } catch (error) { request.abort(); throw error; }
      }));
      const failed = results.find(result => result.status === 'rejected');
      if (failed?.status === 'rejected') throw failed.reason;
      if (disposed || request.signal.aborted) throw abortError();
      return { manifest, images };
    } catch (error) {
      request.abort(); images.forEach(close); throw error;
    } finally { if (controller === request) controller = undefined; }
  };
  return {
    async set(night: boolean) {
      if (disposed) throw abortError();
      const token = ++generation;
      if (night && !loaded) {
        pending ??= load().then(result => {
          if (disposed) { result.images.forEach(close); throw abortError(); }
          return loaded = result;
        }).finally(() => { pending = undefined; });
        try { await pending; } catch (error) { if (!disposed && token === generation) throw error; return; }
      }
      if (!disposed && token === generation) apply(night);
    },
    dispose() {
      if (disposed) return;
      disposed = true; generation++; controller?.abort(); apply(false);
      slots.forEach((slot, original) => slot.textures.forEach(texture => {
        texture.dispose(); texture.source = original; texture.needsUpdate = true;
      }));
      loaded?.images.forEach(close); loaded = undefined;
    },
  };
}
