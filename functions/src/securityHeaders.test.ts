import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  APP_CONTENT_SECURITY_POLICY,
  APP_CSP_REPORT_URL,
  APP_REPORTING_ENDPOINTS,
} from "./securityHeaders.js";

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
});
