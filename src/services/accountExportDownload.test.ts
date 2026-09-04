import { describe, expect, it, vi } from "vitest";
import {
  createBoundedAccountExportBuffer,
  isManagedAccountExportRetryableError,
  localDraftExportLine,
  MAX_MANAGED_ACCOUNT_EXPORT_CONTINUATION_CALLS,
  MANAGED_ACCOUNT_EXPORT_SECTIONS,
  parseManagedAccountExportPart,
  parseManagedAccountExportStatus,
  verifyManagedAccountExportPart,
  writeManagedAccountExport,
  type AccountExportTextWriter,
  type ManagedAccountExportCall,
} from "./accountExportDownload";

it("allows every server part plus empty-section transition", () => {
  expect(MAX_MANAGED_ACCOUNT_EXPORT_CONTINUATION_CALLS)
    .toBe(4_096 + MANAGED_ACCOUNT_EXPORT_SECTIONS.length);
});

const status = {
  format: "aura-account-export-job" as const,
  schemaVersion: 1 as const,
  jobId: "job_0123456789abcdef012345",
  status: "complete" as const,
  exportedAt: "2026-09-03T00:00:00.000Z",
  expiresAt: "2026-09-04T00:00:00.000Z",
  completedParts: 1,
  completedRecords: 2,
  completedBytes: 256,
};

function part() {
  const sequence = 0;
  const body = JSON.stringify({
    format: "aura-account-export-part",
    schemaVersion: 1,
    jobId: status.jobId,
    sequence,
    section: "account",
    sectionComplete: true,
    exportedAt: status.exportedAt,
    records: [{ email: "owner@example.com" }],
  });
  return {
    format: "aura-account-export-part-response" as const,
    schemaVersion: 1 as const,
    jobId: status.jobId,
    sequence,
    body,
    sha256: "7dbb99d4d661606a843f2ce2f12bd493253548fceea4499a7fc953a12cf63dad",
  };
}

async function partAt(sequence: number, email: string) {
  const body = JSON.stringify({
    format: "aura-account-export-part",
    schemaVersion: 1,
    jobId: status.jobId,
    sequence,
    section: "account",
    sectionComplete: sequence === 2,
    exportedAt: status.exportedAt,
    records: [{ email }],
  });
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  return {
    format: "aura-account-export-part-response" as const,
    schemaVersion: 1 as const,
    jobId: status.jobId,
    sequence,
    body,
    sha256: [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join(""),
  };
}

function recordingWriter(write?: (value: string) => Promise<void>) {
  const values: string[] = [];
  const close = vi.fn(async () => undefined);
  const abort = vi.fn(async () => undefined);
  const writer: AccountExportTextWriter = {
    async write(value) {
      values.push(value);
      await write?.(value);
    },
    close,
    abort,
  };
  return { abort, close, values, writer };
}

describe("managed account export download", () => {
  it("recognizes bounded ambiguous transport and lease retry codes", () => {
    expect(isManagedAccountExportRetryableError({ code: "functions/aborted" })).toBe(true);
    expect(isManagedAccountExportRetryableError({ code: "unavailable" })).toBe(true);
    expect(isManagedAccountExportRetryableError({ code: "functions/internal" })).toBe(true);
    expect(isManagedAccountExportRetryableError({ code: "functions/deadline-exceeded" })).toBe(true);
    expect(isManagedAccountExportRetryableError({ code: "functions/permission-denied" })).toBe(false);
    expect(isManagedAccountExportRetryableError(new Error("unavailable"))).toBe(false);
  });

  it("validates bounded cursor-free status", () => {
    expect(parseManagedAccountExportStatus(status)).toEqual(status);
    expect(parseManagedAccountExportStatus({ ...status, completedParts: 4_096 }).completedParts)
      .toBe(4_096);
    expect(() => parseManagedAccountExportStatus({ ...status, cursor: ["private"] }))
      .toThrow("status is invalid");
    expect(() => parseManagedAccountExportStatus({ ...status, completedParts: 4_097 }))
      .toThrow("status is invalid");
    expect(() => parseManagedAccountExportStatus({ ...status, jobId: "../../other" }))
      .toThrow("status is invalid");
  });

  it("validates and cryptographically verifies each requested part", async () => {
    const value = part();
    expect(parseManagedAccountExportPart(value, {
      jobId: status.jobId,
      sequence: 0,
      exportedAt: status.exportedAt,
    })).toEqual(value);
    await expect(verifyManagedAccountExportPart(value, {
      jobId: status.jobId,
      sequence: 0,
      exportedAt: status.exportedAt,
    })).resolves.toEqual(value);
    await expect(verifyManagedAccountExportPart({ ...value, sha256: "a".repeat(64) }, {
      jobId: status.jobId,
      sequence: 0,
      exportedAt: status.exportedAt,
    })).rejects.toThrow("integrity verification");
    expect(() => parseManagedAccountExportPart({ ...value, sequence: 1 }, {
      jobId: status.jobId,
      sequence: 0,
    })).toThrow("part is invalid");
  });

  it("retries a lost start and reconciles a lost continue through retryable status reads", async () => {
    const calls: Record<string, number> = {};
    const startRequestIds: string[] = [];
    const call: ManagedAccountExportCall = async (request) => {
      calls[request.action] = (calls[request.action] ?? 0) + 1;
      if (request.action === "start") {
        startRequestIds.push(request.requestId);
        if (calls.start === 1) throw { code: "functions/unavailable" };
        return { ...status, status: "running", completedParts: 0, completedRecords: 0, completedBytes: 0 };
      }
      if (request.action === "continue") throw { code: "functions/unavailable" };
      if (request.action === "status") {
        if (calls.status === 1) throw { code: "unavailable" };
        return status;
      }
      if (request.action === "part") return part();
      throw new Error("unexpected request");
    };
    const output = recordingWriter();
    await expect(writeManagedAccountExport({
      call,
      writer: output.writer,
      localDrafts: [],
      wait: async () => undefined,
    })).resolves.toEqual(status);
    expect(calls).toEqual({ start: 2, continue: 1, status: 2, part: 1 });
    expect(startRequestIds[0]).toMatch(/^[a-f0-9]{32}$/);
    expect(new Set(startRequestIds).size).toBe(1);
    expect(output.values[0]).toBe(`${part().body}\n`);
    expect(output.values[1]).toContain('"section":"localBrowserData"');
    expect(output.close).toHaveBeenCalledOnce();
    expect(output.abort).not.toHaveBeenCalled();
  });

  it("retries the same part after a lost reply without duplicating output", async () => {
    let partCalls = 0;
    const call: ManagedAccountExportCall = async (request) => {
      if (request.action === "start") return status;
      if (request.action === "part") {
        partCalls += 1;
        if (partCalls === 1) throw { code: "functions/unavailable" };
        return part();
      }
      throw new Error("unexpected request");
    };
    const output = recordingWriter();
    await writeManagedAccountExport({
      call,
      writer: output.writer,
      localDrafts: [],
      wait: async () => undefined,
    });
    expect(partCalls).toBe(2);
    expect(output.values.filter((value) => value === `${part().body}\n`)).toHaveLength(1);
  });

  it("writes checksum-verified parts while the server job is still advancing", async () => {
    const first = await partAt(0, "first@example.com");
    const second = await partAt(1, "second@example.com");
    let continuation = 0;
    const calls: string[] = [];
    const call: ManagedAccountExportCall = async (request) => {
      calls.push(`${request.action}${"sequence" in request ? `:${request.sequence}` : ""}`);
      if (request.action === "start") return {
        ...status,
        status: "running",
        completedParts: 0,
        completedRecords: 0,
        completedBytes: 0,
      };
      if (request.action === "continue") {
        continuation += 1;
        return {
          ...status,
          status: continuation === 1 ? "running" : "complete",
          completedParts: continuation,
          completedRecords: continuation,
          completedBytes: continuation === 1 ? first.body.length : first.body.length + second.body.length,
        };
      }
      if (request.action === "part") return request.sequence === 0 ? first : second;
      throw new Error("unexpected request");
    };
    const output = recordingWriter();
    await writeManagedAccountExport({ call, writer: output.writer, localDrafts: [], wait: async () => undefined });
    expect(calls).toEqual(["start", "continue", "part:0", "continue", "part:1"]);
    expect(output.values.slice(0, 2)).toEqual([`${first.body}\n`, `${second.body}\n`]);
  });

  it("restarts at part zero when a fresh writer reconnects to an existing running job", async () => {
    const first = await partAt(0, "first@example.com");
    const second = await partAt(1, "second@example.com");
    const calls: string[] = [];
    const call: ManagedAccountExportCall = async (request) => {
      calls.push(`${request.action}${"sequence" in request ? `:${request.sequence}` : ""}`);
      if (request.action === "start") return {
        ...status,
        status: "running",
        completedParts: 2,
        completedRecords: 2,
        completedBytes: first.body.length + second.body.length,
      };
      if (request.action === "part") return request.sequence === 0 ? first : second;
      if (request.action === "continue") return { ...status, completedParts: 2 };
      throw new Error("unexpected request");
    };
    const output = recordingWriter();
    await writeManagedAccountExport({
      call,
      writer: output.writer,
      localDrafts: [],
      wait: async () => undefined,
    });
    expect(calls).toEqual(["start", "part:0", "part:1", "continue"]);
    expect(output.values.slice(0, 2)).toEqual([`${first.body}\n`, `${second.body}\n`]);
    expect(output.close).toHaveBeenCalledOnce();
  });

  it("backs off and stops a stuck active lease instead of polling without bound", async () => {
    const waits: number[] = [];
    const running = { ...status, status: "running" as const, completedParts: 0, completedRecords: 0, completedBytes: 0 };
    const call: ManagedAccountExportCall = async (request) => {
      if (request.action === "start" || request.action === "status") return running;
      if (request.action === "continue") throw { code: "functions/deadline-exceeded" };
      throw new Error("unexpected request");
    };
    const output = recordingWriter();
    await expect(writeManagedAccountExport({
      call,
      writer: output.writer,
      localDrafts: [],
      wait: async (milliseconds) => { waits.push(milliseconds); },
      maximumStalledStatusReads: 2,
    })).rejects.toThrow("still busy");
    expect(waits.some((milliseconds) => milliseconds >= 500)).toBe(true);
    expect(output.abort).toHaveBeenCalledOnce();
  });

  it("writes no bytes when a part body is tampered behind a valid-looking digest", async () => {
    const original = part();
    const tampered = {
      ...original,
      body: original.body.replace("owner@example.com", "attacker@example.com"),
    };
    const call: ManagedAccountExportCall = async (request) =>
      request.action === "start" ? status : tampered;
    const output = recordingWriter();
    await expect(writeManagedAccountExport({
      call,
      writer: output.writer,
      localDrafts: [],
      wait: async () => undefined,
    })).rejects.toThrow("integrity verification");
    expect(output.values).toEqual([]);
    expect(output.abort).toHaveBeenCalledOnce();
    expect(output.close).not.toHaveBeenCalled();
  });

  it("stops before later parts and local data when a progressive part is tampered", async () => {
    const first = await partAt(0, "first@example.com");
    const validSecond = await partAt(1, "second@example.com");
    const tamperedSecond = {
      ...validSecond,
      body: validSecond.body.replace("second@example.com", "attacker@example.com"),
    };
    const third = await partAt(2, "third@example.com");
    const requested: number[] = [];
    const call: ManagedAccountExportCall = async (request) => {
      if (request.action === "start") return { ...status, completedParts: 3 };
      if (request.action !== "part") throw new Error("unexpected request");
      requested.push(request.sequence);
      return [first, tamperedSecond, third][request.sequence];
    };
    const output = recordingWriter();
    await expect(writeManagedAccountExport({
      call,
      writer: output.writer,
      localDrafts: [{ id: "must-not-be-written" }],
      wait: async () => undefined,
    })).rejects.toThrow("integrity verification");
    expect(requested).toEqual([0, 1]);
    expect(output.values).toEqual([`${first.body}\n`]);
    expect(output.values.join("\n")).not.toContain("must-not-be-written");
    expect(output.abort).toHaveBeenCalledOnce();
    expect(output.close).not.toHaveBeenCalled();
  });

  it("aborts a progressive file when a writer fails", async () => {
    const call: ManagedAccountExportCall = async (request) =>
      request.action === "start" ? status : part();
    const output = recordingWriter(async () => {
      throw new Error("disk full");
    });
    await expect(writeManagedAccountExport({
      call,
      writer: output.writer,
      localDrafts: [],
      wait: async () => undefined,
    })).rejects.toThrow("disk full");
    expect(output.abort).toHaveBeenCalledOnce();
    expect(output.close).not.toHaveBeenCalled();
  });

  it("fails before part downloads when a non-streaming browser exceeds its explicit cap", async () => {
    const buffer = createBoundedAccountExportBuffer(1024 * 1024);
    let partCalls = 0;
    const call: ManagedAccountExportCall = async (request) => {
      if (request.action === "start") return { ...status, completedBytes: 2 * 1024 * 1024 };
      if (request.action === "part") partCalls += 1;
      return part();
    };
    await expect(writeManagedAccountExport({
      call,
      writer: buffer.writer,
      localDrafts: [],
      wait: async () => undefined,
    })).rejects.toThrow("below 1 MiB");
    expect(partCalls).toBe(0);
    expect(() => buffer.blob()).toThrow("did not finish");
  });

  it("adds device-scoped drafts as a separate JSONL record", () => {
    const value = JSON.parse(localDraftExportLine(status, [{ id: "draft-a" }]));
    expect(value).toMatchObject({
      format: "aura-account-export-client-part",
      jobId: status.jobId,
      section: "localBrowserData",
      records: [{ deviceScoped: true, accountLinkedDrafts: [{ id: "draft-a" }] }],
    });
  });
});
