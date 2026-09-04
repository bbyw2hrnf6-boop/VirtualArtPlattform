import { createHash } from "node:crypto";
import {
  chmod,
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { validateFirebaseCliLock } from "../firebase-cli/validate-lock.mjs";
import { validateReleaseManifest } from "../functions/scripts/generate-manifest.mjs";
import {
  inspectProductionEnvironment,
  parseMailMode,
  parseFunctionSelection,
} from "./wp2-release-lib.mjs";

export const RELEASE_DIRECTORY = "artifacts/wp2-release";
export const RELEASE_MANIFEST = "lieuva-release-manifest.json";
export const RELEASE_SCHEMA_VERSION = 2;
export const RELEASE_CONFIG_KEYS = Object.freeze([
  "AURA_LEGAL_FOOTER",
  "AURA_PUBLIC_APP_URL",
  "AURA_REPLY_TO",
  "VITE_FIREBASE_APPCHECK_SITE_KEY",
  "VITE_TELEMETRY_ENVIRONMENT",
  "VITE_TELEMETRY_MODE",
]);

const FUNCTION_PARAMETER_KEYS = Object.freeze([
  "AURA_PUBLIC_APP_URL",
  "AURA_REPLY_TO",
  "AURA_LEGAL_FOOTER",
]);
const RELEASE_SCRIPT_FILES = Object.freeze([
  "wp2-production-smoke.mjs",
  "wp2-release-lib.mjs",
]);
const EXACT_RELEASE_FILES = new Set([
  ".firebaserc",
  "firebase-cli/package-lock.json",
  "firebase-cli/package.json",
  "firebase.json",
  "functions/.env.virtualartplattform",
  "functions/functions.yaml",
  "functions/generated/app-shell.html",
  "functions/package-lock.json",
  "functions/package.json",
  "package-lock.json",
  "package.json",
  ...RELEASE_SCRIPT_FILES.map((name) => `scripts/${name}`),
]);
const REQUIRED_RELEASE_FILES = new Set([
  ...EXACT_RELEASE_FILES,
  "dist/index.html",
  "functions/lib/index.js",
]);
const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT_SHA = /^[0-9a-f]{40}$/;
const VERSION = /^[0-9]+[.][0-9]+[.][0-9]+$/;
const PROJECT_ID = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const PORTABLE_PATH = /^[-A-Za-z0-9._@/+]+$/;
const MAXIMUM_FILES = 5_000;
const MAXIMUM_BYTES = 250 * 1024 * 1024;

function fail(message) {
  throw new Error(`Invalid LIEUVA release artifact: ${message}`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedRelativePath(root, path) {
  const value = relative(root, path).split(sep).join("/");
  if (
    !value ||
    value.startsWith("/") ||
    value.startsWith("../") ||
    value.includes("/../") ||
    !PORTABLE_PATH.test(value)
  )
    fail("a file path is not a portable relative path");
  return value;
}

function isAllowedReleaseFile(path) {
  if (EXACT_RELEASE_FILES.has(path)) return true;
  if (path.startsWith("dist/")) return true;
  return (
    path.startsWith("functions/lib/") &&
    path.endsWith(".js") &&
    !/[.](?:test|spec)[.]js$/i.test(path)
  );
}

async function bundleEntries(root) {
  const rootStat = await lstat(root);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory())
    fail("bundle root must be a real directory");
  const files = [];
  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      const stat = await lstat(path);
      if (stat.isSymbolicLink()) fail("symbolic links are not allowed");
      else if (stat.isDirectory()) await walk(path);
      else if (stat.isFile())
        files.push({ path, type: "file", size: stat.size });
      else fail("special files are not allowed");
    }
  }
  await walk(root);
  return files
    .map((file) => ({
      ...file,
      relativePath: normalizedRelativePath(root, file.path),
    }))
    .sort((left, right) =>
      left.relativePath < right.relativePath
        ? -1
        : left.relativePath > right.relativePath
          ? 1
          : 0,
    );
}

function checkedVersion(value, label) {
  if (typeof value !== "string" || !VERSION.test(value))
    fail(`${label} must be an exact semantic version`);
  return value;
}

function checkedCommitSha(value) {
  if (typeof value !== "string" || !COMMIT_SHA.test(value))
    fail("commit SHA must be 40 lowercase hexadecimal characters");
  return value;
}

function checkedProjectId(value) {
  if (typeof value !== "string" || !PROJECT_ID.test(value))
    fail("Firebase project ID is invalid");
  return value;
}

function checkedProductionOrigin(value) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    fail("production origin must be an absolute URL");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    fail("production origin must be a credential-free HTTPS origin");
  return url.origin;
}

function checkedMailMode(value) {
  try {
    return parseMailMode(value);
  } catch {
    fail("mail mode must be required or disabled");
  }
}

function assertProductionContract(
  environment,
  { firebaseProjectId, mailMode, productionOrigin, nodeVersion },
) {
  const result = inspectProductionEnvironment(environment, {
    functionSelection: parseFunctionSelection("all"),
    expectedProjectId: firebaseProjectId,
    expectedOrigin: productionOrigin,
    mailMode,
    nodeVersion,
  });
  if (!result.ok) {
    const issues = result.issues
      .map(({ field, code }) => `${field}:${code}`)
      .join(", ");
    fail(`production configuration is invalid (${issues})`);
  }
}

export function releaseConfigurationFingerprints(environment) {
  return Object.fromEntries(
    RELEASE_CONFIG_KEYS.map((key) => {
      const value = environment?.[key];
      if (typeof value !== "string" || !value.length)
        fail(`release configuration ${key} is missing`);
      return [key, `sha256:${sha256(value)}`];
    }),
  );
}

export function functionsEnvironmentContents(environment) {
  return `${FUNCTION_PARAMETER_KEYS.map((key) => {
    const value = environment?.[key];
    if (typeof value !== "string" || !value.length)
      fail(`Function parameter ${key} is missing`);
    return `${key}=${JSON.stringify(value)}`;
  }).join("\n")}\n`;
}

async function copyRequiredFile(sourceRoot, releaseRoot, path) {
  const source = resolve(sourceRoot, path);
  const destination = resolve(releaseRoot, path);
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, {
    errorOnExist: true,
    force: false,
    recursive: true,
    verbatimSymlinks: true,
  });
}

async function releaseFileEntries(releaseRoot) {
  const files = (await bundleEntries(releaseRoot)).filter(
    (file) => file.relativePath !== RELEASE_MANIFEST,
  );
  if (!files.length || files.length > MAXIMUM_FILES)
    fail("file count is outside its bound");
  const totalBytes = files.reduce((sum, file) => sum + (file.size ?? 0), 0);
  if (!Number.isSafeInteger(totalBytes) || totalBytes > MAXIMUM_BYTES)
    fail("bundle size exceeds its bound");
  for (const file of files) {
    if (!isAllowedReleaseFile(file.relativePath))
      fail(`unexpected file ${file.relativePath}`);
  }
  const paths = new Set(files.map((file) => file.relativePath));
  for (const required of REQUIRED_RELEASE_FILES) {
    if (!paths.has(required)) fail(`required file ${required} is missing`);
  }
  return Promise.all(
    files.map(async (file) => {
      return {
        path: file.relativePath,
        type: "file",
        size: file.size,
        sha256: sha256(await readFile(file.path)),
      };
    }),
  );
}

function assertExactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    fail(`${label} has unexpected fields`);
}

async function readJson(path, label) {
  let value;
  try {
    value = JSON.parse(await readFile(path, "utf8"));
  } catch {
    fail(`${label} is not valid JSON`);
  }
  return value;
}

function parseFunctionsEnvironment(contents) {
  const values = {};
  for (const line of contents.trimEnd().split("\n")) {
    const separator = line.indexOf("=");
    if (separator < 1) fail("Functions environment file is malformed");
    const key = line.slice(0, separator);
    if (Object.hasOwn(values, key))
      fail("Functions environment file contains duplicate keys");
    try {
      values[key] = JSON.parse(line.slice(separator + 1));
    } catch {
      fail("Functions environment file contains a malformed value");
    }
    if (typeof values[key] !== "string")
      fail("Functions environment values must be strings");
  }
  assertExactKeys(values, FUNCTION_PARAMETER_KEYS, "Functions environment");
  return values;
}

async function validateDeploymentConfiguration(
  releaseRoot,
  manifest,
  environment,
) {
  const firebase = await readJson(
    resolve(releaseRoot, "firebase.json"),
    "firebase.json",
  );
  assertExactKeys(firebase, ["functions", "hosting"], "firebase.json");
  if (
    firebase.functions?.source !== "functions" ||
    firebase.functions?.runtime !== "nodejs22"
  )
    fail("firebase.json Functions target is invalid");
  if (firebase.hosting?.public !== "dist")
    fail("firebase.json Hosting target is invalid");
  if (
    Object.hasOwn(firebase.functions, "predeploy") ||
    Object.hasOwn(firebase.hosting, "predeploy")
  )
    fail("release firebase.json must not execute predeploy hooks");

  const firebaseRc = await readJson(
    resolve(releaseRoot, ".firebaserc"),
    ".firebaserc",
  );
  if (firebaseRc?.projects?.default !== manifest.firebaseProjectId)
    fail(".firebaserc project does not match the manifest");
  const firebaseCliPackage = await readJson(
    resolve(releaseRoot, "firebase-cli/package.json"),
    "Firebase CLI package.json",
  );
  const firebaseCliLock = await readJson(
    resolve(releaseRoot, "firebase-cli/package-lock.json"),
    "Firebase CLI package-lock.json",
  );
  if (
    Object.hasOwn(firebaseCliPackage, "scripts") ||
    validateFirebaseCliLock(firebaseCliPackage, firebaseCliLock)
      .firebaseCliVersion !== manifest.firebaseCliVersion
  )
    fail("Firebase CLI lock inputs do not match the declared CLI version");
  const rootPackage = await readJson(
    resolve(releaseRoot, "package.json"),
    "root package.json",
  );
  const rootLock = await readJson(
    resolve(releaseRoot, "package-lock.json"),
    "root package-lock.json",
  );
  if (
    rootPackage?.private !== true ||
    rootPackage?.engines?.node !== manifest.nodeVersion ||
    rootLock?.lockfileVersion !== 3
  )
    fail("root dependency lock inputs are invalid");
  const functionsPackage = await readJson(
    resolve(releaseRoot, "functions/package.json"),
    "Functions package.json",
  );
  if (
    functionsPackage?.main !== "lib/index.js" ||
    functionsPackage?.engines?.node !== "22"
  )
    fail("Functions runtime package is invalid");
  const functionsManifest = await readJson(
    resolve(releaseRoot, "functions/functions.yaml"),
    "Functions discovery manifest",
  );
  const compiledIndex = await readFile(
    resolve(releaseRoot, "functions/lib/index.js"),
    "utf8",
  );
  const compiledExports = [
    ...compiledIndex.matchAll(
      /^export\s+const\s+([A-Za-z][A-Za-z0-9_-]{0,127})\b/gm,
    ),
  ].map((match) => match[1]);
  try {
    validateReleaseManifest(functionsManifest, compiledExports, environment);
  } catch {
    fail(
      "Functions discovery manifest does not match the reviewed compiled exports",
    );
  }

  const shell = await readFile(resolve(releaseRoot, "dist/index.html"));
  const functionShell = await readFile(
    resolve(releaseRoot, "functions/generated/app-shell.html"),
  );
  if (!shell.equals(functionShell))
    fail("Functions app shell does not equal the deployed Hosting shell");

  const functionsEnvironment = parseFunctionsEnvironment(
    await readFile(
      resolve(releaseRoot, "functions/.env.virtualartplattform"),
      "utf8",
    ),
  );
  if (environment) {
    for (const key of FUNCTION_PARAMETER_KEYS) {
      if (functionsEnvironment[key] !== environment[key])
        fail(
          `Function parameter ${key} does not match the verified configuration`,
        );
    }
  }
}

export async function verifyReleaseBundle(releaseRootValue, expectations = {}) {
  const releaseRoot = resolve(releaseRootValue);
  const manifestPath = resolve(releaseRoot, RELEASE_MANIFEST);
  const manifest = await readJson(manifestPath, RELEASE_MANIFEST);
  assertExactKeys(
    manifest,
    [
      "commitSha",
      "configurationFingerprints",
      "files",
      "firebaseCliVersion",
      "firebaseProjectId",
      "mailMode",
      "nodeVersion",
      "productionOrigin",
      "schemaVersion",
    ],
    "release manifest",
  );
  if (manifest.schemaVersion !== RELEASE_SCHEMA_VERSION)
    fail("manifest schema version is unsupported");
  checkedCommitSha(manifest.commitSha);
  checkedVersion(manifest.nodeVersion, "Node.js version");
  checkedVersion(manifest.firebaseCliVersion, "Firebase CLI version");
  checkedProjectId(manifest.firebaseProjectId);
  checkedMailMode(manifest.mailMode);
  checkedProductionOrigin(manifest.productionOrigin);
  assertExactKeys(
    manifest.configurationFingerprints,
    RELEASE_CONFIG_KEYS,
    "configuration fingerprints",
  );
  for (const fingerprint of Object.values(manifest.configurationFingerprints)) {
    if (
      typeof fingerprint !== "string" ||
      !/^sha256:[0-9a-f]{64}$/.test(fingerprint)
    )
      fail("configuration fingerprint is invalid");
  }

  if (
    expectations.commitSha !== undefined &&
    manifest.commitSha !== checkedCommitSha(expectations.commitSha)
  )
    fail("manifest commit SHA does not match");
  if (
    expectations.nodeVersion !== undefined &&
    manifest.nodeVersion !==
      checkedVersion(expectations.nodeVersion, "expected Node.js version")
  )
    fail("manifest Node.js version does not match");
  if (
    expectations.firebaseCliVersion !== undefined &&
    manifest.firebaseCliVersion !==
      checkedVersion(
        expectations.firebaseCliVersion,
        "expected Firebase CLI version",
      )
  )
    fail("manifest Firebase CLI version does not match");
  if (
    expectations.firebaseProjectId !== undefined &&
    manifest.firebaseProjectId !==
      checkedProjectId(expectations.firebaseProjectId)
  )
    fail("manifest Firebase project does not match");
  if (
    expectations.mailMode !== undefined &&
    manifest.mailMode !== checkedMailMode(expectations.mailMode)
  )
    fail("manifest mail mode does not match");
  if (
    expectations.productionOrigin !== undefined &&
    manifest.productionOrigin !==
      checkedProductionOrigin(expectations.productionOrigin)
  )
    fail("manifest production origin does not match");
  if (expectations.environment) {
    assertProductionContract(expectations.environment, {
      firebaseProjectId: manifest.firebaseProjectId,
      mailMode: manifest.mailMode,
      productionOrigin: manifest.productionOrigin,
      nodeVersion: manifest.nodeVersion,
    });
    const expectedFingerprints = releaseConfigurationFingerprints(
      expectations.environment,
    );
    if (
      JSON.stringify(manifest.configurationFingerprints) !==
      JSON.stringify(expectedFingerprints)
    )
      fail("production configuration changed after artifact verification");
  }

  if (
    !Array.isArray(manifest.files) ||
    !manifest.files.length ||
    manifest.files.length > MAXIMUM_FILES
  )
    fail("manifest file list is outside its bound");
  const manifestPaths = [];
  let manifestBytes = 0;
  for (const entry of manifest.files) {
    if (entry?.type !== "file") fail("manifest entry type is invalid");
    assertExactKeys(
      entry,
      ["path", "sha256", "size", "type"],
      "manifest file entry",
    );
    if (
      typeof entry.path !== "string" ||
      !PORTABLE_PATH.test(entry.path) ||
      !isAllowedReleaseFile(entry.path)
    )
      fail("manifest contains an invalid file path");
    if (!Number.isSafeInteger(entry.size) || entry.size < 0)
      fail("manifest contains an invalid file size");
    if (typeof entry.sha256 !== "string" || !SHA256.test(entry.sha256))
      fail("manifest contains an invalid file digest");
    manifestBytes += entry.size;
    manifestPaths.push(entry.path);
  }
  if (manifestBytes > MAXIMUM_BYTES)
    fail("manifest byte total exceeds its bound");
  const sortedPaths = [...manifestPaths].sort();
  if (
    new Set(manifestPaths).size !== manifestPaths.length ||
    JSON.stringify(manifestPaths) !== JSON.stringify(sortedPaths)
  )
    fail("manifest file paths must be unique and sorted");

  const actualEntries = await releaseFileEntries(releaseRoot);
  if (JSON.stringify(actualEntries) !== JSON.stringify(manifest.files))
    fail("file set, sizes, or SHA-256 digests do not match the manifest");
  await validateDeploymentConfiguration(
    releaseRoot,
    manifest,
    expectations.environment,
  );
  return manifest;
}

export async function assembleReleaseBundle(
  sourceRootValue,
  outputRootValue,
  options,
) {
  const sourceRoot = resolve(sourceRootValue);
  const outputRoot = resolve(outputRootValue);
  if (outputRoot !== resolve(sourceRoot, RELEASE_DIRECTORY))
    fail(`output must be the repository's ${RELEASE_DIRECTORY} directory`);

  const commitSha = checkedCommitSha(options.commitSha);
  const nodeVersion = checkedVersion(options.nodeVersion, "Node.js version");
  const firebaseCliVersion = checkedVersion(
    options.firebaseCliVersion,
    "Firebase CLI version",
  );
  const firebaseProjectId = checkedProjectId(options.firebaseProjectId);
  const productionOrigin = checkedProductionOrigin(options.productionOrigin);
  const mailMode = checkedMailMode(options.mailMode ?? "required");
  assertProductionContract(options.environment, {
    firebaseProjectId,
    mailMode,
    productionOrigin,
    nodeVersion,
  });
  const configurationFingerprints = releaseConfigurationFingerprints(
    options.environment,
  );

  await rm(outputRoot, { force: true, recursive: true });
  await mkdir(outputRoot, { recursive: true });
  await copyRequiredFile(sourceRoot, outputRoot, "dist");
  await copyRequiredFile(sourceRoot, outputRoot, "firebase-cli/package.json");
  await copyRequiredFile(
    sourceRoot,
    outputRoot,
    "firebase-cli/package-lock.json",
  );
  await copyRequiredFile(sourceRoot, outputRoot, "functions/lib");
  await copyRequiredFile(sourceRoot, outputRoot, "functions/functions.yaml");
  await copyRequiredFile(
    sourceRoot,
    outputRoot,
    "functions/generated/app-shell.html",
  );
  await copyRequiredFile(sourceRoot, outputRoot, "functions/package.json");
  await copyRequiredFile(sourceRoot, outputRoot, "functions/package-lock.json");
  await copyRequiredFile(sourceRoot, outputRoot, "package.json");
  await copyRequiredFile(sourceRoot, outputRoot, "package-lock.json");
  for (const name of RELEASE_SCRIPT_FILES)
    await copyRequiredFile(sourceRoot, outputRoot, `scripts/${name}`);

  const sourceFirebase = await readJson(
    resolve(sourceRoot, "firebase.json"),
    "source firebase.json",
  );
  if (!sourceFirebase.functions || !sourceFirebase.hosting)
    fail("source Firebase deploy targets are missing");
  const releaseFunctions = structuredClone(sourceFirebase.functions);
  const releaseHosting = structuredClone(sourceFirebase.hosting);
  delete releaseFunctions.predeploy;
  delete releaseHosting.predeploy;
  await writeFile(
    resolve(outputRoot, "firebase.json"),
    `${JSON.stringify(
      {
        functions: releaseFunctions,
        hosting: releaseHosting,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    resolve(outputRoot, ".firebaserc"),
    `${JSON.stringify(
      {
        projects: { default: firebaseProjectId },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  const functionsEnvironmentPath = resolve(
    outputRoot,
    "functions/.env.virtualartplattform",
  );
  await writeFile(
    functionsEnvironmentPath,
    functionsEnvironmentContents(options.environment),
    { encoding: "utf8", mode: 0o600 },
  );
  await chmod(functionsEnvironmentPath, 0o600);

  const manifest = {
    schemaVersion: RELEASE_SCHEMA_VERSION,
    commitSha,
    nodeVersion,
    firebaseCliVersion,
    firebaseProjectId,
    mailMode,
    productionOrigin,
    configurationFingerprints,
    files: await releaseFileEntries(outputRoot),
  };
  await writeFile(
    resolve(outputRoot, RELEASE_MANIFEST),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  await verifyReleaseBundle(outputRoot, {
    commitSha,
    nodeVersion,
    firebaseCliVersion,
    firebaseProjectId,
    mailMode,
    productionOrigin,
    environment: options.environment,
  });
  return manifest;
}
