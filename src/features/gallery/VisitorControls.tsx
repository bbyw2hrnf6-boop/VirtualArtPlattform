import type { CSSProperties, RefObject } from "react";
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
};

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
  compactLabel = "Exhibition controls",
}: VisitorControlsProps<TMode>) {
  const tourRunning = tour.status !== "idle";
  const progressStyle = {
    "--visitor-tour-progress": String(Math.max(0, Math.min(1, tour.progress))),
  } as CSSProperties;

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
          <span>Smart view</span>
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
      </div>

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
