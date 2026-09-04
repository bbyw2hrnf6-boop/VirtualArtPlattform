const ALLOWED_DISPOSITIONS = new Set(["enforce", "report"]);
const MAX_REPORT_BYTES = 32 * 1024;
const MAX_REPORTS_PER_REQUEST = 16;
const DIRECTIVE = /^[a-z][a-z0-9-]{0,63}$/;
const REPORT_MEDIA_TYPES = new Set([
  "application/csp-report",
  "application/json",
  "application/reports+json",
]);

function shortText(value: unknown, maximum = 240) {
  return typeof value === "string"
    ? [...value].filter((character) => {
        const code = character.charCodeAt(0);
        return code >= 32 && code !== 127;
      }).join("").slice(0, maximum)
    : undefined;
}

function safeUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 4_096) return undefined;
  if (["inline", "eval", "data", "blob"].includes(value)) return value;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return url.protocol.slice(0, 24);
    // CSP reports are unauthenticated. Origin is enough to diagnose an
    // allowlist gap without logging private Space IDs or attacker-made paths.
    return url.origin.slice(0, 240);
  } catch {
    return value.startsWith("/") ? "relative" : "invalid";
  }
}

function directive(value: unknown) {
  const name = shortText(value, 120)?.trim().toLowerCase().split(/\s+/, 1)[0];
  return name && DIRECTIVE.test(name) ? name : undefined;
}

function positiveInteger(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? Math.min(value, 10_000_000)
    : undefined;
}

/** Parse legacy CSP and Reporting API bodies without retaining URL queries,
 * fragments, cookies, headers, policy text, or arbitrary attacker fields. */
function parseCspViolationReportCandidate(candidate: unknown) {
  if (!candidate || typeof candidate !== "object") throw new Error("csp-report-invalid");
  const root = candidate as Record<string, unknown>;
  if (root.type !== undefined && root.type !== "csp-violation")
    throw new Error("csp-report-invalid");
  const report = root["csp-report"] && typeof root["csp-report"] === "object"
    ? root["csp-report"] as Record<string, unknown>
    : root.body && typeof root.body === "object"
      ? root.body as Record<string, unknown>
      : root;
  const effectiveDirective = directive(
    report["effective-directive"] ?? report.effectiveDirective,
  );
  const violatedDirective = directive(
    report["violated-directive"] ?? report.violatedDirective,
  );
  if (!effectiveDirective && !violatedDirective) throw new Error("csp-report-invalid");
  const disposition = shortText(report.disposition, 20);
  return {
    effectiveDirective: effectiveDirective ?? violatedDirective!,
    violatedDirective: violatedDirective ?? effectiveDirective!,
    blockedOrigin: safeUrl(report["blocked-uri"] ?? report.blockedURL),
    documentOrigin: safeUrl(report["document-uri"] ?? report.documentURL),
    sourceOrigin: safeUrl(report["source-file"] ?? report.sourceFile),
    lineNumber: positiveInteger(report["line-number"] ?? report.lineNumber),
    columnNumber: positiveInteger(report["column-number"] ?? report.columnNumber),
    statusCode: positiveInteger(report["status-code"] ?? report.statusCode),
    disposition: disposition && ALLOWED_DISPOSITIONS.has(disposition) ? disposition : undefined,
  };
}

export function parseCspViolationReports(body: unknown, contentLength?: unknown) {
  const length = Number(contentLength ?? 0);
  if (!Number.isFinite(length) || length < 0 || length > MAX_REPORT_BYTES)
    throw new Error("csp-report-size-invalid");
  const candidates = Array.isArray(body) ? body : [body];
  if (candidates.length < 1 || candidates.length > MAX_REPORTS_PER_REQUEST)
    throw new Error("csp-report-count-invalid");
  return candidates.map(parseCspViolationReportCandidate);
}

export function parseCspViolationReport(body: unknown, contentLength?: unknown) {
  return parseCspViolationReports(body, contentLength)[0];
}

export function isCspReportMediaType(value: unknown) {
  if (typeof value !== "string") return false;
  return REPORT_MEDIA_TYPES.has(value.split(";", 1)[0].trim().toLowerCase());
}

export function decodeCspReportBody(value: unknown) {
  if (typeof value === "string") return JSON.parse(value);
  if (value instanceof Uint8Array)
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(value));
  return value;
}

/** Per-warm-instance cap plus repeat suppression. maxInstances on the HTTP
 * function makes this a hard operational ceiling during steady-state abuse. */
export class CspReportLogLimiter {
  private windowStartedAt = 0;
  private accepted = 0;
  private readonly seen = new Map<string, number>();

  constructor(
    private readonly maximumPerMinute = 60,
    private readonly duplicateWindowMs = 5 * 60_000,
  ) {}

  allow(report: ReturnType<typeof parseCspViolationReport>, nowMs: number) {
    if (!Number.isSafeInteger(nowMs) || nowMs < 0) return false;
    if (this.windowStartedAt === 0 || nowMs - this.windowStartedAt >= 60_000) {
      this.windowStartedAt = nowMs;
      this.accepted = 0;
    }
    const key = JSON.stringify(report);
    const previous = this.seen.get(key);
    if (previous !== undefined && nowMs - previous < this.duplicateWindowMs) return false;
    if (this.accepted >= this.maximumPerMinute) return false;
    this.accepted += 1;
    this.seen.set(key, nowMs);
    if (this.seen.size > 256) {
      const oldest = this.seen.keys().next().value;
      if (oldest !== undefined) this.seen.delete(oldest);
    }
    return true;
  }
}
