import { describe, expect, it } from 'vitest';
import { classifyServerError, parseClientTelemetry, safeResourceRef } from './observability.js';

const validEvent = {
  name: 'web_vital', occurredAt: '2026-08-24T12:00:00.000Z',
  environment: 'staging', route: 'published_space', sessionId: 'session-123',
  properties: { metric: 'lcp', value: 2300, rating: 'good' },
};

describe('server observability contract', () => {
  it('hashes pseudonymous references and accepts the allow-list', () => {
    const parsed = parseClientTelemetry([validEvent]);
    expect(parsed[0].sessionRef).toBe(safeResourceRef('session-123'));
    expect(parsed[0]).not.toHaveProperty('sessionId');
  });

  it('rejects content, raw identifiers and unknown events', () => {
    expect(() => parseClientTelemetry([{ ...validEvent, properties: { title: 'Private work' } }])).toThrow();
    expect(() => parseClientTelemetry([{ ...validEvent, name: 'custom_event' }])).toThrow();
    expect(() => parseClientTelemetry(new Array(21).fill(validEvent))).toThrow();
  });

  it('uses stable error classes', () => {
    expect(classifyServerError({ code: 'permission-denied' })).toBe('access');
    expect(classifyServerError({ code: 'resource-exhausted' })).toBe('quota');
    expect(classifyServerError({ code: 'deadline-exceeded' })).toBe('availability');
  });

  it('accepts the landing conversion events without content properties', () => {
    const parsed = parseClientTelemetry([
      { ...validEvent, name: 'landing_product_proof_engaged', route: 'home', properties: { source: 'workflow' } },
      { ...validEvent, name: 'landing_example_entered', route: 'home', properties: { source: 'hero' } },
      { ...validEvent, name: 'landing_create_cta_clicked', route: 'home', properties: { source: 'closing' } },
    ]);
    expect(parsed.map((event) => event.name)).toEqual([
      'landing_product_proof_engaged',
      'landing_example_entered',
      'landing_create_cta_clicked',
    ]);
  });

  it('accepts privacy-safe Studio funnel events', () => {
    const parsed = parseClientTelemetry([
      { ...validEvent, name: 'artwork_placed', route: 'studio', properties: { template: 'nocturne', source: 'upload', count: 2 } },
      { ...validEvent, name: 'walk_preview_exited', route: 'studio', properties: { template: 'nocturne' } },
    ]);
    expect(parsed.map((event) => event.name)).toEqual([
      'artwork_placed',
      'walk_preview_exited',
    ]);
  });
});
