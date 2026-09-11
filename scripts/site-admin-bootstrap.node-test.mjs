import assert from "node:assert/strict";
import test from "node:test";

import { decodeFirestoreFields } from "./lib/firebase-operator-tools.mjs";
import {
  assertBootstrapExecutionGuard,
  buildSiteAdminBootstrapPlan,
  commitSiteAdminBootstrap,
  eligibleFirebaseAdminUser,
  IdentityToolkitAdminClient,
  loadGcloudCredential,
  readSiteAdminBootstrapState,
  SITE_ADMIN_AUDIT_COLLECTION,
  SITE_ADMIN_BOOTSTRAP_PATH,
  SITE_ADMIN_COLLECTION,
  SiteAdminFirestoreClient,
  validatedAdminEmail,
  validatedBootstrapSelector,
} from "./lib/site-admin-bootstrap.mjs";

const projectId = "example-admin-project";
const uid = "firebase-owner-uid";
const email = "owner@example.test";
const actor = "operator@example.test";
const occurredAt = "2026-09-11T10:00:00.000Z";
const eventId = "0123456789abcdef0123456789abcdef";
const user = { uid, email, providerIds: ["password"] };

function response(body, status = 200) {
  return new Response(body === undefined ? undefined : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("admin selector requires one bounded UID or normalized email", () => {
  assert.throws(() => validatedBootstrapSelector({}), /--uid or --email/);
  assert.deepEqual(validatedBootstrapSelector({ email: " Owner@Example.Test " }), { email });
  assert.deepEqual(validatedBootstrapSelector({ uid, email }), { uid, email });
  assert.throws(() => validatedBootstrapSelector({ uid: "unsafe/uid" }), /letters, numbers/);
  assert.throws(() => validatedAdminEmail("not-an-email"), /valid email/);
  assert.throws(() => validatedAdminEmail(`${"x".repeat(243)}@example.test`), /valid email/);
});

test("Firebase Auth eligibility requires an enabled verified supported sign-in", () => {
  const eligible = {
    localId: uid,
    email: "Owner@Example.Test",
    emailVerified: true,
    disabled: false,
    providerUserInfo: [{ providerId: "google.com" }, { providerId: "password" }],
  };
  assert.deepEqual(eligibleFirebaseAdminUser(eligible, { uid, email }), {
    uid,
    email,
    providerIds: ["google.com", "password"],
  });
  assert.throws(
    () => eligibleFirebaseAdminUser({ ...eligible, emailVerified: false }),
    /verify its email/,
  );
  assert.throws(
    () => eligibleFirebaseAdminUser({ ...eligible, disabled: true }),
    /disabled/,
  );
  assert.throws(
    () => eligibleFirebaseAdminUser({ ...eligible, providerUserInfo: [] }),
    /non-anonymous/,
  );
  assert.throws(
    () => eligibleFirebaseAdminUser({ ...eligible, localId: "another-uid" }, { uid }),
    /does not match/,
  );
  assert.throws(
    () => eligibleFirebaseAdminUser({ ...eligible, email: "other@example.test" }, { email }),
    /does not match/,
  );
});

test("execute mode requires exact project, UID, and email confirmations", () => {
  assert.doesNotThrow(() => assertBootstrapExecutionGuard({
    execute: false,
    projectId,
    user,
  }));
  const valid = {
    execute: true,
    projectId,
    user,
    confirmProject: projectId,
    confirmUid: uid,
    confirmEmail: email,
  };
  assert.doesNotThrow(() => assertBootstrapExecutionGuard(valid));
  assert.throws(
    () => assertBootstrapExecutionGuard({ ...valid, confirmProject: "another-project" }),
    /confirm-project/,
  );
  assert.throws(
    () => assertBootstrapExecutionGuard({ ...valid, confirmUid: "another-uid" }),
    /confirm-uid/,
  );
  assert.throws(
    () => assertBootstrapExecutionGuard({ ...valid, confirmEmail: "other@example.test" }),
    /confirm-email/,
  );
});

test("gcloud credential loader binds token minting to exact active project and human account", async () => {
  const commands = [];
  const token = `ya29.${"x".repeat(40)}`;
  const runGcloud = async (binary, args) => {
    commands.push([binary, args]);
    if (args[0] === "config" && args[2] === "project") return `${projectId}\n`;
    if (args[0] === "config" && args[2] === "account") return `${actor}\n`;
    if (args[0] === "auth") return `${token}\n`;
    throw new Error("unexpected command");
  };
  assert.deepEqual(await loadGcloudCredential({ projectId, gcloudBin: "/gcloud", runGcloud }), {
    accessToken: token,
    actor,
    projectId,
  });
  assert.deepEqual(commands.at(-1), [
    "/gcloud",
    ["auth", "print-access-token", "--account", actor, "--quiet"],
  ]);
  assert.equal(JSON.stringify(commands).includes(token), false);

  await assert.rejects(
    loadGcloudCredential({
      projectId,
      runGcloud: async () => "wrong-project\n",
    }),
    /Active gcloud project/,
  );
  await assert.rejects(
    loadGcloudCredential({
      projectId,
      runGcloud: async (_binary, args) => (
        args[2] === "project" ? `${projectId}\n` : "deploy@example.iam.gserviceaccount.com\n"
      ),
    }),
    /named human/,
  );
});

test("Identity Toolkit lookup uses OAuth admin endpoint and returns only sanitized identity", async () => {
  const calls = [];
  const accessToken = `token-${"s".repeat(30)}`;
  const client = new IdentityToolkitAdminClient({
    projectId,
    accessToken,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response({
        users: [{
          localId: uid,
          email,
          emailVerified: true,
          disabled: false,
          passwordHash: "must-not-escape",
          providerUserInfo: [{ providerId: "password", federatedId: email }],
        }],
      });
    },
  });
  assert.deepEqual(await client.lookup({ uid, email }), user);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, new RegExp(`/projects/${projectId}/accounts:lookup$`));
  assert.deepEqual(JSON.parse(calls[0].options.body), { localId: [uid] });
  assert.equal(calls[0].options.headers.authorization, `Bearer ${accessToken}`);
  assert.equal(JSON.stringify(await client.lookup({ email })).includes("passwordHash"), false);
});

test("Identity Toolkit lookup fails closed on zero or multiple accounts", async () => {
  for (const count of [0, 2]) {
    const client = new IdentityToolkitAdminClient({
      projectId,
      accessToken: `token-${"x".repeat(30)}`,
      fetchImpl: async () => response({ users: Array.from({ length: count }, () => ({})) }),
    });
    await assert.rejects(client.lookup({ email }), new RegExp(`found ${count}`));
  }
});

test("bootstrap plan creates only registry, one-shot guard, and immutable audit event", () => {
  const plan = buildSiteAdminBootstrapPlan({
    projectId,
    user,
    actor,
    occurredAt,
    eventId,
    state: { control: null, target: null, admins: [] },
  });
  assert.equal(plan.summary.writeCount, 3);
  assert.deepEqual(plan.summary.target, user);
  assert.deepEqual(plan.writes.map((write) => write.currentDocument), [
    { exists: false }, { exists: false }, { exists: false },
  ]);
  assert.deepEqual(
    plan.writes.map((write) => write.update.name.split("/documents/")[1]),
    [`${SITE_ADMIN_COLLECTION}/${uid}`, SITE_ADMIN_BOOTSTRAP_PATH, `${SITE_ADMIN_AUDIT_COLLECTION}/${eventId}`],
  );
  const [admin, control, event] = plan.writes.map((write) => decodeFirestoreFields(write.update.fields));
  assert.deepEqual(admin, {
    uid,
    email,
    role: "owner",
    active: true,
    createdAt: occurredAt,
    updatedAt: occurredAt,
    createdBy: actor,
    schemaVersion: 1,
  });
  assert.deepEqual(control, {
    ownerUid: uid,
    initializedAt: occurredAt,
    initializedBy: actor,
    auditEventId: eventId,
    schemaVersion: 1,
  });
  assert.deepEqual(event, {
    action: "bootstrap-owner",
    targetUid: uid,
    targetEmail: email,
    role: "owner",
    active: true,
    actor,
    occurredAt,
    projectId,
    schemaVersion: 1,
  });
  assert.equal(JSON.stringify(plan).includes("token"), false);
  assert.equal(JSON.stringify(plan).includes("passwordHash"), false);
  assert.equal(JSON.stringify(plan).includes("customClaims"), false);
});

test("bootstrap plan refuses every pre-existing registry or guard state", () => {
  const base = { projectId, user, actor, occurredAt, eventId };
  assert.throws(
    () => buildSiteAdminBootstrapPlan({
      ...base,
      state: { control: { name: SITE_ADMIN_BOOTSTRAP_PATH }, target: null, admins: [] },
    }),
    /already initialized/,
  );
  assert.throws(
    () => buildSiteAdminBootstrapPlan({
      ...base,
      state: { control: null, target: { name: `${SITE_ADMIN_COLLECTION}/${uid}` }, admins: [] },
    }),
    /already exists/,
  );
  assert.throws(
    () => buildSiteAdminBootstrapPlan({
      ...base,
      state: { control: null, target: null, admins: [{ name: `${SITE_ADMIN_COLLECTION}/other` }] },
    }),
    /not empty/,
  );
});

test("Firestore REST client binds reads and all create preconditions to one transaction", async () => {
  const calls = [];
  const transaction = "dHJhbnNhY3Rpb24=";
  const client = new SiteAdminFirestoreClient({
    projectId,
    accessToken: `token-${"x".repeat(30)}`,
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      if (url.endsWith(":beginTransaction")) return response({ transaction });
      if (url.includes(":runQuery")) return response([]);
      if (url.endsWith(":commit")) return response({ commitTime: occurredAt, writeResults: [] });
      if (url.includes("/documents/")) return response({ error: { status: "NOT_FOUND" } }, 404);
      throw new Error(`Unexpected URL ${url}`);
    },
  });
  const tx = await client.beginTransaction();
  const state = await readSiteAdminBootstrapState(client, { uid, transaction: tx });
  const plan = buildSiteAdminBootstrapPlan({ projectId, user, actor, occurredAt, eventId, state });
  await client.commitTransaction(plan.writes, tx);

  const documentReads = calls.filter((call) => (
    call.url.includes("/documents/") && call.options.method === undefined
  ));
  assert.equal(documentReads.length, 2);
  assert.ok(documentReads.every((call) => call.url.endsWith(`transaction=${encodeURIComponent(transaction)}`)));
  const query = calls.find((call) => call.url.endsWith(":runQuery"));
  assert.equal(JSON.parse(query.options.body).transaction, transaction);
  assert.equal(JSON.parse(query.options.body).structuredQuery.limit, 2);
  const commit = calls.find((call) => call.url.endsWith(":commit"));
  const commitBody = JSON.parse(commit.options.body);
  assert.equal(commitBody.transaction, transaction);
  assert.ok(commitBody.writes.every((write) => write.currentDocument.exists === false));
});

test("execute orchestration commits once and rolls back any refused bootstrap", async () => {
  const calls = [];
  const emptyClient = {
    beginTransaction: async () => { calls.push("begin"); return "transaction-one"; },
    getDocument: async (path) => { calls.push(`get:${path}`); return null; },
    listSiteAdmins: async () => { calls.push("query"); return []; },
    commitTransaction: async (writes, transaction) => {
      calls.push(`commit:${transaction}:${writes.length}`);
      return { commitTime: occurredAt, writeResults: [] };
    },
    rollbackTransaction: async () => { calls.push("rollback"); },
  };
  const result = await commitSiteAdminBootstrap({
    client: emptyClient,
    planInput: { projectId, user, actor, occurredAt, eventId },
  });
  assert.equal(result.plan.writes.length, 3);
  assert.deepEqual(calls, [
    "begin",
    `get:${SITE_ADMIN_BOOTSTRAP_PATH}`,
    `get:${SITE_ADMIN_COLLECTION}/${uid}`,
    "query",
    "commit:transaction-one:3",
  ]);

  const refusedCalls = [];
  const refusedClient = {
    ...emptyClient,
    beginTransaction: async () => "transaction-two",
    getDocument: async (path) => (
      path === SITE_ADMIN_BOOTSTRAP_PATH ? { name: path } : null
    ),
    listSiteAdmins: async () => [],
    commitTransaction: async () => { refusedCalls.push("commit"); },
    rollbackTransaction: async (transaction) => { refusedCalls.push(`rollback:${transaction}`); },
  };
  await assert.rejects(
    commitSiteAdminBootstrap({
      client: refusedClient,
      planInput: { projectId, user, actor, occurredAt, eventId },
    }),
    /already initialized/,
  );
  assert.deepEqual(refusedCalls, ["rollback:transaction-two"]);
});
