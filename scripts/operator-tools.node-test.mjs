import test from "node:test";
import assert from "node:assert/strict";
import {
  assertExecutionGuard,
  boundedLimit,
  buildModerationActionPlan,
  buildPublicContentDecisionPlan,
  decodeCursor,
  documentName,
  encodeCursor,
  encodeFirestoreFields,
  formatModerationCase,
  formatPublicContent,
  parseFlags,
  reportModerationCaseId,
} from "./lib/firebase-operator-tools.mjs";

const projectId = "virtualartplattform";
const reportId = "a".repeat(64);
const caseId = "b".repeat(64);
const timestamp = "2026-09-02T10:00:00.000Z";

function raw(relativePath, data, updateTime = "2026-09-02T09:00:00.000Z") {
  return {
    name: documentName(projectId, relativePath),
    fields: encodeFirestoreFields(data),
    createTime: "2026-09-01T09:00:00.000Z",
    updateTime,
  };
}

test("operator flags and bounds reject ambiguous input", () => {
  assert.deepEqual(parseFlags(["--kind", "spaces", "--include-content"], {
    kind: "value",
    "include-content": "boolean",
  }), { kind: "spaces", "include-content": true });
  assert.throws(() => parseFlags(["--kind", "spaces", "--kind", "posts"], { kind: "value" }), /Duplicate/);
  assert.equal(boundedLimit("100"), 100);
  assert.throws(() => boundedLimit("101"), /1 to 100/);
});

test("opaque cursors are project-bound", () => {
  const name = documentName(projectId, "galleries/example-space");
  const cursor = encodeCursor(name);
  assert.equal(decodeCursor(cursor, projectId), name);
  assert.throws(() => decodeCursor(cursor, "another-project"), /does not belong/);
});

test("public review hides content unless explicitly requested", () => {
  const gallery = raw("galleries/example-space", {
    title: "Private working title",
    artist: "Artist Name",
    visibility: "public",
    lifecycleStatus: "active",
    expiresAt: "2099-01-01T00:00:00.000Z",
    revision: 2,
    artworks: [{ id: "work-1", title: "Public work", description: "Wall text", storagePath: "published/owner/example-space/artworks/1.webp" }],
    discoverEligible: true,
    exploreListed: true,
  });
  const safe = formatPublicContent("spaces", gallery);
  assert.equal(safe.title, undefined);
  assert.equal(safe.artist, undefined);
  assert.equal(safe.artworks, undefined);
  assert.match(safe.contentFingerprint, /^[a-f0-9]{64}$/);
  const explicit = formatPublicContent("spaces", gallery, { includeContent: true });
  assert.equal(explicit.title, "Private working title");
  assert.equal(explicit.artist, "Artist Name");
  assert.equal(explicit.artworks[0].description, "Wall text");
});

test("public Creator review lists pending profiles without granting approval", () => {
  const pending = raw("creatorProfiles/creator456", {
    handle: "creator",
    displayName: "Creator",
    profilePublic: true,
    discoverEligible: false,
  });
  assert.equal(formatPublicContent("creators", pending).discoverEligible, false);
  const approved = raw("creatorProfiles/creator456", {
    handle: "creator",
    displayName: "Creator",
    profilePublic: true,
    discoverEligible: true,
  });
  assert.equal(formatPublicContent("creators", approved).handle, "creator");
});

test("public-content approval binds exact Space revision, fingerprint, and update time", () => {
  const gallery = raw("galleries/example-space", {
    title: "Material Futures",
    artist: "Studio North",
    visibility: "public",
    lifecycleStatus: "active",
    expiresAt: "2099-01-01T00:00:00.000Z",
    revision: 2,
    artworks: [{ id: "work-1", storagePath: "published/owner/example-space/artworks/1.webp" }],
    discoverEligible: false,
  });
  const reviewed = formatPublicContent("spaces", gallery);
  const plan = buildPublicContentDecisionPlan({
    projectId,
    kind: "space",
    targetId: "example-space",
    decision: "approve",
    reasonCode: "reviewed-production",
    operatorId: "operator.one",
    occurredAt: timestamp,
    eventId: "event123",
    rawTarget: gallery,
    rawReview: null,
    expectedGate: "pending",
    expectedUpdateTime: gallery.updateTime,
    expectedFingerprint: reviewed.contentFingerprint,
    expectedRevision: 2,
  });
  assert.equal(plan.writes.length, 3);
  assert.equal(plan.writes[0].update.fields.discoverEligible.booleanValue, true);
  assert.deepEqual(plan.writes[0].currentDocument, { updateTime: gallery.updateTime });
  assert.deepEqual(plan.writes[1].currentDocument, { exists: false });
  assert.deepEqual(plan.writes[2].currentDocument, { exists: false });
  assert.equal(JSON.stringify(plan).includes("Material Futures"), false);
});

test("public-content approval refuses a stale review or placeholder Space", () => {
  const gallery = raw("galleries/example-space", {
    title: "Untitled exhibition",
    artist: "Your name",
    visibility: "public",
    lifecycleStatus: "active",
    expiresAt: "2099-01-01T00:00:00.000Z",
    revision: 1,
    artworks: [{ storagePath: "published/owner/example-space/artworks/1.webp" }],
    discoverEligible: false,
  });
  const reviewed = formatPublicContent("spaces", gallery);
  const input = {
    projectId,
    kind: "space",
    targetId: "example-space",
    decision: "approve",
    reasonCode: "reviewed-production",
    operatorId: "operator.one",
    occurredAt: timestamp,
    eventId: "event123",
    rawTarget: gallery,
    rawReview: null,
    expectedGate: "pending",
    expectedUpdateTime: gallery.updateTime,
    expectedFingerprint: reviewed.contentFingerprint,
    expectedRevision: 1,
  };
  assert.throws(() => buildPublicContentDecisionPlan({
    ...input,
    expectedUpdateTime: "2026-09-02T08:59:59.000Z",
  }), /update-time mismatch/);
  assert.throws(() => buildPublicContentDecisionPlan(input), /non-placeholder/);
});

test("public-content approval handles a pending Creator without a fake revision", () => {
  const creator = raw("creatorProfiles/creator456", {
    handle: "studio-north",
    displayName: "Studio North",
    bio: "Spatial work.",
    links: [],
    profilePublic: true,
    discoverEligible: false,
    imagePresent: false,
    coverPresent: false,
  });
  const reviewed = formatPublicContent("creators", creator);
  const plan = buildPublicContentDecisionPlan({
    projectId,
    kind: "creator",
    targetId: "creator456",
    decision: "approve",
    reasonCode: "reviewed-production",
    operatorId: "operator.one",
    occurredAt: timestamp,
    eventId: "event123",
    rawTarget: creator,
    rawReview: null,
    expectedGate: "pending",
    expectedUpdateTime: creator.updateTime,
    expectedFingerprint: reviewed.contentFingerprint,
  });
  assert.equal(plan.summary.contentVersion, creator.updateTime);
  assert.equal(plan.writes[0].update.fields.discoverEligible.booleanValue, true);
});

test("moderation queue projection exposes case metadata but no reporter identity", () => {
  const moderationCase = raw(`moderationCases/${caseId}`, {
    targetKind: "creator-post",
    target: { creatorId: "creator456", postId: "post789" },
    status: "received",
    priority: "high",
    sourceReportIds: [reportId],
    reportCount: 1,
    newReportPending: true,
    openedAt: new Date("2026-09-01T10:00:00.000Z"),
    reporterAccountId: "must-not-leak",
    version: 1,
  });
  const record = formatModerationCase(moderationCase);
  assert.equal(record.caseId, caseId);
  assert.deepEqual(record.sourceReportIds, [reportId]);
  assert.equal(record.newReportPending, true);
  assert.equal(JSON.stringify(record).includes("must-not-leak"), false);
});

test("remove-post plan is bounded, atomic, and contains no post body", () => {
  const report = raw(`creatorReports/${reportId}`, {
    reporterCreatorId: "reporter123",
    targetCreatorId: "creator456",
    postId: "post789",
    reason: "spam",
    status: "open",
    caseId,
    createdAt: new Date("2026-09-01T10:00:00.000Z"),
    schemaVersion: 1,
  });
  const post = raw("creatorAccounts/creator456/posts/post789", {
    body: "Content must never enter the action plan.",
    moderationStatus: "published",
  });
  const plan = buildModerationActionPlan({
    projectId,
    action: "remove-post",
    decisionCode: "spam",
    operatorId: "operator.one",
    occurredAt: timestamp,
    eventId: "event123",
    caseId,
    rawCase: raw(`moderationCases/${caseId}`, {
      targetKind: "creator-post",
      target: { creatorId: "creator456", postId: "post789" },
      status: "received",
      openedAt: new Date("2026-09-01T10:00:00.000Z"),
      version: 1,
    }),
    rawReport: report,
    rawTarget: post,
    expectedCaseVersion: 1,
    expectedReportStatus: "open",
  });
  assert.equal(plan.writes.length, 4);
  assert.equal(plan.summary.writeCount, 4);
  assert.equal(JSON.stringify(plan).includes("Content must never"), false);
  assert.equal(plan.writes[2].update.fields.newReportPending.booleanValue, false);
  assert.deepEqual(plan.writes[0].updateMask.fieldPaths, [
    "moderationCaseId",
    "moderationDecisionCode",
    "moderationStatus",
    "moderationUpdatedAt",
  ]);
  assert.deepEqual(plan.writes[0].currentDocument, { updateTime: post.updateTime });
  assert.equal(plan.writes[0].update.fields.moderationUpdatedAt.timestampValue, timestamp);
  assert.deepEqual(plan.writes.at(-1).currentDocument, { exists: false });
});

test("report action refuses status races", () => {
  const report = raw(`creatorReports/${reportId}`, {
    reporterCreatorId: "reporter123",
    targetCreatorId: "creator456",
    postId: "post789",
    reason: "other",
    status: "closed",
    caseId,
  });
  assert.throws(() => buildModerationActionPlan({
    projectId,
    action: "close-report",
    decisionCode: "no-violation",
    operatorId: "operator.one",
    occurredAt: timestamp,
    eventId: "event123",
    caseId,
    rawCase: raw(`moderationCases/${caseId}`, {
      targetKind: "creator-post",
      target: { creatorId: "creator456", postId: "post789" },
      status: "closed",
      openedAt: new Date("2026-09-01T10:00:00.000Z"),
      version: 2,
    }),
    rawReport: report,
    expectedCaseVersion: 2,
    expectedReportStatus: "open",
  }), /status mismatch/);
});

test("report actions use the persisted case and reject a mismatched assertion", () => {
  const report = raw(`creatorReports/${reportId}`, {
    targetCreatorId: "creator456",
    postId: "post789",
    status: "open",
    caseId,
  });
  assert.equal(reportModerationCaseId(report), caseId);
  assert.throws(() => reportModerationCaseId(report, "wrong-case"), /does not match/);
});

test("Space demotion changes only the compatibility moderation switch", () => {
  const gallery = raw("galleries/example-space", {
    title: "Example",
    visibility: "public",
    discoverEligible: true,
  });
  const plan = buildModerationActionPlan({
    projectId,
    action: "demote-space",
    decisionCode: "rights",
    operatorId: "operator.one",
    occurredAt: timestamp,
    eventId: "event123",
    caseId: "case-example-space",
    rawTarget: gallery,
    expectedCaseVersion: 0,
    expectedDiscover: "eligible",
  });
  assert.deepEqual(plan.writes[0].updateMask.fieldPaths, ["discoverEligible"]);
  assert.equal(plan.writes[0].update.fields.discoverEligible.booleanValue, false);
  assert.deepEqual(plan.writes[0].currentDocument, { updateTime: gallery.updateTime });
});

test("execute mode requires exact project confirmation", () => {
  assert.doesNotThrow(() => assertExecutionGuard({ execute: false, projectId }));
  assert.throws(() => assertExecutionGuard({
    execute: true,
    confirmProject: "wrong-project",
    projectId,
  }), /exact FIREBASE_PROJECT_ID/);
  assert.doesNotThrow(() => assertExecutionGuard({
    execute: true,
    confirmProject: projectId,
    projectId,
  }));
});
