import assert from "node:assert/strict";
import test from "node:test";
import { releaseStamp } from "./lib/release-stamp.mjs";

test("release stamp projects only exact CI identity and labels local builds unknown", () => {
  const builtAt = "2026-09-11T12:00:00.000Z";
  assert.deepEqual(releaseStamp({ GITHUB_SHA: "a".repeat(40), SECRET: "private" }, builtAt), { schemaVersion: 1, commitSha: "a".repeat(40), builtAt });
  assert.equal(releaseStamp({}, builtAt).commitSha, null);
  assert.throws(() => releaseStamp({ GITHUB_SHA: "main" }, builtAt), /exact Git commit/);
  assert.throws(() => releaseStamp({}, "invalid"), /timestamp/);
});
