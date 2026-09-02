import { createHash } from "node:crypto";

export type ModerationReportReason = "spam" | "harassment" | "rights" | "unsafe" | "other";
export type ModerationPriority = "standard" | "high" | "urgent";

const PRIORITY_RANK: Record<ModerationPriority, number> = {
  standard: 0,
  high: 1,
  urgent: 2,
};

function safeCount(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;
}

function boundedString(value: unknown, maximum = 128): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= maximum
    ? value
    : undefined;
}

/** Stable compatibility ID: one reporter record per target post. */
export function creatorPostReportId(
  reporterCreatorId: string,
  targetCreatorId: string,
  postId: string,
): string {
  return createHash("sha256")
    .update(`${reporterCreatorId}:${targetCreatorId}:${postId}`)
    .digest("hex");
}

/** Preserve legacy Creator IDs while allowing any authenticated account to report. */
export function creatorReportPrincipal(accountId: string, creatorId: unknown): string {
  return typeof creatorId === "string" && creatorId.length > 0 && creatorId.length <= 128
    ? creatorId
    : `account:${accountId}`;
}

/** Stable case ID: all reports for one target post enter the same operator case. */
export function creatorPostModerationCaseId(targetCreatorId: string, postId: string): string {
  return createHash("sha256")
    .update(`creator-post:${targetCreatorId}:${postId}`)
    .digest("hex");
}

export function moderationPriorityForReason(reason: ModerationReportReason): ModerationPriority {
  if (reason === "unsafe") return "urgent";
  if (reason === "harassment" || reason === "rights") return "high";
  return "standard";
}

export function highestModerationPriority(
  current: unknown,
  incoming: ModerationPriority,
): ModerationPriority {
  const normalized = current === "standard" || current === "high" || current === "urgent"
    ? current
    : "standard";
  return PRIORITY_RANK[incoming] > PRIORITY_RANK[normalized] ? incoming : normalized;
}

/**
 * Build only fields that intake is allowed to change. Existing status, case,
 * assignee, decision, and notice fields are intentionally absent, so a repeat
 * report cannot reopen or erase operator work.
 */
export function creatorReportIntakePatch(
  existing: Record<string, unknown> | undefined,
  reason: ModerationReportReason,
  computedCaseId: string,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    reason,
    reportCount: safeCount(existing?.reportCount) + 1,
    intakeChannel: "in-product",
    schemaVersion: 2,
  };
  if (!existing) {
    patch.status = "open";
    patch.caseId = computedCaseId;
  } else {
    if (!boundedString(existing.status, 40)) patch.status = "open";
    if (!boundedString(existing.caseId, 128)) patch.caseId = computedCaseId;
  }
  return patch;
}

/** Add one source receipt without allowing a case document to grow forever. */
export function boundedModerationSourceReports(
  current: unknown,
  reportId: string,
  maximum = 50,
): string[] {
  const values = Array.isArray(current)
    ? current.filter((value): value is string => Boolean(boundedString(value, 128)))
    : [];
  const unique = [...new Set(values)].slice(0, maximum);
  if (!unique.includes(reportId) && unique.length < maximum) unique.push(reportId);
  return unique;
}
