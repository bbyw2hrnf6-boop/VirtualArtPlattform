export const ADMIN_SCHEMA_VERSION = 1 as const;
export const ADMIN_RECENT_AUTH_MAX_AGE_SECONDS = 10 * 60;
export const ADMIN_MEMBER_LIMIT = 100;

export type LieuvaAdminRole = "owner" | "admin";

export type LieuvaAdminSourceReason =
  | "configuration"
  | "permission"
  | "rate-limit"
  | "timeout"
  | "upstream"
  | "invalid-response";

export type LieuvaAdminSource<T> =
  | {
      status: "ok";
      fetchedAt: string;
      cached: boolean;
      data: T;
    }
  | {
      status: "unavailable";
      fetchedAt: string;
      cached: boolean;
      reason: LieuvaAdminSourceReason;
      data: null;
    };

export type LieuvaAdminMember = {
  uid: string;
  email: string;
  displayName: string | null;
  role: LieuvaAdminRole;
  active: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type LieuvaAdminPrincipal = {
  uid: string;
  email: string;
  displayName: string | null;
  role: LieuvaAdminRole;
};

export type ManageLieuvaAdminAccessInput =
  | { action: "grant"; email: string; role: LieuvaAdminRole }
  | { action: "set-role"; uid: string; role: LieuvaAdminRole }
  | { action: "revoke"; uid: string };

export type CurrentAuthAccount = {
  uid: string;
  email: string | undefined;
  emailVerified: boolean;
  disabled: boolean;
  displayName?: string | undefined;
  tokensValidAfterTime: string | undefined;
};

export type AdminMembership = {
  uid: string;
  email: string;
  role: LieuvaAdminRole;
  active: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type AdminPolicyFailure =
  | "authentication-required"
  | "verified-account-required"
  | "admin-access-required"
  | "owner-access-required"
  | "recent-authentication-required"
  | "invalid-admin-input"
  | "invalid-admin-membership"
  | "invalid-admin-control"
  | "target-account-required"
  | "target-account-ineligible"
  | "target-account-pending-deletion"
  | "target-membership-required"
  | "target-membership-active"
  | "last-owner-protected"
  | "self-revoke-prohibited"
  | "admin-registry-too-large";

export class AdminPolicyError extends Error {
  constructor(readonly reason: AdminPolicyFailure) {
    super(reason);
    this.name = "AdminPolicyError";
  }
}

function fail(reason: AdminPolicyFailure): never {
  throw new AdminPolicyError(reason);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

export function normalizeAdminEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (
    email.length < 3 || email.length > 254 ||
    [...email].some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127) ||
    !/^[^@]+@[^@]+\.[^@]+$/.test(email)
  ) return null;
  return email;
}

export function parseAdminUid(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 1 || value.length > 128) return null;
  if ([...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127 || character === "/";
  })) return null;
  return value;
}

export function parseAdminRole(value: unknown): LieuvaAdminRole | null {
  return value === "owner" || value === "admin" ? value : null;
}

export function parseEmptyAdminInput(value: unknown): void {
  if (value === undefined || value === null) return;
  if (!isRecord(value) || Object.keys(value).length !== 0) fail("invalid-admin-input");
}

export function parseManageAdminAccessInput(value: unknown): ManageLieuvaAdminAccessInput {
  if (!isRecord(value) || typeof value.action !== "string") fail("invalid-admin-input");
  if (value.action === "grant") {
    if (!hasOnlyKeys(value, ["action", "email", "role"])) fail("invalid-admin-input");
    const email = normalizeAdminEmail(value.email);
    const role = parseAdminRole(value.role);
    if (!email || !role) fail("invalid-admin-input");
    return { action: "grant", email, role };
  }
  if (value.action === "set-role") {
    if (!hasOnlyKeys(value, ["action", "uid", "role"])) fail("invalid-admin-input");
    const uid = parseAdminUid(value.uid);
    const role = parseAdminRole(value.role);
    if (!uid || !role) fail("invalid-admin-input");
    return { action: "set-role", uid, role };
  }
  if (value.action === "revoke") {
    if (!hasOnlyKeys(value, ["action", "uid"])) fail("invalid-admin-input");
    const uid = parseAdminUid(value.uid);
    if (!uid) fail("invalid-admin-input");
    return { action: "revoke", uid };
  }
  return fail("invalid-admin-input");
}

export function parseAdminMembership(
  documentId: string,
  value: unknown,
): AdminMembership | null {
  if (!isRecord(value)) return null;
  const uid = parseAdminUid(value.uid);
  const email = normalizeAdminEmail(value.email);
  const role = parseAdminRole(value.role);
  if (
    value.schemaVersion !== ADMIN_SCHEMA_VERSION ||
    uid !== documentId || !email || !role || typeof value.active !== "boolean"
  ) return null;
  return {
    uid,
    email,
    role,
    active: value.active,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

export function assertActiveAdmin(options: {
  requestUid: unknown;
  requestEmailVerified: unknown;
  signInProvider: unknown;
  authTimeSeconds: unknown;
  account: CurrentAuthAccount | undefined;
  membership: AdminMembership | null;
}): LieuvaAdminPrincipal {
  const requestUid = parseAdminUid(options.requestUid);
  if (!requestUid) fail("authentication-required");
  if (
    options.requestEmailVerified !== true ||
    typeof options.signInProvider !== "string" || !options.signInProvider ||
    options.signInProvider === "anonymous"
  )
    fail("verified-account-required");
  const account = options.account;
  const email = normalizeAdminEmail(account?.email);
  const tokensValidAfter = account?.tokensValidAfterTime
    ? Date.parse(account.tokensValidAfterTime)
    : Number.NaN;
  if (
    !account || account.uid !== requestUid || account.disabled ||
    !account.emailVerified || !email ||
    typeof options.authTimeSeconds !== "number" || !Number.isFinite(options.authTimeSeconds) ||
    !Number.isFinite(tokensValidAfter) || options.authTimeSeconds * 1_000 < tokensValidAfter
  ) fail("verified-account-required");
  const membership = options.membership;
  if (!membership || membership.uid !== requestUid || !membership.active)
    fail("admin-access-required");
  return {
    uid: requestUid,
    email,
    displayName: typeof account.displayName === "string" && account.displayName.trim()
      ? account.displayName.trim().slice(0, 80)
      : null,
    role: membership.role,
  };
}

export function assertRecentAdminAuthentication(
  authTimeSeconds: unknown,
  nowSeconds = Math.floor(Date.now() / 1000),
  maximumAgeSeconds = ADMIN_RECENT_AUTH_MAX_AGE_SECONDS,
): void {
  if (
    typeof authTimeSeconds !== "number" || !Number.isFinite(authTimeSeconds) ||
    authTimeSeconds > nowSeconds + 60 || nowSeconds - authTimeSeconds > maximumAgeSeconds
  ) fail("recent-authentication-required");
}

export function assertOwnerAdminMutation(
  principal: LieuvaAdminPrincipal,
  authTimeSeconds: unknown,
  nowSeconds = Math.floor(Date.now() / 1000),
): void {
  if (principal.role !== "owner") fail("owner-access-required");
  assertRecentAdminAuthentication(authTimeSeconds, nowSeconds);
}

export function assertAdminTargetNotPendingDeletion(
  input: ManageLieuvaAdminAccessInput,
  deletionJobExists: boolean,
): void {
  if (deletionJobExists && input.action !== "revoke")
    fail("target-account-pending-deletion");
}

export function adminCheckRetryAfterSeconds(
  previousStartedAtMs: unknown,
  nowMs: number,
  cooldownMs: number,
): number {
  if (previousStartedAtMs === undefined || previousStartedAtMs === null) return 0;
  if (
    typeof previousStartedAtMs !== "number" || !Number.isFinite(previousStartedAtMs) ||
    !Number.isFinite(nowMs) || !Number.isFinite(cooldownMs) || cooldownMs < 1
  ) fail("invalid-admin-control");
  const elapsed = Math.max(0, nowMs - previousStartedAtMs);
  return elapsed >= cooldownMs ? 0 : Math.max(1, Math.ceil((cooldownMs - elapsed) / 1_000));
}

export function nextAdminRegistryRevision(value: unknown): number {
  if (value === undefined || value === null) return 1;
  if (!isRecord(value) || value.schemaVersion !== ADMIN_SCHEMA_VERSION ||
    value.kind !== "admin-registry-revision" ||
    !Number.isSafeInteger(value.revision) || Number(value.revision) < 1 ||
    Number(value.revision) >= Number.MAX_SAFE_INTEGER)
    fail("invalid-admin-control");
  return Number(value.revision) + 1;
}

export type PlannedAdminAccessMutation = {
  changed: boolean;
  uid: string;
  email: string;
  role: LieuvaAdminRole;
  active: boolean;
  createIdentity: boolean;
  previousRole: LieuvaAdminRole | null;
  previousActive: boolean | null;
};

function eligibleTargetAccount(account: CurrentAuthAccount | undefined) {
  const uid = parseAdminUid(account?.uid);
  const email = normalizeAdminEmail(account?.email);
  if (!account || !uid || !email || account.disabled || !account.emailVerified)
    fail("target-account-ineligible");
  return { uid, email };
}

function protectLastOwner(
  membership: AdminMembership,
  activeOwnerUids: readonly string[],
  nextRole: LieuvaAdminRole,
  nextActive: boolean,
) {
  if (membership.active && membership.role === "owner" && (!nextActive || nextRole !== "owner")) {
    const owners = new Set(activeOwnerUids.map(parseAdminUid).filter((uid): uid is string => Boolean(uid)));
    if (!owners.has(membership.uid)) fail("invalid-admin-membership");
    if (owners.size <= 1) fail("last-owner-protected");
  }
}

export function planAdminAccessMutation(options: {
  actor: LieuvaAdminPrincipal;
  input: ManageLieuvaAdminAccessInput;
  targetAccount?: CurrentAuthAccount;
  targetMembership: AdminMembership | null;
  registryMemberships: readonly AdminMembership[];
}): PlannedAdminAccessMutation {
  if (options.actor.role !== "owner") fail("owner-access-required");
  const registryUids = new Set<string>();
  const activeOwnerUids: string[] = [];
  for (const membership of options.registryMemberships) {
    const uid = parseAdminUid(membership.uid);
    if (
      !uid || registryUids.has(uid) || !normalizeAdminEmail(membership.email) ||
      !parseAdminRole(membership.role) || typeof membership.active !== "boolean"
    ) fail("invalid-admin-membership");
    registryUids.add(uid);
    if (membership.active && membership.role === "owner") activeOwnerUids.push(uid);
  }
  const { input, targetMembership } = options;

  if (input.action === "grant") {
    const target = eligibleTargetAccount(options.targetAccount);
    if (target.email !== input.email) fail("target-account-required");
    if (targetMembership?.active) {
      if (targetMembership.role !== input.role) fail("target-membership-active");
      return {
        changed: targetMembership.email !== target.email,
        uid: target.uid,
        email: target.email,
        role: input.role,
        active: true,
        createIdentity: false,
        previousRole: targetMembership.role,
        previousActive: true,
      };
    }
    if (
      options.registryMemberships.length > ADMIN_MEMBER_LIMIT ||
      (!targetMembership && options.registryMemberships.length >= ADMIN_MEMBER_LIMIT)
    ) fail("admin-registry-too-large");
    return {
      changed: true,
      uid: target.uid,
      email: target.email,
      role: input.role,
      active: true,
      createIdentity: !targetMembership,
      previousRole: targetMembership?.role ?? null,
      previousActive: targetMembership?.active ?? null,
    };
  }

  if (!targetMembership || targetMembership.uid !== input.uid)
    fail("target-membership-required");

  if (input.action === "set-role") {
    if (!targetMembership.active) fail("target-membership-required");
    const target = eligibleTargetAccount(options.targetAccount);
    if (target.uid !== input.uid) fail("target-account-required");
    protectLastOwner(targetMembership, activeOwnerUids, input.role, true);
    if (
      targetMembership.role === "owner" && input.role !== "owner" &&
      input.uid === options.actor.uid
    ) fail("self-revoke-prohibited");
    return {
      changed: targetMembership.role !== input.role || targetMembership.email !== target.email,
      uid: target.uid,
      email: target.email,
      role: input.role,
      active: true,
      createIdentity: false,
      previousRole: targetMembership.role,
      previousActive: true,
    };
  }

  if (input.uid === options.actor.uid) fail("self-revoke-prohibited");
  protectLastOwner(targetMembership, activeOwnerUids, targetMembership.role, false);
  return {
    changed: targetMembership.active,
    uid: targetMembership.uid,
    email: targetMembership.email,
    role: targetMembership.role,
    active: false,
    createIdentity: false,
    previousRole: targetMembership.role,
    previousActive: targetMembership.active,
  };
}
