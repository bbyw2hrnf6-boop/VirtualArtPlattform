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
  localClock,
  mergeMasterProposals,
  recoverInterruptedState,
  validateConfig,
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
writeJson(stateFile, state);

const pending = [];
let active = null;
let activeChild = null;
let cancellationRequested = false;

function persist() {
  state.runs = state.runs.slice(0, 100);
  writeJson(stateFile, state);
}

function nowIso() { return new Date().toISOString(); }

function appendEvent(run, event) {
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
  stream.on("end", () => { if (buffer.trim()) appendEvent(run, buffer.trim()); });
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

function runNext() {
  if (active || pending.length === 0) return;
  const run = pending.shift();
  active = run;
  run.status = "running";
  run.startedAt = nowIso();
  run.message = "Codex startet …";
  persist();

  const outputFile = join(runFiles, `${run.id}.final.txt`);
  const { args, structured, localCode } = buildCodexArgs(run, { projectRoot, outputFile, schemaFile });

  const prompt = run.type === "agent"
    ? buildResearchPrompt(run.agentSnapshot, config, state.reports, new Date())
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
            state.daily.lastCompletedAt = run.finishedAt;
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
      }
    }
    persist();
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
  const masterFinishedAt = state.reports.master?.finishedAt;
  if (masterFinishedAt && localClock(new Date(masterFinishedAt), config.settings.timeZone).date === clock.date) return;
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
  return {
    config,
    runs: state.runs.slice(0, 60).map(({ agentSnapshot, proposalSnapshot, ...run }) => run),
    reports: state.reports,
    proposals: state.proposals,
    daily: state.daily,
    server: { port, codexBin, activeRunId: active?.id ?? null, queueLength: pending.length },
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
      Object.assign(proposal, nextProposal, { updatedAt: nowIso() });
      persist();
      return json(response, 200, { proposal });
    }
    const executeRoute = url.pathname.match(/^\/api\/proposals\/([a-f0-9-]+)\/execute$/);
    if (request.method === "POST" && executeRoute) {
      await body(request);
      const proposal = state.proposals.find((item) => item.id === executeRoute[1]);
      if (!proposal || proposal.status !== "approved") throw new Error("Vorschlag muss zuerst freigegeben sein.");
      if (proposal.executionMode === "manual") throw new Error("Diese Aktion braucht eine manuelle Durchführung.");
      proposal.status = "executing";
      proposal.updatedAt = nowIso();
      const run = makeProposalRun(proposal);
      return json(response, 202, { runId: run.id });
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
