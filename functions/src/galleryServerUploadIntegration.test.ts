import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const functionsSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const clientSource = readFileSync(
  new URL("../../src/services/firebaseGalleryRepository.ts", import.meta.url),
  "utf8",
);
const storageRules = readFileSync(new URL("../../storage.rules", import.meta.url), "utf8");
const cleanupSource = readFileSync(new URL("../../scripts/cleanup-expired.mjs", import.meta.url), "utf8");

function exportedBlock(name: string, nextName: string) {
  return functionsSource.slice(
    functionsSource.indexOf(`export const ${name}`),
    functionsSource.indexOf(`export const ${nextName}`),
  );
}

describe("server-owned gallery upload integration", () => {
  it("keeps authentication, App Check, deletion fences, both permits, and upload leases in the callable", () => {
    const upload = exportedBlock("uploadAuraGalleryAsset", "finalizeAuraGalleryPublication");
    for (const invariant of [
      "enforceAppCheck: true",
      "requireAccount(request.auth)",
      "verifiedAccount(request.auth)",
      "assertAccountMutationAllowed(uid)",
      "assertAccountMutationAllowedInTransaction",
      "initialPermitFrom",
      "revisionAuthorizationFrom",
      "revisionPermitFrom",
      "galleryAssetUploadLeasePatch",
      "persistGalleryServerAsset",
      "completeGalleryAssetUploadLease",
    ]) expect(upload).toContain(invariant);
    // Only deterministic decode rejection releases immediately. Once Storage
    // work starts, an exact response-loss replay can share this request lease.
    expect(upload.match(/await releaseGalleryAssetUploadLease/g)).toHaveLength(1);
  });

  it("routes both happy publication paths through the callable and has no browser Storage write", () => {
    expect(clientSource).toContain('"uploadAuraGalleryAsset"');
    expect(clientSource).toContain('requestId: crypto.randomUUID().replaceAll("-", "")');
    expect(clientSource.match(/uploadTrustedGalleryAsset\(\{/g)).toHaveLength(4);
    expect(clientSource).not.toContain("uploadBytes(");
    expect(clientSource).not.toContain("firebaseStorageDownloadTokens");
  });

  it("denies every published client write while retaining manifest-gated reads", () => {
    const publishedRules = storageRules.slice(
      storageRules.indexOf("match /published/"),
      storageRules.indexOf("match /profiles/"),
    );
    expect(publishedRules.match(/allow create, update, delete: if false;/g)).toHaveLength(4);
    expect(storageRules).toContain("isCurrentCover");
    expect(storageRules).toContain("isCurrentArtwork");
  });

  it("leaves abort cleanup durable and makes expiry cleanup wait for an active upload", () => {
    const initialAbort = exportedBlock("abortAuraGalleryPublication", "beginAuraGalleryRevision");
    const revisionAbort = exportedBlock("abortAuraGalleryRevision", "manageAuraGalleryLifecycle");
    for (const abort of [initialAbort, revisionAbort]) {
      expect(abort).toContain('status: "cleanup"');
      expect(abort).toContain("galleryAssetCleanupNotBefore");
      expect(abort).not.toContain("transaction.delete(permitReference)");
    }
    expect(cleanupSource).toContain("galleryPermitCleanupDecision");
    expect(cleanupSource).toContain("assetUploadLeaseUntil");
  });
});
