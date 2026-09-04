import {
  inspectProductionEnvironment,
  parseMailMode,
  parseFunctionSelection,
  parseWp2Flags,
  validatedProductionOrigin,
  validatedProjectId,
} from "./wp2-release-lib.mjs";

const HELP = `Validate required WP2 production release environment without printing values.

No network access, deployment, or data mutation occurs.

Usage:
  node scripts/wp2-release-preflight.mjs \\
    --project-id virtualartplattform --origin https://lieuva.com \\
    --functions "saveLieuvaCreatorProfile,creatorDocument"

Use --functions all when the release deploys every Function. Mail parameters are
required only for all or a selection containing sendAuraVerificationEmail,
setAuraNewsletterPreference, or unsubscribeAuraNewsletter. Use none for Hosting.
Use --mail-mode disabled only while mail delivery intentionally remains fail-closed;
that mode requires explicit placeholder values instead of real sender facts.

Required environment:
  FIREBASE_PROJECT_ID
  VITE_FIREBASE_APPCHECK_SITE_KEY
  VITE_TELEMETRY_MODE=functions
  VITE_TELEMETRY_ENVIRONMENT=production

Conditional mail environment:
  AURA_PUBLIC_APP_URL, AURA_REPLY_TO, AURA_LEGAL_FOOTER
`;

const flags = parseWp2Flags(process.argv.slice(2), {
  "project-id": "value",
  origin: "value",
  functions: "value",
  "mail-mode": "value",
  help: "boolean",
});

if (flags.help) {
  process.stdout.write(HELP);
  process.exit(0);
}

const projectId = validatedProjectId(flags["project-id"] ?? process.env.FIREBASE_PROJECT_ID);
const origin = validatedProductionOrigin(flags.origin ?? "https://lieuva.com");
const selection = parseFunctionSelection(flags.functions ?? process.env.WP2_DEPLOY_FUNCTIONS);
const mailMode = parseMailMode(flags["mail-mode"] ?? process.env.WP2_MAIL_MODE ?? "required");
const result = inspectProductionEnvironment(process.env, {
  functionSelection: selection,
  expectedProjectId: projectId,
  expectedOrigin: origin,
  mailMode,
});

process.stdout.write(`${JSON.stringify({
  ok: result.ok,
  projectId,
  origin,
  functionMode: result.functionMode,
  functionCount: result.functionCount,
  mailRequired: result.mailRequired,
  mailMode: result.mailMode,
  checkedFields: result.checkedFields,
  issues: result.issues,
}, null, 2)}\n`);

if (!result.ok) {
  process.stderr.write("WP2 release preflight failed. Values were not printed.\n");
  process.exitCode = 1;
}
