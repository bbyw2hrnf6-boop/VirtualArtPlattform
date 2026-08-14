import {
  EmailAuthProvider,
  GoogleAuthProvider,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  linkWithCredential,
  linkWithPopup,
  onIdTokenChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import {
  deleteObject,
  getBlob,
  ref,
  uploadBytes,
} from "firebase/storage";
import {
  firebaseAuth,
  firebaseDb,
  firebaseFunctions,
  firebaseStorage,
} from "./firebase";
import type { AccountSession } from "./accountTypes";

let persistenceReady: Promise<void> | undefined;
const avatarObjectUrls = new Map<string, string>();
const MAX_AVATAR_BYTES = 512 * 1024;

type AccountProfileInput = {
  displayName: string;
  nickname: string;
  avatar?: File;
  removeAvatar?: boolean;
};

export type NewsletterSource =
  | "email-create"
  | "email-signin"
  | "google-create"
  | "google-signin"
  | "account-settings";

function ensurePersistence() {
  persistenceReady ??= setPersistence(firebaseAuth, browserLocalPersistence);
  return persistenceReady;
}

function sessionFromUser(user: User | null): AccountSession | null {
  if (!user) return null;
  return {
    uid: user.uid,
    ...(user.email ? { email: user.email } : {}),
    ...(user.displayName ? { displayName: user.displayName } : {}),
    isAnonymous: user.isAnonymous,
    emailVerified: user.emailVerified,
    providers: user.providerData.map((provider) => provider.providerId),
  };
}

function profileString(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

async function avatarSource(path: string) {
  const cached = avatarObjectUrls.get(path);
  if (cached) return cached;
  const blob = await getBlob(ref(firebaseStorage, path), MAX_AVATAR_BYTES);
  const source = URL.createObjectURL(blob);
  avatarObjectUrls.set(path, source);
  return source;
}

export async function hydrateAccountSession(
  session: AccountSession | null,
): Promise<AccountSession | null> {
  if (!session || session.isAnonymous) return session;
  const [profileResult, newsletterResult] = await Promise.allSettled([
    getDoc(doc(firebaseDb, "profiles", session.uid)),
    getDoc(doc(firebaseDb, "newsletterSubscriptions", session.uid)),
  ]);
  const snapshot = profileResult.status === "fulfilled"
    ? profileResult.value
    : undefined;
  const newsletter = newsletterResult.status === "fulfilled"
    ? newsletterResult.value
    : undefined;
  const data = snapshot?.data() ?? {};
  const displayName = profileString(data.displayName, 60);
  const nickname = profileString(data.nickname, 32);
  const avatarPath = profileString(data.avatarPath, 180);
  let avatarSrc: string | undefined;
  if (avatarPath) {
    try {
      avatarSrc = await avatarSource(avatarPath);
    } catch (error) {
      console.warn("Account avatar unavailable.", error);
    }
  }
  return {
    ...session,
    ...(displayName ? { displayName } : {}),
    ...(nickname ? { nickname } : {}),
    ...(avatarPath ? { avatarPath } : {}),
    ...(avatarSrc ? { avatarSrc } : {}),
    ...(newsletter?.exists()
      ? { newsletterSubscribed: newsletter.data().status === "subscribed" }
      : {}),
  };
}

export function normalizeAccountProfile(input: Pick<AccountProfileInput, "displayName" | "nickname">) {
  const displayName = input.displayName.trim().replace(/\s+/g, " ");
  const nickname = input.nickname.trim();
  if (!displayName || displayName.length > 60)
    throw new Error("Use a profile name between 1 and 60 characters.");
  if (
    nickname.length > 32 ||
    (nickname && !/^[A-Za-z0-9._-]+$/.test(nickname))
  )
    throw new Error("Nickname may use letters, numbers, dots, dashes, and underscores.");
  return { displayName, nickname };
}

async function prepareAvatar(file: File) {
  if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024)
    throw new Error("Choose a JPG, PNG, WebP, or AVIF image under 10 MB.");
  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = source;
    await image.decode();
    const edge = Math.min(image.naturalWidth, image.naturalHeight);
    if (!edge) throw new Error("The profile image could not be read.");
    const size = Math.min(512, edge);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The profile image could not be prepared.");
    context.drawImage(
      image,
      Math.round((image.naturalWidth - edge) / 2),
      Math.round((image.naturalHeight - edge) / 2),
      edge,
      edge,
      0,
      0,
      size,
      size,
    );
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.82),
    );
    if (!blob || blob.size > MAX_AVATAR_BYTES)
      throw new Error("The profile image could not be compressed enough.");
    return blob;
  } finally {
    URL.revokeObjectURL(source);
  }
}

export async function saveAccountProfile(input: AccountProfileInput) {
  await ensurePersistence();
  await firebaseAuth.authStateReady();
  const user = firebaseAuth.currentUser;
  if (!user || user.isAnonymous || !user.emailVerified)
    throw new Error("Use a verified account to update your profile.");
  const profile = normalizeAccountProfile(input);
  const avatarPath = `profiles/${user.uid}/avatar.webp`;
  const existing = await getDoc(doc(firebaseDb, "profiles", user.uid));
  const existingAvatar = profileString(existing.data()?.avatarPath, 180);
  let keepAvatar = Boolean(existingAvatar);
  if (input.avatar) {
    const avatar = await prepareAvatar(input.avatar);
    await uploadBytes(ref(firebaseStorage, avatarPath), avatar, {
      contentType: "image/webp",
      customMetadata: { ownerId: user.uid, kind: "avatar", schemaVersion: "1" },
    });
    keepAvatar = true;
  } else if (input.removeAvatar && existingAvatar) {
    await deleteObject(ref(firebaseStorage, existingAvatar)).catch((error) => {
      if (
        !(
          typeof error === "object" &&
          error &&
          "code" in error &&
          String(error.code).includes("object-not-found")
        )
      )
        throw error;
    });
    keepAvatar = false;
  }
  const cached = avatarObjectUrls.get(avatarPath);
  if (cached) URL.revokeObjectURL(cached);
  avatarObjectUrls.delete(avatarPath);
  await setDoc(doc(firebaseDb, "profiles", user.uid), {
    uid: user.uid,
    displayName: profile.displayName,
    nickname: profile.nickname,
    ...(keepAvatar ? { avatarPath } : {}),
    schemaVersion: 1,
    updatedAt: serverTimestamp(),
  });
  await updateProfile(user, { displayName: profile.displayName });
  await user.getIdToken(true);
  return hydrateAccountSession(sessionFromUser(user));
}

export async function currentAccountSession() {
  await ensurePersistence();
  await firebaseAuth.authStateReady();
  return sessionFromUser(firebaseAuth.currentUser);
}

export function subscribeAccount(
  listener: (session: AccountSession | null) => void,
) {
  void ensurePersistence();
  return onIdTokenChanged(firebaseAuth, (user) => listener(sessionFromUser(user)));
}

export async function createOrUpgradeEmailAccount(
  email: string,
  password: string,
  displayName?: string,
) {
  await ensurePersistence();
  await firebaseAuth.authStateReady();
  const normalizedEmail = email.trim().toLowerCase();
  const credential = EmailAuthProvider.credential(normalizedEmail, password);
  const current = firebaseAuth.currentUser;
  const result = current
    ? await linkWithCredential(current, credential)
    : await createUserWithEmailAndPassword(
        firebaseAuth,
        normalizedEmail,
        password,
      );
  const normalizedName = displayName?.trim().replace(/\s+/g, " ");
  if (normalizedName) {
    if (normalizedName.length > 60)
      throw new Error("Use a name with no more than 60 characters.");
    await updateProfile(result.user, { displayName: normalizedName });
  }
  if (!result.user.emailVerified) await requestAuraVerification(result.user);
  return sessionFromUser(result.user);
}

function actionCodeSettings() {
  const base = `${window.location.origin}${window.location.pathname}`;
  return { url: `${base}#/create`, handleCodeInApp: false };
}

async function requestAuraVerification(user: User) {
  firebaseAuth.useDeviceLanguage();
  try {
    await httpsCallable(firebaseFunctions, "sendAuraVerificationEmail")();
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error
      ? String(error.code).toLowerCase()
      : "";
    if (!code.includes("not-found") && !code.includes("unimplemented"))
      throw error;
    console.warn("Branded verification function is not deployed; using Firebase fallback.");
    await sendEmailVerification(user, actionCodeSettings());
  }
}

export async function setNewsletterPreference(
  subscribed: boolean,
  source: NewsletterSource,
) {
  const result = await httpsCallable<
    { subscribed: boolean; source: NewsletterSource },
    { status: "subscribed" | "unsubscribed"; welcomeQueued: boolean }
  >(firebaseFunctions, "setAuraNewsletterPreference")({ subscribed, source });
  return result.data;
}

export async function signInEmailAccount(email: string, password: string) {
  await ensurePersistence();
  const result = await signInWithEmailAndPassword(
    firebaseAuth,
    email.trim().toLowerCase(),
    password,
  );
  return sessionFromUser(result.user);
}

export async function createOrUpgradeGoogleAccount() {
  await ensurePersistence();
  await firebaseAuth.authStateReady();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const current = firebaseAuth.currentUser;
  const result = current
    ? await linkWithPopup(current, provider)
    : await signInWithPopup(firebaseAuth, provider);
  return sessionFromUser(result.user);
}

export async function signInGoogleAccount() {
  await ensurePersistence();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const result = await signInWithPopup(firebaseAuth, provider);
  return sessionFromUser(result.user);
}

export async function refreshAccount() {
  await firebaseAuth.authStateReady();
  if (!firebaseAuth.currentUser) return null;
  await reload(firebaseAuth.currentUser);
  await firebaseAuth.currentUser.getIdToken(true);
  return sessionFromUser(firebaseAuth.currentUser);
}

export async function resendAccountVerification() {
  await firebaseAuth.authStateReady();
  const user = firebaseAuth.currentUser;
  if (!user || user.isAnonymous || user.emailVerified)
    throw new Error("No unverified email account is signed in.");
  await requestAuraVerification(user);
}

export async function requestPasswordReset(email: string) {
  await ensurePersistence();
  await sendPasswordResetEmail(firebaseAuth, email.trim().toLowerCase());
}

export async function signOutAccount() {
  await signOut(firebaseAuth);
}

export function accountErrorMessage(error: unknown) {
  const code =
    typeof error === "object" && error && "code" in error
      ? String(error.code).toLowerCase()
      : "";
  if (code.includes("invalid-credential"))
    return "Email or password is incorrect.";
  if (code.includes("email-already-in-use") || code.includes("credential-already-in-use"))
    return "This account already exists. Choose Sign in instead; guest publications keep their original ten-day link.";
  if (code.includes("weak-password"))
    return "Use a password with at least six characters.";
  if (code.includes("invalid-email")) return "Enter a valid email address.";
  if (code.includes("popup-closed")) return "Google sign-in was cancelled.";
  if (code.includes("popup-blocked"))
    return "The browser blocked the Google window. Allow pop-ups and retry.";
  if (code.includes("operation-not-allowed"))
    return "This sign-in method is not enabled yet. Enable Email/Password and Google in Firebase Authentication.";
  if (code.includes("unauthorized-domain"))
    return "This hostname is not authorized in Firebase Authentication settings.";
  if (code.includes("provider-already-linked"))
    return "This sign-in method is already connected to the current account.";
  if (code.includes("network-request-failed"))
    return "Connection interrupted. Check the network and retry.";
  if (code.includes("too-many-requests"))
    return "Too many attempts. Wait a moment and retry.";
  if (code.includes("resource-exhausted"))
    return "Wait one minute before requesting another email.";
  return error instanceof Error ? error.message : "Account action failed.";
}
