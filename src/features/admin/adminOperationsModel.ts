import type { AdminCheck, AdminCheckRun, AdminDashboard, AdminTelemetryEntry } from "../../services/adminConsoleTypes";

export const CHECK_LABELS: Record<AdminCheck["target"], string> = {
  home: "Home & security headers", creators: "Creator directory page", sitemap: "Canonical sitemap",
  "missing-space": "Missing Space privacy", "admin-shell": "Admin privacy & cache policy",
  "missing-creator": "Missing creator privacy", robots: "Robots sitemap declaration",
  "creator-data": "Public creator data contract", "admin-auth": "Anonymous admin access denied",
  "white-cube-asset": "White Cube asset", "nocturne-asset": "Warm Gallery asset",
  "pavilion-asset": "Grand Forum asset", release: "Deployed release identity",
};

export const EVIDENCE_LABELS: Record<NonNullable<AdminCheck["evidence"]>, string> = {
  ok: "Contract passed", "http-status": "Unexpected HTTP status", "content-type": "Unexpected content type",
  "privacy-headers": "Noindex / no-store contract failed", "security-headers": "Security header missing",
  "cache-policy": "Cache policy failed",
  "body-contract": "Response contract failed", "body-too-large": "Response exceeded its safety limit",
  network: "Connection or body transfer failed", timeout: "Request timed out", legacy: "Legacy HTTP-only suite",
};

export const CHECK_NEXT_STEPS: Record<NonNullable<AdminCheck["evidence"]>, string> = {
  ok: "No action for this observation. It does not replace browser or authenticated access tests.",
  "http-status": "Check the Hosting route, latest release and corresponding Function logs. Do not change content to clear a check.",
  "content-type": "Check for an HTML fallback, a missing asset or an incorrect response header.",
  "privacy-headers": "Inspect the raw response and Hosting/Function privacy headers before sharing this route.",
  "security-headers": "Compare the response with the reviewed Hosting security-header policy.",
  "cache-policy": "Check the reviewed route policy: immutable for versioned assets, revalidation for release identity.",
  "body-contract": "Review the response shape, metadata or public field allowlist in the responsible endpoint.",
  "body-too-large": "Inspect response growth and pagination. Keep the safety limit; do not increase it just to pass.",
  network: "Check service availability and retry after the cooldown. No HTTP result was invented.",
  timeout: "Inspect latency and cold starts, then retry. This is not proof of a broken user journey.",
  legacy: "Run the current suite for response-body and privacy-header coverage.",
};

export function isFailedObservation(entry: AdminTelemetryEntry): boolean {
  return /error|fatal|critical/i.test(entry.severity) || /fail|error|context_lost/i.test(entry.outcome ?? "") ||
    /(?:_failed|_error)$/.test(entry.kind);
}

export function sourceFreshness(source: { status: string; fetchedAt: string } | undefined, now: number): "unavailable" | "stale" | "current" {
  if (!source || source.status !== "ok") return "unavailable";
  const age = now - Date.parse(source.fetchedAt);
  return !Number.isFinite(age) || age < -60_000 || age > 6 * 60_000 ? "stale" : "current";
}

export function releaseComparison(dashboard: AdminDashboard) {
  const runs = dashboard.github.status === "ok" ? dashboard.github.data.runs : [];
  const deployed = dashboard.release?.status === "ok" ? dashboard.release.data : null;
  const attempts = runs.filter((run) => run.workflow === "Deploy").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    deployed, latestAttempt: attempts[0] ?? null,
    lastSuccessful: attempts.find((run) => run.conclusion === "success") ?? null,
    matchingVerify: deployed ? runs.find((run) => run.workflow === "Verify" && run.headSha === deployed.commitSha && run.conclusion === "success") ?? null : null,
  };
}

export function recentSpaceAttention(dashboard: AdminDashboard) {
  if (dashboard.content.status !== "ok") return [];
  const now = Date.parse(dashboard.generatedAt);
  return dashboard.content.data.galleries.recent.flatMap((space) => {
    const expires = space.expiresAt ? Date.parse(space.expiresAt) : NaN;
    const reason = space.lifecycleStatus === "trashed" ? "In Trash — check recovery policy" :
      space.lifecycleStatus !== "active" ? null :
      !Number.isFinite(expires) ? "Expiry not reported" : expires <= now ? "Expiry reached — review lifecycle" :
      expires - now <= 7 * 86_400_000 ? "Expires within 7 days" : null;
    return reason ? [{ resourceRef: space.resourceRef, reason, expiresAt: space.expiresAt }] : [];
  });
}

export const OPERATOR_TOOLS = [
  { title: "Public live smoke", command: "npm run smoke:production -- --base-url https://lieuva.com --project-id virtualartplattform", detail: "Five credential-free HTTP checks against production. No user-data writes.", requires: "Node 22.23.2 · network" },
  { title: "Browser journeys", command: "npm run build && npm run test:browser-smoke", detail: "Local Chromium checks for rooms, navigation, mobile editing and admin access fixtures.", requires: "Node 22.23.2 · npm 10.9.8 · installed Chromium" },
  { title: "Publishing & draft recovery", command: "npm run test:release-gate", detail: "Regression tests for placement, publication and preserving local work.", requires: "Installed project dependencies" },
  { title: "Firebase access rules", command: "npm run test:firebase-rules", detail: "Authorization matrix against isolated Firestore/Storage emulators, never live rules.", requires: "Java 21 · locked Firebase CLI dependencies" },
  { title: "Backend checks", command: "npm run check:functions", detail: "Function unit tests, type checking and compilation; no deployment.", requires: "Installed functions dependencies" },
  { title: "Full quality gate", command: "npm run check", detail: "Lint, tests, asset validation, builds and performance ceilings.", requires: "Node 22.23.2 · npm 10.9.8" },
] as const;

// Explicit projection: never export membership identities or future raw fields.
export function checkRunReport(run: AdminCheckRun) {
  return {
    id: run.id, suiteVersion: run.suiteVersion ?? 1, startedAt: run.startedAt, completedAt: run.completedAt, overall: run.overall,
    checks: run.checks.map(({ target, url, expectedStatus, actualStatus, status, durationMs, evidence }) => ({ target, url, expectedStatus, actualStatus, status, durationMs, evidence })),
  };
}

export function supportBundle(dashboard: AdminDashboard) {
  const source = (value: { status: string; fetchedAt: string; cached: boolean; reason?: string } | undefined) => value
    ? { status: value.status, fetchedAt: value.fetchedAt, cached: value.cached, ...(value.reason ? { reason: value.reason } : {}) } : { status: "unavailable" };
  return {
    schemaVersion: 1, generatedAt: dashboard.generatedAt,
    sources: { content: source(dashboard.content), telemetry: source(dashboard.telemetry), github: source(dashboard.github), checks: source(dashboard.checks), release: source(dashboard.release) },
    release: dashboard.release?.status === "ok" ? { commitSha: dashboard.release.data.commitSha, builtAt: dashboard.release.data.builtAt } : null,
    totals: dashboard.content.status === "ok" ? { spaces: dashboard.content.data.galleries.total, creators: dashboard.content.data.creators.total } : null,
    checks: dashboard.checks.status === "ok" ? dashboard.checks.data.runs.map(checkRunReport) : [],
    telemetry: dashboard.telemetry.status === "ok" ? dashboard.telemetry.data.recent.map(({ timestamp, kind, outcome, severity, durationMs, template, runtime, stage, viewport, origin }) => ({ timestamp, kind, outcome, severity, durationMs, template, runtime, stage, viewport, origin })) : [],
    workflows: dashboard.github.status === "ok" ? dashboard.github.data.runs.map(({ workflow, runNumber, status, conclusion, headSha, url, updatedAt }) => ({ workflow, runNumber, status, conclusion, headSha, url, updatedAt })) : [],
  };
}

export function downloadAdminJson(value: unknown, name: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${name}-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
