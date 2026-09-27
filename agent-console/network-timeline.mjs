const phaseOrder = { queued: 0, started: 1, finished: 2, proposed: 3, decision: 4, completed: 5, updated: 6 };
const terminalStatuses = new Set(["completed", "failed", "cancelled", "interrupted"]);

function timestamp(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function compareEvents(a, b) {
  const timeDifference = Date.parse(a.at) - Date.parse(b.at);
  if (timeDifference) return timeDifference;
  const phaseDifference = (phaseOrder[a.phase] ?? 99) - (phaseOrder[b.phase] ?? 99);
  if (phaseDifference) return phaseDifference;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Reconstruct only milestones supported by retained timestamps. The returned
 * list is chronological and deliberately has no display limit. Equal timestamps
 * use lifecycle phase and stable ID as deterministic tie breakers; they do not
 * establish a finer-grained historical order.
 *
 * Proposal text and decision state are not versioned. Their snapshotOnly and
 * historicalSnapshot flags mean the body is the latest retained snapshot, not
 * the exact content at an earlier milestone. Neither flag means full history.
 * Edges describe where an available result belongs, not a recorded live message
 * or proof that the receiving agent consumed it at the same instant.
 */
export function buildNetworkTimeline(data = {}) {
  const events = [];
  const runs = Array.isArray(data.runs) ? data.runs : [];
  const proposals = Array.isArray(data.proposals) ? data.proposals : [];
  const agents = Array.isArray(data.config?.agents) ? data.config.agents : [];
  const runById = new Map(runs.filter(Boolean).map((run) => [run.id, run]));
  const agentById = new Map(agents.filter(Boolean).map((agent) => [agent.id, agent]));
  const add = (base, phase, at, fields = {}) => {
    const validAt = timestamp(at);
    if (!validAt) return;
    events.push({ ...base, ...fields, id: `${base.id}:${phase}`, phase, at: validAt });
  };

  for (const run of runs) {
    if (!run?.id || !["agent", "proposal"].includes(run.type)) continue;
    const isExecution = run.type === "proposal";
    const isMaster = !isExecution && (run.agentId === "master" || agentById.get(run.agentId)?.kind === "master");
    const node = isExecution ? "execution" : isMaster ? "master" : run.agentId;
    if (!node) continue;
    const base = {
      id: `run:${run.id}`, type: "run", stage: isExecution ? "execution" : isMaster ? "master" : "specialist",
      source: node, target: node, agentId: run.agentId ?? null, runId: run.id, proposalId: run.proposalId ?? null,
      title: run.agentName || agentById.get(run.agentId)?.name || run.agentId || "",
      detail: "", status: "queued", snapshotOnly: false, historicalSnapshot: false,
    };
    // Manual records are created on completion; their createdAt is a copied
    // start time and is not evidence that a manual task entered the queue.
    if (run.reason !== "manual" && run.agentId !== "manual") add(base, "queued", run.createdAt);
    add(base, "started", run.startedAt, { status: "running" });
    if (terminalStatuses.has(run.status)) {
      add(base, "finished", run.finishedAt, {
        status: run.status, detail: run.message || run.report?.summary || "",
        target: isMaster ? run.status === "completed" ? "proposals" : "master" : "master",
      });
    }
  }

  // The latest retained report can outlive its run in a bounded API payload.
  // Its completion is known, but missing queue/start timestamps stay missing.
  for (const [agentId, saved] of Object.entries(data.reports || {})) {
    if (!saved?.runId || runById.has(saved.runId)) continue;
    const isMaster = agentId === "master" || agentById.get(agentId)?.kind === "master";
    add({
      id: `run:${saved.runId}`, type: "run", stage: isMaster ? "master" : "specialist",
      source: isMaster ? "master" : agentId, target: isMaster ? "proposals" : "master",
      agentId, runId: saved.runId, proposalId: null, title: agentById.get(agentId)?.name || agentId,
      detail: saved.report?.summary || saved.report?.headline || "", status: "completed",
      snapshotOnly: false, historicalSnapshot: false, reportOnly: true,
    }, "finished", saved.finishedAt);
  }

  for (const proposal of proposals) {
    if (!proposal?.id) continue;
    const base = {
      id: `proposal:${proposal.id}`, type: "proposal", stage: "proposal", source: "master", target: "proposals",
      agentId: "master", runId: proposal.sourceRunId ?? null, proposalId: proposal.id,
      title: proposal.title || "", detail: proposal.rationale || "", status: "proposed",
      snapshotOnly: true, historicalSnapshot: true,
    };
    const createdAt = timestamp(proposal.createdAt);
    const updatedAt = timestamp(proposal.updatedAt);
    const decisionAt = timestamp(proposal.decisionAt);
    const executionRun = runById.get(proposal.executionRunId);
    const completedAt = timestamp(proposal.completedAt)
      || (proposal.status === "done" && executionRun?.status === "completed" ? timestamp(executionRun.finishedAt) : null);
    add(base, "proposed", createdAt);

    // Before a manual task is completed there is no run record for its start.
    // Do not duplicate the recorded start after that run becomes available.
    const manualStartAt = proposal.executionMode === "manual" && !executionRun ? timestamp(proposal.startedAt) : null;
    if (manualStartAt) add(base, "started", manualStartAt, {
      stage: "execution", source: "user", target: "execution", status: "executing", runId: null,
    });
    if (completedAt) add(base, "completed", completedAt, {
      stage: "execution", source: "execution", target: "master", status: "done",
      runId: proposal.executionRunId ?? null, detail: proposal.completionNote || "",
    });

    if (!updatedAt || updatedAt === createdAt || updatedAt === completedAt || updatedAt === manualStartAt) continue;
    // decisionAt is overwritten on edits and manual completion too. Only the
    // latest matching decision state can be shown; never reconstruct an earlier
    // approval from a proposal which is now executing or done.
    const isLatestDecision = decisionAt === updatedAt && ["approved", "deferred", "rejected"].includes(proposal.status);
    add(base, isLatestDecision ? "decision" : "updated", updatedAt, {
      stage: isLatestDecision ? "decision" : "proposal", source: isLatestDecision ? "user" : "proposals",
      target: isLatestDecision ? "master" : "proposals", status: proposal.status || "proposed",
      detail: proposal.decisionNote || proposal.rationale || "",
    });
  }

  return events.sort(compareEvents);
}

function dayFormatter(timeZone = "UTC") {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
}

function eventDay(event, formatter) {
  const at = timestamp(event?.at);
  if (!at) return null;
  const parts = formatter.formatToParts(new Date(at));
  const value = (name) => parts.find((part) => part.type === name)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

/** Days with retained events, oldest first, in the configured console timezone. */
export function availableTimelineDays(events, timeZone = "UTC") {
  const formatter = dayFormatter(timeZone);
  return [...new Set(events.map((event) => eventDay(event, formatter)).filter(Boolean))].sort();
}

/** The selected day's retained milestones, always oldest first. */
export function eventsForDay(events, day, timeZone = "UTC") {
  const formatter = dayFormatter(timeZone);
  return events.filter((event) => eventDay(event, formatter) === day).sort(compareEvents);
}
