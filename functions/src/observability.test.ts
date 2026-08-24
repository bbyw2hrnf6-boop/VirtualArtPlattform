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
});
