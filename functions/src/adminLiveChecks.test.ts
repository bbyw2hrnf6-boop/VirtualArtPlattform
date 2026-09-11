import { describe, expect, it } from "vitest";
import { FIXED_LIVE_CHECKS, parseReleaseStamp, readCheckBody, runFixedLieuvaAdminChecks, type CheckTarget } from "./adminLiveChecks.js";

const release = { schemaVersion: 1, commitSha: "a".repeat(40), builtAt: "2026-09-11T12:00:00.000Z" };
const html = '<!doctype html><html><head><title>LIEUVA</title><meta content="noindex,nofollow,noarchive" name="robots"></head></html>';
const sitemap = '<urlset><url><loc>https://lieuva.com/</loc></url><url><loc>https://lieuva.com/creators</loc></url></urlset>';
function validCheckResponse(url: string): Response {
  const definition = FIXED_LIVE_CHECKS.find((check) => check.url === url)!;
  const bodies = { html, xml: sitemap, text: "User-agent: *\nSitemap: https://lieuva.com/sitemap.xml", json: JSON.stringify(definition.target === "release" ? release : definition.target === "admin-auth" ? { error: { status: "UNAUTHENTICATED" } } : { schemaVersion: 1, creators: [] }), asset: null };
  const types = { html: "text/html; charset=utf-8", xml: "application/xml", text: "text/plain", json: "application/json", asset: "model/gltf-binary" };
  return new Response(bodies[definition.contentType], { status: definition.expectedStatus, headers: {
    "content-type": types[definition.contentType], "x-content-type-options": "nosniff", "x-frame-options": "DENY", "x-robots-tag": "noindex,nofollow,noarchive",
    "cache-control": definition.contentType === "asset" ? "public,max-age=31536000,immutable" : definition.target === "release" ? "no-cache,max-age=0,must-revalidate" : "private,no-store,max-age=0",
    ...(definition.contentType === "asset" ? { "content-length": "1250000" } : {}),
  } });
}
async function probe(target: CheckTarget, response: Response | (() => Response)) {
  const run = await runFixedLieuvaAdminChecks(async (input) => {
    const url = String(input);
    return FIXED_LIVE_CHECKS.find((check) => check.url === url)?.target === target ? typeof response === "function" ? response() : response : validCheckResponse(url);
  });
  return run.checks.find((check) => check.target === target)!;
}

describe("admin live response contracts", () => {
  it("uses only fixed credential-free methods and returns enum evidence", async () => {
    const calls: string[] = [];
    const run = await runFixedLieuvaAdminChecks(async (input, init) => {
      const definition = FIXED_LIVE_CHECKS.find(({ url }) => url === String(input))!;
      expect(definition).toBeDefined();
      expect(init?.method).toBe(definition.method ?? "GET");
      expect(init?.redirect).toBe("manual");
      expect(new Headers(init?.headers).has("authorization")).toBe(false);
      expect(new Headers(init?.headers).has("cookie")).toBe(false);
      expect(init?.body).toBe(definition.target === "admin-auth" ? '{"data":{}}' : undefined);
      calls.push(definition.target);
      return validCheckResponse(String(input));
    });
    expect(run).toMatchObject({ suiteVersion: 2, overall: "passed" });
    expect(calls).toHaveLength(13);
    expect(run.checks.every(({ evidence }) => evidence === "ok")).toBe(true);
  });

  it("accepts App Check or authentication denial, never a successful admin result", async () => {
    expect(await probe("admin-auth", Response.json({ error: { status: "PERMISSION_DENIED" } }, { status: 403 }))).toMatchObject({ status: "passed", actualStatus: 403 });
    expect(await probe("admin-auth", Response.json({ result: {} }))).toMatchObject({ status: "failed", evidence: "http-status" });
    expect(await probe("admin-auth", Response.json({ error: { status: "UNAUTHENTICATED" }, data: {} }, { status: 401 }))).toMatchObject({ evidence: "body-contract" });
  });

  it("rejects privacy/header/MIME failures even at the expected HTTP status", async () => {
    for (const [target, header, value, evidence] of [
      ["home", "x-frame-options", "SAMEORIGIN", "security-headers"],
      ["admin-shell", "cache-control", "public,max-age=600", "privacy-headers"],
      ["admin-shell", "cache-control", "x-no-store", "privacy-headers"],
      ["missing-space", "x-robots-tag", "index", "privacy-headers"],
      ["missing-space", "x-robots-tag", "x-noindex", "privacy-headers"],
      ["missing-creator", "content-type", "invalid-text/html-extra", "content-type"],
      ["white-cube-asset", "cache-control", "no-cache", "cache-policy"],
      ["white-cube-asset", "cache-control", "public,s-max-age=31536000,immutable", "cache-policy"],
      ["white-cube-asset", "cache-control", "public,max-age=31536000,immutable,no-store", "cache-policy"],
      ["nocturne-asset", "content-length", "Infinity", "body-contract"],
      ["pavilion-asset", "content-length", "999999999", "body-contract"],
      ["release", "cache-control", "public,max-age=3600", "cache-policy"],
    ] as const) {
      const definition = FIXED_LIVE_CHECKS.find((check) => check.target === target)!;
      const response = validCheckResponse(definition.url);
      response.headers.set(header, value);
      expect(await probe(target, response)).toMatchObject({ status: "failed", evidence });
    }
    const response = validCheckResponse("https://lieuva.com/admin/overview");
    expect(await probe("admin-shell", new Response(html.replace("noindex,nofollow,noarchive", "index"), { status: 200, headers: response.headers }))).toMatchObject({ evidence: "privacy-headers" });
    expect(await probe("admin-shell", new Response(html.replace("noindex,nofollow,noarchive", "x-noindex"), { status: 200, headers: response.headers }))).toMatchObject({ evidence: "privacy-headers" });
  });

  it("rejects creator privacy leaks and invalid public projections", async () => {
    const creator = { handle: "test-studio", displayName: "Studio", bio: "", followerCount: 0, imagePresent: false };
    expect(await probe("creator-data", Response.json({ schemaVersion: 1, creators: [creator] }))).toMatchObject({ status: "passed" });
    for (const payload of [
      { creators: [] }, { schemaVersion: 1, creators: [], email: "private@example.test" },
      { schemaVersion: 1, creators: [{ ...creator, uid: "private-user" }] },
      { schemaVersion: 1, creators: [{ ...creator, handle: "unsafe--handle" }] },
      { schemaVersion: 1, creators: [{ ...creator, followerCount: -1 }] },
      { schemaVersion: 1, creators: new Array(501).fill(creator) },
    ]) expect(await probe("creator-data", Response.json(payload))).toMatchObject({ evidence: "body-contract" });
  });

  it("requires canonical sitemap roots and rejects foreign, private or invalid routes", async () => {
    for (const location of ["https://attacker.example/", "https://:secret@lieuva.com/", "https://lieuva.com/admin/overview", "https://lieuva.com/spaces/test?private=1", "https://lieuva.com/creators/UPPER", "https://lieuva.com/creators/test--name"]) {
      const body = sitemap.replace("</urlset>", `<url><loc>${location}</loc></url></urlset>`);
      expect(await probe("sitemap", new Response(body, { headers: { "content-type": "application/xml" } }))).toMatchObject({ evidence: "body-contract" });
    }
    expect(await probe("sitemap", new Response("<urlset></urlset>", { headers: { "content-type": "application/xml" } }))).toMatchObject({ evidence: "body-contract" });
  });

  it("bounds announced and streamed bodies and distinguishes timeout from an HTTP failure", async () => {
    await expect(readCheckBody(new Response("small", { headers: { "content-length": "512001" } }))).rejects.toThrow("body-too-large");
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(512001)); controller.close(); } });
    expect(await probe("home", new Response(stream, { headers: validCheckResponse("https://lieuva.com/").headers }))).toMatchObject({ actualStatus: 200, evidence: "body-too-large", status: "failed" });
    const run = await runFixedLieuvaAdminChecks(async () => { throw new DOMException("timeout", "TimeoutError"); });
    expect(run.checks.every(({ status, evidence, actualStatus }) => status === "unavailable" && evidence === "timeout" && actualStatus === null)).toBe(true);
  });

  it("does not accept unknown, malformed or extra release stamp data", () => {
    expect(parseReleaseStamp(release)).toEqual(release);
    for (const value of [null, [], { ...release, commitSha: null }, { ...release, builtAt: "invalid" }, { ...release, token: "secret" }]) expect(parseReleaseStamp(value)).toBeNull();
  });
});
