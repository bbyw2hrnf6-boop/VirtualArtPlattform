import { describe, expect, it } from "vitest";
import {
  CspReportLogLimiter,
  decodeCspReportBody,
  isCspReportMediaType,
  parseCspViolationReport,
  parseCspViolationReports,
} from "./cspReport.js";

describe("CSP report intake", () => {
  it("keeps useful fields but removes URL secrets and arbitrary payload data", () => {
    expect(parseCspViolationReport({
      "csp-report": {
        "effective-directive": "script-src-elem",
        "violated-directive": "script-src 'self'",
        "blocked-uri": "https://evil.example/x.js?token=secret#fragment",
        "document-uri": "https://lieuva.com/space/demo?invite=secret",
        "source-file": "https://lieuva.com/assets/app.js?v=secret",
        "line-number": 12,
        "column-number": 4,
        "original-policy": "must-not-be-logged",
        cookie: "also-secret",
      },
    }, 1024)).toEqual({
      effectiveDirective: "script-src-elem",
      violatedDirective: "script-src",
      blockedOrigin: "https://evil.example",
      documentOrigin: "https://lieuva.com",
      sourceOrigin: "https://lieuva.com",
      lineNumber: 12,
      columnNumber: 4,
      statusCode: undefined,
      disposition: undefined,
    });
  });

  it("accepts Reporting API shape and rejects oversized or meaningless input", () => {
    expect(parseCspViolationReport([{ type: "csp-violation", body: {
      effectiveDirective: "connect-src",
      blockedURL: "https://api.example.test/private?key=secret",
      disposition: "report",
    } }], 200)).toMatchObject({
      effectiveDirective: "connect-src",
      blockedOrigin: "https://api.example.test",
      disposition: "report",
    });
    expect(() => parseCspViolationReport({}, 1)).toThrow("csp-report-invalid");
    expect(() => parseCspViolationReport({ "csp-report": { "effective-directive": "img-src" } }, 40_000))
      .toThrow("csp-report-size-invalid");
    expect(parseCspViolationReport({ "csp-report": {
      "effective-directive": "img-src",
      "blocked-uri": "/private/image?token=secret#fragment",
    } }, 100).blockedOrigin).toBe("relative");
    expect(parseCspViolationReport({ "csp-report": {
      "effective-directive": "img-src",
      "blocked-uri": "attacker-controlled-secret",
    } }, 100).blockedOrigin).toBe("invalid");
  });

  it("handles bounded batches, raw JSON, media types, duplicate suppression, and rate caps", () => {
    const body = [
      { type: "csp-violation", body: { effectiveDirective: "img-src", blockedURL: "data:" } },
      { type: "csp-violation", body: { effectiveDirective: "connect-src", blockedURL: "https://api.test/x" } },
    ];
    expect(parseCspViolationReports(body, 200)).toHaveLength(2);
    expect(parseCspViolationReports(decodeCspReportBody(Buffer.from(JSON.stringify(body))), 200))
      .toHaveLength(2);
    expect(isCspReportMediaType("application/reports+json; charset=utf-8")).toBe(true);
    expect(isCspReportMediaType("text/plain")).toBe(false);
    expect(() => parseCspViolationReports(Array.from({ length: 17 }, () => body[0]), 200))
      .toThrow("csp-report-count-invalid");

    const limiter = new CspReportLogLimiter(2, 1_000);
    const [first, second] = parseCspViolationReports(body, 200);
    expect(limiter.allow(first, 1_000)).toBe(true);
    expect(limiter.allow(first, 1_001)).toBe(false);
    expect(limiter.allow(second, 1_001)).toBe(true);
    expect(limiter.allow({ ...second, statusCode: 418 }, 1_002)).toBe(false);
    expect(limiter.allow(first, 61_001)).toBe(true);
  });
});
