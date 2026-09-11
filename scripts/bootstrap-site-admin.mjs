import { randomUUID } from "node:crypto";

import { parseFlags, validatedProjectId } from "./lib/firebase-operator-tools.mjs";
import {
  assertBootstrapExecutionGuard,
  buildSiteAdminBootstrapPlan,
  commitSiteAdminBootstrap,
  IdentityToolkitAdminClient,
  loadGcloudCredential,
  readSiteAdminBootstrapState,
  SiteAdminFirestoreClient,
  validatedBootstrapSelector,
} from "./lib/site-admin-bootstrap.mjs";

const HELP = `Plan or execute the one-time LIEUVA first-owner bootstrap.

Default mode is a networked dry-run. It resolves one existing Firebase Auth
account and reads the server-only registry, but sends no Firestore write. The
selected account must be enabled, email-verified, and use Email/Password or
Google sign-in. This tool never creates an Auth user or sets custom claims.

Authentication:
  The active gcloud account and project are read without changing them. A
  short-lived OAuth token is captured in memory from gcloud and never printed,
  persisted, or accepted as a command-line option. Set GCLOUD_BIN only when
  gcloud is not on PATH.

Dry-run:
  npm run admin:bootstrap -- --project PROJECT_ID --email OWNER_EMAIL
  npm run admin:bootstrap -- --project PROJECT_ID --uid FIREBASE_UID

Execute only after reviewing dry-run output and copying its exact UID/email:
  npm run admin:bootstrap -- --project PROJECT_ID --uid FIREBASE_UID \\
    --email OWNER_EMAIL --execute --confirm-project PROJECT_ID \\
    --confirm-uid FIREBASE_UID --confirm-email OWNER_EMAIL

Options:
  --project required exact Firebase/Google Cloud project ID
  --uid exact existing Firebase Auth UID (at least UID or email is required)
  --email exact existing Firebase Auth email (at least UID or email is required)
  --execute create the first owner, one-shot guard, and immutable audit event
  --confirm-project required in execute mode; must equal --project
  --confirm-uid required in execute mode; must equal the resolved account UID
  --confirm-email required in execute mode; must equal the resolved account email
  --help
`;

const flags = parseFlags(process.argv.slice(2), {
  project: "value",
  uid: "value",
  email: "value",
  execute: "boolean",
  "confirm-project": "value",
  "confirm-uid": "value",
  "confirm-email": "value",
  help: "boolean",
});

if (flags.help) {
  process.stdout.write(HELP);
  process.exit(0);
}

const projectId = validatedProjectId(flags.project);
const selector = validatedBootstrapSelector({ uid: flags.uid, email: flags.email });
const credential = await loadGcloudCredential({ projectId });
const identity = new IdentityToolkitAdminClient({
  projectId,
  accessToken: credential.accessToken,
});
const user = await identity.lookup(selector);
const execute = flags.execute === true;
assertBootstrapExecutionGuard({
  execute,
  projectId,
  user,
  confirmProject: flags["confirm-project"],
  confirmUid: flags["confirm-uid"],
  confirmEmail: flags["confirm-email"],
});

const client = new SiteAdminFirestoreClient({
  projectId,
  accessToken: credential.accessToken,
});
const planInput = {
  projectId,
  user,
  actor: credential.actor,
  occurredAt: new Date().toISOString(),
  eventId: randomUUID().replaceAll("-", ""),
};

if (!execute) {
  const state = await readSiteAdminBootstrapState(client, { uid: user.uid });
  const plan = buildSiteAdminBootstrapPlan({ ...planInput, state });
  process.stdout.write(`${JSON.stringify({ mode: "dry-run", ...plan.summary }, null, 2)}\n`);
  process.stdout.write("Dry-run complete. No Firestore transaction or write was sent.\n");
  process.exit(0);
}

const { plan, result } = await commitSiteAdminBootstrap({ client, planInput });
process.stdout.write(`${JSON.stringify({ mode: "execute", ...plan.summary }, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({
  status: "committed",
  commitTime: result?.commitTime,
  writeResults: (result?.writeResults ?? []).map((write) => ({ updateTime: write.updateTime })),
}, null, 2)}\n`);
