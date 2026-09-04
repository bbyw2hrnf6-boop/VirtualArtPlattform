import {
  assertFails,
  assertSucceeds,
  type RulesTestContext,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { Timestamp } from "firebase/firestore";
import type { UploadMetadata } from "firebase/storage";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  RULES_STORAGE_URL,
  USER_EMAILS,
  USER_IDS,
  anonymousToken,
  createRulesTestEnvironment,
  seedFirestore,
  unverifiedToken,
  verifiedContext,
} from "./rulesTestEnvironment";

const KIB = 1024;
const now = () => Date.now();
const futureMs = (days = 7) => now() + days * 86_400_000;

const galleryRecord = (
  galleryId: string,
  expiresAtMs: number,
  overrides: Record<string, unknown> = {},
) => ({
  artworks: [{ storagePath: `published/${USER_IDS.owner}/${galleryId}/artworks/1.webp` }],
  coverPath: `published/${USER_IDS.owner}/${galleryId}/cover.webp`,
  expiresAt: Timestamp.fromMillis(expiresAtMs),
  lifecycleStatus: "active",
  ownerId: USER_IDS.owner,
  retention: "account-preview",
  revision: 1,
  schemaVersion: 3,
  visibility: "public",
  ...overrides,
});

const publicationPermit = (
  galleryId: string,
  expiresAtMs: number,
  overrides: Record<string, unknown> = {},
) => ({
  expiresAt: Timestamp.fromMillis(expiresAtMs),
  galleryId,
  kind: "initial",
  ownerId: USER_IDS.owner,
  permitExpiresAt: Timestamp.fromMillis(now() + 10 * 60_000),
  retention: "account-preview",
  status: "pending",
  visibility: "public",
  ...overrides,
});

const revisionPermit = (
  galleryId: string,
  revisionId: string,
  expiresAtMs: number,
  uploaderId: string,
  overrides: Record<string, unknown> = {},
) => ({
  baseRevision: 1,
  expiresAt: Timestamp.fromMillis(expiresAtMs),
  galleryId,
  kind: "revision",
  ownerId: USER_IDS.owner,
  permitExpiresAt: Timestamp.fromMillis(now() + 10 * 60_000),
  retention: "account-preview",
  revisionId,
  status: "pending",
  uploaderId,
  visibility: "public",
  ...overrides,
});

const metadata = (
  galleryId: string,
  expiresAtMs: number,
  kind: "artwork" | "cover",
  overrides: Record<string, string> = {},
): Record<string, string> => ({
  expiresAtMs: String(expiresAtMs),
  galleryId,
  kind,
  ownerId: USER_IDS.owner,
  retention: "account-preview",
  schemaVersion: "3",
  visibility: "public",
  ...overrides,
});

const revisionMetadata = (
  galleryId: string,
  revisionId: string,
  expiresAtMs: number,
  uploaderId: string,
  kind: "artwork" | "cover",
  overrides: Record<string, string> = {},
): Record<string, string> => ({
  ...metadata(galleryId, expiresAtMs, kind),
  revisionId,
  uploaderId,
  ...overrides,
});

const put = (
  context: RulesTestContext,
  path: string,
  bytes: Uint8Array,
  customMetadata: Record<string, string>,
  contentType = "image/webp",
) =>
  context
    .storage(RULES_STORAGE_URL)
    .ref(path)
    .put(bytes, { contentType, customMetadata })
    .then(() => undefined);

const readMetadata = (context: RulesTestContext, path: string) =>
  context.storage(RULES_STORAGE_URL).ref(path).getMetadata();

const remove = (context: RulesTestContext, path: string) =>
  context.storage(RULES_STORAGE_URL).ref(path).delete();

const list = (context: RulesTestContext, path: string) =>
  context.storage(RULES_STORAGE_URL).ref(path).listAll();

const seedStorage = async (
  environment: RulesTestEnvironment,
  entries: ReadonlyArray<
    readonly [
      path: string,
      bytes?: Uint8Array,
      metadata?: UploadMetadata,
    ]
  >,
) => {
  await environment.withSecurityRulesDisabled(async (context) => {
    for (const [path, bytes = new Uint8Array([1]), objectMetadata] of entries) {
      await context
        .storage(RULES_STORAGE_URL)
        .ref(path)
        .put(bytes, objectMetadata)
        .then(() => undefined);
    }
  });
};

const authContexts = (environment: RulesTestEnvironment) => ({
  anonymous: environment.unauthenticatedContext(),
  editor: verifiedContext(
    environment,
    USER_IDS.editor,
    USER_EMAILS.editor,
  ),
  outsider: verifiedContext(
    environment,
    USER_IDS.outsider,
    USER_EMAILS.outsider,
  ),
  owner: verifiedContext(environment, USER_IDS.owner, USER_EMAILS.owner),
  signedAnonymous: environment.authenticatedContext(
    "anonymous-user",
    anonymousToken,
  ),
  unverified: environment.authenticatedContext(
    "unverified-user",
    unverifiedToken("unverified@example.test"),
  ),
  viewer: verifiedContext(
    environment,
    USER_IDS.viewer,
    USER_EMAILS.viewer,
  ),
});

describe("Storage authorization matrix", () => {
  let environment: RulesTestEnvironment;

  beforeAll(async () => {
    environment = await createRulesTestEnvironment();
  });

  beforeEach(async () => {
    await Promise.all([environment.clearFirestore(), environment.clearStorage()]);
  });

  afterAll(async () => {
    await environment.cleanup();
  });

  it("mirrors public, private-member, owner, lifecycle, and legacy gallery reads", async () => {
    const expiresAtMs = futureMs();
    await seedFirestore(environment, [
      ["galleries/public", galleryRecord("public", expiresAtMs)],
      ["galleries/unlisted", galleryRecord("unlisted", expiresAtMs, { visibility: "unlisted" })],
      ["galleries/private", galleryRecord("private", expiresAtMs, { visibility: "private" })],
      ["galleries/expired", galleryRecord("expired", now() - 60_000)],
      ["galleries/archived", galleryRecord("archived", expiresAtMs, { lifecycleStatus: "archived" })],
      ["galleries/legacy", galleryRecord("legacy", expiresAtMs, { schemaVersion: 2, visibility: "private" })],
      [
        `galleries/private/members/${USER_EMAILS.viewer}`,
        { email: USER_EMAILS.viewer, role: "viewer", status: "active" },
      ],
      [
        `galleries/private/members/${USER_EMAILS.editor}`,
        { email: USER_EMAILS.editor, role: "editor", status: "revoked" },
      ],
    ]);
    const paths = ["public", "unlisted", "private", "expired", "archived", "legacy"]
      .map((galleryId) => `published/${USER_IDS.owner}/${galleryId}/cover.webp`);
    await seedStorage(environment, paths.map((path) => [path]));
    const contexts = authContexts(environment);

    await assertSucceeds(readMetadata(contexts.anonymous, paths[0]));
    await assertSucceeds(readMetadata(contexts.anonymous, paths[1]));
    await assertFails(readMetadata(contexts.anonymous, paths[2]));
    await assertSucceeds(readMetadata(contexts.viewer, paths[2]));
    await assertFails(readMetadata(contexts.editor, paths[2]));
    await assertSucceeds(readMetadata(contexts.owner, paths[2]));
    await assertFails(readMetadata(contexts.outsider, paths[2]));
    await assertFails(readMetadata(contexts.anonymous, paths[3]));
    await assertFails(readMetadata(contexts.anonymous, paths[4]));
    await assertSucceeds(readMetadata(contexts.owner, paths[3]));
    await assertSucceeds(readMetadata(contexts.owner, paths[4]));
    await assertSucceeds(readMetadata(contexts.anonymous, paths[5]));
  });

  it("allows only media referenced by the current manifest, never retired revisions", async () => {
    const expiresAtMs = futureMs();
    const galleryId = "current-revision-only";
    const currentRoot = `published/${USER_IDS.owner}/${galleryId}/revisions/current`;
    const retiredRoot = `published/${USER_IDS.owner}/${galleryId}/revisions/retired`;
    await seedFirestore(environment, [[
      `galleries/${galleryId}`,
      galleryRecord(galleryId, expiresAtMs, {
        coverPath: `${currentRoot}/cover.webp`,
        artworks: [{ storagePath: `${currentRoot}/artworks/1.webp` }],
        revision: 3,
      }),
    ]]);
    await seedStorage(environment, [
      [`${currentRoot}/cover.webp`],
      [`${currentRoot}/artworks/1.webp`],
      [`${retiredRoot}/cover.webp`],
      [`${retiredRoot}/artworks/1.webp`],
    ]);
    const contexts = authContexts(environment);
    await assertSucceeds(readMetadata(contexts.anonymous, `${currentRoot}/cover.webp`));
    await assertSucceeds(readMetadata(contexts.owner, `${currentRoot}/artworks/1.webp`));
    await assertFails(readMetadata(contexts.anonymous, `${retiredRoot}/cover.webp`));
    await assertFails(readMetadata(contexts.owner, `${retiredRoot}/artworks/1.webp`));
  });

  it("denies direct initial cover and artwork uploads even with a live trusted permit", async () => {
    const expiresAtMs = futureMs();
    await seedFirestore(environment, [
      ["galleryPublishPermits/upload", publicationPermit("upload", expiresAtMs)],
    ]);
    const { owner } = authContexts(environment);

    await assertFails(
      put(
        owner,
        `published/${USER_IDS.owner}/upload/cover.webp`,
        new Uint8Array([1]),
        metadata("upload", expiresAtMs, "cover"),
      ),
    );
    await assertFails(
      put(
        owner,
        `published/${USER_IDS.owner}/upload/artworks/1.webp`,
        new Uint8Array([1]),
        metadata("upload", expiresAtMs, "artwork", { index: "0" }),
      ),
    );
  });

  it("rejects anonymous, unverified, forged, expired, and malformed initial uploads", async () => {
    const expiresAtMs = futureMs();
    const cases = [
      "anonymous",
      "unverified",
      "forged-owner",
      "expired-permit",
      "wrong-visibility",
      "wrong-retention",
      "wrong-expiry",
      "aborted-permit",
      "extra-metadata",
      "bad-mime",
      "zero-byte",
      "cover-too-large",
    ] as const;
    await seedFirestore(
      environment,
      cases.map((galleryId) => [
        `galleryPublishPermits/${galleryId}`,
        publicationPermit(galleryId, expiresAtMs, {
          ...(galleryId === "expired-permit"
            ? { permitExpiresAt: Timestamp.fromMillis(now() - 60_000) }
            : {}),
          ...(galleryId === "aborted-permit" ? { status: "aborted" } : {}),
        }),
      ]),
    );
    const contexts = authContexts(environment);
    const path = (galleryId: string, ownerId: string = USER_IDS.owner) =>
      `published/${ownerId}/${galleryId}/cover.webp`;

    await assertFails(
      put(
        contexts.anonymous,
        path("anonymous"),
        new Uint8Array([1]),
        metadata("anonymous", expiresAtMs, "cover"),
      ),
    );
    await assertFails(
      put(
        contexts.unverified,
        path("unverified", "unverified-user"),
        new Uint8Array([1]),
        metadata("unverified", expiresAtMs, "cover", { ownerId: "unverified-user" }),
      ),
    );
    await assertFails(
      put(
        contexts.owner,
        path("forged-owner", USER_IDS.outsider),
        new Uint8Array([1]),
        metadata("forged-owner", expiresAtMs, "cover", { ownerId: USER_IDS.outsider }),
      ),
    );
    await assertFails(
      put(
        contexts.owner,
        path("expired-permit"),
        new Uint8Array([1]),
        metadata("expired-permit", expiresAtMs, "cover"),
      ),
    );
    await assertFails(
      put(
        contexts.owner,
        path("aborted-permit"),
        new Uint8Array([1]),
        metadata("aborted-permit", expiresAtMs, "cover"),
      ),
    );
    await assertFails(
      put(
        contexts.owner,
        path("extra-metadata"),
        new Uint8Array([1]),
        metadata("extra-metadata", expiresAtMs, "cover", {
          unexpected: "attacker-controlled",
        }),
      ),
    );
    await assertFails(
      put(
        contexts.owner,
        path("wrong-visibility"),
        new Uint8Array([1]),
        metadata("wrong-visibility", expiresAtMs, "cover", { visibility: "private" }),
      ),
    );
    await assertFails(
      put(
        contexts.owner,
        path("wrong-retention"),
        new Uint8Array([1]),
        metadata("wrong-retention", expiresAtMs, "cover", { retention: "guest-10-days" }),
      ),
    );
    await assertFails(
      put(
        contexts.owner,
        path("wrong-expiry"),
        new Uint8Array([1]),
        metadata("wrong-expiry", expiresAtMs + 60_000, "cover"),
      ),
    );
    await assertFails(
      put(
        contexts.owner,
        path("bad-mime"),
        new Uint8Array([1]),
        metadata("bad-mime", expiresAtMs, "cover"),
        "image/gif",
      ),
    );
    await assertFails(
      put(
        contexts.owner,
        path("zero-byte"),
        new Uint8Array(),
        metadata("zero-byte", expiresAtMs, "cover"),
      ),
    );
    await assertFails(
      put(
        contexts.owner,
        path("cover-too-large"),
        new Uint8Array(1024 * KIB),
        metadata("cover-too-large", expiresAtMs, "cover"),
      ),
    );
  });

  it("denies browser attempts to mint a Firebase download token", async () => {
    const galleryId = "reserved-token-proof";
    const expiresAtMs = futureMs();
    await seedFirestore(environment, [
      [`galleries/${galleryId}`, galleryRecord(galleryId, expiresAtMs)],
      [
        `galleryPublishPermits/${galleryId}`,
        publicationPermit(galleryId, expiresAtMs),
      ],
    ]);
    const { owner } = authContexts(environment);
    const object = owner
      .storage(RULES_STORAGE_URL)
      .ref(`published/${USER_IDS.owner}/${galleryId}/cover.webp`);

    await assertFails(
      object
        .put(new Uint8Array([1]), {
          contentType: "image/webp",
          customMetadata: {
            ...metadata(galleryId, expiresAtMs, "cover"),
            firebaseStorageDownloadTokens: "attacker-known-token",
          },
        })
        .then(() => undefined),
    );
    await expect(object.getDownloadURL()).rejects.toMatchObject({
      code: "storage/object-not-found",
    });
  });

  it("enforces artwork file/index bounds and immutable published objects", async () => {
    const expiresAtMs = futureMs();
    await seedFirestore(environment, [
      ["galleryPublishPermits/art", publicationPermit("art", expiresAtMs)],
    ]);
    const { owner } = authContexts(environment);
    const base = `published/${USER_IDS.owner}/art/artworks`;

    await assertFails(
      put(
        owner,
        `${base}/15.webp`,
        new Uint8Array([1]),
        metadata("art", expiresAtMs, "artwork", { index: "13" }),
      ),
    );
    await assertFails(
      put(
        owner,
        `${base}/2.webp`,
        new Uint8Array([1]),
        metadata("art", expiresAtMs, "artwork", { index: "14" }),
      ),
    );
    await assertFails(
      put(
        owner,
        `${base}/4.webp`,
        new Uint8Array([1]),
        metadata("art", expiresAtMs, "artwork", { index: "2" }),
      ),
    );
    await assertFails(
      put(
        owner,
        `${base}/3.webp`,
        new Uint8Array(2 * 1024 * KIB),
        metadata("art", expiresAtMs, "artwork", { index: "2" }),
      ),
    );

    const immutablePath = `${base}/1.webp`;
    await seedStorage(environment, [[immutablePath]]);
    await assertFails(
      put(
        owner,
        immutablePath,
        new Uint8Array([2]),
        metadata("art", expiresAtMs, "artwork", { index: "0" }),
      ),
    );
    await assertFails(remove(owner, immutablePath));
  });

  it("denies direct owner/editor revision creates as well as unauthorized writes", async () => {
    const expiresAtMs = futureMs();
    const galleryId = "revision";
    await seedFirestore(environment, [
      [`galleries/${galleryId}`, galleryRecord(galleryId, expiresAtMs, { visibility: "private" })],
      [
        `galleries/${galleryId}/members/${USER_EMAILS.editor}`,
        { email: USER_EMAILS.editor, role: "editor", status: "active" },
      ],
      [
        `galleries/${galleryId}/members/${USER_EMAILS.viewer}`,
        { email: USER_EMAILS.viewer, role: "viewer", status: "active" },
      ],
      [
        `galleryRevisionPermits/${galleryId}_owner-rev`,
        revisionPermit(galleryId, "owner-rev", expiresAtMs, USER_IDS.owner, {
          visibility: "private",
        }),
      ],
      [
        `galleryRevisionPermits/${galleryId}_editor-rev`,
        revisionPermit(galleryId, "editor-rev", expiresAtMs, USER_IDS.editor, {
          visibility: "private",
        }),
      ],
      [
        `galleryRevisionPermits/${galleryId}_editor-art-rev`,
        revisionPermit(galleryId, "editor-art-rev", expiresAtMs, USER_IDS.editor, {
          visibility: "private",
        }),
      ],
      [
        `galleryRevisionPermits/${galleryId}_viewer-rev`,
        revisionPermit(galleryId, "viewer-rev", expiresAtMs, USER_IDS.viewer, {
          visibility: "private",
        }),
      ],
      [
        `galleryRevisionPermits/${galleryId}_outsider-rev`,
        revisionPermit(galleryId, "outsider-rev", expiresAtMs, USER_IDS.outsider, {
          visibility: "private",
        }),
      ],
      [
        `galleryRevisionPermits/${galleryId}_revoked-rev`,
        revisionPermit(galleryId, "revoked-rev", expiresAtMs, USER_IDS.editor, {
          visibility: "private",
        }),
      ],
    ]);
    const contexts = authContexts(environment);
    const revisionPath = (revisionId: string, file = "cover.webp") =>
      `published/${USER_IDS.owner}/${galleryId}/revisions/${revisionId}/${file}`;
    const privateMetadata = (revisionId: string, uploaderId: string, kind: "artwork" | "cover") =>
      revisionMetadata(galleryId, revisionId, expiresAtMs, uploaderId, kind, {
        visibility: "private",
      });

    await assertFails(
      put(
        contexts.owner,
        revisionPath("owner-rev"),
        new Uint8Array([1]),
        privateMetadata("owner-rev", USER_IDS.owner, "cover"),
      ),
    );
    await assertFails(
      put(
        contexts.editor,
        revisionPath("editor-rev"),
        new Uint8Array([1]),
        privateMetadata("editor-rev", USER_IDS.editor, "cover"),
      ),
    );
    await assertFails(
      put(
        contexts.editor,
        revisionPath("editor-art-rev", "artworks/1.webp"),
        new Uint8Array([1]),
        {
          ...privateMetadata("editor-art-rev", USER_IDS.editor, "artwork"),
          index: "0",
        },
      ),
    );
    await assertFails(
      put(
        contexts.viewer,
        revisionPath("viewer-rev"),
        new Uint8Array([1]),
        privateMetadata("viewer-rev", USER_IDS.viewer, "cover"),
      ),
    );
    await assertFails(
      put(
        contexts.outsider,
        revisionPath("outsider-rev"),
        new Uint8Array([1]),
        privateMetadata("outsider-rev", USER_IDS.outsider, "cover"),
      ),
    );

    await seedFirestore(environment, [
      [
        `galleries/${galleryId}/members/${USER_EMAILS.editor}`,
        { email: USER_EMAILS.editor, role: "editor", status: "revoked" },
      ],
    ]);
    await assertFails(
      put(
        contexts.editor,
        revisionPath("revoked-rev"),
        new Uint8Array([1]),
        privateMetadata("revoked-rev", USER_IDS.editor, "cover"),
      ),
    );
  });

  it("rejects hostile revision IDs, metadata drift, oversize objects, overwrite, and delete", async () => {
    const expiresAtMs = futureMs();
    const galleryId = "hostile-revision";
    await seedFirestore(environment, [
      [`galleries/${galleryId}`, galleryRecord(galleryId, expiresAtMs, { revision: 1 })],
      [
        `galleryRevisionPermits/${galleryId}_bad.value`,
        revisionPermit(galleryId, "bad.value", expiresAtMs, USER_IDS.owner),
      ],
      [
        `galleryRevisionPermits/${galleryId}_wrong-expiry`,
        revisionPermit(galleryId, "wrong-expiry", expiresAtMs, USER_IDS.owner),
      ],
      [
        `galleryRevisionPermits/${galleryId}_wrong-uploader`,
        revisionPermit(galleryId, "wrong-uploader", expiresAtMs, USER_IDS.owner),
      ],
      [
        `galleryRevisionPermits/${galleryId}_oversize`,
        revisionPermit(galleryId, "oversize", expiresAtMs, USER_IDS.owner),
      ],
      [
        `galleryRevisionPermits/${galleryId}_immutable`,
        revisionPermit(galleryId, "immutable", expiresAtMs, USER_IDS.owner),
      ],
      [
        `galleryRevisionPermits/${galleryId}_extra-metadata`,
        revisionPermit(galleryId, "extra-metadata", expiresAtMs, USER_IDS.owner),
      ],
      [
        `galleryRevisionPermits/${galleryId}_aborted`,
        revisionPermit(galleryId, "aborted", expiresAtMs, USER_IDS.owner, {
          status: "aborted",
        }),
      ],
      [
        `galleryRevisionPermits/${galleryId}_wrong-base`,
        revisionPermit(galleryId, "wrong-base", expiresAtMs, USER_IDS.owner, {
          baseRevision: 99,
        }),
      ],
      [
        `galleryRevisionPermits/${galleryId}_expired-permit`,
        revisionPermit(galleryId, "expired-permit", expiresAtMs, USER_IDS.owner, {
          permitExpiresAt: Timestamp.fromMillis(now() - 60_000),
        }),
      ],
    ]);
    const { owner } = authContexts(environment);
    const path = (revisionId: string, file = "cover.webp") =>
      `published/${USER_IDS.owner}/${galleryId}/revisions/${revisionId}/${file}`;

    await assertFails(
      put(
        owner,
        path("bad.value"),
        new Uint8Array([1]),
        revisionMetadata(galleryId, "bad.value", expiresAtMs, USER_IDS.owner, "cover"),
      ),
    );
    await assertFails(
      put(
        owner,
        path("wrong-expiry"),
        new Uint8Array([1]),
        revisionMetadata(galleryId, "wrong-expiry", expiresAtMs + 60_000, USER_IDS.owner, "cover"),
      ),
    );
    await assertFails(
      put(
        owner,
        path("extra-metadata"),
        new Uint8Array([1]),
        revisionMetadata(galleryId, "extra-metadata", expiresAtMs, USER_IDS.owner, "cover", {
          unexpected: "attacker-controlled",
        }),
      ),
    );
    await assertFails(
      put(
        owner,
        path("aborted"),
        new Uint8Array([1]),
        revisionMetadata(galleryId, "aborted", expiresAtMs, USER_IDS.owner, "cover"),
      ),
    );
    await assertFails(
      put(
        owner,
        path("wrong-base"),
        new Uint8Array([1]),
        revisionMetadata(galleryId, "wrong-base", expiresAtMs, USER_IDS.owner, "cover"),
      ),
    );
    await assertFails(
      put(
        owner,
        path("expired-permit"),
        new Uint8Array([1]),
        revisionMetadata(galleryId, "expired-permit", expiresAtMs, USER_IDS.owner, "cover"),
      ),
    );
    await assertFails(
      put(
        owner,
        path("no-permit"),
        new Uint8Array([1]),
        revisionMetadata(galleryId, "no-permit", expiresAtMs, USER_IDS.owner, "cover"),
      ),
    );
    await assertFails(
      put(
        owner,
        path("wrong-uploader"),
        new Uint8Array([1]),
        revisionMetadata(galleryId, "wrong-uploader", expiresAtMs, USER_IDS.outsider, "cover"),
      ),
    );
    await assertFails(
      put(
        owner,
        path("oversize"),
        new Uint8Array(1024 * KIB),
        revisionMetadata(galleryId, "oversize", expiresAtMs, USER_IDS.owner, "cover"),
      ),
    );

    const immutablePath = path("immutable");
    await seedStorage(environment, [[immutablePath]]);
    await assertFails(
      put(
        owner,
        immutablePath,
        new Uint8Array([2]),
        revisionMetadata(galleryId, "immutable", expiresAtMs, USER_IDS.owner, "cover"),
      ),
    );
    await assertFails(remove(owner, immutablePath));
  });

  it("limits gallery listing to its exact owner", async () => {
    const expiresAtMs = futureMs();
    const galleryId = "list-gallery";
    await seedFirestore(environment, [
      [`galleries/${galleryId}`, galleryRecord(galleryId, expiresAtMs, { visibility: "private" })],
      [
        `galleries/${galleryId}/members/${USER_EMAILS.editor}`,
        { email: USER_EMAILS.editor, role: "editor", status: "active" },
      ],
    ]);
    await seedStorage(environment, [
      [`published/${USER_IDS.owner}/${galleryId}/cover.webp`],
    ]);
    const contexts = authContexts(environment);
    const path = `published/${USER_IDS.owner}/${galleryId}`;

    await assertSucceeds(list(contexts.owner, path));
    await assertFails(list(contexts.editor, path));
    await assertFails(list(contexts.outsider, path));
    await assertFails(list(contexts.anonymous, path));
  });

  it("keeps profile avatars private and reserves every write for the leased callable", async () => {
    const avatarPath = `profiles/${USER_IDS.owner}/avatar.webp`;
    await seedStorage(environment, [[avatarPath]]);
    const contexts = authContexts(environment);
    const avatarMetadata = {
      kind: "avatar",
      ownerId: USER_IDS.owner,
      schemaVersion: "1",
    };

    await assertSucceeds(readMetadata(contexts.owner, avatarPath));
    await assertFails(readMetadata(contexts.outsider, avatarPath));
    await assertFails(readMetadata(contexts.anonymous, avatarPath));
    await assertFails(
      put(contexts.unverified, avatarPath, new Uint8Array([1]), avatarMetadata),
    );
    await assertFails(
      put(
        contexts.owner,
        avatarPath,
        new Uint8Array([1]),
        { ...avatarMetadata, ownerId: USER_IDS.outsider },
      ),
    );
    await assertFails(
      put(
        contexts.owner,
        avatarPath,
        new Uint8Array(512 * KIB),
        avatarMetadata,
      ),
    );
    await assertFails(remove(contexts.owner, avatarPath));
    await assertFails(
      put(
        contexts.owner,
        avatarPath,
        new Uint8Array([1]),
        avatarMetadata,
      ),
    );
    await assertFails(put(contexts.owner, avatarPath, new Uint8Array([2]), avatarMetadata));
  });

  it("blocks permit-bound publication uploads once either account deletion starts", async () => {
    const expiresAtMs = futureMs();
    const galleryId = "deletion-fence";
    await seedFirestore(environment, [
      [`galleryPublishPermits/${galleryId}`, publicationPermit(galleryId, expiresAtMs)],
      [`galleries/${galleryId}`, galleryRecord(galleryId, expiresAtMs, { visibility: "private" })],
      [`galleries/${galleryId}/members/${USER_EMAILS.editor}`,
        { email: USER_EMAILS.editor, role: "editor", status: "active" }],
      [`galleryRevisionPermits/${galleryId}_editor-delete`,
        revisionPermit(galleryId, "editor-delete", expiresAtMs, USER_IDS.editor, { visibility: "private" })],
      [`accountDeletionJobs/${USER_IDS.owner}`, { status: "running" }],
      [`accountDeletionJobs/${USER_IDS.editor}`, { status: "running" }],
    ]);
    const contexts = authContexts(environment);
    await assertFails(put(
      contexts.owner,
      `published/${USER_IDS.owner}/${galleryId}/cover.webp`,
      new Uint8Array([1]),
      metadata(galleryId, expiresAtMs, "cover"),
    ));
    await assertFails(put(
      contexts.editor,
      `published/${USER_IDS.owner}/${galleryId}/revisions/editor-delete/cover.webp`,
      new Uint8Array([1]),
      revisionMetadata(galleryId, "editor-delete", expiresAtMs, USER_IDS.editor, "cover", {
        visibility: "private",
      }),
    ));
  });

  it("denies reads and writes outside every declared path", async () => {
    const path = "private-admin/secret.webp";
    await seedStorage(environment, [[path]]);
    const { owner } = authContexts(environment);

    await assertFails(readMetadata(owner, path));
    await assertFails(
      put(owner, "private-admin/forged.webp", new Uint8Array([1]), {
        ownerId: USER_IDS.owner,
      }),
    );
    await assertFails(remove(owner, path));
  });
});
