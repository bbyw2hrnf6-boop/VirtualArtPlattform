import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ScrollGalleryStory } from './ScrollGalleryStory';

describe('Product-story handoff and fallback', () => {
  it('keeps literal product copy and real create links available before WebGL starts', () => {
    const html = renderToStaticMarkup(createElement(ScrollGalleryStory));
    expect(html).toContain('Immersive 3D presentation platform');
    expect(html).toContain('href="#/create"');
    expect(html).toContain('Open this Space in Studio');
    expect(html).toContain('directly in your browser');
    expect(html).toContain('sgs__accessible-sequence');
    expect(html).not.toContain('Danny');
  });
});
