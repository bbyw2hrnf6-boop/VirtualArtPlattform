import test from "node:test";
import assert from "node:assert/strict";
import {
  inspectProductionEnvironment,
  parseFunctionSelection,
  parseWp2Flags,
  selectionRequiresMail,
  smokeEndpoints,
  validateSmokeSnapshot,
  validatedNoindexPath,
  validatedProductionOrigin,
} from "./wp2-release-lib.mjs";

const baseEnvironment = {
  FIREBASE_PROJECT_ID: "virtualartplattform",
  VITE_FIREBASE_APPCHECK_SITE_KEY: "6LcProductionSiteKey_1234567890",
  VITE_TELEMETRY_MODE: "functions",
  VITE_TELEMETRY_ENVIRONMENT: "production",
};

test("strict flag and deploy-scope parsing rejects ambiguity", () => {
  assert.deepEqual(parseWp2Flags(["--functions", "none"], { functions: "value" }), { functions: "none" });
  assert.throws(() => parseWp2Flags(["--functions", "none", "--functions", "all"], { functions: "value" }), /Duplicate/);
  assert.throws(() => parseFunctionSelection(""), /Declare/);
  const selected = parseFunctionSelection("functions:creatorDocument,sendAuraVerificationEmail");
  assert.equal(selected.names.has("creatorDocument"), true);
  assert.equal(selectionRequiresMail(selected), true);
  assert.equal(selectionRequiresMail(parseFunctionSelection("hosting")), false);
});

test("production preflight accepts bounded non-mail environment", () => {
  const result = inspectProductionEnvironment(baseEnvironment, {
    functionSelection: parseFunctionSelection("creatorDocument,spaceDocument"),
    expectedProjectId: "virtualartplattform",
    expectedOrigin: "https://lieuva.com",
    nodeVersion: "22.13.1",
  });
  assert.equal(result.ok, true);
  assert.equal(result.mailRequired, false);
  assert.equal(result.checkedFields.includes("AURA_REPLY_TO"), false);

  const unsupportedMajor = inspectProductionEnvironment(baseEnvironment, {
    functionSelection: parseFunctionSelection("none"),
    expectedProjectId: "virtualartplattform",
    expectedOrigin: "https://lieuva.com",
    nodeVersion: "26.4.0",
  });
  assert.equal(unsupportedMajor.ok, false);
  assert.equal(unsupportedMajor.issues.some((item) => item.field === "NODE_VERSION"), true);
});

test("production preflight fails closed on placeholders and debug App Check", () => {
  const result = inspectProductionEnvironment({
    ...baseEnvironment,
    VITE_FIREBASE_APPCHECK_SITE_KEY: "replace-me-placeholder-key",
    VITE_FIREBASE_APPCHECK_DEBUG_TOKEN: "debug-token-must-not-leak",
  }, {
    functionSelection: parseFunctionSelection("none"),
    expectedProjectId: "virtualartplattform",
    expectedOrigin: "https://lieuva.com",
    nodeVersion: "22.13.1",
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.issues.map((item) => item.field).sort(), [
    "VITE_FIREBASE_APPCHECK_DEBUG_TOKEN",
    "VITE_FIREBASE_APPCHECK_SITE_KEY",
  ]);
  assert.equal(JSON.stringify(result).includes("debug-token-must-not-leak"), false);
});

test("mail variables are conditional and never returned", () => {
  const result = inspectProductionEnvironment({
    ...baseEnvironment,
    AURA_PUBLIC_APP_URL: "https://lieuva.com",
    AURA_REPLY_TO: "support@lieuva.com",
    AURA_LEGAL_FOOTER: "LIEUVA B.V., Example Street 1, Amsterdam",
  }, {
    functionSelection: parseFunctionSelection("setAuraNewsletterPreference"),
    expectedProjectId: "virtualartplattform",
    expectedOrigin: "https://lieuva.com",
    nodeVersion: "22.13.1",
  });
  assert.equal(result.ok, true);
  assert.equal(result.mailRequired, true);
  assert.equal(JSON.stringify(result).includes("support@lieuva.com"), false);
  const missing = inspectProductionEnvironment(baseEnvironment, {
    functionSelection: parseFunctionSelection("all"),
    expectedProjectId: "virtualartplattform",
    expectedOrigin: "https://lieuva.com",
    nodeVersion: "22.13.1",
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.issues.some((item) => item.field === "AURA_LEGAL_FOOTER"), true);
  const whitespace = inspectProductionEnvironment({
    ...baseEnvironment,
    VITE_FIREBASE_APPCHECK_SITE_KEY: ` ${baseEnvironment.VITE_FIREBASE_APPCHECK_SITE_KEY}`,
  }, {
    functionSelection: parseFunctionSelection("none"),
    expectedProjectId: "virtualartplattform",
    expectedOrigin: "https://lieuva.com",
    nodeVersion: "22.13.1",
  });
  assert.equal(whitespace.ok, false);
});

test("smoke targets remain exact and bounded", () => {
  assert.equal(validatedProductionOrigin("https://lieuva.com"), "https://lieuva.com");
  assert.throws(() => validatedProductionOrigin("http://localhost:5173"), /public HTTPS/);
  assert.equal(validatedNoindexPath("/spaces/pending-1"), "/spaces/pending-1");
  assert.throws(() => validatedNoindexPath("/spaces/x?token=secret"), /exact/);
  const endpoints = smokeEndpoints({
    origin: "https://lieuva.com",
    projectId: "virtualartplattform",
    noindexPath: "/spaces/pending-1",
  });
  assert.equal(endpoints.length, 6);
  assert.equal(endpoints.filter((endpoint) => endpoint.method === "POST").length, 1);
  assert.equal(endpoints.at(-1).requestBody, '{"data":{}}');
});

test("smoke response validation checks public projections and access denial", () => {
  assert.deepEqual(validateSmokeSnapshot("home", {
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: '<title>LIEUVA</title><meta name="robots" content="index,follow"><link rel="canonical" href="https://lieuva.com/">',
  }, { expectedOrigin: "https://lieuva.com" }), { status: 200, contentType: "html" });
  assert.deepEqual(validateSmokeSnapshot("creators", {
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: '<title>Creators | LIEUVA</title><meta name="robots" content="index,follow"><meta content="directory" name="lieuva:creator-route"><link href="https://lieuva.com/creators" rel="canonical">',
  }, { expectedOrigin: "https://lieuva.com" }), { status: 200, contentType: "html" });
  assert.equal(validateSmokeSnapshot("directory", {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ schemaVersion: 1, creators: [{
      handle: "artist",
      displayName: "Artist",
      bio: "",
      imagePresent: false,
      followerCount: 0,
    }] }),
  }).count, 1);
  assert.throws(() => validateSmokeSnapshot("directory", {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ schemaVersion: 1, creators: [{
      handle: "artist",
      displayName: "Artist",
      bio: "",
      imagePresent: false,
      followerCount: 0,
      contactEmail: "private@example.test",
    }] }),
  }), /allowlist/);
  assert.equal(validateSmokeSnapshot("sitemap", {
    status: 200,
    contentType: "application/xml",
    body: "<urlset><url><loc>https://lieuva.com/</loc></url><url><loc>https://lieuva.com/creators</loc></url></urlset>",
  }, { expectedOrigin: "https://lieuva.com" }).count, 2);
  assert.throws(() => validateSmokeSnapshot("sitemap", {
    status: 200,
    contentType: "application/xml",
    body: "<urlset><url><loc>https://unrelated.example/</loc></url></urlset>",
  }, { expectedOrigin: "https://lieuva.com" }), /cross-origin/);
  assert.equal(validateSmokeSnapshot("noindex", {
    status: 200,
    contentType: "text/html",
    headers: { "x-robots-tag": "noindex,follow" },
    body: "<title>LIEUVA</title>",
  }).noindex, true);
  assert.equal(validateSmokeSnapshot("callable", {
    status: 401,
    contentType: "application/json",
    body: JSON.stringify({ error: { status: "UNAUTHENTICATED" } }),
  }).rejected, true);
});
