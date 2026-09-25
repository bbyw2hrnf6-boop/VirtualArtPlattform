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
    let recoveryPending = false;
    let recoveryFailed = false;
    let recoveryBaseline = 0;
    let recoveryTimeout = 0;
    let recoveryVisibleSince: number | undefined;
    const readRenderedFrames = () => {
      const scene = element.querySelector<HTMLElement>(".gallery-scene");
      return Number(scene?.dataset.renderFrames ?? 0);
    };
    const confirmRestoration = () => {
      if (!recoveryPending || element.querySelector(".scene-error")) return;
      if (readRenderedFrames() <= recoveryBaseline) return;
      recoveryPending = false;
      recoveryFailed = false;
      window.clearTimeout(recoveryTimeout);
      setUnavailable(false);
      reported = false;
    };
    const inspect = () => {
      if (element.querySelector(".scene-error")) {
        setUnavailable(true);
        if (!reported) {
          reported = true;
          onUnavailable?.();
        }
      } else if (recoveryPending) {
        confirmRestoration();
      } else if (element.querySelector(".gallery-scene canvas")) {
        if (!recoveryFailed) {
          reported = false;
          setUnavailable(false);
        }
      }
    };
    const observer = new MutationObserver(inspect);
    const onContextLost = (event: Event) => {
      if (
        !(event.target instanceof HTMLCanvasElement) ||
        !element.contains(event.target)
      )
        return;
      recoveryBaseline = readRenderedFrames();
      recoveryPending = true;
      recoveryFailed = false;
      setUnavailable(true);
      if (!reported) {
        reported = true;
        onUnavailable?.();
      }
    };
    const onContextRestored = () => {
      if (!recoveryPending) return;
      window.clearTimeout(recoveryTimeout);
      recoveryVisibleSince = undefined;
      const checkForRenderedFrame = () => {
        if (!recoveryPending) return;
        if (document.visibilityState === "hidden") {
          recoveryVisibleSince = undefined;
          recoveryTimeout = window.setTimeout(checkForRenderedFrame, 1000);
          return;
        }
        recoveryVisibleSince ??= performance.now();
        confirmRestoration();
        if (!recoveryPending) return;
        if (performance.now() - recoveryVisibleSince >= 30_000) {
          recoveryPending = false;
          recoveryFailed = true;
          return;
        }
        recoveryTimeout = window.setTimeout(checkForRenderedFrame, 100);
      };
      recoveryTimeout = window.setTimeout(checkForRenderedFrame, 100);
      inspect();
    };
    observer.observe(element, {
      childList: true,
      subtree: true,
    });
    element.addEventListener("webglcontextlost", onContextLost, true);
    element.addEventListener("webglcontextrestored", onContextRestored, true);
    queueMicrotask(inspect);
    return () => {
      observer.disconnect();
      window.clearTimeout(recoveryTimeout);
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
