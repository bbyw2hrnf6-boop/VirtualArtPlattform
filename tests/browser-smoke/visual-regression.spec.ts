import { expect, test, type Locator } from '@playwright/test';

const viewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

const screenshotOptions = {
  animations: 'disabled',
  caret: 'hide',
  maxDiffPixelRatio: 0.005,
  scale: 'css',
  threshold: 0.25,
} as const;

async function waitForStableScene(scene: Locator) {
  await expect(scene).toHaveAttribute('data-arrival', 'ready', { timeout: 30_000 });
  await expect(scene).toHaveAttribute('data-capture-ready', 'true', { timeout: 30_000 });
  await expect(scene).toHaveAttribute('data-render-idle', 'true', { timeout: 30_000 });
}

for (const viewport of viewports) {
  test(`${viewport.name} landing and White Cube match approved visuals`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.goto('/');

    const story = page.locator('.sgs');
    const landingScene = story.locator('.gallery-scene');
    await expect(story).toHaveAttribute('data-motion', 'reduced');
    await waitForStableScene(landingScene);
    await expect(story.locator('.sgs__poster')).toHaveCSS('opacity', '0');
    await page.evaluate(() => document.fonts.ready);
    await expect(story.locator('.sgs__sticky')).toHaveScreenshot(
      `landing-${viewport.name}.png`,
      screenshotOptions,
    );

    await page.goto('/#/create/white-cube/demo');
    const studio = page.locator('.studio');
    await expect(studio).toBeVisible();
    await waitForStableScene(studio.locator('.gallery-scene'));
    await page.evaluate(() => document.fonts.ready);
    await expect(studio).toHaveScreenshot(
      `white-cube-${viewport.name}.png`,
      screenshotOptions,
    );
  });

  test(`${viewport.name} account and Creator Hub match approved visuals`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.route('https://firestore.googleapis.com/**', (route) => route.abort());

    await page.goto('/#/account');
    const account = page.locator('.account-backdrop--page');
    await expect(account).toBeVisible();
    await expect(account.getByRole('tab', { name: 'Create account' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(account).toHaveScreenshot(
      `account-${viewport.name}.png`,
      screenshotOptions,
    );

    await page.goto('/creator-hub');
    const hub = page.locator('.creator-hub');
    await expect(hub).toBeVisible();
    await expect(hub.getByRole('heading', { name: /Make a place/ })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(
      `creator-hub-${viewport.name}.png`,
      screenshotOptions,
    );
  });
}
