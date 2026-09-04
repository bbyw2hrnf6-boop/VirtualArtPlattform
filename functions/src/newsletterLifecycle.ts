export const NEWSLETTER_UNSUBSCRIBE_TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1_000;

type TimestampLike = { toMillis?: () => number };

function timestampMillis(value: unknown): number | undefined {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === "object" && typeof (value as TimestampLike).toMillis === "function") {
    const result = (value as TimestampLike).toMillis!();
    return Number.isFinite(result) ? result : undefined;
  }
  if (typeof value === "string" || typeof value === "number") {
    const result = new Date(value).getTime();
    return Number.isFinite(result) ? result : undefined;
  }
  return undefined;
}

export function nextNewsletterTokenVersion(value: unknown): number {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) < Number.MAX_SAFE_INTEGER
    ? Number(value) + 1
    : 1;
}

/** Repeated subscribe calls stay idempotent; an actual resubscribe rotates. */
export function shouldRotateNewsletterToken(subscription: Record<string, unknown> | undefined): boolean {
  return subscription?.status !== "subscribed";
}

export type UnsubscribeTokenState = "active" | "expired" | "invalid" | "superseded" | "used";

/**
 * New tokens carry an explicit expiry and monotonic version. Legacy welcome
 * links remain usable for one TTL from createdAt while the subscription has no
 * version, preserving the existing external link contract during migration.
 */
export function unsubscribeTokenState(
  token: Record<string, unknown> | undefined,
  subscription: Record<string, unknown> | undefined,
  now = Date.now(),
): UnsubscribeTokenState {
  if (!token || typeof token.uid !== "string" || !token.uid) return "invalid";
  if (token.usedAt) return "used";
  const tokenVersion = token.version;
  const subscriptionVersion = subscription?.unsubscribeTokenVersion;
  if (tokenVersion === undefined && subscriptionVersion === undefined) {
    const createdAt = timestampMillis(token.createdAt);
    if (createdAt === undefined || createdAt + NEWSLETTER_UNSUBSCRIBE_TOKEN_TTL_MS <= now) return "expired";
    return "active";
  }
  if (!Number.isSafeInteger(tokenVersion) || !Number.isSafeInteger(subscriptionVersion) || tokenVersion !== subscriptionVersion)
    return "superseded";
  const expiresAt = timestampMillis(token.expiresAt);
  return expiresAt !== undefined && expiresAt > now ? "active" : "expired";
}

export function newsletterUnsubscribeRequest(method: unknown): "confirm" | "execute" | "reject" {
  if (method === "GET") return "confirm";
  if (method === "POST") return "execute";
  return "reject";
}

/** A coarse per-instance ceiling for the public bearer-token endpoint. Token
 * lookup is intentionally unauthenticated, so forged POST traffic must stop
 * before it can produce an unbounded Firestore read stream. */
export class NewsletterUnsubscribeRequestLimiter {
  private windowStartedAt: number | undefined;
  private accepted = 0;

  constructor(private readonly maximumPerMinute = 60) {
    if (!Number.isSafeInteger(maximumPerMinute) || maximumPerMinute < 1)
      throw new Error("newsletter-request-limit-invalid");
  }

  allow(nowMs: number) {
    if (!Number.isSafeInteger(nowMs) || nowMs < 0) return false;
    if (this.windowStartedAt === undefined || nowMs < this.windowStartedAt ||
      nowMs - this.windowStartedAt >= 60_000) {
      this.windowStartedAt = nowMs;
      this.accepted = 0;
    }
    if (this.accepted >= this.maximumPerMinute) return false;
    this.accepted += 1;
    return true;
  }
}
