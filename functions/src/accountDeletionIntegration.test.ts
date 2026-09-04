import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const firestoreIndexes = readFileSync(
  new URL("../../firestore.indexes.json", import.meta.url),
  "utf8",
);
const manifestGenerator = readFileSync(
  new URL("../scripts/generate-manifest.mjs", import.meta.url),
  "utf8",
);
const accountService = readFileSync(
  new URL("../../src/services/accountService.ts", import.meta.url),
  "utf8",
);
const storageRules = readFileSync(new URL("../../storage.rules", import.meta.url), "utf8");
const deletion = source.slice(
  source.indexOf("const ACCOUNT_DELETION_STEPS_PER_CALL"),
  source.indexOf("Server-issued publication permits"),
);

function callableBody(name: string, nextName: string) {
  const start = source.indexOf(`export const ${name}`);
  const end = source.indexOf(`export const ${nextName}`, start + 1);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("account deletion integration contract", () => {
  it("loads the durable job before Auth so a user-not-found retry can complete", () => {
    const initializer = deletion.slice(
      deletion.indexOf("async function initializeAccountDeletion"),
      deletion.indexOf("async function acquireAccountDeletionLease"),
    );
    expect(initializer.indexOf("loadAccountDeletionState(uid)")).toBeLessThan(
      initializer.indexOf("getAuth().getUser(uid)"),
    );
    expect(deletion).toContain("accountDeletionAuthenticationAlreadyMissing(error)");
    expect(deletion).toContain('status: "complete"');
    expect(deletion).not.toContain("accountDeletionJobReference(state.uid).delete");
  });

  it("uses page-one bounded drains and never inventories all owned IDs", () => {
    expect(deletion).toContain("drainAccountDeletionPage");
    expect(deletion).toContain("ACCOUNT_DELETION_STORAGE_PAGE_SIZE");
    expect(deletion).not.toContain("ownedGalleryIds");
    expect(deletion).not.toContain("recursiveDelete");
  });

  it("drains managed export chunks before deleting the export root", () => {
    const phase = deletion.slice(deletion.indexOf('state.phase === "export-chunks"'));
    expect(phase).toContain('collection("accountExportChunks")');
    const accountDocuments = deletion.slice(
      deletion.indexOf("async function processAccountDocuments"),
      deletion.indexOf("async function processAccountAuthentication"),
    );
    expect(accountDocuments).toContain("accountExportJobReference(state.uid)");
  });

  it("moves submitted reports to pseudonymous IDs without deleting case evidence", () => {
    const submittedReports = deletion.slice(
      deletion.indexOf("async function processSubmittedReports"),
      deletion.indexOf("async function processReportsAgainstDeletedCreator"),
    );
    expect(submittedReports).toContain('where(field, "==", expected)');
    expect(submittedReports).toContain("accountDeletionPseudonymousReportId");
    expect(submittedReports).toContain("accountPseudonym");
    expect(submittedReports).toContain("creatorPseudonym");
    expect(submittedReports).toContain("reporterDeleted: true");
    expect(submittedReports).toContain("transaction.create(destination");
    expect(submittedReports).toContain("transaction.delete(report.ref)");
    expect(submittedReports).toContain('collection("moderationCases")');
    expect(submittedReports).toContain("reportIdReplacements.get(reportId)");
    expect(submittedReports).not.toContain("transaction.delete(moderationCase.ref)");
    expect(submittedReports).not.toContain("sourceReportIds: FieldValue.arrayRemove");
  });

  it("preserves reports and cases against the deleted Creator with a pseudonymous target", () => {
    const reportsAgainst = deletion.slice(
      deletion.indexOf("async function processReportsAgainstDeletedCreator"),
      deletion.indexOf("async function processOwnedCreatorPosts"),
    );
    expect(reportsAgainst).toContain('where("targetCreatorId", "==", state.creatorId)');
    expect(reportsAgainst).toContain('collection("moderationCases")');
    expect(reportsAgainst).toContain("targetPseudonym");
    expect(reportsAgainst).toContain("targetDeleted: true");
    expect(reportsAgainst).toContain("accountDeletionPseudonymousReportId");
    expect(reportsAgainst).toContain("transaction.create(destination");
    expect(reportsAgainst).toContain("transaction.delete(report.ref)");
    expect(reportsAgainst).toContain("reportIdReplacements.get(reportId)");
    expect(reportsAgainst).not.toContain("transaction.delete(moderationCase.ref)");
  });

  it("rechecks claimed gallery ownership and protects external committed revisions", () => {
    expect(deletion).toContain("latestGallery.data()?.ownerId === state.uid");
    expect(deletion).toContain("latestGallery.data()?.accountDeletionId === state.deletionId");
    expect(deletion).toContain("galleryManifestReferencesPrefix");
    expect(deletion).toContain("accountDeletionPermitAuthority");
  });

  it("removes account-linked memberships, invites, and legacy artwork pages", () => {
    expect(deletion).toContain('state.phase === "shared-memberships-by-account"');
    expect(deletion).toContain('collectionGroup("members").where("acceptedBy", "==", state.uid)');
    expect(deletion).toContain('state.phase === "received-invitations-by-account"');
    expect(deletion).toContain('collection("galleryInvites").where("acceptedBy", "==", state.uid)');
    expect(deletion).toContain('currentGalleryStage: "legacy-artworks"');
    expect(deletion).toContain('collection("galleryArtworks")');
    expect(deletion).toContain('.where("ownerId", "==", state.uid)');
    expect(deletion).toContain("deletion-gallery-page-size-invalid");
    expect(deletion).toMatch(/where\("ownerId", "==", state\.uid\),[\s\S]{0,300}\n\s*5,/);
    expect(firestoreIndexes).toMatch(
      /"collectionGroup": "members"[\s\S]*"fieldPath": "acceptedBy"[\s\S]*"queryScope": "COLLECTION_GROUP"/,
    );
    expect(deletion).toMatch(/collection\("accountExportChunks"\),[\s\S]{0,300}\n\s*8,/);
  });

  it("waits out a bounded server-owned media lease before the final Storage drain", () => {
    const accountMedia = deletion.slice(
      deletion.indexOf("async function processAccountMedia"),
      deletion.indexOf("async function processCreatorRoots"),
    );
    expect(source).toContain('collection("accountMediaUploadLeases")');
    expect(accountMedia).toContain('disposition === "active"');
    expect(accountMedia.indexOf('disposition === "active"')).toBeLessThan(
      accountMedia.indexOf('deleteAccountStoragePage(`profiles/${state.uid}/`)'),
    );
    expect(firestoreIndexes).toMatch(
      /"collectionGroup": "accountMediaUploadLeases"[\s\S]*"fieldPath": "expiresAt"[\s\S]*"ttl": true/,
    );
  });

  it("leaves no unleased client path for private account avatar writes", () => {
    const avatarRule = storageRules.slice(storageRules.indexOf("match /profiles/{ownerId}/avatar.webp"));
    expect(avatarRule).toContain("allow create, update, delete: if false;");
    expect(accountService).toContain('"setAuraAccountAvatar"');
    expect(accountService).not.toContain("uploadBytes(");
    expect(accountService).not.toContain("deleteObject(");
    expect(manifestGenerator).toContain("'setAuraAccountAvatar'");
  });

  it("does not claim or drain a permit with an active server-upload lease", () => {
    const permitClaim = deletion.slice(
      deletion.indexOf("async function claimAccountDeletionPermit"),
      deletion.indexOf("async function processClaimedAccountDeletionPermit"),
    );
    expect(permitClaim).toContain("ownsGalleryAssetUploadLease");
    expect(permitClaim.indexOf("ownsGalleryAssetUploadLease")).toBeLessThan(
      permitClaim.indexOf('status: "account-deletion"'),
    );
  });

  it("discards malformed retirement records without touching arbitrary Storage paths", () => {
    const retirements = deletion.slice(
      deletion.indexOf("async function processAccountAssetRetirement"),
      deletion.indexOf("async function claimedGallerySnapshot"),
    );
    expect(retirements).toContain("invalidAssetRetirementsDiscarded");
    expect(retirements.indexOf("paths.length !== rawPaths.length")).toBeLessThan(
      retirements.indexOf("mapInChunks(paths"),
    );
  });

  it("fences every account-facing mutation family", () => {
    const mutationCallables = [
      ["saveLieuvaCreatorProfile", "setAuraAccountAvatar"],
      ["setAuraAccountAvatar", "setLieuvaCreatorProfileImage"],
      ["setLieuvaCreatorProfileImage", "setLieuvaCreatorProfileCover"],
      ["setLieuvaCreatorProfileCover", "manageLieuvaCreatorFollow"],
      ["manageLieuvaCreatorFollow", "createLieuvaCreatorPost"],
      ["createLieuvaCreatorPost", "manageLieuvaCreatorPostInteraction"],
      ["manageLieuvaCreatorPostInteraction", "manageLieuvaCreatorBlock"],
      ["manageLieuvaCreatorBlock", "getMyLieuvaCreatorHome"],
      ["markMyLieuvaCreatorNotificationsRead", "exportAuraAccountData"],
      ["manageAuraAccountExport", "deleteAuraAccount"],
      ["beginAuraGalleryPublication", "uploadAuraGalleryAsset"],
      ["uploadAuraGalleryAsset", "finalizeAuraGalleryPublication"],
      ["finalizeAuraGalleryPublication", "abortAuraGalleryPublication"],
      ["abortAuraGalleryPublication", "beginAuraGalleryRevision"],
      ["beginAuraGalleryRevision", "finalizeAuraGalleryRevision"],
      ["finalizeAuraGalleryRevision", "abortAuraGalleryRevision"],
      ["abortAuraGalleryRevision", "manageAuraGalleryLifecycle"],
      ["manageAuraGalleryLifecycle", "purgeAuraGallery"],
      ["purgeAuraGallery", "createAuraGalleryInvite"],
      ["createAuraGalleryInvite", "acceptAuraGalleryInvite"],
      ["acceptAuraGalleryInvite", "revokeAuraGalleryAccess"],
      ["revokeAuraGalleryAccess", "sendAuraVerificationEmail"],
      ["sendAuraVerificationEmail", "setAuraNewsletterPreference"],
      ["setAuraNewsletterPreference", "unsubscribeAuraNewsletter"],
    ] as const;
    for (const [name, next] of mutationCallables) {
      const body = callableBody(name, next);
      expect(body, `${name} lacks an account deletion fence`).toMatch(
        /assertAccountMutationAllowed(?:InTransaction)?|mergeForActiveAccount|withAccountMediaUploadLease/,
      );
    }
    expect(callableBody("unsubscribeAuraNewsletter", "lieuvaCspReport"))
      .toContain("assertAccountMutationAllowedInTransaction");
  });

  it("re-reads both Creator identities in the block transaction and bounds image decoders", () => {
    const block = callableBody("manageLieuvaCreatorBlock", "getMyLieuvaCreatorHome");
    expect(block).toContain('transaction.get(db.collection("creatorAccountOwners").doc(uid))');
    expect(block).toContain('transaction.get(db.collection("creatorHandles").doc(handle))');
    expect(block).toContain('typeof blockedAccount.data()?.ownerId !== "string"');
    for (const name of ["setAuraAccountAvatar", "setLieuvaCreatorProfileImage", "setLieuvaCreatorProfileCover"] as const) {
      const next = name === "setAuraAccountAvatar"
        ? "setLieuvaCreatorProfileImage"
        : name === "setLieuvaCreatorProfileImage"
          ? "setLieuvaCreatorProfileCover"
          : "manageLieuvaCreatorFollow";
      const body = callableBody(name, next);
      expect(body).toContain('memory: "512MiB"');
      expect(body).toContain("concurrency: 2");
      expect(body).toContain("maxInstances: 10");
    }
  });

  it("closes the invitation/deletion race for an existing recipient", () => {
    const invitation = callableBody("createAuraGalleryInvite", "acceptAuraGalleryInvite");
    expect(invitation.indexOf("existingAuthUidForDeletionFence")).toBeLessThan(
      invitation.indexOf("db.runTransaction"),
    );
    expect(invitation).toContain("...(recipientUid ? [recipientUid] : [])");
    expect(invitation).toContain("assertAccountMutationAllowedInTransaction");
  });

  it("schedules fair oldest-first recovery and gives completion tombstones a short TTL", () => {
    const scheduler = callableBody("resumeAuraAccountDeletions", "beginAuraGalleryPublication");
    expect(scheduler).toContain('.where("status", "==", "running")');
    expect(scheduler).toContain('.orderBy("updatedAt", "asc")');
    expect(scheduler).toContain(".limit(10)");
    expect(scheduler).toContain("acquireAccountDeletionLease");
    expect(deletion).toContain("expiresAt: new Date(Date.now() + ACCOUNT_DELETION_TOMBSTONE_TTL_MS)");
    expect(firestoreIndexes).toContain('"collectionGroup": "accountDeletionJobs"');
    expect(firestoreIndexes).toMatch(
      /"fieldPath": "status"[\s\S]*"fieldPath": "updatedAt"/,
    );
    expect(firestoreIndexes).toMatch(
      /"collectionGroup": "accountDeletionJobs"[\s\S]*"fieldPath": "expiresAt"[\s\S]*"ttl": true/,
    );
    expect(manifestGenerator).toContain("'resumeAuraAccountDeletions'");
    expect(manifestGenerator).toContain("'cloudscheduler.googleapis.com'");
  });
});
