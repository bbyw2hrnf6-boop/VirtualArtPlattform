import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GalleryDraft } from "../features/gallery/types";
import type { GalleryEditTarget } from "./galleryAccess";

type MockUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  isAnonymous: boolean;
  emailVerified: boolean;
  providerData: Array<{ providerId: string }>;
  getIdToken: () => Promise<string>;
};

type MockReference = { path: string };
type QueryClause = { kind: "where" | "orderBy" | "limit"; field?: string; op?: string; value?: unknown };
type MockQuery = { path: string; group?: string; clauses: QueryClause[] };

const mock = vi.hoisted(() => {
  class Timestamp {
    constructor(readonly date: Date) {}
    static fromDate(date: Date) { return new Timestamp(new Date(date)); }
    static fromMillis(value: number) { return new Timestamp(new Date(value)); }
    toDate() { return new Date(this.date); }
  }

  const state = {
    documents: new Map<string, Record<string, unknown>>(),
    objects: new Map<string, Blob>(),
    currentUser: null as MockUser | null,
    uploadCount: 0,
    failUploadAt: 0,
    failSetDoc: false,
    failTransaction: false,
    callableFailure: null as Error | null,
    deletedObjects: [] as string[],
    abortedGalleryIds: [] as string[],
    clock: new Date("2026-08-23T10:00:00.000Z"),
  };

  return { Timestamp, state };
});

function firebaseError(code: string, message = code) {
  return Object.assign(new Error(message), { code });
}

function snapshot(path: string, data?: Record<string, unknown>) {
  const id = path.split("/").at(-1) ?? path;
  return {
    id,
    ref: { path, parent: { parent: path.includes("/members/")
      ? { path: path.split("/members/")[0] }
      : null } },
    exists: () => Boolean(data),
    data: () => data,
  };
}

function currentEmail() {
  return mock.state.currentUser?.email?.toLowerCase() ?? "";
}

function canReadGallery(data: Record<string, unknown> | undefined, galleryId: string) {
  if (!data) return true;
  const user = mock.state.currentUser;
  if (user && data.ownerId === user.uid) return true;
  const active = data.lifecycleStatus === "active"
    && data.expiresAt instanceof mock.Timestamp
    && (data.expiresAt as InstanceType<typeof mock.Timestamp>).toDate() > mock.state.clock;
  if (!active) return false;
  if (data.visibility === "public" || data.visibility === "unlisted") return true;
  return Boolean(currentEmail() && mock.state.documents.has(`galleries/${galleryId}/members/${currentEmail()}`));
}

function queryDocuments(input: MockQuery) {
  let entries: Array<[string, Record<string, unknown>]>;
  if (input.group === "members") {
    entries = [...mock.state.documents.entries()].filter(([path]) => path.includes("/members/"));
  } else {
    const prefix = `${input.path}/`;
    entries = [...mock.state.documents.entries()].filter(([path]) => {
      if (!path.startsWith(prefix)) return false;
      return !path.slice(prefix.length).includes("/");
    });
  }
  for (const clause of input.clauses) {
    if (clause.kind !== "where") continue;
    entries = entries.filter(([, data]) => {
      const actual = data[clause.field!];
      if (clause.op === "==") return actual === clause.value;
      if (clause.op === "in") return Array.isArray(clause.value) && clause.value.includes(actual);
      if (clause.op === ">") {
        const left = actual instanceof mock.Timestamp ? actual.toDate().getTime() : Number(actual);
        const right = clause.value instanceof mock.Timestamp
          ? clause.value.toDate().getTime()
          : Number(clause.value);
        return left > right;
      }
      return true;
    });
  }
  const maximum = input.clauses.find((clause) => clause.kind === "limit")?.value;
  if (typeof maximum === "number") entries = entries.slice(0, maximum);
  return entries.map(([path, data]) => snapshot(path, data));
}

vi.mock("firebase/auth", () => ({
  signInAnonymously: vi.fn(async () => {
    const user = makeUser("anonymous", null, "anonymous", false);
    mock.state.currentUser = user;
    return { user };
  }),
  signOut: vi.fn(async () => { mock.state.currentUser = null; }),
}));

vi.mock("firebase/firestore", () => ({
  Timestamp: mock.Timestamp,
  collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/"), clauses: [] }),
  collectionGroup: (_db: unknown, group: string) => ({ path: "", group, clauses: [] }),
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
  where: (field: string, op: string, value: unknown) => ({ kind: "where", field, op, value }),
  orderBy: (field: string) => ({ kind: "orderBy", field }),
  limit: (value: number) => ({ kind: "limit", value }),
  query: (base: MockQuery, ...clauses: QueryClause[]) => ({ ...base, clauses }),
  serverTimestamp: () => mock.Timestamp.fromDate(mock.state.clock),
  getDoc: vi.fn(async (reference: MockReference) => {
    const data = mock.state.documents.get(reference.path);
    const match = /^galleries\/([^/]+)$/.exec(reference.path);
    if (match && data && !canReadGallery(data, match[1]))
      throw firebaseError("permission-denied", "Private room");
    return snapshot(reference.path, data);
  }),
  getDocs: vi.fn(async (input: MockQuery) => ({ docs: queryDocuments(input) })),
  setDoc: vi.fn(async (reference: MockReference, data: Record<string, unknown>) => {
    if (mock.state.failSetDoc) throw firebaseError("firestore/unavailable", "write failed");
    mock.state.documents.set(reference.path, data);
  }),
  deleteDoc: vi.fn(async (reference: MockReference) => { mock.state.documents.delete(reference.path); }),
  runTransaction: vi.fn(async (_db: unknown, operation: (transaction: {
    get: (reference: MockReference) => Promise<ReturnType<typeof snapshot>>;
    set: (reference: MockReference, data: Record<string, unknown>) => void;
  }) => Promise<void>) => {
    if (mock.state.failTransaction) throw firebaseError("firestore/unavailable", "transaction failed");
    const staged = new Map<string, Record<string, unknown>>();
    await operation({
      get: async (reference) => snapshot(reference.path, mock.state.documents.get(reference.path)),
      set: (reference, data) => staged.set(reference.path, data),
    });
    staged.forEach((data, path) => mock.state.documents.set(path, data));
  }),
}));

vi.mock("firebase/storage", () => ({
  ref: (_storage: unknown, path: string) => ({ path }),
  uploadBytes: vi.fn(async (reference: MockReference, blob: Blob) => {
    mock.state.uploadCount += 1;
    if (mock.state.failUploadAt === mock.state.uploadCount)
      throw firebaseError("storage/retry-limit-exceeded", "upload failed");
    mock.state.objects.set(reference.path, blob);
    return { ref: reference };
  }),
  getBlob: vi.fn(async (reference: MockReference) => {
    const galleryId = reference.path.split("/")[2];
    const gallery = mock.state.documents.get(`galleries/${galleryId}`);
    if (gallery && !canReadGallery(gallery, galleryId))
      throw firebaseError("storage/unauthorized", "Private media");
    const blob = mock.state.objects.get(reference.path);
    if (!blob) throw firebaseError("storage/object-not-found", reference.path);
    return blob;
  }),
  deleteObject: vi.fn(async (reference: MockReference) => {
    mock.state.deletedObjects.push(reference.path);
    mock.state.objects.delete(reference.path);
  }),
}));

vi.mock("firebase/functions", () => ({
  httpsCallable: (_functions: unknown, name: string) => async ({
    galleryId,
    visibility,
    email,
    role,
    inviteId,
    action,
  }: Record<string, string>) => {
    if (mock.state.callableFailure) throw mock.state.callableFailure;
    const user = mock.state.currentUser;
    if (name === "beginAuraGalleryPublication") {
      if (!user || user.isAnonymous || !user.emailVerified)
        throw firebaseError("functions/unauthenticated", "Verified account required");
      return { data: { expiresAt: "2027-08-23T10:00:00.000Z", retention: "account-preview" } };
    }
    if (name === "abortAuraGalleryPublication") {
      mock.state.abortedGalleryIds.push(galleryId);
      return { data: { status: "clean" } };
    }
    if (name === "createAuraGalleryInvite") {
      const id = `invite-${galleryId}-${email}`;
      mock.state.documents.set(`galleryInvites/${id}`, {
        galleryId, galleryTitle: mock.state.documents.get(`galleries/${galleryId}`)?.title,
        ownerId: user?.uid, email, role, status: "pending",
        createdAt: mock.Timestamp.fromDate(mock.state.clock),
        expiresAt: mock.Timestamp.fromDate(new Date("2026-09-01T10:00:00.000Z")),
      });
      return { data: { status: "pending" } };
    }
    if (name === "acceptAuraGalleryInvite") {
      const path = `galleryInvites/${inviteId}`;
      const invite = mock.state.documents.get(path)!;
      mock.state.documents.set(`galleries/${invite.galleryId}/members/${invite.email}`, {
        email: invite.email, role: invite.role, status: "active",
        addedAt: mock.Timestamp.fromDate(mock.state.clock),
      });
      mock.state.documents.set(path, { ...invite, status: "accepted" });
      return { data: { status: "accepted" } };
    }
    if (name === "revokeAuraGalleryAccess") {
      mock.state.documents.delete(`galleries/${galleryId}/members/${email}`);
      for (const [path, data] of mock.state.documents) {
        if (path.startsWith("galleryInvites/") && data.galleryId === galleryId && data.email === email)
          mock.state.documents.delete(path);
      }
      return { data: { status: "removed" } };
    }
    if (name === "manageAuraGalleryLifecycle") {
      const path = `galleries/${galleryId}`;
      const current = mock.state.documents.get(path)!;
      mock.state.documents.set(path, action === "visibility"
        ? { ...current, visibility }
        : current);
      return { data: { status: "ok" } };
    }
    return { data: { status: "ok" } };
  },
}));

vi.mock("./firebase", () => ({
  firebaseAuth: {
    authStateReady: async () => undefined,
    get currentUser() { return mock.state.currentUser; },
  },
  firebaseDb: {},
  firebaseFunctions: {},
  firebaseStorage: {},
  FIREBASE_PROJECT_ID: "release-gate-test",
}));

import { FirebaseGalleryRepository } from "./firebaseGalleryRepository";
import { GalleryAccessDeniedError } from "./galleryRepository";

function makeUser(uid: string, email: string | null, provider = "password", verified = true): MockUser {
  return {
    uid,
    email,
    displayName: uid,
    isAnonymous: provider === "anonymous",
    emailVerified: verified,
    providerData: [{ providerId: provider }],
    getIdToken: async () => "test-token",
  };
}

const media = {
  png: "data:image/png;base64,iVBORw0KGgo=",
  jpg: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
  webp: "data:image/webp;base64,UklGRgAAAABXRUJQVlA4",
};

function draft(title = "WP1 release gate"): GalleryDraft {
  return {
    title,
    artist: "Release Gate",
    templateId: "white-cube",
    wall: "chalk",
    floor: "concrete",
    ceiling: "gallery",
    lighting: "daylight",
    decor: [],
    artworks: [
      { id: "png", title: "PNG", src: media.png, aspect: 1, wall: "north", x: -2, y: 1.5, scale: .8 },
      { id: "jpg", title: "JPG", src: media.jpg, aspect: 1, wall: "north", x: 0, y: 1.5, scale: .8 },
      { id: "webp", title: "WebP", src: media.webp, aspect: 1, wall: "north", x: 2, y: 1.5, scale: .8 },
    ],
  };
}

function target(record: Awaited<ReturnType<FirebaseGalleryRepository["publish"]>>, role: "owner" | "editor" = "owner"): GalleryEditTarget {
  return {
    id: record.id,
    ownerId: record.ownerId!,
    publishedAt: record.publishedAt,
    expiresAt: record.expiresAt,
    visibility: record.visibility,
    retention: record.retention,
    accessVersion: record.accessVersion,
    revision: record.revision,
    role,
  };
}

class MockImage {
  width = 1200;
  height = 800;
  src = "";
  async decode() { return undefined; }
}

class MockFileReader {
  result: string | ArrayBuffer | null = null;
  error: Error | null = null;
  private listeners = new Map<string, () => void>();
  addEventListener(type: string, listener: () => void) { this.listeners.set(type, listener); }
  readAsDataURL(blob: Blob) {
    void blob.arrayBuffer().then((buffer) => {
      const binary = String.fromCharCode(...new Uint8Array(buffer));
      this.result = `data:${blob.type};base64,${btoa(binary)}`;
      this.listeners.get("load")?.();
    }, (error) => {
      this.error = error;
      this.listeners.get("error")?.();
    });
  }
}

beforeEach(() => {
  mock.state.documents.clear();
  mock.state.objects.clear();
  mock.state.currentUser = makeUser("wp1-owner", "owner@example.test");
  mock.state.uploadCount = 0;
  mock.state.failUploadAt = 0;
  mock.state.failSetDoc = false;
  mock.state.failTransaction = false;
  mock.state.callableFailure = null;
  mock.state.deletedObjects = [];
  mock.state.abortedGalleryIds = [];
  mock.state.clock = new Date(Date.now() + 1_000);
  vi.stubGlobal("Image", MockImage);
  vi.stubGlobal("FileReader", MockFileReader);
  vi.stubGlobal("location", { origin: "https://example.test" });
  vi.stubGlobal("document", {
    baseURI: "https://example.test/",
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: () => undefined }),
      toDataURL: () => media.webp,
    }),
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("publish → visit → edit → update release gate", () => {
  it("publishes and hydrates public JPG, PNG, and WebP media", async () => {
    const repository = new FirebaseGalleryRepository();
    const published = await repository.publish(draft(), media.webp, { visibility: "public" });
    expect(published).toMatchObject({ visibility: "public", revision: 1, accessVersion: 1 });
    expect(mock.state.objects.size).toBe(4);

    mock.state.currentUser = null;
    const visited = await repository.find(published.id);
    expect(visited?.artworks.every((artwork) => artwork.src.startsWith("blob:"))).toBe(true);
    expect((await repository.discover()).map((record) => record.id)).toContain(published.id);
  });

  it("keeps unlisted rooms direct-link accessible but out of Discover", async () => {
    const repository = new FirebaseGalleryRepository();
    const published = await repository.publish(draft(), media.webp, { visibility: "unlisted" });
    mock.state.currentUser = null;
    expect((await repository.find(published.id))?.id).toBe(published.id);
    expect((await repository.discover()).map((record) => record.id)).not.toContain(published.id);
  });

  it("rejects private content before authorization and permits an accepted viewer", async () => {
    const repository = new FirebaseGalleryRepository();
    const published = await repository.publish(draft(), media.webp, { visibility: "private" });
    mock.state.currentUser = null;
    await expect(repository.find(published.id)).rejects.toBeInstanceOf(GalleryAccessDeniedError);

    mock.state.currentUser = makeUser("wp1-owner", "owner@example.test");
    await repository.setMember(published.id, "viewer@example.test", "viewer");
    mock.state.currentUser = makeUser("wp1-viewer", "viewer@example.test");
    const [invite] = await repository.listInvites();
    await repository.acceptInvite(invite.id);
    expect((await repository.find(published.id))?.id).toBe(published.id);
    await expect(repository.editableDraft(published.id)).rejects.toThrow("Editor access");
  });

  it("updates in place, increments revision, preserves identity/access, and resolves new media", async () => {
    const repository = new FirebaseGalleryRepository();
    const published = await repository.publish(draft(), media.webp, { visibility: "private" });
    mock.state.documents.set(`galleries/${published.id}/members/editor@example.test`, {
      email: "editor@example.test", role: "editor", status: "active",
      addedAt: mock.Timestamp.fromDate(mock.state.clock),
    });
    const beforePaths = [...mock.state.objects.keys()];
    mock.state.currentUser = makeUser("wp1-editor", "editor@example.test");
    const editable = await repository.editableDraft(published.id);
    editable.draft.title = "Updated release gate";
    editable.draft.artworks[0].src = media.jpg;
    const updated = await repository.updatePublished(editable.target, editable.draft, media.png);

    expect(updated.id).toBe(published.id);
    expect(updated.revision).toBe(2);
    expect(updated.visibility).toBe("private");
    expect(updated.accessVersion).toBe(published.accessVersion);
    expect(updated.effectiveRole).toBe("editor");
    expect(beforePaths.every((path) => mock.state.objects.has(path))).toBe(true);
    const persisted = await repository.findManifest(updated.id);
    expect(persisted?.artworks.every((artwork) => artwork.storagePath?.includes("/revisions/"))).toBe(true);
    expect((await repository.find(updated.id))?.artworks.every((artwork) => artwork.src.startsWith("blob:"))).toBe(true);
  });

  it("rejects a stale revision without overwriting live data or deleting local media", async () => {
    const repository = new FirebaseGalleryRepository();
    const published = await repository.publish(draft(), media.webp, { visibility: "public" });
    const staleTarget = target(published);
    const updated = await repository.updatePublished(staleTarget, draft("Current live"), media.webp);
    const pathsAfterSuccess = new Set(mock.state.objects.keys());

    await expect(repository.updatePublished(staleTarget, draft("Stale local"), media.webp))
      .rejects.toThrow("changed in another session");
    const live = await repository.findManifest(published.id);
    expect(live).toMatchObject({ id: published.id, revision: 2, title: "Current live" });
    expect([...pathsAfterSuccess].every((path) => mock.state.objects.has(path))).toBe(true);
    expect(updated.id).toBe(published.id);
  });

  it("supports invite, editor update, revoke, and denied access after revoke", async () => {
    const repository = new FirebaseGalleryRepository();
    const published = await repository.publish(draft(), media.webp, { visibility: "private" });
    await repository.setMember(published.id, "editor@example.test", "editor");
    mock.state.currentUser = makeUser("wp1-editor", "editor@example.test");
    const [invite] = await repository.listInvites();
    await repository.acceptInvite(invite.id);
    const editable = await repository.editableDraft(published.id);
    const updated = await repository.updatePublished(editable.target, editable.draft, media.webp);
    expect(updated.effectiveRole).toBe("editor");

    mock.state.currentUser = makeUser("wp1-owner", "owner@example.test");
    await repository.removeMember(published.id, "editor@example.test");
    mock.state.currentUser = makeUser("wp1-editor", "editor@example.test");
    await expect(repository.find(published.id)).rejects.toBeInstanceOf(GalleryAccessDeniedError);
  });

  it("cleans partial uploads, preserves the manifest, and succeeds on retry", async () => {
    const repository = new FirebaseGalleryRepository();
    mock.state.failUploadAt = 2;
    await expect(repository.publish(draft(), media.webp, { visibility: "public" }))
      .rejects.toMatchObject({ code: "unavailable" });
    expect([...mock.state.documents.keys()].some((path) => path.startsWith("galleries/"))).toBe(false);
    expect(mock.state.objects.size).toBe(0);
    expect(mock.state.abortedGalleryIds).toHaveLength(1);

    mock.state.failUploadAt = 0;
    mock.state.uploadCount = 0;
    const retried = await repository.publish(draft(), media.webp, { visibility: "public" });
    expect(await repository.find(retried.id)).not.toBeNull();
  });

  it("removes uploaded fixtures when the initial Firestore manifest write fails", async () => {
    const repository = new FirebaseGalleryRepository();
    mock.state.failSetDoc = true;
    await expect(repository.publish(draft(), media.webp, { visibility: "public" }))
      .rejects.toMatchObject({ code: "unavailable" });
    expect(mock.state.objects.size).toBe(0);
    expect([...mock.state.documents.keys()].some((path) => path.startsWith("galleries/"))).toBe(false);
    expect(mock.state.deletedObjects.length).toBe(4);
  });

  it("keeps the previous live revision after transaction failure and allows retry", async () => {
    const repository = new FirebaseGalleryRepository();
    const published = await repository.publish(draft(), media.webp, { visibility: "public" });
    const editTarget = target(published);
    const originalPaths = new Set(mock.state.objects.keys());
    mock.state.failTransaction = true;
    await expect(repository.updatePublished(editTarget, draft("Failed update"), media.webp))
      .rejects.toMatchObject({ code: "unavailable" });
    expect(await repository.findManifest(published.id)).toMatchObject({ revision: 1, title: published.title });
    expect([...originalPaths].every((path) => mock.state.objects.has(path))).toBe(true);

    mock.state.failTransaction = false;
    const retried = await repository.updatePublished(editTarget, draft("Retry update"), media.webp);
    expect(retried).toMatchObject({ id: published.id, revision: 2, title: "Retry update" });
  });

  it("returns actionable App Check/callable errors without leaving published state", async () => {
    const repository = new FirebaseGalleryRepository();
    mock.state.callableFailure = firebaseError("functions/unauthenticated", "App Check token rejected");
    await expect(repository.publish(draft(), media.webp, { visibility: "public" }))
      .rejects.toMatchObject({ code: "app-check" });
    expect(mock.state.documents.size).toBe(0);
    expect(mock.state.objects.size).toBe(0);

    mock.state.callableFailure = null;
    expect((await repository.publish(draft(), media.webp, { visibility: "public" })).revision).toBe(1);
  });
});
