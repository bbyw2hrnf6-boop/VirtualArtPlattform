export const PERFORMANCE_TARGETS = Object.freeze({
  jsGzip: 560_000,
  cssGzip: 43_000,
  largestLazyGzip: 195_000,
  entryGzip: 115_000,
  entryCssGzip: 32_500,
});

// The Firebase/account boundary removes the SDK from the public dependency
// graph and lowers the entry ceiling from 305KB against a 121.3KB production
// baseline. The product target remains intentionally tighter. Proven-dead CSS
// and fully shadowed declarations were removed at a 53,995-byte production
// baseline, so the aggregate CSS ceiling is tightened without changing styles.
// Lazy admin and guest-publication additions retain their existing allowances.
export const PERFORMANCE_RELEASE_CEILINGS = Object.freeze({
  jsGzip: 595_000,
  cssGzip: 54_500,
  largestLazyGzip: 195_000,
  entryGzip: 123_000,
  entryCssGzip: 32_500,
});

export function assertPublicEntryLazyBoundary(manifest) {
  if (!manifest?.['index.html']?.isEntry)
    throw new Error('The public entry is missing from the build manifest.');
  const visited = new Set();
  function visit(key) {
    if (visited.has(key)) return;
    visited.add(key);
    const chunk = manifest[key];
    if (!chunk) throw new Error(`Missing manifest dependency: ${key}`);
    const file = chunk.file ?? '';
    if (
      chunk.name === 'firebase'
      || /(?:^|\/)firebase(?:-[^/]+)?\.js$/i.test(file)
      || /(?:^|\/)accountService(?:-[^/]+)?\.js$/i.test(file)
      || /src[\\/]services[\\/](?:firebase|accountService)\.ts$/.test(key)
    ) throw new Error('Firebase or account services entered the public initial dependency graph.');
    for (const dependency of chunk.imports ?? []) visit(dependency);
  }
  visit('index.html');
}

export function assertAdminLazyBoundary(manifest) {
  const adminKey = 'src/features/admin/AdminConsole.tsx';
  const admin = manifest?.[adminKey];
  if (!manifest?.['index.html']?.isEntry || !admin?.isDynamicEntry)
    throw new Error('The admin console must remain a separately loaded dynamic entry.');
  const visited = new Set();
  function visit(key) {
    if (visited.has(key)) return;
    visited.add(key);
    const chunk = manifest[key];
    if (!chunk) throw new Error(`Missing manifest dependency: ${key}`);
    if (key === adminKey || /(?:AdminConsole|AdminOperations|adminOperationsModel|adminConsoleService)/.test(chunk.file))
      throw new Error('Admin code entered the public initial dependency graph.');
    for (const dependency of chunk.imports ?? []) visit(dependency);
  }
  visit('index.html');
  return { js: admin.file, css: admin.css ?? [] };
}

function attributes(tag) {
  return Object.fromEntries(
    [...tag.matchAll(/\b([A-Za-z][\w:-]*)\s*=\s*["']([^"']*)["']/g)]
      .map((match) => [match[1].toLowerCase(), match[2]]),
  );
}

function localAssetPath(value, extension) {
  if (!value) return undefined;
  const url = new URL(value, 'https://build.invalid/');
  if (url.origin !== 'https://build.invalid' || !url.pathname.endsWith(extension)) return undefined;
  return url.pathname.replace(/^\//, '');
}

export function initialAssetReferences(indexHtml) {
  if (typeof indexHtml !== 'string' || !indexHtml.trim())
    throw new Error('Built index HTML is missing.');
  const js = new Set();
  const css = new Set();
  for (const match of indexHtml.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
    const tag = match[0];
    const fields = attributes(tag);
    if (/^<script\b/i.test(tag)) {
      const path = localAssetPath(fields.src, '.js');
      if (path) js.add(path);
      continue;
    }
    const relationships = new Set((fields.rel ?? '').toLowerCase().split(/\s+/).filter(Boolean));
    if (relationships.has('modulepreload')) {
      const path = localAssetPath(fields.href, '.js');
      if (path) js.add(path);
    }
    if (relationships.has('stylesheet')) {
      const path = localAssetPath(fields.href, '.css');
      if (path) css.add(path);
    }
  }
  if (!js.size || !css.size)
    throw new Error('Built index HTML must reference initial JavaScript and CSS assets.');
  return { js: [...js].sort(), css: [...css].sort() };
}

export function performanceBudgetOverages(totals, budgets) {
  return Object.entries(budgets).flatMap(([key, limit]) => {
    const actual = totals[key];
    if (!Number.isFinite(actual) || actual < 0)
      throw new Error(`Invalid performance measurement for ${key}.`);
    if (!Number.isSafeInteger(limit) || limit < 1)
      throw new Error(`Invalid performance budget for ${key}.`);
    return actual > limit ? [{ key, actual, limit }] : [];
  });
}
