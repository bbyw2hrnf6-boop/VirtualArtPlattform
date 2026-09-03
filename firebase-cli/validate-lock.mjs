import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXPECTED_NODE_VERSION = '22.23.2';
export const EXPECTED_NPM_VERSION = '10.9.8';
export const EXPECTED_FIREBASE_CLI_VERSION = '15.28.2';

const EXPECTED_PACKAGE_NAME = '@lieuva/firebase-cli-toolchain';
const EXPECTED_PACKAGE_VERSION = '1.0.0';
const FORBIDDEN_DEPENDENCY_REFERENCE = /^(?:file:|link:|git(?:\+|:)|github:|https?:|ssh:)/i;
const MAXIMUM_LOCK_PACKAGES = 2_000;

function fail(message) {
  throw new Error(`Invalid Firebase CLI lock: ${message}`);
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactObject(value, expected, label) {
  if (!isObject(value)) fail(`${label} must be an object`);
  if (JSON.stringify(value) !== JSON.stringify(expected)) fail(`${label} does not match the release contract`);
}

function validSha512Integrity(value) {
  if (typeof value !== 'string' || !value.startsWith('sha512-')) return false;
  const encoded = value.slice('sha512-'.length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return false;
  const digest = Buffer.from(encoded, 'base64');
  return digest.length === 64 && digest.toString('base64') === encoded;
}

function validateRegistryUrl(value, path) {
  if (typeof value !== 'string') fail(`${path} has no locked registry URL`);
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${path} has an invalid registry URL`);
  }
  if (
    url.protocol !== 'https:'
    || url.hostname !== 'registry.npmjs.org'
    || url.port
    || url.username
    || url.password
    || url.search
    || url.hash
    || !url.pathname.endsWith('.tgz')
  ) fail(`${path} is not locked to an HTTPS registry.npmjs.org tarball`);
}

function validatePackagePath(path) {
  if (
    typeof path !== 'string'
    || !path.startsWith('node_modules/')
    || path.includes('\\')
    || path.split('/').some((part) => part === '.' || part === '..' || !part)
  ) fail('lock contains an invalid package path');
}

function validateDependencyReferences(dependency, path) {
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    if (dependency[field] === undefined) continue;
    if (!isObject(dependency[field])) fail(`${path} has malformed ${field}`);
    for (const reference of Object.values(dependency[field])) {
      if (typeof reference !== 'string' || FORBIDDEN_DEPENDENCY_REFERENCE.test(reference))
        fail(`${path} has a forbidden ${field} reference`);
    }
  }
}

export function validateFirebaseCliLock(packageJson, lock) {
  if (!isObject(packageJson)) fail('package.json must be an object');
  if (packageJson.name !== EXPECTED_PACKAGE_NAME || packageJson.version !== EXPECTED_PACKAGE_VERSION)
    fail('package identity changed');
  if (packageJson.private !== true) fail('package must remain private');
  exactObject(packageJson.engines, { node: EXPECTED_NODE_VERSION }, 'Node engine');
  if (packageJson.packageManager !== `npm@${EXPECTED_NPM_VERSION}`)
    fail('package manager version changed');
  exactObject(
    packageJson.dependencies,
    { 'firebase-tools': EXPECTED_FIREBASE_CLI_VERSION },
    'root dependencies',
  );
  if (packageJson.devDependencies || packageJson.optionalDependencies || packageJson.peerDependencies)
    fail('unexpected root dependency class');

  if (!isObject(lock) || lock.lockfileVersion !== 3 || lock.requires !== true)
    fail('package-lock.json must be a lockfileVersion 3 dependency lock');
  if (lock.name !== EXPECTED_PACKAGE_NAME || lock.version !== EXPECTED_PACKAGE_VERSION)
    fail('lockfile package identity changed');
  if (!isObject(lock.packages)) fail('lockfile packages map is missing');
  const paths = Object.keys(lock.packages);
  if (paths.length < 2 || paths.length > MAXIMUM_LOCK_PACKAGES)
    fail('lockfile package count is outside its bound');

  const root = lock.packages[''];
  if (!isObject(root) || root.name !== EXPECTED_PACKAGE_NAME || root.version !== EXPECTED_PACKAGE_VERSION)
    fail('lockfile root package is invalid');
  exactObject(root.engines, { node: EXPECTED_NODE_VERSION }, 'locked Node engine');
  exactObject(
    root.dependencies,
    { 'firebase-tools': EXPECTED_FIREBASE_CLI_VERSION },
    'locked root dependencies',
  );

  for (const path of paths) {
    if (path === '') continue;
    validatePackagePath(path);
    const dependency = lock.packages[path];
    if (!isObject(dependency)) fail(`${path} metadata must be an object`);
    if (dependency.link === true) fail(`${path} is a forbidden linked dependency`);
    if (dependency.inBundle === true) fail(`${path} is a forbidden bundled dependency`);
    if (typeof dependency.version !== 'string' || FORBIDDEN_DEPENDENCY_REFERENCE.test(dependency.version))
      fail(`${path} has a forbidden dependency version`);
    validateDependencyReferences(dependency, path);
    validateRegistryUrl(dependency.resolved, path);
    if (!validSha512Integrity(dependency.integrity))
      fail(`${path} is not protected by one exact SHA-512 integrity digest`);
  }

  const firebaseTools = lock.packages['node_modules/firebase-tools'];
  if (!isObject(firebaseTools) || firebaseTools.version !== EXPECTED_FIREBASE_CLI_VERSION)
    fail('locked firebase-tools package version changed');
  return { packageCount: paths.length - 1, firebaseCliVersion: firebaseTools.version };
}

export async function validateFirebaseCliLockFiles(rootValue) {
  const root = resolve(rootValue);
  let packageJson;
  let lock;
  try {
    [packageJson, lock] = await Promise.all([
      readFile(resolve(root, 'package.json'), 'utf8').then(JSON.parse),
      readFile(resolve(root, 'package-lock.json'), 'utf8').then(JSON.parse),
    ]);
  } catch {
    fail('package.json or package-lock.json is missing or malformed');
  }
  return validateFirebaseCliLock(packageJson, lock);
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  if (process.argv.length !== 2) throw new Error('validate-lock.mjs accepts no arguments.');
  if (process.versions.node !== EXPECTED_NODE_VERSION)
    throw new Error(`Firebase CLI lock validation requires Node ${EXPECTED_NODE_VERSION}.`);
  const result = await validateFirebaseCliLockFiles(dirname(scriptPath));
  process.stdout.write(`Verified locked Firebase CLI ${result.firebaseCliVersion} across ${result.packageCount} packages.\n`);
}
