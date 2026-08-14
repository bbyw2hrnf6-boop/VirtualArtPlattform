export type GalleryVisibility = "public" | "unlisted" | "private";
export type GalleryRole = "owner" | "editor" | "viewer";
export type GalleryRetention = "guest-10-days" | "account-preview";

export type GalleryPublishOptions = {
  visibility: GalleryVisibility;
};

export type GalleryMember = {
  email: string;
  role: Exclude<GalleryRole, "owner">;
  addedAt: string;
};

export const visibilityLabel: Record<GalleryVisibility, string> = {
  public: "Public",
  unlisted: "Unlisted",
  private: "Private",
};
