import { describe, expect, it } from "vitest";
import {
  CHECK_HISTORY_PRUNE_BATCH_LIMIT,
  CHECK_HISTORY_RETENTION_LIMIT,
  FIXED_LIVE_CHECKS,
  parseGithubWorkflowRuns,
  parseStoredCheckRun,
  pruneLieuvaAdminCheckHistory,
  runFixedLieuvaAdminChecks,
  summarizeLoggingEntries,
} from "./adminConsole.js";

function githubRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 123456,
    run_number: 42,
    status: "completed",
    conclusion: "success",
    head_sha: "a".repeat(40),
    html_url: "https://github.com/bbyw2hrnf6-boop/VirtualArtPlattform/actions/runs/123456",
    created_at: "2026-09-11T10:00:00.000Z",
    updated_at: "2026-09-11T10:05:00.000Z",
    ...overrides,
  };
}

describe("admin GitHub projection", () => {
  it("accepts only bounded public run metadata", () => {
    expect(parseGithubWorkflowRuns({ workflow_runs: [githubRun()] }, "Verify"))
      .toEqual([{
        workflow: "Verify",
        runNumber: 42,
        status: "completed",
        conclusion: "success",
        headSha: "a".repeat(40),
        url: "https://github.com/bbyw2hrnf6-boop/VirtualArtPlattform/actions/runs/123456",
        createdAt: "2026-09-11T10:00:00.000Z",
        updatedAt: "2026-09-11T10:05:00.000Z",
      }]);
  });

  it("rejects spoofed links, malformed SHAs, and oversized API responses", () => {
    expect(() => parseGithubWorkflowRuns({
      workflow_runs: [githubRun({ html_url: "https://attacker.example/actions/runs/123456" })],
    }, "Deploy")).toThrow("invalid-response");
    expect(() => parseGithubWorkflowRuns({
      workflow_runs: [githubRun({ head_sha: "not-a-sha" })],
    }, "Deploy")).toThrow("invalid-response");
    expect(() => parseGithubWorkflowRuns({
      workflow_runs: new Array(7).fill(null).map((_, index) => githubRun({ id: index + 1 })),
    }, "Verify")).toThrow("invalid-response");
  });
});

describe("admin telemetry projection", () => {
  it("projects only bounded operational fields and nested allow-listed dimensions", () => {
    const summary = summarizeLoggingEntries({
      entries: [{
        timestamp: "2026-09-11T11:59:00.000Z",
        severity: "info",
        jsonPayload: {
          schema: "lieuva_client_telemetry_v1",
          name: "three_milestone",
          environment: "production",
          properties: {
            metric: "scene_setup",
            duration_ms: 1_234,
            template: "nocturne",
            runtime: "studio",
            stage: "interactive",
            viewport: "desktop",
            email: "must-not-escape@example.test",
          },
        },
      }, {
        timestamp: "2026-09-11T11:58:00.000Z",
        severity: "WARNING",
        jsonPayload: {
          schema: "lieuva_observability_v1",
          operation: "publication_permit",
          outcome: "failure",
          durationMs: 222,
          properties: {
            template: "unknown-template",
            runtime: "unknown-runtime",
            stage: "arbitrary-content",
            viewport: "tablet",
          },
        },
      }, {
        timestamp: "2026-09-11T11:57:30.000Z",
        severity: "ERROR",
        jsonPayload: {
          schema: "lieuva_client_telemetry_v1",
          name: "application_error",
          environment: "staging",
          properties: { stage: "failed" },
        },
      }, {
        timestamp: "2026-09-11T11:57:00.000Z",
        jsonPayload: { schema: "other", name: "private_log", secret: "must-not-escape" },
      }],
    });
    expect(summary).toMatchObject({
      clientReported: true,
      windowMinutes: 60,
      sampleLimit: 50,
      sampledEntries: 2,
      byKind: { three_milestone: 1, publication_permit: 1 },
      byOutcome: { failure: 1 },
    });
    expect(summary.recent[0]).toEqual({
      timestamp: "2026-09-11T11:59:00.000Z",
      kind: "three_milestone",
      outcome: null,
      severity: "INFO",
      durationMs: 1_234,
      template: "nocturne",
      runtime: "studio",
      stage: "interactive",
      viewport: "desktop",
    });
    expect(summary.recent[1]).toMatchObject({
      kind: "publication_permit",
      template: null,
      runtime: null,
      stage: null,
      viewport: null,
    });
    expect(JSON.stringify(summary)).not.toContain("must-not-escape");
  });

  it("treats an empty Logging response as real empty data and rejects an oversized page", () => {
    expect(summarizeLoggingEntries({}).sampledEntries).toBe(0);
    expect(() => summarizeLoggingEntries({ entries: new Array(51).fill({}) }))
      .toThrow("invalid-response");
  });
});

function storedCheckDocument(overrides: Record<string, unknown> = {}) {
  const checks = FIXED_LIVE_CHECKS.map((definition) => ({
    target: definition.target,
    url: definition.url,
    expectedStatus: definition.expectedStatus,
    actualStatus: definition.expectedStatus,
    status: "passed",
    durationMs: 25,
  }));
  return {
    id: "check-run-1",
    data: () => ({
      schemaVersion: 1,
      actorRef: "a".repeat(12),
      startedAt: new Date("2026-09-11T12:00:00.000Z"),
      completedAt: new Date("2026-09-11T12:00:01.000Z"),
      overall: "passed",
      checks,
      ...overrides,
    }),
  } as Parameters<typeof parseStoredCheckRun>[0];
}

describe("stored admin check history", () => {
  it("accepts only all four fixed targets exactly once with a consistent overall result", () => {
    expect(parseStoredCheckRun(storedCheckDocument())).toMatchObject({
      id: "check-run-1",
      overall: "passed",
      checks: expect.arrayContaining(FIXED_LIVE_CHECKS.map(({ target }) =>
        expect.objectContaining({ target }))),
    });

    const duplicateChecks = FIXED_LIVE_CHECKS.map((definition) => ({
      target: definition.target,
      url: definition.url,
      expectedStatus: definition.expectedStatus,
      actualStatus: definition.expectedStatus,
      status: "passed",
      durationMs: 25,
    }));
    duplicateChecks[1] = { ...duplicateChecks[0] };
    expect(parseStoredCheckRun(storedCheckDocument({ checks: duplicateChecks }))).toBeNull();
    expect(parseStoredCheckRun(storedCheckDocument({
      overall: "failed",
    }))).toBeNull();
  });

  it("prunes at most 20 runs beyond the newest 100 and validates adapter output", async () => {
    const calls: Array<[number, number]> = [];
    const deleted: string[][] = [];
    await expect(pruneLieuvaAdminCheckHistory({
      loadOverflowIds: async (retained, limit) => {
        calls.push([retained, limit]);
        return ["old-run-1", "old-run-2"];
      },
      deleteIds: async (ids) => { deleted.push([...ids]); },
    })).resolves.toBe(2);
    expect(calls).toEqual([[CHECK_HISTORY_RETENTION_LIMIT, CHECK_HISTORY_PRUNE_BATCH_LIMIT]]);
    expect(deleted).toEqual([["old-run-1", "old-run-2"]]);

    await expect(pruneLieuvaAdminCheckHistory({
      loadOverflowIds: async () => Array.from(
        { length: CHECK_HISTORY_PRUNE_BATCH_LIMIT + 1 },
        (_, index) => `overflow-${index}`,
      ),
      deleteIds: async () => undefined,
    })).rejects.toThrow("invalid-response");
  });
});

describe("fixed live checks", () => {
  it("calls only the four fixed LIEUVA URLs and honors the intentional missing-Space 404", async () => {
    const calls: string[] = [];
    const fetcher = async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("sitemap.xml"))
        return new Response(null, { status: 200, headers: { "content-type": "application/xml" } });
      if (url.endsWith("does-not-exist"))
        return new Response(null, { status: 404, headers: { "content-type": "text/html" } });
      return new Response(null, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    };
    let now = Date.parse("2026-09-11T12:00:00.000Z");
    const run = await runFixedLieuvaAdminChecks(fetcher, () => now++);
    expect(calls).toEqual(FIXED_LIVE_CHECKS.map(({ url }) => url));
    expect(run.overall).toBe("passed");
    expect(run.checks).toHaveLength(4);
    expect(run.checks.find(({ target }) => target === "missing-space")).toMatchObject({
      expectedStatus: 404,
      actualStatus: 404,
      status: "passed",
    });
  });

  it("surfaces HTTP mismatches and network failure without inventing a result", async () => {
    const fetcher = async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/creators")) throw new Error("offline");
      if (url.endsWith("sitemap.xml"))
        return new Response(null, { status: 200, headers: { "content-type": "text/html" } });
      if (url.endsWith("does-not-exist"))
        return new Response(null, { status: 404, headers: { "content-type": "text/html" } });
      return new Response(null, { status: 200, headers: { "content-type": "text/html" } });
    };
    const run = await runFixedLieuvaAdminChecks(fetcher);
    expect(run.overall).toBe("failed");
    expect(run.checks.find(({ target }) => target === "creators")).toMatchObject({
      actualStatus: null,
      status: "unavailable",
    });
    expect(run.checks.find(({ target }) => target === "sitemap")).toMatchObject({
      actualStatus: 200,
      status: "failed",
    });
  });
});
