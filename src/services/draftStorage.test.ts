import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GalleryDraft, TemplateId } from '../features/gallery/types';
import { deleteGalleryDraft, loadGalleryDraft, saveGalleryDraft, type StoredGalleryDraft } from './draftStorage';

const DATABASE_NAME = 'aura-gallery-editor';
const FALLBACK_PREFIX = 'aura-gallery-draft-v1:';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

let storage: MemoryStorage;

function exposeBrowser(indexedDbAvailable = true) {
  const browser = indexedDbAvailable ? { indexedDB: globalThis.indexedDB } : {};
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: browser });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: storage });
}

function removeDatabase() {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('The test database is still open.'));
  });
}

function draft(templateId: TemplateId = 'white-cube', title = 'Saved exhibition'): GalleryDraft {
  return {
    title,
    artist: 'Saved artist',
    templateId,
    wall: templateId === 'nocturne' ? 'charcoal' : 'chalk',
    floor: templateId === 'nocturne' ? 'dark-oak' : 'concrete',
    ceiling: templateId === 'nocturne' ? 'dark' : 'gallery',
    lighting: templateId === 'nocturne' ? 'evening' : 'daylight',
    decor: [],
    artworks: []
  };
}

function fallbackRecord(templateId: TemplateId, overrides: Partial<StoredGalleryDraft> = {}): StoredGalleryDraft {
  return {
    templateId,
    schemaVersion: 1,
    revision: 1,
    savedAt: '2026-08-02T12:00:00.000Z',
    draft: draft(templateId),
    ...overrides
  };
}

beforeEach(async () => {
  storage = new MemoryStorage();
  exposeBrowser();
  await removeDatabase();
});

afterEach(async () => {
  exposeBrowser();
  await removeDatabase();
  Reflect.deleteProperty(globalThis, 'window');
  Reflect.deleteProperty(globalThis, 'localStorage');
});

describe('versioned IndexedDB draft storage', () => {
  it('round-trips a versioned record with revision and save time', async () => {
    const saved = await saveGalleryDraft(draft(), 7);
    expect(saved).toMatchObject({ templateId: 'white-cube', schemaVersion: 1, revision: 7 });
    expect(saved.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const loaded = await loadGalleryDraft('white-cube');
    expect(loaded).toEqual(saved);
  });

  it('keeps a newer persisted revision when a stale save completes later', async () => {
    await saveGalleryDraft(draft('white-cube', 'Newer'), 5);
    const staleResult = await saveGalleryDraft(draft('white-cube', 'Stale'), 4);
    const loaded = await loadGalleryDraft('white-cube');
    expect(staleResult).toMatchObject({ revision: 5, draft: { title: 'Newer' } });
    expect(loaded).toMatchObject({ revision: 5, draft: { title: 'Newer' } });
  });

  it('isolates records by template', async () => {
    await saveGalleryDraft(draft('white-cube', 'White'), 1);
    await saveGalleryDraft(draft('nocturne', 'Night'), 2);
    expect((await loadGalleryDraft('white-cube'))?.draft.title).toBe('White');
    expect((await loadGalleryDraft('nocturne'))?.draft.title).toBe('Night');
    expect(await loadGalleryDraft('pavilion')).toBeNull();
  });

  it('deletes both the database draft and any local fallback', async () => {
    await saveGalleryDraft(draft(), 1);
    storage.setItem(`${FALLBACK_PREFIX}white-cube`, JSON.stringify(fallbackRecord('white-cube')));
    await deleteGalleryDraft('white-cube');
    expect(await loadGalleryDraft('white-cube')).toBeNull();
    expect(storage.getItem(`${FALLBACK_PREFIX}white-cube`)).toBeNull();
  });
});

describe('local fallback and schema guard', () => {
  it('saves and recovers through localStorage when IndexedDB is unavailable', async () => {
    exposeBrowser(false);
    const saved = await saveGalleryDraft(draft(), 3);
    expect(storage.getItem(`${FALLBACK_PREFIX}white-cube`)).not.toBeNull();
    expect(await loadGalleryDraft('white-cube')).toEqual(saved);
  });

  it('keeps the newest fallback revision', async () => {
    exposeBrowser(false);
    await saveGalleryDraft(draft('white-cube', 'Newer fallback'), 9);
    const staleResult = await saveGalleryDraft(draft('white-cube', 'Stale fallback'), 8);
    expect(staleResult).toMatchObject({ revision: 9, draft: { title: 'Newer fallback' } });
    expect(await loadGalleryDraft('white-cube')).toMatchObject({ revision: 9, draft: { title: 'Newer fallback' } });
  });

  it('ignores corrupted, wrong-template, and incompatible-schema records', async () => {
    exposeBrowser(false);
    storage.setItem(`${FALLBACK_PREFIX}white-cube`, '{broken-json');
    expect(await loadGalleryDraft('white-cube')).toBeNull();

    storage.setItem(`${FALLBACK_PREFIX}white-cube`, JSON.stringify(fallbackRecord('nocturne')));
    expect(await loadGalleryDraft('white-cube')).toBeNull();

    storage.setItem(`${FALLBACK_PREFIX}white-cube`, JSON.stringify({ ...fallbackRecord('white-cube'), schemaVersion: 0 }));
    expect(await loadGalleryDraft('white-cube')).toBeNull();
  });
});
