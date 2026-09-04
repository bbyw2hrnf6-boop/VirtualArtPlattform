import test from "node:test";
import assert from "node:assert/strict";
import {
  LIFECYCLE_DESTRUCTIVE_SETTLE_DELAY_MS,
  LifecycleWorkBudget,
  boundedPositiveInteger,
  drainDestructivePages,
  galleryCleanupDecision,
  galleryPermitCleanupDecision,
  withConcurrency,
} from "./lib/lifecycle-batches.mjs";

test("destructive expiry waits beyond trusted upload and inspection leases", () => {
  assert.equal(LIFECYCLE_DESTRUCTIVE_SETTLE_DELAY_MS, 5 * 60_000);
  assert.ok(LIFECYCLE_DESTRUCTIVE_SETTLE_DELAY_MS > 4 * 60_000);
});

test("lifecycle numeric controls are explicit and bounded", () => {
  assert.equal(boundedPositiveInteger(undefined, { label: "limit", fallback: 10, maximum: 20 }), 10);
  assert.equal(boundedPositiveInteger("20", { label: "limit", fallback: 10, maximum: 20 }), 20);
  assert.throws(() => boundedPositiveInteger("20.5", { label: "limit", fallback: 10, maximum: 20 }), /whole number/);
  assert.throws(() => boundedPositiveInteger("21", { label: "limit", fallback: 10, maximum: 20 }), /between/);
});

test("destructive pagination refetches page one and resumes after a bounded run", async () => {
  const remaining = Array.from({ length: 11 }, (_, index) => index + 1);
  const firstBudget = new LifecycleWorkBudget({ maximumItems: 7, deadline: Date.now() + 60_000 });
  const fetchPage = async (size) => remaining.slice(0, size);
  const remove = async (value) => remaining.splice(remaining.indexOf(value), 1);
  const first = await drainDestructivePages({ fetchPage, deleteItem: remove, budget: firstBudget, pageSize: 3, concurrency: 2 });
  assert.deepEqual(first, { deleted: 7, complete: false });
  assert.deepEqual(remaining, [8, 9, 10, 11]);

  const retry = await drainDestructivePages({
    fetchPage,
    deleteItem: remove,
    budget: new LifecycleWorkBudget({ maximumItems: 10, deadline: Date.now() + 60_000 }),
    pageSize: 3,
    concurrency: 2,
  });
  assert.deepEqual(retry, { deleted: 4, complete: true });
  assert.deepEqual(remaining, []);
});

test("concurrency helper visits each item exactly once", async () => {
  const seen = [];
  const results = await withConcurrency(["a", "b", "c", "d"], 3, async (value) => {
    seen.push(value);
    return value.toUpperCase();
  });
  assert.deepEqual(seen.sort(), ["a", "b", "c", "d"]);
  assert.deepEqual(results, ["A", "B", "C", "D"]);
});

test("conditional-delete conflicts are safe skips and not successful audit counts", async () => {
  const remaining = ["renewed", "expired"];
  const result = await drainDestructivePages({
    fetchPage: async () => remaining.splice(0),
    deleteItem: async (value) => value === "renewed" ? false : true,
    budget: new LifecycleWorkBudget({ maximumItems: 2, deadline: Date.now() + 60_000 }),
    pageSize: 2,
    concurrency: 2,
  });
  assert.deepEqual(result, { deleted: 1, complete: false });
});

test("expiry cleanup never shortens Trash recovery and resumes only its own claim", () => {
  const cutoffMs = Date.parse("2026-09-03T12:00:00.000Z");
  const futurePurge = cutoffMs + 6 * 86_400_000;
  assert.deepEqual(galleryCleanupDecision({
    fieldPath: "expiresAt",
    lifecycleStatus: "trashed",
    expiresAtMs: cutoffMs - 1,
    purgeAtMs: futurePurge,
    cutoffMs,
  }), { action: "defer-expiry", expiresAtMs: futurePurge });
  assert.deepEqual(galleryCleanupDecision({
    fieldPath: "purgeAt",
    lifecycleStatus: "active",
    expiresAtMs: cutoffMs + 1,
    purgeAtMs: cutoffMs - 1,
    cutoffMs,
  }), { action: "clear-stale-purge" });
  assert.deepEqual(galleryCleanupDecision({
    fieldPath: "expiresAt",
    lifecycleStatus: "purging",
    cleanupReason: "expiresAt",
    expiresAtMs: cutoffMs - 1,
    purgeAtMs: Number.NaN,
    cutoffMs,
  }), { action: "resume", reason: "expiresAt" });
  assert.deepEqual(galleryCleanupDecision({
    fieldPath: "expiresAt",
    lifecycleStatus: "purging",
    cleanupReason: "purgeAt",
    expiresAtMs: cutoffMs - 1,
    purgeAtMs: cutoffMs - 1,
    cutoffMs,
  }), { action: "resume", reason: "purgeAt" });
});

test("permit cleanup waits until a server asset upload lease is safely over", () => {
  const cutoffMs = Date.parse("2026-09-03T12:00:00.000Z");
  assert.deepEqual(galleryPermitCleanupDecision({
    permitExpiresAtMs: cutoffMs - 1,
    assetUploadLeaseUntilMs: cutoffMs + 90_000,
    cutoffMs,
  }), { action: "postpone", permitExpiresAtMs: cutoffMs + 150_000 });
  assert.deepEqual(galleryPermitCleanupDecision({
    permitExpiresAtMs: cutoffMs - 1,
    assetUploadLeaseUntilMs: cutoffMs - 1,
    cutoffMs,
  }), { action: "claim" });
});
