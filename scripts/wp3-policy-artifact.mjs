import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  EXPECTED_FIREBASE_CLI_VERSION,
  EXPECTED_NODE_VERSION,
  EXPECTED_NPM_VERSION,
  validateFirebaseCliLock,
} from "../firebase-cli/validate-lock.mjs";

export const POLICY_ARTIFACT_DIRECTORY = "artifacts/wp3-policy";
export const POLICY_MANIFEST_FILE = "lieuva-policy-manifest.json";
export const POLICY_PROJECT_ID = "virtualartplattform";
export const POLICY_STORAGE_BUCKET = "virtualartplattform.firebasestorage.app";
export const POLICY_SCHEMA = "lieuva-policy-release/v1";

const RELEASE_FILES = [
  "firebase-cli/package-lock.json",
  "firebase-cli/package.json",
  "firebase.json",
  "firestore.indexes.json",
  "firestore.rules",
  "storage.rules",
];

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const stableFirebaseConfig = () => `${JSON.stringify({
  firestore: {
    indexes: "firestore.indexes.json",
    rules: "firestore.rules",
  },
  storage: { rules: "storage.rules" },
}, null, 2)}\n`;

const isObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const assertString = (value, label, pattern, maximum = 256) => {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > maximum
    || (pattern && !pattern.test(value))
  ) throw new Error(`Invalid policy release ${label}.`);
};

const assertExactKeys = (value, expected, label) => {
  if (
    !isObject(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())
  ) throw new Error(`Invalid policy release ${label} keys.`);
};

const validateRuleSource = (source, service) => {
  if (
    typeof source !== "string"
    || source.length < 100
    || source.length > 256 * 1024
    || !source.startsWith("rules_version = '2';")
    || !source.includes(service)
  ) throw new Error(`Invalid ${service} rules source.`);
};

const validateIndexField = (field) => {
  assertExactKeys(
    field,
    ["fieldPath", field?.order ? "order" : "arrayConfig"],
    "index field",
  );
  assertString(field.fieldPath, "index field path", /^[-A-Za-z0-9_.]{1,256}$/);
  const modes = [field.order, field.arrayConfig].filter(Boolean);
  if (
    modes.length !== 1
    || (field.order && !["ASCENDING", "DESCENDING"].includes(field.order))
    || (field.arrayConfig && field.arrayConfig !== "CONTAINS")
  ) throw new Error("Invalid policy release index field mode.");
};

export const validateIndexContract = (specification) => {
  assertExactKeys(specification, ["fieldOverrides", "indexes"], "index specification");
  if (
    !Array.isArray(specification.indexes)
    || !Array.isArray(specification.fieldOverrides)
    || specification.indexes.length > 200
    || specification.fieldOverrides.length > 200
  ) throw new Error("Invalid policy release index collections.");

  for (const index of specification.indexes) {
    assertExactKeys(index, ["collectionGroup", "fields", "queryScope"], "composite index");
    assertString(index.collectionGroup, "collection group", /^[-A-Za-z0-9_]{1,128}$/);
    if (index.queryScope !== "COLLECTION" || !Array.isArray(index.fields))
      throw new Error("Invalid policy release composite-index scope.");
    if (index.fields.length < 2 || index.fields.length > 10)
      throw new Error("Invalid policy release composite-index field count.");
    index.fields.forEach(validateIndexField);
  }

  for (const override of specification.fieldOverrides) {
    assertExactKeys(
      override,
      ["collectionGroup", "fieldPath", "indexes", ...(override?.ttl === undefined ? [] : ["ttl"])],
      "field override",
    );
    assertString(override.collectionGroup, "override collection group", /^[-A-Za-z0-9_]{1,128}$/);
    assertString(override.fieldPath, "override field path", /^[-A-Za-z0-9_.]{1,256}$/);
    if (override.ttl !== undefined && override.ttl !== true)
      throw new Error("Invalid policy release field-override TTL.");
    if (!Array.isArray(override.indexes) || override.indexes.length > 6)
      throw new Error("Invalid policy release field-override indexes.");
    for (const index of override.indexes) {
      assertExactKeys(
        index,
        [index?.order ? "order" : "arrayConfig", "queryScope"],
        "field-override index",
      );
      if (index.queryScope !== "COLLECTION_GROUP")
        throw new Error("Invalid policy release field-override scope.");
      validateIndexField({
        fieldPath: override.fieldPath,
        ...(index.order ? { order: index.order } : { arrayConfig: index.arrayConfig }),
      });
    }
  }
  return specification;
};

const readJson = async (path, label) => {
  try {
    const value = JSON.parse(await readFile(path, "utf8"));
    if (!isObject(value)) throw new Error("not an object");
    return value;
  } catch {
    throw new Error(`Invalid or missing ${label}.`);
  }
};

const collectFiles = async (root) => {
  const entries = [];
  const walk = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      const stat = await lstat(path);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile()))
        throw new Error("Policy release contains a link or special file.");
      if (stat.isDirectory()) await walk(path);
      else {
        const name = relative(root, path).split(sep).join("/");
        if (!/^[-A-Za-z0-9._/+]+$/.test(name))
          throw new Error(`Policy release contains an unsafe path: ${name}.`);
        entries.push({
          path: name,
          sha256: sha256(await readFile(path)),
          size: stat.size,
        });
      }
    }
  };
  await walk(root);
  return entries.sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
};

const validateInputs = ({
  commitSha,
  firebaseCliVersion,
  nodeVersion,
  npmVersion,
  projectId,
  storageBucket,
  verifyRunId,
}) => {
  assertString(commitSha, "commit SHA", /^[0-9a-f]{40}$/, 40);
  assertString(verifyRunId, "Verify run ID", /^[1-9][0-9]*$/, 20);
  if (
    nodeVersion !== EXPECTED_NODE_VERSION
    || npmVersion !== EXPECTED_NPM_VERSION
    || firebaseCliVersion !== EXPECTED_FIREBASE_CLI_VERSION
    || projectId !== POLICY_PROJECT_ID
    || storageBucket !== POLICY_STORAGE_BUCKET
  ) throw new Error("Policy release toolchain or production target mismatch.");
};

const validateArtifactContents = async (root, expected) => {
  const firebaseConfig = await readJson(resolve(root, "firebase.json"), "release firebase.json");
  if (JSON.stringify(firebaseConfig) !== JSON.stringify(JSON.parse(stableFirebaseConfig())))
    throw new Error("Policy release Firebase config contains unexpected targets or hooks.");

  const indexes = await readJson(
    resolve(root, "firestore.indexes.json"),
    "Firestore indexes",
  );
  validateIndexContract(indexes);
  validateRuleSource(
    await readFile(resolve(root, "firestore.rules"), "utf8"),
    "service cloud.firestore",
  );
  validateRuleSource(
    await readFile(resolve(root, "storage.rules"), "utf8"),
    "service firebase.storage",
  );

  const [cliPackage, cliLock] = await Promise.all([
    readJson(resolve(root, "firebase-cli/package.json"), "Firebase CLI package"),
    readJson(resolve(root, "firebase-cli/package-lock.json"), "Firebase CLI lock"),
  ]);
  const cli = validateFirebaseCliLock(cliPackage, cliLock);
  if (cli.firebaseCliVersion !== expected.firebaseCliVersion)
    throw new Error("Policy release Firebase CLI version mismatch.");
};

export const createPolicyArtifact = async ({
  commitSha,
  firebaseCliVersion = EXPECTED_FIREBASE_CLI_VERSION,
  nodeVersion = EXPECTED_NODE_VERSION,
  npmVersion = EXPECTED_NPM_VERSION,
  outputRoot = resolve(POLICY_ARTIFACT_DIRECTORY),
  projectId = POLICY_PROJECT_ID,
  sourceRoot = resolve("."),
  storageBucket = POLICY_STORAGE_BUCKET,
  verifyRunId,
}) => {
  const inputs = {
    commitSha,
    firebaseCliVersion,
    nodeVersion,
    npmVersion,
    projectId,
    storageBucket,
    verifyRunId,
  };
  validateInputs(inputs);
  const source = resolve(sourceRoot);
  const output = resolve(outputRoot);
  await rm(output, { force: true, recursive: true });
  await mkdir(output, { recursive: true });

  for (const name of RELEASE_FILES.filter((file) => file !== "firebase.json")) {
    const bytes = await readFile(resolve(source, name));
    await mkdir(dirname(resolve(output, name)), { recursive: true });
    await writeFile(resolve(output, name), bytes, { flag: "wx" });
  }
  await writeFile(resolve(output, "firebase.json"), stableFirebaseConfig(), { flag: "wx" });
  await validateArtifactContents(output, inputs);

  const files = await collectFiles(output);
  if (
    JSON.stringify(files.map((entry) => entry.path)) !== JSON.stringify(RELEASE_FILES)
    || files.reduce((total, entry) => total + entry.size, 0) > 4 * 1024 * 1024
  ) throw new Error("Policy release file set is invalid or over its size bound.");

  const manifest = {
    commitSha,
    files,
    firebaseCliVersion,
    nodeVersion,
    npmVersion,
    projectId,
    schema: POLICY_SCHEMA,
    storageBucket,
    verifyRunId,
  };
  await writeFile(
    resolve(output, POLICY_MANIFEST_FILE),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { flag: "wx" },
  );
  return manifest;
};

export const verifyPolicyArtifact = async ({
  commitSha,
  firebaseCliVersion = EXPECTED_FIREBASE_CLI_VERSION,
  nodeVersion = EXPECTED_NODE_VERSION,
  npmVersion = EXPECTED_NPM_VERSION,
  outputRoot = resolve(POLICY_ARTIFACT_DIRECTORY),
  projectId = POLICY_PROJECT_ID,
  storageBucket = POLICY_STORAGE_BUCKET,
  verifyRunId,
}) => {
  const expected = {
    commitSha,
    firebaseCliVersion,
    nodeVersion,
    npmVersion,
    projectId,
    storageBucket,
    verifyRunId,
  };
  validateInputs(expected);
  const root = resolve(outputRoot);
  const manifest = await readJson(
    resolve(root, POLICY_MANIFEST_FILE),
    "policy release manifest",
  );
  assertExactKeys(
    manifest,
    [
      "commitSha",
      "files",
      "firebaseCliVersion",
      "nodeVersion",
      "npmVersion",
      "projectId",
      "schema",
      "storageBucket",
      "verifyRunId",
    ],
    "manifest",
  );
  for (const key of [
    "commitSha",
    "firebaseCliVersion",
    "nodeVersion",
    "npmVersion",
    "projectId",
    "storageBucket",
    "verifyRunId",
  ]) {
    if (manifest[key] !== expected[key])
      throw new Error(`Policy release manifest ${key} mismatch.`);
  }
  if (manifest.schema !== POLICY_SCHEMA)
    throw new Error("Policy release manifest identity is invalid.");

  const allFiles = await collectFiles(root);
  const manifestEntry = allFiles.find((entry) => entry.path === POLICY_MANIFEST_FILE);
  const files = allFiles.filter((entry) => entry.path !== POLICY_MANIFEST_FILE);
  if (
    !manifestEntry
    || allFiles.length !== RELEASE_FILES.length + 1
    || JSON.stringify(files.map((entry) => entry.path)) !== JSON.stringify(RELEASE_FILES)
    || JSON.stringify(files) !== JSON.stringify(manifest.files)
    || files.reduce((total, entry) => total + entry.size, 0) > 4 * 1024 * 1024
  ) throw new Error("Policy release files do not match the manifest.");

  await validateArtifactContents(root, expected);
  return { manifest, manifestSha256: manifestEntry.sha256 };
};

const parseArguments = (arguments_) => {
  const [command, ...rest] = arguments_;
  if (!["create", "verify"].includes(command))
    throw new Error("Usage: wp3-policy-artifact.mjs <create|verify> [options]");
  const values = { command };
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (!key?.startsWith("--") || value === undefined)
      throw new Error("Every policy artifact option requires one value.");
    const name = key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (Object.hasOwn(values, name)) throw new Error(`Duplicate option ${key}.`);
    values[name] = value;
  }
  const allowed = new Set([
    "command",
    "commitSha",
    "firebaseCliVersion",
    "nodeVersion",
    "npmVersion",
    "outputRoot",
    "projectId",
    "sourceRoot",
    "storageBucket",
    "verifyRunId",
  ]);
  for (const key of Object.keys(values)) {
    if (!allowed.has(key)) throw new Error(`Unknown policy artifact option ${key}.`);
  }
  return values;
};

const currentScript = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentScript) {
  const { command, ...options } = parseArguments(process.argv.slice(2));
  const result = command === "create"
    ? await createPolicyArtifact(options)
    : await verifyPolicyArtifact(options);
  process.stdout.write(
    command === "create"
      ? `Created policy artifact for ${result.commitSha}.\n`
      : `Verified policy artifact ${result.manifestSha256}.\n`,
  );
}
