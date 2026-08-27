import { useEffect, useState, type RefObject } from "react";

export function FullscreenButton({ target }: { target: RefObject<HTMLElement | null> }) {
  const [active, setActive] = useState(false);
  const supported = typeof document !== "undefined" && "fullscreenEnabled" in document && document.fullscreenEnabled;
  useEffect(() => {
    const update = () => setActive(document.fullscreenElement === target.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, [target]);
  if (!supported) return null;
  return (
    <button
      type="button"
      className="viewer-fullscreen"
      aria-label={active ? "Exit full screen" : "Enter full screen"}
      onClick={() => void (active ? document.exitFullscreen() : target.current?.requestFullscreen())}
    >
      {active ? "Exit full screen" : "Full screen"} <span aria-hidden="true">{active ? "↙" : "↗"}</span>
    </button>
  );
}
