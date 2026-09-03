import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldPath, FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { defineString } from "firebase-functions/params";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import {
  classifyServerError,
  logOperation,
  parseClientTelemetry,
  safeResourceRef,
} from "./observability.js";
import {
  assertAuraMailBrandConfigured,
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
import {
  CREATOR_HANDLE_CHANGE_COOLDOWN_MS,
  classifyCreatorDocumentRoute,
  creatorPublicContentMatches,
  creatorNotificationProjection,
  creatorFollowTransition,
  creatorCanonicalUrl,
  isCreatorProfileSpaceListed,
  isReviewedPublicCreatorProfile,
  isValidCreatorWebp,
  normalizeCreatorHandle,
  parseCreatorCommentInput,
  parseCreatorPostInput,
  parseCreatorProfileInput,
  parseCreatorReportReason,
  publicCreatorDirectoryEntry,
  renderCreatorDirectoryDocument,
  renderCreatorDocument,
  renderCreatorHubDocument,
  type CreatorDelivery,
  type PublicCreatorPost,
  type PublicCreatorSpace,
} from "./creatorIdentity.js";
import {
  boundedModerationSourceReports,
  creatorPostModerationCaseId,
  creatorPostReportId,
  creatorReportPrincipal,
  creatorReportIntakePatch,
  highestModerationPriority,
  moderationPriorityForReason,
} from "./moderationPolicy.js";

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
const galleryLifecycleActions = new Set(["archive", "restore", "renew", "trash", "visibility", "distribution"]);
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
  "discoverEligible",
  "exploreListed",
  "creatorProfileListed",
  "artworks",
] as const;

/** App Check protected, allow-listed observability boundary. No content or raw IDs are accepted. */
export const recordLieuvaTelemetry = onCall(
  { region: REGION, timeoutSeconds: 15, memory: "256MiB", enforceAppCheck: true },
  async (request) => {
    const startedAt = Date.now();
    try {
      const events = parseClientTelemetry(request.data?.events);
      for (const event of events) logger.info("lieuva_client_event", {
        schema: "lieuva_client_telemetry_v1",
        ...event,
      });
      logOperation("client_telemetry", "success", startedAt, { count: events.length });
      return { accepted: events.length };
    } catch (error) {
      logOperation("client_telemetry", "rejected", startedAt, { errorClass: classifyServerError(error) });
      throw new HttpsError("invalid-argument", "Invalid telemetry batch.");
    }
  },
);

function brand(): AuraMailBrand {
  return {
    name: "LIEUVA",
    appUrl: PUBLIC_APP_URL.value().replace(/\/$/, ""),
    replyTo: REPLY_TO.value(),
    legalFooter: LEGAL_FOOTER.value(),
  };
}

function requireMailConfiguration() {
  try {
    assertAuraMailBrandConfigured(brand());
  } catch {
    throw new HttpsError("failed-precondition", "LIEUVA email delivery is not configured yet.");
  }
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

function requestRouteValue(path: string, route: string, suffix = "") {
  const match = new RegExp(`/${route}/([^/]+)${suffix.replace(".", "[.]")}/?$`).exec(path);
  if (!match) return undefined;
  try { return decodeURIComponent(match[1]); } catch { return undefined; }
}

function timestampMilliseconds(value: unknown): number | undefined {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function")
    return value.toMillis();
  if (typeof value === "string" || typeof value === "number") {
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : undefined;
  }
  return undefined;
}

async function creatorDeliveryForHandle(handleValue: unknown): Promise<CreatorDelivery> {
  const requestedHandle = normalizeCreatorHandle(handleValue);
  if (!requestedHandle) return { kind: "not-found" };
  const handleSnapshot = await db.collection("creatorHandles").doc(requestedHandle).get();
  const handleData = handleSnapshot.data();
  if (!handleData || typeof handleData.creatorId !== "string")
    return { kind: "not-found", handle: requestedHandle };
  const creatorId = handleData.creatorId;
  const [profileSnapshot, accountSnapshot] = await Promise.all([
    db.collection("creatorProfiles").doc(creatorId).get(),
    db.collection("creatorAccounts").doc(creatorId).get(),
  ]);
  const profileData = profileSnapshot.data();
  const accountData = accountSnapshot.data();
  if (
    !profileData || profileData.profilePublic !== true || profileData.discoverEligible !== true ||
    typeof profileData.handle !== "string" ||
    typeof profileData.displayName !== "string" ||
    typeof accountData?.ownerId !== "string"
  ) return { kind: "not-found", handle: requestedHandle };
  const profile = parseCreatorProfileInput(profileData);
  if (!isReviewedPublicCreatorProfile(profile)) return { kind: "not-found", handle: requestedHandle };
  const [spacesSnapshot, postsSnapshot] = await Promise.all([
    db.collection("galleries")
      .where("ownerId", "==", accountData.ownerId)
      .limit(100)
      .select(...publicDeliveryFields)
      .get(),
    db.collection("creatorAccounts").doc(creatorId).collection("posts")
      .orderBy("createdAt", "desc")
      .limit(12)
      .get(),
  ]);
  const spaces: PublicCreatorSpace[] = spacesSnapshot.docs
    .filter((document) => isCreatorProfileSpaceListed(document.data()))
    .map((document) => classifySpaceForDelivery(document.id, document.data()))
    .filter((delivery): delivery is PublicSpaceDelivery =>
      delivery.kind === "public" && delivery.indexEligible)
    .sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""))
    .map((space) => ({
      id: space.id,
      title: space.title,
      creator: space.creator,
      coverUrl: `${PUBLIC_APP_URL.value().replace(/\/$/, "")}/space-cards/${space.id}?v=${space.revision}`,
      ...(space.updatedAt ? { updatedAt: space.updatedAt } : {}),
    }));
  const updated = timestampMilliseconds(profileData.updatedAt);
  const posts: PublicCreatorPost[] = postsSnapshot.docs.flatMap((document) => {
    if (document.data().moderationStatus === "removed") return [];
    const body = parseCreatorPostInput(document.data().body);
    const createdAt = timestampMilliseconds(document.data().createdAt);
    if (!body || createdAt === undefined) return [];
    return [{
      id: document.id,
      handle: profile.handle,
      displayName: profile.displayName,
      body,
      createdAt: new Date(createdAt).toISOString(),
      reactionCount: Math.max(0, Number.isSafeInteger(document.data().reactionCount) ? document.data().reactionCount : 0),
      commentCount: Math.max(0, Number.isSafeInteger(document.data().commentCount) ? document.data().commentCount : 0),
    }];
  });
  return {
    kind: "public",
    profile: {
      ...profile,
      ...(updated !== undefined ? { updatedAt: new Date(updated).toISOString() } : {}),
    },
    spaces,
    posts,
  };
}

function publicCreatorPayload(delivery: CreatorDelivery) {
  if (delivery.kind !== "public") return undefined;
  return { schemaVersion: 1, profile: delivery.profile, spaces: delivery.spaces, posts: delivery.posts };
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

/** Server-authoritative handle availability. The response never exposes a UID
 * or the private Creator mapping. */
export const checkLieuvaCreatorHandle = onCall(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", enforceAppCheck: true },
  async (request) => {
    const uid = requireAccount(request.auth);
    const handle = normalizeCreatorHandle(request.data?.handle);
    if (!handle) throw new HttpsError("invalid-argument", "Use 3–30 lowercase letters, numbers, or single dashes.");
    const [candidate, owner] = await Promise.all([
      db.collection("creatorHandles").doc(handle).get(),
      db.collection("creatorAccountOwners").doc(uid).get(),
    ]);
    const creatorId = owner.data()?.creatorId;
    return { handle, available: !candidate.exists || candidate.data()?.creatorId === creatorId };
  },
);

export const getMyLieuvaCreatorProfile = onCall(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", enforceAppCheck: true },
  async (request) => {
    const uid = requireAccount(request.auth);
    const owner = await db.collection("creatorAccountOwners").doc(uid).get();
    const creatorId = owner.data()?.creatorId;
    if (typeof creatorId !== "string") return { profile: null };
    const profile = await db.collection("creatorProfiles").doc(creatorId).get();
    const parsed = parseCreatorProfileInput(profile.data());
    return { profile: parsed };
  },
);

/** Creates or updates the narrow public Creator projection. Handle ownership is
 * decided atomically; old handles remain aliases and never become silently
 * available to another account. */
export const saveLieuvaCreatorProfile = onCall(
  { region: REGION, timeoutSeconds: 45, memory: "256MiB", enforceAppCheck: true },
  async (request) => {
    const uid = requireAccount(request.auth);
    const input = parseCreatorProfileInput(request.data);
    if (!input) throw new HttpsError("invalid-argument", "Check the public profile fields and HTTPS links.");
    const proposedCreatorId = randomBytes(16).toString("hex");
    const now = Date.now();
    await db.runTransaction(async (transaction) => {
      const ownerReference = db.collection("creatorAccountOwners").doc(uid);
      const ownerSnapshot = await transaction.get(ownerReference);
      const creatorId = typeof ownerSnapshot.data()?.creatorId === "string"
        ? ownerSnapshot.data()!.creatorId as string
        : proposedCreatorId;
      const accountReference = db.collection("creatorAccounts").doc(creatorId);
      const profileReference = db.collection("creatorProfiles").doc(creatorId);
      const handleReference = db.collection("creatorHandles").doc(input.handle);
      const [accountSnapshot, handleSnapshot, profileSnapshot] = await Promise.all([
        transaction.get(accountReference),
        transaction.get(handleReference),
        transaction.get(profileReference),
      ]);
      const account = accountSnapshot.data();
      const currentProfile = parseCreatorProfileInput(profileSnapshot.data());
      const currentHandle = typeof account?.currentHandle === "string" ? account.currentHandle : undefined;
      if (handleSnapshot.exists && handleSnapshot.data()?.creatorId !== creatorId)
        throw new HttpsError("already-exists", "That public handle is already in use.");
      if (currentHandle && currentHandle !== input.handle) {
        const lastChanged = timestampMilliseconds(account?.handleChangedAt);
        if (lastChanged !== undefined && now - lastChanged < CREATOR_HANDLE_CHANGE_COOLDOWN_MS)
          throw new HttpsError("failed-precondition", "Public handles can be changed once every seven days.");
      }
      transaction.set(ownerReference, {
        creatorId,
        currentHandle: input.handle,
        updatedAt: FieldValue.serverTimestamp(),
        schemaVersion: 1,
      }, { merge: true });
      transaction.set(accountReference, {
        ownerId: uid,
        currentHandle: input.handle,
        ...(currentHandle !== input.handle ? { handleChangedAt: FieldValue.serverTimestamp() } : {}),
        updatedAt: FieldValue.serverTimestamp(),
        schemaVersion: 1,
      }, { merge: true });
      transaction.set(profileReference, {
        handle: input.handle,
        displayName: input.displayName,
        bio: input.bio,
        links: input.links,
        profilePublic: input.profilePublic,
        // Approval is preserved only for a byte-for-byte equivalent normalized
        // public projection. Any owner-controlled public change returns to the
        // review queue; request input can never self-approve it.
        discoverEligible: creatorPublicContentMatches(currentProfile, input)
          && currentProfile?.discoverEligible === true,
        imagePresent: profileSnapshot.data()?.imagePresent === true,
        coverPresent: profileSnapshot.data()?.coverPresent === true,
        bioFont: input.bioFont,
        profileTone: input.profileTone,
        followerCount: typeof profileSnapshot.data()?.followerCount === "number"
          ? Math.max(0, profileSnapshot.data()!.followerCount)
          : 0,
        updatedAt: FieldValue.serverTimestamp(),
        schemaVersion: 1,
      });
      transaction.set(handleReference, {
        creatorId,
        canonicalHandle: input.handle,
        kind: "current",
        updatedAt: FieldValue.serverTimestamp(),
        schemaVersion: 1,
      });
      if (currentHandle && currentHandle !== input.handle) {
        transaction.set(db.collection("creatorHandles").doc(currentHandle), {
          creatorId,
          canonicalHandle: input.handle,
          kind: "alias",
          updatedAt: FieldValue.serverTimestamp(),
          schemaVersion: 1,
        });
      }
    });
    const savedProfile = parseCreatorProfileInput((await db.collection("creatorProfiles")
      .where("handle", "==", input.handle).limit(1).get()).docs[0]?.data())
      ?? { ...input, discoverEligible: false };
    return { profile: savedProfile, publicUrl: creatorCanonicalUrl(input.handle) };
  },
);

/** Updates the optional public Creator image without exposing Storage paths or
 * account identifiers. The public image is always mediated by creatorImage. */
export const setLieuvaCreatorProfileImage = onCall(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", enforceAppCheck: true },
  async (request) => {
    const uid = requireAccount(request.auth);
    const owner = await db.collection("creatorAccountOwners").doc(uid).get();
    const creatorId = owner.data()?.creatorId;
    if (typeof creatorId !== "string") throw new HttpsError("failed-precondition", "Save the public profile first.");
    const profileReference = db.collection("creatorProfiles").doc(creatorId);
    if (!(await profileReference.get()).exists) throw new HttpsError("failed-precondition", "Save the public profile first.");
    const object = getStorage().bucket().file(`creator-public/${creatorId}/avatar.webp`);
    if (request.data?.remove === true) {
      await profileReference.set({
        imagePresent: false,
        discoverEligible: false,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      await object.delete({ ignoreNotFound: true });
      return { imagePresent: false };
    }
    const encoded = typeof request.data?.base64 === "string" ? request.data.base64 : "";
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length > 720_000)
      throw new HttpsError("invalid-argument", "Choose a supported profile image under 512 KB.");
    const bytes = Buffer.from(encoded, "base64");
    if (!isValidCreatorWebp(bytes))
      throw new HttpsError("invalid-argument", "Choose a supported profile image under 512 KB.");
    // Fail closed before touching the object. If Storage fails, the previous
    // image is no longer publicly mediated as reviewed content.
    await profileReference.set({
      discoverEligible: false,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await object.save(bytes, {
      resumable: false,
      metadata: { contentType: "image/webp", cacheControl: "private, no-store", metadata: { kind: "creator-avatar", schemaVersion: "1" } },
    });
    await profileReference.set({
      imagePresent: true,
      discoverEligible: false,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { imagePresent: true };
  },
);

/** Updates the optional landscape title image. It follows the same mediated
 * public-delivery contract as the profile image. */
export const setLieuvaCreatorProfileCover = onCall(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", enforceAppCheck: true },
  async (request) => {
    const uid = requireAccount(request.auth);
    const owner = await db.collection("creatorAccountOwners").doc(uid).get();
    const creatorId = owner.data()?.creatorId;
    if (typeof creatorId !== "string") throw new HttpsError("failed-precondition", "Save the public profile first.");
    const profileReference = db.collection("creatorProfiles").doc(creatorId);
    if (!(await profileReference.get()).exists) throw new HttpsError("failed-precondition", "Save the public profile first.");
    const object = getStorage().bucket().file(`creator-public/${creatorId}/cover.webp`);
    if (request.data?.remove === true) {
      await profileReference.set({
        coverPresent: false,
        discoverEligible: false,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      await object.delete({ ignoreNotFound: true });
      return { coverPresent: false };
    }
    const encoded = typeof request.data?.base64 === "string" ? request.data.base64 : "";
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length > 720_000)
      throw new HttpsError("invalid-argument", "Choose a supported cover image under 512 KB.");
    const bytes = Buffer.from(encoded, "base64");
    if (!isValidCreatorWebp(bytes))
      throw new HttpsError("invalid-argument", "Choose a supported cover image under 512 KB.");
    await profileReference.set({
      discoverEligible: false,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await object.save(bytes, {
      resumable: false,
      metadata: { contentType: "image/webp", cacheControl: "private, no-store", metadata: { kind: "creator-cover", schemaVersion: "1" } },
    });
    await profileReference.set({
      coverPresent: true,
      discoverEligible: false,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { coverPresent: true };
  },
);

/** Authenticated Creator-to-Creator follows. Public profiles expose only an
 * aggregate count; account and Creator identifiers remain server-side. */
export const manageLieuvaCreatorFollow = onCall(
  { region: REGION, timeoutSeconds: 20, memory: "256MiB", enforceAppCheck: true },
  async (request) => {
    const uid = requireAccount(request.auth);
    const handle = normalizeCreatorHandle(request.data?.handle);
    const action = request.data?.action;
    if (!handle || !["status", "follow", "unfollow"].includes(action))
      throw new HttpsError("invalid-argument", "Choose a valid public Creator and follow action.");
    const [ownerSnapshot, handleSnapshot] = await Promise.all([
      db.collection("creatorAccountOwners").doc(uid).get(),
      db.collection("creatorHandles").doc(handle).get(),
    ]);
    const followerCreatorId = ownerSnapshot.data()?.creatorId;
    const followedCreatorId = handleSnapshot.data()?.creatorId;
    if (typeof followedCreatorId !== "string") throw new HttpsError("not-found", "Creator profile not found.");
    const targetReference = db.collection("creatorProfiles").doc(followedCreatorId);
    const targetSnapshot = await targetReference.get();
    const target = parseCreatorProfileInput(targetSnapshot.data());
    if (!isReviewedPublicCreatorProfile(target))
      throw new HttpsError("not-found", "Creator profile not found.");
    if (typeof followerCreatorId !== "string")
      return { following: false, followerCount: target.followerCount, canFollow: false, isSelf: false };
    const isSelf = followerCreatorId === followedCreatorId;
    const followReference = db.collection("creatorFollows").doc(`${followerCreatorId}_${followedCreatorId}`);
    const actorProfileReference = db.collection("creatorProfiles").doc(followerCreatorId);
    const followNotificationReference = db.collection("creatorNotifications").doc(followedCreatorId).collection("items").doc();
    const [outgoingBlock, incomingBlock] = isSelf ? [undefined, undefined] : await Promise.all([
      db.collection("creatorBlocks").doc(`${followerCreatorId}_${followedCreatorId}`).get(),
      db.collection("creatorBlocks").doc(`${followedCreatorId}_${followerCreatorId}`).get(),
    ]);
    const blocked = outgoingBlock?.exists === true || incomingBlock?.exists === true;
    if (action === "status" || isSelf) {
      const follow = isSelf ? undefined : await followReference.get();
      const actorProfile = isSelf
        ? target
        : parseCreatorProfileInput((await actorProfileReference.get()).data());
      return {
        following: blocked ? false : follow?.exists === true,
        followerCount: target.followerCount,
        canFollow: !isSelf && !blocked && isReviewedPublicCreatorProfile(actorProfile),
        isSelf,
        blocked,
      };
    }
    if (blocked) throw new HttpsError("failed-precondition", "This Creator connection is blocked.");
    const transitionResult = await db.runTransaction(async (transaction) => {
      const [followSnapshot, currentTarget, actorProfileSnapshot] = await Promise.all([
        transaction.get(followReference),
        transaction.get(targetReference),
        transaction.get(actorProfileReference),
      ]);
      const exists = followSnapshot.exists;
      const currentTargetProfile = parseCreatorProfileInput(currentTarget.data());
      const actorProfile = parseCreatorProfileInput(actorProfileSnapshot.data());
      const count = currentTargetProfile?.followerCount ?? 0;
      const transition = creatorFollowTransition(action, exists, count);
      if (action === "follow" && transition.changed) {
        if (!isReviewedPublicCreatorProfile(currentTargetProfile))
          throw new HttpsError("not-found", "Creator profile not found.");
        if (!isReviewedPublicCreatorProfile(actorProfile))
          throw new HttpsError("failed-precondition", "Your public Creator profile must be reviewed before following.");
        transaction.create(followReference, {
          followerCreatorId,
          followedCreatorId,
          createdAt: FieldValue.serverTimestamp(),
          schemaVersion: 1,
        });
        transaction.set(targetReference, { followerCount: transition.followerCount }, { merge: true });
        transaction.create(followNotificationReference, {
          kind: "follow",
          actorCreatorId: followerCreatorId,
          actorHandle: actorProfile.handle,
          actorDisplayName: actorProfile.displayName,
          createdAt: FieldValue.serverTimestamp(),
          read: false,
          schemaVersion: 1,
        });
        return { following: true, changed: true, actorProfilePublic: true };
      }
      if (action === "unfollow" && transition.changed) {
        transaction.delete(followReference);
        transaction.set(targetReference, { followerCount: transition.followerCount }, { merge: true });
        return { following: false, changed: true, actorProfilePublic: isReviewedPublicCreatorProfile(actorProfile) };
      }
      return { following: exists, changed: false, actorProfilePublic: isReviewedPublicCreatorProfile(actorProfile) };
    });
    const updated = parseCreatorProfileInput((await targetReference.get()).data());
    return { following: transitionResult.following, followerCount: updated?.followerCount ?? 0, canFollow: transitionResult.actorProfilePublic, isSelf: false, blocked: false };
  },
);

/** A bounded, text-only public post. The transaction makes the cooldown
 * server-authoritative and prevents clients from writing Creator data directly. */
export const createLieuvaCreatorPost = onCall(
  { region: REGION, timeoutSeconds: 15, memory: "256MiB", enforceAppCheck: true },
  async (request) => {
    const uid = requireAccount(request.auth);
    const body = parseCreatorPostInput(request.data?.body);
    if (!body) throw new HttpsError("invalid-argument", "Write between 1 and 600 characters.");
    const owner = await db.collection("creatorAccountOwners").doc(uid).get();
    const creatorId = owner.data()?.creatorId;
    if (typeof creatorId !== "string")
      throw new HttpsError("failed-precondition", "Create your Creator profile before posting.");
    const profileReference = db.collection("creatorProfiles").doc(creatorId);
    const profile = parseCreatorProfileInput((await profileReference.get()).data());
    if (!isReviewedPublicCreatorProfile(profile))
      throw new HttpsError("failed-precondition", "Your public Creator profile must be reviewed before posting.");
    const accountReference = db.collection("creatorAccounts").doc(creatorId);
    const postReference = accountReference.collection("posts").doc();
    const createdAt = new Date();
    await db.runTransaction(async (transaction) => {
      const account = await transaction.get(accountReference);
      if (account.data()?.ownerId !== uid)
        throw new HttpsError("permission-denied", "This Creator profile is not available to this account.");
      const lastPostAt = timestampMilliseconds(account.data()?.lastPostAt);
      if (lastPostAt !== undefined && createdAt.getTime() - lastPostAt < 30_000)
        throw new HttpsError("resource-exhausted", "Wait a moment before posting again.");
      transaction.set(postReference, {
        body,
        createdAt: FieldValue.serverTimestamp(),
        reactionCount: 0,
        commentCount: 0,
        moderationStatus: "published",
        schemaVersion: 1,
      });
      transaction.set(accountReference, { lastPostAt: FieldValue.serverTimestamp() }, { merge: true });
    });
    return {
      post: {
        id: postReference.id,
        handle: profile.handle,
        displayName: profile.displayName,
        body,
        createdAt: createdAt.toISOString(),
        reactionCount: 0,
        commentCount: 0,
      },
    };
  },
);

/** Moderated post engagement. Reactions and comments are enabled only behind
 * server-owned reporting/blocking boundaries; clients never write the social
 * collections directly. */
export const manageLieuvaCreatorPostInteraction = onCall(
  { region: REGION, timeoutSeconds: 20, memory: "256MiB", enforceAppCheck: true },
  async (request) => {
    const uid = requireAccount(request.auth);
    const handle = normalizeCreatorHandle(request.data?.handle);
    const postId = typeof request.data?.postId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(request.data.postId)
      ? request.data.postId
      : null;
    const action = request.data?.action;
    if (!handle || !postId || !["react", "unreact", "comment", "report"].includes(action))
      throw new HttpsError("invalid-argument", "Choose a valid Creator post interaction.");
    const [actorOwner, targetHandle] = await Promise.all([
      db.collection("creatorAccountOwners").doc(uid).get(),
      db.collection("creatorHandles").doc(handle).get(),
    ]);
    const actorCreatorId = actorOwner.data()?.creatorId;
    const targetCreatorId = targetHandle.data()?.creatorId;
    if (typeof targetCreatorId !== "string") throw new HttpsError("not-found", "Creator post not found.");
    const [targetProfileSnapshot, post] = await Promise.all([
      db.collection("creatorProfiles").doc(targetCreatorId).get(),
      db.collection("creatorAccounts").doc(targetCreatorId).collection("posts").doc(postId).get(),
    ]);
    const targetProfile = parseCreatorProfileInput(targetProfileSnapshot.data());
    if (!isReviewedPublicCreatorProfile(targetProfile))
      throw new HttpsError("not-found", "Creator post not found.");
    const postReference = db.collection("creatorAccounts").doc(targetCreatorId).collection("posts").doc(postId);
    if (!post.exists || post.data()?.moderationStatus === "removed")
      throw new HttpsError("not-found", "Creator post not found.");

    if (action === "report") {
      const reason = parseCreatorReportReason(request.data?.reason);
      if (!reason) throw new HttpsError("invalid-argument", "Choose a valid report reason.");
      // Keep legacy Creator-keyed report IDs stable. Accounts without a public
      // Creator identity still receive a private, deterministic reporting key.
      const reporterKey = creatorReportPrincipal(uid, actorCreatorId);
      const reportId = creatorPostReportId(reporterKey, targetCreatorId, postId);
      const computedCaseId = creatorPostModerationCaseId(targetCreatorId, postId);
      const reportReference = db.collection("creatorReports").doc(reportId);
      const caseReference = db.collection("moderationCases").doc(computedCaseId);
      const eventReference = caseReference.collection("events").doc();
      const intake = await db.runTransaction(async (transaction) => {
        const [currentPost, existingReport, existingCase] = await Promise.all([
          transaction.get(postReference),
          transaction.get(reportReference),
          transaction.get(caseReference),
        ]);
        if (!currentPost.exists || currentPost.data()?.moderationStatus === "removed")
          throw new HttpsError("not-found", "Creator post not found.");
        const reportData = existingReport.data();
        const caseData = existingCase.data();
        const caseId = typeof reportData?.caseId === "string" && /^[a-f0-9]{64}$/.test(reportData.caseId)
          ? reportData.caseId
          : computedCaseId;
        if (caseId !== computedCaseId)
          throw new HttpsError("failed-precondition", "This report needs operator reconciliation.");
        const incomingPriority = moderationPriorityForReason(reason);
        const reportPatch = creatorReportIntakePatch(reportData, reason, caseId);
        transaction.set(reportReference, {
          ...(existingReport.exists ? {} : {
            ...(typeof actorCreatorId === "string" ? { reporterCreatorId: actorCreatorId } : {}),
            targetCreatorId,
            postId,
            targetKind: "creator-post",
            firstReportedAt: FieldValue.serverTimestamp(),
            createdAt: FieldValue.serverTimestamp(),
          }),
          reporterAccountId: uid,
          ...reportPatch,
          lastReportedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        transaction.set(caseReference, {
          ...(existingCase.exists ? {} : {
            targetKind: "creator-post",
            target: { creatorId: targetCreatorId, postId },
            targetCreatorId,
            postId,
            status: "received",
            openedAt: FieldValue.serverTimestamp(),
          }),
          sourceReportIds: boundedModerationSourceReports(caseData?.sourceReportIds, reportId),
          reportCount: (typeof caseData?.reportCount === "number" && Number.isSafeInteger(caseData.reportCount) && caseData.reportCount >= 0
            ? caseData.reportCount
            : 0) + 1,
          priority: highestModerationPriority(caseData?.priority, incomingPriority),
          lastReportReason: reason,
          newReportPending: true,
          lastReportedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          version: (typeof caseData?.version === "number" && Number.isSafeInteger(caseData.version) && caseData.version >= 1
            ? caseData.version
            : 0) + 1,
          schemaVersion: 1,
        }, { merge: true });
        transaction.create(eventReference, {
          kind: "report-received",
          reasonCode: reason,
          repeatedByReporter: existingReport.exists,
          priority: incomingPriority,
          createdAt: FieldValue.serverTimestamp(),
          schemaVersion: 1,
        });
        return { repeated: existingReport.exists };
      });
      logger.info("creator_report_received", {
        schema: "lieuva_moderation_intake_v1",
        reason,
        repeated: intake.repeated,
      });
      return { reported: true, receiptId: eventReference.id };
    }

    if (typeof actorCreatorId !== "string")
      throw new HttpsError("failed-precondition", "Create your Creator profile before joining the conversation.");
    const actorProfile = parseCreatorProfileInput(
      (await db.collection("creatorProfiles").doc(actorCreatorId).get()).data(),
    );
    if (!isReviewedPublicCreatorProfile(actorProfile))
      throw new HttpsError("failed-precondition", "Your public Creator profile must be reviewed before joining the conversation.");
    const [outgoingBlock, incomingBlock] = await Promise.all([
      db.collection("creatorBlocks").doc(`${actorCreatorId}_${targetCreatorId}`).get(),
      db.collection("creatorBlocks").doc(`${targetCreatorId}_${actorCreatorId}`).get(),
    ]);
    if (outgoingBlock.exists || incomingBlock.exists)
      throw new HttpsError("failed-precondition", "This Creator connection is blocked.");

    if (action === "comment") {
      const body = parseCreatorCommentInput(request.data?.body);
      if (!body) throw new HttpsError("invalid-argument", "Write between 1 and 280 characters.");
      const commentReference = postReference.collection("comments").doc();
      const commentNotificationReference = db.collection("creatorNotifications").doc(targetCreatorId).collection("items").doc();
      await db.runTransaction(async (transaction) => {
        const [currentPost, actorAccount] = await Promise.all([
          transaction.get(postReference),
          transaction.get(db.collection("creatorAccounts").doc(actorCreatorId)),
        ]);
        if (!currentPost.exists || currentPost.data()?.moderationStatus === "removed")
          throw new HttpsError("not-found", "Creator post not found.");
        const lastCommentAt = timestampMilliseconds(actorAccount.data()?.lastCommentAt);
        if (lastCommentAt !== undefined && Date.now() - lastCommentAt < 15_000)
          throw new HttpsError("resource-exhausted", "Wait a moment before commenting again.");
        const commentCount = Math.max(0, Number.isSafeInteger(currentPost.data()?.commentCount) ? currentPost.data()!.commentCount : 0);
        transaction.create(commentReference, {
          authorCreatorId: actorCreatorId,
          authorHandle: actorProfile.handle,
          authorDisplayName: actorProfile.displayName,
          body,
          moderationStatus: "published",
          createdAt: FieldValue.serverTimestamp(),
          schemaVersion: 1,
        });
        transaction.set(postReference, { commentCount: commentCount + 1 }, { merge: true });
        transaction.set(db.collection("creatorAccounts").doc(actorCreatorId), { lastCommentAt: FieldValue.serverTimestamp() }, { merge: true });
        transaction.create(commentNotificationReference, {
          kind: "comment",
          actorCreatorId,
          actorHandle: actorProfile.handle,
          actorDisplayName: actorProfile.displayName,
          postId,
          bodyPreview: body.slice(0, 100),
          createdAt: FieldValue.serverTimestamp(),
          read: false,
          schemaVersion: 1,
        });
      });
      return { comment: { id: commentReference.id, handle: actorProfile.handle, displayName: actorProfile.displayName, body, createdAt: new Date().toISOString() } };
    }

    const reactionReference = postReference.collection("reactions").doc(actorCreatorId);
    const reactionNotificationReference = db.collection("creatorNotifications").doc(targetCreatorId).collection("items").doc();
    const reactionResult = await db.runTransaction(async (transaction) => {
      const [currentPost, currentReaction] = await Promise.all([
        transaction.get(postReference),
        transaction.get(reactionReference),
      ]);
      if (!currentPost.exists || currentPost.data()?.moderationStatus === "removed")
        throw new HttpsError("not-found", "Creator post not found.");
      const currentCount = Math.max(0, Number.isSafeInteger(currentPost.data()?.reactionCount) ? currentPost.data()!.reactionCount : 0);
      if (action === "react" && !currentReaction.exists) {
        transaction.create(reactionReference, { creatorId: actorCreatorId, createdAt: FieldValue.serverTimestamp(), schemaVersion: 1 });
        transaction.set(postReference, { reactionCount: currentCount + 1 }, { merge: true });
        transaction.create(reactionNotificationReference, {
          kind: "reaction",
          actorCreatorId,
          actorHandle: actorProfile.handle,
          actorDisplayName: actorProfile.displayName,
          postId,
          createdAt: FieldValue.serverTimestamp(),
          read: false,
          schemaVersion: 1,
        });
        return { reacted: true, reactionCount: currentCount + 1, changed: true };
      }
      if (action === "unreact" && currentReaction.exists) {
        transaction.delete(reactionReference);
        transaction.set(postReference, { reactionCount: Math.max(0, currentCount - 1) }, { merge: true });
        return { reacted: false, reactionCount: Math.max(0, currentCount - 1), changed: true };
      }
      return { reacted: currentReaction.exists, reactionCount: currentCount, changed: false };
    });
    return reactionResult;
  },
);

export const manageLieuvaCreatorBlock = onCall(
  { region: REGION, timeoutSeconds: 20, memory: "256MiB", enforceAppCheck: true },
  async (request) => {
    const uid = requireAccount(request.auth);
    const handle = normalizeCreatorHandle(request.data?.handle);
    const action = request.data?.action;
    if (!handle || !["block", "unblock"].includes(action))
      throw new HttpsError("invalid-argument", "Choose a valid Creator block action.");
    const [owner, targetHandle] = await Promise.all([
      db.collection("creatorAccountOwners").doc(uid).get(),
      db.collection("creatorHandles").doc(handle).get(),
    ]);
    const blockerCreatorId = owner.data()?.creatorId;
    const blockedCreatorId = targetHandle.data()?.creatorId;
    if (typeof blockerCreatorId !== "string") throw new HttpsError("failed-precondition", "Create your Creator profile first.");
    if (typeof blockedCreatorId !== "string" || blockedCreatorId === blockerCreatorId)
      throw new HttpsError("invalid-argument", "Choose another public Creator.");
    const blockReference = db.collection("creatorBlocks").doc(`${blockerCreatorId}_${blockedCreatorId}`);
    const outgoingFollow = db.collection("creatorFollows").doc(`${blockerCreatorId}_${blockedCreatorId}`);
    const incomingFollow = db.collection("creatorFollows").doc(`${blockedCreatorId}_${blockerCreatorId}`);
    await db.runTransaction(async (transaction) => {
      const [block, outgoing, incoming, blockerProfile, blockedProfile] = await Promise.all([
        transaction.get(blockReference), transaction.get(outgoingFollow), transaction.get(incomingFollow),
        transaction.get(db.collection("creatorProfiles").doc(blockerCreatorId)),
        transaction.get(db.collection("creatorProfiles").doc(blockedCreatorId)),
      ]);
      if (action === "unblock") {
        if (block.exists) transaction.delete(blockReference);
        return;
      }
      if (!block.exists) transaction.create(blockReference, {
        blockerCreatorId, blockedCreatorId, createdAt: FieldValue.serverTimestamp(), schemaVersion: 1,
      });
      if (outgoing.exists) {
        transaction.delete(outgoingFollow);
        transaction.set(blockedProfile.ref, { followerCount: Math.max(0, (blockedProfile.data()?.followerCount ?? 0) - 1) }, { merge: true });
      }
      if (incoming.exists) {
        transaction.delete(incomingFollow);
        transaction.set(blockerProfile.ref, { followerCount: Math.max(0, (blockerProfile.data()?.followerCount ?? 0) - 1) }, { merge: true });
      }
    });
    return { blocked: action === "block" };
  },
);

/** Private home feed made only from already-public Creator profiles, posts and
 * public Space updates. Private Creator and Space data is never projected. */
export const getMyLieuvaCreatorHome = onCall(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", enforceAppCheck: true },
  async (request) => {
    const uid = requireAccount(request.auth);
    const owner = await db.collection("creatorAccountOwners").doc(uid).get();
    const creatorId = owner.data()?.creatorId;
    if (typeof creatorId !== "string") return { schemaVersion: 1, following: [], updates: [], posts: [], notifications: [] };
    const [follows, blocks, notificationsSnapshot] = await Promise.all([
      db.collection("creatorFollows").where("followerCreatorId", "==", creatorId).limit(50).get(),
      db.collection("creatorBlocks").where("blockerCreatorId", "==", creatorId).limit(100).get(),
      db.collection("creatorNotifications").doc(creatorId).collection("items").orderBy("createdAt", "desc").limit(20).get(),
    ]);
    const blockedIds = new Set(blocks.docs.map((document) => document.data().blockedCreatorId).filter((value): value is string => typeof value === "string"));
    const followedIds = follows.docs
      .map((document) => document.data().followedCreatorId)
      .filter((value): value is string => typeof value === "string" && !blockedIds.has(value));
    const profiles = await Promise.all(followedIds.map((id) => db.collection("creatorProfiles").doc(id).get()));
    const parsedFollowedProfiles = profiles.map((snapshot) => ({
      creatorId: snapshot.id,
      profile: parseCreatorProfileInput(snapshot.data()),
    }));
    const publicProfiles = parsedFollowedProfiles
      .map(({ profile }) => profile)
      .filter(isReviewedPublicCreatorProfile);
    const ownProfile = parseCreatorProfileInput((await db.collection("creatorProfiles").doc(creatorId).get()).data());
    const feedProfiles = [
      ...(isReviewedPublicCreatorProfile(ownProfile) ? [ownProfile] : []),
      ...publicProfiles,
    ].filter((profile, index, profilesValue) => profilesValue.findIndex((candidate) => candidate.handle === profile.handle) === index);
    const feedDeliveries = await Promise.all(feedProfiles.map((profile) => creatorDeliveryForHandle(profile.handle)));
    const followedHandles = new Set(publicProfiles.map((profile) => profile.handle));
    const deliveries = feedDeliveries.filter((delivery) => delivery.kind === "public" && followedHandles.has(delivery.profile.handle));
    const following = publicProfiles.map((profile) => ({
      handle: profile.handle,
      displayName: profile.displayName,
      bio: profile.bio,
      imagePresent: profile.imagePresent,
      followerCount: profile.followerCount,
    }));
    const updates = deliveries.flatMap((delivery) => delivery.kind === "public"
      ? delivery.spaces.map((space) => ({
          ...space,
          handle: delivery.profile.handle,
          displayName: delivery.profile.displayName,
        }))
      : [])
      .sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""))
      .slice(0, 24);
    const posts = feedDeliveries.flatMap((delivery) => delivery.kind === "public" ? delivery.posts : [])
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 30);
    let postsWithViewerState = posts;
    if (request.data?.includeViewerState === true) {
      const creatorIdsByHandle = new Map<string, string>();
      if (isReviewedPublicCreatorProfile(ownProfile)) creatorIdsByHandle.set(ownProfile.handle, creatorId);
      for (const { creatorId: followedCreatorId, profile } of parsedFollowedProfiles)
        if (isReviewedPublicCreatorProfile(profile)) creatorIdsByHandle.set(profile.handle, followedCreatorId);
      const reactionLookups = posts.flatMap((post, index) => {
        const postCreatorId = creatorIdsByHandle.get(post.handle);
        return postCreatorId ? [{
          index,
          reference: db.collection("creatorAccounts").doc(postCreatorId).collection("posts").doc(post.id).collection("reactions").doc(creatorId),
        }] : [];
      });
      const reactionSnapshots = reactionLookups.length
        ? await db.getAll(...reactionLookups.map(({ reference }) => reference))
        : [];
      const reactedPostIndexes = new Set(reactionSnapshots.flatMap((snapshot, lookupIndex) =>
        snapshot.exists ? [reactionLookups[lookupIndex]!.index] : []));
      postsWithViewerState = posts.map((post, index) => ({
        ...post,
        viewerReacted: reactedPostIndexes.has(index),
      }));
    }
    const notifications = notificationsSnapshot.docs.flatMap((document) => {
      const data = document.data();
      const createdAt = timestampMilliseconds(data.createdAt);
      if (createdAt === undefined) return [];
      const notification = creatorNotificationProjection(data, new Date(createdAt).toISOString());
      return notification ? [{ id: document.id, ...notification }] : [];
    });
    return { schemaVersion: 1, following, updates, posts: postsWithViewerState, notifications };
  },
);

/** Marks only the authenticated Creator's own notification documents as read. */
export const markMyLieuvaCreatorNotificationsRead = onCall(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", enforceAppCheck: true },
  async (request) => {
    const uid = requireAccount(request.auth);
    const owner = await db.collection("creatorAccountOwners").doc(uid).get();
    const creatorId = owner.data()?.creatorId;
    if (typeof creatorId !== "string") return { marked: 0 };

    const markAll = request.data?.all === true;
    const requestedIds = Array.isArray(request.data?.notificationIds)
      ? [...new Set(request.data.notificationIds)]
      : [];
    if (!markAll && (!requestedIds.length || requestedIds.length > 20 || requestedIds.some((id) => typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id))))
      throw new HttpsError("invalid-argument", "Choose up to 20 valid notifications.");

    const notificationCollection = db.collection("creatorNotifications").doc(creatorId).collection("items");
    if (markAll) {
      let marked = 0;
      while (true) {
        const unreadPage = await notificationCollection.where("read", "==", false).limit(400).get();
        if (unreadPage.empty) break;
        const batch = db.batch();
        for (const snapshot of unreadPage.docs) batch.set(snapshot.ref, {
          read: true,
          readAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        await batch.commit();
        marked += unreadPage.size;
        if (unreadPage.size < 400) break;
      }
      return { marked };
    }

    const snapshots = await Promise.all((requestedIds as string[]).map((id) => notificationCollection.doc(id).get()));
    const unread = snapshots.filter((snapshot) => snapshot.exists && snapshot.data()?.read !== true);
    if (!unread.length) return { marked: 0 };
    const batch = db.batch();
    for (const snapshot of unread) batch.set(snapshot.ref, {
      read: true,
      readAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await batch.commit();
    return { marked: unread.length };
  },
);

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
      permits, unsubscribeTokens, verificationLimit, creatorOwner, submittedReports] = await Promise.all([
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
      db.collection("creatorAccountOwners").doc(uid).get(),
      db.collection("creatorReports").where("reporterAccountId", "==", uid).get(),
    ]);
    const creatorId = creatorOwner.data()?.creatorId;
    const [creatorProfile, creatorAccount, creatorHandles, creatorPosts, creatorFollowing, creatorFollowers,
      creatorBlocks, creatorReports, creatorComments, creatorReactions, creatorNotifications] = typeof creatorId === "string"
      ? await Promise.all([
          db.collection("creatorProfiles").doc(creatorId).get(),
          db.collection("creatorAccounts").doc(creatorId).get(),
          db.collection("creatorHandles").where("creatorId", "==", creatorId).get(),
          db.collection("creatorAccounts").doc(creatorId).collection("posts").orderBy("createdAt", "asc").get(),
          db.collection("creatorFollows").where("followerCreatorId", "==", creatorId).get(),
          db.collection("creatorFollows").where("followedCreatorId", "==", creatorId).get(),
          db.collection("creatorBlocks").where("blockerCreatorId", "==", creatorId).get(),
          db.collection("creatorReports").where("reporterCreatorId", "==", creatorId).get(),
          db.collectionGroup("comments").where("authorCreatorId", "==", creatorId).get(),
          db.collectionGroup("reactions").where("creatorId", "==", creatorId).get(),
          db.collection("creatorNotifications").doc(creatorId).collection("items").orderBy("createdAt", "asc").get(),
        ])
      : [undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined];
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
      submittedModerationReports: submittedReports.docs.map((report) => ({
        id: report.id,
        ...report.data(),
      })),
      operationalState: {
        pendingPublicationPermits: permits.size,
        newsletterUnsubscribeRecords: unsubscribeTokens.size,
        verificationRateLimitRecord: verificationLimit.exists,
      },
      ...(creatorProfile?.exists ? { creatorIdentity: {
        publicProfile: creatorProfile.data(),
        currentHandle: creatorAccount?.data()?.currentHandle ?? null,
        aliases: creatorHandles?.docs
          .filter((handle) => handle.data().kind === "alias")
          .map((handle) => handle.id) ?? [],
        posts: creatorPosts?.docs.map((post) => ({ id: post.id, ...post.data() })) ?? [],
        following: creatorFollowing?.docs.map((follow) => follow.data()) ?? [],
        followerCount: creatorFollowers?.size ?? 0,
        blocks: creatorBlocks?.docs.map((block) => ({ id: block.id, ...block.data() })) ?? [],
        reports: creatorReports?.docs.map((report) => ({ id: report.id, ...report.data() })) ?? [],
        comments: creatorComments?.docs.map((comment) => ({ path: comment.ref.path, ...comment.data() })) ?? [],
        reactions: creatorReactions?.docs.map((reaction) => ({ path: reaction.ref.path, ...reaction.data() })) ?? [],
        notifications: creatorNotifications?.docs.map((notification) => ({ id: notification.id, ...notification.data() })) ?? [],
      } } : {}),
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
      const [owned, memberships, ownedInvites, receivedInvites, permits, tokens, queuedMail, creatorOwner,
        accountReportsMade] = await Promise.all([
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
        db.collection("creatorAccountOwners").doc(uid).get(),
        db.collection("creatorReports").where("reporterAccountId", "==", uid).get(),
      ]);
      const creatorId = creatorOwner.data()?.creatorId;
      const creatorHandles = typeof creatorId === "string"
        ? await db.collection("creatorHandles").where("creatorId", "==", creatorId).get()
        : undefined;
      const [creatorFollowers, creatorFollowing, creatorPosts, creatorBlocksOut, creatorBlocksIn,
        creatorReportsMade, creatorReportsAgainst, creatorComments, creatorReactions, creatorNotificationActors] = typeof creatorId === "string"
        ? await Promise.all([
            db.collection("creatorFollows").where("followedCreatorId", "==", creatorId).get(),
            db.collection("creatorFollows").where("followerCreatorId", "==", creatorId).get(),
            db.collection("creatorAccounts").doc(creatorId).collection("posts").get(),
            db.collection("creatorBlocks").where("blockerCreatorId", "==", creatorId).get(),
            db.collection("creatorBlocks").where("blockedCreatorId", "==", creatorId).get(),
            db.collection("creatorReports").where("reporterCreatorId", "==", creatorId).get(),
            db.collection("creatorReports").where("targetCreatorId", "==", creatorId).get(),
            db.collectionGroup("comments").where("authorCreatorId", "==", creatorId).get(),
            db.collectionGroup("reactions").where("creatorId", "==", creatorId).get(),
            db.collectionGroup("items").where("actorCreatorId", "==", creatorId).get(),
          ])
        : [undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined];
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
          { ref: db.collection("creatorAccountOwners").doc(uid) },
          ...(typeof creatorId === "string" ? [
            { ref: db.collection("creatorAccounts").doc(creatorId) },
            { ref: db.collection("creatorProfiles").doc(creatorId) },
            { ref: db.collection("creatorNotifications").doc(creatorId) },
          ] : []),
          ...(creatorHandles?.docs ?? []),
          ...(creatorPosts?.docs ?? []),
          ...uniqueDocumentPaths([
            ...(creatorFollowers?.docs ?? []),
            ...(creatorFollowing?.docs ?? []),
            ...(creatorBlocksOut?.docs ?? []),
            ...(creatorBlocksIn?.docs ?? []),
            ...(creatorReportsMade?.docs ?? []),
            ...(creatorReportsAgainst?.docs ?? []),
            ...accountReportsMade.docs,
            ...(creatorComments?.docs ?? []),
            ...(creatorReactions?.docs ?? []),
            ...(creatorNotificationActors?.docs ?? []),
          ]).map((path) => ({ ref: db.doc(path) })),
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
          if (typeof creatorId === "string")
            await getStorage().bucket().deleteFiles({ prefix: `creator-public/${creatorId}/`, force: true });
        },
        removeLinkedDocument: async (path) => {
          if (typeof creatorId === "string" && (
            path === `creatorAccounts/${creatorId}` || path === `creatorNotifications/${creatorId}`
          )) await db.recursiveDelete(db.doc(path));
          else await db.doc(path).delete();
        },
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
      if (action === "distribution") {
        const exploreListed = request.data?.exploreListed;
        const creatorProfileListed = request.data?.creatorProfileListed;
        if (typeof exploreListed !== "boolean" || typeof creatorProfileListed !== "boolean")
          throw new HttpsError("invalid-argument", "Invalid Space placement settings.");
        transaction.update(galleryReference, {
          exploreListed,
          creatorProfileListed,
        });
        return;
      }
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
          // Returning protected content to Public requires a fresh operator
          // review. Repeating Public on an already-public Space is a no-op.
          ...(visibility === "public" && data.visibility !== "public"
            ? { discoverEligible: false }
            : {}),
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
  { region: REGION, timeoutSeconds: 30, enforceAppCheck: true },
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
  { region: REGION, timeoutSeconds: 30, enforceAppCheck: true },
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
    const startedAt = Date.now();
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
      logOperation("space_document", "success", startedAt, { resourceRef: safeResourceRef(spaceId), delivery: delivery.kind });
    } catch (error) {
      delivery = { kind: "temporary-error", ...(spaceId ? { id: spaceId } : {}) };
      const metadata = metadataForSpace(delivery);
      response.set("Cache-Control", cacheControlForSpace(delivery));
      response.set("X-Robots-Tag", metadata.robots);
      response.status(503).send(genericErrorShell(delivery));
      logOperation("space_document", "failure", startedAt, { resourceRef: safeResourceRef(spaceId), errorClass: classifyServerError(error) });
    }
  },
);

/** Server-rendered Creator route. Aliases redirect to one canonical handle and
 * non-public profiles return generic, noindex HTML. */
export const creatorDocument = onRequest(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", invoker: "public" },
  async (request, response) => {
    const startedAt = Date.now();
    response.set("Content-Type", "text/html; charset=utf-8");
    response.set("X-Content-Type-Options", "nosniff");
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.set("Allow", "GET, HEAD");
      response.status(405).send("Method not allowed");
      return;
    }
    const route = classifyCreatorDocumentRoute(request.path);
    try {
      if (route.kind === "hub") {
        response.set("Cache-Control", "private, no-store, max-age=0");
        response.set("X-Robots-Tag", "noindex,nofollow,noarchive");
        response.status(200).send(renderCreatorHubDocument(generatedAppShell()));
        logOperation("creator_document", "success", startedAt, { delivery: "hub" });
        return;
      }
      if (route.kind === "directory") {
        response.set("Cache-Control", "public, max-age=0, s-maxage=60, must-revalidate");
        response.set("X-Robots-Tag", "index,follow,max-image-preview:large");
        response.status(200).send(renderCreatorDirectoryDocument(generatedAppShell()));
        logOperation("creator_document", "success", startedAt, { delivery: "directory" });
        return;
      }
      if (route.kind === "malformed") {
        response.set("Cache-Control", "private, no-store, max-age=0");
        response.set("X-Robots-Tag", "noindex,nofollow,noarchive");
        response.status(404).send(request.path.startsWith("/creator-hub/")
          ? renderCreatorHubDocument(generatedAppShell())
          : renderCreatorDocument(generatedAppShell(), { kind: "not-found" }));
        logOperation("creator_document", "success", startedAt, { delivery: "not-found" });
        return;
      }
      const requestedHandle = route.handle;
      const delivery = await creatorDeliveryForHandle(requestedHandle);
      if (delivery.kind === "public" && requestedHandle !== delivery.profile.handle) {
        response.set("Cache-Control", "public, max-age=0, s-maxage=60, must-revalidate");
        response.redirect(301, creatorCanonicalUrl(delivery.profile.handle));
        return;
      }
      response.set("Cache-Control", delivery.kind === "public"
        ? "public, max-age=0, s-maxage=60, must-revalidate"
        : "private, no-store, max-age=0");
      response.set("X-Robots-Tag", delivery.kind === "public"
        ? "index,follow,max-image-preview:large"
        : "noindex,nofollow,noarchive");
      response.status(delivery.kind === "public" ? 200 : 404)
        .send(renderCreatorDocument(generatedAppShell(), delivery));
      logOperation("creator_document", "success", startedAt, { delivery: delivery.kind });
    } catch (error) {
      const delivery: CreatorDelivery = { kind: "temporary-error" };
      response.set("Cache-Control", "private, no-store, max-age=0");
      response.set("X-Robots-Tag", "noindex,nofollow,noarchive");
      response.status(503).send(renderCreatorDocument(generatedAppShell(), delivery));
      logOperation("creator_document", "failure", startedAt, { errorClass: classifyServerError(error) });
    }
  },
);

/** Narrow public JSON projection consumed by the lightweight Creator page. */
export const creatorProfileData = onRequest(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", invoker: "public" },
  async (request, response) => {
    response.set("Content-Type", "application/json; charset=utf-8");
    response.set("X-Content-Type-Options", "nosniff");
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.set("Allow", "GET, HEAD");
      response.status(405).json({ error: "method-not-allowed" });
      return;
    }
    const handle = requestRouteValue(request.path, "creator-profiles", ".json");
    try {
      const delivery = await creatorDeliveryForHandle(handle);
      const payload = publicCreatorPayload(delivery);
      if (!payload) {
        response.set("Cache-Control", "private, no-store, max-age=0");
        response.status(404).json({ error: "not-found" });
        return;
      }
      response.set("Cache-Control", "public, max-age=0, s-maxage=60, must-revalidate");
      response.status(200).json(payload);
    } catch {
      response.set("Cache-Control", "private, no-store, max-age=0");
      response.status(503).json({ error: "temporary-error" });
    }
  },
);

/** Public, minimal Creator directory used by the shared Space/Creator search.
 * Private profiles and internal Creator/account identifiers never leave this boundary. */
export const creatorDirectoryData = onRequest(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", invoker: "public" },
  async (request, response) => {
    response.set("Content-Type", "application/json; charset=utf-8");
    response.set("X-Content-Type-Options", "nosniff");
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.set("Allow", "GET, HEAD");
      response.status(405).json({ error: "method-not-allowed" });
      return;
    }
    try {
      const snapshot = await db.collection("creatorProfiles")
        .where("profilePublic", "==", true)
        .where("discoverEligible", "==", true)
        .select("handle", "displayName", "bio", "links", "profilePublic", "discoverEligible", "imagePresent", "coverPresent", "bioFont", "profileTone", "followerCount")
        .limit(500)
        .get();
      const creators = snapshot.docs
        .flatMap((document) => {
          const entry = publicCreatorDirectoryEntry(document.data());
          return entry ? [entry] : [];
        })
        .sort((left, right) => left.displayName.localeCompare(right.displayName));
      response.set("Cache-Control", "public, max-age=0, s-maxage=60, must-revalidate");
      response.status(200).json({ schemaVersion: 1, creators });
    } catch {
      response.set("Cache-Control", "private, no-store, max-age=0");
      response.status(503).json({ error: "temporary-error" });
    }
  },
);

/** Public image proxy. It checks current profile visibility before serving and
 * never discloses the backing object path. */
export const creatorImage = onRequest(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", invoker: "public" },
  async (request, response) => {
    response.set("X-Content-Type-Options", "nosniff");
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.set("Allow", "GET, HEAD");
      response.status(405).send("Method not allowed");
      return;
    }
    const handle = requestRouteValue(request.path, "creator-images", ".webp");
    try {
      const normalized = normalizeCreatorHandle(handle);
      if (!normalized) throw new Error("not-found");
      const handleSnapshot = await db.collection("creatorHandles").doc(normalized).get();
      const creatorId = handleSnapshot.data()?.creatorId;
      if (typeof creatorId !== "string") throw new Error("not-found");
      const profile = parseCreatorProfileInput((await db.collection("creatorProfiles").doc(creatorId).get()).data());
      if (!isReviewedPublicCreatorProfile(profile) || !profile.imagePresent) throw new Error("not-found");
      const [bytes] = await getStorage().bucket().file(`creator-public/${creatorId}/avatar.webp`).download();
      response.set("Content-Type", "image/webp");
      response.set("Cache-Control", "public, max-age=0, s-maxage=60, must-revalidate");
      response.status(200).send(request.method === "HEAD" ? undefined : bytes);
    } catch {
      response.set("Cache-Control", "private, no-store");
      response.status(404).send("Not found");
    }
  },
);

/** Public cover proxy. It checks profile visibility before serving title art. */
export const creatorCover = onRequest(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", invoker: "public" },
  async (request, response) => {
    response.set("X-Content-Type-Options", "nosniff");
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.set("Allow", "GET, HEAD");
      response.status(405).send("Method not allowed");
      return;
    }
    const handle = requestRouteValue(request.path, "creator-covers", ".webp");
    try {
      const normalized = normalizeCreatorHandle(handle);
      if (!normalized) throw new Error("not-found");
      const handleSnapshot = await db.collection("creatorHandles").doc(normalized).get();
      const creatorId = handleSnapshot.data()?.creatorId;
      if (typeof creatorId !== "string") throw new Error("not-found");
      const profile = parseCreatorProfileInput((await db.collection("creatorProfiles").doc(creatorId).get()).data());
      if (!isReviewedPublicCreatorProfile(profile) || !profile.coverPresent) throw new Error("not-found");
      const [bytes] = await getStorage().bucket().file(`creator-public/${creatorId}/cover.webp`).download();
      response.set("Content-Type", "image/webp");
      response.set("Cache-Control", "public, max-age=0, s-maxage=60, must-revalidate");
      response.status(200).send(request.method === "HEAD" ? undefined : bytes);
    } catch {
      response.set("Cache-Control", "private, no-store");
      response.status(404).send("Not found");
    }
  },
);

/** Gallery attribution is resolved server-side so public UI never derives a
 * Creator URL from an owner UID. */
export const creatorAttribution = onRequest(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", invoker: "public" },
  async (request, response) => {
    response.set("Content-Type", "application/json; charset=utf-8");
    response.set("X-Content-Type-Options", "nosniff");
    const spaceId = requestRouteValue(request.path, "creator-attributions", ".json");
    if ((request.method !== "GET" && request.method !== "HEAD") || !spaceId) {
      response.status(request.method === "GET" || request.method === "HEAD" ? 404 : 405).json({ error: "not-found" });
      return;
    }
    try {
      const gallery = await publicDeliveryManifest(spaceId);
      const delivery = classifySpaceForDelivery(spaceId, gallery);
      const ownerId = gallery?.ownerId;
      if (delivery.kind !== "public" || !delivery.indexEligible || typeof ownerId !== "string")
        throw new Error("not-public");
      const owner = await db.collection("creatorAccountOwners").doc(ownerId).get();
      const creatorId = owner.data()?.creatorId;
      if (typeof creatorId !== "string") throw new Error("no-creator");
      const profileSnapshot = await db.collection("creatorProfiles").doc(creatorId).get();
      const profile = parseCreatorProfileInput(profileSnapshot.data());
      if (!isReviewedPublicCreatorProfile(profile)) throw new Error("private-creator");
      response.set("Cache-Control", "public, max-age=0, s-maxage=60, must-revalidate");
      response.status(200).json({
        schemaVersion: 1,
        displayName: profile.displayName,
        handle: profile.handle,
        profileUrl: creatorCanonicalUrl(profile.handle),
      });
    } catch {
      response.set("Cache-Control", "private, no-store, max-age=0");
      response.status(404).json({ error: "not-found" });
    }
  },
);

/** Public cover proxy. Storage paths and protected Space media never enter metadata. */
export const spaceCard = onRequest(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", invoker: "public" },
  async (request, response) => {
    const startedAt = Date.now();
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
        logOperation("space_card", "rejected", startedAt, { resourceRef: safeResourceRef(spaceId), delivery: delivery.kind });
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
      logOperation("space_card", "success", startedAt, { resourceRef: safeResourceRef(spaceId), delivery: "public" });
    } catch (error) {
      response.set("Cache-Control", "private, no-store, max-age=0");
      response.status(404).send("Not found");
      logOperation("space_card", "failure", startedAt, { resourceRef: safeResourceRef(spaceId), errorClass: classifyServerError(error) });
    }
  },
);

/** Canonical, public-only sitemap generated from the current publication state. */
export const spaceSitemap = onRequest(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", invoker: "public" },
  async (request, response) => {
    const startedAt = Date.now();
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
          .where("discoverEligible", "==", true)
          .where("expiresAt", ">", expiryFloor)
          .orderBy("expiresAt", "desc")
          .limit(500)
          .select(...publicDeliveryFields)
          .get(),
        db.collection("galleries")
          .where("schemaVersion", "in", [1, 2])
          .where("discoverEligible", "==", true)
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
      const creatorProfiles = await db.collection("creatorProfiles")
        .where("profilePublic", "==", true)
        .where("discoverEligible", "==", true)
        .limit(500)
        .get();
      const creators = creatorProfiles.docs.flatMap((document) => {
        const profile = parseCreatorProfileInput(document.data());
        if (!isReviewedPublicCreatorProfile(profile)) return [];
        const updated = timestampMilliseconds(document.data().updatedAt);
        return [{
          handle: profile.handle,
          ...(updated !== undefined ? { updatedAt: new Date(updated).toISOString() } : {}),
        }];
      });
      response.set("Cache-Control", "public, max-age=0, s-maxage=60, must-revalidate");
      response.status(200).send(renderPublicSitemap(spaces, creators));
      logOperation("space_sitemap", "success", startedAt, { count: spaces.length + creators.length });
    } catch (error) {
      response.set("Cache-Control", "private, no-store, max-age=0");
      response.set("X-Robots-Tag", "noindex");
      response.status(503).send(renderPublicSitemap([]));
      logOperation("space_sitemap", "failure", startedAt, { errorClass: classifyServerError(error) });
    }
  },
);
