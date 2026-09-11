import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

import {
  documentName,
  encodeFirestoreFields,
  validatedDocumentId,
  validatedProjectId,
} from "./firebase-operator-tools.mjs";

const execFile = promisify(execFileCallback);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUPPORTED_SIGN_IN_PROVIDERS = new Set(["google.com", "password"]);

export const SITE_ADMIN_BOOTSTRAP_PATH = "siteAdminControl/bootstrap";
export const SITE_ADMIN_COLLECTION = "siteAdmins";
export const SITE_ADMIN_AUDIT_COLLECTION = "siteAdminAuditEvents";

export function validatedAdminEmail(value, label = "Admin email") {
  if (typeof value !== "string") throw new Error(`${label} is required.`);
  const normalized = value.trim().toLowerCase();
  if (normalized.length < 3 || normalized.length > 254 || !EMAIL.test(normalized))
    throw new Error(`${label} must be one explicit valid email address.`);
  return normalized;
}

export function validatedFirebaseUid(value, label = "Firebase Auth UID") {
  return validatedDocumentId(value, label);
}

export function validatedBootstrapSelector({ uid, email }) {
  if (uid === undefined && email === undefined)
    throw new Error("Select one existing Firebase Auth user with --uid or --email.");
  return {
    ...(uid === undefined ? {} : { uid: validatedFirebaseUid(uid) }),
    ...(email === undefined ? {} : { email: validatedAdminEmail(email) }),
  };
}

export function eligibleFirebaseAdminUser(rawUser, selector = {}) {
  if (!rawUser || typeof rawUser !== "object" || Array.isArray(rawUser))
    throw new Error("Identity Toolkit returned an invalid Firebase Auth user.");
  const uid = validatedFirebaseUid(rawUser.localId);
  const email = validatedAdminEmail(rawUser.email, "Firebase Auth email");
  if (selector.uid !== undefined && validatedFirebaseUid(selector.uid) !== uid)
    throw new Error("Resolved Firebase Auth UID does not match the requested UID.");
  if (selector.email !== undefined && validatedAdminEmail(selector.email) !== email)
    throw new Error("Resolved Firebase Auth email does not match the requested email.");
  if (rawUser.disabled === true) throw new Error("The selected Firebase Auth user is disabled.");
  if (rawUser.emailVerified !== true)
    throw new Error("The selected Firebase Auth user must verify its email first.");
  const providerIds = Array.isArray(rawUser.providerUserInfo)
    ? [...new Set(rawUser.providerUserInfo.flatMap((provider) => (
        typeof provider?.providerId === "string" ? [provider.providerId] : []
      )))].sort()
    : [];
  if (!providerIds.some((providerId) => SUPPORTED_SIGN_IN_PROVIDERS.has(providerId)))
    throw new Error("The selected user must have a non-anonymous Email/Password or Google sign-in provider.");
  return { uid, email, providerIds };
}

export function assertBootstrapExecutionGuard({
  execute,
  projectId,
  user,
  confirmProject,
  confirmUid,
  confirmEmail,
}) {
  if (!execute) return;
  if (confirmProject !== projectId)
    throw new Error("Execution requires --confirm-project with the exact --project value.");
  if (validatedFirebaseUid(confirmUid, "Confirmed Firebase Auth UID") !== user.uid)
    throw new Error("--confirm-uid does not match the resolved Firebase Auth user.");
  if (validatedAdminEmail(confirmEmail, "Confirmed admin email") !== user.email)
    throw new Error("--confirm-email does not match the resolved Firebase Auth user.");
}

function validatedHumanGcloudAccount(value) {
  const account = validatedAdminEmail(value, "Active gcloud account");
  if (account.endsWith(".gserviceaccount.com"))
    throw new Error("Bootstrap requires a named human gcloud account, not a service account.");
  return account;
}

async function defaultRunGcloud(binary, args) {
  try {
    const result = await execFile(binary, args, {
      encoding: "utf8",
      env: { ...process.env, CLOUDSDK_CORE_DISABLE_PROMPTS: "1" },
      maxBuffer: 32 * 1024,
      windowsHide: true,
    });
    return result.stdout;
  } catch {
    throw new Error(`gcloud ${args.slice(0, 2).join(" ")} failed.`);
  }
}

export async function loadGcloudCredential({
  projectId,
  gcloudBin = process.env.GCLOUD_BIN || "gcloud",
  runGcloud = defaultRunGcloud,
}) {
  const expectedProject = validatedProjectId(projectId);
  if (typeof gcloudBin !== "string" || !gcloudBin.trim() || gcloudBin.includes("\0"))
    throw new Error("GCLOUD_BIN must identify the gcloud executable.");
  const activeProject = String(await runGcloud(gcloudBin, [
    "config", "get-value", "project", "--quiet",
  ])).trim();
  if (activeProject !== expectedProject)
    throw new Error(`Active gcloud project must exactly equal --project (${expectedProject}).`);
  const actor = validatedHumanGcloudAccount(String(await runGcloud(gcloudBin, [
    "config", "get-value", "account", "--quiet",
  ])).trim());
  const accessToken = String(await runGcloud(gcloudBin, [
    "auth", "print-access-token", "--account", actor, "--quiet",
  ])).trim();
  if (accessToken.length < 20 || accessToken.length > 8192 || /\s/.test(accessToken))
    throw new Error("gcloud returned an invalid short-lived access token.");
  return { accessToken, actor, projectId: expectedProject };
}

class GoogleRestClient {
  constructor({ accessToken, fetchImpl = globalThis.fetch }) {
    if (typeof accessToken !== "string" || !accessToken.trim())
      throw new Error("A short-lived gcloud OAuth access token is required.");
    if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required.");
    this.fetchImpl = fetchImpl;
    this.headers = {
      authorization: `Bearer ${accessToken.trim()}`,
      "content-type": "application/json",
    };
  }

  async request(url, options = {}) {
    let response;
    try {
      response = await this.fetchImpl(url, {
        ...options,
        headers: { ...this.headers, ...options.headers },
      });
    } catch {
      throw new Error("Google API request failed before receiving a response.");
    }
    if (response.ok) return response.status === 204 ? undefined : response.json();
    const body = await response.json().catch(() => ({}));
    const status = typeof body?.error?.status === "string" ? ` (${body.error.status})` : "";
    throw new Error(`Google API request failed with HTTP ${response.status}${status}.`);
  }
}

export class IdentityToolkitAdminClient extends GoogleRestClient {
  constructor({ projectId, accessToken, fetchImpl = globalThis.fetch }) {
    super({ accessToken, fetchImpl });
    this.projectId = validatedProjectId(projectId);
  }

  async lookup(selector) {
    const target = validatedBootstrapSelector(selector);
    const lookupByUid = target.uid !== undefined;
    const body = lookupByUid ? { localId: [target.uid] } : { email: [target.email] };
    const result = await this.request(
      `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(this.projectId)}/accounts:lookup`,
      { method: "POST", body: JSON.stringify(body) },
    );
    const users = Array.isArray(result?.users) ? result.users : [];
    if (users.length !== 1)
      throw new Error(`Identity Toolkit must resolve exactly one account; found ${users.length}.`);
    return eligibleFirebaseAdminUser(users[0], target);
  }
}

function encodedRelativePath(relativePath) {
  return relativePath.split("/").map(encodeURIComponent).join("/");
}

function validatedTransaction(value) {
  if (typeof value !== "string" || value.length < 8 || value.length > 4096 || /\s/.test(value))
    throw new Error("Firestore returned an invalid transaction identifier.");
  return value;
}

export class SiteAdminFirestoreClient extends GoogleRestClient {
  constructor({ projectId, accessToken, fetchImpl = globalThis.fetch }) {
    super({ accessToken, fetchImpl });
    this.projectId = validatedProjectId(projectId);
    this.databaseId = "(default)";
    this.databaseRoot = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(this.projectId)}/databases/(default)`;
    this.documentsRoot = `${this.databaseRoot}/documents`;
  }

  async beginTransaction() {
    const result = await this.request(`${this.documentsRoot}:beginTransaction`, {
      method: "POST",
      body: JSON.stringify({ options: { readWrite: {} } }),
    });
    return validatedTransaction(result?.transaction);
  }

  async getDocument(relativePath, { allowMissing = false, transaction } = {}) {
    documentName(this.projectId, relativePath, this.databaseId);
    const suffix = transaction ? `?transaction=${encodeURIComponent(validatedTransaction(transaction))}` : "";
    let response;
    try {
      response = await this.fetchImpl(`${this.documentsRoot}/${encodedRelativePath(relativePath)}${suffix}`, {
        headers: this.headers,
      });
    } catch {
      throw new Error("Firestore document read failed before receiving a response.");
    }
    if (response.ok) return response.json();
    if (allowMissing && response.status === 404) return null;
    throw new Error(`Firestore document read failed with HTTP ${response.status}.`);
  }

  async listSiteAdmins({ transaction } = {}) {
    const structuredQuery = {
      from: [{ collectionId: SITE_ADMIN_COLLECTION }],
      orderBy: [{ field: { fieldPath: "__name__" }, direction: "ASCENDING" }],
      limit: 2,
    };
    const result = await this.request(`${this.documentsRoot}:runQuery`, {
      method: "POST",
      body: JSON.stringify({
        structuredQuery,
        ...(transaction ? { transaction: validatedTransaction(transaction) } : {}),
      }),
    });
    return (Array.isArray(result) ? result : []).flatMap((entry) => (
      entry?.document ? [entry.document] : []
    ));
  }

  async commitTransaction(writes, transaction) {
    if (!Array.isArray(writes) || writes.length !== 3)
      throw new Error("First-owner bootstrap must commit exactly three documents.");
    return this.request(`${this.documentsRoot}:commit`, {
      method: "POST",
      body: JSON.stringify({ writes, transaction: validatedTransaction(transaction) }),
    });
  }

  async rollbackTransaction(transaction) {
    return this.request(`${this.documentsRoot}:rollback`, {
      method: "POST",
      body: JSON.stringify({ transaction: validatedTransaction(transaction) }),
    });
  }
}

export async function readSiteAdminBootstrapState(client, { uid, transaction } = {}) {
  const targetUid = validatedFirebaseUid(uid);
  const control = await client.getDocument(SITE_ADMIN_BOOTSTRAP_PATH, {
    allowMissing: true,
    transaction,
  });
  const target = await client.getDocument(`${SITE_ADMIN_COLLECTION}/${targetUid}`, {
    allowMissing: true,
    transaction,
  });
  const admins = await client.listSiteAdmins({ transaction });
  return { control, target, admins };
}

function createWrite(name, values) {
  return {
    update: { name, fields: encodeFirestoreFields(values) },
    currentDocument: { exists: false },
  };
}

export function buildSiteAdminBootstrapPlan({
  projectId,
  user,
  actor,
  occurredAt,
  eventId,
  state,
}) {
  const validatedProject = validatedProjectId(projectId);
  const eligibleUser = eligibleFirebaseAdminUser({
    localId: user?.uid,
    email: user?.email,
    emailVerified: true,
    disabled: false,
    providerUserInfo: (user?.providerIds ?? []).map((providerId) => ({ providerId })),
  });
  const validatedActor = validatedHumanGcloudAccount(actor);
  const timestamp = new Date(occurredAt);
  if (!Number.isFinite(timestamp.getTime())) throw new Error("Bootstrap event time is invalid.");
  const validatedEventId = validatedDocumentId(eventId, "Bootstrap audit event ID");
  if (!state || typeof state !== "object") throw new Error("Bootstrap registry state is missing.");
  if (state.control) throw new Error("Site-admin bootstrap is already initialized; refusing replacement.");
  if (state.target) throw new Error("The selected site-admin registry document already exists.");
  if (!Array.isArray(state.admins)) throw new Error("Site-admin registry query result is invalid.");
  if (state.admins.length > 0)
    throw new Error("Site-admin registry is not empty; reconcile it instead of bootstrapping another owner.");

  const adminPath = `${SITE_ADMIN_COLLECTION}/${eligibleUser.uid}`;
  const eventPath = `${SITE_ADMIN_AUDIT_COLLECTION}/${validatedEventId}`;
  const values = {
    admin: {
      uid: eligibleUser.uid,
      email: eligibleUser.email,
      role: "owner",
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: validatedActor,
      schemaVersion: 1,
    },
    control: {
      ownerUid: eligibleUser.uid,
      initializedAt: timestamp,
      initializedBy: validatedActor,
      auditEventId: validatedEventId,
      schemaVersion: 1,
    },
    event: {
      action: "bootstrap-owner",
      targetUid: eligibleUser.uid,
      targetEmail: eligibleUser.email,
      role: "owner",
      active: true,
      actor: validatedActor,
      occurredAt: timestamp,
      projectId: validatedProject,
      schemaVersion: 1,
    },
  };
  const writes = [
    createWrite(documentName(validatedProject, adminPath), values.admin),
    createWrite(documentName(validatedProject, SITE_ADMIN_BOOTSTRAP_PATH), values.control),
    createWrite(documentName(validatedProject, eventPath), values.event),
  ];
  return {
    summary: {
      projectId: validatedProject,
      databaseId: "(default)",
      actor: validatedActor,
      target: eligibleUser,
      role: "owner",
      active: true,
      auditEventId: validatedEventId,
      writeCount: writes.length,
      writes: writes.map((write) => ({
        document: write.update.name,
        fields: Object.keys(write.update.fields).sort(),
        precondition: write.currentDocument,
      })),
    },
    writes,
  };
}

export async function commitSiteAdminBootstrap({ client, planInput }) {
  const transaction = await client.beginTransaction();
  let committed = false;
  try {
    const state = await readSiteAdminBootstrapState(client, {
      uid: planInput.user.uid,
      transaction,
    });
    const plan = buildSiteAdminBootstrapPlan({ ...planInput, state });
    const result = await client.commitTransaction(plan.writes, transaction);
    committed = true;
    return { plan, result };
  } finally {
    if (!committed) await client.rollbackTransaction(transaction).catch(() => undefined);
  }
}
