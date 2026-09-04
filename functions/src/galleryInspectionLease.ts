const SAFE_INVOCATION_ID = /^[A-Za-z0-9_-]{20,128}$/;

export const GALLERY_INSPECTION_MAX_ATTEMPTS = 5;
export const GALLERY_INSPECTION_LEASE_MS = 4 * 60_000;
export const GALLERY_INSPECTION_RETRY_DELAY_MS = 5_000;

type TimestampLike = Date | { toMillis: () => number };

export type GalleryInspectionLeasePatch = {
  inspectionAttempts: number;
  inspectionId: string;
  inspectionLeaseUntil: Date;
  inspectionStartedAt: Date;
};

function milliseconds(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === "object" && "toMillis" in value &&
    typeof (value as { toMillis?: unknown }).toMillis === "function")
    return (value as TimestampLike & { toMillis: () => number }).toMillis();
  return Number.NaN;
}

/**
 * Bound expensive image inspection per permit. A crashed invocation retains a
 * short lease; another invocation may safely take over after it expires.
 */
export function claimGalleryInspectionLease(
  permit: Record<string, unknown> | undefined,
  inspectionId: string,
  nowMs: number,
): GalleryInspectionLeasePatch {
  if (!permit || !SAFE_INVOCATION_ID.test(inspectionId) || !Number.isSafeInteger(nowMs) || nowMs < 0)
    throw new Error("inspection-state-invalid");
  const attempts = permit.inspectionAttempts === undefined ? 0 : Number(permit.inspectionAttempts);
  if (!Number.isSafeInteger(attempts) || attempts < 0 || attempts > GALLERY_INSPECTION_MAX_ATTEMPTS)
    throw new Error("inspection-state-invalid");
  if (permit.inspectionId === inspectionId) {
    const leaseUntil = milliseconds(permit.inspectionLeaseUntil);
    const startedAt = milliseconds(permit.inspectionStartedAt);
    if (!Number.isSafeInteger(leaseUntil) || !Number.isSafeInteger(startedAt))
      throw new Error("inspection-state-invalid");
    return {
      inspectionAttempts: attempts,
      inspectionId,
      inspectionLeaseUntil: new Date(leaseUntil),
      inspectionStartedAt: new Date(startedAt),
    };
  }
  const leaseUntil = milliseconds(permit.inspectionLeaseUntil);
  if (Number.isFinite(leaseUntil) && leaseUntil > nowMs) throw new Error("inspection-busy");
  const assetUploadLeaseUntil = milliseconds(permit.assetUploadLeaseUntil);
  if (Number.isFinite(assetUploadLeaseUntil) && assetUploadLeaseUntil > nowMs)
    throw new Error("inspection-busy");
  if (attempts >= GALLERY_INSPECTION_MAX_ATTEMPTS) throw new Error("inspection-attempt-limit");
  const lastAttempt = milliseconds(permit.inspectionStartedAt);
  if (Number.isFinite(lastAttempt) && lastAttempt + GALLERY_INSPECTION_RETRY_DELAY_MS > nowMs)
    throw new Error("inspection-backoff");
  return {
    inspectionAttempts: attempts + 1,
    inspectionId,
    inspectionLeaseUntil: new Date(nowMs + GALLERY_INSPECTION_LEASE_MS),
    inspectionStartedAt: new Date(nowMs),
  };
}

export function ownsGalleryInspectionLease(
  permit: Record<string, unknown> | undefined,
  inspectionId: string,
  nowMs: number,
) {
  return Boolean(
    permit
    && permit.inspectionId === inspectionId
    && milliseconds(permit.inspectionLeaseUntil) > nowMs,
  );
}

export function releasableGalleryInspectionLease(
  permit: Record<string, unknown> | undefined,
  inspectionId: string,
) {
  return Boolean(permit && permit.inspectionId === inspectionId);
}
