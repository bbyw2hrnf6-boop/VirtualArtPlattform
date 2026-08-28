import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('../dist/', import.meta.url);
const files = [];
function walk(directory) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) walk(path);
    else files.push(path);
  }
}
walk(root.pathname);

const assets = files
  .filter((file) => /\.(js|css)$/.test(file))
  .map((file) => {
    const bytes = readFileSync(file);
    return { file: relative(root.pathname, file), raw: bytes.length, gzip: gzipSync(bytes).length };
  });
const js = assets.filter((asset) => asset.file.endsWith('.js'));
const css = assets.filter((asset) => asset.file.endsWith('.css'));
const totals = {
  jsGzip: js.reduce((sum, asset) => sum + asset.gzip, 0),
  cssGzip: css.reduce((sum, asset) => sum + asset.gzip, 0),
  largestLazyGzip: Math.max(0, ...js.filter((asset) => !asset.file.startsWith('assets/index-')).map((asset) => asset.gzip)),
  entryGzip: Math.max(0, ...js.filter((asset) => asset.file.startsWith('assets/index-')).map((asset) => asset.gzip)),
  entryCssGzip: Math.max(0, ...css.filter((asset) => asset.file.startsWith('assets/index-')).map((asset) => asset.gzip)),
};
// Total ceilings stop silent product-wide growth. Entry ceilings are stricter:
// route-level social, pitch and 3D code may exist, but must not tax first paint.
const budgets = { jsGzip: 560_000, cssGzip: 43_000, largestLazyGzip: 195_000, entryGzip: 115_000, entryCssGzip: 32_500 };
const failures = Object.entries(budgets).filter(([key, limit]) => totals[key] > limit);

console.log('LIEUVA performance budget (warning-only baseline)');
console.table({
  'total JS gzip': { bytes: totals.jsGzip, budget: budgets.jsGzip },
  'total CSS gzip': { bytes: totals.cssGzip, budget: budgets.cssGzip },
  'largest lazy JS gzip': { bytes: totals.largestLazyGzip, budget: budgets.largestLazyGzip },
  'entry JS gzip': { bytes: totals.entryGzip, budget: budgets.entryGzip },
  'entry CSS gzip': { bytes: totals.entryCssGzip, budget: budgets.entryCssGzip },
});
for (const [key, limit] of failures)
  console.warn(`PERFORMANCE BUDGET WARNING: ${key} is ${totals[key]} bytes; budget is ${limit}.`);
if (failures.length && process.env.LIEUVA_STRICT_PERFORMANCE_BUDGET === '1') process.exitCode = 1;
