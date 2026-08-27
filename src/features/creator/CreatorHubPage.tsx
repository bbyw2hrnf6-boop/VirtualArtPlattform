import { useEffect, useMemo, useState } from "react";
import { Logo } from "../../components/Logo";
import { AccountButton } from "../account/AccountDialog";
import type { AccountSession } from "../../services/accountTypes";
import {
  creatorImageUrl,
  loadCreatorHome,
  loadPublicCreatorDirectory,
  type CreatorHomePayload,
  type PublicCreatorDirectoryEntry,
} from "../../services/creatorProfile";
import { creatorCanonicalUrl, spaceCanonicalUrl } from "../../services/spaceRoutes";
import "./creatorHub.css";
import "./creatorHubMobile.css";

export default function CreatorHubPage() {
  const [session, setSession] = useState<AccountSession | null>(null);
  const [query, setQuery] = useState("");
  const [creators, setCreators] = useState<PublicCreatorDirectoryEntry[]>([]);
  const [home, setHome] = useState<CreatorHomePayload>();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    void loadPublicCreatorDirectory().then((value) => {
      setCreators(value.creators);
      setStatus("ready");
    }).catch(() => setStatus("error"));
  }, []);
  useEffect(() => {
    if (!session || session.isAnonymous) return;
    void loadCreatorHome().then(setHome).catch(() => setHome(undefined));
  }, [session]);
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? creators.filter((creator) => `${creator.displayName} ${creator.handle} ${creator.bio}`.toLowerCase().includes(needle)) : creators;
  }, [creators, query]);
  return (
    <main className="creator-hub">
      <header><a href="/" aria-label="LIEUVA home"><Logo dark /></a><nav><a href="/#/create">Create a Space</a><AccountButton light onSessionChange={setSession} /></nav></header>
      <section className="creator-hub__hero">
        <p className="eyebrow">Creator Space</p><h1>People, projects,<br/><em>new places.</em></h1>
        <p>Find public Creators, follow their practice and return to the Spaces they publish or update.</p>
        <label><span>Search Creators</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or @handle" /></label>
      </section>
      {session && !session.isAnonymous && (
        <section className="creator-hub__feed" aria-labelledby="creator-feed-title">
          <div><p className="eyebrow">Following</p><h2 id="creator-feed-title">Latest Space updates</h2></div>
          {home?.following.length ? <div className="creator-hub__following" aria-label="Creators you follow">{home.following.map((creator) => (
            <a key={creator.handle} href={creatorCanonicalUrl(creator.handle)}>
              <span>{creator.imagePresent ? <img src={creatorImageUrl(creator.handle)} alt="" loading="lazy"/> : creator.displayName.slice(0, 1)}</span>
              <div><strong>{creator.displayName}</strong><small>@{creator.handle}</small></div><b>→</b>
            </a>
          ))}</div> : null}
          {home?.updates.length ? <div className="creator-hub__updates">{home.updates.map((space) => (
            <a key={`${space.id}:${space.updatedAt}`} href={spaceCanonicalUrl(space.id)}>
              <div>{space.coverUrl ? <img src={space.coverUrl} alt="" loading="lazy" /> : null}</div>
              <small>@{space.handle}</small><h3>{space.title}</h3><span>Enter Space →</span>
            </a>
          ))}</div> : <p className="creator-hub__empty">Follow public Creators to build your home feed.</p>}
        </section>
      )}
      <section className="creator-hub__directory" aria-labelledby="creator-directory-title">
        <div><p className="eyebrow">Public directory</p><h2 id="creator-directory-title">Creators</h2><span>{results.length}</span></div>
        {status === "loading" && <p>Preparing Creator Space…</p>}
        {status === "error" && <p>The Creator directory is temporarily unavailable.</p>}
        <div className="creator-hub__grid">{results.map((creator) => (
          <a key={creator.handle} href={creatorCanonicalUrl(creator.handle)}>
            <span>{creator.imagePresent ? <img src={creatorImageUrl(creator.handle)} alt="" loading="lazy"/> : creator.displayName.slice(0, 1)}</span>
            <small>@{creator.handle}</small><h3>{creator.displayName}</h3><p>{creator.bio || "Public Creator on LIEUVA"}</p><b>View profile →</b>
          </a>
        ))}</div>
      </section>
    </main>
  );
}
