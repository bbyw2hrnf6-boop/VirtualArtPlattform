import { describe, expect, it, vi } from "vitest";
import {
  initialNavigationKind,
  isFreshLandingEntry,
  resetFreshLandingEntryScroll,
} from "./landingEntry";

describe("landing entry scroll policy", () => {
  it("recognizes only a new queryless and hashless homepage navigation", () => {
    expect(isFreshLandingEntry({ pathname: "/", search: "", hash: "" }, "navigate")).toBe(true);
    expect(isFreshLandingEntry({ pathname: "/", search: "", hash: "" }, "reload")).toBe(false);
    expect(isFreshLandingEntry({ pathname: "/", search: "", hash: "" }, "back_forward")).toBe(false);
    expect(isFreshLandingEntry({ pathname: "/", search: "?explore=spaces", hash: "" }, "navigate")).toBe(false);
    expect(isFreshLandingEntry({ pathname: "/", search: "", hash: "#/demo" }, "navigate")).toBe(false);
    expect(isFreshLandingEntry({ pathname: "/creator-hub", search: "", hash: "" }, "navigate")).toBe(false);
  });

  it("reads a navigation timing entry without using deprecated navigation APIs", () => {
    const performanceApi = {
      getEntriesByType: vi.fn(() => [{ type: "back_forward" } as PerformanceNavigationTiming]),
    };
    expect(initialNavigationKind(performanceApi)).toBe("back_forward");
  });

  it("stabilizes a fresh landing entry after initial layout and pageshow", () => {
    const scrollTo = vi.fn();
    const addEventListener = vi.fn();
    const environment = {
      location: { pathname: "/", search: "", hash: "" },
      performance: {
        getEntriesByType: vi.fn(() => [{ type: "navigate" } as PerformanceNavigationTiming]),
      },
      scrollTo,
      requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      }),
      addEventListener,
    };

    expect(resetFreshLandingEntryScroll(environment)).toBe(true);
    expect(scrollTo).toHaveBeenCalledTimes(2);
    expect(addEventListener).toHaveBeenCalledWith("pageshow", expect.any(Function), { once: true });

    const pageshow = addEventListener.mock.calls[0][1] as EventListener;
    pageshow(new Event("pageshow"));
    expect(scrollTo).toHaveBeenCalledTimes(3);
  });

  it("does not touch scroll on reload or back/forward restoration", () => {
    const scrollTo = vi.fn();
    const environment = {
      location: { pathname: "/", search: "", hash: "" },
      performance: {
        getEntriesByType: vi.fn(() => [{ type: "reload" } as PerformanceNavigationTiming]),
      },
      scrollTo,
      requestAnimationFrame: vi.fn(),
      addEventListener: vi.fn(),
    };

    expect(resetFreshLandingEntryScroll(environment)).toBe(false);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
