import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  EXPECTED_RELEASE_ENDPOINTS,
  EXPECTED_RELEASE_PARAMS,
  EXPECTED_RELEASE_REQUIRED_APIS,
} from "../functions/scripts/generate-manifest.mjs";
import {
  RELEASE_DIRECTORY,
  assembleReleaseBundle,
  verifyReleaseBundle,
} from "./wp2-release-artifact-lib.mjs";

const environment = {
  FIREBASE_PROJECT_ID: "virtualartplattform",
  AURA_LEGAL_FOOTER: "LIEUVA B.V., Example Street 1, Amsterdam",
  AURA_PUBLIC_APP_URL: "https://lieuva.com",
  AURA_REPLY_TO: "support@lieuva.com",
  VITE_FIREBASE_APPCHECK_SITE_KEY: "6LcProductionSiteKey_1234567890",
  VITE_TELEMETRY_ENVIRONMENT: "production",
  VITE_TELEMETRY_MODE: "functions",
};
const options = {
  commitSha: "a".repeat(40),
  nodeVersion: "22.23.2",
  firebaseCliVersion: "15.28.2",
  firebaseProjectId: "virtualartplattform",
  productionOrigin: "https://lieuva.com",
  environment,
};

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "lieuva-release-"));
  const files = {
    "dist/index.html": "<!doctype html><title>LIEUVA</title>",
    "dist/assets/index-abc.js": 'console.log("LIEUVA");',
    "firebase-cli/package.json": JSON.stringify({
      name: "@lieuva/firebase-cli-toolchain",
      version: "1.0.0",
      private: true,
      engines: { node: "22.23.2" },
      packageManager: "npm@10.9.8",
      dependencies: { "firebase-tools": "15.28.2" },
    }),
    "firebase-cli/package-lock.json": JSON.stringify({
      name: "@lieuva/firebase-cli-toolchain",
      version: "1.0.0",
      lockfileVersion: 3,
      requires: true,
      packages: {
        "": {
          name: "@lieuva/firebase-cli-toolchain",
          version: "1.0.0",
          engines: { node: "22.23.2" },
          dependencies: { "firebase-tools": "15.28.2" },
        },
        "node_modules/firebase-tools": {
          version: "15.28.2",
          resolved:
            "https://registry.npmjs.org/firebase-tools/-/firebase-tools-15.28.2.tgz",
          integrity: `sha512-${Buffer.alloc(64).toString("base64")}`,
        },
      },
    }),
    "functions/generated/app-shell.html":
      "<!doctype html><title>LIEUVA</title>",
    "functions/lib/index.js": EXPECTED_RELEASE_ENDPOINTS.map(
      (name) => `export const ${name} = true;`,
    ).join("\n"),
    "functions/functions.yaml": JSON.stringify({
      endpoints: Object.fromEntries(
        EXPECTED_RELEASE_ENDPOINTS.map((name) => [name, { entryPoint: name }]),
      ),
      specVersion: "v1alpha1",
      requiredAPIs: EXPECTED_RELEASE_REQUIRED_APIS.map((requirement) => ({ ...requirement })),
      extensions: {},
      params: EXPECTED_RELEASE_PARAMS,
    }),
    "functions/package.json": JSON.stringify({
      main: "lib/index.js",
      engines: { node: "22" },
    }),
    "functions/package-lock.json": JSON.stringify({ lockfileVersion: 3 }),
    "package.json": JSON.stringify({
      private: true,
      engines: { node: "22.23.2" },
    }),
    "package-lock.json": JSON.stringify({ lockfileVersion: 3 }),
    ".firebaserc": JSON.stringify({
      projects: { default: "virtualartplattform" },
    }),
    "scripts/wp2-production-smoke.mjs": "export {};",
    "scripts/wp2-release-lib.mjs": "export {};",
  };
  for (const [path, contents] of Object.entries(files)) {
    const target = join(root, path);
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, contents);
  }
  await writeFile(
    join(root, "firebase.json"),
    JSON.stringify({
      functions: {
        source: "functions",
        runtime: "nodejs22",
        predeploy: [
          'node "$PROJECT_DIR/scripts/firebase-predeploy.mjs" build',
          'node "$PROJECT_DIR/scripts/firebase-predeploy.mjs" functions-check',
        ],
      },
      firestore: { rules: "firestore.rules" },
      storage: { rules: "storage.rules" },
      hosting: {
        public: "dist",
        predeploy: ['node "$PROJECT_DIR/scripts/firebase-predeploy.mjs" build'],
      },
    }),
  );
  return root;
}

test("assembles a production-only bundle and verifies every digest", async () => {
  const root = await fixture();
  const releaseRoot = join(root, RELEASE_DIRECTORY);
  const manifest = await assembleReleaseBundle(root, releaseRoot, options);
  assert.equal(manifest.commitSha, options.commitSha);
  assert.equal(manifest.firebaseCliVersion, "15.28.2");
  assert.ok(
    manifest.files.some((entry) => entry.path === "functions/lib/index.js"),
  );
  const firebase = JSON.parse(
    await readFile(join(releaseRoot, "firebase.json"), "utf8"),
  );
  assert.deepEqual(Object.keys(firebase).sort(), ["functions", "hosting"]);
  assert.equal(Object.hasOwn(firebase.functions, "predeploy"), false);
  assert.equal(Object.hasOwn(firebase.hosting, "predeploy"), false);
  await verifyReleaseBundle(releaseRoot, options);
});

test("rejects changed bytes, config drift, extras, and symbolic links", async () => {
  const changedRoot = await fixture();
  const changedRelease = join(changedRoot, RELEASE_DIRECTORY);
  await assembleReleaseBundle(changedRoot, changedRelease, options);
  await writeFile(join(changedRelease, "dist/index.html"), "tampered");
  await assert.rejects(
    verifyReleaseBundle(changedRelease, options),
    /digests do not match/,
  );

  const driftRoot = await fixture();
  const driftRelease = join(driftRoot, RELEASE_DIRECTORY);
  await assembleReleaseBundle(driftRoot, driftRelease, options);
  await assert.rejects(
    verifyReleaseBundle(driftRelease, {
      ...options,
      environment: { ...environment, AURA_REPLY_TO: "changed@lieuva.com" },
    }),
    /configuration changed/,
  );

  const extraRoot = await fixture();
  const extraRelease = join(extraRoot, RELEASE_DIRECTORY);
  await assembleReleaseBundle(extraRoot, extraRelease, options);
  await writeFile(join(extraRelease, "unexpected.txt"), "unexpected");
  await assert.rejects(
    verifyReleaseBundle(extraRelease, options),
    /unexpected file/,
  );

  const linkRoot = await fixture();
  const linkRelease = join(linkRoot, RELEASE_DIRECTORY);
  await assembleReleaseBundle(linkRoot, linkRelease, options);
  await symlink("index.html", join(linkRelease, "dist/alias.html"));
  await assert.rejects(
    verifyReleaseBundle(linkRelease, options),
    /symbolic link/,
  );
});

test("command refuses a claimed Node version that differs from the running toolchain", () => {
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL("./wp2-release-artifact.mjs", import.meta.url)),
      "verify",
      "--node-version",
      "0.0.1",
    ],
    { encoding: "utf8", env: { ...process.env, ...environment } },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires exact Node 0[.]0[.]1/);
});
