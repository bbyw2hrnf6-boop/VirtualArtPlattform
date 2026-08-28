import { useEffect, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { VISITOR_KEYBOARD_HINT } from "./visitorKeyboard";
import type { VisitorTourState } from "./visitorTourState";

export type VisitorModeOption<TMode extends string> = {
  value: TMode;
  label: string;
  icon: string;
};

type VisitorControlsProps<TMode extends string> = {
  mode: TMode;
  modeOptions: VisitorModeOption<TMode>[];
  onModeChange: (mode: TMode) => void;
  tour: VisitorTourState;
  tourAvailable: boolean;
  onStartOrSkipTour: () => void;
  onPauseOrResumeTour: () => void;
  onStepTour: (direction: -1 | 1) => void;
  onSmartView: () => void;
  smartViewLabel: string;
  onResetView: () => void;
  artworkCount?: number;
  artworkDirectoryExpanded?: boolean;
  artworkDirectoryUnavailable?: boolean;
  artworkButtonRef?: RefObject<HTMLButtonElement | null>;
  onOpenArtworkDirectory?: () => void;
  compactLabel?: string;
  firstEntryHint?: boolean;
  onTouchMove?: (direction?: "forward" | "backward" | "left" | "right") => void;
};

const VISITOR_HINT_KEY = "lieuva-visitor-controls-seen-v1";

export function VisitorControls<TMode extends string>({
  mode,
  modeOptions,
  onModeChange,
  tour,
  tourAvailable,
  onStartOrSkipTour,
  onPauseOrResumeTour,
  onStepTour,
  onSmartView,
  smartViewLabel,
  onResetView,
  artworkCount = 0,
  artworkDirectoryExpanded = false,
  artworkDirectoryUnavailable = false,
  artworkButtonRef,
  onOpenArtworkDirectory,
  compactLabel = "Space controls",
  firstEntryHint = false,
  onTouchMove,
}: VisitorControlsProps<TMode>) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [showHint, setShowHint] = useState(() =>
    Boolean(
      firstEntryHint &&
      typeof sessionStorage !== "undefined" &&
      !sessionStorage.getItem(VISITOR_HINT_KEY),
    ),
  );
  useEffect(() => {
    if (!showHint || typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(VISITOR_HINT_KEY, "seen");
    const timeout = window.setTimeout(() => setShowHint(false), 7200);
    return () => window.clearTimeout(timeout);
  }, [showHint]);
  const tourRunning = tour.status !== "idle";
  const progressStyle = {
    "--visitor-tour-progress": String(Math.max(0, Math.min(1, tour.progress))),
  } as CSSProperties;
  const startTouchMove = (
    direction: "forward" | "backward" | "left" | "right",
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    onTouchMove?.(direction);
  };
  const stopTouchMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    onTouchMove?.();
  };

  return (
    <section
      className={`visitor-controls${tourRunning ? " is-touring" : ""}`}
      aria-label={compactLabel}
      data-visitor-controls
      style={progressStyle}
    >
      <div className="visitor-controls__modes" role="group" aria-label="View mode">
        {modeOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className={mode === option.value ? "is-active" : ""}
            aria-pressed={mode === option.value}
            onClick={() => onModeChange(option.value)}
          >
            <span aria-hidden="true">{option.icon}</span>
            {option.label}
          </button>
        ))}
      </div>

      <div className="visitor-controls__actions" role="group" aria-label="Camera and tour controls">
        <button
          type="button"
          data-visitor-tour-control
          className={`visitor-controls__tour${tourRunning ? " is-active" : ""}`}
          disabled={!tourAvailable && !tourRunning}
          aria-pressed={tourRunning}
          onClick={onStartOrSkipTour}
        >
          <span>{tourRunning ? "Skip tour" : "Guided tour"}</span>
          <small>
            {tourRunning
              ? `${Math.max(1, tour.currentStop)} / ${Math.max(1, tour.stopCount)} · ${tour.currentLabel}`
              : tourAvailable
                ? "Optional artwork route"
                : "Switch to Walk"}
          </small>
          <i aria-hidden="true" />
        </button>
        <button
          type="button"
          data-visitor-smart-view
          disabled={!tourAvailable || tourRunning}
          onClick={onSmartView}
        >
          <span>Focus view</span>
          <small>{smartViewLabel}</small>
        </button>
        <button type="button" data-visitor-reset-view onClick={onResetView}>
          <span>Reset view</span>
          <small>Return to start</small>
        </button>
        {onOpenArtworkDirectory && (
          <button
            ref={artworkButtonRef}
            type="button"
            className={artworkDirectoryUnavailable ? "is-fallback" : ""}
            aria-controls="artwork-directory"
            aria-haspopup="dialog"
            aria-expanded={artworkDirectoryExpanded}
            aria-label={`Open artwork list, ${artworkCount} work${artworkCount === 1 ? "" : "s"}${artworkDirectoryUnavailable ? ". The 3D view is unavailable." : ""}`}
            onClick={onOpenArtworkDirectory}
          >
            <span>Artworks</span>
            <small>{artworkCount} listed</small>
          </button>
        )}
        <button
          type="button"
          className="visitor-controls__help-trigger"
          aria-expanded={helpOpen}
          aria-controls="visitor-controls-help"
          onClick={() => setHelpOpen((value) => !value)}
        >
          <span>Controls</span>
          <small>How to explore</small>
        </button>
      </div>

      {onTouchMove && mode === "walk" && (
        <div className="visitor-controls__mobile-move" role="group" aria-label="Walk controls">
          {(["forward", "left", "backward", "right"] as const).map((direction) => (
            <button
              key={direction}
              type="button"
              className={`is-${direction}`}
              aria-label={`Move ${direction}`}
              onPointerDown={(event) => startTouchMove(direction, event)}
              onPointerUp={stopTouchMove}
              onPointerCancel={stopTouchMove}
            >
              <span aria-hidden="true">{{ forward: "↑", backward: "↓", left: "←", right: "→" }[direction]}</span>
            </button>
          ))}
          <small>Hold to walk</small>
        </div>
      )}

      {(helpOpen || showHint) && (
        <aside id="visitor-controls-help" className="visitor-controls__help" role="note">
          <button type="button" aria-label="Close control guide" onClick={() => { setHelpOpen(false); setShowHint(false); }}>×</button>
          <strong>Explore at your pace.</strong>
          <span className="visitor-controls__help-desktop">{VISITOR_KEYBOARD_HINT} · Drag to look · Click the floor to walk</span>
          <span className="visitor-controls__help-mobile">Drag to look · Tap the floor to walk · Pinch to zoom</span>
          <small>Select an artwork for its story, or choose Guided tour.</small>
        </aside>
      )}

      {tourRunning && (
        <div className="visitor-controls__tour-nav" role="group" aria-label="Guided tour playback">
          <button type="button" onClick={() => onStepTour(-1)} aria-label="Previous tour stop">
            ← <span>Previous</span>
          </button>
          <button type="button" onClick={onPauseOrResumeTour}>
            {tour.status === "paused" ? "Resume" : "Pause"}
          </button>
          <button type="button" onClick={() => onStepTour(1)} aria-label="Next tour stop">
            <span>Next</span> →
          </button>
        </div>
      )}
    </section>
  );
}
