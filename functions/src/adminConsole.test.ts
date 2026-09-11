import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CHECK_HISTORY_PRUNE_BATCH_LIMIT,
  CHECK_HISTORY_RETENTION_LIMIT,
  FIXED_LIVE_CHECKS,
  loadGithubData,
  loadReleaseData,
  parseGithubWorkflowRuns,
  parseStoredCheckRun,
  pruneLieuvaAdminCheckHistory,
  runFixedLieuvaAdminChecks,
  resetAdminConsoleCachesForTesting,
  sourceFailureForResponse,
  summarizeLoggingEntries,
} from "./adminConsole.js";
import { LEGACY_LIVE_CHECKS } from "./adminLiveChecks.js";

afterEach(() => { resetAdminConsoleCachesForTesting(); vi.useRealTimers(); });

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
        timestamp: "2026-09-11T11:57:45.000Z",
        severity: "INFO",
        jsonPayload: {
          schema: "lieuva_client_telemetry_v1",
          name: "three_milestone",
          environment: "production",
          properties: { metric: "untrusted_metric", stage: "interactive", duration_ms: 1 },
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
      origin: "client",
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
      origin: "server",
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
    evidence: "ok",
  }));
  return {
    id: "check-run-1",
    data: () => ({
      schemaVersion: 1,
      suiteVersion: 2,
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
  it("accepts only the full versioned target set exactly once with a consistent overall result", () => {
    expect(parseStoredCheckRun(storedCheckDocument())).toMatchObject({
      id: "check-run-1",
      overall: "passed",
      suiteVersion: 2,
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
      evidence: "ok",
    }));
    duplicateChecks[1] = { ...duplicateChecks[0] };
    expect(parseStoredCheckRun(storedCheckDocument({ checks: duplicateChecks }))).toBeNull();
    expect(parseStoredCheckRun(storedCheckDocument({
      overall: "failed",
    }))).toBeNull();
  });

  it("preserves four-check legacy history and rejects unknown suites or impossible evidence", () => {
    const data = storedCheckDocument().data();
    const legacy = data.checks.filter((check: { target: string }) => LEGACY_LIVE_CHECKS.some(({ target }) => target === check.target));
    const parsed = parseStoredCheckRun(storedCheckDocument({ suiteVersion: undefined, checks: legacy }));
    expect(parsed?.suiteVersion).toBe(1);
    expect(parsed?.checks).toHaveLength(4);
    expect(parsed?.checks.every(({ evidence }) => evidence === "legacy")).toBe(true);
    expect(parseStoredCheckRun(storedCheckDocument({ suiteVersion: 3 }))).toBeNull();
    expect(parseStoredCheckRun(storedCheckDocument({ suiteVersion: null, checks: legacy }))).toBeNull();
    for (const override of [
      { status: "unavailable", actualStatus: null, evidence: "privacy-headers" },
      { status: "failed", actualStatus: 200, evidence: "ok" },
      { status: "passed", actualStatus: 200, evidence: "body-contract" },
      { status: "passed", actualStatus: 302, evidence: "ok" },
    ]) {
      const checks = data.checks.map((check: object, index: number) => index === 0 ? { ...check, ...override } : check);
      expect(parseStoredCheckRun(storedCheckDocument({ checks, overall: override.status === "passed" ? "passed" : "failed" }))).toBeNull();
    }
    const denied = data.checks.map((check: { target: string }) => check.target === "admin-auth" ? { ...check, actualStatus: 403 } : check);
    expect(parseStoredCheckRun(storedCheckDocument({ checks: denied }))?.overall).toBe("passed");
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
  it("does not follow redirects outside the fixed target allowlist", async () => {
    const fetcher: typeof fetch = async (_url, init) => {
      expect(init?.redirect).toBe("manual");
      return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } });
    };
    const run = await runFixedLieuvaAdminChecks(fetcher);
    expect(run.overall).toBe("failed");
    expect(run.checks.every((check) => check.actualStatus === 302 && check.status === "failed")).toBe(true);
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

describe("GitHub source pressure", () => {
  it("distinguishes rate limiting from missing permission", () => {
    expect(sourceFailureForResponse(new Response(null, { status: 403, headers: { "x-ratelimit-remaining": "0" } })).message).toBe("rate-limit");
    expect(sourceFailureForResponse(new Response(null, { status: 403, headers: { "retry-after": "60" } })).message).toBe("rate-limit");
    expect(sourceFailureForResponse(new Response(null, { status: 429 })).message).toBe("rate-limit");
    expect(sourceFailureForResponse(new Response(null, { status: 403 })).message).toBe("permission");
  });

  it("coalesces concurrent reads and caches success for five minutes", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.redirect).toBe("manual");
      expect(init?.headers).not.toHaveProperty("Authorization");
      return Response.json({ workflow_runs: [githubRun()] });
    });
    const values = await Promise.all([loadGithubData(fetcher), loadGithubData(fetcher)]);
    expect(values[0].status).toBe("ok");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect((await loadGithubData(fetcher)).cached).toBe(true);
    vi.advanceTimersByTime(300_001);
    await loadGithubData(fetcher);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("caches unavailable responses without labeling them successful", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 403, headers: { "x-ratelimit-remaining": "0" } }));
    expect(await loadGithubData(fetcher)).toMatchObject({ status: "unavailable", reason: "rate-limit", cached: false });
    expect(await loadGithubData(fetcher)).toMatchObject({ status: "unavailable", reason: "rate-limit", cached: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("deployed release source", () => {
  it("reads only the fixed public release stamp without following redirects", async () => {
    const stamp = { schemaVersion: 1, commitSha: "a".repeat(40), builtAt: "2026-09-11T12:00:00.000Z" };
    expect(await loadReleaseData(async (url, init) => {
      expect(url).toBe("https://lieuva.com/release.json");
      expect(init?.redirect).toBe("manual");
      return Response.json(stamp, { headers: { "cache-control": "no-cache,max-age=0,must-revalidate" } });
    })).toEqual(stamp);
    for (const response of [Response.json({ ...stamp, commitSha: null }), Response.json({ ...stamp, secret: "private" }), new Response("{", { headers: { "content-type": "application/json" } }), new Response("fallback", { headers: { "content-type": "text/html" } })]) {
      response.headers.set("cache-control", "no-cache,max-age=0,must-revalidate");
      await expect(loadReleaseData(async () => response)).rejects.toThrow("invalid-response");
    }
    await expect(loadReleaseData(async () => Response.json(stamp))).rejects.toThrow("invalid-response");
  });
});
