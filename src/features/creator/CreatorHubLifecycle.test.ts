import { describe, expect, it } from "vitest";
import accountSource from "../account/AccountDialog.tsx?raw";
import hubSource from "./CreatorHubPage.tsx?raw";

describe("Creator Hub account lifecycle contract", () => {
  it("keeps account subscriptions stable when parents pass a fresh callback", () => {
    expect(accountSource).toContain("const onSessionChangeRef = useRef(onSessionChange)");
    expect(accountSource).toContain("onSessionChangeRef.current?.(next)");
    expect(accountSource).toContain("const handleSessionChange = useCallback(");
  });

  it("loads the canonical profile once per account identity, not per hydrated session object", () => {
    expect(hubSource).toContain("const sessionUid = session && !session.isAnonymous ? session.uid : \"\"");
    expect(hubSource).toContain("}, [profileRefresh, sessionUid]);");
    expect(hubSource).not.toContain("<AccountButton light onSessionChange={(next)");
  });

  it("never guesses a new handle before refreshing the existing profile", () => {
    const refresh = hubSource.indexOf("const currentProfile = await loadMyCreatorProfile()");
    const handle = hubSource.indexOf("let handle = currentProfile?.handle");
    expect(refresh).toBeGreaterThan(-1);
    expect(handle).toBeGreaterThan(refresh);
  });

  it("keeps the Hub grounded in real account work instead of invented dashboard data", () => {
    expect(hubSource).toContain("galleryRepository.mine()");
    expect(hubSource).toContain("const posts: CreatorPost[] = home?.posts ?? []");
    expect(hubSource).not.toContain("DEMO_CREATOR_POSTS");
    expect(hubSource).toContain("Your Spaces lead");
  });

  it("keeps the personal Hub separate from the public Creator directory", () => {
    expect(hubSource).toContain('<a href="/creators"><HubIcon name="search" /> Find Creators</a>');
    expect(hubSource).toContain('<a href="/creators"><HubIcon name="creators" /> Creators</a>');
    expect(hubSource).not.toContain('id="creator-directory"');
    expect(hubSource).not.toContain("searchPublicDirectory(spaces, creators, query)");
  });

  it("keeps mobile social navigation complete and opens the matching account surface", () => {
    expect(hubSource).toContain("creator-hub__mobile-account");
    expect(hubSource).toContain('href="#creator-profile"');
    expect(hubSource).toContain('accountSectionUrl("creator"');
    expect(hubSource).not.toContain('accountSectionUrl("account"');
    expect(hubSource).toContain('aria-current={activeSection === "feed" ? "page" : undefined}');
    expect(hubSource).not.toContain("Draft enabled · activate your profile to publish");
    expect(hubSource).toContain('record.ownerId === sessionUid || record.effectiveRole === "owner"');
  });

  it("surfaces only real activity on mobile and isolates comment drafts per post", () => {
    expect(hubSource).toContain("creator-hub__mobile-notifications");
    expect(hubSource).toContain('href="#creator-activity"');
    expect(hubSource).toContain('notification.kind === "follow"');
    expect(hubSource).toContain('notification.kind === "comment"');
    expect(hubSource).toContain('notification.kind === "reaction"');
    expect(hubSource).toContain("notificationCount ?");
    expect(hubSource).toContain('commentDrafts[post.id] ?? ""');
    expect(hubSource).not.toContain('const [commentBody, setCommentBody]');
  });
});
