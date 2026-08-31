import { httpsCallable } from "firebase/functions";
import { firebaseFunctions } from "./firebase";
import { creatorCanonicalUrl } from "./spaceRoutes";
import { prepareProfileImage } from "./profileImage";
import type { AccountSession } from "./accountTypes";

const DEMO_CREATOR_HANDLES = new Set([
  "mira-vale",
  "atlas-studio",
  "noor-patel",
  "common-field",
  "elian-ross",
]);

export function creatorHandleBase(session: Pick<AccountSession, "nickname" | "displayName" | "email">) {
  const source = session.nickname || session.displayName || session.email?.split("@")[0] || "creator";
  const normalized = source
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/g, "");
  return normalized.length >= 3 ? normalized : `${normalized || "creator"}-art`.slice(0, 30);
}

export type CreatorLink = { label: string; url: string };
export type CreatorProfile = {
  handle: string;
  displayName: string;
  bio: string;
  links: CreatorLink[];
  profilePublic: boolean;
  imagePresent: boolean;
  followerCount?: number;
  updatedAt?: string;
  demo?: boolean;
};
export type CreatorSpaceCard = {
  id: string;
  title: string;
  creator: string;
  coverUrl: string;
  updatedAt?: string;
};
export type PublicCreatorPayload = {
  schemaVersion: 1;
  profile: CreatorProfile;
  spaces: CreatorSpaceCard[];
  posts?: CreatorPost[];
};
export type PublicCreatorDirectoryEntry = {
  handle: string;
  displayName: string;
  bio: string;
  imagePresent: boolean;
  followerCount?: number;
  demo?: boolean;
};
export type PublicCreatorDirectoryPayload = {
  schemaVersion: 1;
  creators: PublicCreatorDirectoryEntry[];
};
export type CreatorAttribution = {
  schemaVersion: 1;
  displayName: string;
  handle: string;
  profileUrl: string;
};

export const CREATOR_PROFILE_UPDATED_EVENT = "lieuva:creator-profile-updated";

export function announceCreatorProfileUpdated(profile: CreatorProfile) {
  window.dispatchEvent(new CustomEvent<CreatorProfile>(CREATOR_PROFILE_UPDATED_EVENT, {
    detail: profile,
  }));
}

export function creatorProfileSaveLabel(published: boolean, nextPublic: boolean, saving = false) {
  if (saving) return "Saving…";
  if (published && nextPublic) return "Save profile changes";
  if (nextPublic) return "Save and publish profile";
  return published ? "Save and make private" : "Save private draft";
}

export function creatorProfileUrl(handle: string) {
  return creatorCanonicalUrl(handle);
}

function creatorErrorCode(error: unknown) {
  return typeof error === "object" && error && "code" in error
    ? String(error.code).toLowerCase()
    : "";
}

export function isTransientCreatorActionError(error: unknown) {
  const code = creatorErrorCode(error);
  return ["internal", "unavailable", "deadline-exceeded", "network-request-failed"].some((value) =>
    code.includes(value),
  );
}

export function creatorActionErrorMessage(
  error: unknown,
  fallback = "The Creator Hub is temporarily unavailable. Nothing was changed; retry shortly.",
) {
  const code = creatorErrorCode(error);
  if (code.includes("already-exists")) return "That handle is already taken. Try another.";
  if (code.includes("invalid-argument")) return "Check the handle, display name, bio and HTTPS links.";
  if (code.includes("failed-precondition")) return "Finish your public Creator profile before continuing.";
  if (code.includes("unauthenticated")) return "Your session expired. Sign in again, then retry.";
  if (code.includes("permission-denied")) return "This account cannot change that Creator profile.";
  if (code.includes("resource-exhausted")) return "Too many Creator actions were requested. Wait a moment, then retry.";
  if (isTransientCreatorActionError(error)) return fallback;
  return error instanceof Error && error.message && error.message.toLowerCase() !== "internal"
    ? error.message.replace(/^Firebase:\s*/i, "")
    : fallback;
}

async function creatorCallableWithRetry<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (!isTransientCreatorActionError(error)) throw error;
    await new Promise((resolve) => window.setTimeout(resolve, 450));
    return await operation();
  }
}

export async function loadPublicCreatorProfile(handle: string, signal?: AbortSignal) {
  const normalizedHandle = handle.trim().toLowerCase();
  if (DEMO_CREATOR_HANDLES.has(normalizedHandle)) {
    const { demoCreatorPayload } = await import("../features/creator/demoCreators");
    const demo = demoCreatorPayload(normalizedHandle);
    if (demo) return demo;
  }
  const response = await fetch(`/creator-profiles/${encodeURIComponent(handle)}.json`, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (response.status === 404 && DEMO_CREATOR_HANDLES.has(normalizedHandle)) {
    const { demoCreatorPayload } = await import("../features/creator/demoCreators");
    return demoCreatorPayload(normalizedHandle);
  }
  if (!response.ok) throw new Error("Creator profile is temporarily unavailable.");
  return await response.json() as PublicCreatorPayload;
}

export async function loadPublicCreatorDirectory(signal?: AbortSignal) {
  try {
    const response = await fetch("/creator-directory.json", {
      headers: { Accept: "application/json" },
      signal,
    });
    if (!response.ok) throw new Error("Creator search is temporarily unavailable.");
    const payload = await response.json() as PublicCreatorDirectoryPayload;
    const { DEMO_CREATORS } = await import("../features/creator/demoCreators");
    const liveHandles = new Set(payload.creators.map((creator) => creator.handle));
    return {
      ...payload,
      creators: [
        ...payload.creators,
        ...DEMO_CREATORS.filter((creator) => !liveHandles.has(creator.handle)),
      ],
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    const { DEMO_CREATORS } = await import("../features/creator/demoCreators");
    return { schemaVersion: 1 as const, creators: DEMO_CREATORS };
  }
}

export async function loadCreatorAttribution(spaceId: string, signal?: AbortSignal) {
  const response = await fetch(`/creator-attributions/${encodeURIComponent(spaceId)}.json`, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Creator attribution is temporarily unavailable.");
  return await response.json() as CreatorAttribution;
}

export async function loadMyCreatorProfile() {
  const result = await creatorCallableWithRetry(() =>
    httpsCallable<Record<string, never>, { profile: CreatorProfile | null }>(
      firebaseFunctions,
      "getMyLieuvaCreatorProfile",
    )({}),
  );
  return result.data.profile;
}

export async function checkCreatorHandle(handle: string) {
  const result = await creatorCallableWithRetry(() =>
    httpsCallable<{ handle: string }, { handle: string; available: boolean }>(
      firebaseFunctions,
      "checkLieuvaCreatorHandle",
    )({ handle }),
  );
  return result.data;
}

export async function saveCreatorProfile(profile: CreatorProfile) {
  const result = await creatorCallableWithRetry(() =>
    httpsCallable<CreatorProfile, { profile: CreatorProfile; publicUrl: string }>(
      firebaseFunctions,
      "saveLieuvaCreatorProfile",
    )(profile),
  );
  return result.data;
}

export function creatorImageUrl(handle: string) {
  return `/creator-images/${encodeURIComponent(handle)}.webp`;
}

export async function saveCreatorProfileImage(file?: File, remove = false) {
  let base64: string | undefined;
  if (file) {
    const blob = await prepareProfileImage(file);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    base64 = btoa(binary);
  }
  const result = await httpsCallable<{ base64?: string; remove?: boolean }, { imagePresent: boolean }>(
    firebaseFunctions,
    "setLieuvaCreatorProfileImage",
  )({ ...(base64 ? { base64 } : {}), ...(remove ? { remove: true } : {}) });
  return result.data.imagePresent;
}

export type CreatorFollowState = {
  following: boolean;
  followerCount: number;
  canFollow: boolean;
  isSelf: boolean;
};

export type CreatorHomePayload = {
  schemaVersion: 1;
  following: PublicCreatorDirectoryEntry[];
  updates: Array<CreatorSpaceCard & { handle: string; displayName: string }>;
  posts: CreatorPost[];
  notifications: CreatorNotification[];
};

export type CreatorNotification = {
  id: string;
  kind: "follow" | "reaction" | "comment";
  actorHandle: string;
  actorDisplayName: string;
  createdAt: string;
  read: boolean;
};

export type CreatorPost = {
  id: string;
  handle: string;
  displayName: string;
  body: string;
  createdAt: string;
  reactionCount: number;
  commentCount: number;
  viewerReacted?: boolean;
  demo?: boolean;
};

export type CreatorComment = {
  id: string;
  handle: string;
  displayName: string;
  body: string;
  createdAt: string;
};

export async function loadCreatorHome() {
  const result = await httpsCallable<Record<string, never>, CreatorHomePayload>(
    firebaseFunctions,
    "getMyLieuvaCreatorHome",
  )({});
  return result.data;
}

export async function createCreatorPost(body: string) {
  const result = await httpsCallable<{ body: string }, { post: CreatorPost }>(
    firebaseFunctions,
    "createLieuvaCreatorPost",
  )({ body });
  return result.data.post;
}

export async function interactCreatorPost(
  handle: string,
  postId: string,
  input: { action: "react" | "unreact" } | { action: "comment"; body: string } | { action: "report"; reason: "spam" | "harassment" | "rights" | "unsafe" | "other" },
) {
  const result = await httpsCallable<
    { handle: string; postId: string } & typeof input,
    { reacted?: boolean; reactionCount?: number; comment?: CreatorComment; reported?: boolean }
  >(firebaseFunctions, "manageLieuvaCreatorPostInteraction")({ handle, postId, ...input });
  return result.data;
}

export async function manageCreatorBlock(handle: string, action: "block" | "unblock") {
  const result = await httpsCallable<{ handle: string; action: "block" | "unblock" }, { blocked: boolean }>(
    firebaseFunctions,
    "manageLieuvaCreatorBlock",
  )({ handle, action });
  return result.data;
}

export async function manageCreatorFollow(handle: string, action: "status" | "follow" | "unfollow") {
  const result = await httpsCallable<
    { handle: string; action: "status" | "follow" | "unfollow" },
    CreatorFollowState
  >(firebaseFunctions, "manageLieuvaCreatorFollow")({ handle, action });
  return result.data;
}
