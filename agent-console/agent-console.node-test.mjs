import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildCodexArgs,
  buildResearchPrompt,
  cleanReport,
  dueAgents,
  localClock,
  mergeMasterProposals,
  recoverInterruptedState,
  validateConfig,
} from "./core.mjs";

const config = validateConfig(JSON.parse(readFileSync(new URL("./config.json", import.meta.url), "utf8")));

test("editable profiles still contain exactly one master", () => {
  assert.equal(config.agents[0].kind, "master");
  assert.equal(config.agents.filter((item) => item.kind === "master").length, 1);
  assert.throws(() => validateConfig({ ...config, agents: [...config.agents, config.agents[1]] }), /eindeutig/);
});

test("Codex worktree arguments avoid incompatible ignore-user-config flag", () => {
  const paths = { projectRoot: "/repo", outputFile: "/tmp/result", schemaFile: "/repo/report.schema.json" };
  const base = { model: "gpt-6-luna", effort: "low", webSearch: "disabled" };
  const code = buildCodexArgs({ ...base, type: "proposal", proposalSnapshot: { executionMode: "local-code" } }, paths);
  assert.equal(code.localCode, true);
  assert.ok(code.args.includes("--worktree"));
  assert.ok(!code.args.includes("--ignore-user-config"));
  assert.ok(!code.args.includes("--ephemeral"));
  assert.ok(code.args.includes("workspace-write"));
  const research = buildCodexArgs({ ...base, type: "agent" }, paths);
  assert.ok(research.args.includes("--ignore-user-config"));
  assert.ok(research.args.includes("--ephemeral"));
  assert.ok(!research.args.includes("--worktree"));
  assert.ok(research.args.includes("--output-schema"));
});

test("interrupted proposal runs become reviewable again after restart", () => {
  const state = {
    runs: [{ status: "running", message: "Codex startet" }],
    proposals: [{ status: "executing", updatedAt: "" }],
  };
  recoverInterruptedState(state, new Date("2026-09-25T12:00:00Z"));
  assert.equal(state.runs[0].status, "interrupted");
  assert.equal(state.proposals[0].status, "approved");
  assert.equal(state.proposals[0].updatedAt, "2026-09-25T12:00:00.000Z");
});

test("daily and weekly schedules use the configured local date", () => {
  const now = new Date("2026-09-25T10:00:00Z");
  assert.deepEqual(localClock(now, "Europe/Amsterdam"), { date: "2026-09-25", time: "12:00" });
  const reports = {
    quality: { finishedAt: "2026-09-25T06:00:00Z" },
    ux: { finishedAt: "2026-09-20T06:00:00Z" },
    product: { finishedAt: "2026-09-10T06:00:00Z" },
  };
  const due = dueAgents(config, reports, now).map((item) => item.id);
  assert.equal(due.includes("quality"), false);
  assert.equal(due.includes("ux"), false);
  assert.equal(due.includes("product"), true);
  assert.equal(due.includes("market"), true);
});

test("master prompt dates specialist reports instead of presenting old reports as new", () => {
  const reports = { market: { finishedAt: "2026-09-15T10:00:00Z", report: { headline: "Altes Signal" } } };
  const text = buildResearchPrompt(config.agents[0], config, reports, new Date("2026-09-25T08:00:00Z"));
  assert.match(text, /Altes Signal/);
  assert.match(text, /2026-09-15/);
  assert.match(text, /ältere Berichte nicht als heutige Neuigkeit/);
});

test("master proposals are deduplicated while user decisions remain intact", () => {
  const item = { title: "Mobile Walk prüfen", rationale: "Pilotrisiko", action: "Gerätetest vorbereiten", priority: "today", effort: "small", confidence: "medium", executionMode: "manual", evidence: "audit/CURRENT-STATE.md" };
  const first = mergeMasterProposals([], { proposals: [item] }, "run-1", new Date("2026-09-25T08:00:00Z"));
  first[0].status = "approved";
  first[0].action = "Nutzerangepasster Auftrag";
  const second = mergeMasterProposals(first, { proposals: [item] }, "run-2", new Date("2026-09-26T08:00:00Z"));
  assert.equal(second.length, 1);
  assert.equal(second[0].action, "Nutzerangepasster Auftrag");
});

test("reports retain evidence and bound content for the local dashboard", () => {
  const report = cleanReport({
    headline: "Pilot", summary: "Stand", findings: [{ title: "Fund", detail: "Beobachtung", evidence: "https://example.org", confidence: "high" }],
    proposals: [{ title: "Schritt", rationale: "Grund", action: "Aktion", priority: "today", effort: "small", confidence: "medium", executionMode: "research", evidence: "https://example.org" }],
    watchlist: ["Später"],
  });
  assert.equal(report.proposals[0].executionMode, "research");
  assert.equal(report.findings[0].evidence, "https://example.org");
  assert.throws(() => cleanReport({ summary: "ohne Format" }), /Format/);
});
