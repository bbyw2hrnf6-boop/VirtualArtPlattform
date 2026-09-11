import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: { currentUser: null as { uid: string; emailVerified: boolean } | null },
  account: vi.fn(), callable: vi.fn(), httpsCallable: vi.fn(), subscribe: vi.fn(), signOut: vi.fn(),
}));
vi.mock("./firebase", () => ({ firebaseAuth: mocks.auth, firebaseFunctions: "functions" }));
vi.mock("./accountService", () => ({
  currentAccountSession: mocks.account, subscribeAccount: mocks.subscribe, signOutAccount: mocks.signOut,
}));
vi.mock("firebase/functions", () => ({ httpsCallable: mocks.httpsCallable }));
import { adminErrorMessage, getAdminDashboard, getAdminSession, manageAdminAccess, runAdminChecks } from "./adminConsoleService";

const session = {
  schemaVersion: 1, generatedAt: "2026-09-11T12:00:00.000Z",
  principal: { uid: "admin-a", email: "admin@example.test", displayName: null, role: "admin" },
  canManageAccess: false,
};

describe("admin client authorization boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.currentUser = { uid: "admin-a", emailVerified: true };
    mocks.account.mockResolvedValue({ uid: "admin-a", emailVerified: true, isAnonymous: false });
    mocks.httpsCallable.mockReturnValue(mocks.callable);
    mocks.callable.mockResolvedValue({ data: session });
  });

  it("requires server-confirmed membership, never a local role hint", async () => {
    mocks.account.mockResolvedValue({ uid: "admin-a", emailVerified: true, isAnonymous: false, role: "owner" });
    mocks.callable.mockRejectedValue({ code: "functions/permission-denied" });
    expect(await getAdminSession()).toBeNull();
    expect(mocks.httpsCallable).toHaveBeenCalledWith("functions", "getLieuvaAdminSession", { timeout: 60_000 });
  });

  it("denies guests, anonymous and unverified accounts without a privileged request", async () => {
    for (const account of [null, { uid: "admin-a", emailVerified: false }, { uid: "admin-a", emailVerified: true, isAnonymous: true }]) {
      mocks.account.mockResolvedValue(account);
      expect(await getAdminSession()).toBeNull();
    }
    expect(mocks.callable).not.toHaveBeenCalled();
  });

  it("accepts only a server session belonging to the current identity", async () => {
    expect(await getAdminSession()).toEqual(session);
    mocks.callable.mockResolvedValue({ data: { ...session, principal: { ...session.principal, uid: "different-account" } } });
    expect(await getAdminSession()).toBeNull();
  });

  it("discards in-flight privileged responses after sign-out or an account switch", async () => {
    let resolve!: (value: { data: unknown }) => void;
    mocks.callable.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const pending = getAdminDashboard();
    await vi.waitFor(() => expect(mocks.callable).toHaveBeenCalled());
    mocks.auth.currentUser = { uid: "admin-b", emailVerified: true };
    resolve({ data: { privateSnapshot: "old identity" } });
    await expect(pending).rejects.toMatchObject({ code: "functions/unauthenticated" });
  });

  it("keeps access checks server-side for reads and every mutation", async () => {
    mocks.callable.mockResolvedValue({ data: {} });
    await getAdminDashboard();
    await runAdminChecks();
    await manageAdminAccess({ action: "grant", email: "someone@example.test", role: "admin" });
    expect(mocks.httpsCallable.mock.calls.map(([,,options], index) => [mocks.httpsCallable.mock.calls[index][1], options.timeout])).toEqual([
      ["getLieuvaAdminDashboard", 60_000], ["runLieuvaAdminChecks", 60_000], ["manageLieuvaAdminAccess", 60_000],
    ]);
    expect(mocks.callable).toHaveBeenLastCalledWith({ action: "grant", email: "someone@example.test", role: "admin" });
  });

  it("returns a safe operational message without echoing upstream errors", () => {
    expect(adminErrorMessage(new Error("secret token"))).not.toContain("secret");
    expect(adminErrorMessage({ code: "functions/failed-precondition" })).toContain("recent sign-in");
  });
});
