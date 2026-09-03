import { rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const functionsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = resolve(functionsRoot, 'lib');
if (dirname(outputDirectory) !== functionsRoot)
  throw new Error('Refusing to clean an unexpected Functions output directory.');

await rm(outputDirectory, { recursive: true, force: true });
