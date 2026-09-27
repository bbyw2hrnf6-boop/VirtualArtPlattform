import test from "node:test";
import assert from "node:assert/strict";
import { availableTimelineDays, buildNetworkTimeline, eventsForDay } from "./network-timeline.mjs";

test("run milestones replay chronologically without leaking their final status into the start", () => {
  const events = buildNetworkTimeline({ runs: [
    { id: "late", type: "agent", agentId: "master", agentName: "Master", createdAt: "2026-09-26T09:00:00Z", startedAt: "2026-09-26T09:01:00Z", finishedAt: "2026-09-26T09:02:00Z", status: "completed", message: "A final report" },
    { id: "early", type: "agent", agentId: "quality", createdAt: "2026-09-26T08:00:00Z", startedAt: "2026-09-26T08:01:00Z", finishedAt: "2026-09-26T08:02:00Z", status: "failed", message: "A failure" },
  ] });
  assert.deepEqual(events.map((event) => event.id), ["run:early:queued", "run:early:started", "run:early:finished", "run:late:queued", "run:late:started", "run:late:finished"]);
  assert.deepEqual(events.slice(0, 3).map((event) => event.status), ["queued", "running", "failed"]);
  assert.deepEqual(events.slice(0, 3).map((event) => event.detail), ["", "", "A failure"]);
  assert.deepEqual([events[2].source, events[2].target], ["quality", "master"]);
  assert.deepEqual([events[5].source, events[5].target], ["master", "proposals"]);
});

test("same-time milestones use deterministic lifecycle ordering and stable IDs", () => {
  const at = "2026-09-26T09:00:00Z";
  const runs = ["z", "a"].map((id) => ({ id, type: "proposal", agentId: "executor", proposalId: id, createdAt: at, startedAt: at, finishedAt: at, status: "completed" }));
  const forward = buildNetworkTimeline({ runs });
  const reverse = buildNetworkTimeline({ runs: [...runs].reverse() });
  assert.deepEqual(forward, reverse);
  assert.deepEqual(forward.map((event) => event.id), ["run:a:queued", "run:z:queued", "run:a:started", "run:z:started", "run:a:finished", "run:z:finished"]);
  assert.deepEqual([forward[4].source, forward[4].target], ["execution", "master"]);
});

test("day selection follows configured timezone across midnight and DST", () => {
  const events = [
    { id: "b", at: "2026-03-29T22:01:00Z", phase: "finished" },
    { id: "a", at: "2026-03-29T21:59:00Z", phase: "finished" },
    { id: "c", at: "2026-03-28T23:30:00Z", phase: "finished" },
    { id: "bad", at: "invalid", phase: "finished" },
  ];
  assert.deepEqual(availableTimelineDays(events, "Europe/Amsterdam"), ["2026-03-29", "2026-03-30"]);
  assert.deepEqual(eventsForDay(events, "2026-03-29", "Europe/Amsterdam").map((event) => event.id), ["c", "a"]);
  assert.deepEqual(eventsForDay(events, "2026-03-30", "Europe/Amsterdam").map((event) => event.id), ["b"]);
  assert.deepEqual(availableTimelineDays(events, "America/Los_Angeles"), ["2026-03-28", "2026-03-29"]);
});

test("completed proposals never invent an earlier approval from the latest state", () => {
  const events = buildNetworkTimeline({ proposals: [{ id: "p", title: "Edited title", rationale: "Latest body", status: "done", createdAt: "2026-09-26T08:00:00Z", decisionAt: "2026-09-26T09:00:00Z", updatedAt: "2026-09-26T10:00:00Z", completedAt: "2026-09-26T10:00:00Z" }] });
  assert.deepEqual(events.map((event) => event.phase), ["proposed", "completed"]);
  assert.deepEqual(events.map((event) => event.status), ["proposed", "done"]);
  assert.ok(events.every((event) => event.snapshotOnly && event.historicalSnapshot));
});

test("only the latest saved decision is shown and plain edits remain snapshot updates", () => {
  const base = { createdAt: "2026-09-26T08:00:00Z", updatedAt: "2026-09-26T09:00:00Z", decisionAt: "2026-09-26T09:00:00Z" };
  const events = buildNetworkTimeline({ proposals: [
    { ...base, id: "decision", status: "rejected", decisionNote: "Current reason" },
    { ...base, id: "edit", status: "proposed" },
    { ...base, id: "recovery", status: "approved", decisionAt: "2026-09-26T08:30:00Z" },
  ] });
  const decisions = events.filter((event) => event.phase === "decision");
  assert.equal(decisions.length, 1);
  assert.deepEqual([decisions[0].proposalId, decisions[0].source, decisions[0].target, decisions[0].detail], ["decision", "user", "master", "Current reason"]);
  assert.deepEqual(events.filter((event) => event.phase === "updated").map((event) => event.proposalId), ["edit", "recovery"]);
});

test("manual work has a known start but no fabricated queue entry", () => {
  const proposal = { id: "p", executionMode: "manual", status: "executing", createdAt: "2026-09-26T08:00:00Z", startedAt: "2026-09-26T09:00:00Z", updatedAt: "2026-09-26T09:00:00Z" };
  const pending = buildNetworkTimeline({ proposals: [proposal] });
  assert.deepEqual(pending.map((event) => event.phase), ["proposed", "started"]);
  const completed = buildNetworkTimeline({ proposals: [{ ...proposal, status: "done", executionRunId: "manual", completedAt: "2026-09-26T10:00:00Z", updatedAt: "2026-09-26T10:00:00Z" }], runs: [{ id: "manual", type: "proposal", agentId: "manual", reason: "manual", proposalId: "p", createdAt: proposal.startedAt, startedAt: proposal.startedAt, finishedAt: "2026-09-26T10:00:00Z", status: "completed" }] });
  assert.equal(completed.filter((event) => event.phase === "started").length, 1);
  assert.equal(completed.some((event) => event.phase === "queued"), false);
});

test("retained reports fill missing completion records without duplicating known runs", () => {
  const reports = { quality: { runId: "r", finishedAt: "2026-09-26T09:00:00Z", report: { summary: "Saved result" } } };
  const recovered = buildNetworkTimeline({ reports });
  assert.deepEqual(recovered.map((event) => event.id), ["run:r:finished"]);
  assert.equal(recovered[0].reportOnly, true);
  assert.equal(recovered[0].detail, "Saved result");
  const present = buildNetworkTimeline({ reports, runs: [{ id: "r", type: "agent", agentId: "quality", finishedAt: reports.quality.finishedAt, status: "completed" }] });
  assert.equal(present.length, 1);
  assert.equal(present[0].reportOnly, undefined);
});

test("replay keeps all retained milestones and ignores invalid timestamps without mutating input", () => {
  const data = { runs: Array.from({ length: 75 }, (_, index) => ({ id: `r${index}`, type: "agent", agentId: "quality", status: "queued", createdAt: new Date(Date.UTC(2026, 8, 26, 0, index)).toISOString() })) };
  data.runs.push({ id: "invalid", type: "agent", agentId: "quality", createdAt: "bad", startedAt: "", finishedAt: null, status: "completed" });
  const before = structuredClone(data);
  const events = buildNetworkTimeline(data);
  assert.equal(events.length, 75);
  assert.deepEqual(data, before);
  assert.equal(eventsForDay(events, "2026-09-26", "Europe/Amsterdam").length, 75);
});
