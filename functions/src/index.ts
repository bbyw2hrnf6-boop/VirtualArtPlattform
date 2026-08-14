import { createHash, randomBytes } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { defineString } from "firebase-functions/params";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import {
  verificationMail,
  welcomeMail,
  type AuraMailBrand,
} from "./emailTemplates.js";

if (!getApps().length) initializeApp();

const REGION = "europe-west1";
const PUBLIC_APP_URL = defineString("AURA_PUBLIC_APP_URL", {
  default: "https://bbyw2hrnf6-boop.github.io/VirtualArtPlattform",
  description: "Public AURA URL without a trailing slash.",
});
const REPLY_TO = defineString("AURA_REPLY_TO", {
  description: "Public support/reply-to email shown in AURA emails.",
});
const LEGAL_FOOTER = defineString("AURA_LEGAL_FOOTER", {
  description: "Legal sender name and postal address shown in marketing emails.",
});

const db = getFirestore();
const sources = new Set(["email-create", "email-signin", "google-create", "google-signin", "account-settings"]);

function brand(): AuraMailBrand {
  return {
    appUrl: PUBLIC_APP_URL.value().replace(/\/$/, ""),
    replyTo: REPLY_TO.value(),
    legalFooter: LEGAL_FOOTER.value(),
  };
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
