import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const firebase = JSON.parse(readFileSync(new URL('../../firebase.json', import.meta.url), 'utf8'));
const candidatePolicy = firebase.hosting.headers
  .find((entry: { source?: string }) => entry.source === '**')?.headers
  .find((header: { key?: string }) => header.key === 'Content-Security-Policy-Report-Only')?.value;
const enforcePolicy = typeof candidatePolicy === 'string'
  ? candidatePolicy
      .split(';')
      .map((directive: string) => directive.trim())
      .filter((directive: string) => !directive.startsWith('report-uri ') && !directive.startsWith('report-to '))
      .join('; ')
  : '';

test('opens Obsidian from the homepage action and loads the Create Space shell without browser errors', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle(/LIEUVA/);
  await expect(page.locator('#main-content')).toBeVisible();
  const story = page.getByRole('region', { name: 'From your collection to your own Space', exact: true });
  await expect(story.getByRole('heading', { level: 1, name: 'Give your work a place.', exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 2, name: /Follow\s*the work\./ })).toBeVisible();

  const collection=page.locator('.showcase-collection');
  await collection.scrollIntoViewIfNeeded();
  await expect(collection.getByRole('heading', { name: 'Art exhibitions', exact: true })).toBeVisible();
  await expect(collection.getByRole('heading', { name: 'Sculpture & 3D', exact: true })).toBeVisible();
  await expect(collection.getByRole('heading', { name: 'Architecture', exact: true })).toBeVisible();
  await expect(collection.getByText('Showcase coming soon', { exact: true })).toHaveCount(2);
  await expect(collection.getByText(/Enter Obsidian, our first bespoke exhibition\./)).toBeVisible();
  const exhibitionLink = collection.getByRole('link', { name: 'Explore Obsidian: Art exhibitions', exact: true });
  await expect(exhibitionLink).toHaveAttribute('href', '#/showcase/obsidian');
  await expect(collection.getByRole('link', { name: 'Bespoke project on request' })).toHaveCount(2);
  await expect(collection.getByText(/From a room scan, photographs or plans/)).toBeVisible();
  await expect(collection.locator('a[href^="#/create/"]')).toHaveCount(0);

  await collection.locator('.showcase-card__media').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('homepage-showcases-desktop.png') });
  await exhibitionLink.click();
  await expect(page).toHaveURL(/#\/showcase\/obsidian$/);
  await expect(page.getByRole('heading', { name: 'Obsidian.', exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Enter the exhibition' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);

  await page.goto('/#/create', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/#\/create$/);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await expect(page).toHaveTitle(/Create a Space.*LIEUVA/);
  await expect(page.getByRole('heading', { level: 1, name: /Choose your space/i })).toBeInViewport();
  await expect(page.getByRole('button', { name: /Try the White Cube with 3 sample works/i })).toBeVisible();

  expect(pageErrors).toEqual([]);
});

test('the showcase collection stays distinct and opens Obsidian from its preview on mobile', async ({ page }, info) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { saveData: true },
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const collection = page.locator('.showcase-collection');
  await collection.scrollIntoViewIfNeeded();
  await expect(collection.getByText('Showcase coming soon', { exact: true })).toHaveCount(2);
  await expect(collection.getByRole('link', { name: 'Explore Obsidian: Art exhibitions', exact: true })).toHaveAttribute('href', '#/showcase/obsidian');
  await expect(collection.getByRole('link', { name: 'Bespoke project on request' })).toHaveCount(2);
  await expect(collection.getByText('Contact route coming soon', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  for (const action of await collection.locator('.showcase-card__action').all()) {
    const box = await action.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await collection.locator('.showcase-card').first().screenshot({ path: info.outputPath('homepage-obsidian-mobile.png') });
  await collection.getByRole('link', { name: /Enter Obsidian/ }).click();
  await expect(page).toHaveURL(/#\/showcase\/obsidian$/);
  await expect(page.getByRole('heading', { name: 'Obsidian.', exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Enter the exhibition' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
});

test('candidate CSP enforces on the bundled home and Create shells without violations', async ({ page }) => {
  test.skip(Boolean(process.env.LIEUVA_BROWSER_SMOKE_BASE_URL), 'Synthetic enforcement runs only against the local immutable build.');
  expect(enforcePolicy).not.toBe('');

  await page.addInitScript(() => {
    (window as typeof window & { __lieuvaCspViolations?: string[] }).__lieuvaCspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      (window as typeof window & { __lieuvaCspViolations?: string[] }).__lieuvaCspViolations?.push(
        `${event.effectiveDirective}:${event.blockedURI}`,
      );
    });
  });
  await page.route('**/*', async (route) => {
    // Enforce the Hosting policy on our document, not on App Check's external
    // reCAPTCHA frames, which must retain Google's own response headers.
    if (route.request().resourceType() !== 'document' || route.request().frame() !== page.mainFrame()) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: { ...response.headers(), 'content-security-policy': enforcePolicy },
    });
  });

  for (const path of ['/', '/#/create']) {
    // Firebase keeps background transports alive. Waiting for networkidle makes
    // this security smoke depend on runner/network timing and can consume the
    // entire test budget even though the shell is already ready.
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#main-content')).toBeVisible();
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => (
      (window as typeof window & { __lieuvaCspViolations?: string[] }).__lieuvaCspViolations ?? []
    ))).toEqual([]);
  }

  await page.getByRole('button', { name: /Try the White Cube with 3 sample works/i }).click();
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (
    (window as typeof window & { __lieuvaCspViolations?: string[] }).__lieuvaCspViolations ?? []
  ))).toEqual([]);
});
