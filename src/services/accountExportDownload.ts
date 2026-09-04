export type ManagedAccountExportStatus = {
  format: "aura-account-export-job";
  schemaVersion: 1;
  jobId: string;
  status: "running" | "complete";
  exportedAt: string;
  expiresAt: string;
  completedParts: number;
  completedRecords: number;
  completedBytes: number;
};

export type ManagedAccountExportPart = {
  format: "aura-account-export-part-response";
  schemaVersion: 1;
  jobId: string;
  sequence: number;
  body: string;
  sha256: string;
};

const JOB_ID = /^[A-Za-z0-9_-]{20,128}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_PARTS = 4_096;
const MAX_RECORDS = 1_000_000;
const MAX_BYTES = 512 * 1024 * 1024;
const MAX_PART_BYTES = 600 * 1024;
const MAX_PAGE_RECORDS = 100;

export const ACCOUNT_EXPORT_BUFFER_FALLBACK_MAX_BYTES = 64 * 1024 * 1024;
export const MANAGED_ACCOUNT_EXPORT_SECTIONS = [
  "account",
  "profile",
  "newsletter",
  "publicationUsage",
  "ownedSpaceManifests",
  "ownedSpaceMembers",
  "ownedSpaceMedia",
  "sharedSpaces",
  "receivedInvitations",
  "sentInvitations",
  "submittedModerationReports",
  "operationalState",
  "creatorPublicProfile",
  "creatorAliases",
  "creatorPosts",
  "creatorFollowing",
  "creatorFollowers",
  "creatorBlocks",
  "creatorReports",
  "creatorComments",
  "creatorReactions",
  "creatorNotifications",
] as const;
// A transition may emit one part or advance one empty section. Match the
// server's full 4,096-part state machine instead of abandoning a valid large
// export halfway through it.
export const MAX_MANAGED_ACCOUNT_EXPORT_CONTINUATION_CALLS =
  MAX_PARTS + MANAGED_ACCOUNT_EXPORT_SECTIONS.length;

export type ManagedAccountExportRequest =
  | { action: "start"; requestId: string }
  | { action: "continue" | "status"; jobId: string }
  | { action: "part"; jobId: string; sequence: number };

export type AccountExportTextWriter = {
  maximumBytes?: number;
  write(value: string): Promise<void>;
  close(): Promise<void>;
  abort(reason?: unknown): Promise<void>;
};

export type ManagedAccountExportCall = (
  request: ManagedAccountExportRequest,
) => Promise<unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeInteger(value: unknown, maximum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}

function isoDate(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function isManagedAccountExportRetryableError(error: unknown) {
  if (!isRecord(error) || typeof error.code !== "string") return false;
  return [
    "aborted",
    "deadline-exceeded",
    "functions/aborted",
    "functions/deadline-exceeded",
    "functions/internal",
    "functions/unknown",
    "functions/unavailable",
    "internal",
    "unknown",
    "unavailable",
  ]
    .includes(error.code.toLowerCase());
}

export function parseManagedAccountExportStatus(value: unknown): ManagedAccountExportStatus {
  if (!isRecord(value) || Object.keys(value).sort().join("\u0000") !==
    "completedBytes\u0000completedParts\u0000completedRecords\u0000expiresAt\u0000exportedAt\u0000format\u0000jobId\u0000schemaVersion\u0000status" ||
    value.format !== "aura-account-export-job" || value.schemaVersion !== 1 ||
    typeof value.jobId !== "string" || !JOB_ID.test(value.jobId) ||
    (value.status !== "running" && value.status !== "complete") ||
    !isoDate(value.exportedAt) || !isoDate(value.expiresAt) ||
    !safeInteger(value.completedParts, MAX_PARTS) ||
    !safeInteger(value.completedRecords, MAX_RECORDS) ||
    !safeInteger(value.completedBytes, MAX_BYTES))
    throw new Error("The managed account export status is invalid.");
  return value as ManagedAccountExportStatus;
}

export function parseManagedAccountExportPart(
  value: unknown,
  expected: { jobId: string; sequence: number; exportedAt?: string },
): ManagedAccountExportPart {
  if (!isRecord(value) || Object.keys(value).sort().join("\u0000") !==
    "body\u0000format\u0000jobId\u0000schemaVersion\u0000sequence\u0000sha256" ||
    value.format !== "aura-account-export-part-response" || value.schemaVersion !== 1 ||
    value.jobId !== expected.jobId || value.sequence !== expected.sequence ||
    typeof value.body !== "string" || new TextEncoder().encode(value.body).byteLength > MAX_PART_BYTES ||
    typeof value.sha256 !== "string" || !SHA256.test(value.sha256))
    throw new Error("The managed account export part is invalid.");
  let body: unknown;
  try {
    body = JSON.parse(value.body);
  } catch {
    throw new Error("The managed account export part is invalid.");
  }
  if (!isRecord(body) || Object.keys(body).sort().join("\u0000") !==
    "exportedAt\u0000format\u0000jobId\u0000records\u0000schemaVersion\u0000section\u0000sectionComplete\u0000sequence" ||
    body.format !== "aura-account-export-part" || body.schemaVersion !== 1 ||
    body.jobId !== expected.jobId || body.sequence !== expected.sequence ||
    !isoDate(body.exportedAt) ||
    (expected.exportedAt !== undefined && body.exportedAt !== expected.exportedAt) ||
    typeof body.section !== "string" ||
    !(MANAGED_ACCOUNT_EXPORT_SECTIONS as readonly string[]).includes(body.section) ||
    typeof body.sectionComplete !== "boolean" || !Array.isArray(body.records) ||
    body.records.length < 1 || body.records.length > MAX_PAGE_RECORDS)
    throw new Error("The managed account export part is invalid.");
  return value as ManagedAccountExportPart;
}

async function sha256(value: string) {
  if (!globalThis.crypto?.subtle)
    throw new Error("Account export integrity verification is unavailable in this browser.");
  const bytes = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyManagedAccountExportPart(
  value: unknown,
  expected: { jobId: string; sequence: number; exportedAt: string },
) {
  const part = parseManagedAccountExportPart(value, expected);
  if (await sha256(part.body) !== part.sha256)
    throw new Error("The managed account export part failed integrity verification.");
  return part;
}

export function localDraftExportLine(
  status: ManagedAccountExportStatus,
  localDrafts: unknown[],
) {
  return JSON.stringify({
    format: "aura-account-export-client-part",
    schemaVersion: 1,
    jobId: status.jobId,
    sequence: status.completedParts,
    section: "localBrowserData",
    records: [{
      deviceScoped: true,
      accountLinkedDrafts: localDrafts,
      note: "Anonymous and other-account drafts on this browser are intentionally excluded.",
    }],
  });
}

function fallbackLimitError(maximumBytes: number) {
  const mebibytes = Math.floor(maximumBytes / (1024 * 1024));
  return new Error(
    `This browser cannot stream a large account export. Use a browser with file streaming support or keep the export below ${mebibytes} MiB.`,
  );
}

export function createBoundedAccountExportBuffer(
  maximumBytes = ACCOUNT_EXPORT_BUFFER_FALLBACK_MAX_BYTES,
) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || maximumBytes > MAX_BYTES)
    throw new Error("The account export fallback limit is invalid.");
  const parts: string[] = [];
  let byteLength = 0;
  let state: "open" | "closed" | "aborted" = "open";
  const writer: AccountExportTextWriter = {
    maximumBytes,
    async write(value) {
      if (state !== "open" || typeof value !== "string")
        throw new Error("The account export writer is unavailable.");
      const nextBytes = new TextEncoder().encode(value).byteLength;
      if (byteLength + nextBytes > maximumBytes) throw fallbackLimitError(maximumBytes);
      parts.push(value);
      byteLength += nextBytes;
    },
    async close() {
      if (state !== "open") throw new Error("The account export writer is unavailable.");
      state = "closed";
    },
    async abort() {
      parts.splice(0);
      byteLength = 0;
      state = "aborted";
    },
  };
  return {
    writer,
    blob() {
      if (state !== "closed") throw new Error("The account export download did not finish.");
      return new Blob(parts, { type: "application/x-ndjson" });
    },
    byteLength() {
      return byteLength;
    },
  };
}

type RetryWait = (milliseconds: number) => Promise<void>;

const defaultRetryWait: RetryWait = (milliseconds) =>
  new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));

async function retryManagedAccountExport<T>(
  operation: () => Promise<T>,
  wait: RetryWait,
  maximumAttempts = 8,
) {
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isManagedAccountExportRetryableError(error) || attempt === maximumAttempts - 1) throw error;
      await wait(Math.min(2_000, 250 * (2 ** attempt)));
    }
  }
  throw new Error("The managed account export retry limit is invalid.");
}

function statusForJob(value: unknown, jobId?: string) {
  const status = parseManagedAccountExportStatus(value);
  if (jobId !== undefined && status.jobId !== jobId)
    throw new Error("The managed account export status is invalid.");
  return status;
}

export async function writeManagedAccountExport({
  call,
  writer,
  localDrafts,
  wait = defaultRetryWait,
  maximumContinuationCalls = MAX_MANAGED_ACCOUNT_EXPORT_CONTINUATION_CALLS,
  maximumStalledStatusReads = 8,
}: {
  call: ManagedAccountExportCall;
  writer: AccountExportTextWriter;
  localDrafts: unknown[];
  wait?: RetryWait;
  maximumContinuationCalls?: number;
  maximumStalledStatusReads?: number;
}) {
  try {
    if (!Number.isSafeInteger(maximumContinuationCalls) || maximumContinuationCalls < 1 ||
      maximumContinuationCalls > MAX_MANAGED_ACCOUNT_EXPORT_CONTINUATION_CALLS)
      throw new Error("The managed account export continuation limit is invalid.");
    if (!Number.isSafeInteger(maximumStalledStatusReads) || maximumStalledStatusReads < 1 ||
      maximumStalledStatusReads > 20)
      throw new Error("The managed account export stalled-read limit is invalid.");
    if (!globalThis.crypto?.randomUUID)
      throw new Error("Account export request identity is unavailable in this browser.");
    // One user gesture gets one fresh export. Retries reuse this value, allowing
    // the server to distinguish a lost start reply from a later explicit export.
    const requestId = globalThis.crypto.randomUUID().replaceAll("-", "");
    let status = await retryManagedAccountExport(
      async () => statusForJob(await call({ action: "start", requestId })),
      wait,
    );
    let nextSequence = 0;
    const serverBytesWithDelimiters = (current: ManagedAccountExportStatus) =>
      current.completedBytes + current.completedParts;
    const assertWriterCapacity = (current: ManagedAccountExportStatus, localLine?: string) => {
      const requiredBytes = serverBytesWithDelimiters(current) +
        (localLine === undefined ? 0 : new TextEncoder().encode(localLine).byteLength);
      if (writer.maximumBytes !== undefined && requiredBytes > writer.maximumBytes)
        throw fallbackLimitError(writer.maximumBytes);
    };
    const writeAvailableParts = async (current: ManagedAccountExportStatus) => {
      assertWriterCapacity(current);
      while (nextSequence < current.completedParts) {
        const sequence = nextSequence;
        const part = await retryManagedAccountExport(async () =>
          verifyManagedAccountExportPart(await call({
            action: "part",
            jobId: current.jobId,
            sequence,
          }), {
            jobId: current.jobId,
            sequence,
            exportedAt: current.exportedAt,
          }), wait);
        await writer.write(`${part.body}\n`);
        nextSequence += 1;
      }
    };

    await writeAvailableParts(status);
    let continuationCalls = 0;
    let stalledStatusReads = 0;
    while (status.status === "running") {
      if (continuationCalls >= maximumContinuationCalls)
        throw new Error("The managed account export did not finish within its bounded retry window.");
      continuationCalls += 1;
      const jobId = status.jobId;
      const previousProgress = `${status.status}:${status.completedParts}:${status.completedRecords}:${status.completedBytes}`;
      try {
        status = statusForJob(await call({ action: "continue", jobId }), jobId);
      } catch (error) {
        if (!isManagedAccountExportRetryableError(error)) throw error;
        // A continue response may be lost after its transaction committed.
        // Read status before issuing more work, and retry the idempotent read.
        await wait(250);
        status = await retryManagedAccountExport(
          async () => statusForJob(await call({ action: "status", jobId }), jobId),
          wait,
        );
      }
      await writeAvailableParts(status);
      const currentProgress = `${status.status}:${status.completedParts}:${status.completedRecords}:${status.completedBytes}`;
      if (currentProgress === previousProgress) {
        stalledStatusReads += 1;
        if (stalledStatusReads >= maximumStalledStatusReads)
          throw new Error("The managed account export is still busy. Retry the download shortly.");
        await wait(Math.min(5_000, 250 * (2 ** stalledStatusReads)));
      } else {
        stalledStatusReads = 0;
      }
    }

    const localLine = `${localDraftExportLine(status, localDrafts)}\n`;
    assertWriterCapacity(status, localLine);
    await writer.write(localLine);
    await writer.close();
    return status;
  } catch (error) {
    await writer.abort(error).catch(() => undefined);
    throw error;
  }
}
