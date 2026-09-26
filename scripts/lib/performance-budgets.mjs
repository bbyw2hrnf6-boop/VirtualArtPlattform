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
// Session-only view/pace controls and accessible Arrange zoom deliberately add
// 1KB to the aggregate feature allowance; entry/lazy-chunk/CSS ceilings and the
// tighter product targets are unchanged. See the mobile camera contract.
// The independently lazy Obsidian showcase deliberately adds 6 KB JS and
// 2 KB CSS to aggregate allowances. Public-entry, largest-chunk and every
// Studio asset budget stay unchanged; see blender/showcases/obsidian/README.md.
// Obsidian shares the existing walk controller and adds a planar reflection
// pass plus cutaway orbit navigation: +5 KB aggregate JS allowance. The initial
// public route, Studio assets and all other ceilings remain fixed.
export const PERFORMANCE_RELEASE_CEILINGS = Object.freeze({
  // Forest Fold House: explicit +6 KB for its lazy page, multi-level graph and shared height-aware visitor.
  // See blender/showcases/forest-fold-house/README.md; entry and Studio ceilings stay fixed.
  // GPU-completion calibration: explicit +256 bytes; measured addition ~158
  // bytes gzip. Entry, lazy-chunk, CSS and all asset-quality limits stay fixed.
  // Cinematic rails, three-world scroll and shared guided visits: +8 KB JS /
  // +2 KB CSS, loaded on their feature boundary. Assets and entry stay fixed.
  // Automatic gallery entries and matched world-space portals: +2 KB JS.
  // Next-world GPU warm-up and reduced-motion teardown: +256 B aggregate only.
  // The production fixture measures 626,280 B; entry, lazy and CSS stay fixed.
  // Forest lighting: +4 KiB for atomic, on-demand night atlases, cached light
  // environments, physical foliage response and viewpoint-correct mirrors.
  // Feature-only allowance; public entry, Studio and CSS limits stay fixed.
  // Direct artwork entry and WebGL context-loss recovery: +2 KB aggregate JS.
  // The Linux production candidate measured 631,461 B; all other limits stay fixed.
  jsGzip: 632_608,
  // Current verified aggregate is 58,501 B after the showcase CSS build.
  // Ten bytes of headroom avoid a one-byte release failure; target stays fixed.
  cssGzip: 58_510,
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

export function assertDeferredStoryLazyBoundary(manifest) {
  const storyKey = 'src/features/landing/ScrollGalleryStory.tsx';
  const immediateKey = 'src/features/landing/ImmediateLandingSections.ts';
  if (!manifest?.[storyKey]?.isDynamicEntry || !manifest?.[immediateKey]?.isDynamicEntry)
    throw new Error('Landing sections and the 3D story must remain separate dynamic entries.');
  const visited = new Set();
  function visit(key) {
    if (visited.has(key)) return;
    visited.add(key);
    const chunk = manifest[key];
    if (!chunk) throw new Error(`Missing manifest dependency: ${key}`);
    if (key === storyKey || /(?:ScrollGalleryStory|GalleryScene)/.test(chunk.file ?? ''))
      throw new Error('The deferred 3D story entered the immediate landing dependency graph.');
    for (const dependency of chunk.imports ?? []) visit(dependency);
  }
  visit(immediateKey);
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
