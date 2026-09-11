import { describe, expect, it } from "vitest";
import type { AdminDashboard, AdminSource, AdminTelemetryEntry } from "../../services/adminConsoleTypes";
import { isFailedObservation, OPERATOR_TOOLS, recentSpaceAttention, releaseComparison, sourceFreshness, supportBundle } from "./adminOperationsModel";

const stamp = "2026-09-11T12:00:00.000Z";
const now = Date.parse(stamp);
const ok = <T>(data: T): AdminSource<T> => ({ status: "ok", fetchedAt: stamp, cached: false, data });
const entry: AdminTelemetryEntry = { timestamp: stamp, kind: "publish_failed", origin: "client", outcome: null, severity: "INFO", durationMs: null, template: null, runtime: null, stage: null, viewport: null };
function fixture(): AdminDashboard {
  return {
    schemaVersion: 1, generatedAt: stamp,
    release: ok({ schemaVersion: 1, commitSha: "a".repeat(40), builtAt: stamp }),
    content: ok({ galleries: { total: 5, recentLimit: 20, recent: [] }, creators: { total: 3, recentLimit: 20, recent: [] } }),
    telemetry: ok({ clientReported: true, windowMinutes: 60, sampleLimit: 50, sampledEntries: 1, byKind: { publish_failed: 1 }, byOutcome: {}, recent: [entry] }),
    github: ok({ repository: "bbyw2hrnf6-boop/VirtualArtPlattform", runs: [] }),
    checks: ok({ historyLimit: 10, runs: [] }), access: ok({ memberLimit: 100, members: [{ uid: "must-not-export-uid", email: "private@example.test", displayName: "Private Name", role: "owner", active: true, createdAt: stamp, updatedAt: stamp }] }),
  };
}

describe("admin operational projections", () => {
  it("recognizes INFO-level failure events without flagging successful publication", () => {
    for (const kind of ["publish_failed", "published_update_failed", "artwork_upload_failed", "application_error"]) expect(isFailedObservation({ ...entry, kind })).toBe(true);
    expect(isFailedObservation({ ...entry, kind: "publication", outcome: "failure" })).toBe(true);
    expect(isFailedObservation({ ...entry, kind: "scene", severity: "ERROR" })).toBe(true);
    expect(isFailedObservation({ ...entry, kind: "publish_completed", outcome: "success" })).toBe(false);
  });

  it("makes unavailable, stale and future-dated sources explicit", () => {
    expect(sourceFreshness(undefined, now)).toBe("unavailable");
    expect(sourceFreshness({ status: "unavailable", fetchedAt: stamp }, now)).toBe("unavailable");
    expect(sourceFreshness(ok({}), now)).toBe("current");
    expect(sourceFreshness(ok({}), now + 360001)).toBe("stale");
    expect(sourceFreshness(ok({}), now - 60001)).toBe("stale");
    expect(sourceFreshness({ status: "ok", fetchedAt: "invalid" }, now)).toBe("stale");
  });

  it("keeps live SHA, last successful deployment, latest failed attempt and same-SHA Verify distinct", () => {
    const dashboard = fixture();
    if (dashboard.github.status !== "ok") throw new Error("fixture");
    const run = { workflow: "Deploy" as const, runNumber: 1, headSha: "a".repeat(40), status: "completed", conclusion: "success", createdAt: stamp, updatedAt: stamp, url: "https://github.com/bbyw2hrnf6-boop/VirtualArtPlattform/actions/runs/1" };
    dashboard.github.data.runs = [
      { ...run, workflow: "Verify", runNumber: 4, headSha: "b".repeat(40) },
      { ...run, runNumber: 3, conclusion: "failure", headSha: "b".repeat(40), createdAt: "2026-09-11T13:00:00.000Z" },
      run, { ...run, workflow: "Verify", runNumber: 2 },
    ];
    const result = releaseComparison(dashboard);
    expect(result.latestAttempt?.runNumber).toBe(3);
    expect(result.lastSuccessful?.runNumber).toBe(1);
    expect(result.matchingVerify?.runNumber).toBe(2);
    dashboard.release = undefined;
    expect(releaseComparison(dashboard).matchingVerify).toBeNull();
  });

  it("reviews only the supplied recent sample without inferring a global cleanup queue", () => {
    const dashboard = fixture();
    if (dashboard.content.status !== "ok") throw new Error("fixture");
    const space = { resourceRef: "sample", visibility: "public", lifecycleStatus: "active", templateId: null, revision: 1, updatedAt: stamp, expiresAt: null };
    dashboard.content.data.galleries.recent = [space, { ...space, resourceRef: "expired", expiresAt: stamp }, { ...space, resourceRef: "soon", expiresAt: "2026-09-12T12:00:00.000Z" }, { ...space, resourceRef: "trash", lifecycleStatus: "trashed" }, { ...space, resourceRef: "far", expiresAt: "2026-10-20T12:00:00.000Z" }];
    expect(recentSpaceAttention(dashboard).map(({ resourceRef }) => resourceRef)).toEqual(["sample", "expired", "soon", "trash"]);
  });

  it("exports an explicit operational projection, never access identities or future raw fields", () => {
    const dashboard = fixture();
    if (dashboard.telemetry.status !== "ok") throw new Error("fixture");
    Object.assign(dashboard.telemetry.data.recent[0], { uid: "must-not-export-uid", token: "secret-token" });
    Object.assign(dashboard.release!, { raw: "unreviewed-data" });
    const serialized = JSON.stringify(supportBundle(dashboard));
    for (const privateValue of ["must-not-export-uid", "private@example.test", "Private Name", "secret-token", "unreviewed-data"]) expect(serialized).not.toContain(privateValue);
    expect(serialized).toContain("publish_failed");
    expect(OPERATOR_TOOLS).toHaveLength(6);
    for (const { command } of OPERATOR_TOOLS) expect(command).not.toMatch(/deploy|bootstrap|cleanup|delete|moderation:action|maintenance:/i);
  });
});
