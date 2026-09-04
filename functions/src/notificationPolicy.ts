import { createHash } from "node:crypto";

export type CreatorActionKind = "comment" | "follow" | "reaction" | "report";
export type CreatorNotificationKind = "comment" | "follow" | "reaction";

const ACTION_LIMITS: Readonly<Record<CreatorActionKind, { windowMs: number; maximum: number }>> = {
  comment: { windowMs: 10 * 60_000, maximum: 20 },
  follow: { windowMs: 60 * 60_000, maximum: 20 },
  reaction: { windowMs: 60 * 60_000, maximum: 60 },
  report: { windowMs: 60 * 60_000, maximum: 10 },
};
const NOTIFICATION_WINDOWS: Readonly<Record<CreatorNotificationKind, number>> = {
  comment: 15 * 60_000,
  follow: 24 * 60 * 60_000,
  reaction: 60 * 60_000,
};
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

function checkedId(value: string, label: string) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) throw new Error(`Invalid ${label}.`);
  return value;
}

function checkedRatePrincipal(value: string) {
  // Reports are available to authenticated accounts that do not yet own a
  // Creator profile. Their stable private principal is `account:<uid>`, which
  // is safe here because only the SHA-256 digest becomes a document ID.
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > 160
    || [...value].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  ) throw new Error("Invalid action-rate principal.");
  return value;
}

function actionPolicy(kind: CreatorActionKind) {
  if (typeof kind !== "string" || !Object.hasOwn(ACTION_LIMITS, kind))
    throw new Error("Invalid Creator action kind.");
  return ACTION_LIMITS[kind];
}

function notificationWindow(kind: CreatorNotificationKind) {
  if (typeof kind !== "string" || !Object.hasOwn(NOTIFICATION_WINDOWS, kind))
    throw new Error("Invalid Creator notification kind.");
  return NOTIFICATION_WINDOWS[kind];
}

function digest(parts: string[]) {
  return createHash("sha256").update(parts.join(":"), "utf8").digest("hex");
}

export function creatorActionRateId(actorPrincipalId: string, kind: CreatorActionKind) {
  actionPolicy(kind);
  return digest(["action", checkedRatePrincipal(actorPrincipalId), kind]);
}

export function creatorNotificationAggregateId(options: {
  kind: CreatorNotificationKind;
  actorCreatorId: string;
  targetCreatorId: string;
  resourceId?: string;
  now: number;
}) {
  if (!Number.isSafeInteger(options.now) || options.now < 0) throw new Error("Invalid notification time.");
  const bucket = Math.floor(options.now / notificationWindow(options.kind));
  return digest([
    "notification",
    options.kind,
    checkedId(options.actorCreatorId, "actor Creator ID"),
    checkedId(options.targetCreatorId, "target Creator ID"),
    options.resourceId === undefined
      ? "profile"
      : checkedId(options.resourceId, "notification resource ID"),
    String(bucket),
  ]);
}

export function nextCreatorActionRate(
  kind: CreatorActionKind,
  now: number,
  current?: { count?: unknown; windowStartedAtMs?: unknown },
) {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error("Invalid action time.");
  const policy = actionPolicy(kind);
  const currentStart = typeof current?.windowStartedAtMs === "number"
    && Number.isSafeInteger(current.windowStartedAtMs)
    && current.windowStartedAtMs >= 0
    ? current.windowStartedAtMs
    : undefined;
  const currentCount = typeof current?.count === "number"
    && Number.isSafeInteger(current.count)
    && current.count >= 0
    ? current.count
    : 0;
  const reset = currentStart === undefined || now - currentStart >= policy.windowMs || now < currentStart;
  const windowStartedAtMs = reset ? now : currentStart;
  const count = reset ? 1 : Math.min(Number.MAX_SAFE_INTEGER, currentCount + 1);
  return {
    allowed: count <= policy.maximum,
    count,
    maximum: policy.maximum,
    windowMs: policy.windowMs,
    windowStartedAtMs,
    retryAfterMs: count <= policy.maximum
      ? 0
      : Math.max(1, windowStartedAtMs + policy.windowMs - now),
  };
}
