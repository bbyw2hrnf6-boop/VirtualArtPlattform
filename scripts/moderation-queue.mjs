import {
  boundedLimit,
  decodeFirestoreDocument,
  encodeCursor,
  equalityFilter,
  formatModerationCase,
  parseFlags,
  runtimeOperatorClient,
  validatedDocumentId,
} from "./lib/firebase-operator-tools.mjs";

const HELP = `Read a bounded page of the LIEUVA moderation case queue.

Read-only. Reporter identity is never returned. Target post text is omitted
unless --include-content is explicit.

Environment:
  FIREBASE_PROJECT_ID          required exact project
  FIREBASE_DATABASE_ID         optional, defaults to (default)
  GOOGLE_OAUTH_ACCESS_TOKEN    required short-lived read token

Usage:
  npm run moderation:queue -- [--status new] [--limit 25] [--cursor TOKEN]
  npm run moderation:queue -- --include-content

Options:
  --status new|received|triaged|investigating|actioned|closed
  --limit 1..100
  --cursor opaque cursor returned by the previous page
  --include-content deliberately fetch target post text
  --help
`;

const flags = parseFlags(process.argv.slice(2), {
  status: "value",
  limit: "value",
  cursor: "value",
  "include-content": "boolean",
  help: "boolean",
});

if (flags.help) {
  process.stdout.write(HELP);
  process.exit(0);
}

const status = flags.status ?? "new";
if (!new Set(["new", "received", "triaged", "investigating", "actioned", "closed"]).has(status))
  throw new Error("--status must be new, received, triaged, investigating, actioned, or closed.");
const limit = boundedLimit(flags.limit);
const client = runtimeOperatorClient();
const cases = await client.runQuery({
  collectionId: "moderationCases",
  where: status === "new"
    ? equalityFilter("newReportPending", true)
    : equalityFilter("status", status),
  limit,
  cursor: flags.cursor,
});

const includeContent = flags["include-content"] === true;
const records = await Promise.all(cases.map(async (rawCase) => {
  let targetPost;
  if (includeContent) {
    const data = decodeFirestoreDocument(rawCase).data;
    if (data.targetKind === "creator-post") {
      const creatorId = validatedDocumentId(data.target?.creatorId, "target Creator ID");
      const postId = validatedDocumentId(data.target?.postId, "post ID");
      targetPost = await client.getDocument(
        `creatorAccounts/${creatorId}/posts/${postId}`,
        { allowMissing: true },
      );
    }
  }
  return formatModerationCase(rawCase, { includeContent, targetPost });
}));
records.sort((left, right) => String(left.openedAt ?? "").localeCompare(String(right.openedAt ?? "")));

process.stdout.write(`${JSON.stringify({
  mode: "read-only",
  projectId: client.projectId,
  databaseId: client.databaseId,
  status,
  scanned: cases.length,
  returned: records.length,
  includeContent,
  nextCursor: cases.length === limit ? encodeCursor(cases.at(-1).name) : null,
  records,
}, null, 2)}\n`);
