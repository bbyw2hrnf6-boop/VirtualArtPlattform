import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FullscreenButton } from "../../components/FullscreenButton";
import { Logo } from "../../components/Logo";
import { SpaceLoading } from "../../components/SpaceLoading";
import { SpaceShareMenu } from "../../components/SpaceShareMenu";
import { hashApplicationUrl } from "../../services/spaceRoutes";
import {
  ArtworkDirectory,
  ArtworkInfoCard,
  MovementHint,
  type ArtworkFocus,
  type DirectoryArtwork,
  type ViewMode,
} from "../gallery/ViewerExperience";
import { useViewerSceneUnavailable } from "../gallery/useViewerSceneUnavailable";
import { DannyDemoScene } from "../gallery/GalleryScene";
import {
  DANNY_ARTWORKS,
  DANNY_DEMO_ASSET_URL,
  DANNY_DEMO_METADATA,
} from "./dannyReference";

interface GlbDirectoryDocument {
  images?: Array<{ name?: string; mimeType?: string; bufferView?: number }>;
  bufferViews?: Array<{ byteOffset?: number; byteLength: number }>;
}

async function loadDannyArtworkImages(
  signal: AbortSignal,
): Promise<Record<string, string>> {
  const response = await fetch(DANNY_DEMO_ASSET_URL, {
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

interface DannyArtworkImagesState {
  images: Record<string, string>;
  status: "idle" | "loading" | "ready" | "error";
}

function useDannyArtworkImages(active: boolean): DannyArtworkImagesState {
  const [images, setImages] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<DannyArtworkImagesState["status"]>(
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
    status: active && status === "idle" ? "loading" : status,
  };
}

function DemoLoadingPoster({
  progress = 0,
  ready = false,
}: {
  progress?: number;
  ready?: boolean;
}) {
  return (
    <SpaceLoading
      title={DANNY_DEMO_METADATA.title}
      detail="Preparing the exhibition…"
      progress={progress || undefined}
      ready={ready}
    />
  );
}

export interface DannyDemoPageProps {
  onNavigate: (path: string) => void;
}

export default function DannyDemoPage({ onNavigate }: DannyDemoPageProps) {
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
  const directoryArtworks = useMemo<DirectoryArtwork[]>(
    () =>
      DANNY_ARTWORKS.map((artwork) => ({
        ...artwork,
        image: dannyImages[artwork.imageKey],
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
          <p>{DANNY_DEMO_METADATA.creator}</p>
          <span>
            {DANNY_DEMO_METADATA.title} · {DANNY_DEMO_METADATA.year}
          </span>
        </div>
        <div className="viewer-header__actions">
          <SpaceShareMenu
            compact
            url={hashApplicationUrl(
              DANNY_DEMO_METADATA.route,
              window.location.href,
            )}
            title={DANNY_DEMO_METADATA.title}
            creator={DANNY_DEMO_METADATA.creator}
            visibility="public"
            source="reference_demo"
          />
          <FullscreenButton target={viewer} />
          <button onClick={() => onNavigate("/create")}>
            Create a Space ↗
          </button>
        </div>
      </header>
      <div className="viewer-scene-layer">
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
        <h1>{DANNY_DEMO_METADATA.title}</h1>
        <p>{DANNY_DEMO_METADATA.caption}</p>
      </div>
      <MovementHint viewMode={viewMode} />
      {directoryOpen && (
        <ArtworkDirectory
          exhibitionTitle={DANNY_DEMO_METADATA.title}
          artist={DANNY_DEMO_METADATA.artist}
          artworks={directoryArtworks}
          sourceNote={DANNY_DEMO_METADATA.directorySource}
          unavailable={sceneUnavailable}
          imagesLoading={imageStatus === "loading"}
          returnFocus={directoryButton}
          onClose={() => setDirectoryOpen(false)}
        />
      )}
    </main>
  );
}
