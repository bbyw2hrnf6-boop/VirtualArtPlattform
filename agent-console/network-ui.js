/* A schematic sphere explains recorded collaboration; it is not live message traffic. */
(() => {
  function render({ data, state, events, days, timeZone, language, esc, tr, status }) {
    const text = (de, en) => language === "en" ? en : de;
    const time = (at) => new Intl.DateTimeFormat(language === "en" ? "en-GB" : "de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone }).format(new Date(at));
    const date = (day) => new Intl.DateTimeFormat(language === "en" ? "en-GB" : "de-DE", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
    const selected = events.find((item) => item.id === state.networkId) || events[0];
    const index = selected ? events.findIndex((item) => item.id === selected.id) : -1;
    const stages = [
      ["specialist", text("Recherchieren", "Research"), text("Spezialisten prüfen", "Specialists investigate")],
      ["master", text("Zusammenführen", "Synthesize"), text("Master ordnet ein", "Master connects findings")],
      ["proposal", text("Vorschlagen", "Propose"), text("Aufgaben entstehen", "Tasks take shape")],
      ["decision", text("Entscheiden", "Decide"), text("Du entscheidest", "You decide")],
      ["execution", text("Ausführen", "Execute"), text("Ergebnis zurück an Master", "Outcome returns to Master")],
    ];
    const phaseLabels = {
      queued: text("Eingereiht", "Queued"), started: text("Arbeit gestartet", "Work started"),
      finished: selected?.status === "completed" ? text("Ergebnis liegt vor", "Result available") : text("Lauf beendet", "Run ended"),
      proposed: text("Vorschlag angelegt", "Proposal created"), decision: text("Entscheidung gespeichert", "Decision recorded"),
      completed: text("Aufgabe abgeschlossen", "Task completed"), updated: text("Stand gespeichert", "State saved"),
    };
    const nodeName = (id) => {
      const fixed = { master: "Master", proposals: text("Vorschläge", "Proposals"), user: text("Du", "You"), execution: text("Ausführung", "Execution") };
      return fixed[id] || tr(data.config.agents.find((agent) => agent.id === id)?.name || events.find((event) => event.agentId === id)?.title || id || "Agent");
    };
    const describe = (event) => {
      if (!event) return text("Wähle einen Tag mit gespeicherten Ereignissen.", "Choose a day with recorded events.");
      const name = nodeName(event.source);
      if (event.phase === "queued") return text(`${name} wartet auf einen freien Platz. Es arbeitet immer nur ein Auftrag gleichzeitig.`, `${name} is waiting for a free slot. Only one job works at a time.`);
      if (event.phase === "started") return event.stage === "master"
        ? text("Master beginnt, die verfügbaren Berichte und Entscheidungen einzuordnen.", "Master starts reviewing the available reports and decisions.")
        : text(`${name} beginnt mit dem gespeicherten Auftrag.`, `${name} starts the recorded task.`);
      if (event.phase === "finished" && event.status !== "completed") return text(`${name}: Der Lauf endet mit dem Status „${tr(({ failed: "Fehler", cancelled: "Abgebrochen", interrupted: "Unterbrochen" })[event.status] || event.status)}“. Das ist kein erfolgreicher Abschluss.`, `${name}: The run ends as “${({ failed: "failed", cancelled: "cancelled", interrupted: "interrupted" })[event.status] || event.status}”. This is not a successful completion.`);
      if (event.phase === "finished") return event.stage === "master"
        ? text("Master hat seine Zusammenfassung fertig. Gespeicherte Vorschläge folgen als eigene Ereignisse.", "Master has completed the synthesis. Saved proposals appear as separate events.")
        : text(`${name} hat ein Ergebnis. Es steht dem nächsten Master-Abgleich zur Verfügung.`, `${name} has a result. It is available for the next Master synthesis.`);
      if (event.phase === "proposed") return text("Ein Vorschlag wurde angelegt. Du kannst ihn prüfen, anpassen und freigeben.", "A proposal was created. You can review, edit and approve it.");
      if (event.phase === "decision") return text("Deine gespeicherte Entscheidung fließt in den nächsten Master-Abgleich ein.", "Your recorded decision feeds into the next Master synthesis.");
      if (event.phase === "completed") return text("Das Ergebnis der Aufgabe wurde festgehalten. Master kann es beim nächsten Abgleich berücksichtigen.", "The task outcome was recorded. Master can consider it at the next synthesis.");
      return text("Dies ist die letzte gespeicherte Änderung dieses Vorschlags.", "This is the latest recorded update to this proposal.");
    };
    const phaseTitle = (event) => event.phase === "finished" ? event.status === "completed" ? text("Ergebnis liegt vor", "Result available") : text("Lauf beendet", "Run ended") : phaseLabels[event.phase] || event.phase;
    const button = (label, action, extra = "", kind = "ghost") => `<button type="button" class="btn ${kind}" data-action="${action}" ${extra}>${label}</button>`;
    const stage = selected?.stage || "specialist";
    const fullTitle = selected ? `${nodeName(selected.source)} ${selected.source === selected.target ? "·" : "→"} ${selected.source === selected.target ? phaseTitle(selected) : nodeName(selected.target)}` : text("Noch kein Ereignis", "No event yet");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const paused = !state.networkMotion || reduced;
    const specialists = data.config.agents.filter((agent) => agent.kind === "specialist");
    for (const event of events) {
      if (event.stage === "specialist" && event.agentId && !specialists.some((agent) => agent.id === event.agentId)) specialists.push({ id: event.agentId, name: event.title });
    }
    const locations = [[170,145], [405,78], [637,158], [150,420], [372,538], [626,463]];
    const nodes = specialists.map((agent, order) => {
      const fallbackAngle = Math.PI * 2 * order / Math.max(1, specialists.length);
      const [x, y] = specialists.length <= 6 ? locations[order] : [405 + 275 * Math.cos(fallbackAngle), 310 + 228 * Math.sin(fallbackAngle)];
      return { id: agent.id, x, y, name: tr(agent.name), symbol: ({ quality: "◇", ux: "◎", product: "◈", market: "◌", growth: "↗", "three-d": "⬡" })[agent.id] || "◇", specialist: true };
    });
    nodes.push({ id: "master", x: 410, y: 310, name: "MASTER", symbol: "✦" }, { id: "proposals", x: 844, y: 155, name: nodeName("proposals"), symbol: "▤" }, { id: "user", x: 914, y: 310, name: text("Deine Entscheidung", "Your decision"), symbol: "◎" }, { id: "execution", x: 841, y: 469, name: nodeName("execution"), symbol: "▷" });
    const point = (id) => nodes.find((node) => node.id === id);
    const connection = (from, to) => {
      const a = point(from), b = point(to);
      if (!a || !b || from === to) return "";
      const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
      const ar = from === "master" ? 55 : 29, br = to === "master" ? 58 : 32;
      const start = { x: a.x + dx / length * ar, y: a.y + dy / length * ar };
      const end = { x: b.x - dx / length * br, y: b.y - dy / length * br };
      const bend = from === "execution" ? 70 : -Math.min(length * .16, 48);
      return `M${start.x.toFixed(1)} ${start.y.toFixed(1)} Q${((a.x + b.x) / 2 - dy / length * bend).toFixed(1)} ${((a.y + b.y) / 2 + dx / length * bend).toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
    };
    const routes = [...specialists.map((agent) => [agent.id, "master"]), ["master", "proposals"], ["proposals", "user"], ["user", "execution"], ["execution", "master"]];
    const activePath = selected ? connection(selected.source, selected.target) : "";
    const stars = Array.from({ length: 44 }, (_, n) => `<circle cx="${70 + ((n * 167) % 865)}" cy="${35 + ((n * 97) % 525)}" r="${n % 3 ? 1 : 1.8}" class="sphere-star star-${n % 3}"/>`).join("");
    const sphere = `<svg class="agent-sphere" viewBox="0 0 1040 620" role="img" aria-label="${esc(text("Sphäre mit Spezialisten um Master. Die helle Verbindung zeigt das ausgewählte Ereignis.", "Sphere with specialists around Master. The bright connection shows the selected event."))}">
      <defs><radialGradient id="sphere-fill"><stop offset="0" stop-color="#56dfea" stop-opacity=".11"/><stop offset=".75" stop-color="#499ec9" stop-opacity=".07"/><stop offset="1" stop-color="#7be9ef" stop-opacity=".01"/></radialGradient><radialGradient id="core-fill"><stop stop-color="#377b98"/><stop offset="1" stop-color="#102d46"/></radialGradient><marker id="sphere-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 L10 5 L0 10 Z"/></marker></defs>
      <g class="sphere-atmosphere" aria-hidden="true">${stars}<circle cx="410" cy="310" r="221" fill="url(#sphere-fill)" class="sphere-skin"/><g class="sphere-latitudes"><ellipse cx="410" cy="310" rx="220" ry="70"/><ellipse cx="410" cy="238" rx="208" ry="56"/><ellipse cx="410" cy="382" rx="208" ry="56"/><ellipse cx="410" cy="173" rx="169" ry="39"/><ellipse cx="410" cy="447" rx="169" ry="39"/></g><g class="sphere-longitudes"><ellipse cx="410" cy="310" rx="72" ry="220"/><ellipse cx="410" cy="310" rx="150" ry="220"/><ellipse cx="410" cy="310" rx="213" ry="220"/></g><g class="sphere-orbit orbit-a"><ellipse cx="410" cy="310" rx="270" ry="120" transform="rotate(-28 410 310)"/><circle cx="650" cy="238" r="4"/></g><g class="sphere-orbit orbit-b"><ellipse cx="410" cy="310" rx="265" ry="175" transform="rotate(53 410 310)"/><circle cx="265" cy="109" r="3"/></g><circle cx="410" cy="310" r="245" class="sphere-radar"/><circle cx="410" cy="310" r="234" class="sphere-orbit-dashes"/></g>
      <g class="sphere-connections">${routes.map(([from, to]) => `<path d="${connection(from, to)}"/>`).join("")}</g>
      ${activePath ? `<g class="sphere-transfer"><path class="transfer-underlay" d="${activePath}"/><path class="transfer-line" d="${activePath}" marker-end="url(#sphere-arrow)"/><path class="transfer-particle" d="${activePath}" pathLength="100"/><path class="transfer-particle second" d="${activePath}" pathLength="100"/></g>` : ""}
      ${nodes.map((node) => { const involved = selected && [selected.source, selected.target].includes(node.id); const core = node.id === "master"; return `<g class="sphere-node ${core ? "sphere-master" : ""} ${node.specialist ? "sphere-specialist" : "sphere-stage-node"} ${involved ? "is-involved" : ""}" data-node-id="${esc(node.id)}" transform="translate(${node.x} ${node.y})"><circle class="node-halo" r="${core ? 69 : 40}"/><circle class="node-ring" r="${core ? 59 : 33}"/><circle class="node-body" r="${core ? 48 : 26}"/><text class="node-glyph" y="${core ? 10 : 7}">${node.symbol}</text><text class="sphere-node-label" y="${core ? 88 : 56}" text-anchor="middle">${esc(node.name)}</text>${core ? `<text class="core-caption" y="105" text-anchor="middle">${esc(text("KOORDINATION", "COORDINATION"))}</text>` : ""}</g>`; }).join("")}
      <text x="58" y="599" class="sphere-corner-label">${esc(text("SPEZIALISTEN → MASTER → DEIN ENTSCHEID", "SPECIALISTS → MASTER → YOUR DECISION"))}</text><text x="980" y="599" text-anchor="end" class="sphere-corner-label">LIEUVA / ORBITAL SYSTEM</text>
    </svg>`;
    const hasRun = selected?.runId && data.runs.some((run) => run.id === selected.runId);
    const detailAction = selected?.type === "proposal" ? button(text("Aufgabe öffnen ↗", "Open task ↗"), "open-proposal", `data-id="${esc(selected.proposalId)}"`) : hasRun ? button(text("Lauf öffnen ↗", "Open run ↗"), "view-run", `data-id="${esc(selected.runId)}"`) : selected?.runId && !selected.reportOnly ? `<a class="btn ghost" href="/api/runs/${encodeURIComponent(selected.runId)}/log" target="_blank" rel="noopener noreferrer">${text("Protokoll öffnen ↗", "Open log ↗")}</a>` : "";
    return `<div class="page-head"><div><div class="eyebrow">ORBITAL INTELLIGENCE</div><h1>${text("So arbeitet dein Team zusammen.", "See your team work together.")}</h1><p>${text("Ein Tag. Schritt für Schritt. Verfolge, wie aus Recherche eine Entscheidung wird.", "One day. Step by step. Follow research as it becomes a decision.")}</p></div><span class="replay-badge"><span></span>${text("Tagesrückblick", "Day replay")}</span></div>
      <div class="network-experience stage-${esc(stage)} ${paused ? "motion-off" : ""}" data-selected-time="${esc(selected?.at || "")}" data-selected-phase="${esc(selected?.phase || "")}">
        <ol class="collaboration-stages">${stages.map(([id, title, explanation], n) => `<li class="${stage === id && selected ? "is-current" : ""}"><span>${n + 1}</span><div><strong>${title}</strong><small>${explanation}</small></div></li>`).join("")}</ol>
        <div class="orbital-layout"><section class="orbital-scene"><div class="orbital-scene-head"><div><span class="eyebrow">AGENT SPHERE</span><h2>${esc(fullTitle)}</h2></div>${button(paused ? text("Bewegung aus", "Motion off") : text("Bewegung an", "Motion on"), "network-motion", `aria-pressed="${!paused}" ${reduced ? `disabled title="${esc(text("Reduzierte Bewegung im System aktiviert", "Reduced motion enabled in system settings"))}"` : ""}`)}</div>${sphere}<div class="sphere-caption"><span class="signal-key"></span><span>${text("Helle Spur: ausgewähltes Ereignis", "Bright trail: selected event")}</span><span>${text("Ablaufbild aus gespeicherten Ereignissen", "Workflow from recorded events")}</span></div></section>
        <aside class="replay-inspector"><div class="inspector-kicker"><span>${text("DIESER MOMENT", "THIS MOMENT")}</span><time>${selected ? time(selected.at) : "—"}</time></div><div class="inspector-title"><span class="phase-icon">${selected?.phase === "queued" ? "◷" : selected?.phase === "started" ? "▷" : "↗"}</span><h2>${esc(selected ? phaseTitle(selected) : text("Noch kein Ereignis", "No event yet"))}</h2></div><p class="event-explanation">${esc(describe(selected))}</p>${selected ? `<div class="handoff-label"><span>${esc(nodeName(selected.source))}</span><b>${selected.source === selected.target ? "◉" : "→"}</b><span>${esc(selected.source === selected.target ? phaseTitle(selected) : nodeName(selected.target))}</span></div><div class="event-evidence"><strong>${esc(selected.title)}</strong>${selected.detail ? `<p>${esc(selected.detail)}</p>` : ""}${status(selected.status)}</div>${selected.snapshotOnly ? `<p class="snapshot-note">${text("Vorschlagstext: letzter gespeicherter Stand. Frühere Bearbeitungen sind nicht vollständig erhalten.", "Proposal text: latest saved version. Earlier edits are not fully retained.")}</p>` : ""}<div class="button-row">${detailAction}</div>` : ""}</aside></div>
        <section class="day-player"><div class="day-player-top"><label class="day-select"><span>${text("Tag abspielen", "Replay day")}</span><select id="networkDay" aria-label="${text("Tag auswählen", "Choose day")}">${days.map((day) => `<option value="${day}" ${day === state.networkDay ? "selected" : ""}>${date(day)}</option>`).join("")}</select></label><div class="player-order"><span>→</span>${text("Früh → spät", "Earliest → latest")}<small>${esc(timeZone)}</small></div><div class="player-transport">${button("↤", "network-restart", `aria-label="${text("Tag von Anfang abspielen", "Replay day from start")}" ${events.length ? "" : "disabled"}`)}${button("‹", "network-prev", `aria-label="${text("Vorheriges Ereignis", "Previous event")}" ${index > 0 ? "" : "disabled"}`)}${button(state.networkPlaying ? text("Ⅱ Pause", "Ⅱ Pause") : state.networkEnded ? text("↻ Erneut abspielen", "↻ Replay again") : text("▶ Tag abspielen", "▶ Play day"), "network-play", events.length ? "" : "disabled", "primary")}${button("›", "network-next", `aria-label="${text("Nächstes Ereignis", "Next event")}" ${index < events.length - 1 ? "" : "disabled"}`)}<label class="speed-control"><span>${text("Tempo", "Speed")}</span><select id="networkSpeed" aria-label="${text("Wiedergabetempo", "Playback speed")}">${[1,2,4].map((speed) => `<option value="${speed}" ${speed === state.networkSpeed ? "selected" : ""}>${speed}×</option>`).join("")}</select></label></div></div>
        <div class="replay-range-row"><time>${events.length ? time(events[0].at) : "—"}</time><input type="range" id="networkScrub" min="0" max="${Math.max(0,events.length - 1)}" value="${Math.max(0,index)}" ${events.length ? "" : "disabled"} aria-label="${text("Ereignis auf der Tageszeitachse", "Event on the day timeline")}" aria-valuetext="${esc(selected ? `${time(selected.at)} · ${phaseTitle(selected)}` : text("Keine Ereignisse", "No events"))}"><time>${events.length ? time(events[events.length - 1].at) : "—"}</time></div><div class="replay-progress"><span>${events.length ? text(`${index + 1} von ${events.length} Ereignissen`, `${index + 1} of ${events.length} events`) : text("An diesem Tag sind keine Ereignisse gespeichert.", "No events recorded on this day.")}</span><strong>${state.networkPlaying ? text("Wiedergabe läuft", "Playing") : state.networkEnded ? text("Tagesende erreicht", "End of day reached") : text("Bereit zum Erkunden", "Ready to explore")}</strong><span>${text("Zeitabstände für die Wiedergabe verkürzt", "Time gaps compressed for playback")}</span></div></section>
        <section class="day-history"><div class="section-heading"><h2>${text("Der Tag in Reihenfolge", "The day in order")}</h2><span>${text("Nur erhaltene Ereignisse · keine vollständige Änderungshistorie", "Retained events only · not a full edit history")}</span></div><div class="day-event-list">${events.map((event, n) => `<button type="button" class="day-event ${event.id === selected?.id ? "is-selected" : ""} ${n < index ? "is-past" : ""}" data-action="network-select" data-id="${esc(event.id)}" aria-current="${event.id === selected?.id ? "step" : "false"}"><time>${time(event.at)}</time><span class="event-track-dot"></span><span><strong>${esc(phaseTitle(event))}</strong><small>${esc(event.title)}</small></span><span class="event-sequence">${String(n + 1).padStart(2,"0")}</span></button>`).join("")}</div></section>
      </div>`;
  }
  window.LIEUVA_NETWORK = { render };
})();
