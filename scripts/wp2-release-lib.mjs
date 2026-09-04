const PROJECT_ID = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const FUNCTION_ID = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/;
const SITE_KEY = /^[A-Za-z0-9_-]{20,200}$/;
const PLACEHOLDER = /(?:change[-_ ]?me|example\.(?:com|org|net)|invalid\.example|not[-_ ]?configured|placeholder|replace[-_ ]?me|todo|xxxxx)/i;

export const MAIL_FUNCTIONS = new Set([
  "sendAuraVerificationEmail",
  "setAuraNewsletterPreference",
  "unsubscribeAuraNewsletter",
]);

export function parseWp2Flags(argv, schema) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const kind = schema[key];
    if (!kind) throw new Error(`Unknown option: --${key}`);
    if (Object.hasOwn(result, key)) throw new Error(`Duplicate option: --${key}`);
    if (kind === "boolean") {
      result[key] = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Option --${key} requires a value.`);
    result[key] = value;
    index += 1;
  }
  return result;
}

export function parseFunctionSelection(value) {
  if (typeof value !== "string" || !value.trim())
    throw new Error("Declare --functions explicitly as all, none, or a comma-separated Function list.");
  const normalized = value.trim();
  if (normalized === "all") return { mode: "all", names: new Set() };
  if (normalized === "none" || normalized === "hosting") return { mode: "none", names: new Set() };
  const names = new Set(normalized.split(",").map((item) => item.trim()).filter(Boolean).map((item) => {
    const name = item.startsWith("functions:") ? item.slice("functions:".length) : item;
    if (!FUNCTION_ID.test(name)) throw new Error("Function selection contains an invalid Function ID.");
    return name;
  }));
  if (!names.size) throw new Error("Function selection cannot be empty.");
  return { mode: "selected", names };
}

export function parseMailMode(value) {
  if (value === "required" || value === "disabled") return value;
  throw new Error("Declare mail mode explicitly as required or disabled.");
}

export function selectionRequiresMail(selection) {
  return selection.mode === "all" || [...selection.names].some((name) => MAIL_FUNCTIONS.has(name));
}

export function validatedProjectId(value) {
  if (typeof value !== "string" || !PROJECT_ID.test(value))
    throw new Error("Production project ID is missing or invalid.");
  return value;
}

function productionOrigin(value, label) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    throw new Error(`${label} must be an absolute HTTPS origin.`);
  }
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.pathname !== "/"
    || url.search
    || url.hash
    || url.hostname === "localhost"
    || url.hostname.endsWith(".local")
    || /^(?:0|10|127|169[.]254|192[.]168)[.]/.test(url.hostname)
    || /^172[.](?:1[6-9]|2[0-9]|3[01])[.]/.test(url.hostname)
    || url.hostname === "[::1]"
    || url.hostname.endsWith(".internal")
  ) throw new Error(`${label} must be a public HTTPS origin without credentials, path, query, or fragment.`);
  return url.origin;
}

export function validatedProductionOrigin(value) {
  return productionOrigin(value, "Production origin");
}

export function validatedNoindexPath(value) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^\/(?:spaces|creators)\/[A-Za-z0-9_-]{1,128}$/.test(value))
    throw new Error("--noindex-path must be one exact /spaces/ID or /creators/HANDLE path.");
  return value;
}

export function boundedInteger(value, { label, fallback, minimum, maximum }) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum)
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}.`);
  return parsed;
}

function issue(field, code) {
  return { field, code };
}

function missingOrPlaceholder(value) {
  return typeof value !== "string" || !value.trim() || PLACEHOLDER.test(value);
}

export function inspectProductionEnvironment(environment, {
  functionSelection,
  expectedProjectId,
  expectedOrigin,
  mailMode = "required",
  nodeVersion = process.versions.node,
} = {}) {
  const selection = typeof functionSelection === "string"
    ? parseFunctionSelection(functionSelection)
    : functionSelection;
  if (!selection) throw new Error("Function selection is required for production validation.");
  const normalizedMailMode = parseMailMode(mailMode);
  const projectId = validatedProjectId(expectedProjectId);
  const origin = validatedProductionOrigin(expectedOrigin);
  const issues = [];
  const [major, minor] = String(nodeVersion).split(".").map(Number);
  if (
    !Number.isSafeInteger(major)
    || !Number.isSafeInteger(minor)
    || major !== 22
    || minor < 13
  )
    issues.push(issue("NODE_VERSION", "requires-pinned-node-22.13-or-newer"));

  const rawProject = environment.FIREBASE_PROJECT_ID;
  const configuredProject = rawProject?.trim();
  if (!configuredProject) issues.push(issue("FIREBASE_PROJECT_ID", "missing"));
  else if (configuredProject !== projectId || rawProject !== configuredProject)
    issues.push(issue("FIREBASE_PROJECT_ID", "wrong-project-or-whitespace"));

  const rawSiteKey = environment.VITE_FIREBASE_APPCHECK_SITE_KEY;
  const siteKey = rawSiteKey?.trim();
  if (!siteKey) issues.push(issue("VITE_FIREBASE_APPCHECK_SITE_KEY", "missing"));
  else if (rawSiteKey !== siteKey || !SITE_KEY.test(siteKey) || PLACEHOLDER.test(siteKey))
    issues.push(issue("VITE_FIREBASE_APPCHECK_SITE_KEY", "invalid-or-placeholder"));
  if (environment.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN?.trim())
    issues.push(issue("VITE_FIREBASE_APPCHECK_DEBUG_TOKEN", "must-not-be-set-in-production"));

  if (environment.VITE_TELEMETRY_MODE !== "functions")
    issues.push(issue("VITE_TELEMETRY_MODE", "must-equal-functions"));
  if (environment.VITE_TELEMETRY_ENVIRONMENT !== "production")
    issues.push(issue("VITE_TELEMETRY_ENVIRONMENT", "must-equal-production"));

  const mailSelected = selectionRequiresMail(selection);
  const mailRequired = mailSelected && normalizedMailMode === "required";
  if (mailSelected) {
    const rawPublicUrl = environment.AURA_PUBLIC_APP_URL;
    const publicUrl = rawPublicUrl?.trim();
    if (missingOrPlaceholder(publicUrl)) issues.push(issue("AURA_PUBLIC_APP_URL", "missing-or-placeholder"));
    else if (rawPublicUrl !== publicUrl) issues.push(issue("AURA_PUBLIC_APP_URL", "invalid-whitespace"));
    else {
      try {
        if (productionOrigin(publicUrl, "AURA_PUBLIC_APP_URL") !== origin)
          issues.push(issue("AURA_PUBLIC_APP_URL", "wrong-origin"));
      } catch {
        issues.push(issue("AURA_PUBLIC_APP_URL", "invalid"));
      }
    }
    const rawReplyTo = environment.AURA_REPLY_TO;
    const replyTo = rawReplyTo?.trim();
    const validReplyShape = rawReplyTo === replyTo
      && /^[^\s@]+@[^\s@]+[.][^\s@]+$/.test(replyTo ?? "");
    const rawFooter = environment.AURA_LEGAL_FOOTER;
    const footer = rawFooter?.trim();
    const validFooterShape = rawFooter === footer
      && (footer?.length ?? 0) >= 20
      && (footer?.length ?? 0) <= 500;
    if (mailRequired) {
      if (
        missingOrPlaceholder(replyTo)
        || !validReplyShape
        || replyTo?.toLowerCase().endsWith("@invalid.example")
      ) issues.push(issue("AURA_REPLY_TO", "missing-invalid-or-placeholder"));
      if (missingOrPlaceholder(footer) || !validFooterShape)
        issues.push(issue("AURA_LEGAL_FOOTER", "missing-invalid-or-placeholder"));
    } else {
      if (!validReplyShape || !PLACEHOLDER.test(replyTo ?? ""))
        issues.push(issue("AURA_REPLY_TO", "disabled-mode-requires-placeholder"));
      if (!validFooterShape || !PLACEHOLDER.test(footer ?? ""))
        issues.push(issue("AURA_LEGAL_FOOTER", "disabled-mode-requires-placeholder"));
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    mailRequired,
    mailMode: normalizedMailMode,
    functionMode: selection.mode,
    functionCount: selection.mode === "selected" ? selection.names.size : undefined,
    checkedFields: [
      "NODE_VERSION",
      "FIREBASE_PROJECT_ID",
      "VITE_FIREBASE_APPCHECK_SITE_KEY",
      "VITE_FIREBASE_APPCHECK_DEBUG_TOKEN",
      "VITE_TELEMETRY_MODE",
      "VITE_TELEMETRY_ENVIRONMENT",
      ...(mailSelected ? ["AURA_PUBLIC_APP_URL", "AURA_REPLY_TO", "AURA_LEGAL_FOOTER"] : []),
    ],
  };
}

function contentTypeStartsWith(snapshot, expected) {
  return String(snapshot.contentType ?? "").toLowerCase().startsWith(expected);
}

function includesLieuva(body) {
  return /lieuva/i.test(body);
}

function htmlTagAttributes(tag) {
  return Object.fromEntries(
    [...tag.matchAll(/\b([A-Za-z][\w:-]*)\s*=\s*["']([^"']*)["']/g)]
      .map((match) => [match[1].toLowerCase(), match[2]]),
  );
}

function metaContent(body, name) {
  for (const match of body.matchAll(/<meta\b[^>]*>/gi)) {
    const fields = htmlTagAttributes(match[0]);
    if (fields.name?.toLowerCase() === name.toLowerCase()) return fields.content ?? "";
  }
  return undefined;
}

function canonicalHref(body) {
  for (const match of body.matchAll(/<link\b[^>]*>/gi)) {
    const fields = htmlTagAttributes(match[0]);
    if ((fields.rel ?? "").toLowerCase().split(/\s+/).includes("canonical")) return fields.href;
  }
  return undefined;
}

function validateIndexableDocument(kind, body, expectedCanonical) {
  if (!includesLieuva(body)) throw new Error(`${kind}: LIEUVA marker missing.`);
  if (canonicalHref(body) !== expectedCanonical) throw new Error(`${kind}: canonical route mismatch.`);
  const robots = metaContent(body, "robots") ?? "";
  if (
    !/\bindex\b/i.test(robots)
    || !/\bfollow\b/i.test(robots)
    || /\bnoindex\b/i.test(robots)
    || /\bnofollow\b/i.test(robots)
  )
    throw new Error(`${kind}: expected indexable robots metadata.`);
}

export function validateSmokeSnapshot(kind, snapshot, { expectedOrigin } = {}) {
  if (!snapshot || typeof snapshot !== "object") throw new Error(`${kind}: response is missing.`);
  if (kind === "home" || kind === "creators") {
    if (snapshot.status !== 200) throw new Error(`${kind}: expected HTTP 200.`);
    if (!contentTypeStartsWith(snapshot, "text/html")) throw new Error(`${kind}: expected HTML.`);
    const origin = validatedProductionOrigin(expectedOrigin);
    validateIndexableDocument(kind, snapshot.body, kind === "home" ? `${origin}/` : `${origin}/creators`);
    if (kind === "creators" && metaContent(snapshot.body, "lieuva:creator-route") !== "directory")
      throw new Error("creators: server directory marker missing.");
    if (kind === "home" && metaContent(snapshot.body, "lieuva:creator-route") === "directory")
      throw new Error("home: received the Creator directory document.");
    return { status: snapshot.status, contentType: "html" };
  }
  if (kind === "directory") {
    if (snapshot.status !== 200) throw new Error("directory: expected HTTP 200.");
    if (!contentTypeStartsWith(snapshot, "application/json")) throw new Error("directory: expected JSON.");
    let payload;
    try { payload = JSON.parse(snapshot.body); } catch { throw new Error("directory: invalid JSON."); }
    if (payload?.schemaVersion !== 1 || !Array.isArray(payload.creators) || payload.creators.length > 500)
      throw new Error("directory: invalid bounded public projection.");
    const allowed = ["bio", "displayName", "followerCount", "handle", "imagePresent"];
    for (const creator of payload.creators) {
      if (!creator || typeof creator !== "object" || Array.isArray(creator))
        throw new Error("directory: invalid Creator entry.");
      if (JSON.stringify(Object.keys(creator).sort()) !== JSON.stringify(allowed))
        throw new Error("directory: entry escaped its public field allowlist.");
      if (
        typeof creator.handle !== "string"
        || creator.handle.length < 3
        || creator.handle.length > 30
        || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(creator.handle)
        || creator.handle.includes("--")
        || typeof creator.displayName !== "string"
        || !creator.displayName.trim()
        || creator.displayName.length > 60
        || typeof creator.bio !== "string"
        || creator.bio.length > 320
        || typeof creator.imagePresent !== "boolean"
        || !Number.isSafeInteger(creator.followerCount)
        || creator.followerCount < 0
      ) throw new Error("directory: invalid public Creator field values.");
    }
    return { status: snapshot.status, contentType: "json", count: payload.creators.length };
  }
  if (kind === "sitemap") {
    if (snapshot.status !== 200) throw new Error("sitemap: expected HTTP 200.");
    if (!/(?:application|text)\/xml/i.test(snapshot.contentType ?? ""))
      throw new Error("sitemap: expected XML.");
    if (!/<urlset\b/i.test(snapshot.body) || /<script\b/i.test(snapshot.body))
      throw new Error("sitemap: invalid XML projection.");
    const origin = validatedProductionOrigin(expectedOrigin);
    const locations = [...snapshot.body.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((match) => match[1]);
    const parsed = locations.flatMap((location) => {
      try { return [new URL(location)]; } catch { return []; }
    });
    if (
      locations.length > 1_001
      || parsed.length !== locations.length
      || parsed.some((location) => location.origin !== origin)
      || parsed.some((location) => location.username || location.password || location.search || location.hash)
      || parsed.some((location) => !/^\/(?:$|creators|creators\/[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]|spaces\/[A-Za-z0-9_-]{1,128})$/.test(location.pathname))
      || parsed.some((location) => location.pathname.startsWith("/creators/") && location.pathname.includes("--"))
    ) throw new Error("sitemap: invalid, cross-origin, or excessive URL entries.");
    const canonical = new Set(parsed.map((location) => location.href));
    if (!canonical.has(`${origin}/`) || !canonical.has(`${origin}/creators`))
      throw new Error("sitemap: required canonical routes are missing.");
    return { status: snapshot.status, contentType: "xml", count: locations.length };
  }
  if (kind === "noindex") {
    if (![200, 404].includes(snapshot.status)) throw new Error("noindex: expected HTTP 200 or 404.");
    if (!contentTypeStartsWith(snapshot, "text/html")) throw new Error("noindex: expected HTML.");
    const robots = `${snapshot.headers?.["x-robots-tag"] ?? ""} ${snapshot.body.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)/i)?.[1] ?? ""}`;
    if (!/\bnoindex\b/i.test(robots)) throw new Error("noindex: directive missing.");
    return { status: snapshot.status, contentType: "html", noindex: true };
  }
  if (kind === "callable") {
    if (![401, 403].includes(snapshot.status)) throw new Error("callable: unauthenticated request was not rejected.");
    let payload;
    try { payload = JSON.parse(snapshot.body); } catch { throw new Error("callable: rejection was not JSON."); }
    const status = payload?.error?.status;
    if (status !== "UNAUTHENTICATED" && status !== "PERMISSION_DENIED")
      throw new Error("callable: rejection status was not an access denial.");
    return { status: snapshot.status, contentType: "json", rejected: true };
  }
  throw new Error("Unknown smoke-check kind.");
}

export function smokeEndpoints({ origin, projectId, region = "europe-west1", noindexPath }) {
  const base = validatedProductionOrigin(origin);
  const project = validatedProjectId(projectId);
  if (!/^[a-z]+(?:-[a-z0-9]+)+[0-9]$/.test(region)) throw new Error("Cloud Functions region is invalid.");
  const optionalPath = validatedNoindexPath(noindexPath);
  return [
    { kind: "home", url: new URL("/", base).href, maximumBytes: 1_048_576, accept: "text/html" },
    { kind: "creators", url: new URL("/creators", base).href, maximumBytes: 1_048_576, accept: "text/html" },
    { kind: "directory", url: new URL("/creator-directory.json", base).href, maximumBytes: 524_288, accept: "application/json" },
    { kind: "sitemap", url: new URL("/sitemap.xml", base).href, maximumBytes: 1_048_576, accept: "application/xml,text/xml" },
    ...(optionalPath ? [{ kind: "noindex", url: new URL(optionalPath, base).href, maximumBytes: 1_048_576, accept: "text/html" }] : []),
    {
      kind: "callable",
      url: `https://${region}-${project}.cloudfunctions.net/getMyLieuvaCreatorProfile`,
      maximumBytes: 65_536,
      accept: "application/json",
      method: "POST",
      requestBody: JSON.stringify({ data: {} }),
    },
  ];
}
