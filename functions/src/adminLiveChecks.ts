/** Fixed, credential-free production probes. Never accept a URL or script from a caller. */
export const ADMIN_CHECK_SUITE_VERSION = 2;
export type CheckTarget = "home" | "creators" | "sitemap" | "missing-space" |
  "admin-shell" | "missing-creator" | "robots" | "creator-data" | "admin-auth" |
  "white-cube-asset" | "nocturne-asset" | "pavilion-asset" | "release";
export type CheckEvidence = "ok" | "http-status" | "content-type" | "privacy-headers" |
  "security-headers" | "cache-policy" | "body-contract" | "body-too-large" | "network" | "timeout" | "legacy";
export type LieuvaAdminCheck = {
  target: CheckTarget; url: string; expectedStatus: number; actualStatus: number | null;
  status: "passed" | "failed" | "unavailable"; durationMs: number; evidence?: CheckEvidence;
};
export type LieuvaAdminCheckRun = {
  id: string; suiteVersion?: 1 | 2; startedAt: string; completedAt: string;
  overall: "passed" | "failed"; checks: LieuvaAdminCheck[];
};
type Definition = {
  target: CheckTarget; url: string; expectedStatus: number;
  contentType: "html" | "xml" | "text" | "json" | "asset";
  method?: "HEAD" | "POST";
};
const base = "https://lieuva.com";
export const LEGACY_LIVE_CHECKS: readonly Definition[] = [
  { target: "home", url: `${base}/`, expectedStatus: 200, contentType: "html" },
  { target: "creators", url: `${base}/creators`, expectedStatus: 200, contentType: "html" },
  { target: "sitemap", url: `${base}/sitemap.xml`, expectedStatus: 200, contentType: "xml" },
  { target: "missing-space", url: `${base}/spaces/does-not-exist`, expectedStatus: 404, contentType: "html" },
];
export const FIXED_LIVE_CHECKS: readonly Definition[] = [
  ...LEGACY_LIVE_CHECKS,
  { target: "admin-shell", url: `${base}/admin/overview`, expectedStatus: 200, contentType: "html" },
  { target: "missing-creator", url: `${base}/creators/does-not-exist`, expectedStatus: 404, contentType: "html" },
  { target: "robots", url: `${base}/robots.txt`, expectedStatus: 200, contentType: "text" },
  { target: "creator-data", url: `${base}/creator-directory.json`, expectedStatus: 200, contentType: "json" },
  { target: "admin-auth", url: "https://europe-west1-virtualartplattform.cloudfunctions.net/getLieuvaAdminSession", expectedStatus: 401, contentType: "json", method: "POST" },
  ...(["white-cube", "nocturne", "pavilion"] as const).map((id): Definition => ({
    target: `${id}-asset`, url: `${base}/assets/templates/premium-v3/${id}-desktop.glb`,
    expectedStatus: 200, contentType: "asset", method: "HEAD",
  })),
  { target: "release", url: `${base}/release.json`, expectedStatus: 200, contentType: "json" },
];

export type ReleaseStamp = { schemaVersion: 1; commitSha: string; builtAt: string };
export function revalidatesRelease(headers: Headers): boolean {
  const directives = (headers.get("cache-control") ?? "").toLowerCase().split(",").map((value) => value.trim());
  return ["no-cache", "max-age=0", "must-revalidate"].every((value) => directives.includes(value));
}

export function parseReleaseStamp(value: unknown): ReleaseStamp | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const stamp = value as Record<string, unknown>;
  if (Object.keys(stamp).sort().join(",") !== "builtAt,commitSha,schemaVersion" || stamp.schemaVersion !== 1 || typeof stamp.commitSha !== "string" || !/^[a-f0-9]{40}$/.test(stamp.commitSha) ||
    typeof stamp.builtAt !== "string" || !Number.isFinite(Date.parse(stamp.builtAt))) return null;
  return { schemaVersion: 1, commitSha: stamp.commitSha, builtAt: stamp.builtAt };
}

export async function readCheckBody(response: Response, maximum = 512_000): Promise<string> {
  if (Number(response.headers.get("content-length")) > maximum) {
    await response.body?.cancel();
    throw new Error("body-too-large");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximum) throw new Error("body-too-large");
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { await reader.cancel().catch(() => undefined); }
}

function directives(value: string | null): string[] {
  return (value ?? "").toLowerCase().split(",").map((part) => part.trim());
}

function htmlNoindex(body: string): boolean {
  return [...body.matchAll(/<meta\b[^>]*>/gi)].some(([tag]) => {
    const attributes = Object.fromEntries([...tag.matchAll(/\s([a-z][a-z0-9:-]*)\s*=\s*(["'])(.*?)\2/gi)].map(([, key, , value]) => [key.toLowerCase(), value.toLowerCase()]));
    return attributes.name === "robots" && directives(attributes.content).includes("noindex");
  });
}

export function allowedCheckStatus(target: CheckTarget, expected: number, actual: unknown): boolean {
  return actual === expected || (target === "admin-auth" && actual === 403);
}

function publicCreatorData(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return Object.keys(data).sort().join(",") === "creators,schemaVersion" && data.schemaVersion === 1 &&
    Array.isArray(data.creators) && data.creators.length <= 500 && data.creators.every((entry: unknown) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
      const creator = entry as Record<string, unknown>;
      return Object.keys(creator).sort().join(",") === "bio,displayName,followerCount,handle,imagePresent" &&
        typeof creator.handle === "string" && /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(creator.handle) && !creator.handle.includes("--") &&
        typeof creator.displayName === "string" && creator.displayName.trim().length > 0 && creator.displayName.length <= 60 &&
        typeof creator.bio === "string" && creator.bio.length <= 320 && typeof creator.imagePresent === "boolean" &&
        Number.isSafeInteger(creator.followerCount) && Number(creator.followerCount) >= 0;
    });
}

async function checkContract(definition: Definition, response: Response): Promise<CheckEvidence> {
  if (!allowedCheckStatus(definition.target, definition.expectedStatus, response.status)) return "http-status";
  const type = (response.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
  const types = { html: /^text\/html$/, xml: /^(?:application|text)\/xml$/, text: /^text\/plain$/, json: /^application\/json$/, asset: /^(?:model\/gltf-binary|application\/octet-stream)$/ };
  if (!types[definition.contentType].test(type)) return "content-type";
  const { target } = definition;
  if (target === "release" && !revalidatesRelease(response.headers)) return "cache-policy";
  if (definition.contentType === "asset") {
    const length = response.headers.get("content-length") ?? "";
    if (!/^[1-9][0-9]*$/.test(length) || !Number.isSafeInteger(Number(length)) || Number(length) > 25 * 1024 * 1024) return "body-contract";
    const cache = response.headers.get("cache-control") ?? "";
    const directives = cache.toLowerCase().split(",").map((value) => value.trim());
    return directives.includes("public") && directives.includes("immutable") && directives.includes("max-age=31536000") &&
      !directives.some((value) => /^(?:private|no-store|no-cache)(?:=|$)/.test(value)) ? "ok" : "cache-policy";
  }
  const privacy = target === "admin-shell" || target === "missing-space" || target === "missing-creator";
  if (privacy && (!directives(response.headers.get("cache-control")).includes("no-store") ||
    !directives(response.headers.get("x-robots-tag")).includes("noindex"))) return "privacy-headers";
  if (target === "home" || target === "admin-shell") {
    if (response.headers.get("x-content-type-options") !== "nosniff" ||
      response.headers.get("x-frame-options")?.toUpperCase() !== "DENY") return "security-headers";
  }
  const body = await readCheckBody(response);
  if (definition.contentType === "html") {
    if (!/<(?:!doctype html|html)\b/i.test(body) || !/<title>[^<]+<\/title>/i.test(body)) return "body-contract";
    return privacy && !htmlNoindex(body) ? "privacy-headers" : "ok";
  }
  if (target === "robots") return /^Sitemap:\s*https:\/\/lieuva\.com\/sitemap\.xml\s*$/im.test(body) ? "ok" : "body-contract";
  if (target === "sitemap") {
    if (!/<urlset\b/i.test(body) || !/<\/urlset>/i.test(body)) return "body-contract";
    const locations = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)];
    if (locations.length > 5000 || !locations.some(([, value]) => value === `${base}/`) || !locations.some(([, value]) => value === `${base}/creators`)) return "body-contract";
    return locations.every(([, location]) => {
      try {
        const url = new URL(location);
        return url.origin === base && !url.search && !url.hash && !url.username && !url.password &&
          (url.pathname === "/" || url.pathname === "/creators" || /^\/spaces\/[A-Za-z0-9_-]{1,128}$/.test(url.pathname) ||
            (/^\/creators\/[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(url.pathname) && !url.pathname.includes("--")));
      } catch { return false; }
    }) ? "ok" : "body-contract";
  }
  try {
    const payload = JSON.parse(body);
    if (target === "admin-auth") return ["UNAUTHENTICATED", "PERMISSION_DENIED"].includes(payload?.error?.status) && !Object.hasOwn(payload, "result") && !Object.hasOwn(payload, "data") ? "ok" : "body-contract";
    if (target === "release") return parseReleaseStamp(payload) ? "ok" : "body-contract";
    return publicCreatorData(payload) ? "ok" : "body-contract";
  } catch { return "body-contract"; }
}

export async function runFixedLieuvaAdminChecks(fetcher: typeof fetch = fetch, clock: () => number = Date.now): Promise<Omit<LieuvaAdminCheckRun, "id">> {
  const startedAt = new Date(clock()).toISOString();
  const checks = await Promise.all(FIXED_LIVE_CHECKS.map(async (definition): Promise<LieuvaAdminCheck> => {
    const start = clock();
    let response: Response | undefined;
    try {
      response = await fetcher(definition.url, {
        method: definition.method ?? "GET", redirect: "manual",
        headers: { "User-Agent": "LIEUVA-admin-console-check/2", "cache-control": "no-cache", ...(definition.method === "POST" ? { "content-type": "application/json" } : {}) },
        ...(definition.method === "POST" ? { body: '{"data":{}}' } : {}),
        signal: AbortSignal.timeout(8_000),
      });
      const evidence = await checkContract(definition, response);
      return { target: definition.target, url: definition.url, expectedStatus: definition.expectedStatus, actualStatus: response.status, status: evidence === "ok" ? "passed" : "failed", durationMs: Math.max(0, clock() - start), evidence };
    } catch (error) {
      const evidence = error instanceof Error && error.message === "body-too-large" ? "body-too-large" :
        error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name) ? "timeout" : "network";
      return { target: definition.target, url: definition.url, expectedStatus: definition.expectedStatus, actualStatus: response?.status ?? null, status: response ? "failed" : "unavailable", durationMs: Math.max(0, clock() - start), evidence };
    } finally { await response?.body?.cancel().catch(() => undefined); }
  }));
  return { suiteVersion: ADMIN_CHECK_SUITE_VERSION, startedAt, completedAt: new Date(clock()).toISOString(), overall: checks.every(({ status }) => status === "passed") ? "passed" : "failed", checks };
}
