import { describe, expect, it } from "vitest";
import {
  creatorNotificationPostAnchor,
  creatorProfileSaveLabel,
  creatorProfileUrl,
  mergeCreatorHomeViewerState,
  unreadCreatorNotificationCount,
  type CreatorHomePayload,
  type CreatorNotification,
} from "./creatorProfile";

describe("Creator profile URLs", () => {
  it("uses the canonical clean public route", () => {
    expect(creatorProfileUrl("studio-north")).toBe("https://lieuva.com/creators/studio-north");
  });
});

describe("Creator profile lifecycle labels", () => {
  it.each([
    [false, false, "Save private draft"],
    [false, true, "Save and publish profile"],
    [true, true, "Save profile changes"],
    [true, false, "Save and make private"],
  ])("distinguishes persisted and edited visibility", (published, nextPublic, label) => {
    expect(creatorProfileSaveLabel(published, nextPublic)).toBe(label);
  });
});

describe("Creator notification presentation", () => {
  const notification = (overrides: Partial<CreatorNotification> = {}): CreatorNotification => ({
    id: "notice-1",
    kind: "comment",
    actorHandle: "studio-north",
    actorDisplayName: "Studio North",
    createdAt: "2026-08-31T12:00:00.000Z",
    read: false,
    postId: "post_123",
    ...overrides,
  });

  it("counts only unread notifications", () => {
    expect(unreadCreatorNotificationCount([
      notification(),
      notification({ id: "notice-2", read: true }),
      notification({ id: "notice-3", kind: "follow", postId: undefined }),
    ])).toBe(2);
  });

  it("targets comment and reaction alerts at the affected post", () => {
    expect(creatorNotificationPostAnchor(notification())).toBe("creator-post-post_123");
    expect(creatorNotificationPostAnchor(notification({ kind: "reaction" }))).toBe("creator-post-post_123");
    expect(creatorNotificationPostAnchor(notification({ kind: "follow" }))).toBeNull();
    expect(creatorNotificationPostAnchor(notification({ postId: undefined }))).toBeNull();
  });
});

describe("Creator home interaction state", () => {
  const payload = (viewerReacted?: boolean): CreatorHomePayload => ({
    schemaVersion: 1,
    following: [],
    updates: [],
    notifications: [],
    posts: [{
      id: "post_123",
      handle: "studio-north",
      displayName: "Studio North",
      body: "Working note",
      createdAt: "2026-08-31T12:00:00.000Z",
      reactionCount: 1,
      commentCount: 0,
      ...(viewerReacted === undefined ? {} : { viewerReacted }),
    }],
  });

  it("preserves an optimistic appreciation during lightweight home refreshes", () => {
    expect(mergeCreatorHomeViewerState(payload(true), payload()).posts[0]?.viewerReacted).toBe(true);
  });

  it("prefers fresh server state when the full viewer state was requested", () => {
    expect(mergeCreatorHomeViewerState(payload(true), payload(false)).posts[0]?.viewerReacted).toBe(false);
  });
});
