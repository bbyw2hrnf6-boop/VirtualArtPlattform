const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
if (projectId !== 'virtualartplattform')
  throw new Error('FIREBASE_PROJECT_ID must explicitly equal virtualartplattform.');
const accessToken = process.env.GOOGLE_OAUTH_ACCESS_TOKEN?.trim();
if (!accessToken)
  throw new Error('GOOGLE_OAUTH_ACCESS_TOKEN is required. Use short-lived Workload Identity credentials.');
const databaseDocumentRoot = `projects/${projectId}/databases/(default)/documents`;
const databaseRoot = `https://firestore.googleapis.com/v1/${databaseDocumentRoot}`;
const headers = { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' };
const storageBucket = process.env.FIREBASE_STORAGE_BUCKET?.trim();
if (storageBucket !== 'virtualartplattform.firebasestorage.app')
  throw new Error('FIREBASE_STORAGE_BUCKET must explicitly equal the production bucket.');

const runQuery = async (structuredQuery) => {
  const response = await fetch(`${databaseRoot}:runQuery`, { method: 'POST', headers, body: JSON.stringify({ structuredQuery }) });
  if (!response.ok) throw new Error(`Firestore query failed: ${response.status} ${await response.text()}`);
  return (await response.json()).flatMap((result) => result.document ? [result.document] : []);
};
const deleteDocument = async (name) => {
  const response = await fetch(`https://firestore.googleapis.com/v1/${name}`, { method: 'DELETE', headers });
  if (!response.ok && response.status !== 404) throw new Error(`Delete failed for ${name}: ${response.status}`);
};
const listCollectionDocuments = async (parentName, collectionId) => {
  const documents = [];
  let pageToken = '';
  do {
    const search = new URLSearchParams({ pageSize: '300' });
    if (pageToken) search.set('pageToken', pageToken);
    const response = await fetch(
      `https://firestore.googleapis.com/v1/${parentName}/${collectionId}?${search}`,
      { headers },
    );
    if (!response.ok)
      throw new Error(`Firestore list failed for ${parentName}/${collectionId}: ${response.status}`);
    const body = await response.json();
    documents.push(...(body.documents ?? []));
    pageToken = body.nextPageToken ?? '';
  } while (pageToken);
  return documents;
};
const deleteStorageObject = async (path) => {
  const response = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(storageBucket)}/o/${encodeURIComponent(path)}`,
    { method: 'DELETE', headers: { authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok && response.status !== 404)
    throw new Error(`Storage delete failed for ${path}: ${response.status} ${await response.text()}`);
};
const listStorageObjects = async (prefix) => {
  const paths = [];
  let pageToken = '';
  do {
    const search = new URLSearchParams({ prefix, maxResults: '1000' });
    if (pageToken) search.set('pageToken', pageToken);
    const response = await fetch(
      `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(storageBucket)}/o?${search}`,
      { headers: { authorization: `Bearer ${accessToken}` } },
    );
    if (!response.ok)
      throw new Error(`Storage list failed for ${prefix}: ${response.status} ${await response.text()}`);
    const body = await response.json();
    paths.push(...(body.items ?? []).map((item) => item.name).filter(Boolean));
    pageToken = body.nextPageToken ?? '';
  } while (pageToken);
  return paths;
};

const fieldValue = (document, field) => document.fields?.[field]?.stringValue;
const arrayValues = (document, field) => document.fields?.[field]?.arrayValue?.values ?? [];
const mapField = (value, field) => value?.mapValue?.fields?.[field]?.stringValue;
const storagePaths = (gallery) => [
  fieldValue(gallery, 'coverPath'),
  ...arrayValues(gallery, 'artworks').map((artwork) => mapField(artwork, 'storagePath')),
].filter(Boolean);

const expirationFilter = (fieldPath) => ({ fieldFilter: { field: { fieldPath }, op: 'LESS_THAN_OR_EQUAL', value: { timestampValue: new Date().toISOString() } } });
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
      where: expirationFilter('expiresAt'),
      limit: 500,
    });
    if (!documents.length) return deleted;
    await withConcurrency(documents, (document) => deleteDocument(document.name));
    deleted += documents.length;
  }
}

async function deleteExpiredDocuments(collectionId, fieldPath) {
  let deleted = 0;
  while (true) {
    const documents = await runQuery({
      from: [{ collectionId }],
      where: expirationFilter(fieldPath),
      limit: 500,
    });
    if (!documents.length) return deleted;
    await withConcurrency(documents, (document) => deleteDocument(document.name));
    deleted += documents.length;
  }
}

async function deleteExpiredPublicationPermits() {
  let deleted = 0;
  let deletedObjects = 0;
  while (true) {
    const documents = await runQuery({
      from: [{ collectionId: 'galleryPublishPermits' }],
      where: expirationFilter('permitExpiresAt'),
      limit: 100,
    });
    if (!documents.length) return { deleted, deletedObjects };
    for (const permit of documents) {
      const ownerId = fieldValue(permit, 'ownerId');
      const galleryId = fieldValue(permit, 'galleryId');
      if (ownerId && galleryId) {
        const galleryName = `${databaseDocumentRoot}/galleries/${galleryId}`;
        const response = await fetch(`https://firestore.googleapis.com/v1/${galleryName}`, { headers });
        if (response.status === 404) {
          const paths = await listStorageObjects(`published/${ownerId}/${galleryId}/`);
          await withConcurrency(paths, deleteStorageObject);
          deletedObjects += paths.length;
        } else if (!response.ok) {
          throw new Error(`Firestore permit probe failed for ${galleryId}: ${response.status}`);
        }
      }
      await deleteDocument(permit.name);
      deleted += 1;
    }
  }
}

async function deleteExpiredGalleries(fieldPath = 'expiresAt') {
  let deleted = 0;
  let deletedObjects = 0;
  let deletedMembers = 0;
  let deletedInvites = 0;
  while (true) {
    const galleries = await runQuery({
      from: [{ collectionId: 'galleries' }],
      where: expirationFilter(fieldPath),
      limit: 100,
    });
    if (!galleries.length) return { deleted, deletedObjects, deletedMembers, deletedInvites };
    for (const gallery of galleries) {
      const galleryId = gallery.name.split('/').at(-1);
      const ownerId = fieldValue(gallery, 'ownerId');
      const paths = ownerId && galleryId
        ? await listStorageObjects(`published/${ownerId}/${galleryId}/`)
        : storagePaths(gallery);
      await withConcurrency(paths, deleteStorageObject);
      deletedObjects += paths.length;
      const members = await listCollectionDocuments(gallery.name, 'members');
      await withConcurrency(members, (member) => deleteDocument(member.name));
      deletedMembers += members.length;
      const invites = await runQuery({
        from: [{ collectionId: 'galleryInvites' }],
        where: { fieldFilter: { field: { fieldPath: 'galleryId' }, op: 'EQUAL', value: { stringValue: galleryId } } },
        limit: 100,
      });
      await withConcurrency(invites, (invite) => deleteDocument(invite.name));
      deletedInvites += invites.length;
      await deleteDocument(`${databaseDocumentRoot}/galleryPublishPermits/${galleryId}`);
      await deleteDocument(gallery.name);
      deleted += 1;
    }
  }
}

// Storage is removed before its gallery manifest, so a failed cleanup can be
// retried without leaving unreferenced paid objects behind.
const deletedAssets = await deleteExpiredArtworkDocuments();
const expiredPermits = await deleteExpiredPublicationPermits();
const expiredInvites = await deleteExpiredDocuments('galleryInvites', 'expiresAt');
const trashed = await deleteExpiredGalleries('purgeAt');
const expired = await deleteExpiredGalleries('expiresAt');
console.log(`Deleted ${trashed.deleted} trashed and ${expired.deleted} expired galleries, ${trashed.deletedObjects + expired.deletedObjects + expiredPermits.deletedObjects} Storage objects, ${trashed.deletedMembers + expired.deletedMembers} access records, ${trashed.deletedInvites + expired.deletedInvites + expiredInvites} invitations, ${expiredPermits.deleted} expired permits, and ${deletedAssets} legacy artwork documents.`);
