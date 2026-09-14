import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  APP_CONTENT_SECURITY_POLICY,
  APP_CSP_REPORT_URL,
  APP_REPORTING_ENDPOINTS,
} from "./securityHeaders.js";

const publicDelivery = readFileSync(new URL("./publicDelivery.ts", import.meta.url), "utf8");

function publicHandler(name: string, nextName: string) {
  return publicDelivery.slice(
    publicDelivery.indexOf(`export const ${name}`),
    publicDelivery.indexOf(`export const ${nextName}`),
  );
}

describe("application Content Security Policy rollout", () => {
  it("keeps static Hosting and server-rendered HTML on the same report-only policy", () => {
    const firebase = JSON.parse(readFileSync(new URL("../../firebase.json", import.meta.url), "utf8"));
    const globalHeaders = firebase.hosting.headers.find(
      (entry: { source?: string }) => entry.source === "**",
    )?.headers ?? [];
    expect(globalHeaders).toContainEqual({
      key: "Content-Security-Policy-Report-Only",
      value: APP_CONTENT_SECURITY_POLICY,
    });
    expect(globalHeaders).toContainEqual({
      key: "Reporting-Endpoints",
      value: APP_REPORTING_ENDPOINTS,
    });
    expect(APP_CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
    expect(APP_CONTENT_SECURITY_POLICY).toContain("https://*.googleapis.com");
    expect(APP_CONTENT_SECURITY_POLICY).toContain("https://*.firebaseapp.com");
    expect(APP_CONTENT_SECURITY_POLICY).toContain("'wasm-unsafe-eval'");
    expect(APP_CONTENT_SECURITY_POLICY).toContain("connect-src 'self' blob:");
    expect(APP_CONTENT_SECURITY_POLICY).toContain("blob:");
    expect(APP_CONTENT_SECURITY_POLICY).toContain(`report-uri ${APP_CSP_REPORT_URL}`);
    expect(APP_CONTENT_SECURITY_POLICY).toContain("report-to lieuva-csp");
  });

  it("applies resource-level robots policy to JSON and derived-ineligible images", () => {
    for (const [name, next] of [
      ["creatorProfileData", "creatorDirectoryData"],
      ["creatorDirectoryData", "creatorImage"],
      ["creatorAttribution", "spaceCard"],
    ]) expect(publicHandler(name, next)).toContain('response.set("X-Robots-Tag", "noindex,nofollow")');
    for (const [name, next] of [
      ["creatorImage", "creatorCover"],
      ["creatorCover", "creatorAttribution"],
    ]) expect(publicHandler(name, next)).toContain("mediaRobots(isCreatorProfileIndexEligible(profile))");
    expect(publicHandler("spaceCard", "spaceSitemap"))
      .toContain("mediaRobots(delivery.indexEligible)");
  });
});
