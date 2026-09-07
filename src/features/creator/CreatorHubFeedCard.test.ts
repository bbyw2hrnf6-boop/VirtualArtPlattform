import { describe, expect, it } from "vitest";
import hubSource from "./CreatorHubPage.tsx?raw";

describe("Creator Hub feed card actions", () => {
  it("keeps creator identity as the profile link and removes the old visit action", () => {
    expect(hubSource).toContain('className="creator-post__identity"');
    expect(hubSource).toContain("creator?.imagePresent");
    expect(hubSource).not.toContain("Visit Creator");
    expect(hubSource).not.toContain("Visit Profile");
  });

  it("uses an icon-only appreciation and a reduced Discuss action with accessible state", () => {
    expect(hubSource).toContain('className={`creator-post__action');
    expect(hubSource).toContain('<HubIcon name="heart" />');
    expect(hubSource).toContain('<HubIcon name="comment" />');
    expect(hubSource).toContain('aria-label={post.viewerReacted ? "Remove appreciation" : "Appreciate this post"}');
    expect(hubSource).toContain('aria-pressed={Boolean(post.viewerReacted)}');
    expect(hubSource).toContain('aria-expanded={activePost === post.id}');
    expect(hubSource).not.toContain('<span>Appreciate</span>');
    expect(hubSource).not.toContain("Safety ···");
  });

  it("moves report and block controls into the three-dot overflow", () => {
    expect(hubSource).toContain('className="creator-post__overflow"');
    expect(hubSource).toContain('aria-label="More post actions"');
    expect(hubSource).toContain("Safety and reporting");
    expect(hubSource).toContain("Report post");
    expect(hubSource).toContain("Block Creator");
    expect(hubSource).not.toContain("Safety ···");
  });

  it("offers emoji input and persistent reply-aware discussions", () => {
    expect(hubSource).toContain("Add emoji to studio note");
    expect(hubSource).toContain("Add emoji to comment");
    expect(hubSource).toContain("loadCreatorPostComments");
    expect(hubSource).toContain("parentCommentId");
    expect(hubSource).toContain(">Reply</button>");
  });
});
