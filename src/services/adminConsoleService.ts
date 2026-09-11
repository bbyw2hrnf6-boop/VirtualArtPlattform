import { httpsCallable } from "firebase/functions";
import { firebaseAuth, firebaseFunctions } from "./firebase";
import { currentAccountSession, signOutAccount, subscribeAccount } from "./accountService";
import type {
  AdminDashboard, AdminSession, ManageAdminAccessInput,
  ManageAdminAccessResponse, RunAdminChecksResponse,
} from "./adminConsoleTypes";

export { subscribeAccount as subscribeAdminAuth, signOutAccount as signOutAdmin };

function code(error: unknown): string {
  return error && typeof error === "object" && "code" in error ? String(error.code).replace(/^functions\//, "") : "";
}

function sessionChanged(): Error {
  return Object.assign(new Error("The signed-in account changed. Please sign in again."), { code: "functions/unauthenticated" });
}

async function adminRequest<T>(name: string, input: unknown): Promise<T> {
  const account = await currentAccountSession();
  const user = firebaseAuth.currentUser;
  if (!user || !account?.emailVerified || account.isAnonymous || account.uid !== user.uid) throw sessionChanged();
  const response = await httpsCallable<unknown, T>(firebaseFunctions, name, { timeout: 60_000 })(input);
  // Never return one account's privileged snapshot to a replacement session.
  if (firebaseAuth.currentUser !== user || !user.emailVerified) throw sessionChanged();
  return response.data;
}

export async function getAdminSession(): Promise<AdminSession | null> {
  try {
    const result = await adminRequest<AdminSession>("getLieuvaAdminSession", {});
    if (result.schemaVersion !== 1 || result.principal.uid !== firebaseAuth.currentUser?.uid ||
        !["owner", "admin"].includes(result.principal.role)) throw sessionChanged();
    return result;
  } catch (error) {
    if (["unauthenticated", "permission-denied"].includes(code(error))) return null;
    throw error;
  }
}

export const getAdminDashboard = () => adminRequest<AdminDashboard>("getLieuvaAdminDashboard", {});
export const runAdminChecks = () => adminRequest<RunAdminChecksResponse>("runLieuvaAdminChecks", {});
export const manageAdminAccess = (input: ManageAdminAccessInput) =>
  adminRequest<ManageAdminAccessResponse>("manageLieuvaAdminAccess", input);

export function adminErrorMessage(error: unknown): string {
  switch (code(error)) {
    case "unauthenticated": return "Sign in with a verified administrator account to continue.";
    case "permission-denied": return "Administrator access is required. Your access may have been revoked.";
    case "failed-precondition": return "Access changes require a recent sign-in. Sign out and back in, then retry. You cannot remove yourself or the last owner.";
    case "resource-exhausted": return "Please wait a moment before running this action again.";
    case "invalid-argument": return "Check the account details and selected role, then try again.";
    case "not-found": return "No existing account matches those details.";
    case "deadline-exceeded": return "The request timed out. Refresh before retrying an access change.";
    default: return "Administration is temporarily unavailable. Please retry shortly.";
  }
}

export function isAdminAccessError(error: unknown): boolean {
  return ["unauthenticated", "permission-denied"].includes(code(error));
}
