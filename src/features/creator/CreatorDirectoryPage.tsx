import { useCallback, useEffect, useMemo, useState } from "react";
import { Logo } from "../../components/Logo";
import {
  creatorImageUrl,
  loadPublicCreatorDirectory,
  type PublicCreatorDirectoryEntry,
} from "../../services/creatorProfile";
import {
  discoverCoverSource,
  galleryRepository,
  type GalleryRecord,
} from "../../services/galleryRepository";
import { creatorCanonicalUrl, spaceCanonicalUrl } from "../../services/spaceRoutes";
import { TEMPLATES } from "../gallery/templates";
import { DEMO_CREATORS } from "./demoCreators";
import "./creatorDirectory.css";

type ResourceState<T> =
  | { status: "loading"; data: T }
  | { status: "ready"; data: T }
  | { status: "error"; data: T };

type DirectoryState = {
  creators: ResourceState<PublicCreatorDirectoryEntry[]>;
  spaces: ResourceState<GalleryRecord[]>;
};

const INITIAL_STATE: DirectoryState = {
  creators: { status: "loading", data: [] },
  spaces: { status: "loading", data: [] },
};

function searchable(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim();
}

function filterCreatorDirectory(
  creators: PublicCreatorDirectoryEntry[],
  spaces: GalleryRecord[],
  query: string,
) {
  const term = searchable(query);
  if (!term) return { creators, spaces };
  return {
    creators: creators.filter((creator) =>
      searchable(`${creator.displayName} ${creator.handle} ${creator.bio}`).includes(term),
    ),
    spaces: spaces.filter((space) =>
      searchable(`${space.title} ${space.artist}`).includes(term),
    ),
  };
}

function initialsFor(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "L";
}

function CreatorPortrait({ creator }: { creator: PublicCreatorDirectoryEntry }) {
  return (
    <span className="creator-directory-card__portrait" aria-hidden="true">
      <b>{initialsFor(creator.displayName)}</b>
      {creator.imagePresent && !creator.demo ? (
        <img
          src={creatorImageUrl(creator.handle)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={(event) => { event.currentTarget.hidden = true; }}
        />
      ) : null}
    </span>
  );
}

function SpaceCover({ space }: { space: GalleryRecord }) {
  const fallback = `/assets/templates/${space.templateId}-preview.webp`;
  return (
    <img
      src={discoverCoverSource(space) ?? fallback}
      alt={`${space.title} room view`}
      loading="lazy"
      decoding="async"
      onError={(event) => {
        if (event.currentTarget.dataset.fallback === "true") return;
        event.currentTarget.dataset.fallback = "true";
        event.currentTarget.src = fallback;
      }}
    />
  );
}

function LoadingCards({ label }: { label: string }) {
  return (
    <div className="creator-directory__loading" role="status">
      <span className="visually-hidden">{label}</span>
      {[0, 1, 2].map((item) => <i key={item} aria-hidden="true" />)}
    </div>
  );
}

export default function CreatorDirectoryPage({ embedded = false }: { embedded?: boolean }) {
  const [state, setState] = useState<DirectoryState>(INITIAL_STATE);
  const [query, setQuery] = useState("");
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(() => {
    const controller = new AbortController();

    void loadPublicCreatorDirectory(controller.signal)
      .then((payload) => {
        setState((current) => ({
          ...current,
          creators: { status: "ready", data: payload.creators },
        }));
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState((current) => ({
          ...current,
          creators: { status: "error", data: [] },
        }));
      });

    void galleryRepository.discover()
      .then((spaces) => {
        if (controller.signal.aborted) return;
        setState((current) => ({
          ...current,
          spaces: { status: "ready", data: spaces },
        }));
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setState((current) => ({
          ...current,
          spaces: { status: "error", data: [] },
        }));
      });

    return () => controller.abort();
  }, []);

  useEffect(() => load(), [attempt, load]);

  const retry = () => {
    setState(INITIAL_STATE);
    setAttempt((value) => value + 1);
  };

  const results = useMemo(
    () => filterCreatorDirectory(state.creators.data, state.spaces.data, query),
    [query, state.creators.data, state.spaces.data],
  );
  const isSearching = Boolean(query.trim());
  const allFailed = state.creators.status === "error" && state.spaces.status === "error";
  const hasError = state.creators.status === "error" || state.spaces.status === "error";
  const allReady = state.creators.status === "ready" && state.spaces.status === "ready";
  const allSettled = state.creators.status !== "loading" && state.spaces.status !== "loading";
  const noResults = allReady && isSearching && !results.creators.length && !results.spaces.length;
  const resultCount = results.creators.length + results.spaces.length;
  const Root = embedded ? "section" : "main";

  return (
    <Root className={`creator-directory${embedded ? " creator-directory--embedded" : ""}`}>
      {!embedded ? <header className="creator-directory__nav">
        <Logo dark />
        <nav aria-label="Public Creator directory navigation">
          <a href="/">Home</a>
          <a className="is-active" href="/creators" aria-current="page">Creators</a>
          <a href="/creator-hub">Creator Hub</a>
        </nav>
        <a className="creator-directory__hub-link" href="/creator-hub">
          Open Creator Hub <span aria-hidden="true">↗</span>
        </a>
      </header> : null}

      <section className="creator-directory__hero" aria-labelledby="creator-directory-title">
        <div>
          <p className="eyebrow"><i aria-hidden="true" /> Public community</p>
          <h1 id="creator-directory-title">Follow the work.</h1>
          <p>Meet the people behind LIEUVA Spaces. Explore public practices, published rooms and the ideas taking shape between them.</p>
        </div>
        <dl aria-label="Public directory overview">
          <div><dt>Live Creators</dt><dd>{state.creators.status === "ready" ? state.creators.data.length : "—"}</dd></div>
          <div><dt>Live Spaces</dt><dd>{state.spaces.status === "ready" ? state.spaces.data.length : "—"}</dd></div>
          <div><dt>Access</dt><dd>Public</dd></div>
        </dl>
      </section>

      <section className="creator-directory__search" aria-label="Search the public community">
        <label htmlFor="creator-directory-query">Search creators and Spaces</label>
        <div>
          <input
            id="creator-directory-query"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Creator, practice, Space or @handle"
            autoComplete="off"
            aria-controls="creator-directory-results"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear directory search">Clear</button>
          ) : <span aria-hidden="true">⌕</span>}
        </div>
        <p aria-live="polite">
          {!allSettled
            ? "Loading the public directory…"
            : hasError
              ? `${resultCount} available live ${resultCount === 1 ? "result" : "results"}. Part of the live directory is unavailable. Editorial previews are separate.`
              : `${resultCount} live ${resultCount === 1 ? "result" : "results"}${isSearching ? ` for “${query.trim()}”` : ""}. Editorial previews are separate.`}
        </p>
      </section>

      <div id="creator-directory-results">
        {allFailed ? (
          <section className="creator-directory__fatal" role="alert">
            <p className="eyebrow">Connection interrupted</p>
            <h2>The community is still there.</h2>
            <p>The public directory could not be reached. Nothing private was requested or shown.</p>
            <button type="button" onClick={retry}>Try again</button>
          </section>
        ) : noResults ? (
          <section className="creator-directory__empty" role="status">
            <p className="eyebrow">No public match</p>
            <h2>{isSearching ? "Try a broader search." : "The first public work is on its way."}</h2>
            <p>{isSearching ? "Search by Creator name, handle, practice or Space title." : "Only public Creator profiles and published public Spaces appear here."}</p>
            {isSearching ? <button type="button" onClick={() => setQuery("")}>Show the full directory</button> : null}
          </section>
        ) : (
          <>
            <section className="creator-directory__section creator-directory__section--creators" aria-labelledby="public-creators-title">
              <header>
                <div><p className="eyebrow">Published profiles</p><h2 id="public-creators-title">Live Creators.</h2></div>
                <p>Only profiles returned by the public community directory. Editorial examples are excluded from this count.</p>
                <span>{state.creators.status === "ready" ? String(results.creators.length).padStart(2, "0") : "—"}</span>
              </header>

              {state.creators.status === "loading" ? <LoadingCards label="Loading public Creators…" /> : null}
              {state.creators.status === "error" ? (
                <div className="creator-directory__inline-error" role="status">
                  <p>Creator profiles are temporarily unavailable.</p>
                  <button type="button" onClick={retry}>Retry directory</button>
                </div>
              ) : null}
              {state.creators.status === "ready" && (results.creators.length ? (
                <div className="creator-directory__creator-grid">
                  {results.creators.map((creator, index) => (
                    <a
                      className="creator-directory-card"
                      href={creatorCanonicalUrl(creator.handle, window.location.href)}
                      key={creator.handle}
                    >
                      <span className="creator-directory-card__number">{String(index + 1).padStart(2, "0")}</span>
                      <CreatorPortrait creator={creator} />
                      <span className="creator-directory-card__identity">
                        <small>@{creator.handle}</small>
                        <strong>{creator.displayName}</strong>
                      </span>
                      <span className="creator-directory-card__bio">{creator.bio || "Public Creator profile on LIEUVA."}</span>
                      <span className="creator-directory-card__meta">
                        <small>{creator.followerCount ?? 0} followers</small>
                        <b aria-hidden="true">↗</b>
                      </span>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="creator-directory__section-empty">{isSearching ? "No live Creator matches this search." : "No live Creator profiles are published yet."}</p>
              ))}
            </section>

            <section className="creator-directory__section creator-directory__section--spaces" aria-labelledby="public-spaces-title">
              <header>
                <div><p className="eyebrow">Published in the browser</p><h2 id="public-spaces-title">Live Spaces.</h2></div>
                <p>Enter public rooms directly. Every card links to the current published Space.</p>
                <span>{state.spaces.status === "ready" ? String(results.spaces.length).padStart(2, "0") : "—"}</span>
              </header>

              {state.spaces.status === "loading" ? <LoadingCards label="Loading public Spaces…" /> : null}
              {state.spaces.status === "error" ? (
                <div className="creator-directory__inline-error" role="status">
                  <p>Published Spaces could not be loaded. Creator profiles above remain available.</p>
                  <button type="button" onClick={retry}>Retry Spaces</button>
                </div>
              ) : null}
              {state.spaces.status === "ready" && (results.spaces.length ? (
                <div className="creator-directory__space-grid">
                  {results.spaces.map((space, index) => (
                    <a
                      className="creator-directory-space"
                      href={spaceCanonicalUrl(space.id, location.href)}
                      key={space.id}
                    >
                      <span className="creator-directory-space__visual"><SpaceCover space={space} /><small>Live Space</small></span>
                      <span className="creator-directory-space__copy">
                        <small>{space.artist} · {TEMPLATES.find((template) => template.id === space.templateId)?.name ?? "LIEUVA"}</small>
                        <strong>{space.title}</strong>
                        <span>Enter Space <b aria-hidden="true">↗</b></span>
                      </span>
                      <i aria-hidden="true">{String(index + 1).padStart(2, "0")}</i>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="creator-directory__section-empty">{isSearching ? "No live Space matches this search." : "No live Spaces are published yet."}</p>
              ))}
            </section>

            {!isSearching ? (
              <section className="creator-directory__section creator-directory__section--showcase" aria-labelledby="editorial-previews-title">
                <header>
                  <div><p className="eyebrow">Product examples</p><h2 id="editorial-previews-title">Editorial previews.</h2></div>
                  <p>Illustrative profiles created by LIEUVA. They are not member accounts and are never included in live community totals or search results.</p>
                  <span aria-label={`${DEMO_CREATORS.length} editorial previews`}>E{String(DEMO_CREATORS.length).padStart(2, "0")}</span>
                </header>

                <div className="creator-directory__creator-grid" aria-label="Editorial preview profiles">
                  {DEMO_CREATORS.map((creator, index) => (
                    <a
                      className="creator-directory-card creator-directory-card--showcase"
                      href={creatorCanonicalUrl(creator.handle, window.location.href)}
                      key={creator.handle}
                    >
                      <span className="creator-directory-card__number">Example {String(index + 1).padStart(2, "0")}</span>
                      <CreatorPortrait creator={creator} />
                      <span className="creator-directory-card__identity">
                        <small>@{creator.handle}</small>
                        <strong>{creator.displayName}</strong>
                      </span>
                      <span className="creator-directory-card__bio">{creator.bio}</span>
                      <span className="creator-directory-card__meta">
                        <small>Editorial preview · not a member</small>
                        <b aria-hidden="true">↗</b>
                      </span>
                    </a>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>

      {!embedded ? <footer className="creator-directory__footer">
        <div><Logo /><p>Public profiles, published Spaces and clearly marked editorial previews.</p></div>
        <nav aria-label="Creator directory footer">
          <a href="/">LIEUVA Home</a>
          <a href="/creator-hub">Creator Hub</a>
          <a href="/#/create">Create a Space <span aria-hidden="true">↗</span></a>
        </nav>
      </footer> : null}
    </Root>
  );
}
