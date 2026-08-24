import { trackTelemetry } from './telemetry';

type VitalMetric = 'lcp' | 'inp' | 'cls' | 'fcp' | 'ttfb';

function rating(metric: VitalMetric, value: number): string {
  const limits: Record<VitalMetric, [number, number]> = {
    lcp: [2500, 4000], inp: [200, 500], cls: [0.1, 0.25], fcp: [1800, 3000], ttfb: [800, 1800],
  };
  return value <= limits[metric][0] ? 'good' : value <= limits[metric][1] ? 'needs_improvement' : 'poor';
}

function report(metric: VitalMetric, value: number) {
  trackTelemetry('web_vital', { metric, value, rating: rating(metric, value) });
}

export function startWebVitals() {
  if (!('PerformanceObserver' in window)) return () => undefined;
  const observers: PerformanceObserver[] = [];
  const observe = (type: string, callback: PerformanceObserverCallback) => {
    try {
      const observer = new PerformanceObserver(callback);
      observer.observe({ type, buffered: true });
      observers.push(observer);
    } catch { /* unsupported entry type */ }
  };
  let lcp = 0;
  let cls = 0;
  let inp = 0;
  observe('largest-contentful-paint', (list) => { lcp = list.getEntries().at(-1)?.startTime ?? lcp; });
  observe('layout-shift', (list) => {
    for (const entry of list.getEntries()) {
      const shift = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean };
      if (!shift.hadRecentInput) cls += shift.value ?? 0;
    }
  });
  observe('event', (list) => {
    for (const entry of list.getEntries()) inp = Math.max(inp, entry.duration);
  });
  observe('paint', (list) => {
    const fcp = list.getEntries().find((entry) => entry.name === 'first-contentful-paint');
    if (fcp) report('fcp', fcp.startTime);
  });
  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  if (navigation) report('ttfb', navigation.responseStart);
  const finish = () => {
    if (lcp) report('lcp', lcp);
    report('cls', cls);
    if (inp) report('inp', inp);
  };
  addEventListener('pagehide', finish, { once: true });
  return () => {
    observers.forEach((observer) => observer.disconnect());
    removeEventListener('pagehide', finish);
  };
}
