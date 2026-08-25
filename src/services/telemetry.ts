export type TelemetryConsent = 'denied' | 'granted';
export type TelemetryEnvironment = 'development' | 'test' | 'staging' | 'production';

export type TelemetryEventName =
  | 'landing_view'
  | 'landing_product_proof_engaged'
  | 'landing_example_entered'
  | 'landing_create_cta_clicked'
  | 'create_started'
  | 'template_selected'
  | 'studio_ready'
  | 'artwork_upload_started'
  | 'artwork_upload_completed'
  | 'walk_preview_entered'
  | 'publish_review_opened'
  | 'account_gate_opened'
  | 'publish_started'
  | 'publish_succeeded'
  | 'publish_failed'
  | 'share_action'
  | 'published_space_opened'
  | 'published_space_ready'
  | 'discover_viewed'
  | 'published_edit_started'
  | 'published_update_started'
  | 'published_update_succeeded'
  | 'published_update_failed'
  | 'web_vital'
  | 'three_milestone'
  | 'three_runtime_health'
  | 'application_error';

export type TelemetryProperties = Record<string, string | number | boolean>;

export interface TelemetryEvent {
  name: TelemetryEventName;
  occurredAt: string;
  environment: TelemetryEnvironment;
  route: string;
  sessionId: string;
  properties: TelemetryProperties;
}

type TelemetryTransport = (events: readonly TelemetryEvent[]) => Promise<void>;

const CONSENT_KEY = 'lieuva-telemetry-consent-v1';
const SESSION_KEY = 'lieuva-telemetry-session-v1';
const OPTIONAL_EVENTS = new Set<TelemetryEventName>([
  'landing_view', 'landing_product_proof_engaged', 'landing_example_entered',
  'landing_create_cta_clicked', 'create_started', 'template_selected', 'studio_ready',
  'artwork_upload_started', 'artwork_upload_completed', 'walk_preview_entered',
  'publish_review_opened', 'account_gate_opened', 'publish_started',
  'publish_succeeded', 'share_action', 'published_space_opened',
  'published_space_ready', 'discover_viewed', 'published_edit_started',
  'published_update_started', 'published_update_succeeded', 'web_vital',
  'three_milestone',
]);
const ALLOWED_PROPERTIES = new Set([
  'template', 'visibility', 'role', 'stage', 'outcome', 'error_class',
  'mode', 'metric', 'value', 'rating', 'duration_ms', 'count', 'quality',
  'runtime', 'reason', 'operation', 'source', 'is_update', 'online',
]);
const FORBIDDEN_KEY = /(id|title|name|email|url|path|src|text|description|artist|token|uid)/i;
const SAFE_VALUE = /^[a-z0-9_.:-]{1,64}$/i;
const EVENT_NAMES = new Set<TelemetryEventName>([
  'landing_view', 'landing_product_proof_engaged', 'landing_example_entered',
  'landing_create_cta_clicked', 'create_started', 'template_selected', 'studio_ready',
  'artwork_upload_started', 'artwork_upload_completed', 'walk_preview_entered',
  'publish_review_opened', 'account_gate_opened', 'publish_started',
  'publish_succeeded', 'publish_failed', 'share_action', 'published_space_opened',
  'published_space_ready', 'discover_viewed', 'published_edit_started',
  'published_update_started', 'published_update_succeeded',
  'published_update_failed', 'web_vital', 'three_milestone',
  'three_runtime_health', 'application_error',
]);

let transportOverride: TelemetryTransport | null = null;
let queue: TelemetryEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | undefined;

export function telemetryEnvironment(): TelemetryEnvironment {
  if (import.meta.env.MODE === 'test') return 'test';
  const configured = import.meta.env.VITE_TELEMETRY_ENVIRONMENT;
  if (configured === 'development' || configured === 'test' || configured === 'staging' || configured === 'production')
    return configured;
  return import.meta.env.PROD ? 'production' : 'development';
}

export function telemetryRoute(pathname = location.pathname, hash = location.hash): string {
  const clean = pathname.replace(/\/+$/, '') || '/';
  const candidate = hash.startsWith('#/') ? hash.slice(1) : clean;
  const parts = candidate.split('/').filter(Boolean);
  if (!parts.length) return 'home';
  if (parts[0] === 'spaces') return 'published_space';
  if (parts[0] === 'create') {
    if (parts.length === 1) return 'template_picker';
    return parts[2]?.startsWith('published-') ? 'published_edit' : 'studio';
  }
  if (parts[0] === 'demo') return 'reference_demo';
  if (parts[0] === 'account') return 'account';
  if (parts[0] === 'data') return 'data_rights';
  if (parts[0] === 'auth-action') return 'auth_action';
  return 'other';
}

export function getTelemetryConsent(): TelemetryConsent {
  if (typeof localStorage === 'undefined') return 'denied';
  return localStorage.getItem(CONSENT_KEY) === 'granted' ? 'granted' : 'denied';
}

export function setTelemetryConsent(consent: TelemetryConsent) {
  localStorage.setItem(CONSENT_KEY, consent);
  if (consent === 'denied') queue = queue.filter((event) => !OPTIONAL_EVENTS.has(event.name));
}

function sessionId(): string {
  const existing = sessionStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const value = crypto.randomUUID();
  sessionStorage.setItem(SESSION_KEY, value);
  return value;
}

export function sanitizeTelemetryProperties(input: TelemetryProperties = {}): TelemetryProperties {
  const safe: TelemetryProperties = {};
  for (const [key, value] of Object.entries(input)) {
    if (!ALLOWED_PROPERTIES.has(key) || FORBIDDEN_KEY.test(key)) continue;
    if (typeof value === 'number' && Number.isFinite(value)) safe[key] = Math.round(value * 100) / 100;
    else if (typeof value === 'boolean') safe[key] = value;
    else if (typeof value === 'string' && SAFE_VALUE.test(value)) safe[key] = value;
  }
  return safe;
}

export function isTelemetryEvent(value: unknown): value is TelemetryEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as TelemetryEvent;
  return EVENT_NAMES.has(event.name)
    && typeof event.occurredAt === 'string'
    && ['development', 'test', 'staging', 'production'].includes(event.environment)
    && typeof event.route === 'string'
    && event.route.length <= 40
    && typeof event.sessionId === 'string'
    && event.sessionId.length <= 64
    && JSON.stringify(event.properties).length <= 1200;
}

async function firebaseTransport(events: readonly TelemetryEvent[]) {
  if (import.meta.env.VITE_TELEMETRY_MODE !== 'functions') return;
  const [{ httpsCallable }, { firebaseFunctions }] = await Promise.all([
    import('firebase/functions'),
    import('./firebase'),
  ]);
  await httpsCallable(firebaseFunctions, 'recordLieuvaTelemetry')({ events });
}

async function flush() {
  flushTimer = undefined;
  const events = queue.splice(0, 20);
  if (!events.length) return;
  try {
    await (transportOverride ?? firebaseTransport)(events);
  } catch {
    // Observability must never block product behavior or produce retry storms.
  }
  if (queue.length) scheduleFlush();
}

function scheduleFlush() {
  if (!flushTimer) flushTimer = setTimeout(() => void flush(), 750);
}

export function trackTelemetry(name: TelemetryEventName, properties: TelemetryProperties = {}) {
  if (OPTIONAL_EVENTS.has(name) && getTelemetryConsent() !== 'granted') return;
  const event: TelemetryEvent = {
    name,
    occurredAt: new Date().toISOString(),
    environment: telemetryEnvironment(),
    route: telemetryRoute(),
    sessionId: sessionId(),
    properties: sanitizeTelemetryProperties(properties),
  };
  queue.push(event);
  if (queue.length > 40) queue = queue.slice(-40);
  scheduleFlush();
}

export function classifyTelemetryError(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: unknown }).code).toLowerCase()
    : '';
  if (code.includes('app-check') || code.includes('unauthenticated') || code.includes('permission-denied')) return 'access';
  if (code.includes('storage')) return 'storage';
  if (code.includes('quota') || code.includes('resource-exhausted')) return 'quota';
  if (code.includes('network') || code.includes('unavailable') || !navigator.onLine) return 'network';
  if (code.includes('stale') || code.includes('aborted')) return 'conflict';
  return 'unknown';
}

export function reportApplicationError(error: unknown, operation = 'render') {
  trackTelemetry('application_error', {
    operation,
    error_class: classifyTelemetryError(error),
    online: navigator.onLine,
  });
}

export function __setTelemetryTransportForTests(transport: TelemetryTransport | null) {
  transportOverride = transport;
}

export async function __flushTelemetryForTests() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = undefined;
  await flush();
}

export function __resetTelemetryForTests() {
  queue = [];
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = undefined;
  transportOverride = null;
}
