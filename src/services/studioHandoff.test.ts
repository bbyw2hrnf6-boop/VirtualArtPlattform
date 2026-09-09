import { expect, it } from 'vitest';
import { consumeStudioHandoff, stageStudioHandoff } from './studioHandoff';

it('opens only the explicitly handed-off project once; other saved drafts still require recovery', () => {
  stageStudioHandoff('new-story');
  expect(consumeStudioHandoff('existing-work')).toBe(false);
  expect(consumeStudioHandoff('new-story')).toBe(true);
  expect(consumeStudioHandoff('new-story')).toBe(false);
});
