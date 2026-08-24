import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __flushTelemetryForTests,
  __resetTelemetryForTests,
  __setTelemetryTransportForTests,
  sanitizeTelemetryProperties,
  setTelemetryConsent,
  telemetryRoute,
  trackTelemetry,
  type TelemetryEvent,
} from './telemetry';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}

describe('privacy-safe telemetry boundary', () => {
  let received: TelemetryEvent[];
  beforeEach(() => {
    received = [];
    vi.stubGlobal('localStorage', memoryStorage());
    vi.stubGlobal('sessionStorage', memoryStorage());
    vi.stubGlobal('location', { pathname: '/', hash: '#/' });
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('crypto', { randomUUID: () => 'test-session' });
    __setTelemetryTransportForTests(async (events) => { received.push(...events); });
  });
  afterEach(() => {
    __resetTelemetryForTests();
    vi.unstubAllGlobals();
  });

  it('is a no-op for optional analytics before consent', async () => {
    trackTelemetry('landing_view');
    await __flushTelemetryForTests();
    expect(received).toEqual([]);
  });

  it('keeps operational failures available without optional consent', async () => {
    trackTelemetry('publish_failed', { error_class: 'network', online: false });
    await __flushTelemetryForTests();
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ name: 'publish_failed', route: 'home' });
  });

  it('allows consented events while stripping content and identifiers', async () => {
    setTelemetryConsent('granted');
    trackTelemetry('publish_succeeded', {
      visibility: 'public', template: 'white-cube', title: 'Secret title',
      galleryId: 'raw-id', source: 'publish_success', count: 3,
    });
    await __flushTelemetryForTests();
    expect(received[0].properties).toEqual({
      visibility: 'public', template: 'white-cube', source: 'publish_success', count: 3,
    });
  });

  it('normalizes dynamic customer routes', () => {
    expect(telemetryRoute('/spaces/private-id', '')).toBe('published_space');
    expect(telemetryRoute('/', '#/create/nocturne/published-secret-id')).toBe('published_edit');
    expect(telemetryRoute('/', '#/create/pavilion/new-id')).toBe('studio');
  });

  it('rejects unsafe property shapes', () => {
    expect(sanitizeTelemetryProperties({ email: 'person@example.com', imagePath: 'published/a', metric: 'lcp', value: 2100 }))
      .toEqual({ metric: 'lcp', value: 2100 });
  });
});
