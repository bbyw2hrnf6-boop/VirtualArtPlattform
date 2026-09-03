import {
  boundedInteger,
  parseWp2Flags,
  smokeEndpoints,
  validateSmokeSnapshot,
  validatedNoindexPath,
  validatedProductionOrigin,
  validatedProjectId,
} from "./wp2-release-lib.mjs";

const HELP = `Run bounded, unauthenticated HTTP smoke checks against a LIEUVA release.

The script performs at most six requests, follows no redirects, reads bounded
response bodies, sends no credential, and never calls a mutating authenticated path.

Usage:
  node scripts/wp2-production-smoke.mjs \\
    --base-url https://lieuva.com --project-id virtualartplattform
  node scripts/wp2-production-smoke.mjs \\
    --base-url https://lieuva.com --project-id virtualartplattform \\
    --noindex-path /spaces/EXACT_PENDING_ID

Options:
  --base-url public HTTPS origin; defaults to https://lieuva.com
  --project-id Firebase project; defaults to virtualartplattform
  --region Functions region; defaults to europe-west1
  --noindex-path optional exact /spaces/ID or /creators/HANDLE
  --timeout-ms per-request timeout, 1000..30000; defaults to 10000
  --help
`;

function safeError(error) {
  const message = error instanceof Error ? error.message : "Unknown failure.";
  return message
    .replace(/([?&](?:token|key|code|secret)=)[^&\s]+/gi, "$1[redacted]")
    .slice(0, 240);
}

async function readBoundedBody(response, maximumBytes) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximumBytes)
    throw new Error("Response exceeds the bounded body limit.");
  if (!response.body) return { body: "", bytes: 0 };
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maximumBytes) {
      await reader.cancel();
      throw new Error("Response exceeds the bounded body limit.");
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { body: new TextDecoder("utf-8", { fatal: false }).decode(merged), bytes };
}

async function requestSnapshot(endpoint, timeoutMs, allowedOrigin) {
  const target = new URL(endpoint.url);
  if (target.origin !== allowedOrigin) throw new Error("Endpoint escaped its allowed origin.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();
  try {
    const response = await fetch(target, {
      method: endpoint.method ?? "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        accept: endpoint.accept,
        "cache-control": "no-cache",
        pragma: "no-cache",
        ...(endpoint.requestBody ? { "content-type": "application/json" } : {}),
      },
      ...(endpoint.requestBody ? { body: endpoint.requestBody } : {}),
    });
    if (response.status >= 300 && response.status < 400)
      throw new Error("Unexpected redirect; smoke target must be canonical.");
    const { body, bytes } = await readBoundedBody(response, endpoint.maximumBytes);
    return {
      status: response.status,
      contentType: response.headers.get("content-type") ?? "",
      headers: { "x-robots-tag": response.headers.get("x-robots-tag") ?? "" },
      body,
      bytes,
      durationMs: Math.round(performance.now() - startedAt),
    };
  } finally {
    clearTimeout(timer);
  }
}

const flags = parseWp2Flags(process.argv.slice(2), {
  "base-url": "value",
  "project-id": "value",
  region: "value",
  "noindex-path": "value",
  "timeout-ms": "value",
  help: "boolean",
});

if (flags.help) {
  process.stdout.write(HELP);
  process.exit(0);
}

const origin = validatedProductionOrigin(flags["base-url"] ?? process.env.WP2_BASE_URL ?? "https://lieuva.com");
const projectId = validatedProjectId(flags["project-id"] ?? process.env.FIREBASE_PROJECT_ID ?? "virtualartplattform");
const region = flags.region ?? process.env.FIREBASE_FUNCTIONS_REGION ?? "europe-west1";
const noindexPath = validatedNoindexPath(flags["noindex-path"] ?? process.env.WP2_NOINDEX_PATH);
const timeoutMs = boundedInteger(flags["timeout-ms"], {
  label: "--timeout-ms",
  fallback: 10_000,
  minimum: 1_000,
  maximum: 30_000,
});
const endpoints = smokeEndpoints({ origin, projectId, region, noindexPath });

const results = await Promise.all(endpoints.map(async (endpoint) => {
  const allowedOrigin = endpoint.kind === "callable" ? new URL(endpoint.url).origin : origin;
  try {
    const snapshot = await requestSnapshot(endpoint, timeoutMs, allowedOrigin);
    const evidence = validateSmokeSnapshot(endpoint.kind, snapshot, { expectedOrigin: origin });
    return {
      check: endpoint.kind,
      ok: true,
      ...evidence,
      bytes: snapshot.bytes,
      durationMs: snapshot.durationMs,
    };
  } catch (error) {
    return { check: endpoint.kind, ok: false, error: safeError(error) };
  }
}));

const ok = results.every((result) => result.ok);
process.stdout.write(`${JSON.stringify({
  ok,
  origin,
  projectId,
  requestCount: endpoints.length,
  noindexChecked: Boolean(noindexPath),
  results,
}, null, 2)}\n`);
if (!ok) process.exitCode = 1;
