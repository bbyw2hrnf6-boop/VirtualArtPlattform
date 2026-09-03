import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  chmod,
  lstat,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);

export const RELEASE_PROJECT_ID = 'virtualartplattform';
export const RELEASE_MANIFEST_PATH = 'functions.yaml';
export const EXPECTED_RELEASE_ENDPOINTS = Object.freeze([
  'abortAuraGalleryPublication',
  'acceptAuraGalleryInvite',
  'beginAuraGalleryPublication',
  'checkLieuvaCreatorHandle',
  'createAuraGalleryInvite',
  'createLieuvaCreatorPost',
  'creatorAttribution',
  'creatorCover',
  'creatorDirectoryData',
  'creatorDocument',
  'creatorImage',
  'creatorProfileData',
  'deleteAuraAccount',
  'exportAuraAccountData',
  'getMyLieuvaCreatorHome',
  'getMyLieuvaCreatorProfile',
  'manageAuraGalleryLifecycle',
  'manageLieuvaCreatorBlock',
  'manageLieuvaCreatorFollow',
  'manageLieuvaCreatorPostInteraction',
  'markMyLieuvaCreatorNotificationsRead',
  'purgeAuraGallery',
  'recordLieuvaTelemetry',
  'revokeAuraGalleryAccess',
  'saveLieuvaCreatorProfile',
  'sendAuraVerificationEmail',
  'setAuraNewsletterPreference',
  'setLieuvaCreatorProfileCover',
  'setLieuvaCreatorProfileImage',
  'spaceCard',
  'spaceDocument',
  'spaceSitemap',
  'unsubscribeAuraNewsletter',
]);

export const EXPECTED_RELEASE_PARAMS = Object.freeze([
  Object.freeze({
    name: 'AURA_PUBLIC_APP_URL',
    description: 'Legacy-named parameter for the public LIEUVA URL without a trailing slash.',
    type: 'string',
    default: 'https://lieuva.com',
  }),
  Object.freeze({
    name: 'AURA_REPLY_TO',
    description: 'Legacy-named parameter for the public support/reply-to email shown in LIEUVA emails.',
    type: 'string',
    default: 'not-configured@invalid.example',
  }),
  Object.freeze({
    name: 'AURA_LEGAL_FOOTER',
    description: 'Legal sender name and postal address shown in marketing emails.',
    type: 'string',
    default: 'LIEUVA preview — legal sender details not configured',
  }),
]);

const EXPECTED_TOP_LEVEL_KEYS = Object.freeze([
  'endpoints',
  'extensions',
  'params',
  'requiredAPIs',
  'specVersion',
]);
const MAXIMUM_MANIFEST_BYTES = 256 * 1024;
const SENSITIVE_ENVIRONMENT_NAME = /(?:secret|token|password|passcode|private[_-]?key|credential|api[_-]?key|auth[_-]?key|signing[_-]?key)/i;
const RELEASE_VALUES_FORBIDDEN_IN_MANIFEST = new Set([
  'AURA_LEGAL_FOOTER',
  'AURA_REPLY_TO',
  'VITE_FIREBASE_APPCHECK_SITE_KEY',
]);

function fail(message) {
  throw new Error(`Invalid Functions release manifest: ${message}`);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(value, expected, label) {
  if (!isPlainObject(value)) fail(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(sortedExpected))
    fail(`${label} has unexpected fields`);
}

function sortedStrings(values, label) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string'))
    fail(`${label} must be a string array`);
  const sorted = [...values].sort();
  if (new Set(sorted).size !== sorted.length) fail(`${label} contains duplicate names`);
  return sorted;
}

function exactJson(left, right) {
  return canonicalManifestText(left) === canonicalManifestText(right);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
  );
}

export function canonicalManifestText(value) {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`;
}

function sensitiveEnvironmentEntries(environment) {
  return Object.entries(environment ?? {}).filter(([name, value]) => {
    if (typeof value !== 'string' || value.length < 8) return false;
    return RELEASE_VALUES_FORBIDDEN_IN_MANIFEST.has(name) || SENSITIVE_ENVIRONMENT_NAME.test(name);
  });
}

function assertNoConfiguredValues(manifestText, environment) {
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(manifestText))
    fail('manifest contains private-key material');
  for (const [name, value] of sensitiveEnvironmentEntries(environment)) {
    if (manifestText.includes(value)) fail(`manifest contains configured value from ${name}`);
  }
}

export function validateReleaseManifest(manifest, moduleExports, environment = {}) {
  assertExactKeys(manifest, EXPECTED_TOP_LEVEL_KEYS, 'top level');
  if (manifest.specVersion !== 'v1alpha1') fail('specVersion must be v1alpha1');
  if (!Array.isArray(manifest.requiredAPIs) || manifest.requiredAPIs.length !== 0)
    fail('requiredAPIs must be the reviewed empty list');
  assertExactKeys(manifest.extensions, [], 'extensions');

  assertExactKeys(manifest.endpoints, EXPECTED_RELEASE_ENDPOINTS, 'endpoints');
  const endpointNames = Object.keys(manifest.endpoints).sort();
  const expectedNames = [...EXPECTED_RELEASE_ENDPOINTS].sort();
  if (!exactJson(endpointNames, expectedNames)) fail('endpoint names do not match the reviewed release contract');
  for (const name of expectedNames) {
    const endpoint = manifest.endpoints[name];
    if (!isPlainObject(endpoint) || endpoint.entryPoint !== name)
      fail(`endpoint ${name} does not map to its exported entry point`);
  }

  const exportedNames = sortedStrings(moduleExports, 'lib/index.js exports');
  if (!exactJson(exportedNames, expectedNames))
    fail('lib/index.js exports do not match the reviewed release contract');
  if (!exactJson(endpointNames, exportedNames))
    fail('discovered endpoints do not match lib/index.js exports');

  if (!Array.isArray(manifest.params) || !exactJson(manifest.params, EXPECTED_RELEASE_PARAMS))
    fail('parameter definitions or safe defaults changed');

  const manifestText = canonicalManifestText(manifest);
  if (Buffer.byteLength(manifestText) > MAXIMUM_MANIFEST_BYTES)
    fail('manifest exceeds its size bound');
  assertNoConfiguredValues(manifestText, environment);
  return manifestText;
}

function checkedProjectId(value) {
  if (value !== RELEASE_PROJECT_ID)
    throw new Error(`--project-id must be the explicit release project ${RELEASE_PROJECT_ID}.`);
  return value;
}

function discoveryEnvironment(projectId, manifestPath, extra = {}) {
  const environment = {
    FIREBASE_CONFIG: JSON.stringify({ projectId }),
    FUNCTIONS_CONTROL_API: 'true',
    FUNCTIONS_MANIFEST_OUTPUT_PATH: manifestPath,
    GCLOUD_PROJECT: projectId,
    GOOGLE_CLOUD_PROJECT: projectId,
    LANG: 'C',
    LC_ALL: 'C',
    NODE_ENV: 'production',
    TZ: 'UTC',
  };
  if (extra.SystemRoot) environment.SystemRoot = extra.SystemRoot;
  return environment;
}

async function assertRegularFile(path, label) {
  let stats;
  try {
    stats = await lstat(path);
  } catch {
    throw new Error(`${label} is missing.`);
  }
  if (stats.isSymbolicLink() || !stats.isFile()) throw new Error(`${label} must be a regular file.`);
  return stats;
}

async function discoverModuleExports(entryPath, outputPath, environment) {
  const probe = [
    "import { writeFile } from 'node:fs/promises';",
    `const namespace = await import(${JSON.stringify(pathToFileURL(entryPath).href)});`,
    `await writeFile(${JSON.stringify(outputPath)}, JSON.stringify(Object.keys(namespace).sort()), { encoding: 'utf8', flag: 'wx', mode: 0o600 });`,
  ].join('\n');
  try {
    await execFileAsync(process.execPath, ['--input-type=module', '--eval', probe], {
      cwd: dirname(entryPath),
      env: environment,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
  } catch {
    throw new Error('Could not inspect the built Functions exports.');
  }
  await assertRegularFile(outputPath, 'Functions export proof');
  let names;
  try {
    names = JSON.parse(await readFile(outputPath, 'utf8'));
  } catch {
    throw new Error('Functions export proof is malformed.');
  }
  return names;
}

export async function generateReleaseManifest({ functionsRoot, projectId, environment = process.env }) {
  checkedProjectId(projectId);
  const root = resolve(functionsRoot);
  const outputPath = resolve(root, RELEASE_MANIFEST_PATH);
  if (dirname(outputPath) !== root) throw new Error('Refusing to write outside the Functions root.');

  const entryPath = resolve(root, 'lib/index.js');
  const sdkBinary = resolve(root, 'node_modules/firebase-functions/lib/bin/firebase-functions.js');
  await assertRegularFile(entryPath, 'Built Functions entry point');
  await assertRegularFile(sdkBinary, 'Locked Firebase Functions discovery binary');
  try {
    const existing = await lstat(outputPath);
    if (existing.isSymbolicLink() || !existing.isFile())
      throw new Error('Existing Functions manifest must be a regular file.');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const nonce = `${process.pid}-${randomBytes(12).toString('hex')}`;
  const manifestTemp = resolve(root, `.functions-release-manifest-${nonce}.tmp`);
  const exportsTemp = resolve(root, `.functions-release-exports-${nonce}.tmp`);
  const childEnvironment = discoveryEnvironment(projectId, manifestTemp, environment);
  try {
    try {
      await execFileAsync(process.execPath, [sdkBinary, root], {
        cwd: root,
        env: childEnvironment,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      });
    } catch {
      throw new Error('Firebase Functions manifest discovery failed.');
    }
    const manifestStats = await assertRegularFile(manifestTemp, 'Discovered Functions manifest');
    if (manifestStats.size <= 0 || manifestStats.size > MAXIMUM_MANIFEST_BYTES)
      throw new Error('Discovered Functions manifest size is invalid.');

    let manifest;
    try {
      manifest = JSON.parse(await readFile(manifestTemp, 'utf8'));
    } catch {
      throw new Error('Discovered Functions manifest is malformed.');
    }
    const moduleExports = await discoverModuleExports(entryPath, exportsTemp, childEnvironment);
    const manifestText = validateReleaseManifest(manifest, moduleExports, environment);
    await writeFile(manifestTemp, manifestText, { encoding: 'utf8', mode: 0o644 });
    await chmod(manifestTemp, 0o644);
    await rename(manifestTemp, outputPath);
    process.stdout.write(`Verified ${moduleExports.length} Functions release endpoints in ${RELEASE_MANIFEST_PATH}.\n`);
    return { endpointCount: moduleExports.length, outputPath };
  } finally {
    await Promise.all([
      rm(manifestTemp, { force: true }),
      rm(exportsTemp, { force: true }),
    ]);
  }
}

function parseArguments(argv) {
  if (argv.length !== 2 || argv[0] !== '--project-id' || !argv[1])
    throw new Error('Usage: node scripts/generate-manifest.mjs --project-id virtualartplattform');
  return { projectId: checkedProjectId(argv[1]) };
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  const functionsRoot = resolve(dirname(scriptPath), '..');
  const options = parseArguments(process.argv.slice(2));
  await generateReleaseManifest({ functionsRoot, projectId: options.projectId });
}
