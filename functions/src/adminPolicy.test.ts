import { describe, expect, it } from "vitest";
import {
  AdminPolicyError,
  adminCheckRetryAfterSeconds,
  assertActiveAdmin,
  assertAdminTargetNotPendingDeletion,
  assertOwnerAdminMutation,
  nextAdminRegistryRevision,
  normalizeAdminEmail,
  parseAdminMembership,
  parseEmptyAdminInput,
  parseManageAdminAccessInput,
  planAdminAccessMutation,
  type AdminMembership,
  type CurrentAuthAccount,
  type LieuvaAdminPrincipal,
} from "./adminPolicy.js";

const NOW_SECONDS = Date.parse("2026-09-11T12:00:00.000Z") / 1_000;

const account: CurrentAuthAccount = {
  uid: "owner-uid",
  email: "Owner@Example.test",
  emailVerified: true,
  disabled: false,
  displayName: "Site Owner",
  tokensValidAfterTime: "2026-09-11T10:00:00.000Z",
};

const ownerMembership: AdminMembership = {
  uid: "owner-uid",
  email: "old-owner@example.test",
  role: "owner",
  active: true,
};

const principal: LieuvaAdminPrincipal = {
  uid: "owner-uid",
  email: "owner@example.test",
  displayName: "Site Owner",
  role: "owner",
};

function activePrincipal(overrides: Partial<Parameters<typeof assertActiveAdmin>[0]> = {}) {
  return assertActiveAdmin({
    requestUid: "owner-uid",
    requestEmailVerified: true,
    signInProvider: "password",
    authTimeSeconds: NOW_SECONDS,
    account,
    membership: ownerMembership,
    ...overrides,
  });
}

function failureReason(work: () => unknown) {
  try {
    work();
    return undefined;
  } catch (error) {
    expect(error).toBeInstanceOf(AdminPolicyError);
    return (error as AdminPolicyError).reason;
  }
}

describe("LIEUVA admin authorization policy", () => {
  it("requires both fresh token facts, the current Auth user, and live UID membership", () => {
    expect(activePrincipal()).toEqual({
      uid: "owner-uid",
      email: "owner@example.test",
      displayName: "Site Owner",
      role: "owner",
    });
    expect(failureReason(() => activePrincipal({ requestUid: undefined })))
      .toBe("authentication-required");
    expect(failureReason(() => activePrincipal({ requestEmailVerified: false })))
      .toBe("verified-account-required");
    expect(failureReason(() => activePrincipal({ signInProvider: "anonymous" })))
      .toBe("verified-account-required");
    expect(failureReason(() => activePrincipal({ signInProvider: undefined })))
      .toBe("verified-account-required");
    expect(failureReason(() => activePrincipal({ account: { ...account, disabled: true } })))
      .toBe("verified-account-required");
    expect(failureReason(() => activePrincipal({ account: { ...account, emailVerified: false } })))
      .toBe("verified-account-required");
    expect(failureReason(() => activePrincipal({ membership: { ...ownerMembership, active: false } })))
      .toBe("admin-access-required");
    expect(failureReason(() => activePrincipal({ membership: null })))
      .toBe("admin-access-required");
  });

  it("rejects ID tokens issued before Auth token revocation", () => {
    expect(failureReason(() => activePrincipal({
      authTimeSeconds: Date.parse("2026-09-11T09:59:59.000Z") / 1_000,
    }))).toBe("verified-account-required");
    expect(activePrincipal({
      authTimeSeconds: Date.parse("2026-09-11T10:00:00.000Z") / 1_000,
    }).uid).toBe("owner-uid");
  });

  it("fails closed for malformed or document-ID-mismatched registry data", () => {
    expect(parseAdminMembership("owner-uid", {
      uid: "owner-uid",
      email: "owner@example.test",
      role: "owner",
      active: true,
      schemaVersion: 1,
    })).toMatchObject({ uid: "owner-uid", role: "owner", active: true });
    expect(parseAdminMembership("different", {
      uid: "owner-uid", email: "owner@example.test", role: "owner", active: true, schemaVersion: 1,
    })).toBeNull();
    expect(parseAdminMembership("owner-uid", {
      uid: "owner-uid", email: "owner@example.test", role: "superuser", active: true, schemaVersion: 1,
    })).toBeNull();
    expect(parseAdminMembership("owner-uid", {
      uid: "owner-uid", email: "owner@example.test", role: "owner", active: true, schemaVersion: 2,
    })).toBeNull();
  });
});

describe("LIEUVA admin access input", () => {
  it("normalizes grant email and accepts only the three exact action shapes", () => {
    expect(normalizeAdminEmail("  Person@Example.Test ")).toBe("person@example.test");
    expect(parseManageAdminAccessInput({
      action: "grant", email: " Person@Example.Test ", role: "admin",
    })).toEqual({ action: "grant", email: "person@example.test", role: "admin" });
    expect(parseManageAdminAccessInput({ action: "set-role", uid: "person-uid", role: "owner" }))
      .toEqual({ action: "set-role", uid: "person-uid", role: "owner" });
    expect(parseManageAdminAccessInput({ action: "revoke", uid: "person-uid" }))
      .toEqual({ action: "revoke", uid: "person-uid" });
  });

  it("rejects unknown actions, path-like UIDs, unexpected fields, and non-empty read input", () => {
    for (const value of [
      { action: "grant", email: "bad", role: "admin" },
      { action: "grant", email: "person@example.test", role: "admin", uid: "smuggled" },
      { action: "set-role", uid: "../person", role: "owner" },
      { action: "delete", uid: "person-uid" },
    ]) expect(failureReason(() => parseManageAdminAccessInput(value))).toBe("invalid-admin-input");
    expect(() => parseEmptyAdminInput({})).not.toThrow();
    expect(failureReason(() => parseEmptyAdminInput({ limit: 1 }))).toBe("invalid-admin-input");
  });

  it("requires owner role and authentication no older than ten minutes", () => {
    expect(() => assertOwnerAdminMutation(principal, NOW_SECONDS - 599, NOW_SECONDS)).not.toThrow();
    expect(failureReason(() => assertOwnerAdminMutation(
      { ...principal, role: "admin" }, NOW_SECONDS, NOW_SECONDS,
    ))).toBe("owner-access-required");
    expect(failureReason(() => assertOwnerAdminMutation(
      principal, NOW_SECONDS - 601, NOW_SECONDS,
    ))).toBe("recent-authentication-required");
    expect(failureReason(() => assertOwnerAdminMutation(
      principal, NOW_SECONDS + 61, NOW_SECONDS,
    ))).toBe("recent-authentication-required");
  });

  it("fences grants and role changes against an account-deletion job", () => {
    expect(failureReason(() => assertAdminTargetNotPendingDeletion(
      { action: "grant", email: "target@example.test", role: "admin" },
      true,
    ))).toBe("target-account-pending-deletion");
    expect(failureReason(() => assertAdminTargetNotPendingDeletion(
      { action: "set-role", uid: "target-uid", role: "owner" },
      true,
    ))).toBe("target-account-pending-deletion");
    expect(() => assertAdminTargetNotPendingDeletion(
      { action: "revoke", uid: "target-uid" },
      true,
    )).not.toThrow();
  });

  it("computes the atomic live-check cooldown without trusting malformed control state", () => {
    const now = Date.parse("2026-09-11T12:00:00.000Z");
    expect(adminCheckRetryAfterSeconds(undefined, now, 60_000)).toBe(0);
    expect(adminCheckRetryAfterSeconds(now - 60_000, now, 60_000)).toBe(0);
    expect(adminCheckRetryAfterSeconds(now - 59_001, now, 60_000)).toBe(1);
    expect(adminCheckRetryAfterSeconds(now - 1_000, now, 60_000)).toBe(59);
    expect(adminCheckRetryAfterSeconds(now + 5_000, now, 60_000)).toBe(60);
    expect(failureReason(() => adminCheckRetryAfterSeconds("tampered", now, 60_000)))
      .toBe("invalid-admin-control");
  });

  it("creates and advances only a valid shared registry revision", () => {
    expect(nextAdminRegistryRevision(undefined)).toBe(1);
    expect(nextAdminRegistryRevision({
      schemaVersion: 1,
      kind: "admin-registry-revision",
      revision: 7,
    })).toBe(8);
    expect(failureReason(() => nextAdminRegistryRevision({
      schemaVersion: 1,
      kind: "admin-registry-revision",
      revision: 0,
    }))).toBe("invalid-admin-control");
    expect(failureReason(() => nextAdminRegistryRevision({
      schemaVersion: 1,
      kind: "wrong-kind",
      revision: 7,
    }))).toBe("invalid-admin-control");
  });
});

describe("LIEUVA admin access mutation policy", () => {
  const targetAccount: CurrentAuthAccount = {
    uid: "target-uid",
    email: "target@example.test",
    emailVerified: true,
    disabled: false,
    displayName: "Target Admin",
    tokensValidAfterTime: "2026-09-11T10:00:00.000Z",
  };
  const targetAdmin: AdminMembership = {
    uid: "target-uid",
    email: "target@example.test",
    role: "admin",
    active: true,
  };

  it("grants only a current enabled verified Firebase account and never uses email as authority", () => {
    expect(planAdminAccessMutation({
      actor: principal,
      input: { action: "grant", email: "target@example.test", role: "admin" },
      targetAccount,
      targetMembership: null,
      registryMemberships: [ownerMembership],
    })).toMatchObject({
      changed: true,
      uid: "target-uid",
      email: "target@example.test",
      role: "admin",
      active: true,
      createIdentity: true,
    });
    expect(failureReason(() => planAdminAccessMutation({
      actor: principal,
      input: { action: "grant", email: "target@example.test", role: "admin" },
      targetAccount: { ...targetAccount, disabled: true },
      targetMembership: null,
      registryMemberships: [ownerMembership],
    }))).toBe("target-account-ineligible");
  });

  it("requires the explicit role action for an already-active member", () => {
    expect(failureReason(() => planAdminAccessMutation({
      actor: principal,
      input: { action: "grant", email: "target@example.test", role: "owner" },
      targetAccount,
      targetMembership: targetAdmin,
      registryMemberships: [ownerMembership, targetAdmin],
    }))).toBe("target-membership-active");
  });

  it("preserves the last active owner under revocation and demotion", () => {
    expect(failureReason(() => planAdminAccessMutation({
      actor: principal,
      input: { action: "set-role", uid: principal.uid, role: "admin" },
      targetAccount: account,
      targetMembership: ownerMembership,
      registryMemberships: [ownerMembership],
    }))).toBe("last-owner-protected");
    expect(failureReason(() => planAdminAccessMutation({
      actor: { ...principal, uid: "other-owner" },
      input: { action: "revoke", uid: principal.uid },
      targetMembership: ownerMembership,
      registryMemberships: [ownerMembership],
    }))).toBe("last-owner-protected");
    expect(planAdminAccessMutation({
      actor: principal,
      input: { action: "set-role", uid: "target-uid", role: "admin" },
      targetAccount,
      targetMembership: { ...targetAdmin, role: "owner" },
      registryMemberships: [ownerMembership, { ...targetAdmin, role: "owner" }],
    }).changed).toBe(true);
  });

  it("prohibits self-revocation and permits an owner to revoke another active admin", () => {
    const twoOwners: AdminMembership[] = [
      ownerMembership,
      { uid: "other-owner", email: "other@example.test", role: "owner", active: true },
    ];
    expect(failureReason(() => planAdminAccessMutation({
      actor: principal,
      input: { action: "revoke", uid: principal.uid },
      targetMembership: ownerMembership,
      registryMemberships: twoOwners,
    }))).toBe("self-revoke-prohibited");
    expect(failureReason(() => planAdminAccessMutation({
      actor: principal,
      input: { action: "set-role", uid: principal.uid, role: "admin" },
      targetAccount: account,
      targetMembership: ownerMembership,
      registryMemberships: twoOwners,
    }))).toBe("self-revoke-prohibited");
    expect(planAdminAccessMutation({
      actor: principal,
      input: { action: "revoke", uid: "target-uid" },
      targetMembership: targetAdmin,
      registryMemberships: [ownerMembership, targetAdmin],
    })).toMatchObject({ changed: true, uid: "target-uid", active: false, role: "admin" });
  });

  it("enforces the complete 100-member registry bound without blocking revocation", () => {
    const fullRegistry: AdminMembership[] = [
      ownerMembership,
      ...Array.from({ length: 99 }, (_, index) => ({
        uid: `admin-${index}`,
        email: `admin-${index}@example.test`,
        role: "admin" as const,
        active: true,
      })),
    ];
    expect(failureReason(() => planAdminAccessMutation({
      actor: principal,
      input: { action: "grant", email: "target@example.test", role: "admin" },
      targetAccount,
      targetMembership: null,
      registryMemberships: fullRegistry,
    }))).toBe("admin-registry-too-large");

    expect(planAdminAccessMutation({
      actor: principal,
      input: { action: "revoke", uid: "admin-0" },
      targetMembership: fullRegistry[1],
      registryMemberships: [...fullRegistry, {
        uid: "legacy-overflow",
        email: "legacy-overflow@example.test",
        role: "admin",
        active: true,
      }],
    })).toMatchObject({ changed: true, uid: "admin-0", active: false });
  });
});
