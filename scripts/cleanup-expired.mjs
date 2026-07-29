import { createSign } from 'node:crypto';

const credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
if (!credentials.client_email || !credentials.private_key || !credentials.project_id) {
  throw new Error('FIREBASE_SERVICE_ACCOUNT must contain the complete service-account JSON.');
}

const encode = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
const issuedAt = Math.floor(Date.now() / 1000);
const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
  iss: credentials.client_email,
  scope: 'https://www.googleapis.com/auth/datastore',
  aud: 'https://oauth2.googleapis.com/token',
  iat: issuedAt,
  exp: issuedAt + 3600
})}`;
const signer = createSign('RSA-SHA256'); signer.update(unsigned); signer.end();
const assertion = `${unsigned}.${signer.sign(credentials.private_key, 'base64url')}`;
const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion })
});
if (!tokenResponse.ok) throw new Error(`Token request failed: ${tokenResponse.status}`);
const { access_token: accessToken } = await tokenResponse.json();
const databaseRoot = `https://firestore.googleapis.com/v1/projects/${credentials.project_id}/databases/(default)/documents`;
const headers = { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' };

const runQuery = async (structuredQuery) => {
  const response = await fetch(`${databaseRoot}:runQuery`, { method: 'POST', headers, body: JSON.stringify({ structuredQuery }) });
  if (!response.ok) throw new Error(`Firestore query failed: ${response.status} ${await response.text()}`);
  return (await response.json()).flatMap((result) => result.document ? [result.document] : []);
};
const deleteDocument = async (name) => {
  const response = await fetch(`https://firestore.googleapis.com/v1/${name}`, { method: 'DELETE', headers });
  if (!response.ok && response.status !== 404) throw new Error(`Delete failed for ${name}: ${response.status}`);
};

const expirationFilter = { fieldFilter: { field: { fieldPath: 'expiresAt' }, op: 'LESS_THAN_OR_EQUAL', value: { timestampValue: new Date().toISOString() } } };
const expiredAssets = await runQuery({
  from: [{ collectionId: 'galleryArtworks' }],
  where: expirationFilter,
  limit: 500
});
for (const asset of expiredAssets) await deleteDocument(asset.name);
const expired = await runQuery({
  from: [{ collectionId: 'galleries' }],
  where: expirationFilter,
  limit: 100
});
for (const gallery of expired) await deleteDocument(gallery.name);
console.log(`Deleted ${expired.length} expired galleries and ${expiredAssets.length} artwork documents.`);
