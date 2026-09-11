import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  adminErrorMessage,
  getAdminDashboard,
  getAdminSession,
  isAdminAccessError,
  manageAdminAccess,
  runAdminChecks,
  signOutAdmin,
  subscribeAdminAuth,
} from "../../services/adminConsoleService";
import type {
  AdminCheck,
  AdminDashboard,
  AdminMember,
  AdminRole,
  AdminSession,
  AdminSource,
  AdminSourceReason,
  AdminTelemetryEntry,
  AdminView,
  ManageAdminAccessInput,
} from "../../services/adminConsoleTypes";
import "./adminConsole.css";

type AdminConsoleProps = {
  view: AdminView;
  onNavigate: (path: string) => void;
};

type GateState =
  | { status: "checking" }
  | { status: "denied"; message: string }
  | { status: "error"; message: string }
  | { status: "ready"; session: AdminSession };

type Feedback = { kind: "success" | "error"; message: string } | null;
type IconName = AdminView | "refresh" | "external" | "play" | "clock" | "warning";

const REPOSITORY_ACTIONS_URL = "https://github.com/bbyw2hrnf6-boop/VirtualArtPlattform/actions";
const FIREBASE_USAGE_URL = "https://console.firebase.google.com/project/virtualartplattform/usage/details";
const TEMPLATE_LABELS: Record<string, string> = {
  "white-cube": "White Cube",
  nocturne: "Warm Gallery",
  pavilion: "Grand Forum",
};
const NAV_ITEMS: Array<{ id: AdminView; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "diagnostics", label: "Room diagnostics" },
  { id: "tests", label: "Tests" },
  { id: "spaces", label: "Spaces" },
  { id: "creators", label: "Creators" },
  { id: "usage", label: "Usage" },
  { id: "access", label: "Access" },
];
const VIEW_TITLES: Record<AdminView, string> = Object.fromEntries(
  NAV_ITEMS.map(({ id, label }) => [id, label]),
) as Record<AdminView, string>;

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    overview: <><path d="M3 10.5 10 4l7 6.5"/><path d="M5 9.5V18h10V9.5M8 18v-5h4v5"/></>,
    diagnostics: <path d="M2 11h4l2-7 4 14 2-7h4"/>,
    tests: <><rect x="3" y="3" width="14" height="14" rx="2"/><path d="m6.5 10 2.2 2.2 4.8-5"/></>,
    spaces: <><path d="m10 2 7 4v8l-7 4-7-4V6z"/><path d="m3 6 7 4 7-4M10 10v8"/></>,
    creators: <><circle cx="7" cy="7" r="3"/><circle cx="14.5" cy="8" r="2.5"/><path d="M2 17c.5-3.3 2.1-5 5-5s4.5 1.7 5 5M12 13c3.4-.6 5.3.8 5.8 4"/></>,
    usage: <><path d="M3 17V11h3v6M9 17V5h3v12M15 17V8h3v9"/></>,
    access: <><rect x="4" y="9" width="12" height="9" rx="1"/><path d="M7 9V6a3 3 0 0 1 6 0v3"/></>,
    refresh: <><path d="M16 7V3h-4"/><path d="M16 3a7 7 0 1 0 1 9"/></>,
    external: <><path d="M11 3h6v6M17 3l-8 8"/><path d="M15 11v6H3V5h6"/></>,
    play: <path d="m7 4 9 6-9 6z"/>,
    clock: <><circle cx="10" cy="10" r="8"/><path d="M10 5v5l3 2"/></>,
    warning: <><path d="m10 2 8 15H2z"/><path d="M10 7v4M10 14h.01"/></>,
  };
  return <svg className="admin-icon" viewBox="0 0 20 20" aria-hidden="true">{paths[name]}</svg>;
}

function sourceData<T>(source: AdminSource<T>): T | null {
  return source.status === "ok" ? source.data : null;
}

function sourceReason(reason: AdminSourceReason): string {
  return ({
    configuration: "The source is not configured.",
    permission: "The source denied this read.",
    "rate-limit": "The source rate limit was reached.",
    timeout: "The source timed out.",
    upstream: "The upstream service did not respond.",
    "invalid-response": "The source returned an invalid response.",
  } satisfies Record<AdminSourceReason, string>)[reason];
}

function parseTime(value: string | null | undefined): number {
  if (!value) return Number.NaN;
  return Date.parse(value);
}

function formatTimestamp(value: string | null | undefined): string {
  const time = parseTime(value);
  if (!Number.isFinite(time)) return "Unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(time);
}

function formatClock(value: string | null | undefined): string {
  const time = parseTime(value);
  if (!Number.isFinite(time)) return "Unavailable";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(time);
}

function formatCount(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? new Intl.NumberFormat().format(value)
    : "Unavailable";
}

function formatMilliseconds(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Unavailable";
  return value >= 1_000 ? `${(value / 1_000).toFixed(value >= 10_000 ? 1 : 2)} s` : `${Math.round(value)} ms`;
}

function formatRunDuration(startedAt: string, completedAt: string): string {
  const duration = parseTime(completedAt) - parseTime(startedAt);
  return Number.isFinite(duration) && duration >= 0 ? formatMilliseconds(duration) : "Unavailable";
}

function adminPercentile75(values: Array<number | null>): number | null {
  const sorted = values
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.max(0, Math.ceil(sorted.length * .75) - 1)];
}

function filterAdminTelemetry(
  entries: AdminTelemetryEntry[],
  template: string,
  viewport: string,
): AdminTelemetryEntry[] {
  return entries.filter((entry) =>
    (template === "all" || entry.template === template) &&
    (viewport === "all" || entry.viewport === viewport),
  );
}

function isFailedObservation(entry: AdminTelemetryEntry): boolean {
  return /error|fatal/i.test(entry.severity) || /fail|error/i.test(entry.outcome ?? "");
}

function sceneSetupEntries(entries: AdminTelemetryEntry[]): AdminTelemetryEntry[] {
  return entries.filter((entry) =>
    entry.kind === "three_milestone" && entry.stage === "interactive" && entry.durationMs !== null,
  );
}

function templateLabel(template: string | null): string {
  if (!template) return "Not reported";
  return TEMPLATE_LABELS[template] ?? template;
}

function statusClass(status: string): string {
  const normalized = status.toLowerCase();
  const tone = /fail|error|unavailable|cancel|timed.out|action.required/.test(normalized)
    ? "failed"
    : /^(ok|success|passed|healthy|available|active)$/.test(normalized)
      ? "success"
      : "warning";
  return `admin-status admin-status--${tone}`;
}

function statusLabel(status: string | null | undefined): string {
  if (!status) return "Unavailable";
  return status.replaceAll("_", " ");
}

function InternalLink({ path, onNavigate, className, children }: {
  path: string;
  onNavigate: (path: string) => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      className={className}
      href={path}
      onClick={(event) => {
        event.preventDefault();
        onNavigate(path);
      }}
    >
      {children}
    </a>
  );
}

function AdminBrand({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <InternalLink className="admin-brand" path="/" onNavigate={onNavigate}>
      <span className="admin-brand__mark" aria-hidden="true">L</span>
      <span><strong>LIEUVA</strong><small>Admin console</small></span>
    </InternalLink>
  );
}

function SourceUnavailable({ source, label }: { source: AdminSource<unknown>; label: string }) {
  if (source.status === "ok") return null;
  return (
    <div className="admin-empty" role="status">
      <div>
        <h2>{label} unavailable</h2>
        <p>{sourceReason(source.reason)} No value is inferred while this source is unavailable.</p>
      </div>
    </div>
  );
}

function Stat({ label, value, note, icon }: {
  label: string;
  value: string;
  note?: string;
  icon?: IconName;
}) {
  return (
    <article className="admin-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
      {icon && <Icon name={icon} />}
    </article>
  );
}

function FeedbackNotice({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return (
    <div className={`admin-notice admin-notice--${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>
      <span className="admin-notice__symbol" aria-hidden="true">{feedback.kind === "error" ? "!" : "✓"}</span>
      <span><strong>{feedback.kind === "error" ? "Action needs attention" : "Action complete"}</strong><small>{feedback.message}</small></span>
    </div>
  );
}

function MetricChart({ entries }: { entries: AdminTelemetryEntry[] }) {
  const points = [...sceneSetupEntries(entries)].sort((a, b) => parseTime(a.timestamp) - parseTime(b.timestamp));
  if (!points.length) {
    return <div className="admin-empty"><div><h2>No scene setup timings</h2><p>No matching runtime-init-to-interactive samples were observed in this 60-minute window.</p></div></div>;
  }
  const values = points.map((entry) => entry.durationMs ?? 0);
  const maximum = Math.max(...values, 1);
  const times = points.map((entry) => parseTime(entry.timestamp));
  const firstTime = Math.min(...times);
  const timeRange = Math.max(...times) - firstTime;
  const positions = values.map((value, index) => {
    const x = Number.isFinite(timeRange) && timeRange > 0 ? 4 + ((times[index] - firstTime) / timeRange) * 92 : 50;
    const y = 92 - (value / maximum) * 78;
    return { x, y };
  });
  const coordinates = positions.map(({ x, y }) => `${x},${y}`).join(" ");
  return (
    <div className="admin-chart">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`Scene setup duration across ${points.length} observed samples`}>
        <line className="admin-chart__grid" x1="4" x2="96" y1="14" y2="14" />
        <line className="admin-chart__grid" x1="4" x2="96" y1="53" y2="53" />
        <line className="admin-chart__grid" x1="4" x2="96" y1="92" y2="92" />
        {points.length > 1 && timeRange > 0 && <polyline className="admin-chart__line admin-chart__line--accent" points={coordinates} />}
        {positions.map(({ x, y }, index) => <circle className="admin-chart__point" cx={x} cy={y} r="1.25" key={`${points[index].timestamp}-${index}`} />)}
      </svg>
      <div className="admin-chart__labels" aria-hidden="true">
        <span>{formatClock(points[0].timestamp)}</span>
        <span>Maximum {formatMilliseconds(maximum)}</span>
        <span>{formatClock(points.at(-1)?.timestamp)}</span>
      </div>
    </div>
  );
}

function PageHeading({ title, description, children }: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <header className="admin-page-heading">
      <div><h1>{title}</h1><p>{description}</p></div>
      {children && <div className="admin-actions">{children}</div>}
    </header>
  );
}

function OverviewView({ dashboard, onNavigate }: { dashboard: AdminDashboard; onNavigate: (path: string) => void }) {
  const content = sourceData(dashboard.content);
  const telemetry = sourceData(dashboard.telemetry);
  const checks = sourceData(dashboard.checks);
  const github = sourceData(dashboard.github);
  const telemetryEntries = telemetry?.recent ?? [];
  const setupP75 = adminPercentile75(sceneSetupEntries(telemetryEntries).map((entry) => entry.durationMs));
  const latestCheck = checks?.runs[0] ?? null;
  const checkPassed = latestCheck?.checks.filter((check) => check.status === "passed").length ?? null;
  const runs = github?.runs ?? [];
  const latestRelease = runs.find((run) => run.workflow === "Deploy") ?? null;
  const latestVerify = runs.find((run) => run.workflow === "Verify") ?? null;
  const failedChecks = latestCheck?.checks.filter((check) => check.status !== "passed") ?? [];
  const failedObservations = telemetryEntries.filter(isFailedObservation);
  const issues: Array<{ title: string; detail: string; at?: string; url?: string }> = [
    ...failedChecks.map((check) => ({
      title: `${check.target.replace("-", " ")} live check ${check.status}`,
      detail: `Expected HTTP ${check.expectedStatus}; observed ${check.actualStatus ?? "no response"}.`,
      at: latestCheck?.completedAt,
      url: check.url,
    })),
    ...(latestVerify && latestVerify.conclusion && latestVerify.conclusion !== "success" ? [{
      title: `Verify #${latestVerify.runNumber} ${latestVerify.conclusion}`,
      detail: `Commit ${latestVerify.headSha.slice(0, 7)} did not pass verification.`,
      at: latestVerify.updatedAt,
      url: latestVerify.url,
    }] : []),
    ...failedObservations.slice(0, 4).map((entry) => ({
      title: `${entry.kind} observation`,
      detail: [templateLabel(entry.template), entry.viewport, entry.outcome ?? entry.severity].filter(Boolean).join(" · "),
      at: entry.timestamp,
    })),
  ].slice(0, 6);
  const hasUnavailableSource = [dashboard.content, dashboard.github, dashboard.telemetry, dashboard.checks]
    .some((source) => source.status === "unavailable");
  const needsAttention = Boolean(issues.length);

  return (
    <>
      <PageHeading title="Overview" description="Observed platform signals at a glance.">
        <a className="admin-button admin-button--primary" href="https://lieuva.com/" target="_blank" rel="noreferrer">Open live site <Icon name="external" /></a>
      </PageHeading>
      <div className={`admin-notice ${needsAttention || hasUnavailableSource ? "" : "admin-notice--success"}`} role="status">
        <span className="admin-notice__symbol" aria-hidden="true">{needsAttention || hasUnavailableSource ? "!" : "✓"}</span>
        <span>
          <strong>{needsAttention ? `${issues.length} observed issue${issues.length === 1 ? "" : "s"}` : hasUnavailableSource ? "Some health sources are unavailable" : "No issue in the available signals"}</strong>
          <small>This is an operational snapshot, not a guarantee of end-user availability.</small>
        </span>
        {needsAttention && <button className="admin-button" type="button" onClick={() => onNavigate("/admin/tests")}>View tests →</button>}
      </div>
      <section className="admin-stat-grid" aria-label="Platform summary">
        <Stat label="Spaces" value={formatCount(content?.galleries.total)} note={dashboard.content.status === "ok" ? "Stored gallery records" : "Content source unavailable"} icon="spaces" />
        <Stat label="Creators" value={formatCount(content?.creators.total)} note={dashboard.content.status === "ok" ? "Stored creator records" : "Content source unavailable"} icon="creators" />
        <Stat label="Scene setup · p75" value={formatMilliseconds(setupP75)} note="Runtime init → interactive · last 60 min" icon="clock" />
        <Stat label="Live checks passed" value={latestCheck ? `${checkPassed}/${latestCheck.checks.length}` : "Unavailable"} note={latestCheck ? formatTimestamp(latestCheck.completedAt) : "No completed run"} icon="tests" />
      </section>
      <div className="admin-grid">
        <section className="admin-panel">
          <header className="admin-panel__header">
            <div><h2>Scene setup observations</h2><p>Client-reported sample · last 60 minutes · maximum 50 entries</p></div>
            <button className="admin-button" type="button" onClick={() => onNavigate("/admin/diagnostics")}>Diagnostics →</button>
          </header>
          {dashboard.telemetry.status === "ok"
            ? <MetricChart entries={telemetryEntries} />
            : <SourceUnavailable source={dashboard.telemetry} label="Telemetry" />}
        </section>
        <section className="admin-panel admin-release">
          <h2>Latest deploy run</h2>
          {dashboard.github.status === "unavailable"
            ? <SourceUnavailable source={dashboard.github} label="GitHub" />
            : latestRelease ? <>
              <strong className="admin-release__version">#{latestRelease.runNumber}</strong>
              <span className="admin-release__meta">Commit {latestRelease.headSha.slice(0, 7)} · {formatTimestamp(latestRelease.updatedAt)}</span>
              <ul className="admin-status-list">
                <li><span>Deploy workflow</span><span className={statusClass(latestRelease.conclusion ?? latestRelease.status)}>{statusLabel(latestRelease.conclusion ?? latestRelease.status)}</span></li>
                {latestVerify && <li><span>Latest verification</span><span className={statusClass(latestVerify.conclusion ?? latestVerify.status)}>{statusLabel(latestVerify.conclusion ?? latestVerify.status)}</span></li>}
              </ul>
              <a className="admin-button" href={latestRelease.url} target="_blank" rel="noreferrer">View run <Icon name="external" /></a>
            </> : <div className="admin-empty"><div><h2>No deploy run</h2><p>GitHub returned no deploy workflow run in the bounded history.</p></div></div>}
          <ul className="admin-status-list" aria-label="Source availability">
            {([
              ["Content", dashboard.content],
              ["GitHub", dashboard.github],
              ["Telemetry", dashboard.telemetry],
              ["Live checks", dashboard.checks],
            ] as Array<[string, AdminSource<unknown>]>).map(([label, source]) => (
              <li key={label}><span>{label}</span><span className={statusClass(source.status)}>{source.status}</span></li>
            ))}
          </ul>
        </section>
      </div>
      <div className="admin-grid admin-grid--equal">
        <section className="admin-panel">
          <header className="admin-panel__header"><div><h2>Template observations</h2><p>Counts within the bounded telemetry sample</p></div></header>
          {dashboard.telemetry.status === "ok" ? (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>Room</th><th>Events</th><th>Scene setup p75</th><th>Errors</th></tr></thead>
                <tbody>
                  {Object.entries(TEMPLATE_LABELS).map(([template, label]) => {
                    const rows = telemetryEntries.filter((entry) => entry.template === template);
                    return <tr key={template}><td>{label}</td><td>{rows.length}</td><td>{formatMilliseconds(adminPercentile75(sceneSetupEntries(rows).map((entry) => entry.durationMs)))}</td><td>{rows.filter(isFailedObservation).length}</td></tr>;
                  })}
                </tbody>
              </table>
            </div>
          ) : <SourceUnavailable source={dashboard.telemetry} label="Telemetry" />}
        </section>
        <section className="admin-panel">
          <header className="admin-panel__header"><div><h2>Recent issues</h2><p>Latest checks, workflow runs, and sampled telemetry</p></div></header>
          {issues.length ? <ul className="admin-issue-list">
            {issues.map((issue, index) => <li key={`${issue.title}-${index}`}>
              {issue.url ? <a href={issue.url} target="_blank" rel="noreferrer"><strong>{issue.title}</strong><small>{issue.detail}</small><time>{formatTimestamp(issue.at)}</time></a>
                : <span><strong>{issue.title}</strong><small>{issue.detail}</small><time>{formatTimestamp(issue.at)}</time></span>}
            </li>)}
          </ul> : <div className="admin-empty"><div><h2>No observed issue</h2><p>The currently available bounded signals contain no failure.</p></div></div>}
        </section>
      </div>
    </>
  );
}

function DiagnosticsView({ dashboard }: { dashboard: AdminDashboard }) {
  const [template, setTemplate] = useState("all");
  const [viewport, setViewport] = useState("all");
  const telemetry = sourceData(dashboard.telemetry);
  const reportedViewports = [...new Set((telemetry?.recent ?? []).map((entry) => entry.viewport).filter((value): value is "mobile" | "desktop" => Boolean(value)))];
  const entries = useMemo(
    () => filterAdminTelemetry(telemetry?.recent ?? [], template, viewport),
    [telemetry, template, viewport],
  );
  const setup = sceneSetupEntries(entries);
  const p75 = adminPercentile75(setup.map((entry) => entry.durationMs));
  const failures = entries.filter(isFailedObservation);

  const exportDiagnostics = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      sourceFetchedAt: dashboard.telemetry.fetchedAt,
      windowMinutes: telemetry?.windowMinutes ?? 60,
      sampleLimit: telemetry?.sampleLimit ?? 50,
      filters: { template, viewport },
      entries,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `lieuva-diagnostics-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <>
      <PageHeading title="Room diagnostics" description="Privacy-bounded client telemetry by template and viewport.">
        <div className="admin-filter-group">
          <select className="admin-select" aria-label="Room template" value={template} onChange={(event) => setTemplate(event.target.value)} disabled={!telemetry}>
            <option value="all">All templates</option>
            {Object.entries(TEMPLATE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select className="admin-select" aria-label="Viewport" value={viewport} onChange={(event) => setViewport(event.target.value)} disabled={!telemetry || !reportedViewports.length}>
            <option value="all">All devices</option>{reportedViewports.map((value) => <option key={value} value={value}>{value === "mobile" ? "Mobile" : "Desktop"}</option>)}
          </select>
          <span className="admin-environment">Last 60 min</span>
        </div>
      </PageHeading>
      {dashboard.telemetry.status === "unavailable" ? <section className="admin-panel"><SourceUnavailable source={dashboard.telemetry} label="Room diagnostics" /></section> : <>
        <div className="admin-test-context"><strong>Observed sample</strong><span>Maximum {telemetry?.sampleLimit} entries from the last {telemetry?.windowMinutes} minutes. Values are client-reported and may not represent all visits.</span></div>
        <section className="admin-stat-grid" aria-label="Filtered diagnostic summary">
          <Stat label="Scene setup · p75" value={formatMilliseconds(p75)} note="Runtime init → interactive" icon="clock" />
          <Stat label="Median FPS" value="Unavailable" note="FPS is not collected" icon="diagnostics" />
          <Stat label="Error observations" value={formatCount(failures.length)} note={`Within ${entries.length} matching events`} icon="warning" />
          <Stat label="Matching events" value={formatCount(entries.length)} note={`Of ${telemetry?.sampledEntries ?? 0} sampled`} icon="usage" />
        </section>
        <div className="admin-grid">
          <section className="admin-panel">
            <header className="admin-panel__header"><div><h2>Scene setup duration</h2><p>Observed runtime-init-to-interactive measurements; not full room readiness</p></div></header>
            <MetricChart entries={entries} />
          </section>
          <section className="admin-panel">
            <header className="admin-panel__header"><div><h2>Selected scope</h2><p>Current local filters</p></div></header>
            <dl className="admin-room-meta">
              <div><dt>Template</dt><dd>{template === "all" ? "All reported" : templateLabel(template)}</dd></div>
              <div><dt>Viewport</dt><dd>{viewport === "all" ? "All reported" : viewport}</dd></div>
              <div><dt>Runtimes reported</dt><dd>{new Set(entries.map((entry) => entry.runtime).filter(Boolean)).size || "None reported"}</dd></div>
              <div><dt>Source fetched</dt><dd>{formatTimestamp(dashboard.telemetry.fetchedAt)}</dd></div>
              <div><dt>Cache</dt><dd>{dashboard.telemetry.cached ? "Cached response" : "Live response"}</dd></div>
            </dl>
            <p className="admin-usage-note"><strong>Scope:</strong> No seven-day history, asset sizes, or FPS series is available from this source. Those values are deliberately left unavailable.</p>
          </section>
        </div>
        <section className="admin-panel">
          <header className="admin-panel__header">
            <div><h2>Recent observations</h2><p>Newest matching entries in the bounded sample</p></div>
            <button className="admin-button admin-button--dark" type="button" onClick={exportDiagnostics}>Export JSON</button>
          </header>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Time</th><th>Kind / stage</th><th>Template</th><th>Runtime</th><th>Viewport</th><th>Duration</th><th>Outcome</th></tr></thead>
              <tbody>{entries.length ? entries.map((entry, index) => <tr key={`${entry.timestamp}-${entry.kind}-${index}`}>
                <td>{formatTimestamp(entry.timestamp)}</td><td><span className="admin-table__title"><strong>{entry.kind}</strong><small>{entry.stage ?? "No stage"}</small></span></td><td>{templateLabel(entry.template)}</td><td>{entry.runtime ?? "Not reported"}</td><td>{entry.viewport ?? "Not reported"}</td><td>{formatMilliseconds(entry.durationMs)}</td><td><span className={statusClass(isFailedObservation(entry) ? "failed" : entry.outcome ?? entry.severity)}>{statusLabel(entry.outcome ?? entry.severity)}</span></td>
              </tr>) : <tr><td className="admin-table__empty" colSpan={7}>No observation matches these filters.</td></tr>}</tbody>
            </table>
          </div>
        </section>
      </>}
    </>
  );
}

function checkLabel(check: AdminCheck): string {
  return ({ home: "Home page", creators: "Creator directory", sitemap: "Sitemap", "missing-space": "Missing Space response" })[check.target];
}

function TestsView({ dashboard, busy, feedback, onRun }: {
  dashboard: AdminDashboard;
  busy: boolean;
  feedback: Feedback;
  onRun: () => void;
}) {
  const checks = sourceData(dashboard.checks);
  const latest = checks?.runs[0] ?? null;
  const passed = latest?.checks.filter((check) => check.status === "passed").length ?? null;
  const failed = latest?.checks.filter((check) => check.status === "failed").length ?? null;
  const unavailable = latest?.checks.filter((check) => check.status === "unavailable").length ?? null;
  const github = sourceData(dashboard.github);
  const verifyRuns = github?.runs.filter((run) => run.workflow === "Verify") ?? [];

  return (
    <>
      <PageHeading title="Tests" description="Run bounded live endpoint checks and inspect GitHub verification.">
        <a className="admin-button" href={REPOSITORY_ACTIONS_URL} target="_blank" rel="noreferrer">View CI history</a>
        <button className="admin-button admin-button--primary" type="button" onClick={onRun} disabled={busy}><Icon name="play" />{busy ? "Running…" : "Run checks"}</button>
      </PageHeading>
      <FeedbackNotice feedback={feedback} />
      <div className="admin-test-context"><strong>Production</strong><span>Live checks make bounded HTTP requests to public LIEUVA endpoints. Browser rendering and interaction remain covered by GitHub CI.</span></div>
      {dashboard.checks.status === "unavailable" ? <section className="admin-panel"><SourceUnavailable source={dashboard.checks} label="Live checks" /></section> : <>
        <section className="admin-stat-grid" aria-label="Latest live check run">
          <Stat label="Latest run" value={latest ? `#${latest.id}` : "Unavailable"} note={latest ? formatTimestamp(latest.completedAt) : "No completed run"} />
          <Stat label="Passed" value={formatCount(passed)} note={latest ? `Of ${latest.checks.length} checks` : "No completed run"} icon="tests" />
          <Stat label="Failed / unavailable" value={latest ? `${failed}/${unavailable}` : "Unavailable"} note="Failures / no response" icon="warning" />
          <Stat label="Duration" value={latest ? formatRunDuration(latest.startedAt, latest.completedAt) : "Unavailable"} note="Server-side live check run" icon="clock" />
        </section>
        <div className="admin-grid">
          <section className="admin-panel">
            <header className="admin-panel__header"><div><h2>Latest endpoint run</h2><p>{latest ? formatTimestamp(latest.completedAt) : "No completed check run"}</p></div></header>
            {latest ? <ul className="admin-check-list">
              {latest.checks.map((check) => <li key={check.target} data-status={check.status}>
                <span><strong>{checkLabel(check)}</strong></span><span><small>HTTP {check.actualStatus ?? "no response"} / expected {check.expectedStatus}</small></span><span className={statusClass(check.status)}>{check.status} · {formatMilliseconds(check.durationMs)}</span>
              </li>)}
            </ul> : <div className="admin-empty"><div><h2>No live check yet</h2><p>Run live checks to observe the configured production endpoints.</p></div></div>}
          </section>
          <section className="admin-panel">
            <header className="admin-panel__header"><div><h2>GitHub verification</h2><p>Recent Verify workflow runs</p></div></header>
            {dashboard.github.status === "unavailable" ? <SourceUnavailable source={dashboard.github} label="GitHub" /> : verifyRuns.length ? <ul className="admin-issue-list">
              {verifyRuns.slice(0, 6).map((run) => <li key={run.runNumber}><a href={run.url} target="_blank" rel="noreferrer"><strong>Verify #{run.runNumber} · {run.headSha.slice(0, 7)}</strong><small>{statusLabel(run.conclusion ?? run.status)}</small><time>{formatTimestamp(run.updatedAt)}</time></a></li>)}
            </ul> : <div className="admin-empty"><div><h2>No Verify run</h2><p>GitHub returned no verification workflow in this bounded history.</p></div></div>}
          </section>
        </div>
        <section className="admin-panel">
          <header className="admin-panel__header"><div><h2>Recent live runs</h2><p>Up to {checks?.historyLimit} server-recorded runs</p></div></header>
          <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Run</th><th>Completed</th><th>Result</th><th>Checks</th><th>Duration</th></tr></thead><tbody>
            {checks?.runs.length ? checks.runs.map((run) => <tr key={run.id}><td>{run.id}</td><td>{formatTimestamp(run.completedAt)}</td><td><span className={statusClass(run.overall)}>{run.overall}</span></td><td>{run.checks.filter((check) => check.status === "passed").length}/{run.checks.length}</td><td>{formatRunDuration(run.startedAt, run.completedAt)}</td></tr>)
              : <tr><td className="admin-table__empty" colSpan={5}>No check history is available.</td></tr>}
          </tbody></table></div>
        </section>
      </>}
    </>
  );
}

function SpacesView({ dashboard }: { dashboard: AdminDashboard }) {
  const [query, setQuery] = useState("");
  const content = sourceData(dashboard.content);
  const spaces = content?.galleries.recent ?? [];
  const normalized = query.trim().toLowerCase();
  const visible = spaces.filter((space) => !normalized || [space.resourceRef, space.visibility, space.lifecycleStatus, space.templateId ?? ""].some((value) => value.toLowerCase().includes(normalized)));
  return (
    <>
      <PageHeading title="Spaces" description="Bounded operational metadata; artwork and private content are not exposed.">
        <input className="admin-input" type="search" aria-label="Filter recent Spaces" placeholder="Filter recent Spaces" value={query} onChange={(event) => setQuery(event.target.value)} disabled={!content} />
      </PageHeading>
      {dashboard.content.status === "unavailable" ? <section className="admin-panel"><SourceUnavailable source={dashboard.content} label="Space metadata" /></section> : <>
        <section className="admin-stat-grid">
          <Stat label="Stored Spaces" value={formatCount(content?.galleries.total)} note="Gallery records" icon="spaces" />
          <Stat label="Recent sample" value={formatCount(spaces.length)} note={`Maximum ${content?.galleries.recentLimit}`} />
          <Stat label="Public in sample" value={formatCount(spaces.filter((space) => space.visibility === "public").length)} note="Not a platform-wide total" />
          <Stat label="Templates represented" value={formatCount(new Set(spaces.map((space) => space.templateId).filter(Boolean)).size)} note="Within recent sample" />
        </section>
        <section className="admin-panel">
          <header className="admin-panel__header"><div><h2>Recently updated Space records</h2><p>Showing {visible.length} of {spaces.length} recent records; total count {formatCount(content?.galleries.total)}</p></div></header>
          <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Resource</th><th>Template</th><th>Visibility</th><th>Lifecycle</th><th>Revision</th><th>Updated</th><th>Expiry</th></tr></thead><tbody>
            {visible.length ? visible.map((space) => <tr key={space.resourceRef}><td>{space.resourceRef}</td><td>{templateLabel(space.templateId)}</td><td>{statusLabel(space.visibility)}</td><td><span className={statusClass(space.lifecycleStatus)}>{statusLabel(space.lifecycleStatus)}</span></td><td>{space.revision ?? "Unavailable"}</td><td>{formatTimestamp(space.updatedAt)}</td><td>{space.expiresAt ? formatTimestamp(space.expiresAt) : "Not set"}</td></tr>)
              : <tr><td className="admin-table__empty" colSpan={7}>{spaces.length ? "No recent Space matches this filter." : "No recent Space metadata was returned."}</td></tr>}
          </tbody></table></div>
        </section>
      </>}
    </>
  );
}

function CreatorsView({ dashboard }: { dashboard: AdminDashboard }) {
  const [query, setQuery] = useState("");
  const content = sourceData(dashboard.content);
  const creators = content?.creators.recent ?? [];
  const normalized = query.trim().toLowerCase();
  const visible = creators.filter((creator) => !normalized || [creator.resourceRef, creator.handle ?? "", creator.isPublic ? "public" : "private"].some((value) => value.toLowerCase().includes(normalized)));
  return (
    <>
      <PageHeading title="Creators" description="Recent profile metadata without private profile fields.">
        <input className="admin-input" type="search" aria-label="Filter recent creators" placeholder="Filter recent creators" value={query} onChange={(event) => setQuery(event.target.value)} disabled={!content} />
      </PageHeading>
      {dashboard.content.status === "unavailable" ? <section className="admin-panel"><SourceUnavailable source={dashboard.content} label="Creator metadata" /></section> : <>
        <section className="admin-stat-grid">
          <Stat label="Creator records" value={formatCount(content?.creators.total)} note="Stored creator profiles" icon="creators" />
          <Stat label="Recent sample" value={formatCount(creators.length)} note={`Maximum ${content?.creators.recentLimit}`} />
          <Stat label="Public in sample" value={formatCount(creators.filter((creator) => creator.isPublic).length)} note="Not a platform-wide total" />
          <Stat label="Private in sample" value={formatCount(creators.filter((creator) => !creator.isPublic).length)} note="Metadata only" />
        </section>
        <section className="admin-panel">
          <header className="admin-panel__header"><div><h2>Recently updated creator records</h2><p>Showing {visible.length} of {creators.length} recent records; total count {formatCount(content?.creators.total)}</p></div></header>
          <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Resource</th><th>Handle</th><th>Directory status</th><th>Updated</th></tr></thead><tbody>
            {visible.length ? visible.map((creator) => <tr key={creator.resourceRef}><td>{creator.resourceRef}</td><td>{creator.handle ?? "Not set"}</td><td><span className={statusClass(creator.isPublic ? "available" : "pending")}>{creator.isPublic ? "Public" : "Not public"}</span></td><td>{formatTimestamp(creator.updatedAt)}</td></tr>)
              : <tr><td className="admin-table__empty" colSpan={4}>{creators.length ? "No recent creator matches this filter." : "No recent creator metadata was returned."}</td></tr>}
          </tbody></table></div>
        </section>
      </>}
    </>
  );
}

function UsageView({ dashboard }: { dashboard: AdminDashboard }) {
  const content = sourceData(dashboard.content);
  const telemetry = sourceData(dashboard.telemetry);
  const github = sourceData(dashboard.github);
  return (
    <>
      <PageHeading title="Usage" description="Measured record and sample counts; billing totals remain in Firebase.">
        <a className="admin-button admin-button--primary" href={FIREBASE_USAGE_URL} target="_blank" rel="noreferrer">Open Firebase usage <Icon name="external" /></a>
      </PageHeading>
      <section className="admin-stat-grid">
        <Stat label="Space records" value={formatCount(content?.galleries.total)} note={dashboard.content.status === "ok" ? "Measured content count" : "Source unavailable"} icon="spaces" />
        <Stat label="Creator records" value={formatCount(content?.creators.total)} note={dashboard.content.status === "ok" ? "Measured content count" : "Source unavailable"} icon="creators" />
        <Stat label="Telemetry sample" value={formatCount(telemetry?.sampledEntries)} note={telemetry ? `Last ${telemetry.windowMinutes} min · max ${telemetry.sampleLimit}` : "Source unavailable"} icon="usage" />
        <Stat label="Workflow sample" value={formatCount(github?.runs.length)} note={github ? "Bounded GitHub run history" : "Source unavailable"} icon="tests" />
      </section>
      <div className="admin-grid admin-grid--equal">
        <section className="admin-panel">
          <header className="admin-panel__header"><div><h2>Telemetry kinds</h2><p>Counts in the returned 60-minute sample</p></div></header>
          {dashboard.telemetry.status === "unavailable" ? <SourceUnavailable source={dashboard.telemetry} label="Telemetry usage" /> : Object.keys(telemetry?.byKind ?? {}).length ? <ul className="admin-status-list">
            {Object.entries(telemetry?.byKind ?? {}).sort((a, b) => b[1] - a[1]).map(([kind, count]) => <li key={kind}><span>{kind}</span><strong>{formatCount(count)}</strong></li>)}
          </ul> : <div className="admin-empty"><div><h2>No sampled events</h2><p>No event kind was returned in the current window.</p></div></div>}
        </section>
        <section className="admin-panel">
          <header className="admin-panel__header"><div><h2>Telemetry outcomes</h2><p>Reported outcomes in the returned sample</p></div></header>
          {dashboard.telemetry.status === "unavailable" ? <SourceUnavailable source={dashboard.telemetry} label="Telemetry outcomes" /> : Object.keys(telemetry?.byOutcome ?? {}).length ? <ul className="admin-status-list">
            {Object.entries(telemetry?.byOutcome ?? {}).sort((a, b) => b[1] - a[1]).map(([outcome, count]) => <li key={outcome}><span>{outcome}</span><strong>{formatCount(count)}</strong></li>)}
          </ul> : <div className="admin-empty"><div><h2>No reported outcome</h2><p>No outcome was returned in the current window.</p></div></div>}
        </section>
      </div>
      <p className="admin-usage-note"><strong>No invoice estimate is calculated here.</strong> Firestore reads, Storage transfer, Hosting bandwidth, Functions invocations, and billing periods are not present in this snapshot. Use the linked Firebase console for provider-measured usage and charges.</p>
    </>
  );
}

function AccessView({ dashboard, session, busyKey, feedback, onManage }: {
  dashboard: AdminDashboard;
  session: AdminSession;
  busyKey: string | null;
  feedback: Feedback;
  onManage: (input: ManageAdminAccessInput) => Promise<boolean>;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRole>("admin");
  const access = dashboard.access && sourceData(dashboard.access);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (await onManage({ action: "grant", email: email.trim(), role })) setEmail("");
  };
  const revoke = (member: AdminMember) => {
    if (window.confirm(`Revoke ${member.email}'s administrator access?`)) void onManage({ action: "revoke", uid: member.uid });
  };
  return (
    <>
      <PageHeading title="Access" description="Server-authorized administrator membership and roles." />
      <FeedbackNotice feedback={feedback} />
      {!session.canManageAccess || dashboard.access === null ? <section className="admin-panel"><div className="admin-empty"><div><h2>Owner access required</h2><p>Your administrator role can view operational data, but only an owner can list or change administrator access.</p></div></div></section>
        : dashboard.access.status === "unavailable" ? <section className="admin-panel"><SourceUnavailable source={dashboard.access} label="Access membership" /></section>
          : <>
            <form className="admin-access-form" onSubmit={submit}>
              <label className="admin-field">Existing account email<input className="admin-input" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} disabled={Boolean(busyKey)} /></label>
              <label className="admin-field">Role<select className="admin-select" value={role} onChange={(event) => setRole(event.target.value as AdminRole)} disabled={Boolean(busyKey)}><option value="admin">Administrator</option><option value="owner">Owner</option></select></label>
              <button className="admin-button admin-button--primary" type="submit" disabled={Boolean(busyKey) || !email.trim()}>{busyKey === "grant" ? "Granting…" : "Grant access"}</button>
            </form>
            <section className="admin-panel">
              <header className="admin-panel__header"><div><h2>Administrators</h2><p>{access?.members.length ?? 0} of at most {access?.memberLimit ?? 100} returned memberships</p></div></header>
              <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Account</th><th>Role</th><th>Status</th><th>Updated</th><th>Actions</th></tr></thead><tbody>
                {access?.members.length ? access.members.map((member) => {
                  const self = member.uid === session.principal.uid;
                  return <tr key={member.uid}><td><span className="admin-table__title"><strong>{member.displayName || member.email}</strong><small>{member.email}{self ? " · current session" : ""}</small></span></td><td>{member.role}</td><td><span className={statusClass(member.active ? "available" : "unavailable")}>{member.active ? "Active" : "Inactive"}</span></td><td>{formatTimestamp(member.updatedAt)}</td><td><div className="admin-actions">
                    <button className="admin-button" type="button" disabled={Boolean(busyKey) || self} onClick={() => void onManage(member.active
                      ? { action: "set-role", uid: member.uid, role: member.role === "owner" ? "admin" : "owner" }
                      : { action: "grant", email: member.email, role: "admin" })}>{busyKey === member.uid ? "Saving…" : !member.active ? "Reactivate as admin" : member.role === "owner" ? "Make admin" : "Make owner"}</button>
                    <button className="admin-button admin-button--danger" type="button" disabled={Boolean(busyKey) || self || !member.active} onClick={() => revoke(member)}>Revoke</button>
                  </div></td></tr>;
                }) : <tr><td className="admin-table__empty" colSpan={5}>No access memberships were returned.</td></tr>}
              </tbody></table></div>
            </section>
            <p className="admin-usage-note"><strong>Recent authentication required:</strong> Role and membership changes may ask you to sign out and back in. The server prevents self-removal and removal of the last owner.</p>
          </>}
    </>
  );
}

function LoadingOrError({ loading, error, onRetry }: { loading: boolean; error: string | null; onRetry: () => void }) {
  return <section className="admin-panel"><div className="admin-empty" role="status"><div>{loading && <span className="admin-loader" aria-hidden="true" />}<h2>{loading ? "Loading operational sources" : "Dashboard unavailable"}</h2><p>{loading ? "The server-authorized dashboard is being requested." : error ?? "No dashboard response was returned."}</p>{!loading && <button className="admin-button admin-button--dark" type="button" onClick={onRetry}>Retry</button>}</div></div></section>;
}

function AdminGate({ state, onNavigate, onRetry }: {
  state: Exclude<GateState, { status: "ready" }>;
  onNavigate: (path: string) => void;
  onRetry: () => void;
}) {
  const checking = state.status === "checking";
  return (
    <main className="admin-console admin-gate" aria-busy={checking}>
      <header className="admin-gate__brand"><AdminBrand onNavigate={onNavigate} /></header>
      <section className="admin-gate__body">
        {checking && <span className="admin-loader" aria-hidden="true" />}
        <p className="eyebrow">Server-authorized workspace</p>
        <h1>{checking ? "Checking access" : state.status === "denied" ? "Access denied" : "Admin unavailable"}</h1>
        <p>{checking ? "Your signed-in session is being verified before any administration data is loaded." : state.message}</p>
        {!checking && <div className="admin-gate__actions">
          <InternalLink className="admin-button admin-button--dark" path="/account" onNavigate={onNavigate}>Account settings</InternalLink>
          {state.status === "error" && <button className="admin-button" type="button" onClick={onRetry}>Retry access check</button>}
          <InternalLink className="admin-button" path="/" onNavigate={onNavigate}>Return to site</InternalLink>
        </div>}
      </section>
    </main>
  );
}

export default function AdminConsole({ view, onNavigate }: AdminConsoleProps) {
  const [gate, setGate] = useState<GateState>({ status: "checking" });
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [authAttempt, setAuthAttempt] = useState(0);
  const authEpoch = useRef(0);
  const dashboardEpoch = useRef(0);
  const sessionRef = useRef<AdminSession | null>(null);

  const invalidateAccess = useCallback((message: string) => {
    authEpoch.current += 1;
    dashboardEpoch.current += 1;
    sessionRef.current = null;
    setDashboard(null);
    setDashboardLoading(false);
    setDashboardError(null);
    setFeedback(null);
    setBusyKey(null);
    setGate({ status: "denied", message });
  }, []);

  const loadDashboard = useCallback(async (silent = false) => {
    if (!sessionRef.current) return;
    const currentAuth = authEpoch.current;
    const request = ++dashboardEpoch.current;
    if (!silent) setDashboardLoading(true);
    setDashboardError(null);
    try {
      const [nextSession, next] = await Promise.all([getAdminSession(), getAdminDashboard()]);
      if (currentAuth !== authEpoch.current || request !== dashboardEpoch.current || !sessionRef.current) return;
      if (!nextSession || nextSession.principal.uid !== sessionRef.current.principal.uid) {
        invalidateAccess("This account does not have active administrator access.");
        return;
      }
      sessionRef.current = nextSession;
      setGate({ status: "ready", session: nextSession });
      setDashboard(nextSession.canManageAccess ? next : { ...next, access: null });
    } catch (error) {
      if (currentAuth !== authEpoch.current || request !== dashboardEpoch.current) return;
      if (isAdminAccessError(error)) {
        invalidateAccess(adminErrorMessage(error));
        return;
      }
      setDashboardError(adminErrorMessage(error));
    } finally {
      if (currentAuth === authEpoch.current && request === dashboardEpoch.current) setDashboardLoading(false);
    }
  }, [invalidateAccess]);

  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeAdminAuth((account) => {
      const request = ++authEpoch.current;
      dashboardEpoch.current += 1;
      sessionRef.current = null;
      setDashboard(null);
      setDashboardError(null);
      setFeedback(null);
      setBusyKey(null);
      if (!account || account.isAnonymous || !account.emailVerified) {
        setGate({
          status: "denied",
          message: account && !account.emailVerified
            ? "Verify the signed-in email address before requesting administrator access."
            : "Sign in with a verified account that has an active administrator membership.",
        });
        return;
      }
      setGate({ status: "checking" });
      void getAdminSession().then((session) => {
        if (!active || request !== authEpoch.current) return;
        if (!session) {
          invalidateAccess("This account does not have active administrator access.");
          return;
        }
        sessionRef.current = session;
        setGate({ status: "ready", session });
        void loadDashboard();
      }).catch((error) => {
        if (!active || request !== authEpoch.current) return;
        sessionRef.current = null;
        setGate({ status: "error", message: adminErrorMessage(error) });
      });
    });
    return () => {
      active = false;
      authEpoch.current += 1;
      dashboardEpoch.current += 1;
      sessionRef.current = null;
      unsubscribe();
    };
  }, [authAttempt, invalidateAccess, loadDashboard]);

  useEffect(() => {
    if (gate.status !== "ready") return;
    const refreshVisible = () => {
      if (document.visibilityState === "visible") void loadDashboard(true);
    };
    const interval = window.setInterval(refreshVisible, 60_000);
    window.addEventListener("focus", refreshVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshVisible);
    };
  }, [gate.status, loadDashboard]);

  const handleActionError = useCallback((error: unknown) => {
    if (isAdminAccessError(error)) {
      invalidateAccess(adminErrorMessage(error));
      return;
    }
    setFeedback({ kind: "error", message: adminErrorMessage(error) });
  }, [invalidateAccess]);

  const handleRunChecks = async () => {
    const requestAuth = authEpoch.current;
    setBusyKey("checks");
    setFeedback(null);
    try {
      const response = await runAdminChecks();
      if (requestAuth !== authEpoch.current) return;
      setDashboard((current) => {
        if (!current) return current;
        const previous = current.checks.status === "ok" ? current.checks.data.runs : [];
        const historyLimit = current.checks.status === "ok" ? current.checks.data.historyLimit : 10;
        return {
          ...current,
          generatedAt: response.run.completedAt,
          checks: {
            status: "ok",
            fetchedAt: response.run.completedAt,
            cached: false,
            data: {
              historyLimit,
              runs: [response.run, ...previous.filter((run) => run.id !== response.run.id)].slice(0, historyLimit),
            },
          },
        };
      });
      setFeedback({
        kind: response.run.overall === "passed" ? "success" : "error",
        message: `Live checks completed: ${response.run.checks.filter((check) => check.status === "passed").length} of ${response.run.checks.length} passed.`,
      });
    } catch (error) {
      if (requestAuth === authEpoch.current) handleActionError(error);
    } finally {
      if (requestAuth === authEpoch.current) setBusyKey(null);
    }
  };

  const handleManageAccess = async (input: ManageAdminAccessInput): Promise<boolean> => {
    const requestAuth = authEpoch.current;
    const key = input.action === "grant" ? "grant" : input.uid;
    setBusyKey(key);
    setFeedback(null);
    try {
      const response = await manageAdminAccess(input);
      if (requestAuth !== authEpoch.current) return false;
      setFeedback({ kind: "success", message: response.changed ? "Administrator access was updated." : "The requested membership was already up to date." });
      await loadDashboard(true);
      return true;
    } catch (error) {
      if (requestAuth === authEpoch.current) handleActionError(error);
      return false;
    } finally {
      if (requestAuth === authEpoch.current) setBusyKey(null);
    }
  };

  if (gate.status !== "ready") {
    return <AdminGate state={gate} onNavigate={onNavigate} onRetry={() => setAuthAttempt((attempt) => attempt + 1)} />;
  }

  const renderView = () => {
    if (!dashboard) return <LoadingOrError loading={dashboardLoading} error={dashboardError} onRetry={() => void loadDashboard()} />;
    switch (view) {
      case "overview": return <OverviewView dashboard={dashboard} onNavigate={onNavigate} />;
      case "diagnostics": return <DiagnosticsView dashboard={dashboard} />;
      case "tests": return <TestsView dashboard={dashboard} busy={busyKey === "checks"} feedback={feedback} onRun={() => void handleRunChecks()} />;
      case "spaces": return <SpacesView dashboard={dashboard} />;
      case "creators": return <CreatorsView dashboard={dashboard} />;
      case "usage": return <UsageView dashboard={dashboard} />;
      case "access": return <AccessView dashboard={dashboard} session={gate.session} busyKey={busyKey} feedback={feedback} onManage={handleManageAccess} />;
    }
  };
  const identity = gate.session.principal.displayName || gate.session.principal.email;
  const avatar = identity.slice(0, 1).toUpperCase();
  const updatedAt = dashboard?.generatedAt ?? gate.session.generatedAt;

  return (
    <main className="admin-console">
      <div className="admin-shell">
        <aside className="admin-sidebar" aria-label="Admin console navigation">
          <AdminBrand onNavigate={onNavigate} />
          <InternalLink className="admin-back-link" path="/account" onNavigate={onNavigate}><span aria-hidden="true">←</span> Account settings</InternalLink>
          <nav className="admin-nav">
            {NAV_ITEMS.map((item) => <a key={item.id} href={`/admin/${item.id}`} aria-current={view === item.id ? "page" : undefined} onClick={(event) => { event.preventDefault(); onNavigate(`/admin/${item.id}`); }}><Icon name={item.id} />{item.label}</a>)}
          </nav>
          <footer className="admin-sidebar__footer">
            <div className="admin-identity"><span className="admin-avatar" aria-hidden="true">{avatar}</span><span><strong>{identity}</strong><small>{gate.session.principal.role}</small></span></div>
            <button className="admin-sign-out" type="button" onClick={() => void signOutAdmin()}><span aria-hidden="true">↪</span> Sign out</button>
          </footer>
        </aside>
        <section className="admin-workspace" aria-label={VIEW_TITLES[view]}>
          <header className="admin-topbar">
            <nav className="admin-breadcrumbs" aria-label="Breadcrumb">
              <InternalLink path="/account" onNavigate={onNavigate}>Account settings</InternalLink><i aria-hidden="true">/</i><span>Admin console</span><i aria-hidden="true">/</i><strong>{VIEW_TITLES[view]}</strong>
            </nav>
            <div className="admin-topbar__meta">
              <span className="admin-environment">Production</span>
              <span>Updated {formatClock(updatedAt)}</span>
              <button className="admin-button" type="button" aria-label="Refresh admin data" onClick={() => void loadDashboard()} disabled={dashboardLoading}><Icon name="refresh" /> Refresh</button>
              <span className="admin-avatar" aria-label={`${identity}, ${gate.session.principal.role}`}>{avatar}</span>
              <button className="admin-button admin-mobile-sign-out" type="button" aria-label="Sign out" onClick={() => void signOutAdmin()}><span aria-hidden="true">↪</span> Sign out</button>
            </div>
          </header>
          <div className="admin-content">
            {dashboardError && dashboard && <div className="admin-notice admin-notice--error" role="alert"><span className="admin-notice__symbol" aria-hidden="true">!</span><span><strong>Refresh failed</strong><small>{dashboardError} The previously fetched snapshot remains visible.</small></span><button className="admin-button" type="button" onClick={() => void loadDashboard()}>Retry</button></div>}
            {renderView()}
          </div>
        </section>
      </div>
    </main>
  );
}
