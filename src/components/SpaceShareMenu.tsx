import { useEffect, useId, useRef, useState } from "react";
import type { GalleryVisibility } from "../services/galleryAccess";
import { trackTelemetry } from "../services/telemetry";

type SpaceShareMenuProps = {
  url: string;
  title: string;
  creator: string;
  visibility: GalleryVisibility;
  source: "publish_success" | "published_viewer" | "reference_demo";
  compact?: boolean;
};

async function copyText(value: string) {
  if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
  await navigator.clipboard.writeText(value);
}

export function SpaceShareMenu({
  url,
  title,
  creator,
  visibility,
  source,
  compact = false,
}: SpaceShareMenuProps) {
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [qrSource, setQrSource] = useState<string>();
  const [qrStatus, setQrStatus] = useState<"idle" | "loading" | "error">("idle");
  const nativeShareAvailable = typeof navigator.share === "function";

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const recordShare = (operation: string) =>
    trackTelemetry("share_action", { source, visibility, operation });

  const handleCopy = () => {
    recordShare("copy");
    void copyText(url)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => window.prompt("Copy your Space link:", url));
  };

  const handleNativeShare = () => {
    if (!nativeShareAvailable) return;
    recordShare("native");
    void navigator.share({
      title: `${title} — ${creator}`,
      text: `Enter ${title}, an immersive Space by ${creator}.`,
      url,
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.warn("Native sharing was unavailable.", error);
    });
  };

  const showQrCode = () => {
    recordShare("qr");
    setOpen(true);
    if (qrSource || qrStatus === "loading") return;
    setQrStatus("loading");
    void import("qrcode-generator")
      .then(({ default: createQrCode }) => {
        const qr = createQrCode(0, "M");
        qr.addData(url, "Byte");
        qr.make();
        setQrSource(qr.createDataURL(6, 16));
        setQrStatus("idle");
      })
      .catch((error) => {
        console.warn("QR code could not be prepared.", error);
        setQrStatus("error");
      });
  };

  return (
    <div
      ref={root}
      className={`space-share ${compact ? "space-share--compact" : ""}`}
    >
      <button
        type="button"
        className="space-share__trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        Share <span aria-hidden="true">↗</span>
      </button>
      {open && (
        <div id={panelId} className="space-share__panel" role="group" aria-label="Share this Space">
          <div className="space-share__heading">
            <span>Share this Space</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close sharing options">×</button>
          </div>
          <p>{visibility === "private" ? "Only invited accounts can open this link." : "One clean link, ready to send."}</p>
          <div className="space-share__actions">
            <button type="button" onClick={handleCopy}>{copied ? "Copied ✓" : "Copy link"}</button>
            {nativeShareAvailable && <button type="button" onClick={handleNativeShare}>Share…</button>}
            <button type="button" onClick={showQrCode}>QR code</button>
          </div>
          <input
            aria-label="Shareable Space URL"
            readOnly
            spellCheck={false}
            value={url}
            onFocus={(event) => event.currentTarget.select()}
          />
          {qrStatus === "loading" && <span className="space-share__status" role="status">Preparing QR code…</span>}
          {qrStatus === "error" && <span className="space-share__status" role="status">QR unavailable. Copy the link instead.</span>}
          {qrSource && (
            <img
              className="space-share__qr"
              src={qrSource}
              alt={`QR code for ${title}`}
            />
          )}
        </div>
      )}
    </div>
  );
}
