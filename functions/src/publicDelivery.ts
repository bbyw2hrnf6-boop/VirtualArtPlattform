import { readFileSync } from "node:fs";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldPath, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { defineString } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";
import {
  classifyServerError,
  logOperation,
  safeResourceRef,
} from "./observability.js";
import {
  SPACE_CARD_FALLBACK,
  cacheControlForSpace,
  classifySpaceForDelivery,
  metadataForSpace,
  renderPublicSitemap,
  renderSpaceDocument,
  type PublicSpaceDelivery,
  type SpaceDelivery,
} from "./spaceSeo.js";
import {
  classifyCreatorDocumentRoute,
  creatorCanonicalUrl,
  isCreatorProfileSpaceListed,
  isPublicCreatorProfile,
  normalizeCreatorHandle,
  parseCreatorPostInput,
  parseCreatorProfileInput,
  publicCreatorDirectoryEntry,
  renderCreatorDirectoryDocument,
  renderCreatorDocument,
  renderCreatorHubDocument,
  type CreatorDelivery,
  type PublicCreatorPost,
  type PublicCreatorSpace,
} from "./creatorIdentity.js";
import {
  APP_CONTENT_SECURITY_POLICY,
  APP_REPORTING_ENDPOINTS,
} from "./securityHeaders.js";

if (!getApps().length) initializeApp();

const REGION = "europe-west1";
export const PUBLIC_APP_URL = defineString("AURA_PUBLIC_APP_URL", {
  default: "https://lieuva.com",
  description: "Legacy-named parameter for the public LIEUVA URL without a trailing slash.",
});

const db = getFirestore();
const publicDeliveryFields = [
  "schemaVersion",
  "title",
  "artist",
  "visibility",
  "lifecycleStatus",
  "expiresAt",
  "publishedAt",
  "updatedAt",
  "revision",
  "ownerId",
  "coverPath",
  "discoverEligible",
  "exploreListed",
  "creatorProfileListed",
  "guestPublication",
  "artworks",
] as const;

function generatedAppShell() {
  return readFileSync(new URL("../generated/app-shell.html", import.meta.url), "utf8");
}

function requestSpaceId(path: string, route: "spaces" | "space-cards") {
  const match = new RegExp(`/${route}/([^/]+)/?$`).exec(path);
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
}

function requestRouteValue(path: string, route: string, suffix = "") {
  const match = new RegExp(`/${route}/([^/]+)${suffix.replace(".", "[.]")}/?$`).exec(path);
  if (!match) return undefined;
  try { return decodeURIComponent(match[1]); } catch { return undefined; }
}

function timestampMilliseconds(value: unknown): number | undefined {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function")
    return value.toMillis();
  if (typeof value === "string" || typeof value === "number") {
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : undefined;
  }
  return undefined;
}

export async function creatorDeliveryForHandle(handleValue: unknown): Promise<CreatorDelivery> {
  const requestedHandle = normalizeCreatorHandle(handleValue);
  if (!requestedHandle) return { kind: "not-found" };
  const handleSnapshot = await db.collection("creatorHandles").doc(requestedHandle).get();
  const handleData = handleSnapshot.data();
  if (!handleData || typeof handleData.creatorId !== "string")
    return { kind: "not-found", handle: requestedHandle };
  const creatorId = handleData.creatorId;
  const [profileSnapshot, accountSnapshot] = await Promise.all([
    db.collection("creatorProfiles").doc(creatorId).get(),
    db.collection("creatorAccounts").doc(creatorId).get(),
  ]);
  const profileData = profileSnapshot.data();
  const accountData = accountSnapshot.data();
  if (
    !profileData || profileData.profilePublic !== true ||
    typeof profileData.handle !== "string" ||
    typeof profileData.displayName !== "string" ||
    typeof accountData?.ownerId !== "string"
  ) return { kind: "not-found", handle: requestedHandle };
  const profile = parseCreatorProfileInput(profileData);
  if (!isPublicCreatorProfile(profile)) return { kind: "not-found", handle: requestedHandle };
  const [spacesSnapshot, postsSnapshot] = await Promise.all([
    db.collection("galleries")
      .where("ownerId", "==", accountData.ownerId)
      .limit(100)
      .select(...publicDeliveryFields)
      .get(),
    db.collection("creatorAccounts").doc(creatorId).collection("posts")
      .orderBy("createdAt", "desc")
      .limit(12)
      .get(),
  ]);
  const spaces: PublicCreatorSpace[] = spacesSnapshot.docs
    .filter((document) => isCreatorProfileSpaceListed(document.data()))
    .map((document) => classifySpaceForDelivery(document.id, document.data()))
    .filter((delivery): delivery is PublicSpaceDelivery =>
      delivery.kind === "public" && delivery.indexEligible)
    .sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""))
    .map((space) => ({
      id: space.id,
      title: space.title,
      creator: space.creator,
      coverUrl: `${PUBLIC_APP_URL.value().replace(/\/$/, "")}/space-cards/${space.id}?v=${space.revision}`,
      ...(space.updatedAt ? { updatedAt: space.updatedAt } : {}),
    }));
  const updated = timestampMilliseconds(profileData.updatedAt);
  const posts: PublicCreatorPost[] = postsSnapshot.docs.flatMap((document) => {
    if (document.data().moderationStatus === "removed") return [];
    const body = parseCreatorPostInput(document.data().body);
    const createdAt = timestampMilliseconds(document.data().createdAt);
    if (!body || createdAt === undefined) return [];
    return [{
      id: document.id,
      handle: profile.handle,
      displayName: profile.displayName,
      body,
      createdAt: new Date(createdAt).toISOString(),
      reactionCount: Math.max(0, Number.isSafeInteger(document.data().reactionCount) ? document.data().reactionCount : 0),
      commentCount: Math.max(0, Number.isSafeInteger(document.data().commentCount) ? document.data().commentCount : 0),
    }];
  });
  return {
    kind: "public",
    profile: {
      ...profile,
      ...(updated !== undefined ? { updatedAt: new Date(updated).toISOString() } : {}),
    },
    spaces,
    posts,
  };
}

function publicCreatorPayload(delivery: CreatorDelivery) {
  if (delivery.kind !== "public") return undefined;
  return { schemaVersion: 1, profile: delivery.profile, spaces: delivery.spaces, posts: delivery.posts };
}

async function publicDeliveryManifest(spaceId: string) {
  const snapshot = await db.collection("galleries")
    .where(FieldPath.documentId(), "==", spaceId)
    .select(...publicDeliveryFields)
    .limit(1)
    .get();
  return snapshot.docs[0]?.data();
}

function genericErrorShell(delivery: SpaceDelivery) {
  const metadata = metadataForSpace(delivery);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="${metadata.robots}"><title>${metadata.title}</title></head><body><main><h1>Space temporarily unavailable</h1><p>Please try again later.</p></main></body></html>`;
}

/** Privacy-aware HTML delivery for canonical customer-facing Space URLs. */
export const spaceDocument = onRequest(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", invoker: "public" },
  async (request, response) => {
    const startedAt = Date.now();
    response.set("Content-Type", "text/html; charset=utf-8");
    response.set("Vary", "Accept-Encoding");
    response.set("X-Content-Type-Options", "nosniff");
    response.set("Content-Security-Policy-Report-Only", APP_CONTENT_SECURITY_POLICY);
    response.set("Reporting-Endpoints", APP_REPORTING_ENDPOINTS);
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.set("Allow", "GET, HEAD");
      response.status(405).send("Method not allowed");
      return;
    }
    const spaceId = requestSpaceId(request.path, "spaces");
    let delivery: SpaceDelivery = { kind: "not-found", ...(spaceId ? { id: spaceId } : {}) };
    try {
      if (spaceId) {
        delivery = classifySpaceForDelivery(spaceId, await publicDeliveryManifest(spaceId));
      }
      const metadata = metadataForSpace(delivery);
      response.set("Cache-Control", cacheControlForSpace(delivery));
      response.set("X-Robots-Tag", metadata.robots);
      response.status(metadata.status).send(renderSpaceDocument(generatedAppShell(), delivery));
      logOperation("space_document", "success", startedAt, { resourceRef: safeResourceRef(spaceId), delivery: delivery.kind });
    } catch (error) {
      delivery = { kind: "temporary-error", ...(spaceId ? { id: spaceId } : {}) };
      const metadata = metadataForSpace(delivery);
      response.set("Cache-Control", cacheControlForSpace(delivery));
      response.set("X-Robots-Tag", metadata.robots);
      response.status(503).send(genericErrorShell(delivery));
      logOperation("space_document", "failure", startedAt, { resourceRef: safeResourceRef(spaceId), errorClass: classifyServerError(error) });
    }
  },
);

/** Server-rendered Creator route. Aliases redirect to one canonical handle and
 * non-public profiles return generic, noindex HTML. */
export const creatorDocument = onRequest(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", invoker: "public" },
  async (request, response) => {
    const startedAt = Date.now();
    response.set("Content-Type", "text/html; charset=utf-8");
    response.set("X-Content-Type-Options", "nosniff");
    response.set("Content-Security-Policy-Report-Only", APP_CONTENT_SECURITY_POLICY);
    response.set("Reporting-Endpoints", APP_REPORTING_ENDPOINTS);
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.set("Allow", "GET, HEAD");
      response.status(405).send("Method not allowed");
      return;
    }
    const route = classifyCreatorDocumentRoute(request.path);
    try {
      if (route.kind === "hub") {
        response.set("Cache-Control", "private, no-store, max-age=0");
        response.set("X-Robots-Tag", "noindex,nofollow,noarchive");
        response.status(200).send(renderCreatorHubDocument(generatedAppShell()));
        logOperation("creator_document", "success", startedAt, { delivery: "hub" });
        return;
      }
      if (route.kind === "directory") {
        response.set("Cache-Control", "public, max-age=0, s-maxage=60, must-revalidate");
        response.set("X-Robots-Tag", "index,follow,max-image-preview:large");
        response.status(200).send(renderCreatorDirectoryDocument(generatedAppShell()));
        logOperation("creator_document", "success", startedAt, { delivery: "directory" });
        return;
      }
      if (route.kind === "malformed") {
        response.set("Cache-Control", "private, no-store, max-age=0");
        response.set("X-Robots-Tag", "noindex,nofollow,noarchive");
        response.status(404).send(request.path.startsWith("/creator-hub/")
          ? renderCreatorHubDocument(generatedAppShell())
          : renderCreatorDocument(generatedAppShell(), { kind: "not-found" }));
        logOperation("creator_document", "success", startedAt, { delivery: "not-found" });
        return;
      }
      const requestedHandle = route.handle;
      const delivery = await creatorDeliveryForHandle(requestedHandle);
      if (delivery.kind === "public" && requestedHandle !== delivery.profile.handle) {
        response.set("Cache-Control", "public, max-age=0, s-maxage=60, must-revalidate");
        response.redirect(301, creatorCanonicalUrl(delivery.profile.handle));
        return;
      }
      response.set("Cache-Control", delivery.kind === "public"
        ? "public, max-age=0, s-maxage=60, must-revalidate"
        : "private, no-store, max-age=0");
      response.set("X-Robots-Tag", delivery.kind === "public"
        ? "index,follow,max-image-preview:large"
        : "noindex,nofollow,noarchive");
      response.status(delivery.kind === "public" ? 200 : 404)
        .send(renderCreatorDocument(generatedAppShell(), delivery));
      logOperation("creator_document", "success", startedAt, { delivery: delivery.kind });
    } catch (error) {
      const delivery: CreatorDelivery = { kind: "temporary-error" };
      response.set("Cache-Control", "private, no-store, max-age=0");
      response.set("X-Robots-Tag", "noindex,nofollow,noarchive");
      response.status(503).send(renderCreatorDocument(generatedAppShell(), delivery));
      logOperation("creator_document", "failure", startedAt, { errorClass: classifyServerError(error) });
    }
  },
);

/** Narrow public JSON projection consumed by the lightweight Creator page. */
export const creatorProfileData = onRequest(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", invoker: "public" },
  async (request, response) => {
    response.set("Content-Type", "application/json; charset=utf-8");
    response.set("X-Content-Type-Options", "nosniff");
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.set("Allow", "GET, HEAD");
      response.status(405).json({ error: "method-not-allowed" });
      return;
    }
    const handle = requestRouteValue(request.path, "creator-profiles", ".json");
    try {
      const delivery = await creatorDeliveryForHandle(handle);
      const payload = publicCreatorPayload(delivery);
      if (!payload) {
        response.set("Cache-Control", "private, no-store, max-age=0");
        response.status(404).json({ error: "not-found" });
        return;
      }
      response.set("Cache-Control", "public, max-age=0, s-maxage=60, must-revalidate");
      response.status(200).json(payload);
    } catch {
      response.set("Cache-Control", "private, no-store, max-age=0");
      response.status(503).json({ error: "temporary-error" });
    }
  },
);

/** Public, minimal Creator directory used by the shared Space/Creator search.
 * Private profiles and internal Creator/account identifiers never leave this boundary. */
export const creatorDirectoryData = onRequest(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", invoker: "public" },
  async (request, response) => {
    response.set("Content-Type", "application/json; charset=utf-8");
    response.set("X-Content-Type-Options", "nosniff");
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.set("Allow", "GET, HEAD");
      response.status(405).json({ error: "method-not-allowed" });
      return;
    }
    try {
      const snapshot = await db.collection("creatorProfiles")
        .where("profilePublic", "==", true)
        .select("handle", "displayName", "bio", "links", "profilePublic", "imagePresent", "coverPresent", "bioFont", "profileTone", "followerCount")
        .limit(500)
        .get();
      const creators = snapshot.docs
        .flatMap((document) => {
          const entry = publicCreatorDirectoryEntry(document.data());
          return entry ? [entry] : [];
        })
        .sort((left, right) => left.displayName.localeCompare(right.displayName));
      response.set("Cache-Control", "public, max-age=0, s-maxage=60, must-revalidate");
      response.status(200).json({ schemaVersion: 1, creators });
    } catch {
      response.set("Cache-Control", "private, no-store, max-age=0");
      response.status(503).json({ error: "temporary-error" });
    }
  },
);

/** Public image proxy. It checks current profile visibility before serving and
 * never discloses the backing object path. */
export const creatorImage = onRequest(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", invoker: "public" },
  async (request, response) => {
    response.set("X-Content-Type-Options", "nosniff");
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.set("Allow", "GET, HEAD");
      response.status(405).send("Method not allowed");
      return;
    }
    const handle = requestRouteValue(request.path, "creator-images", ".webp");
    try {
      const normalized = normalizeCreatorHandle(handle);
      if (!normalized) throw new Error("not-found");
      const handleSnapshot = await db.collection("creatorHandles").doc(normalized).get();
      const creatorId = handleSnapshot.data()?.creatorId;
      if (typeof creatorId !== "string") throw new Error("not-found");
      const profile = parseCreatorProfileInput((await db.collection("creatorProfiles").doc(creatorId).get()).data());
      if (!isPublicCreatorProfile(profile) || !profile.imagePresent) throw new Error("not-found");
      const [bytes] = await getStorage().bucket().file(`creator-public/${creatorId}/avatar.webp`).download();
      response.set("Content-Type", "image/webp");
      response.set("Cache-Control", "public, max-age=0, s-maxage=60, must-revalidate");
      response.status(200).send(request.method === "HEAD" ? undefined : bytes);
    } catch {
      response.set("Cache-Control", "private, no-store");
      response.status(404).send("Not found");
    }
  },
);

/** Public cover proxy. It checks profile visibility before serving title art. */
export const creatorCover = onRequest(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", invoker: "public" },
  async (request, response) => {
    response.set("X-Content-Type-Options", "nosniff");
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.set("Allow", "GET, HEAD");
      response.status(405).send("Method not allowed");
      return;
    }
    const handle = requestRouteValue(request.path, "creator-covers", ".webp");
    try {
      const normalized = normalizeCreatorHandle(handle);
      if (!normalized) throw new Error("not-found");
      const handleSnapshot = await db.collection("creatorHandles").doc(normalized).get();
      const creatorId = handleSnapshot.data()?.creatorId;
      if (typeof creatorId !== "string") throw new Error("not-found");
      const profile = parseCreatorProfileInput((await db.collection("creatorProfiles").doc(creatorId).get()).data());
      if (!isPublicCreatorProfile(profile) || !profile.coverPresent) throw new Error("not-found");
      const [bytes] = await getStorage().bucket().file(`creator-public/${creatorId}/cover.webp`).download();
      response.set("Content-Type", "image/webp");
      response.set("Cache-Control", "public, max-age=0, s-maxage=60, must-revalidate");
      response.status(200).send(request.method === "HEAD" ? undefined : bytes);
    } catch {
      response.set("Cache-Control", "private, no-store");
      response.status(404).send("Not found");
    }
  },
);

/** Gallery attribution is resolved server-side so public UI never derives a
 * Creator URL from an owner UID. */
export const creatorAttribution = onRequest(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", invoker: "public" },
  async (request, response) => {
    response.set("Content-Type", "application/json; charset=utf-8");
    response.set("X-Content-Type-Options", "nosniff");
    const spaceId = requestRouteValue(request.path, "creator-attributions", ".json");
    if ((request.method !== "GET" && request.method !== "HEAD") || !spaceId) {
      response.status(request.method === "GET" || request.method === "HEAD" ? 404 : 405).json({ error: "not-found" });
      return;
    }
    try {
      const gallery = await publicDeliveryManifest(spaceId);
      const delivery = classifySpaceForDelivery(spaceId, gallery);
      const ownerId = gallery?.ownerId;
      if (gallery?.guestPublication === true || delivery.kind !== "public" || !delivery.indexEligible || typeof ownerId !== "string")
        throw new Error("not-public");
      const owner = await db.collection("creatorAccountOwners").doc(ownerId).get();
      const creatorId = owner.data()?.creatorId;
      if (typeof creatorId !== "string") throw new Error("no-creator");
      const profileSnapshot = await db.collection("creatorProfiles").doc(creatorId).get();
      const profile = parseCreatorProfileInput(profileSnapshot.data());
      if (!isPublicCreatorProfile(profile)) throw new Error("private-creator");
      response.set("Cache-Control", "public, max-age=0, s-maxage=60, must-revalidate");
      response.status(200).json({
        schemaVersion: 1,
        displayName: profile.displayName,
        handle: profile.handle,
        profileUrl: creatorCanonicalUrl(profile.handle),
      });
    } catch {
      response.set("Cache-Control", "private, no-store, max-age=0");
      response.status(404).json({ error: "not-found" });
    }
  },
);

/** Public cover proxy. Storage paths and protected Space media never enter metadata. */
export const spaceCard = onRequest(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", invoker: "public" },
  async (request, response) => {
    const startedAt = Date.now();
    response.set("X-Content-Type-Options", "nosniff");
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.set("Allow", "GET, HEAD");
      response.status(405).send("Method not allowed");
      return;
    }
    const spaceId = requestSpaceId(request.path, "space-cards");
    if (!spaceId) {
      response.set("Cache-Control", "private, no-store, max-age=0");
      response.status(404).send("Not found");
      return;
    }
    try {
      const delivery = classifySpaceForDelivery(spaceId, await publicDeliveryManifest(spaceId));
      if (delivery.kind !== "public") {
        response.set("Cache-Control", "private, no-store, max-age=0");
        response.status(404).send("Not found");
        logOperation("space_card", "rejected", startedAt, { resourceRef: safeResourceRef(spaceId), delivery: delivery.kind });
        return;
      }
      if (!delivery.coverPath) {
        response.set("Cache-Control", "public, max-age=60, s-maxage=60, must-revalidate");
        response.redirect(302, SPACE_CARD_FALLBACK);
        return;
      }
      const file = getStorage().bucket().file(delivery.coverPath);
      const [metadata] = await file.getMetadata();
      const contentType = metadata.contentType ?? "";
      const size = Number(metadata.size ?? 0);
      if (!new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]).has(contentType) || size > 2 * 1024 * 1024)
        throw new Error("Invalid public cover metadata.");
      const [image] = await file.download();
      response.set("Content-Type", contentType);
      response.set("Content-Length", String(image.length));
      response.set("Cache-Control", "public, max-age=60, s-maxage=60, must-revalidate");
      if (metadata.etag) response.set("ETag", metadata.etag);
      response.status(200).send(image);
      logOperation("space_card", "success", startedAt, { resourceRef: safeResourceRef(spaceId), delivery: "public" });
    } catch (error) {
      response.set("Cache-Control", "private, no-store, max-age=0");
      response.status(404).send("Not found");
      logOperation("space_card", "failure", startedAt, { resourceRef: safeResourceRef(spaceId), errorClass: classifyServerError(error) });
    }
  },
);

/** Canonical, public-only sitemap generated from the current publication state. */
export const spaceSitemap = onRequest(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", invoker: "public" },
  async (request, response) => {
    const startedAt = Date.now();
    response.set("Content-Type", "application/xml; charset=utf-8");
    response.set("X-Content-Type-Options", "nosniff");
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.set("Allow", "GET, HEAD");
      response.status(405).send("Method not allowed");
      return;
    }
    try {
      const expiryFloor = new Date();
      const [modern, legacy] = await Promise.all([
        db.collection("galleries")
          .where("visibility", "==", "public")
          .where("discoverEligible", "==", true)
          .where("expiresAt", ">", expiryFloor)
          .orderBy("expiresAt", "desc")
          .limit(500)
          .select(...publicDeliveryFields)
          .get(),
        db.collection("galleries")
          .where("schemaVersion", "in", [1, 2])
          .where("discoverEligible", "==", true)
          .where("expiresAt", ">", expiryFloor)
          .orderBy("expiresAt", "desc")
          .limit(500)
          .select(...publicDeliveryFields)
          .get(),
      ]);
      const documents = new Map([...modern.docs, ...legacy.docs].map((document) => [document.id, document]));
      const spaces = [...documents.values()]
        .map((document) => classifySpaceForDelivery(document.id, document.data()))
        .filter((delivery): delivery is PublicSpaceDelivery => delivery.kind === "public");
      const creatorProfiles = await db.collection("creatorProfiles")
        .where("profilePublic", "==", true)
        .limit(500)
        .get();
      const creators = creatorProfiles.docs.flatMap((document) => {
        const profile = parseCreatorProfileInput(document.data());
        if (!isPublicCreatorProfile(profile)) return [];
        const updated = timestampMilliseconds(document.data().updatedAt);
        return [{
          handle: profile.handle,
          ...(updated !== undefined ? { updatedAt: new Date(updated).toISOString() } : {}),
        }];
      });
      response.set("Cache-Control", "public, max-age=0, s-maxage=60, must-revalidate");
      response.status(200).send(renderPublicSitemap(spaces, creators));
      logOperation("space_sitemap", "success", startedAt, { count: spaces.length + creators.length });
    } catch (error) {
      response.set("Cache-Control", "private, no-store, max-age=0");
      response.set("X-Robots-Tag", "noindex");
      response.status(503).send(renderPublicSitemap([]));
      logOperation("space_sitemap", "failure", startedAt, { errorClass: classifyServerError(error) });
    }
  },
);
