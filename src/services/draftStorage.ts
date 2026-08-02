import type { GalleryDraft, TemplateId } from '../features/gallery/types';

const DATABASE_NAME = 'aura-gallery-editor';
const DATABASE_VERSION = 1;
const STORE_NAME = 'drafts';
const SCHEMA_VERSION = 1;
const FALLBACK_PREFIX = 'aura-gallery-draft-v1:';

export interface StoredGalleryDraft {
  templateId: TemplateId;
  schemaVersion: typeof SCHEMA_VERSION;
  revision: number;
  savedAt: string;
  draft: GalleryDraft;
}

function isStoredDraft(value: unknown, templateId: TemplateId): value is StoredGalleryDraft {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<StoredGalleryDraft>;
  return item.schemaVersion === SCHEMA_VERSION
    && item.templateId === templateId
    && typeof item.revision === 'number'
    && typeof item.savedAt === 'string'
    && Boolean(item.draft && item.draft.templateId === templateId && Array.isArray(item.draft.artworks) && Array.isArray(item.draft.decor));
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('IndexedDB is unavailable.')); return; }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: 'templateId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Draft storage could not be opened.'));
  });
}

async function withStore<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore, finish: (value: T) => void, fail: (error: Error) => void) => void): Promise<T> {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    let settled = false;
    const finish = (value: T) => { if (!settled) { settled = true; resolve(value); } };
    const fail = (error: Error) => { if (!settled) { settled = true; reject(error); } };
    transaction.onabort = () => fail(transaction.error ?? new Error('Draft storage was interrupted.'));
    transaction.onerror = () => fail(transaction.error ?? new Error('Draft storage failed.'));
    transaction.oncomplete = () => database.close();
    operation(store, finish, fail);
  }).finally(() => database.close());
}

function readFallback(templateId: TemplateId): StoredGalleryDraft | null {
  try {
    const raw = localStorage.getItem(`${FALLBACK_PREFIX}${templateId}`);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredDraft(parsed, templateId) ? parsed : null;
  } catch { return null; }
}

export async function loadGalleryDraft(templateId: TemplateId): Promise<StoredGalleryDraft | null> {
  try {
    const result = await withStore<unknown>('readonly', (store, finish, fail) => {
      const request = store.get(templateId);
      request.onsuccess = () => finish(request.result);
      request.onerror = () => fail(request.error ?? new Error('Draft could not be read.'));
    });
    return isStoredDraft(result, templateId) ? result : readFallback(templateId);
  } catch {
    return readFallback(templateId);
  }
}

export async function saveGalleryDraft(draft: GalleryDraft, revision: number): Promise<StoredGalleryDraft> {
  const record: StoredGalleryDraft = { templateId: draft.templateId, schemaVersion: SCHEMA_VERSION, revision, savedAt: new Date().toISOString(), draft };
  try {
    const stored = await withStore<StoredGalleryDraft>('readwrite', (store, finish, fail) => {
      const current = store.get(draft.templateId);
      current.onerror = () => fail(current.error ?? new Error('Draft revision could not be checked.'));
      current.onsuccess = () => {
        const existing: unknown = current.result;
        if (isStoredDraft(existing, draft.templateId) && existing.revision > revision) { finish(existing); return; }
        const request = store.put(record);
        request.onsuccess = () => finish(record);
        request.onerror = () => fail(request.error ?? new Error('Draft could not be saved.'));
      };
    });
    try { localStorage.removeItem(`${FALLBACK_PREFIX}${draft.templateId}`); } catch { /* Storage may be disabled. */ }
    return stored;
  } catch (error) {
    try {
      const existing = readFallback(draft.templateId);
      if (existing && existing.revision > revision) return existing;
      localStorage.setItem(`${FALLBACK_PREFIX}${draft.templateId}`, JSON.stringify(record)); return record;
    }
    catch { throw error; }
  }
}

export async function deleteGalleryDraft(templateId: TemplateId): Promise<void> {
  try {
    await withStore<void>('readwrite', (store, finish, fail) => {
      const request = store.delete(templateId);
      request.onsuccess = () => finish();
      request.onerror = () => fail(request.error ?? new Error('Draft could not be discarded.'));
    });
  } catch { /* The fallback is still cleared below. */ }
  try { localStorage.removeItem(`${FALLBACK_PREFIX}${templateId}`); } catch { /* Storage may be disabled. */ }
}
