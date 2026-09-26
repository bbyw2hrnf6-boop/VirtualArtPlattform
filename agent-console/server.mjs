import { spawn, execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, appendFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCodexArgs,
  buildExecutionPrompt,
  buildResearchPrompt,
  cleanReport,
  dueAgents,
  initializeMasterSync,
  localClock,
  masterInputSignature,
  masterInputs,
  mergeMasterProposals,
  pendingMasterInputs,
  recoverInterruptedState,
  runProgress,
  selectDailyFocus,
  shouldQueueMaster,
  validateConfig,
  worktreeRootFromChange,
} from "./core.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(directory, "..");
const artifacts = join(projectRoot, "artifacts", "agent-console");
const runFiles = join(artifacts, "runs");
const configFile = join(directory, "config.json");
const stateFile = join(artifacts, "state.json");
const schemaFile = join(directory, "report.schema.json");
const port = Number(process.env.AGENT_CONSOLE_PORT || 43821);
const codexBin = process.env.CODEX_BIN ||
  (existsSync("/Applications/ChatGPT.app/Contents/Resources/codex")
    ? "/Applications/ChatGPT.app/Contents/Resources/codex" : "codex");

if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Ungültiger Port.");
mkdirSync(runFiles, { recursive: true });

function writeJson(file, value) {
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, file);
}

let config = validateConfig(JSON.parse(readFileSync(configFile, "utf8")));
const freshState = () => ({ version: 1, runs: [], reports: {}, proposals: [], daily: { lastLocalDate: "", lastCompletedAt: "" } });
let state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : freshState();
if (state.version !== 1) throw new Error("Unbekannte Laufdaten-Version.");
state.runs ??= [];
state.reports ??= {};
state.proposals ??= [];
state.daily ??= freshState().daily;
recoverInterruptedState(state);
initializeMasterSync(state, config);
for (const run of state.runs) {
  if (run.type !== "proposal" || run.proposalSnapshot?.executionMode !== "local-code" || run.worktreePath) continue;
  const file = join(runFiles, `${run.id}.jsonl`);
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.includes('"file_change"')) continue;
    try {
      const event = JSON.parse(line);
      const path = event.item?.changes?.map((change) => worktreeRootFromChange(change.path)).find(Boolean);
      if (path && existsSync(join(path, ".git"))) { run.worktreePath = path; break; }
    } catch { /* Unvollständige Log-Zeile */ }
  }
}
writeJson(stateFile, state);

const pending = [];
let active = null;
let activeChild = null;
let cancellationRequested = false;
let masterSyncTimer = null;

function persist() {
  state.runs = state.runs.slice(0, 100);
  writeJson(stateFile, state);
}

function nowIso() { return new Date().toISOString(); }

function doneToday(proposal, localDate) {
  if (proposal.status !== "done") return false;
  const completedAt = proposal.completedAt || state.runs.find((run) => run.id === proposal.executionRunId)?.finishedAt;
  return completedAt && !Number.isNaN(Date.parse(completedAt))
    && localClock(new Date(completedAt), config.settings.timeZone).date === localDate;
}

function refreshDailyFocus(now = new Date()) {
  const localDate = localClock(now, config.settings.timeZone).date;
  const previousIds = state.daily.focusDate === localDate ? state.daily.focusIds || [] : [];
  const focusIds = selectDailyFocus(state.proposals, state.reports.master?.report, state.runs,
    previousIds, localDate, config.settings.timeZone);
  if (state.daily.focusDate !== localDate || JSON.stringify(previousIds) !== JSON.stringify(focusIds)) {
    state.daily.focusDate = localDate;
    state.daily.focusIds = focusIds;
    state.daily.focusUpdatedAt = now.toISOString();
    persist();
  }
  return localDate;
}

function appendEvent(run, event) {
  run.lastActivityAt = nowIso();
  if (typeof event === "object" && ["thread.started", "turn.started", "turn.completed", "item.started", "item.completed"].includes(event.type)) {
    run.lastProgressAt = run.lastActivityAt;
  }
  const line = typeof event === "string" ? event : JSON.stringify(event);
  appendFileSync(join(runFiles, `${run.id}.jsonl`), `${line}\n`);
  run.events.push(line.slice(0, 1000));
  run.events = run.events.slice(-24);
  if (typeof event === "object") {
    if (event.type === "stderr") {
      const message = String(event.text ?? "").slice(0, 400);
      if (/^Error:/i.test(message) || !run.lastError) run.lastError = message;
    }
    if (event.type === "thread.started") run.threadId = event.thread_id;
    if (event.type === "turn.completed") run.usage = event.usage;
    if (event.type === "item.started") {
      run.currentStep = event.item?.type === "command_execution" ? "Befehl läuft"
        : event.item?.type === "file_change" ? "Dateien werden bearbeitet"
          : "Arbeitsschritt läuft";
    }
    if (event.item?.type === "file_change" && run.proposalSnapshot?.executionMode === "local-code") {
      const path = event.item.changes?.map((change) => worktreeRootFromChange(change.path)).find(Boolean);
      if (path && existsSync(join(path, ".git"))) run.worktreePath = path;
    }
    if (event.type === "item.completed") run.currentStep = "Arbeitsschritt abgeschlossen";
    if (event.type === "item.completed" && event.item?.type === "agent_message") {
      run.message = String(event.item.text ?? "").slice(0, 400);
    }
  }
}

function parseStream(run, stream, name) {
  let buffer = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      if (name === "stdout") {
        try { appendEvent(run, JSON.parse(line)); } catch { appendEvent(run, line); }
      } else {
        appendEvent(run, { type: "stderr", text: line.slice(0, 1000) });
      }
      persist();
    }
  });
  stream.on("end", () => { if (buffer.trim()) { appendEvent(run, buffer.trim()); persist(); } });
}

function enqueue(run) {
  state.runs.unshift(run);
  pending.push(run);
  persist();
  setImmediate(runNext);
  return run;
}

function makeAgentRun(agent, reason) {
  const id = randomUUID();
  return enqueue({
    id, type: "agent", agentId: agent.id, agentName: agent.name, reason,
    model: agent.model, effort: agent.effort, webSearch: agent.webSearch,
    agentSnapshot: agent, status: "queued", createdAt: nowIso(), startedAt: null,
    finishedAt: null, threadId: null, message: "Wartet auf Start", events: [], usage: null,
  });
}

function makeProposalRun(proposal) {
  const agent = config.agents.find((item) => item.kind === "master");
  return enqueue({
    id: randomUUID(), type: "proposal", proposalId: proposal.id, agentId: "master",
    agentName: `Auftrag · ${proposal.title}`, reason: "approved", model: agent.model,
    effort: agent.effort, webSearch: proposal.executionMode === "research" ? "live" : "cached",
    proposalSnapshot: { ...proposal }, status: "queued", createdAt: nowIso(),
    startedAt: null, finishedAt: null, threadId: null, message: "Wartet auf Start", events: [], usage: null,
  });
}

function masterContext() {
  const inputs = masterInputs(state, config);
  const newSignals = pendingMasterInputs(inputs, state.masterSync.lastInputs);
  const { decisions: pendingDecisions, ...otherSignals } = newSignals;
  const indexedRuns = new Map(state.runs.map((run) => [run.id, run]));
  const digest = (item) => {
    const run = indexedRuns.get(item.runId);
    const recentLog = run?.events?.flatMap((line) => {
      try {
        const event = JSON.parse(line);
        if (event.type === "item.completed" && event.item?.type === "agent_message") return [String(event.item.text ?? "").slice(0, 300)];
        if (event.type === "item.completed" && event.item?.type === "file_change") return [`Dateien geändert: ${event.item.changes?.length ?? 0}`];
        if (event.type === "item.completed" && event.item?.type === "command_execution") return [`Befehl beendet: Code ${event.item.exit_code}`];
        if (event.type === "stderr" && /^Error:/i.test(event.text)) return [String(event.text).slice(0, 300)];
      } catch { /* Unvollständige Ereigniszeile */ }
      return [];
    }).slice(-4) ?? [];
    return {
      ...item,
      message: run?.message?.slice(0, 500),
      result: (run?.report?.summary || run?.finalText || "").slice(0, 800),
      error: run?.lastError?.slice(0, 400),
      logPath: run ? join(runFiles, `${run.id}.jsonl`) : null,
      recentLog,
    };
  };
  return [
    "Prüfe für jeden neuen Lauf den kompakten Protokollauszug und das Ergebnis. Bei Fehlern oder Unklarheiten lies das vollständige Protokoll gezielt unter logPath. Werte Status und Fehler ausdrücklich aus; kennzeichne ältere Signale. Worktree-Änderungen sind nicht in main übernommen oder veröffentlicht. Plane höchstens drei konkrete Tagesaufgaben und nenne bestehende Aufgaben mit exakt ihrem gespeicherten Titel, damit sie direkt geöffnet werden können. Weitere Themen gehören in die Beobachtungsliste. Behandle Nutzerentscheidungen als verbindlich: verworfene Aufgaben nicht erneut empfehlen, geparkte Aufgaben nicht erneut in den Tagesfokus setzen, bis der Nutzer sie reaktiviert. Das gilt auch bei einer neuen Formulierung desselben Themas. Erwähne den Entscheid und eine eventuelle Notiz im Briefing, statt einen sinngleichen Vorschlag anzulegen.",
    JSON.stringify({
      userDecisions: inputs.decisions.map((item) => ({ proposalId: item.proposalId, title: item.title,
        status: item.status, updatedAt: item.updatedAt, decisionNote: item.decisionNote,
        completionNote: item.completionNote })),
      newDecisionIds: pendingDecisions.map((item) => item.proposalId),
      newSignals: otherSignals,
      existingProposals: state.proposals.slice(0, 30)
        .map((item) => ({ id: item.id, title: item.title, status: item.status, action: item.action.slice(0, 180), completionNote: (item.completionNote || "").slice(0, 300) })),
      dailyFocus: (state.daily.focusIds || []).map((id) => state.proposals.find((item) => item.id === id))
        .filter(Boolean).map((item) => ({ id: item.id, title: item.title, status: item.status })),
      specialistRuns: inputs.agentRuns.map(digest),
      proposalRuns: inputs.outcomes.map(digest),
    }).slice(0, 22000),
  ].join("\n");
}

function maybeQueueMaster() {
  if (!shouldQueueMaster(state, config, active, pending)) return;
  makeAgentRun(config.agents[0], "sync");
}

function scheduleMasterSync(delayMs = 15_000) {
  if (masterSyncTimer) clearTimeout(masterSyncTimer);
  masterSyncTimer = setTimeout(() => {
    masterSyncTimer = null;
    maybeQueueMaster();
  }, delayMs);
  masterSyncTimer.unref();
}

function runNext() {
  if (active || pending.length === 0) return;
  const run = pending.shift();
  active = run;
  run.status = "running";
  run.startedAt = nowIso();
  run.lastActivityAt = run.startedAt;
  run.lastProgressAt = run.startedAt;
  run.message = "Codex startet …";
  run.currentStep = "Codex startet";
  if (run.type === "agent" && run.agentId === "master") {
    run.sourceInputs = masterInputs(state, config);
    run.sourceSignature = masterInputSignature(run.sourceInputs);
    state.masterSync.lastAttemptSignature = run.sourceSignature;
  }
  persist();

  const outputFile = join(runFiles, `${run.id}.final.txt`);
  const { args, structured, localCode } = buildCodexArgs(run, { projectRoot, outputFile, schemaFile });

  const prompt = run.type === "agent"
    ? buildResearchPrompt(run.agentSnapshot, config, state.reports, new Date(), run.agentId === "master" ? masterContext() : "")
    : localCode
      ? buildExecutionPrompt(run.proposalSnapshot)
      : buildResearchPrompt({
          kind: "specialist",
          prompt: `Führe ausschließlich diese freigegebene Recherche aus: ${run.proposalSnapshot.action}`,
        }, config, state.reports, new Date());

  let finished = false;
  const finish = (exitCode, error) => {
    if (finished) return;
    finished = true;
    run.finishedAt = nowIso();
    run.lastActivityAt = run.finishedAt;
    run.lastProgressAt = run.finishedAt;
    run.currentStep = "Lauf beendet";
    const cancelled = cancellationRequested;
    cancellationRequested = false;
    active = null;
    activeChild = null;
    const raw = existsSync(outputFile) ? readFileSync(outputFile, "utf8").trim() : "";
    run.finalText = raw.slice(0, 20000);
    if (cancelled) {
      run.status = "cancelled";
      run.message = "Lauf abgebrochen.";
    } else if (error || exitCode !== 0) {
      run.status = "failed";
      run.message = error?.message || run.lastError || `Codex beendete den Lauf mit Code ${exitCode}.`;
    } else if (structured) {
      try {
        run.report = cleanReport(JSON.parse(raw));
        run.status = "completed";
        run.message = run.report.headline || "Bericht abgeschlossen";
        if (run.type === "agent") {
          state.reports[run.agentId] = { runId: run.id, finishedAt: run.finishedAt, report: run.report };
          if (run.agentId === "master") {
            state.proposals = mergeMasterProposals(state.proposals, run.report, run.id);
            run.report.proposals = run.report.proposals.map((item) => ({ ...item,
              proposalId: state.proposals.find((proposal) =>
                proposal.title.toLocaleLowerCase("de-DE").replace(/\s+/g, " ").trim()
                  === item.title.toLocaleLowerCase("de-DE").replace(/\s+/g, " ").trim())?.id || null }));
            state.daily.lastCompletedAt = run.finishedAt;
            state.masterSync.lastInputs = run.sourceInputs;
            state.masterSync.lastCompletedSignature = run.sourceSignature;
            state.masterSync.lastCompletedAt = run.finishedAt;
          }
        }
      } catch (parseError) {
        run.status = "failed";
        run.message = `Bericht konnte nicht gelesen werden: ${parseError.message}`;
      }
    } else {
      run.status = "completed";
      run.message = raw.slice(0, 300) || "Lokaler Auftrag abgeschlossen";
    }
    if (run.type === "proposal") {
      const proposal = state.proposals.find((item) => item.id === run.proposalId);
      if (proposal) {
        proposal.status = run.status === "completed" ? "done" : "approved";
        proposal.updatedAt = nowIso();
        proposal.executionRunId = run.id;
        if (run.status === "completed") proposal.completedAt = run.finishedAt;
      }
    }
    persist();
    scheduleMasterSync();
    setImmediate(runNext);
  };

  try {
    activeChild = spawn(codexBin, args, { cwd: projectRoot, stdio: ["pipe", "pipe", "pipe"], env: process.env });
    parseStream(run, activeChild.stdout, "stdout");
    parseStream(run, activeChild.stderr, "stderr");
    activeChild.on("error", (error) => finish(-1, error));
    activeChild.on("close", (code) => finish(code));
    activeChild.stdin.end(prompt);
  } catch (error) {
    finish(-1, error);
  }
}

function startDaily(full = false) {
  if (state.runs.some((run) => run.reason === "daily" && ["queued", "running"].includes(run.status))) {
    throw new Error("Ein Tageslauf ist bereits aktiv.");
  }
  const master = config.agents[0];
  if (!master.enabled) throw new Error("Master ist deaktiviert.");
  const specialists = full
    ? config.agents.filter((agent) => agent.kind === "specialist" && agent.enabled)
    : dueAgents(config, state.reports);
  const runs = specialists.map((agent) => makeAgentRun(agent, "daily"));
  runs.push(makeAgentRun(master, "daily"));
  state.daily.lastLocalDate = localClock(new Date(), config.settings.timeZone).date;
  persist();
  return runs.map((run) => run.id);
}

function checkSchedule() {
  if (process.env.AGENT_CONSOLE_DISABLE_SCHEDULE === "1" || !config.settings.autoDaily) return;
  const clock = localClock(new Date(), config.settings.timeZone);
  if (clock.time >= config.settings.dailyTime && state.daily.lastLocalDate !== clock.date) {
    try { startDaily(false); } catch (error) { console.error(`Tageslauf: ${error.message}`); }
  }
}

function json(response, status, data) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(data));
}

async function body(request) {
  if (!request.headers["content-type"]?.startsWith("application/json")) throw new Error("JSON-Inhalt erwartet.");
  let input = "";
  for await (const chunk of request) {
    input += chunk;
    if (input.length > 300_000) throw new Error("Anfrage ist zu groß.");
  }
  return input ? JSON.parse(input) : {};
}

function publicState() {
  const now = new Date();
  const localDate = refreshDailyFocus(now);
  const inputs = masterInputs(state, config);
  const pendingInputs = pendingMasterInputs(inputs, state.masterSync.lastInputs);
  const pendingCount = pendingInputs.reports.length + pendingInputs.agentRuns.length + pendingInputs.outcomes.length + pendingInputs.decisions.length;
  const latestMaster = state.runs.find((run) => run.type === "agent" && run.agentId === "master");
  const masterUpdating = latestMaster && ["queued", "running"].includes(latestMaster.status);
  const currentSignature = masterInputSignature(inputs);
  return {
    config,
    runs: state.runs.slice(0, 60).map(({ agentSnapshot, proposalSnapshot, ...run }) => {
      const position = pending.findIndex((item) => item.id === run.id);
      const childAlive = active?.id === run.id && activeChild?.exitCode === null && activeChild?.signalCode === null;
      return { ...run, progress: runProgress(run, now, config.settings.quietWarningMinutes, childAlive, position >= 0 ? position + 1 : null) };
    }),
    reports: state.reports,
    proposals: state.proposals,
    daily: { ...state.daily, completedTodayIds: state.proposals.filter((proposal) => doneToday(proposal, localDate)).map((proposal) => proposal.id) },
    coordination: {
      status: masterUpdating ? "updating" : pendingCount === 0 ? "current"
        : ["failed", "interrupted", "cancelled"].includes(latestMaster?.status) && state.masterSync.lastAttemptSignature === currentSignature ? "failed" : "pending",
      pending: pendingInputs,
      pendingCount,
      lastSyncedAt: state.masterSync.lastCompletedAt,
      masterRunId: latestMaster?.id ?? null,
    },
    server: { port, codexBin, activeRunId: active?.id ?? null, queueLength: pending.length, heartbeatAt: now.toISOString() },
  };
}

const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
]);

const server = createServer(async (request, response) => {
  const host = request.headers.host;
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return json(response, 403, { error: "Nur lokale Aufrufe erlaubt." });
  const origin = request.headers.origin;
  if (origin && origin !== `http://127.0.0.1:${port}` && origin !== `http://localhost:${port}`) {
    return json(response, 403, { error: "Fremder Ursprung ist nicht erlaubt." });
  }
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  try {
    if (request.method === "GET" && url.pathname === "/api/state") return json(response, 200, publicState());
    if (request.method === "GET" && url.pathname === "/api/health") return json(response, 200, { ok: true, port });
    if (request.method === "GET" && /^\/api\/runs\/[a-f0-9-]+\/log$/.test(url.pathname)) {
      const id = url.pathname.split("/")[3];
      if (!state.runs.some((run) => run.id === id)) return json(response, 404, { error: "Lauf fehlt." });
      const file = join(runFiles, `${id}.jsonl`);
      response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      return response.end(existsSync(file) ? readFileSync(file, "utf8") : "");
    }
    if (request.method === "PUT" && url.pathname === "/api/config") {
      const nextConfig = validateConfig(await body(request));
      writeJson(configFile, nextConfig);
      config = nextConfig;
      scheduleMasterSync();
      return json(response, 200, { config });
    }
    if (request.method === "POST" && url.pathname === "/api/daily/run") {
      const input = await body(request);
      return json(response, 202, { runIds: startDaily(input.full === true) });
    }
    const agentRoute = url.pathname.match(/^\/api\/agents\/([a-z0-9-]+)\/run$/);
    if (request.method === "POST" && agentRoute) {
      await body(request);
      const agent = config.agents.find((item) => item.id === agentRoute[1]);
      if (!agent || !agent.enabled) throw new Error("Agent fehlt oder ist deaktiviert.");
      return json(response, 202, { runId: makeAgentRun(agent, "manual").id });
    }
    const cancelRoute = url.pathname.match(/^\/api\/runs\/([a-f0-9-]+)\/cancel$/);
    if (request.method === "POST" && cancelRoute) {
      await body(request);
      const run = state.runs.find((item) => item.id === cancelRoute[1]);
      if (!run || !["queued", "running"].includes(run.status)) throw new Error("Dieser Lauf kann nicht abgebrochen werden.");
      if (run.status === "queued") {
        const index = pending.findIndex((item) => item.id === run.id);
        if (index >= 0) pending.splice(index, 1);
        run.status = "cancelled";
        run.finishedAt = nowIso();
        run.message = "Lauf abgebrochen.";
        if (run.type === "proposal") {
          const proposal = state.proposals.find((item) => item.id === run.proposalId);
          if (proposal) {
            proposal.status = "approved";
            proposal.updatedAt = nowIso();
          }
        }
        persist();
        scheduleMasterSync();
      } else {
        cancellationRequested = true;
        activeChild?.kill("SIGTERM");
      }
      return json(response, 200, { ok: true });
    }
    const proposalRoute = url.pathname.match(/^\/api\/proposals\/([a-f0-9-]+)$/);
    if (request.method === "PATCH" && proposalRoute) {
      const input = await body(request);
      const proposal = state.proposals.find((item) => item.id === proposalRoute[1]);
      if (!proposal) return json(response, 404, { error: "Vorschlag fehlt." });
      if (proposal.status === "executing") throw new Error("Laufender Vorschlag kann nicht geändert werden.");
      const nextProposal = { ...proposal };
      for (const field of ["title", "rationale", "action", "priority", "effort", "confidence", "executionMode", "status"]) {
        if (Object.hasOwn(input, field)) nextProposal[field] = input[field];
      }
      if (!["proposed", "approved", "deferred", "rejected"].includes(nextProposal.status)) throw new Error("Ungültiger Entscheidungsstatus.");
      if (!priorityValuesForApi.has(nextProposal.priority) || !modeValuesForApi.has(nextProposal.executionMode)) throw new Error("Ungültige Priorität oder Ausführung.");
      if (!["small", "medium", "large"].includes(nextProposal.effort) || !["high", "medium", "low"].includes(nextProposal.confidence)) throw new Error("Ungültige Einschätzung.");
      for (const field of ["title", "rationale", "action"]) {
        if (typeof nextProposal[field] !== "string" || !nextProposal[field].trim() || nextProposal[field].length > 4000) throw new Error("Textfeld fehlt oder ist zu lang.");
      }
      if (Object.hasOwn(input, "decisionNote")) {
        if (typeof input.decisionNote !== "string" || input.decisionNote.length > 500) throw new Error("Entscheidungsnotiz ist zu lang.");
        nextProposal.decisionNote = input.decisionNote.trim();
      } else if (Object.hasOwn(input, "status") && !["deferred", "rejected"].includes(nextProposal.status)) {
        nextProposal.decisionNote = "";
      }
      const updatedAt = nowIso();
      Object.assign(proposal, nextProposal, { updatedAt, decisionAt: updatedAt });
      persist();
      scheduleMasterSync();
      return json(response, 200, { proposal });
    }
    const executeRoute = url.pathname.match(/^\/api\/proposals\/([a-f0-9-]+)\/execute$/);
    if (request.method === "POST" && executeRoute) {
      await body(request);
      const proposal = state.proposals.find((item) => item.id === executeRoute[1]);
      if (!proposal || proposal.status !== "approved") throw new Error("Vorschlag muss zuerst freigegeben sein.");
      const startedAt = nowIso();
      proposal.status = "executing";
      proposal.startedAt = startedAt;
      proposal.updatedAt = startedAt;
      if (proposal.executionMode === "manual") {
        proposal.decisionAt = startedAt;
        persist();
        scheduleMasterSync();
        return json(response, 200, { manual: true });
      }
      const run = makeProposalRun(proposal);
      return json(response, 202, { runId: run.id });
    }
    const completeRoute = url.pathname.match(/^\/api\/proposals\/([a-f0-9-]+)\/complete$/);
    if (request.method === "POST" && completeRoute) {
      const input = await body(request);
      const proposal = state.proposals.find((item) => item.id === completeRoute[1]);
      if (!proposal || proposal.status !== "executing" || proposal.executionMode !== "manual") {
        throw new Error("Nur ein gestarteter manueller Auftrag kann so abgeschlossen werden.");
      }
      const note = typeof input.note === "string" ? input.note.trim() : "";
      if (note.length < 5 || note.length > 2000) throw new Error("Bitte das Ergebnis mit 5–2000 Zeichen festhalten.");
      const finishedAt = nowIso();
      const runId = randomUUID();
      const logLine = JSON.stringify({ type: "manual", text: note, completedAt: finishedAt });
      writeFileSync(join(runFiles, `${runId}.jsonl`), `${logLine}\n`, { mode: 0o600 });
      const run = {
        id: runId, type: "proposal", proposalId: proposal.id, agentId: "manual",
        agentName: `Manuell · ${proposal.title}`, reason: "manual", model: "Manuell", effort: "—",
        status: "completed", createdAt: proposal.startedAt || finishedAt,
        startedAt: proposal.startedAt || finishedAt, finishedAt,
        lastActivityAt: finishedAt, lastProgressAt: finishedAt, currentStep: "Manuell abgeschlossen",
        message: note.slice(0, 300), finalText: note, events: [logLine], usage: null,
      };
      state.runs.unshift(run);
      Object.assign(proposal, { status: "done", updatedAt: finishedAt, decisionAt: finishedAt,
        completedAt: finishedAt, completionNote: note, executionRunId: run.id });
      persist();
      scheduleMasterSync();
      return json(response, 200, { runId: run.id, proposal });
    }
    const reopenRoute = url.pathname.match(/^\/api\/proposals\/([a-f0-9-]+)\/reopen$/);
    if (request.method === "POST" && reopenRoute) {
      await body(request);
      const proposal = state.proposals.find((item) => item.id === reopenRoute[1]);
      if (!proposal || proposal.status !== "executing" || proposal.executionMode !== "manual") {
        throw new Error("Nur ein gestarteter manueller Auftrag kann zurückgesetzt werden.");
      }
      const updatedAt = nowIso();
      Object.assign(proposal, { status: "approved", startedAt: null, updatedAt, decisionAt: updatedAt });
      persist();
      scheduleMasterSync();
      return json(response, 200, { proposal });
    }
    if (request.method === "GET" && staticFiles.has(url.pathname)) {
      const [file, contentType] = staticFiles.get(url.pathname);
      response.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      });
      return response.end(readFileSync(join(directory, file)));
    }
    return json(response, 404, { error: "Nicht gefunden." });
  } catch (error) {
    return json(response, error instanceof SyntaxError ? 400 : 422, { error: error.message });
  }
});

const priorityValuesForApi = new Set(["today", "soon", "watch"]);
const modeValuesForApi = new Set(["research", "local-code", "manual"]);

server.listen(port, "127.0.0.1", () => {
  const address = `http://127.0.0.1:${port}/`;
  console.log(`LIEUVA Agentenzentrale: ${address}`);
  console.log(`Laufdaten: ${artifacts}`);
  if (process.argv.includes("--open") && process.platform === "darwin") execFile("open", [address]);
  setTimeout(checkSchedule, 2000);
  scheduleMasterSync(3000);
  setInterval(checkSchedule, 30_000).unref();
});

server.on("error", (error) => {
  console.error(`Serverstart fehlgeschlagen: ${error.message}`);
  process.exitCode = 1;
});

process.on("SIGINT", () => {
  if (activeChild) activeChild.kill("SIGTERM");
  server.close(() => process.exit(0));
});
