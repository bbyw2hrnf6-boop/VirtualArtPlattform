import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const generatedTargets = [
  '../artifacts/',
  '../dist/',
  '../.firebase/',
  '../functions/lib/',
  '../functions/functions.yaml',
  '../functions/generated/app-shell.html',
  '../tsconfig.app.tsbuildinfo',
  '../.DS_Store',
  '../blender/.DS_Store',
  '../firebase-debug.log',
  '../firestore-debug.log',
  '../database-debug.log',
  '../ui-debug.log',
];

for (const relativePath of generatedTargets) {
  await rm(new URL(relativePath, import.meta.url), { force: true, recursive: true });
}

async function removeBlenderJunk(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__pycache__') await rm(path, { force: true, recursive: true });
      else await removeBlenderJunk(path);
    } else if (entry.isFile() && (entry.name.endsWith('.blend1') || entry.name.endsWith('.log'))) {
      await rm(path, { force: true });
    }
  }
}

await removeBlenderJunk(fileURLToPath(new URL('../blender/production/', import.meta.url)));
console.log('Removed generated builds, diagnostics, caches, and Blender backups.');
