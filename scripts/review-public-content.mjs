import {
  boundedLimit,
  decodeFirestoreDocument,
  encodeCursor,
  equalityFilter,
  formatPublicContent,
  runtimeOperatorClient,
} from "./lib/firebase-operator-tools.mjs";
import { parseFlags } from "./lib/firebase-operator-tools.mjs";

const HELP = `Review a bounded page of currently public LIEUVA content.

Read-only. Content text is omitted unless --include-content is explicit.

Environment:
  FIREBASE_PROJECT_ID          required exact project
  FIREBASE_DATABASE_ID         optional, defaults to (default)
  GOOGLE_OAUTH_ACCESS_TOKEN    required short-lived read token

Usage:
  npm run review:public-content -- --kind spaces [--limit 25] [--cursor TOKEN]
  npm run review:public-content -- --kind creators --include-content
  npm run review:public-content -- --kind posts --include-content

Options:
  --kind spaces|creators|posts
  --limit 1..100
  --cursor opaque cursor returned by the previous page
  --include-content deliberately include public Space/artwork, bio/link, or post text
  --help
`;

const flags = parseFlags(process.argv.slice(2), {
  kind: "value",
  limit: "value",
  cursor: "value",
  "include-content": "boolean",
  help: "boolean",
});

if (flags.help) {
  process.stdout.write(HELP);
  process.exit(0);
}

const kind = flags.kind;
if (!new Set(["spaces", "creators", "posts"]).has(kind))
  throw new Error("--kind must be spaces, creators, or posts.");
const limit = boundedLimit(flags.limit);
const client = runtimeOperatorClient();

const query = kind === "spaces"
  ? { collectionId: "galleries", where: equalityFilter("visibility", "public") }
  : kind === "creators"
    ? { collectionId: "creatorProfiles", where: equalityFilter("profilePublic", true) }
    : {
        collectionId: "posts",
        allDescendants: true,
        where: equalityFilter("moderationStatus", "published"),
      };

const documents = await client.runQuery({
  ...query,
  limit,
  cursor: flags.cursor,
});

const profiles = new Map();
if (kind === "posts") {
  const creatorIds = [...new Set(documents.map((document) => {
    const segments = document.name.split("/");
    const index = segments.lastIndexOf("creatorAccounts");
    return index >= 0 ? segments[index + 1] : undefined;
  }).filter(Boolean))];
  await Promise.all(creatorIds.map(async (creatorId) => {
    const rawProfile = await client.getDocument(`creatorProfiles/${creatorId}`, { allowMissing: true });
    profiles.set(creatorId, rawProfile ? decodeFirestoreDocument(rawProfile).data : undefined);
  }));
}

const records = documents.flatMap((document) => {
  let creatorProfile;
  if (kind === "posts") {
    const segments = document.name.split("/");
    const index = segments.lastIndexOf("creatorAccounts");
    creatorProfile = profiles.get(index >= 0 ? segments[index + 1] : undefined);
  }
  const record = formatPublicContent(kind, document, {
    includeContent: flags["include-content"] === true,
    creatorProfile,
  });
  return record ? [record] : [];
});

process.stdout.write(`${JSON.stringify({
  mode: "read-only",
  projectId: client.projectId,
  databaseId: client.databaseId,
  kind,
  scanned: documents.length,
  returned: records.length,
  includeContent: flags["include-content"] === true,
  nextCursor: documents.length === limit ? encodeCursor(documents.at(-1).name) : null,
  records,
}, null, 2)}\n`);
