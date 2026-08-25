import { createHash } from "node:crypto";
import { logger } from "firebase-functions";

export type ServerOperation =
  | "account_export" | "account_delete" | "publication_permit"
  | "publication_abort" | "space_lifecycle" | "space_purge"
  | "acl_invite" | "acl_accept" | "acl_revoke" | "email"
  | "space_document" | "space_card" | "space_sitemap" | "client_telemetry";

export function safeResourceRef(value: string | undefined): string | undefined {
  return value ? createHash("sha256").update(value).digest("hex").slice(0, 12) : undefined;
}

export function classifyServerError(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error
    ? String((error as { code?: unknown }).code).toLowerCase()
    : "";
  if (code.includes("permission") || code.includes("unauthenticated")) return "access";
  if (code.includes("resource-exhausted")) return "quota";
  if (code.includes("aborted") || code.includes("failed-precondition")) return "conflict";
  if (code.includes("unavailable") || code.includes("deadline")) return "availability";
  if (code.includes("invalid-argument")) return "validation";
  return "internal";
}

export function logOperation(
  operation: ServerOperation,
  outcome: "success" | "failure" | "rejected",
  startedAt: number,
  details: Record<string, string | number | boolean | undefined> = {},
) {
  const payload = {
    schema: "lieuva_observability_v1",
    operation,
    outcome,
    durationMs: Math.max(0, Date.now() - startedAt),
    ...details,
  };
  if (outcome === "failure") logger.error("lieuva_operation", payload);
  else if (outcome === "rejected") logger.warn("lieuva_operation", payload);
  else logger.info("lieuva_operation", payload);
}

export function observeCallable<TRequest, TResult>(
  operation: ServerOperation,
  handler: (request: TRequest) => Promise<TResult>,
) {
  return async (request: TRequest): Promise<TResult> => {
    const startedAt = Date.now();
    try {
      const result = await handler(request);
      logOperation(operation, "success", startedAt);
      return result;
    } catch (error) {
      logOperation(operation, "failure", startedAt, { errorClass: classifyServerError(error) });
      throw error;
    }
  };
}

const CLIENT_EVENTS = new Set([
  "landing_view", "landing_product_proof_engaged", "landing_example_entered",
  "landing_create_cta_clicked", "create_started", "template_selected", "studio_ready",
  "artwork_upload_started", "artwork_upload_completed", "artwork_upload_failed",
  "artwork_placed", "walk_preview_entered", "walk_preview_exited",
  "publish_review_opened", "account_gate_opened", "publish_started",
  "publish_succeeded", "publish_failed", "share_action", "published_space_opened",
  "published_space_ready", "discover_viewed", "published_edit_started",
  "published_update_started", "published_update_succeeded", "published_update_failed",
  "web_vital", "three_milestone", "three_runtime_health", "application_error",
]);
const CLIENT_PROPERTIES = new Set([
  "template", "visibility", "role", "stage", "outcome", "error_class", "mode",
  "metric", "value", "rating", "duration_ms", "count", "quality", "runtime",
  "reason", "operation", "source", "is_update", "online",
]);
const FORBIDDEN = /(id|title|name|email|url|path|src|text|description|artist|token|uid)/i;

export type SafeClientEvent = {
  name: string;
  occurredAt: string;
  environment: string;
  route: string;
  sessionRef: string;
  properties: Record<string, string | number | boolean>;
};

export function parseClientTelemetry(value: unknown): SafeClientEvent[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20)
    throw new Error("invalid telemetry batch");
  return value.map((raw) => {
    if (!raw || typeof raw !== "object") throw new Error("invalid telemetry event");
    const event = raw as Record<string, unknown>;
    if (typeof event.name !== "string" || !CLIENT_EVENTS.has(event.name)) throw new Error("invalid telemetry name");
    if (typeof event.occurredAt !== "string" || Number.isNaN(Date.parse(event.occurredAt))) throw new Error("invalid telemetry time");
    if (!["development", "test", "staging", "production"].includes(String(event.environment))) throw new Error("invalid telemetry environment");
    if (typeof event.route !== "string" || !/^[a-z_]{1,40}$/.test(event.route)) throw new Error("invalid telemetry route");
    if (typeof event.sessionId !== "string" || event.sessionId.length > 64) throw new Error("invalid telemetry session");
    const input = event.properties;
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("invalid telemetry properties");
    const properties: Record<string, string | number | boolean> = {};
    for (const [key, property] of Object.entries(input as Record<string, unknown>)) {
      if (!CLIENT_PROPERTIES.has(key) || FORBIDDEN.test(key)) throw new Error("unsafe telemetry property");
      if (typeof property === "string" && /^[a-z0-9_.:-]{1,64}$/i.test(property)) properties[key] = property;
      else if (typeof property === "number" && Number.isFinite(property)) properties[key] = property;
      else if (typeof property === "boolean") properties[key] = property;
      else throw new Error("unsafe telemetry value");
    }
    return {
      name: event.name,
      occurredAt: event.occurredAt,
      environment: String(event.environment),
      route: event.route,
      sessionRef: safeResourceRef(event.sessionId)!,
      properties,
    };
  });
}
