import { describe, expect, it } from "vitest";
import { createGalleryDraft } from "../gallery/editor/draftDefaults";
import type { GalleryRecord } from "../../services/galleryRepository";
import type { StoredGalleryDraft } from "../../services/draftStorage";
import { galleryDraftSignature, publishedProjectState } from "./projectWorkspace";

const liveRoom = (): GalleryRecord => ({
  ...createGalleryDraft("white-cube"),
  id: "space-1",
  ownerId: "owner-1",
  publishedAt: "2026-08-20T10:00:00.000Z",
  updatedAt: "2026-08-21T10:00:00.000Z",
  expiresAt: "2027-08-20T10:00:00.000Z",
  visibility: "public",
  retention: "account-preview",
  accessVersion: 1,
  revision: 4,
  lifecycleStatus: "active",
});

const localProject = (room: GalleryRecord): StoredGalleryDraft => ({
  projectId: "published-space-1",
  templateId: room.templateId,
  schemaVersion: 2,
  revision: 7,
  savedAt: "2026-08-21T11:00:00.000Z",
  draft: { ...room },
  publication: {
    id: room.id,
    ownerId: room.ownerId!,
    publishedAt: room.publishedAt,
    expiresAt: room.expiresAt,
    visibility: room.visibility,
    retention: room.retention,
    accessVersion: 1,
    revision: room.revision,
    role: "owner",
  },
  publishedDraftSignature: galleryDraftSignature(room),
});

describe("published creator workspace state", () => {
  it("distinguishes live, local changes, and a stale conflict", () => {
    const room = liveRoom();
    const stored = localProject(room);
    expect(publishedProjectState(room, stored).state).toBe("published");

    stored.draft = { ...stored.draft, title: "Local title" };
    expect(publishedProjectState(room, stored).state).toBe("changes");

    stored.publication = { ...stored.publication!, revision: 3 };
    expect(publishedProjectState(room, stored)).toMatchObject({
      state: "conflict",
      label: "Review conflict",
    });
  });

  it("does not include temporary image source URLs in the authored signature", () => {
    const draft = createGalleryDraft("white-cube");
    draft.artworks = [{
      id: "art-1",
      title: "Work",
      src: "blob:first",
      aspect: 1,
      wall: "north",
      x: 0,
      y: 1.55,
      scale: 1,
      frame: "none",
      mat: "none",
      locked: false,
      hidden: false,
    }];
    expect(galleryDraftSignature(draft)).toBe(
      galleryDraftSignature({
        ...draft,
        artworks: [{ ...draft.artworks[0], src: "https://storage.example/work.jpg" }],
      }),
    );
  });
});
