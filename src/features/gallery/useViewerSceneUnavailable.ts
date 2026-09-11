import { useEffect, useState, type RefObject } from "react";

export function useViewerSceneUnavailable(
  host: RefObject<HTMLElement | null>,
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
