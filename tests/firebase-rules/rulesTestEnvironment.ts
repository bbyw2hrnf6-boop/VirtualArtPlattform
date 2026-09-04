import { readFile } from "node:fs/promises";

import {
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
  type TokenOptions,
} from "@firebase/rules-unit-testing";
import { doc, setDoc, type DocumentData } from "firebase/firestore";

export const RULES_PROJECT_ID = "demo-lieuva-rules";
export const RULES_STORAGE_BUCKET = `${RULES_PROJECT_ID}.appspot.com`;
export const RULES_STORAGE_URL = `gs://${RULES_STORAGE_BUCKET}`;

export const USER_IDS = {
  editor: "editor-user",
  outsider: "outsider-user",
  owner: "owner-user",
  viewer: "viewer-user",
} as const;

export const USER_EMAILS = {
  editor: "editor@example.test",
  outsider: "outsider@example.test",
  owner: "owner@example.test",
  viewer: "viewer@example.test",
} as const;

const parseHost = (value: string | undefined, variable: string) => {
  if (!value) {
    throw new Error(
      `${variable} is missing. Run this suite through the pinned Firebase Emulator Suite.`,
    );
  }

  const separator = value.lastIndexOf(":");
  const host = value.slice(0, separator);
  const port = Number(value.slice(separator + 1));
  if (!host || !Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${variable} must be a valid host:port value.`);
  }
  return { host, port };
};

export const verifiedToken = (email: string): TokenOptions => ({
  email,
  email_verified: true,
  firebase: { sign_in_provider: "password" },
});

export const unverifiedToken = (email: string): TokenOptions => ({
  email,
  email_verified: false,
  firebase: { sign_in_provider: "password" },
});

export const anonymousToken: TokenOptions = {
  provider_id: "anonymous",
  firebase: { sign_in_provider: "anonymous" },
};

export const verifiedContext = (
  environment: RulesTestEnvironment,
  uid: string,
  email: string,
) => environment.authenticatedContext(uid, verifiedToken(email));

export const createRulesTestEnvironment = async () => {
  const firestore = parseHost(
    process.env.FIRESTORE_EMULATOR_HOST,
    "FIRESTORE_EMULATOR_HOST",
  );
  const storage = parseHost(
    process.env.FIREBASE_STORAGE_EMULATOR_HOST,
    "FIREBASE_STORAGE_EMULATOR_HOST",
  );
  const [firestoreRules, storageRules] = await Promise.all([
    readFile(new URL("../../firestore.rules", import.meta.url), "utf8"),
    readFile(new URL("../../storage.rules", import.meta.url), "utf8"),
  ]);

  return initializeTestEnvironment({
    projectId: RULES_PROJECT_ID,
    firestore: { ...firestore, rules: firestoreRules },
    storage: { ...storage, rules: storageRules },
  });
};

export const seedFirestore = async (
  environment: RulesTestEnvironment,
  entries: ReadonlyArray<readonly [path: string, data: DocumentData]>,
) => {
  await environment.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();
    for (const [path, data] of entries) {
      await setDoc(doc(database, path), data);
    }
  });
};

export const firestoreFor = (context: RulesTestContext) => context.firestore();

