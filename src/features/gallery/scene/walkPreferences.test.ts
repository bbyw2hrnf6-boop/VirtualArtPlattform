import { expect, it } from 'vitest';
import { clampWalkFov, defaultWalkFov, defaultWalkPace } from './walkPreferences';

it('starts compact rooms wider without changing the desktop lens', () => {
  expect(defaultWalkFov(true)).toBe(78);
  expect(defaultWalkFov(false)).toBe(62);
  expect(clampWalkFov(200)).toBe(90);
  expect(clampWalkFov(0)).toBe(40);
  expect(clampWalkFov(84)).toBe(84);
});

it('makes the Grand Forum quicker while retaining smaller-room defaults', () => {
  expect(defaultWalkPace('pavilion')).toBe(1.25);
  expect(defaultWalkPace('white-cube')).toBe(1);
  expect(defaultWalkPace('nocturne')).toBe(1);
});
