import { createHash } from "node:crypto";

export const MAX_OPERATOR_QUERY_LIMIT = 100;
export const MODERATION_ACTIONS = new Set([
  "close-report",
  "remove-post",
  "restore-post",
  "demote-space",
]);
export const MODERATION_DECISION_CODES = new Set([
  "spam",
  "harassment",
  "rights",
  "unsafe",
  "security",
  "no-violation",
  "appeal-reversed",
  "other-reviewed",
]);
export const PUBLIC_CONTENT_DECISIONS = new Set(["approve", "block"]);
export const PUBLIC_REVIEW_REASON_CODES = new Set([
  "reviewed-production",
  "production-fixture",
  "quality",
  "rights",
  "unsafe",
  "policy",
  "appeal-reversed",
  "other-reviewed",
]);

const PROJECT_ID = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const DOCUMENT_ID = /^[A-Za-z0-9_-]{1,128}$/;
const REPORT_ID = /^[a-f0-9]{64}$/;
const OPERATOR_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/;
const CASE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/;
const FINGERPRINT = /^[a-f0-9]{64}$/;

export function parseFlags(argv, schema) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const kind = schema[key];
    if (!kind) throw new Error(`Unknown option: --${key}`);
    if (Object.hasOwn(parsed, key)) throw new Error(`Duplicate option: --${key}`);
    if (kind === "boolean") {
      parsed[key] = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Option --${key} requires a value.`);
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

export function boundedLimit(value, fallback = 25) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_OPERATOR_QUERY_LIMIT)
    throw new Error(`Limit must be an integer from 1 to ${MAX_OPERATOR_QUERY_LIMIT}.`);
  return parsed;
}

export function validatedProjectId(value) {
  if (typeof value !== "string" || !PROJECT_ID.test(value))
    throw new Error("FIREBASE_PROJECT_ID must be an explicit valid Google Cloud project ID.");
  return value;
}

export function validatedDatabaseId(value = "(default)") {
  if (typeof value !== "string" || !/^(?:\(default\)|[A-Za-z0-9_-]{1,63})$/.test(value))
    throw new Error("FIREBASE_DATABASE_ID is invalid.");
  return value;
}

export function validatedDocumentId(value, label = "document ID") {
  if (typeof value !== "string" || !DOCUMENT_ID.test(value))
    throw new Error(`${label} must contain 1-128 letters, numbers, underscores, or dashes.`);
  return value;
}

export function validatedReportId(value) {
  if (typeof value !== "string" || !REPORT_ID.test(value))
    throw new Error("Report ID must be exactly 64 lowercase hexadecimal characters.");
  return value;
}

export function validatedCaseId(value) {
  if (typeof value !== "string" || !CASE_ID.test(value))
    throw new Error("Case ID must contain 3-128 bounded letters, numbers, underscores, or dashes.");
  return value;
}

export function validatedOperatorId(value) {
  if (typeof value !== "string" || !OPERATOR_ID.test(value))
    throw new Error("MODERATION_OPERATOR_ID must be a 3-64 character opaque operator identifier.");
  return value;
}

export function validatedDecisionCode(value) {
  if (typeof value !== "string" || !MODERATION_DECISION_CODES.has(value))
    throw new Error(`Decision code must be one of: ${[...MODERATION_DECISION_CODES].join(", ")}.`);
  return value;
}

export function validatedPublicReviewReason(value) {
  if (typeof value !== "string" || !PUBLIC_REVIEW_REASON_CODES.has(value))
    throw new Error(`Public-review reason must be one of: ${[...PUBLIC_REVIEW_REASON_CODES].join(", ")}.`);
  return value;
}

export function validatedFingerprint(value) {
  if (typeof value !== "string" || !FINGERPRINT.test(value))
    throw new Error("Expected content fingerprint must be exactly 64 lowercase hexadecimal characters.");
  return value;
}

export function validatedUpdateTime(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) || !Number.isFinite(Date.parse(value)))
    throw new Error("Expected update time must be the exact RFC 3339 value from review output.");
  return value;
}

export function validatedNonNegativeInteger(value, label) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0)
    throw new Error(`${label} must be a non-negative integer.`);
  return parsed;
}

export function assertExecutionGuard({ execute, confirmProject, projectId }) {
  if (!execute) return;
  if (confirmProject !== projectId)
    throw new Error("Execution requires --confirm-project with the exact FIREBASE_PROJECT_ID value.");
}

export function documentRoot(projectId, databaseId = "(default)") {
  return `projects/${validatedProjectId(projectId)}/databases/${validatedDatabaseId(databaseId)}/documents`;
}

export function documentName(projectId, relativePath, databaseId = "(default)") {
  const segments = String(relativePath).split("/");
  if (segments.length < 2 || segments.length % 2 !== 0 || segments.some((segment) => !DOCUMENT_ID.test(segment)))
    throw new Error("Firestore document path must contain bounded collection/document segment pairs.");
  return `${documentRoot(projectId, databaseId)}/${segments.join("/")}`;
}

export function encodeCursor(name) {
  return Buffer.from(name, "utf8").toString("base64url");
}

export function decodeCursor(cursor, projectId, databaseId = "(default)") {
  let value;
  try {
    value = Buffer.from(String(cursor), "base64url").toString("utf8");
  } catch {
    throw new Error("Cursor is not valid base64url.");
  }
  const prefix = `${documentRoot(projectId, databaseId)}/`;
  if (!value.startsWith(prefix) || value.includes("\0"))
    throw new Error("Cursor does not belong to the configured Firebase project/database.");
  return value;
}

export function decodeFirestoreValue(value) {
  if (!value || typeof value !== "object") return undefined;
  if ("nullValue" in value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("referenceValue" in value) return value.referenceValue;
  if ("bytesValue" in value) return "[bytes]";
  if ("arrayValue" in value)
    return (value.arrayValue.values ?? []).map(decodeFirestoreValue);
  if ("mapValue" in value) return decodeFirestoreFields(value.mapValue.fields ?? {});
  if ("geoPointValue" in value) return { ...value.geoPointValue };
  return undefined;
}

export function decodeFirestoreFields(fields = {}) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, decodeFirestoreValue(value)]),
  );
}

export function decodeFirestoreDocument(document) {
  if (!document?.name) throw new Error("Firestore returned a document without a name.");
  return {
    id: document.name.split("/").at(-1),
    name: document.name,
    createTime: document.createTime,
    updateTime: document.updateTime,
    data: decodeFirestoreFields(document.fields ?? {}),
  };
}

export function encodeFirestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Cannot encode a non-finite Firestore number.");
    return Number.isSafeInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeFirestoreValue) } };
  if (typeof value === "object" && value)
    return { mapValue: { fields: encodeFirestoreFields(value) } };
  throw new Error(`Unsupported Firestore value type: ${typeof value}`);
}

export function encodeFirestoreFields(value) {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, encodeFirestoreValue(item)]),
  );
}

function encodedPath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

export class FirestoreOperatorClient {
  constructor({ projectId, accessToken, databaseId = "(default)", fetchImpl = globalThis.fetch }) {
    this.projectId = validatedProjectId(projectId);
    this.databaseId = validatedDatabaseId(databaseId);
    if (typeof accessToken !== "string" || !accessToken.trim())
      throw new Error("GOOGLE_OAUTH_ACCESS_TOKEN is required. Use a short-lived least-privilege token.");
    if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required.");
    this.fetchImpl = fetchImpl;
    this.headers = {
      authorization: `Bearer ${accessToken.trim()}`,
      "content-type": "application/json",
    };
    this.apiRoot = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(this.projectId)}/databases/${encodeURIComponent(this.databaseId)}/documents`;
  }

  async request(url, options = {}) {
    const response = await this.fetchImpl(url, { ...options, headers: { ...this.headers, ...options.headers } });
    if (response.ok) return response.status === 204 ? undefined : response.json();
    if (response.status === 404 && options.allowMissing) return null;
    const body = await response.json().catch(() => ({}));
    const message = typeof body?.error?.message === "string"
      ? body.error.message.slice(0, 500)
      : `HTTP ${response.status}`;
    throw new Error(`Firestore request failed: ${message}`);
  }

  async getDocument(relativePath, { allowMissing = false } = {}) {
    const name = documentName(this.projectId, relativePath, this.databaseId);
    return this.request(`https://firestore.googleapis.com/v1/${encodedPath(name)}`, { allowMissing });
  }

  async runQuery({ collectionId, allDescendants = false, where, limit = 25, cursor }) {
    validatedDocumentId(collectionId, "collection ID");
    const structuredQuery = {
      from: [{ collectionId, ...(allDescendants ? { allDescendants: true } : {}) }],
      ...(where ? { where } : {}),
      orderBy: [{ field: { fieldPath: "__name__" }, direction: "ASCENDING" }],
      limit: boundedLimit(limit),
      ...(cursor ? {
        startAt: {
          values: [{ referenceValue: decodeCursor(cursor, this.projectId, this.databaseId) }],
          before: false,
        },
      } : {}),
    };
    const body = await this.request(`${this.apiRoot}:runQuery`, {
      method: "POST",
      body: JSON.stringify({ structuredQuery }),
    });
    return (body ?? []).flatMap((result) => result.document ? [result.document] : []);
  }

  async commit(writes) {
    if (!Array.isArray(writes) || writes.length < 1 || writes.length > 5)
      throw new Error("An operator commit must contain 1-5 bounded writes.");
    return this.request(`${this.apiRoot}:commit`, {
      method: "POST",
      body: JSON.stringify({ writes }),
    });
  }
}

export function runtimeOperatorClient(environment = process.env) {
  return new FirestoreOperatorClient({
    projectId: validatedProjectId(environment.FIREBASE_PROJECT_ID),
    databaseId: validatedDatabaseId(environment.FIREBASE_DATABASE_ID || "(default)"),
    accessToken: environment.GOOGLE_OAUTH_ACCESS_TOKEN,
  });
}

export function equalityFilter(fieldPath, value) {
  return {
    fieldFilter: {
      field: { fieldPath },
      op: "EQUAL",
      value: encodeFirestoreValue(value),
    },
  };
}

export function contentFingerprint(value) {
  return createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function publicCreatorId(document) {
  const segments = document.name.split("/");
  const accountIndex = segments.lastIndexOf("creatorAccounts");
  return accountIndex >= 0 ? segments[accountIndex + 1] : undefined;
}

export function formatPublicContent(kind, rawDocument, { includeContent = false, creatorProfile } = {}) {
  const document = decodeFirestoreDocument(rawDocument);
  const data = document.data;
  if (kind === "spaces") {
    const expiresAtMs = Date.parse(String(data.expiresAt ?? ""));
    const publicNow = data.visibility === "public"
      && (data.lifecycleStatus ?? "active") === "active"
      && Number.isFinite(expiresAtMs)
      && expiresAtMs > Date.now();
    if (!publicNow) return null;
    const artworks = Array.isArray(data.artworks)
      ? data.artworks.filter((artwork) => artwork && typeof artwork === "object").slice(0, 14)
      : [];
    const artworkText = artworks.map((artwork) => ({
      id: artwork.id,
      title: artwork.title,
      year: artwork.year,
      medium: artwork.medium,
      dimensions: artwork.dimensions,
      description: artwork.description,
      hidden: artwork.hidden === true,
      assetFingerprint: contentFingerprint(artwork.storagePath ?? artwork.src),
    }));
    const record = {
      kind: "space",
      id: document.id,
      documentName: document.name,
      url: `https://lieuva.com/spaces/${document.id}`,
      revision: data.revision ?? 1,
      expiresAt: data.expiresAt,
      discoverEligible: data.discoverEligible === true,
      exploreListed: data.exploreListed !== false,
      artworkCount: artworks.length,
      contentFingerprint: contentFingerprint(JSON.stringify({
        title: data.title,
        artist: data.artist,
        artworks: artworkText,
      })),
      documentUpdateTime: document.updateTime,
    };
    return includeContent
      ? { ...record, title: data.title, artist: data.artist, artworks: artworkText }
      : record;
  }
  if (kind === "creators") {
    if (data.profilePublic !== true) return null;
    const record = {
      kind: "creator",
      id: document.id,
      documentName: document.name,
      handle: data.handle,
      discoverEligible: data.discoverEligible === true,
      url: typeof data.handle === "string" ? `https://lieuva.com/creators/${data.handle}` : undefined,
      followerCount: data.followerCount ?? 0,
      imagePresent: data.imagePresent === true,
      coverPresent: data.coverPresent === true,
      linkCount: Array.isArray(data.links) ? data.links.length : 0,
      contentFingerprint: contentFingerprint(JSON.stringify({
        displayName: data.displayName,
        bio: data.bio,
        links: data.links,
        imagePresent: data.imagePresent === true,
        coverPresent: data.coverPresent === true,
        bioFont: data.bioFont,
        profileTone: data.profileTone,
      })),
      documentUpdateTime: document.updateTime,
    };
    return includeContent
      ? { ...record, displayName: data.displayName, bio: data.bio, links: data.links }
      : record;
  }
  if (kind === "posts") {
    if (
      data.moderationStatus === "removed"
      || creatorProfile?.profilePublic !== true
      || creatorProfile.discoverEligible !== true
    ) return null;
    const creatorId = publicCreatorId(rawDocument);
    const handle = creatorProfile?.handle;
    const record = {
      kind: "creator-post",
      creatorId,
      postId: document.id,
      documentName: document.name,
      creatorHandle: handle,
      creatorUrl: typeof handle === "string" ? `https://lieuva.com/creators/${handle}` : undefined,
      createdAt: data.createdAt,
      reactionCount: data.reactionCount ?? 0,
      commentCount: data.commentCount ?? 0,
      moderationStatus: data.moderationStatus ?? "published",
      contentFingerprint: contentFingerprint(data.body),
      contentLength: typeof data.body === "string" ? data.body.length : 0,
      documentUpdateTime: document.updateTime,
    };
    return includeContent ? { ...record, body: data.body } : record;
  }
  throw new Error(`Unsupported public-content kind: ${kind}`);
}

export function formatModerationReport(rawReport, { includeContent = false, targetPost } = {}) {
  const report = decodeFirestoreDocument(rawReport);
  const data = report.data;
  const createdAt = Date.parse(String(data.createdAt ?? ""));
  const record = {
    reportId: report.id,
    status: data.status,
    reason: data.reason,
    targetCreatorId: data.targetCreatorId,
    postId: data.postId,
    caseId: data.caseId,
    createdAt: data.createdAt,
    ageHours: Number.isFinite(createdAt)
      ? Math.max(0, Math.round((Date.now() - createdAt) / 36_000) / 100)
      : undefined,
    reporterRef: contentFingerprint(data.reporterCreatorId ?? data.reporterAccountId).slice(0, 16),
  };
  if (!includeContent || !targetPost) return record;
  const post = decodeFirestoreDocument(targetPost).data;
  return {
    ...record,
    targetContent: {
      body: post.body,
      moderationStatus: post.moderationStatus ?? "published",
      contentFingerprint: contentFingerprint(post.body),
    },
  };
}

export function formatModerationCase(rawCase, { includeContent = false, targetPost } = {}) {
  const moderationCase = decodeFirestoreDocument(rawCase);
  const data = moderationCase.data;
  const openedAt = Date.parse(String(data.openedAt ?? ""));
  const target = data.target && typeof data.target === "object" && !Array.isArray(data.target)
    ? data.target
    : {};
  const sourceReportIds = Array.isArray(data.sourceReportIds)
    ? data.sourceReportIds.filter((value) => typeof value === "string" && REPORT_ID.test(value)).slice(0, 50)
    : [];
  const record = {
    caseId: moderationCase.id,
    status: data.status,
    priority: data.priority,
    targetKind: data.targetKind,
    target,
    sourceReportIds,
    reportCount: data.reportCount ?? sourceReportIds.length,
    lastReportReason: data.lastReportReason,
    openedAt: data.openedAt,
    updatedAt: data.updatedAt,
    lastReportedAt: data.lastReportedAt,
    newReportPending: data.newReportPending === true,
    ageHours: Number.isFinite(openedAt)
      ? Math.max(0, Math.round((Date.now() - openedAt) / 36_000) / 100)
      : undefined,
    version: data.version,
  };
  if (!includeContent || !targetPost) return record;
  const post = decodeFirestoreDocument(targetPost).data;
  return {
    ...record,
    targetContent: {
      body: post.body,
      moderationStatus: post.moderationStatus ?? "published",
      contentFingerprint: contentFingerprint(post.body),
    },
  };
}

export function reportModerationCaseId(rawReport, requestedCaseId) {
  const report = decodeFirestoreDocument(rawReport);
  const persistedCaseId = validatedCaseId(report.data.caseId);
  if (requestedCaseId !== undefined && validatedCaseId(requestedCaseId) !== persistedCaseId)
    throw new Error("--case does not match the report's persisted moderation case ID.");
  return persistedCaseId;
}

function updateWrite(name, values, currentDocument) {
  const fieldPaths = Object.keys(values).sort();
  return {
    update: { name, fields: encodeFirestoreFields(values) },
    updateMask: { fieldPaths },
    currentDocument,
  };
}

function exactTarget(rawDocument, expectedName, label) {
  const decoded = decodeFirestoreDocument(rawDocument);
  if (decoded.name !== expectedName) throw new Error(`${label} resolved to an unexpected Firestore path.`);
  if (!decoded.updateTime) throw new Error(`${label} has no update-time precondition.`);
  return decoded;
}

export function publicContentReviewId(kind, targetId) {
  const prefix = kind === "space" ? "space" : "creator";
  const readable = `${prefix}__${targetId}`;
  return readable.length <= 128
    ? readable
    : `${prefix}__${contentFingerprint(targetId)}`;
}

function assertReviewableSpace(data, occurredAt) {
  const placeholderTitle = /^(?:untitled|test|demo)(?:\b|[-_\s])/i;
  const placeholderCreator = /^(?:your(?:[-_\s]*name|\d)|test(?:\b|[-_\s])|demo(?:\b|[-_\s]))/i;
  const title = typeof data.title === "string" ? data.title.trim() : "";
  const artist = typeof data.artist === "string" ? data.artist.trim() : "";
  const expiry = Date.parse(String(data.expiresAt ?? ""));
  const visibleMedia = Array.isArray(data.artworks) && data.artworks.some((artwork) => (
    artwork && typeof artwork === "object" && artwork.hidden !== true
    && [artwork.src, artwork.storagePath, artwork.assetId].some((value) => typeof value === "string" && value.length > 0)
  ));
  if (
    data.visibility !== "public"
    || (data.lifecycleStatus ?? "active") !== "active"
    || !Number.isFinite(expiry)
    || expiry <= occurredAt.getTime()
    || title.length < 3
    || artist.length < 2
    || placeholderTitle.test(title)
    || placeholderCreator.test(artist)
    || !visibleMedia
  ) throw new Error("Space is not an active, non-placeholder public revision with visible media.");
}

function assertReviewableCreator(data) {
  if (
    data.profilePublic !== true
    || typeof data.handle !== "string"
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.handle)
    || typeof data.displayName !== "string"
    || data.displayName.trim().length < 1
    || data.displayName.trim().length > 60
  ) throw new Error("Creator is not a valid submitted public profile.");
}

export function buildPublicContentDecisionPlan({
  projectId,
  databaseId = "(default)",
  kind,
  targetId,
  decision,
  reasonCode,
  operatorId,
  occurredAt,
  eventId,
  rawTarget,
  rawReview,
  expectedGate,
  expectedUpdateTime,
  expectedFingerprint,
  expectedRevision,
}) {
  validatedProjectId(projectId);
  validatedDatabaseId(databaseId);
  validatedDocumentId(targetId, `${kind} ID`);
  if (!PUBLIC_CONTENT_DECISIONS.has(decision))
    throw new Error("Public-content decision must be approve or block.");
  validatedPublicReviewReason(reasonCode);
  validatedOperatorId(operatorId);
  validatedDocumentId(eventId, "event ID");
  if (!new Set(["pending", "approved"]).has(expectedGate))
    throw new Error("--expected-gate must be pending or approved.");
  validatedFingerprint(expectedFingerprint);
  validatedUpdateTime(expectedUpdateTime);
  const timestamp = new Date(occurredAt);
  if (!Number.isFinite(timestamp.getTime())) throw new Error("Public-review action time is invalid.");

  const collection = kind === "space" ? "galleries" : kind === "creator" ? "creatorProfiles" : null;
  if (!collection) throw new Error("Public-content kind must be space or creator.");
  const targetName = documentName(projectId, `${collection}/${targetId}`, databaseId);
  const target = exactTarget(rawTarget, targetName, "Public-review target");
  if (target.updateTime !== expectedUpdateTime)
    throw new Error(`Target update-time mismatch: expected ${expectedUpdateTime}, found ${target.updateTime}.`);
  const formatted = formatPublicContent(kind === "space" ? "spaces" : "creators", rawTarget);
  if (!formatted) throw new Error("Target is not a submitted public-content record.");
  if (formatted.contentFingerprint !== expectedFingerprint)
    throw new Error("Target content fingerprint changed after review.");
  const currentGate = target.data.discoverEligible === true ? "approved" : "pending";
  if (currentGate !== expectedGate)
    throw new Error(`Target gate mismatch: expected ${expectedGate}, found ${currentGate}.`);
  if (decision === "approve" && expectedGate !== "pending")
    throw new Error("Approval requires an explicitly pending target.");

  let contentVersion;
  if (kind === "space") {
    assertReviewableSpace(target.data, timestamp);
    const revision = validatedNonNegativeInteger(expectedRevision, "Expected Space revision");
    if (revision < 1 || target.data.revision !== revision)
      throw new Error(`Space revision mismatch: expected ${revision}, found ${target.data.revision ?? "missing"}.`);
    contentVersion = String(revision);
  } else {
    if (expectedRevision !== undefined) throw new Error("Creator decisions do not accept --expected-revision.");
    assertReviewableCreator(target.data);
    contentVersion = target.updateTime;
  }

  const reviewId = publicContentReviewId(kind, targetId);
  const reviewName = documentName(projectId, `publicContentReviews/${reviewId}`, databaseId);
  const eventName = documentName(projectId, `publicContentReviews/${reviewId}/events/${eventId}`, databaseId);
  let reviewVersion = 1;
  let reviewPrecondition = { exists: false };
  if (rawReview) {
    const review = exactTarget(rawReview, reviewName, "Public-content review ledger");
    if (review.data.resourceId !== targetId || review.data.resourceType !== kind)
      throw new Error("Existing public-content review ledger targets different content.");
    reviewVersion = validatedNonNegativeInteger(review.data.version ?? 0, "Existing review version") + 1;
    reviewPrecondition = { updateTime: review.updateTime };
  }

  const status = decision === "approve" ? "approved" : "blocked";
  const writes = [
    updateWrite(targetName, { discoverEligible: decision === "approve" }, { updateTime: target.updateTime }),
    updateWrite(reviewName, {
      resourceType: kind,
      resourceId: targetId,
      status,
      reasonCode,
      reviewedBy: operatorId,
      reviewedAt: timestamp,
      contentVersion,
      contentFingerprint: expectedFingerprint,
      targetUpdateTime: expectedUpdateTime,
      version: reviewVersion,
      schemaVersion: 1,
    }, reviewPrecondition),
    updateWrite(eventName, {
      resourceType: kind,
      resourceId: targetId,
      decision,
      status,
      reasonCode,
      operatorId,
      occurredAt: timestamp,
      contentVersion,
      contentFingerprint: expectedFingerprint,
      targetUpdateTime: expectedUpdateTime,
      schemaVersion: 1,
    }, { exists: false }),
  ];
  return {
    summary: {
      projectId,
      databaseId,
      reviewId,
      kind,
      targetId,
      decision,
      status,
      reasonCode,
      operatorId,
      expectedGate,
      expectedUpdateTime,
      expectedFingerprint,
      contentVersion,
      writeCount: writes.length,
      writes: writes.map((write) => ({
        document: write.update.name,
        fields: write.updateMask.fieldPaths,
        precondition: write.currentDocument,
      })),
    },
    writes,
  };
}

function caseWrite({ caseName, rawCase, values }) {
  if (!rawCase) {
    return updateWrite(caseName, values, { exists: false });
  }
  const existing = exactTarget(rawCase, caseName, "Moderation case");
  const existingTarget = existing.data.target;
  if (
    existing.data.targetKind !== values.targetKind ||
    !existingTarget ||
    Object.entries(values.target).some(([key, value]) => existingTarget[key] !== value) ||
    Object.keys(existingTarget).length !== Object.keys(values.target).length
  ) throw new Error("Existing moderation case targets different content.");
  return updateWrite(caseName, {
    status: values.status,
    updatedAt: values.updatedAt,
    assignedOperatorId: values.assignedOperatorId,
    lastActionKind: values.lastActionKind,
    lastDecisionCode: values.lastDecisionCode,
    newReportPending: values.newReportPending,
    version: Number(existing.data.version ?? 0) + 1,
  }, { updateTime: existing.updateTime });
}

export function buildModerationActionPlan({
  projectId,
  databaseId = "(default)",
  action,
  decisionCode,
  operatorId,
  occurredAt,
  eventId,
  caseId,
  rawCase,
  rawReport,
  rawTarget,
  expectedCaseVersion,
  expectedReportStatus,
  expectedDiscover,
}) {
  validatedProjectId(projectId);
  validatedDatabaseId(databaseId);
  if (!MODERATION_ACTIONS.has(action))
    throw new Error(`Action must be one of: ${[...MODERATION_ACTIONS].join(", ")}.`);
  validatedDecisionCode(decisionCode);
  validatedOperatorId(operatorId);
  validatedCaseId(caseId);
  validatedDocumentId(eventId, "event ID");
  const timestamp = new Date(occurredAt);
  if (!Number.isFinite(timestamp.getTime())) throw new Error("Moderation action time is invalid.");
  const caseName = documentName(projectId, `moderationCases/${caseId}`, databaseId);
  const eventName = documentName(projectId, `moderationCases/${caseId}/events/${eventId}`, databaseId);
  const writes = [];
  const actualCaseVersion = rawCase
    ? validatedNonNegativeInteger(decodeFirestoreDocument(rawCase).data.version ?? 0, "Persisted case version")
    : 0;
  const requiredCaseVersion = validatedNonNegativeInteger(expectedCaseVersion, "Expected case version");
  if (actualCaseVersion !== requiredCaseVersion)
    throw new Error(`Moderation case version mismatch: expected ${requiredCaseVersion}, found ${actualCaseVersion}.`);
  let targetKind;
  let target;
  let caseStatus;
  let reportId;

  if (["close-report", "remove-post", "restore-post"].includes(action)) {
    if (!rawReport) throw new Error(`${action} requires an exact report document.`);
    if (!rawCase) throw new Error(`${action} requires the report's existing moderation case.`);
    const report = decodeFirestoreDocument(rawReport);
    reportId = validatedReportId(report.id);
    const reportName = documentName(projectId, `creatorReports/${reportId}`, databaseId);
    exactTarget(rawReport, reportName, "Report");
    if (!expectedReportStatus || report.data.status !== expectedReportStatus)
      throw new Error(`Report status mismatch: expected ${expectedReportStatus ?? "an explicit status"}, found ${report.data.status ?? "missing"}.`);
    const creatorId = validatedDocumentId(report.data.targetCreatorId, "target Creator ID");
    const postId = validatedDocumentId(report.data.postId, "post ID");
    targetKind = "creator-post";
    target = { creatorId, postId };
    if (action !== "close-report") {
      const postName = documentName(projectId, `creatorAccounts/${creatorId}/posts/${postId}`, databaseId);
      const post = exactTarget(rawTarget, postName, "Creator post");
      const desiredStatus = action === "remove-post" ? "removed" : "published";
      if ((post.data.moderationStatus ?? "published") === desiredStatus)
        throw new Error(`Creator post is already ${desiredStatus}.`);
      writes.push(updateWrite(postName, {
        moderationStatus: desiredStatus,
        moderationUpdatedAt: timestamp,
        moderationDecisionCode: decisionCode,
        moderationCaseId: caseId,
      }, { updateTime: post.updateTime }));
    }
    caseStatus = action === "remove-post" ? "actioned" : "closed";
    const reportStatus = action === "remove-post" ? "actioned" : "closed";
    writes.push(updateWrite(reportName, {
      status: reportStatus,
      updatedAt: timestamp,
      resolvedAt: timestamp,
      decisionCode,
      actionKind: action,
      caseId,
    }, { updateTime: report.updateTime }));
  } else {
    if (!rawTarget) throw new Error(`${action} requires an exact gallery document.`);
    const gallery = decodeFirestoreDocument(rawTarget);
    const galleryId = validatedDocumentId(gallery.id, "gallery ID");
    const galleryName = documentName(projectId, `galleries/${galleryId}`, databaseId);
    exactTarget(rawTarget, galleryName, "Gallery");
    const currentlyEligible = gallery.data.discoverEligible === true;
    if (!expectedDiscover || !["eligible", "ineligible"].includes(expectedDiscover))
      throw new Error("Space actions require --expected-discover eligible|ineligible.");
    if (currentlyEligible !== (expectedDiscover === "eligible"))
      throw new Error(`Space discovery state mismatch: expected ${expectedDiscover}.`);
    const desiredEligible = false;
    if (currentlyEligible === desiredEligible)
      throw new Error(`Space discovery is already ${desiredEligible ? "eligible" : "ineligible"}.`);
    targetKind = "space";
    target = { galleryId };
    caseStatus = "actioned";
    writes.push(updateWrite(galleryName, {
      discoverEligible: desiredEligible,
    }, { updateTime: gallery.updateTime }));
  }

  const caseValues = {
    targetKind,
    target,
    status: caseStatus,
    openedAt: rawCase ? decodeFirestoreDocument(rawCase).data.openedAt ?? timestamp : timestamp,
    updatedAt: timestamp,
    assignedOperatorId: operatorId,
    lastActionKind: action,
    lastDecisionCode: decisionCode,
    newReportPending: false,
    version: rawCase ? Number(decodeFirestoreDocument(rawCase).data.version ?? 0) + 1 : 1,
    schemaVersion: 1,
  };
  writes.push(caseWrite({ caseName, rawCase, values: caseValues }));
  writes.push(updateWrite(eventName, {
    caseId,
    targetKind,
    target,
    actionKind: action,
    decisionCode,
    operatorId,
    occurredAt: timestamp,
    nextCaseStatus: caseStatus,
    ...(reportId ? { reportId } : {}),
    schemaVersion: 1,
  }, { exists: false }));

  return {
    summary: {
      projectId,
      databaseId,
      caseId,
      action,
      decisionCode,
      operatorId,
      targetKind,
      target,
      expectedReportStatus,
      expectedDiscover,
      expectedCaseVersion: requiredCaseVersion,
      writeCount: writes.length,
      writes: writes.map((write) => ({
        document: write.update.name,
        fields: write.updateMask.fieldPaths,
        precondition: write.currentDocument,
      })),
    },
    writes,
  };
}
