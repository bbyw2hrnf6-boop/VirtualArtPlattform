import { randomUUID } from "node:crypto";

import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

import {
  STORAGE_POLICY_CACHE_CONTROL,
  STORAGE_POLICY_PREFIX,
  storagePolicyMetadataUpdate,
  storagePolicyPageAfter,
  validateStoragePolicyObjectName,
} from "./storage-policy-migration-lib.mjs";

const PROJECT_ID = "virtualartplattform";
const BUCKET = "virtualartplattform.firebasestorage.app";
const MIGRATION_ID = "gallery-storage-metadata-v3";
const APPLY_LEASE_MS = 15 * 60_000;
const mode = process.env.STORAGE_POLICY_MIGRATION_MODE?.trim() || "plan";
const maximumObjects = Number(process.env.STORAGE_POLICY_MIGRATION_MAX_OBJECTS ?? 1_000);
const requestedStartAfter = process.env.STORAGE_POLICY_MIGRATION_START_AFTER?.trim();
const applyConfirmation = process.env.STORAGE_POLICY_MIGRATION_CONFIRM?.trim();

if (process.env.FIREBASE_PROJECT_ID?.trim() !== PROJECT_ID)
  throw new Error(`FIREBASE_PROJECT_ID must explicitly equal ${PROJECT_ID}.`);
if (process.env.FIREBASE_STORAGE_BUCKET?.trim() !== BUCKET)
  throw new Error(`FIREBASE_STORAGE_BUCKET must explicitly equal ${BUCKET}.`);
if (!["plan", "apply"].includes(mode))
  throw new Error("STORAGE_POLICY_MIGRATION_MODE must be plan or apply.");
if (!Number.isSafeInteger(maximumObjects) || maximumObjects < 1 || maximumObjects > 10_000)
  throw new Error("STORAGE_POLICY_MIGRATION_MAX_OBJECTS must be 1-10000.");
if (mode === "apply" && requestedStartAfter)
  throw new Error("STORAGE_POLICY_MIGRATION_START_AFTER is plan-only; apply resumes from its server checkpoint.");
if (mode === "apply" && applyConfirmation !== `${PROJECT_ID}:${MIGRATION_ID}`)
  throw new Error(`STORAGE_POLICY_MIGRATION_CONFIRM must equal ${PROJECT_ID}:${MIGRATION_ID} in apply mode.`);

if (!getApps().length) initializeApp({
  credential: applicationDefault(),
  projectId: PROJECT_ID,
  storageBucket: BUCKET,
});
const db = getFirestore();
const bucket = getStorage().bucket(BUCKET);
const stateReference = db.collection("securityMaintenanceState").doc(MIGRATION_ID);
const invocationId = randomUUID();
const stateData = mode === "apply"
  ? await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(stateReference);
      const data = snapshot.data();
      if (data?.status === "complete") return data;
      const leaseExpiry = typeof data?.leaseExpiresAt?.toMillis === "function"
        ? data.leaseExpiresAt.toMillis()
        : 0;
      if (leaseExpiry > Date.now() && data?.leaseId !== invocationId)
        throw new Error("Another storage-policy migration apply invocation holds the lease.");
      transaction.set(stateReference, {
        migrationId: MIGRATION_ID,
        status: "running",
        leaseId: invocationId,
        leaseExpiresAt: new Date(Date.now() + APPLY_LEASE_MS),
        updatedAt: FieldValue.serverTimestamp(),
        schemaVersion: 1,
      }, { merge: true });
      return data;
    })
  : undefined;
if (stateData?.status === "complete") {
  console.log(JSON.stringify({ mode, inspectedObjects: 0, changedObjects: 0, pass: 2, complete: true }));
  process.exit(0);
}
const pass = stateData?.pass === undefined ? 1 : Number(stateData.pass);
if (![1, 2].includes(pass)) throw new Error("Stored migration pass is invalid.");
let lastObjectName = mode === "apply" && stateData?.lastObjectName !== undefined
  ? validateStoragePolicyObjectName(stateData.lastObjectName)
  : requestedStartAfter
    ? validateStoragePolicyObjectName(requestedStartAfter)
    : undefined;

let inspectedObjects = 0;
let changedObjects = 0;
let reachedEnd = false;
while (inspectedObjects < maximumObjects) {
  const remaining = maximumObjects - inspectedObjects;
  const requestLimit = Math.min(101, remaining + (lastObjectName ? 1 : 0));
  const [listed] = await bucket.getFiles({
    prefix: STORAGE_POLICY_PREFIX,
    autoPaginate: false,
    maxResults: requestLimit,
    ...(lastObjectName ? { startOffset: lastObjectName } : {}),
  });
  const page = storagePolicyPageAfter(listed, lastObjectName).slice(0, remaining);
  if (!page.length) {
    reachedEnd = true;
    break;
  }
  let pageChanged = 0;
  for (const file of page) {
    const [metadata] = await file.getMetadata();
    const update = storagePolicyMetadataUpdate(metadata);
    inspectedObjects += 1;
    if (!update.required) continue;
    changedObjects += 1;
    pageChanged += 1;
    if (mode === "apply") await file.setMetadata(update.patch, {
      ifMetagenerationMatch: update.metageneration,
    });
  }
  lastObjectName = validateStoragePolicyObjectName(page.at(-1).name);
  if (mode === "apply") await db.runTransaction(async (transaction) => {
    const current = await transaction.get(stateReference);
    if (current.data()?.leaseId !== invocationId)
      throw new Error("Storage-policy migration lease was lost before checkpointing.");
    transaction.set(stateReference, {
      migrationId: MIGRATION_ID,
      status: "running",
      pass,
      lastObjectName,
      inspectedObjects: FieldValue.increment(page.length),
      changedObjects: FieldValue.increment(pageChanged),
      cacheControl: STORAGE_POLICY_CACHE_CONTROL,
      leaseExpiresAt: new Date(Date.now() + APPLY_LEASE_MS),
      updatedAt: FieldValue.serverTimestamp(),
      schemaVersion: 1,
    }, { merge: true });
  });
  // A short page proves this lexical scan reached the current end. A second
  // pass catches legacy objects inserted before pass-one's moving checkpoint.
  if (listed.length < requestLimit) {
    reachedEnd = true;
    break;
  }
}

let complete = false;
if (mode === "apply" && reachedEnd) {
  if (pass === 1) {
    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(stateReference);
      if (current.data()?.leaseId !== invocationId)
        throw new Error("Storage-policy migration lease was lost before pass transition.");
      transaction.set(stateReference, {
        status: "running",
        pass: 2,
        lastObjectName: FieldValue.delete(),
        firstPassCompletedAt: FieldValue.serverTimestamp(),
        leaseId: FieldValue.delete(),
        leaseExpiresAt: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
  } else {
    complete = true;
    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(stateReference);
      if (current.data()?.leaseId !== invocationId)
        throw new Error("Storage-policy migration lease was lost before completion.");
      transaction.set(stateReference, {
        status: "complete",
        lastObjectName: FieldValue.delete(),
        leaseId: FieldValue.delete(),
        leaseExpiresAt: FieldValue.delete(),
        completedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
  }
} else if (mode === "plan") {
  complete = reachedEnd;
} else if (mode === "apply") {
  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(stateReference);
    if (current.data()?.leaseId !== invocationId)
      throw new Error("Storage-policy migration lease was lost before release.");
    transaction.set(stateReference, {
      leaseId: FieldValue.delete(),
      leaseExpiresAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

console.log(JSON.stringify({
  mode,
  inspectedObjects,
  changedObjects,
  pass,
  reachedEnd,
  complete,
  ...(!complete && lastObjectName ? { nextStartAfter: lastObjectName } : {}),
}));
