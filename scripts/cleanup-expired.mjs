import { createSign } from 'node:crypto';

const credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
if (!credentials.client_email || !credentials.private_key || !credentials.project_id) {
  throw new Error('FIREBASE_SERVICE_ACCOUNT must contain the complete service-account JSON.');
}

const encode = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
const issuedAt = Math.floor(Date.now() / 1000);
const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
  iss: credentials.client_email,
  scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/devstorage.read_write',
  aud: 'https://oauth2.googleapis.com/token',
  iat: issuedAt,
  exp: issuedAt + 3600
})}`;
const signer = createSign('RSA-SHA256'); signer.update(unsigned); signer.end();
const assertion = `${unsigned}.${signer.sign(credentials.private_key, 'base64url')}`;
const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth2:grant-type:jwt-bearer', assertion })
});
if (!tokenResponse.ok) throw new Error(`Token request failed: ${tokenResponse.status}`);
const { access_token: accessToken } = await tokenResponse.json();
const databaseRoot = `https://firestore.googleapis.com/v1/projects/${credentials.project_id}/databases/(default)/documents`;
const headers = { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' };
const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || `${credentials.project_id}.firebasestorage.app`;

const runQuery = async (structuredQuery) => {
  const response = await fetch(`${databaseRoot}:runQuery`, { method: 'POST', headers, body: JSON.stringify({ structuredQuery }) });
  if (!response.ok) throw new Error(`Firestore query failed: ${response.status} ${await response.text()}`);
  return (await response.json()).flatMap((result) => result.document ? [result.document] : []);
};
const deleteDocument = async (name) => {
  const response = await fetch(`https://firestore.googleapis.com/v1/${name}`, { method: 'DELETE', headers });
  if (!response.ok && response.status !== 404) throw new Error(`Delete failed for ${name}: ${response.status}`);
};
const deleteStorageObject = async (path) => {
  const response = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(storageBucket)}/o/${encodeURIComponent(path)}`,
    { method: 'DELETE', headers: { authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok && response.status !== 404)
    throw new Error(`Storage delete failed for ${path}: ${response.status} ${await response.text()}`);
};

const fieldValue = (document, field) => document.fields?.[field]?.stringValue;
const arrayValues = (document, field) => document.fields?.[field]?.arrayValue?.values ?? [];
const mapField = (value, field) => value?.mapValue?.fields?.[field]?.stringValue;
const storagePaths = (gallery) => [
  fieldValue(gallery, 'coverPath'),
  ...arrayValues(gallery, 'artworks').map((artwork) => mapField(artwork, 'storagePath')),
].filter(Boolean);

const expirationFilter = { fieldFilter: { field: { fieldPath: 'expiresAt' }, op: 'LESS_THAN_OR_EQUAL', value: { timestampValue: new Date().toISOString() } } };
const DELETE_CONCURRENCY = 12;

async function withConcurrency(values, task) {
  let cursor = 0;
  const worker = async () => {
    while (cursor < values.length) await task(values[cursor++]);
  };
  await Promise.all(Array.from({ length: Math.min(DELETE_CONCURRENCY, values.length) }, worker));
}

async function deleteExpiredArtworkDocuments() {
  let deleted = 0;
  while (true) {
    const documents = await runQuery({
      from: [{ collectionId: 'galleryArtworks' }],
      where: expirationFilter,
      limit: 500,
    });
    if (!documents.length) return deleted;
    await withConcurrency(documents, (document) => deleteDocument(document.name));
    deleted += documents.length;
  }
}

async function deleteExpiredGalleries() {
  let deleted = 0;
  let deletedObjects = 0;
  while (true) {
    const galleries = await runQuery({
      from: [{ collectionId: 'galleries' }],
      where: expirationFilter,
      limit: 100,
    });
    if (!galleries.length) return { deleted, deletedObjects };
    for (const gallery of galleries) {
      const paths = storagePaths(gallery);
      await withConcurrency(paths, deleteStorageObject);
      deletedObjects += paths.length;
      await deleteDocument(gallery.name);
      deleted += 1;
    }
  }
}

// Storage is removed before its gallery manifest, so a failed cleanup can be
// retried without leaving unreferenced paid objects behind.
const deletedAssets = await deleteExpiredArtworkDocuments();
const galleries = await deleteExpiredGalleries();
console.log(`Deleted ${galleries.deleted} expired galleries, ${galleries.deletedObjects} Storage objects, and ${deletedAssets} legacy artwork documents.`);
