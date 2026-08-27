import { httpsCallable } from "firebase/functions";
import { firebaseFunctions } from "./firebase";
import { creatorCanonicalUrl } from "./spaceRoutes";
import { prepareProfileImage } from "./profileImage";

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
};
export type PublicCreatorDirectoryEntry = {
  handle: string;
  displayName: string;
  bio: string;
  imagePresent: boolean;
  followerCount?: number;
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
  const response = await fetch(`/creator-profiles/${encodeURIComponent(handle)}.json`, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Creator profile is temporarily unavailable.");
  return await response.json() as PublicCreatorPayload;
}

export async function loadPublicCreatorDirectory(signal?: AbortSignal) {
  const response = await fetch("/creator-directory.json", {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) throw new Error("Creator search is temporarily unavailable.");
  return await response.json() as PublicCreatorDirectoryPayload;
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
};

export async function loadCreatorHome() {
  const result = await httpsCallable<Record<string, never>, CreatorHomePayload>(
    firebaseFunctions,
    "getMyLieuvaCreatorHome",
  )({});
  return result.data;
}

export async function manageCreatorFollow(handle: string, action: "status" | "follow" | "unfollow") {
  const result = await httpsCallable<
    { handle: string; action: "status" | "follow" | "unfollow" },
    CreatorFollowState
  >(firebaseFunctions, "manageLieuvaCreatorFollow")({ handle, action });
  return result.data;
}
