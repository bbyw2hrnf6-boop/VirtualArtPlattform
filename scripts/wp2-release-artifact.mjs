import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  RELEASE_DIRECTORY,
  assembleReleaseBundle,
  verifyReleaseBundle,
} from "./wp2-release-artifact-lib.mjs";

const HELP = `Create or verify the immutable WP2 Firebase release artifact.

Usage:
  node scripts/wp2-release-artifact.mjs create --commit-sha SHA \\
    --node-version 22.23.2 --firebase-cli-version 15.28.2
  node scripts/wp2-release-artifact.mjs verify --commit-sha SHA \\
    --node-version 22.23.2 --firebase-cli-version 15.28.2

Both commands use ./artifacts/wp2-release and require the production configuration
environment validated by wp2-release-preflight.mjs.
`;

function flags(argv) {
  const result = {};
  const allowed = new Set([
    "commit-sha",
    "firebase-cli-version",
    "mail-mode",
    "node-version",
    "origin",
    "project-id",
  ]);
  for (let index = 0; index < argv.length; index += 2) {
    const token = argv[index];
    const value = argv[index + 1];
    if (
      !token?.startsWith("--") ||
      !allowed.has(token.slice(2)) ||
      !value ||
      value.startsWith("--")
    )
      throw new Error(
        `Invalid release-artifact option near ${token ?? "<end>"}.`,
      );
    if (Object.hasOwn(result, token.slice(2)))
      throw new Error(`Duplicate option ${token}.`);
    result[token.slice(2)] = value;
  }
  return result;
}

const [command, ...args] = process.argv.slice(2);
if (command === "--help" || command === "help") {
  process.stdout.write(HELP);
  process.exit(0);
}
if (command !== "create" && command !== "verify")
  throw new Error("Command must be create or verify.");
const options = flags(args);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const releaseRoot = resolve(repositoryRoot, RELEASE_DIRECTORY);
const expectations = {
  commitSha: options["commit-sha"] ?? process.env.GITHUB_SHA,
  nodeVersion: options["node-version"] ?? process.versions.node,
  firebaseCliVersion:
    options["firebase-cli-version"] ?? process.env.FIREBASE_CLI_VERSION,
  firebaseProjectId:
    options["project-id"] ??
    process.env.FIREBASE_PROJECT_ID ??
    "virtualartplattform",
  productionOrigin:
    options.origin ??
    process.env.LIEUVA_PRODUCTION_ORIGIN ??
    "https://lieuva.com",
  mailMode: options["mail-mode"] ?? process.env.WP2_MAIL_MODE ?? "required",
  environment: process.env,
};
if (expectations.nodeVersion !== process.versions.node)
  throw new Error(
    `Release artifact requires exact Node ${expectations.nodeVersion}; running ${process.versions.node}.`,
  );
const manifest =
  command === "create"
    ? await assembleReleaseBundle(repositoryRoot, releaseRoot, expectations)
    : await verifyReleaseBundle(releaseRoot, expectations);
process.stdout.write(
  `${JSON.stringify(
    {
      ok: true,
      command,
      commitSha: manifest.commitSha,
      nodeVersion: manifest.nodeVersion,
      firebaseCliVersion: manifest.firebaseCliVersion,
      mailMode: manifest.mailMode,
      fileCount: manifest.files.length,
    },
    null,
    2,
  )}\n`,
);
