import { describe, expect, it } from 'vitest';
import { TEMPLATES, getTemplate } from './templates';

describe('premium environment definitions', () => {
  it('keeps the three persistent template identities stable', () => {
    expect(TEMPLATES.map((template) => template.id)).toEqual([
      'white-cube',
      'nocturne',
      'pavilion',
    ]);
    expect(new Set(TEMPLATES.map((template) => template.scale)).size).toBe(3);
    expect(new Set(TEMPLATES.map((template) => template.defaultLighting)).size).toBe(3);
  });

  it('defines truthful material, architecture, placement and tier budgets', () => {
    TEMPLATES.forEach((template) => {
      expect(template.materialIdentity.wall).toBeTruthy();
      expect(template.materialIdentity.floor).toBeTruthy();
      expect(template.materialIdentity.wallColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(template.materialIdentity.floorColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(template.architecture.entranceWidth).toBeLessThan(template.dimensions[0]);
      expect(template.architecture.thresholdDepth).toBeLessThan(template.dimensions[1] / 2);
      expect(template.placementAnchors.length).toBeGreaterThanOrEqual(3);
      expect(template.drawCallBudget.low).toBeLessThan(template.drawCallBudget.balanced);
      expect(template.drawCallBudget.balanced).toBeLessThan(template.drawCallBudget.high);
    });
  });

  it('falls back without creating a second environment system', () => {
    expect(getTemplate('white-cube').id).toBe('white-cube');
    expect(getTemplate('missing' as never).id).toBe('white-cube');
  });
});
