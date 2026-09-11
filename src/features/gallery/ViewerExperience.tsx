import {
  useId,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useDialogFocus } from "../../hooks/useDialogFocus";

export type ViewMode = "walk" | "overview";

export interface ArtworkFocus {
  id: string;
  title: string;
  artist: string;
  description?: string;
  year?: string;
  image?: string;
  medium?: string;
  dimensions?: string;
  availability?: string;
  imageAlt?: string;
}

export type DirectoryArtwork = ArtworkFocus & { imageKey?: string };

type ArtworkDetailKey = "year" | "medium" | "dimensions" | "availability";

const ARTWORK_DETAILS: ReadonlyArray<
  readonly [ArtworkDetailKey, string]
> = [
  ["year", "Year / edition"],
  ["medium", "Medium"],
  ["dimensions", "Dimensions"],
  ["availability", "Availability"],
];

function ArtworkDetails({
  artwork,
  includeYear = false,
}: {
  artwork: ArtworkFocus;
  includeYear?: boolean;
}) {
  const details = ARTWORK_DETAILS.filter(
    ([key]) => (includeYear || key !== "year") && artwork[key],
  );
  if (!details.length) return null;
  return (
    <dl>
      {details.map(([key, label]) => (
        <div key={key}>
          <dt>{label}</dt>
          <dd>{artwork[key]}</dd>
        </div>
      ))}
    </dl>
  );
}

interface DirectoryArtworkImageProps {
  artwork: DirectoryArtwork;
  loading?: boolean;
}

function DirectoryArtworkImage({
  artwork,
  loading,
}: DirectoryArtworkImageProps) {
  const [failedSource, setFailedSource] = useState<string>();
  if (artwork.image && failedSource !== artwork.image)
    return (
      <img
        src={artwork.image}
        alt={artwork.imageAlt ?? `${artwork.title} by ${artwork.artist}`}
        loading="lazy"
        decoding="async"
        onError={() => setFailedSource(artwork.image)}
      />
    );
  return (
    <div
      className="artwork-directory-placeholder"
      role="img"
      aria-label={`A separate image for ${artwork.title} is ${loading ? "loading" : "not available"}.`}
    >
      <span>{loading ? "Loading image…" : "Image unavailable"}</span>
    </div>
  );
}

export interface ArtworkDirectoryProps {
  exhibitionTitle: string;
  artist: string;
  artworks: DirectoryArtwork[];
  sourceNote: string;
  unavailable: boolean;
  imagesLoading?: boolean;
  returnFocus: RefObject<HTMLElement | null>;
  onViewArtwork?: (id: string) => void;
  onClose: () => void;
}

export function ArtworkDirectory({
  exhibitionTitle,
  artist,
  artworks,
  sourceNote,
  unavailable,
  imagesLoading,
  returnFocus,
  onViewArtwork,
  onClose,
}: ArtworkDirectoryProps) {
  const dialog = useRef<HTMLElement>(null);
  const titleId = useId();
  const summaryId = useId();
  useDialogFocus(dialog, onClose, returnFocus);
  return (
    <div
      className="artwork-directory-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        id="artwork-directory"
        ref={dialog}
        className="artwork-directory"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={summaryId}
        tabIndex={-1}
      >
        <header className="artwork-directory-header">
          <div>
            <p className="eyebrow">
              {unavailable
                ? "3D unavailable · text-first exhibition"
                : "Text-first exhibition"}
            </p>
            <h2 id={titleId}>
              {exhibitionTitle}
              <br />
              <em>Artwork directory.</em>
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close artwork directory"
          >
            ×
          </button>
        </header>
        <div className="artwork-directory-summary" id={summaryId}>
          <p>
            <strong>
              {artworks.length} work{artworks.length === 1 ? "" : "s"}
            </strong>{" "}
            by {artist}. {sourceNote}
          </p>
          {unavailable && (
            <p role="status">
              The 3D view could not start. Every available artwork and
              description remains below.
            </p>
          )}
        </div>
        {artworks.length ? (
          <ol className="artwork-directory-list">
            {artworks.map((artwork, index) => (
              <li key={artwork.id}>
                <article>
                  <DirectoryArtworkImage
                    artwork={artwork}
                    loading={imagesLoading}
                  />
                  <div className="artwork-directory-copy">
                    <p className="artwork-directory-index">
                      {String(index + 1).padStart(2, "0")}
                    </p>
                    <h3>{artwork.title}</h3>
                    <p className="artwork-directory-artist">{artwork.artist}</p>
                    <ArtworkDetails artwork={artwork} includeYear />
                    <p className="artwork-directory-description">
                      {artwork.description ||
                        "No artwork note was provided for this exhibition."}
                    </p>
                    {onViewArtwork && !unavailable && (
                      <button
                        className="text-link"
                        type="button"
                        onClick={() => onViewArtwork(artwork.id)}
                      >
                        View in Space →
                      </button>
                    )}
                  </div>
                </article>
              </li>
            ))}
          </ol>
        ) : (
          <p className="artwork-directory-empty">
            This exhibition does not contain any listed artworks.
          </p>
        )}
      </section>
    </div>
  );
}

export interface ArtworkInfoCardProps {
  artwork: ArtworkFocus;
  onClose: () => void;
}

export function ArtworkInfoCard({ artwork, onClose }: ArtworkInfoCardProps) {
  const dialog = useRef<HTMLElement>(null);
  useDialogFocus(dialog, onClose);
  const titleId = `artwork-info-${artwork.id}`;
  return (
    <aside
      ref={dialog}
      className="artwork-info"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      {artwork.image && (
        <img
          src={artwork.image}
          alt={artwork.imageAlt ?? `${artwork.title} by ${artwork.artist}`}
        />
      )}
      <div>
        <p className="eyebrow">Selected artwork</p>
        <button onClick={onClose} aria-label="Close artwork information">
          ×
        </button>
        <h2 id={titleId}>{artwork.title}</h2>
        <span>
          {artwork.artist}
          {artwork.year ? ` · ${artwork.year}` : ""}
        </span>
        <ArtworkDetails artwork={artwork} />
        <p>
          {artwork.description ||
            "Presented as part of this virtual exhibition."}
        </p>
      </div>
    </aside>
  );
}

export function MovementHint({ viewMode }: { viewMode: ViewMode }) {
  if (viewMode === "walk") return null;
  return (
    <div className="movement-hint" role="note">
      <span className="movement-hint__desktop">
        Drag to orbit · Scroll to zoom
      </span>
      <span className="movement-hint__mobile">
        Drag to orbit · Pinch to zoom
      </span>
    </div>
  );
}
