import { createHash, randomUUID } from "node:crypto";
import {
  applicationDefault,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";
import { getAuth, type UserRecord } from "firebase-admin/auth";
import {
  FieldValue,
  getFirestore,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import {
  HttpsError,
  onCall,
  type CallableRequest,
} from "firebase-functions/v2/https";
import {
  ADMIN_MEMBER_LIMIT,
  ADMIN_SCHEMA_VERSION,
  AdminPolicyError,
  adminCheckRetryAfterSeconds,
  assertActiveAdmin,
  assertAdminTargetNotPendingDeletion,
  assertOwnerAdminMutation,
  normalizeAdminEmail,
  nextAdminRegistryRevision,
  parseAdminMembership,
  parseAdminUid,
  parseEmptyAdminInput,
  parseManageAdminAccessInput,
  planAdminAccessMutation,
  type AdminMembership,
  type CurrentAuthAccount,
  type LieuvaAdminMember,
  type LieuvaAdminPrincipal,
  type LieuvaAdminSource,
  type LieuvaAdminSourceReason,
  type ManageLieuvaAdminAccessInput,
} from "./adminPolicy.js";

const REGION = "europe-west1";
const FIREBASE_PROJECT_ID = "virtualartplattform";
const GITHUB_REPOSITORY = "bbyw2hrnf6-boop/VirtualArtPlattform" as const;
const GITHUB_API_ROOT = `https://api.github.com/repos/${GITHUB_REPOSITORY}`;
const SOURCE_CACHE_MS = 60_000;
const GITHUB_RUN_LIMIT = 6;
const TELEMETRY_WINDOW_MINUTES = 60 as const;
const TELEMETRY_SAMPLE_LIMIT = 50 as const;
const CONTENT_RECENT_LIMIT = 20 as const;
const CHECK_HISTORY_LIMIT = 10 as const;
export const CHECK_HISTORY_RETENTION_LIMIT = 100;
export const CHECK_HISTORY_PRUNE_BATCH_LIMIT = 20;
const EXTERNAL_TIMEOUT_MS = 8_000;
const LIVE_CHECK_RATE_LIMIT_MS = 60_000;

export type LieuvaAdminSessionResponse = {
  schemaVersion: 1;
  generatedAt: string;
  principal: LieuvaAdminPrincipal;
  canManageAccess: boolean;
};

export type LieuvaAdminGallerySummary = {
  resourceRef: string;
  visibility: string;
  lifecycleStatus: string;
  templateId: string | null;
  revision: number | null;
  updatedAt: string | null;
  expiresAt: string | null;
};

export type LieuvaAdminCreatorSummary = {
  resourceRef: string;
  handle: string | null;
  isPublic: boolean;
  updatedAt: string | null;
};

export type LieuvaAdminActionRun = {
  workflow: "Verify" | "Deploy";
  runNumber: number;
  status: string;
  conclusion: string | null;
  headSha: string;
  url: string;
  createdAt: string;
  updatedAt: string;
};

export type LieuvaAdminTelemetryEntry = {
  timestamp: string;
  kind: string;
  outcome: string | null;
  severity: string;
  durationMs: number | null;
  template: "white-cube" | "nocturne" | "pavilion" | null;
  runtime: "studio" | "published_viewer" | "danny" | null;
  stage: string | null;
  viewport: "mobile" | "desktop" | null;
};

export type LieuvaAdminCheck = {
  target: "home" | "creators" | "sitemap" | "missing-space";
  url: string;
  expectedStatus: number;
  actualStatus: number | null;
  status: "passed" | "failed" | "unavailable";
  durationMs: number;
};

export type LieuvaAdminCheckRun = {
  id: string;
  startedAt: string;
  completedAt: string;
  overall: "passed" | "failed";
  checks: LieuvaAdminCheck[];
};

export type LieuvaAdminDashboardResponse = {
  schemaVersion: 1;
  generatedAt: string;
  content: LieuvaAdminSource<{
    galleries: {
      total: number;
      recentLimit: 20;
      recent: LieuvaAdminGallerySummary[];
    };
    creators: {
      total: number;
      recentLimit: 20;
      recent: LieuvaAdminCreatorSummary[];
    };
  }>;
  github: LieuvaAdminSource<{
    repository: typeof GITHUB_REPOSITORY;
    runs: LieuvaAdminActionRun[];
  }>;
  telemetry: LieuvaAdminSource<{
    clientReported: true;
    windowMinutes: 60;
    sampleLimit: 50;
    sampledEntries: number;
    byKind: Record<string, number>;
    byOutcome: Record<string, number>;
    recent: LieuvaAdminTelemetryEntry[];
  }>;
  checks: LieuvaAdminSource<{
    historyLimit: 10;
    runs: LieuvaAdminCheckRun[];
  }>;
  access: LieuvaAdminSource<{
    memberLimit: 100;
    members: LieuvaAdminMember[];
  }> | null;
};

export type RunLieuvaAdminChecksResponse = {
  schemaVersion: 1;
  run: LieuvaAdminCheckRun;
};

export type ManageLieuvaAdminAccessResponse = {
  schemaVersion: 1;
  changed: boolean;
  member: LieuvaAdminMember;
};

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

class AdminSourceUnavailable extends Error {
  constructor(readonly reason: LieuvaAdminSourceReason) {
    super(reason);
    this.name = "AdminSourceUnavailable";
  }
}

type SourceCache<T> = {
  expiresAt: number;
  fetchedAt: string;
  data: T;
};

type GithubDashboardData = {
  repository: typeof GITHUB_REPOSITORY;
  runs: LieuvaAdminActionRun[];
};

type TelemetryDashboardData = {
  clientReported: true;
  windowMinutes: 60;
  sampleLimit: 50;
  sampledEntries: number;
  byKind: Record<string, number>;
  byOutcome: Record<string, number>;
  recent: LieuvaAdminTelemetryEntry[];
};

let githubCache: SourceCache<GithubDashboardData> | undefined;
let telemetryCache: SourceCache<TelemetryDashboardData> | undefined;

function adminApp(): App {
  return getApps()[0] ?? initializeApp({ credential: applicationDefault() });
}

function adminDb() {
  return getFirestore(adminApp());
}

function adminAuth() {
  return getAuth(adminApp());
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isoTimestamp(value: unknown): string | null {
  let date: Date | undefined;
  if (value instanceof Date) date = value;
  else if (value && typeof value === "object" && "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function") {
    try { date = (value as { toDate: () => Date }).toDate(); } catch { return null; }
  } else if (typeof value === "string" || typeof value === "number") {
    date = new Date(value);
  }
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function safeResourceRef(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function boundedString(value: unknown, maximum = 64): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= maximum &&
    /^[a-z0-9_.:-]+$/i.test(value) ? value : null;
}

function safeAggregateKey(value: string | null): string | null {
  return value && !["__proto__", "constructor", "prototype"].includes(value)
    ? value
    : null;
}

function authAccount(user: UserRecord): CurrentAuthAccount {
  return {
    uid: user.uid,
    email: user.email,
    emailVerified: user.emailVerified,
    disabled: user.disabled,
    displayName: user.displayName,
    tokensValidAfterTime: user.tokensValidAfterTime,
  };
}

function signInProvider(request: CallableRequest<unknown>) {
  const firebase = asRecord(request.auth?.token.firebase);
  return firebase?.sign_in_provider;
}

function policyHttpsError(error: AdminPolicyError): HttpsError {
  switch (error.reason) {
    case "authentication-required":
    case "verified-account-required":
      return new HttpsError("unauthenticated", "Use a current verified email or Google account.");
    case "admin-access-required":
    case "owner-access-required":
      return new HttpsError("permission-denied", "Current LIEUVA admin access is required.");
    case "recent-authentication-required":
      return new HttpsError("failed-precondition", "Sign in again before changing administrator access.");
    case "last-owner-protected":
      return new HttpsError("failed-precondition", "At least one active owner must remain.");
    case "self-revoke-prohibited":
      return new HttpsError("failed-precondition", "Owners cannot remove their own owner access.");
    case "target-account-required":
      return new HttpsError("not-found", "The target Firebase account was not found.");
    case "target-account-ineligible":
      return new HttpsError("failed-precondition", "The target must be an active verified account.");
    case "target-account-pending-deletion":
      return new HttpsError("failed-precondition", "The target account is pending deletion.");
    case "target-membership-required":
      return new HttpsError("failed-precondition", "The target is not an active LIEUVA administrator.");
    case "target-membership-active":
      return new HttpsError("failed-precondition", "Use the role action for an active administrator.");
    case "admin-registry-too-large":
      return new HttpsError("resource-exhausted", "The administrator registry requires operator review.");
    case "invalid-admin-membership":
      return new HttpsError("failed-precondition", "The administrator registry is inconsistent.");
    case "invalid-admin-control":
      return new HttpsError("failed-precondition", "Administrator control state requires operator review.");
    case "invalid-admin-input":
    default:
      return new HttpsError("invalid-argument", "Invalid administrator request.");
  }
}

function throwHttps(error: unknown): never {
  if (error instanceof HttpsError) throw error;
  if (error instanceof AdminPolicyError) throw policyHttpsError(error);
  throw error;
}

async function requireAdmin(request: CallableRequest<unknown>): Promise<LieuvaAdminPrincipal> {
  const uid = parseAdminUid(request.auth?.uid);
  if (!uid) {
    try {
      return assertActiveAdmin({
        requestUid: request.auth?.uid,
        requestEmailVerified: request.auth?.token.email_verified,
        signInProvider: signInProvider(request),
        authTimeSeconds: request.auth?.token.auth_time,
        account: undefined,
        membership: null,
      });
    } catch (error) { return throwHttps(error); }
  }
  let user: UserRecord;
  let membershipSnapshot;
  try {
    [user, membershipSnapshot] = await Promise.all([
      adminAuth().getUser(uid),
      adminDb().collection("siteAdmins").doc(uid).get(),
    ]);
  } catch (error) {
    const code = asRecord(error)?.code;
    if (code === "auth/user-not-found")
      throw new HttpsError("unauthenticated", "Use a current verified email or Google account.");
    logger.error("lieuva_admin_authority_unavailable", {
      actorRef: safeResourceRef(uid),
      errorClass: boundedString(code) ?? "internal",
    });
    throw new HttpsError("unavailable", "Administrator authority could not be verified.");
  }
  const membership = membershipSnapshot.exists
    ? parseAdminMembership(membershipSnapshot.id, membershipSnapshot.data())
    : null;
  if (membershipSnapshot.exists && !membership)
    throw policyHttpsError(new AdminPolicyError("invalid-admin-membership"));
  try {
    return assertActiveAdmin({
      requestUid: request.auth?.uid,
      requestEmailVerified: request.auth?.token.email_verified,
      signInProvider: signInProvider(request),
      authTimeSeconds: request.auth?.token.auth_time,
      account: authAccount(user),
      membership,
    });
  } catch (error) { return throwHttps(error); }
}

function sourceReason(error: unknown): LieuvaAdminSourceReason {
  if (error instanceof AdminSourceUnavailable) return error.reason;
  const name = error instanceof Error ? error.name : "";
  const code = String(asRecord(error)?.code ?? "").toLowerCase();
  if (name === "AbortError" || name === "TimeoutError" || code.includes("deadline")) return "timeout";
  if (code.includes("permission") || code.includes("unauthenticated")) return "permission";
  if (code.includes("resource-exhausted") || code.includes("429")) return "rate-limit";
  return "upstream";
}

function sourceOk<T>(data: T, fetchedAt = new Date().toISOString(), cached = false): LieuvaAdminSource<T> {
  return { status: "ok", fetchedAt, cached, data };
}

function sourceUnavailable<T>(error: unknown): LieuvaAdminSource<T> {
  return {
    status: "unavailable",
    fetchedAt: new Date().toISOString(),
    cached: false,
    reason: sourceReason(error),
    data: null,
  };
}

async function optionalSource<T>(load: () => Promise<T>): Promise<LieuvaAdminSource<T>> {
  try { return sourceOk(await load()); } catch (error) { return sourceUnavailable(error); }
}

async function loadContentSource() {
  const db = adminDb();
  const [galleryCount, galleryRecent, creatorCount, creatorRecent] = await Promise.all([
    db.collection("galleries").count().get(),
    db.collection("galleries")
      .orderBy("updatedAt", "desc")
      .select("visibility", "lifecycleStatus", "templateId", "revision", "updatedAt", "expiresAt")
      .limit(CONTENT_RECENT_LIMIT)
      .get(),
    db.collection("creatorProfiles").count().get(),
    db.collection("creatorProfiles")
      .orderBy("updatedAt", "desc")
      .select("handle", "profilePublic", "updatedAt")
      .limit(CONTENT_RECENT_LIMIT)
      .get(),
  ]);
  return {
    galleries: {
      total: galleryCount.data().count,
      recentLimit: CONTENT_RECENT_LIMIT,
      recent: galleryRecent.docs.map((document): LieuvaAdminGallerySummary => {
        const data = document.data();
        return {
          resourceRef: safeResourceRef(document.id),
          visibility: boundedString(data.visibility, 24) ?? "unknown",
          lifecycleStatus: boundedString(data.lifecycleStatus, 24) ?? "active",
          templateId: boundedString(data.templateId, 32),
          revision: Number.isSafeInteger(data.revision) && data.revision >= 0 ? data.revision : null,
          updatedAt: isoTimestamp(data.updatedAt),
          expiresAt: isoTimestamp(data.expiresAt),
        };
      }),
    },
    creators: {
      total: creatorCount.data().count,
      recentLimit: CONTENT_RECENT_LIMIT,
      recent: creatorRecent.docs.map((document): LieuvaAdminCreatorSummary => {
        const data = document.data();
        return {
          resourceRef: safeResourceRef(document.id),
          handle: boundedString(data.handle, 40),
          isPublic: data.profilePublic === true,
          updatedAt: isoTimestamp(data.updatedAt),
        };
      }),
    },
  };
}

function sourceFailureForResponse(response: Response): AdminSourceUnavailable {
  if (response.status === 401 || response.status === 403)
    return new AdminSourceUnavailable("permission");
  if (response.status === 429) return new AdminSourceUnavailable("rate-limit");
  if (response.status === 408 || response.status === 504)
    return new AdminSourceUnavailable("timeout");
  return new AdminSourceUnavailable("upstream");
}

async function boundedResponseJson(response: Response, maximumBytes = 1_000_000): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes)
    throw new AdminSourceUnavailable("invalid-response");
  if (!response.body) throw new AdminSourceUnavailable("invalid-response");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw new AdminSourceUnavailable("invalid-response");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof AdminSourceUnavailable) throw error;
    throw new AdminSourceUnavailable("invalid-response");
  }
}

function githubRunUrl(value: unknown, runId: number) {
  if (typeof value !== "string") return null;
  const expected = `https://github.com/${GITHUB_REPOSITORY}/actions/runs/${runId}`;
  return value === expected || value.startsWith(`${expected}/`) ? value : null;
}

export function parseGithubWorkflowRuns(
  value: unknown,
  workflow: "Verify" | "Deploy",
): LieuvaAdminActionRun[] {
  const payload = asRecord(value);
  if (!payload || !Array.isArray(payload.workflow_runs) || payload.workflow_runs.length > GITHUB_RUN_LIMIT)
    throw new AdminSourceUnavailable("invalid-response");
  return payload.workflow_runs.map((raw) => {
    const run = asRecord(raw);
    const id = run && Number.isSafeInteger(run.id) && Number(run.id) > 0 ? Number(run.id) : null;
    const runNumber = run && Number.isSafeInteger(run.run_number) && Number(run.run_number) > 0
      ? Number(run.run_number) : null;
    const sha = run && typeof run.head_sha === "string" && /^[a-f0-9]{40}$/i.test(run.head_sha)
      ? run.head_sha.toLowerCase() : null;
    const status = boundedString(run?.status, 32);
    const conclusion = run?.conclusion === null ? null : boundedString(run?.conclusion, 32);
    const createdAt = isoTimestamp(run?.created_at);
    const updatedAt = isoTimestamp(run?.updated_at);
    const url = id === null ? null : githubRunUrl(run?.html_url, id);
    if (
      id === null || runNumber === null || !sha || !status ||
      (run?.conclusion !== null && !conclusion) || !createdAt || !updatedAt || !url
    )
      throw new AdminSourceUnavailable("invalid-response");
    return {
      workflow,
      runNumber,
      status,
      conclusion,
      headSha: sha,
      url,
      createdAt,
      updatedAt,
    };
  });
}

async function githubWorkflowRuns(fetcher: FetchLike, workflowFile: "ci.yml" | "deploy.yml", label: "Verify" | "Deploy") {
  const url = `${GITHUB_API_ROOT}/actions/workflows/${workflowFile}/runs?branch=main&per_page=${GITHUB_RUN_LIMIT}`;
  const response = await fetcher(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "LIEUVA-admin-console",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS),
  });
  if (!response.ok) throw sourceFailureForResponse(response);
  const payload = await boundedResponseJson(response);
  return parseGithubWorkflowRuns(payload, label);
}

async function loadGithubData(fetcher: FetchLike = fetch) {
  const now = Date.now();
  if (githubCache && githubCache.expiresAt > now)
    return sourceOk(githubCache.data, githubCache.fetchedAt, true);
  try {
    const [verify, deploy] = await Promise.all([
      githubWorkflowRuns(fetcher, "ci.yml", "Verify"),
      githubWorkflowRuns(fetcher, "deploy.yml", "Deploy"),
    ]);
    const data = {
      repository: GITHUB_REPOSITORY,
      runs: [...verify, ...deploy].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    };
    const fetchedAt = new Date().toISOString();
    githubCache = { data, fetchedAt, expiresAt: now + SOURCE_CACHE_MS };
    return sourceOk(data, fetchedAt, false);
  } catch (error) { return sourceUnavailable<GithubDashboardData>(error); }
}

const SAFE_TELEMETRY_TEMPLATES = new Set(["white-cube", "nocturne", "pavilion"]);
const SAFE_TELEMETRY_RUNTIMES = new Set(["studio", "published_viewer", "danny"]);
const SAFE_TELEMETRY_STAGES = new Set(["interactive", "loading", "ready", "failed"]);
const SAFE_TELEMETRY_VIEWPORTS = new Set(["mobile", "desktop"]);

function telemetryProperty<T extends string>(
  properties: Record<string, unknown> | null,
  key: string,
  allowed: Set<string>,
): T | null {
  const value = properties?.[key];
  return typeof value === "string" && allowed.has(value) ? value as T : null;
}

export function summarizeLoggingEntries(value: unknown) {
  const payload = asRecord(value);
  if (!payload || (payload.entries !== undefined && !Array.isArray(payload.entries)))
    throw new AdminSourceUnavailable("invalid-response");
  const entries = (payload.entries ?? []) as unknown[];
  if (entries.length > TELEMETRY_SAMPLE_LIMIT)
    throw new AdminSourceUnavailable("invalid-response");
  const recent: LieuvaAdminTelemetryEntry[] = [];
  for (const raw of entries) {
    const entry = asRecord(raw);
    const json = asRecord(entry?.jsonPayload);
    const timestamp = isoTimestamp(entry?.timestamp);
    const clientReported = json?.schema === "lieuva_client_telemetry_v1";
    if (!entry || !json || !timestamp ||
      !["lieuva_observability_v1", "lieuva_client_telemetry_v1"].includes(String(json.schema))) continue;
    if (clientReported && json.environment !== "production") continue;
    const kind = safeAggregateKey(
      boundedString(json.name, 64) ?? boundedString(json.operation, 64),
    );
    if (!kind) continue;
    const properties = asRecord(json.properties);
    const rawDuration = typeof json.durationMs === "number" ? json.durationMs : properties?.duration_ms;
    const durationMs = typeof rawDuration === "number" && Number.isFinite(rawDuration) &&
      rawDuration >= 0 && rawDuration <= 86_400_000 ? rawDuration : null;
    recent.push({
      timestamp,
      kind,
      outcome: boundedString(json.outcome, 40) ?? boundedString(properties?.outcome, 40),
      severity: boundedString(entry.severity, 24)?.toUpperCase() ?? "DEFAULT",
      durationMs,
      template: telemetryProperty(properties, "template", SAFE_TELEMETRY_TEMPLATES),
      runtime: telemetryProperty(properties, "runtime", SAFE_TELEMETRY_RUNTIMES),
      stage: telemetryProperty(properties, "stage", SAFE_TELEMETRY_STAGES),
      viewport: telemetryProperty(properties, "viewport", SAFE_TELEMETRY_VIEWPORTS),
    });
  }
  const byKind: Record<string, number> = {};
  const byOutcome: Record<string, number> = {};
  for (const entry of recent) {
    byKind[entry.kind] = (byKind[entry.kind] ?? 0) + 1;
    const outcome = safeAggregateKey(entry.outcome);
    if (outcome) byOutcome[outcome] = (byOutcome[outcome] ?? 0) + 1;
  }
  return {
    clientReported: true as const,
    windowMinutes: TELEMETRY_WINDOW_MINUTES,
    sampleLimit: TELEMETRY_SAMPLE_LIMIT,
    sampledEntries: recent.length,
    byKind,
    byOutcome,
    recent,
  };
}

async function loggingAccessToken() {
  const credential = adminApp().options.credential ?? applicationDefault();
  const result = await credential.getAccessToken();
  if (!result.access_token) throw new AdminSourceUnavailable("configuration");
  return result.access_token;
}

async function loadTelemetryData(fetcher: FetchLike = fetch) {
  const now = Date.now();
  if (telemetryCache && telemetryCache.expiresAt > now)
    return sourceOk(telemetryCache.data, telemetryCache.fetchedAt, true);
  try {
    const since = new Date(now - TELEMETRY_WINDOW_MINUTES * 60_000).toISOString();
    const accessToken = await loggingAccessToken();
    const response = await fetcher("https://logging.googleapis.com/v2/entries:list", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        resourceNames: [`projects/${FIREBASE_PROJECT_ID}`],
        filter: `timestamp >= "${since}" AND (jsonPayload.schema="lieuva_observability_v1" OR (jsonPayload.schema="lieuva_client_telemetry_v1" AND jsonPayload.environment="production"))`,
        orderBy: "timestamp desc",
        pageSize: TELEMETRY_SAMPLE_LIMIT,
      }),
      signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS),
    });
    if (!response.ok) throw sourceFailureForResponse(response);
    const payload = await boundedResponseJson(response);
    const data = summarizeLoggingEntries(payload);
    const fetchedAt = new Date().toISOString();
    telemetryCache = { data, fetchedAt, expiresAt: now + SOURCE_CACHE_MS };
    return sourceOk(data, fetchedAt, false);
  } catch (error) { return sourceUnavailable<TelemetryDashboardData>(error); }
}

export function parseStoredCheckRun(
  document: Pick<QueryDocumentSnapshot<DocumentData>, "id" | "data">,
): LieuvaAdminCheckRun | null {
  const data = document.data();
  const startedAt = isoTimestamp(data.startedAt);
  const completedAt = isoTimestamp(data.completedAt);
  if (
    data.schemaVersion !== ADMIN_SCHEMA_VERSION ||
    typeof data.actorRef !== "string" || !/^[a-f0-9]{12}$/.test(data.actorRef) ||
    !startedAt || !completedAt || Date.parse(completedAt) < Date.parse(startedAt) ||
    !Array.isArray(data.checks) || data.checks.length !== FIXED_LIVE_CHECKS.length
  )
    return null;
  const checks: LieuvaAdminCheck[] = [];
  const seenTargets = new Set<LieuvaAdminCheck["target"]>();
  for (const raw of data.checks) {
    const check = asRecord(raw);
    const definition = check && FIXED_LIVE_CHECKS.find((candidate) => candidate.target === check.target);
    if (!check || !definition || check.url !== definition.url || check.expectedStatus !== definition.expectedStatus ||
      seenTargets.has(definition.target) ||
      !["passed", "failed", "unavailable"].includes(String(check.status)) ||
      !Number.isFinite(check.durationMs) || Number(check.durationMs) < 0 ||
      !(check.actualStatus === null || (
        Number.isSafeInteger(check.actualStatus) && Number(check.actualStatus) >= 100 &&
        Number(check.actualStatus) <= 599
      )) ||
      (check.status === "unavailable") !== (check.actualStatus === null) ||
      (check.status === "passed" && check.actualStatus !== definition.expectedStatus)) return null;
    seenTargets.add(definition.target);
    checks.push({
      target: definition.target,
      url: definition.url,
      expectedStatus: definition.expectedStatus,
      actualStatus: check.actualStatus === null ? null : Number(check.actualStatus),
      status: check.status as LieuvaAdminCheck["status"],
      durationMs: Math.round(Number(check.durationMs)),
    });
  }
  if (seenTargets.size !== FIXED_LIVE_CHECKS.length) return null;
  const computedOverall = checks.every(({ status }) => status === "passed") ? "passed" : "failed";
  if (data.overall !== computedOverall) return null;
  return {
    id: document.id,
    startedAt,
    completedAt,
    overall: computedOverall,
    checks,
  };
}

async function loadCheckHistory() {
  const snapshot = await adminDb().collection("siteAdminCheckRuns")
    .orderBy("completedAt", "desc")
    .limit(CHECK_HISTORY_LIMIT)
    .get();
  return {
    historyLimit: CHECK_HISTORY_LIMIT,
    runs: snapshot.docs.flatMap((document) => {
      const parsed = parseStoredCheckRun(document);
      return parsed ? [parsed] : [];
    }),
  };
}

export type AdminCheckHistoryRetentionAdapter = {
  loadOverflowIds: (retained: number, limit: number) => Promise<readonly string[]>;
  deleteIds: (documentIds: readonly string[]) => Promise<void>;
};

export async function pruneLieuvaAdminCheckHistory(
  adapter: AdminCheckHistoryRetentionAdapter,
): Promise<number> {
  const ids = await adapter.loadOverflowIds(
    CHECK_HISTORY_RETENTION_LIMIT,
    CHECK_HISTORY_PRUNE_BATCH_LIMIT,
  );
  const uniqueIds = new Set(ids);
  if (
    ids.length > CHECK_HISTORY_PRUNE_BATCH_LIMIT || uniqueIds.size !== ids.length ||
    ids.some((id) => !parseAdminUid(id))
  ) throw new AdminSourceUnavailable("invalid-response");
  if (ids.length) await adapter.deleteIds(ids);
  return ids.length;
}

async function pruneStoredCheckHistory() {
  const db = adminDb();
  const collection = db.collection("siteAdminCheckRuns");
  return pruneLieuvaAdminCheckHistory({
    loadOverflowIds: async (retained, limit) => {
      const snapshot = await collection.orderBy("completedAt", "desc")
        .offset(retained)
        .limit(limit)
        .get();
      return snapshot.docs.map(({ id }) => id);
    },
    deleteIds: async (documentIds) => {
      const batch = db.batch();
      for (const id of documentIds) batch.delete(collection.doc(id));
      await batch.commit();
    },
  });
}

async function listAdminMembers() {
  const snapshot = await adminDb().collection("siteAdmins").limit(ADMIN_MEMBER_LIMIT + 1).get();
  if (snapshot.size > ADMIN_MEMBER_LIMIT)
    throw new AdminSourceUnavailable("invalid-response");
  const memberships = snapshot.docs.map((document) => {
    const membership = parseAdminMembership(document.id, document.data());
    if (!membership) throw new AdminSourceUnavailable("invalid-response");
    return membership;
  }).filter((membership) => membership.active);
  let authUsers = new Map<string, UserRecord>();
  if (memberships.length) {
    const result = await adminAuth().getUsers(memberships.map(({ uid }) => ({ uid })));
    authUsers = new Map(result.users.map((user) => [user.uid, user]));
  }
  return {
    memberLimit: ADMIN_MEMBER_LIMIT as 100,
    members: memberships.map((membership) => {
      const user = authUsers.get(membership.uid);
      return adminMember(membership, user);
    }).sort((left, right) => left.role.localeCompare(right.role) || left.email.localeCompare(right.email)),
  };
}

function adminMember(
  membership: AdminMembership,
  user?: Pick<UserRecord, "email" | "displayName"> | CurrentAuthAccount,
): LieuvaAdminMember {
  return {
    uid: membership.uid,
    email: normalizeAdminEmail(user?.email) ?? membership.email,
    displayName: typeof user?.displayName === "string" && user.displayName.trim()
      ? user.displayName.trim().slice(0, 80) : null,
    role: membership.role,
    active: membership.active,
    createdAt: isoTimestamp(membership.createdAt),
    updatedAt: isoTimestamp(membership.updatedAt),
  };
}

type FixedLiveCheck = {
  target: LieuvaAdminCheck["target"];
  url: string;
  expectedStatus: number;
  contentType: "html" | "xml";
};

export const FIXED_LIVE_CHECKS: readonly FixedLiveCheck[] = [
  { target: "home", url: "https://lieuva.com/", expectedStatus: 200, contentType: "html" },
  { target: "creators", url: "https://lieuva.com/creators", expectedStatus: 200, contentType: "html" },
  { target: "sitemap", url: "https://lieuva.com/sitemap.xml", expectedStatus: 200, contentType: "xml" },
  { target: "missing-space", url: "https://lieuva.com/spaces/does-not-exist", expectedStatus: 404, contentType: "html" },
] as const;

export async function runFixedLieuvaAdminChecks(
  fetcher: FetchLike = fetch,
  clock: () => number = Date.now,
): Promise<Omit<LieuvaAdminCheckRun, "id">> {
  const startedAtMs = clock();
  const checks = await Promise.all(FIXED_LIVE_CHECKS.map(async (definition): Promise<LieuvaAdminCheck> => {
    const checkStartedAt = clock();
    try {
      const response = await fetcher(definition.url, {
        method: "GET",
        redirect: "follow",
        headers: { "User-Agent": "LIEUVA-admin-console-check/1" },
        signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS),
      });
      void response.body?.cancel().catch(() => undefined);
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      const correctContent = definition.contentType === "html"
        ? contentType.includes("text/html")
        : contentType.includes("xml");
      const passed = response.status === definition.expectedStatus && correctContent;
      return {
        target: definition.target,
        url: definition.url,
        expectedStatus: definition.expectedStatus,
        actualStatus: response.status,
        status: passed ? "passed" : "failed",
        durationMs: Math.max(0, Math.round(clock() - checkStartedAt)),
      };
    } catch {
      return {
        target: definition.target,
        url: definition.url,
        expectedStatus: definition.expectedStatus,
        actualStatus: null,
        status: "unavailable",
        durationMs: Math.max(0, Math.round(clock() - checkStartedAt)),
      };
    }
  }));
  const completedAtMs = clock();
  return {
    startedAt: new Date(startedAtMs).toISOString(),
    completedAt: new Date(completedAtMs).toISOString(),
    overall: checks.every(({ status }) => status === "passed") ? "passed" : "failed",
    checks,
  };
}

async function getSessionHandler(request: CallableRequest<unknown>): Promise<LieuvaAdminSessionResponse> {
  try { parseEmptyAdminInput(request.data); } catch (error) { return throwHttps(error); }
  const principal = await requireAdmin(request);
  return {
    schemaVersion: ADMIN_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    principal,
    canManageAccess: principal.role === "owner",
  };
}

async function getDashboardHandler(request: CallableRequest<unknown>): Promise<LieuvaAdminDashboardResponse> {
  try { parseEmptyAdminInput(request.data); } catch (error) { return throwHttps(error); }
  const principal = await requireAdmin(request);
  const [content, github, telemetry, checks, access] = await Promise.all([
    optionalSource(loadContentSource),
    loadGithubData(),
    loadTelemetryData(),
    optionalSource(loadCheckHistory),
    principal.role === "owner" ? optionalSource(listAdminMembers) : Promise.resolve(null),
  ]);
  return {
    schemaVersion: ADMIN_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    content,
    github,
    telemetry,
    checks,
    access,
  };
}

async function claimLiveCheckRate(principal: LieuvaAdminPrincipal) {
  const db = adminDb();
  const actorReference = db.collection("siteAdmins").doc(principal.uid);
  const actorDigest = createHash("sha256").update(principal.uid).digest("hex");
  const rateReference = db.collection("siteAdminControl").doc(`checkRate-${actorDigest}`);
  const now = Date.now();
  try {
    await db.runTransaction(async (transaction) => {
      const [actorSnapshot, rateSnapshot] = await Promise.all([
        transaction.get(actorReference),
        transaction.get(rateReference),
      ]);
      const membership = actorSnapshot.exists
        ? parseAdminMembership(actorSnapshot.id, actorSnapshot.data()) : null;
      if (!membership || !membership.active)
        throw new AdminPolicyError("admin-access-required");
      const rateData = rateSnapshot.data();
      let previousMs: number | undefined;
      if (rateSnapshot.exists) {
        const previous = isoTimestamp(rateData?.lastStartedAt);
        if (
          rateData?.schemaVersion !== ADMIN_SCHEMA_VERSION ||
          rateData?.kind !== "live-check-rate" || rateData?.actorRef !== actorDigest.slice(0, 12) ||
          !previous
        ) throw new AdminPolicyError("invalid-admin-control");
        previousMs = Date.parse(previous);
      }
      const retryAfterSeconds = adminCheckRetryAfterSeconds(
        previousMs,
        now,
        LIVE_CHECK_RATE_LIMIT_MS,
      );
      if (retryAfterSeconds) {
        throw new HttpsError(
          "resource-exhausted",
          "Live checks were just started. Retry after the cooldown.",
          { retryAfterSeconds },
        );
      }
      transaction.set(rateReference, {
        schemaVersion: ADMIN_SCHEMA_VERSION,
        kind: "live-check-rate",
        actorRef: actorDigest.slice(0, 12),
        lastStartedAt: new Date(now),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (error) { return throwHttps(error); }
}

async function runChecksHandler(request: CallableRequest<unknown>): Promise<RunLieuvaAdminChecksResponse> {
  try { parseEmptyAdminInput(request.data); } catch (error) { return throwHttps(error); }
  const principal = await requireAdmin(request);
  await claimLiveCheckRate(principal);
  const pending = await runFixedLieuvaAdminChecks();
  const reference = adminDb().collection("siteAdminCheckRuns").doc();
  const run: LieuvaAdminCheckRun = { id: reference.id, ...pending };
  try {
    await reference.create({
      schemaVersion: ADMIN_SCHEMA_VERSION,
      actorRef: safeResourceRef(principal.uid),
      startedAt: new Date(run.startedAt),
      completedAt: new Date(run.completedAt),
      overall: run.overall,
      checks: run.checks,
      createdAt: FieldValue.serverTimestamp(),
    });
    await pruneStoredCheckHistory();
  } catch (error) {
    try { await reference.delete(); } catch { /* A later run will retry bounded pruning. */ }
    logger.error("lieuva_admin_check_history_failed", {
      actorRef: safeResourceRef(principal.uid),
      errorClass: boundedString(asRecord(error)?.code) ?? "internal",
    });
    throw new HttpsError("unavailable", "Live checks ran, but bounded server history could not be saved.");
  }
  logger.info("lieuva_admin_checks", {
    actorRef: safeResourceRef(principal.uid),
    overall: run.overall,
    failed: run.checks.filter(({ status }) => status !== "passed").length,
  });
  return { schemaVersion: ADMIN_SCHEMA_VERSION, run };
}

async function targetAccount(input: ManageLieuvaAdminAccessInput): Promise<CurrentAuthAccount | undefined> {
  if (input.action === "revoke") return undefined;
  try {
    const user = input.action === "grant"
      ? await adminAuth().getUserByEmail(input.email)
      : await adminAuth().getUser(input.uid);
    return authAccount(user);
  } catch (error) {
    if (asRecord(error)?.code === "auth/user-not-found")
      throw policyHttpsError(new AdminPolicyError("target-account-required"));
    throw new HttpsError("unavailable", "The target Firebase account could not be verified.");
  }
}

async function manageAccessHandler(
  request: CallableRequest<unknown>,
): Promise<ManageLieuvaAdminAccessResponse> {
  const principal = await requireAdmin(request);
  let input: ManageLieuvaAdminAccessInput;
  try {
    input = parseManageAdminAccessInput(request.data);
    assertOwnerAdminMutation(principal, request.auth?.token.auth_time);
  } catch (error) { return throwHttps(error); }
  const account = await targetAccount(input);
  const targetUid = input.action === "grant" ? account?.uid : input.uid;
  if (!targetUid) throw new HttpsError("not-found", "The target Firebase account was not found.");
  const db = adminDb();
  const targetReference = db.collection("siteAdmins").doc(targetUid);
  const actorReference = db.collection("siteAdmins").doc(principal.uid);
  const deletionReference = db.collection("accountDeletionJobs").doc(targetUid);
  const registryControlReference = db.collection("siteAdminControl").doc("adminRegistry");
  const auditReference = db.collection("siteAdminAuditEvents").doc(randomUUID());
  let planned;
  try {
    planned = await db.runTransaction(async (transaction) => {
      // Reading the complete bounded registry in the same transaction makes the
      // 100-member capacity decision serialize with concurrent grants.
      const [
        actorSnapshot,
        targetSnapshot,
        registrySnapshot,
        deletionSnapshot,
        registryControlSnapshot,
      ] = await Promise.all([
        transaction.get(actorReference),
        transaction.get(targetReference),
        transaction.get(db.collection("siteAdmins").limit(ADMIN_MEMBER_LIMIT + 1)),
        transaction.get(deletionReference),
        transaction.get(registryControlReference),
      ]);
      const currentActor = actorSnapshot.exists
        ? parseAdminMembership(actorSnapshot.id, actorSnapshot.data()) : null;
      if (!currentActor || !currentActor.active || currentActor.role !== "owner")
        throw new AdminPolicyError("owner-access-required");
      const registryMemberships = registrySnapshot.docs.map((document) => {
        const membership = parseAdminMembership(document.id, document.data());
        if (!membership) throw new AdminPolicyError("invalid-admin-membership");
        return membership;
      });
      const currentTarget = targetSnapshot.exists
        ? parseAdminMembership(targetSnapshot.id, targetSnapshot.data()) : null;
      if (targetSnapshot.exists && !currentTarget)
        throw new AdminPolicyError("invalid-admin-membership");
      assertAdminTargetNotPendingDeletion(input, deletionSnapshot.exists);
      const next = planAdminAccessMutation({
        actor: principal,
        input,
        targetAccount: account,
        targetMembership: currentTarget,
        registryMemberships,
      });
      if (next.changed) {
        const revision = nextAdminRegistryRevision(
          registryControlSnapshot.exists ? registryControlSnapshot.data() : undefined,
        );
        transaction.set(registryControlReference, {
          schemaVersion: ADMIN_SCHEMA_VERSION,
          kind: "admin-registry-revision",
          revision,
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.set(targetReference, {
          uid: next.uid,
          email: next.email,
          role: next.role,
          active: next.active,
          schemaVersion: ADMIN_SCHEMA_VERSION,
          updatedAt: FieldValue.serverTimestamp(),
          ...(next.createIdentity ? {
            createdAt: FieldValue.serverTimestamp(),
            createdBy: principal.uid,
          } : {}),
        }, { merge: true });
      }
      transaction.create(auditReference, {
        schemaVersion: ADMIN_SCHEMA_VERSION,
        action: input.action,
        actorRef: safeResourceRef(principal.uid),
        targetRef: safeResourceRef(next.uid),
        changed: next.changed,
        previousRole: next.previousRole,
        previousActive: next.previousActive,
        nextRole: next.role,
        nextActive: next.active,
        createdAt: FieldValue.serverTimestamp(),
      });
      return next;
    });
  } catch (error) { return throwHttps(error); }
  let saved;
  try { saved = await targetReference.get(); } catch {
    throw new HttpsError("unavailable", "Administrator access changed, but the result could not be reloaded.");
  }
  const membership = saved.exists ? parseAdminMembership(saved.id, saved.data()) : null;
  if (!membership) throw new HttpsError("internal", "Administrator access could not be represented safely.");
  logger.info("lieuva_admin_access_changed", {
    actorRef: safeResourceRef(principal.uid),
    targetRef: safeResourceRef(membership.uid),
    action: input.action,
    changed: planned.changed,
  });
  return {
    schemaVersion: ADMIN_SCHEMA_VERSION,
    changed: planned.changed,
    member: adminMember(membership, account && account.uid === membership.uid
      ? account : undefined),
  };
}

export const getLieuvaAdminSession = onCall(
  { region: REGION, timeoutSeconds: 15, memory: "256MiB", enforceAppCheck: true },
  getSessionHandler,
);

export const getLieuvaAdminDashboard = onCall(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", enforceAppCheck: true },
  getDashboardHandler,
);

export const runLieuvaAdminChecks = onCall(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", enforceAppCheck: true },
  runChecksHandler,
);

export const manageLieuvaAdminAccess = onCall(
  { region: REGION, timeoutSeconds: 20, memory: "256MiB", enforceAppCheck: true },
  manageAccessHandler,
);

export function resetAdminConsoleCachesForTesting() {
  githubCache = undefined;
  telemetryCache = undefined;
}
