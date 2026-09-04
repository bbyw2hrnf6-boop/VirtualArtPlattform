export const DEFAULT_LIFECYCLE_PAGE_SIZE = 100;
export const DEFAULT_LIFECYCLE_MAX_DELETIONS = 10_000;
export const DEFAULT_LIFECYCLE_DELETE_CONCURRENCY = 12;
// Longer than the four-minute trusted inspection lease and the two-minute
// server-upload lease. Destructive expiry work starts only after every
// invocation that could have been authorized before expiry must have ended.
export const LIFECYCLE_DESTRUCTIVE_SETTLE_DELAY_MS = 5 * 60_000;

export function galleryCleanupDecision({
  fieldPath,
  lifecycleStatus,
  expiresAtMs,
  purgeAtMs,
  cleanupReason,
  cutoffMs,
}) {
  if (!['expiresAt', 'purgeAt'].includes(fieldPath) || !Number.isFinite(cutoffMs))
    throw new Error('Gallery cleanup decision input is invalid.');
  const candidateAt = fieldPath === 'expiresAt' ? expiresAtMs : purgeAtMs;
  if (!Number.isFinite(candidateAt) || candidateAt > cutoffMs) return { action: 'skip' };
  const status = lifecycleStatus ?? 'active';
  if (status === 'purging') return { action: 'resume', reason: cleanupReason ?? fieldPath };
  if (fieldPath === 'purgeAt' && status !== 'trashed') return { action: 'clear-stale-purge' };
  if (fieldPath === 'expiresAt' && status === 'trashed' && Number.isFinite(purgeAtMs) && purgeAtMs > cutoffMs)
    return { action: 'defer-expiry', expiresAtMs: purgeAtMs };
  return { action: 'claim' };
}

export function galleryPermitCleanupDecision({
  permitExpiresAtMs,
  assetUploadLeaseUntilMs,
  cutoffMs,
}) {
  if (!Number.isFinite(cutoffMs)) throw new Error('Permit cleanup cutoff is invalid.');
  if (!Number.isFinite(permitExpiresAtMs) || permitExpiresAtMs > cutoffMs)
    return { action: 'skip' };
  if (Number.isFinite(assetUploadLeaseUntilMs) && assetUploadLeaseUntilMs > cutoffMs)
    return { action: 'postpone', permitExpiresAtMs: assetUploadLeaseUntilMs + 60_000 };
  return { action: 'claim' };
}

export function boundedPositiveInteger(value, {
  label,
  fallback,
  minimum = 1,
  maximum,
}) {
  if (value === undefined || value === "") return fallback;
  if (!/^[0-9]+$/.test(String(value)))
    throw new Error(`${label} must be a whole number.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum)
    throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
  return parsed;
}

export class LifecycleWorkBudget {
  #remaining;
  #deadline;

  constructor({ maximumItems = DEFAULT_LIFECYCLE_MAX_DELETIONS, deadline }) {
    if (!Number.isSafeInteger(maximumItems) || maximumItems < 1)
      throw new Error("Lifecycle work budget must be a positive safe integer.");
    if (!Number.isFinite(deadline)) throw new Error("Lifecycle deadline must be finite.");
    this.#remaining = maximumItems;
    this.#deadline = deadline;
  }

  get remaining() {
    return this.#remaining;
  }

  get exhausted() {
    return this.#remaining === 0 || Date.now() >= this.#deadline;
  }

  take(requested) {
    if (!Number.isSafeInteger(requested) || requested < 0)
      throw new Error("Requested lifecycle work must be a non-negative safe integer.");
    if (Date.now() >= this.#deadline) return 0;
    const granted = Math.min(requested, this.#remaining);
    this.#remaining -= granted;
    return granted;
  }
}

export async function withConcurrency(values, concurrency, task) {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1)
    throw new Error("Concurrency must be a positive safe integer.");
  let cursor = 0;
  const results = new Array(values.length);
  const worker = async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(values[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

/**
 * Repeatedly fetches the first page and removes it. Avoiding a continuation
 * token while mutating the result set prevents deletes from skipping later
 * records. A shared budget makes interruption resumable on the next run.
 */
export async function drainDestructivePages({
  fetchPage,
  deleteItem,
  budget,
  pageSize = DEFAULT_LIFECYCLE_PAGE_SIZE,
  concurrency = DEFAULT_LIFECYCLE_DELETE_CONCURRENCY,
}) {
  let deleted = 0;
  while (!budget.exhausted) {
    const page = await fetchPage(pageSize);
    if (!Array.isArray(page)) throw new Error("Lifecycle page must be an array.");
    if (page.length > pageSize) throw new Error("Lifecycle page exceeded its requested bound.");
    if (!page.length) return { deleted, complete: true };
    const granted = budget.take(page.length);
    if (!granted) return { deleted, complete: false };
    const results = await withConcurrency(page.slice(0, granted), concurrency, deleteItem);
    // A conditional delete returning false means the candidate changed after
    // the query. That is a safe skip, not a deletion, and must not inflate the
    // audit count.
    deleted += results.filter((result) => result !== false).length;
    if (granted < page.length) return { deleted, complete: false };
  }
  return { deleted, complete: false };
}
