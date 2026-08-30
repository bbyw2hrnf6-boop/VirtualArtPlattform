export type NavigationKind = PerformanceNavigationTiming["type"] | "unknown";

type LandingEntryLocation = Pick<Location, "pathname" | "search" | "hash">;

type LandingEntryEnvironment = {
  location: LandingEntryLocation;
  performance: Pick<Performance, "getEntriesByType">;
  scrollTo: (x: number, y: number) => void;
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  addEventListener: (
    type: "pageshow",
    listener: EventListener,
    options?: AddEventListenerOptions | boolean,
  ) => void;
};

export function initialNavigationKind(
  performanceApi: Pick<Performance, "getEntriesByType">,
): NavigationKind {
  const entry = performanceApi.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  return entry?.type ?? "unknown";
}

export function isFreshLandingEntry(
  locationValue: LandingEntryLocation,
  navigationKind: NavigationKind,
) {
  const pathname = locationValue.pathname.replace(/\/+$/, "") || "/";
  return pathname === "/"
    && locationValue.search === ""
    && locationValue.hash === ""
    && navigationKind === "navigate";
}

/**
 * Safari can carry a very deep document position into a new top-level visit.
 * Reset only a genuine, queryless, hashless navigation to the landing page;
 * reload and back/forward restoration intentionally remain browser-managed.
 */
export function resetFreshLandingEntryScroll(
  environment: LandingEntryEnvironment = window,
) {
  const navigationKind = initialNavigationKind(environment.performance);
  if (!isFreshLandingEntry(environment.location, navigationKind)) return false;

  const reset = () => environment.scrollTo(0, 0);
  reset();
  environment.requestAnimationFrame(reset);
  environment.addEventListener("pageshow", reset, { once: true });
  return true;
}
