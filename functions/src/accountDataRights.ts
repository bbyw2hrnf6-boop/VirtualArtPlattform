export type PortableValue =
  | null
  | boolean
  | number
  | string
  | PortableValue[]
  | { [key: string]: PortableValue };

export type AccountExportInput = {
  generatedAt: string;
  account: Record<string, unknown>;
  profile?: Record<string, unknown>;
  newsletter?: Record<string, unknown>;
  publicationUsage?: Record<string, unknown>;
  ownedSpaces: Array<{
    id: string;
    manifest: Record<string, unknown>;
    members: Array<Record<string, unknown>>;
    media: Array<Record<string, unknown>>;
  }>;
  sharedSpaces: Array<Record<string, unknown>>;
  receivedInvitations: Array<Record<string, unknown>>;
  sentInvitations: Array<Record<string, unknown>>;
  submittedModerationReports?: Array<Record<string, unknown>>;
  operationalState: Record<string, unknown>;
  creatorIdentity?: Record<string, unknown>;
};

function sensitiveKey(key: string) {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return /(?:password|passphrase|secret|credentials?|privatekey|apikey|authorization|cookies?|setcookie|(?:access|auth|refresh|id|bearer|session|csrf|unsubscribe|confirmation|download)?tokens?|tokenhash|passwordhash|passwordsalt|signingkey|encryptionkey)$/.test(normalized);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/** Convert Firestore/Auth-shaped values to deterministic JSON without secrets. */
export function portableValue(value: unknown, depth = 0): PortableValue {
  if (depth > 20 || value === undefined || typeof value === "function" || typeof value === "symbol")
    return null;
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => portableValue(item, depth + 1));
  if (isRecord(value)) {
    const timestamp = value as { toDate?: () => Date };
    if (typeof timestamp.toDate === "function") {
      const date = timestamp.toDate();
      return date instanceof Date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
    }
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !sensitiveKey(key))
        .map(([key, item]) => [key, portableValue(item, depth + 1)]),
    );
  }
  return String(value);
}

export async function collectBoundedPages<Item, Cursor>({
  fetchPage,
  maximumItems,
}: {
  fetchPage: (cursor: Cursor | undefined, limit: number) => Promise<{ items: Item[]; nextCursor?: Cursor }>;
  maximumItems: number;
}): Promise<Item[]> {
  if (!Number.isSafeInteger(maximumItems) || maximumItems < 1)
    throw new Error("page-limit-invalid");
  const result: Item[] = [];
  let cursor: Cursor | undefined;
  let pageCount = 0;
  const stringCursors = new Set<string>();
  while (true) {
    pageCount += 1;
    if (pageCount > maximumItems + 1) throw new Error("page-invalid");
    const page = await fetchPage(cursor, Math.min(200, maximumItems - result.length + 1));
    if (!Array.isArray(page.items) || page.items.length > Math.min(200, maximumItems - result.length + 1))
      throw new Error("page-invalid");
    result.push(...page.items);
    if (result.length > maximumItems) throw new Error("page-limit-exceeded");
    if (page.nextCursor === undefined) return result;
    if (page.items.length === 0) throw new Error("page-invalid");
    if (typeof page.nextCursor === "string") {
      if (stringCursors.has(page.nextCursor)) throw new Error("page-invalid");
      stringCursors.add(page.nextCursor);
    }
    cursor = page.nextCursor;
  }
}

export async function mapInChunks<Input, Output>(
  values: Input[],
  chunkSize: number,
  task: (value: Input) => Promise<Output>,
): Promise<Output[]> {
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 1) throw new Error("chunk-size-invalid");
  const output: Output[] = [];
  for (let index = 0; index < values.length; index += chunkSize)
    output.push(...await Promise.all(values.slice(index, index + chunkSize).map(task)));
  return output;
}

function role(value: unknown) {
  return value === "owner" || value === "editor" || value === "viewer" ? value : "viewer";
}

function invitationExport(value: Record<string, unknown>, direction: "received" | "sent") {
  return portableValue({
    direction,
    galleryId: value.galleryId,
    galleryTitle: value.galleryTitle,
    role: role(value.role),
    status: value.status,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    expiresAt: value.expiresAt,
    acceptedAt: value.acceptedAt,
  });
}

function moderationReportExport(value: Record<string, unknown>) {
  return portableValue({
    recordRef: value.recordRef,
    targetKind: value.targetKind,
    relatedCreatorRef: value.relatedCreatorRef,
    relatedPostRef: value.relatedPostRef,
    reason: value.reason,
    submissionCount: value.submissionCount,
    submittedAt: value.submittedAt,
    lastSubmittedAt: value.lastSubmittedAt,
  });
}

/**
 * Build the server portion of the account export. Collaborator email addresses
 * and invitation targets are intentionally excluded from another user's export.
 */
export function buildAccountExport(input: AccountExportInput): PortableValue {
  return portableValue({
    format: "aura-account-export",
    schemaVersion: 1,
    exportedAt: input.generatedAt,
    account: input.account,
    profile: input.profile ?? null,
    newsletter: input.newsletter ?? null,
    publicationUsage: input.publicationUsage ?? null,
    ownedSpaces: input.ownedSpaces.map((space) => ({
      id: space.id,
      manifest: space.manifest,
      access: {
        members: space.members.map((member) => ({
          role: role(member.role),
          status: member.status,
          addedAt: member.addedAt,
        })),
      },
      media: space.media,
    })),
    sharedSpaces: input.sharedSpaces.map((space) => ({
      galleryId: space.galleryId,
      role: role(space.role),
      status: space.status,
      addedAt: space.addedAt,
    })),
    invitations: {
      received: input.receivedInvitations.map((invite) => invitationExport(invite, "received")),
      sent: input.sentInvitations.map((invite) => invitationExport(invite, "sent")),
    },
    moderation: {
      reportsSubmitted: (input.submittedModerationReports ?? []).map(moderationReportExport),
    },
    operationalState: input.operationalState,
    creatorIdentity: input.creatorIdentity ?? null,
    localBrowserData: {
      includedByClient: true,
      note: "Account-linked drafts from this browser are appended when the file is downloaded.",
    },
  });
}

export const MAX_IMMEDIATE_ACCOUNT_EXPORT_BYTES = 8 * 1024 * 1024;

export function assertImmediateAccountExportSize(
  value: PortableValue,
  maximumBytes = MAX_IMMEDIATE_ACCOUNT_EXPORT_BYTES,
): PortableValue {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1)
    throw new Error("export-size-limit-invalid");
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > maximumBytes)
    throw new Error("export-size-limit-exceeded");
  return value;
}

export function assertRecentAuthentication(
  authTimeSeconds: unknown,
  nowSeconds = Math.floor(Date.now() / 1000),
  maximumAgeSeconds = 10 * 60,
) {
  if (
    typeof authTimeSeconds !== "number" ||
    !Number.isFinite(authTimeSeconds) ||
    authTimeSeconds > nowSeconds + 60 ||
    nowSeconds - authTimeSeconds > maximumAgeSeconds
  ) {
    throw new Error("recent-authentication-required");
  }
}

export function assertAccountAccess(uid: unknown, signInProvider: unknown) {
  if (typeof uid !== "string" || !uid || signInProvider === "anonymous")
    throw new Error("account-required");
  return uid;
}
