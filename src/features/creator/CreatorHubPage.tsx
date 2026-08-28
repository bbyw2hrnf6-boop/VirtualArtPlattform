import { useEffect, useMemo, useState } from "react";
import { Logo } from "../../components/Logo";
import { AccountButton } from "../account/AccountDialog";
import type { AccountSession } from "../../services/accountTypes";
import {
  checkCreatorHandle,
  createCreatorPost,
  creatorHandleBase,
  creatorImageUrl,
  loadCreatorHome,
  loadMyCreatorProfile,
  loadPublicCreatorDirectory,
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
import { DEMO_CREATOR_POSTS } from "./demoCreators";
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

export default function CreatorHubPage() {
  const [session, setSession] = useState<AccountSession | null>(null);
  const [query, setQuery] = useState("");
  const [creators, setCreators] = useState<PublicCreatorDirectoryEntry[]>([]);
  const [home, setHome] = useState<CreatorHomePayload>();
  const [myProfile, setMyProfile] = useState<CreatorProfile | null>();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [postBody, setPostBody] = useState("");
  const [postBusy, setPostBusy] = useState(false);
  const [postNotice, setPostNotice] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileNotice, setProfileNotice] = useState("");
  const [activePost, setActivePost] = useState<string>();
  const [commentBody, setCommentBody] = useState("");
  const [postActions, setPostActions] = useState<Record<string, string>>({});
  const [newComments, setNewComments] = useState<Record<string, CreatorComment[]>>({});

  useEffect(() => {
    void loadPublicCreatorDirectory().then((value) => {
      setCreators(value.creators);
      setStatus("ready");
    }).catch(() => setStatus("error"));
  }, []);

  useEffect(() => {
    if (!session || session.isAnonymous) return;
    let active = true;
    setMyProfile(undefined);
    void loadCreatorHome()
      .then((nextHome) => { if (active) setHome(nextHome); })
      .catch(() => { if (active) setHome(undefined); });
    void loadMyCreatorProfile()
      .then((profile) => { if (active) setMyProfile(profile); })
      .catch(() => { if (active) setMyProfile(null); });
    return () => { active = false; };
  }, [session]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? creators.filter((creator) => `${creator.displayName} ${creator.handle} ${creator.bio}`.toLowerCase().includes(needle))
      : creators;
  }, [creators, query]);
  const signedIn = Boolean(session && !session.isAnonymous);
  const posts: CreatorPost[] = home?.posts?.length ? home.posts : DEMO_CREATOR_POSTS;

  const activateCreatorHub = async () => {
    if (!session || session.isAnonymous || profileBusy) return;
    setProfileBusy(true);
    setProfileNotice("Preparing your public Creator profile…");
    try {
      let handle = myProfile?.handle;
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
      const displayName = myProfile?.displayName
        || session.displayName
        || session.nickname
        || session.email?.split("@")[0]
        || "LIEUVA Creator";
      const saved = await saveCreatorProfile({
        handle,
        displayName,
        bio: myProfile?.bio ?? "",
        links: myProfile?.links ?? [],
        profilePublic: true,
        imagePresent: myProfile?.imagePresent ?? false,
      });
      setMyProfile(saved.profile);
      setProfileNotice(`Creator Hub active as @${saved.profile.handle}.`);
      void loadCreatorHome().then(setHome).catch(() => undefined);
    } catch (error) {
      setProfileNotice(error instanceof Error ? error.message.replace(/^Firebase:\s*/i, "") : "Creator profile setup failed.");
    } finally {
      setProfileBusy(false);
    }
  };

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
        const body = commentBody.trim();
        if (!body) return;
        const result = await interactCreatorPost(post.handle, post.id, { action: "comment", body });
        if (result.comment) setNewComments((value) => ({ ...value, [post.id]: [...(value[post.id] ?? []), result.comment!] }));
        updatePost(post.id, { commentCount: post.commentCount + 1 });
        setCommentBody("");
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
      <header>
        <a href="/" aria-label="LIEUVA home"><Logo dark /></a>
        <nav aria-label="Creator Hub navigation">
          <a href="#creator-home">Home</a>
          {myProfile?.profilePublic && <a href={creatorCanonicalUrl(myProfile.handle)}>My profile</a>}
          <a href="/#/create">Create a Space</a>
          <AccountButton light onSessionChange={(next) => {
            setSession(next);
            if (!next || next.isAnonymous) {
              setHome(undefined);
              setMyProfile(undefined);
            }
          }} />
        </nav>
      </header>

      <section className="creator-hub__hero" id="creator-home">
        <div>
          <p className="eyebrow">Creator Hub · Community</p>
          <h1>Make a place.<br/><em>Share the process.</em></h1>
        </div>
        <div className="creator-hub__hero-copy">
          <p>A social home for the people behind LIEUVA Spaces. Follow practices, post studio notes and return to new work as it develops.</p>
          <a href="#creator-feed">Open the feed <span aria-hidden="true">↓</span></a>
        </div>
        <label className="creator-hub__search">
          <span>Search the public community</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Creator, practice or @handle" />
          <i aria-hidden="true">⌕</i>
        </label>
      </section>

      <section className="creator-hub__workspace" aria-label="Your Creator workspace">
        <div className="creator-hub__identity-panel">
          <p className="eyebrow">Your Creator profile</p>
          {signedIn && myProfile?.profilePublic ? (
            <>
              <div className="creator-hub__my-identity">
                <span><CreatorMark creator={myProfile} /></span>
                <div><h2>{myProfile.displayName}</h2><p>@{myProfile.handle}</p></div>
              </div>
              <nav>
                <a href={creatorCanonicalUrl(myProfile.handle)}>View my public profile <b>→</b></a>
                <a href="/#/create">Create a new Space <b>→</b></a>
                <a href="/#/account">Edit profile and account <b>→</b></a>
              </nav>
            </>
          ) : (
            <>
              <h2>{signedIn ? "Introduce your practice." : "Your work has a social home."}</h2>
              <p>{signedIn ? "Activate a public profile here to post and follow. Your published rooms remain separate Creator Spaces." : "Sign in to publish studio notes, follow Creators and keep your own profile close."}</p>
              {signedIn ? (
                <>
                  <button className="creator-hub__primary-action" type="button" disabled={profileBusy} onClick={() => void activateCreatorHub()}>{profileBusy ? "Activating…" : myProfile ? "Make profile public" : "Activate Creator Hub profile"} <span>→</span></button>
                  <a className="creator-hub__secondary-action" href="/#/account">Customize profile in Account</a>
                  {profileNotice && <small className="creator-hub__profile-notice" aria-live="polite">{profileNotice}</small>}
                </>
              ) : <a className="creator-hub__primary-action" href="/#/account">Sign in or create account <span>→</span></a>}
            </>
          )}
        </div>

        <form className="creator-hub__composer" onSubmit={(event) => { event.preventDefault(); publishPost(); }}>
          <div><p className="eyebrow">Post an update</p><span>{postBody.length}/600</span></div>
          <h2>What is changing in your practice?</h2>
          <textarea
            value={postBody}
            onChange={(event) => setPostBody(event.target.value.slice(0, 600))}
            placeholder={signedIn ? "Write your update here. Activate a public Creator profile before publishing." : "Sign in to write and publish an update."}
            disabled={!signedIn || postBusy}
            rows={5}
          />
          <div className="creator-hub__composer-actions">
            <small aria-live="polite">{postNotice || (myProfile?.profilePublic ? "Text only · public to the LIEUVA community" : signedIn ? "Draft enabled · activate your profile to publish" : "Sign in to write and publish")}</small>
            <button type="submit" disabled={!postBody.trim() || !myProfile?.profilePublic || postBusy}>{postBusy ? "Posting…" : "Post to feed"}</button>
          </div>
        </form>
      </section>

      <section className="creator-hub__social" id="creator-feed" aria-labelledby="creator-feed-title">
        <div className="creator-hub__section-heading">
          <div><p className="eyebrow">Community home</p><h2 id="creator-feed-title">From the feed</h2></div>
          <p>{home?.posts?.length ? "Updates from you and Creators you follow." : "A preview of how the Creator community comes alive."}</p>
        </div>
        <div className="creator-hub__social-grid">
          <div className="creator-hub__timeline">
            {posts.map((post) => (
              <article className="creator-post" key={post.id}>
                <header>
                  <a href={creatorCanonicalUrl(post.handle)} className="creator-post__mark" aria-label={`${post.displayName} profile`}>{post.displayName.slice(0, 1)}</a>
                  <div><a href={creatorCanonicalUrl(post.handle)}>{post.displayName}</a><span>@{post.handle}</span></div>
                  <time dateTime={post.createdAt}>{relativeDate(post.createdAt)}</time>
                </header>
                <p>{post.body}</p>
                <footer className="creator-post__actions">
                  <button type="button" className={post.viewerReacted ? "is-active" : ""} onClick={() => void engage(post, "reaction")}>◇ Appreciate <b>{post.reactionCount ?? 0}</b></button>
                  <button type="button" onClick={() => setActivePost(activePost === post.id ? undefined : post.id)}>Discuss <b>{post.commentCount ?? 0}</b></button>
                  <details><summary>Safety ···</summary><div><button type="button" onClick={() => void engage(post, "report")}>Report post</button><button type="button" onClick={() => void engage(post, "block")}>Block Creator</button></div></details>
                  <a href={creatorCanonicalUrl(post.handle)}>Visit Creator <b>→</b></a>
                </footer>
                {activePost === post.id && <div className="creator-post__discussion">
                  {(newComments[post.id] ?? []).map((comment) => <p key={comment.id}><strong>{comment.displayName}</strong> {comment.body}</p>)}
                  <form onSubmit={(event) => { event.preventDefault(); void engage(post, "comment"); }}>
                    <label><span className="visually-hidden">Comment on this post</span><input value={commentBody} onChange={(event) => setCommentBody(event.target.value.slice(0, 280))} placeholder="Add a considered comment…" disabled={!signedIn || Boolean(post.demo)} /></label>
                    <button type="submit" disabled={!commentBody.trim() || !signedIn || Boolean(post.demo)}>Post</button>
                  </form>
                </div>}
                {postActions[post.id] && <small className="creator-post__notice" aria-live="polite">{postActions[post.id]}</small>}
              </article>
            ))}
          </div>
          <aside className="creator-hub__rail">
            {home?.notifications?.length ? <div className="creator-hub__notifications"><p className="eyebrow">Notifications</p>{home.notifications.slice(0, 4).map((notification) => <a key={notification.id} href={creatorCanonicalUrl(notification.actorHandle)}><strong>{notification.actorDisplayName}</strong><span>{notification.kind === "follow" ? " followed you" : notification.kind === "comment" ? " commented on your post" : " appreciated your post"}</span><time>{relativeDate(notification.createdAt)}</time></a>)}</div> : null}
            <p className="eyebrow">Following</p>
            <h3>{home?.following.length ? "Your circle" : "Build your circle"}</h3>
            {home?.following.length ? <div className="creator-hub__following" aria-label="Creators you follow">{home.following.map((creator) => (
              <a key={creator.handle} href={creatorCanonicalUrl(creator.handle)}>
                <span><CreatorMark creator={creator} /></span>
                <div><strong>{creator.displayName}</strong><small>@{creator.handle}</small></div><b>→</b>
              </a>
            ))}</div> : <p>Follow a public Creator and their newest posts and Spaces will appear here.</p>}
            <a href="#creator-directory">Discover Creators <span>↓</span></a>
          </aside>
        </div>
      </section>

      {home?.updates.length ? (
        <section className="creator-hub__feed" aria-labelledby="creator-space-updates-title">
          <div className="creator-hub__section-heading"><div><p className="eyebrow">New places</p><h2 id="creator-space-updates-title">Space updates</h2></div></div>
          <div className="creator-hub__updates">{home.updates.map((space) => (
            <a key={`${space.id}:${space.updatedAt}`} href={spaceCanonicalUrl(space.id)}>
              <div>{space.coverUrl ? <img src={space.coverUrl} alt="" loading="lazy" /> : null}</div>
              <small>@{space.handle}</small><h3>{space.title}</h3><span>Enter Space →</span>
            </a>
          ))}</div>
        </section>
      ) : null}

      <section className="creator-hub__directory" id="creator-directory" aria-labelledby="creator-directory-title">
        <div className="creator-hub__section-heading">
          <div><p className="eyebrow">Public directory</p><h2 id="creator-directory-title">Creators</h2></div>
          <span>{results.length} profiles</span>
        </div>
        {status === "loading" && <p>Preparing Creator Hub…</p>}
        {status === "error" && <p>The live directory is temporarily unavailable.</p>}
        <div className="creator-hub__grid">{results.map((creator) => (
          <a key={creator.handle} href={creatorCanonicalUrl(creator.handle)}>
            <div className="creator-hub__directory-top"><span><CreatorMark creator={creator} /></span>{creator.demo && <small>Demo profile</small>}</div>
            <p className="creator-hub__handle">@{creator.handle}</p><h3>{creator.displayName}</h3><p>{creator.bio || "Public Creator on LIEUVA"}</p>
            <div><span>{creator.followerCount ?? 0} followers</span><b>View profile →</b></div>
          </a>
        ))}</div>
      </section>
    </main>
  );
}
