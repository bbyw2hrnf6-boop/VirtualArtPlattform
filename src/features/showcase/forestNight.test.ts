import { afterEach, describe, expect, it, vi } from 'vitest';
import { MeshStandardMaterial, SRGBColorSpace, Texture } from 'three';
import { createForestNight, FOREST_NIGHT_SOURCE_SHA256 } from './forestNight';

const directory = '/assets/showcases/forest-fold-house/night-v1/';
const hash = 'a'.repeat(64);
const groupNames = ['W0', 'W1', 'E0', 'E1', 'W0_walk', 'W1_walk', 'E0_walk', 'E1_walk', 'W0_ceiling', 'W1_ceiling', 'E0_ceiling', 'E1_ceiling', 'W0_furniture', 'W1_furniture', 'E0_furniture', 'E1_furniture', 'exterior', 'bridge_walk', 'stairs_walk', 'courtyard_walk'];

function fixture(compact = false) {
  const size = compact ? 4 : 8;
  const materials = groupNames.map((group, index) => {
    const image = { width: size, height: size, name: `day-${group}`, close: vi.fn() };
    const texture = new Texture(image);
    texture.flipY = false; texture.channel = 1; texture.colorSpace = SRGBColorSpace;
    texture.repeat.set(.8, .9); texture.offset.set(.05, .1); texture.rotation = .12; texture.anisotropy = 8;
    const material = new MeshStandardMaterial({ emissiveMap: texture, emissiveIntensity: index + 1 });
    material.userData = { forest_irradiance: true, forest_atlas_group: group };
    return material;
  });
  const manifest = {
    revision: 1, encoding: 'rgbm-srgb-lossless-webp', sourceSha256: FOREST_NIGHT_SOURCE_SHA256, lightingProfileSha256: hash,
    groups: Object.fromEntries(groupNames.map(group => [group, {
      irradianceScale: 32, uvSha256: hash,
      desktop: { url: `${directory}desktop/${group}.webp`, width: 8, height: 8, sha256: hash },
      mobile: { url: `mobile/${group}.webp`, width: 4, height: 4, sha256: hash },
    }])),
  };
  return { materials, manifest };
}

function mockAssets(manifest: ReturnType<typeof fixture>['manifest']) {
  vi.stubGlobal('location', { href: 'https://lieuva.test/' });
  const bitmaps: (ImageBitmap & { url: string })[] = [];
  const fetcher = vi.fn(async (url: string) => url.endsWith('manifest.json')
    ? new Response(JSON.stringify(manifest)) : new Response(new Blob([url])));
  const bitmap = vi.fn(async (blob: Blob) => {
    const url = await blob.text(), size = url.includes('/mobile/') ? 4 : 8;
    const image = { width: size, height: size, close: vi.fn(), url } as unknown as ImageBitmap & { url: string };
    bitmaps.push(image); return image;
  });
  vi.stubGlobal('fetch', fetcher); vi.stubGlobal('createImageBitmap', bitmap);
  return { fetcher, bitmap, bitmaps };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Forest lazy night irradiance', () => {
  it('does not fetch on construction/day and detaches only irradiance Sources, preserving all texture settings', async () => {
    const { materials, manifest } = fixture(), { fetcher } = mockAssets(manifest);
    const texture = materials[0].emissiveMap!, original = texture.source, day = texture.image;
    const clone = texture.clone(), second = materials[0].clone(); second.emissiveMap = clone; second.emissiveIntensity = 3.5;
    const unrelated = new MeshStandardMaterial({ map: texture.clone() });
    const helper = createForestNight([...materials, second, unrelated], false);
    expect(materials[0].emissiveMap).toBe(texture);
    expect(texture.source).not.toBe(original); expect(clone.source).toBe(texture.source);
    expect(unrelated.map!.source).toBe(original); expect(texture.image).toBe(day);
    expect(texture.flipY).toBe(false); expect(texture.channel).toBe(1); expect(texture.colorSpace).toBe(SRGBColorSpace);
    expect(texture.repeat.toArray()).toEqual([.8, .9]); expect(texture.offset.toArray()).toEqual([.05, .1]);
    expect(texture.rotation).toBe(.12); expect(texture.anisotropy).toBe(8);
    await helper.set(false); expect(fetcher).not.toHaveBeenCalled();
    const privateSource = texture.source;
    await helper.set(true);
    expect(texture.source).toBe(privateSource); expect(clone.source).toBe(privateSource);
    expect(unrelated.map!.image).toBe(day); expect(second.emissiveIntensity).toBe(32);
    await helper.set(false);
    expect(texture.source).toBe(privateSource); expect(texture.image).toBe(day); expect(second.emissiveIntensity).toBe(3.5);
    helper.dispose(); expect(texture.source).toBe(original); expect(clone.source).toBe(original);
  });

  it.each([false, true])('atomically loads all 20 %s-tier maps once and restores exact day images/scales', async compact => {
    const { materials, manifest } = fixture(compact), { fetcher, bitmap, bitmaps } = mockAssets(manifest);
    const originals = materials.map(material => ({ texture: material.emissiveMap!, image: material.emissiveMap!.image, intensity: material.emissiveIntensity }));
    const gate = deferred(), decode = bitmap.getMockImplementation()!;
    bitmap.mockImplementation(async blob => {
      const image = await decode(blob);
      if (image.url.includes('/courtyard_walk.webp')) await gate.promise;
      return image;
    });
    const helper = createForestNight(materials, compact), pending = helper.set(true);
    await vi.waitFor(() => expect(bitmaps).toHaveLength(20));
    materials.forEach((material, index) => {
      expect(material.emissiveMap!.image).toBe(originals[index].image);
      expect(material.emissiveIntensity).toBe(originals[index].intensity);
    });
    gate.resolve(); await pending;
    expect(fetcher).toHaveBeenCalledTimes(21);
    expect(bitmap).toHaveBeenCalledWith(expect.any(Blob), { imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    materials.forEach((material, index) => {
      expect(material.emissiveMap).toBe(originals[index].texture);
      expect(material.emissiveMap!.image).not.toBe(originals[index].image);
      expect(material.emissiveIntensity).toBe(32);
    });
    const versions = materials.map(material => material.emissiveMap!.version);
    await helper.set(true);
    expect(materials.map(material => material.emissiveMap!.version)).toEqual(versions);
    await helper.set(false);
    materials.forEach((material, index) => {
      expect(material.emissiveMap!.image).toBe(originals[index].image);
      expect(material.emissiveIntensity).toBe(originals[index].intensity);
    });
    await helper.set(true); expect(fetcher).toHaveBeenCalledTimes(21);
    helper.dispose(); helper.dispose();
    bitmaps.forEach(image => expect(image.close).toHaveBeenCalledOnce());
    originals.forEach(({ image }) => expect((image as { close: ReturnType<typeof vi.fn> }).close).not.toHaveBeenCalled());
    await expect(helper.set(true)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('keeps Day atomic after an asset failure, closes partial decoded maps and permits retry', async () => {
    const { materials, manifest } = fixture(), { fetcher, bitmaps } = mockAssets(manifest);
    const fetchAsset = fetcher.getMockImplementation()!, day = materials.map(material => material.emissiveMap!.image);
    let fail = true;
    fetcher.mockImplementation(async url => fail && url.endsWith('/E0.webp') ? new Response('', { status: 503 }) : fetchAsset(url));
    const helper = createForestNight(materials, false);
    await expect(helper.set(true)).rejects.toThrow();
    materials.forEach((material, i) => { expect(material.emissiveMap!.image).toBe(day[i]); expect(material.emissiveIntensity).toBe(i + 1); });
    bitmaps.forEach(image => expect(image.close).toHaveBeenCalledOnce());
    fail = false; await helper.set(true);
    expect(materials[0].emissiveIntensity).toBe(32);
    helper.dispose(); bitmaps.forEach(image => expect(image.close).toHaveBeenCalledOnce());
  });

  it('rejects a decoded dimension mismatch before applying any map', async () => {
    const { materials, manifest } = fixture(), { bitmap, bitmaps } = mockAssets(manifest);
    const decode = bitmap.getMockImplementation()!, day = materials[0].emissiveMap!.image;
    bitmap.mockImplementation(async blob => Object.assign(await decode(blob), { width: 7 }));
    const helper = createForestNight(materials, false);
    await expect(helper.set(true)).rejects.toThrow();
    expect(materials[0].emissiveMap!.image).toBe(day);
    bitmaps.forEach(image => expect(image.close).toHaveBeenCalledOnce()); helper.dispose();
  });

  it.each(['source', 'revision', 'encoding', 'profile', 'missing', 'extra', 'uv', 'scale', 'dimensions', 'foreign', 'escape'])('rejects an incompatible %s manifest without atlas downloads', async change => {
    const { materials, manifest } = fixture();
    if (change === 'source') manifest.sourceSha256 = hash;
    if (change === 'revision') manifest.revision = 2;
    if (change === 'encoding') manifest.encoding = 'jpeg';
    if (change === 'profile') manifest.lightingProfileSha256 = '';
    if (change === 'missing') delete manifest.groups.W0;
    if (change === 'extra') manifest.groups.extra = manifest.groups.W0;
    if (change === 'uv') manifest.groups.W0.uvSha256 = '';
    if (change === 'scale') manifest.groups.W0.irradianceScale = 0;
    if (change === 'dimensions') manifest.groups.W0.desktop.width = 16;
    if (change === 'foreign') manifest.groups.W0.desktop.url = 'https://other.test/a.jpg';
    if (change === 'escape') manifest.groups.W0.desktop.url = '../../another.jpg';
    const { fetcher } = mockAssets(manifest), day = materials[0].emissiveMap!.image;
    const helper = createForestNight(materials, false);
    await expect(helper.set(true)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1); expect(materials[0].emissiveMap!.image).toBe(day);
    helper.dispose();
  });

  it('deduplicates pending Night requests and lets a later Day request win', async () => {
    const { materials, manifest } = fixture(), { bitmap, fetcher } = mockAssets(manifest);
    const gate = deferred(), decode = bitmap.getMockImplementation()!, day = materials[0].emissiveMap!.image;
    bitmap.mockImplementation(async blob => { await gate.promise; return decode(blob); });
    const helper = createForestNight(materials, false), first = helper.set(true), second = helper.set(true);
    await vi.waitFor(() => expect(bitmap).toHaveBeenCalledTimes(20));
    await helper.set(false); gate.resolve(); await Promise.all([first, second]);
    expect(materials[0].emissiveMap!.image).toBe(day); expect(fetcher).toHaveBeenCalledTimes(21);
    await helper.set(true); expect(fetcher).toHaveBeenCalledTimes(21); expect(materials[0].emissiveIntensity).toBe(32);
    helper.dispose();
  });

  it('aborts disposal during decoding and closes late bitmaps without touching the day originals', async () => {
    const { materials, manifest } = fixture(), { bitmap, bitmaps, fetcher } = mockAssets(manifest);
    const gate = deferred(), decode = bitmap.getMockImplementation()!, original = materials[0].emissiveMap!.source;
    bitmap.mockImplementation(async blob => { await gate.promise; return decode(blob); });
    const helper = createForestNight(materials, false), pending = helper.set(true);
    await vi.waitFor(() => expect(bitmap).toHaveBeenCalledTimes(20));
    helper.dispose();
    expect((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].signal!.aborted).toBe(true);
    gate.resolve(); await pending;
    expect(materials[0].emissiveMap!.source).toBe(original);
    expect(materials[0].emissiveIntensity).toBe(1);
    bitmaps.forEach(image => expect(image.close).toHaveBeenCalledOnce());
  });

  it('rejects incomplete groups and non-glTF orientation before touching texture Sources', () => {
    const { materials } = fixture(), original = materials[0].emissiveMap!.source;
    expect(() => createForestNight(materials.slice(1), false)).toThrow('20 atlas groups');
    materials[1].emissiveMap!.flipY = true;
    expect(() => createForestNight(materials, false)).toThrow('original glTF');
    expect(materials[0].emissiveMap!.source).toBe(original);
  });

  it('uses an unflipped image fallback without leaking object URLs when ImageBitmap is unavailable', async () => {
    const { materials, manifest } = fixture(); mockAssets(manifest);
    vi.stubGlobal('createImageBitmap', undefined);
    class ImageFallback {
      width = 8; height = 8;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(value: string) { if (value) queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal('Image', ImageFallback);
    const makeURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:night-test');
    const revokeURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const helper = createForestNight(materials, false);
    await helper.set(true);
    expect(materials[0].emissiveMap!.image).toBeInstanceOf(ImageFallback);
    expect(materials[0].emissiveMap!.flipY).toBe(false);
    expect(makeURL).toHaveBeenCalledTimes(20); expect(revokeURL).toHaveBeenCalledTimes(20);
    helper.dispose();
  });

  it('rejects incompatible group/source sharing and reused non-emissive Texture objects without partial detachment', () => {
    const { materials } = fixture(), original = materials[0].emissiveMap!.source;
    materials[1].emissiveMap = materials[0].emissiveMap!.clone();
    expect(() => createForestNight(materials, false)).toThrow('incompatible source');
    expect(materials[0].emissiveMap!.source).toBe(original);
    const next = fixture(); next.materials[0].map = next.materials[0].emissiveMap;
    expect(() => createForestNight(next.materials, false)).toThrow('another material channel');
  });
});
