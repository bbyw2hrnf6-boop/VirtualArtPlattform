import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildCodexArgs,
  buildResearchPrompt,
  cleanReport,
  dueAgents,
  initializeMasterSync,
  localClock,
  masterInputs,
  mergeMasterProposals,
  pendingMasterInputs,
  recoverInterruptedState,
  runProgress,
  shouldQueueMaster,
  validateConfig,
  worktreeRootFromChange,
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

test("master prompt includes every specialist despite a long first report", () => {
  const reports = {
    quality: { runId: "quality-run", finishedAt: "2026-09-25T10:00:00Z", report: { headline: "Lang", summary: "x".repeat(30_000) } },
    "three-d": { runId: "three-d-run", finishedAt: "2026-09-25T11:00:00Z", report: { headline: "Blender-Signal", summary: "Neues GLB-Thema" } },
  };
  const prompt = buildResearchPrompt(config.agents[0], config, reports);
  assert.match(prompt, /Blender-Signal/);
  assert.match(prompt, /three-d-run/);
  assert.ok(!prompt.includes("x".repeat(5000)));
});

test("master proposals are deduplicated while user decisions remain intact", () => {
  const item = { title: "Mobile Walk prüfen", rationale: "Pilotrisiko", action: "Gerätetest vorbereiten", priority: "today", effort: "small", confidence: "medium", executionMode: "manual", evidence: "audit/CURRENT-STATE.md" };
  const first = mergeMasterProposals([], { proposals: [item] }, "run-1", new Date("2026-09-25T08:00:00Z"));
  first[0].status = "approved";
  first[0].action = "Nutzerangepasster Auftrag";
  const second = mergeMasterProposals(first, { proposals: [item] }, "run-2", new Date("2026-09-26T08:00:00Z"));
  assert.equal(second.length, 1);
  assert.equal(second[0].action, "Nutzerangepasster Auftrag");
  first[0].status = "rejected";
  assert.equal(mergeMasterProposals(first, { proposals: [item] }, "run-3").length, 1);
});

test("master automatically catches up after a new specialist or proposal outcome", () => {
  const state = { runs: [], reports: {}, proposals: [] };
  initializeMasterSync(state, config);
  assert.equal(shouldQueueMaster(state, config, null, []), false);
  state.runs.unshift({ id: "quality-run", type: "agent", agentId: "quality", status: "completed", finishedAt: "2026-09-25T11:00:00Z" });
  state.reports.quality = { runId: "quality-run", finishedAt: "2026-09-25T11:00:00Z", report: { headline: "Neu" } };
  assert.equal(shouldQueueMaster(state, config, null, []), true);
  assert.equal(shouldQueueMaster(state, config, null, [{ type: "proposal" }]), false);
  const inputs = masterInputs(state, config);
  assert.equal(pendingMasterInputs(inputs, state.masterSync.lastInputs).reports.length, 1);
  state.masterSync.lastInputs = inputs;
  state.masterSync.lastCompletedSignature = JSON.stringify({ reports: ["quality-run"], agentRuns: [["quality-run", "completed"]], outcomes: [] });
  assert.equal(shouldQueueMaster(state, config, null, []), false);
  state.runs.unshift({ id: "code-run", type: "proposal", proposalId: "proposal-1", status: "completed", finishedAt: "2026-09-25T12:00:00Z" });
  assert.equal(shouldQueueMaster(state, config, null, []), true);
  assert.equal(pendingMasterInputs(masterInputs(state, config), state.masterSync.lastInputs).outcomes.length, 1);
  state.masterSync.lastAttemptSignature = JSON.stringify({ reports: ["quality-run"], agentRuns: [["quality-run", "completed"]], outcomes: [["code-run", "completed"]] });
  assert.equal(shouldQueueMaster(state, config, null, []), false);
});

test("legacy master reports keep earlier sources and expose later outcomes", () => {
  const state = {
    runs: [{ id: "code-run", type: "proposal", status: "completed", finishedAt: "2026-09-25T12:00:00Z" },
      { id: "quality-run", type: "agent", agentId: "quality", status: "completed", finishedAt: "2026-09-25T10:00:00Z" }],
    reports: {
      master: { runId: "master-run", finishedAt: "2026-09-25T11:00:00Z" },
      quality: { runId: "quality-run", finishedAt: "2026-09-25T10:00:00Z" },
    },
    proposals: [],
  };
  initializeMasterSync(state, config);
  const pending = pendingMasterInputs(masterInputs(state, config), state.masterSync.lastInputs);
  assert.equal(pending.reports.length, 0);
  assert.equal(pending.outcomes.length, 1);
  assert.equal(shouldQueueMaster(state, config, null, []), true);
});

test("running status separates active process from long output silence", () => {
  const run = { status: "running", startedAt: "2026-09-25T12:00:00Z", lastActivityAt: "2026-09-25T12:07:00Z" };
  assert.equal(runProgress(run, new Date("2026-09-25T12:08:00Z"), 5, true).signal, "active");
  const quiet = runProgress(run, new Date("2026-09-25T12:13:00Z"), 5, true);
  assert.equal(quiet.signal, "quiet");
  assert.equal(quiet.elapsedMs, 13 * 60_000);
  assert.equal(runProgress(run, new Date("2026-09-25T12:13:00Z"), 5, false).signal, "unknown");
  run.lastActivityAt = "2026-09-25T12:12:30Z";
  run.lastProgressAt = "2026-09-25T12:07:00Z";
  assert.equal(runProgress(run, new Date("2026-09-25T12:13:00Z"), 5, true).signal, "quiet");
});

test("worktree changes reveal the isolated checkout path", () => {
  assert.equal(worktreeRootFromChange("/Users/alex/.codex/worktrees/297a/VirtualartPlattform/src/App.tsx"), "/Users/alex/.codex/worktrees/297a/VirtualartPlattform");
  assert.equal(worktreeRootFromChange("/Users/alex/Documents/VirtualartPlattform/src/App.tsx"), null);
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
