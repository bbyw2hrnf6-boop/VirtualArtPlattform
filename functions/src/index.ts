import { createHash, randomBytes } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
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

if (!getApps().length) initializeApp();

const REGION = "europe-west1";
const PUBLIC_APP_URL = defineString("AURA_PUBLIC_APP_URL", {
  default: "https://bbyw2hrnf6-boop.github.io/VirtualArtPlattform",
  description: "Public AURA URL without a trailing slash.",
});
const REPLY_TO = defineString("AURA_REPLY_TO", {
  default: "not-configured@invalid.example",
  description: "Public support/reply-to email shown in AURA emails.",
});
const LEGAL_FOOTER = defineString("AURA_LEGAL_FOOTER", {
  default: "AURA preview — legal sender details not configured",
  description: "Legal sender name and postal address shown in marketing emails.",
});

const db = getFirestore();
const sources = new Set(["email-create", "email-signin", "google-create", "google-signin", "account-settings"]);
const galleryVisibilities = new Set<string>(GALLERY_VISIBILITIES);
const galleryLifecycleActions = new Set(["archive", "restore", "renew", "trash", "visibility"]);
const galleryRoles = new Set(["viewer", "editor"]);

function brand(): AuraMailBrand {
  return {
    appUrl: PUBLIC_APP_URL.value().replace(/\/$/, ""),
    replyTo: REPLY_TO.value(),
    legalFooter: LEGAL_FOOTER.value(),
  };
}

function requireMailConfiguration() {
  if (REPLY_TO.value().endsWith("@invalid.example") || LEGAL_FOOTER.value().includes("not configured"))
    throw new HttpsError("failed-precondition", "AURA email delivery is not configured yet.");
}

function requireAccount(auth: { uid: string; token: Record<string, unknown> } | undefined) {
  const firebaseClaims = auth?.token.firebase;
  const provider = firebaseClaims && typeof firebaseClaims === "object"
    ? (firebaseClaims as { sign_in_provider?: string }).sign_in_provider
    : undefined;
  if (!auth || provider === "anonymous")
    throw new HttpsError("unauthenticated", "Use an email or Google account.");
  return auth.uid;
}

function requireSignedIn(auth: { uid: string; token: Record<string, unknown> } | undefined) {
  if (!auth) throw new HttpsError("unauthenticated", "Sign in before changing a room.");
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
  if (!id) throw new HttpsError("invalid-argument", "Invalid gallery id.");
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

/**
 * Server-issued publication permits close the unbounded direct-upload path.
 * Storage and Firestore Rules both require this short-lived permit, while the
 * quota document makes concurrent guest attempts transactional.
 */
export const beginAuraGalleryPublication = onCall(
  { region: REGION, timeoutSeconds: 30, enforceAppCheck: true },
  async (request) => {
    const uid = requireSignedIn(request.auth);
    const galleryId = galleryIdFrom(request.data?.galleryId);
    const visibility = request.data?.visibility;
    if (typeof visibility !== "string" || !galleryVisibilities.has(visibility))
      throw new HttpsError("invalid-argument", "Invalid room visibility.");
    const verified = verifiedAccount(request.auth);
    const now = Date.now();
    const terms = publicationTerms(verified, visibility as GalleryVisibility, now);
    if (!terms)
      throw new HttpsError("failed-precondition", "Guest rooms must be public.");
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
            .where("expiresAt", ">", new Date(now))
            .limit(verified ? 30 : 1),
        ),
      ]);
      if (existingGallery.exists || existingPermit.exists)
        throw new HttpsError("already-exists", "This publication id is already in use.");
      const data = quota.data() ?? {};
      if (!verified) {
        if (!activeRooms.empty)
          throw new HttpsError(
            "resource-exhausted",
            "This guest account already has a live room. Create an account to manage more rooms.",
          );
        const guestLockedUntil = data.guestLockedUntil?.toMillis?.() ?? 0;
        if (guestLockedUntil > now)
          throw new HttpsError(
            "resource-exhausted",
            "This guest account already has a live room. Create an account to manage more rooms.",
          );
        transaction.set(quotaReference, {
          guestGalleryId: galleryId,
          guestLockedUntil: permitExpiresAt,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      } else {
        if (activeRooms.size >= 30)
          throw new HttpsError("resource-exhausted", "Archive or remove a live room before publishing another.");
        const day = new Date(now).toISOString().slice(0, 10);
        const dailyCount = data.day === day ? Number(data.dailyCount ?? 0) : 0;
        if (dailyCount >= 20)
          throw new HttpsError("resource-exhausted", "Daily publication limit reached. Try again tomorrow.");
        transaction.set(quotaReference, {
          day,
          dailyCount: dailyCount + 1,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
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
      throw new HttpsError("failed-precondition", "A published room cannot be aborted.");
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
      throw new HttpsError("invalid-argument", "Invalid room action.");
    const visibility = request.data?.visibility;
    const galleryReference = db.collection("galleries").doc(galleryId);
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(galleryReference);
      if (!snapshot.exists) throw new HttpsError("not-found", "This room no longer exists.");
      const data = snapshot.data()!;
      if (data.ownerId !== uid)
        throw new HttpsError("permission-denied", "Only the room owner can change its lifecycle.");
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
        if (status !== "trashed") throw new HttpsError("failed-precondition", "This room is not in Trash.");
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
        throw new HttpsError("failed-precondition", "Use a verified account for this room action.");
      if (status === "trashed")
        throw new HttpsError("failed-precondition", "Restore this room before changing it.");
      if (action === "archive") {
        transaction.update(galleryReference, {
          lifecycleStatus: status === "archived" ? "active" : "archived",
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else if (action === "renew") {
        if (data.retention !== "account-preview")
          throw new HttpsError("failed-precondition", "Guest rooms cannot be renewed.");
        transaction.update(galleryReference, {
          expiresAt: new Date(Date.now() + 365 * 86_400_000),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        if (typeof visibility !== "string" || !galleryVisibilities.has(visibility))
          throw new HttpsError("invalid-argument", "Invalid room visibility.");
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
    if (data.ownerId !== uid) throw new HttpsError("permission-denied", "Only the room owner can purge it.");
    if (data.lifecycleStatus !== "trashed")
      throw new HttpsError("failed-precondition", "Move the room to Trash first.");
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
      throw new HttpsError("invalid-argument", "Invalid room role.");
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
      if (!gallery.exists) throw new HttpsError("not-found", "This room no longer exists.");
      if (gallery.data()?.ownerId !== uid)
        throw new HttpsError("permission-denied", "Only the room owner can invite collaborators.");
      if ((gallery.data()?.lifecycleStatus ?? "active") === "trashed")
        throw new HttpsError("failed-precondition", "Restore the room before inviting collaborators.");
      if (!invite.exists && ownerInvites.docs.filter((item) => item.data().status === "pending").length >= 50)
        throw new HttpsError("resource-exhausted", "Resolve an existing invitation before adding another.");
      transaction.set(inviteReference, {
        galleryId,
        galleryTitle: String(gallery.data()?.title ?? "AURA room").slice(0, 100),
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
        throw new HttpsError("failed-precondition", "This room is not currently available.");
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
      throw new HttpsError("permission-denied", "Only the room owner can revoke access.");
    await Promise.all([
      galleryReference.collection("members").doc(email).delete(),
      db.collection("galleryInvites").doc(inviteIdFor(galleryId, email)).delete(),
    ]);
    return { status: "removed" };
  },
);

async function queueMail(to: string, mail: { subject: string; text: string; html: string }) {
  await db.collection("mail").add({
    to: [to],
    message: mail,
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
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Newsletter preference | AURA</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#151613;color:#efeee8;font-family:Arial,sans-serif"><main style="width:min(560px,calc(100% - 48px));padding:42px;background:#efeee8;color:#1b1c19"><p style="font-size:10px;letter-spacing:2px;text-transform:uppercase">AURA account</p><h1 style="font:48px/1 Georgia,serif">You are in control.</h1><p style="color:#63655d;line-height:1.7">${message}</p><a href="${appUrl}" style="display:inline-block;margin-top:18px;padding:15px 20px;background:#1b1c19;color:#fff;text-decoration:none;font-size:11px;text-transform:uppercase;letter-spacing:1px">Return to AURA →</a></main></body></html>`;
}

export const unsubscribeAuraNewsletter = onRequest(
  { region: REGION, timeoutSeconds: 30 },
  async (request, response) => {
    try {
      requireMailConfiguration();
    } catch {
      response.status(503).send("AURA email preferences are not configured yet.");
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
      ? "You will no longer receive AURA product letters. Your account and rooms stay untouched."
      : "This preference was already handled. Your account and rooms stay untouched."));
  },
);
