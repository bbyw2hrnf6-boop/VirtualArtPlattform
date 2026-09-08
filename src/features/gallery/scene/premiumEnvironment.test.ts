import { describe, expect, it } from 'vitest';
import { Group, Object3D } from 'three';
import { getTemplate } from '../templates';
import { galleryWalls } from '../editor/placementValidation';
import { premiumEnvironmentRequested, validatePremiumEnvironment } from './premiumEnvironment';
import type { TemplateId } from '../types';
function fixture(id: TemplateId) {
  const root = new Group(); const template = getTemplate(id);
  root.userData = { aura_template_id: id, aura_schema_version: 2, aura_units: 'metres',
    lieuva_production_version: 'premium-v1', aura_dimensions: [...template.dimensions, template.height] };
  for (const wall of galleryWalls(id)) { const node = new Object3D(); node.userData = { aura_role: 'surface', aura_surface_id: wall }; root.add(node); }
  for (const role of ['collider', 'navmesh', 'floor', 'art-anchor', 'view', 'walk-start', 'walk-look']) {
    const node = new Object3D(); node.userData = { aura_role: role }; root.add(node);
  }
  return root;
}
describe('authored environment boundary', () => {
  it('requires an explicit review selector and leaves normal share URLs alone', () => {
    expect(premiumEnvironmentRequested('')).toBe(false);
    expect(premiumEnvironmentRequested('?environment=premium-v1')).toBe(true);
    expect(premiumEnvironmentRequested('?environment=unknown')).toBe(false);
  });
  it.each(['white-cube', 'nocturne', 'pavilion'] as const)('accepts the protected %s contract', (id) => {
    expect(() => validatePremiumEnvironment(fixture(id), id)).not.toThrow();
  });
  it('rejects the old exporter layout and missing Forum surfaces', () => {
    const root = fixture('pavilion'); root.remove(root.children[4]);
    expect(() => validatePremiumEnvironment(root, 'pavilion')).toThrow(/surface/);
  });
  it('rejects duplicates, wrong dimensions and marketing staging', () => {
    const duplicate = fixture('white-cube'); duplicate.add(duplicate.children[0].clone());
    expect(() => validatePremiumEnvironment(duplicate, 'white-cube')).toThrow(/surface/);
    const wrong = fixture('nocturne'); wrong.userData.aura_dimensions = [16, 12, 5.3];
    expect(() => validatePremiumEnvironment(wrong, 'nocturne')).toThrow(/dimensions/);
    const staged = fixture('pavilion'); staged.children[0].userData.aura_role = 'beauty';
    expect(() => validatePremiumEnvironment(staged, 'pavilion')).toThrow(/staging/);
  });
});
