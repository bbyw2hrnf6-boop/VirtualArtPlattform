import { readdir, lstat } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const functionsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = resolve(functionsRoot, 'src');
const outputRoot = resolve(functionsRoot, 'lib');

async function filesBelow(root) {
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      const stats = await lstat(path);
      if (stats.isSymbolicLink()) throw new Error(`Symlink is forbidden in Functions build output: ${path}`);
      if (stats.isDirectory()) await visit(path);
      else if (stats.isFile()) files.push(relative(root, path).split(sep).join('/'));
      else throw new Error(`Unsupported Functions build entry: ${path}`);
    }
  }
  await visit(root);
  return files.sort();
}

const runtimeSources = (await filesBelow(sourceRoot))
  .filter((path) => path.endsWith('.ts') && !/[.](?:test|spec)[.]ts$/.test(path))
  .map((path) => path.replace(/[.]ts$/, '.js'))
  .sort();
const emitted = await filesBelow(outputRoot);

if (!runtimeSources.includes('index.js'))
  throw new Error('Functions runtime source index.ts is missing.');
if (JSON.stringify(emitted) !== JSON.stringify(runtimeSources)) {
  throw new Error([
    'Functions build output is not the exact production JavaScript set.',
    `Expected: ${runtimeSources.join(', ')}`,
    `Emitted: ${emitted.join(', ')}`,
  ].join('\n'));
}

process.stdout.write(`Verified ${emitted.length} production-only Functions JavaScript files.\n`);
