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
    expect(hubSource).toContain("Spaces first");
  });

  it("searches both public Spaces and Creators from the Hub directory", () => {
    expect(hubSource).toContain("searchPublicDirectory(spaces, creators, query)");
    expect(hubSource).toContain("Search Spaces or Creators");
    expect(hubSource).toContain("Space title, Creator or @handle");
  });
});
