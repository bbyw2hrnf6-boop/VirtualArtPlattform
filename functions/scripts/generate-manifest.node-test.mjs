import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EXPECTED_RELEASE_ENDPOINTS,
  EXPECTED_RELEASE_PARAMS,
  EXPECTED_RELEASE_REQUIRED_APIS,
  canonicalManifestText,
  validateReleaseManifest,
} from './generate-manifest.mjs';

function validManifest(endpointNames = EXPECTED_RELEASE_ENDPOINTS) {
  return {
    endpoints: Object.fromEntries(endpointNames.map((name) => [name, { entryPoint: name }])),
    specVersion: 'v1alpha1',
    requiredAPIs: EXPECTED_RELEASE_REQUIRED_APIS.map((requirement) => ({ ...requirement })),
    extensions: {},
    params: EXPECTED_RELEASE_PARAMS.map((parameter) => ({ ...parameter })),
  };
}

test('validates the exact release contract and canonicalizes object key order', () => {
  const manifest = validManifest([...EXPECTED_RELEASE_ENDPOINTS].reverse());
  const text = validateReleaseManifest(manifest, [...EXPECTED_RELEASE_ENDPOINTS].reverse());
  assert.equal(text, canonicalManifestText(validManifest()));
  assert.equal(JSON.parse(text).specVersion, 'v1alpha1');
});

test('rejects top-level, endpoint, and compiled export drift', () => {
  const extraTopLevel = { ...validManifest(), environment: {} };
  assert.throws(
    () => validateReleaseManifest(extraTopLevel, EXPECTED_RELEASE_ENDPOINTS),
    /top level has unexpected fields/,
  );

  const missingEndpoint = validManifest(EXPECTED_RELEASE_ENDPOINTS.slice(1));
  assert.throws(
    () => validateReleaseManifest(missingEndpoint, EXPECTED_RELEASE_ENDPOINTS),
    /endpoints has unexpected fields/,
  );

  assert.throws(
    () => validateReleaseManifest(validManifest(), EXPECTED_RELEASE_ENDPOINTS.slice(1)),
    /lib\/index[.]js exports do not match/,
  );

  const wrongEntryPoint = validManifest();
  wrongEntryPoint.endpoints.spaceDocument.entryPoint = 'otherEntryPoint';
  assert.throws(
    () => validateReleaseManifest(wrongEntryPoint, EXPECTED_RELEASE_ENDPOINTS),
    /does not map to its exported entry point/,
  );
});

test('rejects parameter/default drift and configured sensitive values', () => {
  const unsafeParams = validManifest();
  unsafeParams.params[1].default = 'real-operator@example.com';
  assert.throws(
    () => validateReleaseManifest(unsafeParams, EXPECTED_RELEASE_ENDPOINTS),
    /parameter definitions or safe defaults changed/,
  );

  const leaked = validManifest();
  leaked.endpoints.spaceDocument.note = 'sentinel-secret-value';
  assert.throws(
    () => validateReleaseManifest(leaked, EXPECTED_RELEASE_ENDPOINTS, {
      DEPLOY_TOKEN: 'sentinel-secret-value',
    }),
    /configured value from DEPLOY_TOKEN/,
  );
});

test('requires the reviewed Cloud Scheduler API contract', () => {
  const missingSchedulerApi = validManifest();
  missingSchedulerApi.requiredAPIs = [];
  assert.throws(
    () => validateReleaseManifest(missingSchedulerApi, EXPECTED_RELEASE_ENDPOINTS),
    /requiredAPIs do not match/,
  );

  const unexpectedApi = validManifest();
  unexpectedApi.requiredAPIs.push({
    api: 'run.googleapis.com',
    reason: 'Unexpected.',
  });
  assert.throws(
    () => validateReleaseManifest(unexpectedApi, EXPECTED_RELEASE_ENDPOINTS),
    /requiredAPIs do not match/,
  );
});
