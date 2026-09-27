const app = document.getElementById("app");
const overlay = document.getElementById("overlay");
const toast = document.getElementById("toast");
const rootUrl = "http://127.0.0.1:43821";
const labels = {
  overview: "Übersicht", agents: "Agenten", proposals: "Vorschläge", runs: "Läufe", network: "Zusammenspiel", settings: "Einstellungen",
  ready: "Bereit", disabled: "Inaktiv", queued: "Wartet", running: "Läuft", completed: "Fertig", failed: "Fehler", cancelled: "Abgebrochen", interrupted: "Unterbrochen",
  current: "Aktuell", updating: "Wird aktualisiert", pending: "Ausstehend", quiet: "Lange ohne Ausgabe",
  proposed: "Zur Prüfung", approved: "Freigegeben", deferred: "Zurückgestellt", rejected: "Verworfen", executing: "In Arbeit", done: "Erledigt",
  daily: "Täglich", weekly: "Wöchentlich", manual: "Manuell",
  today: "Heute", soon: "Demnächst", watch: "Beobachten",
  small: "Klein", medium: "Mittel", large: "Groß", high: "Hoch", low: "Niedrig",
  research: "Recherche", "local-code": "Lokale Codearbeit", manualMode: "Manuell",
};
const symbols = { master: "✦", quality: "◇", ux: "◎", product: "◈", market: "◌", growth: "↗", "three-d": "⬡" };
const ui = { view: "overview", agentId: null, runId: null, proposalId: null, proposalFilter: "all", networkId: null, networkDay: null, networkPlaying: false, networkEnded: false, networkSpeed: 1, networkMotion: true, networkFrozen: null, dirty: false };
let data = null;
let toastTimer;
let networkTimer;
const i18n = window.LIEUVA_I18N;
function locale() { return i18n.language === "en" ? "en-US" : "de-DE"; }
function tr(value) { return i18n.text(value); }
function savePreference(key, value) { try { localStorage.setItem(key, value); } catch { /* Storage may be unavailable. */ } }
function savedTheme() { try { return localStorage.getItem("lieuva-console-theme") === "clear" ? "clear" : "orbit"; } catch { return "orbit"; } }
function setTheme(theme) {
  const next = theme === "clear" ? "clear" : "orbit";
  document.documentElement.dataset.theme = next;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next === "clear" ? "#f6f7f4" : "#090f1c");
  document.getElementById("themeSelect").value = next;
  savePreference("lieuva-console-theme", next);
}
setTheme(savedTheme());
document.getElementById("languageSelect").value = i18n.language;

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
function dateText(value) {
  if (!value) return tr("Noch nie");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return tr("Unbekannt");
  return new Intl.DateTimeFormat(locale(), { dateStyle: "medium", timeStyle: "short", timeZone: data?.config.settings.timeZone || "Europe/Amsterdam" }).format(date);
}
function durationText(milliseconds) {
  const minutes = Math.floor(Math.max(0, milliseconds || 0) / 60_000);
  if (minutes < 1) return i18n.language === "en" ? "under 1 min" : "unter 1 Min.";
  if (minutes < 60) return i18n.language === "en" ? `${minutes} min` : `${minutes} Min.`;
  return i18n.language === "en" ? `${Math.floor(minutes / 60)} hr ${minutes % 60} min` : `${Math.floor(minutes / 60)} Std. ${minutes % 60} Min.`;
}
function activityText(run) {
  const progress = run.progress;
  if (run.status === "queued") return i18n.language === "en" ? `Queue · position ${progress?.queuePosition || "?"}` : `Warteschlange · Position ${progress?.queuePosition || "?"}`;
  if (run.status !== "running") return run.finishedAt ? `${tr("Beendet:")} ${dateText(run.finishedAt)}` : "";
  const runtime = i18n.language === "en" ? `Running for ${durationText(progress?.elapsedMs)}` : `Läuft seit ${durationText(progress?.elapsedMs)}`;
  const silence = i18n.language === "en" ? `last step ${durationText(progress?.quietMs)} ago` : `letzter Arbeitsschritt vor ${durationText(progress?.quietMs)}`;
  if (progress?.signal === "quiet") return `${runtime} · ${silence} · ${tr("Prozess aktiv, bitte prüfen")}`;
  if (progress?.signal === "unknown") return `${runtime} · ${silence} · ${tr("Prozessstatus unklar")}`;
  return `${runtime} · ${silence} · ${tr("Codex-Prozess aktiv")}`;
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
function dailyFocus() { return (data?.daily.focusIds || []).map((id) => data.proposals.find((proposal) => proposal.id === id)).filter(Boolean); }
function completedToday() { return data?.proposals.filter((proposal) => (data.daily.completedTodayIds || []).includes(proposal.id)) || []; }
function proposalLink(proposal, label = "Aufgabe öffnen →") {
  return `<a class="btn ghost small" href="#proposal/${esc(proposal.id)}" data-proposal-link="${esc(proposal.id)}">${esc(label)}</a>`;
}
function proposalForRecommendation(item) {
  return data.proposals.find((proposal) => proposal.id === item.proposalId)
    || data.proposals.find((proposal) => proposal.title.toLocaleLowerCase("de-DE").trim() === item.title.toLocaleLowerCase("de-DE").trim());
}
function button(text, action, extra = "", className = "btn") { return `<button type="button" class="${className}" data-action="${action}" ${extra}>${text}</button>`; }
function notify(message, error = false) {
  toast.textContent = tr(message);
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
    const previousNetwork = JSON.stringify(data?.networkTimeline || []);
    const previousTimeZone = data?.config.settings.timeZone;
    data = await api("GET", "/api/state");
    if (previousTimeZone && previousTimeZone !== data.config.settings.timeZone) {
      stopNetworkPlayback();
      ui.networkFrozen = null; ui.networkDay = null; ui.networkId = null; ui.networkEnded = false;
    }
    document.getElementById("connectionLabel").textContent = tr("Lokal verbunden");
    document.getElementById("navProposalCount").textContent = openProposals().length;
    document.getElementById("todayLabel").textContent = new Intl.DateTimeFormat(locale(), { dateStyle: "full", timeZone: data.config.settings.timeZone }).format(new Date());
    const keepNetworkFrame = ui.view === "network" && app.querySelector(".network-experience") && previousTimeZone === data.config.settings.timeZone && (ui.networkPlaying || previousNetwork === JSON.stringify(data.networkTimeline || []));
    if (render && !ui.dirty && !keepNetworkFrame) draw();
    const routeId = location.hash.match(/^#proposal\/([a-f0-9-]+)$/)?.[1];
    if (routeId && ui.proposalId !== routeId && data.proposals.some((proposal) => proposal.id === routeId)) showProposal(routeId, false);
  } catch (error) {
    document.getElementById("connectionLabel").textContent = tr("Server nicht erreichbar");
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
function reportBlock(report, emptyText, master = false) {
  if (!report) return `<div class="empty">${esc(emptyText)}</div>`;
  const recommendations = report.proposals.map((item) => {
    const proposal = master ? proposalForRecommendation(item) : null;
    return `<div class="finding"><strong>${esc(item.title)} · ${esc(labels[item.priority])}</strong><p>${esc(item.action)}</p><small>${evidence(item.evidence)}</small>${proposal ? `<div class="finding-action">${proposalLink(proposal)}</div>` : ""}</div>`;
  }).join("");
  return `<h3 class="report-headline">${esc(report.headline)}</h3><p class="body-copy">${esc(report.summary)}</p>${report.findings.length ? `<div class="subtle-divider"></div>${report.findings.map(finding).join("")}` : ""}${report.proposals.length ? `<div class="subtle-divider"></div>${sectionHead("Empfehlungen")}${recommendations}` : ""}${report.watchlist.length ? `<div class="subtle-divider"></div>${sectionHead("Beobachten")}${report.watchlist.map((item) => `<p class="body-copy">${esc(item)}</p>`).join("")}` : ""}`;
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
  return `<section class="panel sync-panel"><div class="panel-title"><h3>Master-Abgleich</h3>${status(coordination.status)}</div><p class="body-copy">${summary}</p><div class="chip-row"><span class="chip">${pending.reports.length} neue Berichte</span><span class="chip">${pending.agentRuns.length} neue Laufstatus</span><span class="chip">${pending.outcomes.length} Auftragsergebnisse</span><span class="chip">${(pending.decisions || []).length} Entscheidungen</span><span class="chip">Letzter Abgleich: ${dateText(coordination.lastSyncedAt)}</span></div>${names.length ? `<p class="meta">Offene Agenten: ${esc(names.join(", "))}</p>` : ""}<div class="button-row sync-actions">${coordination.masterRunId ? button("Masterbericht ansehen", "view-run", `data-id="${esc(coordination.masterRunId)}"`, "btn ghost small") : ""}${coordination.status === "failed" ? button("Master erneut starten", "run-agent", 'data-id="master"', "btn ghost small") : ""}</div></section>`;
}
function overview() {
  const master = reportFor("master");
  const agents = data.config.agents;
  const enabled = agents.filter((agent) => agent.enabled).length;
  const pending = data.proposals.filter((proposal) => proposal.status === "proposed");
  const running = data.runs.filter((run) => run.status === "running");
  const waiting = data.runs.filter((run) => run.status === "queued");
  const focus = dailyFocus();
  const completeIds = new Set(data.daily.completedTodayIds || []);
  const completed = completedToday();
  const otherOpen = openProposals().filter((proposal) => !new Set(focus.map((item) => item.id)).has(proposal.id));
  const nextAction = pending.length ? `${pending.length} Vorschläge prüfen` : running.length ? "Aktiven Lauf ansehen" : "Tagesbriefing starten";
  const nextButton = pending.length ? button("Jetzt prüfen →", "view-proposals", "", "btn primary") : running.length ? button("Lauf ansehen →", "view-run", `data-id="${esc(running[0].id)}"`, "btn primary") : button("Briefing starten →", "daily", 'data-full="false"', "btn primary");
  const roster = agents.map((agent) => {
    const run = latestRun(agent.id);
    const state = !agent.enabled ? "disabled" : run && ["running", "queued"].includes(run.status) ? run.status : "ready";
    return `<div class="roster-row"><span class="agent-icon ${esc(agent.id)}">${esc(symbols[agent.id] || "◇")}</span><span class="roster-copy"><strong>${esc(agent.name)}</strong><small>${esc(agent.tagline)}</small></span>${status(state)}</div>`;
  }).join("");
  const focusRows = focus.length ? focus.map((proposal) => `<div class="focus-row"><span class="focus-check ${completeIds.has(proposal.id) ? "done" : ""}">${completeIds.has(proposal.id) ? "✓" : "·"}</span><strong>${esc(proposal.title)}</strong><span>${status(proposal.status)}</span>${proposalLink(proposal, "Öffnen →")}</div>`).join("") : `<div class="empty">Noch kein Tagesfokus. Starte das Briefing oder prüfe die Vorschläge.</div>`;
  return pageHead("MISSION CONTROL", "Dein Tag. Klar priorisiert.", "Alle Agenten im Blick. Vorschläge prüfen. Wirkung erzielen – lokal und in deinem Tempo.") +
    `<div class="overview-layout"><div class="overview-main"><section class="panel master-summary"><div class="master-summary-head"><span class="agent-icon master">✦</span><div><div class="eyebrow">MASTER · CHIEF OF STAFF</div><h2>Master</h2><small>${esc(data.coordination?.status === "updating" ? "Neue Ergebnisse werden zusammengeführt" : "Koordination & Priorisierung")}</small></div><div class="master-sync">${status(data.coordination?.status || "pending")}<small>${dateText(data.coordination?.lastSyncedAt)}</small></div></div><div class="master-summary-body"><p>${esc(master?.summary || "Starte den ersten Tageslauf. Master fasst Spezialistenberichte zu prüfbaren Vorschlägen zusammen.")}</p>${data.reports.master?.runId ? button("Bericht öffnen →", "view-run", `data-id="${esc(data.reports.master.runId)}"`, "btn ghost small") : ""}</div></section>` +
    `<div class="grid overview-stats"><div class="stat"><span class="stat-label">Eingerichtet</span><div class="stat-value">${enabled}<small> / ${agents.length}</small></div><div class="stat-detail">Agenten bereit</div></div><div class="stat emphasis"><span class="stat-label">Zu prüfen</span><div class="stat-value">${pending.length}</div><div class="stat-detail">Vorschläge offen</div></div><div class="stat"><span class="stat-label">Aktiv</span><div class="stat-value">${running.length}</div><div class="stat-detail">Laufende Jobs</div></div><div class="stat"><span class="stat-label">Warten</span><div class="stat-value">${waiting.length}</div><div class="stat-detail">In Warteschlange</div></div></div>` +
    `<section class="panel next-action"><div><div class="eyebrow">NÄCHSTER SCHRITT</div><h2>${esc(nextAction)}</h2><p>${pending.length ? "Du prüfst, gibst frei und startest separat." : running.length ? esc(activityText(running[0])) : "Aktuellen Stand zusammenfassen und priorisieren."}</p></div>${nextButton}</section>` +
    `<section class="panel focus-list"><div class="section-heading"><h2>Heutiger Fokus</h2><span>${focus.filter((proposal) => completeIds.has(proposal.id)).length} von ${focus.length} erledigt</span></div>${focusRows}${completed.filter((proposal) => !focus.some((item) => item.id === proposal.id)).length ? `<p class="meta">${completed.length} Aufgaben insgesamt heute erledigt.</p>` : ""}</section>` +
    `<div class="overview-actions">${button("✦ Tagesbriefing starten", "daily", 'data-full="false"', "btn primary")}${button("Alle Spezialisten neu prüfen", "daily", 'data-full="true"', "btn ghost")}</div>${coordinationPanel()}</div>` +
    `<div class="overview-side"><section class="panel roster-panel"><div class="section-heading"><h2>Unsere Agenten <small>(${enabled}/${agents.length})</small></h2>${button("Alle anzeigen →", "view-agents", "", "btn subtle small")}</div>${roster}</section><section class="panel side-proposals"><div class="section-heading"><h2>Offene Vorschläge <small>(${otherOpen.length})</small></h2>${button("Alle anzeigen →", "view-proposals", "", "btn subtle small")}</div>${otherOpen.slice(0, 4).length ? otherOpen.slice(0, 4).map((proposal, index) => `<div class="side-proposal-row"><span>${index + 1}</span><div><strong>${esc(proposal.title)}</strong><small>${esc(proposal.rationale)}</small></div>${proposalLink(proposal, "Prüfen →")}</div>`).join("") : `<div class="empty">Keine weiteren offenen Aufgaben.</div>`}</section></div></div>`;
}

function agentCard(agent) {
  const run = latestRun(agent.id);
  const report = reportFor(agent.id);
  return `<article class="agent-card ${agent.enabled ? "" : "disabled"}"><div class="agent-top"><div class="agent-icon ${esc(agent.id)}">${esc(symbols[agent.id] || "◇")}</div>${status(!agent.enabled ? "disabled" : run && ["queued", "running"].includes(run.status) ? run.progress?.signal === "quiet" ? "quiet" : run.status : "ready")}</div><div><h3>${esc(agent.name)}</h3><p>${esc(agent.tagline)}</p></div><div class="chip-row"><span class="chip accent">${esc(agent.model)} · ${esc(agent.effort)}</span><span class="chip">${esc(labels[agent.cadence])}</span><span class="chip">Web: ${esc(agent.webSearch)}</span></div><div class="last">${run && ["running", "queued"].includes(run.status) ? esc(activityText(run)) : report ? `Letzter Bericht: ${dateText(data.reports[agent.id].finishedAt)} · ${esc(report.headline)}` : "Noch kein Bericht"}</div><div class="card-actions">${button("Starten", "run-agent", `data-id="${esc(agent.id)}" ${agent.enabled ? "" : "disabled"}`, "btn primary small")}${button("Einstellen", "edit-agent", `data-id="${esc(agent.id)}"`, "btn ghost small")}</div></article>`;
}
function option(value, current, title) { return `<option value="${esc(value)}" ${value === current ? "selected" : ""}>${esc(title)}</option>`; }
function agentEditor() {
  if (!ui.agentId) return "";
  const isNew = ui.agentId === "new";
  const agent = isNew ? { id: "", kind: "specialist", name: "", tagline: "", enabled: true, cadence: "manual", model: "gpt-6-luna", effort: "low", webSearch: "live", prompt: "" } : data.config.agents.find((item) => item.id === ui.agentId);
  if (!agent) return "";
  return `<section class="panel editor" id="agent-editor"><div class="panel-title"><div><div class="eyebrow">PROFIL</div><h2>${isNew ? "Neuen Spezialisten anlegen" : esc(agent.name)}</h2></div>${button("Schließen ×", "close-agent", "", "btn ghost small")}</div><p class="editor-desc">Änderungen gelten für künftige Läufe. Laufende Agenten verwenden ihren gestarteten Auftrag.</p><form id="agentForm"><div class="form-row"><div class="field"><label for="agentName">Name</label><input id="agentName" name="name" maxlength="80" required value="${esc(agent.name)}"></div><div class="field"><label for="agentTagline">Kurzbeschreibung</label><input id="agentTagline" name="tagline" maxlength="180" required value="${esc(agent.tagline)}"></div></div><div class="form-row"><div class="field"><label for="agentModel">Modell</label><select id="agentModel" name="model">${["gpt-6-luna", "gpt-6-sol", "gpt-6-astra"].map((model) => option(model, agent.model, model)).join("")}</select></div><div class="field"><label for="agentEffort">Reasoning</label><select id="agentEffort" name="effort">${["low", "medium", "high", "xhigh", "max"].map((effort) => option(effort, agent.effort, effort)).join("")}</select></div></div><div class="form-row"><div class="field"><label for="agentCadence">Rhythmus</label><select id="agentCadence" name="cadence" ${agent.kind === "master" ? "disabled" : ""}>${["daily", "weekly", "manual"].map((cadence) => option(cadence, agent.cadence, labels[cadence])).join("")}</select></div><div class="field"><label for="agentWeb">Websuche</label><select id="agentWeb" name="webSearch">${["live", "cached", "disabled"].map((mode) => option(mode, agent.webSearch, mode)).join("")}</select></div></div><label class="checkline"><input type="checkbox" name="enabled" ${agent.enabled ? "checked" : ""}> Agent aktiv</label><div class="field"><label for="agentPrompt">Auftrag und Regeln</label><textarea id="agentPrompt" name="prompt" lang="en" maxlength="6000" required>${esc(agent.prompt)}</textarea><small>Prompts auf Englisch schreiben. Der Agent liest zusätzlich die einschlägigen AGENTS.md-Dateien im Projekt.</small></div><div class="editor-actions"><div>${agent.kind === "specialist" && !isNew ? button("Agent entfernen", "delete-agent", `data-id="${esc(agent.id)}"`, "btn danger small") : ""}</div><button type="submit" class="btn primary">Profil speichern</button></div></form></section>`;
}
function agentsView() {
  return pageHead("TEAM", "Deine Agenten", "Jeder Agent hat einen Auftrag, ein Modell und einen eigenen Rhythmus. Alles lässt sich hier anpassen.", button("+ Spezialist", "new-agent", "", "btn primary")) + `<div class="grid agents-grid">${data.config.agents.map(agentCard).join("")}</div>${agentEditor()}`;
}
function effortText(value) { return ({ small: "Kleiner Aufwand", medium: "Mittlerer Aufwand", large: "Großer Aufwand" })[value] || value; }
function proposalCard(proposal, focus = false, slot = 0) {
  const completed = (data.daily.completedTodayIds || []).includes(proposal.id);
  const skippable = focus && ["proposed", "approved"].includes(proposal.status);
  const priorityLabel = focus ? "Heute" : proposal.priority === "today" ? "Backlog · hohe Priorität" : labels[proposal.priority];
  const run = data.runs.find((item) => item.type === "proposal" && item.proposalId === proposal.id && ["queued", "running"].includes(item.status));
  const action = proposal.status === "approved"
    ? button(proposal.executionMode === "manual" ? "Manuell starten" : "Ausführen", "execute-proposal", `data-id="${esc(proposal.id)}"`, "btn primary small")
    : proposal.status === "executing" && proposal.executionMode === "manual"
      ? button("Ergebnis eintragen", "open-proposal", `data-id="${esc(proposal.id)}"`, "btn primary small")
      : run ? button("Lauf ansehen", "view-run", `data-id="${esc(run.id)}"`, "btn ghost small")
        : proposal.executionRunId ? button("Ergebnis ansehen", "view-run", `data-id="${esc(proposal.executionRunId)}"`, "btn ghost small") : "";
  return `<article class="proposal-card ${focus ? "focus-card" : ""} ${completed ? "is-complete" : ""}"><div class="proposal-top"><div class="proposal-priority">${focus ? `<span class="focus-check" aria-label="${completed ? "Heute erledigt" : "Heute offen"}">${completed ? "✓" : slot}</span>` : ""}<span class="priority ${esc(proposal.priority)}">${esc(priorityLabel)}</span></div>${status(proposal.status)}</div><h3>${esc(proposal.title)}</h3><p>${esc(proposal.rationale)}</p><div class="chip-row"><span class="chip">${esc(effortText(proposal.effort))}</span><span class="chip">${esc(labels[proposal.executionMode] || labels.manualMode)}</span></div>${completed ? `<p class="done-line">✓ Heute abgeschlossen${proposal.completionNote ? ` · ${esc(proposal.completionNote)}` : ""}</p>` : ""}${["deferred", "rejected"].includes(proposal.status) && proposal.decisionNote ? `<p class="decision-line">${esc(proposal.decisionNote)}</p>` : ""}<div class="proposal-actions">${proposalLink(proposal, proposal.status === "proposed" ? "Prüfen →" : "Aufgabe öffnen →")}${action}${skippable ? button("Überspringen", "skip-proposal", `data-id="${esc(proposal.id)}"`, "btn ghost small") : ""}</div></article>`;
}
function proposalsView() {
  const groups = ["all", "open", "approved", "executing", "deferred", "done", "rejected"];
  const groupLabel = { all: "Alle", open: "Offen", approved: "Freigegeben", executing: "In Arbeit", deferred: "Später", done: "Erledigt", rejected: "Verworfen" };
  const filter = ui.proposalFilter;
  const focus = dailyFocus();
  const focusIds = new Set(focus.map((proposal) => proposal.id));
  const statusOrder = { executing: 0, approved: 1, proposed: 2, deferred: 3, done: 4, rejected: 5 };
  const other = data.proposals.filter((proposal) => !focusIds.has(proposal.id))
    .sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
  const matches = data.proposals.filter((item) => filter === "open" ? item.status === "proposed" : item.status === filter);
  const tabs = `<div class="tabs">${groups.map((group) => `<button type="button" class="tab ${filter === group ? "active" : ""}" data-action="proposal-filter" data-filter="${group}">${groupLabel[group]} · ${group === "all" ? data.proposals.length : data.proposals.filter((item) => group === "open" ? item.status === "proposed" : item.status === group).length}</button>`).join("")}</div>`;
  const all = `<section class="daily-focus"><div class="section-heading"><div><div class="eyebrow">TAGESCHALLENGE</div><h2>Deine drei Aufgaben heute</h2></div><span>${focus.filter((proposal) => (data.daily.completedTodayIds || []).includes(proposal.id)).length} / 3 erledigt</span></div><div class="focus-grid">${focus.length ? focus.map((proposal, index) => proposalCard(proposal, true, index + 1)).join("") : `<div class="empty">Noch kein Tagesfokus vorhanden.</div>`}</div></section>${sectionHead("Weitere Aufgaben", `<span>${other.length} im Überblick</span>`)}${other.length ? other.map((proposal) => proposalCard(proposal)).join("") : `<div class="empty">Keine weiteren Aufgaben.</div>`}`;
  return pageHead("DECISION DESK", "Aufgaben steuern", "Drei Tagesaufgaben oben, alle weiteren Vorschläge darunter. Freigabe und Ausführung sind getrennte Schritte.") + tabs + (filter === "all" ? all : matches.length ? matches.map((proposal) => proposalCard(proposal, focusIds.has(proposal.id), focus.findIndex((item) => item.id === proposal.id) + 1)).join("") : `<div class="empty">In diesem Bereich gibt es noch keine Vorschläge.</div>`);
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
  return `<section class="panel details run-details"><div class="panel-title"><h3>${esc(run.agentName)}</h3>${status(run.status)}</div><p class="body-copy">${esc(run.message)}</p><p class="activity-line">${esc(activityText(run))}</p>${warning}<div class="chip-row"><span class="chip">${esc(run.model)} · ${esc(run.effort)}</span><span class="chip">Start: ${dateText(run.startedAt)}</span><span class="chip">Letzte Aktivität: ${dateText(run.lastActivityAt || run.finishedAt || run.startedAt)}</span><span class="chip">Ende: ${dateText(run.finishedAt)}</span>${run.usage ? `<span class="chip">Tokens: ${esc(run.usage.input_tokens ?? "?")} in / ${esc(run.usage.output_tokens ?? "?")} out</span>` : ""}</div>${run.currentStep ? `<p class="meta">Aktueller Schritt: ${esc(run.currentStep)}</p>` : ""}${worktreeBlock(run)}<div class="subtle-divider"></div>${run.report ? reportBlock(run.report, "", run.type === "agent" && run.agentId === "master") : run.finalText ? `<pre class="log">${esc(run.finalText)}</pre>` : ""}<div class="section-heading log-heading"><h2>Protokoll</h2><div class="button-row"><a class="btn ghost small" href="/api/runs/${encodeURIComponent(run.id)}/log" target="_blank" rel="noopener noreferrer">Ganzes Log ↗</a>${["queued", "running"].includes(run.status) ? button("Abbrechen", "cancel-run", `data-id="${esc(run.id)}"`, "btn danger small") : ""}</div></div><pre class="log" data-run-log>${esc((run.events || []).join("\n"))}</pre>${run.threadId ? `<p class="meta">Codex-Task-ID: ${esc(run.threadId)}</p>` : ""}</section>`;
}
function runsView() {
  return pageHead("ACTIVITY", "Alle Läufe", "Laufzeit, letzte Ausgabe, Prozessstatus und Ergebnis jedes Agentenlaufs.") + (data.runs.length ? `<div class="run-list">${data.runs.map((run) => `<div class="run-row"><div><strong>${esc(run.agentName)}</strong><p>${dateText(run.createdAt)} · ${esc(run.reason)} · ${esc(run.message)}</p><p class="run-activity">${esc(activityText(run))}</p></div><div class="right">${status(run.progress?.signal === "quiet" ? "quiet" : run.status)}${button("Details", "view-run", `data-id="${esc(run.id)}"`, "btn ghost small")}</div></div>`).join("")}</div>${runDetail()}` : `<div class="empty">Noch keine Läufe. Starte einen Agenten oder den Tageslauf.</div>`);
}
function settingsView() {
  const s = data.config.settings;
  return pageHead("SETUP", "Einstellungen", "Steuere den Tageslauf. Die Uhr gilt in der eingestellten Zeitzone, während der lokale Server läuft.") + `<div class="settings-grid"><section class="panel"><div class="panel-title"><h3>Tagesbriefing</h3></div><form id="settingsForm"><label class="checkline"><input type="checkbox" name="autoDaily" ${s.autoDaily ? "checked" : ""}> Automatisch täglich starten</label><label class="checkline"><input type="checkbox" name="autoSynthesize" ${s.autoSynthesize ? "checked" : ""}> Master nach neuen Ergebnissen automatisch aktualisieren</label><div class="field"><label for="quietWarningMinutes">Hinweis nach Minuten ohne Ausgabe</label><input type="number" id="quietWarningMinutes" name="quietWarningMinutes" min="1" max="60" required value="${esc(s.quietWarningMinutes)}"><small>Ein stiller Prozess kann weiterarbeiten. Der Hinweis bricht ihn nicht automatisch ab.</small></div><div class="field"><label for="dailyTime">Uhrzeit</label><input type="time" id="dailyTime" name="dailyTime" required value="${esc(s.dailyTime)}"></div><div class="field"><label for="timeZone">Zeitzone</label><input id="timeZone" name="timeZone" required value="${esc(s.timeZone)}"><small>IANA-Zeitzone, z. B. Europe/Amsterdam.</small></div><p class="note">Nach dem Start holt der Server den heutigen Lauf nach, wenn die Uhrzeit bereits vorbei ist. Wochenagenten laufen nur, wenn ihr letzter Bericht mindestens sieben Tage alt ist.</p><button type="submit" class="btn primary">Zeitplan speichern</button></form></section><section class="panel"><div class="panel-title"><h3>Lokale Ausführung</h3></div><div class="finding"><strong>Codex CLI</strong><p>${esc(data.server.codexBin)}</p></div><div class="finding"><strong>Arbeitsweise</strong><p>Recherche läuft lesend. Freigegebene Codearbeit startet in einem eigenen Codex-Worktree. Protokolle und Berichte liegen unter artifacts/agent-console/.</p></div><div class="finding"><strong>Aktiver Lauf</strong><p>${data.server.activeRunId ? esc(data.runs.find((run) => run.id === data.server.activeRunId)?.agentName || "Läuft") : "Keiner"} · ${data.server.queueLength} in der Warteschlange</p></div><div class="finding"><strong>Letztes Tagesbriefing</strong><p>${dateText(data.daily.lastCompletedAt)}</p></div></section></div>`;
}
function networkDayFor(at) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: data.config.settings.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(at));
  return ["year", "month", "day"].map((type) => parts.find((part) => part.type === type).value).join("-");
}
function networkDays() {
  const days = data.networkDays || [...new Set((data.networkTimeline || []).map((event) => networkDayFor(event.at)))].sort();
  return days.length ? days : [networkDayFor(new Date())];
}
function networkEvents(fresh = false) {
  const days = networkDays();
  if (!ui.networkDay) ui.networkDay = days[days.length - 1];
  if (!fresh && ui.networkFrozen) return ui.networkFrozen;
  return (data.networkTimeline || []).filter((event) => networkDayFor(event.at) === ui.networkDay);
}
function networkView() {
  const events = networkEvents();
  if (!events.some((event) => event.id === ui.networkId)) ui.networkId = events[0]?.id || null;
  return window.LIEUVA_NETWORK.render({ data, state: ui, events, days: networkDays(), timeZone: data.config.settings.timeZone, language: i18n.language, esc, tr, status });
}
function stopNetworkPlayback() {
  clearTimeout(networkTimer);
  networkTimer = null;
  ui.networkPlaying = false;
}
function scrollNetworkSelection() {
  const list = app.querySelector(".day-event-list");
  const selected = list?.querySelector(".is-selected");
  if (list && selected) list.scrollTop = selected.offsetTop - list.offsetTop - list.clientHeight / 2 + selected.clientHeight / 2;
}
function scheduleNetworkFrame() {
  clearTimeout(networkTimer);
  networkTimer = setTimeout(() => {
    if (ui.view !== "network" || !ui.networkPlaying) { stopNetworkPlayback(); return; }
    const events = networkEvents();
    const current = events.findIndex((event) => event.id === ui.networkId);
    if (current >= events.length - 1) {
      stopNetworkPlayback();
      ui.networkEnded = true;
    } else ui.networkId = events[current + 1].id;
    draw();
    scrollNetworkSelection();
    if (ui.networkPlaying) scheduleNetworkFrame();
  }, 2800 / ui.networkSpeed);
}
function revealNetworkScene() {
  app.querySelector(".orbital-layout")?.scrollIntoView({ block: "start", behavior: "auto" });
}
function startNetworkPlayback(restart = false) {
  stopNetworkPlayback();
  if (restart || ui.networkEnded || !ui.networkFrozen) ui.networkFrozen = networkEvents(true).slice();
  const events = networkEvents();
  if (!events.length) { draw(); return; }
  const current = events.findIndex((event) => event.id === ui.networkId);
  if (restart || ui.networkEnded || current < 0 || current === events.length - 1) ui.networkId = events[0].id;
  ui.networkEnded = false;
  ui.networkPlaying = true;
  draw();
  scrollNetworkSelection();
  revealNetworkScene();
  scheduleNetworkFrame();
}
function selectNetworkEvent(id) {
  stopNetworkPlayback();
  ui.networkEnded = false;
  ui.networkId = id;
  draw();
  scrollNetworkSelection();
}

function draw() {
  if (!data) return;
  document.getElementById("viewLabel").textContent = labels[ui.view];
  document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === ui.view));
  const focusedId = app.contains(document.activeElement) ? document.activeElement?.id : null;
  const oldAtmosphere = ui.view === "network" ? app.querySelector(".sphere-atmosphere") : null;
  const oldEventScroll = app.querySelector(".day-event-list")?.scrollTop || 0;
  const focusedAction = app.contains(document.activeElement) && document.activeElement?.dataset?.action
    ? { action: document.activeElement.dataset.action, id: document.activeElement.dataset.id, filter: document.activeElement.dataset.filter } : null;
  const previousLog = app.querySelector("[data-run-log]");
  const followLog = !previousLog || previousLog.scrollTop + previousLog.clientHeight >= previousLog.scrollHeight - 20;
  const previousScroll = previousLog?.scrollTop ?? 0;
  app.innerHTML = ({ overview, agents: agentsView, proposals: proposalsView, runs: runsView, network: networkView, settings: settingsView })[ui.view]();
  if (oldAtmosphere) app.querySelector(".sphere-atmosphere")?.replaceWith(oldAtmosphere);
  const nextEvents = app.querySelector(".day-event-list");
  if (nextEvents) nextEvents.scrollTop = oldEventScroll;
  if (focusedId) document.getElementById(focusedId)?.focus({ preventScroll: true });
  const nextLog = app.querySelector("[data-run-log]");
  if (nextLog) nextLog.scrollTop = followLog ? nextLog.scrollHeight : previousScroll;
  if (focusedAction) [...app.querySelectorAll("[data-action]")].find((element) => element.dataset.action === focusedAction.action && element.dataset.id === focusedAction.id && element.dataset.filter === focusedAction.filter)?.focus({ preventScroll: true });
  if (ui.agentId && ui.view === "agents") document.getElementById("agent-editor")?.scrollIntoView({ block: "nearest" });
  i18n.apply(document);
}
function offline() {
  app.innerHTML = `<div class="page-head"><div><div class="eyebrow">OFFLINE PREVIEW</div><h1>Die Agentenzentrale ist bereit.</h1><p>Diese HTML-Datei zeigt die lokale Oberfläche. Zum Starten der Agenten wird der lokale Node-Server benötigt.</p></div></div><section class="master-card"><div class="master-copy"><div class="master-kicker">✦ MASTER · CHIEF OF STAFF</div><h2>Ein Tagesplan aus Spezialistenberichten.</h2><p>Öffne im Projektordner <strong>agent-console/start.command</strong> per Doppelklick oder führe <strong>npm run agents:dashboard</strong> aus. Danach steht die interaktive Oberfläche unter <a href="${rootUrl}/">${rootUrl}/</a> bereit.</p></div>${masterArt()}</section><div class="grid agents-grid">${["Qualität & Risiken", "UX & Nutzungsforschung", "Produktstrategie", "Markt & Wettbewerb", "SEO, GEO & Wachstum", "3D & Blender R&D"].map((name) => `<div class="agent-card"><div class="agent-icon">◇</div><h3>${name}</h3><div class="chip-row"><span class="chip accent">gpt-6-luna · low</span></div></div>`).join("")}</div>`;
}
function proposalModal(proposal) {
  if (!proposal) return;
  ui.proposalId = proposal.id;
  ui.dirty = false;
  if (proposal.status === "done" || proposal.status === "executing") {
    const manual = proposal.status === "executing" && proposal.executionMode === "manual";
    const note = manual ? `<form id="manualCompletionForm"><div class="field"><label for="manualResult">Was wurde erledigt? Ergebnis oder Nachweis</label><textarea id="manualResult" name="note" minlength="5" maxlength="2000" required placeholder="Kurzes Ergebnis und ggf. Fundstelle festhalten"></textarea></div><p class="note">Manuelle Aufgaben werden erst nach deiner Bestätigung als erledigt gezählt. Externe Schritte führt die Agentenzentrale nicht selbst aus.</p><div class="modal-actions">${button("Zurück auf Freigegeben", "reopen-manual", `data-id="${esc(proposal.id)}"`, "btn ghost small")}${button("Erledigt melden", "complete-manual", `data-id="${esc(proposal.id)}"`, "btn primary small")}</div></form>` : `<p class="note">${proposal.status === "executing" ? "Der Auftrag läuft. Fortschritt und Ergebnis findest du unter Läufe." : "Dieser Auftrag wurde abgeschlossen."}</p>${proposal.completionNote ? `<p class="body-copy">Ergebnis: ${esc(proposal.completionNote)}</p>` : ""}${proposal.executionRunId && data.runs.some((run) => run.id === proposal.executionRunId) ? button("Ergebnis ansehen", "view-run", `data-id="${esc(proposal.executionRunId)}"`, "btn ghost small") : ""}`;
    overlay.innerHTML = `<div class="overlay"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="proposalTitle"><div class="modal-head"><div><div class="eyebrow">AUFGABE · ${esc(labels[proposal.status])}</div><h2 id="proposalTitle">${esc(proposal.title)}</h2></div>${button("×", "close-modal", 'aria-label="Schließen"', "btn icon ghost")}</div><p class="body-copy">${esc(proposal.action)}</p>${note}</section></div>`;
    i18n.apply(overlay);
    overlay.querySelector("button")?.focus();
    return;
  }
  overlay.innerHTML = `<div class="overlay"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="proposalTitle"><div class="modal-head"><div><div class="eyebrow">AUFGABE · ${esc(labels[proposal.status])}</div><h2 id="proposalTitle">Prüfen und anpassen</h2></div>${button("×", "close-modal", 'aria-label="Schließen"', "btn icon ghost")}</div><form id="proposalForm"><div class="field"><label for="proposalName">Titel</label><input id="proposalName" name="title" required value="${esc(proposal.title)}"></div><div class="field"><label for="proposalRationale">Warum?</label><textarea id="proposalRationale" name="rationale" required>${esc(proposal.rationale)}</textarea></div><div class="field"><label for="proposalAction">Konkreter Auftrag</label><textarea id="proposalAction" name="action" required>${esc(proposal.action)}</textarea></div><div class="form-row"><div class="field"><label for="proposalPriority">Priorität</label><select id="proposalPriority" name="priority">${["today", "soon", "watch"].map((item) => option(item, proposal.priority, labels[item])).join("")}</select></div><div class="field"><label for="proposalMode">Ausführung</label><select id="proposalMode" name="executionMode">${["research", "local-code", "manual"].map((item) => option(item, proposal.executionMode, labels[item] || labels.manualMode)).join("")}</select></div></div><div class="form-row"><div class="field"><label for="proposalEffort">Aufwand</label><select id="proposalEffort" name="effort">${["small", "medium", "large"].map((item) => option(item, proposal.effort, labels[item])).join("")}</select></div><div class="field"><label for="proposalConfidence">Sicherheit</label><select id="proposalConfidence" name="confidence">${["high", "medium", "low"].map((item) => option(item, proposal.confidence, labels[item])).join("")}</select></div></div><p class="note">Quelle: ${evidence(proposal.evidence)}. Freigabe startet noch keinen Lauf. „Manuell“ öffnet eine Aufgabe zum Nachhalten; Recherche und lokale Codearbeit starten Codex erst nach deinem Klick.</p><div class="subtle-divider"></div><div class="modal-actions">${button("Verwerfen", "proposal-reject", "", "btn danger small")}${button("Später", "proposal-defer", "", "btn ghost small")}${button("Speichern", "proposal-save", "", "btn ghost small")}${proposal.status === "approved" ? button(proposal.executionMode === "manual" ? "Manuell starten" : "Ausführen", "execute-proposal", `data-id="${esc(proposal.id)}"`, "btn primary small") : button("Freigeben", "proposal-approve", "", "btn primary small")}</div></form></section></div>`;
  i18n.apply(overlay);
  overlay.querySelector("input")?.focus();
}
function skipModal(proposal) {
  if (!proposal || !["proposed", "approved"].includes(proposal.status)) return;
  ui.proposalId = proposal.id;
  ui.dirty = false;
  overlay.innerHTML = `<div class="overlay"><section class="modal skip-modal" role="dialog" aria-modal="true" aria-labelledby="skipTitle"><div class="modal-head"><div><div class="eyebrow">TAGESAUFGABE ÜBERSPRINGEN</div><h2 id="skipTitle">${esc(proposal.title)}</h2></div>${button("×", "close-modal", 'aria-label="Schließen"', "btn icon ghost")}</div><p class="body-copy">Die Aufgabe verschwindet aus deinem Tagesfokus. Der Master bekommt deine Entscheidung beim nächsten Abgleich.</p><form id="skipForm"><div class="field"><label for="skipReason">Hinweis an den Master (optional)</label><textarea id="skipReason" name="reason" maxlength="430" placeholder="Warum passt diese Aufgabe gerade nicht?"></textarea></div><div class="modal-actions">${button("Für später parken", "skip-defer", "", "btn ghost small")}${button("Verwerfen", "skip-reject", "", "btn danger small")}</div></form></section></div>`;
  i18n.apply(overlay);
  overlay.querySelector("textarea")?.focus();
}
function closeModal() {
  overlay.innerHTML = "";
  ui.proposalId = null;
  ui.dirty = false;
  if (location.hash.startsWith("#proposal/")) history.replaceState(null, "", location.pathname + location.search);
}
function showProposal(id, updateHash = true) {
  const proposal = data?.proposals.find((item) => item.id === id);
  if (!proposal) return;
  ui.view = "proposals";
  ui.proposalFilter = "all";
  draw();
  proposalModal(proposal);
  if (updateHash) history.replaceState(null, "", `#proposal/${encodeURIComponent(id)}`);
}
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
  if (["deferred", "rejected"].includes(newStatus)) {
    patch.decisionNote = newStatus === "deferred" ? "Deferred by the user." : "Rejected by the user.";
  }
  await api("PATCH", `/api/proposals/${proposal.id}`, patch);
  if (newStatus === "approved") ui.proposalFilter = "all";
  closeModal();
  await refresh();
  notify(newStatus === "approved" ? "Vorschlag freigegeben. Ausführung wartet auf deinen Klick."
    : newStatus === "deferred" ? "Für später geparkt. Der Master bekommt deine Entscheidung."
      : newStatus === "rejected" ? "Verworfen. Der Master bekommt deine Entscheidung." : "Vorschlag gespeichert.");
}
async function decideSkip(statusValue) {
  const proposal = data.proposals.find((item) => item.id === ui.proposalId);
  if (!proposal || !["proposed", "approved"].includes(proposal.status)) return;
  const reason = String(new FormData(document.getElementById("skipForm")).get("reason") || "").trim();
  const prefix = statusValue === "deferred" ? "Daily task deferred by the user." : "Daily task rejected by the user.";
  await api("PATCH", `/api/proposals/${proposal.id}`, {
    status: statusValue,
    decisionNote: reason ? `${prefix} Reason: ${reason}` : prefix,
  });
  closeModal();
  await refresh();
  notify(statusValue === "deferred" ? "Aus dem Tagesfokus entfernt und für später geparkt."
    : "Aus dem Tagesfokus entfernt und verworfen.");
}

document.addEventListener("input", (event) => { if (event.target.closest("#agentForm,#settingsForm,#proposalForm,#manualCompletionForm,#skipForm")) ui.dirty = true; });
document.addEventListener("submit", async (event) => {
  if (!["agentForm", "settingsForm"].includes(event.target.id)) return;
  event.preventDefault();
  try { if (event.target.id === "agentForm") await saveAgent(); else await saveSettings(); }
  catch (error) { notify(error.message, true); }
});
document.addEventListener("click", async (event) => {
  const proposalAnchor = event.target.closest("[data-proposal-link]");
  if (proposalAnchor) {
    event.preventDefault();
    showProposal(proposalAnchor.dataset.proposalLink);
    return;
  }
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    if (ui.dirty && !window.confirm(tr("Ungespeicherte Änderungen verwerfen?"))) return;
    stopNetworkPlayback();
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
    if (action === "network-select") { selectNetworkEvent(id); revealNetworkScene(); }
    if (action === "network-play") {
      if (ui.networkPlaying) { stopNetworkPlayback(); draw(); }
      else startNetworkPlayback();
    }
    if (action === "network-restart") startNetworkPlayback(true);
    if (action === "network-prev" || action === "network-next") {
      const events = networkEvents();
      const current = events.findIndex((item) => item.id === ui.networkId);
      const next = Math.max(0, Math.min(events.length - 1, current + (action === "network-next" ? 1 : -1)));
      if (events[next]) selectNetworkEvent(events[next].id);
    }
    if (action === "network-motion") { ui.networkMotion = !ui.networkMotion; draw(); }
    if (action === "daily") { await api("POST", "/api/daily/run", { full: target.dataset.full === "true" }); notify("Tageslauf gestartet."); await refresh(); }
    if (action === "run-agent") { await api("POST", `/api/agents/${id}/run`, {}); notify("Agent ist in der Warteschlange."); await refresh(); }
    if (action === "edit-agent") { ui.agentId = id; ui.view = "agents"; ui.dirty = false; draw(); }
    if (action === "new-agent") { ui.agentId = "new"; ui.dirty = false; draw(); }
    if (action === "close-agent") { ui.agentId = null; ui.dirty = false; draw(); }
    if (action === "delete-agent") {
      if (!window.confirm(tr("Dieses Agentenprofil aus der Konfiguration entfernen? Vorhandene Berichte bleiben erhalten."))) return;
      const next = structuredClone(data.config);
      next.agents = next.agents.filter((item) => item.id !== id);
      await api("PUT", "/api/config", next);
      ui.agentId = null; ui.dirty = false; await refresh(); notify("Agent entfernt.");
    }
    if (action === "proposal-filter") { ui.proposalFilter = target.dataset.filter; draw(); }
    if (action === "view-proposals") { ui.view = "proposals"; ui.proposalFilter = "all"; draw(); }
    if (action === "view-agents") { ui.view = "agents"; draw(); }
    if (action === "open-proposal") showProposal(id);
    if (action === "skip-proposal") skipModal(data.proposals.find((item) => item.id === id));
    if (action === "close-modal") closeModal();
    if (action === "skip-defer") await decideSkip("deferred");
    if (action === "skip-reject") await decideSkip("rejected");
    if (action === "proposal-save") await saveProposal();
    if (action === "proposal-approve") await saveProposal("approved");
    if (action === "proposal-defer") await saveProposal("deferred");
    if (action === "proposal-reject") await saveProposal("rejected");
    if (action === "execute-proposal") {
      if (ui.proposalId === id && ui.dirty) await saveProposal("approved");
      const proposal = data.proposals.find((item) => item.id === id);
      if (proposal?.executionMode === "local-code" && !window.confirm(i18n.language === "en" ? `Start local code work?\n\n${proposal.title}\n\nThe agent will work in a separate worktree.` : `Lokale Codearbeit starten?\n\n${proposal.title}\n\nDer Agent arbeitet in einem eigenen Worktree.`)) return;
      const result = await api("POST", `/api/proposals/${id}/execute`, {});
      if (result.manual) {
        await refresh();
        showProposal(id);
        notify("Manuelle Aufgabe gestartet. Trage das Ergebnis nach der Durchführung ein.");
      } else {
        closeModal();
        ui.view = "runs";
        ui.runId = result.runId;
        await refresh();
        notify("Freigegebener Auftrag gestartet.");
      }
    }
    if (action === "complete-manual") {
      const form = document.getElementById("manualCompletionForm");
      if (!form?.reportValidity()) return;
      const note = String(new FormData(form).get("note") || "");
      await api("POST", `/api/proposals/${id}/complete`, { note });
      closeModal();
      ui.view = "overview";
      await refresh();
      notify("Für heute abgehakt. Der Master übernimmt das Ergebnis.");
    }
    if (action === "reopen-manual") {
      await api("POST", `/api/proposals/${id}/reopen`, {});
      closeModal();
      await refresh();
      notify("Aufgabe ist wieder freigegeben.");
    }
    if (action === "view-run") { closeModal(); ui.runId = id; ui.view = "runs"; draw(); document.querySelector(".details")?.scrollIntoView({ block: "start", behavior: "smooth" }); }
    if (action === "copy-worktree") {
      const path = data.runs.find((run) => run.id === id)?.worktreePath;
      if (!path) throw new Error("Worktree-Pfad fehlt noch.");
      await navigator.clipboard.writeText(path);
      notify("Worktree-Pfad kopiert.");
    }
    if (action === "cancel-run") { await api("POST", `/api/runs/${id}/cancel`, {}); notify("Abbruch angefordert."); await refresh(); }
  } catch (error) { notify(error.message, true); }
});
document.addEventListener("change", (event) => {
  if (event.target.id === "networkDay") {
    stopNetworkPlayback();
    ui.networkDay = event.target.value;
    ui.networkId = null;
    ui.networkFrozen = null;
    ui.networkEnded = false;
    draw();
  }
  if (event.target.id === "networkSpeed") {
    ui.networkSpeed = [1, 2, 4].includes(Number(event.target.value)) ? Number(event.target.value) : 1;
    if (ui.networkPlaying) scheduleNetworkFrame();
  }
  if (event.target.id === "networkScrub") {
    const selected = networkEvents()[Number(event.target.value)];
    if (selected) selectNetworkEvent(selected.id);
  }
});
document.getElementById("themeSelect").addEventListener("change", (event) => setTheme(event.target.value));
document.getElementById("languageSelect").addEventListener("change", (event) => {
  i18n.setLanguage(event.target.value);
  if (data) {
    document.getElementById("todayLabel").textContent = new Intl.DateTimeFormat(locale(), { dateStyle: "full", timeZone: data.config.settings.timeZone }).format(new Date());
    if (!ui.dirty) draw();
  }
});
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && ui.proposalId) closeModal(); });
window.addEventListener("hashchange", () => {
  const id = location.hash.match(/^#proposal\/([a-f0-9-]+)$/)?.[1];
  if (id) showProposal(id, false);
  else if (ui.proposalId) closeModal();
});

if (location.protocol === "file:") {
  fetch(`${rootUrl}/`, { mode: "no-cors" }).then(() => location.replace(`${rootUrl}/`)).catch(offline);
} else {
  refresh();
  setInterval(() => refresh(), 3000);
}
