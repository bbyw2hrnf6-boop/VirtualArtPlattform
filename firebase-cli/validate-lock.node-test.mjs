import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EXPECTED_FIREBASE_CLI_VERSION,
  EXPECTED_NODE_VERSION,
  EXPECTED_NPM_VERSION,
  validateFirebaseCliLock,
} from './validate-lock.mjs';

const integrity = `sha512-${Buffer.alloc(64, 7).toString('base64')}`;

function fixture() {
  const packageJson = {
    name: '@lieuva/firebase-cli-toolchain',
    version: '1.0.0',
    private: true,
    description: 'fixture',
    engines: { node: EXPECTED_NODE_VERSION },
    packageManager: `npm@${EXPECTED_NPM_VERSION}`,
    dependencies: { 'firebase-tools': EXPECTED_FIREBASE_CLI_VERSION },
  };
  const lock = {
    name: packageJson.name,
    version: packageJson.version,
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': {
        name: packageJson.name,
        version: packageJson.version,
        dependencies: { ...packageJson.dependencies },
        engines: { ...packageJson.engines },
      },
      'node_modules/firebase-tools': {
        version: EXPECTED_FIREBASE_CLI_VERSION,
        resolved: `https://registry.npmjs.org/firebase-tools/-/firebase-tools-${EXPECTED_FIREBASE_CLI_VERSION}.tgz`,
        integrity,
      },
    },
  };
  return { packageJson, lock };
}

test('accepts the exact CLI package and SHA-512 registry lock', () => {
  const { packageJson, lock } = fixture();
  assert.deepEqual(validateFirebaseCliLock(packageJson, lock), {
    packageCount: 1,
    firebaseCliVersion: EXPECTED_FIREBASE_CLI_VERSION,
  });
});

test('rejects version drift and extra dependency classes', () => {
  const versionDrift = fixture();
  versionDrift.packageJson.dependencies['firebase-tools'] = '^15.28.2';
  assert.throws(
    () => validateFirebaseCliLock(versionDrift.packageJson, versionDrift.lock),
    /root dependencies does not match/,
  );

  const extra = fixture();
  extra.packageJson.devDependencies = { other: '1.0.0' };
  assert.throws(
    () => validateFirebaseCliLock(extra.packageJson, extra.lock),
    /unexpected root dependency class/,
  );
});

test('rejects non-registry, linked, and weak-integrity dependencies', () => {
  const external = fixture();
  external.lock.packages['node_modules/firebase-tools'].resolved = 'https://example.com/firebase-tools.tgz';
  assert.throws(
    () => validateFirebaseCliLock(external.packageJson, external.lock),
    /HTTPS registry[.]npmjs[.]org tarball/,
  );

  const linked = fixture();
  linked.lock.packages['node_modules/firebase-tools'].link = true;
  assert.throws(
    () => validateFirebaseCliLock(linked.packageJson, linked.lock),
    /forbidden linked dependency/,
  );

  const fileReference = fixture();
  fileReference.lock.packages['node_modules/firebase-tools'].dependencies = {
    injected: 'file:../injected',
  };
  assert.throws(
    () => validateFirebaseCliLock(fileReference.packageJson, fileReference.lock),
    /forbidden dependencies reference/,
  );

  const weak = fixture();
  weak.lock.packages['node_modules/firebase-tools'].integrity = 'sha1-deadbeef';
  assert.throws(
    () => validateFirebaseCliLock(weak.packageJson, weak.lock),
    /SHA-512 integrity/,
  );
});
