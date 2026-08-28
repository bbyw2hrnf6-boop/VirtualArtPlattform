import { httpsCallable } from "firebase/functions";
import { firebaseFunctions } from "./firebase";
import { creatorCanonicalUrl } from "./spaceRoutes";
import { prepareProfileImage } from "./profileImage";

const DEMO_CREATOR_HANDLES = new Set([
  "mira-vale",
  "atlas-studio",
  "noor-patel",
  "common-field",
  "elian-ross",
]);

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

export function creatorProfileUrl(handle: string) {
  return creatorCanonicalUrl(handle);
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
  const result = await httpsCallable<Record<string, never>, { profile: CreatorProfile | null }>(
    firebaseFunctions,
    "getMyLieuvaCreatorProfile",
  )({});
  return result.data.profile;
}

export async function checkCreatorHandle(handle: string) {
  const result = await httpsCallable<{ handle: string }, { handle: string; available: boolean }>(
    firebaseFunctions,
    "checkLieuvaCreatorHandle",
  )({ handle });
  return result.data;
}

export async function saveCreatorProfile(profile: CreatorProfile) {
  const result = await httpsCallable<CreatorProfile, { profile: CreatorProfile; publicUrl: string }>(
    firebaseFunctions,
    "saveLieuvaCreatorProfile",
  )(profile);
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
