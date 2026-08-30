import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDialogFocus } from "../../hooks/useDialogFocus";
import { galleryRepository, type GalleryRecord } from "../../services/galleryRepository";
import {
  hashApplicationUrl,
  spaceCanonicalUrl,
} from "../../services/spaceRoutes";
import { TEMPLATES } from "../gallery/templates";
import "./exploreSpacesMenu.css";

type ExploreSpacesMenuProps = {
  open: boolean;
  onClose: () => void;
};

const normalized = (value: string) => value.trim().toLocaleLowerCase();

function SpaceCover({ space }: { space: GalleryRecord }) {
  const fallback = `./assets/templates/${space.templateId}-preview.webp`;
  return (
    <img
      src={space.coverSrc ?? fallback}
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

export default function ExploreSpacesMenu({ open, onClose }: ExploreSpacesMenuProps) {
  const panel = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [spaces, setSpaces] = useState<GalleryRecord[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const close = useCallback(() => {
    setQuery("");
    onClose();
  }, [onClose]);

  useDialogFocus(panel, close, undefined, open, search);

  const load = useCallback(() => {
    setStatus("loading");
    void galleryRepository
      .discover()
      .then((publicSpaces) => {
        setSpaces(publicSpaces);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  useEffect(() => {
    if (!open || status !== "idle") return;
    const frame = requestAnimationFrame(load);
    return () => cancelAnimationFrame(frame);
  }, [load, open, status]);

  const visibleSpaces = useMemo(() => {
    const term = normalized(query);
    if (!term) return spaces;
    return spaces.filter((space) =>
      normalized(`${space.title} ${space.artist}`).includes(term),
    );
  }, [query, spaces]);

  if (!open) return null;

  return (
    <div
      className="space-menu-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={panel}
        className="space-menu"
        role="dialog"
        aria-modal="true"
        aria-labelledby="space-menu-title"
        tabIndex={-1}
      >
        <header className="space-menu__header">
          <div>
            <p className="eyebrow"><i aria-hidden="true" /> Live Spaces</p>
            <h2 id="space-menu-title">Enter the work.</h2>
          </div>
          <div className="space-menu__header-actions">
            <a href="/creators">Find Creators <span>↗</span></a>
            <button type="button" onClick={close} aria-label="Close Space menu">×</button>
          </div>
        </header>

        <label className="space-menu__search">
          <span>Search published Spaces</span>
          <input
            ref={search}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Room title or Creator"
            autoComplete="off"
          />
          <b aria-hidden="true">⌕</b>
        </label>

        <div className="space-menu__grid">
          <a
            className="space-menu-card space-menu-card--pinned"
            href={hashApplicationUrl("/demo", location.href)}
          >
            <div className="space-menu-card__visual">
              <img
                src="./assets/demo/danny-cover.webp"
                alt="Threshold room by Danny Hirsch Arts"
                loading="eager"
                decoding="async"
              />
              <span>Founder’s pick</span>
            </div>
            <p>Danny Hirsch Arts · Reference Space</p>
            <h3>Threshold</h3>
            <small>Enter pinned Space <b>↗</b></small>
          </a>

          {visibleSpaces.slice(0, 8).map((space) => (
            <a
              className="space-menu-card"
              href={spaceCanonicalUrl(space.id, location.href)}
              key={space.id}
            >
              <div className="space-menu-card__visual">
                <SpaceCover space={space} />
                <span>Live Space</span>
              </div>
              <p>
                {space.artist} · {TEMPLATES.find((template) => template.id === space.templateId)?.name ?? "LIEUVA"}
              </p>
              <h3>{space.title}</h3>
              <small>Enter Space <b>↗</b></small>
            </a>
          ))}
        </div>

        {status === "loading" && (
          <p className="space-menu__state" role="status">Opening the public rooms…</p>
        )}
        {status === "error" && (
          <div className="space-menu__state" role="status">
            <span>Public rooms are taking a pause.</span>
            <button type="button" onClick={load}>Try again →</button>
          </div>
        )}
        {status === "ready" && query.trim() && !visibleSpaces.length && (
          <p className="space-menu__state" role="status">No matching public Space. Threshold stays pinned above.</p>
        )}

        <footer className="space-menu__footer">
          <p>One menu for every published room. No page hunting.</p>
          <a href="/creators">Browse Creators <span>→</span></a>
        </footer>
      </div>
    </div>
  );
}
