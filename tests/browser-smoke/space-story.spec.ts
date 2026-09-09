import { expect, test } from '@playwright/test';

test.describe.configure({ timeout: 60_000 });

test('quiet preparation, reversible chapters and the real Studio handoff', async ({ page }, testInfo) => {
  // This journey prepares two real WebGL scenes, with separate bounded waits.
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/premium-v3/*.glb*', async route => { await held; await route.continue(); });
  await page.goto('/');
  const story = page.locator('.sgs');
  try {
    // The quiet poster precedes a deferred JS chunk. Software-rendered CI can
    // take longer than the default assertion timeout to mount that chunk.
    await expect(story).toHaveAttribute('data-arrival', 'loading', { timeout: 30_000 });
    await expect(story.locator('.sgs__poster')).toBeVisible();
    await expect(page.getByRole('progressbar')).toHaveCount(0);
    await expect(story.getByRole('heading', { level: 1 })).toBeVisible();
  } finally { release(); }
  await expect(story).toHaveAttribute('data-arrival', 'ready', { timeout: 30_000 });
  await expect(story.locator('.sgs__poster')).toHaveCSS('opacity', '0', { timeout: 30_000 });
  await page.screenshot({ path: testInfo.outputPath('story-desktop-opening.png') });
  await page.getByRole('button', { name: 'Chapter 3: Your atmosphere', exact: true }).click();
  await expect(story).toHaveAttribute('data-chapter', '2');
  await page.getByRole('button', { name: 'Preview oak floor', exact: true }).click();
  await expect(story.locator('.gallery-scene')).toHaveAttribute('data-floor', 'oak');
  await expect.poll(() => story.evaluate(el => Number((el as HTMLElement).style.getPropertyValue('--story-progress')))).toBeGreaterThan(.504);
  await page.screenshot({ path: testInfo.outputPath('story-desktop-material.png') });
  await page.getByRole('button', { name: 'Chapter 1: Your space', exact: true }).click();
  await expect(story).toHaveAttribute('data-chapter', '0');
  await page.getByRole('button', { name: 'Play the film · 72 sec' }).click();
  await expect(page.getByRole('button', { name: 'Pause film' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Pause film' }).press('Space');
  await expect(page.getByRole('button', { name: 'Play the film · 72 sec' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Continue below the story', exact: true }).click();
  await expect.poll(() => story.evaluate(el => el.getBoundingClientRect().bottom)).toBeLessThanOrEqual(1);
  await page.getByRole('button', { name: 'Chapter 4: Their experience', exact: true }).click();
  await expect(story).toHaveAttribute('data-chapter', '3');
  await page.getByRole('button', { name: 'Open this Space in Studio' }).click();
  await expect(page).toHaveURL(/#\/create\/white-cube\/story-/);
  await expect(page.locator('.studio .gallery-scene')).toHaveAttribute('data-arrival', 'ready', { timeout: 30_000 });
  await expect(page.locator('.studio .gallery-scene')).toHaveAttribute('data-floor', 'oak');
  expect(errors).toEqual([]);
});

test('mobile reduced motion stays composed and offers a functioning Studio action', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const story = page.locator('.sgs');
  await expect(story).toHaveAttribute('data-arrival', 'ready', { timeout: 30_000 });
  await expect(story).toHaveAttribute('data-motion', 'reduced');
  await expect(story.locator('.gallery-scene')).toHaveAttribute('data-cutaway', 'inactive');
  await expect(story.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play the film · 72 sec' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: 'Open this Space in Studio' })).toBeInViewport();
});

for (const room of ['white-cube', 'nocturne', 'pavilion']) {
  test(`${room}: one arrival screen precedes the prepared room`, async ({ page }) => {
    await page.goto(`/#/create/${room}/demo`);
    const scene = page.locator('.studio .gallery-scene');
    await expect(scene).toHaveAttribute('data-arrival', 'ready', { timeout: 30_000 });
    await expect(scene).toHaveAttribute('data-environment', 'premium-v3');
    await expect(scene).toHaveAttribute('data-capture-ready', 'true');
    await expect(page.locator('.space-entry-loading,.demo-loading-poster')).toHaveCount(0);
    await expect(page.getByRole('progressbar')).toHaveCount(0);
  });
}


test('mobile materials remain clear of the Studio action and can be undone', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const story = page.locator('.sgs');
  await expect(story).toHaveAttribute('data-arrival', 'ready', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Chapter 4: Their experience', exact: true }).click();
  await expect.poll(() => story.evaluate(el => Number((el as HTMLElement).style.getPropertyValue('--story-progress')))).toBeGreaterThan(.754);
  const finishes = await page.locator('.sgs__finish').boundingBox();
  const studioAction = page.getByRole('button', { name: 'Open this Space in Studio' });
  const action = await studioAction.boundingBox();
  expect(finishes).not.toBeNull(); expect(action).not.toBeNull();
  expect(finishes!.y + finishes!.height).toBeLessThan(action!.y);
  await page.screenshot({ path: testInfo.outputPath('story-mobile-finale.png') });
  await studioAction.click();
  const scene = page.locator('.studio .gallery-scene');
  await expect(scene).toHaveAttribute('data-arrival', 'ready', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Editor tools are peek. Change panel size' }).click();
  await page.getByRole('button', { name: 'Editor tools are half. Change panel size' }).click();
  await page.locator('summary').filter({ hasText: '03 · Floor' }).click();
  await page.getByRole('button', { name: 'natural oak', exact: true }).click();
  await expect(scene).toHaveAttribute('data-floor', 'oak');
  await page.screenshot({ path: testInfo.outputPath('studio-mobile-materials.png') });
  await page.getByRole('button', { name: /^Done · Back to room/ }).click();
  await expect(page.getByRole('button', { name: 'Editor tools are peek. Change panel size' })).toBeFocused();
  await page.getByRole('button', { name: 'Editor tools are peek. Change panel size' }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(scene).toHaveAttribute('data-floor', 'concrete');
});
