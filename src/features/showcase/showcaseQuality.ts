/** Adapt only on frames already requested by the visitor. Recovery never starts
 * an idle render loop, and a pause cannot count as a run of fast GPU samples. */
export function createShowcaseQuality() {
  let warmup = 3, full = false, slow = 0, fast = 0;
  let changedAt = 0, fastSince = 0, lastSample = -Infinity;
  return {
    warming: () => warmup > 0,
    full: () => full,
    sample(now: number, frameMs: number, drawMs: number, fullWorkloadRatio: number): boolean | undefined {
      const before = full;
      if (warmup) {
        if (--warmup === 0) { full = frameMs <= 150; changedAt = now; }
      } else if (full) {
        slow = frameMs > 150 ? slow + 1 : 0;
        if (slow >= 2) { full = false; changedAt = now; fast = 0; }
      } else {
        // Leave headroom for the larger full-resolution canvas/reflection.
        // The RAF interval includes display timing, so scale drawing cost only.
        const headroom = frameMs <= 40 && drawMs * Math.max(1, fullWorkloadRatio) <= 75;
        if (!headroom || now - lastSample > 250) fast = 0;
        if (headroom) {
          if (!fast) fastSince = now;
          fast++;
          if (fast >= 30 && now - fastSince >= 750 && now - changedAt >= 10_000) {
            full = true; slow = 0; changedAt = now;
          }
        }
      }
      lastSample = now;
      return full !== before ? full : undefined;
    },
  };
}
