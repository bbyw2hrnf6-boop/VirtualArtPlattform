import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PERFORMANCE_RELEASE_CEILINGS,
  PERFORMANCE_TARGETS,
  assertAdminLazyBoundary,
  initialAssetReferences,
  performanceBudgetOverages,
} from './lib/performance-budgets.mjs';

test('admin code is a bounded dynamic entry, never a public static dependency', () => {
  const adminKey = 'src/features/admin/AdminConsole.tsx';
  const manifest = {
    'index.html': { isEntry: true, imports: ['_firebase.js'], dynamicImports: [adminKey], file: 'assets/index.js' },
    '_firebase.js': { file: 'assets/firebase.js' },
    [adminKey]: { isDynamicEntry: true, file: 'assets/AdminConsole.js', css: ['assets/AdminConsole.css'] },
  };
  assert.deepEqual(assertAdminLazyBoundary(manifest), { js: 'assets/AdminConsole.js', css: ['assets/AdminConsole.css'] });
  assert.throws(() => assertAdminLazyBoundary({}), /separately loaded/);
  assert.throws(() => assertAdminLazyBoundary({ ...manifest, 'index.html': { ...manifest['index.html'], imports: [adminKey] } }), /initial dependency graph/);
  for (const file of ['assets/AdminOperations.js', 'assets/adminOperationsModel.js']) {
    assert.throws(() => assertAdminLazyBoundary({ ...manifest, '_firebase.js': { file } }), /initial dependency graph/);
  }
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

test('release ceilings allow the WP2 frozen production baseline', () => {
  const baseline = {
    jsGzip: 569_577,
    cssGzip: 53_207,
    largestLazyGzip: 173_062,
    entryGzip: 297_706,
    entryCssGzip: 31_454,
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
