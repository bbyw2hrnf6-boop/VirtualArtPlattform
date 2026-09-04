import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
  type DocumentData,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

import {
  USER_EMAILS,
  USER_IDS,
  anonymousToken,
  createRulesTestEnvironment,
  seedFirestore,
  unverifiedToken,
  verifiedContext,
} from "./rulesTestEnvironment";

const now = () => Date.now();
const future = (days = 7) => Timestamp.fromMillis(now() + days * 86_400_000);
const past = () => Timestamp.fromMillis(now() - 60_000);

const gallery = (
  galleryId: string,
  overrides: Partial<DocumentData> = {},
): DocumentData => {
  const publishedAt = Timestamp.fromMillis(now() - 60_000);
  return {
    accessVersion: 1,
    artist: "Rules Artist",
    artworks: [{}],
    ceiling: "gallery",
    coverPath: `published/${USER_IDS.owner}/${galleryId}/cover.webp`,
    creatorProfileListed: false,
    decor: [],
    discoverEligible: false,
    exploreListed: false,
    expiresAt: future(),
    floor: "concrete",
    lifecycleStatus: "active",
    lighting: "daylight",
    ownerId: USER_IDS.owner,
    publishedAt,
    retention: "account-preview",
    revision: 1,
    schemaVersion: 3,
    templateId: "white-cube",
    title: "Rules Gallery",
    updatedAt: publishedAt,
    visibility: "public",
    wall: "chalk",
    ...overrides,
  };
};

const permit = (galleryId: string, data: DocumentData): DocumentData => ({
  expiresAt: data.expiresAt,
  galleryId,
  ownerId: data.ownerId,
  permitExpiresAt: Timestamp.fromMillis(now() + 10 * 60_000),
  retention: data.retention,
  visibility: data.visibility,
});

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

const seedMemberships = async (
  environment: RulesTestEnvironment,
  galleryId: string,
) => {
  await seedFirestore(environment, [
    [
      `galleries/${galleryId}/members/${USER_EMAILS.editor}`,
      { email: USER_EMAILS.editor, role: "editor", status: "active" },
    ],
    [
      `galleries/${galleryId}/members/${USER_EMAILS.viewer}`,
      { email: USER_EMAILS.viewer, role: "viewer", status: "active" },
    ],
  ]);
};

describe("Firestore authorization matrix", () => {
  let environment: RulesTestEnvironment;

  beforeAll(async () => {
    environment = await createRulesTestEnvironment();
  });

  beforeEach(async () => {
    await environment.clearFirestore();
  });

  afterAll(async () => {
    await environment.cleanup();
  });

  it("keeps active public and unlisted galleries readable without authentication", async () => {
    await seedFirestore(environment, [
      ["galleries/public-gallery", gallery("public-gallery")],
      [
        "galleries/unlisted-gallery",
        gallery("unlisted-gallery", { visibility: "unlisted" }),
      ],
    ]);
    const { anonymous } = authContexts(environment);

    await assertSucceeds(
      getDoc(doc(anonymous.firestore(), "galleries/public-gallery")),
    );
    await assertSucceeds(
      getDoc(doc(anonymous.firestore(), "galleries/unlisted-gallery")),
    );
  });

  it("restricts active private galleries to owners and active verified members", async () => {
    const galleryId = "private-gallery";
    await seedFirestore(environment, [
      [`galleries/${galleryId}`, gallery(galleryId, { visibility: "private" })],
    ]);
    await seedMemberships(environment, galleryId);
    const contexts = authContexts(environment);

    for (const allowed of [contexts.owner, contexts.editor, contexts.viewer]) {
      await assertSucceeds(
        getDoc(doc(allowed.firestore(), `galleries/${galleryId}`)),
      );
    }
    for (const denied of [
      contexts.anonymous,
      contexts.signedAnonymous,
      contexts.unverified,
      contexts.outsider,
    ]) {
      await assertFails(
        getDoc(doc(denied.firestore(), `galleries/${galleryId}`)),
      );
    }
  });

  it("denies inactive members and all non-owners after expiry or archival", async () => {
    await seedFirestore(environment, [
      [
        "galleries/inactive-member-gallery",
        gallery("inactive-member-gallery", { visibility: "private" }),
      ],
      [
        `galleries/inactive-member-gallery/members/${USER_EMAILS.viewer}`,
        { email: USER_EMAILS.viewer, role: "viewer", status: "revoked" },
      ],
      [
        "galleries/expired-gallery",
        gallery("expired-gallery", { expiresAt: past() }),
      ],
      [
        "galleries/archived-gallery",
        gallery("archived-gallery", { lifecycleStatus: "archived" }),
      ],
    ]);
    const contexts = authContexts(environment);

    await assertFails(
      getDoc(doc(contexts.viewer.firestore(), "galleries/inactive-member-gallery")),
    );
    for (const galleryId of ["expired-gallery", "archived-gallery"]) {
      await assertSucceeds(
        getDoc(doc(contexts.owner.firestore(), `galleries/${galleryId}`)),
      );
      await assertFails(
        getDoc(doc(contexts.anonymous.firestore(), `galleries/${galleryId}`)),
      );
      await assertFails(
        getDoc(doc(contexts.editor.firestore(), `galleries/${galleryId}`)),
      );
    }
  });

  it("preserves direct-read compatibility for active schema-v1 and schema-v2 galleries", async () => {
    await seedFirestore(environment, [
      [
        "galleries/legacy-v1",
        gallery("legacy-v1", { schemaVersion: 1, visibility: "private" }),
      ],
      [
        "galleries/legacy-v2",
        gallery("legacy-v2", { schemaVersion: 2, visibility: "private" }),
      ],
    ]);
    const { anonymous } = authContexts(environment);

    await assertSucceeds(
      getDoc(doc(anonymous.firestore(), "galleries/legacy-v1")),
    );
    await assertSucceeds(
      getDoc(doc(anonymous.firestore(), "galleries/legacy-v2")),
    );
  });

  it("enforces bounded, visibility-constrained gallery queries", async () => {
    await seedFirestore(environment, [
      ["galleries/listed", gallery("listed")],
      ["galleries/owned", gallery("owned", { visibility: "private" })],
    ]);
    const contexts = authContexts(environment);
    const publicBase = query(
      collection(contexts.anonymous.firestore(), "galleries"),
      where("visibility", "==", "public"),
      where("discoverEligible", "==", true),
      where("lifecycleStatus", "==", "active"),
      where("expiresAt", ">", Timestamp.fromMillis(now() + 60_000)),
    );

    await assertSucceeds(getDocs(query(publicBase, limit(30))));
    await assertFails(getDocs(publicBase));
    await assertFails(getDocs(query(publicBase, limit(31))));
    await assertFails(
      getDocs(
        query(
          collection(contexts.outsider.firestore(), "galleries"),
          where("visibility", "==", "private"),
          where("discoverEligible", "==", true),
          where("lifecycleStatus", "==", "active"),
          limit(30),
        ),
      ),
    );
    await assertFails(
      getDocs(
        query(
          collection(contexts.anonymous.firestore(), "galleries"),
          where("visibility", "==", "public"),
          where("lifecycleStatus", "==", "active"),
          where("expiresAt", ">", Timestamp.fromMillis(now() + 60_000)),
          limit(30),
        ),
      ),
    );
    await assertFails(
      getDocs(
        query(
          collection(contexts.anonymous.firestore(), "galleries"),
          where("visibility", "==", "public"),
          where("discoverEligible", "==", true),
          where("lifecycleStatus", "==", "archived"),
          where("expiresAt", ">", Timestamp.fromMillis(now() + 60_000)),
          limit(30),
        ),
      ),
    );
    await assertSucceeds(
      getDocs(
        query(
          collection(contexts.owner.firestore(), "galleries"),
          where("ownerId", "==", USER_IDS.owner),
          limit(30),
        ),
      ),
    );
  });

  it("denies direct client gallery creation even with a matching trusted permit", async () => {
    const contexts = authContexts(environment);
    const valid = gallery("valid-create", {
      publishedAt: Timestamp.fromMillis(now()),
      updatedAt: Timestamp.fromMillis(now()),
    });
    valid.updatedAt = valid.publishedAt;
    const anonymousGallery = gallery("anonymous-create");
    const unverifiedGallery = gallery("unverified-create", {
      ownerId: "unverified-user",
      coverPath: "published/unverified-user/unverified-create/cover.webp",
    });
    await seedFirestore(environment, [
      ["galleryPublishPermits/valid-create", permit("valid-create", valid)],
      [
        "galleryPublishPermits/anonymous-create",
        permit("anonymous-create", anonymousGallery),
      ],
      [
        "galleryPublishPermits/unverified-create",
        permit("unverified-create", unverifiedGallery),
      ],
    ]);

    await assertFails(
      setDoc(doc(contexts.owner.firestore(), "galleries/valid-create"), valid),
    );
    await assertFails(
      setDoc(
        doc(contexts.anonymous.firestore(), "galleries/anonymous-create"),
        anonymousGallery,
      ),
    );
    await assertFails(
      setDoc(
        doc(contexts.unverified.firestore(), "galleries/unverified-create"),
        unverifiedGallery,
      ),
    );
  });

  it("rejects forged, over-limit, stale, and unreviewed gallery creates", async () => {
    const { owner } = authContexts(environment);
    const hostile: Array<[string, DocumentData]> = [
      [
        "forged-owner",
        gallery("forged-owner", {
          ownerId: USER_IDS.outsider,
          coverPath: `published/${USER_IDS.outsider}/forged-owner/cover.webp`,
        }),
      ],
      [
        "too-many-artworks",
        gallery("too-many-artworks", { artworks: Array.from({ length: 9 }, () => ({})) }),
      ],
      [
        "too-many-decor",
        gallery("too-many-decor", { decor: Array.from({ length: 9 }, () => ({})) }),
      ],
      ["extra-field", gallery("extra-field", { adminApproved: true })],
      ["discover-forgery", gallery("discover-forgery", { discoverEligible: true })],
      ["expired", gallery("expired", { expiresAt: past() })],
      ["wrong-revision", gallery("wrong-revision", { revision: 2 })],
    ];
    await seedFirestore(
      environment,
      hostile.map(([galleryId, data]) => [
        `galleryPublishPermits/${galleryId}`,
        permit(galleryId, data),
      ]),
    );

    for (const [galleryId, data] of hostile) {
      await assertFails(
        setDoc(doc(owner.firestore(), `galleries/${galleryId}`), data),
      );
    }

    const mismatchId = "permit-mismatch";
    const mismatchGallery = gallery(mismatchId);
    await seedFirestore(environment, [
      [
        `galleryPublishPermits/${mismatchId}`,
        { ...permit(mismatchId, mismatchGallery), visibility: "private" },
      ],
    ]);
    await assertFails(
      setDoc(doc(owner.firestore(), `galleries/${mismatchId}`), mismatchGallery),
    );
  });

  it("denies direct client gallery revisions for every role and payload", async () => {
    const galleryId = "revision-gallery";
    const original = gallery(galleryId);
    await seedFirestore(environment, [[`galleries/${galleryId}`, original]]);
    await seedMemberships(environment, galleryId);
    const contexts = authContexts(environment);
    const revision = (overrides: Partial<DocumentData> = {}) => ({
      ...original,
      coverPath: `published/${USER_IDS.owner}/${galleryId}/revisions/rev-2/cover.webp`,
      discoverEligible: false,
      revision: 2,
      updatedAt: serverTimestamp(),
      ...overrides,
    });

    await assertFails(
      setDoc(doc(contexts.viewer.firestore(), `galleries/${galleryId}`), revision()),
    );
    await assertFails(
      setDoc(
        doc(contexts.outsider.firestore(), `galleries/${galleryId}`),
        revision(),
      ),
    );
    await assertFails(
      setDoc(
        doc(contexts.owner.firestore(), `galleries/${galleryId}`),
        revision({ revision: 1 }),
      ),
    );
    await assertFails(
      setDoc(
        doc(contexts.owner.firestore(), `galleries/${galleryId}`),
        revision({ visibility: "private" }),
      ),
    );
    await assertFails(
      setDoc(
        doc(contexts.owner.firestore(), `galleries/${galleryId}`),
        revision({ discoverEligible: true }),
      ),
    );
    await assertFails(
      setDoc(doc(contexts.editor.firestore(), `galleries/${galleryId}`), revision()),
    );
    await assertFails(
      setDoc(doc(contexts.owner.firestore(), `galleries/${galleryId}`), revision()),
    );
  });

  it("denies gallery updates after expiry or archival and denies every client delete", async () => {
    const contexts = authContexts(environment);
    for (const [galleryId, overrides] of [
      ["expired-update", { expiresAt: past() }],
      ["archived-update", { lifecycleStatus: "archived" }],
    ] as const) {
      const original = gallery(galleryId, overrides);
      await seedFirestore(environment, [[`galleries/${galleryId}`, original]]);
      await assertFails(
        setDoc(doc(contexts.owner.firestore(), `galleries/${galleryId}`), {
          ...original,
          coverPath: `published/${USER_IDS.owner}/${galleryId}/revisions/rev-2/cover.webp`,
          revision: 2,
          updatedAt: serverTimestamp(),
        }),
      );
      await assertFails(
        deleteDoc(doc(contexts.owner.firestore(), `galleries/${galleryId}`)),
      );
    }
  });

  it("keeps member and invite documents owner/recipient readable but client immutable", async () => {
    const galleryId = "acl-gallery";
    await seedFirestore(environment, [
      [`galleries/${galleryId}`, gallery(galleryId, { visibility: "private" })],
      [
        `galleries/${galleryId}/members/${USER_EMAILS.editor}`,
        { email: USER_EMAILS.editor, role: "editor", status: "active" },
      ],
      [
        "galleryInvites/invite-editor",
        {
          email: USER_EMAILS.editor,
          galleryId,
          ownerId: USER_IDS.owner,
          role: "editor",
        },
      ],
    ]);
    const contexts = authContexts(environment);
    const memberPath = `galleries/${galleryId}/members/${USER_EMAILS.editor}`;

    await assertSucceeds(getDoc(doc(contexts.owner.firestore(), memberPath)));
    await assertSucceeds(getDoc(doc(contexts.editor.firestore(), memberPath)));
    await assertFails(getDoc(doc(contexts.outsider.firestore(), memberPath)));
    await assertFails(
      setDoc(doc(contexts.owner.firestore(), memberPath), {
        email: USER_EMAILS.editor,
        role: "viewer",
      }),
    );

    await assertSucceeds(
      getDoc(doc(contexts.owner.firestore(), "galleryInvites/invite-editor")),
    );
    await assertSucceeds(
      getDoc(doc(contexts.editor.firestore(), "galleryInvites/invite-editor")),
    );
    await assertFails(
      getDoc(doc(contexts.outsider.firestore(), "galleryInvites/invite-editor")),
    );
    await assertFails(
      deleteDoc(doc(contexts.owner.firestore(), "galleryInvites/invite-editor")),
    );
  });

  it("enforces 50-result bounds and identity filters on member and invite lists", async () => {
    const galleryId = "acl-list-gallery";
    await seedFirestore(environment, [
      [`galleries/${galleryId}`, gallery(galleryId, { visibility: "private" })],
      [
        `galleries/${galleryId}/members/${USER_EMAILS.editor}`,
        { email: USER_EMAILS.editor, role: "editor", status: "active" },
      ],
      [
        "galleryInvites/invite-editor",
        { email: USER_EMAILS.editor, galleryId, ownerId: USER_IDS.owner },
      ],
    ]);
    const contexts = authContexts(environment);

    const ownerMembers = collection(
      contexts.owner.firestore(),
      `galleries/${galleryId}/members`,
    );
    await assertSucceeds(getDocs(query(ownerMembers, limit(50))));
    await assertFails(getDocs(query(ownerMembers, limit(51))));

    const editorMembers = collection(
      contexts.editor.firestore(),
      `galleries/${galleryId}/members`,
    );
    await assertSucceeds(
      getDocs(
        query(
          editorMembers,
          where("email", "==", USER_EMAILS.editor),
          limit(50),
        ),
      ),
    );
    await assertFails(getDocs(query(editorMembers, limit(50))));

    const editorInvites = collection(contexts.editor.firestore(), "galleryInvites");
    await assertSucceeds(
      getDocs(
        query(
          editorInvites,
          where("email", "==", USER_EMAILS.editor),
          limit(50),
        ),
      ),
    );
    await assertFails(getDocs(query(editorInvites, limit(51))));
    await assertFails(
      getDocs(query(collection(contexts.outsider.firestore(), "galleryInvites"), limit(50))),
    );
  });

  it("allows only verified owners to write exact private profiles", async () => {
    const contexts = authContexts(environment);
    const profile = (uid: string, overrides: Partial<DocumentData> = {}) => ({
      displayName: "Rules User",
      nickname: "rules.user",
      schemaVersion: 1,
      uid,
      updatedAt: serverTimestamp(),
      ...overrides,
    });

    await assertSucceeds(
      setDoc(doc(contexts.owner.firestore(), `profiles/${USER_IDS.owner}`), profile(USER_IDS.owner)),
    );
    await assertSucceeds(
      getDoc(doc(contexts.owner.firestore(), `profiles/${USER_IDS.owner}`)),
    );
    await assertFails(
      getDoc(doc(contexts.outsider.firestore(), `profiles/${USER_IDS.owner}`)),
    );
    await assertFails(
      setDoc(
        doc(contexts.unverified.firestore(), "profiles/unverified-user"),
        profile("unverified-user"),
      ),
    );
    await assertFails(
      setDoc(
        doc(contexts.owner.firestore(), `profiles/${USER_IDS.owner}`),
        profile(USER_IDS.owner, { nickname: "bad nickname" }),
      ),
    );
    await assertFails(
      setDoc(
        doc(contexts.owner.firestore(), `profiles/${USER_IDS.owner}`),
        profile(USER_IDS.owner, { isAdmin: true }),
      ),
    );
    await assertFails(
      getDocs(query(collection(contexts.owner.firestore(), "profiles"), limit(1))),
    );
    await assertSucceeds(
      deleteDoc(doc(contexts.owner.firestore(), `profiles/${USER_IDS.owner}`)),
    );
    await assertSucceeds(
      setDoc(doc(contexts.owner.firestore(), `profiles/${USER_IDS.owner}`), profile(USER_IDS.owner)),
    );
    await seedFirestore(environment, [[
      `accountDeletionJobs/${USER_IDS.owner}`,
      { status: "running", phase: "owned-galleries" },
    ]]);
    await assertFails(
      setDoc(doc(contexts.owner.firestore(), `profiles/${USER_IDS.owner}`), profile(USER_IDS.owner)),
    );
    await assertFails(
      deleteDoc(doc(contexts.owner.firestore(), `profiles/${USER_IDS.owner}`)),
    );
  });

  it("keeps newsletter consent self-readable and trusted-write-only", async () => {
    await seedFirestore(environment, [
      ["newsletterSubscriptions/owner-user", { subscribed: true }],
    ]);
    const contexts = authContexts(environment);

    await assertSucceeds(
      getDoc(
        doc(
          contexts.owner.firestore(),
          `newsletterSubscriptions/${USER_IDS.owner}`,
        ),
      ),
    );
    await assertFails(
      getDoc(
        doc(
          contexts.outsider.firestore(),
          `newsletterSubscriptions/${USER_IDS.owner}`,
        ),
      ),
    );
    await assertFails(
      setDoc(
        doc(
          contexts.owner.firestore(),
          `newsletterSubscriptions/${USER_IDS.owner}`,
        ),
        { subscribed: false },
      ),
    );
  });

  it("denies direct client access to every trusted collection family", async () => {
    const trustedPaths = [
      "galleryPublishPermits/blocked",
      "galleryRevisionPermits/blocked",
      "galleryAssetRetirements/blocked",
      "securityMaintenanceState/blocked",
      "galleryPublicationQuotas/blocked",
      "creatorAccountOwners/blocked",
      "creatorAccounts/blocked",
      "creatorAccounts/blocked/posts/post",
      "creatorAccounts/blocked/posts/post/reactions/reaction",
      "creatorProfiles/blocked",
      "creatorHandles/blocked",
      "creatorFollows/blocked",
      "creatorBlocks/blocked",
      "creatorReports/blocked",
      "moderationCases/blocked/events/event",
      "publicContentReviews/blocked/events/event",
      "creatorNotifications/blocked/events/event",
      "mail/blocked",
      "verificationMailRateLimits/blocked",
      "creatorActionRateLimits/blocked",
      "newsletterUnsubscribeTokens/blocked",
      "accountDeletionJobs/blocked",
      "accountExportJobs/blocked",
      "accountExportJobs/blocked/accountExportChunks/00000000",
    ] as const;
    const { owner } = authContexts(environment);

    for (const path of trustedPaths) {
      await assertFails(getDoc(doc(owner.firestore(), path)));
      await assertFails(setDoc(doc(owner.firestore(), path), { forged: true }));
    }
  });

  it("binds legacy artwork reads to an existing active readable parent and denies writes", async () => {
    await seedFirestore(environment, [
      ["galleries/legacy-active", gallery("legacy-active", { schemaVersion: 1 })],
      ["galleries/legacy-private", gallery("legacy-private", { schemaVersion: 3, visibility: "private" })],
      ["galleries/legacy-trashed", gallery("legacy-trashed", { schemaVersion: 1, lifecycleStatus: "trashed" })],
      ["galleryArtworks/active", { expiresAt: future(), galleryId: "legacy-active" }],
      ["galleryArtworks/private", { expiresAt: future(), galleryId: "legacy-private" }],
      ["galleryArtworks/trashed", { expiresAt: future(), galleryId: "legacy-trashed" }],
      ["galleryArtworks/orphan", { expiresAt: future(), galleryId: "missing-gallery" }],
      ["galleryArtworks/expired", { expiresAt: past(), galleryId: "legacy-active" }],
    ]);
    const contexts = authContexts(environment);

    await assertSucceeds(
      getDoc(doc(contexts.anonymous.firestore(), "galleryArtworks/active")),
    );
    await assertFails(
      getDoc(doc(contexts.owner.firestore(), "galleryArtworks/expired")),
    );
    await assertFails(
      getDoc(doc(contexts.anonymous.firestore(), "galleryArtworks/private")),
    );
    await assertSucceeds(
      getDoc(doc(contexts.owner.firestore(), "galleryArtworks/private")),
    );
    await assertFails(
      getDoc(doc(contexts.owner.firestore(), "galleryArtworks/trashed")),
    );
    await assertFails(
      getDoc(doc(contexts.anonymous.firestore(), "galleryArtworks/orphan")),
    );
    await assertFails(
      setDoc(doc(contexts.owner.firestore(), "galleryArtworks/forged"), {
        expiresAt: future(),
      }),
    );
  });
});
