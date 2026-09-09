import { expect, test, type Locator } from '@playwright/test';

async function expectStoryFrame(scene: Locator, progress: number) {
  // DOM chapter state changes immediately; shader/reflection work settles later.
  await expect.poll(async () => Number(await scene.getAttribute('data-presentation-progress')),
    { timeout: 30_000 }).toBeCloseTo(progress, 3);
  await expect(scene).toHaveAttribute('data-presentation-idle', 'true', { timeout: 30_000 });
}

test.describe.configure({ timeout: 60_000 });

test.beforeEach(async ({ page }) => {
  const rate = Number(process.env.LIEUVA_BROWSER_SMOKE_CPU_RATE ?? 1);
  if (rate > 1) {
    const session = await page.context().newCDPSession(page);
    await session.send('Emulation.setCPUThrottlingRate', { rate });
  }
});

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
  const scene = story.locator('.gallery-scene');
  await expectStoryFrame(scene, 0);
  const stationaryFrames = await scene.evaluate(async element => {
    const before = (element as HTMLElement).dataset.presentationFrames;
    for (let i = 0; i < 4; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    return { before, after: (element as HTMLElement).dataset.presentationFrames };
  });
  expect(stationaryFrames.before).toBeTruthy();
  expect(stationaryFrames.after).toBe(stationaryFrames.before);
  await expect(story.locator('.sgs__poster')).toHaveCSS('opacity', '0', { timeout: 30_000 });
  await page.screenshot({ path: testInfo.outputPath('story-desktop-opening.png') });
  await page.getByRole('button', { name: 'Chapter 3: Your atmosphere', exact: true }).click();
  await expect(story).toHaveAttribute('data-chapter', '2');
  await expectStoryFrame(scene, .505);
  const beforeFinish = Number(await scene.getAttribute('data-presentation-frames'));
  await page.getByRole('button', { name: 'Preview oak floor', exact: true }).click();
  await expect(story.locator('.gallery-scene')).toHaveAttribute('data-floor', 'oak');
  await expect(scene).toHaveAttribute('data-presentation-idle', 'true', { timeout: 30_000 });
  expect(Number(await scene.getAttribute('data-presentation-frames'))).toBeGreaterThan(beforeFinish);
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
  await expectStoryFrame(story.locator('.gallery-scene'), .755);
  const finishes = await page.locator('.sgs__finish').boundingBox();
  const studioAction = page.getByRole('button', { name: 'Open this Space in Studio' });
  const action = await studioAction.boundingBox();
  expect(finishes).not.toBeNull(); expect(action).not.toBeNull();
  expect(finishes!.y + finishes!.height).toBeLessThan(action!.y);
  await page.screenshot({ path: testInfo.outputPath('story-mobile-finale.png') });
  // An invalid room reflection used to black out lit surfaces on SwiftShader
  // while every DOM assertion still passed. Sample a clear area of the pale
  // right partition at this authored camera pose, outside artwork and controls.
  const wall = await page.screenshot({ clip: { x: 310, y: 250, width: 24, height: 24 }, scale: 'css' });
  const wallLuminance = await page.evaluate(async encoded => {
    const image = new Image(); image.src = `data:image/png;base64,${encoded}`;
    await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 24;
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, 24, 24).data;
    let sum = 0;
    for (let i = 0; i < pixels.length; i += 4) sum += .2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2];
    return sum / (24 * 24);
  }, wall.toString('base64'));
  expect(wallLuminance).toBeGreaterThan(40);
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
