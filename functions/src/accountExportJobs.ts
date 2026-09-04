import { createHash } from "node:crypto";

/**
 * Managed-export security contract:
 * - persist AccountExportJobState only below a Firestore tree denied to every client;
 * - derive page positions from Admin SDK query snapshots, never request data;
 * - atomically create AccountExportChunk and replace state for each step;
 * - return only accountExportPublicStatus and owner-authorized part bodies.
 *
 * With that boundary the cursor needs no deploy-time signing secret: it is
 * private server state, validated against its section/revision and included in
 * the optimistic state digest.
 */

export const ACCOUNT_EXPORT_SECTIONS = [
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

export type AccountExportSection = typeof ACCOUNT_EXPORT_SECTIONS[number];

export type ExportPortableValue =
  | null
  | boolean
  | number
  | string
  | ExportPortableValue[]
  | { [key: string]: ExportPortableValue };

export type AccountExportPrivateCursor = {
  schemaVersion: 1;
  section: AccountExportSection;
  after: string[];
  revision: number;
};

export type AccountExportJobState = {
  schemaVersion: 1;
  uid: string;
  jobId: string;
  status: "running" | "complete";
  createdAtEpochSeconds: number;
  expiresAtEpochSeconds: number;
  sectionIndex: number;
  /** Private server state. Firestore rules must deny all client access to this field and job tree. */
  cursor?: AccountExportPrivateCursor;
  revision: number;
  nextSequence: number;
  completedRecords: number;
  completedBytes: number;
};

export type AccountExportPageRecord = {
  /** Server-derived, deterministic query position. This is never included in the downloadable data. */
  after: string[];
  value: unknown;
};

export type AccountExportPage = {
  section: AccountExportSection;
  records: AccountExportPageRecord[];
  /** True only when the backing query has no record after this page. */
  exhausted: boolean;
};

export type AccountExportChunk = {
  id: string;
  sequence: number;
  section: AccountExportSection;
  sectionComplete: boolean;
  /** Persist a Firestore Timestamp derived from this on every part for TTL cleanup. */
  expiresAtEpochSeconds: number;
  body: string;
  byteLength: number;
  sha256: string;
};

export type AccountExportStep = {
  baseStateSha256: string;
  nextStateSha256: string;
  nextState: AccountExportJobState;
  chunk?: AccountExportChunk;
};

export type AccountExportPublicStatus = {
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

export const ACCOUNT_EXPORT_MAX_PAGE_RECORDS = 100;
export const ACCOUNT_EXPORT_MAX_CHUNK_BYTES = 600 * 1024;
export const ACCOUNT_EXPORT_MAX_TOTAL_BYTES = 512 * 1024 * 1024;
export const ACCOUNT_EXPORT_MAX_TOTAL_RECORDS = 1_000_000;
export const ACCOUNT_EXPORT_MAX_CHUNKS = 4_096;
export const ACCOUNT_EXPORT_MAX_LIFETIME_SECONDS = 7 * 24 * 60 * 60;

const MIN_JOB_LIFETIME_SECONDS = 5 * 60;
const MAX_POSITION_PARTS = 8;
// Positions are private server state. Keep room for Firestore's longest legal
// document name and Cloud Storage's longest legal object name.
const MAX_POSITION_PART_BYTES = 8 * 1024;
const JOB_ID = /^[A-Za-z0-9_-]{20,128}$/;
const SAFE_FAILURE_CODES = new Set([
  "export-byte-limit-exceeded",
  "export-chunk-limit-exceeded",
  "export-expired",
  "export-lease-busy",
  "export-page-invalid",
  "export-record-limit-exceeded",
  "export-record-too-large",
  "export-state-conflict",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function byteLength(value: string) {
  return Buffer.byteLength(value, "utf8");
}

function hasControlCharacters(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

function safeUid(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128 &&
    byteLength(value) <= 512 && !hasControlCharacters(value);
}

function safeJobId(value: unknown): value is string {
  return typeof value === "string" && JOB_ID.test(value);
}

export function parseAccountExportJobId(value: unknown) {
  if (!safeJobId(value)) throw new Error("export-job-id-invalid");
  return value;
}

/** Resume the one active job for an account and reuse a completed job only for
 * an exact lost-reply retry. A later user gesture gets fresh data once the prior
 * run is complete, without letting parallel tabs replace in-flight work. */
export function reusableAccountExportJob(
  value: unknown,
  storedRequestId: unknown,
  requestId: string,
  uid: string,
  nowEpochSeconds: number,
) {
  if (!safeJobId(requestId) || !safeUid(uid) ||
    !safeInteger(nowEpochSeconds, 1, Number.MAX_SAFE_INTEGER))
    throw new Error("export-job-invalid");
  try {
    const state = assertAccountExportJobState(value);
    return (state.status === "running" || storedRequestId === requestId) && state.uid === uid &&
      state.expiresAtEpochSeconds > nowEpochSeconds ? state : undefined;
  } catch {
    return undefined;
  }
}

function safeSection(value: unknown): value is AccountExportSection {
  return typeof value === "string" && (ACCOUNT_EXPORT_SECTIONS as readonly string[]).includes(value);
}

function safeInteger(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function normalizePosition(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_POSITION_PARTS)
    throw new Error("export-page-invalid");
  return value.map((part) => {
    if (typeof part !== "string" || part.length < 1 || byteLength(part) > MAX_POSITION_PART_BYTES)
      throw new Error("export-page-invalid");
    return part;
  });
}

function comparePositions(left: string[], right: string[]) {
  const shared = Math.min(left.length, right.length);
  for (let index = 0; index < shared; index += 1) {
    const comparison = Buffer.compare(Buffer.from(left[index], "utf8"), Buffer.from(right[index], "utf8"));
    if (comparison !== 0) return comparison;
  }
  return left.length - right.length;
}

function secretKeyName(key: string) {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return /(?:password|passphrase|secret|credentials?|privatekey|apikey|authorization|cookies?|setcookie|(?:access|auth|refresh|id|bearer|session|csrf|unsubscribe|confirmation|download)?tokens?|tokenhash|passwordhash|passwordsalt|signingkey|encryptionkey)$/.test(normalized);
}

/**
 * Convert datastore-shaped values to deterministic JSON and remove credential-like
 * properties at every depth. Domain-specific projectors must still remove data
 * belonging to other people before calling this function.
 */
export function redactAccountExportValue(value: unknown): ExportPortableValue {
  const seen = new WeakSet<object>();
  const visit = (current: unknown, depth: number): ExportPortableValue => {
    if (depth > 20 || current === undefined || typeof current === "function" || typeof current === "symbol")
      return null;
    if (current === null || typeof current === "boolean" || typeof current === "string") return current;
    if (typeof current === "number") return Number.isFinite(current) ? current : null;
    if (typeof current === "bigint") return current.toString();
    if (current instanceof Date)
      return Number.isFinite(current.getTime()) ? current.toISOString() : null;
    if (Array.isArray(current)) {
      if (seen.has(current)) return null;
      seen.add(current);
      const output = current.map((item) => visit(item, depth + 1));
      seen.delete(current);
      return output;
    }
    if (!isRecord(current)) return String(current);
    const timestamp = current as { toDate?: () => Date };
    if (typeof timestamp.toDate === "function") {
      try {
        const date = timestamp.toDate();
        if (date instanceof Date && Number.isFinite(date.getTime())) return date.toISOString();
      } catch {
        // Fall through to a bounded traversal rather than exposing implementation fields.
      }
    }
    if (seen.has(current)) return null;
    seen.add(current);
    const output: Record<string, ExportPortableValue> = {};
    let entries: Array<[string, unknown]>;
    try {
      entries = Object.entries(current).sort(([left], [right]) => left.localeCompare(right));
    } catch {
      seen.delete(current);
      return null;
    }
    for (const [key, item] of entries) {
      if (!secretKeyName(key)) output[key] = visit(item, depth + 1);
    }
    seen.delete(current);
    return output;
  };
  return visit(value, 0);
}

function canonicalJson(value: ExportPortableValue): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string")
    return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function createAccountExportJob({
  uid,
  jobId,
  nowEpochSeconds,
  lifetimeSeconds = 24 * 60 * 60,
}: {
  uid: string;
  jobId: string;
  nowEpochSeconds: number;
  lifetimeSeconds?: number;
}): AccountExportJobState {
  if (!safeUid(uid) || !safeJobId(jobId) || !safeInteger(nowEpochSeconds, 1, Number.MAX_SAFE_INTEGER) ||
    !safeInteger(lifetimeSeconds, MIN_JOB_LIFETIME_SECONDS, ACCOUNT_EXPORT_MAX_LIFETIME_SECONDS))
    throw new Error("export-job-invalid");
  return assertAccountExportJobState({
    schemaVersion: 1,
    uid,
    jobId,
    status: "running",
    createdAtEpochSeconds: nowEpochSeconds,
    expiresAtEpochSeconds: nowEpochSeconds + lifetimeSeconds,
    sectionIndex: 0,
    revision: 0,
    nextSequence: 0,
    completedRecords: 0,
    completedBytes: 0,
  });
}

export function assertAccountExportJobState(value: unknown): AccountExportJobState {
  if (!isRecord(value)) throw new Error("export-job-state-invalid");
  const state = value;
  const maximumRevision = ACCOUNT_EXPORT_MAX_CHUNKS + ACCOUNT_EXPORT_SECTIONS.length;
  const allowedKeys = [
    "completedBytes",
    "completedRecords",
    "createdAtEpochSeconds",
    ...(state.cursor === undefined ? [] : ["cursor"]),
    "expiresAtEpochSeconds",
    "jobId",
    "nextSequence",
    "revision",
    "schemaVersion",
    "sectionIndex",
    "status",
    "uid",
  ].sort().join("\u0000");
  if (Object.keys(state).sort().join("\u0000") !== allowedKeys ||
    !safeInteger(state.createdAtEpochSeconds, 1, Number.MAX_SAFE_INTEGER))
    throw new Error("export-job-state-invalid");
  if (state.schemaVersion !== 1 || !safeUid(state.uid) || !safeJobId(state.jobId) ||
    (state.status !== "running" && state.status !== "complete") ||
    !safeInteger(state.expiresAtEpochSeconds, state.createdAtEpochSeconds + MIN_JOB_LIFETIME_SECONDS,
      state.createdAtEpochSeconds + ACCOUNT_EXPORT_MAX_LIFETIME_SECONDS) ||
    !safeInteger(state.sectionIndex, 0, ACCOUNT_EXPORT_SECTIONS.length) ||
    !safeInteger(state.revision, 0, maximumRevision) ||
    !safeInteger(state.nextSequence, 0, ACCOUNT_EXPORT_MAX_CHUNKS) ||
    !safeInteger(state.completedRecords, 0, ACCOUNT_EXPORT_MAX_TOTAL_RECORDS) ||
    !safeInteger(state.completedBytes, 0, ACCOUNT_EXPORT_MAX_TOTAL_BYTES) ||
    (state.status === "running" && state.sectionIndex >= ACCOUNT_EXPORT_SECTIONS.length) ||
    (state.status === "complete" && (state.sectionIndex !== ACCOUNT_EXPORT_SECTIONS.length || state.cursor !== undefined)))
    throw new Error("export-job-state-invalid");
  if (state.cursor !== undefined) {
    const cursor = state.cursor as unknown;
    if (!isRecord(cursor) || Object.keys(cursor).sort().join("\u0000") !==
      "after\u0000revision\u0000schemaVersion\u0000section" || cursor.schemaVersion !== 1 ||
      !safeSection(cursor.section) || cursor.section !== ACCOUNT_EXPORT_SECTIONS[state.sectionIndex] ||
      !safeInteger(cursor.revision, 1, maximumRevision) || cursor.revision !== state.revision)
      throw new Error("export-job-state-invalid");
    try {
      normalizePosition(cursor.after);
    } catch {
      throw new Error("export-job-state-invalid");
    }
  }
  return state as AccountExportJobState;
}

function stateValue(state: AccountExportJobState): ExportPortableValue {
  return {
    completedBytes: state.completedBytes,
    completedRecords: state.completedRecords,
    createdAtEpochSeconds: state.createdAtEpochSeconds,
    ...(state.cursor ? { cursor: {
      after: [...state.cursor.after],
      revision: state.cursor.revision,
      schemaVersion: state.cursor.schemaVersion,
      section: state.cursor.section,
    } } : {}),
    expiresAtEpochSeconds: state.expiresAtEpochSeconds,
    jobId: state.jobId,
    nextSequence: state.nextSequence,
    revision: state.revision,
    schemaVersion: state.schemaVersion,
    sectionIndex: state.sectionIndex,
    status: state.status,
    uid: state.uid,
  };
}

export function accountExportStateSha256(state: AccountExportJobState) {
  assertAccountExportJobState(state);
  return sha256(canonicalJson(stateValue(state)));
}

export function currentAccountExportSection(state: AccountExportJobState): AccountExportSection | undefined {
  assertAccountExportJobState(state);
  return state.status === "running" ? ACCOUNT_EXPORT_SECTIONS[state.sectionIndex] : undefined;
}

/** Resolve only a cursor stored in the private server-side checkpoint. */
export function accountExportResumePosition(
  state: AccountExportJobState,
  nowEpochSeconds: number,
): string[] | undefined {
  assertAccountExportJobState(state);
  if (!safeInteger(nowEpochSeconds, 1, Number.MAX_SAFE_INTEGER)) throw new Error("export-job-invalid");
  if (nowEpochSeconds >= state.expiresAtEpochSeconds) throw new Error("export-expired");
  return state.status === "running" && state.cursor ? [...state.cursor.after] : undefined;
}

function chunkBody(
  state: AccountExportJobState,
  section: AccountExportSection,
  records: ExportPortableValue[],
  sectionComplete: boolean,
) {
  return canonicalJson({
    exportedAt: new Date(state.createdAtEpochSeconds * 1_000).toISOString(),
    format: "aura-account-export-part",
    jobId: state.jobId,
    records,
    schemaVersion: 1,
    section,
    sectionComplete,
    sequence: state.nextSequence,
  });
}

/**
 * Produce one bounded, deterministic job transition. Store the returned chunk
 * and nextState together in a Firestore transaction, using baseStateSha256 as
 * the optimistic concurrency precondition.
 */
export function prepareAccountExportStep({
  state,
  page,
  nowEpochSeconds,
  maximumChunkBytes = ACCOUNT_EXPORT_MAX_CHUNK_BYTES,
}: {
  state: AccountExportJobState;
  page: AccountExportPage;
  nowEpochSeconds: number;
  maximumChunkBytes?: number;
}): AccountExportStep {
  assertAccountExportJobState(state);
  if (state.status !== "running") throw new Error("export-job-complete");
  if (!safeInteger(nowEpochSeconds, 1, Number.MAX_SAFE_INTEGER)) throw new Error("export-job-invalid");
  if (nowEpochSeconds < state.createdAtEpochSeconds - 60) throw new Error("export-job-invalid");
  if (nowEpochSeconds >= state.expiresAtEpochSeconds) throw new Error("export-expired");
  if (!safeInteger(maximumChunkBytes, 4 * 1024, ACCOUNT_EXPORT_MAX_CHUNK_BYTES))
    throw new Error("export-byte-limit-invalid");
  const section = ACCOUNT_EXPORT_SECTIONS[state.sectionIndex];
  if (!page || page.section !== section || !Array.isArray(page.records) ||
    page.records.length > ACCOUNT_EXPORT_MAX_PAGE_RECORDS || typeof page.exhausted !== "boolean" ||
    (!page.exhausted && page.records.length === 0))
    throw new Error("export-page-invalid");

  const priorPosition = accountExportResumePosition(state, nowEpochSeconds);

  let precedingPosition = priorPosition;
  const records = page.records.map((record) => {
    if (!isRecord(record) || !("after" in record) || !("value" in record))
      throw new Error("export-page-invalid");
    const after = normalizePosition(record.after);
    if (precedingPosition && comparePositions(precedingPosition, after) >= 0)
      throw new Error("export-page-invalid");
    precedingPosition = after;
    return { after, value: redactAccountExportValue(record.value) };
  });

  const baseStateSha256 = accountExportStateSha256(state);
  const nextRevision = state.revision + 1;
  let selectedCount = 0;
  let body: string | undefined;
  for (let count = 1; count <= records.length; count += 1) {
    const completesSection = count === records.length && page.exhausted;
    const candidate = chunkBody(state, section, records.slice(0, count).map((record) => record.value), completesSection);
    if (byteLength(candidate) > maximumChunkBytes) break;
    selectedCount = count;
    body = candidate;
  }
  if (records.length && selectedCount === 0) {
    // One legacy document may approach Firestore's document limit and cannot
    // fit a bounded export part. Emit an explicit deterministic omission and
    // advance past it instead of pinning every retry on the same record.
    selectedCount = 1;
    body = chunkBody(state, section, [{
      recordUnavailable: true,
      reason: "record-exceeds-export-part-limit",
    }], records.length === 1 && page.exhausted);
  }

  const sectionComplete = selectedCount === records.length && page.exhausted;
  const nextSectionIndex = sectionComplete ? state.sectionIndex + 1 : state.sectionIndex;
  const nextCompletedRecords = state.completedRecords + selectedCount;
  if (nextCompletedRecords > ACCOUNT_EXPORT_MAX_TOTAL_RECORDS) throw new Error("export-record-limit-exceeded");
  if (body && state.nextSequence >= ACCOUNT_EXPORT_MAX_CHUNKS) throw new Error("export-chunk-limit-exceeded");
  const currentBytes = body ? byteLength(body) : 0;
  const nextCompletedBytes = state.completedBytes + currentBytes;
  if (nextCompletedBytes > ACCOUNT_EXPORT_MAX_TOTAL_BYTES) throw new Error("export-byte-limit-exceeded");

  const nextState: AccountExportJobState = {
    ...state,
    status: nextSectionIndex === ACCOUNT_EXPORT_SECTIONS.length ? "complete" : "running",
    sectionIndex: nextSectionIndex,
    revision: nextRevision,
    nextSequence: state.nextSequence + (body ? 1 : 0),
    completedRecords: nextCompletedRecords,
    completedBytes: nextCompletedBytes,
  };
  if (!sectionComplete) {
    const lastPosition = records[selectedCount - 1]?.after;
    if (!lastPosition) throw new Error("export-page-invalid");
    nextState.cursor = {
      schemaVersion: 1,
      section,
      after: [...lastPosition],
      revision: nextRevision,
    };
  } else {
    delete nextState.cursor;
  }
  assertAccountExportJobState(nextState);

  const chunk = body ? {
    id: state.nextSequence.toString().padStart(8, "0"),
    sequence: state.nextSequence,
    section,
    sectionComplete,
    expiresAtEpochSeconds: state.expiresAtEpochSeconds,
    body,
    byteLength: currentBytes,
    sha256: sha256(body),
  } satisfies AccountExportChunk : undefined;
  return {
    baseStateSha256,
    nextStateSha256: accountExportStateSha256(nextState),
    nextState,
    ...(chunk ? { chunk } : {}),
  };
}

/** Classify a transaction retry without ever accepting a client-provided cursor. */
export function classifyAccountExportStep(
  currentState: AccountExportJobState,
  step: AccountExportStep,
): "pending" | "applied" | "conflict" {
  const current = accountExportStateSha256(currentState);
  if (current === step.baseStateSha256) return "pending";
  if (current === step.nextStateSha256) return "applied";
  return "conflict";
}

/** Validate a persisted part before returning it from an authenticated callable. */
export function assertAccountExportChunk(
  value: unknown,
  state: AccountExportJobState,
): AccountExportChunk {
  assertAccountExportJobState(state);
  if (!isRecord(value) || Object.keys(value).sort().join("\u0000") !==
    "body\u0000byteLength\u0000expiresAtEpochSeconds\u0000id\u0000section\u0000sectionComplete\u0000sequence\u0000sha256" ||
    typeof value.body !== "string" || !safeInteger(value.byteLength, 1, ACCOUNT_EXPORT_MAX_CHUNK_BYTES) ||
    byteLength(value.body) !== value.byteLength || typeof value.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.sha256) || sha256(value.body) !== value.sha256 ||
    !safeInteger(value.sequence, 0, state.nextSequence - 1) ||
    value.id !== value.sequence.toString().padStart(8, "0") || !safeSection(value.section) ||
    typeof value.sectionComplete !== "boolean" || value.expiresAtEpochSeconds !== state.expiresAtEpochSeconds)
    throw new Error("export-part-invalid");
  let parsed: unknown;
  try {
    parsed = JSON.parse(value.body);
  } catch {
    throw new Error("export-part-invalid");
  }
  if (!isRecord(parsed) || Object.keys(parsed).sort().join("\u0000") !==
    "exportedAt\u0000format\u0000jobId\u0000records\u0000schemaVersion\u0000section\u0000sectionComplete\u0000sequence" ||
    parsed.format !== "aura-account-export-part" || parsed.schemaVersion !== 1 || parsed.jobId !== state.jobId ||
    parsed.exportedAt !== new Date(state.createdAtEpochSeconds * 1_000).toISOString() ||
    parsed.sequence !== value.sequence || parsed.section !== value.section ||
    parsed.sectionComplete !== value.sectionComplete || !Array.isArray(parsed.records) ||
    parsed.records.length < 1 || parsed.records.length > ACCOUNT_EXPORT_MAX_PAGE_RECORDS ||
    canonicalJson(redactAccountExportValue(parsed)) !== value.body)
    throw new Error("export-part-invalid");
  return value as AccountExportChunk;
}

export function assertAccountExportJobOwner(
  state: AccountExportJobState,
  requestUid: unknown,
  nowEpochSeconds: number,
) {
  assertAccountExportJobState(state);
  if (!safeUid(requestUid) || requestUid !== state.uid) throw new Error("export-access-denied");
  if (!safeInteger(nowEpochSeconds, 1, Number.MAX_SAFE_INTEGER)) throw new Error("export-job-invalid");
  if (nowEpochSeconds >= state.expiresAtEpochSeconds) throw new Error("export-expired");
  return state;
}

/** A cursor-free status object safe to return only to the authenticated job owner. */
export function accountExportPublicStatus(
  state: AccountExportJobState,
  requestUid: unknown,
  nowEpochSeconds: number,
): AccountExportPublicStatus {
  assertAccountExportJobOwner(state, requestUid, nowEpochSeconds);
  return {
    format: "aura-account-export-job",
    schemaVersion: 1,
    jobId: state.jobId,
    status: state.status,
    exportedAt: new Date(state.createdAtEpochSeconds * 1_000).toISOString(),
    expiresAt: new Date(state.expiresAtEpochSeconds * 1_000).toISOString(),
    completedParts: state.nextSequence,
    completedRecords: state.completedRecords,
    completedBytes: state.completedBytes,
  };
}

/** Validate owner and completed range before reading one bounded private part. */
export function accountExportPartIdForOwner(
  state: AccountExportJobState,
  requestUid: unknown,
  sequence: unknown,
  nowEpochSeconds: number,
) {
  assertAccountExportJobOwner(state, requestUid, nowEpochSeconds);
  if (!safeInteger(sequence, 0, state.nextSequence - 1)) throw new Error("export-part-invalid");
  return sequence.toString().padStart(8, "0");
}

/** Store only a fixed, non-sensitive failure code; never persist error messages or stacks. */
export function accountExportFailureCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return SAFE_FAILURE_CODES.has(message) ? message : "internal";
}
