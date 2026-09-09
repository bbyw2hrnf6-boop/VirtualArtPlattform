import { expect, it } from 'vitest';
import { validateDraftPlacements } from '../gallery/editor/placementValidation';
import { STORY_DRAFT } from './storyDraft';

it('hands Studio a valid sample collection with distinct, editable furniture', () => {
  expect(validateDraftPlacements(STORY_DRAFT)).toEqual([]);
  expect(new Set(STORY_DRAFT.decor.map(item => item.type)).size).toBe(STORY_DRAFT.decor.length);
  expect(STORY_DRAFT.artworks.every(item => item.src && item.title && item.scale > 1)).toBe(true);
});
