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
  type User,
} from "firebase/auth";
import { firebaseAuth } from "./firebase";
import type { AccountSession } from "./accountTypes";

let persistenceReady: Promise<void> | undefined;

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
  if (!result.user.emailVerified) await sendEmailVerification(result.user);
  return sessionFromUser(result.user);
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
  await sendEmailVerification(user);
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
  return error instanceof Error ? error.message : "Account action failed.";
}
