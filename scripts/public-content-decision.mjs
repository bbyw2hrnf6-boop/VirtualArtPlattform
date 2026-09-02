import { randomUUID } from "node:crypto";
import {
  assertExecutionGuard,
  buildPublicContentDecisionPlan,
  parseFlags,
  PUBLIC_CONTENT_DECISIONS,
  publicContentReviewId,
  PUBLIC_REVIEW_REASON_CODES,
  runtimeOperatorClient,
  validatedDocumentId,
  validatedOperatorId,
} from "./lib/firebase-operator-tools.mjs";

const HELP = `Plan or execute one exact LIEUVA public-content decision.

Default mode is dry-run. Approval/blocking requires the exact Firestore update
time and content fingerprint copied from review:public-content output. Spaces
also require the exact revision. Execution requires exact project confirmation.

Environment:
  FIREBASE_PROJECT_ID          required exact project
  FIREBASE_DATABASE_ID         optional, defaults to (default)
  GOOGLE_OAUTH_ACCESS_TOKEN    required short-lived token
  MODERATION_OPERATOR_ID       required opaque operator identifier

Review first:
  npm run review:public-content -- --kind spaces --include-content
  npm run review:public-content -- --kind creators --include-content

Dry-run example:
  npm run review:public-content:decision -- --kind space --id SPACE_ID \\
    --decision approve --reason reviewed-production --expected-gate pending \\
    --expected-update-time RFC3339 --expected-fingerprint SHA256 \\
    --expected-revision 1

Execute only after comparing dry-run output:
  append --execute --confirm-project "$FIREBASE_PROJECT_ID"

Options:
  --kind space|creator
  --id exact target document ID
  --decision ${[...PUBLIC_CONTENT_DECISIONS].join("|")}
  --reason ${[...PUBLIC_REVIEW_REASON_CODES].join("|")}
  --expected-gate pending|approved
  --expected-update-time exact documentUpdateTime from review output
  --expected-fingerprint exact contentFingerprint from review output
  --expected-revision required only for a Space
  --execute
  --confirm-project exact project ID; ignored without --execute
  --help
`;

const flags = parseFlags(process.argv.slice(2), {
  kind: "value",
  id: "value",
  decision: "value",
  reason: "value",
  "expected-gate": "value",
  "expected-update-time": "value",
  "expected-fingerprint": "value",
  "expected-revision": "value",
  execute: "boolean",
  "confirm-project": "value",
  help: "boolean",
});

if (flags.help) {
  process.stdout.write(HELP);
  process.exit(0);
}

if (!new Set(["space", "creator"]).has(flags.kind))
  throw new Error("--kind must be space or creator.");
if (!PUBLIC_CONTENT_DECISIONS.has(flags.decision))
  throw new Error(`--decision must be one of: ${[...PUBLIC_CONTENT_DECISIONS].join(", ")}.`);
if (!PUBLIC_REVIEW_REASON_CODES.has(flags.reason))
  throw new Error(`--reason must be one of: ${[...PUBLIC_REVIEW_REASON_CODES].join(", ")}.`);

const targetId = validatedDocumentId(flags.id, `${flags.kind} ID`);
const operatorId = validatedOperatorId(process.env.MODERATION_OPERATOR_ID);
const client = runtimeOperatorClient();
assertExecutionGuard({
  execute: flags.execute === true,
  confirmProject: flags["confirm-project"],
  projectId: client.projectId,
});

const collection = flags.kind === "space" ? "galleries" : "creatorProfiles";
const reviewId = publicContentReviewId(flags.kind, targetId);
const [rawTarget, rawReview] = await Promise.all([
  client.getDocument(`${collection}/${targetId}`),
  client.getDocument(`publicContentReviews/${reviewId}`, { allowMissing: true }),
]);
const plan = buildPublicContentDecisionPlan({
  projectId: client.projectId,
  databaseId: client.databaseId,
  kind: flags.kind,
  targetId,
  decision: flags.decision,
  reasonCode: flags.reason,
  operatorId,
  occurredAt: new Date().toISOString(),
  eventId: randomUUID().replaceAll("-", ""),
  rawTarget,
  rawReview,
  expectedGate: flags["expected-gate"],
  expectedUpdateTime: flags["expected-update-time"],
  expectedFingerprint: flags["expected-fingerprint"],
  expectedRevision: flags["expected-revision"],
});

process.stdout.write(`${JSON.stringify({
  mode: flags.execute ? "execute" : "dry-run",
  ...plan.summary,
}, null, 2)}\n`);

if (!flags.execute) {
  process.stdout.write("Dry-run complete. No Firestore commit was sent.\n");
  process.exit(0);
}

const result = await client.commit(plan.writes);
process.stdout.write(`${JSON.stringify({
  status: "committed",
  commitTime: result.commitTime,
  writeResults: (result.writeResults ?? []).map((write) => ({ updateTime: write.updateTime })),
}, null, 2)}\n`);
