import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { after, test } from "node:test";

import {
  createPolicyArtifact,
  validateIndexContract,
  verifyPolicyArtifact,
} from "./wp3-policy-artifact.mjs";

const temporaryRoots = [];
after(async () => {
  await Promise.all(temporaryRoots.map((path) => rm(path, { force: true, recursive: true })));
});

const options = async () => {
  const outputRoot = await mkdtemp(resolve(tmpdir(), "lieuva-policy-artifact-"));
  temporaryRoots.push(outputRoot);
  return {
    commitSha: "a".repeat(40),
    outputRoot,
    sourceRoot: resolve("."),
    verifyRunId: "123456789",
  };
};

test("creates and verifies one bounded policy-only artifact", async () => {
  const input = await options();
  const created = await createPolicyArtifact(input);
  const verified = await verifyPolicyArtifact(input);

  assert.equal(created.schema, "lieuva-policy-release/v1");
  assert.equal(verified.manifest.commitSha, input.commitSha);
  assert.deepEqual(
    verified.manifest.files.map((entry) => entry.path),
    [
      "firebase-cli/package-lock.json",
      "firebase-cli/package.json",
      "firebase.json",
      "firestore.indexes.json",
      "firestore.rules",
      "storage.rules",
    ],
  );
  assert.match(verified.manifestSha256, /^[0-9a-f]{64}$/);
  const firebaseConfig = JSON.parse(
    await readFile(resolve(input.outputRoot, "firebase.json"), "utf8"),
  );
  assert.deepEqual(Object.keys(firebaseConfig).sort(), ["firestore", "storage"]);
});

test("fails closed when a policy byte changes after assembly", async () => {
  const input = await options();
  await createPolicyArtifact(input);
  await writeFile(resolve(input.outputRoot, "storage.rules"), "rules_version = '2';\n");

  await assert.rejects(
    verifyPolicyArtifact(input),
    /files do not match the manifest/,
  );
});

test("binds verification to the successful Verify revision", async () => {
  const input = await options();
  await createPolicyArtifact(input);

  await assert.rejects(
    verifyPolicyArtifact({ ...input, commitSha: "b".repeat(40) }),
    /commitSha mismatch/,
  );
});

test("accepts explicit Firestore TTL field overrides and rejects ambiguous TTL values", () => {
  assert.doesNotThrow(() => validateIndexContract({
    indexes: [],
    fieldOverrides: [{
      collectionGroup: "accountExportChunks",
      fieldPath: "expiresAt",
      ttl: true,
      indexes: [],
    }],
  }));
  assert.throws(() => validateIndexContract({
    indexes: [],
    fieldOverrides: [{
      collectionGroup: "accountExportChunks",
      fieldPath: "expiresAt",
      ttl: false,
      indexes: [],
    }],
  }), /TTL/);
});

test("requires the privileged promotion proof to fetch and verify TTL state", async () => {
  const workflow = await readFile(resolve(".github/workflows/policy-deploy.yml"), "utf8");
  assert.match(workflow, /indexConfig\.usesAncestorConfig=false OR ttlConfig:\*/);
  assert.match(workflow, /field\.ttl === true/);
  assert.match(workflow, /current\?\.ttlConfig\?\.state/);
  assert.match(workflow, /currentTtlState !== "ACTIVE"/);
});

test("fails promotion when production has undeclared field overrides or TTL policies", async () => {
  const workflow = await readFile(resolve(".github/workflows/policy-deploy.yml"), "utf8");
  assert.match(workflow, /const desiredFieldKeys = new Set/);
  assert.match(workflow, /const unexpectedFieldOverrides = \[\.\.\.fieldsByName\.keys\(\)\]/);
  assert.match(workflow, /!desiredFieldKeys\.has\(key\)/);
  assert.match(workflow, /beforeIndexStatus\.unexpectedFieldOverrides\.length/);
  assert.match(workflow, /readyStatus\.unexpectedFieldOverrides\.length/);
  assert.match(workflow, /afterIndexStatus\.unexpectedFieldOverrides\.length/);
  assert.match(workflow, /Undeclared field overrides\/TTL policies/);
});
