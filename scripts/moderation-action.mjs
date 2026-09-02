import { randomUUID } from "node:crypto";
import {
  assertExecutionGuard,
  buildModerationActionPlan,
  MODERATION_ACTIONS,
  parseFlags,
  reportModerationCaseId,
  runtimeOperatorClient,
  validatedCaseId,
  validatedDecisionCode,
  validatedDocumentId,
  validatedOperatorId,
  validatedReportId,
} from "./lib/firebase-operator-tools.mjs";

const HELP = `Plan or execute one bounded LIEUVA moderation action.

Default mode is dry-run: exact documents are read and preconditions are checked,
but no write request is sent. Execution requires both --execute and an exact
--confirm-project value. This tool cannot delete content, purge a Space, disable
an account, or accept arbitrary Firestore paths.

Environment:
  FIREBASE_PROJECT_ID          required exact project
  FIREBASE_DATABASE_ID         optional, defaults to (default)
  GOOGLE_OAUTH_ACCESS_TOKEN    required short-lived token
  MODERATION_OPERATOR_ID       required opaque operator identifier

Report actions:
  npm run moderation:action -- --action remove-post --report REPORT_ID \\
    --expected-status open --expected-case-version 1 --reason spam
  npm run moderation:action -- --action close-report --report REPORT_ID \\
    --expected-status open --expected-case-version 1 --reason no-violation
  npm run moderation:action -- --action restore-post --report REPORT_ID \\
    --expected-status actioned --expected-case-version 2 --reason appeal-reversed

Space discovery action:
  npm run moderation:action -- --action demote-space --gallery GALLERY_ID \\
    --case CASE_ID --expected-discover eligible --expected-case-version 0 --reason rights

Restoring Space discovery must use the exact fingerprint/revision-bound
review:public-content:decision command with reason appeal-reversed.

Execute only after reviewing dry-run output:
  append --execute --confirm-project "$FIREBASE_PROJECT_ID"

Options:
  --action ${[...MODERATION_ACTIONS].join("|")}
  --reason bounded decision code (invalid values print the allow-list)
  --report exact 64-hex report ID
  --gallery exact gallery ID
  --case optional assertion for report actions; their persisted case ID is authoritative
  --expected-status required for report actions
  --expected-discover eligible|ineligible for Space actions
  --expected-case-version exact queue version; use 0 only when creating a Space case
  --execute
  --confirm-project exact project ID; ignored without --execute
  --help
`;

const flags = parseFlags(process.argv.slice(2), {
  action: "value",
  reason: "value",
  report: "value",
  gallery: "value",
  case: "value",
  "expected-status": "value",
  "expected-discover": "value",
  "expected-case-version": "value",
  execute: "boolean",
  "confirm-project": "value",
  help: "boolean",
});

if (flags.help) {
  process.stdout.write(HELP);
  process.exit(0);
}

const action = flags.action;
if (!MODERATION_ACTIONS.has(action))
  throw new Error(`--action must be one of: ${[...MODERATION_ACTIONS].join(", ")}.`);
const decisionCode = validatedDecisionCode(flags.reason);
const operatorId = validatedOperatorId(process.env.MODERATION_OPERATOR_ID);
const client = runtimeOperatorClient();
assertExecutionGuard({
  execute: flags.execute === true,
  confirmProject: flags["confirm-project"],
  projectId: client.projectId,
});

const reportAction = new Set(["close-report", "remove-post", "restore-post"]).has(action);
let rawReport;
let rawTarget;
let caseId;

if (reportAction) {
  const reportId = validatedReportId(flags.report);
  if (flags.gallery) throw new Error("Report actions do not accept --gallery.");
  rawReport = await client.getDocument(`creatorReports/${reportId}`);
  caseId = reportModerationCaseId(rawReport, flags.case);
  if (action !== "close-report") {
    const creatorId = validatedDocumentId(rawReport.fields?.targetCreatorId?.stringValue, "target Creator ID");
    const postId = validatedDocumentId(rawReport.fields?.postId?.stringValue, "post ID");
    rawTarget = await client.getDocument(`creatorAccounts/${creatorId}/posts/${postId}`);
  }
} else {
  const galleryId = validatedDocumentId(flags.gallery, "gallery ID");
  if (flags.report) throw new Error("Space actions do not accept --report.");
  caseId = validatedCaseId(flags.case);
  rawTarget = await client.getDocument(`galleries/${galleryId}`);
}

const rawCase = await client.getDocument(`moderationCases/${caseId}`, { allowMissing: true });
const plan = buildModerationActionPlan({
  projectId: client.projectId,
  databaseId: client.databaseId,
  action,
  decisionCode,
  operatorId,
  occurredAt: new Date().toISOString(),
  eventId: randomUUID().replaceAll("-", ""),
  caseId,
  rawCase,
  rawReport,
  rawTarget,
  expectedCaseVersion: flags["expected-case-version"],
  expectedReportStatus: flags["expected-status"],
  expectedDiscover: flags["expected-discover"],
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
