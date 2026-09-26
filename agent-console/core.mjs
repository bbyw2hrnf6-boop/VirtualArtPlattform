import { randomUUID } from "node:crypto";

const cadenceValues = new Set(["daily", "weekly", "manual"]);
const effortValues = new Set(["low", "medium", "high", "xhigh", "max"]);
const searchValues = new Set(["live", "cached", "disabled"]);
const executionValues = new Set(["research", "local-code", "manual"]);
const priorityValues = new Set(["today", "soon", "watch"]);

function boundedString(value, label, max) {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new Error(`${label} muss Text mit höchstens ${max} Zeichen sein.`);
  }
  return value.trim();
}

export function validateConfig(input) {
  if (!input || typeof input !== "object" || input.version !== 1) {
    throw new Error("Unbekannte Konfigurationsversion.");
  }
  const settings = input.settings;
  if (!settings || typeof settings !== "object") throw new Error("Einstellungen fehlen.");
  if (typeof settings.autoDaily !== "boolean") throw new Error("autoDaily muss ein Boolean sein.");
  const autoSynthesize = settings.autoSynthesize ?? true;
  const quietWarningMinutes = settings.quietWarningMinutes ?? 5;
  if (typeof autoSynthesize !== "boolean") throw new Error("autoSynthesize muss ein Boolean sein.");
  if (!Number.isInteger(quietWarningMinutes) || quietWarningMinutes < 1 || quietWarningMinutes > 60) {
    throw new Error("Ruhe-Warnschwelle muss zwischen 1 und 60 Minuten liegen.");
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.dailyTime)) {
    throw new Error("Tageszeit muss HH:MM sein.");
  }
  const timeZone = boundedString(settings.timeZone, "Zeitzone", 80);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
  } catch {
    throw new Error("Ungültige Zeitzone.");
  }
  if (!Array.isArray(input.agents) || input.agents.length < 2 || input.agents.length > 20) {
    throw new Error("Die Konfiguration braucht Master und 1–19 Spezialisten.");
  }
  const ids = new Set();
  const agents = input.agents.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Ungültiger Agent.");
    const id = boundedString(item.id, "Agent-ID", 40);
    if (!/^[a-z][a-z0-9-]*$/.test(id) || ids.has(id)) throw new Error("Agent-IDs müssen eindeutig und einfach sein.");
    ids.add(id);
    if (!["master", "specialist"].includes(item.kind)) throw new Error("Ungültiger Agententyp.");
    if (typeof item.enabled !== "boolean") throw new Error("enabled muss ein Boolean sein.");
    if (!cadenceValues.has(item.cadence)) throw new Error("Ungültiger Rhythmus.");
    const model = boundedString(item.model, "Modell", 64);
    if (!/^[a-z0-9][a-z0-9.-]*$/.test(model)) throw new Error("Ungültiger Modellname.");
    if (!effortValues.has(item.effort)) throw new Error("Ungültiger Reasoning-Aufwand.");
    if (!searchValues.has(item.webSearch)) throw new Error("Ungültiger Web-Suchmodus.");
    return {
      id,
      kind: item.kind,
      name: boundedString(item.name, "Name", 80),
      tagline: boundedString(item.tagline, "Kurzbeschreibung", 180),
      enabled: item.enabled,
      cadence: item.cadence,
      model,
      effort: item.effort,
      webSearch: item.webSearch,
      prompt: boundedString(item.prompt, "Auftrag", 6000),
    };
  });
  if (agents.filter((agent) => agent.kind === "master").length !== 1 || agents[0].kind !== "master") {
    throw new Error("Genau ein Master muss an erster Stelle stehen.");
  }
  return {
    version: 1,
    settings: { autoDaily: settings.autoDaily, autoSynthesize, quietWarningMinutes, dailyTime: settings.dailyTime, timeZone },
    agents,
  };
}

export function localClock(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (name) => parts.find((item) => item.type === name)?.value;
  return { date: `${part("year")}-${part("month")}-${part("day")}`, time: `${part("hour")}:${part("minute")}` };
}

export function dueAgents(config, reports, now = new Date()) {
  const current = localClock(now, config.settings.timeZone).date;
  return config.agents.filter((agent) => {
    if (agent.kind === "master" || !agent.enabled || agent.cadence === "manual") return false;
    const previous = reports[agent.id]?.finishedAt;
    if (!previous || Number.isNaN(Date.parse(previous))) return true;
    const previousDay = localClock(new Date(previous), config.settings.timeZone).date;
    if (agent.cadence === "daily") return previousDay !== current;
    return now.getTime() - Date.parse(previous) >= 7 * 24 * 60 * 60 * 1000;
  });
}

const trim = (value, max = 4000) => String(value ?? "").trim().slice(0, max);

export function cleanReport(input) {
  if (!input || typeof input !== "object") throw new Error("Agentenbericht fehlt.");
  if (!Array.isArray(input.findings) || !Array.isArray(input.proposals) || !Array.isArray(input.watchlist)) {
    throw new Error("Agentenbericht hat kein erwartetes Format.");
  }
  return {
    headline: trim(input.headline, 240),
    summary: trim(input.summary, 5000),
    findings: input.findings.slice(0, 12).map((item) => ({
      title: trim(item.title, 200),
      detail: trim(item.detail, 2500),
      evidence: trim(item.evidence, 800),
      confidence: ["high", "medium", "low"].includes(item.confidence) ? item.confidence : "low",
    })),
    proposals: input.proposals.slice(0, 12).map((item) => ({
      title: trim(item.title, 200),
      rationale: trim(item.rationale, 2500),
      action: trim(item.action, 3000),
      priority: priorityValues.has(item.priority) ? item.priority : "watch",
      effort: ["small", "medium", "large"].includes(item.effort) ? item.effort : "medium",
      confidence: ["high", "medium", "low"].includes(item.confidence) ? item.confidence : "low",
      executionMode: executionValues.has(item.executionMode) ? item.executionMode : "manual",
      evidence: trim(item.evidence, 800),
    })),
    watchlist: input.watchlist.slice(0, 12).map((item) => trim(item, 500)),
  };
}

export function mergeMasterProposals(existing, report, runId, now = new Date()) {
  const proposals = [...existing];
  for (const item of report.proposals) {
    if (!item.title || !item.action) continue;
    const key = item.title.toLocaleLowerCase("de-DE").replace(/\s+/g, " ");
    const duplicate = proposals.find((proposal) =>
      proposal.title.toLocaleLowerCase("de-DE").replace(/\s+/g, " ") === key);
    if (duplicate) continue;
    proposals.unshift({
      id: randomUUID(),
      sourceRunId: runId,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      status: "proposed",
      ...item,
    });
  }
  return proposals.slice(0, 120);
}

const titleKey = (value) => String(value || "").toLocaleLowerCase("de-DE").replace(/\s+/g, " ").trim();

export function selectDailyFocus(proposals, report, runs, previousIds, localDate, timeZone) {
  const byId = new Map(proposals.map((proposal) => [proposal.id, proposal]));
  const byTitle = new Map(proposals.map((proposal) => [titleKey(proposal.title), proposal]));
  const runById = new Map(runs.map((run) => [run.id, run]));
  const finishedToday = (proposal) => {
    const value = proposal.completedAt || runById.get(proposal.executionRunId)?.finishedAt;
    return proposal.status === "done" && value && !Number.isNaN(Date.parse(value))
      && localClock(new Date(value), timeZone).date === localDate;
  };
  const eligible = (proposal) => proposal && (["proposed", "approved", "executing"].includes(proposal.status) || finishedToday(proposal));
  const focus = [];
  const add = (proposal) => {
    if (eligible(proposal) && !focus.includes(proposal.id) && focus.length < 3) focus.push(proposal.id);
  };

  for (const id of previousIds || []) {
    const proposal = byId.get(id);
    if (proposal?.status === "executing" || finishedToday(proposal || {})) add(proposal);
  }
  for (const proposal of proposals) {
    if (proposal.status === "executing" || finishedToday(proposal)) add(proposal);
  }
  for (const item of report?.proposals || []) {
    if (item.priority === "today") add(byId.get(item.proposalId) || byTitle.get(titleKey(item.title)));
  }
  for (const proposal of proposals) if (proposal.priority === "today") add(proposal);
  for (const item of report?.proposals || []) {
    if (item.priority !== "today") add(byId.get(item.proposalId) || byTitle.get(titleKey(item.title)));
  }
  for (const priority of ["soon", "watch"]) {
    for (const proposal of proposals) if (proposal.priority === priority) add(proposal);
  }
  return focus;
}

export function buildResearchPrompt(agent, config, reports, now = new Date(), extra = "") {
  const date = localClock(now, config.settings.timeZone).date;
  const specialistContext = agent.kind === "master"
    ? JSON.stringify(config.agents.filter((item) => item.kind === "specialist").map((item) => ({
      agent: item.name,
      reportAge: reports[item.id]?.finishedAt ?? "Noch kein Bericht",
      reportRunId: reports[item.id]?.runId ?? null,
      report: reports[item.id]?.report ? {
        headline: reports[item.id].report.headline,
        summary: String(reports[item.id].report.summary ?? "").slice(0, 1200),
        findings: (reports[item.id].report.findings ?? []).slice(0, 5).map((finding) => ({
          title: finding.title, detail: String(finding.detail ?? "").slice(0, 450), evidence: String(finding.evidence ?? "").slice(0, 250), confidence: finding.confidence,
        })),
        furtherFindingTitles: (reports[item.id].report.findings ?? []).slice(5).map((finding) => finding.title),
        proposals: (reports[item.id].report.proposals ?? []).slice(0, 5).map((proposal) => ({
          title: proposal.title, action: String(proposal.action ?? "").slice(0, 450), priority: proposal.priority,
          rationale: String(proposal.rationale ?? "").slice(0, 250), evidence: String(proposal.evidence ?? "").slice(0, 250),
        })),
        furtherProposalTitles: (reports[item.id].report.proposals ?? []).slice(5).map((proposal) => proposal.title),
        watchlist: (reports[item.id].report.watchlist ?? []).map((entry) => String(entry).slice(0, 200)),
      } : null,
    })))
    : "";
  return [
    `Datum: ${date}; Zeitzone: ${config.settings.timeZone}. Du arbeitest im LIEUVA-Repository.`,
    "Dies ist ein lesender Recherchelauf. Nimm keine Dateiänderungen, Deployments, externen Nachrichten oder Live-Datenaktionen vor.",
    "Lies README.md und nur die für deinen Auftrag nötigen Vertragsquellen. Suche gezielt; begrenze die Sichtung auf relevante Ausschnitte statt ganze große Quelldateien zu laden. Belege neue externe Aussagen mit direkten URLs und Datum; fehlt Webzugriff, kennzeichne die Lücke.",
    agent.prompt,
    specialistContext ? `Aktuelle Spezialistenberichte (mit Alter, ältere Berichte nicht als heutige Neuigkeit behandeln):\n${specialistContext}` : "",
    extra ? `Zusätzlicher freigegebener Auftrag:\n${extra}` : "",
    "Gib das Ergebnis exakt gemäß dem vorgegebenen JSON-Schema zurück. Halte die Zusammenfassung kurz. Setze executionMode auf manual für Veröffentlichungen, Kontaktaufnahme, Deployments, Live-Daten, Regeländerungen und Löschungen.",
  ].filter(Boolean).join("\n\n");
}

export function buildExecutionPrompt(proposal) {
  return [
    "Vom Nutzer in der lokalen LIEUVA-Agentenzentrale freigegebener Auftrag.",
    `Titel: ${proposal.title}`,
    `Konkreter Auftrag: ${proposal.action}`,
    `Begründung: ${proposal.rationale}`,
    "Arbeite im isolierten Codex-Worktree. Lies AGENTS.md, die nächstgelegene Bereichsregel, relevanten Quellcode und Tests. Erhalte fremde Änderungen.",
    "Setze nur lokale, reversible Code- oder Dokumentänderungen um. Keine Deployments, Live-Datenmutation, Firebase-Regeländerung, Löschung oder externe Kontaktaufnahme.",
    "Führe die für geänderten Code in AGENTS.md verlangten Prüfungen aus. Berichte am Ende Worktree-Pfad, geänderte Dateien, Prüfergebnisse und offene Risiken. Antworte auf Deutsch.",
  ].join("\n\n");
}

export function buildCodexArgs(run, { projectRoot, outputFile, schemaFile }) {
  const structured = run.type === "agent" || run.proposalSnapshot?.executionMode === "research";
  const localCode = run.type === "proposal" && run.proposalSnapshot?.executionMode === "local-code";
  const args = [
    "exec",
    ...(localCode ? ["--worktree"] : ["--ephemeral", "--ignore-user-config"]),
    "--disable", "multi_agent", "--json",
    "-m", run.model,
    "-c", `model_reasoning_effort=${JSON.stringify(run.effort)}`,
    "-c", `web_search=${JSON.stringify(run.webSearch)}`,
    "-c", 'approval_policy="never"',
    "--sandbox", localCode ? "workspace-write" : "read-only",
    "-C", projectRoot,
    "-o", outputFile,
  ];
  if (structured) args.push("--output-schema", schemaFile);
  args.push("-");
  return { args, structured, localCode };
}

export function recoverInterruptedState(state, now = new Date()) {
  for (const run of state.runs) {
    if (["queued", "running"].includes(run.status)) {
      run.status = "interrupted";
      run.finishedAt = now.toISOString();
      run.message = "Server wurde während des Laufs beendet.";
    }
  }
  for (const proposal of state.proposals) {
    if (proposal.status === "executing") {
      proposal.status = "approved";
      proposal.updatedAt = now.toISOString();
    }
  }
  return state;
}

const finishedStatuses = new Set(["completed", "failed", "cancelled", "interrupted"]);

export function masterInputs(state, config) {
  const specialists = config.agents.filter((agent) => agent.kind === "specialist");
  return {
    reports: specialists.flatMap((agent) => {
      const report = state.reports[agent.id];
      return report ? [{ agentId: agent.id, agentName: agent.name, runId: report.runId, finishedAt: report.finishedAt }] : [];
    }),
    agentRuns: specialists.flatMap((agent) => {
      const run = state.runs.find((item) => item.type === "agent" && item.agentId === agent.id && finishedStatuses.has(item.status));
      return run ? [{ agentId: agent.id, agentName: agent.name, runId: run.id, status: run.status, finishedAt: run.finishedAt }] : [];
    }),
    outcomes: state.runs.filter((run) => run.type === "proposal" && finishedStatuses.has(run.status))
      .slice(0, 12).map((run) => ({ runId: run.id, proposalId: run.proposalId, status: run.status, finishedAt: run.finishedAt })),
    decisions: state.proposals.filter((proposal) => proposal.decisionAt)
      .sort((a, b) => Date.parse(b.decisionAt) - Date.parse(a.decisionAt))
      .slice(0, 30).map((proposal) => ({ proposalId: proposal.id, title: proposal.title,
        status: proposal.status, updatedAt: proposal.decisionAt,
        decisionNote: (proposal.decisionNote || "").slice(0, 500),
        completionNote: (proposal.completionNote || "").slice(0, 500) })),
  };
}

export function masterInputSignature(inputs) {
  const signature = {
    reports: inputs.reports.map((item) => item.runId),
    agentRuns: inputs.agentRuns.map((item) => [item.runId, item.status]),
    outcomes: inputs.outcomes.map((item) => [item.runId, item.status]),
  };
  if (inputs.decisions?.length) signature.decisions = inputs.decisions.map((item) => [item.proposalId, item.status, item.updatedAt]);
  return JSON.stringify(signature);
}

export function pendingMasterInputs(current, previous = { reports: [], agentRuns: [], outcomes: [], decisions: [] }) {
  const oldReports = new Set((previous.reports || []).map((item) => item.runId));
  const oldRuns = new Set((previous.agentRuns || []).map((item) => item.runId));
  const oldOutcomes = new Set((previous.outcomes || []).map((item) => item.runId));
  const oldDecisions = new Set((previous.decisions || []).map((item) => `${item.proposalId}:${item.updatedAt}`));
  return {
    reports: current.reports.filter((item) => !oldReports.has(item.runId)),
    agentRuns: current.agentRuns.filter((item) => !oldRuns.has(item.runId)),
    outcomes: current.outcomes.filter((item) => !oldOutcomes.has(item.runId)),
    decisions: (current.decisions || []).filter((item) => !oldDecisions.has(`${item.proposalId}:${item.updatedAt}`)),
  };
}

export function initializeMasterSync(state, config) {
  if (state.masterSync) return state.masterSync;
  const finishedAt = state.reports.master?.finishedAt ?? null;
  const inputs = masterInputs(state, config);
  const beforeMaster = (item) => finishedAt && item.finishedAt && Date.parse(item.finishedAt) <= Date.parse(finishedAt);
  const lastInputs = {
    reports: inputs.reports.filter(beforeMaster),
    agentRuns: inputs.agentRuns.filter(beforeMaster),
    outcomes: [],
  };
  const signature = finishedAt ? masterInputSignature(lastInputs) : null;
  state.masterSync = { lastInputs, lastCompletedAt: finishedAt, lastCompletedSignature: signature, lastAttemptSignature: signature };
  return state.masterSync;
}

export function shouldQueueMaster(state, config, active, pending) {
  if (!config.settings.autoSynthesize || !config.agents[0].enabled || active || pending.length) return false;
  const inputs = masterInputs(state, config);
  if (!inputs.reports.length && !inputs.agentRuns.length && !inputs.outcomes.length && !inputs.decisions.length) return false;
  const signature = masterInputSignature(inputs);
  return signature !== state.masterSync.lastCompletedSignature && signature !== state.masterSync.lastAttemptSignature;
}

export function runProgress(run, now = new Date(), quietWarningMinutes = 5, processAlive = false, queuePosition = null) {
  const started = run.startedAt ? Date.parse(run.startedAt) : NaN;
  const lastActivity = run.lastProgressAt ? Date.parse(run.lastProgressAt)
    : run.lastActivityAt ? Date.parse(run.lastActivityAt) : started;
  const elapsedMs = Number.isFinite(started) ? Math.max(0, now.getTime() - started) : 0;
  const quietMs = Number.isFinite(lastActivity) ? Math.max(0, now.getTime() - lastActivity) : null;
  const signal = run.status === "queued" ? "queued"
    : run.status === "running" ? (!processAlive ? "unknown" : quietMs !== null && quietMs >= quietWarningMinutes * 60_000 ? "quiet" : "active")
      : "finished";
  return { elapsedMs, quietMs, signal, processAlive, queuePosition };
}

export function worktreeRootFromChange(path) {
  if (typeof path !== "string") return null;
  const match = path.match(/^(.*\/\.codex\/worktrees\/[^/]+\/[^/]+)(?:\/|$)/);
  return match?.[1] ?? null;
}
