import test from "node:test";
import assert from "node:assert/strict";

const documentRoot = "projects/virtualartplattform/databases/(default)/documents";
const firestoreDocument = (path, fields = {}, updateTime = "2026-09-01T00:00:00.000Z") => ({
  name: `${documentRoot}/${path}`, fields, updateTime,
});
const stringField = (value) => ({ stringValue: value });
const timestampField = (value = "2020-01-01T00:00:00.000Z") => ({ timestampValue: value });
const stringArrayField = (values) => ({ arrayValue: { values: values.map(stringField) } });
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json" },
});
const empty = (status = 204) => new Response(null, { status });

test("cleanup pages dependencies and resumes bounded orphan cleanup without skipping", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnvironment = {
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET,
    GOOGLE_OAUTH_ACCESS_TOKEN: process.env.GOOGLE_OAUTH_ACCESS_TOKEN,
    CLEANUP_MAX_DELETIONS: process.env.CLEANUP_MAX_DELETIONS,
    CLEANUP_MAX_RUNTIME_SECONDS: process.env.CLEANUP_MAX_RUNTIME_SECONDS,
  };
  const originalLog = console.log;
  const originalWarn = console.warn;
  process.env.FIREBASE_PROJECT_ID = "virtualartplattform";
  process.env.FIREBASE_STORAGE_BUCKET = "virtualartplattform.firebasestorage.app";
  process.env.GOOGLE_OAUTH_ACCESS_TOKEN = "fake-short-lived-test-token";
  process.env.CLEANUP_MAX_DELETIONS = "100";
  process.env.CLEANUP_MAX_RUNTIME_SECONDS = "60";
  console.log = () => undefined;
  console.warn = () => undefined;

  let galleryExists = true;
  let galleryPermitExists = true;
  let orphanPermitExists = true;
  let orphanRevisionPermitExists = true;
  let liveRevisionPermitExists = true;
  let retirementExists = true;
  let expiredTokenExists = true;
  const members = new Set(Array.from({ length: 205 }, (_, index) => `member-${index}`));
  const invites = new Set(Array.from({ length: 205 }, (_, index) => `invite-${index}`));
  const orphanObjects = new Set(Array.from({ length: 205 }, (_, index) => `published/owner-b/orphan-space/object-${index}`));
  const orphanRevisionObjects = new Set(Array.from(
    { length: 7 },
    (_, index) => `published/owner-c/revision-orphan/revisions/rev-a/object-${index}`,
  ));
  const retiredObjects = new Set([
    "published/owner-d/current-gallery/revisions/old/cover.webp",
    "published/owner-d/current-gallery/revisions/old/artworks/1.webp",
  ]);

  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/documents:runQuery")) {
      const query = JSON.parse(String(options.body)).structuredQuery;
      const collection = query.from[0].collectionId;
      const field = query.where?.fieldFilter?.field?.fieldPath;
      const limit = Number(query.limit ?? 100);
      if (
        (collection === "galleries" && field === "expiresAt")
        || (["galleryPublishPermits", "galleryRevisionPermits"].includes(collection)
          && field === "permitExpiresAt")
      ) {
        const cutoff = Date.parse(query.where.fieldFilter.value.timestampValue);
        assert.ok(cutoff <= Date.now() - 4 * 60_000, "destructive query must wait beyond active leases");
      }
      if (collection === "galleries") {
        if (!galleryExists || field === "purgeAt") return json([]);
        return json([{ document: firestoreDocument("galleries/live-space", {
          ownerId: stringField("owner-a"), lifecycleStatus: stringField("active"),
          expiresAt: timestampField(),
        }) }]);
      }
      if (collection === "galleryInvites" && field === "galleryId")
        return json([...invites].slice(0, limit).map((id) => ({ document: firestoreDocument(`galleryInvites/${id}`) })));
      if (collection === "galleryInvites") return json([]);
      if (collection === "galleryPublishPermits")
        return json(orphanPermitExists ? [{ document: firestoreDocument("galleryPublishPermits/orphan-space", {
          ownerId: stringField("owner-b"), galleryId: stringField("orphan-space"),
          permitExpiresAt: timestampField(), status: stringField("pending"),
        }) }] : []);
      if (collection === "galleryRevisionPermits" && field === "galleryId")
        return json(liveRevisionPermitExists ? [{ document: firestoreDocument("galleryRevisionPermits/live-space_rev-a", {
          ownerId: stringField("owner-a"), galleryId: stringField("live-space"), revisionId: stringField("rev-a"),
          permitExpiresAt: timestampField(), status: stringField("pending"),
        }) }] : []);
      if (collection === "galleryRevisionPermits")
        return json(orphanRevisionPermitExists ? [{ document: firestoreDocument("galleryRevisionPermits/revision-orphan_rev-a", {
          ownerId: stringField("owner-c"), galleryId: stringField("revision-orphan"), revisionId: stringField("rev-a"),
          permitExpiresAt: timestampField(), status: stringField("pending"),
        }) }] : []);
      if (collection === "galleryAssetRetirements") {
        assert.equal(query.where?.fieldFilter?.field?.fieldPath, "status");
        assert.equal(query.where?.fieldFilter?.op, "IN");
        assert.deepEqual(
          query.where?.fieldFilter?.value?.arrayValue?.values?.map((value) => value.stringValue),
          ["pending", "cleanup"],
        );
        return json(retirementExists ? [{ document: firestoreDocument("galleryAssetRetirements/current-gallery_old", {
          ownerId: stringField("owner-d"), galleryId: stringField("current-gallery"),
          paths: stringArrayField([...retiredObjects]), status: stringField("pending"),
        }) }] : []);
      }
      if (collection === "newsletterUnsubscribeTokens")
        return json(expiredTokenExists ? [{ document: firestoreDocument("newsletterUnsubscribeTokens/expired-token") }] : []);
      return json([]);
    }

    if (url.hostname === "firestore.googleapis.com" && options.method === "PATCH") {
      const path = url.pathname.split("/documents/")[1];
      const fields = JSON.parse(String(options.body)).fields;
      if (path === "galleries/live-space" && galleryExists)
        return json(firestoreDocument(path, {
          ownerId: stringField("owner-a"), expiresAt: timestampField(), ...fields,
        }, "2026-09-01T00:00:01.000Z"));
      if (path === "galleryAssetRetirements/current-gallery_old" && retirementExists)
        return json(firestoreDocument(path, {
          ownerId: stringField("owner-d"), galleryId: stringField("current-gallery"),
          paths: stringArrayField([...retiredObjects]), ...fields,
        }, "2026-09-01T00:00:01.000Z"));
      if (path === "galleryPublishPermits/orphan-space" && orphanPermitExists)
        return json(firestoreDocument(path, {
          ownerId: stringField("owner-b"), galleryId: stringField("orphan-space"),
          permitExpiresAt: timestampField(), ...fields,
        }, "2026-09-01T00:00:01.000Z"));
      if (path === "galleryRevisionPermits/live-space_rev-a" && liveRevisionPermitExists)
        return json(firestoreDocument(path, {
          ownerId: stringField("owner-a"), galleryId: stringField("live-space"), revisionId: stringField("rev-a"),
          permitExpiresAt: timestampField(), ...fields,
        }, "2026-09-01T00:00:01.000Z"));
      if (path === "galleryRevisionPermits/revision-orphan_rev-a" && orphanRevisionPermitExists)
        return json(firestoreDocument(path, {
          ownerId: stringField("owner-c"), galleryId: stringField("revision-orphan"), revisionId: stringField("rev-a"),
          permitExpiresAt: timestampField(), ...fields,
        }, "2026-09-01T00:00:01.000Z"));
      return empty(412);
    }

    if (url.hostname === "firestore.googleapis.com" && options.method === "DELETE") {
      const path = url.pathname.split("/documents/")[1];
      if (
        path?.startsWith("galleryInvites/")
        || path?.startsWith("galleries/live-space/members/")
        || path === "newsletterUnsubscribeTokens/expired-token"
      ) {
        assert.equal(
          url.searchParams.get("currentDocument.updateTime"),
          "2026-09-01T00:00:00.000Z",
          "query-driven deletes must reject a concurrently renewed document",
        );
      }
      if (path === "galleries/live-space") galleryExists = false;
      else if (path === "galleryPublishPermits/live-space") galleryPermitExists = false;
      else if (path === "galleryPublishPermits/orphan-space") orphanPermitExists = false;
      else if (path === "galleryRevisionPermits/live-space_rev-a") liveRevisionPermitExists = false;
      else if (path === "galleryRevisionPermits/revision-orphan_rev-a") orphanRevisionPermitExists = false;
      else if (path === "galleryAssetRetirements/current-gallery_old") retirementExists = false;
      else if (path === "newsletterUnsubscribeTokens/expired-token") expiredTokenExists = false;
      else if (path?.startsWith("galleryInvites/")) invites.delete(path.split("/").at(-1));
      else if (path?.startsWith("galleries/live-space/members/")) members.delete(path.split("/").at(-1));
      return empty();
    }

    if (url.hostname === "firestore.googleapis.com" && url.pathname.endsWith("/galleryPublishPermits/orphan-space"))
      return orphanPermitExists ? json(firestoreDocument("galleryPublishPermits/orphan-space", {
        ownerId: stringField("owner-b"), galleryId: stringField("orphan-space"),
        permitExpiresAt: timestampField(), status: stringField("pending"),
      })) : empty(404);
    if (url.hostname === "firestore.googleapis.com" && url.pathname.endsWith("/galleryAssetRetirements/current-gallery_old"))
      return retirementExists ? json(firestoreDocument("galleryAssetRetirements/current-gallery_old", {
        ownerId: stringField("owner-d"), galleryId: stringField("current-gallery"),
        paths: stringArrayField([...retiredObjects]), status: stringField("pending"),
      })) : empty(404);
    if (url.hostname === "firestore.googleapis.com" && url.pathname.endsWith("/galleryRevisionPermits/live-space_rev-a"))
      return liveRevisionPermitExists ? json(firestoreDocument("galleryRevisionPermits/live-space_rev-a", {
        ownerId: stringField("owner-a"), galleryId: stringField("live-space"), revisionId: stringField("rev-a"),
        permitExpiresAt: timestampField(), status: stringField("pending"),
      })) : empty(404);
    if (url.hostname === "firestore.googleapis.com" && url.pathname.endsWith("/galleryRevisionPermits/revision-orphan_rev-a"))
      return orphanRevisionPermitExists ? json(firestoreDocument("galleryRevisionPermits/revision-orphan_rev-a", {
        ownerId: stringField("owner-c"), galleryId: stringField("revision-orphan"), revisionId: stringField("rev-a"),
        permitExpiresAt: timestampField(), status: stringField("pending"),
      })) : empty(404);
    if (url.hostname === "firestore.googleapis.com" && url.pathname.endsWith("/galleries/live-space"))
      return galleryExists ? json(firestoreDocument("galleries/live-space", {
        ownerId: stringField("owner-a"), lifecycleStatus: stringField("active"), expiresAt: timestampField(),
      })) : empty(404);
    if (url.hostname === "firestore.googleapis.com" && url.pathname.endsWith("/galleries/current-gallery"))
      return json(firestoreDocument("galleries/current-gallery", {
        ownerId: stringField("owner-d"),
        coverPath: stringField("published/owner-d/current-gallery/revisions/current/cover.webp"),
      }));
    if (url.hostname === "firestore.googleapis.com" && url.pathname.endsWith("/galleries/orphan-space"))
      return empty(404);
    if (url.hostname === "firestore.googleapis.com" && url.pathname.endsWith("/galleries/revision-orphan"))
      return empty(404);
    if (url.hostname === "firestore.googleapis.com" && url.pathname.includes("/galleries/live-space/members")) {
      const limit = Number(url.searchParams.get("pageSize") ?? 100);
      return json({ documents: [...members].slice(0, limit).map((id) => firestoreDocument(`galleries/live-space/members/${id}`)) });
    }

    if (url.hostname === "storage.googleapis.com" && options.method === "DELETE") {
      const encoded = url.pathname.split("/o/")[1];
      orphanObjects.delete(decodeURIComponent(encoded));
      orphanRevisionObjects.delete(decodeURIComponent(encoded));
      retiredObjects.delete(decodeURIComponent(encoded));
      return empty();
    }
    if (url.hostname === "storage.googleapis.com" && url.pathname.endsWith("/o")) {
      const prefix = url.searchParams.get("prefix") ?? "";
      const limit = Number(url.searchParams.get("maxResults") ?? 100);
      const names = prefix.includes("revision-orphan")
        ? [...orphanRevisionObjects].slice(0, limit)
        : prefix.includes("orphan-space") ? [...orphanObjects].slice(0, limit) : [];
      return json({ items: names.map((name) => ({ name })) });
    }
    throw new Error(`Unexpected fake cleanup request: ${options.method ?? "GET"} ${url}`);
  };

  try {
    await import(`./cleanup-expired.mjs?bounded-first=${Date.now()}`);
    assert.equal(galleryExists, true, "the gallery root must survive an interrupted dependency page");
    for (let attempt = 0; attempt < 12 && (
      galleryExists
      || orphanPermitExists
      || orphanRevisionPermitExists
      || liveRevisionPermitExists
      || retirementExists
      || expiredTokenExists
    ); attempt += 1)
      await import(`./cleanup-expired.mjs?bounded-retry=${Date.now()}-${attempt}`);
    assert.equal(galleryExists, false);
    assert.equal(galleryPermitExists, false);
    assert.equal(orphanPermitExists, false);
    assert.equal(orphanRevisionPermitExists, false);
    assert.equal(liveRevisionPermitExists, false);
    assert.equal(retirementExists, false);
    assert.equal(expiredTokenExists, false);
    assert.equal(members.size, 0);
    assert.equal(invites.size, 0);
    assert.equal(orphanObjects.size, 0);
    assert.equal(orphanRevisionObjects.size, 0);
    assert.equal(retiredObjects.size, 0);
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    console.warn = originalWarn;
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
