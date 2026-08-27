import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GalleryDraft, TemplateId } from "../features/gallery/types";
import {
  createGalleryProjectId,
  accountLinkedDraftExport,
  clearAccountLinkedDrafts,
  deleteGalleryDraft,
  listGalleryDrafts,
  loadGalleryDraft,
  publishedGalleryProjectId,
  saveGalleryDraft,
  type StoredGalleryDraft,
} from "./draftStorage";

const DATABASE_NAME = "aura-gallery-editor";
const FALLBACK_PREFIX = "aura-gallery-project-v2:";
const LEGACY_FALLBACK_PREFIX = "aura-gallery-draft-v1:";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }
}

let storage: MemoryStorage;

function exposeBrowser(indexedDbAvailable = true) {
  const browser = indexedDbAvailable ? { indexedDB: globalThis.indexedDB } : {};
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: browser,
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: storage,
  });
}

function removeDatabase() {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("The test database is still open."));
  });
}

function draft(
  templateId: TemplateId = "white-cube",
  title = "Saved exhibition",
): GalleryDraft {
  return {
    title,
    artist: "Saved artist",
    templateId,
    wall: templateId === "nocturne" ? "charcoal" : "chalk",
    floor: templateId === "nocturne" ? "dark-oak" : "concrete",
    ceiling: templateId === "nocturne" ? "dark" : "gallery",
    lighting: templateId === "nocturne" ? "evening" : "daylight",
    decor: [],
    artworks: [],
  };
}

function fallbackRecord(
  projectId: string,
  templateId: TemplateId,
  overrides: Partial<StoredGalleryDraft> = {},
): StoredGalleryDraft {
  return {
    projectId,
    templateId,
    schemaVersion: 2,
    revision: 1,
    savedAt: "2026-08-02T12:00:00.000Z",
    draft: draft(templateId),
    ...overrides,
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
  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "localStorage");
});

describe("versioned multi-project draft storage", () => {
  it("round-trips a versioned project with revision and save time", async () => {
    const saved = await saveGalleryDraft("white-one", draft(), 7);
    expect(saved).toMatchObject({
      projectId: "white-one",
      templateId: "white-cube",
      schemaVersion: 2,
      revision: 7,
    });
    expect(saved.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(await loadGalleryDraft("white-one")).toEqual(saved);
  });

  it("keeps a newer project revision when a stale save completes later", async () => {
    await saveGalleryDraft("white-one", draft("white-cube", "Newer"), 5);
    const stale = await saveGalleryDraft(
      "white-one",
      draft("white-cube", "Stale"),
      4,
    );
    expect(stale).toMatchObject({ revision: 5, draft: { title: "Newer" } });
  });

  it("stores multiple projects using the same template", async () => {
    await saveGalleryDraft("white-one", draft("white-cube", "First"), 1);
    await saveGalleryDraft("white-two", draft("white-cube", "Second"), 1);
    await saveGalleryDraft("night-one", draft("nocturne", "Night"), 1);

    const whiteProjects = await listGalleryDrafts("white-cube");
    expect(whiteProjects).toHaveLength(2);
    expect(new Set(whiteProjects.map((project) => project.draft.title))).toEqual(
      new Set(["First", "Second"]),
    );
    expect((await loadGalleryDraft("night-one"))?.draft.title).toBe("Night");
  });

  it("deletes only the selected project", async () => {
    await saveGalleryDraft("white-one", draft("white-cube", "First"), 1);
    await saveGalleryDraft("white-two", draft("white-cube", "Second"), 1);
    await deleteGalleryDraft("white-one");
    expect(await loadGalleryDraft("white-one")).toBeNull();
    expect((await loadGalleryDraft("white-two"))?.draft.title).toBe("Second");
  });

  it("creates distinct readable project ids", () => {
    const first = createGalleryProjectId("pavilion");
    const second = createGalleryProjectId("pavilion");
    expect(first).toMatch(/^pavilion-[a-zA-Z0-9-]+$/);
    expect(second).not.toBe(first);
  });

  it("keeps a published-room target through later autosaves", async () => {
    const publication = {
      id: "room-1",
      ownerId: "owner-1",
      publishedAt: "2026-08-14T10:00:00.000Z",
      expiresAt: "2027-08-14T10:00:00.000Z",
      visibility: "private" as const,
      retention: "account-preview" as const,
      accessVersion: 1,
      revision: 3,
      role: "editor" as const,
    };
    await saveGalleryDraft("published-room-1", draft(), 1, publication, "published-signature");
    await saveGalleryDraft("published-room-1", draft("white-cube", "Changed"), 2);
    expect(await loadGalleryDraft("published-room-1")).toMatchObject({
      revision: 2,
      draft: { title: "Changed" },
      publication,
      publishedDraftSignature: "published-signature",
    });
  });

  it("keeps recoverable local work and its live target after a failed update", async () => {
    const publication = {
      id: "wp1-release-gate-room",
      ownerId: "wp1-owner",
      publishedAt: "2026-08-14T10:00:00.000Z",
      expiresAt: "2027-08-14T10:00:00.000Z",
      visibility: "unlisted" as const,
      retention: "account-preview" as const,
      accessVersion: 1,
      revision: 4,
      role: "owner" as const,
    };
    const working = draft("white-cube", "Unsaved cloud update");
    await saveGalleryDraft("published-wp1-release-gate-room", working, 8, publication);

    await expect(Promise.reject(new Error("simulated cloud rejection"))).rejects.toThrow();

    expect(await loadGalleryDraft("published-wp1-release-gate-room")).toMatchObject({
      revision: 8,
      draft: { title: "Unsaved cloud update" },
      publication,
    });
  });

  it("creates a stable local project id for a published room", () => {
    expect(publishedGalleryProjectId("room-1")).toBe("published-room-1");
    expect(() => publishedGalleryProjectId("../room")).toThrow();
  });

  it("exports and clears only drafts linked to the deleted account", async () => {
    const publication = {
      id: "room-owned",
      ownerId: "account-a",
      publishedAt: "2026-08-14T10:00:00.000Z",
      expiresAt: "2027-08-14T10:00:00.000Z",
      visibility: "private" as const,
      retention: "account-preview" as const,
      accessVersion: 1,
      revision: 2,
      role: "owner" as const,
    };
    await saveGalleryDraft("published-room-owned", draft(), 3, publication);
    await saveGalleryDraft("anonymous-work", draft("nocturne"), 2);
    await saveGalleryDraft("other-account", draft("pavilion"), 2, {
      ...publication,
      id: "room-other",
      ownerId: "account-b",
    });
    await saveGalleryDraft("shared-editor-work", draft("white-cube"), 2, {
      ...publication,
      id: "room-shared",
      ownerId: "account-b",
      accountUid: "account-a",
      role: "editor",
    });

    const exported = await accountLinkedDraftExport("account-a");
    expect(exported.map((record) => record.projectId).sort()).toEqual([
      "published-room-owned",
      "shared-editor-work",
    ]);
    expect(await clearAccountLinkedDrafts("account-a")).toBe(2);
    expect(await loadGalleryDraft("published-room-owned")).toBeNull();
    expect(await loadGalleryDraft("shared-editor-work")).toBeNull();
    expect(await loadGalleryDraft("anonymous-work")).not.toBeNull();
    expect(await loadGalleryDraft("other-account")).not.toBeNull();
  });
});

describe("local fallback and schema guard", () => {
  it("saves, lists, and recovers when IndexedDB is unavailable", async () => {
    exposeBrowser(false);
    const saved = await saveGalleryDraft("white-one", draft(), 3);
    expect(storage.getItem(`${FALLBACK_PREFIX}white-one`)).not.toBeNull();
    expect(await loadGalleryDraft("white-one")).toEqual(saved);
    expect(await listGalleryDrafts("white-cube")).toEqual([saved]);
  });

  it("keeps the newest fallback revision", async () => {
    exposeBrowser(false);
    await saveGalleryDraft("white-one", draft("white-cube", "Newer"), 9);
    const stale = await saveGalleryDraft(
      "white-one",
      draft("white-cube", "Stale"),
      8,
    );
    expect(stale).toMatchObject({ revision: 9, draft: { title: "Newer" } });
  });

  it("ignores corrupted, wrong-project, and incompatible records", async () => {
    exposeBrowser(false);
    storage.setItem(`${FALLBACK_PREFIX}white-one`, "{broken-json");
    expect(await loadGalleryDraft("white-one")).toBeNull();

    storage.setItem(
      `${FALLBACK_PREFIX}white-one`,
      JSON.stringify(fallbackRecord("white-two", "white-cube")),
    );
    expect(await loadGalleryDraft("white-one")).toBeNull();

    storage.setItem(
      `${FALLBACK_PREFIX}white-one`,
      JSON.stringify({
        ...fallbackRecord("white-one", "white-cube"),
        schemaVersion: 1,
      }),
    );
    expect(await loadGalleryDraft("white-one")).toBeNull();
  });

  it("recovers the previous one-draft-per-template fallback", async () => {
    exposeBrowser(false);
    storage.setItem(
      `${LEGACY_FALLBACK_PREFIX}white-cube`,
      JSON.stringify({
        templateId: "white-cube",
        schemaVersion: 1,
        revision: 4,
        savedAt: "2026-08-02T12:00:00.000Z",
        draft: draft("white-cube", "Legacy room"),
      }),
    );
    expect(await loadGalleryDraft("legacy-white-cube")).toMatchObject({
      projectId: "legacy-white-cube",
      schemaVersion: 2,
      revision: 4,
      draft: { title: "Legacy room" },
    });
  });
});
