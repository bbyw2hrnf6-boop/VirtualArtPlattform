import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PERFORMANCE_RELEASE_CEILINGS,
  PERFORMANCE_TARGETS,
  assertAdminLazyBoundary,
  assertPublicEntryLazyBoundary,
  initialAssetReferences,
  performanceBudgetOverages,
} from './lib/performance-budgets.mjs';

test('admin code is a bounded dynamic entry, never a public static dependency', () => {
  const adminKey = 'src/features/admin/AdminConsole.tsx';
  const manifest = {
    'index.html': { isEntry: true, imports: ['_shared.js'], dynamicImports: [adminKey], file: 'assets/index.js' },
    '_shared.js': { file: 'assets/shared.js' },
    [adminKey]: { isDynamicEntry: true, file: 'assets/AdminConsole.js', css: ['assets/AdminConsole.css'] },
  };
  assert.deepEqual(assertAdminLazyBoundary(manifest), { js: 'assets/AdminConsole.js', css: ['assets/AdminConsole.css'] });
  assert.throws(() => assertAdminLazyBoundary({}), /separately loaded/);
  assert.throws(() => assertAdminLazyBoundary({ ...manifest, 'index.html': { ...manifest['index.html'], imports: [adminKey] } }), /initial dependency graph/);
  for (const file of ['assets/AdminOperations.js', 'assets/adminOperationsModel.js']) {
    assert.throws(() => assertAdminLazyBoundary({ ...manifest, '_shared.js': { file } }), /initial dependency graph/);
  }
});

test('Firebase and account services stay outside the public static dependency graph', () => {
  const manifest = {
    'index.html': { isEntry: true, imports: ['_shared.js'], dynamicImports: ['_firebase.js'], file: 'assets/index.js' },
    '_shared.js': { file: 'assets/shared.js', imports: [] },
    '_firebase.js': { name: 'firebase', file: 'assets/firebase-A.js' },
  };
  assert.doesNotThrow(() => assertPublicEntryLazyBoundary(manifest));
  assert.throws(() => assertPublicEntryLazyBoundary({}), /public entry is missing/);
  assert.throws(
    () => assertPublicEntryLazyBoundary({
      ...manifest,
      'index.html': { ...manifest['index.html'], imports: ['_firebase.js'] },
    }),
    /entered the public initial dependency graph/,
  );
  assert.throws(
    () => assertPublicEntryLazyBoundary({
      ...manifest,
      '_shared.js': { file: 'assets/shared.js', imports: ['src/services/accountService.ts'] },
      'src/services/accountService.ts': { file: 'assets/accountService-A.js' },
    }),
    /entered the public initial dependency graph/,
  );
});

test('initial assets come from the HTML dependency graph and are de-duplicated', () => {
  assert.deepEqual(initialAssetReferences(`
    <link rel="modulepreload" href="/assets/vendor-B.js">
    <link href="/assets/index-A.css" rel="stylesheet">
    <script type="module" src="/assets/index-A.js"></script>
    <script type="module" src="/assets/index-A.js"></script>
  `), {
    js: ['assets/index-A.js', 'assets/vendor-B.js'],
    css: ['assets/index-A.css'],
  });
  assert.throws(() => initialAssetReferences('<main>No assets</main>'), /must reference/);
});

test('release ceilings allow the lazy Firebase production baseline', () => {
  const baseline = {
    jsGzip: 594_821,
    cssGzip: 53_995,
    largestLazyGzip: 175_025,
    entryGzip: 121_271,
    entryCssGzip: 28_995,
  };
  assert.deepEqual(performanceBudgetOverages(baseline, PERFORMANCE_RELEASE_CEILINGS), []);
  assert.deepEqual(
    performanceBudgetOverages(baseline, PERFORMANCE_TARGETS).map(({ key }) => key),
    ['jsGzip', 'cssGzip', 'entryGzip'],
  );
});

test('one byte above an enforced ceiling fails deterministically', () => {
  const totals = Object.fromEntries(
    Object.entries(PERFORMANCE_RELEASE_CEILINGS).map(([key, value]) => [key, value]),
  );
  totals.entryGzip += 1;
  assert.deepEqual(performanceBudgetOverages(totals, PERFORMANCE_RELEASE_CEILINGS), [{
    key: 'entryGzip',
    actual: PERFORMANCE_RELEASE_CEILINGS.entryGzip + 1,
    limit: PERFORMANCE_RELEASE_CEILINGS.entryGzip,
  }]);
});

test('invalid measurements are rejected instead of silently passing', () => {
  assert.throws(
    () => performanceBudgetOverages({ ...PERFORMANCE_RELEASE_CEILINGS, jsGzip: Number.NaN }, PERFORMANCE_RELEASE_CEILINGS),
    /Invalid performance measurement/,
  );
});
