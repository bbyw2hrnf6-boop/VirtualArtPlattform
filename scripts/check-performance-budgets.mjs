import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  PERFORMANCE_RELEASE_CEILINGS,
  PERFORMANCE_TARGETS,
  initialAssetReferences,
  performanceBudgetOverages,
} from './lib/performance-budgets.mjs';

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
const assetByPath = new Map(assets.map((asset) => [asset.file, asset]));
const initial = initialAssetReferences(readFileSync(join(root.pathname, 'index.html'), 'utf8'));
const initialAssets = (paths, kind) => paths.map((path) => {
  const asset = assetByPath.get(path);
  if (!asset) throw new Error(`Built index references missing ${kind} asset: ${path}`);
  return asset;
});
const initialJs = initialAssets(initial.js, 'JavaScript');
const initialCss = initialAssets(initial.css, 'CSS');
const initialJsPaths = new Set(initial.js);
const totals = {
  jsGzip: js.reduce((sum, asset) => sum + asset.gzip, 0),
  cssGzip: css.reduce((sum, asset) => sum + asset.gzip, 0),
  largestLazyGzip: Math.max(0, ...js.filter((asset) => !initialJsPaths.has(asset.file)).map((asset) => asset.gzip)),
  entryGzip: initialJs.reduce((sum, asset) => sum + asset.gzip, 0),
  entryCssGzip: initialCss.reduce((sum, asset) => sum + asset.gzip, 0),
};
const releaseFailures = performanceBudgetOverages(totals, PERFORMANCE_RELEASE_CEILINGS);
const targetMisses = performanceBudgetOverages(totals, PERFORMANCE_TARGETS);

console.log('LIEUVA performance budget (WP2 enforced release ceilings)');
console.table({
  'total JS gzip': { bytes: totals.jsGzip, ceiling: PERFORMANCE_RELEASE_CEILINGS.jsGzip, target: PERFORMANCE_TARGETS.jsGzip },
  'total CSS gzip': { bytes: totals.cssGzip, ceiling: PERFORMANCE_RELEASE_CEILINGS.cssGzip, target: PERFORMANCE_TARGETS.cssGzip },
  'largest lazy JS gzip': { bytes: totals.largestLazyGzip, ceiling: PERFORMANCE_RELEASE_CEILINGS.largestLazyGzip, target: PERFORMANCE_TARGETS.largestLazyGzip },
  'entry JS gzip': { bytes: totals.entryGzip, ceiling: PERFORMANCE_RELEASE_CEILINGS.entryGzip, target: PERFORMANCE_TARGETS.entryGzip },
  'entry CSS gzip': { bytes: totals.entryCssGzip, ceiling: PERFORMANCE_RELEASE_CEILINGS.entryCssGzip, target: PERFORMANCE_TARGETS.entryCssGzip },
});
for (const { key, actual, limit } of targetMisses)
  console.warn(`PERFORMANCE TARGET OPEN: ${key} is ${actual} bytes; target is ${limit}.`);
for (const { key, actual, limit } of releaseFailures)
  console.error(`PERFORMANCE REGRESSION: ${key} is ${actual} bytes; enforced ceiling is ${limit}.`);

if (releaseFailures.length || (targetMisses.length && process.env.LIEUVA_STRICT_PERFORMANCE_BUDGET === '1'))
  process.exitCode = 1;
