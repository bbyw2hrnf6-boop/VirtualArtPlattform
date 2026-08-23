export type GalleryVisibility = "public" | "unlisted" | "private";
export type GalleryRole = "owner" | "editor" | "viewer";
export type GalleryRetention = "guest-10-days" | "account-preview";
export type GalleryLifecycleStatus = "active" | "archived" | "trashed";

export type GalleryPublishOptions = {
  visibility: GalleryVisibility;
};

export type GalleryMember = {
  email: string;
  role: Exclude<GalleryRole, "owner">;
  addedAt: string;
  status?: "active" | "pending";
  inviteId?: string;
};

export type GalleryInvite = {
  id: string;
  galleryId: string;
  galleryTitle: string;
  email: string;
  role: Exclude<GalleryRole, "owner">;
  expiresAt: string;
};

export type GalleryEditTarget = {
  id: string;
  ownerId: string;
  /** Account that created this device-local edit link; not a public ACL field. */
  accountUid?: string;
  publishedAt: string;
  expiresAt: string;
  visibility: GalleryVisibility;
  retention: GalleryRetention;
  accessVersion: number;
  revision: number;
  role: Extract<GalleryRole, "owner" | "editor">;
};

export const visibilityLabel: Record<GalleryVisibility, string> = {
  public: "Public",
  unlisted: "Unlisted",
  private: "Private",
};
