import { test, expect } from '@playwright/test';

for (const width of [1440, 390]) {
  test(`cinematic entry and still preview need no showcase GPU at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const requests: string[] = [];
    page.on('request', r => {
      if (/\/showcases\/.*\.(?:glb|gltf)(?:\?|$)|\.(?:mp4|webm)(?:\?|$)/.test(r.url())) requests.push(r.url());
    });
    await page.goto('/#/');
    const story = page.getByRole('region', { name: 'Three worlds cinematic story' });
    await story.scrollIntoViewIfNeeded();
    await expect(story.getByRole('status')).toHaveText('Still view · Explore the worlds below');
    await expect(story).toHaveAttribute('data-playing', 'false');
    await expect(story.getByRole('navigation', { name: 'Film chapters' })).toHaveCount(0);
    for (const id of ['obsidian', 'sculpture-pavilion', 'forest-fold-house'])
      await expect(page.locator(`.showcase-collection__grid a[href="#/showcase/${id}"]`).first()).toBeVisible();
    await expect(story.locator('canvas')).toHaveCount(0);
    await expect(story.locator('video[src]')).toHaveCount(0);
    expect(requests).toEqual([]);
    await expect(story.getByRole('button', { name: /Play film|Resume film|Replay film/ })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.goto('/#/showcase/forest-fold-house');
    await expect(page.getByRole('button', { name: 'Enter the house ↗', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Take the flight/ })).toHaveCount(0);
    expect(requests).toEqual([]);
  });
}
