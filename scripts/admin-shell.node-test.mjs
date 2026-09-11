import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { adminShell } from './lib/admin-shell.mjs';

test('admin delivery is generic, uncached and noindex before application code executes', () => {
  const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const html = adminShell(source);
  assert.match(html, /<title>Admin Console \| LIEUVA<\/title>/);
  assert.match(html, /content="noindex,nofollow,noarchive"/);
  assert.match(html, /href="https:\/\/lieuva.com\/admin\/overview"/);
  assert.doesNotMatch(html, /application\/ld\+json/);
  assert.match(html, /src="\/src\/main.tsx"/);
  const hosting = JSON.parse(readFileSync(new URL('../firebase.json', import.meta.url))).hosting;
  assert.deepEqual(hosting.rewrites.find(({ source }) => source === '/admin{,/**}'), {
    source: '/admin{,/**}', destination: '/admin/index.html',
  });
  const headers = hosting.headers.find(({ source }) => source === '/admin{,/**}').headers;
  assert.match(headers.find(({ key }) => key === 'Cache-Control').value, /no-store/);
  assert.match(headers.find(({ key }) => key === 'X-Robots-Tag').value, /noindex/);
  assert.throws(() => adminShell('<html></html>'), /verified application/);
});
