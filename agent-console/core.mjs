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
    settings: { autoDaily: settings.autoDaily, dailyTime: settings.dailyTime, timeZone },
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
      proposal.status !== "rejected" && proposal.status !== "done" &&
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

export function buildResearchPrompt(agent, config, reports, now = new Date(), extra = "") {
  const date = localClock(now, config.settings.timeZone).date;
  const specialistContext = agent.kind === "master"
    ? JSON.stringify(config.agents.filter((item) => item.kind === "specialist").map((item) => ({
      agent: item.name,
      reportAge: reports[item.id]?.finishedAt ?? "Noch kein Bericht",
      report: reports[item.id]?.report ?? null,
    }))).slice(0, 28000)
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
