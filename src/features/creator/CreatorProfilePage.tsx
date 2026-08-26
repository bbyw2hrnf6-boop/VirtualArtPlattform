import { useEffect, useMemo, useState } from "react";
import { Logo } from "../../components/Logo";
import { SpaceShareMenu } from "../../components/SpaceShareMenu";
import { AccountButton } from "../account/AccountDialog";
import {
  creatorProfileUrl,
  creatorImageUrl,
  loadPublicCreatorProfile,
  type PublicCreatorPayload,
} from "../../services/creatorProfile";
import { spaceCanonicalUrl } from "../../services/spaceRoutes";
import { trackTelemetry } from "../../services/telemetry";
import "./creatorProfile.css";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; payload: PublicCreatorPayload }
  | { status: "not-found" }
  | { status: "error" };

export default function CreatorProfilePage({ handle }: { handle: string }) {
  const serverState = document
    .querySelector('meta[name="lieuva:creator-state"]')
    ?.getAttribute("content");
  const [state, setState] = useState<LoadState>(() =>
    serverState === "unavailable" ? { status: "not-found" } : { status: "loading" },
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (serverState === "unavailable") return;
    const controller = new AbortController();
    void loadPublicCreatorProfile(handle, controller.signal)
      .then((payload) => setState(payload ? { status: "ready", payload } : { status: "not-found" }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error" });
      });
    return () => controller.abort();
  }, [attempt, handle, serverState]);

  const profile = state.status === "ready" ? state.payload.profile : null;
  useEffect(() => {
    if (state.status === "ready") trackTelemetry("creator_profile_viewed", { outcome: "ready" });
  }, [state.status]);
  const initials = useMemo(() => profile?.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() ?? "L", [profile?.displayName]);

  if (state.status === "loading") return <main className="creator-profile-state" role="status">Preparing Creator profile…</main>;
  if (state.status === "error") return (
    <main className="creator-profile-state creator-profile-state--error">
      <Logo dark />
      <p className="eyebrow">Connection interrupted</p>
      <h1>Profile unavailable.</h1>
      <p>The public profile may still be live. Try again.</p>
      <button type="button" onClick={() => { setState({ status: "loading" }); setAttempt((value) => value + 1); }}>Try again</button>
    </main>
  );
  if (state.status === "not-found" || !profile) return (
    <main className="creator-profile-state">
      <Logo dark />
      <p className="eyebrow">Private or unavailable</p>
      <h1>This Creator profile isn’t public.</h1>
      <p>Nothing private is shown here.</p>
      <a href="/">Return to LIEUVA</a>
    </main>
  );

  return (
    <main className="creator-profile">
      <header className="creator-profile__nav">
        <a href="/" aria-label="LIEUVA home"><Logo dark /></a>
        <div>
          <SpaceShareMenu
            compact
            url={creatorProfileUrl(profile.handle)}
            title={profile.displayName}
            creator={profile.displayName}
            visibility="public"
            source="creator_profile"
            subject="Creator profile"
          />
          <AccountButton light />
        </div>
      </header>
      <section className="creator-profile__hero" aria-labelledby="creator-profile-title">
        <div className="creator-profile__mark" aria-hidden="true">
          {profile.imagePresent
            ? <img src={creatorImageUrl(profile.handle)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : initials}
        </div>
        <div className="creator-profile__identity">
          <p className="eyebrow">LIEUVA Creator</p>
          <h1 id="creator-profile-title">{profile.displayName}</h1>
          <span>@{profile.handle}</span>
          {profile.bio && <p className="creator-profile__bio">{profile.bio}</p>}
          {profile.links.length > 0 && (
            <nav className="creator-profile__links" aria-label={`${profile.displayName} links`}>
              {profile.links.map((link) => (
                <a key={`${link.label}:${link.url}`} href={link.url} target="_blank" rel="noopener noreferrer">
                  {link.label} <span aria-hidden="true">↗</span>
                </a>
              ))}
            </nav>
          )}
        </div>
      </section>
      <section className="creator-profile__portfolio" aria-labelledby="creator-spaces-title">
        <div className="creator-profile__section-heading">
          <p className="eyebrow">Public portfolio</p>
          <h2 id="creator-spaces-title">Spaces</h2>
          <span>{state.payload.spaces.length}</span>
        </div>
        {state.payload.spaces.length ? (
          <div className="creator-profile__grid">
            {state.payload.spaces.map((space, index) => (
              <a key={space.id} className="creator-space-card" href={spaceCanonicalUrl(space.id)}>
                <div className="creator-space-card__cover">
                  {space.coverUrl
                    ? <img src={space.coverUrl} alt="" loading={index > 1 ? "lazy" : "eager"} decoding="async" />
                    : <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>}
                </div>
                <div><small>Immersive Space</small><h3>{space.title}</h3><span>Enter →</span></div>
              </a>
            ))}
          </div>
        ) : (
          <p className="creator-profile__empty">No active public Spaces yet.</p>
        )}
      </section>
      <footer className="creator-profile__footer"><span>Give your work a place.</span><a href="/#/create">Create a Space →</a></footer>
    </main>
  );
}
