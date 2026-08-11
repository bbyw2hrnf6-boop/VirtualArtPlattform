import type { GalleryDraft, TemplateId } from "../features/gallery/types";

const DATABASE_NAME = "aura-gallery-editor";
const DATABASE_VERSION = 2;
const LEGACY_STORE_NAME = "drafts";
const STORE_NAME = "projects";
const SCHEMA_VERSION = 2;
const FALLBACK_PREFIX = "aura-gallery-project-v2:";
const LEGACY_FALLBACK_PREFIX = "aura-gallery-draft-v1:";

export interface StoredGalleryDraft {
  projectId: string;
  templateId: TemplateId;
  schemaVersion: typeof SCHEMA_VERSION;
  revision: number;
  savedAt: string;
  draft: GalleryDraft;
}

type LegacyStoredGalleryDraft = Omit<StoredGalleryDraft, "projectId" | "schemaVersion"> & {
  schemaVersion: 1;
};

const isTemplateId = (value: unknown): value is TemplateId =>
  value === "white-cube" || value === "nocturne" || value === "pavilion";

function isStoredDraft(
  value: unknown,
  projectId?: string,
): value is StoredGalleryDraft {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<StoredGalleryDraft>;
  return (
    item.schemaVersion === SCHEMA_VERSION &&
    typeof item.projectId === "string" &&
    (!projectId || item.projectId === projectId) &&
    isTemplateId(item.templateId) &&
    typeof item.revision === "number" &&
    typeof item.savedAt === "string" &&
    Boolean(
      item.draft &&
        item.draft.templateId === item.templateId &&
        Array.isArray(item.draft.artworks) &&
        Array.isArray(item.draft.decor),
    )
  );
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB is unavailable."));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const transaction = request.transaction;
      let projects: IDBObjectStore;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        projects = database.createObjectStore(STORE_NAME, { keyPath: "projectId" });
        projects.createIndex("templateId", "templateId", { unique: false });
        projects.createIndex("savedAt", "savedAt", { unique: false });
      } else projects = transaction!.objectStore(STORE_NAME);

      if (!transaction || !database.objectStoreNames.contains(LEGACY_STORE_NAME)) return;
      const legacy = transaction.objectStore(LEGACY_STORE_NAME);
      const cursor = legacy.openCursor();
      cursor.onsuccess = () => {
        const entry = cursor.result;
        if (!entry) return;
        const value = entry.value as Partial<LegacyStoredGalleryDraft>;
        if (
          value.schemaVersion === 1 &&
          isTemplateId(value.templateId) &&
          value.draft?.templateId === value.templateId
        ) {
          projects.put({
            projectId: `legacy-${value.templateId}`,
            templateId: value.templateId,
            schemaVersion: SCHEMA_VERSION,
            revision: Number(value.revision) || 0,
            savedAt: value.savedAt || new Date().toISOString(),
            draft: value.draft,
          } satisfies StoredGalleryDraft);
        }
        entry.continue();
      };
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Draft storage could not be opened."));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (
    store: IDBObjectStore,
    finish: (value: T) => void,
    fail: (error: Error) => void,
  ) => void,
): Promise<T> {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    let settled = false;
    const finish = (value: T) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    const fail = (error: Error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };
    transaction.onabort = () =>
      fail(transaction.error ?? new Error("Draft storage was interrupted."));
    transaction.onerror = () =>
      fail(transaction.error ?? new Error("Draft storage failed."));
    transaction.oncomplete = () => database.close();
    operation(store, finish, fail);
  }).finally(() => database.close());
}

function readFallback(projectId: string): StoredGalleryDraft | null {
  try {
    const raw = localStorage.getItem(`${FALLBACK_PREFIX}${projectId}`);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredDraft(parsed, projectId) ? parsed : null;
  } catch {
    return null;
  }
}

function readLegacyFallback(projectId: string): StoredGalleryDraft | null {
  if (!projectId.startsWith("legacy-")) return null;
  const templateId = projectId.slice("legacy-".length);
  if (!isTemplateId(templateId)) return null;
  try {
    const raw = localStorage.getItem(`${LEGACY_FALLBACK_PREFIX}${templateId}`);
    if (!raw) return null;
    const legacy = JSON.parse(raw) as Partial<LegacyStoredGalleryDraft>;
    if (
      legacy.schemaVersion !== 1 ||
      legacy.templateId !== templateId ||
      legacy.draft?.templateId !== templateId ||
      !Array.isArray(legacy.draft.artworks) ||
      !Array.isArray(legacy.draft.decor)
    )
      return null;
    return {
      projectId,
      templateId,
      schemaVersion: SCHEMA_VERSION,
      revision: Number(legacy.revision) || 0,
      savedAt: legacy.savedAt || new Date().toISOString(),
      draft: legacy.draft,
    };
  } catch {
    return null;
  }
}

function listFallback(): StoredGalleryDraft[] {
  const records: StoredGalleryDraft[] = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(FALLBACK_PREFIX)) continue;
      const record = readFallback(key.slice(FALLBACK_PREFIX.length));
      if (record) records.push(record);
    }
  } catch {
    return [];
  }
  return records;
}

export function createGalleryProjectId(templateId: TemplateId): string {
  const token = globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${templateId}-${token}`;
}

export async function loadGalleryDraft(
  projectId: string,
): Promise<StoredGalleryDraft | null> {
  try {
    const result = await withStore<unknown>("readonly", (store, finish, fail) => {
      const request = store.get(projectId);
      request.onsuccess = () => finish(request.result);
      request.onerror = () =>
        fail(request.error ?? new Error("Draft could not be read."));
    });
    return isStoredDraft(result, projectId)
      ? result
      : readFallback(projectId) ?? readLegacyFallback(projectId);
  } catch {
    return readFallback(projectId) ?? readLegacyFallback(projectId);
  }
}

export async function listGalleryDrafts(
  templateId?: TemplateId,
): Promise<StoredGalleryDraft[]> {
  let records: StoredGalleryDraft[];
  try {
    const result = await withStore<unknown[]>("readonly", (store, finish, fail) => {
      const request = store.getAll();
      request.onsuccess = () => finish(request.result);
      request.onerror = () =>
        fail(request.error ?? new Error("Draft projects could not be read."));
    });
    records = result.filter((record): record is StoredGalleryDraft => isStoredDraft(record));
  } catch {
    records = [];
  }
  const byProject = new Map(records.map((record) => [record.projectId, record]));
  listFallback().forEach((record) => {
    if (!byProject.has(record.projectId)) byProject.set(record.projectId, record);
  });
  (["white-cube", "nocturne", "pavilion"] as TemplateId[]).forEach(
    (legacyTemplate) => {
      const record = readLegacyFallback(`legacy-${legacyTemplate}`);
      if (record && !byProject.has(record.projectId))
        byProject.set(record.projectId, record);
    },
  );
  return [...byProject.values()]
    .filter((record) => !templateId || record.templateId === templateId)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function saveGalleryDraft(
  projectId: string,
  draft: GalleryDraft,
  revision: number,
): Promise<StoredGalleryDraft> {
  const record: StoredGalleryDraft = {
    projectId,
    templateId: draft.templateId,
    schemaVersion: SCHEMA_VERSION,
    revision,
    savedAt: new Date().toISOString(),
    draft,
  };
  try {
    const saved = await withStore<StoredGalleryDraft>("readwrite", (store, finish, fail) => {
      const current = store.get(projectId);
      current.onerror = () =>
        fail(current.error ?? new Error("Existing draft could not be checked."));
      current.onsuccess = () => {
        const existing: unknown = current.result;
        if (isStoredDraft(existing, projectId) && existing.revision > revision) {
          finish(existing);
          return;
        }
        const request = store.put(record);
        request.onsuccess = () => finish(record);
        request.onerror = () =>
          fail(request.error ?? new Error("Draft could not be saved."));
      };
    });
    try {
      localStorage.removeItem(`${FALLBACK_PREFIX}${projectId}`);
    } catch {
      // Storage may be disabled.
    }
    return saved;
  } catch {
    try {
      const existing = readFallback(projectId);
      if (existing && existing.revision > revision) return existing;
      localStorage.setItem(`${FALLBACK_PREFIX}${projectId}`, JSON.stringify(record));
      return record;
    } catch {
      throw new Error("This browser could not save the exhibition locally.");
    }
  }
}

export async function deleteGalleryDraft(projectId: string): Promise<void> {
  try {
    await withStore<void>("readwrite", (store, finish, fail) => {
      const request = store.delete(projectId);
      request.onsuccess = () => finish();
      request.onerror = () =>
        fail(request.error ?? new Error("Draft could not be deleted."));
    });
  } catch {
    // The fallback is still removed below.
  }
  try {
    localStorage.removeItem(`${FALLBACK_PREFIX}${projectId}`);
    if (projectId.startsWith("legacy-"))
      localStorage.removeItem(
        `${LEGACY_FALLBACK_PREFIX}${projectId.slice("legacy-".length)}`,
      );
  } catch {
    // Storage may be disabled.
  }
}
