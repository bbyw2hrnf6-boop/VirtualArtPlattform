import { useEffect, useMemo, useState } from "react";
import { Logo } from "../../components/Logo";
import { SpaceShareMenu } from "../../components/SpaceShareMenu";
import { AccountButton } from "../account/AccountDialog";
import {
  creatorProfileUrl,
  creatorImageUrl,
  loadPublicCreatorProfile,
  manageCreatorFollow,
  type CreatorFollowState,
  type PublicCreatorPayload,
} from "../../services/creatorProfile";
import type { AccountSession } from "../../services/accountTypes";
import { spaceCanonicalUrl } from "../../services/spaceRoutes";
import { trackTelemetry } from "../../services/telemetry";
import { applyPageMetadata, publicCreatorMetadataPolicy } from "../../services/pageMetadata";
import { isDemoCreatorHandle } from "./demoCreators";
import "./creatorProfile.css";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; payload: PublicCreatorPayload }
  | { status: "not-found" }
  | { status: "error" };

type CreatorProfilePageProps = {
  handle: string;
  embedded?: boolean;
  hubSession?: AccountSession | null;
  onRequireAccount?: () => void;
};

export default function CreatorProfilePage({
  handle,
  embedded = false,
  hubSession,
  onRequireAccount,
}: CreatorProfilePageProps) {
  const deliveredCanonical = document
    .querySelector<HTMLLinkElement>('link[rel="canonical"]')
    ?.href;
  const serverState = deliveredCanonical
    && new URL(deliveredCanonical, window.location.href).pathname === new URL(creatorProfileUrl(handle)).pathname
      ? document.querySelector('meta[name="lieuva:creator-state"]')?.getAttribute("content")
      : undefined;
  const demoProfile = isDemoCreatorHandle(handle);
  const [state, setState] = useState<LoadState>(() =>
    serverState === "unavailable" && !demoProfile ? { status: "not-found" } : { status: "loading" },
  );
  const [attempt, setAttempt] = useState(0);
  const [accountOpen, setAccountOpen] = useState(false);
  const [localSession, setLocalSession] = useState<AccountSession | null>(null);
  const [followState, setFollowState] = useState<CreatorFollowState>();
  const [followBusy, setFollowBusy] = useState(false);
  const session = embedded ? hubSession ?? null : localSession;

  useEffect(() => {
    if (serverState === "unavailable" && !demoProfile) return;
    const controller = new AbortController();
    void loadPublicCreatorProfile(handle, controller.signal)
      .then((payload) => setState(payload ? { status: "ready", payload } : { status: "not-found" }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error" });
      });
    return () => controller.abort();
  }, [attempt, demoProfile, handle, serverState]);

  const profile = state.status === "ready" ? state.payload.profile : null;
  const spaces = state.status === "ready" ? state.payload.spaces : [];
  const posts = state.status === "ready" ? state.payload.posts ?? [] : [];
  const featuredSpace = spaces[0];
  useEffect(() => {
    if (!profile || profile.demo || !session || session.isAnonymous) return;
    let active = true;
    void manageCreatorFollow(profile.handle, "status")
      .then((result) => { if (active) setFollowState(result); })
      .catch(() => { if (active) setFollowState(undefined); });
    return () => { active = false; };
  }, [profile, session]);
  useEffect(() => {
    if (state.status === "ready") {
      trackTelemetry("creator_profile_viewed", { outcome: "ready" });
      applyPageMetadata(publicCreatorMetadataPolicy(
        state.payload.profile,
        state.payload.spaces[0]?.coverUrl,
      ));
    }
  }, [state]);
  const initials = useMemo(() => profile?.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() ?? "L", [profile?.displayName]);

  const StateRoot = embedded ? "section" : "main";
  if (state.status === "loading") return <StateRoot className={`creator-profile-state${embedded ? " creator-profile-state--embedded" : ""}`} role="status">Preparing Creator profile…</StateRoot>;
  if (state.status === "error") return (
    <StateRoot className={`creator-profile-state creator-profile-state--error${embedded ? " creator-profile-state--embedded" : ""}`}>
      {!embedded ? <Logo dark /> : null}
      <p className="eyebrow">Connection interrupted</p>
      <h1>Profile unavailable.</h1>
      <p>The public profile may still be live. Try again.</p>
      <button type="button" onClick={() => { setState({ status: "loading" }); setAttempt((value) => value + 1); }}>Try again</button>
    </StateRoot>
  );
  if (state.status === "not-found" || !profile) return (
    <StateRoot className={`creator-profile-state${embedded ? " creator-profile-state--embedded" : ""}`}>
      {!embedded ? <Logo dark /> : null}
      <p className="eyebrow">Private or unavailable</p>
      <h1>This Creator profile isn’t public.</h1>
      <p>Nothing private is shown here.</p>
      <a href="/creators">Return to Creator directory</a>
    </StateRoot>
  );

  const Root = embedded ? "section" : "main";
  return (
    <Root className={`creator-profile${embedded ? " creator-profile--embedded" : ""}`}>
      {!embedded ? <header className="creator-profile__nav">
        <Logo dark />
        <nav aria-label="LIEUVA navigation">
          <a href="/">LIEUVA home</a>
          <a className="is-active" href="/creator-hub">Creator Hub</a>
          <a href="/?explore=spaces">Explore Spaces</a>
        </nav>
        <div className="creator-profile__nav-actions">
          <SpaceShareMenu
            compact
            url={creatorProfileUrl(profile.handle)}
            title={profile.displayName}
            creator={profile.displayName}
            visibility="public"
            source="creator_profile"
            subject="Creator profile"
          />
          <AccountButton light open={accountOpen} onOpenChange={setAccountOpen} onSessionChange={(next) => { setLocalSession(next); if (!next || next.isAnonymous) setFollowState(undefined); }} />
        </div>
      </header> : (
        <header className="creator-profile__embedded-toolbar">
          <a href="/creators"><span aria-hidden="true">←</span> All Creators</a>
          <SpaceShareMenu
            compact
            url={creatorProfileUrl(profile.handle)}
            title={profile.displayName}
            creator={profile.displayName}
            visibility="public"
            source="creator_profile"
            subject="Creator profile"
          />
        </header>
      )}
      <section className="creator-profile__hero" aria-labelledby="creator-profile-title">
        <div className="creator-profile__identity">
          <div className="creator-profile__mark" aria-hidden="true">
            {profile.imagePresent
              ? <img src={creatorImageUrl(profile.handle)} alt="" />
              : initials}
          </div>
          <p className="eyebrow"><span aria-hidden="true" /> LIEUVA Creator</p>
          <h1 id="creator-profile-title">{profile.displayName}</h1>
          <p className="creator-profile__handle">@{profile.handle}</p>
          {profile.bio && <p className="creator-profile__bio">{profile.bio}</p>}
          <div className="creator-profile__social">
            {!profile.demo && !followState?.isSelf && (
              <button
                type="button"
                className={followState?.following ? "is-following" : ""}
                aria-pressed={Boolean(followState?.following)}
                disabled={followBusy || (Boolean(session && !session.isAnonymous) && followState?.canFollow === false)}
                onClick={() => {
                  if (!session || session.isAnonymous) {
                    if (embedded) onRequireAccount?.();
                    else setAccountOpen(true);
                    return;
                  }
                  if (!followState?.canFollow) return;
                  setFollowBusy(true);
                  void manageCreatorFollow(profile.handle, followState.following ? "unfollow" : "follow")
                    .then(setFollowState)
                    .finally(() => setFollowBusy(false));
                }}
              >
                {followBusy ? "Updating…" : followState?.following ? "Following" : "Follow"}
              </button>
            )}
            {!profile.demo && session && !session.isAnonymous && followState?.canFollow === false && !followState.isSelf && (
              <small>Activate your public Creator profile to follow.</small>
            )}
            {profile.demo && <small>Demo profile · editorial preview</small>}
          </div>
          {profile.links.length > 0 && (
            <nav className="creator-profile__links" aria-label={`${profile.displayName} links`}>
              {profile.links.map((link) => (
                <a key={`${link.label}:${link.url}`} href={link.url} target="_blank" rel="noopener noreferrer">
                  {link.label} <span aria-hidden="true">↗</span>
                </a>
              ))}
            </nav>
          )}
          <dl className="creator-profile__facts" aria-label={`${profile.displayName} profile overview`}>
            <div><dt>Public Spaces</dt><dd>{spaces.length}</dd></div>
            <div><dt>Studio Notes</dt><dd>{posts.length}</dd></div>
            <div><dt>Followers</dt><dd>{followState?.followerCount ?? profile.followerCount ?? 0}</dd></div>
          </dl>
        </div>
        {featuredSpace ? (
          <a className="creator-profile__featured-space" href={spaceCanonicalUrl(featuredSpace.id)}>
            <div className="creator-profile__featured-media">
              {featuredSpace.coverUrl
                ? <img src={featuredSpace.coverUrl} alt="" decoding="async" fetchPriority="high" />
                : <span aria-hidden="true">01</span>}
            </div>
            <div className="creator-profile__featured-copy">
              <p><span>Latest Space</span><small>01 / {String(spaces.length).padStart(2, "0")}</small></p>
              <h2>{featuredSpace.title}</h2>
              <span>Enter immersive Space <b aria-hidden="true">↗</b></span>
            </div>
          </a>
        ) : (
          <div className="creator-profile__featured-space creator-profile__featured-space--empty">
            <div className="creator-profile__featured-media" aria-hidden="true"><span>00</span></div>
            <div className="creator-profile__featured-copy"><p><span>Public portfolio</span></p><h2>Space in progress.</h2><span>No active public Spaces yet</span></div>
          </div>
        )}
      </section>
      <section className="creator-profile__portfolio" aria-labelledby="creator-spaces-title">
        <div className="creator-profile__section-heading">
          <div><p className="eyebrow">Public portfolio</p><h2 id="creator-spaces-title">Spaces on this profile.</h2></div>
          <p>Immersive work published by {profile.displayName}. Enter each Space directly in your browser.</p>
          <span>{String(spaces.length).padStart(2, "0")}</span>
        </div>
        {spaces.length ? (
          <div className="creator-profile__grid">
            {spaces.map((space, index) => (
              <a key={space.id} className="creator-space-card" href={spaceCanonicalUrl(space.id)}>
                <div className="creator-space-card__cover">
                  {space.coverUrl
                    ? <img src={space.coverUrl} alt="" loading={index > 0 ? "lazy" : "eager"} decoding="async" />
                    : <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>}
                </div>
                <div><small>{String(index + 1).padStart(2, "0")} · Immersive Space</small><h3>{space.title}</h3><span>Enter <b aria-hidden="true">↗</b></span></div>
              </a>
            ))}
          </div>
        ) : (
          <p className="creator-profile__empty">No active public Spaces yet.</p>
        )}
      </section>
      {posts.length ? (
        <section className="creator-profile__posts" aria-labelledby="creator-posts-title">
          <div className="creator-profile__section-heading">
            <div><p className="eyebrow">From the practice</p><h2 id="creator-posts-title">Studio Notes.</h2></div>
            <p>Process, changes and ideas shared with the LIEUVA Creator community.</p>
            <span>{String(posts.length).padStart(2, "0")}</span>
          </div>
          <div className="creator-profile__post-list">
            {posts.map((post) => (
              <article key={post.id}>
                <div><span>@{post.handle}</span><time dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleDateString("en", { day: "2-digit", month: "short", year: "numeric" })}</time></div>
                <p>{post.body}</p>
                <small>{post.demo ? "Demo profile · editorial preview" : "Studio Note"}</small>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      {!embedded ? <footer className="creator-profile__footer"><div><Logo /><p>Immersive Spaces, published in the browser.</p></div><nav aria-label="Creator profile footer"><a href="/creator-hub">Creator Hub →</a><a href="/creators">Creator directory →</a><a href="/?explore=spaces">Explore Spaces →</a><a href="/#/create">Create a Space →</a></nav></footer> : null}
    </Root>
  );
}
