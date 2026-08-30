import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Logo } from "../../components/Logo";
import { AccountButton } from "../account/AccountDialog";
import { accountSectionUrl } from "../account/accountPresentation";
import type { AccountSession } from "../../services/accountTypes";
import { discoverCoverSource, galleryRepository, type GalleryRecord } from "../../services/galleryRepository";
import {
  announceCreatorProfileUpdated,
  checkCreatorHandle,
  CREATOR_PROFILE_UPDATED_EVENT,
  creatorActionErrorMessage,
  createCreatorPost,
  creatorHandleBase,
  creatorImageUrl,
  loadCreatorHome,
  loadMyCreatorProfile,
  interactCreatorPost,
  manageCreatorBlock,
  saveCreatorProfile,
  type CreatorComment,
  type CreatorHomePayload,
  type CreatorPost,
  type CreatorProfile,
  type PublicCreatorDirectoryEntry,
} from "../../services/creatorProfile";
import { creatorCanonicalUrl, spaceCanonicalUrl } from "../../services/spaceRoutes";
import {
  CREATOR_HUB_TARGETS,
  creatorHubSectionAtViewportAnchor,
  creatorHubSectionFromHash,
  creatorHubTargetFromHash,
  type CreatorHubSection,
} from "./creatorHubNavigation";
import "./creatorHub.css";
import "./creatorHubMobile.css";

function relativeDate(value: string) {
  const elapsed = Date.now() - new Date(value).getTime();
  const hours = Math.max(0, Math.floor(elapsed / 3_600_000));
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Yesterday" : `${days}d ago`;
}

function CreatorMark({ creator }: { creator: Pick<PublicCreatorDirectoryEntry, "displayName" | "handle" | "imagePresent"> }) {
  return creator.imagePresent
    ? <img src={creatorImageUrl(creator.handle)} alt="" loading="lazy" />
    : <>{creator.displayName.slice(0, 1).toUpperCase()}</>;
}

type HubIconName = "home" | "feed" | "creators" | "spaces" | "account" | "bell" | "search";

function HubIcon({ name }: { name: HubIconName }) {
  const paths: Record<HubIconName, ReactNode> = {
    home: <><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V21h13V9.5M9.5 21v-7h5v7"/></>,
    feed: <><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
    creators: <><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3.5 20c.4-4.4 2.1-6.5 5.5-6.5s5.1 2.1 5.5 6.5M14 14.5c3.8-.7 6.1 1.2 6.5 5.5"/></>,
    spaces: <><path d="m12 2 8.5 5v10L12 22l-8.5-5V7z"/><path d="m3.5 7 8.5 5 8.5-5M12 12v10"/></>,
    account: <><circle cx="12" cy="8" r="3.5"/><path d="M4.5 21c.5-5.2 2.8-7.7 7.5-7.7s7 2.5 7.5 7.7"/></>,
    bell: <><path d="M6.5 9a5.5 5.5 0 0 1 11 0c0 6 2.5 6.5 2.5 6.5H4S6.5 15 6.5 9Z"/><path d="M9.5 19a3 3 0 0 0 5 0"/></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}

function SpaceCover({ src, fallback = "Space preview preparing" }: { src?: string | null; fallback?: string }) {
  return <>
    <span className="creator-hub__cover-fallback" aria-hidden="true">{fallback}</span>
    {src ? <img
      src={src}
      alt=""
      loading="lazy"
      onError={(event) => { event.currentTarget.style.display = "none"; }}
    /> : null}
  </>;
}

export default function CreatorHubPage() {
  const [session, setSession] = useState<AccountSession | null>(null);
  const [spaces, setSpaces] = useState<GalleryRecord[]>([]);
  const [mySpaces, setMySpaces] = useState<GalleryRecord[]>([]);
  const [home, setHome] = useState<CreatorHomePayload>();
  const [myProfile, setMyProfile] = useState<CreatorProfile | null>();
  const [homeStatus, setHomeStatus] = useState<"loading" | "error">();
  const [mySpacesStatus, setMySpacesStatus] = useState<"loading" | "error">();
  const [profileStatus, setProfileStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [profileRefresh, setProfileRefresh] = useState(0);
  const [postBody, setPostBody] = useState("");
  const [postBusy, setPostBusy] = useState(false);
  const [postNotice, setPostNotice] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileNotice, setProfileNotice] = useState("");
  const [activePost, setActivePost] = useState<string>();
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [postActions, setPostActions] = useState<Record<string, string>>({});
  const [newComments, setNewComments] = useState<Record<string, CreatorComment[]>>({});
  const [activeSection, setActiveSection] = useState<CreatorHubSection>(() => creatorHubSectionFromHash(window.location.hash));
  const sessionUid = session && !session.isAnonymous ? session.uid : "";

  useEffect(() => {
    let hashFrame = 0;
    let mountFrame = 0;
    let settleFrame = 0;
    let scrollFrame = 0;
    let hashNavigationPending = false;

    const cancelHashFrames = () => {
      window.cancelAnimationFrame(hashFrame);
      window.cancelAnimationFrame(mountFrame);
      window.cancelAnimationFrame(settleFrame);
    };
    const syncSectionFromScroll = () => {
      scrollFrame = 0;
      const root = document.querySelector<HTMLElement>(".creator-hub");
      const scrollOffset = Number.parseFloat(root ? getComputedStyle(root).getPropertyValue("--hub-scroll-offset") : "") || 84;
      const targets = CREATOR_HUB_TARGETS.flatMap(({ id, section }) => {
        const element = document.getElementById(id);
        return element ? [{ section, top: element.getBoundingClientRect().top }] : [];
      });
      const nextSection = creatorHubSectionAtViewportAnchor(targets, scrollOffset);
      setActiveSection((current) => current === nextSection ? current : nextSection);
    };
    const scheduleScrollSync = () => {
      if (hashNavigationPending || scrollFrame) return;
      scrollFrame = window.requestAnimationFrame(syncSectionFromScroll);
    };
    const scrollToHashTarget = () => {
      const target = creatorHubTargetFromHash(window.location.hash);
      if (!target) {
        hashNavigationPending = false;
        scheduleScrollSync();
        return;
      }

      cancelHashFrames();
      hashNavigationPending = true;
      setActiveSection(creatorHubSectionFromHash(window.location.hash));
      hashFrame = window.requestAnimationFrame(() => {
        mountFrame = window.requestAnimationFrame(() => {
          document.getElementById(target)?.scrollIntoView({ block: "start" });
          settleFrame = window.requestAnimationFrame(() => {
            hashNavigationPending = false;
            scheduleScrollSync();
          });
        });
      });
    };

    window.addEventListener("hashchange", scrollToHashTarget);
    window.addEventListener("scroll", scheduleScrollSync, { passive: true });
    window.addEventListener("resize", scheduleScrollSync);
    scrollToHashTarget();
    return () => {
      cancelHashFrames();
      window.cancelAnimationFrame(scrollFrame);
      window.removeEventListener("hashchange", scrollToHashTarget);
      window.removeEventListener("scroll", scheduleScrollSync);
      window.removeEventListener("resize", scheduleScrollSync);
    };
  }, []);

  useEffect(() => {
    void galleryRepository.discover().then(setSpaces).catch(() => setSpaces([]));
  }, []);

  useEffect(() => {
    if (!sessionUid) {
      setHome(undefined);
      setMySpaces([]);
      setHomeStatus(undefined);
      setMySpacesStatus(undefined);
      return;
    }
    let active = true;
    setProfileStatus("loading");
    setHomeStatus("loading");
    setMySpacesStatus("loading");
    setMyProfile(undefined);
    void loadCreatorHome()
      .then((nextHome) => { if (active) { setHome(nextHome); setHomeStatus(undefined); } })
      .catch(() => { if (active) { setHome(undefined); setHomeStatus("error"); } });
    void galleryRepository.mine()
      .then((records) => {
        if (active) {
          setMySpaces(records.filter((record) => (
            record.lifecycleStatus !== "trashed"
            && (record.ownerId === sessionUid || record.effectiveRole === "owner")
          )));
          setMySpacesStatus(undefined);
        }
      })
      .catch(() => { if (active) { setMySpaces([]); setMySpacesStatus("error"); } });
    void loadMyCreatorProfile()
      .then((profile) => {
        if (!active) return;
        setMyProfile(profile);
        setProfileStatus("ready");
        setProfileNotice("");
      })
      .catch((error) => {
        if (!active) return;
        setMyProfile(undefined);
        setProfileStatus("error");
        setProfileNotice(creatorActionErrorMessage(error, "Profile refresh failed. Retry."));
      });
    return () => { active = false; };
  }, [profileRefresh, sessionUid]);

  useEffect(() => {
    const syncProfile = (event: Event) => {
      const profile = (event as CustomEvent<CreatorProfile>).detail;
      if (profile) {
        setMyProfile(profile);
        setProfileStatus("ready");
        void loadCreatorHome().then(setHome).catch(() => undefined);
      }
    };
    window.addEventListener(CREATOR_PROFILE_UPDATED_EVENT, syncProfile);
    return () => window.removeEventListener(CREATOR_PROFILE_UPDATED_EVENT, syncProfile);
  }, []);

  const signedIn = Boolean(session && !session.isAnonymous);
  const posts: CreatorPost[] = home?.posts ?? [];
  const notifications = useMemo(() => (home?.notifications ?? []).filter((notification) => (
    notification.kind === "follow"
    || notification.kind === "comment"
    || notification.kind === "reaction"
  )), [home?.notifications]);
  const notificationCount = notifications.length;
  const featuredSpaces = useMemo(() => {
    if (home?.updates?.length) return home.updates.map((space) => ({
      id: space.id,
      title: space.title,
      creator: space.creator,
      handle: space.handle,
      coverUrl: space.coverUrl,
      updatedAt: space.updatedAt,
    }));
    return spaces.slice(0, 6).map((space) => ({
      id: space.id,
      title: space.title,
      creator: space.artist,
      handle: "",
      coverUrl: discoverCoverSource(space) ?? "",
      updatedAt: space.updatedAt,
    }));
  }, [home?.updates, spaces]);
  const heroCover = mySpaces.map(discoverCoverSource).find(Boolean)
    ?? featuredSpaces.map((space) => space.coverUrl).find(Boolean)
    ?? "";
  const visibleMySpaces = mySpaces.slice(0, 4);
  const accountOverviewUrl = accountSectionUrl("rooms", window.location.href);
  const accountProfileUrl = accountSectionUrl("creator", window.location.href);

  const activateCreatorHub = async () => {
    if (!session || session.isAnonymous || profileBusy) return;
    setProfileBusy(true);
    setProfileNotice("Preparing Creator profile…");
    try {
      const currentProfile = await loadMyCreatorProfile();
      if (currentProfile?.profilePublic) {
        setMyProfile(currentProfile);
        setProfileStatus("ready");
        setProfileNotice(`Creator Hub already active as @${currentProfile.handle}.`);
        return;
      }
      let handle = currentProfile?.handle;
      if (!handle) {
        const base = creatorHandleBase(session);
        const suffix = Date.now().toString(36).slice(-4);
        const candidates = [
          base,
          `${base.slice(0, 23).replace(/-+$/g, "")}-studio`,
          `${base.slice(0, 25).replace(/-+$/g, "")}-${suffix}`,
        ];
        for (const candidate of candidates) {
          if ((await checkCreatorHandle(candidate)).available) {
            handle = candidate;
            break;
          }
        }
      }
      if (!handle) throw new Error("Choose a custom handle in Account.");
      const displayName = currentProfile?.displayName
        || session.displayName
        || session.nickname
        || session.email?.split("@")[0]
        || "LIEUVA Creator";
      const saved = await saveCreatorProfile({
        handle,
        displayName,
        bio: currentProfile?.bio ?? "",
        links: currentProfile?.links ?? [],
        profilePublic: true,
        imagePresent: currentProfile?.imagePresent ?? false,
      });
      setMyProfile(saved.profile);
      setProfileStatus("ready");
      announceCreatorProfileUpdated(saved.profile);
      setProfileNotice(`Creator Hub active as @${saved.profile.handle}.`);
      void loadCreatorHome().then(setHome).catch(() => undefined);
    } catch (error) {
      setProfileNotice(creatorActionErrorMessage(
        error,
        "Activation timed out. Retry or finish the profile in Account.",
      ));
    } finally {
      setProfileBusy(false);
    }
  };

  const handleSessionChange = useCallback((next: AccountSession | null) => {
    setSession(next);
    if (!next || next.isAnonymous) {
      setHome(undefined);
      setMyProfile(undefined);
      setMySpaces([]);
      setProfileStatus("idle");
    }
  }, []);

  const publishPost = () => {
    const body = postBody.trim();
    if (!body || postBusy) return;
    setPostBusy(true);
    setPostNotice("");
    void createCreatorPost(body)
      .then((post) => {
        setHome((current) => ({
          schemaVersion: 1,
          following: current?.following ?? [],
          updates: current?.updates ?? [],
          posts: [post, ...(current?.posts ?? [])],
          notifications: current?.notifications ?? [],
        }));
        setPostBody("");
        setPostNotice("Posted to your Creator feed.");
      })
      .catch((error: unknown) => {
        setPostNotice(error instanceof Error ? error.message.replace(/^Firebase:\s*/i, "") : "The post could not be published.");
      })
      .finally(() => setPostBusy(false));
  };

  const updatePost = (postId: string, update: Partial<CreatorPost>) => setHome((current) => current ? ({
    ...current,
    posts: current.posts.map((post) => post.id === postId ? { ...post, ...update } : post),
  }) : current);

  const engage = async (post: CreatorPost, action: "reaction" | "comment" | "report" | "block") => {
    if (!signedIn) { setPostActions((value) => ({ ...value, [post.id]: "Sign in to join the conversation." })); return; }
    if (post.demo) { setPostActions((value) => ({ ...value, [post.id]: "Demo profiles are read-only." })); return; }
    setPostActions((value) => ({ ...value, [post.id]: "Working…" }));
    try {
      if (action === "reaction") {
        const result = await interactCreatorPost(post.handle, post.id, { action: post.viewerReacted ? "unreact" : "react" });
        updatePost(post.id, { viewerReacted: result.reacted, reactionCount: result.reactionCount ?? post.reactionCount });
        setPostActions((value) => ({ ...value, [post.id]: result.reacted ? "Appreciated." : "Appreciation removed." }));
      } else if (action === "comment") {
        const body = (commentDrafts[post.id] ?? "").trim();
        if (!body) return;
        const result = await interactCreatorPost(post.handle, post.id, { action: "comment", body });
        if (result.comment) setNewComments((value) => ({ ...value, [post.id]: [...(value[post.id] ?? []), result.comment!] }));
        updatePost(post.id, { commentCount: post.commentCount + 1 });
        setCommentDrafts((value) => ({ ...value, [post.id]: "" }));
        setPostActions((value) => ({ ...value, [post.id]: "Comment posted." }));
      } else if (action === "report") {
        await interactCreatorPost(post.handle, post.id, { action: "report", reason: "other" });
        setPostActions((value) => ({ ...value, [post.id]: "Report received for review." }));
      } else {
        await manageCreatorBlock(post.handle, "block");
        setHome((current) => current ? ({
          ...current,
          posts: current.posts.filter((item) => item.handle !== post.handle),
          following: current.following.filter((creator) => creator.handle !== post.handle),
        }) : current);
      }
    } catch (error) {
      setPostActions((value) => ({ ...value, [post.id]: error instanceof Error ? error.message.replace(/^Firebase:\s*/i, "") : "Action failed." }));
    }
  };

  return (
    <main className="creator-hub">
      <header className="creator-hub__global-header">
        <Logo dark />
        <nav className="creator-hub__global-context" aria-label="LIEUVA and Creator Hub">
          <a href="/">LIEUVA home <span aria-hidden="true">↗</span></a>
          <a href="/creators"><HubIcon name="search" /> Find Creators</a>
        </nav>
        <nav className="creator-hub__global-actions" aria-label="Creator actions">
          <a className="creator-hub__create" href="/#/create">Create a Space</a>
          <AccountButton light onSessionChange={handleSessionChange} />
        </nav>
      </header>

      <div className="creator-hub__shell">
        <aside className="creator-hub__sidebar" aria-label="Creator Hub local navigation">
          <nav>
            <a className={activeSection === "home" ? "is-active" : ""} aria-current={activeSection === "home" ? "page" : undefined} href="#creator-home"><HubIcon name="home" /> Hub Home</a>
            <a className={`creator-hub__feed-link ${activeSection === "feed" ? "is-active" : ""}`} aria-current={activeSection === "feed" ? "page" : undefined} href="#creator-feed"><HubIcon name="feed" /> Feed</a>
            <a href="/creators"><HubIcon name="creators" /> Creators</a>
            <a className={`creator-hub__mobile-notifications ${activeSection === "notifications" ? "is-active" : ""}`} aria-current={activeSection === "notifications" ? "page" : undefined} href="#creator-activity" aria-label={notificationCount ? `Notifications (${notificationCount} recent)` : "Notifications"}><HubIcon name="bell" /> Alerts {notificationCount ? <b className="creator-hub__notification-badge">{notificationCount}</b> : null}</a>
            <a className={activeSection === "spaces" ? "is-active" : ""} aria-current={activeSection === "spaces" ? "page" : undefined} href="#creator-spaces"><HubIcon name="spaces" /> My Spaces</a>
            <a className={`creator-hub__mobile-account ${activeSection === "profile" ? "is-active" : ""}`} aria-current={activeSection === "profile" ? "page" : undefined} href="#creator-profile"><HubIcon name="account" /> Profile</a>
          </nav>
          {notificationCount ? <nav className="creator-hub__sidebar-utility">
            <a className={activeSection === "notifications" ? "is-active" : ""} aria-current={activeSection === "notifications" ? "page" : undefined} href="#creator-activity"><HubIcon name="bell" /> Notifications <b>{notificationCount}</b></a>
          </nav> : null}
          <a className="creator-hub__sidebar-identity" href={myProfile?.profilePublic ? creatorCanonicalUrl(myProfile.handle) : signedIn ? accountProfileUrl : "/#/account"}>
            <span>{myProfile ? <CreatorMark creator={myProfile} /> : (session?.displayName || session?.nickname || "L").slice(0, 1).toUpperCase()}</span>
            <div><strong>{myProfile?.displayName || session?.displayName || session?.nickname || "Your profile"}</strong><small>{myProfile ? `@${myProfile.handle}` : signedIn ? "Complete your profile" : "Sign in"}</small></div>
            <b>···</b>
          </a>
        </aside>

        <div className="creator-hub__content">
          <section className="creator-hub__hero" id="creator-home">
            <div className="creator-hub__hero-visual" style={{
              backgroundImage: `url(${JSON.stringify(heroCover || "/assets/demo/aura-hero-gallery.webp")})`,
            }}>
              <div>
                <p className="eyebrow">Creator Hub</p>
                <h1>Make a place.<br/><em>Share the process.</em></h1>
                <p>Your Spaces lead. Studio notes, people and conversation gather around the work.</p>
                <nav><a href="/#/create">Create a Space</a><a href="#creator-feed">Explore the feed</a></nav>
              </div>
            </div>
            <form className="creator-hub__composer" onSubmit={(event) => { event.preventDefault(); publishPost(); }}>
              <div><p className="eyebrow">Share a studio note</p><span>{postBody.length}/600</span></div>
              <textarea
                aria-label="Studio note"
                value={postBody}
                onChange={(event) => setPostBody(event.target.value.slice(0, 600))}
                placeholder={signedIn ? myProfile?.profilePublic ? "What are you working on?" : "Write a note. Activate your profile to publish." : "Sign in to write a studio note."}
                disabled={!signedIn || postBusy}
                rows={5}
              />
              <div className="creator-hub__composer-actions">
                <small aria-live="polite">{postNotice || (myProfile?.profilePublic ? "Public to the Creator community" : signedIn ? "Activate profile to publish" : "Sign in to write")}</small>
                {myProfile?.profilePublic
                  ? <button type="submit" disabled={!postBody.trim() || postBusy}>{postBusy ? "Posting…" : "Post to feed"}</button>
                  : <a className="creator-hub__composer-action" href={signedIn ? accountProfileUrl : "/#/account"}>{signedIn ? "Publish profile" : "Sign in to post"} <span aria-hidden="true">→</span></a>}
              </div>
            </form>
          </section>

          <dl className="creator-hub__pulse" aria-label="Your Creator Hub overview">
            <div><HubIcon name="creators" /><dt>Followers</dt><dd>{signedIn ? myProfile?.followerCount ?? 0 : "—"}</dd></div>
            <div><HubIcon name="feed" /><dt>Feed notes</dt><dd>{signedIn ? home?.posts?.length ?? 0 : "—"}</dd></div>
            <div><HubIcon name="spaces" /><dt>Your Spaces</dt><dd>{signedIn ? mySpaces.length : "—"}</dd></div>
            <div><HubIcon name="account" /><dt>Public profile</dt><dd>{myProfile?.profilePublic ? "Live" : profileStatus === "loading" ? "Syncing" : profileStatus === "error" ? "Retry" : signedIn ? "Draft" : "Sign in"}</dd></div>
          </dl>

          <section className="creator-hub__social" id="creator-feed" aria-labelledby="creator-feed-title">
            <div className="creator-hub__section-heading"><div><p className="eyebrow">From the feed</p><h2 id="creator-feed-title">Studio notes.</h2></div><p>Process updates from you and the Creators you follow. Spaces remain the work; notes show how it changes.</p></div>
            <div className="creator-hub__social-grid">
              <div className="creator-hub__timeline">
                {posts.length ? posts.map((post) => (
                  <article className="creator-post" key={post.id}>
                    <header><a href={creatorCanonicalUrl(post.handle)} className="creator-post__mark" aria-label={`${post.displayName} profile`}>{post.displayName.slice(0, 1)}</a><div><a href={creatorCanonicalUrl(post.handle)}>{post.displayName}</a><span>@{post.handle}</span></div><time dateTime={post.createdAt}>{relativeDate(post.createdAt)}</time></header>
                    <p>{post.body}</p>
                    <footer className="creator-post__actions">
                      <button type="button" className={post.viewerReacted ? "is-active" : ""} onClick={() => void engage(post, "reaction")}>◇ Appreciate <b>{post.reactionCount ?? 0}</b></button>
                      <button type="button" onClick={() => setActivePost(activePost === post.id ? undefined : post.id)}>Discuss <b>{post.commentCount ?? 0}</b></button>
                      <details><summary>Safety ···</summary><div><button type="button" onClick={() => void engage(post, "report")}>Report post</button><button type="button" onClick={() => void engage(post, "block")}>Block Creator</button></div></details>
                      <a href={creatorCanonicalUrl(post.handle)}>Visit Creator <b>→</b></a>
                    </footer>
                    {activePost === post.id && <div className="creator-post__discussion"><form onSubmit={(event) => { event.preventDefault(); void engage(post, "comment"); }}><label><span className="visually-hidden">Comment on this post</span><input value={commentDrafts[post.id] ?? ""} onChange={(event) => setCommentDrafts((value) => ({ ...value, [post.id]: event.target.value.slice(0, 280) }))} placeholder="Add a considered comment…" disabled={!signedIn || Boolean(post.demo)} /></label><button type="submit" disabled={!(commentDrafts[post.id] ?? "").trim() || !signedIn || Boolean(post.demo)}>Post</button></form>{(newComments[post.id] ?? []).map((comment) => <p key={comment.id}><strong>{comment.displayName}</strong> {comment.body}</p>)}</div>}
                    {postActions[post.id] && <small className="creator-post__notice" aria-live="polite">{postActions[post.id]}</small>}
                  </article>
                )) : <div className="creator-hub__empty creator-hub__empty--feed"><HubIcon name="feed" /><h3>{homeStatus === "error" ? "Feed connection paused." : homeStatus === "loading" ? "Loading your circle…" : "Your feed starts with real work."}</h3><p>{homeStatus === "error" ? "Your work is safe. Retry the live community feed." : signedIn ? "Follow a public Creator or publish a studio note. New Spaces and notes will appear here." : "Sign in, follow a Creator and return when their work changes."}</p>{homeStatus === "error" ? <button type="button" onClick={() => setProfileRefresh((value) => value + 1)}>Retry feed →</button> : <a href="/creators">Discover Creators →</a>}</div>}
              </div>
              <aside className="creator-hub__rail"><p className="eyebrow">Following</p><h3>{home?.following.length ? "Your circle" : "Build your circle"}</h3>{home?.following.length ? <div className="creator-hub__following" aria-label="Creators you follow">{home.following.map((creator) => <a key={creator.handle} href={creatorCanonicalUrl(creator.handle)}><span><CreatorMark creator={creator} /></span><div><strong>{creator.displayName}</strong><small>@{creator.handle}</small></div><b>→</b></a>)}</div> : <p>Follow a public Creator and their newest notes and Spaces will collect here.</p>}<a href="/creators">Discover Creators <span>↗</span></a></aside>
            </div>
          </section>

          <section className="creator-hub__work" aria-labelledby="creator-spaces-title">
            <div className="creator-hub__work-main">
              <div className="creator-hub__compact-heading"><div><p className="eyebrow">Your work</p><h2 id="creator-spaces-title">Spaces moving now.</h2></div></div>
              {featuredSpaces.length ? <div className="creator-hub__space-grid">{featuredSpaces.slice(0, 4).map((space) => (
                <a key={`${space.id}:${space.updatedAt ?? "space"}`} href={spaceCanonicalUrl(space.id)}>
                  <div><SpaceCover src={space.coverUrl} /></div>
                  <small>{space.handle ? `@${space.handle}` : space.creator}</small>
                  <h3>{space.title}</h3><span>Enter Space →</span>
                </a>
              ))}</div> : <div className="creator-hub__empty"><HubIcon name="spaces" /><h3>No public Space update yet.</h3><p>Create, publish and share the first place in this view.</p><a href="/#/create">Create a Space →</a></div>}
            </div>

            <aside className="creator-hub__dashboard-rail">
              <section id="creator-activity" className="creator-hub__notifications" aria-labelledby="creator-activity-title">
                <div><p className="eyebrow" id="creator-activity-title">Notifications</p><span>{notificationCount ? `${notificationCount} recent` : "Up to date"}</span></div>
                {homeStatus === "loading" ? <p role="status">Checking your activity…</p>
                  : homeStatus === "error" ? <p>Notifications could not sync. Retry from the Feed.</p>
                    : !signedIn ? <p>Sign in to see follows, comments and appreciations.</p>
                      : notifications.length ? notifications.map((notification) => <a key={notification.id} href={creatorCanonicalUrl(notification.actorHandle)} aria-label={`${notification.actorDisplayName}${notification.kind === "follow" ? " followed you" : notification.kind === "comment" ? " commented on your studio note" : " appreciated your studio note"}, ${relativeDate(notification.createdAt)}`}><strong>{notification.actorDisplayName}</strong><span>{notification.kind === "follow" ? " followed you" : notification.kind === "comment" ? " commented on your studio note" : " appreciated your studio note"}</span><time dateTime={notification.createdAt}>{relativeDate(notification.createdAt)}</time></a>)
                        : <p>No notifications yet. New follows, comments and appreciations will appear here.</p>}
              </section>

              <section id="creator-spaces" aria-labelledby="my-spaces-title">
                <div><p className="eyebrow" id="my-spaces-title">My Spaces</p><a href={accountOverviewUrl}>View all →</a></div>
                {visibleMySpaces.length ? <div className="creator-hub__my-spaces">{visibleMySpaces.map((space) => (
                  <a key={space.id} href={spaceCanonicalUrl(space.id)}>
                    <span><SpaceCover src={discoverCoverSource(space)} fallback={space.title.slice(0, 1)} /></span>
                    <div><strong>{space.title}</strong><small>{space.visibility} · {space.lifecycleStatus}</small></div>
                  </a>
                ))}</div> : <p>{mySpacesStatus === "error" ? "Spaces could not sync. Retry from your Account." : mySpacesStatus === "loading" ? "Syncing your Spaces…" : signedIn ? "Published Spaces from this account appear here." : "Sign in to return to your published Spaces."}</p>}
              </section>

              <section className="creator-hub__profile-card" id="creator-profile" aria-labelledby="creator-profile-title">
                <div><p className="eyebrow" id="creator-profile-title">Creator identity</p><span className={myProfile?.profilePublic ? "is-live" : ""}>{myProfile?.profilePublic ? "✓ Live" : profileStatus === "loading" ? "Syncing" : profileStatus === "error" ? "Sync paused" : signedIn ? "Private" : "Signed out"}</span></div>
                {signedIn && myProfile?.profilePublic ? <>
                  <div className="creator-hub__my-identity"><span><CreatorMark creator={myProfile} /></span><div><h3>{myProfile.displayName}</h3><p>@{myProfile.handle}</p></div></div>
                  {myProfile.bio && <p>{myProfile.bio}</p>}
                  <nav><a href={creatorCanonicalUrl(myProfile.handle)}>Open public profile <b>↗</b></a><a href={accountProfileUrl}>Edit profile <b>→</b></a></nav>
                </> : profileStatus === "loading" ? <p>Syncing the Creator identity attached to this account…</p> : profileStatus === "error" ? <><p>{profileNotice}</p><button className="creator-hub__primary-action" type="button" onClick={() => setProfileRefresh((value) => value + 1)}>Retry profile sync <span>→</span></button></> : signedIn ? <>
                  <h3>Introduce your practice.</h3><p>One public profile connects your Spaces, studio notes and follows.</p>
                  <button className="creator-hub__primary-action" type="button" disabled={profileBusy} onClick={() => void activateCreatorHub()}>{profileBusy ? "Activating…" : myProfile ? "Make profile public" : "Activate Hub profile"} <span>→</span></button>
                  <a className="creator-hub__secondary-action" href={accountProfileUrl}>Review in Account settings →</a>
                  {profileNotice && <small className="creator-hub__profile-notice" aria-live="polite">{profileNotice}</small>}
                </> : <><h3>Bring your practice into the Hub.</h3><p>Sign in to publish notes, follow Creators and keep your work close.</p><a className="creator-hub__primary-action" href="/#/account">Sign in or create account <span>→</span></a></>}
              </section>
            </aside>
          </section>
        </div>
      </div>
    </main>
  );
}
