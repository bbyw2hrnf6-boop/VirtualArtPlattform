export type AccountExportLease = {
  schemaVersion: 1;
  id: string;
  jobId: string;
  revision: number;
  expiresAtEpochMilliseconds: number;
};

const LEASE_ID = /^[a-f0-9]{32}$/;
const JOB_ID = /^[A-Za-z0-9_-]{20,128}$/;
export const ACCOUNT_EXPORT_CALLABLE_TIMEOUT_SECONDS = 300;
export const ACCOUNT_EXPORT_LEASE_MILLISECONDS =
  (ACCOUNT_EXPORT_CALLABLE_TIMEOUT_SECONDS * 1_000) + 30_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function validLease(value: unknown): value is AccountExportLease {
  return isRecord(value) && Object.keys(value).sort().join("\u0000") ===
    "expiresAtEpochMilliseconds\u0000id\u0000jobId\u0000revision\u0000schemaVersion" &&
    value.schemaVersion === 1 && typeof value.id === "string" && LEASE_ID.test(value.id) &&
    typeof value.jobId === "string" && JOB_ID.test(value.jobId) &&
    typeof value.revision === "number" && Number.isSafeInteger(value.revision) && value.revision >= 0 &&
    typeof value.expiresAtEpochMilliseconds === "number" &&
    Number.isSafeInteger(value.expiresAtEpochMilliseconds) && value.expiresAtEpochMilliseconds > 0;
}

export function claimAccountExportLease({
  current,
  id,
  jobId,
  revision,
  nowEpochMilliseconds,
}: {
  current: unknown;
  id: string;
  jobId: string;
  revision: number;
  nowEpochMilliseconds: number;
}): { acquired: true; lease: AccountExportLease } | { acquired: false; retryAfterMilliseconds: number } {
  if (!LEASE_ID.test(id) || !JOB_ID.test(jobId) || !Number.isSafeInteger(revision) || revision < 0 ||
    !Number.isSafeInteger(nowEpochMilliseconds) || nowEpochMilliseconds < 1)
    throw new Error("export-lease-invalid");
  // Firestore may acknowledge a transaction ambiguously and rerun its callback.
  // The same invocation must recognize the exact lease it already wrote instead
  // of stranding itself behind that lease for the full callable deadline.
  if (validLease(current) && current.id === id && current.jobId === jobId &&
    current.revision === revision && current.expiresAtEpochMilliseconds > nowEpochMilliseconds) {
    return { acquired: true, lease: current };
  }
  if (validLease(current) && current.jobId === jobId && current.revision === revision &&
    current.expiresAtEpochMilliseconds > nowEpochMilliseconds) {
    return {
      acquired: false,
      retryAfterMilliseconds: Math.min(
        ACCOUNT_EXPORT_LEASE_MILLISECONDS,
        current.expiresAtEpochMilliseconds - nowEpochMilliseconds,
      ),
    };
  }
  return {
    acquired: true,
    lease: {
      schemaVersion: 1,
      id,
      jobId,
      revision,
      expiresAtEpochMilliseconds: nowEpochMilliseconds + ACCOUNT_EXPORT_LEASE_MILLISECONDS,
    },
  };
}

export function ownsAccountExportLease(
  value: unknown,
  expected: Pick<AccountExportLease, "id" | "jobId" | "revision">,
) {
  return validLease(value) && value.id === expected.id && value.jobId === expected.jobId &&
    value.revision === expected.revision;
}
