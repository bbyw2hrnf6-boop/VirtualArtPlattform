import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  NEWSLETTER_UNSUBSCRIBE_TOKEN_TTL_MS,
  NewsletterUnsubscribeRequestLimiter,
  newsletterUnsubscribeRequest,
  nextNewsletterTokenVersion,
  shouldRotateNewsletterToken,
  unsubscribeTokenState,
} from "./newsletterLifecycle.js";

describe("newsletter unsubscribe lifecycle", () => {
  it("keeps opt-out available when outbound mail configuration is unavailable", () => {
    const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    const preferenceHandler = source.slice(
      source.indexOf("export const setAuraNewsletterPreference"),
      source.indexOf("function responsePage"),
    );
    expect(preferenceHandler.indexOf("if (!subscribed)")).toBeLessThan(
      preferenceHandler.indexOf("requireMailConfiguration"),
    );
    const handler = source.slice(
      source.indexOf("export const unsubscribeAuraNewsletter"),
      source.indexOf("export const lieuvaCspReport"),
    );
    expect(handler).not.toContain("requireMailConfiguration");
  });

  it("keeps GET scanner-safe and reserves mutation for POST", () => {
    expect(newsletterUnsubscribeRequest("GET")).toBe("confirm");
    expect(newsletterUnsubscribeRequest("POST")).toBe("execute");
    expect(newsletterUnsubscribeRequest("HEAD")).toBe("reject");
  });

  it("bounds unauthenticated POST work before a token lookup", () => {
    const limiter = new NewsletterUnsubscribeRequestLimiter(2);
    expect(limiter.allow(1_000)).toBe(true);
    expect(limiter.allow(1_001)).toBe(true);
    expect(limiter.allow(1_002)).toBe(false);
    expect(limiter.allow(61_000)).toBe(true);
    expect(limiter.allow(60_000)).toBe(true);
    expect(() => new NewsletterUnsubscribeRequestLimiter(0)).toThrow(/limit-invalid/);
  });

  it("rotates only when entering subscribed state", () => {
    expect(shouldRotateNewsletterToken(undefined)).toBe(true);
    expect(shouldRotateNewsletterToken({ status: "unsubscribed" })).toBe(true);
    expect(shouldRotateNewsletterToken({ status: "subscribed" })).toBe(false);
    expect(nextNewsletterTokenVersion(undefined)).toBe(1);
    expect(nextNewsletterTokenVersion(4)).toBe(5);
  });

  it("accepts only the current unexpired token", () => {
    const now = Date.parse("2026-09-03T10:00:00.000Z");
    expect(unsubscribeTokenState({
      uid: "account-a", version: 2, usedAt: null, expiresAt: new Date(now + 1_000),
    }, { unsubscribeTokenVersion: 2 }, now)).toBe("active");
    expect(unsubscribeTokenState({
      uid: "account-a", version: 1, usedAt: null, expiresAt: new Date(now + 1_000),
    }, { unsubscribeTokenVersion: 2 }, now)).toBe("superseded");
    expect(unsubscribeTokenState({
      uid: "account-a", version: 2, usedAt: null, expiresAt: new Date(now),
    }, { unsubscribeTokenVersion: 2 }, now)).toBe("expired");
    expect(unsubscribeTokenState({
      uid: "account-a", version: 2, usedAt: new Date(now - 1), expiresAt: new Date(now + 1_000),
    }, { unsubscribeTokenVersion: 2 }, now)).toBe("used");
  });

  it("gives legacy links a bounded compatibility window", () => {
    const now = Date.parse("2026-09-03T10:00:00.000Z");
    expect(unsubscribeTokenState({ uid: "account-a", usedAt: null, createdAt: new Date(now - 1_000) }, {}, now)).toBe("active");
    expect(unsubscribeTokenState({
      uid: "account-a", usedAt: null, createdAt: new Date(now - NEWSLETTER_UNSUBSCRIBE_TOKEN_TTL_MS),
    }, {}, now)).toBe("expired");
  });
});
