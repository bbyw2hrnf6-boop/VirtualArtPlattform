import { describe, expect, it } from "vitest";
import {
  ACCOUNT_EXPORT_MAX_PAGE_RECORDS,
  ACCOUNT_EXPORT_SECTIONS,
  accountExportFailureCode,
  accountExportPartIdForOwner,
  accountExportPublicStatus,
  accountExportResumePosition,
  assertAccountExportChunk,
  assertAccountExportJobState,
  classifyAccountExportStep,
  createAccountExportJob,
  parseAccountExportJobId,
  prepareAccountExportStep,
  redactAccountExportValue,
  reusableAccountExportJob,
  type AccountExportPage,
  type AccountExportJobState,
} from "./accountExportJobs.js";

const now = 1_800_000_000;

function job() {
  return createAccountExportJob({
    uid: "account-a",
    jobId: "job_0123456789abcdef012345",
    nowEpochSeconds: now,
  });
}

function firstPage(value: unknown = { id: "account-a", email: "owner@example.com" }): AccountExportPage {
  return {
    section: ACCOUNT_EXPORT_SECTIONS[0],
    records: [{ after: ["accounts/account-a"], value }],
    exhausted: false,
  };
}

describe("managed account export cursors", () => {
  it("accepts only high-entropy path-safe job identifiers", () => {
    expect(parseAccountExportJobId("job_0123456789abcdef012345"))
      .toBe("job_0123456789abcdef012345");
    expect(() => parseAccountExportJobId("../../other-user"))
      .toThrow("export-job-id-invalid");
    expect(() => parseAccountExportJobId("short"))
      .toThrow("export-job-id-invalid");
  });

  it("binds a private cursor to the server checkpoint section and revision", () => {
    const state = job();
    const step = prepareAccountExportStep({
      state,
      page: firstPage(),
      nowEpochSeconds: now,
    });
    expect(step.nextState.cursor).toEqual({
      schemaVersion: 1,
      section: "account",
      after: ["accounts/account-a"],
      revision: 1,
    });
    expect(accountExportResumePosition(step.nextState, now + 1)).toEqual(["accounts/account-a"]);
    expect(() => assertAccountExportJobState({
      ...step.nextState,
      cursor: { ...step.nextState.cursor!, section: "profile" },
    })).toThrow("export-job-state-invalid");
    expect(() => assertAccountExportJobState({
      ...step.nextState,
      cursor: { ...step.nextState.cursor!, revision: 2 },
    })).toThrow("export-job-state-invalid");
    expect(() => accountExportResumePosition(step.nextState, state.expiresAtEpochSeconds))
      .toThrow("export-expired");
  });

  it("rejects malformed cursor positions loaded from the private job document", () => {
    const step = prepareAccountExportStep({
      state: job(),
      page: firstPage(),
      nowEpochSeconds: now,
    });
    expect(() => assertAccountExportJobState({
      ...step.nextState,
      cursor: { ...step.nextState.cursor!, after: [] },
    })).toThrow("export-job-state-invalid");
    expect(() => assertAccountExportJobState({
      ...step.nextState,
      cursor: { ...step.nextState.cursor!, extra: "attacker-data" } as never,
    })).toThrow("export-job-state-invalid");
    expect(() => assertAccountExportJobState({ ...step.nextState, injected: true }))
      .toThrow("export-job-state-invalid");
    expect(() => assertAccountExportJobState(undefined)).toThrow("export-job-state-invalid");
  });
});

describe("managed account export pages", () => {
  it("redacts credential-like keys recursively while preserving user data and content hashes", () => {
    const cyclic: Record<string, unknown> = {
      email: "owner@example.com",
      refreshToken: "refresh-secret",
      api_key: "api-secret",
      metadata: {
        firebaseStorageDownloadTokens: "download-secret",
        contentHash: "sha256-public-integrity",
      },
      nested: [{ authorization: "Bearer secret", title: "My artwork" }],
    };
    cyclic.self = cyclic;
    const json = JSON.stringify(redactAccountExportValue(cyclic));
    expect(json).toContain("owner@example.com");
    expect(json).toContain("sha256-public-integrity");
    expect(json).toContain("My artwork");
    expect(json).not.toContain("refresh-secret");
    expect(json).not.toContain("api-secret");
    expect(json).not.toContain("download-secret");
    expect(json).not.toContain("Bearer secret");
    expect(json).toContain('"self":null');
  });

  it("turns a malformed enumerable record into null and still advances", () => {
    const malformed = {} as Record<string, unknown>;
    Object.defineProperty(malformed, "broken", {
      enumerable: true,
      get() {
        throw new Error("malformed legacy record");
      },
    });
    const step = prepareAccountExportStep({
      state: job(),
      page: firstPage(malformed),
      nowEpochSeconds: now,
    });
    expect(JSON.parse(step.chunk!.body).records).toEqual([null]);
    expect(step.nextState.cursor?.after).toEqual(["accounts/account-a"]);
  });

  it("caps query pages before doing chunk work", () => {
    const records = Array.from({ length: ACCOUNT_EXPORT_MAX_PAGE_RECORDS + 1 }, (_, index) => ({
      after: [`accounts/${index}`],
      value: { index },
    }));
    expect(() => prepareAccountExportStep({
      state: job(),
      page: { section: "account", records, exhausted: true },
      nowEpochSeconds: now,
    })).toThrow("export-page-invalid");
  });

  it("splits a fetched page at the byte cap and resumes after the last included record", () => {
    const state = job();
    const step = prepareAccountExportStep({
      state,
      page: {
        section: "account",
        records: [
          { after: ["accounts/a"], value: { id: "a", text: "x".repeat(2_300) } },
          { after: ["accounts/b"], value: { id: "b", text: "y".repeat(2_300) } },
        ],
        exhausted: true,
      },
      nowEpochSeconds: now,
      maximumChunkBytes: 4 * 1024,
    });
    expect(step.chunk?.byteLength).toBeLessThanOrEqual(4 * 1024);
    expect(step.chunk?.expiresAtEpochSeconds).toBe(state.expiresAtEpochSeconds);
    expect(JSON.parse(step.chunk!.body).records).toHaveLength(1);
    expect(step.chunk?.sectionComplete).toBe(false);
    expect(step.nextState.sectionIndex).toBe(0);
    expect(accountExportResumePosition(step.nextState, now + 1)).toEqual(["accounts/a"]);
    expect(step.chunk?.body).not.toContain("accounts/a");
  });

  it("marks and advances past one oversized source record instead of deadlocking", () => {
    const step = prepareAccountExportStep({
      state: job(),
      page: firstPage({ text: "x".repeat(8_000) }),
      nowEpochSeconds: now,
      maximumChunkBytes: 4 * 1024,
    });
    expect(JSON.parse(step.chunk!.body).records).toEqual([{
      reason: "record-exceeds-export-part-limit",
      recordUnavailable: true,
    }]);
    expect(step.nextState.cursor?.after).toEqual(["accounts/account-a"]);
  });

  it("advances an empty exhausted section without writing an empty chunk", () => {
    const step = prepareAccountExportStep({
      state: job(),
      page: { section: "account", records: [], exhausted: true },
      nowEpochSeconds: now,
    });
    expect(step.chunk).toBeUndefined();
    expect(step.nextState.sectionIndex).toBe(1);
    expect(step.nextState.nextSequence).toBe(0);
  });

  it("rejects duplicate or non-advancing server query positions", () => {
    expect(() => prepareAccountExportStep({
      state: job(),
      page: {
        section: "account",
        records: [
          { after: ["accounts/a"], value: { id: "a" } },
          { after: ["accounts/a"], value: { id: "a-copy" } },
        ],
        exhausted: true,
      },
      nowEpochSeconds: now,
    })).toThrow("export-page-invalid");
    const first = prepareAccountExportStep({ state: job(), page: firstPage(), nowEpochSeconds: now });
    expect(() => prepareAccountExportStep({
      state: first.nextState,
      page: {
        section: "account",
        records: [{ after: ["accounts/account-0"], value: { id: "earlier" } }],
        exhausted: true,
      },
      nowEpochSeconds: now + 1,
    })).toThrow("export-page-invalid");
  });
});

describe("managed account export retries and status", () => {
  it("reuses an exact lost start but not a later explicit export", () => {
    const state = job();
    const completeState: AccountExportJobState = {
      ...state,
      status: "complete",
      sectionIndex: ACCOUNT_EXPORT_SECTIONS.length,
      revision: ACCOUNT_EXPORT_SECTIONS.length,
    };
    const requestId = "request_0123456789abcdef0123";
    expect(reusableAccountExportJob(completeState, requestId, requestId, "account-a", now + 1))
      .toBe(completeState);
    expect(reusableAccountExportJob(completeState, requestId, "request_fedcba98765432100123", "account-a", now + 1))
      .toBeUndefined();
    expect(reusableAccountExportJob(state, requestId, "request_fedcba98765432100123", "account-a", now + 1))
      .toBe(state);
    expect(reusableAccountExportJob(state, requestId, requestId, "account-a", state.expiresAtEpochSeconds))
      .toBeUndefined();
    expect(reusableAccountExportJob(
      completeState,
      requestId,
      requestId,
      "account-a",
      completeState.expiresAtEpochSeconds,
    )).toBeUndefined();
  });

  it("generates an identical step after a transient failure and detects applied retries", () => {
    const state = job();
    const first = prepareAccountExportStep({
      state,
      page: firstPage(),
      nowEpochSeconds: now,
    });
    const retry = prepareAccountExportStep({
      state,
      page: firstPage(),
      nowEpochSeconds: now + 30,
    });
    expect(retry).toEqual(first);
    expect(classifyAccountExportStep(state, first)).toBe("pending");
    expect(classifyAccountExportStep(first.nextState, first)).toBe("applied");
    expect(classifyAccountExportStep({ ...state, revision: 1 } as AccountExportJobState, first))
      .toBe("conflict");
    expect(classifyAccountExportStep({
      ...first.nextState,
      cursor: { ...first.nextState.cursor!, after: ["accounts/tampered"] },
    }, first)).toBe("conflict");
    expect(assertAccountExportChunk(first.chunk, first.nextState)).toEqual(first.chunk);
    expect(() => assertAccountExportChunk({ ...first.chunk, body: `${first.chunk!.body} ` }, first.nextState))
      .toThrow("export-part-invalid");
    const hostileBody = first.chunk!.body.replace("owner@example.com", "owner@example.com\",\"token\":\"secret");
    expect(() => assertAccountExportChunk({
      ...first.chunk,
      body: hostileBody,
      byteLength: Buffer.byteLength(hostileBody),
    }, first.nextState)).toThrow("export-part-invalid");
  });

  it("finishes at the last section and returns no cursor in public status", () => {
    const base = job();
    const state: AccountExportJobState = {
      ...base,
      sectionIndex: ACCOUNT_EXPORT_SECTIONS.length - 1,
      revision: ACCOUNT_EXPORT_SECTIONS.length - 1,
    };
    const section = ACCOUNT_EXPORT_SECTIONS.at(-1)!;
    const step = prepareAccountExportStep({
      state,
      page: {
        section,
        records: [{ after: ["notifications/final"], value: { id: "final", token: "never-export" } }],
        exhausted: true,
      },
      nowEpochSeconds: now,
    });
    expect(step.nextState.status).toBe("complete");
    expect(step.nextState.sectionIndex).toBe(ACCOUNT_EXPORT_SECTIONS.length);
    const publicStatus = accountExportPublicStatus(step.nextState, "account-a", now + 1);
    expect(publicStatus).toMatchObject({ format: "aura-account-export-job", schemaVersion: 1 });
    expect(publicStatus.status).toBe("complete");
    expect(JSON.stringify(publicStatus)).not.toContain("cursor");
    expect(JSON.stringify(publicStatus)).not.toContain("account-a");
    expect(step.chunk?.body).not.toContain("never-export");
    expect(accountExportPartIdForOwner(step.nextState, "account-a", 0, now + 1)).toBe("00000000");
    expect(() => accountExportPartIdForOwner(step.nextState, "account-b", 0, now + 1))
      .toThrow("export-access-denied");
    expect(() => accountExportPartIdForOwner(step.nextState, "account-a", 1, now + 1))
      .toThrow("export-part-invalid");
    expect(() => accountExportPublicStatus(step.nextState, "account-b", now + 1))
      .toThrow("export-access-denied");
    expect(() => accountExportPublicStatus(step.nextState, "account-a", step.nextState.expiresAtEpochSeconds))
      .toThrow("export-expired");
    expect(() => accountExportPartIdForOwner(
      step.nextState,
      "account-a",
      0,
      step.nextState.expiresAtEpochSeconds,
    )).toThrow("export-expired");
  });

  it("never persists attacker-controlled failure text", () => {
    expect(accountExportFailureCode(new Error("export-record-too-large"))).toBe("export-record-too-large");
    expect(accountExportFailureCode(new Error("failed with token super-secret"))).toBe("internal");
    expect(accountExportFailureCode("password=super-secret")).toBe("internal");
  });
});
