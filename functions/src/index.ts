import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldPath, FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { defineString } from "firebase-functions/params";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import {
  verificationMail,
  welcomeMail,
  type AuraMailBrand,
} from "./emailTemplates.js";
import {
  GALLERY_VISIBILITIES,
  normalizeMemberEmail,
  parseGalleryId,
  publicationTerms,
  type GalleryVisibility,
} from "./galleryPolicy.js";
import {
  assertRecentAuthentication,
  assertAccountAccess,
  buildAccountExport,
  executeAccountDeletion,
  portableValue,
  type AccountDeletionPlan,
} from "./accountDataRights.js";
import {
  SPACE_CARD_FALLBACK,
  cacheControlForSpace,
  classifySpaceForDelivery,
  metadataForSpace,
  renderPublicSitemap,
  renderSpaceDocument,
  type PublicSpaceDelivery,
  type SpaceDelivery,
} from "./spaceSeo.js";

if (!getApps().length) initializeApp();

const REGION = "europe-west1";
const PUBLIC_APP_URL = defineString("AURA_PUBLIC_APP_URL", {
  default: "https://lieuva.com",
  description: "Legacy-named parameter for the public LIEUVA URL without a trailing slash.",
});
const REPLY_TO = defineString("AURA_REPLY_TO", {
  default: "not-configured@invalid.example",
  description: "Legacy-named parameter for the public support/reply-to email shown in LIEUVA emails.",
});
const LEGAL_FOOTER = defineString("AURA_LEGAL_FOOTER", {
  default: "LIEUVA preview — legal sender details not configured",
  description: "Legal sender name and postal address shown in marketing emails.",
});

const db = getFirestore();
const sources = new Set(["email-create", "email-signin", "google-create", "google-signin", "account-settings"]);
const galleryVisibilities = new Set<string>(GALLERY_VISIBILITIES);
const galleryLifecycleActions = new Set(["archive", "restore", "renew", "trash", "visibility"]);
const galleryRoles = new Set(["viewer", "editor"]);
const publicDeliveryFields = [
  "schemaVersion",
  "title",
  "artist",
  "visibility",
  "lifecycleStatus",
  "expiresAt",
  "publishedAt",
  "updatedAt",
  "revision",
  "ownerId",
  "coverPath",
] as const;

function brand(): AuraMailBrand {
  return {
    name: "LIEUVA",
    appUrl: PUBLIC_APP_URL.value().replace(/\/$/, ""),
    replyTo: REPLY_TO.value(),
    legalFooter: LEGAL_FOOTER.value(),
  };
}

function requireMailConfiguration() {
  if (REPLY_TO.value().endsWith("@invalid.example") || LEGAL_FOOTER.value().includes("not configured"))
    throw new HttpsError("failed-precondition", "LIEUVA email delivery is not configured yet.");
}

function requireAccount(auth: { uid: string; token: Record<string, unknown> } | undefined) {
  const firebaseClaims = auth?.token.firebase;
  const provider = firebaseClaims && typeof firebaseClaims === "object"
    ? (firebaseClaims as { sign_in_provider?: string }).sign_in_provider
    : undefined;
  try {
    return assertAccountAccess(auth?.uid, provider);
  } catch {
    throw new HttpsError("unauthenticated", "Use an email or Google account.");
  }
}

function requireSignedIn(auth: { uid: string; token: Record<string, unknown> } | undefined) {
  if (!auth) throw new HttpsError("unauthenticated", "Sign in before changing a Space.");
  return auth.uid;
}

function verifiedAccount(auth: { uid: string; token: Record<string, unknown> } | undefined) {
  const firebaseClaims = auth?.token.firebase;
  const provider = firebaseClaims && typeof firebaseClaims === "object"
    ? (firebaseClaims as { sign_in_provider?: string }).sign_in_provider
    : undefined;
  return Boolean(
    auth &&
    provider !== "anonymous" &&
    auth.token.email_verified === true &&
    typeof auth.token.email === "string",
  );
}

function galleryIdFrom(value: unknown) {
  const id = parseGalleryId(value);
  if (!id) throw new HttpsError("invalid-argument", "Invalid Space ID.");
  return id;
}

function memberEmailFrom(value: unknown) {
  const email = normalizeMemberEmail(value);
  if (!email) throw new HttpsError("invalid-argument", "Invalid member email.");
  return email;
}

function inviteIdFor(galleryId: string, email: string) {
  return createHash("sha256").update(`${galleryId}:${email}`).digest("hex");
}

function uniqueDocumentPaths(documents: Array<{ ref: { path: string } }>) {
  return [...new Set(documents.map((document) => document.ref.path))];
}

function generatedAppShell() {
  return readFileSync(new URL("../generated/app-shell.html", import.meta.url), "utf8");
}

function requestSpaceId(path: string, route: "spaces" | "space-cards") {
  const match = new RegExp(`/${route}/([^/]+)/?$`).exec(path);
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
}

async function publicDeliveryManifest(spaceId: string) {
  const snapshot = await db.collection("galleries")
    .where(FieldPath.documentId(), "==", spaceId)
    .select(...publicDeliveryFields)
    .limit(1)
    .get();
  return snapshot.docs[0]?.data();
}

function genericErrorShell(delivery: SpaceDelivery) {
  const metadata = metadataForSpace(delivery);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="${metadata.robots}"><title>${metadata.title}</title></head><body><main><h1>Space temporarily unavailable</h1><p>Please try again later.</p></main></body></html>`;
}

async function accountMediaFootprint(ownerId: string, galleryId: string) {
  const [files] = await getStorage().bucket().getFiles({
    prefix: `published/${ownerId}/${galleryId}/`,
  });
  return Promise.all(files.map(async (file) => {
    const [metadata] = await file.getMetadata();
    const revisionMatch = /\/revisions\/([^/]+)\//.exec(file.name);
    return {
      path: file.name,
      contentType: metadata.contentType ?? null,
      sizeBytes: Number(metadata.size ?? 0),
      updatedAt: metadata.updated ?? null,
      revisionId: revisionMatch?.[1] ?? null,
    };
  }));
}

/** Account-wide portability export. Media binaries stay in Storage; exact paths
 * and metadata make the data footprint inspectable without exposing signed URLs. */
export const exportAuraAccountData = onCall(
  { region: REGION, timeoutSeconds: 120, memory: "512MiB", enforceAppCheck: true },
  async (request) => {
    const uid = requireAccount(request.auth);
    const user = await getAuth().getUser(uid);
    const email = user.email?.trim().toLowerCase();
    const ownedSnapshot = await db.collection("galleries").where("ownerId", "==", uid).get();
    const [profile, newsletter, publicationUsage, sharedMemberships, receivedInvites, sentInvites,
      permits, unsubscribeTokens, verificationLimit] = await Promise.all([
      db.collection("profiles").doc(uid).get(),
      db.collection("newsletterSubscriptions").doc(uid).get(),
      db.collection("galleryPublicationQuotas").doc(uid).get(),
      email
        ? db.collectionGroup("members").where("email", "==", email).get()
        : Promise.resolve(undefined),
      email
        ? db.collection("galleryInvites").where("email", "==", email).get()
        : Promise.resolve(undefined),
      db.collection("galleryInvites").where("ownerId", "==", uid).get(),
      db.collection("galleryPublishPermits").where("ownerId", "==", uid).get(),
      db.collection("newsletterUnsubscribeTokens").where("uid", "==", uid).get(),
      db.collection("verificationMailRateLimits").doc(uid).get(),
    ]);
    const ownedSpaces = await Promise.all(ownedSnapshot.docs.map(async (gallery) => {
      const [members, media] = await Promise.all([
        gallery.ref.collection("members").get(),
        accountMediaFootprint(uid, gallery.id),
      ]);
      return {
        id: gallery.id,
        manifest: gallery.data(),
        members: members.docs.map((member) => member.data()),
        media,
      };
    }));
    return buildAccountExport({
      generatedAt: new Date().toISOString(),
      account: {
        uid,
        email: user.email ?? null,
        emailVerified: user.emailVerified,
        displayName: user.displayName ?? null,
        disabled: user.disabled,
        providers: user.providerData.map((provider) => provider.providerId),
        createdAt: user.metadata.creationTime ?? null,
        lastSignInAt: user.metadata.lastSignInTime ?? null,
      },
      ...(profile.exists ? { profile: profile.data()! } : {}),
      ...(newsletter.exists ? { newsletter: newsletter.data()! } : {}),
      ...(publicationUsage.exists ? { publicationUsage: publicationUsage.data()! } : {}),
      ownedSpaces,
      sharedSpaces: sharedMemberships?.docs
        .filter((member) => Boolean(member.ref.parent.parent))
        .map((member) => ({ galleryId: member.ref.parent.parent!.id, ...member.data() })) ?? [],
      receivedInvitations: receivedInvites?.docs.map((invite) => invite.data()) ?? [],
      sentInvitations: sentInvites.docs.map((invite) => invite.data()),
      operationalState: {
        pendingPublicationPermits: permits.size,
        newsletterUnsubscribeRecords: unsubscribeTokens.size,
        verificationRateLimitRecord: verificationLimit.exists,
      },
    });
  },
);

function accountDeletionErrorCode(error: unknown) {
  if (typeof error === "object" && error && "code" in error)
    return String(error.code).slice(0, 80);
  return "internal";
}

/** Immediate, irreversible account erasure. Auth is deleted last, so failures
 * remain authenticated and retryable. No grace period is asserted here. */
export const deleteAuraAccount = onCall(
  { region: REGION, timeoutSeconds: 540, memory: "1GiB", enforceAppCheck: true },
  async (request) => {
    const uid = requireAccount(request.auth);
    if (request.data?.confirmation !== "DELETE")
      throw new HttpsError("invalid-argument", "Type DELETE to confirm account deletion.");
    try {
      assertRecentAuthentication(request.auth?.token.auth_time);
    } catch {
      throw new HttpsError("failed-precondition", "Recent authentication required. Sign in again, then retry.");
    }
    const user = await getAuth().getUser(uid);
    const email = user.email?.trim().toLowerCase();
    const job = db.collection("accountDeletionJobs").doc(uid);
    let phase = "inventory";
    await job.set({ uid, status: "running", phase, startedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    try {
      const [owned, memberships, ownedInvites, receivedInvites, permits, tokens, queuedMail] = await Promise.all([
        db.collection("galleries").where("ownerId", "==", uid).get(),
        email
          ? db.collectionGroup("members").where("email", "==", email).get()
          : Promise.resolve(undefined),
        db.collection("galleryInvites").where("ownerId", "==", uid).get(),
        email
          ? db.collection("galleryInvites").where("email", "==", email).get()
          : Promise.resolve(undefined),
        db.collection("galleryPublishPermits").where("ownerId", "==", uid).get(),
        db.collection("newsletterUnsubscribeTokens").where("uid", "==", uid).get(),
        db.collection("mail").where("accountUid", "==", uid).get(),
      ]);
      const plan: AccountDeletionPlan = {
        uid,
        ownedGalleryIds: owned.docs.map((gallery) => gallery.id),
        membershipPaths: uniqueDocumentPaths(memberships?.docs ?? []),
        invitePaths: uniqueDocumentPaths([
          ...ownedInvites.docs,
          ...(receivedInvites?.docs ?? []),
        ]),
        documentPaths: uniqueDocumentPaths([
          { ref: db.collection("profiles").doc(uid) },
          { ref: db.collection("newsletterSubscriptions").doc(uid) },
          { ref: db.collection("galleryPublicationQuotas").doc(uid) },
          { ref: db.collection("verificationMailRateLimits").doc(uid) },
          ...permits.docs,
          ...tokens.docs,
          ...queuedMail.docs,
        ]),
      };
      const summary = await executeAccountDeletion(plan, {
        phase: async (next) => {
          phase = next;
          await job.set({ status: "running", phase, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        },
        markOwnedSpaces: async (galleryIds) => {
          if (!galleryIds.length) return;
          const batch = db.batch();
          galleryIds.forEach((galleryId) => batch.set(db.collection("galleries").doc(galleryId), {
            lifecycleStatus: "trashed",
            trashedAt: FieldValue.serverTimestamp(),
            purgeAt: new Date(),
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true }));
          await batch.commit();
        },
        deleteOwnedSpaceAssets: async (ownerId, galleryId) => {
          await getStorage().bucket().deleteFiles({ prefix: `published/${ownerId}/${galleryId}/`, force: true });
        },
        deleteOwnedSpace: async (galleryId) => {
          await db.recursiveDelete(db.collection("galleries").doc(galleryId));
        },
        removeMembership: async (path) => { await db.doc(path).delete(); },
        removeInvitation: async (path) => { await db.doc(path).delete(); },
        deleteAvatar: async (ownerId) => {
          await getStorage().bucket().deleteFiles({ prefix: `profiles/${ownerId}/`, force: true });
        },
        removeLinkedDocument: async (path) => { await db.doc(path).delete(); },
        deleteAuthentication: async (ownerId) => { await getAuth().deleteUser(ownerId); },
        finish: async (result) => {
          await job.set({ status: "complete", phase: "complete", summary: result, updatedAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => undefined);
          await job.delete().catch(() => undefined);
        },
      });
      return { status: "deleted", summary: portableValue(summary) };
    } catch (error) {
      await job.set({
        status: "failed",
        phase,
        errorCode: accountDeletionErrorCode(error),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true }).catch(() => undefined);
      throw new HttpsError("internal", "Account deletion is incomplete. Your account remains available; retry safely.");
    }
  },
);

/**
 * Server-issued publication permits close the unbounded direct-upload path.
 * Storage and Firestore Rules both require this short-lived permit, while the
 * quota document keeps concurrent account publications bounded.
 */
export const beginAuraGalleryPublication = onCall(
  { region: REGION, timeoutSeconds: 30, enforceAppCheck: true },
  async (request) => {
    const uid = requireAccount(request.auth);
    if (!verifiedAccount(request.auth))
      throw new HttpsError("failed-precondition", "Verify your email before publishing.");
    const galleryId = galleryIdFrom(request.data?.galleryId);
    const visibility = request.data?.visibility;
    if (typeof visibility !== "string" || !galleryVisibilities.has(visibility))
      throw new HttpsError("invalid-argument", "Invalid Space visibility.");
    const now = Date.now();
    const terms = publicationTerms(true, visibility as GalleryVisibility, now);
    if (!terms)
      throw new HttpsError("failed-precondition", "A verified account is required to publish.");
    const { retention, expiresAt } = terms;
    const permitExpiresAt = new Date(now + 20 * 60_000);
    const quotaReference = db.collection("galleryPublicationQuotas").doc(uid);
    const permitReference = db.collection("galleryPublishPermits").doc(galleryId);
    await db.runTransaction(async (transaction) => {
      const [quota, existingGallery, existingPermit, activeRooms] = await Promise.all([
        transaction.get(quotaReference),
        transaction.get(db.collection("galleries").doc(galleryId)),
        transaction.get(permitReference),
        transaction.get(
          db.collection("galleries")
            .where("ownerId", "==", uid)
            .where("lifecycleStatus", "==", "active")
            .where("expiresAt", ">", new Date(now))
            .limit(30),
        ),
      ]);
      if (existingGallery.exists || existingPermit.exists)
        throw new HttpsError("already-exists", "This publication id is already in use.");
      const data = quota.data() ?? {};
      if (activeRooms.size >= 30)
        throw new HttpsError("resource-exhausted", "Archive or remove a live Space before publishing another.");
      const day = new Date(now).toISOString().slice(0, 10);
      const dailyCount = data.day === day ? Number(data.dailyCount ?? 0) : 0;
      if (dailyCount >= 20)
        throw new HttpsError("resource-exhausted", "Daily publication limit reached. Try again tomorrow.");
      transaction.set(quotaReference, {
        day,
        dailyCount: dailyCount + 1,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.create(permitReference, {
        galleryId,
        ownerId: uid,
        visibility,
        retention,
        expiresAt,
        permitExpiresAt,
        createdAt: FieldValue.serverTimestamp(),
      });
    });
    return { expiresAt: expiresAt.toISOString(), retention };
  },
);

export const abortAuraGalleryPublication = onCall(
  { region: REGION, timeoutSeconds: 120, memory: "512MiB", enforceAppCheck: true },
  async (request) => {
    const uid = requireSignedIn(request.auth);
    const galleryId = galleryIdFrom(request.data?.galleryId);
    const permitReference = db.collection("galleryPublishPermits").doc(galleryId);
    const [permit, gallery] = await Promise.all([
      permitReference.get(),
      db.collection("galleries").doc(galleryId).get(),
    ]);
    if (gallery.exists)
      throw new HttpsError("failed-precondition", "A published Space cannot be aborted.");
    if (!permit.exists) return { status: "clean" };
    if (permit.data()?.ownerId !== uid)
      throw new HttpsError("permission-denied", "This publication permit belongs to another account.");
    await getStorage().bucket().deleteFiles({ prefix: `published/${uid}/${galleryId}/`, force: true });
    await Promise.all([
      permitReference.delete(),
      db.collection("galleryPublicationQuotas").doc(uid).set({
        guestGalleryId: FieldValue.delete(),
        guestLockedUntil: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true }),
    ]);
    return { status: "clean" };
  },
);

export const manageAuraGalleryLifecycle = onCall(
  { region: REGION, timeoutSeconds: 30, enforceAppCheck: true },
  async (request) => {
    const uid = requireSignedIn(request.auth);
    const galleryId = galleryIdFrom(request.data?.galleryId);
    const action = request.data?.action;
    if (typeof action !== "string" || !galleryLifecycleActions.has(action))
      throw new HttpsError("invalid-argument", "Invalid Space action.");
    const visibility = request.data?.visibility;
    const galleryReference = db.collection("galleries").doc(galleryId);
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(galleryReference);
      if (!snapshot.exists) throw new HttpsError("not-found", "This Space no longer exists.");
      const data = snapshot.data()!;
      if (data.ownerId !== uid)
        throw new HttpsError("permission-denied", "Only the Space Owner can change its lifecycle.");
      const status = typeof data.lifecycleStatus === "string" ? data.lifecycleStatus : "active";
      const now = new Date();
      if (action === "trash") {
        transaction.update(galleryReference, {
          lifecycleStatus: "trashed",
          trashedAt: now,
          purgeAt: new Date(now.getTime() + 7 * 86_400_000),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return;
      }
      if (action === "restore") {
        if (status !== "trashed") throw new HttpsError("failed-precondition", "This Space is not in Trash.");
        const purgeAt = data.purgeAt?.toMillis?.() ?? 0;
        if (purgeAt <= Date.now()) throw new HttpsError("failed-precondition", "The restore window has ended.");
        transaction.update(galleryReference, {
          lifecycleStatus: "active",
          trashedAt: FieldValue.delete(),
          purgeAt: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return;
      }
      if (!verifiedAccount(request.auth))
        throw new HttpsError("failed-precondition", "Use a verified account for this Space action.");
      if (status === "trashed")
        throw new HttpsError("failed-precondition", "Restore this Space before changing it.");
      if (action === "archive") {
        transaction.update(galleryReference, {
          lifecycleStatus: status === "archived" ? "active" : "archived",
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else if (action === "renew") {
        if (data.retention !== "account-preview")
          throw new HttpsError("failed-precondition", "Guest Spaces cannot be renewed.");
        transaction.update(galleryReference, {
          expiresAt: new Date(Date.now() + 365 * 86_400_000),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        if (typeof visibility !== "string" || !galleryVisibilities.has(visibility))
          throw new HttpsError("invalid-argument", "Invalid Space visibility.");
        transaction.update(galleryReference, {
          visibility,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    });
    return { status: "ok" };
  },
);

export const purgeAuraGallery = onCall(
  { region: REGION, timeoutSeconds: 120, memory: "512MiB", enforceAppCheck: true },
  async (request) => {
    const uid = requireSignedIn(request.auth);
    const galleryId = galleryIdFrom(request.data?.galleryId);
    const galleryReference = db.collection("galleries").doc(galleryId);
    const snapshot = await galleryReference.get();
    if (!snapshot.exists) return { status: "deleted" };
    const data = snapshot.data()!;
    if (data.ownerId !== uid) throw new HttpsError("permission-denied", "Only the Space Owner can purge it.");
    if (data.lifecycleStatus !== "trashed")
      throw new HttpsError("failed-precondition", "Move the Space to Trash first.");
    const purgeAt = data.purgeAt?.toMillis?.() ?? Number.POSITIVE_INFINITY;
    if (purgeAt > Date.now())
      throw new HttpsError("failed-precondition", "The seven-day recovery period is still active.");
    const invites = await db.collection("galleryInvites").where("galleryId", "==", galleryId).get();
    await getStorage().bucket().deleteFiles({ prefix: `published/${uid}/${galleryId}/`, force: true });
    await Promise.all([
      ...invites.docs.map((invite) => invite.ref.delete()),
      db.collection("galleryPublishPermits").doc(galleryId).delete(),
    ]);
    await db.recursiveDelete(galleryReference);
    return { status: "deleted" };
  },
);

export const createAuraGalleryInvite = onCall(
  { region: REGION, timeoutSeconds: 30, enforceAppCheck: true },
  async (request) => {
    const uid = requireAccount(request.auth);
    const galleryId = galleryIdFrom(request.data?.galleryId);
    const email = memberEmailFrom(request.data?.email);
    const role = request.data?.role;
    if (typeof role !== "string" || !galleryRoles.has(role))
      throw new HttpsError("invalid-argument", "Invalid Space role.");
    if (request.auth?.token.email === email)
      throw new HttpsError("failed-precondition", "The owner already has full access.");
    const galleryReference = db.collection("galleries").doc(galleryId);
    const inviteReference = db.collection("galleryInvites").doc(inviteIdFor(galleryId, email));
    await db.runTransaction(async (transaction) => {
      const [gallery, invite, ownerInvites] = await Promise.all([
        transaction.get(galleryReference),
        transaction.get(inviteReference),
        transaction.get(db.collection("galleryInvites").where("ownerId", "==", uid).limit(100)),
      ]);
      if (!gallery.exists) throw new HttpsError("not-found", "This Space no longer exists.");
      if (gallery.data()?.ownerId !== uid)
        throw new HttpsError("permission-denied", "Only the Space Owner can invite collaborators.");
      if ((gallery.data()?.lifecycleStatus ?? "active") === "trashed")
        throw new HttpsError("failed-precondition", "Restore the Space before inviting collaborators.");
      if (!invite.exists && ownerInvites.docs.filter((item) => item.data().status === "pending").length >= 50)
        throw new HttpsError("resource-exhausted", "Resolve an existing invitation before adding another.");
      transaction.set(inviteReference, {
        galleryId,
        galleryTitle: String(gallery.data()?.title ?? "Untitled Space").slice(0, 100),
        ownerId: uid,
        email,
        role,
        status: "pending",
        createdAt: invite.exists ? invite.data()?.createdAt ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
        acceptedAt: FieldValue.delete(),
      }, { merge: true });
    });
    return { status: "pending" };
  },
);

export const acceptAuraGalleryInvite = onCall(
  { region: REGION, timeoutSeconds: 30, enforceAppCheck: true },
  async (request) => {
    const uid = requireAccount(request.auth);
    const inviteId = request.data?.inviteId;
    if (typeof inviteId !== "string" || !/^[a-f0-9]{64}$/.test(inviteId))
      throw new HttpsError("invalid-argument", "Invalid invitation.");
    const email = memberEmailFrom(request.auth?.token.email);
    const inviteReference = db.collection("galleryInvites").doc(inviteId);
    await db.runTransaction(async (transaction) => {
      const invite = await transaction.get(inviteReference);
      const data = invite.data();
      if (!data || data.status !== "pending" || data.email !== email)
        throw new HttpsError("not-found", "This invitation is no longer available.");
      if ((data.expiresAt?.toMillis?.() ?? 0) <= Date.now())
        throw new HttpsError("deadline-exceeded", "This invitation has expired.");
      const gallery = await transaction.get(db.collection("galleries").doc(data.galleryId));
      if (!gallery.exists || (gallery.data()?.lifecycleStatus ?? "active") !== "active")
        throw new HttpsError("failed-precondition", "This Space is not currently available.");
      transaction.set(
        db.collection("galleries").doc(data.galleryId).collection("members").doc(email),
        {
          email,
          role: data.role,
          status: "active",
          addedAt: FieldValue.serverTimestamp(),
          addedBy: data.ownerId,
          acceptedBy: uid,
        },
      );
      transaction.update(inviteReference, {
        status: "accepted",
        acceptedAt: FieldValue.serverTimestamp(),
        acceptedBy: uid,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    return { status: "accepted" };
  },
);

export const revokeAuraGalleryAccess = onCall(
  { region: REGION, timeoutSeconds: 30, enforceAppCheck: true },
  async (request) => {
    const uid = requireAccount(request.auth);
    const galleryId = galleryIdFrom(request.data?.galleryId);
    const email = memberEmailFrom(request.data?.email);
    const galleryReference = db.collection("galleries").doc(galleryId);
    const gallery = await galleryReference.get();
    if (!gallery.exists) return { status: "removed" };
    if (gallery.data()?.ownerId !== uid)
      throw new HttpsError("permission-denied", "Only the Space Owner can revoke access.");
    await Promise.all([
      galleryReference.collection("members").doc(email).delete(),
      db.collection("galleryInvites").doc(inviteIdFor(galleryId, email)).delete(),
    ]);
    return { status: "removed" };
  },
);

async function queueMail(to: string, mail: { subject: string; text: string; html: string }, accountUid?: string) {
  await db.collection("mail").add({
    to: [to],
    message: mail,
    ...(accountUid ? { accountUid } : {}),
    createdAt: FieldValue.serverTimestamp(),
  });
}

export const sendAuraVerificationEmail = onCall(
  { region: REGION, timeoutSeconds: 30 },
  async (request) => {
    requireMailConfiguration();
    const uid = requireAccount(request.auth);
    const user = await getAuth().getUser(uid);
    if (!user.email) throw new HttpsError("failed-precondition", "This account has no email address.");
    if (user.emailVerified) return { status: "already-verified" };
    const rateReference = db.collection("verificationMailRateLimits").doc(uid);
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(rateReference);
      const lastQueuedAt = snapshot.data()?.lastQueuedAt?.toMillis?.() ?? 0;
      if (Date.now() - lastQueuedAt < 60_000)
        throw new HttpsError("resource-exhausted", "Wait one minute before requesting another email.");
      transaction.set(rateReference, {
        uid,
        lastQueuedAt: FieldValue.serverTimestamp(),
      });
    });
    const currentBrand = brand();
    const verificationUrl = await getAuth().generateEmailVerificationLink(
      user.email,
      { url: `${currentBrand.appUrl}/#/create`, handleCodeInApp: false },
    );
    await queueMail(
      user.email,
      verificationMail(currentBrand, {
        displayName: user.displayName,
        verificationUrl,
      }),
      uid,
    );
    return { status: "queued" };
  },
);

export const setAuraNewsletterPreference = onCall(
  { region: REGION, timeoutSeconds: 30 },
  async (request) => {
    requireMailConfiguration();
    const uid = requireAccount(request.auth);
    const subscribed = request.data?.subscribed;
    const source = request.data?.source;
    if (typeof subscribed !== "boolean" || typeof source !== "string" || !sources.has(source))
      throw new HttpsError("invalid-argument", "Invalid newsletter preference.");
    const user = await getAuth().getUser(uid);
    if (!user.email) throw new HttpsError("failed-precondition", "This account has no email address.");
    const subscriptionReference = db.collection("newsletterSubscriptions").doc(uid);
    if (!subscribed) {
      await subscriptionReference.set({
        uid,
        email: user.email.toLowerCase(),
        status: "unsubscribed",
        source,
        consentVersion: "2026-08-14",
        unsubscribedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return { status: "unsubscribed", welcomeQueued: false };
    }
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const tokenReference = db.collection("newsletterUnsubscribeTokens").doc(tokenHash);
    const mailReference = db.collection("mail").doc();
    const currentBrand = brand();
    const unsubscribeUrl = `https://${REGION}-virtualartplattform.cloudfunctions.net/unsubscribeAuraNewsletter?token=${token}`;
    let welcomeQueued = false;
    await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(subscriptionReference);
      const welcomeVersion = Number(existing.data()?.welcomeVersion ?? 0);
      transaction.set(subscriptionReference, {
        uid,
        email: user.email!.toLowerCase(),
        status: "subscribed",
        source,
        consentVersion: "2026-08-14",
        consentedAt: FieldValue.serverTimestamp(),
        unsubscribedAt: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
        welcomeVersion: Math.max(1, welcomeVersion),
      }, { merge: true });
      if (welcomeVersion >= 1) return;
      welcomeQueued = true;
      transaction.create(tokenReference, {
        uid,
        createdAt: FieldValue.serverTimestamp(),
        usedAt: null,
      });
      transaction.create(mailReference, {
        to: [user.email],
        accountUid: uid,
        message: welcomeMail(currentBrand, {
          displayName: user.displayName,
          unsubscribeUrl,
        }),
        createdAt: FieldValue.serverTimestamp(),
      });
    });
    return { status: "subscribed", welcomeQueued };
  },
);

function responsePage(message: string) {
  const appUrl = brand().appUrl;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Newsletter preference | LIEUVA</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#151613;color:#efeee8;font-family:Arial,sans-serif"><main style="width:min(560px,calc(100% - 48px));padding:42px;background:#efeee8;color:#1b1c19"><p style="font-size:10px;letter-spacing:2px;text-transform:uppercase">LIEUVA account</p><h1 style="font:48px/1 Georgia,serif">You are in control.</h1><p style="color:#63655d;line-height:1.7">${message}</p><a href="${appUrl}" style="display:inline-block;margin-top:18px;padding:15px 20px;background:#1b1c19;color:#fff;text-decoration:none;font-size:11px;text-transform:uppercase;letter-spacing:1px">Return to LIEUVA →</a></main></body></html>`;
}

export const unsubscribeAuraNewsletter = onRequest(
  { region: REGION, timeoutSeconds: 30 },
  async (request, response) => {
    try {
      requireMailConfiguration();
    } catch {
      response.status(503).send("LIEUVA email preferences are not configured yet.");
      return;
    }
    response.set("Cache-Control", "no-store");
    response.set("X-Frame-Options", "DENY");
    if (request.method !== "GET") {
      response.status(405).send(responsePage("This link only accepts a browser visit."));
      return;
    }
    const token = typeof request.query.token === "string" ? request.query.token : "";
    if (!/^[a-f0-9]{64}$/.test(token)) {
      response.status(200).send(responsePage("The preference link is invalid or has already been used."));
      return;
    }
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const tokenReference = db.collection("newsletterUnsubscribeTokens").doc(tokenHash);
    let changed = false;
    await db.runTransaction(async (transaction) => {
      const tokenSnapshot = await transaction.get(tokenReference);
      const data = tokenSnapshot.data();
      if (!data || data.usedAt || typeof data.uid !== "string") return;
      transaction.set(db.collection("newsletterSubscriptions").doc(data.uid), {
        status: "unsubscribed",
        unsubscribedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.update(tokenReference, { usedAt: FieldValue.serverTimestamp() });
      changed = true;
    });
    response.status(200).send(responsePage(changed
      ? "You will no longer receive LIEUVA product letters. Your account and Spaces stay untouched."
      : "This preference was already handled. Your account and Spaces stay untouched."));
  },
);

/** Privacy-aware HTML delivery for canonical customer-facing Space URLs. */
export const spaceDocument = onRequest(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", invoker: "public" },
  async (request, response) => {
    response.set("Content-Type", "text/html; charset=utf-8");
    response.set("Vary", "Accept-Encoding");
    response.set("X-Content-Type-Options", "nosniff");
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.set("Allow", "GET, HEAD");
      response.status(405).send("Method not allowed");
      return;
    }
    const spaceId = requestSpaceId(request.path, "spaces");
    let delivery: SpaceDelivery = { kind: "not-found", ...(spaceId ? { id: spaceId } : {}) };
    try {
      if (spaceId) {
        delivery = classifySpaceForDelivery(spaceId, await publicDeliveryManifest(spaceId));
      }
      const metadata = metadataForSpace(delivery);
      response.set("Cache-Control", cacheControlForSpace(delivery));
      response.set("X-Robots-Tag", metadata.robots);
      response.status(metadata.status).send(renderSpaceDocument(generatedAppShell(), delivery));
      console.info("space_document", { spaceId: spaceId ?? "invalid", outcome: delivery.kind });
    } catch {
      delivery = { kind: "temporary-error", ...(spaceId ? { id: spaceId } : {}) };
      const metadata = metadataForSpace(delivery);
      response.set("Cache-Control", cacheControlForSpace(delivery));
      response.set("X-Robots-Tag", metadata.robots);
      response.status(503).send(genericErrorShell(delivery));
      console.error("space_document_failed", { spaceId: spaceId ?? "invalid" });
    }
  },
);

/** Public cover proxy. Storage paths and protected Space media never enter metadata. */
export const spaceCard = onRequest(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", invoker: "public" },
  async (request, response) => {
    response.set("X-Content-Type-Options", "nosniff");
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.set("Allow", "GET, HEAD");
      response.status(405).send("Method not allowed");
      return;
    }
    const spaceId = requestSpaceId(request.path, "space-cards");
    if (!spaceId) {
      response.set("Cache-Control", "private, no-store, max-age=0");
      response.status(404).send("Not found");
      return;
    }
    try {
      const delivery = classifySpaceForDelivery(spaceId, await publicDeliveryManifest(spaceId));
      if (delivery.kind !== "public") {
        response.set("Cache-Control", "private, no-store, max-age=0");
        response.status(404).send("Not found");
        console.info("space_card_rejected", { spaceId, outcome: delivery.kind });
        return;
      }
      if (!delivery.coverPath) {
        response.set("Cache-Control", "public, max-age=60, s-maxage=60, must-revalidate");
        response.redirect(302, SPACE_CARD_FALLBACK);
        return;
      }
      const file = getStorage().bucket().file(delivery.coverPath);
      const [metadata] = await file.getMetadata();
      const contentType = metadata.contentType ?? "";
      const size = Number(metadata.size ?? 0);
      if (!new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]).has(contentType) || size > 2 * 1024 * 1024)
        throw new Error("Invalid public cover metadata.");
      const [image] = await file.download();
      response.set("Content-Type", contentType);
      response.set("Content-Length", String(image.length));
      response.set("Cache-Control", "public, max-age=60, s-maxage=60, must-revalidate");
      if (metadata.etag) response.set("ETag", metadata.etag);
      response.status(200).send(image);
      console.info("space_card", { spaceId, outcome: "public" });
    } catch {
      response.set("Cache-Control", "private, no-store, max-age=0");
      response.status(404).send("Not found");
      console.error("space_card_failed", { spaceId });
    }
  },
);

/** Canonical, public-only sitemap generated from the current publication state. */
export const spaceSitemap = onRequest(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", invoker: "public" },
  async (request, response) => {
    response.set("Content-Type", "application/xml; charset=utf-8");
    response.set("X-Content-Type-Options", "nosniff");
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.set("Allow", "GET, HEAD");
      response.status(405).send("Method not allowed");
      return;
    }
    try {
      const expiryFloor = new Date();
      const [modern, legacy] = await Promise.all([
        db.collection("galleries")
          .where("visibility", "==", "public")
          .where("expiresAt", ">", expiryFloor)
          .orderBy("expiresAt", "desc")
          .limit(500)
          .select(...publicDeliveryFields)
          .get(),
        db.collection("galleries")
          .where("schemaVersion", "in", [1, 2])
          .where("expiresAt", ">", expiryFloor)
          .orderBy("expiresAt", "desc")
          .limit(500)
          .select(...publicDeliveryFields)
          .get(),
      ]);
      const documents = new Map([...modern.docs, ...legacy.docs].map((document) => [document.id, document]));
      const spaces = [...documents.values()]
        .map((document) => classifySpaceForDelivery(document.id, document.data()))
        .filter((delivery): delivery is PublicSpaceDelivery => delivery.kind === "public");
      response.set("Cache-Control", "public, max-age=0, s-maxage=60, must-revalidate");
      response.status(200).send(renderPublicSitemap(spaces));
      console.info("space_sitemap", { publicSpaceCount: spaces.length });
    } catch {
      response.set("Cache-Control", "private, no-store, max-age=0");
      response.set("X-Robots-Tag", "noindex");
      response.status(503).send(renderPublicSitemap([]));
      console.error("space_sitemap_failed");
    }
  },
);
