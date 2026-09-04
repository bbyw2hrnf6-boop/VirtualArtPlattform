import assert from "node:assert/strict";
import test from "node:test";

import {
  storagePolicyMetadataUpdate,
  storagePolicyPageAfter,
  validateStoragePolicyObjectName,
} from "./storage-policy-migration-lib.mjs";

test("scrubs live, orphan, and unknown published object metadata alike", () => {
  for (const name of [
    "published/owner/live/cover.webp",
    "published/owner/deleted/revisions/r2/artworks/1.webp",
    "published/orphan/unknown/private.bin",
  ]) {
    const [file] = storagePolicyPageAfter([{ name }], undefined);
    assert.equal(file.name, name);
    assert.deepEqual(storagePolicyMetadataUpdate({
      cacheControl: "public,max-age=3600",
      metageneration: "7",
      metadata: { ownerId: "owner", uploaderId: "editor-account", firebaseStorageDownloadTokens: "known-token" },
    }), {
      required: true,
      metageneration: 7,
      patch: {
        cacheControl: "private,no-store",
        metadata: { ownerId: "owner", uploaderId: null, firebaseStorageDownloadTokens: null },
      },
    });
  }
});

test("resumes an inclusive page without skipping or repeating destructive work", () => {
  const files = Array.from({ length: 205 }, (_, index) => ({
    name: `published/owner/space/object-${String(index).padStart(3, "0")}`,
  }));
  const first = storagePolicyPageAfter(files.slice(0, 101), undefined).slice(0, 100);
  const second = storagePolicyPageAfter(files.slice(99, 200), first.at(-1).name).slice(0, 100);
  const third = storagePolicyPageAfter(files.slice(199), second.at(-1).name);
  assert.equal(new Set([...first, ...second, ...third].map((file) => file.name)).size, 205);
  assert.equal(third.at(-1).name, files.at(-1).name);
});

test("is idempotent after a metadata write succeeded before its checkpoint", () => {
  assert.deepEqual(storagePolicyMetadataUpdate({
    cacheControl: "private,no-store",
    metageneration: "8",
    metadata: { ownerId: "owner", uploaderId: null },
  }), { required: false });
  assert.throws(
    () => storagePolicyPageAfter([
      { name: "published/owner/z" },
      { name: "published/owner/a" },
    ], undefined),
    /page-invalid/,
  );
  assert.throws(
    () => validateStoragePolicyObjectName("published/owner/unsafe\nname"),
    /object-name-invalid/,
  );
});
