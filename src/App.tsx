import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Logo } from "./components/Logo";
import { PitchSections } from "./features/landing/PitchSections";
import { TEMPLATES } from "./features/gallery/templates";
import {
  autoCurateGallery,
  type CurationPhase,
  type CurationReport,
} from "./features/gallery/autoCurator";
import {
  type Artwork,
  type DecorId,
  type DecorPlacement,
  type GalleryDraft,
  type TemplateId,
  type WallId,
} from "./features/gallery/types";
import { createGalleryDraft } from "./features/gallery/editor/draftDefaults";
import { createDemoCollectionDraft } from "./features/gallery/editor/demoCollection";
import type { GallerySceneCapture } from "./features/gallery/GalleryScene";
import {
  DEFAULT_ARTWORK_EYE_LINE_METRES,
  PLACEMENT_GRID_STEP_METRES,
  artworkHorizontalBounds,
  artworkSize,
  distributeArtworksOnWall,
  findAvailableArtworkPlacement,
  findAvailableDecorPlacement,
  galleryWalls,
  updateArtworkPlacement,
  updateDecorPlacement,
} from "./features/gallery/editor/placementValidation";
import {
  reviewGalleryForPublish,
  type PublishReviewIssue,
} from "./features/gallery/editor/publishReview";
import { useDraftHistory } from "./features/gallery/editor/useDraftHistory";
import {
  deleteGalleryDraft,
  loadGalleryDraft,
  saveGalleryDraft,
  type StoredGalleryDraft,
} from "./services/draftStorage";
import {
  galleryRepository,
  type GalleryRecord,
} from "./services/galleryRepository";

const GalleryScene = lazy(() =>
  import("./features/gallery/GalleryScene").then((module) => ({
    default: module.GalleryScene,
  })),
);
const DannyDemoScene = lazy(() =>
  import("./features/gallery/GalleryScene").then((module) => ({
    default: module.DannyDemoScene,
  })),
);
const ScrollGalleryStory = lazy(() =>
  import("./features/landing/ScrollGalleryStory").then((module) => ({
    default: module.ScrollGalleryStory,
  })),
);

type Route = {
  page: "home" | "create" | "demo" | "gallery" | "data";
  id?: string;
  template?: TemplateId;
  demoArt?: boolean;
};
type ViewMode = "walk" | "overview";
type ArtworkFocus = {
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
};
type DirectoryArtwork = ArtworkFocus & { imageKey?: string };
type GalleryLoadState =
  | { status: "loading" }
  | { status: "ready"; gallery: GalleryRecord }
  | { status: "not-found" }
  | { status: "error" };
const MAX_DECOR_OBJECTS = 8;
const DECOR_CATALOG: Array<{ id: DecorId; name: string; size: string }> = [
  { id: "olive", name: "Olive tree", size: "1.8 m high · 1.25 m footprint" },
  {
    id: "snake-plant",
    name: "Snake plant",
    size: "1.0 m high · 0.78 m footprint",
  },
  { id: "arc-lamp", name: "Arc lamp", size: "2.0 m high · 2.05 × 0.9 m" },
  { id: "pedestal", name: "Pedestal", size: "1.0 m high · 1.05 m square" },
  { id: "leather-bench", name: "Leather bench", size: "2.45 × 0.92 m footprint" },
  {
    id: "stone-sculpture",
    name: "Stone study",
    size: "0.9 m high · 1.2 m footprint",
  },
];
const decorName = (id: DecorId) =>
  DECOR_CATALOG.find((item) => item.id === id)?.name ?? id.replaceAll("-", " ");

// Copied from the delivered HOTSPOT_* extras in both Danny GLBs. The runtime
// image loader below reads the matching, embedded WebP sources by asset key.
const DANNY_ARTWORKS: DirectoryArtwork[] = [
  {
    id: "artwork-01",
    imageKey: "artwork-01",
    title: "Yellow Field, Veined",
    artist: "Danny Hirsch",
    year: "2026",
    medium: "Mixed Media on Canvas",
    dimensions: "40 × 50 cm",
    availability: "Available",
    description:
      "A charged botanical trace held inside a saturated field of light.",
    imageAlt:
      "Magnified surface detail of Yellow Field, Veined by Danny Hirsch",
  },
  {
    id: "artwork-02",
    imageKey: "artwork-02",
    title: "Black Current",
    artist: "Danny Hirsch",
    year: "2026",
    medium: "Acrylic on Canvas",
    dimensions: "40 × 50 cm",
    availability: "Available",
    description:
      "Dark movement breaks into mineral gold, fluid and deliberate.",
    imageAlt: "Magnified surface detail of Black Current by Danny Hirsch",
  },
  {
    id: "artwork-03",
    imageKey: "artwork-03",
    title: "Soft Terrain",
    artist: "Danny Hirsch",
    year: "2026",
    medium: "Mixed Media on Canvas",
    dimensions: "40 × 50 cm",
    availability: "Available",
    description:
      "Color drifts across the surface like atmosphere settling into matter.",
    imageAlt: "Magnified surface detail of Soft Terrain by Danny Hirsch",
  },
  {
    id: "artwork-04",
    imageKey: "artwork-04",
    title: "Oxide Drift",
    artist: "Danny Hirsch",
    year: "2026",
    medium: "Acrylic and Mineral Pigment on Canvas",
    dimensions: "40 × 50 cm",
    availability: "Available",
    description:
      "A low, metallic landscape shaped by pressure, reflection, and restraint.",
    imageAlt: "Magnified surface detail of Oxide Drift by Danny Hirsch",
  },
  {
    id: "artwork-05",
    imageKey: "artwork-05",
    title: "Blue Aperture",
    artist: "Danny Hirsch",
    year: "2026",
    medium: "Acrylic on Canvas",
    dimensions: "40 × 50 cm",
    availability: "Available",
    description:
      "Cool blues and silver tones open into a deep, architectural field.",
    imageAlt: "Magnified surface detail of Blue Aperture by Danny Hirsch",
  },
  {
    id: "artwork-06",
    imageKey: "artwork-06",
    title: "Nocturne Relic",
    artist: "Danny Hirsch",
    year: "2026",
    medium: "Mixed Media Assemblage",
    dimensions: "40 × 50 cm",
    availability: "Available",
    description:
      "Raw material interrupts a luminous ground with sculptural tension.",
    imageAlt: "Magnified surface detail of Nocturne Relic by Danny Hirsch",
  },
  {
    id: "wartrobe-front",
    imageKey: "gallery-04",
    title: "wARTrobe · Front",
    artist: "Danny Hirsch",
    year: "One-of-one object",
    medium: "Painted wardrobe installation",
    dimensions: "Details on request",
    availability: "Private inquiry",
    description:
      "A painted object where storage, memory, and surface become one architectural presence.",
    imageAlt:
      "Complete front view of the painted wARTrobe installation by Danny Hirsch",
  },
];
const routeFromHash = (): Route => {
  const hash = location.hash.replace(/^#/, "");
  if (hash === "/create") return { page: "create" };
  const templateMatch =
    /^\/create\/(white-cube|nocturne|pavilion)(\/demo)?$/.exec(hash);
  if (templateMatch)
    return {
      page: "create",
      template: templateMatch[1] as TemplateId,
      demoArt: Boolean(templateMatch[2]),
    };
  if (hash === "/demo") return { page: "demo" };
  if (hash === "/data") return { page: "data" };
  if (hash.startsWith("/g/")) return { page: "gallery", id: hash.slice(3) };
  return { page: "home" };
};
const navigate = (path: string) => {
  location.hash = path;
  window.scrollTo(0, 0);
};

function Header({ light = false }: { light?: boolean }) {
  return (
    <header className={`site-header ${light ? "site-header--light" : ""}`}>
      <Logo dark={light} />
      <nav>
        <button onClick={() => navigate("/demo")}>Live demo</button>
        <button onClick={() => navigate("/create")}>
          Create gallery <span>↗</span>
        </button>
      </nav>
    </header>
  );
}

function DeferredScrollStory() {
  return (
    <div className="story-deferred">
      <Suspense
        fallback={
          <section
            className="story-placeholder"
            aria-label="Loading interactive gallery story"
          >
            <span>Preparing Danny Hirsch Arts…</span>
          </section>
        }
      >
        <ScrollGalleryStory />
      </Suspense>
    </div>
  );
}

function DiscoverGalleries() {
  const [galleries, setGalleries] = useState<GalleryRecord[]>([]);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string>();
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [page, setPage] = useState(0);
  const [discoveredAt] = useState(Date.now);
  const section = useRef<HTMLElement>(null);
  const requested = useRef(false);
  const load = useCallback(() => {
    requested.current = true;
    setStatus("loading");
    void galleryRepository
      .currentUserId()
      .then(setOwnerId)
      .catch(() => setOwnerId(null));
    void galleryRepository
      .discover()
      .then((items) => {
        setGalleries(items);
        setStatus("ready");
      })
      .catch((error) => {
        console.error("Discover unavailable", error);
        setStatus("error");
      });
  }, []);
  useEffect(() => {
    const target = section.current;
    if (!target || requested.current) return undefined;
    if (!("IntersectionObserver" in window)) {
      const frame = requestAnimationFrame(load);
      return () => cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting) || requested.current)
          return;
        observer.disconnect();
        load();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [load]);
  const pageCount = Math.max(1, Math.ceil(galleries.length / 3));
  const visiblePage = Math.min(page, pageCount - 1);
  const visibleGalleries = galleries.slice(
    visiblePage * 3,
    visiblePage * 3 + 3,
  );
  const removeGallery = async (gallery: GalleryRecord) => {
    if (
      !window.confirm(
        `Remove “${gallery.title}” from Discover? This cannot be undone.`,
      )
    )
      return;
    setRemovingId(gallery.id);
    try {
      await galleryRepository.delete(gallery.id);
      setGalleries((current) =>
        current.filter((item) => item.id !== gallery.id),
      );
    } catch (error) {
      console.error("Gallery deletion failed", error);
      alert(
        "The gallery could not be removed. Deploy the updated Firestore rules, then try again.",
      );
    } finally {
      setRemovingId(undefined);
    }
  };
  return (
    <section ref={section} className="discover">
      <div className="discover-heading">
        <div>
          <p className="eyebrow">Open for ten days</p>
          <h2>
            Discover
            <br />
            <em>galleries.</em>
          </h2>
        </div>
        <div className="discover-intro">
          <p>
            New spaces created by artists using AURA. Enter while the exhibition
            is live.
          </p>
          {galleries.length > 3 && (
            <div
              className="discover-controls"
              role="group"
              aria-label="Browse open galleries"
            >
              <span>
                {String(visiblePage + 1).padStart(2, "0")} /{" "}
                {String(pageCount).padStart(2, "0")}
              </span>
              <button
                onClick={() => setPage(Math.max(0, visiblePage - 1))}
                disabled={visiblePage === 0}
                aria-label="Previous galleries"
              >
                ←
              </button>
              <button
                onClick={() =>
                  setPage(Math.min(pageCount - 1, visiblePage + 1))
                }
                disabled={visiblePage === pageCount - 1}
                aria-label="Next galleries"
              >
                →
              </button>
            </div>
          )}
        </div>
      </div>
      <div
        className={`discover-grid ${!galleries.length ? "discover-grid--reference" : ""}`}
      >
        {!galleries.length && (
          <>
            <article className="discover-card discover-card--reference">
              <button
                className="discover-card-main"
                onClick={() => navigate("/demo")}
              >
                <div className="discover-cover">
                  <img
                    src="./assets/demo/danny-cover.webp"
                    alt="Threshold virtual exhibition by Danny Hirsch Arts"
                    loading="lazy"
                    decoding="async"
                  />
                  <span>Reference demo</span>
                </div>
                <p>Danny Hirsch Arts</p>
                <h3>Threshold</h3>
                <small>Enter permanent demo →</small>
              </button>
            </article>
            <div className="discover-empty">
              <span>
                {status === "idle"
                  ? "Live exhibitions load here."
                  : status === "loading"
                    ? "Looking for open exhibitions…"
                    : status === "error"
                      ? "The live feed is unavailable."
                      : "No community exhibitions are open."}
              </span>
              <p>
                {status === "error"
                  ? "The reference exhibition stays available. Retry the live community feed when the connection is ready."
                  : "Explore the reference exhibition or publish the first ten-day gallery."}
              </p>
              <button
                className="text-link"
                onClick={status === "error" ? load : () => navigate("/create")}
              >
                {status === "error"
                  ? "Retry live feed →"
                  : "Create a gallery →"}
              </button>
            </div>
          </>
        )}
        {visibleGalleries.map((gallery) => {
          const cover =
            gallery.coverSrc ||
            gallery.artworks.find((artwork) => !artwork.hidden)?.src;
          const days = Math.max(
            1,
            Math.ceil(
              (new Date(gallery.expiresAt).getTime() - discoveredAt) / 86400000,
            ),
          );
          return (
            <article
              key={gallery.id}
              className={`discover-card template-card--${gallery.templateId}`}
            >
              <button
                className="discover-card-main"
                onClick={() => navigate(`/g/${gallery.id}`)}
              >
                <div className="discover-cover">
                  {cover ? (
                    <img src={cover} alt="" loading="lazy" decoding="async" />
                  ) : (
                    <div className="mini-room">
                      <i />
                      <i />
                      <i />
                    </div>
                  )}
                  <span>{days} days left</span>
                </div>
                <p>{gallery.artist}</p>
                <h3>{gallery.title}</h3>
                <small>Enter exhibition →</small>
              </button>
              {gallery.ownerId === ownerId && (
                <button
                  className="discover-delete"
                  disabled={removingId === gallery.id}
                  onClick={() => removeGallery(gallery)}
                  aria-label={`Remove ${gallery.title}`}
                >
                  {removingId === gallery.id ? "Removing…" : "Remove"}
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Landing() {
  return (
    <main className="landing">
      <Header />
      <DeferredScrollStory />
      <RoomShowcase />
      <section className="demo-tease">
        <div>
          <p className="eyebrow">Working reference case</p>
          <h2>
            Danny Hirsch
            <br />
            <em>Threshold</em>
          </h2>
          <p>
            Brief: preserve the atmosphere of an authored Blender exhibition in
            one browser link. AURA converted its navigation anchors, routes,
            artwork metadata, and collision data into an optimized walk,
            overview, and guided tour.
          </p>
          <dl className="case-study-facts">
            <div>
              <dt>Brief</dt>
              <dd>Translate one authored show</dd>
            </div>
            <div>
              <dt>Build</dt>
              <dd>GLB · anchors · routes · metadata</dd>
            </div>
            <div>
              <dt>Result</dt>
              <dd>Walk · overview · 7 artwork records</dd>
            </div>
          </dl>
          <button
            className="button button--light"
            onClick={() => navigate("/demo")}
          >
            Enter the gallery <span>→</span>
          </button>
        </div>
        <button
          className="demo-image"
          onClick={() => navigate("/demo")}
          aria-label="Explore in 3D — Danny Hirsch Threshold live demo"
        >
          <img
            src="./assets/demo/danny-cover.webp"
            width="1440"
            height="1000"
            loading="lazy"
            decoding="async"
            alt="Threshold virtual exhibition by Danny Hirsch Arts"
          />
          <span>Explore in 3D ↗</span>
        </button>
      </section>
      <PitchSections />
      <DiscoverGalleries />
      <section className="closing">
        <p className="eyebrow">Your next exhibition starts here</p>
        <h2>
          Make space
          <br />
          <em>for your art.</em>
        </h2>
        <button
          className="button button--dark"
          onClick={() => navigate("/create")}
        >
          Create a gallery <span>↗</span>
        </button>
      </section>
      <Footer />
    </main>
  );
}

function RoomShowcase() {
  const facts: Record<TemplateId, [string, string]> = {
    "white-cube": ["16 × 12 m · 8 works", "Solo and duo exhibitions"],
    nocturne: ["15.5 × 11.5 m · 8 works", "Focused launches and private views"],
    pavilion: ["40 × 60 m · 14 works", "Institution and brand concepts"],
  };
  return (
    <section className="room-showcase" aria-labelledby="room-showcase-title">
      <div className="room-showcase-heading">
        <p className="eyebrow">Now build your own</p>
        <h2 id="room-showcase-title">
          Choose a room.
          <br />
          <em>Make it yours.</em>
        </h2>
        <p>
          Start with sample art, then replace it with your own work. These
          concept images show each room's visual direction; every button opens
          the working browser builder.
        </p>
      </div>
      <div className="room-showcase-grid">
        {TEMPLATES.map((template) => (
          <article key={template.id}>
            <button
              type="button"
              onClick={() => navigate(`/create/${template.id}/demo`)}
              aria-label={`Try ${template.name} with sample artwork`}
            >
              <img
                src={`./assets/templates/${template.id}-preview.webp`}
                width="965"
                height="752"
                loading="lazy"
                decoding="async"
                alt={`${template.name} premium concept visualization`}
              />
              <span>Try this room ↗</span>
            </button>
            <p>
              {template.index} · {template.label}
            </p>
            <h3>{template.name}</h3>
            <dl>
              <div>
                <dt>Scale</dt>
                <dd>{facts[template.id][0]}</dd>
              </div>
              <div>
                <dt>Best for</dt>
                <dd>{facts[template.id][1]}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer>
      <Logo />
      <nav aria-label="Product information">
        <a href="#/data">MVP data & rights</a>
        <a href="./licenses/FONT-LICENSES.txt">Font licenses</a>
        <a href="#pilot-faq">FAQ</a>
      </nav>
      <span>© 2026 AURA</span>
    </footer>
  );
}

function MvpDataNotice() {
  return (
    <main className="info-page">
      <Header light />
      <article>
        <p className="eyebrow">Public MVP · Data and rights notice</p>
        <h1>
          Know before
          <br />
          <em>you upload.</em>
        </h1>
        <p className="info-lead">
          AURA is a public concept-validation product, not yet a production
          publishing service. This factual MVP notice does not replace a
          complete privacy policy or pilot agreement.
        </p>
        <section>
          <h2>What happens to a draft?</h2>
          <p>
            Drafts are autosaved in this browser using IndexedDB so work can
            recover after a refresh. Uploaded images are resized and compressed
            locally before publication. Discarding the draft or clearing site
            data removes that local recovery copy.
          </p>
        </section>
        <section>
          <h2>What happens when you publish?</h2>
          <p>
            The current option is public. Gallery metadata, compressed artwork,
            and an anonymous Firebase owner identifier are stored in Cloud
            Firestore. The link can appear in Discover and is scheduled to
            become unreadable after ten days; separate cleanup later removes
            expired records.
          </p>
        </section>
        <section>
          <h2>Rights and confidentiality</h2>
          <p>
            Only upload artwork and text you are allowed to share publicly. Do
            not upload confidential, embargoed, personal, or rights-restricted
            material. The MVP has no moderation review, private links, accounts,
            payments, or contractual archival promise.
          </p>
        </section>
        <section>
          <h2>Infrastructure and pilots</h2>
          <p>
            Publishing uses Firebase Authentication and Cloud Firestore. Google
            documents the service's processing, storage locations, and security
            controls on its{" "}
            <a
              href="https://firebase.google.com/support/privacy/"
              target="_blank"
              rel="noreferrer"
            >
              Firebase privacy and security page
            </a>
            . A production artist, institution, or brand pilot needs named
            controller details, retention choices, rights terms, support, and a
            signed scope before confidential use.
          </p>
        </section>
        <div className="info-actions">
          <button
            className="button button--dark"
            onClick={() => navigate("/create")}
          >
            Return to builder
          </button>
          <a
            className="text-link"
            href="https://github.com/bbyw2hrnf6-boop/VirtualArtPlattform/blob/main/ASSET_LICENSES.md"
            target="_blank"
            rel="noreferrer"
          >
            Asset provenance
          </a>
        </div>
      </article>
      <Footer />
    </main>
  );
}

function TemplatePicker({ onChoose }: { onChoose: (id: TemplateId) => void }) {
  const [savedTemplates, setSavedTemplates] = useState<Set<TemplateId>>(
    new Set(),
  );
  useEffect(() => {
    let active = true;
    void Promise.all(
      TEMPLATES.map(
        async (template) =>
          [template.id, await loadGalleryDraft(template.id)] as const,
      ),
    )
      .then((records) => {
        if (active)
          setSavedTemplates(
            new Set(
              records.filter(([, record]) => Boolean(record)).map(([id]) => id),
            ),
          );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return (
    <main className="picker">
      <Header light />
      <div className="picker-heading">
        <p className="eyebrow">Create gallery · Step 1 of 3</p>
        <h1>
          Choose your <em>space.</em>
        </h1>
        <p>
          Three considered architectures. Each offers a focused material and
          lighting palette, precise placement, and a visitor preview.
        </p>
        <button
          type="button"
          className="picker-demo-button"
          onClick={() => navigate("/create/white-cube/demo")}
        >
          <span>Fast sandbox</span>
          <strong>Try the White Cube with 3 sample works</strong>
          <b>↗</b>
        </button>
      </div>
      <div className="template-grid">
        {TEMPLATES.map((template) => (
          <button
            className={`template-card template-card--${template.id}`}
            key={template.id}
            onClick={() => onChoose(template.id)}
          >
            <span className="template-number">{template.index}</span>
            <div className="template-preview">
              <img
                src={`./assets/templates/${template.id}-preview.webp`}
                width="965"
                height="752"
                decoding="async"
                alt={`${template.name} premium concept visualization`}
              />
              {savedTemplates.has(template.id) && (
                <b className="template-draft-badge">Local draft</b>
              )}
              <span>Use this space ↗</span>
            </div>
            <p>{template.label}</p>
            <h2>{template.name}</h2>
            <small>{template.description}</small>
          </button>
        ))}
      </div>
      <p className="picker-footnote">
        Concept direction imagery · Every room opens in the live browser builder.
      </p>
    </main>
  );
}

async function imageFromFile(
  file: File,
): Promise<Pick<Artwork, "src" | "aspect">> {
  if (file.size > 30 * 1024 * 1024)
    throw new Error(`${file.name} is larger than 30 MB.`);
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(
          new Error(
            `${file.name} could not be opened. Please export it as JPG, PNG, or WebP.`,
          ),
        );
      image.src = url;
    });
    const max = 1200;
    const scale = Math.min(
      1,
      max / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not prepare this image.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let quality = 0.78;
    let src = canvas.toDataURL("image/webp", quality);
    if (!src.startsWith("data:image/webp"))
      src = canvas.toDataURL("image/jpeg", 0.82);
    while (src.length > 720000 && quality > 0.38) {
      quality -= 0.08;
      src = canvas.toDataURL(
        src.startsWith("data:image/webp") ? "image/webp" : "image/jpeg",
        quality,
      );
    }
    if (src.length > 780000)
      throw new Error(
        `${file.name} could not be compressed below the gallery limit.`,
      );
    return { src, aspect: canvas.width / canvas.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function initialArtworkPlacement(
  templateId: TemplateId,
  slot: number,
): Pick<Artwork, "wall" | "x" | "y" | "scale"> {
  if (templateId === "pavilion") {
    const placements: Array<[WallId, number, number]> = [
      ["divider-front", -3.99, DEFAULT_ARTWORK_EYE_LINE_METRES],
      ["divider-front", 0, DEFAULT_ARTWORK_EYE_LINE_METRES],
      ["divider-front", 3.99, DEFAULT_ARTWORK_EYE_LINE_METRES],
      ["divider-back", -3.99, DEFAULT_ARTWORK_EYE_LINE_METRES],
      ["divider-back", 0, DEFAULT_ARTWORK_EYE_LINE_METRES],
      ["divider-back", 3.99, DEFAULT_ARTWORK_EYE_LINE_METRES],
      ["north", -12.99, DEFAULT_ARTWORK_EYE_LINE_METRES],
      ["north", 0, DEFAULT_ARTWORK_EYE_LINE_METRES],
      ["north", 12.99, DEFAULT_ARTWORK_EYE_LINE_METRES],
      ["south", -12.99, DEFAULT_ARTWORK_EYE_LINE_METRES],
      ["south", 0, DEFAULT_ARTWORK_EYE_LINE_METRES],
      ["south", 12.99, DEFAULT_ARTWORK_EYE_LINE_METRES],
      ["west", -18, DEFAULT_ARTWORK_EYE_LINE_METRES],
      ["east", 18, DEFAULT_ARTWORK_EYE_LINE_METRES],
    ];
    const [wall, x, y] = placements[slot % placements.length];
    return { wall, x, y, scale: 0.9 };
  }
  const placements: Array<[WallId, number]> = [
    ["north", -2.79],
    ["north", 0],
    ["north", 2.79],
    ["west", -2.19],
    ["west", 2.19],
    ["east", -2.19],
    ["east", 2.19],
    ["south", 0],
  ];
  const [wall, x] = placements[slot % placements.length];
  return { wall, x, y: DEFAULT_ARTWORK_EYE_LINE_METRES, scale: 0.9 };
}

type WallFocusRequest = { wall: WallId; token: number };

const WALL_LABELS: Record<WallId, string> = {
  north: "Back wall",
  south: "Entrance wall",
  west: "Left wall",
  east: "Right wall",
  "divider-front": "Feature wall A",
  "divider-back": "Feature wall B",
};
const PAVILION_WALL_LABELS: Record<WallId, string> = {
  north: "North gallery",
  south: "Entrance gallery",
  west: "West wing",
  east: "East wing",
  "divider-front": "Feature wall A",
  "divider-back": "Feature wall B",
};
const wallLabel = (templateId: TemplateId, wall: WallId) =>
  templateId === "pavilion" ? PAVILION_WALL_LABELS[wall] : WALL_LABELS[wall];

function availableWalls(templateId: TemplateId): WallId[] {
  return galleryWalls(templateId);
}

function Studio({
  initialTemplate,
  initialDemoArt = false,
}: {
  initialTemplate: TemplateId;
  initialDemoArt?: boolean;
}) {
  const starterDraft = useMemo(
    () =>
      initialDemoArt
        ? createDemoCollectionDraft(initialTemplate)
        : createGalleryDraft(initialTemplate),
    [initialDemoArt, initialTemplate],
  );
  const {
    value: draft,
    current: draftRef,
    commit: setDraft,
    reset: resetDraft,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useDraftHistory(starterDraft);
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedDecorId, setSelectedDecorId] = useState<string>();
  const [published, setPublished] = useState<GalleryRecord>();
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string>();
  const [publishReviewOpen, setPublishReviewOpen] = useState(false);
  const [publishCover, setPublishCover] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>();
  const [curating, setCurating] = useState(false);
  const [curationPhase, setCurationPhase] = useState<CurationPhase>("palette");
  const [curationReport, setCurationReport] = useState<CurationReport>();
  const [curationSnapshot, setCurationSnapshot] = useState<GalleryDraft>();
  const [curationError, setCurationError] = useState<string>();
  const [wallFocus, setWallFocus] = useState<WallFocusRequest>();
  const [placementNotice, setPlacementNotice] = useState<string>();
  const [placementError, setPlacementError] = useState<string>();
  const [recoveryDraft, setRecoveryDraft] = useState<StoredGalleryDraft>();
  const [storageReady, setStorageReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    "checking" | "ready" | "saving" | "saved" | "error"
  >("checking");
  const [toolSheet, setToolSheet] = useState<"peek" | "half" | "full">("half");
  const wallFocusToken = useRef(0);
  const decorInsertion = useRef({ x: 0, z: 1 });
  const saveRevision = useRef(0);
  const latestSaveRequest = useRef(0);
  const publishButton = useRef<HTMLButtonElement>(null);
  const sceneCapture = useRef<GallerySceneCapture | null>(null);
  const selected = draft.artworks.find((item) => item.id === selectedId);
  const selectedDecor = draft.decor.find((item) => item.id === selectedDecorId);
  const roomTemplate =
    TEMPLATES.find((item) => item.id === draft.templateId) ?? TEMPLATES[0];
  const roomDimensions = roomTemplate.dimensions;
  const maxArtworks = roomTemplate.maxArtworks;
  const decorLimitX = roomDimensions[0] / 2 - 0.5;
  const decorLimitZ = roomDimensions[1] / 2 - 0.5;
  const wallLimit = (wall: WallId) =>
    wall.startsWith("divider")
      ? (roomTemplate.dividerWidth ?? 6.2) / 2 - 0.55
      : wall === "north" || wall === "south"
        ? roomDimensions[0] / 2 - 0.8
        : roomDimensions[1] / 2 - 0.8;
  const artworkLimit = selected ? wallLimit(selected.wall) : 3.5;
  const selectedSize = selected ? artworkSize(selected) : undefined;
  const selectedBounds = selected
    ? artworkHorizontalBounds(draft, selected)
    : { min: -artworkLimit, max: artworkLimit };
  const publishIssues = reviewGalleryForPublish(draft);
  const publishBlockers = publishIssues.filter(
    (issue) => issue.severity === "error",
  );

  useEffect(() => {
    let active = true;
    void loadGalleryDraft(initialTemplate)
      .then((stored) => {
        if (!active) return;
        if (stored) {
          saveRevision.current = stored.revision;
          setRecoveryDraft(stored);
        } else {
          setStorageReady(true);
          setSaveStatus("ready");
        }
      })
      .catch(() => {
        if (active) {
          setStorageReady(true);
          setSaveStatus("error");
        }
      });
    return () => {
      active = false;
    };
  }, [initialTemplate]);

  useEffect(() => {
    if (!storageReady || (!canUndo && !canRedo)) return;
    const statusTimeout = window.setTimeout(() => setSaveStatus("saving"), 0);
    const requestId = ++latestSaveRequest.current;
    const revision = ++saveRevision.current;
    const timeout = window.setTimeout(() => {
      void saveGalleryDraft(draft, revision)
        .then(() => {
          if (latestSaveRequest.current === requestId) setSaveStatus("saved");
        })
        .catch(() => {
          if (latestSaveRequest.current === requestId) setSaveStatus("error");
        });
    }, 450);
    return () => {
      window.clearTimeout(statusTimeout);
      window.clearTimeout(timeout);
    };
  }, [draft, storageReady, canUndo, canRedo]);

  useEffect(() => {
    if (!storageReady || (!canUndo && !canRedo)) return;
    const flush = () => {
      void saveGalleryDraft(draftRef.current, ++saveRevision.current);
    };
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flushWhenHidden);
    };
  }, [storageReady, canUndo, canRedo, draftRef]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        event.key.toLowerCase() !== "z"
      )
        return;
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]'))
        return;
      const changed = event.shiftKey ? redo() : undo();
      if (changed) {
        event.preventDefault();
        setPlacementError(undefined);
        setSelectedId(undefined);
        setSelectedDecorId(undefined);
      }
    };
    addEventListener("keydown", onKeyDown);
    return () => removeEventListener("keydown", onKeyDown);
  }, [redo, undo]);

  const requestWallFocus = useCallback(
    (wall: WallId) => setWallFocus({ wall, token: ++wallFocusToken.current }),
    [],
  );
  const selectArtwork = useCallback((id: string) => {
    setSelectedId(id);
    setSelectedDecorId(undefined);
    setPlacementNotice(undefined);
    setToolSheet("half");
  }, []);
  const openArtwork = (id: string) => {
    const artwork = draft.artworks.find((item) => item.id === id);
    selectArtwork(id);
    setPlacementNotice(undefined);
    if (artwork) requestWallFocus(artwork.wall);
  };
  const selectDecor = useCallback((id: string) => {
    setSelectedDecorId(id);
    setSelectedId(undefined);
    setPlacementNotice(undefined);
    setToolSheet("half");
  }, []);
  const update = <K extends keyof GalleryDraft>(
    key: K,
    value: GalleryDraft[K],
  ) =>
    setDraft(
      (current) => ({ ...current, [key]: value }),
      key === "artworks" || key === "decor" ? undefined : `draft:${key}`,
    );
  const updateArtwork = (value: Partial<Artwork>) => {
    if (!selectedId) return;
    if ("wall" in value || "x" in value || "y" in value || "scale" in value) {
      const result = updateArtworkPlacement(
        draftRef.current,
        selectedId,
        value,
      );
      if (!result.ok) {
        setPlacementError(result.issue.message);
        return;
      }
      setDraft(
        result.draft,
        `artwork:${selectedId}:${Object.keys(value)[0] ?? "placement"}`,
      );
      setPlacementError(undefined);
      return;
    }
    setDraft(
      (current) => ({
        ...current,
        artworks: current.artworks.map((item) =>
          item.id === selectedId ? { ...item, ...value } : item,
        ),
      }),
      `artwork:${selectedId}:${Object.keys(value)[0] ?? "details"}`,
    );
  };
  const changeArtworkWall = (wall: WallId) => {
    if (!selected) return;
    if (selected.wall === wall) {
      setPlacementNotice(
        `Viewing ${wallLabel(draft.templateId, wall)}. Click an empty point to place, then drag to refine.`,
      );
      requestWallFocus(wall);
      return;
    }
    const placement = findAvailableArtworkPlacement(
      draft,
      selected.id,
      wall,
      0,
      selected.y,
    );
    if (!placement) {
      const message = `${wallLabel(draft.templateId, wall)} has no valid free position. Choose another wall or reduce the artwork size.`;
      setPlacementNotice(message);
      setPlacementError(message);
      return;
    }
    const result = updateArtworkPlacement(draft, selected.id, placement);
    if (!result.ok) {
      setPlacementError(result.issue.message);
      return;
    }
    setDraft(result.draft);
    setPlacementError(undefined);
    setPlacementNotice(
      `Placed on ${wallLabel(draft.templateId, wall)}. Click the wall for an exact position, then drag to refine.`,
    );
    requestWallFocus(wall);
  };
  const updateDecor = (value: Partial<DecorPlacement>) => {
    if (!selectedDecorId) return;
    const result = updateDecorPlacement(
      draftRef.current,
      selectedDecorId,
      value,
    );
    if (!result.ok) {
      setPlacementError(result.issue.message);
      return;
    }
    setDraft(
      result.draft,
      `decor:${selectedDecorId}:${Object.keys(value)[0] ?? "placement"}`,
    );
    setPlacementError(undefined);
  };
  const placeDecor = useCallback(
    (id: string, x: number, z: number) => {
      const result = updateDecorPlacement(draftRef.current, id, { x, z });
      if (!result.ok) {
        setPlacementError(
          `${result.issue.message} The object returned to its last valid position.`,
        );
        return;
      }
      setDraft(result.draft);
      setPlacementError(undefined);
    },
    [draftRef, setDraft],
  );
  const placeArtwork = useCallback(
    (id: string, wall: WallId, x: number, y: number) => {
      const result = updateArtworkPlacement(draftRef.current, id, {
        wall,
        x,
        y,
      });
      if (!result.ok) {
        setPlacementError(
          `${result.issue.message} The artwork returned to its last valid position.`,
        );
        return;
      }
      setDraft(result.draft);
      setPlacementError(undefined);
    },
    [draftRef, setDraft],
  );
  const alignSelectedArtwork = (edge: "left" | "center" | "right") => {
    if (!selected) return;
    const targetX =
      edge === "left"
        ? selectedBounds.min
        : edge === "right"
          ? selectedBounds.max
          : 0;
    const result = updateArtworkPlacement(draftRef.current, selected.id, {
      x: targetX,
    });
    if (!result.ok) {
      setPlacementError(result.issue.message);
      return;
    }
    setDraft(result.draft);
    setPlacementError(undefined);
    setPlacementNotice(
      `${edge === "center" ? "Centered" : `Aligned ${edge}`} on ${wallLabel(draft.templateId, selected.wall)}.`,
    );
  };
  const distributeSelectedWall = () => {
    if (!selected) return;
    const result = distributeArtworksOnWall(draftRef.current, selected.wall);
    if (!result.ok) {
      setPlacementError(result.issue.message);
      return;
    }
    setDraft(result.draft);
    setPlacementError(undefined);
    setPlacementNotice(
      `Visible artworks distributed safely on ${wallLabel(draft.templateId, selected.wall)}.`,
    );
  };
  const rememberDecorInsertion = useCallback((x: number, z: number) => {
    decorInsertion.current = { x, z };
  }, []);
  const addDecor = (type: DecorId) => {
    if (draft.decor.length >= MAX_DECOR_OBJECTS) return;
    const item: DecorPlacement = {
      id: crypto.randomUUID(),
      type,
      x: decorInsertion.current.x,
      z: decorInsertion.current.z,
      rotation: 0,
      scale: 1,
    };
    const candidate = { ...draft, decor: [...draft.decor, item] };
    const placement = findAvailableDecorPlacement(candidate, item);
    if (!placement) {
      setPlacementError(
        "No safe floor position is available for this object. Move or remove another object first.",
      );
      return;
    }
    setDraft({ ...draft, decor: [...draft.decor, placement] });
    setPlacementError(undefined);
    setSelectedDecorId(item.id);
    setSelectedId(undefined);
  };
  const curateWithAi = async () => {
    if (!draft.artworks.length || curating) return;
    setCurationSnapshot(draft);
    setCurationReport(undefined);
    setCurationError(undefined);
    setSelectedId(undefined);
    setSelectedDecorId(undefined);
    setCurating(true);
    setCurationPhase("palette");
    try {
      const result = await autoCurateGallery(
        draft,
        roomTemplate,
        setCurationPhase,
      );
      const curatedDraft = {
        ...result.draft,
        decor: result.draft.decor.slice(0, MAX_DECOR_OBJECTS),
      };
      setDraft(curatedDraft);
      setPlacementError(undefined);
      setCurationReport({
        ...result.report,
        decorCount: curatedDraft.decor.length,
      });
    } catch (error) {
      setCurationError(
        error instanceof Error
          ? error.message
          : "AI Curator could not prepare this exhibition.",
      );
    } finally {
      setCurating(false);
    }
  };
  const undoCuration = () => {
    if (!curationSnapshot) return;
    setDraft(curationSnapshot);
    setCurationSnapshot(undefined);
    setCurationReport(undefined);
    setCurationError(undefined);
    setSelectedId(undefined);
    setSelectedDecorId(undefined);
  };
  const curationPhaseCopy = {
    palette: "Reading the collection",
    composition: "Composing the walls",
    atmosphere: "Balancing atmosphere and objects",
  }[curationPhase];
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const remaining = Math.max(0, maxArtworks - draft.artworks.length);
    const supported = Array.from(files)
      .filter(
        (item) =>
          item.type.startsWith("image/") ||
          /\.(jpe?g|png|webp|heic|heif)$/i.test(item.name),
      )
      .slice(0, remaining);
    const prepared: Artwork[] = [];
    const failures: string[] = [];
    setUploading(true);
    setUploadError(undefined);
    try {
      for (const file of supported) {
        try {
          const image = await imageFromFile(file);
          const slot = draft.artworks.length + prepared.length;
          prepared.push({
            id: crypto.randomUUID(),
            title: file.name.replace(/\.[^.]+$/, "").slice(0, 80),
            ...image,
            ...initialArtworkPlacement(draft.templateId, slot),
          });
        } catch (error) {
          failures.push(
            error instanceof Error
              ? error.message
              : `${file.name} could not be prepared.`,
          );
        }
      }
      if (!remaining)
        failures.push(
          `This gallery already contains the maximum of ${maxArtworks} artworks.`,
        );
      else if (!supported.length)
        failures.push(
          "This file is not recognized as an image. Please choose JPG, PNG, WebP, HEIC, or HEIF.",
        );
      let working = draftRef.current;
      const placed: Artwork[] = [];
      for (const artwork of prepared) {
        if (working.artworks.length >= maxArtworks) {
          failures.push(
            `${artwork.title} was not added because the room is full.`,
          );
          continue;
        }
        const withArtwork = {
          ...working,
          artworks: [...working.artworks, artwork],
        };
        const preferredWalls = [
          artwork.wall,
          ...availableWalls(working.templateId).filter(
            (wall) => wall !== artwork.wall,
          ),
        ];
        const placement = preferredWalls
          .map((wall) =>
            findAvailableArtworkPlacement(
              withArtwork,
              artwork.id,
              wall,
              wall === artwork.wall ? artwork.x : 0,
              DEFAULT_ARTWORK_EYE_LINE_METRES,
            ),
          )
          .find(Boolean);
        if (!placement) {
          failures.push(
            `${artwork.title} is too large for every available wall at a safe scale.`,
          );
          continue;
        }
        const positioned = { ...artwork, ...placement };
        working = { ...working, artworks: [...working.artworks, positioned] };
        placed.push(positioned);
      }
      if (placed.length) {
        setDraft(working);
        setPlacementError(undefined);
        setCurationReport(undefined);
        setCurationSnapshot(undefined);
        selectArtwork(placed[0].id);
        requestWallFocus(placed[0].wall);
      }
      if (failures.length) setUploadError(failures.join(" "));
    } finally {
      setUploading(false);
    }
  };
  const openPublishReview = () => {
    setPublishError(undefined);
    setPublishCover(undefined);
    setPublishReviewOpen(true);
    void sceneCapture
      .current?.({ maxWidth: 720, maxHeight: 540, quality: 0.72 })
      .then((capture) => setPublishCover(capture.dataUrl))
      .catch((error) =>
        console.warn("Publish cover preview unavailable.", error),
      );
  };
  const publish = async () => {
    const latestIssues = reviewGalleryForPublish(draftRef.current);
    const blocker = latestIssues.find((issue) => issue.severity === "error");
    if (blocker) {
      setPublishError(`${blocker.title}: ${blocker.detail}`);
      return;
    }
    const title = draftRef.current.title.trim();
    const artist = draftRef.current.artist.trim();
    setPublishError(undefined);
    setPublishing(true);
    try {
      let roomCoverSource = publishCover;
      try {
        roomCoverSource ??= (
          await sceneCapture.current?.({
            maxWidth: 960,
            maxHeight: 720,
            quality: 0.76,
          })
        )?.dataUrl;
      } catch (captureError) {
        console.warn(
          "Room cover capture unavailable; using artwork fallback.",
          captureError,
        );
      }
      const publishedGallery = await galleryRepository.publish(
        { ...draftRef.current, title, artist },
        roomCoverSource,
      );
      setPublished(publishedGallery);
      setPublishReviewOpen(false);
      navigate(`/g/${publishedGallery.id}`);
    } catch (error) {
      console.error(error);
      setPublishError(
        error instanceof Error
          ? error.message
          : "Publishing could not connect to Firebase. Please check the connection and try again.",
      );
    } finally {
      setPublishing(false);
    }
  };
  const recoverSavedDraft = useCallback(() => {
    if (!recoveryDraft) return;
    resetDraft(recoveryDraft.draft);
    saveRevision.current = recoveryDraft.revision;
    setRecoveryDraft(undefined);
    setStorageReady(true);
    setSaveStatus("saved");
  }, [recoveryDraft, resetDraft]);
  const startFreshDraft = useCallback(() => {
    resetDraft(
      initialDemoArt
        ? createDemoCollectionDraft(initialTemplate)
        : createGalleryDraft(initialTemplate),
    );
    setRecoveryDraft(undefined);
    setStorageReady(false);
    setSaveStatus("checking");
    void deleteGalleryDraft(initialTemplate)
      .then(() => {
        setStorageReady(true);
        setSaveStatus("ready");
      })
      .catch(() => {
        setStorageReady(true);
        setSaveStatus("error");
      });
  }, [initialDemoArt, initialTemplate, resetDraft]);
  const closePublishReview = useCallback(() => setPublishReviewOpen(false), []);
  const rememberSceneCapture = useCallback(
    (capture: GallerySceneCapture | null) => {
      sceneCapture.current = capture;
    },
    [],
  );
  const duplicateSelectedArtwork = () => {
    const source = draftRef.current.artworks.find(
      (item) => item.id === selectedId,
    );
    if (!source) return;
    if (draftRef.current.artworks.length >= maxArtworks) {
      setPlacementError(
        `This room already contains its maximum of ${maxArtworks} artworks.`,
      );
      return;
    }
    const copy: Artwork = {
      ...source,
      id: crypto.randomUUID(),
      title: `${source.title || "Untitled artwork"} copy`.slice(0, 80),
      locked: false,
      hidden: false,
    };
    const withCopy = {
      ...draftRef.current,
      artworks: [...draftRef.current.artworks, copy],
    };
    const walls = [
      source.wall,
      ...availableWalls(withCopy.templateId).filter(
        (wall) => wall !== source.wall,
      ),
    ];
    const placement = walls
      .map((wall) =>
        findAvailableArtworkPlacement(
          withCopy,
          copy.id,
          wall,
          wall === source.wall ? source.x + 0.5 : 0,
          source.y,
        ),
      )
      .find(Boolean);
    if (!placement) {
      setPlacementError(
        "No safe wall position is available for a duplicate. Reduce another work or choose a larger room.",
      );
      return;
    }
    setDraft({
      ...withCopy,
      artworks: withCopy.artworks.map((item) =>
        item.id === copy.id ? { ...item, ...placement } : item,
      ),
    });
    setSelectedId(copy.id);
    setSelectedDecorId(undefined);
    setPlacementError(undefined);
    requestWallFocus(placement.wall);
  };
  const focusReviewIssue = (issue: PublishReviewIssue) => {
    if (!issue.targetId) return;
    const artwork = draft.artworks.find((item) => item.id === issue.targetId);
    if (artwork) {
      selectArtwork(artwork.id);
      requestWallFocus(artwork.wall);
    } else if (draft.decor.some((item) => item.id === issue.targetId))
      selectDecor(issue.targetId);
    setPublishReviewOpen(false);
  };
  const undoDraft = () => {
    if (undo()) {
      setSelectedId(undefined);
      setSelectedDecorId(undefined);
      setPlacementError(undefined);
    }
  };
  const redoDraft = () => {
    if (redo()) {
      setSelectedId(undefined);
      setSelectedDecorId(undefined);
      setPlacementError(undefined);
    }
  };

  if (published) {
    const url = `${location.href.split("#")[0]}#/g/${published.id}`;
    return (
      <main className="publish-success">
        <div>
          <Logo />
          <p className="eyebrow">Gallery published · Live for 10 days</p>
          <h1>
            Your space is
            <br />
            <em>ready to share.</em>
          </h1>
          <p>
            Anyone with this link can enter your exhibition. It also appears in
            Discover for ten days.
          </p>
          <div className="share-field">
            <input readOnly value={url} />
            <button
              onClick={() => {
                const copy =
                  navigator.clipboard?.writeText(url) ?? Promise.reject();
                void copy
                  .then(() => {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1800);
                  })
                  .catch(() => window.prompt("Copy your gallery link:", url));
              }}
            >
              {copied ? "Copied ✓" : "Copy link"}
            </button>
          </div>
          <div className="success-actions">
            <button
              className="button button--light"
              onClick={() => navigate(`/g/${published.id}`)}
            >
              Open gallery ↗
            </button>
            <button className="text-link" onClick={() => navigate("/")}>
              View in Discover
            </button>
            <button
              className="text-link"
              onClick={() => setPublished(undefined)}
            >
              Back to editor
            </button>
          </div>
        </div>
        <GalleryScene draft={published} visitor />
      </main>
    );
  }

  const editorAlert = publishError ?? placementError;
  const cycleToolSheet = () =>
    setToolSheet((current) =>
      current === "peek" ? "half" : current === "half" ? "full" : "peek",
    );
  return (
    <main className="studio">
      <header className="studio-header">
        <Logo />
        <div className="studio-title">
          <input
            aria-label="Gallery title"
            maxLength={100}
            value={draft.title}
            onChange={(event) => update("title", event.target.value)}
          />
          <span>by</span>
          <input
            aria-label="Artist name"
            maxLength={100}
            value={draft.artist}
            onChange={(event) => update("artist", event.target.value)}
          />
        </div>
        <div className="studio-actions">
          <span
            className={`draft-save-status draft-save-status--${saveStatus}`}
            role="status"
            aria-live="polite"
          >
            {saveStatus === "checking"
              ? "Checking draft…"
              : saveStatus === "saving"
                ? "Saving…"
                : saveStatus === "saved"
                  ? "Saved locally"
                  : saveStatus === "error"
                    ? "Save error"
                    : "Autosave ready"}
          </span>
          <div
            className="history-controls"
            role="group"
            aria-label="Draft history"
          >
            <button
              type="button"
              onClick={undoDraft}
              disabled={!canUndo}
              aria-label="Undo last change"
              title="Undo (Ctrl/Command Z)"
            >
              ↶
            </button>
            <button
              type="button"
              onClick={redoDraft}
              disabled={!canRedo}
              aria-label="Redo last change"
              title="Redo (Ctrl/Command Shift Z)"
            >
              ↷
            </button>
          </div>
          <button
            className="ai-curate-button"
            onClick={() => void curateWithAi()}
            disabled={!draft.artworks.length || curating || uploading}
            title={
              draft.artworks.length
                ? "Automatically curate this exhibition"
                : "Upload artwork first"
            }
          >
            <span>✦</span>
            {curating ? "Curating…" : "AI Curator"}
          </button>
          <button
            ref={publishButton}
            className="publish-button"
            onClick={openPublishReview}
            disabled={publishing || uploading || curating}
          >
            {publishing ? "Publishing…" : "Review & publish"} <span>↗</span>
          </button>
        </div>
      </header>
      {editorAlert && (
        <div className="studio-alert" role="alert">
          <span>
            {publishError ? "Before publishing" : "Placement not changed"}
          </span>
          {editorAlert}
          <button
            onClick={() => {
              setPublishError(undefined);
              setPlacementError(undefined);
            }}
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      )}
      <div className="studio-body">
        <aside className={`tool-panel tool-panel--${toolSheet}`}>
          <button
            className="tool-sheet-handle"
            type="button"
            onClick={cycleToolSheet}
            aria-label={`Editor tools are ${toolSheet}. Change panel size`}
            aria-expanded={toolSheet === "full"}
          >
            <i aria-hidden="true" />
            <span>Editor tools</span>
            <b>
              {toolSheet === "peek"
                ? "Open"
                : toolSheet === "half"
                  ? "Expand"
                  : "Minimize"}
            </b>
          </button>
          <section className="mobile-exhibition">
            <p className="tool-label">Exhibition details</p>
            <label>
              Gallery title
              <input
                maxLength={100}
                value={draft.title}
                onChange={(event) => update("title", event.target.value)}
              />
            </label>
            <label>
              Artist name
              <input
                maxLength={100}
                value={draft.artist}
                onChange={(event) => update("artist", event.target.value)}
              />
            </label>
          </section>
          <section>
            <p className="tool-label">01 · Artwork</p>
            <label
              className={`upload ${uploading ? "is-uploading" : ""}`}
              aria-busy={uploading}
            >
              <input
                className="visually-hidden"
                type="file"
                aria-label="Upload artwork images"
                accept="image/*,.heic,.heif"
                multiple
                disabled={uploading}
                onChange={(event) => {
                  const input = event.currentTarget;
                  void upload(input.files).finally(() => {
                    input.value = "";
                  });
                }}
              />
              <span aria-hidden="true">{uploading ? "◌" : "＋"}</span>
              <strong>
                {uploading ? "Preparing artwork…" : "Upload artwork"}
              </strong>
              <small>
                {uploading
                  ? "Optimizing for the gallery"
                  : `JPG, PNG, WebP or HEIC · up to ${maxArtworks}`}
              </small>
            </label>
            {uploadError && (
              <p className="upload-error" role="alert">
                {uploadError}
              </p>
            )}
            <div className="artwork-list">
              {draft.artworks.map((artwork, index) => (
                <button
                  key={artwork.id}
                  className={`${selectedId === artwork.id ? "active" : ""} ${artwork.hidden ? "is-hidden" : ""}`}
                  aria-pressed={selectedId === artwork.id}
                  onClick={() => openArtwork(artwork.id)}
                >
                  <img src={artwork.src} alt="" />
                  <span>
                    {String(index + 1).padStart(2, "0")} · {artwork.title}
                    {(artwork.locked || artwork.hidden) && (
                      <small>
                        {artwork.locked ? "Locked" : ""}
                        {artwork.locked && artwork.hidden ? " · " : ""}
                        {artwork.hidden ? "Hidden" : ""}
                      </small>
                    )}
                  </span>
                </button>
              ))}
            </div>
            {selected && (
              <div className="placement">
                <WallPicker
                  templateId={draft.templateId}
                  artworks={draft.artworks}
                  activeWall={selected.wall}
                  onChoose={changeArtworkWall}
                />
                <p className="placement-guide">
                  <span>
                    <strong>
                      Choose wall → click to place → drag to refine.
                    </strong>
                    <br />
                    {placementNotice ??
                      "The camera flies to the wall and finds a free position automatically."}
                  </span>
                </p>
                <label>
                  Title
                  <input
                    type="text"
                    value={selected.title}
                    maxLength={80}
                    onChange={(event) =>
                      updateArtwork({ title: event.target.value })
                    }
                  />
                </label>
                <label>
                  Year
                  <input
                    type="text"
                    value={selected.year ?? ""}
                    maxLength={12}
                    placeholder="2026"
                    onChange={(event) =>
                      updateArtwork({ year: event.target.value })
                    }
                  />
                </label>
                <label className="placement-note">
                  Artwork note
                  <textarea
                    value={selected.description ?? ""}
                    maxLength={240}
                    placeholder="A short note visitors can read…"
                    onChange={(event) =>
                      updateArtwork({ description: event.target.value })
                    }
                  />
                </label>
                <div
                  className="artwork-state-actions"
                  role="group"
                  aria-label="Artwork state"
                >
                  <button
                    type="button"
                    className={selected.locked ? "active" : ""}
                    aria-pressed={Boolean(selected.locked)}
                    onClick={() => updateArtwork({ locked: !selected.locked })}
                  >
                    {selected.locked ? "Unlock placement" : "Lock placement"}
                  </button>
                  <button
                    type="button"
                    className={selected.hidden ? "active" : ""}
                    aria-pressed={Boolean(selected.hidden)}
                    onClick={() => updateArtwork({ hidden: !selected.hidden })}
                  >
                    {selected.hidden ? "Show in gallery" : "Hide in gallery"}
                  </button>
                </div>
                <p className="inspector-subhead">Frame</p>
                <Choice
                  options={["black", "white", "oak", "none"]}
                  value={selected.frame ?? "black"}
                  onChange={(frame) =>
                    updateArtwork({ frame: frame as Artwork["frame"] })
                  }
                />
                <label>
                  Fine placement
                  <select
                    value={selected.wall}
                    disabled={selected.locked}
                    onChange={(event) =>
                      changeArtworkWall(event.target.value as WallId)
                    }
                  >
                    <option value="north">Back wall</option>
                    <option value="south">Entrance wall · Behind you</option>
                    <option value="west">Left wall</option>
                    <option value="east">Right wall</option>
                    {draft.templateId === "pavilion" && (
                      <>
                        <option value="divider-front">Feature wall A</option>
                        <option value="divider-back">Feature wall B</option>
                      </>
                    )}
                  </select>
                </label>
                <Range
                  label="Horizontal"
                  unit="m"
                  min={selectedBounds.min}
                  max={selectedBounds.max}
                  step={PLACEMENT_GRID_STEP_METRES}
                  value={selected.x}
                  disabled={selected.locked}
                  onChange={(x) => updateArtwork({ x })}
                />
                <Range
                  label="Centre height"
                  unit="m"
                  min={1}
                  max={Math.max(
                    3.6,
                    roomTemplate.height -
                      (selected.wall.startsWith("divider") ? 1.25 : 0.75),
                  )}
                  step={PLACEMENT_GRID_STEP_METRES}
                  value={selected.y}
                  disabled={selected.locked}
                  onChange={(y) => updateArtwork({ y })}
                />
                <Range
                  label="Artwork height"
                  unit="m"
                  min={0.69}
                  max={2.46}
                  step={PLACEMENT_GRID_STEP_METRES}
                  value={selectedSize?.height ?? 1.5}
                  disabled={selected.locked}
                  onChange={(height) => updateArtwork({ scale: height / 1.5 })}
                />
                <p className="artwork-dimensions" aria-live="polite">
                  <span>Displayed size</span>
                  <strong>
                    {Math.round((selectedSize?.width ?? 0) * 100)} ×{" "}
                    {Math.round((selectedSize?.height ?? 0) * 100)} cm
                  </strong>
                  <small>
                    Aspect ratio stays locked to the uploaded image.
                  </small>
                </p>
                <div
                  className="placement-actions"
                  role="group"
                  aria-label="Artwork placement shortcuts"
                >
                  <button
                    type="button"
                    onClick={() => requestWallFocus(selected.wall)}
                  >
                    Focus selected
                  </button>
                  <button
                    type="button"
                    disabled={selected.locked}
                    onClick={() => alignSelectedArtwork("left")}
                  >
                    Align left
                  </button>
                  <button
                    type="button"
                    disabled={selected.locked}
                    onClick={() => alignSelectedArtwork("center")}
                  >
                    Center on wall
                  </button>
                  <button
                    type="button"
                    disabled={selected.locked}
                    onClick={() => alignSelectedArtwork("right")}
                  >
                    Align right
                  </button>
                  <button
                    type="button"
                    disabled={selected.locked}
                    onClick={() =>
                      placeArtwork(
                        selected.id,
                        selected.wall,
                        selected.x,
                        DEFAULT_ARTWORK_EYE_LINE_METRES,
                      )
                    }
                  >
                    Eye line 1.75 m
                  </button>
                  <button
                    type="button"
                    disabled={selected.locked}
                    onClick={distributeSelectedWall}
                  >
                    Space this wall
                  </button>
                  <button
                    type="button"
                    onClick={duplicateSelectedArtwork}
                    disabled={draft.artworks.length >= maxArtworks}
                  >
                    Duplicate
                  </button>
                </div>
                <button
                  className="remove"
                  onClick={() => {
                    update(
                      "artworks",
                      draft.artworks.filter((item) => item.id !== selectedId),
                    );
                    setSelectedId(undefined);
                  }}
                >
                  Remove artwork
                </button>
              </div>
            )}
          </section>
          <Accordion title="02 · Walls">
            <p className="object-help">
              Ten distinct architectural finishes, tuned to remain calm behind the
              artwork.
            </p>
            <Swatches
              options={[
                ["chalk", "linear-gradient(135deg,#f1eee6,#cfcac0)", "plaster"],
                ["warm", "linear-gradient(135deg,#c99478,#8f5545)", "clay limewash"],
                ["light-concrete", "linear-gradient(135deg,#d6d6d4,#aeb0b0)", "light concrete"],
                ["charcoal", "linear-gradient(135deg,#3a3c39,#202220)", "dark concrete"],
                [
                  "microcement",
                  "linear-gradient(135deg,#a9a398,#777970)",
                  "greige microcement",
                ],
                [
                  "limestone",
                  "linear-gradient(135deg,#e4bb72,#b67832)",
                  "gold sandstone",
                ],
                [
                  "oak-slats",
                  "repeating-linear-gradient(90deg,#b58d5c 0 8px,#1f1b17 9px 12px)",
                  "light oak slats",
                ],
                ["black-slats", "repeating-linear-gradient(90deg,#272827 0 8px,#050606 9px 12px)", "black oak slats"],
                ["marble-wall", "linear-gradient(135deg,#f0eee8 38%,#9b9d99 40%,#e3e0d8 43%)", "white marble"],
                ["dark-stone", "linear-gradient(135deg,#15241f,#445148 52%,#202a25)", "green stone"],
              ]}
              value={draft.wall}
              onChange={(value) =>
                update("wall", value as GalleryDraft["wall"])
              }
            />
          </Accordion>
          <Accordion title="03 · Floor">
            <p className="object-help">
              Ten distinct gallery-grade surfaces with calibrated grain and natural
              reflections.
            </p>
            <Swatches
              options={[
                [
                  "concrete",
                  "linear-gradient(135deg,#777672,#a7a39a)",
                  "mineral concrete",
                ],
                ["dark-concrete", "linear-gradient(135deg,#303231,#595b58)", "dark polished concrete"],
                ["microcement", "linear-gradient(135deg,#b8aa95,#8e8272)", "warm microcement"],
                ["slate", "linear-gradient(135deg,#171918,#444845 48%,#222422)", "black slate"],
                ["travertine-floor", "repeating-linear-gradient(0deg,#d8c8aa 0 3px,#e9ddc8 4px 9px)", "beige travertine"],
                [
                  "marble",
                  "linear-gradient(135deg,#ece9e1 35%,#8c8f8c 37%,#e2ded4 40%)",
                  "white marble",
                ],
                [
                  "black-marble",
                  "linear-gradient(135deg,#111 35%,#b8b8b3 37%,#191919 40%)",
                  "black marble",
                ],
                [
                  "walnut",
                  "repeating-linear-gradient(0deg,#392116 0 8px,#6b4028 9px 16px)",
                  "walnut",
                ],
                ["oak", "repeating-linear-gradient(90deg,#c59a66 0 12px,#d6b17f 13px 25px)", "natural oak"],
                ["terrazzo", "radial-gradient(circle at 20% 25%,#777 0 2px,transparent 3px),radial-gradient(circle at 65% 70%,#b78f76 0 2px,#d8d4ca 3px)", "light terrazzo"],
              ]}
              value={draft.floor}
              onChange={(value) =>
                update("floor", value as GalleryDraft["floor"])
              }
            />
          </Accordion>
          <Accordion title="04 · Ceiling design">
            <p className="object-help">
              The roof follows the wall finish automatically. Choose one
              considered interior ceiling system.
            </p>
            <Swatches
              options={[
                [
                  "gallery",
                  "linear-gradient(135deg,#f3f1ea,#d8d5cd)",
                  "modern",
                ],
                [
                  "warm",
                  "linear-gradient(135deg,#d5c2a5,#8b7456)",
                  "luxury coffers",
                ],
                [
                  "dark",
                  "linear-gradient(135deg,#20231f 38%,#e3c183 42%,#1a1c19 47%)",
                  "LED light strips",
                ],
                [
                  "skylight",
                  "linear-gradient(135deg,#d8edf4 30%,#fff 34%,#b6d4df 72%)",
                  "luminous skylight",
                ],
                [
                  "vaulted",
                  "radial-gradient(ellipse at 50% 100%,#eee8dc 0 45%,#b9aa91 48% 55%,#6d6559 58%)",
                  "barrel vault",
                ],
              ]}
              value={draft.ceiling ?? "gallery"}
              onChange={(value) =>
                update("ceiling", value as NonNullable<GalleryDraft["ceiling"]>)
              }
            />
          </Accordion>
          <Accordion title="05 · Lighting">
            <p className="object-help">
              Ceiling ambience is installed automatically. Every spotlight
              follows an artwork when you reposition it.
            </p>
            <Choice
              options={["daylight", "museum", "evening"]}
              value={draft.lighting}
              onChange={(value) =>
                update("lighting", value as GalleryDraft["lighting"])
              }
            />
          </Accordion>
          <Accordion title="06 · Objects">
            <p className="object-help">
              Add an object, then drag it directly in the room or click an empty
              floor position. Every card shows its real collision footprint.
            </p>
            <p
              className={`object-limit ${draft.decor.length >= MAX_DECOR_OBJECTS ? "is-full" : ""}`}
              aria-live="polite"
            >
              {draft.decor.length} / {MAX_DECOR_OBJECTS} objects
              {draft.decor.length >= MAX_DECOR_OBJECTS
                ? " · Remove one to add another."
                : ""}
            </p>
            <div className="object-grid">
              {DECOR_CATALOG.map((item) => (
                <button
                  key={item.id}
                  disabled={draft.decor.length >= MAX_DECOR_OBJECTS}
                  onClick={() => addDecor(item.id)}
                >
                  <span
                    className={`object-thumbnail object-thumbnail--${item.id}`}
                    aria-hidden="true"
                  >
                    <i />
                  </span>
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.size}</small>
                  </span>
                </button>
              ))}
            </div>
            <div className="decor-list">
              {draft.decor.map((item, index) => (
                <button
                  key={item.id}
                  className={selectedDecorId === item.id ? "active" : ""}
                  aria-pressed={selectedDecorId === item.id}
                  onClick={() => selectDecor(item.id)}
                >
                  {String(index + 1).padStart(2, "0")} · {decorName(item.type)}
                </button>
              ))}
            </div>
            {selectedDecor && (
              <div className="placement">
                <p className="direct-place-note">
                  <span>Direct placement active</span>
                  {placementNotice ??
                    "Drag the selected object in the room or click the floor."}
                </p>
                <Range
                  label="Left / right"
                  unit="m"
                  min={-decorLimitX}
                  max={decorLimitX}
                  step={PLACEMENT_GRID_STEP_METRES}
                  value={selectedDecor.x}
                  onChange={(x) => updateDecor({ x })}
                />
                <Range
                  label="Forward / back"
                  unit="m"
                  min={-decorLimitZ}
                  max={decorLimitZ}
                  step={PLACEMENT_GRID_STEP_METRES}
                  value={selectedDecor.z}
                  onChange={(z) => updateDecor({ z })}
                />
                <Range
                  label="Rotation"
                  unit="°"
                  displayMultiplier={180 / Math.PI}
                  min={0}
                  max={Math.PI * 2}
                  step={Math.PI / 36}
                  value={selectedDecor.rotation}
                  onChange={(rotation) => updateDecor({ rotation })}
                />
                <Range
                  label="Size"
                  unit="×"
                  min={0.5}
                  max={1.8}
                  step={0.05}
                  value={selectedDecor.scale}
                  onChange={(scale) => updateDecor({ scale })}
                />
                <button
                  className="remove"
                  onClick={() => {
                    update(
                      "decor",
                      draft.decor.filter((item) => item.id !== selectedDecorId),
                    );
                    setSelectedDecorId(undefined);
                  }}
                >
                  Remove object
                </button>
              </div>
            )}
          </Accordion>
        </aside>
        <section className="canvas-wrap">
          <GalleryScene
            draft={draft}
            selectedId={selectedId}
            selectedDecorId={selectedDecorId}
            focusWall={wallFocus}
            onSelect={selectArtwork}
            onSelectDecor={selectDecor}
            onMoveDecor={placeDecor}
            onMoveArtwork={placeArtwork}
            onViewPlacementChange={rememberDecorInsertion}
            onCaptureReady={rememberSceneCapture}
          />
          <div className="canvas-badge">
            <span>Editing</span>
            {TEMPLATES.find((item) => item.id === draft.templateId)?.name}
          </div>
          {curating && (
            <div
              className="ai-curation-overlay"
              role="status"
              aria-live="polite"
            >
              <div className="ai-orbit">
                <i />
                <i />
                <i />
                <span>✦</span>
              </div>
              <p>AI Curator</p>
              <h2>{curationPhaseCopy}</h2>
              <small>Your images stay in this browser.</small>
              <div className={`ai-progress ai-progress--${curationPhase}`}>
                <i />
                <i />
                <i />
              </div>
            </div>
          )}
          {(curationReport || curationError) && !curating && (
            <div
              className={`ai-curation-result ${curationError ? "is-error" : ""}`}
              role="status"
            >
              <button
                className="ai-result-close"
                onClick={() => {
                  setCurationReport(undefined);
                  setCurationError(undefined);
                }}
                aria-label="Close AI Curator result"
              >
                ×
              </button>
              <span>
                {curationError ? "AI Curator" : "Curated automatically ✦"}
              </span>
              {curationError ? (
                <p>{curationError}</p>
              ) : (
                <>
                  <h3>{curationReport?.mood}</h3>
                  <p>
                    {curationReport?.placementCount} artworks composed ·{" "}
                    {curationReport?.decorCount} objects placed
                    <br />
                    {curationReport?.palette}
                  </p>
                </>
              )}
              {curationSnapshot && !curationError && (
                <button className="ai-undo" onClick={undoCuration}>
                  Undo AI curation
                </button>
              )}
            </div>
          )}
        </section>
      </div>
      {recoveryDraft && (
        <RecoveryDialog
          stored={recoveryDraft}
          onRecover={recoverSavedDraft}
          onDiscard={startFreshDraft}
        />
      )}
      {publishReviewOpen && (
        <PublishReviewDialog
          issues={publishIssues}
          blockers={publishBlockers.length}
          publishing={publishing}
          publishError={publishError}
          coverSrc={publishCover}
          returnFocus={publishButton}
          onClose={closePublishReview}
          onPublish={() => void publish()}
          onFocusIssue={focusReviewIssue}
        />
      )}
    </main>
  );
}

function useDialogFocus(
  dialog: React.RefObject<HTMLElement | null>,
  onClose: () => void,
  returnFocus?: React.RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const returnElement = returnFocus?.current;
    const element = dialog.current;
    const focusable = () =>
      Array.from(
        element?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    (focusable()[0] ?? element)?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    addEventListener("keydown", onKeyDown);
    return () => {
      removeEventListener("keydown", onKeyDown);
      (returnElement ?? previous)?.focus?.({ preventScroll: true });
    };
  }, [dialog, onClose, returnFocus]);
}

function RecoveryDialog({
  stored,
  onRecover,
  onDiscard,
}: {
  stored: StoredGalleryDraft;
  onRecover: () => void;
  onDiscard: () => void;
}) {
  const dialog = useRef<HTMLElement>(null);
  useDialogFocus(dialog, onRecover);
  const savedAt = new Date(stored.savedAt);
  return (
    <div className="editor-modal-backdrop">
      <section
        ref={dialog}
        className="editor-modal recovery-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recovery-title"
        tabIndex={-1}
      >
        <p className="eyebrow">Local draft found</p>
        <h2 id="recovery-title">Continue where you left off?</h2>
        <p>
          Your {stored.draft.artworks.length}-artwork draft was saved on{" "}
          {savedAt.toLocaleDateString(undefined, {
            day: "numeric",
            month: "short",
          })}{" "}
          at{" "}
          {savedAt.toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
          })}
          .
        </p>
        <div className="editor-modal-actions">
          <button className="button button--dark" onClick={onRecover}>
            Recover draft
          </button>
          <button className="text-link" onClick={onDiscard}>
            Start fresh
          </button>
        </div>
      </section>
    </div>
  );
}

function PublishReviewDialog({
  issues,
  blockers,
  publishing,
  publishError,
  coverSrc,
  returnFocus,
  onClose,
  onPublish,
  onFocusIssue,
}: {
  issues: PublishReviewIssue[];
  blockers: number;
  publishing: boolean;
  publishError?: string;
  coverSrc?: string;
  returnFocus: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  onPublish: () => void;
  onFocusIssue: (issue: PublishReviewIssue) => void;
}) {
  const dialog = useRef<HTMLElement>(null);
  useDialogFocus(dialog, onClose, returnFocus);
  const warnings = issues.filter(
    (issue) => issue.severity === "warning",
  ).length;
  return (
    <div className="editor-modal-backdrop">
      <section
        ref={dialog}
        className="editor-modal publish-review"
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-review-title"
        aria-describedby="publish-review-summary"
        tabIndex={-1}
      >
        <button
          className="editor-modal-close"
          onClick={onClose}
          aria-label="Close publish review"
        >
          ×
        </button>
        <p className="eyebrow">Pre-publish review</p>
        <h2 id="publish-review-title">Check the visitor experience.</h2>
        <p id="publish-review-summary">
          {blockers
            ? `${blockers} issue${blockers === 1 ? "" : "s"} must be fixed before publishing.`
            : warnings
              ? `Geometry passed. ${warnings} optional metadata improvement${warnings === 1 ? "" : "s"} remain.`
              : "Everything is ready for visitors."}
        </p>
        <div className="publish-review-status" aria-live="polite">
          <span className={blockers ? "is-error" : "is-ready"}>
            {blockers ? `${blockers} blocked` : "Geometry valid ✓"}
          </span>
          <span>
            {warnings} warning{warnings === 1 ? "" : "s"}
          </span>
        </div>
        <div className="publish-cover-review">
          {coverSrc ? (
            <img
              src={coverSrc}
              alt="Room cover captured from the current editor view"
            />
          ) : (
            <span aria-live="polite">Rendering room cover…</span>
          )}
          <p>
            <strong>Share cover</strong>Current editor view. Close this review
            to choose another angle.
          </p>
        </div>
        {issues.length > 0 && (
          <ul className="publish-review-list">
            {issues.map((issue) => (
              <li key={issue.id} className={`is-${issue.severity}`}>
                <span>{issue.severity === "error" ? "!" : "i"}</span>
                <div>
                  <strong>{issue.title}</strong>
                  <p>{issue.detail}</p>
                </div>
                {issue.targetId && (
                  <button onClick={() => onFocusIssue(issue)}>Fix</button>
                )}
              </li>
            ))}
          </ul>
        )}
        <fieldset className="publish-visibility">
          <legend>Visibility and duration</legend>
          <label>
            <input type="radio" name="visibility" checked readOnly /> Public ·
            Discover for 10 days
          </label>
          <label aria-disabled="true">
            <input type="radio" name="visibility" disabled /> Unlisted · Pilot
            plan
          </label>
          <label aria-disabled="true">
            <input type="radio" name="visibility" disabled /> Private · Pilot
            plan
          </label>
          <small>
            This MVP currently publishes publicly for ten days. Private and
            unlisted links are not active yet.
          </small>
        </fieldset>
        {publishError && (
          <p className="publish-review-error" role="alert">
            {publishError}
          </p>
        )}
        <div className="editor-modal-actions">
          <button
            className="publish-button"
            onClick={onPublish}
            disabled={blockers > 0 || publishing}
          >
            {publishing ? "Publishing…" : "Publish public gallery"}
          </button>
          <button className="text-link" onClick={onClose} disabled={publishing}>
            Back to editor
          </button>
        </div>
      </section>
    </div>
  );
}

function WallPicker({
  templateId,
  artworks,
  activeWall,
  onChoose,
}: {
  templateId: TemplateId;
  artworks: Artwork[];
  activeWall: WallId;
  onChoose: (wall: WallId) => void;
}) {
  const walls = availableWalls(templateId);
  return (
    <div className="wall-picker">
      <div className="wall-picker__intro">
        <div>
          <strong>Choose a wall</strong>
          <p>The camera will take you there.</p>
        </div>
        <span className="wall-picker__count">{artworks.length}</span>
      </div>
      <div
        className="wall-picker__grid"
        role="group"
        aria-label="Choose artwork wall"
      >
        {walls.map((wall) => {
          const count = artworks.filter((item) => item.wall === wall).length;
          return (
            <button
              type="button"
              key={wall}
              className={activeWall === wall ? "active" : ""}
              aria-pressed={activeWall === wall}
              onClick={() => onChoose(wall)}
            >
              {wallLabel(templateId, wall)} · {count}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Range({
  label,
  unit,
  min,
  max,
  step,
  value,
  disabled = false,
  displayMultiplier = 1,
  onChange,
}: {
  label: string;
  unit: "m" | "°" | "×";
  min: number;
  max: number;
  step: number;
  value: number;
  disabled?: boolean;
  displayMultiplier?: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const displayed = value * displayMultiplier;
  const displayStep = step * displayMultiplier;
  const precision = unit === "°" ? 0 : 2;
  const valueText =
    unit === "×"
      ? `${displayed.toFixed(precision)}×`
      : `${displayed.toFixed(precision)} ${unit}`;
  return (
    <label className="range-field" htmlFor={`${id}-range`}>
      <span className="range-caption">
        <span>{label}</span>
        <output>{valueText}</output>
      </span>
      <span className="range-controls">
        <input
          id={`${id}-range`}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          aria-valuetext={valueText}
          onChange={(event) => onChange(+event.target.value)}
        />
        <span className="range-number">
          <input
            type="number"
            aria-label={`${label} numeric value in ${unit === "×" ? "scale" : unit === "°" ? "degrees" : "metres"}`}
            min={min * displayMultiplier}
            max={max * displayMultiplier}
            step={displayStep}
            value={displayed.toFixed(precision)}
            disabled={disabled}
            onChange={(event) => {
              const next = event.currentTarget.valueAsNumber;
              if (Number.isFinite(next)) onChange(next / displayMultiplier);
            }}
          />
          <span aria-hidden="true">{unit}</span>
        </span>
      </span>
    </label>
  );
}
function Accordion({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <details>
      <summary>
        {title}
        <span>＋</span>
      </summary>
      <div className="detail-content">{children}</div>
    </details>
  );
}
function Swatches({
  options,
  value,
  onChange,
}: {
  options: [string, string, string?][];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="swatches">
      {options.map(([name, color, label]) => (
        <button
          type="button"
          key={name}
          className={value === name ? "active" : ""}
          aria-pressed={value === name}
          onClick={() => onChange(name)}
        >
          <i style={{ background: color }} />
          <span>{label || name}</span>
        </button>
      ))}
    </div>
  );
}
function Choice({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="choices">
      {options.map((item) => (
        <button
          type="button"
          key={item}
          className={value === item ? "active" : ""}
          aria-pressed={value === item}
          onClick={() => onChange(item)}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

interface GlbDirectoryDocument {
  images?: Array<{ name?: string; mimeType?: string; bufferView?: number }>;
  bufferViews?: Array<{ byteOffset?: number; byteLength: number }>;
}

async function loadDannyArtworkImages(
  signal: AbortSignal,
): Promise<Record<string, string>> {
  const response = await fetch("./assets/demo/danny-gallery-mobile.glb", {
    signal,
  });
  if (!response.ok)
    throw new Error(`Artwork source returned ${response.status}.`);
  const buffer = await response.arrayBuffer();
  const view = new DataView(buffer);
  if (view.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67)
    throw new Error("Artwork source is not a valid GLB.");
  let offset = 12;
  let document: GlbDirectoryDocument | undefined;
  let binaryOffset = -1;
  while (offset + 8 <= view.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + length > view.byteLength)
      throw new Error("Artwork source has an invalid chunk length.");
    if (type === 0x4e4f534a) {
      const source = new TextDecoder()
        .decode(new Uint8Array(buffer, start, length))
        .replace(/\0+$/u, "")
        .trim();
      document = JSON.parse(source) as GlbDirectoryDocument;
    } else if (type === 0x004e4942) binaryOffset = start;
    offset = start + length;
  }
  if (!document?.images || !document.bufferViews || binaryOffset < 0)
    throw new Error("Artwork images are missing from the GLB.");
  const urls: Record<string, string> = {};
  for (const artwork of DANNY_ARTWORKS) {
    if (!artwork.imageKey) continue;
    const image = document.images.find(
      (candidate) => candidate.name === artwork.imageKey,
    );
    if (image?.bufferView === undefined) continue;
    const source = document.bufferViews[image.bufferView];
    if (!source) continue;
    const start = binaryOffset + (source.byteOffset ?? 0);
    const end = start + source.byteLength;
    if (start < binaryOffset || end > buffer.byteLength) continue;
    urls[artwork.imageKey] = URL.createObjectURL(
      new Blob([buffer.slice(start, end)], {
        type: image.mimeType ?? "image/webp",
      }),
    );
  }
  return urls;
}

function useDannyArtworkImages(active: boolean) {
  const [images, setImages] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const started = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const objectUrls = useRef<string[]>([]);
  useEffect(() => {
    if (!active || started.current) return;
    started.current = true;
    controller.current = new AbortController();
    void loadDannyArtworkImages(controller.current.signal)
      .then((loaded) => {
        objectUrls.current = Object.values(loaded);
        if (controller.current?.signal.aborted) {
          objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
          objectUrls.current = [];
          return;
        }
        setImages(loaded);
        setStatus("ready");
      })
      .catch((error) => {
        if (controller.current?.signal.aborted) return;
        console.warn("Accessible Danny artwork images unavailable", error);
        setStatus("error");
      });
  }, [active]);
  useEffect(
    () => () => {
      controller.current?.abort();
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrls.current = [];
      started.current = false;
    },
    [],
  );
  return {
    images,
    status: active && status === "idle" ? ("loading" as const) : status,
  };
}

function useViewerSceneUnavailable(
  host: React.RefObject<HTMLElement | null>,
  active = true,
  onUnavailable?: () => void,
) {
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const element = host.current;
    if (!active || !element) return undefined;
    let reported = false;
    const inspect = () => {
      if (element.querySelector(".scene-error")) {
        setUnavailable(true);
        if (!reported) {
          reported = true;
          onUnavailable?.();
        }
      } else if (element.querySelector(".gallery-scene canvas")) {
        reported = false;
        setUnavailable(false);
      }
    };
    const observer = new MutationObserver(inspect);
    const onContextLost = (event: Event) => {
      if (
        !(event.target instanceof HTMLCanvasElement) ||
        !element.contains(event.target)
      )
        return;
      setUnavailable(true);
      if (!reported) {
        reported = true;
        onUnavailable?.();
      }
    };
    const onContextRestored = () => inspect();
    observer.observe(element, { childList: true, subtree: true });
    element.addEventListener("webglcontextlost", onContextLost, true);
    element.addEventListener("webglcontextrestored", onContextRestored, true);
    queueMicrotask(inspect);
    return () => {
      observer.disconnect();
      element.removeEventListener("webglcontextlost", onContextLost, true);
      element.removeEventListener(
        "webglcontextrestored",
        onContextRestored,
        true,
      );
    };
  }, [active, host, onUnavailable]);
  return unavailable;
}

function ArtworkDirectoryButton({
  count,
  unavailable,
  expanded,
  buttonRef,
  onOpen,
}: {
  count: number;
  unavailable: boolean;
  expanded: boolean;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  onOpen: () => void;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`artwork-directory-toggle ${unavailable ? "is-fallback" : ""}`}
      aria-controls="artwork-directory"
      aria-haspopup="dialog"
      aria-expanded={expanded}
      aria-label={`Open artwork list, ${count} work${count === 1 ? "" : "s"}${unavailable ? ". The 3D view is unavailable." : ""}`}
      onClick={onOpen}
    >
      <span aria-hidden="true">☷</span>
      <span>Artworks</span>
      <b>{count}</b>
    </button>
  );
}

function DirectoryArtworkImage({
  artwork,
  loading,
}: {
  artwork: DirectoryArtwork;
  loading?: boolean;
}) {
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

function ArtworkDirectory({
  exhibitionTitle,
  artist,
  artworks,
  sourceNote,
  unavailable,
  imagesLoading,
  returnFocus,
  onClose,
}: {
  exhibitionTitle: string;
  artist: string;
  artworks: DirectoryArtwork[];
  sourceNote: string;
  unavailable: boolean;
  imagesLoading?: boolean;
  returnFocus: React.RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
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
                    {(artwork.year ||
                      artwork.medium ||
                      artwork.dimensions ||
                      artwork.availability) && (
                      <dl>
                        {artwork.year && (
                          <div>
                            <dt>Year / edition</dt>
                            <dd>{artwork.year}</dd>
                          </div>
                        )}
                        {artwork.medium && (
                          <div>
                            <dt>Medium</dt>
                            <dd>{artwork.medium}</dd>
                          </div>
                        )}
                        {artwork.dimensions && (
                          <div>
                            <dt>Dimensions</dt>
                            <dd>{artwork.dimensions}</dd>
                          </div>
                        )}
                        {artwork.availability && (
                          <div>
                            <dt>Availability</dt>
                            <dd>{artwork.availability}</dd>
                          </div>
                        )}
                      </dl>
                    )}
                    <p className="artwork-directory-description">
                      {artwork.description ||
                        "No artwork note was provided for this exhibition."}
                    </p>
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

function ViewSwitch({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
}) {
  return (
    <div className="view-switch" role="group" aria-label="Gallery view">
      <button
        className={value === "walk" ? "active" : ""}
        onClick={() => onChange("walk")}
        aria-pressed={value === "walk"}
      >
        <span>⌖</span> Walk
      </button>
      <button
        className={value === "overview" ? "active" : ""}
        onClick={() => onChange("overview")}
        aria-pressed={value === "overview"}
      >
        <span>◫</span> Overview
      </button>
    </div>
  );
}

function ArtworkInfoCard({
  artwork,
  onClose,
}: {
  artwork: ArtworkFocus;
  onClose: () => void;
}) {
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
        {(artwork.medium || artwork.dimensions || artwork.availability) && (
          <dl>
            {artwork.medium && (
              <div>
                <dt>Medium</dt>
                <dd>{artwork.medium}</dd>
              </div>
            )}
            {artwork.dimensions && (
              <div>
                <dt>Dimensions</dt>
                <dd>{artwork.dimensions}</dd>
              </div>
            )}
            {artwork.availability && (
              <div>
                <dt>Availability</dt>
                <dd>{artwork.availability}</dd>
              </div>
            )}
          </dl>
        )}
        <p>
          {artwork.description ||
            "Presented as part of this virtual exhibition."}
        </p>
      </div>
    </aside>
  );
}

function MovementHint({ viewMode }: { viewMode: ViewMode }) {
  return (
    <div className="movement-hint" role="note">
      <span className="movement-hint__desktop">
        {viewMode === "walk"
          ? "WASD to walk · ↑↓ move · ←→ turn · Click floor to move"
          : "Drag to orbit · Scroll to zoom"}
      </span>
      <span className="movement-hint__mobile">
        {viewMode === "walk"
          ? "Drag to look · Tap floor to walk · Pinch to zoom"
          : "Drag to orbit · Pinch to zoom"}
      </span>
    </div>
  );
}

function DemoLoadingPoster({
  progress = 0,
  ready = false,
}: {
  progress?: number;
  ready?: boolean;
}) {
  return (
    <div
      className={`demo-loading-poster ${ready ? "is-ready" : ""}`}
      role="status"
      aria-live="polite"
      aria-hidden={ready}
    >
      <img
        src="./assets/demo/danny-cover.webp"
        width="1440"
        height="1000"
        fetchPriority="high"
        decoding="async"
        alt="Threshold exhibition by Danny Hirsch Arts"
      />
      <span />
      <p>Preparing exhibition · {Math.round(progress)}%</p>
    </div>
  );
}

function Demo() {
  const viewer = useRef<HTMLElement>(null);
  const directoryButton = useRef<HTMLButtonElement>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("walk");
  const [artworkFocus, setArtworkFocus] = useState<ArtworkFocus | null>(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const openFallbackDirectory = useCallback(() => {
    setArtworkFocus(null);
    setDirectoryOpen(true);
  }, []);
  const sceneUnavailable = useViewerSceneUnavailable(
    viewer,
    true,
    openFallbackDirectory,
  );
  const { images: dannyImages, status: imageStatus } =
    useDannyArtworkImages(directoryOpen);
  const directoryArtworks = useMemo(
    () =>
      DANNY_ARTWORKS.map((artwork) => ({
        ...artwork,
        image: artwork.imageKey ? dannyImages[artwork.imageKey] : undefined,
      })),
    [dannyImages],
  );
  const changeView = (value: ViewMode) => {
    setArtworkFocus(null);
    setViewMode(value);
  };
  return (
    <main ref={viewer} className="viewer">
      <header className="viewer-header">
        <Logo />
        <div>
          <p>Danny Hirsch Arts</p>
          <span>Threshold · 2026</span>
        </div>
        <button onClick={() => navigate("/create")}>Create your own ↗</button>
      </header>
      <div className="viewer-scene-layer">
        <Suspense fallback={<DemoLoadingPoster />}>
          <DannyDemoScene
            viewMode={viewMode}
            playIntro
            onArtworkFocus={setArtworkFocus}
            onLoadProgress={setLoadProgress}
          />
          <DemoLoadingPoster
            progress={loadProgress}
            ready={loadProgress >= 100}
          />
        </Suspense>
      </div>
      <ViewSwitch value={viewMode} onChange={changeView} />
      <ArtworkDirectoryButton
        count={directoryArtworks.length}
        unavailable={sceneUnavailable}
        expanded={directoryOpen}
        buttonRef={directoryButton}
        onOpen={() => {
          setArtworkFocus(null);
          setDirectoryOpen(true);
        }}
      />
      {sceneUnavailable && (
        <span className="visually-hidden" role="status">
          3D view unavailable. The artwork directory has opened.
        </span>
      )}
      {artworkFocus && (
        <ArtworkInfoCard
          artwork={artworkFocus}
          onClose={() => setArtworkFocus(null)}
        />
      )}
      <div className="viewer-caption">
        <p className="eyebrow">Public demo gallery</p>
        <h1>Threshold</h1>
        <p>Material, movement, and atmosphere by Danny Hirsch.</p>
      </div>
      <MovementHint viewMode={viewMode} />
      {directoryOpen && (
        <ArtworkDirectory
          exhibitionTitle="Threshold"
          artist="Danny Hirsch"
          artworks={directoryArtworks}
          sourceNote="Metadata comes from the delivered exhibition model. Six images are magnified surface studies; wARTrobe is a complete front view."
          unavailable={sceneUnavailable}
          imagesLoading={imageStatus === "loading"}
          returnFocus={directoryButton}
          onClose={() => setDirectoryOpen(false)}
        />
      )}
    </main>
  );
}

function PublishedGallery({ id }: { id: string }) {
  const viewer = useRef<HTMLElement>(null);
  const directoryButton = useRef<HTMLButtonElement>(null);
  const [loadState, setLoadState] = useState<GalleryLoadState>({
    status: "loading",
  });
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("walk");
  const [artworkFocus, setArtworkFocus] = useState<ArtworkFocus | null>(null);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const openFallbackDirectory = useCallback(() => {
    setArtworkFocus(null);
    setDirectoryOpen(true);
  }, []);
  const sceneUnavailable = useViewerSceneUnavailable(
    viewer,
    loadState.status === "ready",
    openFallbackDirectory,
  );
  useEffect(() => {
    let stale = false;
    galleryRepository
      .find(id)
      .then((gallery) => {
        if (!stale)
          setLoadState(
            gallery ? { status: "ready", gallery } : { status: "not-found" },
          );
      })
      .catch((error) => {
        console.error("Gallery request failed", error);
        if (!stale) setLoadState({ status: "error" });
      });
    return () => {
      stale = true;
    };
  }, [id, loadAttempt]);
  useEffect(() => {
    if (loadState.status === "ready")
      document.title = `${loadState.gallery.title} — ${loadState.gallery.artist} | AURA`;
  }, [loadState]);
  if (loadState.status === "loading")
    return (
      <main className="loading" role="status" aria-live="polite">
        Loading space…
      </main>
    );
  if (loadState.status === "error")
    return (
      <main className="not-found not-found--error">
        <Logo />
        <p className="eyebrow">Connection interrupted</p>
        <h1>We couldn't open this gallery.</h1>
        <p>
          The exhibition may still be live. Check your connection and try again.
        </p>
        <div className="not-found-actions">
          <button
            className="button button--light"
            onClick={() => {
              setLoadState({ status: "loading" });
              setLoadAttempt((attempt) => attempt + 1);
            }}
          >
            Try again
          </button>
          <button className="text-link" onClick={() => navigate("/")}>
            Return home
          </button>
        </div>
      </main>
    );
  if (loadState.status === "not-found")
    return (
      <main className="not-found">
        <Logo />
        <h1>This gallery isn't available.</h1>
        <p>The exhibition may have reached the end of its ten-day run.</p>
        <button
          className="button button--light"
          onClick={() => navigate("/create")}
        >
          Create a gallery
        </button>
      </main>
    );
  const gallery = loadState.gallery;
  const directoryArtworks: DirectoryArtwork[] = gallery.artworks
    .filter((artwork) => !artwork.hidden)
    .map((artwork) => ({
      id: artwork.id,
      title: artwork.title,
      artist: gallery.artist,
      description: artwork.description,
      year: artwork.year,
      image: artwork.src,
      imageAlt: `${artwork.title} by ${gallery.artist}`,
    }));
  const changeView = (value: ViewMode) => {
    setArtworkFocus(null);
    setViewMode(value);
  };
  return (
    <main ref={viewer} className="viewer">
      <header className="viewer-header">
        <Logo />
        <div>
          <p>{gallery.title}</p>
          <span>{gallery.artist}</span>
        </div>
        <button onClick={() => navigate("/create")}>Create your own ↗</button>
      </header>
      <GalleryScene
        draft={gallery}
        visitor
        viewMode={viewMode}
        playIntro
        onArtworkFocus={setArtworkFocus}
      />
      <ViewSwitch value={viewMode} onChange={changeView} />
      <ArtworkDirectoryButton
        count={directoryArtworks.length}
        unavailable={sceneUnavailable}
        expanded={directoryOpen}
        buttonRef={directoryButton}
        onOpen={() => {
          setArtworkFocus(null);
          setDirectoryOpen(true);
        }}
      />
      {sceneUnavailable && (
        <span className="visually-hidden" role="status">
          3D view unavailable. The artwork directory has opened.
        </span>
      )}
      {artworkFocus && (
        <ArtworkInfoCard
          artwork={artworkFocus}
          onClose={() => setArtworkFocus(null)}
        />
      )}
      <div className="viewer-caption">
        <p className="eyebrow">Virtual exhibition</p>
        <h1>{gallery.title}</h1>
        <p>by {gallery.artist}</p>
      </div>
      <MovementHint viewMode={viewMode} />
      {directoryOpen && (
        <ArtworkDirectory
          exhibitionTitle={gallery.title}
          artist={gallery.artist}
          artworks={directoryArtworks}
          sourceNote="Artwork images and notes are shown as supplied with this public exhibition."
          unavailable={sceneUnavailable}
          returnFocus={directoryButton}
          onClose={() => setDirectoryOpen(false)}
        />
      )}
    </main>
  );
}

export default function App() {
  const [route, setRoute] = useState(routeFromHash);
  const previousRoute = useRef(
    `${route.page}:${route.id ?? route.template ?? ""}:${route.demoArt ? "demo-art" : ""}`,
  );
  useEffect(() => {
    const handler = () => setRoute(routeFromHash());
    addEventListener("hashchange", handler);
    return () => removeEventListener("hashchange", handler);
  }, []);
  useEffect(() => {
    document.title =
      route.page === "home"
        ? "AURA — Virtual galleries for artists"
        : route.page === "create"
          ? "Create a gallery | AURA"
          : route.page === "demo"
            ? "Threshold — Danny Hirsch Arts | AURA"
            : route.page === "data"
              ? "MVP data and rights | AURA"
              : "Virtual exhibition | AURA";
    const routeKey = `${route.page}:${route.id ?? route.template ?? ""}:${route.demoArt ? "demo-art" : ""}`;
    if (previousRoute.current === routeKey) return;
    previousRoute.current = routeKey;
    const frame = requestAnimationFrame(() =>
      document.getElementById("main-content")?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(frame);
  }, [route]);
  const page = useMemo(() => {
    if (route.page === "create")
      return route.template ? (
        <Studio
          key={`${route.template}:${route.demoArt ? "demo-art" : "empty"}`}
          initialTemplate={route.template}
          initialDemoArt={route.demoArt}
        />
      ) : (
        <TemplatePicker
          onChoose={(template) => navigate(`/create/${template}`)}
        />
      );
    if (route.page === "demo") return <Demo />;
    if (route.page === "data") return <MvpDataNotice />;
    if (route.page === "gallery" && route.id)
      return <PublishedGallery key={route.id} id={route.id} />;
    return <Landing />;
  }, [route]);
  return (
    <>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Skip to content
      </a>
      <div id="main-content" tabIndex={-1}>
        {page}
      </div>
    </>
  );
}
