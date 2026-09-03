if (!process.argv.includes('--execute')) {
  console.error('Dry-run guard: no live data changed. Re-run with --execute only after backup and review.');
  process.exit(2);
}

const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
if (projectId !== 'virtualartplattform')
  throw new Error('FIREBASE_PROJECT_ID must explicitly equal virtualartplattform.');
const accessToken = process.env.GOOGLE_OAUTH_ACCESS_TOKEN?.trim();
if (!accessToken)
  throw new Error('GOOGLE_OAUTH_ACCESS_TOKEN is required. Use short-lived Workload Identity credentials.');
const bucket = process.env.FIREBASE_STORAGE_BUCKET?.trim();
if (bucket !== 'virtualartplattform.firebasestorage.app')
  throw new Error('FIREBASE_STORAGE_BUCKET must explicitly equal the production bucket.');
const auth = { authorization: `Bearer ${accessToken}` };
const root = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
const query = await fetch(`${root}:runQuery`, {
  method: 'POST', headers: { ...auth, 'content-type': 'application/json' },
  body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'galleries' }], where: { fieldFilter: { field: { fieldPath: 'schemaVersion' }, op: 'EQUAL', value: { integerValue: '1' } } } } })
});
if (!query.ok) throw new Error(`Gallery query failed: ${query.status}`);
const galleries = (await query.json()).flatMap((item) => item.document ? [item.document] : []);
const decodeDataUrl = (source) => {
  const match = /^data:(image\/(?:avif|jpeg|png|webp));base64,(.+)$/i.exec(source || '');
  if (!match) throw new Error('Unsupported legacy image payload.');
  return { contentType: match[1].toLowerCase(), bytes: Buffer.from(match[2], 'base64') };
};
const upload = async (path, source, metadata) => {
  const { contentType, bytes } = decodeDataUrl(source);
  const response = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encodeURIComponent(path)}`, {
    method: 'POST', headers: { ...auth, 'content-type': contentType }, body: bytes
  });
  if (!response.ok) throw new Error(`Upload failed for ${path}: ${response.status} ${await response.text()}`);
  const object = await response.json();
  const metadataResponse = await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(path)}`, {
    method: 'PATCH',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({
      cacheControl: 'public,max-age=3600',
      metadata: { ...metadata, schemaVersion: '2' },
    }),
  });
  if (!metadataResponse.ok) {
    await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(path)}?ifGenerationMatch=${encodeURIComponent(object.generation)}`, { method: 'DELETE', headers: auth });
    throw new Error(`Metadata update failed for ${path}: ${metadataResponse.status} ${await metadataResponse.text()}`);
  }
};

let migrated = 0;
for (const gallery of galleries) {
  const fields = gallery.fields;
  const galleryId = gallery.name.split('/').at(-1);
  const ownerId = fields.ownerId?.stringValue;
  const expiresAt = fields.expiresAt?.timestampValue;
  const coverSrc = fields.coverSrc?.stringValue;
  const artworkValues = fields.artworks?.arrayValue?.values ?? [];
  if (!ownerId || !expiresAt || !coverSrc || !galleryId) continue;
  const expiresAtMs = String(new Date(expiresAt).getTime());
  const rootPath = `published/${ownerId}/${galleryId}`;
  const storageArtworkFields = [];
  for (let index = 0; index < artworkValues.length; index += 1) {
    const item = artworkValues[index].mapValue.fields;
    const assetId = item.assetId?.stringValue;
    if (!assetId) throw new Error(`Gallery ${galleryId} is missing legacy asset ${index}.`);
    const assetResponse = await fetch(`${root}/galleryArtworks/${encodeURIComponent(assetId)}`, { headers: auth });
    if (!assetResponse.ok) throw new Error(`Legacy asset ${assetId} could not be read.`);
    const asset = await assetResponse.json();
    const path = `${rootPath}/artworks/${index + 1}.webp`;
    await upload(path, asset.fields.src?.stringValue, { ownerId, galleryId, kind: 'artwork', expiresAtMs });
    const next = { ...item, src: { stringValue: '' }, storagePath: { stringValue: path } };
    delete next.assetId;
    storageArtworkFields.push({ mapValue: { fields: next } });
  }
  const coverPath = `${rootPath}/cover.webp`;
  await upload(coverPath, coverSrc, { ownerId, galleryId, kind: 'cover', expiresAtMs });
  const update = await fetch(`${root}/galleries/${encodeURIComponent(galleryId)}?updateMask.fieldPaths=artworks&updateMask.fieldPaths=coverPath&updateMask.fieldPaths=schemaVersion&updateMask.fieldPaths=coverSrc`, {
    method: 'PATCH', headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ fields: { artworks: { arrayValue: { values: storageArtworkFields } }, coverPath: { stringValue: coverPath }, schemaVersion: { integerValue: '2' } } })
  });
  if (!update.ok) throw new Error(`Gallery update failed for ${galleryId}: ${update.status} ${await update.text()}`);
  migrated += 1;
}
console.log(`Migrated ${migrated} legacy galleries. Legacy artwork documents remain for rollback and scheduled expiry cleanup.`);
