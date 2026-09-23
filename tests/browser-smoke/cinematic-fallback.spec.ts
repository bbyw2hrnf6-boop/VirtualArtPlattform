import { test, expect } from '@playwright/test';

for (const width of [1440, 390]) {
  test(`cinematic entry and still chapters need no showcase GPU at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const requests: string[] = [];
    page.on('request', r => { if (/\/showcases\/.*\.glb/.test(r.url())) requests.push(r.url()); });
    await page.goto('/#/');
    const story = page.getByRole('region', { name: 'Three worlds cinematic story' });
    await story.scrollIntoViewIfNeeded();
    await story.getByRole('button', { name: 'Explore still views' }).click();
    for (const [i, name] of ['Obsidian', 'Sculpture Pavilion', 'Forest Fold House'].entries()) {
      await story.getByRole('navigation').getByRole('button', { name: new RegExp(name) }).click();
      await expect(story).toHaveAttribute('data-chapter', String(i));
      await expect(story.getByRole('link', { name: `Explore ${name} ↗` })).toBeVisible();
    }
    await expect(story.locator('canvas')).toHaveCount(0);
    expect(requests).toEqual([]);
    await expect(story.getByRole('button', { name: /Play journey|Watch the journey/ })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await story.getByRole('button', { name: 'Close journey ×' }).click();
    await page.goto('/#/showcase/forest-fold-house');
    await expect(page.getByRole('button', { name: 'Enter the house ↗', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Take the flight/ })).toHaveCount(0);
    expect(requests).toEqual([]);
  });
}
