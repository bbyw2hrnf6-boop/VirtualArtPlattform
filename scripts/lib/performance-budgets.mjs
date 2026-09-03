export const PERFORMANCE_TARGETS = Object.freeze({
  jsGzip: 560_000,
  cssGzip: 43_000,
  largestLazyGzip: 195_000,
  entryGzip: 115_000,
  entryCssGzip: 32_500,
});

// WP2 freezes the shipped baseline so performance cannot silently regress.
// WP4 owns lowering these ceilings to the product targets above.
export const PERFORMANCE_RELEASE_CEILINGS = Object.freeze({
  jsGzip: 575_000,
  cssGzip: 54_000,
  largestLazyGzip: 195_000,
  entryGzip: 305_000,
  entryCssGzip: 32_500,
});

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
