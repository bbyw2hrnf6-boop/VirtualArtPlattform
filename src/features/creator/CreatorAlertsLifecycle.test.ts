import { describe, expect, it } from "vitest";
import functionsSource from "../../../functions/src/index.ts?raw";
import creatorServiceSource from "../../services/creatorProfile.ts?raw";
import hubSource from "./CreatorHubPage.tsx?raw";

describe("Creator Hub alerts lifecycle", () => {
  it("creates follow, comment and reaction alerts atomically with their actions", () => {
    expect(functionsSource).toContain("transaction.create(followNotificationReference");
    expect(functionsSource).toContain("transaction.create(commentNotificationReference");
    expect(functionsSource).toContain("transaction.create(reactionNotificationReference");
    expect(functionsSource).toContain("postId,\n          bodyPreview: body.slice(0, 100)");
    expect(functionsSource).toContain("creatorNotificationProjection(data");
  });

  it("keeps self interactions visible and restores the signed-in Creator's appreciation state", () => {
    expect(functionsSource).not.toContain("actorCreatorId !== targetCreatorId");
    expect(functionsSource).toContain("viewerReacted: reactedPostIndexes.has(index)");
    expect(functionsSource).toContain("posts: postsWithViewerState");
    expect(hubSource).toContain("result.reacted && post.handle === myProfile?.handle");
    expect(hubSource).toContain('notification.actorHandle === myProfile?.handle ? "You"');
  });

  it("keeps notification writes server-owned and exposes a bounded read action", () => {
    expect(functionsSource).toContain("export const markMyLieuvaCreatorNotificationsRead = onCall(");
    expect(functionsSource).toContain("requestedIds.length > 20");
    expect(functionsSource).toContain("db.collection(\"creatorNotifications\").doc(creatorId)");
    expect(functionsSource).toContain('where("read", "==", false).limit(400)');
    expect(functionsSource).not.toContain('orderBy("createdAt", "desc").limit(100)');
    expect(creatorServiceSource).toContain('"markMyLieuvaCreatorNotificationsRead"');
  });

  it("requires a public actor profile before creating a navigable follow alert", () => {
    expect(functionsSource).toContain('if (!actorProfile?.profilePublic)');
    expect(functionsSource).toContain('"Make your Creator profile public before following."');
    expect(functionsSource).toContain("actorHandle: actorProfile.handle");
    expect(functionsSource).not.toContain('actorHandle: actorProfile?.handle ?? "creator"');
  });

  it("refreshes activity and sends post alerts to the affected studio note", () => {
    expect(hubSource).toContain('window.addEventListener("focus", refreshWhenVisible)');
    expect(hubSource).toContain('document.addEventListener("visibilitychange", refreshWhenVisible)');
    expect(hubSource).toContain("window.setInterval(refreshWhenVisible, 60_000)");
    expect(hubSource).toContain("unreadCreatorNotificationCount(notifications)");
    expect(hubSource).toContain("creatorNotificationPostAnchor(notification)");
    expect(hubSource).toContain('id={`creator-post-${post.id}`}');
    expect(hubSource).toContain('markNotificationsRead("all")');
  });

  it("keeps Alerts available in both desktop and mobile Hub navigation", () => {
    expect(hubSource).toContain("creator-hub__mobile-notifications");
    expect(hubSource).toContain('<nav className="creator-hub__sidebar-utility">');
    expect(hubSource).not.toContain('{notificationCount ? <nav className="creator-hub__sidebar-utility">');
  });
});
