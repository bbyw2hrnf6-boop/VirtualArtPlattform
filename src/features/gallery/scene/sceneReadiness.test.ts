import { afterEach, describe, expect, it, vi } from 'vitest';
import { Group, Mesh, MeshStandardMaterial, Texture, TextureLoader } from 'three';
import { loadSceneTexture, sceneTextures, waitForSceneTextures } from './sceneReadiness';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

function fixture() {
  const requests: { texture: Texture; load: () => void; fail: () => void }[] = [];
  vi.spyOn(TextureLoader.prototype, 'load').mockImplementation((_url, onLoad, _progress, onError) => {
    const texture = new Texture<HTMLImageElement>();
    requests.push({ texture, load: () => onLoad?.(texture), fail: () => onError?.(new Error('offline')) });
    return texture;
  });
  const root = new Group();
  const art = loadSceneTexture('/art.webp'), floor = loadSceneTexture('/floor.webp');
  root.add(new Mesh(undefined, new MeshStandardMaterial({ map: floor })));
  const hidden = new Mesh(undefined, new MeshStandardMaterial({ map: art }));
  hidden.visible = false; root.add(hidden);
  return { root, requests };
}

describe('Scene arrival resources', () => {
  it('waits for the last image, including artwork hidden until the story reveals it', async () => {
    const { root, requests } = fixture();
    let ready = false;
    const preparation = waitForSceneTextures(root).then(() => { ready = true; });
    requests[1].load();
    await Promise.resolve(); await Promise.resolve();
    expect(ready).toBe(false);
    requests[0].load();
    await preparation;
    expect(ready).toBe(true);
    expect(sceneTextures(root).size).toBe(2);
  });
  it('settles failed images through their fallback, without blocking unrelated scenes', async () => {
    const { root, requests } = fixture();
    loadSceneTexture('/another-scene.webp');
    requests[0].fail(); requests[1].load();
    await expect(waitForSceneTextures(root)).resolves.toBeUndefined();
  });
  it('exposes stalled transfers for retry and clears its deadline after completion', async () => {
    vi.useFakeTimers();
    const { root, requests } = fixture();
    const failed = expect(waitForSceneTextures(root)).rejects.toThrow('timeout');
    await vi.advanceTimersByTimeAsync(45_000); await failed;
    requests.forEach(request => request.load());
    await waitForSceneTextures(root);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('invalidates an old draft immediately and allows a fresh scene to load independently', async () => {
    vi.useFakeTimers();
    const old = fixture(), abort = new AbortController();
    const cancelled = expect(waitForSceneTextures(old.root, abort.signal)).rejects.toThrow();
    abort.abort(); await cancelled;
    expect(vi.getTimerCount()).toBe(0);
    const fresh = fixture();
    const ready = waitForSceneTextures(fresh.root);
    fresh.requests.forEach(request => request.load());
    await ready;
    expect(vi.getTimerCount()).toBe(0);
  });

});
