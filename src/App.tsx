import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { Logo } from "./components/Logo";
import { SpaceShareMenu } from "./components/SpaceShareMenu";
import { FullscreenButton } from "./components/FullscreenButton";
import { PRODUCT_BRAND } from "./config/brand";
import "./features/landing/landingConversion.css";
import "./features/landing/directoryExperience.css";
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
  isShortGalleryWall,
} from "./features/gallery/types";
import {
  ARTWORK_FRAME_OPTIONS,
  ARTWORK_MAT_OPTIONS,
  artworkPresentationMetrics,
} from "./features/gallery/artworkPresentation";
import { createGalleryDraft } from "./features/gallery/editor/draftDefaults";
import { galleryDraftSignature } from "./features/account/projectWorkspace";
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
  validateArtworkPlacement,
} from "./features/gallery/editor/placementValidation";
import {
  reviewGalleryForPublish,
  type PublishReviewIssue,
} from "./features/gallery/editor/publishReview";
import {
  publishStatusReducer,
  type PublishStatus,
} from "./features/gallery/editor/publishState";
import { useDraftHistory } from "./features/gallery/editor/useDraftHistory";
import {
  createGalleryProjectId,
  deleteGalleryDraft,
  listGalleryDrafts,
  loadGalleryDraft,
  saveGalleryDraft,
  type StoredGalleryDraft,
} from "./services/draftStorage";
import {
  GalleryAccessDeniedError,
  galleryRepository,
  type GalleryRecord,
} from "./services/galleryRepository";
import { galleryShareUrl } from "./services/galleryShareUrl";
import { firebaseActionErrorMessage } from "./services/firebaseActionError";
import {
  applicationRootUrl,
  creatorCanonicalUrl,
  hashApplicationUrl,
  legacyCreatorHubRedirectPath,
  matchCreatorRoute,
  matchSpaceRoute,
  spaceCanonicalUrl,
} from "./services/spaceRoutes";
import { useDialogFocus } from "./hooks/useDialogFocus";
import { AccountButton, AccountPage } from "./features/account/AccountDialog";
import { CreatorAttributionLink } from "./features/creator/CreatorAttributionLink";
import {
  creatorImageUrl,
  loadPublicCreatorDirectory,
  type PublicCreatorDirectoryEntry,
} from "./services/creatorProfile";
import { searchPublicDirectory } from "./services/publicDirectorySearch";
import { GalleryAccessManager } from "./features/account/GalleryAccessManager";
import type { AccountSession } from "./services/accountTypes";
import { usesCompactInteractionLayout } from "./utils/mobileLayout";
import { isVerifiedAccount } from "./services/accountTypes";
import { imageFromFile } from "./services/imagePreparation";
import {
  visibilityLabel,
  type GalleryEditTarget,
  type GalleryVisibility,
} from "./services/galleryAccess";
import {
  classifyTelemetryError,
  getTelemetryConsent,
  setTelemetryConsent,
  trackTelemetry,
  type TelemetryConsent,
} from "./services/telemetry";
import {
  applyPageMetadata,
  pageMetadataPolicy,
  publishedSpaceMetadataPolicy,
} from "./services/pageMetadata";
import { isDiscoverEligible } from "./services/discoverEligibility";

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
const PitchSections = lazy(() =>
  import("./features/landing/PitchSections").then((module) => ({
    default: module.PitchSections,
  })),
);
const ExploreSpacesMenu = lazy(() => import("./features/landing/ExploreSpacesMenu"));
const AuthActionPage = lazy(() => import("./features/account/AuthActionPage"));
const CreatorProfilePage = lazy(() => import("./features/creator/CreatorProfilePage"));
const CreatorHubPage = lazy(() => import("./features/creator/CreatorHubPage"));
const CreatorDirectoryPage = lazy(() => import("./features/creator/CreatorDirectoryPage"));

type Route = {
  page: "home" | "create" | "demo" | "gallery" | "creator" | "creators" | "creator-hub" | "data" | "auth-action" | "account" | "space-not-found";
  id?: string;
  handle?: string;
  template?: TemplateId;
  demoArt?: boolean;
  projectId?: string;
  legacySpace?: boolean;
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
  | { status: "access-denied" }
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
const routeFromLocation = (): Route => {
  const actionMode = new URLSearchParams(location.search).get("mode");
  if (actionMode) return { page: "auth-action" };
  const spaceRoute = matchSpaceRoute(location.pathname, location.hash);
  if (spaceRoute?.kind === "malformed") return { page: "space-not-found" };
  if (spaceRoute?.kind === "space")
    return {
      page: "gallery",
      id: spaceRoute.id,
      legacySpace: spaceRoute.legacy,
    };
  const creatorRoute = matchCreatorRoute(location.pathname);
  if (creatorRoute?.kind === "malformed") return { page: "space-not-found" };
  if (creatorRoute?.kind === "creator")
    return { page: "creator", handle: creatorRoute.handle };
  if (creatorRoute?.kind === "directory") {
    return legacyCreatorHubRedirectPath(location.pathname, location.hash)
      ? { page: "creator-hub" }
      : { page: "creators" };
  }
  if (creatorRoute?.kind === "hub") return { page: "creator-hub" };
  const hash = location.hash.replace(/^#/, "");
  if (hash === "/create") return { page: "create" };
  const templateMatch =
    /^\/create\/(white-cube|nocturne|pavilion)(?:\/(demo|[a-zA-Z0-9-]+))?$/.exec(hash);
  if (templateMatch)
    return {
      page: "create",
      template: templateMatch[1] as TemplateId,
      demoArt: templateMatch[2] === "demo",
      projectId:
        templateMatch[2] && templateMatch[2] !== "demo"
          ? templateMatch[2]
          : templateMatch[2] === "demo"
            ? `demo-${templateMatch[1]}`
            : `legacy-${templateMatch[1]}`,
    };
  if (hash === "/demo") return { page: "demo" };
  if (hash === "/data") return { page: "data" };
  if (hash === "/account") return { page: "account" };
  return { page: "home" };
};
const navigate = (path: string) => {
  if (path.startsWith("/spaces/")) {
    const id = path.slice("/spaces/".length);
    const target = spaceCanonicalUrl(id, location.href);
    location.assign(target);
    return;
  } else if (path === "/creators") {
    location.assign(`${new URL(applicationRootUrl(location.href)).origin}/creators`);
    return;
  } else if (path === "/creator-hub") {
    location.assign(`${new URL(applicationRootUrl(location.href)).origin}/creator-hub`);
    return;
  } else if (path.startsWith("/creators/")) {
    const handle = path.slice("/creators/".length);
    location.assign(creatorCanonicalUrl(handle, location.href));
    return;
  } else {
    const target = hashApplicationUrl(path, location.href);
    if (location.pathname !== new URL(applicationRootUrl(location.href)).pathname) {
      location.assign(target);
      return;
    }
    history.pushState(null, "", target);
  }
  dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo(0, 0);
};

const landingNavigate = (
  path: string,
  event: "landing_create_cta_clicked" | "landing_example_entered",
  source: string,
) => {
  trackTelemetry(event, { source });
  navigate(path);
};

function Header({ light = false, onSearch }: { light?: boolean; onSearch?: () => void }) {
  return (
    <header className={`site-header ${light ? "site-header--light" : ""}`}>
      <Logo dark={light} />
      <nav>
        <span className="preview-status">{PRODUCT_BRAND.previewLabel}</span>
        {onSearch && <button className="site-header__search" onClick={onSearch} aria-label="Search public Spaces and Creators"><span>Search</span> <i aria-hidden="true">⌕</i></button>}
        <a className="site-header__creators" href="/creator-hub">CREATOR HUB</a>
        <button className="site-header__demo" onClick={() => landingNavigate("/demo", "landing_example_entered", "header")}>{PRODUCT_BRAND.secondaryCta}</button>
        <AccountButton light={light} />
        <button className="site-header__create" onClick={() => landingNavigate("/create", "landing_create_cta_clicked", "header")}>
          <span className="site-header__create-wide">{PRODUCT_BRAND.primaryCta}</span>
          <span className="site-header__create-compact">Create</span>
          <i>↗</i>
        </button>
      </nav>
    </header>
  );
}

function BrandHero({ onExplore }: { onExplore: () => void }) {
  return (
    <section className="brand-hero brand-hero--follow" aria-labelledby="brand-hero-title">
      <p className="eyebrow"><i aria-hidden="true" /> Live on LIEUVA</p>
      <h1 id="brand-hero-title">Follow the work.</h1>
      <p>Enter published Spaces. Meet the Creators behind them. Follow new rooms and studio notes as the work develops.</p>
      <div className="brand-hero__actions">
        <button className="button button--light" type="button" onClick={onExplore} aria-haspopup="dialog">Explore Spaces <span>↓</span></button>
        <button className="text-link" onClick={() => landingNavigate("/create", "landing_create_cta_clicked", "hero")}>{PRODUCT_BRAND.primaryCta} →</button>
        <a className="text-link brand-hero__hub" href="/creator-hub">Creator Hub ↗</a>
      </div>
      <ol className="brand-hero__journey" aria-label="LIEUVA community journey">
        <li><b>01</b> Spaces</li>
        <li><b>02</b> Creators</li>
        <li><b>03</b> Community</li>
      </ol>
    </section>
  );
}

function GlobalDirectorySearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [spaces, setSpaces] = useState<GalleryRecord[]>([]);
  const [creators, setCreators] = useState<PublicCreatorDirectoryEntry[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const close = useCallback(() => { setQuery(""); if (status === "error") setStatus("idle"); onClose(); }, [onClose, status]);
  useDialogFocus(dialog, close, undefined, open);
  useEffect(() => {
    if (!open || status !== "idle") return;
    void Promise.all([galleryRepository.discover(), loadPublicCreatorDirectory()])
      .then(([publicSpaces, directory]) => {
        setSpaces(publicSpaces);
        setCreators(directory.creators);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, [open, status]);
  const results = useMemo(() => searchPublicDirectory(spaces, creators, query), [creators, query, spaces]);
  if (!open) return null;
  const searching = query.trim().length > 0;
  return (
    <div className="directory-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div ref={dialog} className="directory-dialog" role="dialog" aria-modal="true" aria-labelledby="directory-dialog-title" tabIndex={-1}>
        <header><div><p className="eyebrow">Public LIEUVA directory</p><h2 id="directory-dialog-title">Find a Space.<br /><em>Meet a Creator.</em></h2></div><button onClick={close} aria-label="Close search">×</button></header>
        <label className="directory-dialog__field">
          <span>Search by title, name or @handle</span>
          <input autoFocus type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Start typing…" autoComplete="off" />
        </label>
        <p className="directory-dialog__status" role="status">{status === "idle" || status === "loading" ? "Opening public directory…" : status === "error" ? "Directory temporarily unavailable." : searching ? `${results.spaces.length} Spaces · ${results.creators.length} Creators` : "Search all public Spaces and Creator profiles."}</p>
        {searching && <div className="directory-dialog__results">
          <section aria-labelledby="directory-creators-title"><h3 id="directory-creators-title">Creators</h3>{results.creators.slice(0, 6).map((creator) => <a key={creator.handle} href={creatorCanonicalUrl(creator.handle, location.href)}><span>{creator.imagePresent ? <img src={creatorImageUrl(creator.handle)} alt="" /> : creator.displayName[0]}</span><div><strong>{creator.displayName}</strong><small>@{creator.handle} · {creator.followerCount ?? 0} followers</small></div><b>→</b></a>)}</section>
          <section aria-labelledby="directory-spaces-title"><h3 id="directory-spaces-title">Spaces</h3>{results.spaces.slice(0, 6).map((space) => <a key={space.id} href={spaceCanonicalUrl(space.id, location.href)}><span>{space.title[0]}</span><div><strong>{space.title}</strong><small>{space.artist}</small></div><b>→</b></a>)}</section>
          {!results.spaces.length && !results.creators.length && <p className="directory-dialog__empty">No public result. Try another title, Creator or @handle.</p>}
        </div>}
      </div>
    </div>
  );
}

const LANDING_WORKFLOW = [
  ["01", "Create", "Choose a spatial starting point."],
  ["02", "Arrange", "Place images, objects, and surfaces."],
  ["03", "Preview", "Walk the room before visitors do."],
  ["04", "Publish", "Set public, unlisted, or private access."],
  ["05", "Share", "Send one link people can explore."],
] as const;

function LandingProductProof() {
  const sectionRef = useRef<HTMLElement>(null);
  const tracked = useRef(false);
  useEffect(() => {
    const section = sectionRef.current;
    if (!section || tracked.current) return undefined;
    const record = () => {
      if (tracked.current) return;
      tracked.current = true;
      trackTelemetry("landing_product_proof_engaged", { source: "workflow" });
    };
    if (!("IntersectionObserver" in window)) {
      record();
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.35)) return;
        observer.disconnect();
        record();
      },
      { threshold: [0.35] },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="landing-proof" aria-labelledby="landing-proof-title">
      <div className="landing-proof__heading">
        <p className="eyebrow">From work to place</p>
        <h2 id="landing-proof-title">A spatial presentation.<br /><em>Built in your browser.</em></h2>
        <p>Start with a room, shape the visitor experience, and publish without opening traditional 3D software.</p>
      </div>
      <div className="landing-proof__stage">
        <button
          className="landing-proof__visual"
          type="button"
          onClick={() => landingNavigate("/create/nocturne/demo", "landing_create_cta_clicked", "product_proof")}
          aria-label="Open a working LIEUVA Studio Space"
        >
          <img
            src="./assets/templates/nocturne-preview.webp"
            width="965"
            height="752"
            loading="eager"
            decoding="async"
            alt="Nocturne Space concept shown from visitor eye level"
          />
          <span className="landing-proof__status"><i /> Walk preview ready</span>
          <span className="landing-proof__open">Open working Studio <b>↗</b></span>
          <span className="landing-proof__frame" aria-hidden="true" />
        </button>
        <ol className="landing-proof__workflow" aria-label="How LIEUVA works">
          {LANDING_WORKFLOW.map(([number, title, body]) => (
            <li key={title}>
              <span>{number}</span>
              <div><strong>{title}</strong><p>{body}</p></div>
            </li>
          ))}
        </ol>
      </div>
      <RoomShowcase embedded />
    </section>
  );
}

function DeferredScrollStory() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const compact = window.matchMedia("(max-width: 900px), (pointer: coarse)").matches;
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const reveal = () => setReady(true);
    if (compact) {
      // Give mobile navigation and the opening blueprint state the first frame
      // before Three.js parsing and GLB decoding enter the main thread.
      const handle = window.setTimeout(reveal, 900);
      return () => window.clearTimeout(handle);
    }
    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(reveal, { timeout: 900 });
      return () => idleWindow.cancelIdleCallback?.(handle);
    }
    const handle = window.setTimeout(reveal, 350);
    return () => window.clearTimeout(handle);
  }, []);
  return (
    <div className="story-deferred">
      {!ready ? (
        <section
          className="story-placeholder story-placeholder--opening"
          aria-label="Preparing the interactive Space story"
        >
          <span>01 / 05 · Preparing the blueprint…</span>
        </section>
      ) : (
      <Suspense
        fallback={
          <section
            className="story-placeholder"
            aria-label="Loading interactive Space story"
          >
            <span>Preparing Danny Hirsch Arts…</span>
          </section>
        }
      >
        <ScrollGalleryStory />
      </Suspense>
      )}
    </div>
  );
}
function Landing() {
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [spacesOpen, setSpacesOpen] = useState(
    () => new URLSearchParams(location.search).get("explore") === "spaces",
  );
  const openSpaces = () => {
    trackTelemetry("discover_viewed", { source: "landing_menu" });
    setSpacesOpen(true);
  };
  return (
    <main className="landing">
      <Header onSearch={() => setDirectoryOpen(true)} />
      <DeferredScrollStory />
      <BrandHero onExplore={openSpaces} />
      <GlobalDirectorySearch open={directoryOpen} onClose={() => setDirectoryOpen(false)} />
      <Suspense fallback={null}>
        <ExploreSpacesMenu open={spacesOpen} onClose={() => setSpacesOpen(false)} />
      </Suspense>
      <LandingProductProof />
      <PitchSections />
      <section className="closing">
        <p className="eyebrow">Your next Project starts here</p>
        <h2>
          Give your work
          <br />
          <em>a place.</em>
        </h2>
        <button
          className="button button--dark"
          onClick={() => landingNavigate("/create", "landing_create_cta_clicked", "closing")}
        >
          {PRODUCT_BRAND.primaryCta} <span>↗</span>
        </button>
      </section>
      <Footer />
    </main>
  );
}

function RoomShowcase({ embedded = false }: { embedded?: boolean }) {
  return (
    <div className={`room-showcase ${embedded ? "room-showcase--embedded" : ""}`} aria-labelledby="room-showcase-title">
      <div className="room-showcase-heading">
        <p className="eyebrow">Now build your own</p>
        <h2 id="room-showcase-title">
          Choose a room.
          <br />
          <em>Make it yours.</em>
        </h2>
        <p>
          Start with sample art, then replace it with your own work. Each
          environment has its own architecture, material palette and light.
          Every button opens the working browser Studio.
        </p>
      </div>
      <div className="room-showcase-grid">
        {TEMPLATES.map((template) => (
          <article key={template.id}>
            <button
              type="button"
              onClick={() => landingNavigate(`/create/${template.id}/demo`, "landing_create_cta_clicked", `template_${template.id}`)}
              aria-label={`Try ${template.name} with sample artwork`}
            >
              <img
                src={`./assets/templates/${template.id}-preview.webp`}
                width="965"
                height="752"
                loading="lazy"
                decoding="async"
                alt={`${template.name} environment preview`}
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
                <dd>{template.dimensions[0]} × {template.dimensions[1]} m · {template.maxArtworks} works</dd>
              </div>
              <div>
                <dt>Best for</dt>
                <dd>{template.bestFor}</dd>
              </div>
              <div>
                <dt>Materials</dt>
                <dd>{template.materialIdentity.wall} · {template.materialIdentity.floor}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </div>
  );
}

function Footer() {
  return (
    <footer>
      <Logo />
      <nav aria-label="Product information">
        <a href="#/data">Data &amp; rights</a>
        <a href="./licenses/FONT-LICENSES.txt">Font licenses</a>
        <a href="#pilot-faq">FAQ</a>
      </nav>
      <span>© 2026 {PRODUCT_BRAND.name}</span>
    </footer>
  );
}

function MvpDataNotice() {
  const [telemetryConsent, setConsent] = useState<TelemetryConsent>(getTelemetryConsent);
  const updateConsent = (consent: TelemetryConsent) => {
    setTelemetryConsent(consent);
    setConsent(consent);
  };
  return (
    <main className="info-page">
      <Header light />
      <article>
        <p className="eyebrow">{PRODUCT_BRAND.name} preview · Data and rights notice</p>
        <h1>
          Know before
          <br />
          <em>you upload.</em>
        </h1>
        <p className="info-lead">
          {PRODUCT_BRAND.name} is an early-access publishing product. Core creation,
          publishing and account controls are operational, while complete contractual
          terms, named controller details and service guarantees remain in progress.
          This notice does not replace a complete privacy policy or pilot agreement.
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
            Space metadata and access roles are stored in Cloud Firestore;
            compressed artwork and covers are stored in Firebase Storage.
            Building and Walk Preview work without an account. Publishing
            requires a verified email or Google account, which can choose
            public, unlisted, or private access during the account preview.
          </p>
        </section>
        <section>
          <h2>Rights and confidentiality</h2>
          <p>
            Only upload artwork and text you are allowed to share. Private
            access reduces discoverability but is not yet a contractual
            confidential-data service. Community reporting and blocking are available;
            guaranteed moderation response times, payments and contractual archival
            promises are not yet offered.
          </p>
        </section>
        <section>
          <h2>Infrastructure and pilots</h2>
          <p>
            Publishing uses Firebase Authentication, Cloud Firestore, and
            Firebase Storage. Google
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
        <section>
          <h2>Optional product measurement</h2>
          <p>
            LIEUVA can collect anonymous funnel timing, Web Vitals, and 3D readiness signals.
            It never sends Project IDs, titles, creator names, email addresses, artwork text,
            image URLs, or Storage paths. Operational errors remain available without this choice.
          </p>
          <div className="info-actions" role="group" aria-label="Product measurement preference">
            <button className="button button--light" onClick={() => updateConsent("granted")} aria-pressed={telemetryConsent === "granted"}>Allow anonymous measurement</button>
            <button className="text-link" onClick={() => updateConsent("denied")} aria-pressed={telemetryConsent === "denied"}>Keep optional measurement off</button>
          </div>
        </section>
        <section>
          <h2>Optional {PRODUCT_BRAND.name} letters</h2>
          <p>
            Newsletter consent is separate, optional, and unchecked by
            default. If selected, {PRODUCT_BRAND.name} stores the account ID, email address,
            consent time, source, and subscription status in Firestore. One
            welcome edition is queued once per account; later product letters
            require the subscription to remain active. Every letter includes
            an unsubscribe link, and the preference can also be changed under
            Profile &amp; settings without affecting Spaces or account access.
          </p>
        </section>
        <section>
          <h2>Export and account deletion</h2>
          <p>
            Signed-in accounts can download an account-wide JSON record under
            Account → Data &amp; rights. It includes profile and preference data,
            owned-Space manifests, revision and media references, access-role
            summaries, invitations, Creator profile and feed posts, and
            account-linked drafts on the current browser. The existing single-Space .aura.json export remains a
            separate tool.
          </p>
          <p>
            Permanent account deletion requires a fresh Google or password
            confirmation. It deletes Spaces owned by the account, their
            published Storage files and revisions, profile/avatar, Creator posts,
            invitations, newsletter state, and authentication. Memberships in Spaces owned
            by other people are removed without deleting those Spaces. Local
            drafts linked to the deleted account are cleared only after the
            server confirms completion; unrelated anonymous browser drafts stay.
          </p>
        </section>
        <section>
          <h2>Retention and contact still to be named</h2>
          <p>
            Account deletion is immediate and irreversible in the current
            preview; it does not promise an account-level grace period. Firebase
            or infrastructure backups may follow provider-level retention that
            is not yet stated as a {PRODUCT_BRAND.name} production policy. A named controller,
            postal address, rights-request inbox, backup-retention decision, and
            formal privacy policy are still required before production use.
          </p>
        </section>
        <div className="info-actions">
          <button
            className="button button--dark"
            onClick={() => navigate("/account")}
          >
            Open account data controls
          </button>
          <button
            className="button button--dark"
            onClick={() => navigate("/create")}
          >
            Return to Studio
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

function TemplatePicker({
  onChoose,
}: {
  onChoose: (id: TemplateId, projectId: string) => void;
}) {
  const [savedProjects, setSavedProjects] = useState<StoredGalleryDraft[]>([]);
  useEffect(() => {
    let active = true;
    void listGalleryDrafts()
      .then((records) => {
        if (active) setSavedProjects(records);
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
        <p className="eyebrow">{PRODUCT_BRAND.previewLabel} · Free now · Step 1 of 3</p>
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
        {TEMPLATES.map((template) => {
          const projects = savedProjects.filter(
            (project) => project.templateId === template.id,
          );
          return (
            <article
              className={`template-card template-card--${template.id}`}
              key={template.id}
            >
              <button
                type="button"
                className="template-card-main"
                onClick={() =>
                  onChoose(template.id, createGalleryProjectId(template.id))
                }
              >
                <span className="template-number">{template.index}</span>
                <div className="template-preview">
                  <img
                    src={`./assets/templates/${template.id}-preview.webp`}
                    width="965"
                    height="752"
                    decoding="async"
                    alt={`${template.name} environment preview`}
                  />
                  {projects.length > 0 && (
                    <b className="template-draft-badge">
                      {projects.length} local project{projects.length === 1 ? "" : "s"}
                    </b>
                  )}
                  <span>Start new Project ↗</span>
                </div>
              </button>
              <p>{template.label}</p>
              <h2>{template.name}</h2>
              <small>{template.description}</small>
              <dl className="template-environment-facts">
                <div><dt>Scale</dt><dd>{template.dimensions[0]} × {template.dimensions[1]} m</dd></div>
                <div><dt>Light</dt><dd>{template.defaultLighting}</dd></div>
                <div><dt>Material</dt><dd>{template.materialIdentity.wall}</dd></div>
              </dl>
              {projects.length > 0 && (
                <div className="template-project-list" aria-label={`${template.name} saved projects`}>
                  <p>Saved projects</p>
                  {projects.map((project) => (
                    <button
                      key={project.projectId}
                      type="button"
                      onClick={() => onChoose(template.id, project.projectId)}
                    >
                      <span>{project.publication ? "Live · " : ""}{project.draft.title}</span>
                      <time dateTime={project.savedAt}>
                        {new Date(project.savedAt).toLocaleDateString()}
                      </time>
                    </button>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
      <p className="picker-footnote">
        Three working environments · Every template opens in {PRODUCT_BRAND.name} Studio.
      </p>
    </main>
  );
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
  "north-cross-west": "North-west · Cross gallery",
  "north-room-west": "North-west · Room side",
  "north-cross-east": "North-east · Cross gallery",
  "north-room-east": "North-east · Room side",
  "south-cross-west": "South-west · Cross gallery",
  "south-room-west": "South-west · Room side",
  "south-cross-east": "South-east · Cross gallery",
  "south-room-east": "South-east · Room side",
};
const PAVILION_WALL_LABELS: Record<WallId, string> = {
  north: "North gallery",
  south: "Entrance gallery",
  west: "West wing",
  east: "East wing",
  "divider-front": "Feature wall A",
  "divider-back": "Feature wall B",
  "north-cross-west": "North-west · Cross gallery",
  "north-room-west": "North-west · Room side",
  "north-cross-east": "North-east · Cross gallery",
  "north-room-east": "North-east · Room side",
  "south-cross-west": "South-west · Cross gallery",
  "south-room-west": "South-west · Room side",
  "south-cross-east": "South-east · Cross gallery",
  "south-room-east": "South-east · Room side",
};
const wallLabel = (templateId: TemplateId, wall: WallId) =>
  templateId === "pavilion" ? PAVILION_WALL_LABELS[wall] : WALL_LABELS[wall];

function availableWalls(templateId: TemplateId): WallId[] {
  return galleryWalls(templateId);
}

function Studio({
  initialTemplate,
  initialProjectId,
  initialDemoArt = false,
}: {
  initialTemplate: TemplateId;
  initialProjectId: string;
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
  const [editTarget, setEditTarget] = useState<GalleryEditTarget>();
  const [publishedDraftSignature, setPublishedDraftSignature] = useState<string>();
  const [visibleEditorMode, setVisibleEditorMode] = useState<"arrange" | "walk">("arrange");
  const [publishStatus, transitionPublish] = useReducer(
    publishStatusReducer,
    "idle",
  );
  const [publishError, setPublishError] = useState<string>();
  const [publishReviewOpen, setPublishReviewOpen] = useState(false);
  const [publishCover, setPublishCover] = useState<string>();
  const [publishVisibility, setPublishVisibility] =
    useState<GalleryVisibility>("public");
  const [accountSession, setAccountSession] =
    useState<AccountSession | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
  }>();
  const [uploadError, setUploadError] = useState<string>();
  const [uploadReadyCount, setUploadReadyCount] = useState(0);
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
  const [toolSheet, setToolSheet] = useState<"peek" | "half" | "full">(() =>
    usesCompactInteractionLayout() ? "peek" : "half",
  );
  const [editorDirectoryOpen, setEditorDirectoryOpen] = useState(false);
  const wallFocusToken = useRef(0);
  const decorInsertion = useRef({ x: 0, z: 1 });
  const saveRevision = useRef(0);
  const latestSaveRequest = useRef(0);
  const publishAttemptInFlight = useRef(false);
  const resumePublishAfterAccount = useRef(false);
  const publishButton = useRef<HTMLButtonElement>(null);
  const editorDirectoryButton = useRef<HTMLButtonElement>(null);
  const previousToolSheet = useRef<"peek" | "half" | "full">(
    usesCompactInteractionLayout() ? "peek" : "half",
  );
  const editorMode = useRef<"arrange" | "walk">("arrange");
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
    isShortGalleryWall(wall)
      ? (wall.startsWith("divider") ? (roomTemplate.dividerWidth ?? 6.2) : roomTemplate.dimensions[0] / 4) / 2 - 0.55
      : wall === "north" || wall === "south"
        ? roomDimensions[0] / 2 - 0.8
        : roomDimensions[1] / 2 - 0.8;
  const artworkLimit = selected ? wallLimit(selected.wall) : 3.5;
  const selectedSize = selected ? artworkSize(selected) : undefined;
  const selectedPresentation = selected
    ? artworkPresentationMetrics(selected)
    : undefined;
  const selectedBounds = selected
    ? artworkHorizontalBounds(draft, selected)
    : { min: -artworkLimit, max: artworkLimit };
  const publishIssues = reviewGalleryForPublish(draft);
  const publishBlockers = publishIssues.filter(
    (issue) => issue.severity === "error",
  );
  const publishing =
    publishStatus === "preparing" || publishStatus === "publishing";
  const editorDirectoryArtworks = useMemo<DirectoryArtwork[]>(
    () =>
      draft.artworks
        .filter((artwork) => !artwork.hidden)
        .map((artwork) => ({
          id: artwork.id,
          title: artwork.title,
          artist: draft.artist,
          description: artwork.description,
          year: artwork.year,
          image: artwork.src,
          medium: artwork.medium,
          dimensions: artwork.dimensions,
          imageAlt: `${artwork.title} by ${draft.artist}`,
        })),
    [draft.artist, draft.artworks],
  );
  const handleEditorModeChange = useCallback((mode: "arrange" | "walk") => {
    if (editorMode.current === mode) return;
    const previousMode = editorMode.current;
    editorMode.current = mode;
    setVisibleEditorMode(mode);
    if (mode === "walk")
      trackTelemetry("walk_preview_entered", { template: initialTemplate });
    else if (previousMode === "walk")
      trackTelemetry("walk_preview_exited", { template: initialTemplate });
    if (!usesCompactInteractionLayout()) return;
    if (mode === "walk") {
      setToolSheet((current) => {
        previousToolSheet.current = current;
        return "peek";
      });
    } else {
      setToolSheet((current) =>
        current === "peek" ? previousToolSheet.current : current,
      );
    }
  }, [initialTemplate]);

  useEffect(() => {
    let active = true;
    void loadGalleryDraft(initialProjectId)
      .then((stored) => {
        if (!active) return;
        if (stored) {
          saveRevision.current = stored.revision;
          if (stored.publication) {
            setEditTarget(stored.publication);
            setPublishedDraftSignature(stored.publishedDraftSignature);
            setPublishVisibility(stored.publication.visibility);
            resetDraft(stored.draft);
            setStorageReady(true);
            setSaveStatus("saved");
          } else setRecoveryDraft(stored);
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
  }, [initialProjectId, resetDraft]);

  useEffect(() => {
    if (!storageReady || (!canUndo && !canRedo)) return;
    const statusTimeout = window.setTimeout(() => setSaveStatus("saving"), 0);
    const requestId = ++latestSaveRequest.current;
    const revision = ++saveRevision.current;
    const timeout = window.setTimeout(() => {
      void saveGalleryDraft(initialProjectId, draft, revision)
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
  }, [draft, storageReady, canUndo, canRedo, initialProjectId]);

  useEffect(() => {
    if (!storageReady || (!canUndo && !canRedo)) return;
    const flush = () => {
      void saveGalleryDraft(
        initialProjectId,
        draftRef.current,
        ++saveRevision.current,
      );
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
  }, [storageReady, canUndo, canRedo, draftRef, initialProjectId]);

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
  const closeSelectionInspector = useCallback(() => {
    setSelectedId(undefined);
    setSelectedDecorId(undefined);
    setPlacementNotice(undefined);
    setPlacementError(undefined);
    if (usesCompactInteractionLayout()) setToolSheet("peek");
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
    if ("frame" in value || "mat" in value) {
      const artwork = draftRef.current.artworks.find(
        (item) => item.id === selectedId,
      );
      if (!artwork) return;
      const candidate = { ...artwork, ...value };
      const issue = validateArtworkPlacement(draftRef.current, candidate);
      if (issue) {
        setPlacementError(
          `${issue.message} Move the artwork or choose a narrower presentation.`,
        );
        return;
      }
      setDraft(
        (current) => ({
          ...current,
          artworks: current.artworks.map((item) =>
            item.id === selectedId ? candidate : item,
          ),
        }),
        `artwork:${selectedId}:presentation`,
      );
      setPlacementError(undefined);
      return;
    }
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
    setUploadReadyCount(0);
    setUploadProgress({ current: 0, total: supported.length });
    trackTelemetry("artwork_upload_started", { template: draft.templateId, count: supported.length });
    setUploadError(undefined);
    try {
      for (const [index, file] of supported.entries()) {
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
        setUploadProgress({ current: index + 1, total: supported.length });
      }
      if (!remaining)
        failures.push(
          `This Project already contains the maximum of ${maxArtworks} works.`,
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
      setUploadReadyCount(placed.length);
      if (placed.length) {
        setDraft(working);
        setPlacementError(undefined);
        setCurationReport(undefined);
        setCurationSnapshot(undefined);
        selectArtwork(placed[0].id);
        requestWallFocus(placed[0].wall);
        trackTelemetry("artwork_placed", {
          template: draft.templateId,
          count: placed.length,
          source: "upload",
        });
      }
      if (failures.length) setUploadError(failures.join(" "));
      if (placed.length)
        trackTelemetry("artwork_upload_completed", {
          template: draft.templateId,
          count: placed.length,
          outcome: failures.length ? "partial" : "success",
        });
      else
        trackTelemetry("artwork_upload_failed", {
          template: draft.templateId,
          reason: !remaining
            ? "capacity"
            : !supported.length
              ? "unsupported"
              : "processing",
        });
    } catch {
      setUploadError(
        "The artwork could not be prepared. Your existing Project is unchanged.",
      );
      trackTelemetry("artwork_upload_failed", {
        template: draft.templateId,
        reason: "unexpected",
      });
    } finally {
      setUploading(false);
      setUploadProgress(undefined);
    }
  };
  const handleAccountSessionChange = useCallback(
    (session: AccountSession | null) => {
      setAccountSession(session);
      if (!isVerifiedAccount(session)) setPublishVisibility("public");
      if (isVerifiedAccount(session) && resumePublishAfterAccount.current) {
        resumePublishAfterAccount.current = false;
        setAccountOpen(false);
        setPublishReviewOpen(true);
      }
    },
    [],
  );
  const openPublishReview = () => {
    trackTelemetry("publish_review_opened", { template: draft.templateId, is_update: Boolean(editTarget) });
    setPublishError(undefined);
    transitionPublish({ type: "RESET" });
    setPublishCover(undefined);
    setPublishReviewOpen(true);
    void galleryRepository.currentSession().then(handleAccountSessionChange);
    void sceneCapture
      .current?.({ maxWidth: 720, maxHeight: 540, quality: 0.72 })
      .then((capture) => setPublishCover(capture.dataUrl))
      .catch((error) =>
        console.warn("Publish cover preview unavailable.", error),
      );
  };
  const publish = async () => {
    if (publishAttemptInFlight.current) return;
    if (!isVerifiedAccount(accountSession)) {
      trackTelemetry("account_gate_opened", { source: "publish" });
      resumePublishAfterAccount.current = true;
      setPublishReviewOpen(false);
      setAccountOpen(true);
      return;
    }
    const latestIssues = reviewGalleryForPublish(draftRef.current);
    const blocker = latestIssues.find((issue) => issue.severity === "error");
    if (blocker) {
      setPublishError(`${blocker.title}: ${blocker.detail}`);
      return;
    }
    const title = draftRef.current.title.trim();
    const artist = draftRef.current.artist.trim();
    publishAttemptInFlight.current = true;
    trackTelemetry(editTarget ? "published_update_started" : "publish_started", {
      template: draftRef.current.templateId,
      visibility: publishVisibility,
      is_update: Boolean(editTarget),
    });
    setPublishError(undefined);
    transitionPublish({ type: "PREPARE" });
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
          "Space cover capture unavailable; using work fallback.",
          captureError,
        );
      }
      transitionPublish({ type: "WRITE" });
      const finalDraft = { ...draftRef.current, title, artist };
      const publishedGallery = editTarget
        ? await galleryRepository.updatePublished(
            editTarget,
            finalDraft,
            roomCoverSource,
          )
        : await galleryRepository.publish(
            finalDraft,
            roomCoverSource,
            { visibility: publishVisibility },
          );
      const editingAccountUid = await galleryRepository.currentUserId();
      const nextTarget: GalleryEditTarget = {
        id: publishedGallery.id,
        ownerId: publishedGallery.ownerId!,
        ...(editingAccountUid ? { accountUid: editingAccountUid } : {}),
        publishedAt: publishedGallery.publishedAt,
        expiresAt: publishedGallery.expiresAt,
        visibility: publishedGallery.visibility,
        retention: publishedGallery.retention,
        accessVersion: publishedGallery.accessVersion,
        revision: publishedGallery.revision,
        role: publishedGallery.effectiveRole === "editor"
          ? "editor"
          : editTarget?.role ?? "owner",
      };
      setEditTarget(nextTarget);
      setPublishVisibility(nextTarget.visibility);
      await saveGalleryDraft(
        initialProjectId,
        finalDraft,
        ++saveRevision.current,
        nextTarget,
        galleryDraftSignature(finalDraft),
      );
      setPublishedDraftSignature(galleryDraftSignature(finalDraft));
      setPublished(publishedGallery);
      trackTelemetry(editTarget ? "published_update_succeeded" : "publish_succeeded", {
        template: finalDraft.templateId,
        visibility: publishedGallery.visibility,
        is_update: Boolean(editTarget),
      });
      transitionPublish({ type: "SUCCEED" });
      setPublishReviewOpen(false);
    } catch (error) {
      console.error(error);
      trackTelemetry(editTarget ? "published_update_failed" : "publish_failed", {
        template: draftRef.current.templateId,
        visibility: publishVisibility,
        error_class: classifyTelemetryError(error),
        is_update: Boolean(editTarget),
      });
      setPublishError(
        firebaseActionErrorMessage(
          error,
          "Publishing could not connect to Firebase. Your working draft is still saved; check the connection and retry.",
        ),
      );
      transitionPublish({ type: "FAIL" });
    } finally {
      publishAttemptInFlight.current = false;
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
    void deleteGalleryDraft(initialProjectId)
      .then(() => {
        setStorageReady(true);
        setSaveStatus("ready");
      })
      .catch(() => {
        setStorageReady(true);
        setSaveStatus("error");
      });
  }, [initialDemoArt, initialProjectId, initialTemplate, resetDraft]);
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
        `This Project already contains its maximum of ${maxArtworks} works.`,
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
    const wasUpdate = published.revision > 1;
    const url = galleryShareUrl(published.id, window.location.href);
    const expiry = new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(published.expiresAt));
    const coverSrc = published.coverSrc ?? publishCover;
    return (
      <main className="publish-success">
        <section
          className="publish-success__panel"
          aria-labelledby="publish-success-title"
        >
          <Logo />
          <div className="publish-success__copy">
            <p className="eyebrow">{wasUpdate ? "Space updated" : "Published successfully"}</p>
            <h1 id="publish-success-title">
              {wasUpdate ? "Your changes are" : "Your space is"}
              <br />
              <em>{wasUpdate ? "now live." : "ready to share."}</em>
            </h1>
            <p>
              {published.visibility === "public"
                ? `Your Space is listed in Discover and live until ${expiry}.`
                : published.visibility === "unlisted"
                  ? `Only people with this link can find the Space. It is live until ${expiry}.`
                  : `Only the owner and invited accounts can enter. It is live until ${expiry}.`}
            </p>
            <SpaceShareMenu
              url={url}
              title={published.title}
              creator={published.artist}
              visibility={published.visibility}
              source="publish_success"
            />
            <p className="publish-access-label">
              {PRODUCT_BRAND.previewLabel} · {visibilityLabel[published.visibility]} · Account preview
            </p>
            {isVerifiedAccount(accountSession) && editTarget?.role === "owner" && (
              <GalleryAccessManager
                galleryId={published.id}
                ownerEmail={accountSession?.email}
                initiallyOpen={published.visibility === "private"}
              />
            )}
            <div className="success-actions">
              <a className="button button--light" href={url}>
                Enter the Space <span aria-hidden="true">↗</span>
              </a>
              {published.visibility === "public" && (
                <button className="text-link" onClick={() => navigate("/")}>
                  View in Discover
                </button>
              )}
              <button
                className="text-link"
                onClick={() => {
                  setPublished(undefined);
                  transitionPublish({ type: "RESET" });
                }}
              >
                Back to editor
              </button>
            </div>
          </div>
        </section>
        <section
          className="publish-success__preview"
          aria-label="Published Space cover"
        >
          {coverSrc ? (
            <img src={coverSrc} alt={`Published view of ${published.title}`} />
          ) : (
            <div className="publish-success__preview-empty" aria-hidden="true" />
          )}
          <span className="publish-success__preview-shade" aria-hidden="true" />
          <div className="publish-success__preview-caption">
            <p className="eyebrow">Now live</p>
            <strong>{published.title}</strong>
            <span>by {published.artist}</span>
          </div>
        </section>
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
      <h1 className="visually-hidden">LIEUVA Studio — {draft.title || "Untitled Project"}</h1>
      <header className="studio-header">
        <Logo />
        <div className="studio-title">
          <input
            aria-label="Project title"
            maxLength={100}
            value={draft.title}
            onChange={(event) => update("title", event.target.value)}
          />
          <span>by</span>
          <input
            aria-label="Creator name"
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
            <strong className="draft-save-status__scope">
              {!editTarget
                ? "Draft · Not live"
                : !publishedDraftSignature
                  ? "Published Space · Local draft"
                  : galleryDraftSignature(draft) !== publishedDraftSignature
                    ? "Changes · Not live"
                    : `Published · r${editTarget.revision}`}
            </strong>
            <span className="draft-save-status__state">
              {saveStatus === "checking"
                ? "Checking…"
                : saveStatus === "saving"
                  ? "Saving…"
                  : saveStatus === "saved"
                    ? "Saved"
                    : saveStatus === "error"
                      ? "Save issue"
                      : "Ready"}
            </span>
          </span>
          <AccountButton
            open={accountOpen}
            onOpenChange={(open) => {
              setAccountOpen(open);
              if (!open && !isVerifiedAccount(accountSession))
                resumePublishAfterAccount.current = false;
            }}
            onSessionChange={handleAccountSessionChange}
          />
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
                ? "Automatically curate this Project"
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
            {publishStatus === "preparing"
              ? "Preparing…"
              : publishStatus === "publishing"
                ? "Publishing…"
                : editTarget
                  ? "Review & update"
                  : "Review & publish"}{" "}
            <span>↗</span>
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
            <span>
              {selected
                ? `Artwork · ${selected.title}`
                : selectedDecor
                  ? `Object · ${decorName(selectedDecor.type)}`
                  : "Add & customize"}
            </span>
            <b>
              {toolSheet === "peek"
                ? "Open"
                : toolSheet === "half"
                  ? "Expand"
                  : "Minimize"}
            </b>
          </button>
          <section className="mobile-exhibition">
            <p className="tool-label">Project details</p>
            <label>
              Project title
              <input
                maxLength={100}
                value={draft.title}
                onChange={(event) => update("title", event.target.value)}
              />
            </label>
            <label>
              Creator name
              <input
                maxLength={100}
                value={draft.artist}
                onChange={(event) => update("artist", event.target.value)}
              />
            </label>
          </section>
          <section className="studio-mobile-actions" aria-label="Studio actions">
            <div className="studio-mobile-actions__history" role="group" aria-label="Draft history">
              <button type="button" onClick={undoDraft} disabled={!canUndo}>
                Undo
              </button>
              <button type="button" onClick={redoDraft} disabled={!canRedo}>
                Redo
              </button>
            </div>
            <button
              type="button"
              className="studio-mobile-actions__curate"
              onClick={() => void curateWithAi()}
              disabled={!draft.artworks.length || curating || uploading}
            >
              <span aria-hidden="true">✦</span>{" "}
              {curating ? "Curating…" : "Curate with AI"}
            </button>
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
                  ? `Preparing ${uploadProgress?.current ?? 0} of ${uploadProgress?.total ?? 0}`
                  : `JPG, PNG, WebP or HEIC · up to ${maxArtworks}`}
              </small>
              {uploading && uploadProgress && uploadProgress.total > 0 && (
                <progress
                  value={uploadProgress.current}
                  max={uploadProgress.total}
                  aria-label={`Preparing artwork ${uploadProgress.current} of ${uploadProgress.total}`}
                />
              )}
            </label>
            {uploadError && (
              <p className="upload-error" role="alert">
                {uploadError}
              </p>
            )}
            {!uploading && uploadReadyCount > 0 && (
              <p className="upload-ready" role="status">
                {uploadReadyCount} {uploadReadyCount === 1 ? "artwork is" : "artworks are"} ready to place.
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
                <button
                  type="button"
                  className="inspector-done"
                  onClick={closeSelectionInspector}
                >
                  Done editing artwork
                </button>
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
                <label>
                  Medium
                  <input
                    type="text"
                    value={selected.medium ?? ""}
                    maxLength={80}
                    placeholder="Oil on canvas"
                    onChange={(event) =>
                      updateArtwork({ medium: event.target.value })
                    }
                  />
                </label>
                <label>
                  Original dimensions
                  <input
                    type="text"
                    value={selected.dimensions ?? ""}
                    maxLength={80}
                    placeholder="120 × 90 cm"
                    onChange={(event) =>
                      updateArtwork({ dimensions: event.target.value })
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
                  options={ARTWORK_FRAME_OPTIONS.map((option) => option.id)}
                  labels={Object.fromEntries(
                    ARTWORK_FRAME_OPTIONS.map((option) => [option.id, option.label]),
                  )}
                  value={selected.frame ?? "black"}
                  onChange={(frame) =>
                    updateArtwork({ frame: frame as Artwork["frame"] })
                  }
                />
                <p className="inspector-subhead">Mat</p>
                <Choice
                  options={ARTWORK_MAT_OPTIONS.map((option) => option.id)}
                  labels={Object.fromEntries(
                    ARTWORK_MAT_OPTIONS.map((option) => [option.id, option.label]),
                  )}
                  value={selected.mat ?? "none"}
                  onChange={(mat) =>
                    updateArtwork({ mat: mat as Artwork["mat"] })
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
                        {availableWalls(draft.templateId)
                          .filter((wall) => !["north", "south", "west", "east", "divider-front", "divider-back"].includes(wall))
                          .map((wall) => (
                            <option key={wall} value={wall}>{wallLabel(draft.templateId, wall)}</option>
                          ))}
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
                      (isShortGalleryWall(selected.wall) ? 1.25 : 0.75),
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
                  {selectedPresentation && (
                    <small>
                      Mounted size: {Math.round(selectedPresentation.outerWidth * 100)} ×{" "}
                      {Math.round(selectedPresentation.outerHeight * 100)} cm.
                    </small>
                  )}
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
                    disabled={selected.locked}
                    onClick={() => {
                      const placement = findAvailableArtworkPlacement(
                        draftRef.current,
                        selected.id,
                        selected.wall,
                        0,
                        DEFAULT_ARTWORK_EYE_LINE_METRES,
                      );
                      if (!placement) {
                        setPlacementError(
                          "No safe reset position is available on this wall.",
                        );
                        return;
                      }
                      placeArtwork(
                        selected.id,
                        placement.wall,
                        placement.x,
                        placement.y,
                      );
                    }}
                  >
                    Reset placement
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
                <button
                  type="button"
                  className="inspector-done"
                  onClick={closeSelectionInspector}
                >
                  Done editing object
                </button>
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
                {[
                  "olive",
                  "monstera",
                  "ficus",
                  "snake-plant",
                ].includes(selectedDecor.type) && (
                  <>
                    <p className="inspector-subhead">Plant pot</p>
                    <div className="choices pot-finish-choices">
                      <button
                        className={(selectedDecor.potColor ?? "light") === "light" ? "active" : ""}
                        aria-pressed={(selectedDecor.potColor ?? "light") === "light"}
                        onClick={() => updateDecor({ potColor: "light" })}
                      >
                        Light stone
                      </button>
                      <button
                        className={selectedDecor.potColor === "black" ? "active" : ""}
                        aria-pressed={selectedDecor.potColor === "black"}
                        onClick={() => updateDecor({ potColor: "black" })}
                      >
                        Matte black
                      </button>
                    </div>
                  </>
                )}
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
            onEditorModeChange={handleEditorModeChange}
            artworkCount={editorDirectoryArtworks.length}
            artworkDirectoryExpanded={editorDirectoryOpen}
            artworkButtonRef={editorDirectoryButton}
            onOpenArtworkDirectory={() => setEditorDirectoryOpen(true)}
          />
          {visibleEditorMode === "walk" && (
            <div className="draft-preview-status" role="status">
              <strong>Draft preview</strong>
              <span>Changes are not live</span>
            </div>
          )}
          <div className="canvas-badge">
            <span>{visibleEditorMode === "walk" ? "Draft preview" : "Editing"}</span>
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
      {editorDirectoryOpen && (
        <ArtworkDirectory
          exhibitionTitle={draft.title}
          artist={draft.artist}
          artworks={editorDirectoryArtworks}
          sourceNote="Preview the same artwork information visitors receive after publishing."
          unavailable={false}
          returnFocus={editorDirectoryButton}
          onClose={() => setEditorDirectoryOpen(false)}
        />
      )}
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
          publishStatus={publishStatus}
          publishError={publishError}
          coverSrc={publishCover}
          visibility={publishVisibility}
          editing={editTarget}
          accountEligible={isVerifiedAccount(accountSession)}
          onVisibilityChange={setPublishVisibility}
          onOpenAccount={() => {
            resumePublishAfterAccount.current = true;
            setPublishReviewOpen(false);
            setAccountOpen(true);
          }}
          returnFocus={publishButton}
          onClose={closePublishReview}
          onPublish={() => void publish()}
          onFocusIssue={focusReviewIssue}
        />
      )}
    </main>
  );
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
  publishStatus,
  publishError,
  coverSrc,
  visibility,
  editing,
  accountEligible,
  returnFocus,
  onClose,
  onPublish,
  onFocusIssue,
  onVisibilityChange,
  onOpenAccount,
}: {
  issues: PublishReviewIssue[];
  blockers: number;
  publishing: boolean;
  publishStatus: PublishStatus;
  publishError?: string;
  coverSrc?: string;
  visibility: GalleryVisibility;
  editing?: GalleryEditTarget;
  accountEligible: boolean;
  returnFocus: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  onPublish: () => void;
  onFocusIssue: (issue: PublishReviewIssue) => void;
  onVisibilityChange: (visibility: GalleryVisibility) => void;
  onOpenAccount: () => void;
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
        <p className="eyebrow">{editing ? "Live update review" : "Pre-publish review"}</p>
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
              alt="Space cover captured from the current Studio view"
            />
          ) : (
            <span aria-live="polite">Rendering Space cover…</span>
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
        {!accountEligible ? (
          <div className="publish-account-gate">
            <span aria-hidden="true">L</span>
            <div>
              <strong>Sign in to publish.</strong>
              <p>Build and Walk Preview stay available without an account. Use Google or create and verify a {PRODUCT_BRAND.name} account when you are ready to publish.</p>
            </div>
          </div>
        ) : editing ? (
          <div className="publish-edit-target">
            <strong>Same Space. Same share URL.</strong>
            <span>{visibilityLabel[editing.visibility]} · Revision {editing.revision + 1} · Visibility and expiry stay unchanged.</span>
          </div>
        ) : <fieldset className="publish-visibility">
          <legend>Visibility and duration</legend>
          {(["public", "unlisted", "private"] as GalleryVisibility[]).map(
            (option) => {
              const description =
                option === "public"
                  ? "Listed in Discover · Account preview"
                  : option === "unlisted"
                    ? "Anyone with the link · Account preview"
                    : "Owner and invited accounts · Account preview";
              return (
                <label key={option}>
                  <input
                    type="radio"
                    name="visibility"
                    value={option}
                    checked={visibility === option}
                    onChange={() => onVisibilityChange(option)}
                  />
                  <span><strong>{visibilityLabel[option]}</strong>{description}</span>
                </label>
              );
            },
          )}
          <small>Billing is not active. Account Spaces use an extended preview period for now.</small>
        </fieldset>}
        {publishError && (
          <p className="publish-review-error" role="alert">
            {publishError}
          </p>
        )}
        <div className="editor-modal-actions">
          <button
            className="publish-button"
            onClick={accountEligible ? onPublish : onOpenAccount}
            disabled={publishing || (accountEligible && blockers > 0)}
          >
            {publishStatus === "preparing"
              ? "Preparing Space cover…"
              : publishStatus === "publishing"
                ? "Publishing…"
                : !accountEligible
                  ? "Sign in to publish"
                : publishStatus === "error"
                  ? "Retry publishing"
                  : editing
                    ? "Update live Space"
                    : `Publish ${visibilityLabel[visibility].toLowerCase()} Space`}
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
  labels,
  value,
  onChange,
}: {
  options: string[];
  labels?: Record<string, string>;
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
          {labels?.[item] ?? item}
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
  onViewArtwork,
  onClose,
}: {
  exhibitionTitle: string;
  artist: string;
  artworks: DirectoryArtwork[];
  sourceNote: string;
  unavailable: boolean;
  imagesLoading?: boolean;
  returnFocus: React.RefObject<HTMLElement | null>;
  onViewArtwork?: (id: string) => void;
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

function SpaceLoadingPoster() {
  return (
    <main className="space-entry-loading" role="status" aria-live="polite">
      <Logo />
      <div aria-hidden="true" className="space-entry-loading__frame" />
      <p className="eyebrow">Immersive Space</p>
      <h1>Preparing your visit.</h1>
      <p>Loading the room, artworks and visitor route…</p>
      <span aria-hidden="true" />
    </main>
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
        <div className="viewer-header__identity">
          <p>Danny Hirsch Arts</p>
          <span>Threshold · 2026</span>
        </div>
        <div className="viewer-header__actions">
          <SpaceShareMenu
            compact
            url={hashApplicationUrl("/demo", window.location.href)}
            title="Threshold"
            creator="Danny Hirsch Arts"
            visibility="public"
            source="reference_demo"
          />
          <FullscreenButton target={viewer} />
          <button onClick={() => navigate("/create")}>Create a Space ↗</button>
        </div>
      </header>
      <div className="viewer-scene-layer">
        <Suspense fallback={<DemoLoadingPoster />}>
          <DannyDemoScene
            viewMode={viewMode}
            playIntro
            onArtworkFocus={setArtworkFocus}
            onLoadProgress={setLoadProgress}
            onViewModeChange={changeView}
            artworkCount={directoryArtworks.length}
            artworkDirectoryExpanded={directoryOpen}
            artworkDirectoryUnavailable={sceneUnavailable}
            artworkButtonRef={directoryButton}
            onOpenArtworkDirectory={() => {
              setArtworkFocus(null);
              setDirectoryOpen(true);
            }}
          />
          <DemoLoadingPoster
            progress={loadProgress}
            ready={loadProgress >= 100}
          />
        </Suspense>
      </div>
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
  const serverSpaceState = document
    .querySelector('meta[name="lieuva:space-state"]')
    ?.getAttribute("content");
  const [loadState, setLoadState] = useState<GalleryLoadState>(() =>
    serverSpaceState === "not-found"
      ? { status: "not-found" }
      : { status: "loading" },
  );
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("walk");
  const [artworkFocus, setArtworkFocus] = useState<ArtworkFocus | null>(null);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [directoryFocus, setDirectoryFocus] = useState<{
    id: string;
    token: number;
  }>();
  const [accountOpen, setAccountOpen] = useState(false);
  const [artworkLoad, setArtworkLoad] = useState({ loaded: 0, total: 0, failed: false });
  const handleViewerSessionChange = useCallback((session: AccountSession | null) => {
    if (!isVerifiedAccount(session)) return;
    setAccountOpen(false);
    setLoadState({ status: "loading" });
    setLoadAttempt((attempt) => attempt + 1);
  }, []);
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
    if (serverSpaceState === "not-found") return;
    let stale = false;
    galleryRepository
      .findManifest(id)
      .then(async (gallery) => {
        if (stale) return;
        if (!gallery) {
          setLoadState({ status: "not-found" });
          return;
        }
        setLoadState({ status: "ready", gallery });
        setArtworkLoad({
          loaded: gallery.artworks.filter((artwork) => Boolean(artwork.src)).length,
          total: gallery.artworks.length,
          failed: false,
        });
        try {
          const hydrated = await galleryRepository.hydrateGalleryArtworks(
            gallery,
            (next, loaded, total) => {
              if (stale) return;
              setLoadState({ status: "ready", gallery: next });
              setArtworkLoad({ loaded, total, failed: false });
            },
          );
          if (!stale) {
            setLoadState({ status: "ready", gallery: hydrated });
            setArtworkLoad({ loaded: hydrated.artworks.length, total: hydrated.artworks.length, failed: false });
          }
        } catch (error) {
          console.error("Artwork stream interrupted", error);
          if (!stale) setArtworkLoad((current) => ({ ...current, failed: true }));
        }
      })
      .catch((error) => {
        if (!(error instanceof GalleryAccessDeniedError))
          console.error("Gallery request failed", error);
        if (!stale)
          setLoadState({
            status:
              error instanceof GalleryAccessDeniedError
                ? "access-denied"
                : "error",
          });
      });
    return () => {
      stale = true;
    };
  }, [id, loadAttempt, serverSpaceState]);
  useEffect(() => {
    if (loadState.status !== "ready") return;
    applyPageMetadata(publishedSpaceMetadataPolicy({
      id: loadState.gallery.id,
      visibility: loadState.gallery.visibility,
      title: loadState.gallery.title,
      artist: loadState.gallery.artist,
      coverSrc: loadState.gallery.coverSrc,
      indexEligible: isDiscoverEligible(loadState.gallery),
    }));
  }, [loadState]);
  useEffect(() => {
    if (loadState.status !== "ready") return;
    if (artworkLoad.total > 0 && artworkLoad.loaded < artworkLoad.total) return;
    trackTelemetry("published_space_ready", {
      visibility: loadState.gallery.visibility,
      count: artworkLoad.total,
    });
  }, [artworkLoad.loaded, artworkLoad.total, loadState]);
  if (loadState.status === "loading")
    return <SpaceLoadingPoster />;
  if (loadState.status === "error")
    return (
      <main className="not-found not-found--error">
        <Logo />
        <p className="eyebrow">Connection interrupted</p>
        <h1>We couldn't open this Space.</h1>
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
  if (loadState.status === "access-denied")
    return (
      <main className="not-found not-found--private">
        <Logo />
        <p className="eyebrow">Private {PRODUCT_BRAND.name} Space</p>
        <h1>Sign in to enter.</h1>
        <p>Use the verified email or Google account invited by the owner.</p>
        <div className="not-found-actions">
          <AccountButton
            open={accountOpen}
            onOpenChange={setAccountOpen}
            onSessionChange={handleViewerSessionChange}
          />
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
        <h1>This Space isn't available.</h1>
        <p>The exhibition may have expired or been removed by its owner.</p>
        <button
          className="button button--light"
          onClick={() => navigate("/create")}
        >
          {PRODUCT_BRAND.primaryCta}
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
      medium: artwork.medium,
      dimensions: artwork.dimensions,
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
        <div className="viewer-header__identity">
          <p>{gallery.title}</p>
          <CreatorAttributionLink spaceId={gallery.id} fallback={gallery.artist} />
        </div>
        <div className="viewer-header__actions">
          <SpaceShareMenu
            compact
            url={galleryShareUrl(gallery.id, window.location.href)}
            title={gallery.title}
            creator={gallery.artist}
            visibility={gallery.visibility}
            source="published_viewer"
          />
          <FullscreenButton target={viewer} />
          <button onClick={() => navigate("/create")}>Create a Space ↗</button>
        </div>
      </header>
      <GalleryScene
        draft={gallery}
        visitor
        viewMode={viewMode}
        playIntro
        focusArtwork={directoryFocus}
        onArtworkFocus={setArtworkFocus}
        onViewModeChange={changeView}
        artworkCount={directoryArtworks.length}
        artworkDirectoryExpanded={directoryOpen}
        artworkDirectoryUnavailable={sceneUnavailable}
        artworkButtonRef={directoryButton}
        onOpenArtworkDirectory={() => {
          setArtworkFocus(null);
          setDirectoryOpen(true);
        }}
        onExitSpace={() => navigate("/")}
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
        <p className="eyebrow">Immersive Space</p>
        <h1>{gallery.title}</h1>
        <p>by {gallery.artist}</p>
      </div>
      <MovementHint viewMode={viewMode} />
      {artworkLoad.total > 0 && artworkLoad.loaded < artworkLoad.total && (
        <p className="viewer-asset-progress" role="status">
          {artworkLoad.failed
            ? "Some artwork images could not be loaded."
            : `Preparing artwork ${artworkLoad.loaded} / ${artworkLoad.total}`}
        </p>
      )}
      {directoryOpen && (
        <ArtworkDirectory
          exhibitionTitle={gallery.title}
          artist={gallery.artist}
          artworks={directoryArtworks}
          sourceNote="Artwork images and notes are shown as supplied with this exhibition."
          unavailable={sceneUnavailable}
          returnFocus={directoryButton}
          onViewArtwork={(artworkId) => {
            setDirectoryOpen(false);
            setArtworkFocus(null);
            setViewMode("walk");
            setDirectoryFocus({ id: artworkId, token: Date.now() });
          }}
          onClose={() => setDirectoryOpen(false)}
        />
      )}
    </main>
  );
}

export default function App() {
  const [route, setRoute] = useState(routeFromLocation);
  const routeKey = `${route.page}:${route.id ?? route.handle ?? route.projectId ?? route.template ?? ""}:${route.demoArt ? "demo-art" : ""}`;
  const previousRoute = useRef(routeKey);
  useEffect(() => {
    const redirectPath = legacyCreatorHubRedirectPath(location.pathname, location.hash);
    if (redirectPath) {
      location.replace(`${new URL(applicationRootUrl(location.href)).origin}${redirectPath}`);
      return;
    }
    const handler = () => setRoute(routeFromLocation());
    addEventListener("hashchange", handler);
    addEventListener("popstate", handler);
    return () => {
      removeEventListener("hashchange", handler);
      removeEventListener("popstate", handler);
    };
  }, []);
  useEffect(() => {
    if (route.page !== "gallery" || !route.id || !route.legacySpace) return;
    if (new URLSearchParams(location.search).get("legacy") === "1") return;
    const target = galleryShareUrl(route.id, location.href);
    if (target !== location.href) location.replace(target);
  }, [route]);
  useEffect(() => {
    const deliveredServerMetadata =
      (route.page === "gallery" && document.querySelector('meta[name="lieuva:space-state"]')) ||
      (route.page === "creator" && document.querySelector('meta[name="lieuva:creator-state"]'));
    if (!deliveredServerMetadata) applyPageMetadata(pageMetadataPolicy(
      route.page === "gallery" || route.page === "creator" ? "other" : route.page,
    ));
    if (previousRoute.current === routeKey) return;
    previousRoute.current = routeKey;
    const frame = requestAnimationFrame(() =>
      document.getElementById("main-content")?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(frame);
  }, [route, routeKey]);
  useEffect(() => {
    const { page, template, projectId } = route;
    if (page === "home") trackTelemetry("landing_view");
    if (page === "create" && !template) trackTelemetry("create_started", { source: "route" });
    if (page === "create" && template) {
      trackTelemetry("template_selected", { template });
      trackTelemetry("studio_ready", { template });
      if (projectId?.startsWith("published-"))
        trackTelemetry("published_edit_started", { template });
    }
    if (page === "gallery") trackTelemetry("published_space_opened");
  }, [route, routeKey]);
  const page = useMemo(() => {
    if (route.page === "create")
      return route.template ? (
        <Studio
          key={`${route.template}:${route.projectId}:${route.demoArt ? "demo-art" : "empty"}`}
          initialTemplate={route.template}
          initialProjectId={
            route.projectId ?? createGalleryProjectId(route.template)
          }
          initialDemoArt={route.demoArt}
        />
      ) : (
        <TemplatePicker
          onChoose={(template, projectId) =>
            navigate(`/create/${template}/${projectId}`)
          }
        />
      );
    if (route.page === "demo") return <Demo />;
    if (route.page === "data") return <MvpDataNotice />;
    if (route.page === "account") return <AccountPage />;
    if (route.page === "creator" && route.handle)
      return <CreatorProfilePage handle={route.handle} />;
    if (route.page === "creators") return <CreatorDirectoryPage />;
    if (route.page === "creator-hub") return <CreatorHubPage />;
    if (route.page === "auth-action") return <AuthActionPage />;
    if (route.page === "space-not-found")
      return (
        <main className="not-found">
          <Logo />
          <h1>This Space isn't available.</h1>
          <p>The link is malformed or no longer valid.</p>
          <button className="button button--light" onClick={() => navigate("/")}>Return home</button>
        </main>
      );
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
        <Suspense
          key={routeKey}
          fallback={<div className="loading" role="status" aria-live="polite">Preparing your space…</div>}
        >
          {page}
        </Suspense>
      </div>
    </>
  );
}
