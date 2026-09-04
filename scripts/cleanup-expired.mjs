import {
  LifecycleWorkBudget,
  LIFECYCLE_DESTRUCTIVE_SETTLE_DELAY_MS,
  boundedPositiveInteger,
  drainDestructivePages,
  galleryCleanupDecision,
  galleryPermitCleanupDecision,
  withConcurrency,
} from './lib/lifecycle-batches.mjs';

const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
if (projectId !== 'virtualartplattform')
  throw new Error('FIREBASE_PROJECT_ID must explicitly equal virtualartplattform.');
const accessToken = process.env.GOOGLE_OAUTH_ACCESS_TOKEN?.trim();
if (!accessToken)
  throw new Error('GOOGLE_OAUTH_ACCESS_TOKEN is required. Use short-lived Workload Identity credentials.');
const storageBucket = process.env.FIREBASE_STORAGE_BUCKET?.trim();
if (storageBucket !== 'virtualartplattform.firebasestorage.app')
  throw new Error('FIREBASE_STORAGE_BUCKET must explicitly equal the production bucket.');

const maximumDeletions = boundedPositiveInteger(process.env.CLEANUP_MAX_DELETIONS, {
  label: 'CLEANUP_MAX_DELETIONS', fallback: 10_000, minimum: 100, maximum: 50_000,
});
const maximumRuntimeSeconds = boundedPositiveInteger(process.env.CLEANUP_MAX_RUNTIME_SECONDS, {
  label: 'CLEANUP_MAX_RUNTIME_SECONDS', fallback: 12 * 60, minimum: 60, maximum: 13 * 60,
});
const startedAt = Date.now();
const deadline = startedAt + maximumRuntimeSeconds * 1_000;
const expirationCutoff = new Date(startedAt).toISOString();
const settledExpirationCutoff = new Date(
  startedAt - LIFECYCLE_DESTRUCTIVE_SETTLE_DELAY_MS,
).toISOString();
const legacyUnsubscribeTokenCutoff = new Date(startedAt - 365 * 24 * 60 * 60 * 1_000).toISOString();
const budget = new LifecycleWorkBudget({ maximumItems: maximumDeletions, deadline });

const databaseDocumentRoot = `projects/${projectId}/databases/(default)/documents`;
const databaseRoot = `https://firestore.googleapis.com/v1/${databaseDocumentRoot}`;
const headers = { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' };
const DELETE_CONCURRENCY = 12;
const QUERY_PAGE_SIZE = 100;

const request = async (url, options = {}) => {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error('Cleanup runtime budget elapsed. Retry resumes safely.');
  return fetch(url, { ...options, signal: AbortSignal.timeout(Math.min(30_000, remaining)) });
};

const runQuery = async (structuredQuery) => {
  const response = await request(`${databaseRoot}:runQuery`, {
    method: 'POST', headers, body: JSON.stringify({ structuredQuery }),
  });
  if (!response.ok) throw new Error(`Firestore query failed: ${response.status}`);
  return (await response.json()).flatMap((result) => result.document ? [result.document] : []);
};
const lostFirestorePrecondition = async (response) => {
  if ([404, 409, 412].includes(response.status)) return true;
  if (response.status !== 400) return false;
  const payload = await response.clone().json().catch(() => undefined);
  return ['FAILED_PRECONDITION', 'ABORTED'].includes(payload?.error?.status)
    || [9, 10].includes(payload?.error?.code);
};
const deleteDocument = async (name, updateTime) => {
  const url = new URL(`https://firestore.googleapis.com/v1/${name}`);
  if (updateTime) url.searchParams.set('currentDocument.updateTime', updateTime);
  const response = await request(url, { method: 'DELETE', headers });
  if (response.ok) return true;
  if (response.status === 404) return false;
  if (await lostFirestorePrecondition(response)) return false;
  throw new Error(`Delete failed for ${name}: ${response.status}`);
};
const patchDocumentFields = async (document, fields, deleteFields = []) => {
  if (typeof document?.name !== 'string' || typeof document?.updateTime !== 'string')
    throw new Error('Firestore cleanup candidate is missing its update-time precondition.');
  const url = new URL(`https://firestore.googleapis.com/v1/${document.name}`);
  [...Object.keys(fields), ...deleteFields]
    .forEach((field) => url.searchParams.append('updateMask.fieldPaths', field));
  url.searchParams.set('currentDocument.updateTime', document.updateTime);
  const response = await request(url, {
    method: 'PATCH', headers, body: JSON.stringify({ name: document.name, fields }),
  });
  if (await lostFirestorePrecondition(response)) return undefined;
  if (!response.ok) throw new Error(`Cleanup claim failed for ${document.name}: ${response.status}`);
  return response.json();
};
const listCollectionPage = async (parentName, collectionId, pageSize) => {
  const search = new URLSearchParams({ pageSize: String(pageSize) });
  const response = await request(`https://firestore.googleapis.com/v1/${parentName}/${collectionId}?${search}`, { headers });
  if (!response.ok) throw new Error(`Firestore list failed for ${parentName}/${collectionId}: ${response.status}`);
  return (await response.json()).documents ?? [];
};
const deleteStorageObject = async (path) => {
  const response = await request(
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(storageBucket)}/o/${encodeURIComponent(path)}`,
    { method: 'DELETE', headers: { authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok && response.status !== 404) throw new Error(`Storage delete failed for ${path}: ${response.status}`);
};
const listStoragePage = async (prefix, pageSize) => {
  const search = new URLSearchParams({ prefix, maxResults: String(pageSize) });
  const response = await request(
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(storageBucket)}/o?${search}`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) throw new Error(`Storage list failed for ${prefix}: ${response.status}`);
  return ((await response.json()).items ?? []).map((item) => item.name).filter(Boolean);
};

const fieldValue = (document, field) => document.fields?.[field]?.stringValue;
const timestampValue = (document, field) => document.fields?.[field]?.timestampValue;
const arrayValues = (document, field) => document.fields?.[field]?.arrayValue?.values ?? [];
const mapField = (value, field) => value?.mapValue?.fields?.[field]?.stringValue;
const safeSegment = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const storagePaths = (gallery) => [
  fieldValue(gallery, 'coverPath'),
  ...arrayValues(gallery, 'artworks').map((artwork) => mapField(artwork, 'storagePath')),
].filter(Boolean);
const revisionStoragePrefix = (permit) => {
  const ownerId = fieldValue(permit, 'ownerId');
  const galleryId = fieldValue(permit, 'galleryId');
  const revisionId = fieldValue(permit, 'revisionId');
  return safeSegment(ownerId) && safeSegment(galleryId) && safeSegment(revisionId)
    ? `published/${ownerId}/${galleryId}/revisions/${revisionId}/`
    : undefined;
};
const retirementStoragePaths = (retirement) => {
  const ownerId = fieldValue(retirement, 'ownerId');
  const galleryId = fieldValue(retirement, 'galleryId');
  if (!safeSegment(ownerId) || !safeSegment(galleryId)) return undefined;
  const prefix = `published/${ownerId}/${galleryId}/`;
  const rawPaths = arrayValues(retirement, 'paths').map((value) => value?.stringValue);
  const paths = rawPaths.filter((path) => typeof path === 'string' && path.startsWith(prefix) && (
      path === `${prefix}cover.webp`
      || /^artworks\/(?:[1-9]|1[0-4])[.]webp$/.test(path.slice(prefix.length))
      || /^revisions\/[A-Za-z0-9_-]{1,128}\/(?:cover[.]webp|artworks\/(?:[1-9]|1[0-4])[.]webp)$/.test(path.slice(prefix.length))
    ));
  return rawPaths.length <= 15 && paths.length === rawPaths.length && new Set(paths).size === paths.length
    ? paths
    : undefined;
};
const expirationFilter = (fieldPath, timestampValue = expirationCutoff) => ({ fieldFilter: {
  field: { fieldPath }, op: 'LESS_THAN_OR_EQUAL', value: { timestampValue },
} });

async function claimExpiredPermit(candidate) {
  const permit = await getDocument(candidate.name, 'permit claim');
  if (!permit) return undefined;
  const decision = galleryPermitCleanupDecision({
    permitExpiresAtMs: Date.parse(timestampValue(permit, 'permitExpiresAt') ?? ''),
    assetUploadLeaseUntilMs: Date.parse(timestampValue(permit, 'assetUploadLeaseUntil') ?? ''),
    cutoffMs: startedAt,
  });
  if (decision.action === 'skip') return undefined;
  if (decision.action === 'postpone') {
    // Move the query cursor out of the current cutoff instead of repeatedly
    // selecting or draining a permit whose upload callable can still write.
    await patchDocumentFields(permit, {
      permitExpiresAt: {
        timestampValue: new Date(decision.permitExpiresAtMs).toISOString(),
      },
    });
    return undefined;
  }
  if (fieldValue(permit, 'status') === 'cleanup') return permit;
  return patchDocumentFields(permit, {
    status: { stringValue: 'cleanup' },
    cleanupClaimedAt: { timestampValue: expirationCutoff },
  });
}

async function claimGalleryForCleanup(candidate, fieldPath) {
  const gallery = await getDocument(candidate.name, 'gallery cleanup claim');
  if (!gallery) return undefined;
  const status = fieldValue(gallery, 'lifecycleStatus') ?? 'active';
  const reason = fieldValue(gallery, 'cleanupReason');
  const decision = galleryCleanupDecision({
    fieldPath,
    lifecycleStatus: status,
    expiresAtMs: Date.parse(timestampValue(gallery, 'expiresAt') ?? ''),
    purgeAtMs: Date.parse(timestampValue(gallery, 'purgeAt') ?? ''),
    cleanupReason: reason,
    cutoffMs: startedAt,
  });
  if (decision.action === 'skip') return undefined;
  if (decision.action === 'resume') return gallery;
  if (decision.action === 'clear-stale-purge') {
    await patchDocumentFields(gallery, {}, [
      'purgeAt', 'trashedAt', 'preTrashExpiresAt', 'cleanupReason', 'cleanupClaimedAt',
    ]);
    return undefined;
  }
  if (decision.action === 'defer-expiry') {
    // Existing trashed records may predate the invariant that expiry never
    // shortens the recovery window. Move expiry forward with an update-time
    // precondition so this query does not starve later candidates.
    await patchDocumentFields(gallery, {
      expiresAt: { timestampValue: new Date(decision.expiresAtMs).toISOString() },
      ...(timestampValue(gallery, 'preTrashExpiresAt') ? {} : {
        preTrashExpiresAt: { timestampValue: timestampValue(gallery, 'expiresAt') },
      }),
    });
    return undefined;
  }
  return patchDocumentFields(gallery, {
    lifecycleStatus: { stringValue: 'purging' },
    cleanupReason: { stringValue: fieldPath },
    cleanupClaimedAt: { timestampValue: expirationCutoff },
  });
}

async function deleteKnownItems(items, deleteItem) {
  const unique = [...new Set(items)];
  const granted = budget.take(unique.length);
  const results = await withConcurrency(
    unique.slice(0, granted), DELETE_CONCURRENCY, deleteItem,
  );
  return {
    deleted: results.filter((result) => result !== false).length,
    complete: granted === unique.length,
  };
}
async function drainStoragePrefix(prefix) {
  return drainDestructivePages({
    fetchPage: (pageSize) => listStoragePage(prefix, pageSize),
    deleteItem: deleteStorageObject, budget, pageSize: QUERY_PAGE_SIZE, concurrency: DELETE_CONCURRENCY,
  });
}
async function drainChildCollection(parentName, collectionId) {
  return drainDestructivePages({
    fetchPage: (pageSize) => listCollectionPage(parentName, collectionId, pageSize),
    deleteItem: (document) => deleteDocument(document.name, document.updateTime),
    budget, pageSize: QUERY_PAGE_SIZE, concurrency: DELETE_CONCURRENCY,
  });
}
async function drainMatchingDocuments(collectionId, where, pageSize = QUERY_PAGE_SIZE) {
  return drainDestructivePages({
    fetchPage: (limit) => runQuery({ from: [{ collectionId }], where, limit }),
    // A matching record can be renewed between the query and delete (notably
    // deterministic invitation IDs). Delete only the exact version queried.
    deleteItem: (document) => deleteDocument(document.name, document.updateTime),
    budget, pageSize, concurrency: DELETE_CONCURRENCY,
  });
}

async function getDocument(name, label) {
  const response = await request(`https://firestore.googleapis.com/v1/${name}`, { headers });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`Firestore ${label} probe failed: ${response.status}`);
  return response.json();
}

async function deleteExpiredPublicationPermits() {
  let deleted = 0;
  let deletedObjects = 0;
  while (!budget.exhausted) {
    const permits = await runQuery({
      from: [{ collectionId: 'galleryPublishPermits' }],
      where: expirationFilter('permitExpiresAt', settledExpirationCutoff),
      limit: 25,
    });
    if (!permits.length) return { deleted, deletedObjects, complete: true };
    for (const candidate of permits) {
      const permit = await claimExpiredPermit(candidate);
      if (!permit) continue;
      const ownerId = fieldValue(permit, 'ownerId');
      const galleryId = fieldValue(permit, 'galleryId');
      if (ownerId && galleryId) {
        const galleryName = `${databaseDocumentRoot}/galleries/${galleryId}`;
        const gallery = await getDocument(galleryName, `permit ${galleryId}`);
        if (!gallery) {
          const objects = await drainStoragePrefix(`published/${ownerId}/${galleryId}/`);
          deletedObjects += objects.deleted;
          if (!objects.complete) return { deleted, deletedObjects, complete: false };
        }
      }
      if (!budget.take(1)) return { deleted, deletedObjects, complete: false };
      if (!await deleteDocument(permit.name, permit.updateTime)) continue;
      deleted += 1;
    }
  }
  return { deleted, deletedObjects, complete: false };
}

async function deleteExpiredRevisionPermits() {
  let deleted = 0;
  let deletedObjects = 0;
  while (!budget.exhausted) {
    const permits = await runQuery({
      from: [{ collectionId: 'galleryRevisionPermits' }],
      where: expirationFilter('permitExpiresAt', settledExpirationCutoff),
      limit: 25,
    });
    if (!permits.length) return { deleted, deletedObjects, complete: true };
    for (const candidate of permits) {
      const permit = await claimExpiredPermit(candidate);
      if (!permit) continue;
      const galleryId = fieldValue(permit, 'galleryId');
      const prefix = revisionStoragePrefix(permit);
      if (safeSegment(galleryId) && prefix) {
        const gallery = await getDocument(
          `${databaseDocumentRoot}/galleries/${galleryId}`,
          `revision permit ${galleryId}`,
        );
        // A committed revision may be referenced by the live manifest. Keep
        // those objects while removing the stale permit; abandoned namespaces
        // are safe to drain and will resume from the same prefix after a cap.
        if (!gallery || !storagePaths(gallery).some((path) => path.startsWith(prefix))) {
          const objects = await drainStoragePrefix(prefix);
          deletedObjects += objects.deleted;
          if (!objects.complete) return { deleted, deletedObjects, complete: false };
        }
      }
      if (!budget.take(1)) return { deleted, deletedObjects, complete: false };
      if (!await deleteDocument(permit.name, permit.updateTime)) continue;
      deleted += 1;
    }
  }
  return { deleted, deletedObjects, complete: false };
}

async function deleteGalleryAssetRetirements() {
  let deleted = 0;
  let deletedObjects = 0;
  while (!budget.exhausted) {
    const candidates = await runQuery({
      from: [{ collectionId: 'galleryAssetRetirements' }],
      where: { fieldFilter: {
        field: { fieldPath: 'status' },
        op: 'IN',
        value: { arrayValue: { values: [
          { stringValue: 'pending' },
          { stringValue: 'cleanup' },
        ] } },
      } },
      limit: 25,
    });
    if (!candidates.length) return { deleted, deletedObjects, complete: true };
    for (const candidate of candidates) {
      const fresh = await getDocument(candidate.name, 'asset retirement claim');
      if (!fresh) continue;
      const retirement = fieldValue(fresh, 'status') === 'cleanup'
        ? fresh
        : await patchDocumentFields(fresh, {
            status: { stringValue: 'cleanup' },
            cleanupClaimedAt: { timestampValue: expirationCutoff },
          });
      if (!retirement) continue;
      const galleryId = fieldValue(retirement, 'galleryId');
      const gallery = safeSegment(galleryId)
        ? await getDocument(`${databaseDocumentRoot}/galleries/${galleryId}`, `retirement ${galleryId}`)
        : undefined;
      const current = new Set(gallery ? storagePaths(gallery) : []);
      const retirementPaths = retirementStoragePaths(retirement);
      if (!retirementPaths) {
        // Quarantine a malformed trusted record instead of letting one bad
        // item poison every future lifecycle run. No unvalidated path is ever
        // passed to Storage deletion.
        await patchDocumentFields(retirement, {
          status: { stringValue: 'invalid' },
          failureCode: { stringValue: 'invalid-retirement-paths' },
        });
        console.warn(`Quarantined invalid asset retirement record: ${retirement.name}`);
        continue;
      }
      const paths = retirementPaths.filter((path) => !current.has(path));
      const objects = await deleteKnownItems(paths, deleteStorageObject);
      deletedObjects += objects.deleted;
      if (!objects.complete) return { deleted, deletedObjects, complete: false };
      if (!budget.take(1)) return { deleted, deletedObjects, complete: false };
      if (!await deleteDocument(retirement.name, retirement.updateTime)) continue;
      deleted += 1;
    }
  }
  return { deleted, deletedObjects, complete: false };
}

async function deleteExpiredGalleries(fieldPath) {
  const totals = {
    deleted: 0,
    deletedObjects: 0,
    deletedMembers: 0,
    deletedInvites: 0,
    deletedRevisionPermits: 0,
    complete: true,
  };
  while (!budget.exhausted) {
    const galleries = await runQuery({
      from: [{ collectionId: 'galleries' }],
      where: expirationFilter(
        fieldPath,
        fieldPath === 'expiresAt' ? settledExpirationCutoff : expirationCutoff,
      ),
      limit: 25,
    });
    if (!galleries.length) return totals;
    for (const candidate of galleries) {
      const gallery = await claimGalleryForCleanup(candidate, fieldPath);
      if (!gallery) continue;
      const galleryId = gallery.name.split('/').at(-1);
      const ownerId = fieldValue(gallery, 'ownerId');
      const objects = ownerId && galleryId
        ? await drainStoragePrefix(`published/${ownerId}/${galleryId}/`)
        : await deleteKnownItems(storagePaths(gallery), deleteStorageObject);
      totals.deletedObjects += objects.deleted;
      if (!objects.complete) return { ...totals, complete: false };
      const members = await drainChildCollection(gallery.name, 'members');
      totals.deletedMembers += members.deleted;
      if (!members.complete) return { ...totals, complete: false };
      const invites = await drainMatchingDocuments('galleryInvites', { fieldFilter: {
        field: { fieldPath: 'galleryId' }, op: 'EQUAL', value: { stringValue: galleryId },
      } });
      totals.deletedInvites += invites.deleted;
      if (!invites.complete) return { ...totals, complete: false };
      const revisionPermits = await drainMatchingDocuments('galleryRevisionPermits', { fieldFilter: {
        field: { fieldPath: 'galleryId' }, op: 'EQUAL', value: { stringValue: galleryId },
      } });
      totals.deletedRevisionPermits += revisionPermits.deleted;
      if (!revisionPermits.complete) return { ...totals, complete: false };
      if (!galleryId || budget.take(2) !== 2) return { ...totals, complete: false };
      await deleteDocument(`${databaseDocumentRoot}/galleryPublishPermits/${galleryId}`);
      if (!await deleteDocument(gallery.name, gallery.updateTime))
        return { ...totals, complete: false };
      totals.deleted += 1;
    }
  }
  return { ...totals, complete: false };
}

// Dependencies are removed before roots. When a cap is reached, a query-visible
// root remains and the next scheduled/manual invocation safely resumes it.
const trashed = await deleteExpiredGalleries('purgeAt');
const expired = await deleteExpiredGalleries('expiresAt');
const expiredPermits = await deleteExpiredPublicationPermits();
const expiredRevisionPermits = await deleteExpiredRevisionPermits();
const assetRetirements = await deleteGalleryAssetRetirements();
const expiredInvites = await drainMatchingDocuments('galleryInvites', expirationFilter('expiresAt'));
const expiredTokens = await drainMatchingDocuments('newsletterUnsubscribeTokens', expirationFilter('expiresAt'));
const legacyTokens = await drainMatchingDocuments(
  'newsletterUnsubscribeTokens',
  expirationFilter('createdAt', legacyUnsubscribeTokenCutoff),
);
const usedTokens = await drainMatchingDocuments('newsletterUnsubscribeTokens', expirationFilter('usedAt'));
const deletedAssets = await drainMatchingDocuments('galleryArtworks', expirationFilter('expiresAt'));
const complete = [trashed, expired, expiredPermits, expiredRevisionPermits, assetRetirements, expiredInvites, expiredTokens, legacyTokens, usedTokens, deletedAssets]
  .every((result) => result.complete);

console.log(`Deleted ${trashed.deleted} trashed and ${expired.deleted} expired galleries, ${trashed.deletedObjects + expired.deletedObjects + expiredPermits.deletedObjects + expiredRevisionPermits.deletedObjects + assetRetirements.deletedObjects} Storage objects, ${trashed.deletedMembers + expired.deletedMembers} access records, ${trashed.deletedInvites + expired.deletedInvites + expiredInvites.deleted} invitations, ${expiredPermits.deleted} initial permits, ${trashed.deletedRevisionPermits + expired.deletedRevisionPermits + expiredRevisionPermits.deleted} revision permits, ${assetRetirements.deleted} asset-retirement records, ${expiredTokens.deleted + legacyTokens.deleted + usedTokens.deleted} expired/used unsubscribe tokens, and ${deletedAssets.deleted} legacy artwork documents.`);
if (!complete)
  console.warn(`Cleanup stopped at its bounded work limit with ${budget.remaining} deletion slots unused; the next run will resume.`);
