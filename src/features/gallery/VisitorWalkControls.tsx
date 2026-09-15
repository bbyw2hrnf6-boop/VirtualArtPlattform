import type { PointerEvent as ReactPointerEvent } from 'react';

export type WalkDirection = 'forward' | 'backward' | 'left' | 'right';

export function VisitorWalkControls({ onTouchMove }: { onTouchMove: (direction?: WalkDirection) => void }) {
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
              onLostPointerCapture={() => onTouchMove()}
              onBlur={() => onTouchMove()}
              onKeyDown={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); onTouchMove(direction); } }}
              onKeyUp={() => onTouchMove()}
            >
              <span aria-hidden="true">{{ forward: "↑", backward: "↓", left: "←", right: "→" }[direction]}</span>
            </button>
          ))}
          <small>Hold to walk</small>
        </div>
  );
}
