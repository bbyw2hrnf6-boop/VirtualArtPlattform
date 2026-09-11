export type { AdminView } from "./adminRoutes";
export type AdminRole = "owner" | "admin";
export type AdminSourceReason = "configuration" | "permission" | "rate-limit" | "timeout" | "upstream" | "invalid-response";
export type AdminSource<T> =
  | { status: "ok"; fetchedAt: string; cached: boolean; data: T }
  | { status: "unavailable"; fetchedAt: string; cached: boolean; reason: AdminSourceReason; data: null };
export type AdminMember = {
  uid: string; email: string; displayName: string | null; role: AdminRole;
  active: boolean; createdAt: string | null; updatedAt: string | null;
};
export type AdminSession = {
  schemaVersion: 1; generatedAt: string;
  principal: { uid: string; email: string; displayName: string | null; role: AdminRole };
  canManageAccess: boolean;
};
export type AdminCheck = {
  target: "home" | "creators" | "sitemap" | "missing-space";
  url: string; expectedStatus: number; actualStatus: number | null;
  status: "passed" | "failed" | "unavailable"; durationMs: number;
};
export type AdminCheckRun = {
  id: string; startedAt: string; completedAt: string;
  overall: "passed" | "failed"; checks: AdminCheck[];
};
export type AdminTelemetryEntry = {
  timestamp: string; kind: string; outcome: string | null; severity: string;
  durationMs: number | null; template: string | null; runtime: string | null;
  stage: string | null; viewport: "mobile" | "desktop" | null;
};
export type AdminDashboard = {
  schemaVersion: 1; generatedAt: string;
  content: AdminSource<{
    galleries: { total: number; recentLimit: 20; recent: Array<{
      resourceRef: string; visibility: string; lifecycleStatus: string; templateId: string | null;
      revision: number | null; updatedAt: string | null; expiresAt: string | null;
    }> };
    creators: { total: number; recentLimit: 20; recent: Array<{
      resourceRef: string; handle: string | null; isPublic: boolean; updatedAt: string | null;
    }> };
  }>;
  github: AdminSource<{
    repository: "bbyw2hrnf6-boop/VirtualArtPlattform";
    runs: Array<{
      workflow: "Verify" | "Deploy"; runNumber: number; status: string;
      conclusion: string | null; headSha: string; url: string; createdAt: string; updatedAt: string;
    }>;
  }>;
  telemetry: AdminSource<{
    clientReported: true; windowMinutes: 60; sampleLimit: 50; sampledEntries: number;
    byKind: Record<string, number>; byOutcome: Record<string, number>; recent: AdminTelemetryEntry[];
  }>;
  checks: AdminSource<{ historyLimit: 10; runs: AdminCheckRun[] }>;
  access: AdminSource<{ memberLimit: 100; members: AdminMember[] }> | null;
};
export type ManageAdminAccessInput =
  | { action: "grant"; email: string; role: AdminRole }
  | { action: "set-role"; uid: string; role: AdminRole }
  | { action: "revoke"; uid: string };
export type ManageAdminAccessResponse = { schemaVersion: 1; changed: boolean; member: AdminMember };
export type RunAdminChecksResponse = { schemaVersion: 1; run: AdminCheckRun };
