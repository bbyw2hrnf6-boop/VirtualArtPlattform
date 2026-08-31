import { describe, expect, it } from "vitest";
import appSource from "../../App.tsx?raw";
import accountSource from "../account/AccountDialog.tsx?raw";
import hubSource from "./CreatorHubPage.tsx?raw";

describe("Creator Hub account lifecycle contract", () => {
  it("routes every clean Creator URL through the persistent Hub shell", () => {
    expect(appSource).toContain('<CreatorHubPage view={{ kind: "profile", handle: route.handle }} onNavigate={navigate} />');
    expect(appSource).toContain('<CreatorHubPage view={{ kind: "directory" }} onNavigate={navigate} />');
    expect(appSource).toContain('route.hubView === "settings" ? "settings" : "home"');
    expect(appSource).toContain('hubView: "settings"');
    expect(appSource).toContain("creatorExperienceNavigationPath(path, location.href)");
    expect(appSource).not.toContain('lazy(() => import("./features/creator/CreatorProfilePage")');
    expect(appSource).not.toContain('lazy(() => import("./features/creator/CreatorDirectoryPage")');
  });

  it("keeps account subscriptions stable when parents pass a fresh callback", () => {
    expect(accountSource).toContain("const onSessionChangeRef = useRef(onSessionChange)");
    expect(accountSource).toContain("onSessionChangeRef.current?.(next)");
    expect(accountSource).toContain("const handleSessionChange = useCallback(");
  });

  it("loads the canonical profile once per account identity, not per hydrated session object", () => {
    expect(hubSource).toContain("const sessionUid = session && !session.isAnonymous ? session.uid : \"\"");
    expect(hubSource).toContain("}, [dashboardView, profileRefresh, sessionUid]);");
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

  it("renders directory and public profiles inside the persistent Hub shell", () => {
    expect(hubSource).toContain('import CreatorDirectoryPage from "./CreatorDirectoryPage"');
    expect(hubSource).toContain('import CreatorProfilePage from "./CreatorProfilePage"');
    expect(hubSource).toContain('view.kind === "directory"');
    expect(hubSource).toContain('<CreatorDirectoryPage embedded />');
    expect(hubSource).toContain('<CreatorProfilePage');
    expect(hubSource).toContain('className={creatorsView ? "is-active" : ""}');
    expect(hubSource).toContain("creatorExperienceNavigationPath");
  });

  it("keeps mobile social navigation complete and opens the profile editor inside the Hub", () => {
    expect(hubSource).toContain("creator-hub__mobile-account");
    expect(hubSource).toContain('href={profileSettingsUrl}');
    expect(hubSource).toContain('view.kind === "settings"');
    expect(hubSource).toContain('<CreatorProfileSettings account={session} />');
    expect(hubSource).not.toContain('accountSectionUrl("creator"');
    expect(hubSource).not.toContain('accountSectionUrl("account"');
    expect(hubSource).toContain('aria-current={dashboardView && activeSection === "feed" ? "location" : undefined}');
    expect(hubSource).not.toContain("Draft enabled · activate your profile to publish");
    expect(hubSource).toContain('record.ownerId === sessionUid || record.effectiveRole === "owner"');
  });

  it("surfaces only real activity on mobile and isolates comment drafts per post", () => {
    expect(hubSource).toContain("creator-hub__mobile-notifications");
    expect(hubSource).toContain('href={dashboardHref("creator-activity")}');
    expect(hubSource).toContain('notification.kind === "follow"');
    expect(hubSource).toContain('notification.kind === "comment"');
    expect(hubSource).toContain('notification.kind === "reaction"');
    expect(hubSource).toContain("notificationCount ?");
    expect(hubSource).toContain('commentDrafts[post.id] ?? ""');
    expect(hubSource).not.toContain('const [commentBody, setCommentBody]');
  });
});
