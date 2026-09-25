const app = document.getElementById("app");
const overlay = document.getElementById("overlay");
const toast = document.getElementById("toast");
const rootUrl = "http://127.0.0.1:43821";
const labels = {
  overview: "Übersicht", agents: "Agenten", proposals: "Vorschläge", runs: "Läufe", settings: "Einstellungen",
  ready: "Bereit", disabled: "Inaktiv", queued: "Wartet", running: "Läuft", completed: "Fertig", failed: "Fehler", cancelled: "Abgebrochen", interrupted: "Unterbrochen",
  current: "Aktuell", updating: "Wird aktualisiert", pending: "Ausstehend", quiet: "Lange ohne Ausgabe",
  proposed: "Zur Prüfung", approved: "Freigegeben", deferred: "Zurückgestellt", rejected: "Verworfen", executing: "In Arbeit", done: "Erledigt",
  daily: "Täglich", weekly: "Wöchentlich", manual: "Manuell",
  today: "Heute", soon: "Demnächst", watch: "Beobachten",
  small: "Klein", medium: "Mittel", large: "Groß",
  research: "Recherche", "local-code": "Lokale Codearbeit", manualMode: "Manuell",
};
const symbols = { master: "✦", quality: "◇", ux: "◎", product: "◈", market: "◌", growth: "↗", "three-d": "⬡" };
const ui = { view: "overview", agentId: null, runId: null, proposalId: null, proposalFilter: "open", dirty: false };
let data = null;
let toastTimer;

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
function dateText(value) {
  if (!value) return "Noch nie";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unbekannt";
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: data?.config.settings.timeZone || "Europe/Amsterdam" }).format(date);
}
function durationText(milliseconds) {
  const minutes = Math.floor(Math.max(0, milliseconds || 0) / 60_000);
  if (minutes < 1) return "unter 1 Min.";
  if (minutes < 60) return `${minutes} Min.`;
  return `${Math.floor(minutes / 60)} Std. ${minutes % 60} Min.`;
}
function activityText(run) {
  const progress = run.progress;
  if (run.status === "queued") return `Warteschlange · Position ${progress?.queuePosition || "?"}`;
  if (run.status !== "running") return run.finishedAt ? `Beendet: ${dateText(run.finishedAt)}` : "";
  const runtime = `Läuft seit ${durationText(progress?.elapsedMs)}`;
  const silence = `letzter Arbeitsschritt vor ${durationText(progress?.quietMs)}`;
  if (progress?.signal === "quiet") return `${runtime} · ${silence} · Prozess aktiv, bitte prüfen`;
  if (progress?.signal === "unknown") return `${runtime} · ${silence} · Prozessstatus unklar`;
  return `${runtime} · ${silence} · Codex-Prozess aktiv`;
}
function evidence(value) {
  const text = String(value || "").trim();
  if (!text) return "Keine Quelle angegeben";
  try {
    const url = new URL(text);
    if (url.protocol === "https:" || url.protocol === "http:") return `<a href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">${esc(url.hostname)} ↗</a>`;
  } catch { /* Repo-Pfad oder Beschreibung */ }
  return esc(text);
}
function status(value) { return `<span class="status ${esc(value || "")}">${esc(labels[value] || value || "Bereit")}</span>`; }
function latestRun(id) { return data?.runs.find((run) => run.agentId === id && run.type === "agent"); }
function reportFor(id) { return data?.reports[id]?.report; }
function availableAgents() { return data?.config.agents.filter((agent) => agent.enabled) || []; }
function openProposals() { return data?.proposals.filter((proposal) => ["proposed", "approved"].includes(proposal.status)) || []; }
function button(text, action, extra = "", className = "btn") { return `<button type="button" class="${className}" data-action="${action}" ${extra}>${text}</button>`; }
function notify(message, error = false) {
  toast.textContent = message;
  toast.className = error ? "visible error" : "visible";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = ""; }, 4200);
}
async function api(method, path, payload) {
  const response = await fetch(path, {
    method,
    headers: method === "GET" ? undefined : { "Content-Type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(payload ?? {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result;
}
async function refresh(render = true) {
  try {
    data = await api("GET", "/api/state");
    document.getElementById("connectionLabel").textContent = "Lokal verbunden";
    document.getElementById("navProposalCount").textContent = openProposals().length;
    document.getElementById("todayLabel").textContent = new Intl.DateTimeFormat("de-DE", { dateStyle: "full", timeZone: data.config.settings.timeZone }).format(new Date());
    if (render && !ui.dirty) draw();
  } catch (error) {
    document.getElementById("connectionLabel").textContent = "Server nicht erreichbar";
    if (!data) offline();
  }
}

function sectionHead(title, right = "") { return `<div class="section-heading"><h2>${esc(title)}</h2>${right}</div>`; }
function pageHead(kicker, title, description, actions = "") {
  return `<div class="page-head"><div><div class="eyebrow">${esc(kicker)}</div><h1>${esc(title)}</h1><p>${esc(description)}</p></div>${actions ? `<div class="button-row">${actions}</div>` : ""}</div>`;
}
function finding(item) {
  return `<div class="finding"><strong>${esc(item.title)}</strong><p>${esc(item.detail)}</p><small>${evidence(item.evidence)} · ${esc(item.confidence)}</small></div>`;
}
function reportBlock(report, emptyText) {
  if (!report) return `<div class="empty">${esc(emptyText)}</div>`;
  return `<h3 class="report-headline">${esc(report.headline)}</h3><p class="body-copy">${esc(report.summary)}</p>${report.findings.length ? `<div class="subtle-divider"></div>${report.findings.map(finding).join("")}` : ""}${report.proposals.length ? `<div class="subtle-divider"></div>${sectionHead("Empfehlungen")}${report.proposals.map((item) => `<div class="finding"><strong>${esc(item.title)} · ${esc(labels[item.priority])}</strong><p>${esc(item.action)}</p><small>${evidence(item.evidence)}</small></div>`).join("")}` : ""}${report.watchlist.length ? `<div class="subtle-divider"></div>${sectionHead("Beobachten")}${report.watchlist.map((item) => `<p class="body-copy">${esc(item)}</p>`).join("")}` : ""}`;
}
function masterArt() {
  return `<div class="constellation" aria-hidden="true"><div class="orbit"></div><div class="orbit two"></div><div class="line a"></div><div class="line b"></div><div class="line c"></div><div class="line d"></div><div class="node a"></div><div class="node b"></div><div class="node c"></div><div class="node d"></div><div class="core">L</div></div>`;
}
function coordinationPanel() {
  const coordination = data.coordination;
  if (!coordination) return "";
  const pending = coordination.pending;
  const names = [...new Set([...pending.reports, ...pending.agentRuns].map((item) => item.agentName))];
  const summary = coordination.status === "updating" ? "Master führt neue Ergebnisse gerade zusammen."
    : coordination.status === "failed" ? "Die letzte Zusammenführung ist fehlgeschlagen. Starte den Master erneut."
      : coordination.pendingCount && !data.config.agents[0].enabled ? "Neue Ergebnisse warten. Aktiviere den Master für die Zusammenführung."
        : coordination.pendingCount && !data.config.settings.autoSynthesize ? "Neue Ergebnisse warten. Starte den Master manuell oder aktiviere die Automatik."
          : coordination.pendingCount ? "Neue Ergebnisse warten auf die automatische Zusammenführung."
        : "Alle erfassten Agenten- und Auftragsergebnisse sind im letzten Masterlauf berücksichtigt.";
  return `<section class="panel sync-panel"><div class="panel-title"><h3>Master-Abgleich</h3>${status(coordination.status)}</div><p class="body-copy">${summary}</p><div class="chip-row"><span class="chip">${pending.reports.length} neue Berichte</span><span class="chip">${pending.agentRuns.length} neue Laufstatus</span><span class="chip">${pending.outcomes.length} Auftragsergebnisse</span><span class="chip">Letzter Abgleich: ${dateText(coordination.lastSyncedAt)}</span></div>${names.length ? `<p class="meta">Offene Agenten: ${esc(names.join(", "))}</p>` : ""}</section>`;
}
function overview() {
  const master = reportFor("master");
  const running = data.runs.filter((run) => ["queued", "running"].includes(run.status)).length;
  const active = availableAgents().length;
  const queued = openProposals().length;
  const finished = data.runs.filter((run) => run.status === "completed").length;
  const top = data.proposals.filter((proposal) => proposal.status === "proposed" || proposal.status === "approved").slice(0, 3);
  const specialistReports = data.config.agents.filter((agent) => agent.kind === "specialist").map((agent) => ({ agent, report: data.reports[agent.id] }));
  const activeRun = data.runs.find((run) => run.status === "running");
  return pageHead("MISSION CONTROL", "Dein Überblick für LIEUVA", "Signale der Agenten, Entscheidungen für heute und der Zustand aller Läufe an einem Ort.") +
    `<div class="grid stats"><div class="stat"><div class="stat-label">Aktive Agenten</div><div class="stat-value">${active}</div><div class="stat-detail">inklusive Master</div></div><div class="stat"><div class="stat-label">Zur Entscheidung</div><div class="stat-value">${queued}</div><div class="stat-detail">Vorschläge prüfen</div></div><div class="stat"><div class="stat-label">Laufende Jobs</div><div class="stat-value">${running}</div><div class="stat-detail">seriell verarbeitet</div></div><div class="stat"><div class="stat-label">Abgeschlossene Läufe</div><div class="stat-value">${finished}</div><div class="stat-detail">lokal protokolliert</div></div></div>` +
    `<section class="master-card"><div class="master-copy"><div class="master-kicker">✦ MASTER · CHIEF OF STAFF</div><h2>${esc(master?.headline || "Ein klarer Tagesplan aus allen wichtigen Signalen.")}</h2><p>${esc(master?.summary || "Starte den ersten Tageslauf. Die Spezialisten recherchieren in ihrem Rhythmus, danach fasst der Master die Ergebnisse zu prüfbaren Vorschlägen zusammen.")}</p><div class="master-actions">${button("✦ Tagesbriefing starten", "daily", 'data-full="false"', "btn primary")}${button("Alle Spezialisten neu prüfen", "daily", 'data-full="true"', "btn ghost")}</div></div>${masterArt()}</section>` +
    `<div class="monitor-grid">${activeRun ? `<section class="panel monitor-panel"><div class="panel-title"><h3>Aktiver Auftrag</h3>${status(activeRun.progress?.signal === "quiet" ? "quiet" : "running")}</div><strong>${esc(activeRun.agentName)}</strong><p class="body-copy">${esc(activityText(activeRun))}</p><div class="button-row">${button("Lauf ansehen", "view-run", `data-id="${esc(activeRun.id)}"`, "btn ghost small")}${button("Abbrechen", "cancel-run", `data-id="${esc(activeRun.id)}"`, "btn danger small")}</div></section>` : ""}${coordinationPanel()}</div>` +
    `<div class="two-columns"><section>${sectionHead("Entscheidungen", `<span>${queued} offen</span>`)}${top.length ? top.map((proposal) => `<div class="proposal-card"><div class="proposal-top"><span class="priority ${esc(proposal.priority)}">${esc(labels[proposal.priority])}</span>${status(proposal.status)}</div><h3>${esc(proposal.title)}</h3><p>${esc(proposal.rationale)}</p>${button("Prüfen →", "open-proposal", `data-id="${esc(proposal.id)}"`, "btn subtle")}</div>`).join("") : `<div class="empty">Noch keine Vorschläge. Der Master erzeugt sie nach einem Tageslauf.</div>`}</section><section>${sectionHead("Spezialistenberichte", `<span>${specialistReports.filter((item) => item.report).length} von ${specialistReports.length} vorhanden</span>`)}<div class="panel">${specialistReports.map(({ agent, report }) => `<div class="finding"><strong>${esc(agent.name)}</strong><p>${esc(report?.report.headline || "Noch kein Bericht")}</p><small>${report ? dateText(report.finishedAt) : esc(labels[agent.cadence])}</small></div>`).join("")}</div></section></div>`;
}
function agentCard(agent) {
  const run = latestRun(agent.id);
  const report = reportFor(agent.id);
  return `<article class="agent-card ${agent.enabled ? "" : "disabled"}"><div class="agent-top"><div class="agent-icon ${esc(agent.id)}">${esc(symbols[agent.id] || "◇")}</div>${status(run?.progress?.signal === "quiet" ? "quiet" : run?.status || (agent.enabled ? "ready" : "disabled"))}</div><div><h3>${esc(agent.name)}</h3><p>${esc(agent.tagline)}</p></div><div class="chip-row"><span class="chip accent">${esc(agent.model)} · ${esc(agent.effort)}</span><span class="chip">${esc(labels[agent.cadence])}</span><span class="chip">Web: ${esc(agent.webSearch)}</span></div><div class="last">${run && ["running", "queued"].includes(run.status) ? esc(activityText(run)) : report ? `Letzter Bericht: ${dateText(data.reports[agent.id].finishedAt)} · ${esc(report.headline)}` : "Noch kein Bericht"}</div><div class="card-actions">${button("Starten", "run-agent", `data-id="${esc(agent.id)}" ${agent.enabled ? "" : "disabled"}`, "btn primary small")}${button("Einstellen", "edit-agent", `data-id="${esc(agent.id)}"`, "btn ghost small")}</div></article>`;
}
function option(value, current, title) { return `<option value="${esc(value)}" ${value === current ? "selected" : ""}>${esc(title)}</option>`; }
function agentEditor() {
  if (!ui.agentId) return "";
  const isNew = ui.agentId === "new";
  const agent = isNew ? { id: "", kind: "specialist", name: "", tagline: "", enabled: true, cadence: "manual", model: "gpt-6-luna", effort: "low", webSearch: "live", prompt: "" } : data.config.agents.find((item) => item.id === ui.agentId);
  if (!agent) return "";
  return `<section class="panel editor" id="agent-editor"><div class="panel-title"><div><div class="eyebrow">PROFIL</div><h2>${isNew ? "Neuen Spezialisten anlegen" : esc(agent.name)}</h2></div>${button("Schließen ×", "close-agent", "", "btn ghost small")}</div><p class="editor-desc">Änderungen gelten für künftige Läufe. Laufende Agenten verwenden ihren gestarteten Auftrag.</p><form id="agentForm"><div class="form-row"><div class="field"><label for="agentName">Name</label><input id="agentName" name="name" maxlength="80" required value="${esc(agent.name)}"></div><div class="field"><label for="agentTagline">Kurzbeschreibung</label><input id="agentTagline" name="tagline" maxlength="180" required value="${esc(agent.tagline)}"></div></div><div class="form-row"><div class="field"><label for="agentModel">Modell</label><select id="agentModel" name="model">${["gpt-6-luna", "gpt-6-sol", "gpt-6-astra"].map((model) => option(model, agent.model, model)).join("")}</select></div><div class="field"><label for="agentEffort">Reasoning</label><select id="agentEffort" name="effort">${["low", "medium", "high", "xhigh", "max"].map((effort) => option(effort, agent.effort, effort)).join("")}</select></div></div><div class="form-row"><div class="field"><label for="agentCadence">Rhythmus</label><select id="agentCadence" name="cadence" ${agent.kind === "master" ? "disabled" : ""}>${["daily", "weekly", "manual"].map((cadence) => option(cadence, agent.cadence, labels[cadence])).join("")}</select></div><div class="field"><label for="agentWeb">Websuche</label><select id="agentWeb" name="webSearch">${["live", "cached", "disabled"].map((mode) => option(mode, agent.webSearch, mode)).join("")}</select></div></div><label class="checkline"><input type="checkbox" name="enabled" ${agent.enabled ? "checked" : ""}> Agent aktiv</label><div class="field"><label for="agentPrompt">Auftrag und Regeln</label><textarea id="agentPrompt" name="prompt" maxlength="6000" required>${esc(agent.prompt)}</textarea><small>Der Agent liest zusätzlich die einschlägigen AGENTS.md-Dateien im Projekt.</small></div><div class="editor-actions"><div>${agent.kind === "specialist" && !isNew ? button("Agent entfernen", "delete-agent", `data-id="${esc(agent.id)}"`, "btn danger small") : ""}</div><button type="submit" class="btn primary">Profil speichern</button></div></form></section>`;
}
function agentsView() {
  return pageHead("TEAM", "Deine Agenten", "Jeder Agent hat einen Auftrag, ein Modell und einen eigenen Rhythmus. Alles lässt sich hier anpassen.", button("+ Spezialist", "new-agent", "", "btn primary")) + `<div class="grid agents-grid">${data.config.agents.map(agentCard).join("")}</div>${agentEditor()}`;
}
function proposalCard(proposal) {
  const action = proposal.status === "approved" && proposal.executionMode !== "manual"
    ? button("Ausführen", "execute-proposal", `data-id="${esc(proposal.id)}"`, "btn primary small") : "";
  return `<article class="proposal-card"><div class="proposal-top"><span class="priority ${esc(proposal.priority)}">${esc(labels[proposal.priority])}</span>${status(proposal.status)}</div><h3>${esc(proposal.title)}</h3><p>${esc(proposal.rationale)}</p><div class="chip-row"><span class="chip">${esc(labels[proposal.effort])}er Aufwand</span><span class="chip">${esc(labels[proposal.executionMode] || labels.manualMode)}</span><span class="chip">Sicherheit: ${esc(proposal.confidence)}</span></div><div class="proposal-actions">${button("Prüfen & anpassen", "open-proposal", `data-id="${esc(proposal.id)}"`, "btn ghost small")}${action}<span class="meta">${dateText(proposal.createdAt)}</span></div></article>`;
}
function proposalsView() {
  const groups = ["open", "approved", "deferred", "done", "rejected"];
  const groupLabel = { open: "Offen", approved: "Freigegeben", deferred: "Später", done: "Erledigt", rejected: "Verworfen" };
  const filter = ui.proposalFilter;
  const matches = data.proposals.filter((item) => filter === "open" ? item.status === "proposed" : item.status === filter);
  return pageHead("DECISION DESK", "Vorschläge prüfen", "Passe Aufgaben an und gib sie frei. Lokale Codearbeit läuft anschließend in einem eigenen Worktree.") + `<div class="tabs">${groups.map((group) => `<button type="button" class="tab ${filter === group ? "active" : ""}" data-action="proposal-filter" data-filter="${group}">${groupLabel[group]} · ${data.proposals.filter((item) => group === "open" ? item.status === "proposed" : item.status === group).length}</button>`).join("")}</div>${matches.length ? matches.map(proposalCard).join("") : `<div class="empty">In diesem Bereich gibt es noch keine Vorschläge.</div>`}`;
}
function worktreeBlock(run) {
  if (!run.worktreePath) return "";
  return `<div class="worktree-box"><strong>Änderungen im separaten Worktree</strong><code>${esc(run.worktreePath)}</code><div class="button-row">${button("Pfad kopieren", "copy-worktree", `data-id="${esc(run.id)}"`, "btn ghost small")}</div><p class="meta">In GitHub Desktop den Worktree wählen oder den Pfad als lokales Repository öffnen. Vor dem Commit prüfen, ob ein Branch angelegt werden muss; Codex-Worktrees starten oft mit detached HEAD. Der Haupt-Checkout übernimmt diese Änderungen nicht automatisch.</p></div>`;
}
function runDetail() {
  const run = data.runs.find((item) => item.id === ui.runId);
  if (!run) return "";
  const progress = run.progress;
  const warning = run.status === "running" && progress?.signal === "quiet"
    ? `<p class="note activity-warning">Der Codex-Prozess ist noch aktiv, hat aber seit ${durationText(progress.quietMs)} keinen neuen Arbeitsschritt gemeldet. Prüfe das vollständige Log oder brich den Lauf ab, wenn er nicht weiterkommt.</p>`
    : "";
  return `<section class="panel details run-details"><div class="panel-title"><h3>${esc(run.agentName)}</h3>${status(run.status)}</div><p class="body-copy">${esc(run.message)}</p><p class="activity-line">${esc(activityText(run))}</p>${warning}<div class="chip-row"><span class="chip">${esc(run.model)} · ${esc(run.effort)}</span><span class="chip">Start: ${dateText(run.startedAt)}</span><span class="chip">Letzte Aktivität: ${dateText(run.lastActivityAt || run.finishedAt || run.startedAt)}</span><span class="chip">Ende: ${dateText(run.finishedAt)}</span>${run.usage ? `<span class="chip">Tokens: ${esc(run.usage.input_tokens ?? "?")} in / ${esc(run.usage.output_tokens ?? "?")} out</span>` : ""}</div>${run.currentStep ? `<p class="meta">Aktueller Schritt: ${esc(run.currentStep)}</p>` : ""}${worktreeBlock(run)}<div class="subtle-divider"></div>${run.report ? reportBlock(run.report, "") : run.finalText ? `<pre class="log">${esc(run.finalText)}</pre>` : ""}<div class="section-heading log-heading"><h2>Protokoll</h2><div class="button-row"><a class="btn ghost small" href="/api/runs/${encodeURIComponent(run.id)}/log" target="_blank" rel="noopener noreferrer">Ganzes Log ↗</a>${["queued", "running"].includes(run.status) ? button("Abbrechen", "cancel-run", `data-id="${esc(run.id)}"`, "btn danger small") : ""}</div></div><pre class="log" data-run-log>${esc((run.events || []).join("\n"))}</pre>${run.threadId ? `<p class="meta">Codex-Task-ID: ${esc(run.threadId)}</p>` : ""}</section>`;
}
function runsView() {
  return pageHead("ACTIVITY", "Alle Läufe", "Laufzeit, letzte Ausgabe, Prozessstatus und Ergebnis jedes Agentenlaufs.") + (data.runs.length ? `<div class="run-list">${data.runs.map((run) => `<div class="run-row"><div><strong>${esc(run.agentName)}</strong><p>${dateText(run.createdAt)} · ${esc(run.reason)} · ${esc(run.message)}</p><p class="run-activity">${esc(activityText(run))}</p></div><div class="right">${status(run.progress?.signal === "quiet" ? "quiet" : run.status)}${button("Details", "view-run", `data-id="${esc(run.id)}"`, "btn ghost small")}</div></div>`).join("")}</div>${runDetail()}` : `<div class="empty">Noch keine Läufe. Starte einen Agenten oder den Tageslauf.</div>`);
}
function settingsView() {
  const s = data.config.settings;
  return pageHead("SETUP", "Einstellungen", "Steuere den Tageslauf. Die Uhr gilt in der eingestellten Zeitzone, während der lokale Server läuft.") + `<div class="settings-grid"><section class="panel"><div class="panel-title"><h3>Tagesbriefing</h3></div><form id="settingsForm"><label class="checkline"><input type="checkbox" name="autoDaily" ${s.autoDaily ? "checked" : ""}> Automatisch täglich starten</label><label class="checkline"><input type="checkbox" name="autoSynthesize" ${s.autoSynthesize ? "checked" : ""}> Master nach neuen Ergebnissen automatisch aktualisieren</label><div class="field"><label for="quietWarningMinutes">Hinweis nach Minuten ohne Ausgabe</label><input type="number" id="quietWarningMinutes" name="quietWarningMinutes" min="1" max="60" required value="${esc(s.quietWarningMinutes)}"><small>Ein stiller Prozess kann weiterarbeiten. Der Hinweis bricht ihn nicht automatisch ab.</small></div><div class="field"><label for="dailyTime">Uhrzeit</label><input type="time" id="dailyTime" name="dailyTime" required value="${esc(s.dailyTime)}"></div><div class="field"><label for="timeZone">Zeitzone</label><input id="timeZone" name="timeZone" required value="${esc(s.timeZone)}"><small>IANA-Zeitzone, z. B. Europe/Amsterdam.</small></div><p class="note">Nach dem Start holt der Server den heutigen Lauf nach, wenn die Uhrzeit bereits vorbei ist. Wochenagenten laufen nur, wenn ihr letzter Bericht mindestens sieben Tage alt ist.</p><button type="submit" class="btn primary">Zeitplan speichern</button></form></section><section class="panel"><div class="panel-title"><h3>Lokale Ausführung</h3></div><div class="finding"><strong>Codex CLI</strong><p>${esc(data.server.codexBin)}</p></div><div class="finding"><strong>Arbeitsweise</strong><p>Recherche läuft lesend. Freigegebene Codearbeit startet in einem eigenen Codex-Worktree. Protokolle und Berichte liegen unter artifacts/agent-console/.</p></div><div class="finding"><strong>Aktiver Lauf</strong><p>${data.server.activeRunId ? esc(data.runs.find((run) => run.id === data.server.activeRunId)?.agentName || "Läuft") : "Keiner"} · ${data.server.queueLength} in der Warteschlange</p></div><div class="finding"><strong>Letztes Tagesbriefing</strong><p>${dateText(data.daily.lastCompletedAt)}</p></div></section></div>`;
}
function draw() {
  if (!data) return;
  document.getElementById("viewLabel").textContent = labels[ui.view];
  document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === ui.view));
  const previousLog = app.querySelector("[data-run-log]");
  const followLog = !previousLog || previousLog.scrollTop + previousLog.clientHeight >= previousLog.scrollHeight - 20;
  const previousScroll = previousLog?.scrollTop ?? 0;
  app.innerHTML = ({ overview, agents: agentsView, proposals: proposalsView, runs: runsView, settings: settingsView })[ui.view]();
  const nextLog = app.querySelector("[data-run-log]");
  if (nextLog) nextLog.scrollTop = followLog ? nextLog.scrollHeight : previousScroll;
  if (ui.agentId && ui.view === "agents") document.getElementById("agent-editor")?.scrollIntoView({ block: "nearest" });
}
function offline() {
  app.innerHTML = `<div class="page-head"><div><div class="eyebrow">OFFLINE PREVIEW</div><h1>Die Agentenzentrale ist bereit.</h1><p>Diese HTML-Datei zeigt die lokale Oberfläche. Zum Starten der Agenten wird der lokale Node-Server benötigt.</p></div></div><section class="master-card"><div class="master-copy"><div class="master-kicker">✦ MASTER · CHIEF OF STAFF</div><h2>Ein Tagesplan aus Spezialistenberichten.</h2><p>Öffne im Projektordner <strong>agent-console/start.command</strong> per Doppelklick oder führe <strong>npm run agents:dashboard</strong> aus. Danach steht die interaktive Oberfläche unter <a href="${rootUrl}/">${rootUrl}/</a> bereit.</p></div>${masterArt()}</section><div class="grid agents-grid">${["Qualität & Risiken", "UX & Nutzungsforschung", "Produktstrategie", "Markt & Wettbewerb", "SEO, GEO & Wachstum", "3D & Blender R&D"].map((name) => `<div class="agent-card"><div class="agent-icon">◇</div><h3>${name}</h3><div class="chip-row"><span class="chip accent">gpt-6-luna · low</span></div></div>`).join("")}</div>`;
}
function proposalModal(proposal) {
  if (!proposal) return;
  ui.proposalId = proposal.id;
  ui.dirty = false;
  if (["done", "executing"].includes(proposal.status)) {
    overlay.innerHTML = `<div class="overlay"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="proposalTitle"><div class="modal-head"><div><div class="eyebrow">VORSCHLAG · ${esc(labels[proposal.status])}</div><h2 id="proposalTitle">${esc(proposal.title)}</h2></div>${button("×", "close-modal", 'aria-label="Schließen"', "btn icon ghost")}</div><p class="body-copy">${esc(proposal.action)}</p><p class="note">${proposal.status === "executing" ? "Der Auftrag läuft. Fortschritt und Ergebnis findest du unter Läufe." : "Dieser Auftrag wurde bereits ausgeführt. Das Ergebnis findest du unter Läufe."}</p></section></div>`;
    overlay.querySelector("button")?.focus();
    return;
  }
  overlay.innerHTML = `<div class="overlay"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="proposalTitle"><div class="modal-head"><div><div class="eyebrow">VORSCHLAG · ${esc(labels[proposal.status])}</div><h2 id="proposalTitle">Prüfen und anpassen</h2></div>${button("×", "close-modal", "aria-label=" + '"Schließen"', "btn icon ghost")}</div><form id="proposalForm"><div class="field"><label for="proposalName">Titel</label><input id="proposalName" name="title" required value="${esc(proposal.title)}"></div><div class="field"><label for="proposalRationale">Warum?</label><textarea id="proposalRationale" name="rationale" required>${esc(proposal.rationale)}</textarea></div><div class="field"><label for="proposalAction">Konkreter Auftrag</label><textarea id="proposalAction" name="action" required>${esc(proposal.action)}</textarea></div><div class="form-row"><div class="field"><label for="proposalPriority">Priorität</label><select id="proposalPriority" name="priority">${["today", "soon", "watch"].map((item) => option(item, proposal.priority, labels[item])).join("")}</select></div><div class="field"><label for="proposalMode">Ausführung</label><select id="proposalMode" name="executionMode">${["research", "local-code", "manual"].map((item) => option(item, proposal.executionMode, labels[item] || labels.manualMode)).join("")}</select></div></div><div class="form-row"><div class="field"><label for="proposalEffort">Aufwand</label><select id="proposalEffort" name="effort">${["small", "medium", "large"].map((item) => option(item, proposal.effort, labels[item])).join("")}</select></div><div class="field"><label for="proposalConfidence">Sicherheit</label><select id="proposalConfidence" name="confidence">${["high", "medium", "low"].map((item) => option(item, proposal.confidence, item)).join("")}</select></div></div><p class="note">Quelle: ${evidence(proposal.evidence)}. Freigabe startet noch keinen Lauf. Du kannst den Auftrag danach ausdrücklich ausführen.</p><div class="subtle-divider"></div><div class="modal-actions">${button("Verwerfen", "proposal-reject", "", "btn danger small")}${button("Später", "proposal-defer", "", "btn ghost small")}${button("Speichern", "proposal-save", "", "btn ghost small")}${button("Freigeben", "proposal-approve", "", "btn primary small")}</div></form></section></div>`;
  overlay.querySelector("input")?.focus();
}
function closeModal() { overlay.innerHTML = ""; ui.proposalId = null; ui.dirty = false; }
function slug(value) { return value.toLocaleLowerCase("de-DE").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "agent"; }

async function saveAgent() {
  const form = document.getElementById("agentForm");
  const values = new FormData(form);
  const next = structuredClone(data.config);
  const isNew = ui.agentId === "new";
  let agent = isNew ? { id: "", kind: "specialist" } : next.agents.find((item) => item.id === ui.agentId);
  if (!agent) throw new Error("Agent fehlt.");
  Object.assign(agent, {
    name: String(values.get("name") || ""), tagline: String(values.get("tagline") || ""),
    enabled: values.has("enabled"), cadence: agent.kind === "master" ? "daily" : String(values.get("cadence")),
    model: String(values.get("model")), effort: String(values.get("effort")), webSearch: String(values.get("webSearch")),
    prompt: String(values.get("prompt") || ""),
  });
  if (isNew) {
    const base = slug(agent.name);
    let id = base;
    let suffix = 2;
    while (next.agents.some((item) => item.id === id)) id = `${base}-${suffix++}`;
    agent.id = id;
    next.agents.push(agent);
    ui.agentId = id;
  }
  await api("PUT", "/api/config", next);
  ui.dirty = false;
  await refresh();
  notify("Agentenprofil gespeichert.");
}
async function saveSettings() {
  const values = new FormData(document.getElementById("settingsForm"));
  const next = structuredClone(data.config);
  next.settings = { autoDaily: values.has("autoDaily"), autoSynthesize: values.has("autoSynthesize"), quietWarningMinutes: Number(values.get("quietWarningMinutes")), dailyTime: String(values.get("dailyTime")), timeZone: String(values.get("timeZone")) };
  await api("PUT", "/api/config", next);
  ui.dirty = false;
  await refresh();
  notify("Zeitplan gespeichert.");
}
async function saveProposal(newStatus) {
  const proposal = data.proposals.find((item) => item.id === ui.proposalId);
  if (!proposal) return;
  const values = new FormData(document.getElementById("proposalForm"));
  const patch = { title: String(values.get("title")), rationale: String(values.get("rationale")), action: String(values.get("action")), priority: String(values.get("priority")), effort: String(values.get("effort")), confidence: String(values.get("confidence")), executionMode: String(values.get("executionMode")), status: newStatus || proposal.status };
  await api("PATCH", `/api/proposals/${proposal.id}`, patch);
  closeModal();
  await refresh();
  notify(newStatus === "approved" ? "Vorschlag freigegeben. Ausführung wartet auf deinen Klick." : "Vorschlag gespeichert.");
}

document.addEventListener("input", (event) => { if (event.target.closest("#agentForm,#settingsForm,#proposalForm")) ui.dirty = true; });
document.addEventListener("submit", async (event) => {
  if (!["agentForm", "settingsForm"].includes(event.target.id)) return;
  event.preventDefault();
  try { if (event.target.id === "agentForm") await saveAgent(); else await saveSettings(); }
  catch (error) { notify(error.message, true); }
});
document.addEventListener("click", async (event) => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    ui.view = viewButton.dataset.view;
    ui.agentId = null;
    ui.dirty = false;
    draw();
    return;
  }
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  const id = target.dataset.id;
  try {
    if (action === "daily") { await api("POST", "/api/daily/run", { full: target.dataset.full === "true" }); notify("Tageslauf gestartet."); await refresh(); }
    if (action === "run-agent") { await api("POST", `/api/agents/${id}/run`, {}); notify("Agent ist in der Warteschlange."); await refresh(); }
    if (action === "edit-agent") { ui.agentId = id; ui.view = "agents"; ui.dirty = false; draw(); }
    if (action === "new-agent") { ui.agentId = "new"; ui.dirty = false; draw(); }
    if (action === "close-agent") { ui.agentId = null; ui.dirty = false; draw(); }
    if (action === "delete-agent") {
      if (!window.confirm("Dieses Agentenprofil aus der Konfiguration entfernen? Vorhandene Berichte bleiben erhalten.")) return;
      const next = structuredClone(data.config);
      next.agents = next.agents.filter((item) => item.id !== id);
      await api("PUT", "/api/config", next);
      ui.agentId = null; ui.dirty = false; await refresh(); notify("Agent entfernt.");
    }
    if (action === "proposal-filter") { ui.proposalFilter = target.dataset.filter; draw(); }
    if (action === "open-proposal") proposalModal(data.proposals.find((item) => item.id === id));
    if (action === "close-modal") closeModal();
    if (action === "proposal-save") await saveProposal();
    if (action === "proposal-approve") await saveProposal("approved");
    if (action === "proposal-defer") await saveProposal("deferred");
    if (action === "proposal-reject") await saveProposal("rejected");
    if (action === "execute-proposal") {
      const proposal = data.proposals.find((item) => item.id === id);
      if (proposal?.executionMode === "local-code" && !window.confirm(`Lokale Codearbeit starten?\n\n${proposal.title}\n\nDer Agent arbeitet in einem eigenen Worktree.`)) return;
      await api("POST", `/api/proposals/${id}/execute`, {});
      notify("Freigegebener Auftrag gestartet.");
      ui.view = "runs"; await refresh();
    }
    if (action === "view-run") { ui.runId = id; ui.view = "runs"; draw(); document.querySelector(".details")?.scrollIntoView({ block: "start", behavior: "smooth" }); }
    if (action === "copy-worktree") {
      const path = data.runs.find((run) => run.id === id)?.worktreePath;
      if (!path) throw new Error("Worktree-Pfad fehlt noch.");
      await navigator.clipboard.writeText(path);
      notify("Worktree-Pfad kopiert.");
    }
    if (action === "cancel-run") { await api("POST", `/api/runs/${id}/cancel`, {}); notify("Abbruch angefordert."); await refresh(); }
  } catch (error) { notify(error.message, true); }
});
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && ui.proposalId) closeModal(); });

if (location.protocol === "file:") {
  fetch(`${rootUrl}/`, { mode: "no-cors" }).then(() => location.replace(`${rootUrl}/`)).catch(offline);
} else {
  refresh();
  setInterval(() => refresh(), 3000);
}
