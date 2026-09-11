import { useEffect, useState } from "react";
import type { AdminDashboard } from "../../services/adminConsoleTypes";
import { downloadAdminJson, isFailedObservation, OPERATOR_TOOLS, recentSpaceAttention, releaseComparison, sourceFreshness, supportBundle } from "./adminOperationsModel";

export default function AdminOperations({ dashboard }: { dashboard: AdminDashboard }) {
  const [copyState, setCopyState] = useState("");
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const release = releaseComparison(dashboard);
  const attention = recentSpaceAttention(dashboard);
  const failures = dashboard.telemetry.status === "ok" ? dashboard.telemetry.data.recent.filter(isFailedObservation) : [];
  const sources = [["Content", dashboard.content], ["Telemetry", dashboard.telemetry], ["GitHub", dashboard.github], ["Live checks", dashboard.checks], ["Release identity", dashboard.release]] as const;
  const copy = async (command: string, title: string) => {
    try { await navigator.clipboard.writeText(command); setCopyState(`${title}: command copied.`); }
    catch { setCopyState("Clipboard unavailable. Select and copy the displayed command manually."); }
  };
  return <>
    <header className="admin-page-heading"><div><h1>Operations</h1><p>Release identity, recent warning signals and safe diagnostic tools.</p></div><button className="admin-button admin-button--primary" onClick={() => downloadAdminJson(supportBundle(dashboard), "lieuva-support")}>Export support report</button></header>
    <div className="admin-grid admin-grid--equal">
      <section className="admin-panel"><header className="admin-panel__header"><h2>Deployed software</h2></header>
        <dl className="admin-room-meta"><div><dt>Hosting commit</dt><dd>{release.deployed ? <a href={`https://github.com/bbyw2hrnf6-boop/VirtualArtPlattform/commit/${release.deployed.commitSha}`} target="_blank" rel="noreferrer">{release.deployed.commitSha.slice(0, 12)}</a> : "Unavailable"}</dd></div>
          <div><dt>Build time</dt><dd>{release.deployed ? new Date(release.deployed.builtAt).toLocaleString() : "Unavailable"}</dd></div>
          <div><dt>Matching Verify</dt><dd>{release.matchingVerify ? <a href={release.matchingVerify.url} target="_blank" rel="noreferrer">Passed #{release.matchingVerify.runNumber}</a> : "Not found in available history"}</dd></div>
          <div><dt>Last successful deploy</dt><dd>{release.lastSuccessful ? <a href={release.lastSuccessful.url} target="_blank" rel="noreferrer">#{release.lastSuccessful.runNumber} · {release.lastSuccessful.headSha.slice(0, 7)}</a> : "Unavailable"}</dd></div>
          <div><dt>Latest deploy attempt</dt><dd>{release.latestAttempt ? <a href={release.latestAttempt.url} target="_blank" rel="noreferrer">#{release.latestAttempt.runNumber} · {release.latestAttempt.conclusion ?? release.latestAttempt.status}</a> : "Unavailable"}</dd></div></dl>
        <p className="admin-usage-note">Hosting identity is read from the deployed release file. A failed or skipped workflow does not identify the live version.</p>
      </section>
      <section className="admin-panel"><header className="admin-panel__header"><h2>Source freshness</h2></header><ul className="admin-issue-list admin-source-list">{sources.map(([label, source]) => <li key={label}><span><strong>{label} · {sourceFreshness(source, now)}</strong><small>{source ? `${new Date(source.fetchedAt).toLocaleString()} · ${source.cached ? "cached" : "fresh response"}${source.status === "unavailable" ? ` · ${source.reason}` : ""}` : "No source reported"}</small></span></li>)}</ul>
        <p className="admin-usage-note">GitHub reads are cached for five minutes to reduce rate-limit pressure. <a href="https://github.com/bbyw2hrnf6-boop/VirtualArtPlattform/actions" target="_blank" rel="noreferrer">Open Actions directly</a> if the feed is unavailable.</p>
      </section>
    </div>
    <div className="admin-grid admin-grid--equal">
      <section className="admin-panel"><header className="admin-panel__header"><div><h2>Recent Space review</h2><p>Only the latest {dashboard.content.status === "ok" ? dashboard.content.data.galleries.recent.length : "unavailable"} records; not a complete cleanup queue.</p></div></header>
        {dashboard.content.status !== "ok" ? <p>Content source unavailable.</p> : attention.length ? <ul className="admin-issue-list admin-source-list">{attention.map((space) => <li key={space.resourceRef}><span><strong>{space.reason}</strong><small>{space.resourceRef} · {space.expiresAt ? new Date(space.expiresAt).toLocaleString() : "Expiry unknown"}</small></span></li>)}</ul> : <p>No expiry or Trash warning in the available recent sample.</p>}
        <p className="admin-usage-note">Review only. Expiry, recovery windows and active leases must be checked by the trusted lifecycle worker. No content is changed here.</p>
      </section>
      <section className="admin-panel"><header className="admin-panel__header"><div><h2>Failure observations</h2><p>Last 60 minutes · at most 50 sampled events</p></div></header>
        {dashboard.telemetry.status !== "ok" ? <p>Telemetry source unavailable.</p> : failures.length ? <ul className="admin-issue-list admin-source-list">{failures.slice(0, 8).map((entry, index) => <li key={index}><span><strong>{entry.kind}</strong><small>{entry.origin ?? "Unspecified source"} · {entry.outcome ?? entry.severity} · {new Date(entry.timestamp).toLocaleString()}</small></span></li>)}</ul> : <p>No failure in the available sample. This does not establish full-service health.</p>}
      </section>
    </div>
    <section className="admin-panel"><header className="admin-panel__header"><div><h2>Diagnostic scripts</h2><p>Copy and run in the trusted local repository. These commands do not execute in your browser or on the server.</p></div></header>
      <p role="status" className="admin-copy-status">{copyState}</p><div className="admin-tool-grid">{OPERATOR_TOOLS.map((tool) => <article className="admin-tool" key={tool.title}><h3>{tool.title}</h3><p>{tool.detail}</p><code>{tool.command}</code><small>{tool.requires}</small><button className="admin-button" onClick={() => void copy(tool.command, tool.title)}>Copy {tool.title}</button></article>)}</div>
    </section>
  </>;
}
