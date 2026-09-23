import { test, expect } from '@playwright/test';

for (const width of [1440, 390]) {
  test(`cinematic entry and still chapters need no showcase GPU at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const requests: string[] = [];
    page.on('request', r => {
      if (/\/showcases\/.*\.(?:glb|gltf)(?:\?|$)|\.(?:mp4|webm)(?:\?|$)/.test(r.url())) requests.push(r.url());
    });
    await page.goto('/#/');
    const story = page.getByRole('region', { name: 'Three worlds cinematic story' });
    await story.scrollIntoViewIfNeeded();
    await expect(story.getByRole('status')).toHaveText('Still views · Reduced motion');
    await expect(story).toHaveAttribute('data-playing', 'false');
    for (const [i, name] of ['Obsidian', 'Sculpture Pavilion', 'Forest Fold House'].entries()) {
      await story.getByRole('navigation', { name: 'Film chapters' }).getByRole('button', { name: `0${i + 1} ${i === 0 ? 'Art spaces' : name}` }).click();
      await expect(story).toHaveAttribute('data-chapter', String(i));
      await expect(story.getByRole('link', { name: `Explore ${name}`, exact: true })).toBeVisible();
    }
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
